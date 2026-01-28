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

import { runTests } from '../lib/testing/runners/orchestrator';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'failing';
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    errors: number;
    pass_rate: number;
    duration_ms: number;
  };
  failures: Array<{
    test_id: string;
    name: string;
    error: string;
  }>;
}

async function main() {
  const startTime = Date.now();

  try {
    const result = await runTests({
      triggeredBy: 'scheduled',
      enabledOnly: true,
    });

    const healthStatus: HealthCheckResult['status'] =
      result.failed === 0 && result.errors === 0 ? 'healthy' :
      result.pass_rate >= 80 ? 'degraded' : 'failing';

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

main();
