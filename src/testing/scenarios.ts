/**
 * Scenario fixture loading.
 *
 * The project intentionally keeps committed scenarios small and reviewable:
 * a scenario.yaml plus a deterministic transcript.json. This loader supports
 * the canonical YAML subset used by tests/scenarios/_template without pulling
 * in a full YAML dependency for the offline harness.
 */

import {
  existsSync, readFileSync, readdirSync,
} from 'node:fs';
import {
  basename, dirname, join, resolve,
} from 'node:path';
import type {TestCase} from './types';

export type ScenarioAxis = {
  name: string;
};

export type ScenarioCriterion = {
  axis: string;
  expected: unknown;
  weight: number;
};

export type ScenarioDefinition = {
  id: string;
  description: string;
  agent: string;
  fixture: {
    transcript: string;
  };
  axes: ScenarioAxis[];
  thresholds: Record<string, number>;
  success_criteria: ScenarioCriterion[];
  partial_credit: boolean;
  enabled: boolean;
  judge_llm?: string;
  scenario_path: string;
  directory: string;
};

export type ScenarioToolCall = {
  name: string;
  request_id?: string;
  arguments?: Record<string, unknown>;
  schema_pass?: boolean;
  round_trip_ms?: number;
  response_consumed_in_next_turn?: boolean;
  tool_has_been_called?: boolean;
  result_received?: boolean;
  is_error?: boolean;
  is_blocked?: boolean;
  error_type?: string;
  raw_error_message?: string;
};

export type ScenarioNativeToolCall = {
  name?: string;
  tool_name?: string;
  request_id?: string;
  arguments?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  params_as_json?: string;
  schema_pass?: boolean;
  round_trip_ms?: number;
  response_consumed_in_next_turn?: boolean;
  tool_has_been_called?: boolean;
};

export type ScenarioToolResult = {
  name?: string;
  tool_name?: string;
  request_id?: string;
  result?: unknown;
  result_value?: unknown;
  is_error?: boolean;
  is_blocked?: boolean;
  tool_has_been_called?: boolean;
  tool_latency_secs?: number;
  error_type?: string;
  raw_error_message?: string;
  response_consumed_in_next_turn?: boolean;
};

export type ScenarioTurn = {
  turn?: number | string;
  role?: 'agent' | 'caller' | 'user' | 'tool_response' | 'system' | string;
  text?: string;
  message?: string;
  tool_call?: ScenarioToolCall;
  tool_calls?: ScenarioNativeToolCall[] | undefined;
  tool_results?: ScenarioToolResult[] | undefined;
  result?: unknown;
  agent_yielded_at_ms_after_caller_start?: number;
  expected_max_ms?: number;
};

export type ScenarioTranscript = {
  scenario_id: string;
  agent_id?: string;
  prompt_tag?: string;
  turns: ScenarioTurn[];
  metrics?: Record<string, number>;
  latency_breakdown_ms?: Record<string, number[]>;
  tool_calls?: ScenarioToolCall[] | undefined;
};

type ParserState = 'root' | 'fixture' | 'axes' | 'thresholds' | 'success_criteria';

const LATENCY_THRESHOLD_AXES = new Set([
  'tool_call_round_trip_ms',
  'ttfb_p95_ms',
  'end_to_first_audio_p95_ms',
  'total_turn_p95_ms',
]);
const SUPPORTED_THRESHOLD_KEYS = new Set([
  ...LATENCY_THRESHOLD_AXES,
  'barge_in_yield_ms',
]);

const LATENCY_THRESHOLD_LABEL = [
  'tool_call_round_trip_ms',
  'ttfb_p95_ms',
  'end_to_first_audio_p95_ms',
  'total_turn_p95_ms',
].join(', ');

const SUPPORTED_LATENCY_BREAKDOWN_KEYS = new Set([
  'ttfb',
  'end_to_first_audio',
  'total_turn',
  'barge_in_yield_latency',
]);
const SUPPORTED_TRANSCRIPT_METRIC_KEYS = new Set([
  'ttfb_p95_ms',
  'end_to_first_audio_p95_ms',
  'total_turn_p95_ms',
  'barge_in_yield_ms',
]);

const SUBJECTIVE_AXIS_PATTERN = /(?:^|_)(?:tone|empathy|clarity|judge)(?:_|$)/;
const SCENARIO_FIXTURE_TIMESTAMP = '1970-01-01T00:00:00.000Z';
const SYNTHETIC_AGENT_ID_PATTERN = /^agent_[a-z\d]+_demo$/;
const SYNTHETIC_FIXTURE_PHONE_PATTERN = /^\+155501\d{2}$/;
const PHONE_LIKE_TOKEN_PATTERN = /\+[1-9]\d{6,14}\b/g;
const PROMPT_TAG_PATTERN = /^prompt(?:\/[a-z\d][a-z\d-]*)+\/v[1-9]\d*$/;

