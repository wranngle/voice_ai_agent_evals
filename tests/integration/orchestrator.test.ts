/**
 * Test Orchestrator Tests
 *
 * Tests for the test orchestrator that coordinates test execution.
 */

import { describe, it, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { TestOrchestrator, runTests } from '../../lib/testing/runners/orchestrator';
import {
  clearAllDataSync,
  createTestCaseSync,
  listTestRunsSync,
  listTestResultsSync,
} from '../../lib/testing/local-storage';
import type { TestRunner, TestExecutionResult } from '../../lib/testing/runners/types';
import type { TestCase, TestType } from '../../lib/testing/types';

// Use unique storage directory for this test file
const UNIQUE_STORAGE_DIR = join(process.cwd(), '.test-data-orchestrator-' + Date.now());

describe('Test Orchestrator', () => {
  beforeEach(() => {
    // Set unique storage dir to avoid conflicts with parallel tests
    process.env.TEST_STORAGE_DIR = UNIQUE_STORAGE_DIR;
    mkdirSync(UNIQUE_STORAGE_DIR, { recursive: true });
    clearAllDataSync();
  });

  afterEach(() => {
    clearAllDataSync();
    vi.restoreAllMocks();
    // Clean up storage dir
    try {
      rmSync(UNIQUE_STORAGE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    delete process.env.TEST_STORAGE_DIR;
  });

  describe('Runner Registration', () => {
    test('should have default runners registered', () => {
      const orchestrator = new TestOrchestrator();

      expect(orchestrator.getRunner('webhook')).toBeDefined();
      expect(orchestrator.getRunner('elevenlabs')).toBeDefined();
      expect(orchestrator.getRunner('n8n-eval')).toBeDefined();
      expect(orchestrator.getRunner('mcp')).toBeDefined();
    });

    test('should allow registering custom runners', () => {
      const orchestrator = new TestOrchestrator();

      const customRunner: TestRunner = {
        type: 'custom' as TestType,
        execute: async () => ({
          status: 'passed',
          actual_output: {},
          latency_ms: 100,
          assertions_passed: 1,
          assertions_failed: 0,
        }),
        validate: () => ({ valid: true, errors: [] }),
      };

      orchestrator.registerRunner(customRunner);
      expect(orchestrator.getRunner('custom' as TestType)).toBe(customRunner);
    });

    test('should return undefined for unregistered runner', () => {
      const orchestrator = new TestOrchestrator();
      expect(orchestrator.getRunner('unknown' as TestType)).toBeUndefined();
    });
  });

  describe('Test Execution', () => {
    test('should run tests and return summary', async () => {
      // Create a test case
      createTestCaseSync({
        type: 'webhook',
        name: 'Test Case 1',
        description: 'A test case',
        input: {
          url: 'https://example.com/webhook',
          method: 'POST',
          body: { test: true },
        },
        expected_output: {},
        tags: ['smoke'],
        enabled: true,
      });

      const orchestrator = new TestOrchestrator();

      // Mock the webhook runner execute method
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockResolvedValue({
          status: 'passed',
          actual_output: { success: true },
          latency_ms: 150,
          assertions_passed: 1,
          assertions_failed: 0,
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run();

      expect(summary.total_tests).toBe(1);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.errors).toBe(0);
      expect(summary.pass_rate).toBe(100);
    });

    test('should create test run record', async () => {
      createTestCaseSync({
        type: 'webhook',
        name: 'Test for Run Record',
        description: 'Test',
        input: { url: 'https://example.com/webhook', method: 'POST', body: {} },
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const orchestrator = new TestOrchestrator();
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockResolvedValue({
          status: 'passed',
          actual_output: {},
          latency_ms: 100,
          assertions_passed: 1,
          assertions_failed: 0,
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run({ triggeredBy: 'ci' });

      // Verify test run was created
      const runs = listTestRunsSync();
      expect(runs.length).toBe(1);
      expect(runs[0].triggered_by).toBe('ci');
      expect(runs[0].completed_at).toBeDefined();
    });

    test('should create test result records', async () => {
      const testCase = createTestCaseSync({
        type: 'webhook',
        name: 'Test for Result Record',
        description: 'Test',
        input: { url: 'https://example.com/webhook', method: 'POST', body: {} },
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const orchestrator = new TestOrchestrator();
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockResolvedValue({
          status: 'passed',
          actual_output: { data: 'result' },
          latency_ms: 250,
          assertions_passed: 2,
          assertions_failed: 0,
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      await orchestrator.run();

      const results = listTestResultsSync({ testId: testCase.test_id });
      expect(results.length).toBe(1);
      expect(results[0].status).toBe('passed');
      expect(results[0].latency_ms).toBe(250);
    });
  });

  describe('Test Filtering', () => {
    beforeEach(() => {
      // Create test cases with different types and tags
      createTestCaseSync({
        type: 'webhook',
        name: 'Webhook Test',
        description: 'Test',
        input: { url: 'https://example.com/webhook', method: 'POST', body: {} },
        expected_output: {},
        tags: ['smoke', 'webhook'],
        enabled: true,
      });

      createTestCaseSync({
        type: 'elevenlabs',
        name: 'ElevenLabs Test',
        description: 'Test',
        input: { agent_id: 'agent_123', test_prompt: 'Hello' },
        expected_output: {},
        tags: ['smoke', 'voice'],
        enabled: true,
      });

      createTestCaseSync({
        type: 'webhook',
        name: 'Disabled Test',
        description: 'Test',
        input: { url: 'https://example.com/webhook', method: 'POST', body: {} },
        expected_output: {},
        tags: ['regression'],
        enabled: false,
      });
    });

    test('should filter by type', async () => {
      const orchestrator = new TestOrchestrator();
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockResolvedValue({
          status: 'passed',
          actual_output: {},
          latency_ms: 100,
          assertions_passed: 1,
          assertions_failed: 0,
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run({ type: 'webhook' });

      // Should only run enabled webhook tests (1 test, not the disabled one)
      expect(summary.total_tests).toBe(1);
    });

    test('should filter by tag', async () => {
      const orchestrator = new TestOrchestrator();
      const mockWebhookRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockResolvedValue({
          status: 'passed',
          actual_output: {},
          latency_ms: 100,
          assertions_passed: 1,
          assertions_failed: 0,
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      const mockElRunner: TestRunner = {
        type: 'elevenlabs',
        execute: vi.fn().mockResolvedValue({
          status: 'passed',
          actual_output: {},
          latency_ms: 100,
          assertions_passed: 1,
          assertions_failed: 0,
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockWebhookRunner);
      orchestrator.registerRunner(mockElRunner);

      const summary = await orchestrator.run({ tag: 'smoke' });

      // Should run both smoke tests
      expect(summary.total_tests).toBe(2);
    });

    test('should filter by enabled only (default)', async () => {
      const orchestrator = new TestOrchestrator();
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockResolvedValue({
          status: 'passed',
          actual_output: {},
          latency_ms: 100,
          assertions_passed: 1,
          assertions_failed: 0,
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run({ type: 'webhook' });

      // Should only run enabled tests
      expect(summary.total_tests).toBe(1);
    });

    test('should include disabled tests when enabledOnly is false', async () => {
      const orchestrator = new TestOrchestrator();
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockResolvedValue({
          status: 'passed',
          actual_output: {},
          latency_ms: 100,
          assertions_passed: 1,
          assertions_failed: 0,
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run({ type: 'webhook', enabledOnly: false });

      // Should include disabled test
      expect(summary.total_tests).toBe(2);
    });
  });

  describe('Fail Fast Mode', () => {
    test('should stop on first failure when failFast is true', async () => {
      createTestCaseSync({
        type: 'webhook',
        name: 'Test 1 - Pass',
        description: 'Test',
        input: { url: 'https://example.com/webhook', method: 'POST', body: {} },
        expected_output: {},
        tags: [],
        enabled: true,
      });

      createTestCaseSync({
        type: 'webhook',
        name: 'Test 2 - Fail',
        description: 'Test',
        input: { url: 'https://example.com/webhook', method: 'POST', body: {} },
        expected_output: {},
        tags: [],
        enabled: true,
      });

      createTestCaseSync({
        type: 'webhook',
        name: 'Test 3 - Should Not Run',
        description: 'Test',
        input: { url: 'https://example.com/webhook', method: 'POST', body: {} },
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const orchestrator = new TestOrchestrator();
      let callCount = 0;
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            return {
              status: 'failed',
              actual_output: {},
              latency_ms: 100,
              error_message: 'Test failed',
              assertions_passed: 0,
              assertions_failed: 1,
            };
          }
          return {
            status: 'passed',
            actual_output: {},
            latency_ms: 100,
            assertions_passed: 1,
            assertions_failed: 0,
          };
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run({ failFast: true });

      // Should have stopped after 2 tests
      expect(callCount).toBe(2);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.failures.length).toBe(1);
    });
  });

  describe('Statistics', () => {
    test('should calculate pass rate correctly', async () => {
      for (let i = 0; i < 4; i++) {
        createTestCaseSync({
          type: 'webhook',
          name: `Test ${i}`,
          description: 'Test',
          input: { url: 'https://example.com/webhook', method: 'POST', body: { i } },
          expected_output: {},
          tags: [],
          enabled: true,
        });
      }

      const orchestrator = new TestOrchestrator();
      let callCount = 0;
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockImplementation(() => {
          callCount++;
          // 3 pass, 1 fail = 75%
          if (callCount === 3) {
            return {
              status: 'failed',
              actual_output: {},
              latency_ms: 100,
              error_message: 'Failed',
              assertions_passed: 0,
              assertions_failed: 1,
            };
          }
          return {
            status: 'passed',
            actual_output: {},
            latency_ms: 100,
            assertions_passed: 1,
            assertions_failed: 0,
          };
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run();

      expect(summary.pass_rate).toBe(75);
    });

    test('should calculate average latency', async () => {
      for (let i = 0; i < 3; i++) {
        createTestCaseSync({
          type: 'webhook',
          name: `Latency Test ${i}`,
          description: 'Test',
          input: { url: 'https://example.com/webhook', method: 'POST', body: { i } },
          expected_output: {},
          tags: [],
          enabled: true,
        });
      }

      const orchestrator = new TestOrchestrator();
      const latencies = [100, 200, 300];
      let callCount = 0;
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockImplementation(() => {
          const latency = latencies[callCount];
          callCount++;
          return {
            status: 'passed',
            actual_output: {},
            latency_ms: latency,
            assertions_passed: 1,
            assertions_failed: 0,
          };
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run();

      expect(summary.avg_latency_ms).toBe(200);
    });

    test('should track slowest test', async () => {
      createTestCaseSync({
        type: 'webhook',
        name: 'Fast Test',
        description: 'Test',
        input: { url: 'https://example.com/webhook', method: 'POST', body: { fast: true } },
        expected_output: {},
        tags: [],
        enabled: true,
      });

      createTestCaseSync({
        type: 'webhook',
        name: 'Slow Test',
        description: 'Test',
        input: { url: 'https://example.com/webhook', method: 'POST', body: { slow: true } },
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const orchestrator = new TestOrchestrator();
      let callCount = 0;
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockImplementation(() => {
          callCount++;
          return {
            status: 'passed',
            actual_output: {},
            latency_ms: callCount === 1 ? 100 : 500,
            assertions_passed: 1,
            assertions_failed: 0,
          };
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run();

      expect(summary.slowest_test).toBeDefined();
      expect(summary.slowest_test!.latency_ms).toBe(500);
      expect(summary.slowest_test!.name).toBe('Slow Test');
    });

    test('should track failures', async () => {
      createTestCaseSync({
        type: 'webhook',
        name: 'Failing Test',
        description: 'Test',
        input: { url: 'https://example.com/webhook', method: 'POST', body: {} },
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const orchestrator = new TestOrchestrator();
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockResolvedValue({
          status: 'failed',
          actual_output: {},
          latency_ms: 100,
          error_message: 'Expected 200 but got 500',
          assertions_passed: 0,
          assertions_failed: 1,
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run();

      expect(summary.failures.length).toBe(1);
      expect(summary.failures[0].name).toBe('Failing Test');
      expect(summary.failures[0].error_message).toBe('Expected 200 but got 500');
    });
  });

  describe('Validation Handling', () => {
    test('should mark test as error when validation fails', async () => {
      createTestCaseSync({
        type: 'webhook',
        name: 'Invalid Test',
        description: 'Test',
        input: { url: '', method: 'POST', body: {} }, // Invalid: empty URL
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const orchestrator = new TestOrchestrator();
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockResolvedValue({
          status: 'passed',
          actual_output: {},
          latency_ms: 100,
          assertions_passed: 1,
          assertions_failed: 0,
        }),
        validate: () => ({
          valid: false,
          errors: ['URL is required'],
        }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run();

      expect(summary.errors).toBe(1);
      expect(mockRunner.execute).not.toHaveBeenCalled();
    });
  });

  describe('Missing Runner', () => {
    test('should skip test when no runner is available', async () => {
      createTestCaseSync({
        type: 'unknown' as TestType,
        name: 'Unknown Type Test',
        description: 'Test',
        input: {},
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const orchestrator = new TestOrchestrator();
      const summary = await orchestrator.run();

      expect(summary.skipped).toBe(1);
    });
  });

  describe('Parallel Execution', () => {
    test('should support parallel execution', async () => {
      for (let i = 0; i < 5; i++) {
        createTestCaseSync({
          type: 'webhook',
          name: `Parallel Test ${i}`,
          description: 'Test',
          input: { url: 'https://example.com/webhook', method: 'POST', body: { i } },
          expected_output: {},
          tags: [],
          enabled: true,
        });
      }

      const orchestrator = new TestOrchestrator();
      const executionOrder: number[] = [];
      let callCount = 0;

      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockImplementation(() => {
          const currentCall = callCount++;
          executionOrder.push(currentCall);
          return {
            status: 'passed',
            actual_output: {},
            latency_ms: 50,
            assertions_passed: 1,
            assertions_failed: 0,
          };
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run({ parallel: true, concurrency: 3 });

      expect(summary.total_tests).toBe(5);
      expect(summary.passed).toBe(5);
    });
  });

  describe('Default Export', () => {
    test('runTests function should use default orchestrator', async () => {
      createTestCaseSync({
        type: 'webhook',
        name: 'Default Export Test',
        description: 'Test',
        input: { url: 'https://example.com/webhook', method: 'POST', body: {} },
        expected_output: {},
        tags: [],
        enabled: true,
      });

      // Note: This will actually try to make HTTP calls, so we just check it returns
      const summary = await runTests({ enabledOnly: false, type: 'webhook' });

      expect(summary).toBeDefined();
      expect(summary.execution_id).toBeDefined();
      // The test will fail since we can't reach the webhook, but that's expected
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty test suite', async () => {
      const orchestrator = new TestOrchestrator();
      const summary = await orchestrator.run();

      expect(summary.total_tests).toBe(0);
      expect(summary.pass_rate).toBe(0);
      expect(summary.avg_latency_ms).toBe(0);
    });

    test('should include execution ID in summary', async () => {
      const orchestrator = new TestOrchestrator();
      const summary = await orchestrator.run();

      expect(summary.execution_id).toBeDefined();
      expect(summary.execution_id).toMatch(/^RUN-/);
    });

    test('should include duration in summary', async () => {
      createTestCaseSync({
        type: 'webhook',
        name: 'Duration Test',
        description: 'Test',
        input: { url: 'https://example.com/webhook', method: 'POST', body: {} },
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const orchestrator = new TestOrchestrator();
      const mockRunner: TestRunner = {
        type: 'webhook',
        execute: vi.fn().mockImplementation(async () => {
          await new Promise(r => setTimeout(r, 50));
          return {
            status: 'passed',
            actual_output: {},
            latency_ms: 50,
            assertions_passed: 1,
            assertions_failed: 0,
          };
        }),
        validate: () => ({ valid: true, errors: [] }),
      };
      orchestrator.registerRunner(mockRunner);

      const summary = await orchestrator.run();

      expect(summary.duration_ms).toBeGreaterThanOrEqual(50);
    });
  });
});
