import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';
import {ExternalCommandRunner} from '../../lib/testing/runners/external-command-runner';
import {
  createGtmOpsTestCases,
  loadGtmOpsHarnessManifest,
} from '../../lib/testing/adapters/gtm-ops';
import type {TestCase} from '../../lib/testing/types';

function commandCase(input: Record<string, unknown>, expected_output: Record<string, unknown> = {}): TestCase {
  const now = new Date().toISOString();
  return {
    test_id: 'TC-CMD-001',
    type: 'external-command',
    name: 'External command',
    description: 'External command test',
    input,
    expected_output,
    tags: [],
    enabled: true,
    created_at: now,
    updated_at: now,
  };
}

describe('ExternalCommandRunner', () => {
  test('executes a successful command', async () => {
    const runner = new ExternalCommandRunner();
    const result = await runner.execute(commandCase(
      {command: 'printf "adapter-ok"', timeout_ms: 10_000},
      {stdout_contains: ['adapter-ok']},
    ));

    expect(result.status).toBe('passed');
    expect(result.actual_output.stdout_tail).toBe('adapter-ok');
    expect(result.assertions_failed).toBe(0);
  });

  test('fails when exit code differs from expected', async () => {
    const runner = new ExternalCommandRunner();
    const result = await runner.execute(commandCase({command: 'exit 7', timeout_ms: 10_000}));

    expect(result.status).toBe('failed');
    expect(result.error_message).toContain('Expected exit code 0, got 7');
  });

  test('fails when forbidden output appears', async () => {
    const runner = new ExternalCommandRunner();
    const result = await runner.execute(commandCase(
      {command: 'printf "REGRESSION DETECTED"', timeout_ms: 10_000},
      {stdout_not_contains: ['REGRESSION DETECTED']},
    ));

    expect(result.status).toBe('failed');
    expect(result.error_message).toContain('stdout contained forbidden text: REGRESSION DETECTED');
  });

  test('validates command and cwd', () => {
    const runner = new ExternalCommandRunner();
    const result = runner.validate(commandCase({command: '', cwd: '/definitely/missing/path'}));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: command');
    expect(result.errors[1]).toMatch(/cwd does not exist/);
  });
});

describe('gtm_ops adapter manifest', () => {
  test('loads a gtm_ops manifest and converts commands to external-command cases', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gtm-ops-manifest-'));
    try {
      writeFileSync(join(dir, 'eval-harness.manifest.json'), JSON.stringify({
        schema_version: 'voice_ai_agent_evals.gtm_ops.v1',
        project: 'gtm_ops',
        commands: [
          {
            id: 'unit',
            name: 'Unit suite',
            command: 'bun run test:run',
            tags: ['unit'],
            timeout_ms: 1234,
          },
        ],
      }, null, 2));

      const manifest = loadGtmOpsHarnessManifest(dir);
      const cases = createGtmOpsTestCases({projectRoot: dir});
      const implicitProjectCases = createGtmOpsTestCases({projectRoot: dir, tags: ['gtm_ops']});

      expect(manifest.commands).toHaveLength(1);
      expect(cases).toHaveLength(1);
      expect(implicitProjectCases).toHaveLength(1);
      expect(cases[0].type).toBe('external-command');
      expect(cases[0].input.command).toBe('bun run test:run');
      expect(cases[0].tags).toContain('gtm_ops');
      expect(cases[0].tags).toContain('unit');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
