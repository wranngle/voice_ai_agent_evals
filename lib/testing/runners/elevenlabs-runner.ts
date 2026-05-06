/**
 * ElevenLabs Test Runner
 *
 * Executes ElevenLabs conversational AI agent tests using the simulate-conversation API.
 *
 * API Endpoint (docs checked 2026-05-05):
 * - POST /v1/convai/agents/{agent_id}/simulate-conversation
 */

import type {EvaluationDimension, TestCase} from '../types';
import type {
  TestRunner,
  TestExecutionResult,
  RunOptions,
  ElevenLabsTestConfig,
  ElevenLabsExpectedOutput,
  ElevenLabsEvaluationCriterion,
  AssertionResult,
} from './types';
import {missingApiKeyResult} from './missing-config';
import {
  type AssertionContext,
  type NativeCriteriaResult,
  type SimulateConversationRequest,
  type SimulateConversationResponse,
  type SimulateConversationTurn,
  type ToolExecutionEvent,
  EXPECTED_OUTPUT_FIELDS,
  EXPECTED_OUTPUT_ONLY_FIELDS,
  INPUT_FIELDS,
  collectNativeCriteriaResults,
  criteriaIdentifierCandidates,
  getAnalysisFailureMessage,
  getAnalysisPassState,
  getAnalysisStatus,
  hasElevenLabsAssertion,
  hasPartialConversationHistory,
  hasText,
  isRecord,
  requestedCriterionIdentifiers,
  slugify,
  stringValue,
  validatePositiveInteger,
  validateStringArray,
} from './elevenlabs-runner-internals';

const API_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_TIMEOUT = 120_000; // 120s for voice agent tests (they can take a while)

