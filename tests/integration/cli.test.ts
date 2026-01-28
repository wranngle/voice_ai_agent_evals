/**
 * CLI Tests
 *
 * Integration tests for the testing framework CLI.
 */

import { describe, it, expect, test, beforeEach, afterEach, vi } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';
import { mkdirSync, rmSync } from 'fs';
import { clearAllDataSync, createTestCase } from '../../lib/testing';

const CLI_PATH = join(process.cwd(), 'lib/testing/cli.ts');
const UNIQUE_STORAGE_DIR = join(process.cwd(), '.test-data-cli-' + process.pid);

function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('bun', ['run', CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, NO_COLOR: '1', TEST_STORAGE_DIR: UNIQUE_STORAGE_DIR },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

describe('CLI', () => {
  beforeEach(() => {
    process.env.TEST_STORAGE_DIR = UNIQUE_STORAGE_DIR;
    mkdirSync(UNIQUE_STORAGE_DIR, { recursive: true });
    clearAllDataSync();
  });

  afterEach(() => {
    try { rmSync(UNIQUE_STORAGE_DIR, { recursive: true, force: true }); } catch {}
    delete process.env.TEST_STORAGE_DIR;
  });

  describe('Help', () => {
    test('should show help with --help', async () => {
      const result = await runCli(['--help']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('n8n Testing Framework CLI');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('run');
      expect(result.stdout).toContain('list');
      expect(result.stdout).toContain('validate');
    });

    test('should show help with -h', async () => {
      const result = await runCli(['-h']);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain('n8n Testing Framework CLI');
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
        input: { url: 'https://example.com', method: 'GET' },
        expected_output: { status: 200 },
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
        input: { url: 'https://example.com' },
        expected_output: {},
        tags: [],
        enabled: true,
      });

      await createTestCase({
        type: 'elevenlabs',
        name: 'ElevenLabs Test',
        description: 'ElevenLabs test',
        input: { agent_id: 'agent_123', test_prompt: 'Hello' },
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
        input: { url: 'https://example.com' },
        expected_output: {},
        tags: ['smoke'],
        enabled: true,
      });

      await createTestCase({
        type: 'webhook',
        name: 'Integration Test',
        description: 'Integration test',
        input: { url: 'https://example.com' },
        expected_output: {},
        tags: ['integration'],
        enabled: true,
      });

      const result = await runCli(['list', '-g', 'smoke', '--json']);
      const tests = JSON.parse(result.stdout);
      expect(tests).toHaveLength(1);
      expect(tests[0].name).toBe('Smoke Test');
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
        input: { url: 'https://example.com', method: 'GET' },
        expected_output: { status: 200 },
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
        input: { url: 'https://example.com' },
        expected_output: {},
        tags: [],
        enabled: true,
      });

      const result = await runCli(['validate', '--json']);
      expect(result.code).toBe(0);
      const validations = JSON.parse(result.stdout);
      expect(Array.isArray(validations)).toBe(true);
      expect(validations[0].valid).toBe(true);
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
  });

  describe('Clear Command', () => {
    test('should clear all test data', async () => {
      // Create some test data
      await createTestCase({
        type: 'webhook',
        name: 'Test to Clear',
        description: 'Will be cleared',
        input: { url: 'https://example.com' },
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
