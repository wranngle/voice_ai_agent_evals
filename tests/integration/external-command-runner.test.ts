import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';
import {ExternalCommandRunner} from '../../src/testing/runners/external-command-runner';
import {
  createGtmOpsTestCases,
  loadGtmOpsHarnessManifest,
  runGtmOpsAdapter,
} from '../../src/testing/adapters/gtm-ops';
import type {TestCase} from '../../src/testing/types';

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

  test('rejects malformed expected_output assertions before execution', () => {
    const runner = new ExternalCommandRunner();
    const result = runner.validate(commandCase(
      {command: 'true', expected_exit_code: -1},
      {
        exit_code: '0',
        stdout_contains: 'literal-not-array',
        stderr_not_contains: ['valid', ''],
      },
    ));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('input.expected_exit_code must be a non-negative integer when present');
    expect(result.errors).toContain('expected_output.exit_code must be a non-negative integer when present');
    expect(result.errors).toContain('expected_output.stdout_contains must be an array of non-empty strings');
    expect(result.errors).toContain('expected_output.stderr_not_contains[1] must be a non-empty string');
  });

  test('rejects typo\'d expected_output keys (fail-closed on unknown fields)', () => {
    // `exitcode` is a likely typo of `exit_code`; `stdout_contain` of
    // `stdout_contains`. Without fail-closed validation both silently no-op.
    // Final sibling in the rollout codex started for elevenlabs.
    const runner = new ExternalCommandRunner();
    const result = runner.validate(commandCase(
      {command: 'true'},
      {
        exitcode: 0,
        stdout_contain: ['ok'],
      },
    ));

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('expected_output.exitcode is not recognized by the external-command runner');
    expect(result.errors).toContain('expected_output.stdout_contain is not recognized by the external-command runner');
  });

  test('reports timeout cleanly without leaving the runner hanging', async () => {
    // Long-running child + short timeout. The runner must report timed_out
    // and resolve quickly — both the SIGTERM-then-SIGKILL escalation and
    // the `finish()` path are exercised here.
    const runner = new ExternalCommandRunner();
    const start = Date.now();
    const result = await runner.execute(commandCase({
      command: 'sleep 30',
      timeout_ms: 300,
    }));
    const elapsed = Date.now() - start;

    expect(result.status).toBe('error');
    expect(result.error_message).toContain('timed out');
    expect(result.actual_output.timed_out).toBe(true);
    // Even with full KILL_GRACE_MS (5000) the runner must come back inside
    // a comfortable bound; without the timeout fix it would hang to the
    // outer test timeout.
    expect(elapsed).toBeLessThan(15_000);
  }, 20_000);
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

  test('rejects manifests with duplicate command ids', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gtm-ops-dup-'));
    try {
      writeFileSync(join(dir, 'eval-harness.manifest.json'), JSON.stringify({
        schema_version: 'voice_ai_agent_evals.gtm_ops.v1',
        project: 'gtm_ops',
        commands: [
          {id: 'unit', name: 'First', command: 'true'},
          {id: 'unit', name: 'Second', command: 'false'},
        ],
      }, null, 2));

      expect(() => loadGtmOpsHarnessManifest(dir))
        .toThrow(/duplicate command id\(s\).*\bunit\b/);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test('runGtmOpsAdapter does not silently green when zero commands match', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gtm-ops-empty-'));
    try {
      writeFileSync(join(dir, 'eval-harness.manifest.json'), JSON.stringify({
        schema_version: 'voice_ai_agent_evals.gtm_ops.v1',
        project: 'gtm_ops',
        commands: [
          {
            id: 'unit', name: 'Unit', command: 'true', tags: ['unit'],
          },
        ],
      }, null, 2));

      // Tag does not match any command — must NOT report passed.
      const run = await runGtmOpsAdapter({projectRoot: dir, tags: ['nonexistent']});

      expect(run.total).toBe(0);
      expect(run.status).not.toBe('passed');
      expect(run.status).toBe('error');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
