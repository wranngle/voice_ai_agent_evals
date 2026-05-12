/**
 * Offline scenario runner.
 *
 * Executes committed scenario.yaml + transcript.json fixtures without hitting
 * ElevenLabs. This is the deterministic layer that catches prompt and harness
 * regressions before the live simulate-conversation runner is used.
 */

import type {
  EvaluationArtifact, EvaluationDimension, TestCase, TestStatus,
} from '../types';
import {
  loadScenarioDefinition,
  loadScenarioTranscript,
  scenarioTranscriptPath,
  type ScenarioNativeToolCall,
  type ScenarioCriterion,
  type ScenarioDefinition,
  type ScenarioToolCall,
  type ScenarioToolResult,
  type ScenarioTurn,
  type ScenarioTranscript,
} from '../scenarios';
import type {RunOptions, TestExecutionResult, TestRunner} from './types';

type AxisEvaluation = EvaluationDimension & {
  pass: boolean;
  hard_fail?: boolean;
};

type ScoreResult = {
  status: TestStatus;
  weighted_score: number;
  dimensions: EvaluationDimension[];
  axes: AxisEvaluation[];
  assertions_passed: number;
  assertions_failed: number;
  failure_messages: string[];
};

export class ScenarioRunner implements TestRunner {
  readonly type = 'scenario' as const;

  async execute(testCase: TestCase, _options: RunOptions = {}): Promise<TestExecutionResult> {
    const startedAt = performance.now();

    try {
      const scenario = loadScenarioDefinition(getScenarioPath(testCase));
      const transcript = loadScenarioTranscript(scenario);
      const score = scoreScenario(scenario, transcript);
      const transcriptPath = scenarioTranscriptPath(scenario);
      const artifacts: EvaluationArtifact[] = [
        {
          name: `${scenario.id} scenario`,
          path: scenario.scenario_path,
          kind: 'other',
          producer: 'scenario-runner',
        },
        {
          name: `${scenario.id} transcript`,
          path: transcriptPath,
          kind: 'json',
          producer: 'scenario-runner',
        },
      ];

      return {
        status: score.status,
        actual_output: {
          scenario_id: scenario.id,
          agent_id: transcript.agent_id,
          prompt_tag: transcript.prompt_tag,
          verdict: score.status === 'passed' ? 'pass' : 'fail',
          weighted_score: score.weighted_score,
          partial_credit: scenario.partial_credit,
          thresholds: scenario.thresholds,
          axes: score.axes,
          transcript_summary: transcript.turns,
          latency_breakdown_ms: transcript.latency_breakdown_ms,
          tool_calls: collectToolCalls(transcript),
        },
        latency_ms: Math.round(performance.now() - startedAt),
        error_message: score.failure_messages.length > 0 ? score.failure_messages.join('; ') : undefined,
        assertions_passed: score.assertions_passed,
        assertions_failed: score.assertions_failed,
        artifacts,
        dimensions: score.dimensions,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: 'error',
        actual_output: {error: message},
        latency_ms: Math.round(performance.now() - startedAt),
        error_message: message,
        assertions_passed: 0,
        assertions_failed: 1,
      };
    }
  }

  validate(testCase: TestCase): {valid: boolean; errors: string[]} {
    const errors: string[] = [];
    if (testCase.type !== this.type) {
      errors.push(`ScenarioRunner cannot run type: ${testCase.type}`);
    }

    try {
      const scenario = loadScenarioDefinition(getScenarioPath(testCase));
      loadScenarioTranscript(scenario);
    } catch (error: unknown) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return {valid: errors.length === 0, errors};
  }
}

export const scenarioRunner = new ScenarioRunner();

