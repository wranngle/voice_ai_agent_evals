/**
 * MCP Test Runner
 *
 * Executes MCP (Model Context Protocol) workflow tests.
 * Tests n8n workflows that integrate with MCP tools.
 *
 * Supports:
 * - Webhook-triggered workflows
 * - Manual workflow triggering via n8n API
 * - MCP tool call verification
 */

import type {TestCase} from '../types';
import type {
  TestRunner,
  TestExecutionResult,
  RunOptions,
  McpTestConfig,
  AssertionResult,
} from './types';

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

/**
 * Expected output configuration for MCP tests
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

export class McpRunner implements TestRunner {
  readonly type = 'mcp' as const;
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(apiUrl?: string, apiKey?: string) {
    // Ensure API URL includes /api/v1 path
    let url = apiUrl || process.env.N8N_API_URL || 'https://your-n8n-host.example.com';
    if (!url.endsWith('/api/v1')) {
      url = url.replace(/\/$/, '') + '/api/v1';
    }

    this.apiUrl = url;
    this.apiKey = apiKey || process.env.N8N_API_KEY || '';
  }

  async execute(testCase: TestCase, options?: RunOptions): Promise<TestExecutionResult> {
    const config = testCase.input as unknown as McpTestConfig;
    const expected = testCase.expected_output as McpExpectedOutput;
    const timeout = options?.timeout || config.expected_execution_time_ms || DEFAULT_TIMEOUT;

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
        const actualStatus = this.determineExecutionStatus(executionResult);
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

      // Check expected nodes
      if (expected.expected_nodes && expected.expected_nodes.length > 0) {
        const executedNodes = this.getExecutedNodes(executionResult);
        assertions.push(this.assertNodesExecuted(executedNodes, expected.expected_nodes));
      }

      // Check MCP tools called
      if (expected.mcp_tools_called && expected.mcp_tools_called.length > 0) {
        const toolsCalled = this.getMcpToolsCalled(executionResult);
        assertions.push(this.assertMcpToolsCalled(toolsCalled, expected.mcp_tools_called));
      }

      // Check expected output
      if (expected.expected_output) {
        const output = this.extractOutput(executionResult);
        assertions.push(this.assertOutputContains(output, expected.expected_output));
      }

      // Calculate final results
      const assertionsPassed = assertions.filter(a => a.passed).length;
      const assertionsFailed = assertions.filter(a => !a.passed).length;
      const allPassed = assertionsFailed === 0;

      const executionStatus = this.determineExecutionStatus(executionResult);
      let finalStatus: 'passed' | 'failed' | 'error' = 'passed';
      if (executionStatus === 'error' && expected.execution_status !== 'error') {
        finalStatus = 'error';
      } else if (!allPassed) {
        finalStatus = 'failed';
      }

      return {
        status: finalStatus,
        actual_output: {
          execution_id: executionResult.id || executionResult.executionId,
          workflow_id: config.workflow_id,
          status: executionStatus,
          output: this.extractOutput(executionResult),
          nodes_executed: this.getExecutedNodes(executionResult),
          mcp_tools_called: this.getMcpToolsCalled(executionResult),
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
    const config = testCase.input as unknown as McpTestConfig;

    if (!config.workflow_id) {
      errors.push('Missing required field: workflow_id');
    }

    if (!config.trigger_type) {
      errors.push('Missing required field: trigger_type');
    } else if (!['webhook', 'manual'].includes(config.trigger_type)) {
      errors.push(`Invalid trigger_type: ${config.trigger_type} (must be 'webhook' or 'manual')`);
    }

    if (!config.payload) {
      errors.push('Missing required field: payload');
    }

    return {valid: errors.length === 0, errors};
  }

  /**
   * Execute an n8n workflow
   */
  private async executeWorkflow(
    config: McpTestConfig,
    timeout: number,
  ): Promise<Record<string, unknown>> {
    if (config.trigger_type === 'webhook') {
      return this.executeViaWebhook(config, timeout);
    }

    return this.executeViaApi(config, timeout);
  }

  /**
   * Execute workflow via webhook
   */
  private async executeViaWebhook(
    config: McpTestConfig,
    timeout: number,
  ): Promise<Record<string, unknown>> {
    // Get workflow details to find webhook path
    const workflowUrl = `${this.apiUrl}/workflows/${config.workflow_id}`;
    const workflowResponse = await fetch(workflowUrl, {
      headers: {'X-N8N-API-KEY': this.apiKey},
    });

    if (!workflowResponse.ok) {
      const errorText = await workflowResponse.text();
      throw new Error(`Failed to get workflow: ${workflowResponse.status} - ${errorText}`);
    }

    let workflow: Record<string, unknown>;
    const workflowText = await workflowResponse.text();
    try {
      workflow = JSON.parse(workflowText);
    } catch {
      throw new Error(`Failed to parse workflow JSON: ${workflowText.slice(0, 200)}`);
    }

    // Find webhook node
    const nodes = workflow.nodes as Array<{type: string; parameters?: {path?: string}; webhookId?: string}> | undefined;
    const webhookNode = nodes?.find(n => n.type === 'n8n-nodes-base.webhook');

    if (!webhookNode) {
      throw new Error('No webhook node found in workflow');
    }

    const webhookPath = webhookNode.parameters?.path || webhookNode.webhookId || config.workflow_id;
    const webhookUrl = `${this.apiUrl.replace('/api/v1', '')}/webhook/${webhookPath}`;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config.payload),
      signal: AbortSignal.timeout(timeout),
    });

    // Parse response regardless of status code
    let result: Record<string, unknown>;
    try {
      result = (await response.json()) as Record<string, unknown>;
    } catch {
      result = {_raw_response: await response.text()};
    }

    result._http_status = response.status;

    return {
      status: response.ok ? 'success' : 'error',
      finished: true,
      webhookResponse: result,
      data: {
        resultData: {
          runData: {
            webhook_output: [{data: {main: [[{json: result}]]}}],
          },
        },
      },
    };
  }

  /**
   * Execute workflow via n8n API (manual trigger)
   */
  private async executeViaApi(
    config: McpTestConfig,
    timeout: number,
  ): Promise<Record<string, unknown>> {
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

    const result = (await response.json()) as Record<string, unknown>;

    // If execution is async, poll for completion
    if (result.executionId && !result.finished) {
      return this.pollForCompletion(result.executionId as string, timeout);
    }

    return result;
  }

  /**
   * Poll for execution completion
   */
  private async pollForCompletion(
    executionId: string,
    timeout: number,
  ): Promise<Record<string, unknown>> {
    const startTime = Date.now();
    const pollInterval = 1000;

    while (Date.now() - startTime < timeout) {
      const url = `${this.apiUrl}/executions/${executionId}`;

      const response = await fetch(url, {
        headers: {'X-N8N-API-KEY': this.apiKey},
      });

      if (!response.ok) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        continue;
      }

      const execution = (await response.json()) as Record<string, unknown>;

      if (execution.finished || execution.status === 'success' || execution.status === 'error') {
        return execution;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Execution ${executionId} did not complete within ${timeout}ms`);
  }

  /**
   * Determine execution status from result
   */
  private determineExecutionStatus(result: Record<string, unknown>): 'success' | 'error' {
    if (result.status === 'error') {
      return 'error';
    }

    if ((result.data as {resultData?: {error?: unknown}})?.resultData?.error) {
      return 'error';
    }

    return 'success';
  }

  /**
   * Extract output from execution result
   */
  private extractOutput(result: Record<string, unknown>): Record<string, unknown> {
    const data = result.data as {resultData?: {runData?: Record<string, unknown[]>}};
    const runData = data?.resultData?.runData;
    if (!runData) {
      return {};
    }

    const output: Record<string, unknown> = {};
    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      const firstRun = nodeRuns[0] as {
        data?: {main?: Array<Array<{json: Record<string, unknown>}>>};
      };
      if (firstRun?.data?.main?.[0]?.[0]?.json) {
        output[nodeName] = firstRun.data.main[0][0].json;
      }
    }

    return output;
  }

  /**
   * Get list of executed nodes
   */
  private getExecutedNodes(result: Record<string, unknown>): string[] {
    const data = result.data as {resultData?: {runData?: Record<string, unknown>}};
    const runData = data?.resultData?.runData;
    if (!runData) {
      return [];
    }

    return Object.keys(runData);
  }

  /**
   * Get MCP tools that were called during execution
   */
  private getMcpToolsCalled(result: Record<string, unknown>): string[] {
    const executedNodes = this.getExecutedNodes(result);
    const output = this.extractOutput(result);

    // Look for MCP tool patterns in node names and output
    const mcpTools: string[] = [];

    // Check for MCP-related nodes
    for (const nodeName of executedNodes) {
      if (
        nodeName.toLowerCase().includes('mcp')
        || nodeName.toLowerCase().includes('tool')
      ) {
        mcpTools.push(nodeName);
      }
    }

    // Check output for tool call indicators
    for (const [nodeName, nodeOutput] of Object.entries(output)) {
      const outputObject = nodeOutput as Record<string, unknown>;
      if ((
        outputObject?.tool_name
        || outputObject?.mcp_tool
        || outputObject?.toolCalls
      ) && !mcpTools.includes(nodeName)) {
        mcpTools.push(nodeName);
      }
    }

    return mcpTools;
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

  private assertNodesExecuted(actual: string[], expected: string[]): AssertionResult {
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

  private assertMcpToolsCalled(actual: string[], expected: string[]): AssertionResult {
    const missing = expected.filter(t => !actual.some(a => a.includes(t) || t.includes(a)));
    const passed = missing.length === 0;
    return {
      name: 'mcp_tools_called',
      passed,
      expected,
      actual,
      message: passed ? undefined : `Missing expected MCP tools: ${missing.join(', ')}`,
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
}

export const mcpRunner = new McpRunner();
