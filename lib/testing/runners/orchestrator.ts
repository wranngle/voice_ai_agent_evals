/**
 * Test Orchestrator
 *
 * Coordinates test execution across multiple runners and records results.
 */

import type {
  TestCase, TestResult, TestType, TestRunSummary,
} from '../types';
import {
  createTestRun,
  completeTestRun,
  createTestResult,
  listTestCases,
} from '../local-storage';
import type {TestRunner, RunOptions, TestExecutionResult} from './types';
import {WebhookRunner} from './webhook-runner';
import {ElevenLabsRunner} from './elevenlabs-runner';
import {N8nEvalRunner} from './n8n-eval-runner';
import {McpRunner} from './mcp-runner';
import {ExternalCommandRunner} from './external-command-runner';
import {ScenarioRunner} from './scenario-runner';

/**
 * Options for the test orchestrator
 */
export type OrchestratorOptions = {
  /** Filter tests by type */
  type?: TestType;
  /** Filter tests by tag (single) */
  tag?: string;
  /** Filter tests by tags (multiple) */
  tags?: string[];
  /** Filter tests by requirement ID */
  requirementId?: string;
  /** Filter tests by exact test ID */
  id?: string;
  /** Synthetic or discovered cases that are not stored in local storage */
  extraTestCases?: TestCase[];
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
};

/**
 * Test Orchestrator - runs tests and records results
 */
export class TestOrchestrator {
  private readonly runners = new Map<TestType, TestRunner>();

