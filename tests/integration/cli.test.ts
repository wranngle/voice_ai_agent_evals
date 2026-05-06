/**
 * CLI Tests
 *
 * Integration tests for the testing framework CLI.
 */

import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {
  existsSync, mkdirSync, rmSync, writeFileSync,
} from 'node:fs';
import {
  describe, expect, test, beforeEach, afterEach,
} from 'vitest';
import {clearAllDataSync, createTestCase} from '../../lib/testing';

const CLI_PATH = join(process.cwd(), 'lib/testing/cli.ts');
const UNIQUE_STORAGE_DIR = join(process.cwd(), '.test-data-cli-' + process.pid);
const LOCAL_BUN = '/home/wranngle/.bun/bin/bun';
const BUN_BIN = process.env.BUN_BIN ?? (existsSync(LOCAL_BUN) ? LOCAL_BUN : 'bun');
const shellQuote = (value: string): string => JSON.stringify(value);

async function runCli(
  args: string[],
  env: Record<string, string | undefined> = {},
): Promise<{code: number; stdout: string; stderr: string}> {
  return new Promise(resolve => {
    const childEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NO_COLOR: '1',
      TEST_STORAGE_DIR: UNIQUE_STORAGE_DIR,
      TEST_INCLUDE_SCENARIOS: '0',
    };
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        Reflect.deleteProperty(childEnv, key);
      } else {
        childEnv[key] = value;
      }
    }

    const proc = spawn(BUN_BIN, ['run', CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: childEnv,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => {
      stdout += data.toString();
    });

    proc.stderr.on('data', data => {
      stderr += data.toString();
    });

    proc.on('close', code => {
      resolve({code: code ?? 0, stdout, stderr});
    });

    proc.on('error', error => {
      resolve({code: 1, stdout, stderr: error.message});
    });
  });
}