export function scoreScenario(scenario: ScenarioDefinition, transcript: ScenarioTranscript): ScoreResult {
  const axes = scenario.success_criteria.map(criterion => scoreCriterion(criterion, scenario, transcript));
  const totalWeight = axes.reduce((sum, axis) => sum + (axis.weight ?? 1), 0);
  const passedWeight = axes.reduce((sum, axis) => sum + (axis.pass ? (axis.weight ?? 1) : 0), 0);
  const weightedScore = totalWeight > 0 ? roundScore(passedWeight / totalWeight) : 0;
  const failureMessages = axes
    .filter(axis => !axis.pass)
    .map(axis => `${axis.name}: ${axis.detail ?? 'failed'}`);

  const status: TestStatus = decideStatus({
    hasHardFailure: axes.some(axis => axis.hard_fail && !axis.pass),
    partialCredit: scenario.partial_credit,
    weightedScore,
    anyFailure: failureMessages.length > 0,
  });

  return {
    status,
    weighted_score: weightedScore,
    axes,
    dimensions: axes.map(axis => ({
      name: axis.name,
      status: axis.status,
      score: axis.score,
      detail: axis.detail,
      weight: axis.weight,
    })),
    assertions_passed: axes.filter(axis => axis.pass).length,
    assertions_failed: axes.filter(axis => !axis.pass).length,
    failure_messages: failureMessages,
  };
}

type StatusInputs = {
  hasHardFailure: boolean;
  partialCredit: boolean;
  weightedScore: number;
  anyFailure: boolean;
};

const PARTIAL_CREDIT_PASS_THRESHOLD = 0.7;

function decideStatus(inputs: StatusInputs): TestStatus {
  if (inputs.hasHardFailure) {
    return 'failed';
  }

  if (inputs.partialCredit) {
    return inputs.weightedScore >= PARTIAL_CREDIT_PASS_THRESHOLD ? 'passed' : 'failed';
  }

  return inputs.anyFailure ? 'failed' : 'passed';
}

function scoreCriterion(
  criterion: ScenarioCriterion,
  scenario: ScenarioDefinition,
  transcript: ScenarioTranscript,
): AxisEvaluation {
  switch (criterion.axis) {
    case 'barge_in_recovery': {
      return scoreBargeInRecovery(criterion, scenario, transcript);
    }

    case 'tool_call_schema': {
      return scoreToolCallSchema(criterion, transcript);
    }

    case 'tool_call_routing': {
      return scoreToolCallRouting(criterion, transcript);
    }

    case 'tool_call_round_trip_ms': {
      return scoreToolCallRoundTrip(criterion, scenario, transcript);
    }

    case 'ttfb_p95_ms':
    case 'end_to_first_audio_p95_ms':
    case 'total_turn_p95_ms': {
      return scoreLatencyCriterion(criterion, scenario, transcript);
    }

    case 'tone_judge': {
      return scoreToneJudge(criterion, scenario, transcript);
    }

    default: {
      return createAxisEvaluation(
        criterion,
        false,
        `no offline scorer registered for axis "${criterion.axis}"`,
        {hardFail: true},
      );
    }
  }
}

function scoreBargeInRecovery(
  criterion: ScenarioCriterion,
  scenario: ScenarioDefinition,
  transcript: ScenarioTranscript,
): AxisEvaluation {
  const events = transcript.turns.filter(turn =>
    typeof turn.agent_yielded_at_ms_after_caller_start === 'number');

  if (criterion.expected === 'n/a') {
    const passed = events.length === 0;
    return createAxisEvaluation(
      criterion,
      passed,
      passed
        ? 'n/a - no caller barge-in in this scenario'
        : 'expected no caller barge-in, but transcript includes a barge-in event',
      {hardFail: !passed},
    );
  }

  if (criterion.expected !== true) {
    return createAxisEvaluation(
      criterion,
      false,
      `unsupported barge_in_recovery expectation: ${String(criterion.expected)}`,
    );
  }

  if (events.length === 0) {
    return createAxisEvaluation(
      criterion,
      false,
      'barge_in_recovery expected but transcript has no barge-in event',
      {hardFail: true},
    );
  }

  const turnEvents = events.map((event, index) => ({
    actualMs: event.agent_yielded_at_ms_after_caller_start!,
    budgetMs: scenario.thresholds.barge_in_yield_ms ?? event.expected_max_ms,
    label: typeof event.turn === 'string' || typeof event.turn === 'number'
      ? String(event.turn)
      : `event ${index + 1}`,
  }));
  const evaluatedEvents = [
    ...turnEvents,
    ...bargeInAggregateEvidence(scenario, transcript),
  ];
  const missingBudget = evaluatedEvents.find(event => typeof event.budgetMs !== 'number');
  if (missingBudget) {
    return createAxisEvaluation(
      criterion,
      false,
      `barge_in_yield_ms threshold is missing for ${missingBudget.label}`,
      {hardFail: true},
    );
  }

  const budgetedEvents = evaluatedEvents.map(event => ({
    ...event,
    budgetMs: event.budgetMs!,
  }));
  const breachedEvents = budgetedEvents.filter(event => event.actualMs > event.budgetMs);
  let slowestEvent = budgetedEvents[0];
  for (const event of budgetedEvents) {
    if (event.actualMs > slowestEvent.actualMs) {
      slowestEvent = event;
    }
  }

  const eventLabel = `${events.length} barge-in event${events.length === 1 ? '' : 's'}`;
  if (breachedEvents.length === 0) {
    const passDetail = `agent yielded within budget for ${eventLabel}; `
      + `worst yield ${slowestEvent.actualMs}ms (budget <= ${slowestEvent.budgetMs}ms)`;
    return createAxisEvaluation(
      criterion,
      true,
      passDetail,
    );
  }

  let largestBreach = breachedEvents[0];
  for (const event of breachedEvents) {
    if (event.actualMs - event.budgetMs > largestBreach.actualMs - largestBreach.budgetMs) {
      largestBreach = event;
    }
  }

  const failureDetail = `${breachedEvents.length}/${events.length} barge-in yield budget breached; `
    + `worst yield ${slowestEvent.actualMs}ms; `
    + `${largestBreach.label} yielded after ${largestBreach.actualMs}ms; `
    + `expected <= ${largestBreach.budgetMs}ms`;

  return createAxisEvaluation(
    criterion,
    false,
    failureDetail,
    {hardFail: true},
  );
}