  constructor() {
    // Register default runners
    this.registerRunner(new WebhookRunner());
    this.registerRunner(new ElevenLabsRunner());
    this.registerRunner(new N8nEvalRunner());
    this.registerRunner(new McpRunner());
    this.registerRunner(new ExternalCommandRunner());
    this.registerRunner(new ScenarioRunner());
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
    const startTime = performance.now();

    // Create a test run record
    const runResult = await createTestRun({
      triggered_by: options.triggeredBy || 'manual',
      trigger_source: options.triggerSource,
      test_type_filter: options.type,
      tag_filter: options.tag,
      test_filter: buildTestFilterContext(options),
      total_tests: 0,
      passed: 0,
      failed: 0,
      errors: 0,
      skipped: 0,
      pass_rate: 0,
      avg_latency_ms: 0,
      p95_latency_ms: 0,
      p99_latency_ms: 0,
    });

    const executionId = runResult.data.execution_id;

    // Get test cases
    const casesResult = await listTestCases({
      type: options.type,
      requirementId: options.requirementId,
      tag: options.tag,
      enabled: options.enabledOnly === false ? undefined : true,
    });

    const extraTestCases = options.extraTestCases ?? [];
    let testCases = mergeTestCases(casesResult.data || [], extraTestCases)
      .filter(testCase => !options.type || testCase.type === options.type)
      .filter(testCase => !options.requirementId || testCase.requirement_id === options.requirementId)
      .filter(testCase => !options.tag || testCase.tags.includes(options.tag))
      .filter(testCase => options.enabledOnly === false || Boolean(options.id) || testCase.enabled)
      .filter(testCase => !options.id || testCase.test_id === options.id);

    // Filter by multiple tags if provided
    if (options.tags && options.tags.length > 0) {
      testCases = testCases.filter(tc =>
        options.tags!.some(tag => tc.tags.includes(tag)));
    }

    const results: TestResult[] = [];
    const failures: Array<{test_id: string; name: string; error_message: string}> = [];
    let slowestTest: {test_id: string; name: string; latency_ms: number} | undefined;

    // Stats
    let passed = 0;
    let failed = 0;
    let errors = 0;
    let skipped = 0;
    let totalLatency = 0;
    const latencies: number[] = [];

    // Execute tests
    if (options.parallel) {
      // `||` would let a hostile caller pass concurrency: -1 / NaN / 0.5
      // through to chunkArray, where `for (let i = 0; i < array.length;
      // i += size)` never advances on size <= 0 — that hangs the run.
      // Floor + clamp: anything not a positive integer falls back to 5.
      const rawConcurrency = options.concurrency;
      const concurrency = (typeof rawConcurrency === 'number' && Number.isFinite(rawConcurrency) && rawConcurrency >= 1)
        ? Math.floor(rawConcurrency)
        : 5;
      const chunks = this.chunkArray(testCases, concurrency);

      // Promise.all preserves order, so chunkResults[i] corresponds to
      // chunk[i]. Iterate the pair directly — avoids the O(n²)
      // testCases.find(t => t.test_id === result.test_id) the previous
      // shape required (and stays robust to non-unique test_ids).
      for (const chunk of chunks) {
        const chunkResults = await Promise.all(chunk.map(async tc => this.executeTest(tc, executionId, options)));

        // Process EVERY result in the chunk before honoring failFast.
        // The whole chunk has already executed (Promise.all awaited it), so
        // a `break` mid-chunk would silently discard results from tests that
        // already ran — skewing total_tests, pass_rate, and failure
        // attribution. failFast only governs whether the NEXT chunk runs.
        for (const [i, result] of chunkResults.entries()) {
          const testCase = chunk[i];
          results.push(result);

          switch (result.status) {
            case 'passed': {passed++;
              break;
            }

            case 'failed': {failed++;
              break;
            }

            case 'error': {errors++;
              break;
            }

            case 'skipped': {skipped++;
              break;
            }

            case 'pending': {
              break;
            }
          }

          totalLatency += result.latency_ms;
          latencies.push(result.latency_ms);

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
          }
        }

        if (options.failFast && failures.length > 0) {
          break;
        }
      }
    } else {
      // Sequential execution
      for (const testCase of testCases) {
        const result = await this.executeTest(testCase, executionId, options);
        results.push(result);

        switch (result.status) {
          case 'passed': {passed++;
            break;
          }

          case 'failed': {failed++;
            break;
          }

          case 'error': {errors++;
            break;
          }

          case 'skipped': {skipped++;
            break;
          }

          case 'pending': {
            break;
          }
        }

        totalLatency += result.latency_ms;
        latencies.push(result.latency_ms);

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

          if (options.failFast) {
            break;
          }
        }
      }
    }

    // total_tests reports tests ACTUALLY EXECUTED, not the scheduled
    // count. Under `failFast: true` the loops break early and
    // `results.length < testCases.length`; using the scheduled count
    // there would (a) violate the invariant
    // total = passed + failed + errors + skipped and (b) skew avg_latency
    // and pass_rate by the unrun denominator.
    const totalTests = results.length;
    const avgLatency = totalTests > 0 ? Math.round(totalLatency / totalTests) : 0;
    const p95Latency = latencyPercentile(latencies, 95);
    const p99Latency = latencyPercentile(latencies, 99);
    const duration = Math.round(performance.now() - startTime);

    // Complete the test run
    await completeTestRun(executionId, {
      total_tests: totalTests,
      passed,
      failed,
      errors,
      skipped,
      avg_latency_ms: avgLatency,
      p95_latency_ms: p95Latency,
      p99_latency_ms: p99Latency,
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
      pass_rate: totalTests > 0 ? Math.round((passed / totalTests) * 10_000) / 100 : 0,
      avg_latency_ms: avgLatency,
      p95_latency_ms: p95Latency,
      p99_latency_ms: p99Latency,
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
    options: RunOptions,
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
      return result.data;
    }

    // Validate test case. Runners SHOULD return {valid: false, errors: [...]}
    // for any malformed input, but third-party runners registered via
    // registerRunner() could throw — same blast radius as a thrown execute()
    // would have without its catch below, so apply the symmetric protection.
    let validation: {valid: boolean; errors: string[]};
    try {
      validation = runner.validate(testCase);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const errorResult = await createTestResult({
        test_id: testCase.test_id,
        execution_id: executionId,
        requirement_id: testCase.requirement_id,
        status: 'error',
        actual_output: {validation_error: message},
        latency_ms: 0,
        error_message: `Runner.validate threw: ${message}`,
        assertions_passed: 0,
        assertions_failed: 0,
      });
      return errorResult.data;
    }

    if (!validation.valid) {
      const result = await createTestResult({
        test_id: testCase.test_id,
        execution_id: executionId,
        requirement_id: testCase.requirement_id,
        status: 'error',
        actual_output: {validation_errors: validation.errors},
        latency_ms: 0,
        error_message: `Validation failed: ${validation.errors.join(', ')}`,
        assertions_passed: 0,
        assertions_failed: 0,
      });
      return result.data;
    }

    // Execute test. Runners SHOULD return {status: 'error', ...} for
    // handled failures (network errors, API errors, etc.) but a bug or
    // unexpected throw would otherwise kill the whole orchestrator.run()
    // call — every other test in the batch loses its result. Catch and
    // convert into the same 'error' shape so the orchestrator stays
    // resilient and the failing test surfaces in the run summary.
    let executionResult: TestExecutionResult;
    try {
      executionResult = await runner.execute(testCase, options);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const errorResult = await createTestResult({
        test_id: testCase.test_id,
        execution_id: executionId,
        requirement_id: testCase.requirement_id,
        status: 'error',
        actual_output: {error: message},
        latency_ms: 0,
        error_message: `Runner threw: ${message}`,
        assertions_passed: 0,
        assertions_failed: 0,
      });
      return errorResult.data;
    }

    // Record result
    const result = await createTestResult({
      test_id: testCase.test_id,
      execution_id: executionId,
      requirement_id: testCase.requirement_id,
      ...executionResult,
    });

    return result.data;
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

function mergeTestCases(stored: TestCase[], extra: TestCase[]): TestCase[] {
  const out = [...stored];
  const known = new Set(stored.map(testCase => testCase.test_id));
  for (const testCase of extra) {
    if (!known.has(testCase.test_id)) {
      out.push(testCase);
      known.add(testCase.test_id);
    }
  }

  return out;
}

function latencyPercentile(values: number[], percentile: number): number {
  const sorted = values
    .filter(value => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }

  const rank = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
}

function buildTestFilterContext(options: OrchestratorOptions): Record<string, unknown> | undefined {
  const filter: Record<string, unknown> = {};
  if (options.type !== undefined) {
    filter.type = options.type;
  }

  if (options.tag !== undefined) {
    filter.tag = options.tag;
  }

  if (options.tags && options.tags.length > 0) {
    filter.tags = [...options.tags];
  }

  if (options.requirementId !== undefined) {
    filter.requirement_id = options.requirementId;
  }

  if (options.id !== undefined) {
    filter.id = options.id;
  }

  if (options.enabledOnly === false) {
    filter.enabled_only = false;
  }

  return Object.keys(filter).length > 0 ? filter : undefined;
}
