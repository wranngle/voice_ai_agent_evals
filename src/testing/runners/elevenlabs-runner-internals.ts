/**
 * Internal types, constants, and analysis/criteria helpers for elevenlabs-runner.
 *
 * Extracted to keep elevenlabs-runner.ts under the file-size cap. These
 * symbols are used only by elevenlabs-runner.ts; nothing outside that
 * module should import from here directly.
 */

import type {
  ElevenLabsEvaluationCriterion,
  ElevenLabsExpectedOutput,
} from './types';

export type SimulateConversationRequest = {
  simulation_specification: {
    simulated_user_config: {
      first_message?: string;
      language?: string;
      disable_first_message_interruptions?: boolean;
      prompt?: {
        prompt: string;
        llm?: string;
        temperature?: number;
      };
      dynamic_variables?: Record<string, unknown>;
    };
    tool_mock_config?: Record<string, unknown>;
    partial_conversation_history?: Array<Record<string, unknown>>;
    dynamic_variables?: Record<string, unknown>;
  };
  extra_evaluation_criteria?: Array<{
    id: string;
    name: string;
    type: string;
    conversation_goal_prompt: string;
    use_knowledge_base: boolean;
  }>;
  new_turns_limit?: number;
};

export type SimulateConversationTurn = {
  role: 'user' | 'agent';
  request_id?: string;
  message?: string;
  multivoice_message?: {
    parts?: Array<{
      text?: string;
    }>;
  };
  original_message?: string;
  tool_calls?: Array<{
    name?: string;
    tool_name?: string;
    request_id?: string;
    parameters?: Record<string, unknown>;
    params_as_json?: string;
    tool_has_been_called?: boolean;
  }>;
  tool_results?: Array<{
    tool_name?: string;
    name?: string;
    request_id?: string;
    result?: unknown;
    result_value?: unknown;
    is_error?: boolean;
    is_blocked?: boolean;
    error_type?: string;
    raw_error_message?: string;
    tool_has_been_called?: boolean;
    tool_latency_secs?: number;
  }>;
};

export type SimulateConversationResponse = {
  simulated_conversation: SimulateConversationTurn[];
  analysis?: {
    criteria_evaluations?: Array<{
      name: string;
      passed: boolean;
      reason?: string;
    }>;
    evaluation_criteria_results?: Record<string, unknown>;
    evaluation_criteria_results_list?: Array<Record<string, unknown>>;
    scoped?: Array<Record<string, unknown>>;
    conversation_summary?: string;
    overall_passed?: boolean;
    call_successful?: string;
  };
};

export type ToolExecutionEvent = {
  name: string;
  emitted: boolean;
  called: boolean;
  result_received: boolean;
  request_id?: string;
  result_name?: string;
  parameters?: unknown;
  result?: unknown;
  errored?: boolean;
  failed?: boolean;
  blocked?: boolean;
  error_type?: string;
  raw_error_message?: string;
  integrity_error?: string;
  latency_ms?: number;
};

export type AssertionContext = {
  agentMessages: string;
  toolCalls: string[];
  emittedToolCalls: string[];
  toolEvents: ToolExecutionEvent[];
  response: SimulateConversationResponse;
};

export type NativeCriteriaResult = {
  name: string;
  passed: boolean;
  reason?: string;
};

export const EXPECTED_OUTPUT_ONLY_FIELDS = new Set([
  'should_pass',
  'response_contains',
  'response_not_contains',
  'expected_tool_calls',
  'forbidden_tool_calls',
  'tool_call_latency_max_ms',
  'min_turns',
  'evaluation_criteria',
]);

export const EXPECTED_OUTPUT_FIELDS = new Set([
  ...EXPECTED_OUTPUT_ONLY_FIELDS,
  'max_turns',
]);

export const INPUT_FIELDS = new Set([
  'agent_id',
  'test_prompt',
  'simulated_user_prompt',
  'simulated_user_llm',
  'simulated_user_temperature',
  'disable_first_message_interruptions',
  'max_turns',
  'language',
  'dynamic_variables',
  'tool_mock_config',
  'partial_conversation_history',
]);

export function criteriaResultName(rawEvaluation: Record<string, unknown>, index: number): string {
  return stringValue(rawEvaluation.criteria_id)
    ?? stringValue(rawEvaluation.id)
    ?? stringValue(rawEvaluation.name)
    ?? `criteria_${index + 1}`;
}

