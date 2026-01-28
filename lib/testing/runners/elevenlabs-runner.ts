/**
 * ElevenLabs Test Runner
 *
 * Executes ElevenLabs conversational AI agent tests using the simulate-conversation API.
 *
 * API Endpoint (verified 2026-01-27):
 * - POST /v1/convai/agents/{agent_id}/simulate-conversation
 */

import type { TestCase } from '../types';
import type {
  TestRunner,
  TestExecutionResult,
  RunOptions,
  ElevenLabsTestConfig,
  AssertionResult,
} from './types';

const API_BASE = 'https://api.elevenlabs.io/v1';
const DEFAULT_TIMEOUT = 120000; // 120s for voice agent tests (they can take a while)

/**
 * Expected output configuration for ElevenLabs tests
 */
export interface ElevenLabsExpectedOutput {
  /** Keywords that should appear in agent response */
  response_contains?: string[];
  /** Keywords that should NOT appear in agent response */
  response_not_contains?: string[];
  /** Tool calls that should be made */
  expected_tool_calls?: string[];
  /** Tool calls that should NOT be made */
  forbidden_tool_calls?: string[];
  /** Minimum number of conversation turns */
  min_turns?: number;
  /** Maximum number of conversation turns */
  max_turns?: number;
  /** Custom evaluation criteria to pass */
  evaluation_criteria?: Array<{
    name: string;
    description: string;
  }>;
}

/**
 * Simulated conversation request
 */
interface SimulateConversationRequest {
  simulation_specification: {
    simulated_user_config: {
      first_message?: string;
      language?: string;
      prompt?: {
        prompt?: string;
      };
      dynamic_variables?: Record<string, string>;
    };
    tool_mock_config?: Record<string, unknown>;
    partial_conversation_history?: Array<{
      role: 'user' | 'agent';
      message: string;
    }>;
    dynamic_variables?: Record<string, string>;
  };
  extra_evaluation_criteria?: Array<{
    name: string;
    description: string;
  }>;
  new_turns_limit?: number;
}

/**
 * Simulated conversation response
 */
interface SimulateConversationResponse {
  simulated_conversation: Array<{
    role: 'user' | 'agent';
    message: string;
    tool_calls?: Array<{
      name: string;
      parameters: Record<string, unknown>;
    }>;
    tool_results?: Array<{
      tool_name: string;
      result: unknown;
    }>;
  }>;
  analysis?: {
    criteria_evaluations?: Array<{
      name: string;
      passed: boolean;
      reason?: string;
    }>;
    conversation_summary?: string;
    overall_passed?: boolean;
  };
}