type MutableScenario = {
  id?: string;
  description?: string;
  agent?: string;
  fixture: Partial<ScenarioDefinition['fixture']>;
  axes: ScenarioAxis[];
  thresholds: Record<string, number>;
  success_criteria: Array<Partial<ScenarioCriterion>>;
  partial_credit?: boolean;
  enabled?: boolean;
  judge_llm?: string;
};

export function parseScenarioYaml(raw: string, scenarioPath: string): ScenarioDefinition {
  const scenario: MutableScenario = {
    fixture: {},
    axes: [],
    thresholds: {},
    success_criteria: [],
  };

  let state: ParserState = 'root';
  let currentCriterion: Partial<ScenarioCriterion> | undefined;

  for (const [lineIndex, rawLine] of raw.split(/\r?\n/).entries()) {
    const line = stripInlineComment(rawLine);
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const lineNumber = lineIndex + 1;
    if (!line.startsWith(' ')) {
      currentCriterion = undefined;
      const [key, value] = splitKeyValue(trimmed, lineNumber);
      switch (key) {
        case 'id':
        case 'description':
        case 'agent':
        case 'judge_llm': {
          scenario[key] = parseScalar(value) as string;
          state = 'root';
          break;
        }

        case 'partial_credit': {
          scenario.partial_credit = parseStrictBoolean(value, 'partial_credit', scenarioPath, lineNumber);
          state = 'root';
          break;
        }

        case 'enabled': {
          scenario.enabled = parseStrictBoolean(value, 'enabled', scenarioPath, lineNumber);
          state = 'root';
          break;
        }

        case 'fixture':
        case 'axes':
        case 'thresholds':
        case 'success_criteria': {
          state = key;
          break;
        }

        default: {
          throw new Error(`Unsupported scenario key "${key}" at ${scenarioPath}:${lineNumber}`);
        }
      }

      continue;
    }

    switch (state) {
      case 'fixture': {
        const [key, value] = splitKeyValue(trimmed, lineNumber);
        if (key !== 'transcript') {
          throw new Error(`Unsupported fixture key "${key}" at ${scenarioPath}:${lineNumber}`);
        }

        scenario.fixture.transcript = String(parseScalar(value));
        break;
      }

      case 'axes': {
        const item = parseListItem(trimmed, lineNumber);
        const [key, value] = splitKeyValue(item, lineNumber);
        if (key !== 'name') {
          throw new Error(`Unsupported axis key "${key}" at ${scenarioPath}:${lineNumber}`);
        }

        const axisName = String(parseScalar(value));
        if (axisName.trim() === '') {
          throw new Error(`Axis name must be non-empty at ${scenarioPath}:${lineNumber}`);
        }

        if (scenario.axes.some(axis => axis.name === axisName)) {
          throw new Error(`Duplicate axis "${axisName}" at ${scenarioPath}:${lineNumber}`);
        }

        scenario.axes.push({name: axisName});
        break;
      }

      case 'thresholds': {
        const [key, value] = splitKeyValue(trimmed, lineNumber);
        if (Object.hasOwn(scenario.thresholds, key)) {
          throw new Error(`Duplicate threshold "${key}" at ${scenarioPath}:${lineNumber}`);
        }

        const numericValue = parseStrictNumber(value, `Threshold "${key}"`, scenarioPath, lineNumber);
        if (numericValue < 0) {
          throw new TypeError(`Threshold "${key}" must be non-negative at ${scenarioPath}:${lineNumber}`);
        }

        scenario.thresholds[key] = numericValue;
        break;
      }

      case 'success_criteria': {
        if (trimmed.startsWith('- ')) {
          currentCriterion = {};
          scenario.success_criteria.push(currentCriterion);
          const item = parseListItem(trimmed, lineNumber);
          if (item !== '') {
            assignCriterionField(currentCriterion, item, scenarioPath, lineNumber);
          }
        } else {
          if (!currentCriterion) {
            throw new Error(`success_criteria field without list item at ${scenarioPath}:${lineNumber}`);
          }

          assignCriterionField(currentCriterion, trimmed, scenarioPath, lineNumber);
        }

        break;
      }

      case 'root': {
        throw new Error(`Unexpected indented line at ${scenarioPath}:${lineNumber}`);
      }
    }
  }

  return finalizeScenario(scenario, scenarioPath);
}

export function loadScenarioDefinition(scenarioPath: string): ScenarioDefinition {
  const resolvedPath = resolve(scenarioPath);
  const raw = readFileSync(resolvedPath, 'utf-8');
  return parseScenarioYaml(raw, resolvedPath);
}

