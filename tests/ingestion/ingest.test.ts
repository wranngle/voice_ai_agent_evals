/**
 * Test Ingestion Engine Tests
 *
 * Tests for the test ingestion engine that imports Vitest tests into the framework.
 */

import { describe, it, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { ingestTests, type IngestResult } from '../../lib/testing/ingestion/ingest';
import { clearAllDataSync, listTestCasesSync } from '../../lib/testing/local-storage';

const TEST_DIR = join(process.cwd(), '.test-ingestion-temp-' + Date.now());
const UNIQUE_STORAGE_DIR = join(process.cwd(), '.test-data-ingest-' + Date.now());

describe('Test Ingestion Engine', () => {
  beforeEach(() => {
    // Set unique storage dir to avoid conflicts with parallel tests
    process.env.TEST_STORAGE_DIR = UNIQUE_STORAGE_DIR;
    mkdirSync(UNIQUE_STORAGE_DIR, { recursive: true });
    // Create temp directory
    mkdirSync(TEST_DIR, { recursive: true });
    // Clear test data
    clearAllDataSync();
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    // Clear test data
    clearAllDataSync();
    try {
      rmSync(UNIQUE_STORAGE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    delete process.env.TEST_STORAGE_DIR;
  });

  describe('File Scanning', () => {
    test('should scan directory for test files', async () => {
      // Create test files
      writeFileSync(
        join(TEST_DIR, 'webhook.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Test', () => {
          it('should work', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      const result = await ingestTests({
        testDir: TEST_DIR,
        dryRun: true,
      });

      expect(result.filesScanned).toBe(1);
    });

    test('should match custom pattern', async () => {
      // Create files with different extensions
      writeFileSync(
        join(TEST_DIR, 'webhook.spec.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Test', () => {
          it('should work', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
        `
      );
      writeFileSync(
        join(TEST_DIR, 'webhook.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Test', () => {
          it('should work', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      const result = await ingestTests({
        testDir: TEST_DIR,
        pattern: /\.spec\.ts$/,
        dryRun: true,
      });

      expect(result.filesScanned).toBe(1);
    });

    test('should scan subdirectories', async () => {
      // Create nested structure
      const subDir = join(TEST_DIR, 'sub');
      mkdirSync(subDir, { recursive: true });

      writeFileSync(
        join(subDir, 'nested.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Test', () => {
          it('should work', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      const result = await ingestTests({
        testDir: TEST_DIR,
        dryRun: true,
      });

      expect(result.filesScanned).toBe(1);
      expect(result.filesWithTests).toBe(1);
    });

    test('should skip node_modules', async () => {
      // Create node_modules structure
      const nmDir = join(TEST_DIR, 'node_modules', 'some-package');
      mkdirSync(nmDir, { recursive: true });

      writeFileSync(
        join(nmDir, 'index.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Test', () => {
          it('should work', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      const result = await ingestTests({
        testDir: TEST_DIR,
        dryRun: true,
      });

      expect(result.filesScanned).toBe(0);
    });
  });

  describe('Test Discovery', () => {
    test('should skip files without webhook patterns', async () => {
      // Create a unit test file (no webhook helper)
      writeFileSync(
        join(TEST_DIR, 'unit.test.ts'),
        `
        describe('Unit tests', () => {
          it('should add numbers', () => {
            expect(1 + 1).toBe(2);
          });
        });
        `
      );

      const result = await ingestTests({
        testDir: TEST_DIR,
        dryRun: true,
      });

      expect(result.filesScanned).toBe(1);
      expect(result.filesWithTests).toBe(0);
    });

    test('should find tests with sendWebhook helper', async () => {
      writeFileSync(
        join(TEST_DIR, 'webhook.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Webhook Tests', () => {
          it('should process call', async () => {
            const response = await sendWebhook({
              agent_id: 'agent_123',
              call_status: 'completed',
            });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      const result = await ingestTests({
        testDir: TEST_DIR,
        dryRun: true,
      });

      expect(result.filesWithTests).toBe(1);
      expect(result.testsFound).toBe(1);
    });

    test('should find multiple tests in one file', async () => {
      writeFileSync(
        join(TEST_DIR, 'multi.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Multiple Tests', () => {
          it('test one', async () => {
            const response = await sendWebhook({ a: 1 });
            expect(response.status).toBe(200);
          });
          it('test two', async () => {
            const response = await sendWebhook({ b: 2 });
            expect(response.status).toBe(200);
          });
          it('test three', async () => {
            const response = await sendWebhook({ c: 3 });
            expect(response.status).toBe(201);
          });
        });
        `
      );

      const result = await ingestTests({
        testDir: TEST_DIR,
        dryRun: true,
      });

      expect(result.testsFound).toBe(3);
    });
  });

  describe('Test Case Creation', () => {
    test('should create test cases from ingested tests', async () => {
      writeFileSync(
        join(TEST_DIR, 'create.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook/test";
        describe('Creation Test', () => {
          it('should create test case', async () => {
            const response = await sendWebhook({
              agent_id: 'agent_xyz',
              status: 'active',
            });
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
          });
        });
        `
      );

      const result = await ingestTests({
        testDir: TEST_DIR,
        dryRun: false,
      });

      expect(result.testsCreated).toBe(1);
      expect(result.createdIds).toHaveLength(1);

      // Verify test case was created
      const testCases = listTestCasesSync();
      expect(testCases.length).toBe(1);
      expect(testCases[0].name).toBe('should create test case');
      expect(testCases[0].type).toBe('webhook');
    });

    test('should add ingested tag to created tests', async () => {
      writeFileSync(
        join(TEST_DIR, 'tags.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Tag Test', () => {
          it('should have tags', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      await ingestTests({
        testDir: TEST_DIR,
        dryRun: false,
      });

      const testCases = listTestCasesSync();
      expect(testCases[0].tags).toContain('ingested');
    });

    test('should add custom tags to created tests', async () => {
      writeFileSync(
        join(TEST_DIR, 'custom-tags.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Custom Tags', () => {
          it('should have custom tags', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      await ingestTests({
        testDir: TEST_DIR,
        tags: ['smoke', 'regression'],
        dryRun: false,
      });

      const testCases = listTestCasesSync();
      expect(testCases[0].tags).toContain('smoke');
      expect(testCases[0].tags).toContain('regression');
      expect(testCases[0].tags).toContain('ingested');
    });

    test('should add suite-based tag', async () => {
      writeFileSync(
        join(TEST_DIR, 'suite-tag.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Post-Call Webhook', () => {
          it('should have suite tag', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      await ingestTests({
        testDir: TEST_DIR,
        dryRun: false,
      });

      const testCases = listTestCasesSync();
      expect(testCases[0].tags).toContain('post-call-webhook');
    });
  });

  describe('Deduplication', () => {
    test('should skip duplicate tests', async () => {
      // Create first test file
      writeFileSync(
        join(TEST_DIR, 'first.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('First', () => {
          it('same test', async () => {
            const response = await sendWebhook({ agent_id: 'same', status: 'active' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      // First ingestion
      const result1 = await ingestTests({
        testDir: TEST_DIR,
        dryRun: false,
      });

      expect(result1.testsCreated).toBe(1);

      // Create second file with same payload
      writeFileSync(
        join(TEST_DIR, 'second.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Second', () => {
          it('same test different name', async () => {
            const response = await sendWebhook({ agent_id: 'same', status: 'active' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      // Second ingestion should skip duplicate
      const result2 = await ingestTests({
        testDir: TEST_DIR,
        dryRun: false,
      });

      expect(result2.testsSkipped).toBeGreaterThanOrEqual(1);
    });

    test('should create tests with different payloads', async () => {
      writeFileSync(
        join(TEST_DIR, 'different.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Different', () => {
          it('test one', async () => {
            const response = await sendWebhook({ agent_id: 'agent_1' });
            expect(response.status).toBe(200);
          });
          it('test two', async () => {
            const response = await sendWebhook({ agent_id: 'agent_2' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      const result = await ingestTests({
        testDir: TEST_DIR,
        dryRun: false,
      });

      expect(result.testsCreated).toBe(2);
      expect(result.testsSkipped).toBe(0);
    });
  });

  describe('Dry Run Mode', () => {
    test('should not create tests in dry run mode', async () => {
      writeFileSync(
        join(TEST_DIR, 'dryrun.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Dry Run', () => {
          it('should not be created', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      const result = await ingestTests({
        testDir: TEST_DIR,
        dryRun: true,
      });

      expect(result.testsCreated).toBe(1); // Count as would-be-created
      expect(result.createdIds).toHaveLength(0); // But no actual IDs

      const testCases = listTestCasesSync();
      expect(testCases.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should report error for tests without webhook URL', async () => {
      writeFileSync(
        join(TEST_DIR, 'no-url.test.ts'),
        `
        // No WEBHOOK_URL defined
        describe('No URL', () => {
          it('should error', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      const result = await ingestTests({
        testDir: TEST_DIR,
        dryRun: true,
      });

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('No webhook URL found');
    });

    test('should handle parse errors gracefully', async () => {
      writeFileSync(
        join(TEST_DIR, 'invalid.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Invalid', () => {
          it('unclosed block', async () => {
            const response = await sendWebhook({ field: 'value' });
        // Missing closing braces
        `
      );

      // Should not throw
      const result = await ingestTests({
        testDir: TEST_DIR,
        dryRun: true,
      });

      // Result should be returned (may have 0 tests or errors)
      expect(result).toBeDefined();
    });
  });

  describe('Test Input Conversion', () => {
    test('should set correct input structure', async () => {
      writeFileSync(
        join(TEST_DIR, 'input.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook/post-call";
        describe('Input Structure', () => {
          it('should have correct input', async () => {
            const response = await sendWebhook({
              agent_id: 'agent_test',
              call_status: 'completed',
              duration: 180,
            });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      await ingestTests({
        testDir: TEST_DIR,
        dryRun: false,
      });

      const testCases = listTestCasesSync();
      const input = testCases[0].input as { url: string; method: string; body: Record<string, unknown> };

      expect(input.url).toBe('https://example.com/webhook/post-call');
      expect(input.method).toBe('POST');
      expect(input.body.agent_id).toBe('agent_test');
      expect(input.body.call_status).toBe('completed');
      expect(input.body.duration).toBe(180);
    });

    test('should set expected output from assertions', async () => {
      writeFileSync(
        join(TEST_DIR, 'expected.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Expected Output', () => {
          it('should have expected output', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(201);
            expect(response.body.success).toBe(true);
            expect(response.body.processed).toBeTruthy();
          });
        });
        `
      );

      await ingestTests({
        testDir: TEST_DIR,
        dryRun: false,
      });

      const testCases = listTestCasesSync();
      const expectedOutput = testCases[0].expected_output as Record<string, unknown>;

      expect(expectedOutput.status).toBe(201);
      expect((expectedOutput.response_contains as Record<string, unknown>).success).toBe(true);
    });

    test('should include description with source file info', async () => {
      writeFileSync(
        join(TEST_DIR, 'desc.test.ts'),
        `
        const WEBHOOK_URL = "https://example.com/webhook";
        describe('Description Suite', () => {
          it('should have description', async () => {
            const response = await sendWebhook({ field: 'value' });
            expect(response.status).toBe(200);
          });
        });
        `
      );

      await ingestTests({
        testDir: TEST_DIR,
        dryRun: false,
      });

      const testCases = listTestCasesSync();
      expect(testCases[0].description).toContain('[Ingested from');
      expect(testCases[0].description).toContain('desc.test.ts');
      expect(testCases[0].description).toContain('Description Suite');
    });
  });
});
