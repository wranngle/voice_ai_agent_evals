/**
 * Testing Framework Type Definitions
 *
 * Core types for the unified n8n testing framework.
 * These types map to n8n Data Table schemas.
 */

// Test case types supported by the framework
export type TestType = 'webhook' | 'elevenlabs' | 'n8n-eval' | 'mcp' | 'external-command' | 'scenario';

// Test execution status
export type TestStatus = 'passed' | 'failed' | 'error' | 'skipped' | 'pending';

// Requirement capture status
export type RequirementStatus = 'captured' | 'reviewed' | 'implemented' | 'deprecated' | 'validated';

/**
 * Captured requirement from user input
 * Stored in: testing-requirements Data Table
 */
export type TestRequirement = {
  requirement_id: string; // REQ-XXX-NNN format
  user_intent: string; // What the user wants to achieve
  verbatim_quote?: string; // Exact quote from user
  captured_at: string; // ISO timestamp
  status: RequirementStatus;
  source: string; // Where this was captured (chat, issue, etc.)
  linked_tests: string[]; // Array of test_id references
  tags?: string[];
};

/**
 * Test case definition
 * Stored in: testing-cases Data Table
 */
export type TestCase = {
  test_id: string; // TC-XXX-NNN format
  type: TestType;
  requirement_id?: string; // Optional link to requirement
  name: string;
  description: string;
  input: Record<string, unknown>; // Test input data
  expected_output: Record<string, unknown>; // Expected response
  tags: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * Test execution result
 * Stored in: testing-results Data Table
 */
export type TestResult = {
  result_id: string; // Auto-generated UUID
  test_id: string; // Reference to TestCase
  execution_id: string; // Reference to TestRun
  requirement_id?: string; // Denormalized for easy querying
  status: TestStatus;
  actual_output: Record<string, unknown>;
  latency_ms: number;
  error_message?: string;
  executed_at: string; // ISO timestamp
  assertions_passed?: number;
  assertions_failed?: number;
  artifacts?: EvaluationArtifact[];
  dimensions?: EvaluationDimension[];
};

/**
 * Test run/batch execution record
 * Stored in: testing-runs Data Table
 */
export type TestRun = {
  execution_id: string; // UUID
  started_at: string;
  completed_at?: string;
  triggered_by: 'manual' | 'ci' | 'scheduled' | 'hook';
  trigger_source?: string; // Branch name, schedule name, etc.
  total_tests?: number;
  passed?: number;
  failed?: number;
  errors?: number;
  skipped?: number;
  pass_rate?: number; // Percentage 0-100
  avg_latency_ms?: number;
  p95_latency_ms?: number;
  p99_latency_ms?: number;
  test_type_filter?: TestType; // If filtered by type
  tag_filter?: string; // If filtered by tag
  /** Arbitrary filter context recorded at run start (type, tags, ids, etc.) */
  test_filter?: Record<string, unknown>;
};

/**
 * Webhook test input format
 */
export type WebhookTestInput = {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  timeout_ms?: number;
};

/**
 * Artifact emitted by an app or integration evaluation.
 */
export type EvaluationArtifact = {
  name: string;
  path?: string;
  url?: string;
  kind: 'json' | 'junit' | 'html' | 'trace' | 'screenshot' | 'video' | 'log' | 'coverage' | 'other';
  producer?: string;
};

/**
 * A normalized scoring/check dimension from a runner or adapter.
 */
export type EvaluationDimension = {
  name: string;
  status: TestStatus;
  score?: number;
  detail?: string;
  weight?: number;
};

/**
 * Test run summary for reporting
 */
export type TestRunSummary = {
  execution_id: string;
  duration_ms: number;
  total_tests: number;
  passed: number;
  failed: number;
  errors: number;
  skipped: number;
  pass_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  slowest_test?: {
    test_id: string;
    name: string;
    latency_ms: number;
  };
  failures: Array<{
    test_id: string;
    name: string;
    error_message: string;
  }>;
};