export function scenarioTranscriptPath(scenario: ScenarioDefinition): string {
  return resolve(scenario.directory, scenario.fixture.transcript);
}

export function loadScenarioTranscript(scenario: ScenarioDefinition): ScenarioTranscript {
  const transcriptPath = scenarioTranscriptPath(scenario);
  const raw = readFileSync(transcriptPath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;

  return validateScenarioTranscript(parsed, scenario, transcriptPath);
}

export function scenarioToTestCase(scenario: ScenarioDefinition): TestCase {
  const axisTags = scenario.axes.map(axis => axis.name);
  return {
    test_id: `SCEN-${scenario.id}`,
    type: 'scenario',
    name: scenario.id,
    description: scenario.description,
    input: {
      scenario_path: scenario.scenario_path,
      transcript_path: scenarioTranscriptPath(scenario),
      scenario_id: scenario.id,
    },
    expected_output: {
      success_criteria: scenario.success_criteria,
      thresholds: scenario.thresholds,
      partial_credit: scenario.partial_credit,
    },
    tags: ['scenario', `agent:${scenario.agent}`, ...axisTags],
    enabled: scenario.enabled,
    created_at: SCENARIO_FIXTURE_TIMESTAMP,
    updated_at: SCENARIO_FIXTURE_TIMESTAMP,
  };
}

export function discoverScenarioTestCases(rootDir = process.cwd()): TestCase[] {
  const scenariosDir = join(rootDir, 'tests', 'scenarios');
  if (!existsSync(scenariosDir)) {
    return [];
  }

  const out: TestCase[] = [];
  for (const entry of readdirSync(scenariosDir, {withFileTypes: true})) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) {
      continue;
    }

    const scenarioFile = join(scenariosDir, entry.name, 'scenario.yaml');
    if (!existsSync(scenarioFile)) {
      continue;
    }

    // One malformed scenario must not break discovery for every other one.
    // Warn to stderr so the user sees the broken file by name, then move on.
    // `validate` uses discoverScenarioFiles below to surface the same files
    // as explicit validation failures rather than silent warns.
    try {
      out.push(scenarioToTestCase(loadScenarioDefinition(scenarioFile)));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Skipping scenario "${entry.name}": ${message}`);
    }
  }

  return out.sort((a, b) => a.test_id.localeCompare(b.test_id));
}

/**
 * Returns every committed scenario.yaml path under tests/scenarios/, ignoring
 * the `_template` directory. Unlike discoverScenarioTestCases this does NOT
 * parse — callers (e.g. `validate`) can choose how to surface parse errors.
 */
export function discoverScenarioFiles(rootDir = process.cwd()): Array<{id: string; path: string}> {
  const scenariosDir = join(rootDir, 'tests', 'scenarios');
  if (!existsSync(scenariosDir)) {
    return [];
  }

  const files: Array<{id: string; path: string}> = [];
  for (const entry of readdirSync(scenariosDir, {withFileTypes: true})) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) {
      continue;
    }

    const scenarioFile = join(scenariosDir, entry.name, 'scenario.yaml');
    if (!existsSync(scenarioFile)) {
      continue;
    }

    files.push({id: entry.name, path: scenarioFile});
  }

  return files.sort((a, b) => a.id.localeCompare(b.id));
}

function finalizeScenario(scenario: MutableScenario, scenarioPath: string): ScenarioDefinition {
  const errors: string[] = [];
  if (scenario.id) {
    const directoryName = basename(dirname(resolve(scenarioPath)));
    if (directoryName !== scenario.id) {
      errors.push(`id "${scenario.id}" must match scenario directory "${directoryName}"`);
    }
  } else {
    errors.push('id is required');
  }

  if (!scenario.description) {
    errors.push('description is required');
  }

  if (!scenario.agent) {
    errors.push('agent is required');
  }

  if (!scenario.fixture.transcript) {
    errors.push('fixture.transcript is required');
  }

  if (scenario.axes.length === 0) {
    errors.push('at least one axis is required');
  }

  const completedCriteria: ScenarioCriterion[] = [];
  for (const [index, criterion] of scenario.success_criteria.entries()) {
    if (!criterion.axis) {
      errors.push(`success_criteria[${index}].axis is required`);
      continue;
    }

    if (criterion.expected === undefined) {
      errors.push(`success_criteria[${index}].expected is required`);
    }

    if (criterion.weight !== undefined && criterion.weight <= 0) {
      errors.push(`success_criteria[${index}].weight must be greater than 0`);
    }

    completedCriteria.push({
      axis: criterion.axis,
      expected: criterion.expected,
      weight: criterion.weight ?? 1,
    });
  }

  for (const [index, criterion] of completedCriteria.entries()) {
    validateCriterionExpectation(criterion, index, errors);
  }

  if (completedCriteria.length === 0) {
    errors.push('at least one success_criteria item is required');
  }

  const declaredAxes = new Set(scenario.axes.map(axis => axis.name));
  const scoredAxes = new Set(completedCriteria.map(criterion => criterion.axis));
  for (const axis of declaredAxes) {
    if (!scoredAxes.has(axis)) {
      errors.push(`axis "${axis}" is declared but has no success_criteria item`);
    }
  }

  for (const axis of scoredAxes) {
    if (!declaredAxes.has(axis)) {
      errors.push(`success_criteria axis "${axis}" is not declared in axes`);
    }
  }

  for (const threshold of Object.keys(scenario.thresholds)) {
    if (!SUPPORTED_THRESHOLD_KEYS.has(threshold)) {
      errors.push(`threshold "${threshold}" is not supported by the offline scenario runner`);
    }
  }

  const latencyThresholdAxes = [...LATENCY_THRESHOLD_AXES].filter(axis =>
    typeof scenario.thresholds[axis] === 'number');
  const scoredLatencyAxes = [...LATENCY_THRESHOLD_AXES].filter(axis => scoredAxes.has(axis));
  const measuredLatencyAxes = completedCriteria
    .filter(criterion => LATENCY_THRESHOLD_AXES.has(criterion.axis) && criterion.expected !== 'n/a')
    .map(criterion => criterion.axis);
  if (latencyThresholdAxes.length === 0) {
    errors.push(`at least one latency threshold is required (${LATENCY_THRESHOLD_LABEL})`);
  }

  if (scoredLatencyAxes.length === 0) {
    errors.push(`at least one latency success_criteria item is required (${LATENCY_THRESHOLD_LABEL})`);
  }

  if (measuredLatencyAxes.length === 0) {
    errors.push(`at least one measured latency success_criteria item is required (${LATENCY_THRESHOLD_LABEL})`);
  }

  for (const axis of scoredLatencyAxes) {
    if (typeof scenario.thresholds[axis] !== 'number') {
      errors.push(`latency success_criteria axis "${axis}" requires a matching threshold`);
    }
  }

  for (const axis of latencyThresholdAxes) {
    if (!scoredAxes.has(axis)) {
      errors.push(`latency threshold "${axis}" is declared but has no success_criteria item`);
    }
  }

  if (
    typeof scenario.thresholds.barge_in_yield_ms === 'number'
    && !completedCriteria.some(criterion =>
      criterion.axis === 'barge_in_recovery' && criterion.expected === true)
  ) {
    errors.push('barge_in_yield_ms threshold requires a barge_in_recovery success_criteria item with expected: true');
  }

  const subjectiveAxes = [...declaredAxes].filter(axis => SUBJECTIVE_AXIS_PATTERN.test(axis));
  if (subjectiveAxes.length > 0 && !scenario.judge_llm) {
    errors.push(`judge_llm is required for subjective axes: ${subjectiveAxes.join(', ')}`);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid scenario ${scenarioPath}: ${errors.join(', ')}`);
  }

  const directory = dirname(resolve(scenarioPath));
  const definition: ScenarioDefinition = {
    id: scenario.id!,
    description: scenario.description!,
    agent: scenario.agent!,
    fixture: {
      transcript: scenario.fixture.transcript!,
    },
    axes: scenario.axes,
    thresholds: scenario.thresholds,
    success_criteria: completedCriteria,
    partial_credit: scenario.partial_credit ?? false,
    enabled: scenario.enabled ?? true,
    scenario_path: resolve(scenarioPath),
    directory,
  };

  if (scenario.judge_llm) {
    definition.judge_llm = scenario.judge_llm;
  }

  const transcriptPath = scenarioTranscriptPath(definition);
  if (!existsSync(transcriptPath)) {
    throw new Error(`Scenario transcript does not exist: ${transcriptPath}`);
  }

  return definition;
}

