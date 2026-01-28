/**
 * Data Table Client
 *
 * Client for CRUD operations on n8n Data Tables via webhook API.
 * n8n Data Tables are internal to n8n, so we expose them via webhooks.
 */

import type {
  TestRequirement,
  TestCase,
  TestResult,
  TestRun,
  TestType,
  TestStatus,
} from './types';

// Base URL for n8n webhooks
const N8N_BASE_URL = process.env.N8N_WEBHOOK_BASE_URL || 'https://your-n8n-host.example.com/webhook';

// Data Table webhook endpoints
const ENDPOINTS = {
  requirements: `${N8N_BASE_URL}/testing-requirements`,
  cases: `${N8N_BASE_URL}/testing-cases`,
  results: `${N8N_BASE_URL}/testing-results`,
  runs: `${N8N_BASE_URL}/testing-runs`,
} as const;

interface QueryParams {
  limit?: number;
  offset?: number;
  filter?: Record<string, unknown>;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
}

/**
 * Generic fetch wrapper with error handling
 */
async function apiCall<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: Record<string, unknown>
): Promise<ApiResponse<T>> {
  const url = new URL(endpoint);

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url.toString(), options);

  if (!response.ok) {
    return {
      success: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  const data = await response.json() as T;
  return { success: true, data };
}

/**
 * Generate unique IDs for different entity types
 */
export function generateId(prefix: 'REQ' | 'TC' | 'RUN' | 'RES'): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// ============================================
// Requirements CRUD
// ============================================

export async function createRequirement(
  requirement: Omit<TestRequirement, 'requirement_id' | 'captured_at'>
): Promise<ApiResponse<TestRequirement>> {
  const data: TestRequirement = {
    ...requirement,
    requirement_id: generateId('REQ'),
    captured_at: new Date().toISOString(),
  };

  return apiCall<TestRequirement>(ENDPOINTS.requirements, 'POST', {
    operation: 'insert',
    data,
  });
}

export async function getRequirement(requirementId: string): Promise<ApiResponse<TestRequirement>> {
  return apiCall<TestRequirement>(`${ENDPOINTS.requirements}?id=${requirementId}`);
}

export async function listRequirements(params?: QueryParams): Promise<ApiResponse<TestRequirement[]>> {
  const url = new URL(ENDPOINTS.requirements);
  if (params?.limit) url.searchParams.set('limit', params.limit.toString());
  if (params?.offset) url.searchParams.set('offset', params.offset.toString());

  return apiCall<TestRequirement[]>(url.toString());
}

export async function updateRequirement(
  requirementId: string,
  updates: Partial<TestRequirement>
): Promise<ApiResponse<TestRequirement>> {
  return apiCall<TestRequirement>(ENDPOINTS.requirements, 'PUT', {
    operation: 'update',
    id: requirementId,
    data: updates,
  });
}

// ============================================
// Test Cases CRUD
// ============================================

export async function createTestCase(
  testCase: Omit<TestCase, 'test_id' | 'created_at' | 'updated_at'>
): Promise<ApiResponse<TestCase>> {
  const now = new Date().toISOString();
  const data: TestCase = {
    ...testCase,
    test_id: generateId('TC'),
    created_at: now,
    updated_at: now,
  };

  return apiCall<TestCase>(ENDPOINTS.cases, 'POST', {
    operation: 'insert',
    data,
  });
}

export async function getTestCase(testId: string): Promise<ApiResponse<TestCase>> {
  return apiCall<TestCase>(`${ENDPOINTS.cases}?id=${testId}`);
}

export async function listTestCases(params?: QueryParams & {
  type?: TestType;
  requirementId?: string;
  tag?: string;
  enabled?: boolean;
}): Promise<ApiResponse<TestCase[]>> {
  const url = new URL(ENDPOINTS.cases);
  if (params?.limit) url.searchParams.set('limit', params.limit.toString());
  if (params?.offset) url.searchParams.set('offset', params.offset.toString());
  if (params?.type) url.searchParams.set('type', params.type);
  if (params?.requirementId) url.searchParams.set('requirement_id', params.requirementId);
  if (params?.tag) url.searchParams.set('tag', params.tag);
  if (params?.enabled !== undefined) url.searchParams.set('enabled', params.enabled.toString());

  return apiCall<TestCase[]>(url.toString());
}

export async function updateTestCase(
  testId: string,
  updates: Partial<TestCase>
): Promise<ApiResponse<TestCase>> {
  return apiCall<TestCase>(ENDPOINTS.cases, 'PUT', {
    operation: 'update',
    id: testId,
    data: {
      ...updates,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function deleteTestCase(testId: string): Promise<ApiResponse<void>> {
  return apiCall<void>(ENDPOINTS.cases, 'DELETE', {
    operation: 'delete',
    id: testId,
  });
}

// ============================================
// Test Results CRUD
// ============================================

export async function createTestResult(
  result: Omit<TestResult, 'result_id' | 'executed_at'>
): Promise<ApiResponse<TestResult>> {
  const data: TestResult = {
    ...result,
    result_id: generateId('RES'),
    executed_at: new Date().toISOString(),
  };

  return apiCall<TestResult>(ENDPOINTS.results, 'POST', {
    operation: 'insert',
    data,
  });
}

export async function getTestResult(resultId: string): Promise<ApiResponse<TestResult>> {
  return apiCall<TestResult>(`${ENDPOINTS.results}?id=${resultId}`);
}

export async function listTestResults(params?: QueryParams & {
  testId?: string;
  executionId?: string;
  status?: TestStatus;
}): Promise<ApiResponse<TestResult[]>> {
  const url = new URL(ENDPOINTS.results);
  if (params?.limit) url.searchParams.set('limit', params.limit.toString());
  if (params?.offset) url.searchParams.set('offset', params.offset.toString());
  if (params?.testId) url.searchParams.set('test_id', params.testId);
  if (params?.executionId) url.searchParams.set('execution_id', params.executionId);
  if (params?.status) url.searchParams.set('status', params.status);

  return apiCall<TestResult[]>(url.toString());
}

export async function getResultsByRun(executionId: string): Promise<ApiResponse<TestResult[]>> {
  return listTestResults({ executionId });
}

// ============================================
// Test Runs CRUD
// ============================================

export async function createTestRun(
  run: Omit<TestRun, 'execution_id' | 'started_at'>
): Promise<ApiResponse<TestRun>> {
  const data: TestRun = {
    ...run,
    execution_id: generateId('RUN'),
    started_at: new Date().toISOString(),
  };

  return apiCall<TestRun>(ENDPOINTS.runs, 'POST', {
    operation: 'insert',
    data,
  });
}

export async function getTestRun(executionId: string): Promise<ApiResponse<TestRun>> {
  return apiCall<TestRun>(`${ENDPOINTS.runs}?id=${executionId}`);
}

export async function listTestRuns(params?: QueryParams & {
  triggeredBy?: TestRun['triggered_by'];
}): Promise<ApiResponse<TestRun[]>> {
  const url = new URL(ENDPOINTS.runs);
  if (params?.limit) url.searchParams.set('limit', params.limit.toString());
  if (params?.offset) url.searchParams.set('offset', params.offset.toString());
  if (params?.triggeredBy) url.searchParams.set('triggered_by', params.triggeredBy);

  return apiCall<TestRun[]>(url.toString());
}

export async function completeTestRun(
  executionId: string,
  stats: {
    total_tests: number;
    passed: number;
    failed: number;
    errors: number;
    skipped: number;
    avg_latency_ms: number;
  }
): Promise<ApiResponse<TestRun>> {
  const passRate = stats.total_tests > 0
    ? (stats.passed / stats.total_tests) * 100
    : 0;

  return apiCall<TestRun>(ENDPOINTS.runs, 'PUT', {
    operation: 'update',
    id: executionId,
    data: {
      ...stats,
      pass_rate: Math.round(passRate * 100) / 100,
      completed_at: new Date().toISOString(),
    },
  });
}

// ============================================
// Utility Functions
// ============================================

/**
 * Capture a new requirement from user input
 */
export async function captureRequirement(
  userIntent: string,
  options?: {
    verbatimQuote?: string;
    source?: string;
    tags?: string[];
  }
): Promise<ApiResponse<TestRequirement>> {
  return createRequirement({
    user_intent: userIntent,
    verbatim_quote: options?.verbatimQuote,
    status: 'captured',
    source: options?.source || 'manual',
    linked_tests: [],
    tags: options?.tags,
  });
}

/**
 * Link a test case to a requirement
 */
export async function linkTestToRequirement(
  testId: string,
  requirementId: string
): Promise<{ testUpdate: ApiResponse<TestCase>; reqUpdate: ApiResponse<TestRequirement> }> {
  // Update test case with requirement reference
  const testUpdate = await updateTestCase(testId, { requirement_id: requirementId });

  // Get current requirement to update linked_tests array
  const reqResponse = await getRequirement(requirementId);
  if (!reqResponse.success || !reqResponse.data) {
    return { testUpdate, reqUpdate: reqResponse };
  }

  const linkedTests = [...(reqResponse.data.linked_tests || [])];
  if (!linkedTests.includes(testId)) {
    linkedTests.push(testId);
  }

  const reqUpdate = await updateRequirement(requirementId, {
    linked_tests: linkedTests,
  });

  return { testUpdate, reqUpdate };
}

/**
 * Get coverage report for all requirements
 */
export async function getRequirementCoverage(): Promise<ApiResponse<Array<{
  requirement_id: string;
  user_intent: string;
  test_count: number;
  coverage_status: 'covered' | 'partial' | 'uncovered';
}>>> {
  const requirements = await listRequirements();
  if (!requirements.success || !requirements.data) {
    return requirements as ApiResponse<never>;
  }

  const coverage = requirements.data.map(req => ({
    requirement_id: req.requirement_id,
    user_intent: req.user_intent,
    test_count: req.linked_tests?.length || 0,
    coverage_status: (req.linked_tests?.length || 0) > 0 ? 'covered' : 'uncovered' as const,
  }));

  return { success: true, data: coverage };
}
