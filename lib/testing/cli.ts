#!/usr/bin/env bun
/**
 * Test Framework CLI
 *
 * Command-line interface for running n8n workflow and voice agent tests.
 *
 * Usage:
 *   bun run lib/testing/cli.ts [command] [options]
 *
 * Commands:
 *   run          Run tests (default)
 *   list         List available tests
 *   validate     Validate test configurations
 *   report       Generate test report
 *   ingest       Ingest tests from Vitest files
 *
 * Options:
 *   --type       Filter by test type (webhook, elevenlabs, n8n-eval, mcp)
 *   --tag        Filter by tag (can be used multiple times)
 *   --id         Run specific test by ID
 *   --fail-fast  Stop on first failure
 *   --timeout    Override default timeout (ms)
 *   --json       Output results as JSON
 *   --verbose    Show detailed output
 *   --help       Show help
 */

import { parseArgs } from 'util';
import { join } from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import {
  orchestrator,
  listTestCases,
  getTestCase,
  clearAllDataSync,
  listTestRuns,
  getResultsByRun,
} from './index';
import { ingestTests } from './ingestion';
import type { TestType, TestCase, TestRunSummary } from './types';

/**
 * Discover scenario YAMLs in tests/scenarios/<id>/scenario.yaml.
 * Returns a list of synthetic TestCase-shaped records so they appear in
 * `testing:list` even before they've been ingested into local-storage.
 * The leading "_template" directory is skipped.
 */
function discoverScenarios(rootDir = process.cwd()): TestCase[] {
  const scenariosDir = join(rootDir, 'tests', 'scenarios');
  if (!existsSync(scenariosDir)) return [];
  const out: TestCase[] = [];
  for (const entry of readdirSync(scenariosDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith('_')) continue; // skip _template
    const scenarioFile = join(scenariosDir, entry.name, 'scenario.yaml');
    if (!existsSync(scenarioFile)) continue;
    const raw = readFileSync(scenarioFile, 'utf-8');
    // Lightweight YAML parse — extract `description:` line without pulling a yaml dep.
    const descMatch = raw.match(/^description:\s*(.+)$/m);
    const description = descMatch ? descMatch[1].trim() : '';
    out.push({
      test_id: `SCEN-${entry.name}`,
      type: 'elevenlabs' as TestType,
      name: entry.name,
      description,
      input: { scenarioPath: scenarioFile },
      expected_output: {},
      tags: ['scenario'],
      enabled: true,
      created_at: new Date(statSync(scenarioFile).mtime).toISOString(),
      updated_at: new Date(statSync(scenarioFile).mtime).toISOString(),
    } as TestCase);
  }
  return out;
}

// ANSI colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

interface CliOptions {
  command: string;
  type?: TestType;
  tags: string[];
  id?: string;
  failFast: boolean;
  timeout?: number;
  json: boolean;
  verbose: boolean;
  help: boolean;
  dir?: string;
}

function parseCliArgs(): CliOptions {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      type: { type: 'string', short: 't' },
      tag: { type: 'string', short: 'g', multiple: true },
      id: { type: 'string' },
      'fail-fast': { type: 'boolean', short: 'f' },
      timeout: { type: 'string' },
      json: { type: 'boolean', short: 'j' },
      verbose: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
      dir: { type: 'string', short: 'd' },
    },
  });

  return {
    command: positionals[0] || 'run',
    type: values.type as TestType | undefined,
    tags: (values.tag as string[]) || [],
    id: values.id as string | undefined,
    failFast: values['fail-fast'] || false,
    timeout: values.timeout ? parseInt(values.timeout as string, 10) : undefined,
    json: values.json || false,
    verbose: values.verbose || false,
    help: values.help || false,
    dir: values.dir as string | undefined,
  };
}