export function getAnalysisPassState(
  analysis: SimulateConversationResponse['analysis'],
  options: {includeNativeCriteriaFailures?: boolean} = {},
): {successful: boolean; status: string} | undefined {
  if (!analysis) {
    return undefined;
  }

  const failureMessage = getAnalysisFailureMessage(analysis);
  if (failureMessage) {
    return {
      successful: false,
      status: failureMessage,
    };
  }

  const nativeCriteriaPassState = getNativeCriteriaPassState(analysis);
  if (
    options.includeNativeCriteriaFailures
    && nativeCriteriaPassState
    && !nativeCriteriaPassState.successful
  ) {
    return nativeCriteriaPassState;
  }

  const globalStatus = stringValue(analysis.call_successful);
  if (globalStatus) {
    return {
      successful: isSuccessString(globalStatus),
      status: globalStatus,
    };
  }

  if (typeof analysis.overall_passed === 'boolean') {
    return {
      successful: analysis.overall_passed,
      status: String(analysis.overall_passed),
    };
  }

  const scopedStatuses = (analysis.scoped ?? [])
    .map(scopedResult => stringValue(scopedResult.successful))
    .filter((status): status is string => typeof status === 'string');
  if (scopedStatuses.length > 0) {
    return {
      successful: scopedStatuses.every(s => isSuccessString(s)),
      status: scopedStatuses.join(', '),
    };
  }

  return nativeCriteriaPassState;
}

export function getAnalysisFailureMessage(analysis: SimulateConversationResponse['analysis']): string | undefined {
  if (!analysis) {
    return undefined;
  }

  const globalStatus = stringValue(analysis.call_successful);
  if (globalStatus && !isSuccessString(globalStatus)) {
    return `ElevenLabs analysis.call_successful was "${globalStatus}"`;
  }

  if (typeof analysis.overall_passed === 'boolean' && !analysis.overall_passed) {
    return 'ElevenLabs analysis.overall_passed was false';
  }

  for (const [index, scopedResult] of (analysis.scoped ?? []).entries()) {
    const scopedStatus = stringValue(scopedResult.successful);
    if (scopedStatus && !isSuccessString(scopedStatus)) {
      const scope = stringValue(scopedResult.scope) ?? `scoped[${index}]`;
      return `ElevenLabs analysis.scoped ${scope} successful was "${scopedStatus}"`;
    }
  }

  return undefined;
}

export function getAnalysisStatus(analysis: SimulateConversationResponse['analysis']): string | undefined {
  if (!analysis) {
    return undefined;
  }

  const globalStatus = stringValue(analysis.call_successful);
  if (globalStatus) {
    return globalStatus;
  }

  if (typeof analysis.overall_passed === 'boolean') {
    return String(analysis.overall_passed);
  }

  for (const scopedResult of analysis.scoped ?? []) {
    const scopedStatus = stringValue(scopedResult.successful);
    if (scopedStatus) {
      return scopedStatus;
    }
  }

  return undefined;
}

export function normalizeEvaluationCriteriaResult(rawEvaluation: unknown): {passed: boolean; reason?: string} {
  if (typeof rawEvaluation === 'boolean') {
    return {passed: rawEvaluation};
  }

  if (typeof rawEvaluation === 'string') {
    return {
      passed: isSuccessString(rawEvaluation),
      reason: rawEvaluation,
    };
  }

  if (typeof rawEvaluation !== 'object' || rawEvaluation === null) {
    return {
      passed: false,
      reason: 'unrecognized evaluation result shape',
    };
  }

  const evaluation = rawEvaluation as Record<string, unknown>;
  const resultStatus = stringValue(evaluation.result)
    ?? stringValue(evaluation.status)
    ?? stringValue(evaluation.successful);
  const passed = typeof evaluation.passed === 'boolean'
    ? evaluation.passed
    : isSuccessString(resultStatus ?? '');

  const reason = evaluation.reason ?? evaluation.rationale ?? evaluation.description;
  return {
    passed,
    reason: typeof reason === 'string' ? reason : undefined,
  };
}

