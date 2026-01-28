/**
 * Test Ingestion & Execution Script
 *
 * Ingests all existing Vitest webhook tests into the framework,
 * deduplicates, and runs the full suite.
 *
 * Run: bun run scripts/ingest-and-run.ts
 */

import { join } from 'path';
import { ingestTests } from '../lib/testing/ingestion';
import { clearAllDataSync, runTests, listTestCases } from '../lib/testing';

async function main() {
  console.log('🔄 Test Ingestion & Execution\n');
  console.log('═'.repeat(60));

  // Clear existing test data for clean run
  console.log('\n📋 Clearing existing test data...');
  clearAllDataSync();

  // Ingest tests from webhook directory
  console.log('\n📥 Ingesting tests from tests/webhook/...\n');

  const ingestionResult = await ingestTests({
    testDir: join(process.cwd(), 'tests', 'webhook'),
    pattern: /\.test\.ts$/,
    tags: ['webhook', 'ingested'],
    verbose: true,
  });

  console.log('\n' + '─'.repeat(60));
  console.log('\n📊 Ingestion Summary:\n');
  console.log(`  Files scanned:    ${ingestionResult.filesScanned}`);
  console.log(`  Files with tests: ${ingestionResult.filesWithTests}`);
  console.log(`  Tests found:      ${ingestionResult.testsFound}`);
  console.log(`  Tests created:    ${ingestionResult.testsCreated}`);
  console.log(`  Tests skipped:    ${ingestionResult.testsSkipped} (duplicates)`);

  if (ingestionResult.errors.length > 0) {
    console.log(`\n  ⚠️  Errors (${ingestionResult.errors.length}):`);
    for (const err of ingestionResult.errors) {
      console.log(`     - ${err}`);
    }
  }

  // List all ingested tests
  console.log('\n' + '═'.repeat(60));
  console.log('\n📝 Ingested Test Cases:\n');

  const casesResult = await listTestCases({ tag: 'ingested' });
  const cases = casesResult.data || [];

  for (const tc of cases) {
    console.log(`  [${tc.test_id}] ${tc.name}`);
  }

  // Run all ingested tests
  console.log('\n' + '═'.repeat(60));
  console.log('\n🚀 Running all ingested tests...\n');

  const summary = await runTests({
    tags: ['ingested'],
    triggeredBy: 'manual',
    triggerSource: 'ingest-and-run',
  });

  // Display results
  console.log('═'.repeat(60));
  console.log('\n📈 Test Run Summary\n');
  console.log(`  Execution ID: ${summary.execution_id}`);
  console.log(`  Duration:     ${summary.duration_ms}ms`);
  console.log(`  Total Tests:  ${summary.total_tests}`);
  console.log(`  ✅ Passed:    ${summary.passed}`);
  console.log(`  ❌ Failed:    ${summary.failed}`);
  console.log(`  ⚠️  Errors:    ${summary.errors}`);
  console.log(`  ⏭️  Skipped:   ${summary.skipped}`);
  console.log(`  📊 Pass Rate: ${summary.pass_rate}%`);
  console.log(`  ⏱️  Avg Latency: ${summary.avg_latency_ms}ms`);

  if (summary.slowest_test) {
    console.log(`\n  🐢 Slowest: ${summary.slowest_test.name} (${summary.slowest_test.latency_ms}ms)`);
  }

  if (summary.failures.length > 0) {
    console.log('\n  ❌ Failures:');
    for (const f of summary.failures) {
      console.log(`     - ${f.name}`);
      console.log(`       ${f.error_message}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('\n✨ Complete!\n');

  // Exit with appropriate code
  process.exit(summary.failed > 0 || summary.errors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