export class ElevenLabsRunner implements TestRunner {
  readonly type = 'elevenlabs' as const;
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ELEVENLABS_API_KEY || '';
  }

  async execute(testCase: TestCase, options?: RunOptions): Promise<TestExecutionResult> {
    const config = testCase.input as unknown as ElevenLabsTestConfig;
    const expected = testCase.expected_output as ElevenLabsExpectedOutput;
    const timeout = options?.timeout || DEFAULT_TIMEOUT;

    const startTime = Date.now();
    const assertions: AssertionResult[] = [];

    if (!this.apiKey) {
      return missingApiKeyResult('ELEVENLABS_API_KEY', startTime);
    }

    try {
      // Build request
      const request = this.buildRequest(testCase);

      // Call simulate-conversation API
      const response = await this.simulateConversation(config.agent_id, request, timeout);
      const latency_ms = Date.now() - startTime;

      // Extract conversation text for assertions
      const agentMessages = response.simulated_conversation
        .filter(turn => turn.role === 'agent')
        .map(turn => turnText(turn))
        .join(' ');

      const toolEvents = collectToolExecutionEvents(response);
      const toolCalls = toolEvents
        .filter(event => event.called)
        .map(event => event.name);
      const emittedToolCalls = toolEvents
        .filter(event => event.emitted)
        .map(event => event.name);

      // Run assertions
      this.runAssertions(assertions, expected, {
        agentMessages,
        toolCalls,
        emittedToolCalls,
        toolEvents,
        response,
      });

      const shouldPassAssertionRequested = typeof expected.should_pass === 'boolean';
      if (shouldPassAssertionRequested) {
        const analysisPassState = getAnalysisPassState(response.analysis, {
          includeNativeCriteriaFailures: expected.should_pass === false,
        });
        const passed = analysisPassState?.successful === expected.should_pass;
        assertions.push({
          name: 'analysis:should_pass',
          passed,
          expected: expected.should_pass ? 'pass' : 'fail',
          actual: analysisPassState
            ? (analysisPassState.successful ? 'pass' : 'fail')
            : 'missing analysis pass/fail evidence',
          message: passed
            ? undefined
            : `Expected ElevenLabs analysis to ${expected.should_pass ? 'pass' : 'fail'}, got ${analysisPassState?.status ?? 'no pass/fail evidence'}`,
        });
      }

      const analysisFailureMessage = getAnalysisFailureMessage(response.analysis);
      if (
        analysisFailureMessage
        && !shouldPassAssertionRequested
        && assertions.every(assertion => assertion.passed)
      ) {
        assertions.push({
          name: 'analysis:call_successful',
          passed: false,
          expected: 'success',
          actual: getAnalysisStatus(response.analysis) ?? 'failed',
          message: analysisFailureMessage,
        });
      }

      // Calculate final status
      const assertionsPassed = assertions.filter(a => a.passed).length;
      const assertionsFailed = assertions.filter(a => !a.passed).length;
      const failureMessages = assertions
        .filter(a => !a.passed)
        .map(a => a.message)
        .filter((message): message is string => typeof message === 'string' && message.length > 0);

      if (
        analysisFailureMessage
        && !shouldPassAssertionRequested
        && !failureMessages.includes(analysisFailureMessage)
      ) {
        failureMessages.unshift(analysisFailureMessage);
      }

      const allAssertionsPassed = assertionsFailed === 0;
      const finalPassed = (!analysisFailureMessage || shouldPassAssertionRequested) && allAssertionsPassed;

      return {
        status: finalPassed ? 'passed' : 'failed',
        actual_output: {
          conversation: response.simulated_conversation,
          analysis: response.analysis,
          tool_calls: toolCalls,
          emitted_tool_calls: emittedToolCalls,
          tool_events: toolEvents,
          agent_messages: agentMessages,
        },
        latency_ms,
        assertions_passed: assertionsPassed,
        assertions_failed: assertionsFailed,
        dimensions: assertionDimensions(assertions),
        error_message: finalPassed ? undefined : failureMessages.join('; '),
      };
    } catch (error) {
      const latency_ms = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        status: 'error',
        actual_output: {error: errorMessage},
        latency_ms,
        error_message: errorMessage,
        assertions_passed: 0,
        assertions_failed: 0,
      };
    }
  }

  validate(testCase: TestCase): {valid: boolean; errors: string[]} {
    const errors: string[] = [];
    if (!isRecord(testCase.input)) {
      errors.push('input must be an object');
      return {valid: false, errors};
    }

    if (!isRecord(testCase.expected_output)) {
      errors.push('expected_output must be an object');
      return {valid: false, errors};
    }

    const config = testCase.input as unknown as ElevenLabsTestConfig;
    const expected = testCase.expected_output as ElevenLabsExpectedOutput;

    for (const field of Object.keys(config)) {
      if (!INPUT_FIELDS.has(field) && !EXPECTED_OUTPUT_ONLY_FIELDS.has(field)) {
        errors.push(`input.${field} is not recognized by the ElevenLabs runner`);
      }
    }

    for (const field of Object.keys(expected)) {
      if (!EXPECTED_OUTPUT_FIELDS.has(field)) {
        errors.push(`expected_output.${field} is not recognized by the ElevenLabs runner`);
      }
    }

    for (const field of EXPECTED_OUTPUT_ONLY_FIELDS) {
      if (Object.hasOwn(config, field)) {
        errors.push(`input.${field} is ignored by the ElevenLabs runner; move it to expected_output.${field}`);
      }
    }

    if (!hasElevenLabsAssertion(expected)) {
      errors.push('expected_output must include at least one assertion for the ElevenLabs runner');
    }

    if (!hasText(config.agent_id)) {
      errors.push('agent_id must be a non-empty string');
    }

    if (config.test_prompt !== undefined && typeof config.test_prompt !== 'string') {
      errors.push('test_prompt must be a string when present');
    }

    if (config.simulated_user_prompt !== undefined && typeof config.simulated_user_prompt !== 'string') {
      errors.push('simulated_user_prompt must be a string when present');
    }

    if (config.simulated_user_llm !== undefined && typeof config.simulated_user_llm !== 'string') {
      errors.push('simulated_user_llm must be a string when present');
    }

    if (
      config.simulated_user_temperature !== undefined
      && (typeof config.simulated_user_temperature !== 'number'
        || !Number.isFinite(config.simulated_user_temperature))
    ) {
      errors.push('simulated_user_temperature must be a finite number when present');
    }

    if (
      config.disable_first_message_interruptions !== undefined
      && typeof config.disable_first_message_interruptions !== 'boolean'
    ) {
      errors.push('disable_first_message_interruptions must be a boolean when present');
    }

    if (config.language !== undefined && !hasText(config.language)) {
      errors.push('language must be a non-empty string when present');
    }

    if (config.dynamic_variables !== undefined && !isRecord(config.dynamic_variables)) {
      errors.push('dynamic_variables must be an object when present');
    }

    if (config.tool_mock_config !== undefined && !isRecord(config.tool_mock_config)) {
      errors.push('tool_mock_config must be an object when present');
    }

    validatePositiveInteger(config.max_turns, 'input.max_turns', errors);

    // Require an intentional simulation seed even though the raw API accepts
    // sparse objects; empty simulations are usually accidental in this harness.
    if (
      !hasText(config.test_prompt)
      && !hasText(config.simulated_user_prompt)
      && !hasPartialConversationHistory(config.partial_conversation_history)
    ) {
      errors.push('test_prompt, simulated_user_prompt, or partial_conversation_history is required for conversation simulation');
    }

    if (config.partial_conversation_history !== undefined && !Array.isArray(config.partial_conversation_history)) {
      errors.push('partial_conversation_history must be an array when present');
    }

    if (Array.isArray(config.partial_conversation_history)) {
      for (const [index, turn] of config.partial_conversation_history.entries()) {
        if (!isRecord(turn)) {
          errors.push(`partial_conversation_history[${index}] must be an object`);
          continue;
        }

        if (turn.role !== 'user' && turn.role !== 'agent') {
          errors.push(`partial_conversation_history[${index}].role must be "user" or "agent"`);
        }

        if ('message' in turn && turn.message !== null && typeof turn.message !== 'string') {
          errors.push(`partial_conversation_history[${index}].message must be a string or null`);
        }
      }
    }

    validateStringArray(expected.response_contains, 'response_contains', errors);
    validateStringArray(expected.response_not_contains, 'response_not_contains', errors);
    validateStringArray(expected.expected_tool_calls, 'expected_tool_calls', errors);
    validateStringArray(expected.forbidden_tool_calls, 'forbidden_tool_calls', errors);
    validatePositiveInteger(expected.min_turns, 'min_turns', errors);
    validatePositiveInteger(expected.max_turns, 'max_turns', errors);

    if (
      typeof expected.min_turns === 'number'
      && typeof expected.max_turns === 'number'
      && expected.max_turns < expected.min_turns
    ) {
      errors.push('max_turns must be greater than or equal to min_turns');
    }

    if (expected.evaluation_criteria !== undefined && !Array.isArray(expected.evaluation_criteria)) {
      errors.push('evaluation_criteria must be an array when present');
    }

    if (Array.isArray(expected.evaluation_criteria)) {
      if (expected.evaluation_criteria.length === 0) {
        errors.push('evaluation_criteria must include at least one item when present');
      }

      for (const [index, criterion] of expected.evaluation_criteria.entries()) {
        if (!isRecord(criterion)) {
          errors.push(`evaluation_criteria[${index}] must be an object`);
          continue;
        }

        if (!hasText(criterion.name)) {
          errors.push(`evaluation_criteria[${index}].name is required`);
        }

        if (!hasText(criterion.conversation_goal_prompt) && !hasText(criterion.description)) {
          errors.push(`evaluation_criteria[${index}].conversation_goal_prompt is required`);
        }
      }
    }

    if (expected.should_pass !== undefined && typeof expected.should_pass !== 'boolean') {
      errors.push('should_pass must be a boolean');
    }

    if (
      expected.tool_call_latency_max_ms !== undefined
      && !isRecord(expected.tool_call_latency_max_ms)
    ) {
      errors.push('tool_call_latency_max_ms must be an object keyed by tool name');
    }

    if (isRecord(expected.tool_call_latency_max_ms)) {
      if (Object.keys(expected.tool_call_latency_max_ms).length === 0) {
        errors.push('tool_call_latency_max_ms must include at least one tool budget when present');
      }

      for (const [toolName, maxLatencyMs] of Object.entries(expected.tool_call_latency_max_ms)) {
        if (!hasText(toolName)) {
          errors.push('tool_call_latency_max_ms keys must be non-empty tool names');
        }

        if (!Number.isFinite(maxLatencyMs) || maxLatencyMs < 0) {
          errors.push(`tool_call_latency_max_ms.${toolName} must be a non-negative number`);
        }
      }
    }

    return {valid: errors.length === 0, errors};
  }

  /**
   * Build simulation request from test case
   */
  private buildRequest(testCase: TestCase): SimulateConversationRequest {
    const config = testCase.input as unknown as ElevenLabsTestConfig;
    const expected = testCase.expected_output as ElevenLabsExpectedOutput;

    const request: SimulateConversationRequest = {
      simulation_specification: {
        simulated_user_config: {
          language: config.language || 'en',
        },
      },
    };

    const {simulated_user_config: simulatedUserConfig} = request.simulation_specification;

    if (hasText(config.test_prompt)) {
      simulatedUserConfig.first_message = config.test_prompt;
    }

    if (typeof config.disable_first_message_interruptions === 'boolean') {
      simulatedUserConfig.disable_first_message_interruptions = config.disable_first_message_interruptions;
    }

    if (hasText(config.simulated_user_prompt)) {
      simulatedUserConfig.prompt = {
        prompt: config.simulated_user_prompt,
      };

      if (hasText(config.simulated_user_llm)) {
        simulatedUserConfig.prompt.llm = config.simulated_user_llm;
      }

      if (typeof config.simulated_user_temperature === 'number') {
        simulatedUserConfig.prompt.temperature = config.simulated_user_temperature;
      }
    }

    // Add dynamic variables if provided
    if (config.dynamic_variables) {
      request.simulation_specification.dynamic_variables = config.dynamic_variables;
    }

    if (config.tool_mock_config) {
      request.simulation_specification.tool_mock_config = config.tool_mock_config;
    }

    if (config.partial_conversation_history) {
      request.simulation_specification.partial_conversation_history = config.partial_conversation_history;
    }

    // Add turn limits
    const maxTurns = expected.max_turns ?? config.max_turns;
    if (maxTurns) {
      request.new_turns_limit = maxTurns;
    }

    // Add custom evaluation criteria
    if (expected.evaluation_criteria && expected.evaluation_criteria.length > 0) {
      request.extra_evaluation_criteria = expected.evaluation_criteria
        .map((criterion, index) => normalizeEvaluationCriterionRequest(criterion, index));
    }

    return request;
  }

  /**
   * Call the simulate-conversation API
   */
  private async simulateConversation(
    agentId: string,
    request: SimulateConversationRequest,
    timeout: number,
  ): Promise<SimulateConversationResponse> {
    const url = `${API_BASE}/convai/agents/${agentId}/simulate-conversation`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
      }

      return (await response.json()) as SimulateConversationResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Run assertions against conversation results
   */
  private runAssertions(
    assertions: AssertionResult[],
    expected: ElevenLabsExpectedOutput,
    context: AssertionContext,
  ): void {
    const {
      agentMessages, toolCalls, emittedToolCalls, toolEvents, response,
    } = context;
    const agentMessagesLower = agentMessages.toLowerCase();
    const turnCount = response.simulated_conversation.length;

    if (turnCount === 0) {
      assertions.push({
        name: 'conversation_non_empty',
        passed: false,
        expected: 'at least one simulated conversation turn',
        actual: '0 turns',
        message: 'ElevenLabs simulate-conversation returned no turns',
      });
    }

    // Response_contains assertions
    if (expected.response_contains && expected.response_contains.length > 0) {
      for (const keyword of expected.response_contains) {
        const found = agentMessagesLower.includes(keyword.toLowerCase());
        assertions.push({
          name: `response_contains:${keyword}`,
          passed: found,
          expected: keyword,
          actual: found ? 'found' : 'not found',
          message: found ? undefined : `Expected agent response to contain "${keyword}"`,
        });
      }
    }

    // Response_not_contains assertions
    if (expected.response_not_contains && expected.response_not_contains.length > 0) {
      for (const keyword of expected.response_not_contains) {
        const found = agentMessagesLower.includes(keyword.toLowerCase());
        assertions.push({
          name: `response_not_contains:${keyword}`,
          passed: !found,
          expected: `not contain "${keyword}"`,
          actual: found ? 'found' : 'not found',
          message: found ? `Expected agent response to NOT contain "${keyword}"` : undefined,
        });
      }
    }

    const expectedToolCallNames = new Set(expected.expected_tool_calls ?? []);

    // Expected_tool_calls assertions
    if (expected.expected_tool_calls && expected.expected_tool_calls.length > 0) {
      for (const toolName of expected.expected_tool_calls) {
        const matchingEvents = toolEvents.filter(event => event.name === toolName);
        const matchingExecutedEvents = matchingEvents.filter(event => event.called);
        const matchingCompletedEvents = matchingEvents.filter(event => event.emitted && event.called);
        const called = matchingCompletedEvents.length > 0;
        const emitted = matchingEvents.some(event => event.emitted);
        assertions.push({
          name: `expected_tool_call:${toolName}`,
          passed: called,
          expected: toolName,
          actual: expectedToolCallActual(matchingEvents),
          message: called
            ? undefined
            : describeExpectedToolCallFailure(toolName, {emitted, executed: matchingExecutedEvents.length > 0}),
        });

        const unresolvedEmittedEvents = toolEvents
          .filter(event => event.name === toolName && event.emitted && !event.called);
        if (called && unresolvedEmittedEvents.length > 0) {
          assertions.push({
            name: `tool_call_resolved:${toolName}`,
            passed: false,
            expected: 'every emitted expected tool call executes',
            actual: `${unresolvedEmittedEvents.length} emitted call(s) without execution evidence`,
            message: describeUnresolvedEmittedToolCalls(toolName, unresolvedEmittedEvents),
          });
        }

        // When the tool was called and ElevenLabs returned explicit error
        // evidence (is_error), separate "did we attempt the call" from "did
        // the tool succeed" so a runtime failure surfaces as its own
        // assertion. Skipped when no tool_results evidence is present.
        if (matchingExecutedEvents.length > 0) {
          const eventsWithoutResults = matchingExecutedEvents
            .filter(event => !event.result_received);
          const resultReceived = eventsWithoutResults.length === 0;
          assertions.push({
            name: `tool_result_received:${toolName}`,
            passed: resultReceived,
            expected: 'tool_results evidence',
            actual: resultReceived
              ? 'tool_results received'
              : `${eventsWithoutResults.length}/${matchingExecutedEvents.length} call(s) missing tool_results`,
            message: resultReceived
              ? undefined
              : describeMissingToolResults(toolName, eventsWithoutResults),
          });

          const eventsWithFailureEvidence = matchingExecutedEvents
            .filter(event => typeof event.failed === 'boolean');
          if (eventsWithFailureEvidence.length > 0) {
            const failedEvents = eventsWithFailureEvidence.filter(event => event.failed);
            const succeeded = failedEvents.length === 0;
            assertions.push({
              name: `tool_call_succeeded:${toolName}`,
              passed: succeeded,
              expected: 'no error',
              actual: succeeded ? 'no error' : failedEvents.map(event => toolFailureActual(event)).join(', '),
              message: succeeded ? undefined : describeToolExecutionFailures(toolName, failedEvents),
            });
          }
        }
      }
    }

    // Forbidden_tool_calls assertions
    if (expected.forbidden_tool_calls && expected.forbidden_tool_calls.length > 0) {
      const toolResultNames = new Set(toolEvents
        .map(event => event.result_name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0));
      for (const toolName of expected.forbidden_tool_calls) {
        const called = toolCalls.includes(toolName)
          || emittedToolCalls.includes(toolName)
          || toolResultNames.has(toolName);
        assertions.push({
          name: `forbidden_tool_call:${toolName}`,
          passed: !called,
          expected: `not call "${toolName}"`,
          actual: called ? 'called' : 'not called',
          message: called ? `Tool "${toolName}" should NOT have been called` : undefined,
        });
      }
    }

    if (expected.tool_call_latency_max_ms) {
      for (const [toolName, maxLatencyMs] of Object.entries(expected.tool_call_latency_max_ms)) {
        const matchingEvents = toolEvents.filter(event => event.name === toolName && event.called);
        // If the tool wasn't called at all, expected_tool_call:tool already
        // reports the failure. A second "latency: not called" assertion just
        // doubles the failure count without adding diagnostic value.
        if (matchingEvents.length === 0) {
          if (!expectedToolCallNames.has(toolName)) {
            assertions.push({
              name: `tool_call_latency:${toolName}`,
              passed: false,
              expected: `called with latency <= ${maxLatencyMs}ms`,
              actual: emittedToolCalls.includes(toolName) ? 'emitted but not called' : 'not called',
              message: describeToolLatencyFailure(toolName, maxLatencyMs, undefined, false),
            });
          }

          continue;
        }

        if (!expectedToolCallNames.has(toolName)) {
          const eventsWithFailureEvidence = matchingEvents
            .filter(event => typeof event.failed === 'boolean');
          if (eventsWithFailureEvidence.length > 0) {
            const failedEvents = eventsWithFailureEvidence.filter(event => event.failed);
            const succeeded = failedEvents.length === 0;
            assertions.push({
              name: `tool_call_succeeded:${toolName}`,
              passed: succeeded,
              expected: 'no error',
              actual: succeeded ? 'no error' : failedEvents.map(event => toolFailureActual(event)).join(', '),
              message: succeeded ? undefined : describeToolExecutionFailures(toolName, failedEvents),
            });
          }
        }

        const measuredLatencies = matchingEvents
          .map(event => event.latency_ms)
          .filter((latency): latency is number => typeof latency === 'number');
        const missingLatencyEvidence = measuredLatencies.length !== matchingEvents.length;
        const maxObservedLatency = measuredLatencies.length > 0 ? Math.max(...measuredLatencies) : undefined;
        const passed = !missingLatencyEvidence
          && typeof maxObservedLatency === 'number'
          && maxObservedLatency <= maxLatencyMs;
        let actualLatency: string;
        if (missingLatencyEvidence) {
          actualLatency = typeof maxObservedLatency === 'number'
            ? `${maxObservedLatency}ms; ${matchingEvents.length - measuredLatencies.length} call(s) missing latency evidence`
            : 'called without latency evidence';
        } else {
          actualLatency = typeof maxObservedLatency === 'number'
            ? `${maxObservedLatency}ms`
            : 'called without latency evidence';
        }

        assertions.push({
          name: `tool_call_latency:${toolName}`,
          passed,
          expected: `<= ${maxLatencyMs}ms`,
          actual: actualLatency,
          message: passed
            ? undefined
            : describeToolLatencyFailure(
              toolName,
              maxLatencyMs,
              missingLatencyEvidence ? undefined : maxObservedLatency,
              true,
            ),
        });
      }
    }

    // Turn count assertions
    if (expected.min_turns !== undefined) {
      const passed = turnCount >= expected.min_turns;
      assertions.push({
        name: 'min_turns',
        passed,
        expected: expected.min_turns,
        actual: turnCount,
        message: passed ? undefined : `Expected at least ${expected.min_turns} turns, got ${turnCount}`,
      });
    }

    if (expected.max_turns !== undefined) {
      const passed = turnCount <= expected.max_turns;
      assertions.push({
        name: 'max_turns',
        passed,
        expected: expected.max_turns,
        actual: turnCount,
        message: passed ? undefined : `Expected at most ${expected.max_turns} turns, got ${turnCount}`,
      });
    }

    const nativeCriteriaResults = collectNativeCriteriaResults(response.analysis);
    addRequestedCriteriaPresenceAssertions(assertions, expected.evaluation_criteria, nativeCriteriaResults);

    // Check API's own evaluation criteria. For negative simulations
    // (`should_pass: false`), criteria failures are expected evidence for
    // the requested failed outcome rather than harness failures.
    if (expected.should_pass !== false) {
      addNativeCriteriaAssertions(assertions, nativeCriteriaResults);
    }
  }
}