function validateCriterionExpectation(criterion: ScenarioCriterion, index: number, errors: string[]): void {
  switch (criterion.axis) {
    case 'barge_in_recovery': {
      if (criterion.expected !== true && criterion.expected !== 'n/a') {
        errors.push(`success_criteria[${index}].expected for barge_in_recovery must be true or n/a`);
      }

      break;
    }

    case 'tool_call_schema': {
      validateToolCallSchemaExpectation(criterion.expected, index, errors);
      break;
    }

    case 'tool_call_routing': {
      validateToolCallRoutingExpectation(criterion.expected, index, errors);
      break;
    }

    case 'tool_call_round_trip_ms': {
      validateToolCallRoundTripExpectation(criterion.expected, index, errors);
      break;
    }

    case 'ttfb_p95_ms':
    case 'end_to_first_audio_p95_ms':
    case 'total_turn_p95_ms': {
      if (criterion.expected !== 'pass') {
        errors.push(`success_criteria[${index}].expected for ${criterion.axis} must be pass`);
      }

      break;
    }

    case 'tone_judge': {
      if (criterion.expected !== 'polite') {
        errors.push(`success_criteria[${index}].expected for tone_judge must be polite`);
      }

      break;
    }

    default: {
      break;
    }
  }
}

function validateToolCallRoutingExpectation(expected: unknown, index: number, errors: string[]): void {
  if (expected === 'tool' || expected === 'kb' || expected === 'knowledge_base') {
    return;
  }

  if (!isRecord(expected)) {
    errors.push(`success_criteria[${index}].expected for tool_call_routing must be tool, kb, knowledge_base, or an object`);
    return;
  }

  const allowedKeys = new Set(['route', 'name']);
  for (const key of Object.keys(expected)) {
    if (!allowedKeys.has(key)) {
      errors.push(`success_criteria[${index}].expected for tool_call_routing has unsupported key "${key}"`);
    }
  }

  if (
    expected.route !== 'tool'
    && expected.route !== 'kb'
    && expected.route !== 'knowledge_base'
  ) {
    errors.push(`success_criteria[${index}].expected.route for tool_call_routing must be tool, kb, or knowledge_base`);
  }

  if (expected.name !== undefined && (typeof expected.name !== 'string' || expected.name.trim() === '')) {
    errors.push(`success_criteria[${index}].expected.name for tool_call_routing must be a non-empty string`);
  }

  if (expected.name !== undefined && expected.route !== 'tool') {
    errors.push(`success_criteria[${index}].expected.name for tool_call_routing is only valid when route is tool`);
  }
}

