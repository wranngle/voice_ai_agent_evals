/**
 * ElevenLabs Runner — Tool execution tests.
 *
 * Sibling file to elevenlabs-runner.test.ts; carved out so each
 * suite stays under the per-file size cap. Same describe hierarchy.
 */

import {
  describe, expect, test, beforeEach, vi, afterEach,
} from 'vitest';
import {ElevenLabsRunner} from '../../lib/testing/runners/elevenlabs-runner';
import type {TestCase} from '../../lib/testing/types';

describe('ElevenLabs Runner', () => {
  describe('Execution (tools)', () => {
    let runner: ElevenLabsRunner;

    beforeEach(() => {
      runner = new ElevenLabsRunner('test-api-key');
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    test('should not count emitted-but-unexecuted tool calls as successful calls', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  type: 'client',
                  request_id: 'redirectToDocs_123',
                  tool_name: 'redirectToDocs',
                  params_as_json: '{"path":"/docs/api-reference/introduction"}',
                  tool_has_been_called: false,
                  tool_details: null,
                },
              ],
              tool_results: [],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017A',
        type: 'elevenlabs',
        name: 'Unexecuted tool call',
        description: 'Tool intent without execution evidence must not satisfy expected_tool_calls',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Send me the docs.',
        },
        expected_output: {
          expected_tool_calls: ['redirectToDocs'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBe(1);
      expect(result.actual_output.tool_calls).toEqual([]);
      expect(result.actual_output.emitted_tool_calls).toEqual(['redirectToDocs']);
      expect(result.error_message).toContain('only emitted it without execution evidence');
    });

    test('should count tool_results as execution evidence for expected tool calls', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  type: 'client',
                  request_id: 'redirectToDocs_456',
                  tool_name: 'redirectToDocs',
                  params_as_json: '{"path":"/docs/api-reference/introduction"}',
                  tool_has_been_called: false,
                },
              ],
            },
            {
              role: 'agent',
              message: null,
              tool_results: [
                {
                  type: 'client',
                  request_id: 'redirectToDocs_456',
                  tool_name: 'redirectToDocs',
                  result_value: 'Tool Called.',
                  is_error: false,
                  tool_has_been_called: true,
                  tool_latency_secs: 0.25,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017B',
        type: 'elevenlabs',
        name: 'Tool result execution evidence',
        description: 'Tool results should satisfy expected_tool_calls',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Send me the docs.',
        },
        expected_output: {
          expected_tool_calls: ['redirectToDocs'],
          tool_call_latency_max_ms: {
            redirectToDocs: 300,
          },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBe(4);
      expect(result.actual_output.tool_calls).toEqual(['redirectToDocs']);
      expect(result.actual_output.tool_events).toMatchObject([
        {
          name: 'redirectToDocs',
          emitted: true,
          called: true,
          result_received: true,
          failed: false,
          latency_ms: 250,
        },
      ]);
    });

    test('should fail expected tool calls when tool_results have no emitted call evidence', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_results: [
                {
                  request_id: 'lookup_record_result_only',
                  tool_name: 'lookup_record',
                  result_value: '{"status":"found"}',
                  is_error: false,
                  tool_has_been_called: true,
                  tool_latency_secs: 0.1,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017B1',
        type: 'elevenlabs',
        name: 'Result-only tool trace',
        description: 'Expected tool calls require emitted tool_calls evidence plus matching tool_results',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Look me up.',
        },
        expected_output: {
          expected_tool_calls: ['lookup_record'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(2);
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('tool_calls evidence');
      expect(result.actual_output.tool_events).toMatchObject([
        {
          name: 'lookup_record',
          emitted: false,
          called: true,
          result_received: true,
          latency_ms: 100,
        },
      ]);
    });

    test('should fail expected tool calls when a duplicate emitted call never executes', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  request_id: 'lookup_record_ok',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":"+15550100"}',
                  tool_has_been_called: false,
                },
                {
                  request_id: 'lookup_record_dropped',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":"+15550101"}',
                  tool_has_been_called: false,
                },
              ],
            },
            {
              role: 'agent',
              message: null,
              tool_results: [
                {
                  request_id: 'lookup_record_ok',
                  tool_name: 'lookup_record',
                  result_value: '{"status":"found"}',
                  is_error: false,
                  tool_has_been_called: true,
                  tool_latency_secs: 0.2,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017B2',
        type: 'elevenlabs',
        name: 'Duplicate unresolved tool emission',
        description: 'One successful call must not hide another emitted call that never executed',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Look up both records.',
        },
        expected_output: {
          expected_tool_calls: ['lookup_record'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(3);
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('lookup_record_dropped');
      expect(result.error_message).toContain('never returned execution evidence');
      expect(result.actual_output.tool_events).toMatchObject([
        {
          name: 'lookup_record',
          request_id: 'lookup_record_ok',
          emitted: true,
          called: true,
          result_received: true,
        },
        {
          name: 'lookup_record',
          request_id: 'lookup_record_dropped',
          emitted: true,
          called: false,
          result_received: false,
        },
      ]);
    });

    test('should fail expected tool calls when tool_results report execution error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  request_id: 'lookup_record_500',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":"+15550100"}',
                  tool_has_been_called: true,
                },
              ],
              tool_results: [
                {
                  request_id: 'lookup_record_500',
                  tool_name: 'lookup_record',
                  result_value: '{"error":"crm unavailable"}',
                  is_error: true,
                  tool_has_been_called: true,
                  tool_latency_secs: 0.12,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017C',
        type: 'elevenlabs',
        name: 'Tool result execution error',
        description: 'A fast tool result is still a failed expected tool call when ElevenLabs reports is_error',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Look me up.',
        },
        expected_output: {
          expected_tool_calls: ['lookup_record'],
          tool_call_latency_max_ms: {
            lookup_record: 500,
          },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(3);
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('tool_results returned is_error: true');
      expect(result.actual_output.tool_events).toMatchObject([
        {
          name: 'lookup_record',
          errored: true,
          called: true,
          result_received: true,
          failed: true,
          latency_ms: 120,
        },
      ]);
    });

    test('should fail expected tool calls when ElevenLabs reports a blocked tool result', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  request_id: 'lookup_record_blocked',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":"+15550100"}',
                  tool_has_been_called: true,
                },
              ],
              tool_results: [
                {
                  request_id: 'lookup_record_blocked',
                  tool_name: 'lookup_record',
                  result_value: '{"error":"request blocked"}',
                  is_error: false,
                  is_blocked: true,
                  error_type: 'webhook_auth',
                  raw_error_message: 'signature rejected',
                  tool_has_been_called: true,
                  tool_latency_secs: 0.05,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017F',
        type: 'elevenlabs',
        name: 'Blocked tool result',
        description: 'A blocked tool result is a failed downstream integration even when is_error is false',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Look me up.',
        },
        expected_output: {
          expected_tool_calls: ['lookup_record'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(2);
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('is_blocked: true');
      expect(result.error_message).toContain('webhook_auth');
      expect(result.error_message).toContain('signature rejected');
      expect(result.actual_output.tool_events).toMatchObject([
        {
          name: 'lookup_record',
          errored: false,
          blocked: true,
          called: true,
          result_received: true,
          failed: true,
          latency_ms: 50,
        },
      ]);
    });

    test('should fail expected tool calls when tool_results carry error details without is_error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  request_id: 'lookup_record_error_details',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":"+15550100"}',
                  tool_has_been_called: true,
                },
              ],
              tool_results: [
                {
                  request_id: 'lookup_record_error_details',
                  tool_name: 'lookup_record',
                  result_value: '{"error":"crm unavailable"}',
                  error_type: 'webhook_500',
                  raw_error_message: 'CRM returned HTTP 500',
                  tool_has_been_called: true,
                  tool_latency_secs: 0.08,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017F1',
        type: 'elevenlabs',
        name: 'Tool error details without boolean',
        description: 'Tool result error fields are failure evidence even when is_error is absent',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Look me up.',
        },
        expected_output: {
          expected_tool_calls: ['lookup_record'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(2);
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('webhook_500');
      expect(result.error_message).toContain('CRM returned HTTP 500');
      expect(result.actual_output.tool_events).toMatchObject([
        {
          name: 'lookup_record',
          called: true,
          result_received: true,
          failed: true,
          error_type: 'webhook_500',
          raw_error_message: 'CRM returned HTTP 500',
          latency_ms: 80,
        },
      ]);
    });

    test('should fail when paired tool call and result disagree about execution', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  request_id: 'lookup_record_conflict',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":"+15550100"}',
                  tool_has_been_called: true,
                },
              ],
            },
            {
              role: 'agent',
              message: null,
              tool_results: [
                {
                  request_id: 'lookup_record_conflict',
                  tool_name: 'lookup_record',
                  result_value: '{"status":"ok"}',
                  is_error: false,
                  tool_has_been_called: false,
                  tool_latency_secs: 0.1,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017F2',
        type: 'elevenlabs',
        name: 'Contradictory tool execution evidence',
        description: 'tool_results cannot mark a paired executed tool call as uncalled',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Look me up.',
        },
        expected_output: {
          expected_tool_calls: ['lookup_record'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(2);
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('tool_called_evidence_conflict');
      expect(result.error_message).toContain('tool_has_been_called=false');
      expect(result.actual_output.tool_events).toMatchObject([
        {
          name: 'lookup_record',
          request_id: 'lookup_record_conflict',
          emitted: true,
          called: true,
          result_received: true,
          failed: true,
          error_type: 'tool_called_evidence_conflict',
          latency_ms: 100,
        },
      ]);
    });

    test('should fail tool latency assertions when tool_results exceed budget', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_results: [
                {
                  request_id: 'lookup_record_789',
                  tool_name: 'lookup_record',
                  result_value: '{"status":"ok"}',
                  is_error: false,
                  tool_has_been_called: true,
                  tool_latency_secs: 2.75,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017D',
        type: 'elevenlabs',
        name: 'Tool latency budget failure',
        description: 'Tool latency budget should fail on slow tool result',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Look me up.',
        },
        expected_output: {
          tool_call_latency_max_ms: {
            lookup_record: 2000,
          },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('latency <= 2000ms');
      expect(result.error_message).toContain('2750ms');
    });

    test('should fail a latency budget when the tool was never called', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'Can you look me up?'},
            {role: 'agent', message: 'I need your phone number first.'},
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017G',
        type: 'elevenlabs',
        name: 'Missing budgeted tool call',
        description: 'A latency budget is a tool execution expectation, not an optional metric',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Can you look me up?',
        },
        expected_output: {
          tool_call_latency_max_ms: {
            lookup_record: 2000,
          },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('Expected tool "lookup_record" to be called before checking latency');
    });

    test('should fail a latency-budgeted tool when tool_results report execution error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_results: [
                {
                  request_id: 'lookup_record_budget_error',
                  tool_name: 'lookup_record',
                  result_value: '{"error":"crm unavailable"}',
                  is_error: true,
                  tool_has_been_called: true,
                  tool_latency_secs: 0.1,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017H',
        type: 'elevenlabs',
        name: 'Budgeted tool execution error',
        description: 'Latency-only tool checks must still catch downstream execution errors',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Look me up.',
        },
        expected_output: {
          tool_call_latency_max_ms: {
            lookup_record: 2000,
          },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(1);
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('tool_results returned is_error: true');
    });

    test('should fail a latency budget when any matching tool call lacks latency evidence', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_results: [
                {
                  request_id: 'lookup_record_fast',
                  tool_name: 'lookup_record',
                  result_value: '{"status":"ok"}',
                  is_error: false,
                  tool_has_been_called: true,
                  tool_latency_secs: 0.1,
                },
                {
                  request_id: 'lookup_record_no_latency',
                  tool_name: 'lookup_record',
                  result_value: '{"status":"ok"}',
                  is_error: false,
                  tool_has_been_called: true,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017I',
        type: 'elevenlabs',
        name: 'Missing latency evidence',
        description: 'Every matching tool call must carry tool_latency_secs evidence',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Look me up twice.',
        },
        expected_output: {
          tool_call_latency_max_ms: {
            lookup_record: 2000,
          },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(1);
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('include latency evidence');
      expect(result.actual_output.tool_events).toHaveLength(2);
    });

    test('should not collapse repeated same-name tool results without request IDs', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_results: [
                {
                  tool_name: 'lookup_record',
                  result_value: '{"status":"slow"}',
                  is_error: false,
                  tool_has_been_called: true,
                  tool_latency_secs: 2.75,
                },
                {
                  tool_name: 'lookup_record',
                  result_value: '{"status":"fast"}',
                  is_error: false,
                  tool_has_been_called: true,
                  tool_latency_secs: 0.1,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017I2',
        type: 'elevenlabs',
        name: 'Repeated unkeyed tool results',
        description: 'Repeated tool_results without request IDs must not overwrite slower earlier calls',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Look up two records.',
        },
        expected_output: {
          tool_call_latency_max_ms: {
            lookup_record: 2000,
          },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(1);
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('got 2750ms');
      expect(result.actual_output.tool_events).toMatchObject([
        {
          name: 'lookup_record',
          result_received: true,
          latency_ms: 2750,
        },
        {
          name: 'lookup_record',
          result_received: true,
          latency_ms: 100,
        },
      ]);
    });

    test('should fail expected tool calls when any repeated tool result reports failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  request_id: 'lookup_record_ok',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":"+15550100"}',
                  tool_has_been_called: true,
                },
                {
                  request_id: 'lookup_record_failed',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":"+15550101"}',
                  tool_has_been_called: true,
                },
              ],
              tool_results: [
                {
                  request_id: 'lookup_record_ok',
                  tool_name: 'lookup_record',
                  result_value: '{"status":"ok"}',
                  is_error: false,
                  tool_has_been_called: true,
                  tool_latency_secs: 0.1,
                },
                {
                  request_id: 'lookup_record_failed',
                  tool_name: 'lookup_record',
                  result_value: '{"error":"crm unavailable"}',
                  is_error: true,
                  error_type: 'webhook_500',
                  tool_has_been_called: true,
                  tool_latency_secs: 0.2,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017J',
        type: 'elevenlabs',
        name: 'Repeated tool result failure',
        description: 'A later failed call must not be hidden by an earlier successful call',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Look up two records.',
        },
        expected_output: {
          expected_tool_calls: ['lookup_record'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(2);
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('webhook_500');
      expect(result.actual_output.tool_events).toHaveLength(2);
    });

    test('should fail when paired tool call and result names disagree', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  request_id: 'tool_request_mismatch',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":"+15550100"}',
                  tool_has_been_called: true,
                },
              ],
            },
            {
              role: 'agent',
              message: null,
              tool_results: [
                {
                  request_id: 'tool_request_mismatch',
                  tool_name: 'delete_account',
                  result_value: '{"status":"deleted"}',
                  is_error: false,
                  tool_has_been_called: true,
                  tool_latency_secs: 0.1,
                },
              ],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017J2',
        type: 'elevenlabs',
        name: 'Mismatched tool result name',
        description: 'Request-id pairing must not hide tool name mismatches',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Look me up.',
        },
        expected_output: {
          expected_tool_calls: ['lookup_record'],
          forbidden_tool_calls: ['delete_account'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(2);
      expect(result.assertions_failed).toBe(2);
      expect(result.error_message).toContain('tool_result_name_mismatch');
      expect(result.error_message).toContain('delete_account');
      expect(result.actual_output.tool_events).toMatchObject([
        {
          name: 'lookup_record',
          result_name: 'delete_account',
          emitted: true,
          called: true,
          result_received: true,
          failed: true,
          error_type: 'tool_result_name_mismatch',
          latency_ms: 100,
        },
      ]);
    });

    test('should send native simulation controls and normalize criteria result lists', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_url, init) => {
        if (typeof init?.body !== 'string') {
          throw new TypeError('Expected JSON request body');
        }

        const body = JSON.parse(init.body) as Record<string, unknown>;

        expect(body).toMatchObject({
          simulation_specification: {
            simulated_user_config: {
              first_message: 'I need to reschedule and I am frustrated.',
              language: 'en',
              disable_first_message_interruptions: false,
              prompt: {
                prompt: 'You are a disappointed caller who interrupts when ignored.',
                llm: 'gpt-4o',
                temperature: 0.4,
              },
            },
            dynamic_variables: {
              customer_name: 'Jane',
              high_value_account: true,
            },
            tool_mock_config: {
              lookup_record: {
                result_value: '{"status":"temporarily_unavailable"}',
                is_error: true,
              },
            },
            partial_conversation_history: [
              {role: 'user', message: 'I already called twice.'},
              {role: 'agent', message: 'I can help with that.'},
            ],
          },
          extra_evaluation_criteria: [
            {
              id: 'stayed_calm',
              name: 'Stayed calm',
              type: 'prompt',
              conversation_goal_prompt: 'The agent stayed calm and offered next steps.',
              use_knowledge_base: false,
            },
          ],
          new_turns_limit: 4,
        });

        return new Response(
          JSON.stringify({
            simulated_conversation: [
              {role: 'agent', message: null},
              {role: 'agent', message: 'I can still help you reschedule.'},
            ],
            analysis: {
              evaluation_criteria_results_list: [
                {
                  criteria_id: 'stayed_calm',
                  result: 'success',
                  rationale: 'The agent acknowledged the issue and offered next steps.',
                },
              ],
            },
          }),
          {status: 200},
        );
      });

      const testCase: TestCase = {
        test_id: 'TC-EL-018',
        type: 'elevenlabs',
        name: 'Native simulation controls',
        description: 'Test current simulate-conversation request controls',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'I need to reschedule and I am frustrated.',
          simulated_user_prompt: 'You are a disappointed caller who interrupts when ignored.',
          simulated_user_llm: 'gpt-4o',
          simulated_user_temperature: 0.4,
          disable_first_message_interruptions: false,
          dynamic_variables: {
            customer_name: 'Jane',
            high_value_account: true,
          },
          tool_mock_config: {
            lookup_record: {
              result_value: '{"status":"temporarily_unavailable"}',
              is_error: true,
            },
          },
          partial_conversation_history: [
            {role: 'user', message: 'I already called twice.'},
            {role: 'agent', message: 'I can help with that.'},
          ],
          max_turns: 4,
        },
        expected_output: {
          evaluation_criteria: [
            {
              name: 'Stayed calm',
              description: 'The agent stayed calm and offered next steps.',
            },
          ],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBe(1);
      expect(result.actual_output.agent_messages).toContain('reschedule');
    });
  });
});
