/**
 * Test Runner Types
 *
 * Interfaces and types for the test runner system.
 */

import type {
  EvaluationArtifact, EvaluationDimension, TestCase, TestStatus, TestType,
} from '../types';

/**
 * Result of executing a single test
 */
export type TestExecutionResult = {
  status: TestStatus;
  actual_output: Record<string, unknown>;
  latency_ms: number;
  error_message?: string;
  assertions_passed: number;
  assertions_failed: number;
  artifacts?: EvaluationArtifact[];
  dimensions?: EvaluationDimension[];
};

/**
 * Assertion result from a single check
 */
export type AssertionResult = {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
};

/**
 * Options for running tests
 */
export type RunOptions = {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Custom headers for HTTP tests */
  headers?: Record<string, string>;
  /** Environment variables */
  env?: Record<string, string>;
};

/**
 * Base interface for all test runners
 */
export type TestRunner = {
  /** The type of tests this runner handles */
  readonly type: TestType;

  /** Execute a single test case */
  execute(testCase: TestCase, options?: RunOptions): Promise<TestExecutionResult>;

  /** Validate that a test case is properly configured */
  validate(testCase: TestCase): {valid: boolean; errors: string[]};
};

/**
 * Webhook-specific test input
 */
export type WebhookTestConfig = {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout_ms?: number;
  /**
   * Sign the outgoing JSON body with an ElevenLabs-Signature header for
   * post-call webhook replay tests. Secret is read from
   * elevenlabs_signature_secret_env or ELEVENLABS_POST_CALL_SECRET.
   */
  sign_elevenlabs_payload?: boolean;
  /** Environment variable name containing the ElevenLabs webhook HMAC secret. */
  elevenlabs_signature_secret_env?: string;
  /** Test-only timestamp override for deterministic signature assertions. */
  elevenlabs_signature_timestamp_secs?: number;
};

/**
 * Webhook-specific expected output
 */
export type WebhookExpectedOutput = {
  status?: number;
  status_range?: {min: number; max: number};
  body?: Record<string, unknown>;
  body_contains?: Record<string, unknown>;
  /** Expected array members by response body path */
  body_array_contains?: Record<string, unknown[]>;
  body_truthy?: string[];
  body_falsy?: string[];
  body_defined?: string[];
  headers?: Record<string, string>;
  latency_max_ms?: number;
};

/**
 * ElevenLabs test input. Assertion-shaped fields belong on
 * ElevenLabsExpectedOutput (response_contains, expected_tool_calls, etc.);
 * putting them on the input is a silent no-op because the runner reads
 * assertions from `testCase.expected_output`, not from the config.
 */
export type ElevenLabsTestConfig = {
  agent_id: string;
  test_prompt?: string;
  simulated_user_prompt?: string;
  simulated_user_llm?: string;
  simulated_user_temperature?: number;
  disable_first_message_interruptions?: boolean;
  /** Fallback used when `expected_output.max_turns` is unset. */
  max_turns?: number;
  language?: string;
  dynamic_variables?: Record<string, unknown>;
  tool_mock_config?: Record<string, unknown>;
  partial_conversation_history?: Array<Record<string, unknown>>;
};

/**
 * ElevenLabs evaluation criterion sent to the simulate-conversation analysis.
 */
export type ElevenLabsEvaluationCriterion = {
  id?: string;
  name: string;
  type?: string;
  conversation_goal_prompt?: string;
  description?: string;
  use_knowledge_base?: boolean;
};

/**
 * ElevenLabs expected output
 */
export type ElevenLabsExpectedOutput = {
  /** Expected ElevenLabs analysis result (pass/fail) */
  should_pass?: boolean;
  /** Keywords that should appear in agent response */
  response_contains?: string[];
  /** Keywords that should not appear in agent response */
  response_not_contains?: string[];
  /** Tool calls that should execute and return tool_results evidence */
  expected_tool_calls?: string[];
  /** Tool calls that should NOT be made */
  forbidden_tool_calls?: string[];
  /** Per-tool max latency in milliseconds, keyed by tool name */
  tool_call_latency_max_ms?: Record<string, number>;
  /** Minimum number of simulated conversation turns */
  min_turns?: number;
  /**
   * Maximum number of simulated conversation turns. Also drives the
   * simulate-conversation new_turns_limit request control, so it is a guard
   * but not sufficient eval signal by itself.
   */
  max_turns?: number;
  /** Extra ElevenLabs prompt evaluation criteria for the simulation analysis */
  evaluation_criteria?: ElevenLabsEvaluationCriterion[];
};

/**
 * N8n Eval test input
 */
export type N8nEvalTestConfig = {
  workflow_id: string;
  webhook_path?: string;
  payload: Record<string, unknown>;
  eval_metrics?: {
    correctness_weight?: number;
    helpfulness_weight?: number;
    /**
     * NOT implemented: needs an LLM judge the n8n-eval runner doesn't have.
     * Setting it fails the test closed with an explicit `custom_rubric`
     * assertion — it never silently passes.
     */
    custom_rubric?: string;
  };
};

/**
 * N8n Eval expected output
 */
export type N8nEvalExpectedOutput = {
  /** Expected status of the workflow execution */
  execution_status?: 'success' | 'error';
  /** Minimum overall score (0-100) */
  min_score?: number;
  /** Expected keys in the output */
  output_contains?: Record<string, unknown>;
  /** Expected nodes to have executed */
  nodes_executed?: string[];
  /** Max execution time */
  max_execution_time_ms?: number;
  /** Custom assertions to run against output */
  custom_assertions?: Array<{
    name: string;
    path: string;
    expected: unknown;
  }>;
};

/**
 * MCP test input. Assertion fields like `expected_nodes`, `expected_output`,
 * and `mcp_tools_called` belong in `testCase.expected_output` (typed as
 * McpExpectedOutput); putting them here is a silent no-op because the runner
 * reads assertions from `expected_output`, not from `input`.
 */
export type McpTestConfig = {
  workflow_id: string;
  trigger_type: 'webhook' | 'manual';
  payload: Record<string, unknown>;
  /** Per-test timeout fallback when no `options.timeout` is supplied. */
  expected_execution_time_ms?: number;
};

/**
 * MCP expected output
 */
export type McpExpectedOutput = {
  /** Expected workflow execution status */
  execution_status?: 'success' | 'error';
  /** Expected MCP tools to be called */
  mcp_tools_called?: string[];
  /** Expected nodes to execute */
  expected_nodes?: string[];
  /** Expected output fields */
  expected_output?: Record<string, unknown>;
  /** Max execution time */
  max_execution_time_ms?: number;
};

/**
 * External command test input.
 */
export type ExternalCommandTestConfig = {
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  timeout_ms?: number;
  expected_exit_code?: number;
  artifacts?: EvaluationArtifact[];
  dimensions?: EvaluationDimension[];
};

/**
 * External command expected output.
 */
export type ExternalCommandExpectedOutput = {
  exit_code?: number;
  stdout_contains?: string[];
  stderr_contains?: string[];
  stdout_not_contains?: string[];
  stderr_not_contains?: string[];
};