function scoreToolCallSchema(criterion: ScenarioCriterion, transcript: ScenarioTranscript): AxisEvaluation {
  const {expected} = criterion;
  const toolCalls = collectToolCalls(transcript);

  if (expected === 'n/a') {
    const passed = toolCalls.length === 0;
    return createAxisEvaluation(
      criterion,
      passed,
      passed
        ? 'n/a - no tool call in this scenario'
        : `expected no tool call, saw ${toolCalls.map(call => call.name).join(', ')}`,
      {hardFail: !passed},
    );
  }

  if (!isRecord(expected)) {
    return createAxisEvaluation(
      criterion,
      false,
      'tool_call_schema expected value must be an object or n/a',
      {hardFail: true},
    );
  }

  const expectedName = typeof expected.name === 'string' ? expected.name : undefined;
  if (!expectedName) {
    return createAxisEvaluation(criterion, false, 'tool_call_schema expected.name is required', {hardFail: true});
  }

  const matchingCalls = toolCalls.filter(candidate => candidate.name === expectedName);
  if (matchingCalls.length === 0) {
    return createAxisEvaluation(
      criterion,
      false,
      `expected tool "${expectedName}" was not called`,
      {hardFail: true},
    );
  }

  const failures: string[] = [];
  let missingRequiredEvidence = false;
  for (const [index, call] of matchingCalls.entries()) {
    const executionFailure = toolExecutionFailureDetail(call);
    if (executionFailure) {
      failures.push(`${expectedName}[${index}] ${executionFailure}`);
      missingRequiredEvidence = true;
    }
  }

  if (expected.parameters_pass === true) {
    for (const [index, call] of matchingCalls.entries()) {
      const parameters = toolParametersAreValid(call);
      if (!parameters.pass) {
        failures.push(`${expectedName}[${index}] ${parameters.detail}`);
      }

      missingRequiredEvidence ||= parameters.hardFail === true;
    }
  } else {
    for (const [index, call] of matchingCalls.entries()) {
      if (call.schema_pass === false) {
        failures.push(`${expectedName}[${index}] parameters failed schema validation`);
      }
    }
  }

  if (expected.response_consumed_in_next_turn === true) {
    for (const [index, call] of matchingCalls.entries()) {
      if (call.response_consumed_in_next_turn !== true) {
        const detail = typeof call.response_consumed_in_next_turn === 'boolean'
          ? 'tool response was not consumed in the next agent turn'
          : 'response_consumed_in_next_turn requires an explicit fixture verdict';
        failures.push(`${expectedName}[${index}] ${detail}`);
        missingRequiredEvidence ||= typeof call.response_consumed_in_next_turn !== 'boolean';
      }
    }
  }

  const parametersPass = failures.length === 0;
  const callCount = `${matchingCalls.length} time${matchingCalls.length === 1 ? '' : 's'}`;
  const satisfied = [
    expected.parameters_pass === true ? 'valid parameters' : undefined,
    expected.response_consumed_in_next_turn === true ? 'next-turn response consumption' : undefined,
  ].filter((value): value is string => typeof value === 'string');

  return createAxisEvaluation(
    criterion,
    parametersPass,
    parametersPass
      ? `${expectedName} called ${callCount}${satisfied.length > 0 ? ` with ${satisfied.join(' and ')}` : ''}`
      : `${expectedName} ${failures.join('; ')}`,
    {hardFail: !parametersPass || missingRequiredEvidence},
  );
}