function addNativeCriteriaAssertions(
  assertions: AssertionResult[],
  criteriaResults: NativeCriteriaResult[],
): void {
  for (const evaluation of criteriaResults) {
    assertions.push({
      name: `criteria:${evaluation.name}`,
      passed: evaluation.passed,
      expected: 'pass',
      actual: evaluation.passed ? 'pass' : 'fail',
      message: evaluation.passed ? undefined : criteriaFailureMessage(evaluation),
    });
  }
}

function assertionDimensions(assertions: AssertionResult[]): EvaluationDimension[] {
  return assertions.map(assertion => ({
    name: assertion.name,
    status: assertion.passed ? 'passed' : 'failed',
    score: assertion.passed ? 1 : 0,
    detail: assertionDetail(assertion),
  }));
}

function assertionDetail(assertion: AssertionResult): string | undefined {
  if (!assertion.passed && assertion.message) {
    return assertion.message;
  }

  const parts: string[] = [];
  if (assertion.expected !== undefined) {
    parts.push(`expected ${formatAssertionValue(assertion.expected)}`);
  }

  if (assertion.actual !== undefined) {
    parts.push(`actual ${formatAssertionValue(assertion.actual)}`);
  }

  return parts.length > 0 ? parts.join('; ') : assertion.message;
}

function formatAssertionValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      return String(value);
    }

    return encoded.length > 240 ? `${encoded.slice(0, 237)}...` : encoded;
  } catch {
    return String(value);
  }
}

function addRequestedCriteriaPresenceAssertions(
  assertions: AssertionResult[],
  requestedCriteria: ElevenLabsEvaluationCriterion[] | undefined,
  criteriaResults: NativeCriteriaResult[],
): void {
  if (!Array.isArray(requestedCriteria) || requestedCriteria.length === 0) {
    return;
  }

  const observedIdentifiers = new Set(criteriaResults.flatMap(result =>
    criteriaIdentifierCandidates(result.name)));
  const observedLabel = criteriaResults.length > 0
    ? criteriaResults.map(result => result.name).join(', ')
    : 'no evaluation criteria results';

  for (const [index, criterion] of requestedCriteria.entries()) {
    const identifiers = requestedCriterionIdentifiers(criterion, index);
    if (identifiers.some(identifier => observedIdentifiers.has(identifier))) {
      continue;
    }

    const label = criterion.id ?? criterion.name ?? `criterion_${index + 1}`;
    assertions.push({
      name: `criteria_result_present:${label}`,
      passed: false,
      expected: `analysis result for ${label}`,
      actual: observedLabel,
      message: `Expected ElevenLabs analysis to include an evaluation result for requested criterion "${label}"`,
    });
  }
}

