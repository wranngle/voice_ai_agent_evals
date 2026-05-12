#!/usr/bin/env bun
/**
 * Health Check Script
 *
 * Runs all tests and outputs JSON result for n8n consumption.
 * Designed to be called via n8n Execute Command node.
 *
 * Usage: bun run scripts/health-check.ts
 *
 * Output: JSON with test results, suitable for n8n workflow processing
 */

import {runTests} from '../src/testing/runners/orchestrator';
import {discoverScenarioTestCases} from '../src/testing/scenarios';

type HealthCheckResult = {
  status: 'healthy' | 'degraded' | 'failing';
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    pass_rate: number;
    duration_ms: number;
    // Surfaced so n8n consumers can alert on latency regressions, not just
    // pass/fail. avg/p95/p99 are computed by the orchestrator over actually
    // executed tests in this run.
    avg_latency_ms: number;
    p95_latency_ms?: number;
    p99_latency_ms?: number;
  };
  failures: Array<{
    test_id: string;
    name: string;
    error: string;
  }>;
};

function healthStatusFor(result: {total_tests: number; failed: number; errors: number; pass_rate: number}): HealthCheckResult['status'] {
  if (result.total_tests === 0) {
    return 'failing';
  }

  if (result.failed === 0 && result.errors === 0) {
    return 'healthy';
  }

  return result.pass_rate >= 80 ? 'degraded' : 'failing';
}

async function main() {
  const startTime = Date.now();

  try {
    const result = await runTests({
      triggeredBy: 'scheduled',
      // Tag the run so history queries can distinguish health-check runs
      // from other scheduled invocations (parallel to scripts/ingest-and-run.ts).
      triggerSource: 'health-check',
      enabledOnly: true,
      extraTestCases: process.env.TEST_INCLUDE_SCENARIOS === '1'
        ? discoverScenarioTestCases()
        : [],
    });

    // A run with zero tests is almost always misconfiguration (wrong CWD,
    // missing test fixtures, missing TEST_INCLUDE_SCENARIOS, an empty
    // local-storage dir). Reporting "healthy" with zero coverage masks the
    // gap; surface it as "failing" so n8n alerts fire.
    const healthStatus: HealthCheckResult['status'] = healthStatusFor(result);

    const output: HealthCheckResult = {
      status: healthStatus,
      timestamp: new Date().toISOString(),
      summary: {
        total: result.total_tests,
        passed: result.passed,
        failed: result.failed,
        errors: result.errors,
        pass_rate: result.pass_rate,
        duration_ms: result.duration_ms,
        avg_latency_ms: result.avg_latency_ms,
        p95_latency_ms: result.p95_latency_ms,
        p99_latency_ms: result.p99_latency_ms,
      },
      failures: result.failures.map(f => ({
        test_id: f.test_id,
        name: f.name,
        error: f.error_message,
      })),
    };

    console.log(JSON.stringify(output, null, 2));

    // Exit code based on health status
    process.exit(healthStatus === 'healthy' ? 0 : 1);
  } catch (error) {
    const output: HealthCheckResult = {
      status: 'failing',
      timestamp: new Date().toISOString(),
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        errors: 1,
        pass_rate: 0,
        duration_ms: Date.now() - startTime,
        avg_latency_ms: 0,
      },
      failures: [{
        test_id: 'SYSTEM',
        name: 'Health Check',
        error: error instanceof Error ? error.message : String(error),
      }],
    };

    console.log(JSON.stringify(output, null, 2));
    process.exit(1);
  }
}

void main();