function showHelp(): void {
  console.log(`
${C.bold}n8n Testing Framework CLI${C.reset}

${C.cyan}Usage:${C.reset}
  bun run lib/testing/cli.ts [command] [options]

${C.cyan}Commands:${C.reset}
  run          Run tests (default)
  list         List available tests
  validate     Validate test configurations
  report       Generate test report from last run
  ingest       Ingest tests from Vitest files
  clear        Clear all test data

${C.cyan}Options:${C.reset}
  -t, --type <type>    Filter by test type (webhook, elevenlabs, n8n-eval, mcp)
  -g, --tag <tag>      Filter by tag (can be used multiple times)
      --id <id>        Run specific test by ID
  -f, --fail-fast      Stop on first failure
      --timeout <ms>   Override default timeout (milliseconds)
  -d, --dir <path>     Directory for ingest command (default: tests/)
  -j, --json           Output results as JSON
  -v, --verbose        Show detailed output
  -h, --help           Show this help

${C.cyan}Examples:${C.reset}
  bun run lib/testing/cli.ts run                    # Run all tests
  bun run lib/testing/cli.ts run -t webhook         # Run webhook tests only
  bun run lib/testing/cli.ts run -g smoke           # Run tests tagged 'smoke'
  bun run lib/testing/cli.ts run --id TC-001        # Run specific test
  bun run lib/testing/cli.ts list                   # List all tests
  bun run lib/testing/cli.ts list -t elevenlabs     # List ElevenLabs tests
  bun run lib/testing/cli.ts validate               # Validate all test configs
  bun run lib/testing/cli.ts ingest                 # Ingest from tests/
  bun run lib/testing/cli.ts ingest -d tests/webhook  # Ingest from specific dir

${C.cyan}Environment Variables:${C.reset}
  N8N_API_URL          n8n API URL (default: https://your-n8n-host.example.com/api/v1)
  N8N_API_KEY          n8n API key (required for n8n tests)
  ELEVENLABS_API_KEY   ElevenLabs API key (required for voice agent tests)
`);
}

async function runTests(options: CliOptions): Promise<number> {
  const startTime = Date.now();

  if (options.verbose) {
    console.log(`${C.cyan}Starting test run...${C.reset}\n`);
  }

  try {
    const summary = await orchestrator.run({
      type: options.type,
      tags: options.tags.length > 0 ? options.tags : undefined,
      failFast: options.failFast,
      timeout: options.timeout,
    });

    if (options.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      printSummary(summary, options.verbose);
    }

    return summary.failed > 0 || summary.errors > 0 ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      console.error(`${C.red}Error: ${message}${C.reset}`);
    }
    return 1;
  }
}

function printSummary(summary: TestRunSummary, verbose: boolean): void {
  const duration = summary.duration_ms;
  const total = summary.total_tests;
  const passed = summary.passed;
  const failed = summary.failed;
  const errors = summary.errors;
  const skipped = summary.skipped;

  console.log(`\n${C.bold}═══════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}                   TEST RESULTS                      ${C.reset}`);
  console.log(`${C.bold}═══════════════════════════════════════════════════${C.reset}\n`);

  // Results by status
  if (passed > 0) {
    console.log(`  ${C.green}✓ Passed:${C.reset}  ${passed}`);
  }
  if (failed > 0) {
    console.log(`  ${C.red}✗ Failed:${C.reset}  ${failed}`);
  }
  if (errors > 0) {
    console.log(`  ${C.yellow}⚠ Errors:${C.reset}  ${errors}`);
  }
  if (skipped > 0) {
    console.log(`  ${C.dim}○ Skipped:${C.reset} ${skipped}`);
  }

  console.log(`  ${C.dim}─────────────────${C.reset}`);
  console.log(`  ${C.bold}Total:${C.reset}    ${total}`);

  // Timing
  console.log(`\n  ${C.dim}Duration: ${(duration / 1000).toFixed(2)}s${C.reset}`);

  // Overall status
  const allPassed = failed === 0 && errors === 0;
  if (allPassed) {
    console.log(`\n${C.green}${C.bold}  ✓ All tests passed!${C.reset}\n`);
  } else {
    console.log(`\n${C.red}${C.bold}  ✗ Some tests failed${C.reset}\n`);
  }

  // Show failed tests details if verbose
  if (verbose && (failed > 0 || errors > 0)) {
    console.log(`${C.bold}Failed Tests:${C.reset}`);
    // Would need to fetch results from storage to show details
    console.log(`  ${C.dim}(Use --json for detailed failure information)${C.reset}\n`);
  }
}

async function listTests(options: CliOptions): Promise<number> {
  try {
    const result = await listTestCases({
      type: options.type,
    });
    let tests = result.data || [];

    // Augment with scenarios discovered from tests/scenarios/<id>/scenario.yaml
    // so a fresh checkout shows the canonical scenarios even before they've
    // been ingested into local-storage. Skipped when tests are using an
    // isolated storage dir (TEST_STORAGE_DIR) so cli.test.ts fixtures stay
    // deterministic.
    if (!process.env.TEST_STORAGE_DIR) {
      const scenarios = discoverScenarios();
      const known = new Set(tests.map(t => t.test_id));
      for (const s of scenarios) {
        if (!known.has(s.test_id)) tests.push(s);
      }
    }

    // Filter by tags
    if (options.tags.length > 0) {
      tests = tests.filter(t =>
        options.tags.some(tag => t.tags.includes(tag))
      );
    }

    if (options.json) {
      console.log(JSON.stringify(tests, null, 2));
    } else {
      printTestList(tests);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      console.error(`${C.red}Error: ${message}${C.reset}`);
    }
    return 1;
  }
}

