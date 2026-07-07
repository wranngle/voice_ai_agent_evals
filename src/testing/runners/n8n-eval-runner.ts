/**
 * N8n Eval Node Test Runner
 *
 * Executes n8n workflow tests and evaluates results against expected outputs.
 * Integrates with n8n's built-in evaluation nodes for dataset-driven testing.
 *
 * Supports:
 * - Webhook-triggered workflows
 * - Manual workflow execution via API
 * - Custom evaluation metrics (correctness, helpfulness, custom rubrics)
 */

import type {TestCase} from '../types';
import {normalizeN8nApiUrl} from '../../n8n-url';
import type {
  TestRunner,
  TestExecutionResult,
  RunOptions,
  N8nEvalTestConfig,
  N8nEvalExpectedOutput,
  AssertionResult,
} from './types';
import {missingApiKeyResult} from './missing-config';

const DEFAULT_TIMEOUT = 120_000; // 2 minutes for n8n workflows

// Known expected_output keys for fail-closed unknown-key rejection.
// Mirrors codex's elevenlabs `EXPECTED_OUTPUT_FIELDS` pattern.
const N8N_EVAL_EXPECTED_OUTPUT_FIELDS = new Set([
  'execution_status',
  'min_score',
  'output_contains',
  'nodes_executed',
  'max_execution_time_ms',
  'custom_assertions',
]);

/**
 * N8n execution result structure
 */
type N8nExecutionResult = {
  id?: string;
  executionId?: string;
  status?: 'success' | 'error' | 'waiting' | 'running';
  finished?: boolean;
  data?: {
    resultData?: {
      runData?: Record<string, Array<{
        data?: {
          main?: Array<Array<{json: Record<string, unknown>}>>;
        };
        error?: {message: string};
      }>>;
      lastNodeExecuted?: string;
      error?: {message: string};
    };
  };
  startedAt?: string;
  stoppedAt?: string;
  mode?: string;
  workflowId?: string;
};

export class N8nEvalRunner implements TestRunner {
  readonly type = 'n8n-eval' as const;
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(apiUrl?: string, apiKey?: string) {
    // Drop the historical `'https://your-n8n-host.example.com/api/v1'`
    // placeholder fallback — without N8N_API_URL set, fetches went to a
    // host that does not resolve and surfaced as opaque DNS errors. Empty
    // string flows through to the execute() guard so the missing-config
    // error matches the apiKey path (sibling: mcp-runner.ts pass 76,
    // scripts/list-workflows.ts pass 61).
    const sourceUrl = apiUrl || process.env.N8N_API_URL || '';
    this.apiUrl = sourceUrl ? normalizeN8nApiUrl(sourceUrl) : '';
    this.apiKey = apiKey || process.env.N8N_API_KEY || '';
  }