export class ElevenLabsRunner implements TestRunner {
  readonly type = 'elevenlabs' as const;
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ELEVENLABS_API_KEY || '';
  }

  async execute(testCase: TestCase, options?: RunOptions): Promise<TestExecutionResult> {
    const config = testCase.input as ElevenLabsTestConfig;
    const expected = testCase.expected_output as ElevenLabsExpectedOutput;
    const timeout = options?.timeout || DEFAULT_TIMEOUT;

    const startTime = Date.now();
    const assertions: AssertionResult[] = [];

    // Check API key
    if (!this.apiKey) {
      return {
        status: 'error',
        actual_output: { error: 'ELEVENLABS_API_KEY not configured' },
        latency_ms: Date.now() - startTime,
        error_message: 'ELEVENLABS_API_KEY environment variable or constructor parameter required',
        assertions_passed: 0,
        assertions_failed: 0,
      };
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
        .map(turn => turn.message)
        .join(' ');

      const toolCalls = response.simulated_conversation
        .flatMap(turn => turn.tool_calls || [])
        .map(tc => tc.name);

      // Run assertions
      this.runAssertions(assertions, expected, agentMessages, toolCalls, response);

      // Calculate final status
      const assertionsPassed = assertions.filter(a => a.passed).length;
      const assertionsFailed = assertions.filter(a => !a.passed).length;

      // Use analysis.overall_passed if available, otherwise use assertion results
      const analysisResult = response.analysis?.overall_passed;
      const allAssertionsPassed = assertionsFailed === 0;
      const finalPassed = analysisResult !== undefined ? analysisResult && allAssertionsPassed : allAssertionsPassed;

      return {
        status: finalPassed ? 'passed' : 'failed',
        actual_output: {
          conversation: response.simulated_conversation,
          analysis: response.analysis,
          tool_calls: toolCalls,
          agent_messages: agentMessages,
        },
        latency_ms,
        assertions_passed: assertionsPassed,
        assertions_failed: assertionsFailed,
        error_message: finalPassed
          ? undefined
          : assertions
              .filter(a => !a.passed)
              .map(a => a.message)
              .join('; '),
      };
    } catch (error) {
      const latency_ms = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return {
        status: 'error',
        actual_output: { error: errorMessage },
        latency_ms,
        error_message: errorMessage,
        assertions_passed: 0,
        assertions_failed: 0,
      };
    }
  }

  validate(testCase: TestCase): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const config = testCase.input as ElevenLabsTestConfig;

    if (!config.agent_id) {
      errors.push('Missing required field: agent_id');
    } else if (!config.agent_id.startsWith('agent_')) {
      errors.push(`Invalid agent_id format: ${config.agent_id} (should start with 'agent_')`);
    }

    // Must have test_prompt for simulation
    if (!config.test_prompt) {
      errors.push('test_prompt is required for conversation simulation');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Build simulation request from test case
   */
  private buildRequest(testCase: TestCase): SimulateConversationRequest {
    const config = testCase.input as ElevenLabsTestConfig;
    const expected = testCase.expected_output as ElevenLabsExpectedOutput;

    const request: SimulateConversationRequest = {
      simulation_specification: {
        simulated_user_config: {
          first_message: config.test_prompt,
          language: config.language || 'en',
        },
      },
    };

    // Add dynamic variables if provided
    if (config.dynamic_variables) {
      request.simulation_specification.dynamic_variables = config.dynamic_variables;
    }

    // Add turn limits
    if (expected.max_turns) {
      request.new_turns_limit = expected.max_turns;
    }

    // Add custom evaluation criteria
    if (expected.evaluation_criteria && expected.evaluation_criteria.length > 0) {
      request.extra_evaluation_criteria = expected.evaluation_criteria;
    }

    return request;
  }

  /**
   * Call the simulate-conversation API
   */
  private async simulateConversation(
    agentId: string,
    request: SimulateConversationRequest,
    timeout: number
  ): Promise<SimulateConversationResponse> {
    const url = `${API_BASE}/convai/agents/${agentId}/simulate-conversation`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

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

      return await response.json();
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
    agentMessages: string,
    toolCalls: string[],
    response: SimulateConversationResponse
  ): void {
    const agentMessagesLower = agentMessages.toLowerCase();

    // response_contains assertions
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

    // response_not_contains assertions
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

    // expected_tool_calls assertions
    if (expected.expected_tool_calls && expected.expected_tool_calls.length > 0) {
      for (const toolName of expected.expected_tool_calls) {
        const called = toolCalls.includes(toolName);
        assertions.push({
          name: `expected_tool_call:${toolName}`,
          passed: called,
          expected: toolName,
          actual: called ? 'called' : 'not called',
          message: called ? undefined : `Expected tool "${toolName}" to be called`,
        });
      }
    }

    // forbidden_tool_calls assertions
    if (expected.forbidden_tool_calls && expected.forbidden_tool_calls.length > 0) {
      for (const toolName of expected.forbidden_tool_calls) {
        const called = toolCalls.includes(toolName);
        assertions.push({
          name: `forbidden_tool_call:${toolName}`,
          passed: !called,
          expected: `not call "${toolName}"`,
          actual: called ? 'called' : 'not called',
          message: called ? `Tool "${toolName}" should NOT have been called` : undefined,
        });
      }
    }

    // Turn count assertions
    const turnCount = response.simulated_conversation.length;

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

    // Check API's own evaluation criteria
    if (response.analysis?.criteria_evaluations) {
      for (const evaluation of response.analysis.criteria_evaluations) {
        assertions.push({
          name: `criteria:${evaluation.name}`,
          passed: evaluation.passed,
          expected: 'pass',
          actual: evaluation.passed ? 'pass' : 'fail',
          message: evaluation.passed ? undefined : evaluation.reason || `Criteria "${evaluation.name}" failed`,
        });
      }
    }
  }
}

export const elevenlabsRunner = new ElevenLabsRunner();
