/**
 * `voice-evals doctor` — sidecar status report.
 *
 * Phase 6.x extracted from src/cli.ts into its own module. Phase 5.x will
 * add `doctor --install` which provisions the Python venv (uv + GEPA +
 * PyRIT). For now this command is read-only: it reports availability.
 */

import {getSidecarPaths, isGepaAvailable} from '../../remediation/gepa-bridge';
import {installSidecar, type InstallOptions} from '../../remediation/sidecar/install';

export type DoctorOptions = {
  /** Stream output here. Defaults to stdout. */
  out?: (line: string) => void;
  /** If true, provision the Python sidecar (uv + venv + gepa pip install). */
  install?: boolean;
  /** If true, log what would happen during install but make no changes. */
  dryRun?: boolean;
  /** Injectable spawn for tests (forwarded to installSidecar). */
  installOverrides?: Partial<InstallOptions>;
};

export async function runDoctor(options: DoctorOptions = {}): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  if (options.install) {
    const result = await installSidecar({
      out,
      dryRun: options.dryRun,
      ...options.installOverrides,
    });
    return result.ok ? 0 : 1;
  }

  const {bin, script, cache, version} = getSidecarPaths();
  const available = isGepaAvailable();

  out('voice-evals doctor');
  out('');
  out(`Sidecar version: ${version}`);
  out(`Sidecar cache:   ${cache}`);
  out(`Python binary:   ${bin}`);
  out(`Bridge script:   ${script}`);
  out(`Status:          ${available ? 'available' : 'unavailable'}`);
  out('');
  out('GEPA optimizer + PyRIT adversarial campaigns require the Python sidecar.');
  out('Without it, polishLoop falls back to the single-shot LLM proposer (still');
  out('useful, just less sample-efficient).');
  out('');
  out('To install the sidecar (uv-managed venv + gepa pip install):');
  out('  voice-evals doctor --install');
  out('Add --dry-run to preview without writing.');
  out('Opt out entirely: export VOICE_EVALS_SKIP_PYTHON_INSTALL=1.');
  return 0;
}
