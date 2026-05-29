import {
  existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {runInit} from '../../src/cli/commands/init';

function makeTempCwd(): string {
  return mkdtempSync(join(tmpdir(), 'voice-evals-init-'));
}

describe('runInit', () => {
  it('writes voice-evals.config.ts to cwd', async () => {
    const cwd = makeTempCwd();
    try {
      const lines: string[] = [];
      const code = await runInit({cwd, out: line => lines.push(line)});
      expect(code).toBe(0);
      const target = join(cwd, 'voice-evals.config.ts');
      expect(existsSync(target)).toBe(true);
      const content = readFileSync(target, 'utf8');
      expect(content).toContain('@wranngle/voice-evals');
      expect(content).toContain('createVoiceEvalsClient');
      expect(content).toContain('LlmCompleteCallback');
      // The scaffolded config lives in the consumer's project — it must
      // not reach into SDK-internal relative paths like
      // `../../internal/jsonl-trace`. Catches the regression fixed in
      // fix/init-template-broken-import.
      expect(content).not.toMatch(/from\s+['"]\.\.\/.+['"]/);
      expect(content).not.toContain('internal/jsonl-trace');
      expect(lines.some(l => l.includes('Wrote'))).toBe(true);
    } finally {
      rmSync(cwd, {recursive: true, force: true});
    }
  });

  it('refuses to overwrite without --force', async () => {
    const cwd = makeTempCwd();
    try {
      const target = join(cwd, 'voice-evals.config.ts');
      writeFileSync(target, '// preexisting custom config', 'utf8');

      const lines: string[] = [];
      const code = await runInit({cwd, out: line => lines.push(line)});
      expect(code).toBe(1);
      expect(lines.some(l => l.includes('already exists'))).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('// preexisting custom config');
    } finally {
      rmSync(cwd, {recursive: true, force: true});
    }
  });

  it('overwrites when --force is set', async () => {
    const cwd = makeTempCwd();
    try {
      const target = join(cwd, 'voice-evals.config.ts');
      writeFileSync(target, '// preexisting', 'utf8');

      const code = await runInit({cwd, force: true, out: () => undefined});
      expect(code).toBe(0);
      expect(readFileSync(target, 'utf8')).toContain('createVoiceEvalsClient');
    } finally {
      rmSync(cwd, {recursive: true, force: true});
    }
  });
});