  async execute(testCase: TestCase, options?: RunOptions): Promise<TestExecutionResult> {
    const config = testCase.input as unknown as N8nEvalTestConfig;
    const expected = testCase.expected_output as N8nEvalExpectedOutput;
    const timeout = options?.timeout || DEFAULT_TIMEOUT;

    const startTime = Date.now();
    const assertions: AssertionResult[] = [];

    if (!this.apiUrl) {
      return missingApiKeyResult('N8N_API_URL', startTime);
    }

    if (!this.apiKey) {
      return missingApiKeyResult('N8N_API_KEY', startTime);
    }

    try {
      // Execute the workflow
      const executionResult = await this.executeWorkflow(config, timeout);
      const latency_ms = Date.now() - startTime;

      // Check execution status
      if (expected.execution_status) {
        const actualStatus = executionResult.status || (executionResult.data?.resultData?.error ? 'error' : 'success');
        assertions.push({
          name: 'execution_status',
          passed: actualStatus === expected.execution_status,
          expected: expected.execution_status,
          actual: actualStatus,
          message: actualStatus === expected.execution_status
            ? undefined
            : `Expected execution status '${expected.execution_status}', got '${actualStatus}'`,
        });
      }

      // Check execution time
      if (expected.max_execution_time_ms) {
        assertions.push(this.assertExecutionTime(latency_ms, expected.max_execution_time_ms));
      }

      // Check output contains
      if (expected.output_contains) {
        const output = this.extractOutput(executionResult);
        assertions.push(this.assertOutputContains(output, expected.output_contains));
      }

      // Check nodes executed
      if (expected.nodes_executed && expected.nodes_executed.length > 0) {
        const executedNodes = this.getExecutedNodes(executionResult);
        assertions.push(this.assertNodesExecuted(executedNodes, expected.nodes_executed));
      }

      // Check custom assertions
      if (expected.custom_assertions) {
        const output = this.extractOutput(executionResult);
        for (const customAssertion of expected.custom_assertions) {
          assertions.push(this.assertCustom(output, customAssertion));
        }
      }

      // Calculate evaluation score if metrics provided
      let score = 100;
      if (config.eval_metrics) {
        score = this.calculateScore(executionResult, config.eval_metrics);
      }

      // custom_rubric needs an LLM judge this runner doesn't have — fail
      // closed (same doctrine as unknown scoring axes) instead of silently
      // scoring a supplied rubric as a no-op pass.
      if (config.eval_metrics?.custom_rubric) {
        assertions.push({
          name: 'custom_rubric',
          passed: false,
          expected: 'LLM-judged rubric evaluation',
          actual: 'not implemented',
          message: 'custom_rubric is not implemented in the n8n-eval runner (no LLM judge wired). Remove the field or score via correctness_weight/helpfulness_weight.',
        });
      }

      // Check minimum score
      if (expected.min_score !== undefined) {
        assertions.push({
          name: 'min_score',
          passed: score >= expected.min_score,
          expected: `>= ${expected.min_score}`,
          actual: score,
          message: score >= expected.min_score
            ? undefined
            : `Score ${score.toFixed(1)} is below minimum ${expected.min_score}`,
        });
      }

      // Calculate final results
      const assertionsPassed = assertions.filter(a => a.passed).length;
      const assertionsFailed = assertions.filter(a => !a.passed).length;
      const allPassed = assertionsFailed === 0;

      // Determine status based on execution and assertions
      // For webhooks, 'error' status (4xx/5xx) is a valid outcome if that's what we expected
      let finalStatus: 'passed' | 'failed' | 'error' = 'passed';
      const webhookResult = executionResult as N8nExecutionResult & {_webhookResponse?: Record<string, unknown>};
      const isWebhook = Boolean(webhookResult._webhookResponse);

      if (executionResult.status === 'error' && expected.execution_status !== 'error' && !isWebhook) {
        // Only treat as error if not a webhook (webhooks with errors are valid test outcomes)
        finalStatus = 'error';
      } else if (!allPassed) {
        finalStatus = 'failed';
      }

      return {
        status: finalStatus,
        actual_output: {
          execution_id: executionResult.id || executionResult.executionId,
          workflow_id: config.workflow_id,
          status: executionResult.status,
          score,
          output: this.extractOutput(executionResult),
          nodes_executed: this.getExecutedNodes(executionResult),
          last_node_executed: executionResult.data?.resultData?.lastNodeExecuted,
        },
        latency_ms,
        assertions_passed: assertionsPassed,
        assertions_failed: assertionsFailed,
        error_message: allPassed
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
    const config = testCase.input as unknown as N8nEvalTestConfig;

    if (!config.workflow_id) {
      errors.push('Missing required field: workflow_id');
    }

    if (!config.payload) {
      errors.push('Missing required field: payload');
    }

    // Fail-closed on typo'd expected_output keys. Mirrors codex's elevenlabs
    // policy and the mcp/webhook implementations from passes 43/44.
    if (
      typeof testCase.expected_output === 'object'
      && testCase.expected_output !== null
      && !Array.isArray(testCase.expected_output)
    ) {
      for (const field of Object.keys(testCase.expected_output)) {
        if (!N8N_EVAL_EXPECTED_OUTPUT_FIELDS.has(field)) {
          errors.push(`expected_output.${field} is not recognized by the n8n-eval runner`);
        }
      }
    }

    validateN8nEvalExpectedOutput(testCase.expected_output, errors);

    // A workflow eval with zero assertions silently returns 'passed' regardless
    // of the run. Reject empty expected_output. Mirrors codex's elevenlabs
    // policy and passes 51-52.
    if (
      typeof testCase.expected_output === 'object'
      && testCase.expected_output !== null
      && !Array.isArray(testCase.expected_output)
      && !hasN8nEvalAssertion(testCase.expected_output)
    ) {
      errors.push('expected_output must include at least one assertion for the n8n-eval runner');
    }

    return {valid: errors.length === 0, errors};
  }

  /**
   * Execute an n8n workflow and wait for results
   */
  private async executeWorkflow(
    config: N8nEvalTestConfig,
    timeout: number,
  ): Promise<N8nExecutionResult> {
    // First, try to trigger via webhook if webhook_path is provided
    if (config.webhook_path) {
      return this.executeViaWebhook(config, timeout);
    }

    // Otherwise, use the workflow execution API
    return this.executeViaApi(config, timeout);
  }

  /**
   * Execute workflow via webhook
   */
  private async executeViaWebhook(
    config: N8nEvalTestConfig,
    timeout: number,
  ): Promise<N8nExecutionResult> {
    const webhookUrl = `${this.apiUrl.replace('/api/v1', '')}/webhook/${config.webhook_path}`;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config.payload),
      signal: AbortSignal.timeout(timeout),
    });

