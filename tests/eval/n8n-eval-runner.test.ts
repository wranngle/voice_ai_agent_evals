/**
 * n8n Eval Runner Tests
 *
 * Tests for the n8n workflow evaluation test runner.
 */

import { describe, it, expect, test, beforeEach, vi, afterEach } from 'vitest';
import { N8nEvalRunner } from '../../lib/testing/runners/n8n-eval-runner';
import type { TestCase } from '../../lib/testing/types';

describe('n8n Eval Runner', () => {
  describe('Validation', () => {
    const runner = new N8nEvalRunner();

    test('should validate test case with workflow_id and payload', () => {
      const testCase: TestCase = {
        test_id: 'TC-N8N-001',
        type: 'n8n-eval',
        name: 'Basic workflow test',
        description: 'Test workflow execution',
        input: {
          workflow_id: 'abc123',
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

    test('should validate test case with webhook_path', () => {
      const testCase: TestCase = {
        test_id: 'TC-N8N-002',
        type: 'n8n-eval',
        name: 'Webhook workflow test',
        description: 'Test workflow via webhook',
        input: {
          workflow_id: 'abc123',
          webhook_path: 'test-webhook',
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
        test_id: 'TC-N8N-003',
        type: 'n8n-eval',
        name: 'Missing workflow_id',
        description: 'Test without workflow_id',
        input: {
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

    test('should reject test case without payload', () => {
      const testCase: TestCase = {
        test_id: 'TC-N8N-004',
        type: 'n8n-eval',
        name: 'Missing payload',
        description: 'Test without payload',
        input: {
          workflow_id: 'abc123',
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
    let runner: N8nEvalRunner;

    beforeEach(() => {
      runner = new N8nEvalRunner('https://n8n.example.com/api/v1', 'test-api-key');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('should return error when API key is not configured', async () => {
      const runnerWithoutKey = new N8nEvalRunner('https://n8n.example.com/api/v1', '');

      const testCase: TestCase = {
        test_id: 'TC-N8N-005',
        type: 'n8n-eval',
        name: 'No API key test',
        description: 'Test without API key',
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
        test_id: 'TC-N8N-006',
        type: 'n8n-eval',
        name: 'API error test',
        description: 'Test API error handling',
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

      const result = await runner.execute(testCase);

      expect(result.status).toBe('error');
      expect(result.error_message).toContain('401');
    });

    test('should handle network errors gracefully', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const testCase: TestCase = {
        test_id: 'TC-N8N-007',
        type: 'n8n-eval',
        name: 'Network error test',
        description: 'Test network error handling',
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
                  output_node: [
                    {
                      data: {
                        main: [[{ json: { result: 'success', value: 42 } }]],
                      },
                    },
                  ],
                },
                lastNodeExecuted: 'output_node',
              },
            },
          }),
          { status: 200 }
        )
      );

      const testCase: TestCase = {
        test_id: 'TC-N8N-008',
        type: 'n8n-eval',
        name: 'Successful workflow',
        description: 'Test successful workflow execution',
        input: {
          workflow_id: 'abc123',
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

    test('should check output_contains assertion', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'exec_123',
            status: 'success',
            finished: true,
            data: {
              resultData: {
                runData: {
                  output_node: [
                    {
                      data: {
                        main: [[{ json: { result: 'success', value: 42 } }]],
                      },
                    },
                  ],
                },
                lastNodeExecuted: 'output_node',
              },
            },
          }),
          { status: 200 }
        )
      );

      const testCase: TestCase = {
        test_id: 'TC-N8N-009',
        type: 'n8n-eval',
        name: 'Output contains test',
        description: 'Test output contains assertion',
        input: {
          workflow_id: 'abc123',
          payload: { input: 'test' },
        },
        expected_output: {
          execution_status: 'success',
          output_contains: { result: 'success' },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBeGreaterThan(0);
    });

    test('should fail when execution_status does not match', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'exec_123',
            status: 'success',
            finished: true,
            data: {
              resultData: {
                runData: {},
                lastNodeExecuted: 'node1',
              },
            },
          }),
          { status: 200 }
        )
      );

      const testCase: TestCase = {
        test_id: 'TC-N8N-010',
        type: 'n8n-eval',
        name: 'Status mismatch test',
        description: 'Test expecting error status',
        input: {
          workflow_id: 'abc123',
          payload: { input: 'test' },
        },
        expected_output: {
          execution_status: 'error', // Expecting error but got success
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('execution status');
    });

    test('should check nodes_executed assertion', async () => {
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
                  process: [{ data: { main: [[{ json: {} }]] } }],
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
        test_id: 'TC-N8N-011',
        type: 'n8n-eval',
        name: 'Nodes executed test',
        description: 'Test nodes executed assertion',
        input: {
          workflow_id: 'abc123',
          payload: { input: 'test' },
        },
        expected_output: {
          nodes_executed: ['start', 'process', 'output'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.actual_output.nodes_executed).toContain('start');
      expect(result.actual_output.nodes_executed).toContain('process');
      expect(result.actual_output.nodes_executed).toContain('output');
    });

    test('should fail when expected nodes are missing', async () => {
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
                },
                lastNodeExecuted: 'start',
              },
            },
          }),
          { status: 200 }
        )
      );

      const testCase: TestCase = {
        test_id: 'TC-N8N-012',
        type: 'n8n-eval',
        name: 'Missing nodes test',
        description: 'Test missing nodes detection',
        input: {
          workflow_id: 'abc123',
          payload: { input: 'test' },
        },
        expected_output: {
          nodes_executed: ['start', 'process', 'output'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.error_message).toContain('Missing expected nodes');
      expect(result.error_message).toContain('process');
    });

    test('should check custom assertions', async () => {
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
                        main: [
                          [
                            {
                              json: {
                                user: {
                                  name: 'John',
                                  age: 30,
                                },
                                status: 'active',
                              },
                            },
                          ],
                        ],
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
        test_id: 'TC-N8N-013',
        type: 'n8n-eval',
        name: 'Custom assertion test',
        description: 'Test custom JSON path assertions',
        input: {
          workflow_id: 'abc123',
          payload: { input: 'test' },
        },
        expected_output: {
          custom_assertions: [
            { name: 'user_name', path: 'user.name', expected: 'John' },
            { name: 'status', path: 'status', expected: 'active' },
          ],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBe(2);
    });

    test('should evaluate minimum score', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'exec_123',
            status: 'success',
            finished: true,
            data: {
              resultData: {
                runData: {
                  output: [{ data: { main: [[{ json: { result: 'ok' } }]] } }],
                },
                lastNodeExecuted: 'output',
              },
            },
          }),
          { status: 200 }
        )
      );

      const testCase: TestCase = {
        test_id: 'TC-N8N-014',
        type: 'n8n-eval',
        name: 'Score evaluation test',
        description: 'Test score calculation',
        input: {
          workflow_id: 'abc123',
          payload: { input: 'test' },
          eval_metrics: {
            correctness_weight: 0.5,
            helpfulness_weight: 0.5,
          },
        },
        expected_output: {
          min_score: 80,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.actual_output.score).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Webhook Execution', () => {
    let runner: N8nEvalRunner;

    beforeEach(() => {
      runner = new N8nEvalRunner('https://n8n.example.com/api/v1', 'test-api-key');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    test('should execute via webhook when webhook_path is provided', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: 'webhook response' }), {
          status: 200,
        })
      );

      const testCase: TestCase = {
        test_id: 'TC-N8N-015',
        type: 'n8n-eval',
        name: 'Webhook execution test',
        description: 'Test webhook execution path',
        input: {
          workflow_id: 'abc123',
          webhook_path: 'test-webhook',
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

      // Verify webhook URL was called
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/webhook/test-webhook'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ input: 'test' }),
        })
      );
    });
  });
});