function printTestList(tests: TestCase[]): void {
  console.log(`\n${C.bold}Available Tests (${tests.length})${C.reset}\n`);

  if (tests.length === 0) {
    console.log(`  ${C.dim}No tests found${C.reset}\n`);
    return;
  }

  // Group by type
  const byType = new Map<string, TestCase[]>();
  for (const test of tests) {
    const type = test.type;
    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type)!.push(test);
  }

  for (const [type, typeTests] of byType) {
    console.log(`${C.cyan}${type}${C.reset} (${typeTests.length})`);
    for (const test of typeTests) {
      const status = test.enabled ? C.green + '●' : C.dim + '○';
      const tags = test.tags.length > 0 ? C.dim + ` [${test.tags.join(', ')}]` + C.reset : '';
      console.log(`  ${status}${C.reset} ${test.test_id} - ${test.name}${tags}`);
    }
    console.log();
  }
}

async function validateTests(options: CliOptions): Promise<number> {
  try {
    const result = await listTestCases({
      type: options.type,
    });
    const tests = result.data || [];

    const results: Array<{ test_id: string; valid: boolean; errors: string[] }> = [];
    let hasErrors = false;

    for (const test of tests) {
      const runner = orchestrator.getRunner(test.type);
      if (!runner) {
        results.push({
          test_id: test.test_id,
          valid: false,
          errors: [`No runner registered for type: ${test.type}`],
        });
        hasErrors = true;
        continue;
      }

      const validation = runner.validate(test);
      results.push({
        test_id: test.test_id,
        valid: validation.valid,
        errors: validation.errors,
      });

      if (!validation.valid) {
        hasErrors = true;
      }
    }

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      printValidationResults(results);
    }

    return hasErrors ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      console.error(`${C.red}Error: ${message}${C.reset}`);
    }
    return 1;
  }
}

function printValidationResults(
  results: Array<{ test_id: string; valid: boolean; errors: string[] }>
): void {
  console.log(`\n${C.bold}Validation Results${C.reset}\n`);

  const valid = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);

  if (valid.length > 0) {
    console.log(`${C.green}✓ Valid (${valid.length}):${C.reset}`);
    for (const result of valid) {
      console.log(`  ${C.green}●${C.reset} ${result.test_id}`);
    }
    console.log();
  }

  if (invalid.length > 0) {
    console.log(`${C.red}✗ Invalid (${invalid.length}):${C.reset}`);
    for (const result of invalid) {
      console.log(`  ${C.red}●${C.reset} ${result.test_id}`);
      for (const error of result.errors) {
        console.log(`    ${C.dim}└─${C.reset} ${error}`);
      }
    }
    console.log();
  }

  const allValid = invalid.length === 0;
  if (allValid) {
    console.log(`${C.green}All ${results.length} tests are valid${C.reset}\n`);
  } else {
    console.log(`${C.red}${invalid.length} of ${results.length} tests have validation errors${C.reset}\n`);
  }
}

async function showReport(options: CliOptions): Promise<number> {
  try {
    const runsResult = await listTestRuns();
    const runs = runsResult.data || [];

    if (runs.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'No test runs found' }));
      } else {
        console.log(`${C.yellow}No test runs found${C.reset}`);
      }
      return 0;
    }

    // Get the most recent run
    const latestRun = runs.sort((a, b) =>
      new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    )[0];

    const resultsResult = await getResultsByRun(latestRun.execution_id);
    const results = resultsResult.data || [];

    const report = {
      run: latestRun,
      results,
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'passed').length,
        failed: results.filter(r => r.status === 'failed').length,
        errors: results.filter(r => r.status === 'error').length,
        skipped: results.filter(r => r.status === 'skipped').length,
      },
    };

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      console.error(`${C.red}Error: ${message}${C.reset}`);
    }
    return 1;
  }
}