function validateToolCallSchemaExpectation(expected: unknown, index: number, errors: string[]): void {
  if (expected === 'n/a') {
    return;
  }

  if (!isRecord(expected)) {
    errors.push(`success_criteria[${index}].expected for tool_call_schema must be an object or n/a`);
    return;
  }

  const allowedKeys = new Set(['name', 'parameters_pass', 'response_consumed_in_next_turn']);
  for (const key of Object.keys(expected)) {
    if (!allowedKeys.has(key)) {
      errors.push(`success_criteria[${index}].expected for tool_call_schema has unsupported key "${key}"`);
    }
  }

  if (typeof expected.name !== 'string' || expected.name.trim() === '') {
    errors.push(`success_criteria[${index}].expected.name for tool_call_schema must be a non-empty string`);
  }

  const checksSchema = Object.hasOwn(expected, 'parameters_pass');
  const checksResponse = Object.hasOwn(expected, 'response_consumed_in_next_turn');
  if (!checksSchema && !checksResponse) {
    errors.push(`success_criteria[${index}].expected for tool_call_schema must include parameters_pass: true or response_consumed_in_next_turn: true`);
  }

  if (checksSchema && expected.parameters_pass !== true) {
    errors.push(`success_criteria[${index}].expected.parameters_pass for tool_call_schema must be true`);
  }

  if (checksResponse && expected.response_consumed_in_next_turn !== true) {
    errors.push(`success_criteria[${index}].expected.response_consumed_in_next_turn for tool_call_schema must be true`);
  }
}

function validateToolCallRoundTripExpectation(expected: unknown, index: number, errors: string[]): void {
  if (expected === 'n/a') {
    return;
  }

  if (!isRecord(expected)) {
    errors.push(`success_criteria[${index}].expected for tool_call_round_trip_ms must be an object or n/a`);
    return;
  }

  const allowedKeys = new Set(['name', 'max_ms']);
  for (const key of Object.keys(expected)) {
    if (!allowedKeys.has(key)) {
      errors.push(`success_criteria[${index}].expected for tool_call_round_trip_ms has unsupported key "${key}"`);
    }
  }

  if (expected.name !== undefined && (typeof expected.name !== 'string' || expected.name.trim() === '')) {
    errors.push(`success_criteria[${index}].expected.name for tool_call_round_trip_ms must be a non-empty string`);
  }

  if (
    expected.max_ms !== undefined
    && (typeof expected.max_ms !== 'number' || !Number.isFinite(expected.max_ms) || expected.max_ms < 0)
  ) {
    errors.push(`success_criteria[${index}].expected.max_ms for tool_call_round_trip_ms must be a non-negative number`);
  }
}

function assignCriterionField(
  criterion: Partial<ScenarioCriterion>,
  rawField: string,
  scenarioPath: string,
  lineNumber: number,
): void {
  const [key, value] = splitKeyValue(rawField, lineNumber);
  switch (key) {
    case 'axis': {
      criterion.axis = String(parseScalar(value));
      break;
    }

    case 'expected': {
      criterion.expected = parseScalar(value);
      break;
    }

    case 'weight': {
      const weight = parseStrictNumber(value, 'Criterion weight', scenarioPath, lineNumber);
      criterion.weight = weight;
      break;
    }

    default: {
      throw new Error(`Unsupported success_criteria key "${key}" at ${scenarioPath}:${lineNumber}`);
    }
  }
}

