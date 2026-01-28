/**
 * Test Ingestion Engine
 *
 * Ingests existing Vitest test files into the testing framework.
 * Handles parsing, deduplication, and creation of framework test cases.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { parseVitestFile, type ParsedTest } from './vitest-parser';
import {
  createTestCase,
  listTestCases,
  type TestCase,
} from '../local-storage';
import type { WebhookTestInput } from '../types';

export interface IngestOptions {
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
}

export interface IngestResult {
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
}

/**
 * Generate a deduplication key for a test
 */
function getTestKey(webhookUrl: string, payload: Record<string, unknown>): string {
  // Key based on URL + sorted payload fields
  const payloadKey = Object.keys(payload)
    .sort()
    .map((k) => `${k}:${JSON.stringify(payload[k])}`)
    .join('|');
  return `${webhookUrl}::${payloadKey}`;
}

/**
 * Check if a test already exists in the framework
 */
async function isDuplicate(
  webhookUrl: string,
  payload: Record<string, unknown>,
  existingTests: TestCase[]
): Promise<boolean> {
  const newKey = getTestKey(webhookUrl, payload);

  for (const existing of existingTests) {
    if (existing.type !== 'webhook') continue;
    const input = existing.input as WebhookTestInput;
    if (!input.url || !input.body) continue;

    const existingKey = getTestKey(input.url, input.body as Record<string, unknown>);
    if (existingKey === newKey) {
      return true;
    }
  }

  return false;
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
    expectedOutput.response_contains = parsed.expectedResponse;
  }

  // Handle truthy/falsy/defined assertions
  // These need special handling in the runner, for now add to response_contains
  for (const field of parsed.truthyFields) {
    if (!expectedOutput.response_contains) {
      expectedOutput.response_contains = {};
    }
    // Truthy means the field should exist and be truthy
    (expectedOutput.response_contains as Record<string, unknown>)[`${field}__truthy`] = true;
  }

  for (const field of parsed.falsyFields) {
    if (!expectedOutput.response_contains) {
      expectedOutput.response_contains = {};
    }
    (expectedOutput.response_contains as Record<string, unknown>)[`${field}__falsy`] = true;
  }

  // Build description from suite + name
  const description = `[Ingested from ${parsed.sourceFile}:${parsed.lineNumber}] ${parsed.suite} - ${parsed.name}`;

  // Build tags
  const allTags = [...tags, 'ingested'];

  // Add suite-based tag
  const suiteTag = parsed.suite
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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
  const existingResult = await listTestCases({ type: 'webhook' });
  const existingTests = existingResult.data || [];

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
        const duplicate = await isDuplicate(parsed.webhookUrl, parsed.payload, existingTests);
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
        } else {
          const createResult = await createTestCase(testCaseInput);
          if (createResult.success && createResult.data) {
            result.createdIds.push(createResult.data.test_id);
            result.testsCreated++;
            // Add to existing for dedup within same run
            existingTests.push(createResult.data);
            if (options.verbose) {
              console.log(`  ✅ Created: ${parsed.name} (${createResult.data.test_id})`);
            }
          } else {
            result.errors.push(`Failed to create: ${parsed.name}`);
          }
        }
      }
    } catch (err) {
      result.errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
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