function scoreToolCallRouting(criterion: ScenarioCriterion, transcript: ScenarioTranscript): AxisEvaluation {
  const expected = toolRoutingExpectation(criterion.expected);
  const toolCalls = collectToolCalls(transcript);

  if (expected?.route === 'tool') {
    const matchingCalls = expected.name
      ? toolCalls.filter(call => call.name === expected.name)
      : toolCalls;
    const passed = matchingCalls.length > 0;
    const observed = toolCalls.map(call => call.name).join(', ');
    return createAxisEvaluation(
      criterion,
      passed,
      describeToolRouteOutcome(passed, expected.name, observed),
      {hardFail: !passed},
    );
  }

  if (expected?.route === 'kb' || expected?.route === 'knowledge_base') {
    const passed = toolCalls.length === 0;
    return createAxisEvaluation(
      criterion,
      passed,
      passed
        ? 'agent did not call a tool for the knowledge-base route'
        : `expected knowledge-base route, saw tool calls: ${toolCalls.map(call => call.name).join(', ')}`,
      {hardFail: !passed},
    );
  }

  return createAxisEvaluation(
    criterion,
    false,
    `unsupported routing expectation: ${String(criterion.expected)}`,
    {hardFail: true},
  );
}

function scoreToolCallRoundTrip(
  criterion: ScenarioCriterion,
  scenario: ScenarioDefinition,
  transcript: ScenarioTranscript,
): AxisEvaluation {
  const {expected} = criterion;
  const toolCalls = collectToolCalls(transcript);

  if (expected === 'n/a') {
    const passed = toolCalls.length === 0;
    return createAxisEvaluation(
      criterion,
      passed,
      passed
        ? 'n/a - no tool call in this scenario'
        : `expected no tool call, saw ${toolCalls.map(call => call.name).join(', ')}`,
      {hardFail: !passed},
    );
  }

  const threshold = toolCallRoundTripThreshold(criterion, scenario);
  if (typeof threshold !== 'number') {
    return createAxisEvaluation(
      criterion,
      false,
      'tool_call_round_trip_ms threshold is missing',
      {hardFail: true},
    );
  }

  const expectedName = expectedToolName(expected);
  const matchingCalls = expectedName
    ? toolCalls.filter(call => call.name === expectedName)
    : toolCalls;

  if (matchingCalls.length === 0) {
    return createAxisEvaluation(
      criterion,
      false,
      expectedName
        ? `expected tool "${expectedName}" was not called`
        : 'expected at least one tool call',
      {hardFail: true},
    );
  }

  const executionFailures = matchingCalls
    .map((call, index) => {
      const detail = toolExecutionFailureDetail(call);
      return detail ? `${call.name}[${index}] ${detail}` : undefined;
    })
    .filter((detail): detail is string => typeof detail === 'string');
  if (executionFailures.length > 0) {
    return createAxisEvaluation(
      criterion,
      false,
      executionFailures.join('; '),
      {hardFail: true},
    );
  }

  const measuredLatencies = matchingCalls
    .map(call => call.round_trip_ms)
    .filter((latency): latency is number => typeof latency === 'number' && Number.isFinite(latency));

  if (measuredLatencies.length !== matchingCalls.length) {
    return createAxisEvaluation(
      criterion,
      false,
      `${expectedName ?? 'tool call'} missing round_trip_ms fixture evidence`,
      {hardFail: true},
    );
  }

  const maxLatency = Math.max(...measuredLatencies);
  const passed = maxLatency <= threshold;
  const toolLabel = expectedName ?? matchingCalls.map(call => call.name).join(', ');
  return createAxisEvaluation(
    criterion,
    passed,
    passed
      ? `${toolLabel} round trip ${maxLatency}ms (budget <= ${threshold}ms)`
      : `${toolLabel} round trip ${maxLatency}ms exceeded budget <= ${threshold}ms by ${maxLatency - threshold}ms`,
    {hardFail: !passed},
  );
}

