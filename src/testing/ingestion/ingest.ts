/**
 * Test Ingestion Engine
 *
 * Ingests existing Vitest test files into the testing framework.
 * Handles parsing, deduplication, and creation of framework test cases.
 */

import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative} from 'node:path';
import {
  createTestCase,
  listTestCases,
} from '../local-storage';
import {type TestCase, type WebhookTestInput} from '../types';
import {parseVitestFile, type ParsedTest} from './vitest-parser';

export type IngestOptions = {
  /** Directory to scan for test files */
  testDir: string;
  /** File pattern to match (default: *.test.ts) */
  pattern?: RegExp;
  /** Tags to add to ingested tests */
  tags?: string[];
  /** Dry run - don't create test cases */
  dryRun?: boolean;
  /** Verbose output */
  verbose?: boolean;
};

export type IngestResult = {
  /** Total files scanned */
  filesScanned: number;
  /** Files with parseable tests */
  filesWithTests: number;
  /** Total tests found */
  testsFound: number;
  /** Tests created (after dedup) */
  testsCreated: number;
  /** Tests skipped (duplicates) */
  testsSkipped: number;
  /** Errors encountered */
  errors: string[];
  /** Created test IDs */
  createdIds: string[];
};

/**
 * Generate a deduplication key for a test
 */
function getTestKey(webhookUrl: string, payload: Record<string, unknown>): string {
  return `${webhookUrl}::${stableJson(payload)}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableJson(item)).join(',')}]`;
  }

  if (isRecord(value)) {
    const entries = Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function existingWebhookKeys(existingTests: TestCase[]): Set<string> {
  const keys = new Set<string>();
  for (const existing of existingTests) {
    if (existing.type !== 'webhook') {
      continue;
    }

    const input = existing.input as unknown as WebhookTestInput;
    if (!input.url || !input.body) {
      continue;
    }

    const existingKey = getTestKey(input.url, input.body);
    keys.add(existingKey);
  }

  return keys;
}

/**
 * Convert a parsed test to framework test case input
 */
function convertToTestCase(parsed: ParsedTest, tags: string[]): Parameters<typeof createTestCase>[0] {
  // Build expected output
  const expectedOutput: Record<string, unknown> = {};

  if (parsed.expectedStatus) {
    expectedOutput.status = parsed.expectedStatus;
  }

  if (Object.keys(parsed.expectedResponse).length > 0) {
    expectedOutput.body_contains = parsed.expectedResponse;
  }

  if (Object.keys(parsed.arrayContains).length > 0) {
    expectedOutput.body_array_contains = parsed.arrayContains;
  }

  if (parsed.truthyFields.length > 0) {
    expectedOutput.body_truthy = [...parsed.truthyFields];
  }

  if (parsed.falsyFields.length > 0) {
    expectedOutput.body_falsy = [...parsed.falsyFields];
  }

  if (parsed.definedFields.length > 0) {
    expectedOutput.body_defined = [...parsed.definedFields];
  }

  // Build description from suite + name
  const description = `[Ingested from ${parsed.sourceFile}:${parsed.lineNumber}] ${parsed.suite} - ${parsed.name}`;

  // Build tags
  const allTags = [...tags, 'ingested'];

  // Add suite-based tag
  const suiteTag = parsed.suite
    .toLowerCase()
    .replaceAll(/[^a-z\d]+/g, '-')
    .replaceAll(/^-|-$/g, '');
  if (suiteTag) {
    allTags.push(suiteTag);
  }

  return {
    type: 'webhook',
    name: parsed.name,
    description,
    input: {
      url: parsed.webhookUrl || '',
      method: parsed.method,
      body: parsed.payload,
    },
    expected_output: expectedOutput,
    tags: allTags,
    enabled: true,
  };
}

/**
 * Scan a directory for test files
 */
function scanTestFiles(dir: string, pattern: RegExp): string[] {
  const files: string[] = [];

  function scan(currentDir: string) {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory() && entry !== 'node_modules') {
        scan(fullPath);
      } else if (stat.isFile() && pattern.test(entry)) {
        files.push(fullPath);
      }
    }
  }

  scan(dir);
  return files;
}

/**
 * Ingest test files into the framework
 */
export async function ingestTests(options: IngestOptions): Promise<IngestResult> {
  const result: IngestResult = {
    filesScanned: 0,
    filesWithTests: 0,
    testsFound: 0,
    testsCreated: 0,
    testsSkipped: 0,
    errors: [],
    createdIds: [],
  };

  const pattern = options.pattern || /\.test\.ts$/;
  const tags = options.tags || [];

  // Find test files
  const testFiles = scanTestFiles(options.testDir, pattern);
  result.filesScanned = testFiles.length;

  if (options.verbose) {
    console.log(`Found ${testFiles.length} test files`);
  }

  // Get existing tests for deduplication
  const existingResult = await listTestCases({type: 'webhook'});
  const existingTests = existingResult.data || [];
  const knownWebhookKeys = existingWebhookKeys(existingTests);

  if (options.verbose) {
    console.log(`Existing webhook tests: ${existingTests.length}`);
  }

  // Process each file
  for (const filePath of testFiles) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const relativePath = relative(process.cwd(), filePath);

      // Skip files without webhook patterns
      const hasWebhookHelper = /(?:sendWebhook|callWebhook|postWebhook|webhookCall)\s*\(/.test(content);
      const hasWebhookUrl = /(?:WEBHOOK_URL|N8N_WEBHOOK_URL|API_URL|ENDPOINT_URL)\s*[=:]/.test(content);
      if (!hasWebhookHelper && !hasWebhookUrl) {
        continue;
      }

      const parseResult = parseVitestFile(content, relativePath);

      if (parseResult.tests.length === 0) {
        continue;
      }

      result.filesWithTests++;
      result.testsFound += parseResult.tests.length;

      if (options.verbose) {
        console.log(`\n${relativePath}: ${parseResult.tests.length} tests`);
      }

      // Process each test
      for (const parsed of parseResult.tests) {
        // Skip if no webhook URL
        if (!parsed.webhookUrl) {
          result.errors.push(`${relativePath}:${parsed.lineNumber} - No webhook URL found`);
          continue;
        }

        // Check for duplicates
        const testKey = getTestKey(parsed.webhookUrl, parsed.payload);
        const duplicate = knownWebhookKeys.has(testKey);
        if (duplicate) {
          result.testsSkipped++;
          if (options.verbose) {
            console.log(`  ⏭️  Skipped (duplicate): ${parsed.name}`);
          }

          continue;
        }

        // Convert and create
        const testCaseInput = convertToTestCase(parsed, tags);

        if (options.dryRun) {
          if (options.verbose) {
            console.log(`  📝 Would create: ${parsed.name}`);
          }

          result.testsCreated++;
          knownWebhookKeys.add(testKey);
        } else {
          const createResult = await createTestCase(testCaseInput);
          if (createResult.success && createResult.data) {
            result.createdIds.push(createResult.data.test_id);
            result.testsCreated++;
            knownWebhookKeys.add(testKey);
            if (options.verbose) {
              console.log(`  ✅ Created: ${parsed.name} (${createResult.data.test_id})`);
            }
          } else {
            result.errors.push(`Failed to create: ${parsed.name}`);
          }
        }
      }
    } catch (error) {
      result.errors.push(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

/**
 * Ingest and run all tests
 */
export async function ingestAndRun(options: IngestOptions): Promise<{
  ingestion: IngestResult;
  testIds: string[];
}> {
  const ingestion = await ingestTests(options);
  return {
    ingestion,
    testIds: ingestion.createdIds,
  };
}