function criteriaFailureMessage(evaluation: NativeCriteriaResult): string {
  const prefix = `Criteria "${evaluation.name}" failed`;
  return evaluation.reason ? `${prefix}: ${evaluation.reason}` : prefix;
}

function normalizeEvaluationCriterionRequest(
  criterion: ElevenLabsEvaluationCriterion,
  index: number,
): {
    id: string;
    name: string;
    type: string;
    conversation_goal_prompt: string;
    use_knowledge_base: boolean;
  } {
  return {
    id: criterion.id ?? slugify(criterion.name || `criterion_${index + 1}`),
    name: criterion.name,
    type: criterion.type ?? 'prompt',
    conversation_goal_prompt: criterion.conversation_goal_prompt ?? criterion.description ?? criterion.name,
    use_knowledge_base: criterion.use_knowledge_base ?? false,
  };
}

function toolCallName(toolCall: {name?: string; tool_name?: string}): string | undefined {
  return toolCall.name ?? toolCall.tool_name;
}

function expectedToolCallActual(events: ToolExecutionEvent[]): string {
  if (events.some(event => event.emitted && event.called)) {
    return 'emitted and called';
  }

  const emitted = events.some(event => event.emitted);
  const executed = events.some(event => event.called);
  if (emitted && executed) {
    return 'emitted and executed in separate unpaired trace events';
  }

  if (emitted) {
    return 'emitted but not called';
  }

  if (executed) {
    return 'tool_results without tool_calls evidence';
  }

  return 'not called';
}