describe('CLI', () => {
  beforeEach(() => {
    process.env.TEST_STORAGE_DIR = UNIQUE_STORAGE_DIR;
    mkdirSync(UNIQUE_STORAGE_DIR, {recursive: true});
    clearAllDataSync();
  });

  afterEach(() => {
    try {
      rmSync(UNIQUE_STORAGE_DIR, {recursive: true, force: true});
    } catch {}

    delete process.env.TEST_STORAGE_DIR;
  });

  describe('Help', () => {
    test('should show help with --help', async () => {
      const result = await runCli(['--help']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('voice_ai_agent_evals CLI');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('run');
      expect(result.stdout).toContain('list');
      expect(result.stdout).toContain('validate');
      expect(result.stdout).toContain('--parallel');
      expect(result.stdout).toContain('--concurrency');
    });

    test('should show help with -h', async () => {
      const result = await runCli(['-h']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('voice_ai_agent_evals CLI');
    });
  });

  describe('List Command', () => {
    test('should list no tests when empty', async () => {
      const result = await runCli(['list']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Available Tests');
      expect(result.stdout).toContain('No tests found');
    });

    test('should list tests in JSON format', async () => {
      const result = await runCli(['list', '--json']);
      expect(result.code).toBe(0);
      const tests = JSON.parse(result.stdout);
      expect(Array.isArray(tests)).toBe(true);
    });

    test('should list created tests', async () => {
      // Create a test case
      await createTestCase({
        type: 'webhook',
        name: 'Test HTTP endpoint',
        description: 'Tests HTTP endpoint',
        input: {url: 'https://example.com', method: 'GET'},
        expected_output: {status: 200},
        tags: ['smoke'],
        enabled: true,
      });

      const result = await runCli(['list']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Test HTTP endpoint');
      expect(result.stdout).toContain('webhook');
    });

    test('should filter tests by type', async () => {
      // Create tests of different types
      await createTestCase({
        type: 'webhook',
        name: 'Webhook Test',
        description: 'Webhook test',
        input: {url: 'https://example.com'},
        expected_output: {},
        tags: [],
        enabled: true,
      });

      await createTestCase({
        type: 'elevenlabs',
        name: 'ElevenLabs Test',
        description: 'ElevenLabs test',
        input: {agent_id: 'agent_123', test_prompt: 'Hello'},
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const webhookResult = await runCli(['list', '-t', 'webhook', '--json']);
      const webhookTests = JSON.parse(webhookResult.stdout);
      expect(webhookTests).toHaveLength(1);
      expect(webhookTests[0].name).toBe('Webhook Test');

      const elevenResult = await runCli(['list', '-t', 'elevenlabs', '--json']);
      const elevenTests = JSON.parse(elevenResult.stdout);
      expect(elevenTests).toHaveLength(1);
      expect(elevenTests[0].name).toBe('ElevenLabs Test');
    });

    test('should filter tests by tag', async () => {
      await createTestCase({
        type: 'webhook',
        name: 'Smoke Test',
        description: 'Smoke test',
        input: {url: 'https://example.com'},
        expected_output: {},
        tags: ['smoke'],
        enabled: true,
      });

      await createTestCase({
        type: 'webhook',
        name: 'Integration Test',
        description: 'Integration test',
        input: {url: 'https://example.com'},
        expected_output: {},
        tags: ['integration'],
        enabled: true,
      });

      const result = await runCli(['list', '-g', 'smoke', '--json']);
      const tests = JSON.parse(result.stdout);
      expect(tests).toHaveLength(1);
      expect(tests[0].name).toBe('Smoke Test');
    });

    test('should list committed scenario fixtures with a storage override by default', async () => {
      const result = await runCli(['list', '-t', 'scenario', '--json'], {TEST_INCLUDE_SCENARIOS: undefined});
      expect(result.code).toBe(0);
      const tests = JSON.parse(result.stdout);
      expect(tests.map((item: {test_id: string}) => item.test_id)).toContain('SCEN-lookup-record-greeting');
      expect(tests.every((item: {type: string}) => item.type === 'scenario')).toBe(true);
    });

    test('should allow tests to opt out of committed scenario fixtures', async () => {
      const result = await runCli(['list', '-t', 'scenario', '--json']);
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual([]);
    });
  });

  describe('Validate Command', () => {
    test('should validate empty test suite', async () => {
      const result = await runCli(['validate']);
      expect(result.code).toBe(0);
    });

    test('should validate valid test case', async () => {
      await createTestCase({
        type: 'webhook',
        name: 'Valid Test',
        description: 'Valid webhook test',
        input: {url: 'https://example.com', method: 'GET'},
        expected_output: {status: 200},
        tags: [],
        enabled: true,
      });

      const result = await runCli(['validate']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Valid');
    });

    test('should detect invalid test case', async () => {
      await createTestCase({
        type: 'webhook',
        name: 'Invalid Test',
        description: 'Missing URL',
        input: {}, // Missing url
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const result = await runCli(['validate']);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('Invalid');
    });

    test('should output validation results as JSON', async () => {
      await createTestCase({
        type: 'webhook',
        name: 'Test',
        description: 'Test',
        input: {url: 'https://example.com'},
        expected_output: {status: 200},
        tags: [],
        enabled: true,
      });

      const result = await runCli(['validate', '--json']);
      expect(result.code).toBe(0);
      const validations = JSON.parse(result.stdout);
      expect(Array.isArray(validations)).toBe(true);
      expect(validations[0].valid).toBe(true);
    });

    test('should validate only the requested scenario ID', async () => {
      const brokenDir = join(process.cwd(), 'tests/scenarios/zz-validate-unmatched-malformed-temp');
      mkdirSync(brokenDir, {recursive: true});
      writeFileSync(join(brokenDir, 'scenario.yaml'), 'this: is: not: valid yaml at all\n');

      try {
        const result = await runCli(
          ['validate', '--id', 'SCEN-lookup-record-greeting', '--json'],
          {TEST_INCLUDE_SCENARIOS: '1'},
        );

        expect(result.code).toBe(0);
        expect(result.stderr).not.toContain('zz-validate-unmatched-malformed-temp');
        const validations = JSON.parse(result.stdout) as Array<{test_id: string; valid: boolean}>;
        expect(validations).toHaveLength(1);
        expect(validations[0]).toMatchObject({
          test_id: 'SCEN-lookup-record-greeting',
          valid: true,
        });
      } finally {
        rmSync(brokenDir, {recursive: true, force: true});
      }
    });

    test('should exit nonzero when validate --id matches no test', async () => {
      const result = await runCli(
        ['validate', '--id', 'SCEN-does-not-exist', '--json'],
        {TEST_INCLUDE_SCENARIOS: '1'},
      );

      expect(result.code).toBe(1);
      const payload = JSON.parse(result.stdout) as {error: string; validations: unknown[]};
      expect(payload.error).toContain('no tests matched');
      expect(payload.error).toContain('SCEN-does-not-exist');
      expect(payload.validations).toEqual([]);
    });
  });

  describe('Run Command', () => {
    test('should run empty test suite', async () => {
      const result = await runCli(['run']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Total:');
    });

    test('should output run results as JSON', async () => {
      const result = await runCli(['run', '--json']);
      expect(result.code).toBe(0);
      const summary = JSON.parse(result.stdout);
      expect(summary).toHaveProperty('execution_id');
      expect(summary).toHaveProperty('passed');
      expect(summary).toHaveProperty('failed');
    });

    test('should pass parallel and concurrency options through to suite execution', async () => {
      const command = [
        shellQuote(BUN_BIN),
        '-e',
        shellQuote('await new Promise(resolve => setTimeout(resolve, 1200)); console.log("done")'),
      ].join(' ');

      await createTestCase({
        type: 'external-command',
        name: 'Parallel CLI delay A',
        description: 'Slow command used to prove CLI parallel execution.',
        input: {command},
        expected_output: {stdout_contains: ['done']},
        tags: ['parallel-cli'],
        enabled: true,
      });

      await createTestCase({
        type: 'external-command',
        name: 'Parallel CLI delay B',
        description: 'Slow command used to prove CLI parallel execution.',
        input: {command},
        expected_output: {stdout_contains: ['done']},
        tags: ['parallel-cli'],
        enabled: true,
      });

      const result = await runCli([
        'run',
        '-t',
        'external-command',
        '-g',
        'parallel-cli',
        '--parallel',
        '--concurrency',
        '2',
        '--json',
      ]);

      expect(result.code).toBe(0);
      const summary = JSON.parse(result.stdout);
      expect(summary.total_tests).toBe(2);
      expect(summary.passed).toBe(2);
      expect(summary.duration_ms).toBeLessThan(2100);
    });

    test('should reject malformed concurrency before starting a run', async () => {
      const result = await runCli([
        'run',
        '--parallel',
        '--concurrency',
        '2oops',
        '--json',
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toBe('');
      const payload = JSON.parse(result.stdout) as {errors: string[]};
      expect(payload.errors).toContain('--concurrency must be a positive integer');
    });

    test('should reject non-positive timeout before starting a run', async () => {
      const result = await runCli([
        'run',
        '--timeout',
        '0',
      ]);

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('--timeout must be a positive integer');
      expect(result.stdout).toBe('');
    });

    test('should run a passing committed scenario by ID', async () => {
      const result = await runCli(
        ['run', '--id', 'SCEN-lookup-record-greeting', '--json'],
        {TEST_INCLUDE_SCENARIOS: '1'},
      );

      expect(result.code).toBe(0);
      const summary = JSON.parse(result.stdout);
      expect(summary.total_tests).toBe(1);
      expect(summary.passed).toBe(1);
      expect(summary.failed).toBe(0);
    });

    test('should surface a failing committed scenario by positional ID', async () => {
      const result = await runCli(
        ['run', 'SCEN-barge-in-mid-question', '--json'],
        {TEST_INCLUDE_SCENARIOS: '1'},
      );

      expect(result.code).toBe(1);
      const summary = JSON.parse(result.stdout);
      expect(summary.total_tests).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.failures[0].error_message).toContain('barge_in_recovery');
    });

    test('should exit nonzero when --id matches no test (no silent green)', async () => {
      const result = await runCli(
        ['run', '--id', 'SCEN-does-not-exist'],
        {TEST_INCLUDE_SCENARIOS: '1'},
      );

      expect(result.code).toBe(1);
      expect(result.stderr).toContain('no tests matched');
      expect(result.stderr).toContain('SCEN-does-not-exist');
    });

    test('should include a machine-readable error when JSON run filter matches no test', async () => {
      const result = await runCli(
        ['run', '--id', 'SCEN-does-not-exist', '--json'],
        {TEST_INCLUDE_SCENARIOS: '1'},
      );

      expect(result.code).toBe(1);
      expect(result.stderr).toBe('');
      const summary = JSON.parse(result.stdout);
      expect(summary.error).toContain('no tests matched');
      expect(summary.error).toContain('SCEN-does-not-exist');
      expect(summary.total_tests).toBe(0);
    });

    test('validate surfaces a malformed scenario that discovery silently drops', async () => {
      const brokenDir = join(process.cwd(), 'tests/scenarios/zz-validate-malformed-temp');
      mkdirSync(brokenDir, {recursive: true});
      writeFileSync(join(brokenDir, 'scenario.yaml'), 'this: is: not: valid yaml at all\n');

      try {
        const result = await runCli(
          ['validate', '--json'],
          {TEST_INCLUDE_SCENARIOS: '1'},
        );

        expect(result.code).toBe(1);
        const validations = JSON.parse(result.stdout) as Array<{test_id: string; valid: boolean; errors: string[]}>;
        const broken = validations.find(v => v.test_id === 'SCEN-zz-validate-malformed-temp');
        expect(broken).toBeDefined();
        expect(broken?.valid).toBe(false);
      } finally {
        rmSync(brokenDir, {recursive: true, force: true});
      }
    });

    test('run fails explicitly when a targeted scenario fixture is malformed', async () => {
      const brokenDir = join(process.cwd(), 'tests/scenarios/zz-run-malformed-temp');
      mkdirSync(brokenDir, {recursive: true});
      writeFileSync(join(brokenDir, 'scenario.yaml'), 'this: is: not: valid yaml at all\n');

      try {
        const result = await runCli(
          ['run', '--id', 'SCEN-zz-run-malformed-temp', '--json'],
          {TEST_INCLUDE_SCENARIOS: '1'},
        );

        expect(result.code).toBe(1);
        const payload = JSON.parse(result.stdout) as {
          error: string;
          scenarios: Array<{test_id: string; errors: string[]}>;
        };
        expect(payload.error).toContain('Malformed scenario fixture');
        expect(payload.scenarios[0].test_id).toBe('SCEN-zz-run-malformed-temp');
        expect(payload.scenarios[0].errors.join('\n')).toContain('Unsupported scenario key "this"');
      } finally {
        rmSync(brokenDir, {recursive: true, force: true});
      }
    });
  });

  describe('Clear Command', () => {
    test('should clear all test data', async () => {
      // Create some test data
      await createTestCase({
        type: 'webhook',
        name: 'Test to Clear',
        description: 'Will be cleared',
        input: {url: 'https://example.com'},
        expected_output: {},
        tags: [],
        enabled: true,
      });

      // Verify test exists
      const listBefore = await runCli(['list', '--json']);
      expect(JSON.parse(listBefore.stdout)).toHaveLength(1);

      // Clear
      const clearResult = await runCli(['clear']);
      expect(clearResult.code).toBe(0);
      expect(clearResult.stdout).toContain('cleared');

      // Verify cleared
      const listAfter = await runCli(['list', '--json']);
      expect(JSON.parse(listAfter.stdout)).toHaveLength(0);
    });
  });

  describe('Unknown Command', () => {
    test('should show error for unknown command', async () => {
      const result = await runCli(['unknown-command']);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain('Unknown command');
    });
  });
});