function splitKeyValue(raw: string, lineNumber: number): [string, string] {
  const index = raw.indexOf(':');
  if (index === -1) {
    throw new Error(`Expected "key: value" at line ${lineNumber}`);
  }

  return [raw.slice(0, index).trim(), raw.slice(index + 1).trim()];
}

function parseListItem(raw: string, lineNumber: number): string {
  if (!raw.startsWith('- ')) {
    throw new Error(`Expected YAML list item at line ${lineNumber}`);
  }

  return raw.slice(2).trim();
}

function stripInlineComment(rawLine: string): string {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < rawLine.length; index++) {
    const char = rawLine[index];
    const previous = rawLine[index - 1];

    if (char === '\'' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote && previous !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (
      char === '#'
      && !inSingleQuote
      && !inDoubleQuote
      && (index === 0 || /\s/.test(previous))
    ) {
      return rawLine.slice(0, index).trimEnd();
    }
  }

  return rawLine;
}

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (value === '') {
    return '';
  }

  if (value.startsWith('{') && value.endsWith('}')) {
    return parseInlineObject(value);
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    return value.slice(1, -1);
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  const numericValue = Number.parseFloat(value);
  if (/^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(numericValue)) {
    return numericValue;
  }

  return value;
}

function parseStrictNumber(raw: string, label: string, scenarioPath: string, lineNumber: number): number {
  const value = raw.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
    throw new TypeError(`${label} must be numeric at ${scenarioPath}:${lineNumber}`);
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new TypeError(`${label} must be numeric at ${scenarioPath}:${lineNumber}`);
  }

  return numericValue;
}

function parseStrictBoolean(raw: string, label: string, scenarioPath: string, lineNumber: number): boolean {
  const value = raw.trim();
  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new TypeError(`${label} must be true or false at ${scenarioPath}:${lineNumber}`);
}

function parseInlineObject(raw: string): Record<string, unknown> {
  const body = raw.slice(1, -1).trim();
  if (body === '') {
    return {};
  }

  const out: Record<string, unknown> = {};
  for (const pair of body.split(',')) {
    const [key, value] = splitKeyValue(pair.trim(), 0);
    if (Object.hasOwn(out, key)) {
      throw new Error(`Duplicate inline object key "${key}"`);
    }

    out[key] = parseScalar(value);
  }

  return out;
}

function validateScenarioTranscript(
  value: unknown,
  scenario: ScenarioDefinition,
  transcriptPath: string,
): ScenarioTranscript {
  const prefix = `Invalid transcript ${transcriptPath}:`;
  if (!isRecord(value)) {
    throw new TypeError(`${prefix} root must be an object`);
  }

  if (value.scenario_id !== scenario.id) {
    throw new Error(`Transcript scenario_id "${String(value.scenario_id)}" does not match scenario "${scenario.id}"`);
  }

  if (value.agent_id !== undefined && typeof value.agent_id !== 'string') {
    throw new TypeError(`${prefix} agent_id must be a string when present`);
  }

  validateScenarioFixtureHygiene(value, prefix);

  if (value.prompt_tag !== undefined && typeof value.prompt_tag !== 'string') {
    throw new TypeError(`${prefix} prompt_tag must be a string when present`);
  }

  if (
    typeof value.prompt_tag === 'string'
    && !PROMPT_TAG_PATTERN.test(value.prompt_tag)
  ) {
    throw new Error(`${prefix} prompt_tag must look like prompt/<name>/v<N> so results can be correlated to a versioned prompt config`);
  }

  if (!Array.isArray(value.turns)) {
    throw new TypeError(`Transcript for scenario "${scenario.id}" must include a turns array`);
  }

  for (const [index, turn] of value.turns.entries()) {
    validateScenarioTurn(turn, `${prefix} turns[${index}]`);
  }

  if (value.metrics !== undefined) {
    validateNumericRecord(value.metrics, `${prefix} metrics`, SUPPORTED_TRANSCRIPT_METRIC_KEYS);
  }

  if (value.latency_breakdown_ms !== undefined) {
    validateLatencyBreakdown(value.latency_breakdown_ms, `${prefix} latency_breakdown_ms`);
  }

  if (value.tool_calls !== undefined && value.tool_calls !== null) {
    if (!Array.isArray(value.tool_calls)) {
      throw new TypeError(`${prefix} tool_calls must be an array or null when present`);
    }

    for (const [index, toolCall] of value.tool_calls.entries()) {
      validateScenarioToolCall(toolCall, `${prefix} tool_calls[${index}]`);
    }
  }

  return value as ScenarioTranscript;
}