function describeExpectedToolCallFailure(
  toolName: string,
  evidence: {emitted: boolean; executed: boolean},
): string {
  if (evidence.emitted && evidence.executed) {
    return `Expected tool "${toolName}" to have paired tool_calls and tool_results evidence, but the trace split them into separate unpaired events`;
  }

  if (evidence.executed) {
    return `Expected tool "${toolName}" to include tool_calls evidence with emitted parameters before accepting tool_results as execution`;
  }

  if (evidence.emitted) {
    return `Expected tool "${toolName}" to be called, but ElevenLabs only emitted it without execution evidence`;
  }

  return `Expected tool "${toolName}" to be called`;
}

function describeToolLatencyFailure(
  toolName: string,
  maxLatencyMs: number,
  observedLatency: number | undefined,
  hasMatchingEvent: boolean,
): string {
  if (typeof observedLatency === 'number') {
    return `Expected tool "${toolName}" latency <= ${maxLatencyMs}ms, got ${observedLatency}ms`;
  }

  if (hasMatchingEvent) {
    return `Expected tool "${toolName}" to include latency evidence`;
  }

  return `Expected tool "${toolName}" to be called before checking latency`;
}

function collectToolExecutionEvents(response: SimulateConversationResponse): ToolExecutionEvent[] {
  const events: ToolExecutionEvent[] = [];
  const byRequestId = new Map<string, ToolExecutionEvent>();

  const createEvent = (name: string, requestId?: string): ToolExecutionEvent => {
    const event: ToolExecutionEvent = {
      name,
      emitted: false,
      called: false,
      result_received: false,
    };

    if (requestId) {
      event.request_id = requestId;
      byRequestId.set(requestId, event);
    }

    events.push(event);
    return event;
  };

  const eventForToolCall = (name: string, requestId?: string): ToolExecutionEvent => {
    if (requestId) {
      const existing = byRequestId.get(requestId);
      if (existing) {
        markToolNameMismatch(existing, 'tool_calls', name, requestId);
        return existing;
      }

      const unkeyedResultOnlyEvent = events.find(event =>
        event.name === name && !event.request_id && !event.emitted);
      if (unkeyedResultOnlyEvent) {
        unkeyedResultOnlyEvent.request_id = requestId;
        byRequestId.set(requestId, unkeyedResultOnlyEvent);
        return unkeyedResultOnlyEvent;
      }

      return createEvent(name, requestId);
    }

    return createEvent(name);
  };

  const eventForToolResult = (name: string, requestId?: string): ToolExecutionEvent => {
    if (requestId) {
      const existing = byRequestId.get(requestId);
      if (existing) {
        markToolNameMismatch(existing, 'tool_results', name, requestId);
        return existing;
      }

      const matchingUnkeyedEvent = events.find(event =>
        event.name === name && !event.request_id && !event.result_received);
      if (matchingUnkeyedEvent) {
        matchingUnkeyedEvent.request_id = requestId;
        byRequestId.set(requestId, matchingUnkeyedEvent);
        return matchingUnkeyedEvent;
      }

      return createEvent(name, requestId);
    }

    const matchingUnkeyedEvent = events.find(event =>
      event.name === name && !event.request_id && !event.result_received);
    if (matchingUnkeyedEvent) {
      return matchingUnkeyedEvent;
    }

    const unresolvedMatchingEvents = events.filter(event =>
      event.name === name && !event.result_received);
    if (unresolvedMatchingEvents.length === 1) {
      return unresolvedMatchingEvents[0];
    }

    return createEvent(name);
  };

  for (const turn of response.simulated_conversation) {
    for (const toolCall of turn.tool_calls ?? []) {
      const name = toolCallName(toolCall);
      if (!name) {
        continue;
      }

      const requestId = stringValue(toolCall.request_id);
      const event = eventForToolCall(name, requestId);
      event.emitted = true;
      // Current ElevenLabs simulation responses distinguish emitted tool
      // intent from execution with tool_has_been_called. Missing evidence is
      // not enough to satisfy expected_tool_calls.
      event.called ||= toolCall.tool_has_been_called === true;
      const parsedParameters = parseToolCallParameters(toolCall, name);
      event.parameters = parsedParameters.parameters;
      if (parsedParameters.integrity_error) {
        event.failed = true;
        event.error_type ??= 'tool_call_params_json_invalid';
        event.integrity_error ??= parsedParameters.integrity_error;
      }
    }

    for (const toolResult of turn.tool_results ?? []) {
      const name = toolCallName(toolResult);
      if (!name) {
        continue;
      }

      const requestId = stringValue(toolResult.request_id);
      const event = eventForToolResult(name, requestId);
      event.result_received = true;
      if (toolResult.tool_has_been_called === false) {
        if (event.called) {
          event.failed = true;
          event.error_type ??= 'tool_called_evidence_conflict';
          event.integrity_error ??= `tool_results${requestId ? ` request_id "${requestId}"` : ''} `
            + `for "${name}" reported tool_has_been_called=false after paired tool_calls reported execution`;
        }
      } else {
        event.called = true;
      }

      event.result = toolResult.result_value ?? toolResult.result;

      if (typeof toolResult.is_error === 'boolean') {
        event.errored = toolResult.is_error;
        event.failed ||= toolResult.is_error;
      }

      if (typeof toolResult.is_blocked === 'boolean') {
        event.blocked = toolResult.is_blocked;
        event.failed ||= toolResult.is_blocked;
      }

      if (typeof toolResult.error_type === 'string' && toolResult.error_type.length > 0) {
        event.error_type ??= toolResult.error_type;
        event.failed = true;
      }

      if (typeof toolResult.raw_error_message === 'string' && toolResult.raw_error_message.length > 0) {
        event.raw_error_message = toolResult.raw_error_message;
        event.failed = true;
      }

      if (typeof toolResult.tool_latency_secs === 'number' && Number.isFinite(toolResult.tool_latency_secs)) {
        event.latency_ms = Math.round(toolResult.tool_latency_secs * 1000);
      }
    }
  }

  return events;
}