export function collectNativeCriteriaResults(analysis: SimulateConversationResponse['analysis']): NativeCriteriaResult[] {
  const results: NativeCriteriaResult[] = [];
  if (!analysis) {
    return results;
  }

  for (const evaluation of analysis.criteria_evaluations ?? []) {
    results.push({
      name: evaluation.name,
      passed: evaluation.passed,
      reason: evaluation.reason,
    });
  }

  for (const [name, rawEvaluation] of Object.entries(analysis.evaluation_criteria_results ?? {})) {
    const evaluation = normalizeEvaluationCriteriaResult(rawEvaluation);
    results.push({name, ...evaluation});
  }

  for (const [index, rawEvaluation] of (analysis.evaluation_criteria_results_list ?? []).entries()) {
    const evaluation = normalizeEvaluationCriteriaResult(rawEvaluation);
    results.push({name: criteriaResultName(rawEvaluation, index), ...evaluation});
  }

  for (const [scopeIndex, scopedResult] of (analysis.scoped ?? []).entries()) {
    const scope = stringValue(scopedResult.scope) ?? `scoped[${scopeIndex}]`;

    if (isRecord(scopedResult.evaluation_criteria_results)) {
      for (const [name, rawEvaluation] of Object.entries(scopedResult.evaluation_criteria_results)) {
        const evaluation = normalizeEvaluationCriteriaResult(rawEvaluation);
        results.push({name: scopedCriteriaName(scope, name), ...evaluation});
      }
    }

    if (Array.isArray(scopedResult.evaluation_criteria_results_list)) {
      for (const [index, rawEvaluation] of scopedResult.evaluation_criteria_results_list.entries()) {
        if (!isRecord(rawEvaluation)) {
          const evaluation = normalizeEvaluationCriteriaResult(rawEvaluation);
          results.push({name: scopedCriteriaName(scope, `criteria_${index + 1}`), ...evaluation});
          continue;
        }

        const evaluation = normalizeEvaluationCriteriaResult(rawEvaluation);
        results.push({name: scopedCriteriaName(scope, criteriaResultName(rawEvaluation, index)), ...evaluation});
      }
    }
  }

  return results;
}

export function getNativeCriteriaPassState(analysis: SimulateConversationResponse['analysis']): {successful: boolean; status: string} | undefined {
  const results = collectNativeCriteriaResults(analysis);

  if (results.length === 0) {
    return undefined;
  }

  const failures = results.filter(result => !result.passed).map(result => result.name);
  return {
    successful: failures.length === 0,
    status: failures.length === 0
      ? 'all native criteria passed'
      : `native criteria failed: ${failures.join(', ')}`,
  };
}

export function scopedCriteriaName(scope: string, name: string): string {
  return `${scope}:${name}`;
}

export function requestedCriterionIdentifiers(
  criterion: ElevenLabsEvaluationCriterion,
  index: number,
): string[] {
  return [
    criterion.id,
    criterion.name,
    criterion.id ?? slugify(criterion.name || `criterion_${index + 1}`),
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    .flatMap(value => criteriaIdentifierCandidates(value));
}

export function criteriaIdentifierCandidates(value: string): string[] {
  const raw = value.trim();
  const out = new Set<string>();
  const add = (candidate: string): void => {
    const trimmed = candidate.trim();
    if (trimmed.length > 0) {
      out.add(trimmed.toLowerCase());
      out.add(slugify(trimmed));
    }
  };

  add(raw);

  const scopedSeparator = raw.lastIndexOf(':');
  if (scopedSeparator !== -1) {
    add(raw.slice(scopedSeparator + 1));
  }

  return [...out];
}

export function slugify(value: string): string {
  // Imperative linear-time scan — avoids `/[^a-z\d]+/g` + `/^_+|_+$/g`
  // which CodeQL flags as polynomial-regex risk on user-controlled input.
  const out: string[] = [];
  let lastWasUnderscore = false;
  for (const ch of value.toLowerCase()) {
    const isAlnum = (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
    if (isAlnum) {
      out.push(ch);
      lastWasUnderscore = false;
    } else if (!lastWasUnderscore && out.length > 0) {
      out.push('_');
      lastWasUnderscore = true;
    }
  }

  while (out.length > 0 && out.at(-1) === '_') {
    out.pop();
  }

  return out.length === 0 ? 'criterion' : out.join('');
}

export function isSuccessString(value: string): boolean {
  return ['success', 'successful', 'passed', 'pass', 'true'].includes(value.toLowerCase());
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;
}

export function validateStringArray(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array of non-empty strings`);
    return;
  }

  if (value.length === 0) {
    errors.push(`${label} must include at least one item when present`);
    return;
  }

  for (const [index, item] of value.entries()) {
    if (!hasText(item)) {
      errors.push(`${label}[${index}] must be a non-empty string`);
    }
  }
}

export function validatePositiveInteger(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    errors.push(`${label} must be a positive integer when present`);
  }
}

export function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function hasPartialConversationHistory(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function hasElevenLabsAssertion(expected: ElevenLabsExpectedOutput): boolean {
  return typeof expected.should_pass === 'boolean'
    || hasNonEmptyStringArray(expected.response_contains)
    || hasNonEmptyStringArray(expected.response_not_contains)
    || hasNonEmptyStringArray(expected.expected_tool_calls)
    || hasNonEmptyStringArray(expected.forbidden_tool_calls)
    || hasNonEmptyRecord(expected.tool_call_latency_max_ms)
    || typeof expected.min_turns === 'number'
    || (Array.isArray(expected.evaluation_criteria) && expected.evaluation_criteria.length > 0);
}

export function hasNonEmptyStringArray(value: unknown): boolean {
  return Array.isArray(value)
    && value.some(item => hasText(item));
}

export function hasNonEmptyRecord(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
