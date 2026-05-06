/**
 * ElevenLabs Runner Tests
 *
 * Tests for the ElevenLabs voice agent test runner using simulate-conversation API.
 */

import {describe, expect, test} from 'vitest';
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
      expect(validation.errors).toContain('agent_id must be a non-empty string');
    });

    test('should accept current ElevenLabs opaque agent IDs without requiring agent_ prefix', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-003',
        type: 'elevenlabs',
        name: 'Opaque agent_id',
        description: 'Test with current docs-style opaque agent_id',
        input: {
          agent_id: 'J3Pbu5gP6NNKBscdCdwB',
          test_prompt: 'Hello',
        },
        expected_output: {
          response_contains: ['hello'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should reject whitespace-only agent_id', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-003A',
        type: 'elevenlabs',
        name: 'Blank agent_id',
        description: 'Test with blank agent_id',
        input: {
          agent_id: '   ',
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
      expect(validation.errors).toContain('agent_id must be a non-empty string');
    });

    test('should reject test case without a simulation seed', () => {
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
      const seedError = 'test_prompt, simulated_user_prompt, or partial_conversation_history is required for conversation simulation';
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(seedError);
    });

    test('should accept a simulated user prompt without first message', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-004A',
        type: 'elevenlabs',
        name: 'Simulated user prompt',
        description: 'Test with native simulated user prompt',
        input: {
          agent_id: 'agent_abc123xyz',
          simulated_user_prompt: 'You are an impatient caller trying to reschedule.',
        },
        expected_output: {
          min_turns: 1,
          max_turns: 10,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should reject max_turns as the only assertion', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-004A2',
        type: 'elevenlabs',
        name: 'Turn limit only',
        description: 'A request turn cap is not enough eval signal by itself',
        input: {
          agent_id: 'agent_abc123xyz',
          simulated_user_prompt: 'You are an impatient caller.',
        },
        expected_output: {
          max_turns: 10,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('expected_output must include at least one assertion for the ElevenLabs runner');
    });

    test('should reject assertion-empty expected output before API call', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-004H',
        type: 'elevenlabs',
        name: 'No assertions',
        description: 'A simulation run without assertions is not an eval',
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

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('expected_output must include at least one assertion for the ElevenLabs runner');
    });

    test('should reject incomplete evaluation criteria before API call', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-004B',
        type: 'elevenlabs',
        name: 'Bad eval criteria',
        description: 'Test criteria validation',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          evaluation_criteria: [
            {name: 'Missing goal'},
          ],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('evaluation_criteria[0].conversation_goal_prompt is required');
    });

    test('should reject non-boolean should_pass before API call', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-004D',
        type: 'elevenlabs',
        name: 'Bad expected pass state',
        description: 'Test should_pass validation',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          should_pass: 'false',
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('should_pass must be a boolean');
    });

    test('should reject invalid tool latency budgets before API call', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-004C',
        type: 'elevenlabs',
        name: 'Bad tool latency budget',
        description: 'Test latency budget validation',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          tool_call_latency_max_ms: {
            lookup_record: -1,
          },
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('tool_call_latency_max_ms.lookup_record must be a non-negative number');
    });

    test('should reject assertion fields misplaced on input', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-004E',
        type: 'elevenlabs',
        name: 'Misplaced assertions',
        description: 'Assertion fields on input would otherwise be silently ignored',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
          response_contains: ['welcome'],
          expected_tool_calls: ['lookup_record'],
        },
        expected_output: {},
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('input.response_contains is ignored by the ElevenLabs runner; move it to expected_output.response_contains');
      expect(validation.errors).toContain('input.expected_tool_calls is ignored by the ElevenLabs runner; move it to expected_output.expected_tool_calls');
    });

    test('should reject malformed assertion shapes before API call', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-004F',
        type: 'elevenlabs',
        name: 'Malformed assertions',
        description: 'Bad expected_output shapes should fail validation, not become weak assertions',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          response_contains: 'welcome',
          expected_tool_calls: ['lookup_record', ' '],
          tool_call_latency_max_ms: [],
          min_turns: 3.5,
          max_turns: 2,
          evaluation_criteria: [
            {name: ' ', conversation_goal_prompt: 'The agent helped.'},
            null,
          ],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('response_contains must be an array of non-empty strings');
      expect(validation.errors).toContain('expected_tool_calls[1] must be a non-empty string');
      expect(validation.errors).toContain('tool_call_latency_max_ms must be an object keyed by tool name');
      expect(validation.errors).toContain('min_turns must be a positive integer when present');
      expect(validation.errors).toContain('max_turns must be greater than or equal to min_turns');
      expect(validation.errors).toContain('evaluation_criteria[0].name is required');
      expect(validation.errors).toContain('evaluation_criteria[1] must be an object');
    });

    test('should reject unknown expected_output assertion keys before API call', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-004G',
        type: 'elevenlabs',
        name: 'Typoed assertions',
        description: 'Unknown expected_output keys must not be silently ignored',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
        },
        expected_output: {
          response_contains: ['hello'],
          expected_tool_call: ['lookup_record'],
          maximum_turns: 4,
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('expected_output.expected_tool_call is not recognized by the ElevenLabs runner');
      expect(validation.errors).toContain('expected_output.maximum_turns is not recognized by the ElevenLabs runner');
    });

    test('should reject unknown input fields before API call', () => {
      const testCase: TestCase = {
        test_id: 'TC-EL-004I',
        type: 'elevenlabs',
        name: 'Typoed simulation controls',
        description: 'Unknown input keys must not silently drop live simulation controls',
        input: {
          agent_id: 'agent_abc123xyz',
          test_prompt: 'Hello',
          tool_mocks_config: {
            lookup_record: {result_value: '{"status":"found"}'},
          },
          maximum_turns: 4,
        },
        expected_output: {
          response_contains: ['hello'],
        },
        tags: [],
        enabled: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const validation = runner.validate(testCase);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('input.tool_mocks_config is not recognized by the ElevenLabs runner');
      expect(validation.errors).toContain('input.maximum_turns is not recognized by the ElevenLabs runner');
    });
  });
});