function turnText(turn: SimulateConversationTurn): string {
  if (typeof turn.message === 'string' && turn.message.length > 0) {
    return turn.message;
  }

  const multivoiceText = turn.multivoice_message?.parts
    ?.map(part => part.text)
    .filter((text): text is string => typeof text === 'string' && text.length > 0)
    .join(' ');
  if (multivoiceText) {
    return multivoiceText;
  }

  return typeof turn.original_message === 'string' ? turn.original_message : '';
}

function toolFailureActual(event: ToolExecutionEvent): string {
  if (event.blocked) {
    return 'blocked';
  }

  if (event.error_type) {
    return event.error_type;
  }

  return 'error';
}

function describeToolExecutionFailures(toolName: string, events: ToolExecutionEvent[]): string {
  if (events.length === 1) {
    return `Expected tool "${toolName}" to succeed; tool_results returned ${toolFailureReasons(events[0])}`;
  }

  const failures = events
    .map(event => toolFailureReasons(event))
    .join('; ');
  return `Expected tool "${toolName}" to succeed on every call; ${events.length} calls returned failure evidence: ${failures}`;
}

function describeMissingToolResults(toolName: string, events: ToolExecutionEvent[]): string {
  if (events.length === 1) {
    return `Expected tool "${toolName}" to return tool_results evidence after execution`;
  }

  return `Expected tool "${toolName}" to return tool_results evidence for every execution; ${events.length} calls were missing results`;
}

