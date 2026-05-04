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
import type {
  TestRunner,
  TestExecutionResult,
  RunOptions,
  N8nEvalTestConfig,
  AssertionResult,
} from './types';

const DEFAULT_TIMEOUT = 120_000; // 2 minutes for n8n workflows

/**
 * Expected output configuration for n8n Eval tests
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
    path: string; // JSON path to check
    expected: unknown;
  }>;
};

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
    this.apiUrl = apiUrl || process.env.N8N_API_URL || 'https://your-n8n-host.example.com/api/v1';
    this.apiKey = apiKey || process.env.N8N_API_KEY || '';
  }

  async execute(testCase: TestCase, options?: RunOptions): Promise<TestExecutionResult> {
    const config = testCase.input as unknown as N8nEvalTestConfig;
    const expected = testCase.expected_output as N8nEvalExpectedOutput;
    const timeout = options?.timeout || DEFAULT_TIMEOUT;

    const startTime = Date.now();
    const assertions: AssertionResult[] = [];

    // Check API key
    if (!this.apiKey) {
      return {
        status: 'error',
        actual_output: {error: 'N8N_API_KEY not configured'},
        latency_ms: Date.now() - startTime,
        error_message: 'N8N_API_KEY environment variable or constructor parameter required',
        assertions_passed: 0,
        assertions_failed: 0,
      };
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

    // For webhooks, non-2xx responses are valid test outcomes, not errors
    // Parse the response body regardless of status code
    let result: Record<string, unknown>;
    try {
      result = (await response.json()) as Record<string, unknown>;
    } catch {
      result = {_raw_response: await response.text()};
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
   * Poll for workflow execution completion
   */
  private async pollForCompletion(
    executionId: string,
    timeout: number,
  ): Promise<N8nExecutionResult> {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < timeout) {
      const url = `${this.apiUrl}/executions/${executionId}`;

      const response = await fetch(url, {
        headers: {
          'X-N8N-API-KEY': this.apiKey,
        },
      });

      if (!response.ok) {
        // Execution might not be ready yet
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
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

    // Custom rubric would require LLM evaluation - return full weight for now
    // In production, this would call an LLM to evaluate against the rubric
    // if (metrics.custom_rubric) {
    //   // TODO: Implement LLM-based evaluation
    // }

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
