/**
 * `voice-evals doctor` — sidecar status report.
 *
 * Phase 6.x extracted from src/cli.ts into its own module. Phase 5.x will
 * add `doctor --install` which provisions the Python venv (uv + GEPA +
 * PyRIT). For now this command is read-only: it reports availability.
 */

import {getSidecarPaths, isGepaAvailable} from '../../remediation/gepa-bridge';

export type DoctorOptions = {
  /** Stream output here. Defaults to stdout. */
  out?: (line: string) => void;
};

export async function runDoctor(_options: DoctorOptions = {}): Promise<number> {
  const out = _options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

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
  out('The auto-install of the Python venv lands in Phase 5.x — track CHANGELOG.md.');
  out('To opt out of any future install attempt, export VOICE_EVALS_SKIP_PYTHON_INSTALL=1.');
  return 0;
}