function validateScenarioTurn(value: unknown, label: string): void {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object`);
  }

  if (value.turn !== undefined && typeof value.turn !== 'number' && typeof value.turn !== 'string') {
    throw new TypeError(`${label}.turn must be a string or number when present`);
  }

  if (value.role !== undefined && typeof value.role !== 'string') {
    throw new TypeError(`${label}.role must be a string when present`);
  }

  if (value.text !== undefined && typeof value.text !== 'string') {
    throw new TypeError(`${label}.text must be a string when present`);
  }

  if (value.message !== undefined && typeof value.message !== 'string') {
    throw new TypeError(`${label}.message must be a string when present`);
  }

  if (value.tool_call !== undefined) {
    validateScenarioToolCall(value.tool_call, `${label}.tool_call`);
  }

  if (value.tool_calls !== undefined && value.tool_calls !== null) {
    if (!Array.isArray(value.tool_calls)) {
      throw new TypeError(`${label}.tool_calls must be an array or null when present`);
    }

    for (const [index, toolCall] of value.tool_calls.entries()) {
      validateScenarioNativeToolCall(toolCall, `${label}.tool_calls[${index}]`);
    }
  }

  if (value.tool_results !== undefined && value.tool_results !== null) {
    if (!Array.isArray(value.tool_results)) {
      throw new TypeError(`${label}.tool_results must be an array or null when present`);
    }

    for (const [index, toolResult] of value.tool_results.entries()) {
      validateScenarioToolResult(toolResult, `${label}.tool_results[${index}]`);
    }
  }

  if (value.agent_yielded_at_ms_after_caller_start !== undefined) {
    validateNonNegativeFiniteNumber(
      value.agent_yielded_at_ms_after_caller_start,
      `${label}.agent_yielded_at_ms_after_caller_start`,
    );
  }

  if (value.expected_max_ms !== undefined) {
    validateNonNegativeFiniteNumber(value.expected_max_ms, `${label}.expected_max_ms`);
  }
}

function validateScenarioToolCall(value: unknown, label: string): void {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object`);
  }

  if (typeof value.name !== 'string' || value.name.trim() === '') {
    throw new TypeError(`${label}.name must be a non-empty string`);
  }

  if (value.request_id !== undefined && typeof value.request_id !== 'string') {
    throw new TypeError(`${label}.request_id must be a string when present`);
  }

  if (value.arguments !== undefined && !isRecord(value.arguments)) {
    throw new TypeError(`${label}.arguments must be an object when present`);
  }

  if (value.schema_pass !== undefined && typeof value.schema_pass !== 'boolean') {
    throw new TypeError(`${label}.schema_pass must be a boolean when present`);
  }

  if (value.round_trip_ms !== undefined) {
    validateNonNegativeFiniteNumber(value.round_trip_ms, `${label}.round_trip_ms`);
  }

  if (
    value.response_consumed_in_next_turn !== undefined
    && typeof value.response_consumed_in_next_turn !== 'boolean'
  ) {
    throw new TypeError(`${label}.response_consumed_in_next_turn must be a boolean when present`);
  }
}

function validateScenarioNativeToolCall(value: unknown, label: string): void {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object`);
  }

  validateToolEvidenceName(value, label);

  if (value.request_id !== undefined && typeof value.request_id !== 'string') {
    throw new TypeError(`${label}.request_id must be a string when present`);
  }

  if (value.arguments !== undefined && !isRecord(value.arguments)) {
    throw new TypeError(`${label}.arguments must be an object when present`);
  }

  if (value.parameters !== undefined && !isRecord(value.parameters)) {
    throw new TypeError(`${label}.parameters must be an object when present`);
  }

  if (value.params_as_json !== undefined && typeof value.params_as_json !== 'string') {
    throw new TypeError(`${label}.params_as_json must be a string when present`);
  }

  if (value.schema_pass !== undefined && typeof value.schema_pass !== 'boolean') {
    throw new TypeError(`${label}.schema_pass must be a boolean when present`);
  }

  if (value.round_trip_ms !== undefined) {
    validateNonNegativeFiniteNumber(value.round_trip_ms, `${label}.round_trip_ms`);
  }

  if (
    value.response_consumed_in_next_turn !== undefined
    && typeof value.response_consumed_in_next_turn !== 'boolean'
  ) {
    throw new TypeError(`${label}.response_consumed_in_next_turn must be a boolean when present`);
  }

  if (value.tool_has_been_called !== undefined && typeof value.tool_has_been_called !== 'boolean') {
    throw new TypeError(`${label}.tool_has_been_called must be a boolean when present`);
  }
}

function validateScenarioToolResult(value: unknown, label: string): void {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object`);
  }

  validateToolEvidenceName(value, label);

  if (value.request_id !== undefined && typeof value.request_id !== 'string') {
    throw new TypeError(`${label}.request_id must be a string when present`);
  }

  if (value.is_error !== undefined && typeof value.is_error !== 'boolean') {
    throw new TypeError(`${label}.is_error must be a boolean when present`);
  }

  if (value.is_blocked !== undefined && typeof value.is_blocked !== 'boolean') {
    throw new TypeError(`${label}.is_blocked must be a boolean when present`);
  }

  if (value.tool_has_been_called !== undefined && typeof value.tool_has_been_called !== 'boolean') {
    throw new TypeError(`${label}.tool_has_been_called must be a boolean when present`);
  }

  if (value.tool_latency_secs !== undefined) {
    validateNonNegativeFiniteNumber(value.tool_latency_secs, `${label}.tool_latency_secs`);
  }

  if (value.error_type !== undefined && typeof value.error_type !== 'string') {
    throw new TypeError(`${label}.error_type must be a string when present`);
  }

  if (value.raw_error_message !== undefined && typeof value.raw_error_message !== 'string') {
    throw new TypeError(`${label}.raw_error_message must be a string when present`);
  }

  if (
    value.response_consumed_in_next_turn !== undefined
    && typeof value.response_consumed_in_next_turn !== 'boolean'
  ) {
    throw new TypeError(`${label}.response_consumed_in_next_turn must be a boolean when present`);
  }
}