function scoreLatencyCriterion(
  criterion: ScenarioCriterion,
  scenario: ScenarioDefinition,
  transcript: ScenarioTranscript,
): AxisEvaluation {
  if (criterion.expected !== 'pass') {
    return createAxisEvaluation(
      criterion,
      false,
      `${criterion.axis} expected value must be "pass"`,
      {hardFail: true},
    );
  }

  const threshold = scenario.thresholds[criterion.axis];
  if (typeof threshold !== 'number') {
    return createAxisEvaluation(
      criterion,
      false,
      `${criterion.axis} threshold is missing`,
      {hardFail: true},
    );
  }

  const actual = getLatencyMetric(criterion.axis, transcript);
  if (typeof actual !== 'number') {
    return createAxisEvaluation(
      criterion,
      false,
      `${criterion.axis} metric is missing from transcript fixture`,
      {hardFail: true},
    );
  }

  const passed = actual <= threshold;
  return createAxisEvaluation(
    criterion,
    passed,
    passed
      ? `p95 = ${actual}ms (budget <= ${threshold}ms)`
      : `p95 = ${actual}ms exceeded budget <= ${threshold}ms by ${actual - threshold}ms`,
    {hardFail: !passed},
  );
}

function bargeInAggregateEvidence(
  scenario: ScenarioDefinition,
  transcript: ScenarioTranscript,
): Array<{actualMs: number; budgetMs?: number; label: string}> {
  const evidence: Array<{actualMs: number; budgetMs?: number; label: string}> = [];
  const budgetMs = scenario.thresholds.barge_in_yield_ms;

  if (typeof transcript.metrics?.barge_in_yield_ms === 'number') {
    evidence.push({
      actualMs: transcript.metrics.barge_in_yield_ms,
      budgetMs,
      label: 'metrics.barge_in_yield_ms',
    });
  }

  const breakdownP95 = percentile(transcript.latency_breakdown_ms?.barge_in_yield_latency ?? [], 95);
  if (typeof breakdownP95 === 'number') {
    evidence.push({
      actualMs: breakdownP95,
      budgetMs,
      label: 'latency_breakdown_ms.barge_in_yield_latency p95',
    });
  }

  return evidence;
}

function scoreToneJudge(
  criterion: ScenarioCriterion,
  scenario: ScenarioDefinition,
  transcript: ScenarioTranscript,
): AxisEvaluation {
  const expected = String(criterion.expected);
  if (expected !== 'polite') {
    return createAxisEvaluation(criterion, false, `unsupported tone expectation: ${expected}`);
  }

  const agentText = transcript.turns
    .filter(turn => turn.role === 'agent')
    .map(turn => turn.text ?? turn.message ?? '')
    .filter(text => text.trim() !== '')
    .join(' ')
    .toLowerCase();

  if (agentText === '') {
    return createAxisEvaluation(
      criterion,
      false,
      'offline politeness heuristic requires at least one agent utterance',
      {hardFail: true},
    );
  }

  const polite = !/\b(stupid|idiot|shut up|obviously)\b/.test(agentText);
  const judge = scenario.judge_llm ? `; configured judge: ${scenario.judge_llm}` : '';
  return createAxisEvaluation(
    criterion,
    polite,
    polite
      ? `offline politeness heuristic passed${judge}`
      : `offline politeness heuristic failed${judge}`,
  );
}

function createAxisEvaluation(
  criterion: ScenarioCriterion,
  passed: boolean,
  detail: string,
  options: {hardFail?: boolean} = {},
): AxisEvaluation {
  const evaluation: AxisEvaluation = {
    name: criterion.axis,
    pass: passed,
    status: passed ? 'passed' : 'failed',
    score: passed ? 1 : 0,
    detail,
    weight: criterion.weight,
  };

  if (options.hardFail) {
    evaluation.hard_fail = true;
  }

  return evaluation;
}

