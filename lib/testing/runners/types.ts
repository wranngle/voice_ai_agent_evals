/**
 * Test Runner Types
 *
 * Interfaces and types for the test runner system.
 */

import type { TestCase, TestResult, TestStatus, TestType } from '../types';

/**
 * Result of executing a single test
 */
export interface TestExecutionResult {
  status: TestStatus;
  actual_output: Record<string, unknown>;
  latency_ms: number;
  error_message?: string;
  assertions_passed: number;
  assertions_failed: number;
}

/**
 * Assertion result from a single check
 */
export interface AssertionResult {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
}

/**
 * Options for running tests
 */
export interface RunOptions {
  /** Timeout in milliseconds */
  timeout?: number;
  /** Whether to continue on failure */
  continueOnFail?: boolean;
  /** Custom headers for HTTP tests */
  headers?: Record<string, string>;
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Base interface for all test runners
 */
export interface TestRunner {
  /** The type of tests this runner handles */
  readonly type: TestType;

  /** Execute a single test case */
  execute(testCase: TestCase, options?: RunOptions): Promise<TestExecutionResult>;

  /** Validate that a test case is properly configured */
  validate(testCase: TestCase): { valid: boolean; errors: string[] };
}

/**
 * Webhook-specific test input
 */
export interface WebhookTestConfig {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  timeout_ms?: number;
}

/**
 * Webhook-specific expected output
 */
export interface WebhookExpectedOutput {
  status?: number;
  status_range?: { min: number; max: number };
  body?: Record<string, unknown>;
  body_contains?: Record<string, unknown>;
  headers?: Record<string, string>;
  latency_max_ms?: number;
}

/**
 * ElevenLabs test input
 */
export interface ElevenLabsTestConfig {
  agent_id: string;
  test_prompt?: string;
  test_audio_url?: string;
  expected_intent?: string;
  expected_entities?: Record<string, string>;
  max_turns?: number;
}

/**
 * ElevenLabs expected output
 */
export interface ElevenLabsExpectedOutput {
  /** Expected test result (pass/fail) */
  should_pass?: boolean;
  /** Keywords that should appear in agent response */
  response_contains?: string[];
  /** Tool calls that should be made */
  expected_tool_calls?: string[];
  /** Tool calls that should NOT be made */
  forbidden_tool_calls?: string[];
  /** Max latency for first response */
  first_response_max_ms?: number;
}

/**
 * n8n Eval test input
 */
export interface N8nEvalTestConfig {
  workflow_id: string;
  webhook_path?: string;
  payload: Record<string, unknown>;
  eval_metrics?: {
    correctness_weight?: number;
    helpfulness_weight?: number;
    custom_rubric?: string;
  };
}

/**
 * n8n Eval expected output
 */
export interface N8nEvalExpectedOutput {
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
}

/**
 * MCP test input
 */
export interface McpTestConfig {
  workflow_id: string;
  trigger_type: 'webhook' | 'manual';
  payload: Record<string, unknown>;
  expected_nodes?: string[];
  expected_output?: Record<string, unknown>;
  expected_execution_time_ms?: number;
}

/**
 * MCP expected output
 */
export interface McpExpectedOutput {
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
}