function validateToolEvidenceName(value: Record<string, unknown>, label: string): void {
  const {name} = value;
  const toolName = value.tool_name;
  if (
    (name !== undefined && (typeof name !== 'string' || name.trim() === ''))
    || (toolName !== undefined && (typeof toolName !== 'string' || toolName.trim() === ''))
  ) {
    throw new TypeError(`${label}.name/tool_name must be a non-empty string when present`);
  }

  if (name === undefined && toolName === undefined) {
    throw new TypeError(`${label}.name or ${label}.tool_name must be a non-empty string`);
  }

  if (typeof name === 'string' && typeof toolName === 'string' && name !== toolName) {
    throw new Error(`${label}.name and ${label}.tool_name must match when both are present`);
  }
}

function validateNumericRecord(value: unknown, label: string, supportedKeys?: Set<string>): void {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object when present`);
  }

  for (const [key, metricValue] of Object.entries(value)) {
    if (supportedKeys && !supportedKeys.has(key)) {
      throw new Error(`${label}.${key} is not read by any scenario scorer`);
    }

    validateNonNegativeFiniteNumber(metricValue, `${label}.${key}`);
  }
}

function validateLatencyBreakdown(value: unknown, label: string): void {
  if (!isRecord(value)) {
    throw new TypeError(`${label} must be an object when present`);
  }

  for (const [key, samples] of Object.entries(value)) {
    if (!SUPPORTED_LATENCY_BREAKDOWN_KEYS.has(key)) {
      throw new Error(`${label}.${key} is not read by any latency scorer`);
    }

    if (!Array.isArray(samples)) {
      throw new TypeError(`${label}.${key} must be an array of numbers`);
    }

    for (const [index, sample] of samples.entries()) {
      validateNonNegativeFiniteNumber(sample, `${label}.${key}[${index}]`);
    }
  }
}

function validateScenarioFixtureHygiene(value: Record<string, unknown>, prefix: string): void {
  if (
    typeof value.agent_id === 'string'
    && !SYNTHETIC_AGENT_ID_PATTERN.test(value.agent_id)
  ) {
    throw new Error(`${prefix} agent_id must be a synthetic demo id like agent_xxxx_demo; real ElevenLabs agent IDs do not belong in scenario fixtures`);
  }

  const phoneLeak = findNonSyntheticFixturePhone(value);
  if (phoneLeak) {
    throw new Error(`${prefix} ${phoneLeak.path} contains non-synthetic phone number ${phoneLeak.phone}; use +15550100..+15550199 in scenario fixtures`);
  }
}

function findNonSyntheticFixturePhone(
  value: unknown,
  path = '$',
): {path: string; phone: string} | undefined {
  if (typeof value === 'string') {
    for (const match of value.matchAll(PHONE_LIKE_TOKEN_PATTERN)) {
      const phone = match[0];
      if (!SYNTHETIC_FIXTURE_PHONE_PATTERN.test(phone)) {
        return {path, phone};
      }
    }

    return undefined;
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findNonSyntheticFixturePhone(item, `${path}[${index}]`);
      if (found) {
        return found;
      }
    }

    return undefined;
  }

  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      const found = findNonSyntheticFixturePhone(item, `${path}.${key}`);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

function validateNonNegativeFiniteNumber(value: unknown, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative finite number`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