function getScenarioPath(testCase: TestCase): string {
  const scenarioPath = testCase.input.scenario_path ?? testCase.input.scenarioPath;
  if (typeof scenarioPath !== 'string' || scenarioPath.trim() === '') {
    throw new Error('Missing required field: scenario_path');
  }

  return scenarioPath;
}

function collectToolCalls(transcript: ScenarioTranscript): ScenarioToolCall[] {
  const calls = (transcript.tool_calls ?? []).map(call => ({...call}));
  const pairedTopLevelCalls = new Set<number>();

  for (const turn of transcript.turns) {
    for (const toolCall of collectTurnToolEvidence(turn)) {
      const pairedTopLevelIndex = findTopLevelToolCallPair(
        calls,
        pairedTopLevelCalls,
        toolCall,
      );
      if (typeof pairedTopLevelIndex === 'number') {
        pairedTopLevelCalls.add(pairedTopLevelIndex);
        calls[pairedTopLevelIndex] = mergeToolCallEvidence(calls[pairedTopLevelIndex], toolCall);
        continue;
      }

      calls.push({...toolCall});
    }
  }

  return calls;
}

function collectTurnToolEvidence(turn: ScenarioTurn): ScenarioToolCall[] {
  return [
    turn.tool_call,
    ...(turn.tool_calls ?? []).map(call => normalizeNativeToolCall(call)),
    ...(turn.tool_results ?? []).map(result => normalizeNativeToolResult(result)),
  ].filter((toolCall): toolCall is ScenarioToolCall => toolCall !== undefined);
}

function findTopLevelToolCallPair(
  calls: ScenarioToolCall[],
  pairedIndexes: Set<number>,
  turnCall: ScenarioToolCall,
): number | undefined {
  if (turnCall.request_id) {
    const requestIndex = calls.findIndex((call, index) =>
      !pairedIndexes.has(index) && call.request_id === turnCall.request_id);
    if (requestIndex !== -1) {
      return requestIndex;
    }
  }

  const turnKey = toolCallEvidenceKey(turnCall);
  const exactIndex = calls.findIndex((call, index) =>
    !pairedIndexes.has(index) && toolCallEvidenceKey(call) === turnKey);
  if (exactIndex !== -1) {
    return exactIndex;
  }

  const summaryOnlyIndex = calls.findIndex((call, index) =>
    !pairedIndexes.has(index)
    && call.name === turnCall.name
    && isSummaryOnlyToolCall(call));

  return summaryOnlyIndex === -1 ? undefined : summaryOnlyIndex;
}

function isSummaryOnlyToolCall(call: ScenarioToolCall): boolean {
  return call.request_id === undefined
    && call.arguments === undefined
    && call.schema_pass === undefined
    && call.round_trip_ms === undefined
    && call.response_consumed_in_next_turn === undefined;
}

function mergeToolCallEvidence(primary: ScenarioToolCall, secondary: ScenarioToolCall): ScenarioToolCall {
  const merged: ScenarioToolCall = {
    name: primary.name,
    request_id: primary.request_id ?? secondary.request_id,
    arguments: primary.arguments ?? secondary.arguments,
  };

  const schemaPass = mergeBooleanEvidence(primary.schema_pass, secondary.schema_pass);
  if (typeof schemaPass === 'boolean') {
    merged.schema_pass = schemaPass;
  }

  const responseConsumed = mergeBooleanEvidence(
    primary.response_consumed_in_next_turn,
    secondary.response_consumed_in_next_turn,
  );
  if (typeof responseConsumed === 'boolean') {
    merged.response_consumed_in_next_turn = responseConsumed;
  }

  const called = mergeFalseWinsBoolean(primary.tool_has_been_called, secondary.tool_has_been_called);
  if (typeof called === 'boolean') {
    merged.tool_has_been_called = called;
  }

  const resultReceived = mergeTrueWinsBoolean(primary.result_received, secondary.result_received);
  if (typeof resultReceived === 'boolean') {
    merged.result_received = resultReceived;
  }

  const isError = mergeTrueWinsBoolean(primary.is_error, secondary.is_error);
  if (typeof isError === 'boolean') {
    merged.is_error = isError;
  }

  const isBlocked = mergeTrueWinsBoolean(primary.is_blocked, secondary.is_blocked);
  if (typeof isBlocked === 'boolean') {
    merged.is_blocked = isBlocked;
  }

  if (primary.error_type ?? secondary.error_type) {
    merged.error_type = primary.error_type ?? secondary.error_type;
  }

  if (primary.raw_error_message ?? secondary.raw_error_message) {
    merged.raw_error_message = primary.raw_error_message ?? secondary.raw_error_message;
  }

  const latencies = [primary.round_trip_ms, secondary.round_trip_ms]
    .filter((latency): latency is number => typeof latency === 'number' && Number.isFinite(latency));
  if (latencies.length > 0) {
    merged.round_trip_ms = Math.max(...latencies);
  }

  return merged;
}

