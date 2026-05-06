/**
 * ElevenLabs Runner — Execution tests (basic + criteria).
 *
 * Sibling file to elevenlabs-runner.test.ts; carved out so each
 * suite stays under the per-file size cap. Tool-call execution
 * tests live in elevenlabs-runner-tools.test.ts.
 */

import {
  describe, expect, test, beforeEach, vi, afterEach,
} from 'vitest';
import {ElevenLabsRunner} from '../../lib/testing/runners/elevenlabs-runner';
import type {TestCase} from '../../lib/testing/types';

describe('ElevenLabs Runner', () => {
  describe('Execution', () => {
    let runner: ElevenLabsRunner;

    beforeEach(() => {
      runner = new ElevenLabsRunner('test-api-key');
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
    });

    test('should return error when API key is not configured', async () => {
      vi.stubEnv('ELEVENLABS_API_KEY', '');
      const runnerWithoutKey = new ElevenLabsRunner();

      const testCase: TestCase = {
        test_id: 'TC-EL-005',
        type: 'elevenlabs',
        name: 'No API key test',
        description: 'Test without API key',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runnerWithoutKey.execute(testCase);

      expect(result.status).toBe('error');
      expect(result.error_message).toContain('ELEVENLABS_API_KEY');
    });

    test('should handle API error gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{"error": "Unauthorized"}', {
        status: 401,
        statusText: 'Unauthorized',
      }));

      const testCase: TestCase = {
        test_id: 'TC-EL-006',
        type: 'elevenlabs',
        name: 'API error test',
        description: 'Test API error handling',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
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
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const testCase: TestCase = {
        test_id: 'TC-EL-007',
        type: 'elevenlabs',
        name: 'Network error test',
        description: 'Test network error handling',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
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

    test('should execute test successfully with mocked simulate-conversation API', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'Hello, I need help'},
            {role: 'agent', message: 'Hi there! Welcome. How can I help you today?'},
          ],
          analysis: {
            overall_passed: true,
            conversation_summary: 'Agent greeted user properly',
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-008',
        type: 'elevenlabs',
        name: 'Successful test',
        description: 'Test successful execution',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello, I need help',
        },
        expected_output: {
          response_contains: ['welcome'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBeGreaterThan(0);
      expect(result.dimensions).toContainEqual(expect.objectContaining({
        name: 'response_contains:welcome',
        status: 'passed',
        score: 1,
        detail: expect.stringContaining('actual found'),
      }));
    });

    test('should fail when response_contains assertion is not met', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'Hello'},
            {role: 'agent', message: 'Hi there! How can I help?'},
          ],
          analysis: {
            overall_passed: true,
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-009',
        type: 'elevenlabs',
        name: 'Missing keyword test',
        description: 'Test when expected keyword is missing',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          response_contains: ['schedule', 'appointment'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBe(2);
      expect(result.error_message).toContain('schedule');
      expect(result.dimensions).toContainEqual(expect.objectContaining({
        name: 'response_contains:schedule',
        status: 'failed',
        score: 0,
        detail: 'Expected agent response to contain "schedule"',
      }));
    });

    test('should check response_not_contains assertion', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'agent', message: 'I cannot help with that request.'},
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-010',
        type: 'elevenlabs',
        name: 'Forbidden words test',
        description: 'Test response does not contain forbidden words',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          response_not_contains: ['sorry', 'apologize'],
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

    test('should check expected_tool_calls assertion', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'Schedule a demo for tomorrow'},
            {
              role: 'agent',
              message: 'I can help you schedule that.',
              tool_calls: [
                {
                  request_id: 'schedule_appointment_123',
                  tool_name: 'schedule_appointment',
                  params_as_json: '{"date":"tomorrow"}',
                  tool_has_been_called: true,
                },
              ],
              tool_results: [
                {
                  request_id: 'schedule_appointment_123',
                  tool_name: 'schedule_appointment',
                  result_value: '{"status":"scheduled"}',
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
        test_id: 'TC-EL-011',
        type: 'elevenlabs',
        name: 'Tool calls test',
        description: 'Test expected tool calls',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Schedule a demo for tomorrow',
        },
        expected_output: {
          expected_tool_calls: ['schedule_appointment'],
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

    test('should fail expected_tool_calls when execution has no tool_results evidence', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  request_id: 'lookup_record_called_no_result',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":"+15550100"}',
                  tool_has_been_called: true,
                },
              ],
              tool_results: [],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-011R',
        type: 'elevenlabs',
        name: 'Missing tool result evidence',
        description: 'Executed tool calls still need tool_results evidence to prove downstream completion',
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
      expect(result.assertions_passed).toBe(1);
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('tool_results evidence');
      expect(result.actual_output.tool_events).toMatchObject([
        {
          name: 'lookup_record',
          emitted: true,
          called: true,
          result_received: false,
        },
      ]);
    });

    test('should fail expected tool calls when params_as_json is malformed', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  request_id: 'lookup_record_bad_params',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":',
                  tool_has_been_called: true,
                },
              ],
              tool_results: [
                {
                  request_id: 'lookup_record_bad_params',
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
        test_id: 'TC-EL-011P',
        type: 'elevenlabs',
        name: 'Malformed tool params JSON',
        description: 'Tool execution cannot be trusted when params_as_json is not parseable JSON',
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
      expect(result.error_message).toContain('params_as_json');
      expect(result.error_message).toContain('not valid JSON');
      expect(result.actual_output.tool_events).toMatchObject([
        {
          name: 'lookup_record',
          emitted: true,
          called: true,
          result_received: true,
          failed: true,
          error_type: 'tool_call_params_json_invalid',
          integrity_error: expect.stringContaining('lookup_record'),
        },
      ]);
    });

    test('should fail expected tool calls when params_as_json is not a JSON object', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  request_id: 'lookup_record_array_params',
                  tool_name: 'lookup_record',
                  params_as_json: '["+15550100"]',
                  tool_has_been_called: true,
                },
              ],
              tool_results: [
                {
                  request_id: 'lookup_record_array_params',
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
        test_id: 'TC-EL-011P2',
        type: 'elevenlabs',
        name: 'Non-object tool params JSON',
        description: 'Tool parameters must be object-shaped before schema or downstream checks can be trusted',
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
      expect(result.error_message).toContain('params_as_json');
      expect(result.error_message).toContain('expected a JSON object');
      expect(result.actual_output.tool_events).toMatchObject([
        {
          name: 'lookup_record',
          emitted: true,
          called: true,
          result_received: true,
          failed: true,
          error_type: 'tool_call_params_json_invalid',
          integrity_error: expect.stringContaining('decoded to array'),
        },
      ]);
    });

    test('should not count tool calls with missing execution evidence as successful calls', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              tool_calls: [
                {
                  request_id: 'lookup_record_missing_flag',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":"+15550100"}',
                },
              ],
              tool_results: [],
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-011A',
        type: 'elevenlabs',
        name: 'Missing tool execution evidence',
        description: 'Tool calls without tool_has_been_called=true or tool_results should stay emitted-only',
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
      expect(result.assertions_failed).toBe(1);
      expect(result.actual_output.tool_calls).toEqual([]);
      expect(result.actual_output.emitted_tool_calls).toEqual(['lookup_record']);
      expect(result.error_message).toContain('only emitted it without execution evidence');
    });

    test('should check forbidden_tool_calls assertion', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'agent', message: 'Let me help you with that.'},
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-012',
        type: 'elevenlabs',
        name: 'Forbidden tools test',
        description: 'Test forbidden tool calls',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          forbidden_tool_calls: ['delete_account', 'reset_password'],
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

    test('should check min_turns assertion', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'Hello'},
            {role: 'agent', message: 'Hi!'},
            {role: 'user', message: 'What services do you offer?'},
            {role: 'agent', message: 'We offer after-hours coverage.'},
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-013',
        type: 'elevenlabs',
        name: 'Min turns test',
        description: 'Test minimum conversation turns',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          min_turns: 3,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
    });

    test('should fail when min_turns not met', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'agent', message: 'Hello!'},
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-014',
        type: 'elevenlabs',
        name: 'Min turns fail test',
        description: 'Test minimum turns failure',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          min_turns: 5,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.error_message).toContain('at least 5 turns');
    });

    test('should check max_turns assertion', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'agent', message: 'Hi!'},
            {role: 'user', message: 'Bye'},
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-015',
        type: 'elevenlabs',
        name: 'Max turns test',
        description: 'Test maximum conversation turns',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          max_turns: 10,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
    });

    test('should fail closed when simulate-conversation returns no turns', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [],
          analysis: {
            call_successful: 'success',
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-015A',
        type: 'elevenlabs',
        name: 'Empty simulation response',
        description: 'An empty successful API response is not a meaningful eval result',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          max_turns: 10,
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
      expect(result.error_message).toContain('returned no turns');
    });

    test('should include API evaluation criteria results', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'agent', message: 'Hello!'},
          ],
          analysis: {
            criteria_evaluations: [
              {name: 'greeting_quality', passed: true, reason: 'Good greeting'},
              {name: 'brand_mention', passed: false, reason: 'Did not mention brand'},
            ],
            overall_passed: false,
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-016',
        type: 'elevenlabs',
        name: 'Criteria evaluation test',
        description: 'Test API criteria evaluation',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          evaluation_criteria: [
            {name: 'greeting_quality', description: 'Agent greets properly'},
            {name: 'brand_mention', description: 'Agent mentions brand name'},
          ],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      // Should fail because overall_passed is false and one criterion failed
      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(1); // Greeting_quality passed
      expect(result.assertions_failed).toBe(1); // Brand_mention failed
    });

    test('should fail when requested evaluation criteria return no analysis result', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'agent', message: 'I can help you reschedule.'},
          ],
          analysis: {
            call_successful: 'success',
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-016A',
        type: 'elevenlabs',
        name: 'Missing native criteria result',
        description: 'Requested extra evaluation criteria must produce analysis evidence',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'I need to reschedule.',
        },
        expected_output: {
          evaluation_criteria: [
            {
              id: 'caller_recovered',
              name: 'Caller recovered',
              conversation_goal_prompt: 'The agent recovered the disappointed caller.',
            },
          ],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_passed).toBe(0);
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('requested criterion "caller_recovered"');
      expect(result.error_message).toContain('evaluation result');
    });

    test('should normalize current simulate-conversation tool and criteria shapes', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'Can you look me up?'},
            {
              role: 'agent',
              message: 'I found your account.',
              tool_calls: [
                {
                  request_id: 'lookup_record_current_shape',
                  tool_name: 'lookup_record',
                  params_as_json: '{"id":"+15550100"}',
                  tool_has_been_called: true,
                },
              ],
              tool_results: [
                {
                  request_id: 'lookup_record_current_shape',
                  tool_name: 'lookup_record',
                  result_value: '{"status":"found"}',
                  is_error: false,
                  tool_has_been_called: true,
                },
              ],
            },
          ],
          analysis: {
            call_successful: 'success',
            evaluation_criteria_results: {
              lookup_quality: {
                result: 'success',
                rationale: 'The lookup was completed.',
              },
            },
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017',
        type: 'elevenlabs',
        name: 'Current API shape test',
        description: 'Test current simulate-conversation response normalization',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Can you look me up?',
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

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBe(4);
      expect(result.actual_output.tool_calls).toEqual(['lookup_record']);
    });

    test('should include multivoice message parts in response assertions', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {
              role: 'agent',
              message: null,
              multivoice_message: {
                parts: [
                  {text: 'Welcome back.'},
                  {text: 'I can help with billing.'},
                ],
              },
            },
          ],
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017M',
        type: 'elevenlabs',
        name: 'Multivoice response text',
        description: 'Response assertions should inspect current multivoice message text',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'I have a billing question.',
        },
        expected_output: {
          response_contains: ['welcome', 'billing'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBe(2);
      expect(result.actual_output.agent_messages).toContain('Welcome back');
      expect(result.actual_output.agent_messages).toContain('billing');
    });

    test('should fail when current analysis reports unsuccessful call without local assertion failures', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'I need to cancel.'},
            {role: 'agent', message: 'I cannot help with that.'},
          ],
          analysis: {
            call_successful: 'failure',
            transcript_summary: 'The agent did not satisfy the caller goal.',
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017E',
        type: 'elevenlabs',
        name: 'Current analysis failure',
        description: 'ElevenLabs analysis failure must fail the harness result',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'I need to cancel.',
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('analysis.call_successful was "failure"');
    });

    test('should pass an expected-failing simulation when should_pass is false', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'I need to cancel.'},
            {role: 'agent', message: 'I cannot help with that.'},
          ],
          analysis: {
            call_successful: 'failure',
            transcript_summary: 'The agent did not satisfy the caller goal.',
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017K',
        type: 'elevenlabs',
        name: 'Expected failing simulation',
        description: 'Negative simulations should be expressible without red CI',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'I need to cancel.',
        },
        expected_output: {
          should_pass: false,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBe(1);
      expect(result.assertions_failed).toBe(0);
      expect(result.error_message).toBeUndefined();
    });

    test('should pass an expected-failing simulation when native criteria fail', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'I asked for a refund and got nowhere.'},
            {role: 'agent', message: 'You will need to try again later.'},
          ],
          analysis: {
            call_successful: 'failure',
            evaluation_criteria_results_list: [
              {
                criteria_id: 'caller_recovered',
                result: 'failure',
                rationale: 'The agent did not recover the disappointed caller.',
              },
            ],
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017K2',
        type: 'elevenlabs',
        name: 'Expected failing criteria',
        description: 'Negative simulations should treat failed native criteria as expected evidence',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'I asked for a refund and got nowhere.',
        },
        expected_output: {
          should_pass: false,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBe(1);
      expect(result.assertions_failed).toBe(0);
      expect(result.error_message).toBeUndefined();
    });

    test('should infer an expected-failing simulation from failed native criteria', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'Nobody has called me back.'},
            {role: 'agent', message: 'Okay.'},
          ],
          analysis: {
            evaluation_criteria_results: {
              caller_recovered: {
                result: 'failure',
                rationale: 'The agent failed to address the callback complaint.',
              },
            },
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017K3',
        type: 'elevenlabs',
        name: 'Expected failing criteria only',
        description: 'Criteria-only failed analyses should satisfy expected-failing simulations',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Nobody has called me back.',
        },
        expected_output: {
          should_pass: false,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBe(1);
      expect(result.assertions_failed).toBe(0);
      expect(result.error_message).toBeUndefined();
    });

    test('should pass an expected-failing simulation when extra criteria fail despite global success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'I am disappointed nobody followed up.'},
            {role: 'agent', message: 'We can send a generic information link.'},
          ],
          analysis: {
            call_successful: 'success',
            evaluation_criteria_results_list: [
              {
                criteria_id: 'caller_recovered',
                result: 'failure',
                rationale: 'The agent did not acknowledge or recover the disappointed caller.',
              },
            ],
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017K4',
        type: 'elevenlabs',
        name: 'Expected failing extra criteria',
        description: 'Negative simulations should use failed extra criteria even when global analysis passes',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'I am disappointed nobody followed up.',
        },
        expected_output: {
          should_pass: false,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBe(1);
      expect(result.assertions_failed).toBe(0);
      expect(result.error_message).toBeUndefined();
    });

    test('should infer an expected-failing simulation from failed scoped criteria despite global success', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'I am still upset about the missed callback.'},
            {role: 'agent', message: 'Here is our generic support page.'},
          ],
          analysis: {
            call_successful: 'success',
            scoped: [
              {
                scope: 'conversation',
                successful: 'success',
                evaluation_criteria_results: {
                  caller_recovered: {
                    result: 'failure',
                    rationale: 'The agent did not recover the disappointed caller.',
                  },
                },
              },
            ],
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017K5',
        type: 'elevenlabs',
        name: 'Expected failing scoped criteria',
        description: 'Negative simulations should use failed scoped criteria even when global analysis passes',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'I am still upset about the missed callback.',
        },
        expected_output: {
          should_pass: false,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('passed');
      expect(result.assertions_passed).toBe(1);
      expect(result.assertions_failed).toBe(0);
      expect(result.error_message).toBeUndefined();
    });

    test('should fail should_pass false when ElevenLabs analysis passes', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'user', message: 'I need to cancel.'},
            {role: 'agent', message: 'I can help you with cancellation.'},
          ],
          analysis: {
            call_successful: 'success',
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017L',
        type: 'elevenlabs',
        name: 'Unexpected passing simulation',
        description: 'A negative simulation must fail when the API analysis passes',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'I need to cancel.',
        },
        expected_output: {
          should_pass: false,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('Expected ElevenLabs analysis to fail, got success');
    });

    test('should fail should_pass true when scoped analysis reports failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'agent', message: 'I can help.'},
          ],
          analysis: {
            call_successful: 'success',
            scoped: [
              {
                scope: 'conversation',
                successful: 'failure',
              },
            ],
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017M2',
        type: 'elevenlabs',
        name: 'Scoped analysis failure',
        description: 'Scoped failures must not be hidden by global success',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello.',
        },
        expected_output: {
          should_pass: true,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('analysis.scoped conversation successful was "failure"');
    });

    test('should fail when scoped criteria fail even if scoped successful is green', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
        JSON.stringify({
          simulated_conversation: [
            {role: 'agent', message: 'Here is our generic support page.'},
          ],
          analysis: {
            call_successful: 'success',
            scoped: [
              {
                scope: 'conversation',
                successful: 'success',
                evaluation_criteria_results: {
                  caller_recovered: {
                    result: 'failure',
                    rationale: 'The agent did not acknowledge the caller disappointment.',
                  },
                },
              },
            ],
          },
        }),
        {status: 200},
      ));

      const testCase: TestCase = {
        test_id: 'TC-EL-017M3',
        type: 'elevenlabs',
        name: 'Scoped criteria failure',
        description: 'Scoped criteria failures must not be hidden by scoped successful status',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'I am upset nobody followed up.',
        },
        expected_output: {
          evaluation_criteria: [
            {
              name: 'Caller recovered',
              conversation_goal_prompt: 'The agent acknowledges and recovers the disappointed caller.',
            },
          ],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = await runner.execute(testCase);

      expect(result.status).toBe('failed');
      expect(result.assertions_failed).toBe(1);
      expect(result.error_message).toContain('caller disappointment');
      expect(result.error_message).toContain('conversation:caller_recovered');
    });
  });
});