    // For webhooks, non-2xx responses are valid test outcomes, not errors.
    // Read the body as text ONCE upfront and parse downstream — the previous
    // `response.json()` + `response.text()`-in-catch chain risked "Body
    // already consumed" if json() partially read before throwing. Mirrors
    // codex's webhook-runner fix.
    const responseText = await response.text();
    let result: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(responseText);
      result = isRecord(parsed) ? parsed : {_raw_response: responseText};
    } catch {
      result = {_raw_response: responseText};
    }

    // Attach HTTP status to the result for assertion purposes
    result._http_status = response.status;

    // Return with direct output (no wrapping)
    const webhookResult: N8nExecutionResult & {_webhookResponse: Record<string, unknown>} = {
      status: response.ok ? 'success' : 'error',
      finished: true,
      data: {
        resultData: {
          runData: {},
          lastNodeExecuted: 'webhook_response',
        },
      },
      _webhookResponse: result,
    };
    return webhookResult;
  }

  /**
   * Execute workflow via n8n API
   */
  private async executeViaApi(
    config: N8nEvalTestConfig,
    timeout: number,
  ): Promise<N8nExecutionResult> {
    // Use the test workflow endpoint
    const url = `${this.apiUrl}/workflows/${config.workflow_id}/execute`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: config.payload,
      }),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Workflow execution failed: ${response.status} - ${error}`);
    }

    const result = (await response.json()) as Record<string, unknown> & N8nExecutionResult;

    // If we got an execution ID, poll for completion
    if (result.executionId && !result.finished) {
      return this.pollForCompletion(result.executionId, timeout);
    }

    return result;
  }

  /**
   * Poll for workflow execution completion. Each per-poll fetch is bounded
   * by the remaining time before the overall deadline so a hung n8n
   * response can't block the loop indefinitely (the outer `Date.now() -
   * startTime < timeout` check only fires BETWEEN iterations).
   */
  private async pollForCompletion(
    executionId: string,
    timeout: number,
  ): Promise<N8nExecutionResult> {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second
    const url = `${this.apiUrl}/executions/${executionId}`;

    while (Date.now() - startTime < timeout) {
      const remaining = timeout - (Date.now() - startTime);

      const response = await fetch(url, {
        headers: {'X-N8N-API-KEY': this.apiKey},
        signal: AbortSignal.timeout(remaining),
      });

      if (!response.ok) {
        // 404 commonly means "n8n hasn't registered the execution yet" — keep
        // polling. Anything else (401/403 auth, 500 server error) is permanent
        // for the lifetime of this call; retrying just buries the real cause
        // under a misleading "did not complete within timeout" message.
        if (response.status === 404) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }

        const body = await response.text().catch(() => '');
        throw new Error(`n8n execution lookup failed: ${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`);
      }

      const execution = (await response.json()) as Record<string, unknown> & N8nExecutionResult;

      if (execution.finished || execution.status === 'success' || execution.status === 'error') {
        return execution;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Execution ${executionId} did not complete within ${timeout}ms`);
  }

  /**
   * Extract output from execution result
   */
  private extractOutput(result: N8nExecutionResult): Record<string, unknown> {
    // Check for direct webhook response first
    const webhookResult = result as N8nExecutionResult & {_webhookResponse?: Record<string, unknown>};
    if (webhookResult._webhookResponse) {
      return webhookResult._webhookResponse;
    }

    const runData = result.data?.resultData?.runData;
    if (!runData) {
      return {};
    }

    // Get output from the last node
    const lastNode = result.data?.resultData?.lastNodeExecuted;
    if (lastNode && runData[lastNode]) {
      const nodeRuns = runData[lastNode];
      if (nodeRuns[0]?.data?.main?.[0]?.[0]?.json) {
        return nodeRuns[0].data.main[0][0].json;
      }
    }

    // Otherwise, aggregate all outputs
    const output: Record<string, unknown> = {};
    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      if (nodeRuns[0]?.data?.main?.[0]?.[0]?.json) {
        output[nodeName] = nodeRuns[0].data.main[0][0].json;
      }
    }

    return output;
  }

  /**
   * Get list of executed nodes
   */
  private getExecutedNodes(result: N8nExecutionResult): string[] {
    const runData = result.data?.resultData?.runData;
    if (!runData) {
      return [];
    }

    return Object.keys(runData);
  }

  /**
   * Calculate evaluation score based on metrics
   */
  private calculateScore(
    result: N8nExecutionResult,
    metrics: N8nEvalTestConfig['eval_metrics'],
  ): number {
    if (!metrics) {
      return 100;
    }

    let score = 0;
    let totalWeight = 0;

    // Correctness check (did it execute successfully?)
    if (metrics.correctness_weight) {
      totalWeight += metrics.correctness_weight;
      if (result.status === 'success' || !result.data?.resultData?.error) {
        score += metrics.correctness_weight * 100;
      }
    }

    // Helpfulness check (basic heuristic - did it produce output?)
    if (metrics.helpfulness_weight) {
      totalWeight += metrics.helpfulness_weight;
      const output = this.extractOutput(result);
      if (Object.keys(output).length > 0) {
        score += metrics.helpfulness_weight * 100;
      }
    }

    // custom_rubric contributes NO weight here — it requires an LLM judge
    // this runner doesn't have. runTest fails closed with an explicit
    // `custom_rubric` assertion whenever the field is set, so a supplied
    // rubric can never silently score as a pass.

    return totalWeight > 0 ? score / totalWeight : 100;
  }

  private assertExecutionTime(actual: number, maxMs: number): AssertionResult {
    const passed = actual <= maxMs;
    return {
      name: 'execution_time',
      passed,
      expected: `<= ${maxMs}ms`,
      actual: `${actual}ms`,
      message: passed ? undefined : `Execution time ${actual}ms exceeds max ${maxMs}ms`,
    };
  }

  private assertOutputContains(
    actual: Record<string, unknown>,
    expected: Record<string, unknown>,
  ): AssertionResult {
    const passed = this.objectContains(actual, expected);
    return {
      name: 'output_contains',
      passed,
      expected,
      actual,
      message: passed ? undefined : 'Output does not contain expected fields',
    };
  }

  private assertNodesExecuted(
    actual: string[],
    expected: string[],
  ): AssertionResult {
    const missing = expected.filter(n => !actual.includes(n));
    const passed = missing.length === 0;
    return {
      name: 'nodes_executed',
      passed,
      expected,
      actual,
      message: passed ? undefined : `Missing expected nodes: ${missing.join(', ')}`,
    };
  }

  private assertCustom(
    output: Record<string, unknown>,
    assertion: {name: string; path: string; expected: unknown},
  ): AssertionResult {
    const actual = this.getValueByPath(output, assertion.path);
    const passed = this.deepEquals(actual, assertion.expected);
    return {
      name: `custom:${assertion.name}`,
      passed,
      expected: assertion.expected,
      actual,
      message: passed ? undefined : `Custom assertion '${assertion.name}' failed at path '${assertion.path}'`,
    };
  }

  private getValueByPath(object: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = object;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (typeof current !== 'object') {
        return undefined;
      }

      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private objectContains(object: Record<string, unknown>, subset: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(subset)) {
      if (!(key in object)) {
        return false;
      }

      if (typeof value === 'object' && value !== null) {
        if (typeof object[key] !== 'object' || object[key] === null) {
          return false;
        }

        if (!this.objectContains(object[key] as Record<string, unknown>, value as Record<string, unknown>)) {
          return false;
        }
      } else if (object[key] !== value) {
        return false;
      }
    }

    return true;
  }

  private deepEquals(a: unknown, b: unknown): boolean {
    if (a === b) {
      return true;
    }

    if (typeof a !== typeof b) {
      return false;
    }

    if (a === null || b === null) {
      return a === b;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) {
        return false;
      }

      return a.every((item, i) => this.deepEquals(item, b[i]));
    }

    if (typeof a === 'object' && typeof b === 'object') {
      const aObject = a as Record<string, unknown>;
      const bObject = b as Record<string, unknown>;
      const aKeys = Object.keys(aObject);
      const bKeys = Object.keys(bObject);
      if (aKeys.length !== bKeys.length) {
        return false;
      }

      return aKeys.every(key => this.deepEquals(aObject[key], bObject[key]));
    }

    return false;
  }
}

