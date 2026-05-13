/**
 * @wranngle/voice-evals/n8n/workflow-eval — black-box n8n workflow runner.
 *
 * Ports the archive's `supersystem/tests/workflow-evaluation-runner.js`.
 *
 * Given a config of workflows + test cases, POST each test case's input to
 * the workflow's webhook URL and compare the response against expectations.
 *
 * Complements the Phase F `corrector` (which mutates workflows): this
 * runner just observes them. Together they form the test-fix-retest loop.
 *
 * Failures can be folded back into the friction log via
 * `evaluateAndLogFrictions()` so the supersystem orchestrator picks them up.
 */

import {logFriction} from '../remediation/friction-log';

export type WorkflowTestCase = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  expected?: Record<string, unknown>;
  timeout_ms?: number;
};

export type WorkflowDefinition = {
  id: string;
  name: string;
  description?: string;
  webhook_path: string;
  test_cases: WorkflowTestCase[];
};

export type WorkflowEvalConfig = {
  base_url: string;
  workflows: WorkflowDefinition[];
};

export type WorkflowCheck = {
  field: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
};

export type WorkflowTestResult = {
  test_id: string;
  test_name: string;
  passed: boolean;
  duration_ms: number;
  status_code?: number;
  checks: WorkflowCheck[];
  error?: string;
  response_sample?: string;
};

export type WorkflowEvalResult = {
  id: string;
  name: string;
  webhook_path: string;
  test_cases: WorkflowTestResult[];
  summary: {total: number; passed: number; failed: number; pass_rate: number};
};

export type WorkflowEvalSummary = {
  timestamp: string;
  workflows: WorkflowEvalResult[];
  summary: {
    total_tests: number;
    passed: number;
    failed: number;
    errors: number;
    pass_rate: number;
  };
};

export type WorkflowEvalRunnerOptions = {
  fetchImpl?: typeof globalThis.fetch;
  /** Filter to a single workflow id. */
  workflowId?: string;
  /** Inter-test delay (ms). Default 0 — set ≥500 to be polite to n8n. */
  delayBetweenTestsMs?: number;
  /** Inject clock for tests. */
  now?: () => string;
};

export async function evaluateWorkflows(
  config: WorkflowEvalConfig,
  options: WorkflowEvalRunnerOptions = {},
): Promise<WorkflowEvalSummary> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => new Date().toISOString());
  const filtered = options.workflowId
    ? config.workflows.filter(w => w.id === options.workflowId)
    : config.workflows;

  const workflowResults: WorkflowEvalResult[] = [];
  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let totalErrors = 0;

  for (const workflow of filtered) {
    const testResults: WorkflowTestResult[] = [];
    for (const testCase of workflow.test_cases) {
      const result = await executeTestCase(config.base_url, workflow, testCase, fetchImpl);
      testResults.push(result);
      totalTests++;
      if (result.passed) {
        totalPassed++;
      } else if (result.error === undefined) {
        totalFailed++;
      } else {
        totalErrors++;
      }

      if (options.delayBetweenTestsMs && options.delayBetweenTestsMs > 0) {
        await new Promise(resolve => setTimeout(resolve, options.delayBetweenTestsMs));
      }
    }

    const summary = {
      total: testResults.length,
      passed: testResults.filter(r => r.passed).length,
      failed: testResults.filter(r => !r.passed && r.error === undefined).length,
      pass_rate: testResults.length === 0 ? 0 : (testResults.filter(r => r.passed).length / testResults.length) * 100,
    };

    workflowResults.push({
      id: workflow.id,
      name: workflow.name,
      webhook_path: workflow.webhook_path,
      test_cases: testResults,
      summary,
    });
  }

  return {
    timestamp: now(),
    workflows: workflowResults,
    summary: {
      total_tests: totalTests,
      passed: totalPassed,
      failed: totalFailed,
      errors: totalErrors,
      pass_rate: totalTests === 0 ? 0 : (totalPassed / totalTests) * 100,
    },
  };
}

async function executeTestCase(
  baseUrl: string,
  workflow: WorkflowDefinition,
  testCase: WorkflowTestCase,
  fetchImpl: typeof globalThis.fetch,
): Promise<WorkflowTestResult> {
  const url = `${baseUrl.replace(/\/+$/, '')}${workflow.webhook_path}`;
  const timeoutMs = testCase.timeout_ms ?? 30_000;
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(testCase.input),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const duration = Date.now() - start;
    let data: unknown = {};
    try {
      data = await response.json();
    } catch {
      // non-JSON body — fall through with {}
    }

    const checks: WorkflowCheck[] = [];
    let passed = true;
    if (testCase.expected) {
      for (const [key, expectedValue] of Object.entries(testCase.expected)) {
        const actualValue = (data as Record<string, unknown>)[key];
        const fieldPassed = compareValues(actualValue, expectedValue);
        checks.push({
          field: key, expected: expectedValue, actual: actualValue, passed: fieldPassed,
        });
        if (!fieldPassed) {
          passed = false;
        }
      }
    }

    if (duration > timeoutMs) {
      checks.push({
        field: 'response_time',
        expected: `< ${timeoutMs}ms`,
        actual: `${duration}ms`,
        passed: false,
      });
      passed = false;
    }

    return {
      test_id: testCase.id,
      test_name: testCase.name,
      passed,
      duration_ms: duration,
      status_code: response.status,
      checks,
      response_sample: JSON.stringify(data).slice(0, 200),
    };
  } catch (error: unknown) {
    clearTimeout(timer);
    return {
      test_id: testCase.id,
      test_name: testCase.name,
      passed: false,
      duration_ms: Date.now() - start,
      checks: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function compareValues(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      return false;
    }

    return expected.every(e => actual.includes(e));
  }

  if (expected !== null && typeof expected === 'object') {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  return actual === expected;
}

/**
 * Run the evaluation and append a friction-log entry for every failed test.
 * Convenient for wiring into the supersystem orchestrator: the next cycle's
 * `collectFailures` reads the friction log to know what to fix.
 */
export async function evaluateAndLogFrictions(
  config: WorkflowEvalConfig,
  options: WorkflowEvalRunnerOptions & {frictionLogPath: string},
): Promise<WorkflowEvalSummary> {
  const result = await evaluateWorkflows(config, options);
  for (const workflow of result.workflows) {
    for (const tc of workflow.test_cases) {
      if (tc.passed) {
        continue;
      }

      logFriction({
        type: 'WORKFLOW_TEST_FAILURE',
        pattern: workflow.id,
        agentId: workflow.webhook_path,
        success: false,
        detail: JSON.stringify({
          test_id: tc.test_id,
          test_name: tc.test_name,
          error: tc.error,
          checks: tc.checks.filter(c => !c.passed),
        }),
      }, {path: options.frictionLogPath});
    }
  }

  return result;
}
