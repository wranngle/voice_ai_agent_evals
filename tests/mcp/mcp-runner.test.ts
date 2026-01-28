/**
 * MCP Runner Tests
 *
 * Tests for the MCP workflow test runner.
 */

import { describe, it, expect, test, beforeEach, vi, afterEach } from 'vitest';
import { McpRunner } from '../../lib/testing/runners/mcp-runner';
import type { TestCase } from '../../lib/testing/types';

describe('MCP Runner', () => {
  describe('Validation', () => {
    const runner = new McpRunner();

    test('should validate test case with all required fields', () => {
      const testCase: TestCase = {
        test_id: 'TC-MCP-001',
        type: 'mcp',
        name: 'Basic MCP test',
        description: 'Test MCP workflow execution',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'webhook',
          payload: { message: 'Hello' },
        },
        expected_output: {
          execution_status: 'success',
        },
        tags: ['smoke'],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should validate test case with manual trigger', () => {
      const testCase: TestCase = {
        test_id: 'TC-MCP-002',
        type: 'mcp',
        name: 'Manual trigger test',
        description: 'Test with manual trigger',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'manual',
          payload: { data: 'test' },
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should reject test case without workflow_id', () => {
      const testCase: TestCase = {
        test_id: 'TC-MCP-003',
        type: 'mcp',
        name: 'Missing workflow_id',
        description: 'Test without workflow_id',
        input: {
          trigger_type: 'webhook',
          payload: { test: true },
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing required field: workflow_id');
    });

    test('should reject test case without trigger_type', () => {
      const testCase: TestCase = {
        test_id: 'TC-MCP-004',
        type: 'mcp',
        name: 'Missing trigger_type',
        description: 'Test without trigger_type',
        input: {
          workflow_id: 'abc123',
          payload: { test: true },
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing required field: trigger_type');
    });

    test('should reject test case with invalid trigger_type', () => {
      const testCase: TestCase = {
        test_id: 'TC-MCP-005',
        type: 'mcp',
        name: 'Invalid trigger_type',
        description: 'Test with invalid trigger_type',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'invalid',
          payload: { test: true },
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain('Invalid trigger_type');
    });

    test('should reject test case without payload', () => {
      const testCase: TestCase = {
        test_id: 'TC-MCP-006',
        type: 'mcp',
        name: 'Missing payload',
        description: 'Test without payload',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'webhook',
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing required field: payload');
    });
  });

  describe('Execution', () => {
    let runner: McpRunner;

    beforeEach(() => {
      runner = new McpRunner('https://n8n.example.com/api/v1', 'test-api-key');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('should return error when API key is not configured', async () => {
      const runnerWithoutKey = new McpRunner('https://n8n.example.com/api/v1', '');

      const testCase: TestCase = {
        test_id: 'TC-MCP-007',
        type: 'mcp',
        name: 'No API key test',
        description: 'Test without API key',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'manual',
          payload: { test: true },
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runnerWithoutKey.execute(testCase);

      expect(result.status).toBe('error');
      expect(result.error_message).toContain('N8N_API_KEY');
    });

    test('should handle API error gracefully', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response('{"error": "Unauthorized"}', {
          status: 401,
          statusText: 'Unauthorized',
        })
      );

      const testCase: TestCase = {
        test_id: 'TC-MCP-008',
        type: 'mcp',
        name: 'API error test',
        description: 'Test API error handling',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'manual',
          payload: { test: true },
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('error');
      expect(result.error_message).toContain('401');
    });

    test('should handle network errors gracefully', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const testCase: TestCase = {
        test_id: 'TC-MCP-009',
        type: 'mcp',
        name: 'Network error test',
        description: 'Test network error handling',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'manual',
          payload: { test: true },
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('error');
      expect(result.error_message).toContain('Network error');
    });

    test('should execute workflow successfully with mocked API', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'exec_123',
            status: 'success',
            finished: true,
            data: {
              resultData: {
                runData: {
                  mcp_tool_node: [
                    {
                      data: {
                        main: [[{ json: { result: 'success', tool_name: 'test_tool' } }]],
                      },
                    },
                  ],
                },
                lastNodeExecuted: 'mcp_tool_node',
              },
            },
          }),
          { status: 200 }
        )
      );

      const testCase: TestCase = {
        test_id: 'TC-MCP-010',
        type: 'mcp',
        name: 'Successful execution',
        description: 'Test successful workflow execution',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'manual',
          payload: { input: 'test' },
        },
        expected_output: {
          execution_status: 'success',
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.actual_output.execution_id).toBe('exec_123');
      expect(result.actual_output.status).toBe('success');
    });

    test('should check expected_nodes assertion', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'exec_123',
            status: 'success',
            finished: true,
            data: {
              resultData: {
                runData: {
                  start: [{ data: { main: [[{ json: {} }]] } }],
                  mcp_tool: [{ data: { main: [[{ json: {} }]] } }],
                  output: [{ data: { main: [[{ json: {} }]] } }],
                },
                lastNodeExecuted: 'output',
              },
            },
          }),
          { status: 200 }
        )
      );

      const testCase: TestCase = {
        test_id: 'TC-MCP-011',
        type: 'mcp',
        name: 'Nodes executed test',
        description: 'Test expected nodes assertion',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'manual',
          payload: { input: 'test' },
        },
        expected_output: {
          expected_nodes: ['start', 'mcp_tool', 'output'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.actual_output.nodes_executed).toContain('start');
      expect(result.actual_output.nodes_executed).toContain('mcp_tool');
      expect(result.actual_output.nodes_executed).toContain('output');
    });

    test('should check mcp_tools_called assertion', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'exec_123',
            status: 'success',
            finished: true,
            data: {
              resultData: {
                runData: {
                  mcp_n8n_tool: [
                    {
                      data: {
                        main: [[{ json: { tool_name: 'n8n_tool' } }]],
                      },
                    },
                  ],
                  mcp_elevenlabs: [
                    {
                      data: {
                        main: [[{ json: { mcp_tool: 'elevenlabs_speak' } }]],
                      },
                    },
                  ],
                },
                lastNodeExecuted: 'mcp_elevenlabs',
              },
            },
          }),
          { status: 200 }
        )
      );

      const testCase: TestCase = {
        test_id: 'TC-MCP-012',
        type: 'mcp',
        name: 'MCP tools called test',
        description: 'Test MCP tools detection',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'manual',
          payload: { input: 'test' },
        },
        expected_output: {
          mcp_tools_called: ['n8n', 'elevenlabs'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.actual_output.mcp_tools_called).toBeDefined();
    });

    test('should check expected_output assertion', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'exec_123',
            status: 'success',
            finished: true,
            data: {
              resultData: {
                runData: {
                  output: [
                    {
                      data: {
                        main: [[{ json: { status: 'ok', count: 5 } }]],
                      },
                    },
                  ],
                },
                lastNodeExecuted: 'output',
              },
            },
          }),
          { status: 200 }
        )
      );

      const testCase: TestCase = {
        test_id: 'TC-MCP-013',
        type: 'mcp',
        name: 'Expected output test',
        description: 'Test expected output assertion',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'manual',
          payload: { input: 'test' },
        },
        expected_output: {
          expected_output: { output: { status: 'ok' } },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
    });

    test('should check max_execution_time_ms assertion', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'exec_123',
            status: 'success',
            finished: true,
            data: {
              resultData: {
                runData: {},
              },
            },
          }),
          { status: 200 }
        )
      );

      const testCase: TestCase = {
        test_id: 'TC-MCP-014',
        type: 'mcp',
        name: 'Execution time test',
        description: 'Test execution time assertion',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'manual',
          payload: { input: 'test' },
        },
        expected_output: {
          max_execution_time_ms: 5000,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.latency_ms).toBeLessThanOrEqual(5000);
    });
  });

  describe('Webhook Execution', () => {
    let runner: McpRunner;

    beforeEach(() => {
      runner = new McpRunner('https://n8n.example.com/api/v1', 'test-api-key');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('should execute via webhook when trigger_type is webhook', async () => {
      // First fetch: get workflow details
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: 'abc123',
              name: 'Test Workflow',
              nodes: [
                {
                  type: 'n8n-nodes-base.webhook',
                  parameters: { path: 'test-webhook' },
                },
              ],
            }),
            { status: 200 }
          )
        )
        // Second fetch: webhook call
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ success: true, message: 'Webhook received' }),
            { status: 200 }
          )
        );

      const testCase: TestCase = {
        test_id: 'TC-MCP-015',
        type: 'mcp',
        name: 'Webhook execution test',
        description: 'Test webhook execution path',
        input: {
          workflow_id: 'abc123',
          trigger_type: 'webhook',
          payload: { input: 'test' },
        },
        expected_output: {
          execution_status: 'success',
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.actual_output.status).toBe('success');
    });
  });
});
