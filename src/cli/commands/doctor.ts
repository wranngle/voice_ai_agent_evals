/**
 * `voice-evals doctor` — sidecar status report and (with `--install`)
 * the Python sidecar provisioner.
 *
 * Phase 6.x extracted from src/cli.ts into its own module; Phase 5.x
 * landed `--install` which provisions the venv via `uv` and installs the
 * `gepa` pip package (see `installSidecar` below). PyRIT adversarial
 * staging is deferred — `src/ingestion/index.ts` calls it "still deferred"
 * and `installSidecar` only `pip install`s `gepa`. Without `--install`
 * the command is read-only: it prints the cache path, venv binary,
 * bridge script, and availability.
 */

import {getSidecarPaths, isGepaAvailable} from '../../remediation/gepa-bridge';
import {installSidecar, type InstallOptions} from '../../remediation/sidecar/install';
import {createTracer} from '../../internal/jsonl-trace';

const trace = createTracer('cli.doctor');
// JSONL tracing — emit start/end events from dispatch entry points.

void trace;

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
  out('GEPA optimizer requires the Python sidecar (PyRIT adversarial campaigns');
  out('are deferred — the sidecar installer only stages gepa today). Without the');
  out('sidecar, polishLoop falls back to the single-shot LLM proposer (still');
  out('useful, just less sample-efficient).');
  out('');
  out('To install the sidecar (uv-managed venv + gepa pip install):');
  out('  voice-evals doctor --install');
  out('Add --dry-run to preview without writing.');
  out('Opt out entirely: export VOICE_EVALS_SKIP_PYTHON_INSTALL=1.');
  return 0;
}
