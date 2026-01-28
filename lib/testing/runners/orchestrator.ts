/**
 * Test Orchestrator
 *
 * Coordinates test execution across multiple runners and records results.
 */

import type { TestCase, TestResult, TestRun, TestType, TestRunSummary } from '../types';
import type { TestRunner, RunOptions, TestExecutionResult } from './types';
import {
  createTestRun,
  completeTestRun,
  createTestResult,
  listTestCases,
} from '../local-storage';
import { WebhookRunner } from './webhook-runner';
import { ElevenLabsRunner } from './elevenlabs-runner';
import { N8nEvalRunner } from './n8n-eval-runner';
import { McpRunner } from './mcp-runner';

/**
 * Options for the test orchestrator
 */
export interface OrchestratorOptions {
  /** Filter tests by type */
  type?: TestType;
  /** Filter tests by tag (single) */
  tag?: string;
  /** Filter tests by tags (multiple) */
  tags?: string[];
  /** Filter tests by requirement ID */
  requirementId?: string;
  /** Only run enabled tests (default: true) */
  enabledOnly?: boolean;
  /** Stop on first failure */
  failFast?: boolean;
  /** Parallel execution (default: false) */
  parallel?: boolean;
  /** Max concurrent tests when parallel */
  concurrency?: number;
  /** Global timeout per test */
  timeout?: number;
  /** Trigger source for the run */
  triggerSource?: string;
  /** Triggered by */
  triggeredBy?: 'manual' | 'ci' | 'scheduled' | 'hook';
}

/**
 * Test Orchestrator - runs tests and records results
 */
export class TestOrchestrator {
  private runners: Map<TestType, TestRunner> = new Map();

  constructor() {
    // Register default runners
    this.registerRunner(new WebhookRunner());
    this.registerRunner(new ElevenLabsRunner());
    this.registerRunner(new N8nEvalRunner());
    this.registerRunner(new McpRunner());
  }

  /**
   * Register a test runner for a specific type
   */
  registerRunner(runner: TestRunner): void {
    this.runners.set(runner.type, runner);
  }

  /**
   * Get a runner for a specific type
   */
  getRunner(type: TestType): TestRunner | undefined {
    return this.runners.get(type);
  }

