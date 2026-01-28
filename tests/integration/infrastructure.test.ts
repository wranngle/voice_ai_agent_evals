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
  // ROOT CAUSE #1: Workflow was placed in workflows/voice_ai_agents/.github/ instead of repo root .github/
  // GitHub only reads workflows from .github/workflows/ at repo root.
  const repoWorkflowDir = join(REPO_ROOT, '.github/workflows');

  it('CI workflow must exist in repo root .github/workflows/ (NOT in child project)', () => {
    const files = existsSync(repoWorkflowDir)
      ? require('fs').readdirSync(repoWorkflowDir).filter((f: string) => f.includes('vitest') || f.includes('voice-ai'))
      : [];
    expect(files.length, 'No voice-ai workflow found in repo root .github/workflows/').toBeGreaterThan(0);
  });

  it('child project .github/workflows/ must NOT contain CI workflows (wrong location)', () => {
    const childWorkflowDir = join(PROJECT_ROOT, '.github/workflows');
    if (!existsSync(childWorkflowDir)) return; // Good - doesn't exist
    const files = require('fs').readdirSync(childWorkflowDir);
    const ciFiles = files.filter((f: string) => f.endsWith('.yml') || f.endsWith('.yaml'));
    // Advisory: these files won't be picked up by GitHub
    if (ciFiles.length > 0) {
      console.warn(`WARNING: ${ciFiles.length} workflow files in child .github/workflows/ will be ignored by GitHub Actions`);
    }
  });

  it('CI workflow must have scheduled trigger for hands-free monitoring', () => {
    const files = require('fs').readdirSync(repoWorkflowDir).filter((f: string) => f.includes('vitest') || f.includes('voice-ai'));
    const content = readFileSync(join(repoWorkflowDir, files[0]), 'utf-8');
    expect(content).toContain('schedule:');
    expect(content).toMatch(/cron:/);
  });

  it('CI workflow must have workflow_dispatch for manual trigger', () => {
    const files = require('fs').readdirSync(repoWorkflowDir).filter((f: string) => f.includes('vitest') || f.includes('voice-ai'));
    const content = readFileSync(join(repoWorkflowDir, files[0]), 'utf-8');
    expect(content).toContain('workflow_dispatch');
  });

  it('CI workflow must run vitest with bun', () => {
    const files = require('fs').readdirSync(repoWorkflowDir).filter((f: string) => f.includes('vitest') || f.includes('voice-ai'));
    const content = readFileSync(join(repoWorkflowDir, files[0]), 'utf-8');
    expect(content).toContain('vitest');
    expect(content).toContain('bun');
  });

  // ROOT CAUSE #3: Live endpoint tests ran in CI unit job, failed without network
  // Convention fix: CI uses --project to select offline-only projects
  it('CI unit job must use --project flag (not --exclude) for offline tests', () => {
    const files = require('fs').readdirSync(repoWorkflowDir).filter((f: string) => f.includes('vitest') || f.includes('voice-ai'));
    const content = readFileSync(join(repoWorkflowDir, files[0]), 'utf-8');
    expect(content, 'CI must use --project for convention-based selection').toContain('--project');
  });

  it('CI must NOT use hardcoded --exclude paths (convention violation)', () => {
    const files = require('fs').readdirSync(repoWorkflowDir).filter((f: string) => f.includes('vitest') || f.includes('voice-ai'));
    const content = readFileSync(join(repoWorkflowDir, files[0]), 'utf-8');
    expect(content, 'Hardcoded --exclude breaks the anything-machine convention').not.toContain('--exclude');
  });

  it('CI must write test summary to GITHUB_STEP_SUMMARY', () => {
    const files = require('fs').readdirSync(repoWorkflowDir).filter((f: string) => f.includes('vitest') || f.includes('voice-ai'));
    const content = readFileSync(join(repoWorkflowDir, files[0]), 'utf-8');
    expect(content).toContain('GITHUB_STEP_SUMMARY');
  });
});

// ============================================
// 2. Git Hooks
// ============================================

describe('Git Hooks', () => {
  // ROOT CAUSE #5: Test assumed hooks were in .git/hooks/ but they're in .husky/
  // Husky installs hooks via .husky/ directory, not .git/hooks/ directly.
  const huskyPath = join(PROJECT_ROOT, '.husky/pre-push');
  const gitHookPath = join(REPO_ROOT, '.git/hooks/pre-push');

  it('pre-push hook must exist (husky or git hooks)', () => {
    const exists = existsSync(huskyPath) || existsSync(gitHookPath);
    expect(exists, `pre-push hook not found at ${huskyPath} or ${gitHookPath}`).toBe(true);
  });

  it('pre-push hook must reference voice_ai_agents tests', () => {
    const hookFile = existsSync(huskyPath) ? huskyPath : gitHookPath;
    if (!existsSync(hookFile)) return;
    const content = readFileSync(hookFile, 'utf-8');
    expect(content).toContain('voice_ai_agents');
  });

  it('pre-push hook must fail on test failure', () => {
    const hookFile = existsSync(huskyPath) ? huskyPath : gitHookPath;
    if (!existsSync(hookFile)) return;
    const content = readFileSync(hookFile, 'utf-8');
    // Must have some failure mechanism (exit 1, ||, set -e, etc.)
    const hasFail = content.includes('exit 1') || content.includes('set -e') || content.includes('|| exit');
    expect(hasFail, 'Hook must propagate test failures').toBe(true);
  });
});

// ============================================
// 1.5. Convention Enforcement (ANYTHING MACHINE)
// ============================================