function printReport(report: {
  run: { execution_id: string; started_at: string; completed_at?: string };
  results: Array<{ test_id: string; status: string; latency_ms: number }>;
  summary: { total: number; passed: number; failed: number; errors: number; skipped: number };
}): void {
  console.log(`\n${C.bold}═══════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}                   TEST REPORT                       ${C.reset}`);
  console.log(`${C.bold}═══════════════════════════════════════════════════${C.reset}\n`);

  console.log(`${C.cyan}Run ID:${C.reset}     ${report.run.execution_id}`);
  console.log(`${C.cyan}Started:${C.reset}    ${new Date(report.run.started_at).toLocaleString()}`);
  const status = report.run.completed_at ? 'completed' : 'running';
  console.log(`${C.cyan}Status:${C.reset}     ${status}`);

  console.log(`\n${C.bold}Summary:${C.reset}`);
  console.log(`  ${C.green}Passed:${C.reset}  ${report.summary.passed}`);
  console.log(`  ${C.red}Failed:${C.reset}  ${report.summary.failed}`);
  console.log(`  ${C.yellow}Errors:${C.reset}  ${report.summary.errors}`);
  console.log(`  ${C.dim}Skipped:${C.reset} ${report.summary.skipped}`);
  console.log(`  ${C.bold}Total:${C.reset}   ${report.summary.total}`);

  if (report.results.length > 0) {
    console.log(`\n${C.bold}Results:${C.reset}`);
    for (const result of report.results) {
      const statusIcon = result.status === 'passed' ? C.green + '✓' :
                         result.status === 'failed' ? C.red + '✗' :
                         result.status === 'error' ? C.yellow + '⚠' :
                         C.dim + '○';
      console.log(`  ${statusIcon}${C.reset} ${result.test_id} (${result.latency_ms}ms)`);
    }
  }

  console.log();
}

async function clearData(options: CliOptions): Promise<number> {
  try {
    clearAllDataSync();
    if (options.json) {
      console.log(JSON.stringify({ success: true, message: 'All test data cleared' }));
    } else {
      console.log(`${C.green}✓ All test data cleared${C.reset}`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      console.error(`${C.red}Error: ${message}${C.reset}`);
    }
    return 1;
  }
}

async function ingestTestsCmd(options: CliOptions): Promise<number> {
  try {
    const testDir = options.dir || join(process.cwd(), 'tests');

    if (!options.json) {
      console.log(`\n${C.cyan}Ingesting tests from: ${testDir}${C.reset}\n`);
    }

    const result = await ingestTests({
      testDir,
      pattern: /\.test\.ts$/,
      tags: options.tags.length > 0 ? options.tags : ['ingested'],
      verbose: options.verbose && !options.json,
    });

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`\n${C.bold}Ingestion Summary:${C.reset}`);
      console.log(`  ${C.dim}Files scanned:${C.reset}    ${result.filesScanned}`);
      console.log(`  ${C.dim}Files with tests:${C.reset} ${result.filesWithTests}`);
      console.log(`  ${C.dim}Tests found:${C.reset}      ${result.testsFound}`);
      console.log(`  ${C.green}Tests created:${C.reset}    ${result.testsCreated}`);
      console.log(`  ${C.yellow}Tests skipped:${C.reset}    ${result.testsSkipped} (duplicates)`);

      if (result.errors.length > 0) {
        console.log(`\n  ${C.red}Errors (${result.errors.length}):${C.reset}`);
        for (const err of result.errors) {
          console.log(`    ${C.dim}└─${C.reset} ${err}`);
        }
      }

      console.log();
    }

    return result.errors.length > 0 ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.json) {
      console.log(JSON.stringify({ error: message }));
    } else {
      console.error(`${C.red}Error: ${message}${C.reset}`);
    }
    return 1;
  }
}

async function main(): Promise<void> {
  const options = parseCliArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  let exitCode: number;

  switch (options.command) {
    case 'run':
      exitCode = await runTests(options);
      break;
    case 'list':
      exitCode = await listTests(options);
      break;
    case 'validate':
      exitCode = await validateTests(options);
      break;
    case 'report':
      exitCode = await showReport(options);
      break;
    case 'clear':
      exitCode = await clearData(options);
      break;
    case 'ingest':
      exitCode = await ingestTestsCmd(options);
      break;
    default:
      console.log(`${C.red}Unknown command: ${options.command}${C.reset}`);
      console.log(`\nRun with --help for usage information.`);
      exitCode = 1;
  }

  process.exit(exitCode);
}

main().catch(error => {
  console.error(`${C.red}Fatal error: ${error.message}${C.reset}`);
  process.exit(1);
});
