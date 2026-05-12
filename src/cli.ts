#!/usr/bin/env bun
/**
 * @wranngle/voice-evals CLI entry.
 *
 * Phase 6 layout:
 *   - `voice-evals doctor` — check the Python sidecar (Phase 5.x) status.
 *   - everything else delegates to src/testing/cli.ts (run / list / validate
 *     / report / ingest / clear / scenario flows).
 *
 * Full command split into src/cli/commands/{init, polish, baseline,
 * remediate, ...} lands in Phase 6.x alongside the docs site rewrite.
 */

// `export {}` makes this a module so top-level await is allowed under tsc.
export {};

const command = process.argv[2];

// Side-effect import: src/testing/cli.ts calls main() at module load.
await (command === 'doctor' ? runDoctor() : import('./testing/cli'));

async function runDoctor(): Promise<void> {
  const {getSidecarPaths, isGepaAvailable} = await import('./remediation');
  const {bin, script, cache, version} = getSidecarPaths();
  const available = isGepaAvailable();

  console.log(`voice-evals doctor

Sidecar version: ${version}
Sidecar cache:   ${cache}
Python binary:   ${bin}
Bridge script:   ${script}
Status:          ${available ? 'available' : 'unavailable'}

GEPA optimizer + PyRIT adversarial campaigns require the Python sidecar.
Without it, polishLoop falls back to the single-shot LLM proposer (still
useful, just less sample-efficient).

The auto-install of the Python venv lands in Phase 5.x — track CHANGELOG.md.
To opt out of any future install attempt, export VOICE_EVALS_SKIP_PYTHON_INSTALL=1.`);
  process.exit(0);
}