  /**
   * Run all tests matching the given options
   */
  async run(options: OrchestratorOptions = {}): Promise<TestRunSummary> {
    const startTime = Date.now();

    // Create a test run record
    const runResult = await createTestRun({
      triggered_by: options.triggeredBy || 'manual',
      trigger_source: options.triggerSource,
      test_type_filter: options.type,
      tag_filter: options.tag,
      total_tests: 0,
      passed: 0,
      failed: 0,
      errors: 0,
      skipped: 0,
      pass_rate: 0,
      avg_latency_ms: 0,
    });

    const executionId = runResult.data!.execution_id;

    // Get test cases
    const casesResult = await listTestCases({
      type: options.type,
      requirementId: options.requirementId,
      tag: options.tag,
      enabled: options.enabledOnly !== false ? true : undefined,
    });

    let testCases = casesResult.data || [];

    // Filter by multiple tags if provided
    if (options.tags && options.tags.length > 0) {
      testCases = testCases.filter(tc =>
        options.tags!.some(tag => tc.tags.includes(tag))
      );
    }
    const results: TestResult[] = [];
    const failures: Array<{ test_id: string; name: string; error_message: string }> = [];
    let slowestTest: { test_id: string; name: string; latency_ms: number } | undefined;

    // Stats
    let passed = 0;
    let failed = 0;
    let errors = 0;
    let skipped = 0;
    let totalLatency = 0;

    // Execute tests
    if (options.parallel) {
      const concurrency = options.concurrency || 5;
      const chunks = this.chunkArray(testCases, concurrency);

      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map(tc => this.executeTest(tc, executionId, options))
        );

        for (const result of chunkResults) {
          results.push(result);
          this.updateStats(result, { passed, failed, errors, skipped, totalLatency });

          if (result.status === 'passed') passed++;
          else if (result.status === 'failed') failed++;
          else if (result.status === 'error') errors++;
          else if (result.status === 'skipped') skipped++;

          totalLatency += result.latency_ms;

          if (!slowestTest || result.latency_ms > slowestTest.latency_ms) {
            const tc = testCases.find(t => t.test_id === result.test_id);
            slowestTest = {
              test_id: result.test_id,
              name: tc?.name || result.test_id,
              latency_ms: result.latency_ms,
            };
          }

          if (result.status === 'failed' || result.status === 'error') {
            const tc = testCases.find(t => t.test_id === result.test_id);
            failures.push({
              test_id: result.test_id,
              name: tc?.name || result.test_id,
              error_message: result.error_message || 'Unknown error',
            });

            if (options.failFast) break;
          }
        }

        if (options.failFast && failures.length > 0) break;
      }
    } else {
      // Sequential execution
      for (const testCase of testCases) {
        const result = await this.executeTest(testCase, executionId, options);
        results.push(result);

        if (result.status === 'passed') passed++;
        else if (result.status === 'failed') failed++;
        else if (result.status === 'error') errors++;
        else if (result.status === 'skipped') skipped++;

        totalLatency += result.latency_ms;

        if (!slowestTest || result.latency_ms > slowestTest.latency_ms) {
          slowestTest = {
            test_id: result.test_id,
            name: testCase.name,
            latency_ms: result.latency_ms,
          };
        }

        if (result.status === 'failed' || result.status === 'error') {
          failures.push({
            test_id: result.test_id,
            name: testCase.name,
            error_message: result.error_message || 'Unknown error',
          });

          if (options.failFast) break;
        }
      }
    }

    const totalTests = testCases.length;
    const avgLatency = totalTests > 0 ? Math.round(totalLatency / totalTests) : 0;
    const duration = Date.now() - startTime;

    // Complete the test run
    await completeTestRun(executionId, {
      total_tests: totalTests,
      passed,
      failed,
      errors,
      skipped,
      avg_latency_ms: avgLatency,
    });

    // Return summary
    return {
      execution_id: executionId,
      duration_ms: duration,
      total_tests: totalTests,
      passed,
      failed,
      errors,
      skipped,
      pass_rate: totalTests > 0 ? Math.round((passed / totalTests) * 10000) / 100 : 0,
      avg_latency_ms: avgLatency,
      slowest_test: slowestTest,
      failures,
    };
  }

  /**
   * Execute a single test case and record the result
   */
  private async executeTest(
    testCase: TestCase,
    executionId: string,
    options: RunOptions
  ): Promise<TestResult> {
    const runner = this.runners.get(testCase.type);

    if (!runner) {
      // No runner available for this type - skip
      const result = await createTestResult({
        test_id: testCase.test_id,
        execution_id: executionId,
        requirement_id: testCase.requirement_id,
        status: 'skipped',
        actual_output: {},
        latency_ms: 0,
        error_message: `No runner available for type: ${testCase.type}`,
        assertions_passed: 0,
        assertions_failed: 0,
      });
      return result.data!;
    }

    // Validate test case
    const validation = runner.validate(testCase);
    if (!validation.valid) {
      const result = await createTestResult({
        test_id: testCase.test_id,
        execution_id: executionId,
        requirement_id: testCase.requirement_id,
        status: 'error',
        actual_output: { validation_errors: validation.errors },
        latency_ms: 0,
        error_message: `Validation failed: ${validation.errors.join(', ')}`,
        assertions_passed: 0,
        assertions_failed: 0,
      });
      return result.data!;
    }

    // Execute test
    const executionResult = await runner.execute(testCase, options);

    // Record result
    const result = await createTestResult({
      test_id: testCase.test_id,
      execution_id: executionId,
      requirement_id: testCase.requirement_id,
      ...executionResult,
    });

    return result.data!;
  }

  private updateStats(
    _result: TestResult,
    _stats: { passed: number; failed: number; errors: number; skipped: number; totalLatency: number }
  ): void {
    // Stats are updated in the main loop
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Default orchestrator instance
export const orchestrator = new TestOrchestrator();

/**
 * Run tests with the default orchestrator
 */
export async function runTests(options?: OrchestratorOptions): Promise<TestRunSummary> {
  return orchestrator.run(options);
}
