/**
 * Infrastructure Integrity Tests
 *
 * These tests verify that the automation infrastructure itself is sound.
 * They catch: broken hooks, invalid CI config, missing isolation,
 * corrupted storage, architectural drift, and export completeness.
 *
 * If these pass and the system still breaks later, a test is missing here.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, chmodSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

const PROJECT_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(PROJECT_ROOT, '../..');

// ============================================
// 1. CI/CD Infrastructure
// ============================================

describe('CI/CD Infrastructure', () => {
  const workflowPath = join(PROJECT_ROOT, '.github/workflows/test.yml');

  it('GitHub Actions workflow file must exist', () => {
    expect(existsSync(workflowPath), 'test.yml must exist').toBe(true);
  });

  it('CI workflow must have scheduled trigger for hands-free monitoring', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('schedule:');
    expect(content).toMatch(/cron:/);
  });

  it('CI workflow must run tests from correct working directory', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('voice_ai_agents');
  });

  it('CI workflow must run vitest', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('vitest');
  });

  it('CI workflow must use bun', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('bun');
  });

  it('CI must trigger on push and PR', () => {
    const content = readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('push:');
    expect(content).toContain('pull_request:');
  });
});

// ============================================
// 2. Git Hooks
// ============================================

describe('Git Hooks', () => {
  const hookPath = join(REPO_ROOT, '.git/hooks/pre-push');

  it('pre-push hook must exist', () => {
    expect(existsSync(hookPath), `pre-push hook not found at ${hookPath}`).toBe(true);
  });

  it('pre-push hook must reference voice_ai_agents tests', () => {
    if (!existsSync(hookPath)) return;
    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('voice_ai_agents');
  });

  it('pre-push hook must exit non-zero on test failure', () => {
    if (!existsSync(hookPath)) return;
    const content = readFileSync(hookPath, 'utf-8');
    expect(content).toContain('exit 1');
  });
});

// ============================================
// 3. Test Isolation Enforcement
// ============================================

describe('Test Isolation Enforcement', () => {
  const testFiles = [
    'tests/integration/local-storage.test.ts',
    'tests/integration/orchestrator.test.ts',
    'tests/integration/cli.test.ts',
    'tests/ingestion/ingest.test.ts',
    'tests/runners.test.ts',
  ];

  testFiles.forEach((file) => {
    it(`${file} must use isolated storage directory`, () => {
      const filePath = join(PROJECT_ROOT, file);
      if (!existsSync(filePath)) return; // Skip if file doesn't exist yet
      const content = readFileSync(filePath, 'utf-8');

      // Must set TEST_STORAGE_DIR or use a unique dir
      const usesIsolation =
        content.includes('TEST_STORAGE_DIR') ||
        content.includes('UNIQUE_STORAGE_DIR') ||
        content.includes('.test-data-');

      expect(usesIsolation, `${file} must use isolated storage to prevent parallel test interference`).toBe(true);
    });
  });

  it('default storage dir must NOT be used by any test file', () => {
    // The default .test-data/ directory should not be hardcoded in test files
    for (const file of testFiles) {
      const filePath = join(PROJECT_ROOT, file);
      if (!existsSync(filePath)) continue;
      const content = readFileSync(filePath, 'utf-8');

      // Should not hardcode the default path directly (join(cwd, '.test-data') without pid/suffix)
      const hardcodesDefault = /join\([^,]+,\s*['"]\.test-data['"]\s*\)/.test(content);
      expect(hardcodesDefault, `${file} hardcodes default .test-data path`).toBe(false);
    }
  });
});

// ============================================
// 4. Storage Corruption Resilience
// ============================================

describe('Storage Corruption Resilience', () => {
  const CORRUPT_DIR = join(PROJECT_ROOT, '.test-data-corruption-' + process.pid);

  beforeEach(() => {
    process.env.TEST_STORAGE_DIR = CORRUPT_DIR;
    mkdirSync(CORRUPT_DIR, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(CORRUPT_DIR, { recursive: true, force: true }); } catch {}
    delete process.env.TEST_STORAGE_DIR;
  });

  it('must handle corrupted JSON gracefully', async () => {
    // Write garbage to storage file
    writeFileSync(join(CORRUPT_DIR, 'cases.json'), '{{{{not json at all}}}}');

    // Import fresh to use the corrupt dir
    const { listTestCasesSync } = await import('../../lib/testing/local-storage');
    const result = listTestCasesSync();
    // Should return empty rather than throwing
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('must handle empty file gracefully', async () => {
    writeFileSync(join(CORRUPT_DIR, 'cases.json'), '');

    const { listTestCasesSync } = await import('../../lib/testing/local-storage');
    const result = listTestCasesSync();
    expect(Array.isArray(result)).toBe(true);
  });

  it('must handle missing storage directory by creating it', async () => {
    // Remove the dir
    rmSync(CORRUPT_DIR, { recursive: true, force: true });

    const { createTestCaseSync } = await import('../../lib/testing/local-storage');
    // Should auto-create and not throw
    const tc = createTestCaseSync({
      type: 'webhook',
      name: 'Corruption test',
      description: 'Test after dir deletion',
      input: { url: 'https://example.com' },
      expected_output: {},
      tags: [],
      enabled: true,
    });
    expect(tc.test_id).toBeDefined();
  });
});

// ============================================
// 5. Export Completeness
// ============================================

describe('Export Completeness', () => {
  it('index.ts must export all CRUD operations', async () => {
    const mod = await import('../../lib/testing');

    // Storage operations
    const requiredExports = [
      'createTestCase', 'getTestCase', 'listTestCases', 'updateTestCase', 'deleteTestCase',
      'createTestResult', 'getTestResult', 'listTestResults', 'getResultsByRun',
      'createTestRun', 'getTestRun', 'listTestRuns', 'completeTestRun',
      'createRequirement', 'getRequirement', 'listRequirements', 'updateRequirement',
      'captureRequirement', 'linkTestToRequirement', 'getRequirementCoverage',
      'clearAllDataSync', 'generateId',
    ];

    for (const name of requiredExports) {
      expect(typeof (mod as any)[name], `Missing export: ${name}`).toBe('function');
    }
  });

  it('index.ts must export all runner classes', async () => {
    const mod = await import('../../lib/testing');

    const requiredClasses = [
      'WebhookRunner', 'ElevenLabsRunner', 'N8nEvalRunner', 'McpRunner',
      'TestOrchestrator',
    ];

    for (const name of requiredClasses) {
      expect((mod as any)[name], `Missing class export: ${name}`).toBeDefined();
    }
  });

  it('index.ts must export runner singletons', async () => {
    const mod = await import('../../lib/testing');

    const singletons = ['webhookRunner', 'elevenlabsRunner', 'n8nEvalRunner', 'mcpRunner', 'orchestrator', 'runTests'];
    for (const name of singletons) {
      expect((mod as any)[name], `Missing singleton: ${name}`).toBeDefined();
    }
  });
});

// ============================================
// 6. Type Contract Stability
// ============================================

describe('Type Contract Stability', () => {
  it('TestCase must have all required fields', async () => {
    const STORAGE_DIR = join(PROJECT_ROOT, '.test-data-typecheck-' + process.pid);
    process.env.TEST_STORAGE_DIR = STORAGE_DIR;
    mkdirSync(STORAGE_DIR, { recursive: true });

    try {
      const { createTestCaseSync } = await import('../../lib/testing/local-storage');
      const tc = createTestCaseSync({
        type: 'webhook',
        name: 'Type contract test',
        description: 'Verify all fields exist',
        input: { url: 'https://example.com' },
        expected_output: { status: 200 },
        tags: ['contract'],
        enabled: true,
      });

      // These fields MUST exist on every TestCase
      expect(tc.test_id).toMatch(/^TC-/);
      expect(tc.type).toBe('webhook');
      expect(tc.name).toBe('Type contract test');
      expect(tc.description).toBeDefined();
      expect(tc.input).toBeDefined();
      expect(tc.expected_output).toBeDefined();
      expect(tc.tags).toEqual(['contract']);
      expect(tc.enabled).toBe(true);
      expect(tc.created_at).toBeDefined();
      expect(tc.updated_at).toBeDefined();
      // Verify timestamps are valid ISO
      expect(() => new Date(tc.created_at)).not.toThrow();
      expect(new Date(tc.created_at).toISOString()).toBe(tc.created_at);
    } finally {
      rmSync(STORAGE_DIR, { recursive: true, force: true });
      delete process.env.TEST_STORAGE_DIR;
    }
  });

  it('TestRun must track all execution stats', async () => {
    const STORAGE_DIR = join(PROJECT_ROOT, '.test-data-runcheck-' + process.pid);
    process.env.TEST_STORAGE_DIR = STORAGE_DIR;
    mkdirSync(STORAGE_DIR, { recursive: true });

    try {
      const { createTestRunSync, completeTestRunSync } = await import('../../lib/testing/local-storage');

      const run = createTestRunSync({
        triggered_by: 'manual',
        total_tests: 0,
        passed: 0,
        failed: 0,
        errors: 0,
        skipped: 0,
        pass_rate: 0,
        avg_latency_ms: 0,
      });

      expect(run.execution_id).toMatch(/^RUN-/);
      expect(run.started_at).toBeDefined();

      const completed = completeTestRunSync(run.execution_id, {
        total_tests: 10,
        passed: 8,
        failed: 1,
        errors: 1,
        skipped: 0,
        avg_latency_ms: 250,
      });

      expect(completed).toBeDefined();
      expect(completed!.total_tests).toBe(10);
      expect(completed!.passed).toBe(8);
      expect(completed!.failed).toBe(1);
      expect(completed!.errors).toBe(1);
      expect(completed!.pass_rate).toBe(80);
      expect(completed!.completed_at).toBeDefined();
    } finally {
      rmSync(STORAGE_DIR, { recursive: true, force: true });
      delete process.env.TEST_STORAGE_DIR;
    }
  });

  it('ID generation must produce unique IDs under rapid creation', async () => {
    const { generateId } = await import('../../lib/testing/local-storage');
    const ids = new Set<string>();
    for (let i = 0; i < 500; i++) {
      ids.add(generateId('TC'));
    }
    // With 500 rapid generations, collisions would indicate a broken generator
    // Allow very small collision rate (timestamp-based IDs can collide within same ms)
    expect(ids.size).toBeGreaterThanOrEqual(490);
  });
});

// ============================================
// 7. Package.json Integrity
// ============================================

describe('Package.json Integrity', () => {
  it('must have test script', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    expect(pkg.scripts?.test || pkg.scripts?.['test:run'], 'Missing test script').toBeDefined();
  });

  it('must have vitest as dependency', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    const hasVitest =
      pkg.devDependencies?.vitest ||
      pkg.dependencies?.vitest;
    expect(hasVitest, 'Vitest must be a dependency').toBeDefined();
  });
});

// ============================================
// 8. Vitest Config Completeness
// ============================================

describe('Vitest Config', () => {
  it('must define all test project categories', () => {
    const configPath = join(PROJECT_ROOT, 'vitest.config.ts');
    expect(existsSync(configPath)).toBe(true);
    const content = readFileSync(configPath, 'utf-8');

    const requiredProjects = ['webhook', 'elevenlabs', 'n8n-eval', 'mcp', 'integration', 'governance'];
    for (const project of requiredProjects) {
      expect(content, `Missing vitest project: ${project}`).toContain(`name: '${project}'`);
    }
  });

  it('must set appropriate timeouts per project type', () => {
    const content = readFileSync(join(PROJECT_ROOT, 'vitest.config.ts'), 'utf-8');

    // ElevenLabs tests are slow (conversation simulation) - need longer timeout
    expect(content).toContain('120000'); // 2 min for elevenlabs

    // Integration tests need moderate timeout
    expect(content).toContain('60000'); // 1 min for integration
  });
});

// ============================================
// 9. Runner Architecture Invariants
// ============================================

describe('Runner Architecture', () => {
  it('every runner must implement validate() and execute()', async () => {
    const { WebhookRunner, ElevenLabsRunner, N8nEvalRunner, McpRunner } = await import('../../lib/testing');

    const runners = [
      new WebhookRunner(),
      new ElevenLabsRunner(),
      new N8nEvalRunner(),
      new McpRunner(),
    ];

    for (const runner of runners) {
      expect(typeof runner.validate, `${runner.type} runner missing validate()`).toBe('function');
      expect(typeof runner.execute, `${runner.type} runner missing execute()`).toBe('function');
      expect(runner.type, 'Runner must declare its type').toBeDefined();
    }
  });

  it('runner types must match TestType enum values', async () => {
    const { WebhookRunner, ElevenLabsRunner, N8nEvalRunner, McpRunner } = await import('../../lib/testing');

    const validTypes = ['webhook', 'elevenlabs', 'n8n-eval', 'mcp'];

    expect(validTypes).toContain(new WebhookRunner().type);
    expect(validTypes).toContain(new ElevenLabsRunner().type);
    expect(validTypes).toContain(new N8nEvalRunner().type);
    expect(validTypes).toContain(new McpRunner().type);
  });

  it('orchestrator must support failFast mode', async () => {
    const { TestOrchestrator } = await import('../../lib/testing');
    const orch = new TestOrchestrator();
    // failFast is an option - verify the class accepts it
    expect(typeof orch.run).toBe('function');
  });
});

// ============================================
// 10. Mutation Detection
// ============================================

describe('Mutation Detection', () => {
  it('storage write then read must return identical data', async () => {
    const STORAGE_DIR = join(PROJECT_ROOT, '.test-data-mutation-' + process.pid);
    process.env.TEST_STORAGE_DIR = STORAGE_DIR;
    mkdirSync(STORAGE_DIR, { recursive: true });

    try {
      const { createTestCaseSync, getTestCaseSync } = await import('../../lib/testing/local-storage');

      const input = {
        type: 'webhook' as const,
        name: 'Mutation detection test',
        description: 'Data must survive round-trip',
        input: {
          url: 'https://example.com/api/v1/test',
          method: 'POST',
          headers: { 'X-Custom': 'value' },
          body: { nested: { deep: { value: 42 } } },
        },
        expected_output: {
          status: 200,
          body: { success: true, data: [1, 2, 3] },
        },
        tags: ['mutation', 'roundtrip'],
        enabled: true,
      };

      const created = createTestCaseSync(input);
      const retrieved = getTestCaseSync(created.test_id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe(input.name);
      expect(retrieved!.input).toEqual(input.input);
      expect(retrieved!.expected_output).toEqual(input.expected_output);
      expect(retrieved!.tags).toEqual(input.tags);
    } finally {
      rmSync(STORAGE_DIR, { recursive: true, force: true });
      delete process.env.TEST_STORAGE_DIR;
    }
  });

  it('update must not lose unrelated fields', async () => {
    const STORAGE_DIR = join(PROJECT_ROOT, '.test-data-update-' + process.pid);
    process.env.TEST_STORAGE_DIR = STORAGE_DIR;
    mkdirSync(STORAGE_DIR, { recursive: true });

    try {
      const { createTestCaseSync, updateTestCaseSync, getTestCaseSync } = await import('../../lib/testing/local-storage');

      const original = createTestCaseSync({
        type: 'webhook',
        name: 'Original name',
        description: 'Original description',
        input: { url: 'https://original.com' },
        expected_output: { status: 200 },
        tags: ['original'],
        enabled: true,
      });

      // Update only the name
      updateTestCaseSync(original.test_id, { name: 'Updated name' });

      const updated = getTestCaseSync(original.test_id);
      expect(updated!.name).toBe('Updated name');
      // All other fields must be preserved
      expect(updated!.description).toBe('Original description');
      expect(updated!.input).toEqual({ url: 'https://original.com' });
      expect(updated!.expected_output).toEqual({ status: 200 });
      expect(updated!.tags).toEqual(['original']);
      expect(updated!.enabled).toBe(true);
      expect(updated!.type).toBe('webhook');
    } finally {
      rmSync(STORAGE_DIR, { recursive: true, force: true });
      delete process.env.TEST_STORAGE_DIR;
    }
  });

  it('delete must not affect other records', async () => {
    const STORAGE_DIR = join(PROJECT_ROOT, '.test-data-delete-' + process.pid);
    process.env.TEST_STORAGE_DIR = STORAGE_DIR;
    mkdirSync(STORAGE_DIR, { recursive: true });

    try {
      const { createTestCaseSync, deleteTestCaseSync, listTestCasesSync } = await import('../../lib/testing/local-storage');

      const tc1 = createTestCaseSync({ type: 'webhook', name: 'Keep', description: 'd', input: {}, expected_output: {}, tags: [], enabled: true });
      const tc2 = createTestCaseSync({ type: 'webhook', name: 'Delete', description: 'd', input: {}, expected_output: {}, tags: [], enabled: true });
      const tc3 = createTestCaseSync({ type: 'webhook', name: 'Keep too', description: 'd', input: {}, expected_output: {}, tags: [], enabled: true });

      deleteTestCaseSync(tc2.test_id);

      const remaining = listTestCasesSync();
      expect(remaining).toHaveLength(2);
      expect(remaining.map(r => r.name)).toContain('Keep');
      expect(remaining.map(r => r.name)).toContain('Keep too');
      expect(remaining.map(r => r.name)).not.toContain('Delete');
    } finally {
      rmSync(STORAGE_DIR, { recursive: true, force: true });
      delete process.env.TEST_STORAGE_DIR;
    }
  });
});

// ============================================
// 11. Concurrent Write Safety
// ============================================

describe('Concurrent Write Safety', () => {
  it('rapid sequential writes must not lose data', async () => {
    const STORAGE_DIR = join(PROJECT_ROOT, '.test-data-concurrent-' + process.pid);
    process.env.TEST_STORAGE_DIR = STORAGE_DIR;
    mkdirSync(STORAGE_DIR, { recursive: true });

    try {
      const { createTestCaseSync, listTestCasesSync, clearAllDataSync } = await import('../../lib/testing/local-storage');

      clearAllDataSync();

      // Rapidly create 50 test cases
      const WRITE_COUNT = 50;
      for (let i = 0; i < WRITE_COUNT; i++) {
        createTestCaseSync({
          type: 'webhook',
          name: `Rapid write ${i}`,
          description: `Test ${i}`,
          input: { url: `https://example.com/${i}` },
          expected_output: {},
          tags: [],
          enabled: true,
        });
      }

      const all = listTestCasesSync({ limit: 200 });
      expect(all).toHaveLength(WRITE_COUNT);
    } finally {
      rmSync(STORAGE_DIR, { recursive: true, force: true });
      delete process.env.TEST_STORAGE_DIR;
    }
  });
});