export const n8nEvalRunner = new N8nEvalRunner();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function hasNonEmptyRecord(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length > 0;
}

/**
 * An n8n-eval test must declare at least one assertion. Without this guard,
 * `expected_output: {}` returns `status: 'passed'` regardless of workflow
 * outcome.
 */
function hasN8nEvalAssertion(expected: N8nEvalExpectedOutput): boolean {
  return typeof expected.execution_status === 'string'
    || typeof expected.min_score === 'number'
    || hasNonEmptyRecord(expected.output_contains)
    || hasNonEmptyArray(expected.nodes_executed)
    || typeof expected.max_execution_time_ms === 'number'
    || hasNonEmptyArray(expected.custom_assertions);
}

function validateStringArray(value: unknown, label: string, errors: string[]): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    errors.push(`expected_output.${label} must be an array of non-empty strings`);
    return;
  }

  for (const [index, item] of value.entries()) {
    if (typeof item !== 'string' || item.trim() === '') {
      errors.push(`expected_output.${label}[${index}] must be a non-empty string`);
    }
  }
}

/**
 * Catch malformed expected_output before execution so a misconfig surfaces
 * as a validation error instead of a confusing assertion failure. Mirrors
 * the webhook-runner and mcp-runner patterns.
 */
function validateN8nEvalExpectedOutput(expected: unknown, errors: string[]): void {
  if (expected === undefined) {
    return;
  }

  if (!isRecord(expected)) {
    errors.push('expected_output must be an object');
    return;
  }

  if (
    expected.execution_status !== undefined
    && expected.execution_status !== 'success'
    && expected.execution_status !== 'error'
  ) {
    errors.push('expected_output.execution_status must be \'success\' or \'error\' when present');
  }

  if (
    expected.min_score !== undefined
    && (typeof expected.min_score !== 'number'
      || !Number.isFinite(expected.min_score)
      || expected.min_score < 0
      || expected.min_score > 100)
  ) {
    errors.push('expected_output.min_score must be a finite number between 0 and 100');
  }

  if (expected.output_contains !== undefined && !isRecord(expected.output_contains)) {
    errors.push('expected_output.output_contains must be an object when present');
  }

  validateStringArray(expected.nodes_executed, 'nodes_executed', errors);

  if (
    expected.max_execution_time_ms !== undefined
    && (typeof expected.max_execution_time_ms !== 'number'
      || !Number.isFinite(expected.max_execution_time_ms)
      || expected.max_execution_time_ms < 0)
  ) {
    errors.push('expected_output.max_execution_time_ms must be a non-negative finite number');
  }

  if (expected.custom_assertions !== undefined) {
    if (!Array.isArray(expected.custom_assertions)) {
      errors.push('expected_output.custom_assertions must be an array of {name, path, expected} entries');
      return;
    }

    for (const [index, assertion] of expected.custom_assertions.entries()) {
      if (!isRecord(assertion)) {
        errors.push(`expected_output.custom_assertions[${index}] must be an object`);
        continue;
      }

      if (typeof assertion.name !== 'string' || assertion.name.trim() === '') {
        errors.push(`expected_output.custom_assertions[${index}].name must be a non-empty string`);
      }

      if (typeof assertion.path !== 'string' || assertion.path.trim() === '') {
        errors.push(`expected_output.custom_assertions[${index}].path must be a non-empty string`);
      }
    }
  }
}
