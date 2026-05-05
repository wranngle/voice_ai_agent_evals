/**
 * ElevenLabs Runner Tests
 *
 * Tests for the ElevenLabs voice agent test runner using simulate-conversation API.
 */

import {
  describe, expect, test, beforeEach, vi, afterEach,
} from 'vitest';
import {ElevenLabsRunner} from '../../lib/testing/runners/elevenlabs-runner';
import type {TestCase} from '../../lib/testing/types';

describe('ElevenLabs Runner', () => {
  describe('Validation', () => {
    const runner = new ElevenLabsRunner();

    test('should validate test case with agent_id and test_prompt', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-001',
        type: 'elevenlabs',
        name: 'Basic agent test',
        description: 'Test agent responds correctly',
        input: {
          agent_id: 'agent_xxxx_demo',
          test_prompt: 'Hello, I need help scheduling an appointment',
        },
        expected_output: {
          response_contains: ['hello'],
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

    test('should reject test case without agent_id', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-002',
        type: 'elevenlabs',
        name: 'Missing agent_id',
        description: 'Test without agent_id',
        input: {
          test_prompt: 'Hello',
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing required field: agent_id');
    });

    test('should reject test case with invalid agent_id format', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-003',
        type: 'elevenlabs',
        name: 'Invalid agent_id',
        description: 'Test with malformed agent_id',
        input: {
          agent_id: 'invalid-id',
          test_prompt: 'Hello',
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain('Invalid agent_id format');
    });

    test('should reject test case without test_prompt', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-004',
        type: 'elevenlabs',
        name: 'No input',
        description: 'Test without prompt',
        input: {
          agent_id: 'agent_abc123xyz',
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('test_prompt is required for conversation simulation');
    });
  });

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
                {name: 'schedule_appointment', parameters: {date: 'tomorrow'}},
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
  });
});
