/**
 * @wranngle/voice-evals/remediation/sidecar/install — venv provisioner.
 *
 * Opt-in install path invoked by `voice-evals doctor --install`. NEVER
 * runs from the npm postinstall hook (that's a no-op stub by design — too
 * many environments where unsolicited 200MB+ installs are hostile).
 *
 * Defensive throughout:
 *   - detect python3; fail loud with install hint if missing
 *   - detect uv; fall back to `python -m venv` if missing
 *   - idempotent: skip venv creation if .venv/bin/python exists
 *   - pip install is best-effort: log failures, keep the sidecar usable
 *     in stub mode (the Python script still runs without GEPA)
 *   - all spawnSync calls injectable for tests
 */

import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {type SpawnSyncReturns, spawnSync as nodeSpawnSync} from 'node:child_process';
import {getSidecarPaths} from '../gepa-bridge';
import {GEPA_RUN_SCRIPT, SIDECAR_README} from './templates';

export type SpawnFn = (cmd: string, args: readonly string[]) => SpawnSyncReturns<Uint8Array>;

export type InstallOptions = {
  spawn?: SpawnFn;
  out?: (line: string) => void;
  /** Log the steps that would run but make no changes. Default false. */
  dryRun?: boolean;
  /** Filesystem write callback. Mostly for tests. */
  writeFile?: (path: string, contents: string) => void;
  /** mkdir callback. Mostly for tests. */
  mkdir?: (path: string) => void;
  /** existsSync callback. Mostly for tests. */
  exists?: (path: string) => boolean;
};

export type InstallResult = {
  ok: boolean;
  reason?: 'python_missing' | 'venv_failed' | 'pip_failed' | 'write_failed';
  message?: string;
  pythonVersion?: string;
  uvAvailable: boolean;
  venvCreated: boolean;
  pipInstallSucceeded: boolean;
  scriptWritten: boolean;
};

export async function installSidecar(options: InstallOptions = {}): Promise<InstallResult> {
  const spawn = options.spawn ?? defaultSpawn;
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });
  const dryRun = options.dryRun ?? false;
  const exists = options.exists ?? existsSync;
  const mkdir = options.mkdir ?? ((path: string) => {
    mkdirSync(path, {recursive: true});
  });
  const writeFile = options.writeFile ?? ((path: string, contents: string) => {
    writeFileSync(path, contents, 'utf8');
  });

  const paths = getSidecarPaths();
  out(`voice-evals sidecar install (${dryRun ? 'dry-run' : 'live'})`);
  out(`Target cache: ${paths.cache}`);

  // 1. Detect python3
  const py = spawn('python3', ['--version']);
  if (py.status !== 0) {
    out('error: python3 not found on PATH. Install Python 3.11+ and re-run.');
    return {
      ok: false,
      reason: 'python_missing',
      message: 'python3 not found',
      uvAvailable: false,
      venvCreated: false,
      pipInstallSucceeded: false,
      scriptWritten: false,
    };
  }

  const pythonVersion = (py.stdout?.toString() ?? py.stderr?.toString() ?? '').trim();
  out(`Found ${pythonVersion}`);

  // 2. Detect uv (faster than python -m venv; fall back gracefully)
  const uv = spawn('uv', ['--version']);
  const uvAvailable = uv.status === 0;
  out(uvAvailable ? `Found ${uv.stdout?.toString().trim() ?? 'uv'}` : 'uv not found; falling back to python -m venv');

  if (dryRun) {
    out('--- dry run; no filesystem writes ---');
    return {
      ok: true,
      pythonVersion,
      uvAvailable,
      venvCreated: false,
      pipInstallSucceeded: false,
      scriptWritten: false,
    };
  }

  // 3. Ensure cache dir exists
  mkdir(paths.cache);
  writeFile(`${paths.cache}/README.md`, SIDECAR_README);

  // 4. Create venv (idempotent)
  let venvCreated = false;
  if (exists(paths.bin)) {
    out(`venv already present at ${paths.cache}/.venv — skipping creation`);
    venvCreated = true;
  } else {
    out(`Creating venv at ${paths.cache}/.venv`);
    const venvArgs = uvAvailable
      ? ['venv', `${paths.cache}/.venv`, '--python', '3.11']
      : ['-m', 'venv', `${paths.cache}/.venv`];
    const venvCmd = uvAvailable ? 'uv' : 'python3';
    const venvResult = spawn(venvCmd, venvArgs);
    if (venvResult.status !== 0) {
      const stderr = venvResult.stderr?.toString() ?? '';
      out(`error: venv creation failed: ${stderr}`);
      return {
        ok: false,
        reason: 'venv_failed',
        message: stderr,
        pythonVersion,
        uvAvailable,
        venvCreated: false,
        pipInstallSucceeded: false,
        scriptWritten: false,
      };
    }

    venvCreated = true;
  }

  // 5. pip install — best-effort. Failures here do NOT block sidecar usage;
  // the Python stub script works without `gepa` (it just runs in echo mode).
  let pipInstallSucceeded = false;
  out('Installing GEPA into the venv (best-effort)');
  const pipArgs = uvAvailable
    ? ['pip', 'install', '--python', paths.bin, 'gepa']
    : [`${paths.cache}/.venv/bin/pip`, 'install', 'gepa'];
  const pipCmd = uvAvailable ? 'uv' : pipArgs.shift()!;
  const pipResult = spawn(pipCmd, pipArgs);
  if (pipResult.status === 0) {
    pipInstallSucceeded = true;
    out('GEPA installed.');
  } else {
    out('warning: GEPA pip install failed; the sidecar will run in stub mode.');
    out(`  detail: ${(pipResult.stderr?.toString() ?? '').slice(0, 200)}`);
  }

  // 6. Write gepa_run.py
  let scriptWritten = false;
  try {
    mkdir(dirname(paths.script));
    writeFile(paths.script, GEPA_RUN_SCRIPT);
    scriptWritten = true;
    out(`Wrote ${paths.script}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    out(`error: failed to write ${paths.script}: ${message}`);
    return {
      ok: false,
      reason: 'write_failed',
      message,
      pythonVersion,
      uvAvailable,
      venvCreated,
      pipInstallSucceeded,
      scriptWritten: false,
    };
  }

  out('');
  out('voice-evals sidecar installed.');
  out(pipInstallSucceeded
    ? '  Full mode: gepa-bridge.runGepaOptimization will invoke GEPA.'
    : '  Stub mode: gepa-bridge.runGepaOptimization will run the echo script; full mode requires `gepa` pip package.');
  return {
    ok: true,
    pythonVersion,
    uvAvailable,
    venvCreated,
    pipInstallSucceeded,
    scriptWritten,
  };
}

const defaultSpawn: SpawnFn = (cmd, args) =>
  nodeSpawnSync(cmd, [...args], {encoding: 'buffer', timeout: 5 * 60 * 1000});