function mergeBooleanEvidence(first: boolean | undefined, second: boolean | undefined): boolean | undefined {
  return mergeFalseWinsBoolean(first, second);
}

function mergeFalseWinsBoolean(first: boolean | undefined, second: boolean | undefined): boolean | undefined {
  const values = new Set([first, second].filter((value): value is boolean => typeof value === 'boolean'));
  if (values.has(false)) {
    return false;
  }

  if (values.has(true)) {
    return true;
  }

  return undefined;
}

function mergeTrueWinsBoolean(first: boolean | undefined, second: boolean | undefined): boolean | undefined {
  const values = new Set([first, second].filter((value): value is boolean => typeof value === 'boolean'));
  if (values.has(true)) {
    return true;
  }

  if (values.has(false)) {
    return false;
  }

  return undefined;
}

function toolCallEvidenceKey(call: ScenarioToolCall): string {
  if (call.request_id) {
    return `${call.name}\trequest_id:${call.request_id}`;
  }

  return `${call.name}\t${stableJson(call.arguments ?? {})}`;
}

function normalizeNativeToolCall(call: ScenarioNativeToolCall): ScenarioToolCall | undefined {
  const name = nativeToolName(call);
  if (!name) {
    return undefined;
  }

  const parsedParameters = parseParamsAsJson(call.params_as_json);
  const normalized: ScenarioToolCall = {
    name,
    arguments: call.arguments ?? call.parameters ?? parsedParameters.arguments,
  };

  if (call.request_id) {
    normalized.request_id = call.request_id;
  }

  const schemaPass = typeof call.schema_pass === 'boolean'
    ? call.schema_pass
    : parsedParameters.schema_pass;
  if (typeof schemaPass === 'boolean') {
    normalized.schema_pass = schemaPass;
  }

  if (typeof call.round_trip_ms === 'number') {
    normalized.round_trip_ms = call.round_trip_ms;
  }

  if (typeof call.response_consumed_in_next_turn === 'boolean') {
    normalized.response_consumed_in_next_turn = call.response_consumed_in_next_turn;
  }

  if (typeof call.tool_has_been_called === 'boolean') {
    normalized.tool_has_been_called = call.tool_has_been_called;
  }

  return normalized;
}

function normalizeNativeToolResult(result: ScenarioToolResult): ScenarioToolCall | undefined {
  const name = nativeToolName(result);
  if (!name) {
    return undefined;
  }

  const normalized: ScenarioToolCall = {
    name,
    result_received: true,
    tool_has_been_called: result.tool_has_been_called !== false,
  };
  if (result.request_id) {
    normalized.request_id = result.request_id;
  }

  if (typeof result.tool_latency_secs === 'number') {
    normalized.round_trip_ms = Math.round(result.tool_latency_secs * 1000);
  }

  if (typeof result.response_consumed_in_next_turn === 'boolean') {
    normalized.response_consumed_in_next_turn = result.response_consumed_in_next_turn;
  }

  if (typeof result.is_error === 'boolean') {
    normalized.is_error = result.is_error;
  }

  if (typeof result.is_blocked === 'boolean') {
    normalized.is_blocked = result.is_blocked;
  }

  if (typeof result.error_type === 'string' && result.error_type.length > 0) {
    normalized.error_type = result.error_type;
  }

  if (typeof result.raw_error_message === 'string' && result.raw_error_message.length > 0) {
    normalized.raw_error_message = result.raw_error_message;
  }

  return normalized;
}

function nativeToolName(value: {name?: string; tool_name?: string}): string | undefined {
  return value.name ?? value.tool_name;
}