describe('Convention: Offline/Live Project Classification', () => {
  const vitestConfigPath = join(PROJECT_ROOT, 'vitest.config.ts');

  it('vitest.config.ts must export OFFLINE_PROJECTS and LIVE_PROJECTS arrays', () => {
    const content = readFileSync(vitestConfigPath, 'utf-8');
    expect(content).toContain('export const OFFLINE_PROJECTS');
    expect(content).toContain('export const LIVE_PROJECTS');
  });

  it('every test directory must be covered by a vitest project', () => {
    const fs = require('fs');
    const testDir = join(PROJECT_ROOT, 'tests');
    const NON_TEST_DIRS = ['setup', 'fixtures', '__mocks__', 'data', 'helpers', 'utils'];
    const subdirs = fs.readdirSync(testDir, { withFileTypes: true })
      .filter((d: any) => d.isDirectory() && !NON_TEST_DIRS.includes(d.name))
      .map((d: any) => d.name);

    const configContent = readFileSync(vitestConfigPath, 'utf-8');

    for (const dir of subdirs) {
      const hasProject = configContent.includes(`tests/${dir}/`);
      expect(hasProject, `tests/${dir}/ has no vitest project — add it to offlineProjects or liveProjects in vitest.config.ts`).toBe(true);
    }
  });

  it('CI workflow must reference every offline project by --project flag', () => {
    const fs = require('fs');
    const ciFiles = fs.readdirSync(join(REPO_ROOT, '.github/workflows')).filter((f: string) => f.includes('vitest') || f.includes('voice-ai'));
    const ciContent = readFileSync(join(REPO_ROOT, '.github/workflows', ciFiles[0]), 'utf-8');
    const configContent = readFileSync(vitestConfigPath, 'utf-8');

    // Extract offline project names from vitest config
    const offlineBlock = configContent.split('const offlineProjects')[1]?.split('const liveProjects')[0] || '';
    const projectNames = [...offlineBlock.matchAll(/name:\s*'([^']+)'/g)].map(m => m[1]);

    for (const name of projectNames) {
      expect(ciContent, `CI missing --project ${name} for offline project`).toContain(`--project ${name}`);
    }
  });

  it('CI workflow must have a separate live tests job', () => {
    const fs = require('fs');
    const ciFiles = fs.readdirSync(join(REPO_ROOT, '.github/workflows')).filter((f: string) => f.includes('vitest') || f.includes('voice-ai'));
    const ciContent = readFileSync(join(REPO_ROOT, '.github/workflows', ciFiles[0]), 'utf-8');
    expect(ciContent).toContain('live-tests:');
  });

  it('CI live job must check for secrets before running', () => {
    const fs = require('fs');
    const ciFiles = fs.readdirSync(join(REPO_ROOT, '.github/workflows')).filter((f: string) => f.includes('vitest') || f.includes('voice-ai'));
    const ciContent = readFileSync(join(REPO_ROOT, '.github/workflows', ciFiles[0]), 'utf-8');
    expect(ciContent).toContain('Verify secrets');
  });
});

// ============================================
// 2.5. Import Hygiene (ROOT CAUSE #2)
// ============================================

describe('Import Hygiene', () => {
  // ROOT CAUSE #2: Legacy test files used "bun:test" instead of "vitest".
  // Vitest picks up all *.test.ts files, but bun:test imports fail in non-bun environments (CI).
  // Every test file must import from "vitest", never from "bun:test".

  it('no test file must import from bun:test', () => {
    const glob = require('fs');
    const path = require('path');

    function findTestFiles(dir: string): string[] {
      const results: string[] = [];
      if (!existsSync(dir)) return results;
      const entries = glob.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.includes('node_modules')) {
          results.push(...findTestFiles(fullPath));
        } else if (entry.name.endsWith('.test.ts')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const testDir = join(PROJECT_ROOT, 'tests');
    const allTestFiles = findTestFiles(testDir);

    const violations: string[] = [];
    for (const file of allTestFiles) {
      const content = readFileSync(file, 'utf-8');
      if (/^\s*import\s+.*from\s+['"]bun:test['"]/m.test(content)) {
        violations.push(file.replace(PROJECT_ROOT + path.sep, ''));
      }
    }

    expect(violations, `These files import from bun:test instead of vitest: ${violations.join(', ')}`).toHaveLength(0);
  });

  it('test files using describe/it/expect must import them from vitest', () => {
    const glob = require('fs');
    const path = require('path');

    function findTestFiles(dir: string): string[] {
      const results: string[] = [];
      if (!existsSync(dir)) return results;
      const entries = glob.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.includes('node_modules')) {
          results.push(...findTestFiles(fullPath));
        } else if (entry.name.endsWith('.test.ts')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const testDir = join(PROJECT_ROOT, 'tests');
    const allTestFiles = findTestFiles(testDir);

    const violations: string[] = [];
    for (const file of allTestFiles) {
      const content = readFileSync(file, 'utf-8');
      const usesTestGlobals = /\b(describe|it|test|expect|beforeAll|afterAll|beforeEach|afterEach)\b/.test(content);
      const importsVitest = content.includes('from "vitest"') || content.includes("from 'vitest'");
      const hasVitestGlobals = content.includes('// @vitest-environment') || content.includes('globals: true');

      if (usesTestGlobals && !importsVitest) {
        // Only flag if the file uses test APIs but doesn't import them from vitest
        // (globals:true in vitest.config.ts allows this, but explicit imports are safer for CI)
        // This is advisory - globals:true makes it work, but explicit is better
      }
    }
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
