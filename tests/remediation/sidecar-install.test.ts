import {describe, expect, it} from 'vitest';
import {installSidecar, type SpawnFn} from '../../src/remediation/sidecar/install';

function makeSpawn(impls: Record<string, {status: number; stdout?: string; stderr?: string}>): SpawnFn {
  return (cmd: string, args: readonly string[]) => {
    const key = [cmd, ...args].join(' ');
    // Match by prefix so we don't have to pin every arg variation.
    for (const [pattern, response] of Object.entries(impls)) {
      if (key.startsWith(pattern)) {
        return {
          pid: 1,
          status: response.status,
          signal: null,
          stdout: Buffer.from(response.stdout ?? ''),
          stderr: Buffer.from(response.stderr ?? ''),
          output: [null, Buffer.from(response.stdout ?? ''), Buffer.from(response.stderr ?? '')],
        };
      }
    }

    return {
      pid: 1,
      status: 127,
      signal: null,
      stdout: Buffer.from(''),
      stderr: Buffer.from(`command not found: ${cmd}`),
      output: [null, Buffer.from(''), Buffer.from('')],
    };
  };
}

describe('installSidecar', () => {
  it('fails fast when python3 is missing', async () => {
    const lines: string[] = [];
    const spawn = makeSpawn({
      'python3 --version': {status: 127, stderr: 'not found'},
    });
    const result = await installSidecar({
      spawn,
      out: line => lines.push(line),
      writeFile: () => undefined,
      mkdir: () => undefined,
      exists: () => false,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('python_missing');
    expect(lines.some(l => l.includes('python3 not found'))).toBe(true);
  });

  it('dryRun reports detected runtimes but does not write', async () => {
    const writes: Array<[string, string]> = [];
    const mkdirs: string[] = [];
    const spawn = makeSpawn({
      'python3 --version': {status: 0, stdout: 'Python 3.11.7\n'},
      'uv --version': {status: 0, stdout: 'uv 0.4.0\n'},
    });
    const result = await installSidecar({
      spawn,
      out: () => undefined,
      writeFile: (path, contents) => writes.push([path, contents]),
      mkdir: path => mkdirs.push(path),
      exists: () => false,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(result.uvAvailable).toBe(true);
    expect(result.pythonVersion).toContain('Python 3.11');
    expect(writes).toHaveLength(0);
    expect(mkdirs).toHaveLength(0);
  });

  it('falls back from uv to python -m venv when uv is missing', async () => {
    const writes: Array<[string, string]> = [];
    const spawnCalls: Array<{cmd: string; args: readonly string[]}> = [];
    const spawn: SpawnFn = (cmd, args) => {
      spawnCalls.push({cmd, args: [...args]});
      const key = `${cmd} ${args.join(' ')}`;
      if (key.startsWith('python3 --version')) {
        return {
          pid: 1, status: 0, signal: null, stdout: Buffer.from('Python 3.11.7'), stderr: Buffer.from(''), output: [null, Buffer.from(''), Buffer.from('')],
        };
      }

      if (key.startsWith('uv --version')) {
        return {
          pid: 1, status: 127, signal: null, stdout: Buffer.from(''), stderr: Buffer.from('not found'), output: [null, Buffer.from(''), Buffer.from('')],
        };
      }

      // every other call (venv, pip) succeeds
      return {
        pid: 1, status: 0, signal: null, stdout: Buffer.from(''), stderr: Buffer.from(''), output: [null, Buffer.from(''), Buffer.from('')],
      };
    };

    const result = await installSidecar({
      spawn,
      out: () => undefined,
      writeFile: (path, contents) => writes.push([path, contents]),
      mkdir: () => undefined,
      exists: () => false,
    });

    expect(result.ok).toBe(true);
    expect(result.uvAvailable).toBe(false);
    // Should invoke python3 -m venv (not uv venv)
    expect(spawnCalls.some(c => c.cmd === 'python3' && c.args[0] === '-m' && c.args[1] === 'venv')).toBe(true);
    // gepa_run.py should be one of the written files
    expect(writes.some(([path]) => path.endsWith('gepa_run.py'))).toBe(true);
  });

  it('skips venv creation when binary already exists (idempotent)', async () => {
    const spawnCalls: Array<{cmd: string; args: readonly string[]}> = [];
    const spawn: SpawnFn = (cmd, args) => {
      spawnCalls.push({cmd, args: [...args]});
      return {
        pid: 1, status: 0, signal: null, stdout: Buffer.from(''), stderr: Buffer.from(''), output: [null, Buffer.from(''), Buffer.from('')],
      };
    };

    const result = await installSidecar({
      spawn,
      out: () => undefined,
      writeFile: () => undefined,
      mkdir: () => undefined,
      exists: () => true, // venv already there
    });

    expect(result.ok).toBe(true);
    expect(result.venvCreated).toBe(true);
    expect(spawnCalls.some(c => c.args.includes('-m') && c.args.includes('venv'))).toBe(false);
    expect(spawnCalls.some(c => c.cmd === 'uv' && c.args[0] === 'venv')).toBe(false);
  });

  it('writes the gepa_run.py template and README', async () => {
    const writes: Array<[string, string]> = [];
    const spawn: SpawnFn = () => ({
      pid: 1,
      status: 0,
      signal: null,
      stdout: Buffer.from('Python 3.11.7'),
      stderr: Buffer.from(''),
      output: [null, Buffer.from(''), Buffer.from('')],
    });

    await installSidecar({
      spawn,
      out: () => undefined,
      writeFile: (path, contents) => writes.push([path, contents]),
      mkdir: () => undefined,
      exists: () => false,
    });

    const writtenPaths = writes.map(([p]) => p);
    expect(writtenPaths.some(p => p.endsWith('gepa_run.py'))).toBe(true);
    expect(writtenPaths.some(p => p.endsWith('README.md'))).toBe(true);

    const script = writes.find(([p]) => p.endsWith('gepa_run.py'))?.[1] ?? '';
    expect(script).toContain('#!/usr/bin/env python3');
    expect(script).toContain('json.load(sys.stdin)');
  });

  it('treats pip install failure as a warning, not a hard error', async () => {
    const lines: string[] = [];
    const spawn: SpawnFn = (cmd, args) => {
      const key = `${cmd} ${args.join(' ')}`;
      // Order matters: pip arg may carry a .venv path, so match 'pip' before 'venv'.
      if (key.includes('pip')) {
        return {
          pid: 1, status: 1, signal: null, stdout: Buffer.from(''), stderr: Buffer.from('pip rejected'), output: [null, Buffer.from(''), Buffer.from('')],
        };
      }

      if (key.includes('--version')) {
        return {
          pid: 1, status: 0, signal: null, stdout: Buffer.from('Python 3.11'), stderr: Buffer.from(''), output: [null, Buffer.from(''), Buffer.from('')],
        };
      }

      if (key.includes('venv')) {
        return {
          pid: 1, status: 0, signal: null, stdout: Buffer.from(''), stderr: Buffer.from(''), output: [null, Buffer.from(''), Buffer.from('')],
        };
      }

      return {
        pid: 1, status: 0, signal: null, stdout: Buffer.from(''), stderr: Buffer.from(''), output: [null, Buffer.from(''), Buffer.from('')],
      };
    };

    const result = await installSidecar({
      spawn,
      out: line => lines.push(line),
      writeFile: () => undefined,
      mkdir: () => undefined,
      exists: () => false,
    });

    expect(result.ok).toBe(true);
    expect(result.pipInstallSucceeded).toBe(false);
    expect(lines.some(l => l.includes('stub mode'))).toBe(true);
  });
});