function parseParamsAsJson(value: string | undefined): {arguments?: Record<string, unknown>; schema_pass?: boolean} {
  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed)
      ? {arguments: parsed}
      : {schema_pass: false};
  } catch {
    return {schema_pass: false};
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableJson(item)).join(',')}]`;
  }

  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function toolParametersAreValid(call: ScenarioToolCall): {pass: boolean; detail: string; hardFail?: boolean} {
  if (typeof call.schema_pass === 'boolean') {
    return {
      pass: call.schema_pass,
      detail: call.schema_pass
        ? 'parameters matched schema'
        : 'parameters failed schema validation',
    };
  }

  return {
    pass: false,
    detail: 'parameters_pass requires an explicit schema_pass verdict in the transcript fixture',
    hardFail: true,
  };
}

function toolExecutionFailureDetail(call: ScenarioToolCall): string | undefined {
  if (call.tool_has_been_called === false) {
    return 'tool was emitted but not executed (tool_has_been_called=false)';
  }

  const reasons = toolExecutionFailureReasons(call);
  if (reasons.length > 0) {
    return `tool result reported failure evidence (${reasons.join(', ')})`;
  }

  return undefined;
}

function toolExecutionFailureReasons(call: ScenarioToolCall): string[] {
  const reasons: string[] = [];
  if (call.is_error) {
    reasons.push('is_error: true');
  }

  if (call.is_blocked) {
    reasons.push('is_blocked: true');
  }

  if (call.error_type) {
    reasons.push(`error_type: ${call.error_type}`);
  }

  if (call.raw_error_message) {
    reasons.push(`raw_error_message: ${call.raw_error_message}`);
  }

  return reasons;
}

function toolCallRoundTripThreshold(criterion: ScenarioCriterion, scenario: ScenarioDefinition): number | undefined {
  if (isRecord(criterion.expected) && typeof criterion.expected.max_ms === 'number') {
    return criterion.expected.max_ms;
  }

  return scenario.thresholds.tool_call_round_trip_ms;
}

function toolRoutingExpectation(expected: unknown): {route: string; name?: string} | undefined {
  if (expected === 'tool' || expected === 'kb' || expected === 'knowledge_base') {
    return {route: expected};
  }

  if (!isRecord(expected) || typeof expected.route !== 'string') {
    return undefined;
  }

  const normalized: {route: string; name?: string} = {route: expected.route};
  if (typeof expected.name === 'string' && expected.name.trim() !== '') {
    normalized.name = expected.name;
  }

  return normalized;
}

function expectedToolName(expected: unknown): string | undefined {
  if (isRecord(expected) && typeof expected.name === 'string' && expected.name.trim() !== '') {
    return expected.name;
  }

  return undefined;
}

function getLatencyMetric(axis: string, transcript: ScenarioTranscript): number | undefined {
  const breakdownKey = latencyBreakdownKey(axis);
  const values = breakdownKey ? transcript.latency_breakdown_ms?.[breakdownKey] : undefined;
  const summaryMetric = typeof transcript.metrics?.[axis] === 'number'
    ? transcript.metrics[axis]
    : undefined;
  const breakdownMetric = values ? percentile(values, 95) : undefined;

  if (typeof summaryMetric === 'number' && typeof breakdownMetric === 'number') {
    return Math.max(summaryMetric, breakdownMetric);
  }

  return summaryMetric ?? breakdownMetric;
}

function latencyBreakdownKey(axis: string): string | undefined {
  const mapping: Record<string, string> = {
    ttfb_p95_ms: 'ttfb',
    end_to_first_audio_p95_ms: 'end_to_first_audio',
    total_turn_p95_ms: 'total_turn',
  };
  return mapping[axis];
}

function percentile(values: number[], percentileValue: number): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = values.filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return undefined;
  }

  const rank = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function describeToolRouteOutcome(passed: boolean, expectedName: string | undefined, observed: string): string {
  if (passed) {
    return expectedName
      ? `agent chose expected tool route "${expectedName}"`
      : `agent chose tool route (${observed})`;
  }

  return expectedName
    ? `expected tool route via "${expectedName}", saw ${observed || 'no tool call'}`
    : 'expected a tool route but no tool call was present';
}