function describeUnresolvedEmittedToolCalls(toolName: string, events: ToolExecutionEvent[]): string {
  const requestIds = events
    .map(event => event.request_id)
    .filter((requestId): requestId is string => typeof requestId === 'string' && requestId.length > 0);
  const suffix = requestIds.length > 0 ? ` (${requestIds.join(', ')})` : '';
  if (events.length === 1) {
    return `Expected emitted tool "${toolName}" to execute, but it never returned execution evidence${suffix}`;
  }

  return `Expected every emitted "${toolName}" tool call to execute, but ${events.length} emitted calls never returned execution evidence${suffix}`;
}

function toolFailureReasons(event: ToolExecutionEvent): string {
  const reasons: string[] = [];
  if (event.integrity_error) {
    reasons.push(event.integrity_error);
  }

  if (event.errored) {
    reasons.push('is_error: true');
  }

  if (event.blocked) {
    reasons.push('is_blocked: true');
  }

  if (event.error_type) {
    reasons.push(`error_type: ${event.error_type}`);
  }

  if (event.raw_error_message) {
    reasons.push(`raw_error_message: ${event.raw_error_message}`);
  }

  return reasons.join(', ') || 'failure evidence';
}

function markToolNameMismatch(
  event: ToolExecutionEvent,
  source: 'tool_calls' | 'tool_results',
  name: string,
  requestId: string,
): void {
  if (event.name === name) {
    return;
  }

  if (source === 'tool_results') {
    event.result_name = name;
  }

  event.failed = true;
  event.error_type ??= 'tool_result_name_mismatch';
  event.integrity_error ??= `${source} request_id "${requestId}" used tool_name "${name}" `
    + `but paired evidence used "${event.name}"`;
}

function parseToolCallParameters(
  toolCall: {params_as_json?: string; parameters?: Record<string, unknown>},
  toolName: string,
): {parameters: unknown; integrity_error?: string} {
  if (typeof toolCall.params_as_json !== 'string') {
    return {parameters: toolCall.parameters};
  }

  try {
    const parameters = JSON.parse(toolCall.params_as_json) as unknown;
    if (!isRecord(parameters)) {
      return {
        parameters,
        integrity_error: `tool_calls params_as_json for "${toolName}" decoded to ${jsonValueKind(parameters)}; expected a JSON object`,
      };
    }

    return {parameters};
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      parameters: toolCall.params_as_json,
      integrity_error: `tool_calls params_as_json for "${toolName}" was not valid JSON: ${message}`,
    };
  }
}

function jsonValueKind(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
}

export const elevenlabsRunner = new ElevenLabsRunner();
