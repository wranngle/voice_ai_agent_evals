/**
 * @wranngle/voice-evals/remediation/gepa-bridge — Python sidecar to GEPA.
 *
 * GEPA (Reflective Prompt Evolution, ICLR 2026 Oral) is Python-only; we
 * shell out to a uv-managed virtualenv. The venv is provisioned by
 * `scripts/postinstall.mjs` on first install (Phase 5.x will land the
 * actual install; Phase 5 ships this bridge as the consumer side so the
 * polish-loop can call it once the install lands).
 *
 * Today this module exposes:
 *   - `isGepaAvailable()` — synchronous filesystem check for the venv
 *   - `runGepaOptimization(opts)` — subprocess invocation; throws with a
 *     clear message if the sidecar isn't installed (the caller is
 *     expected to graceful-degrade to the single-shot proposer).
 *
 * Phase 5.x will (a) install the venv on postinstall, (b) ship the GEPA
 * wrapper Python script that mediates input/output, (c) wire this bridge
 * into polish-loop as the preferred optimizer when available.
 */

import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {homedir} from 'node:os';

const SIDECAR_VERSION = '0.1.0';
const SIDECAR_CACHE = join(homedir(), '.cache', 'voice-evals', 'python', SIDECAR_VERSION);
const SIDECAR_BIN = join(SIDECAR_CACHE, '.venv', 'bin', 'python');
const SIDECAR_SCRIPT = join(SIDECAR_CACHE, 'gepa_run.py');

export function isGepaAvailable(): boolean {
  return existsSync(SIDECAR_BIN) && existsSync(SIDECAR_SCRIPT);
}

export function getSidecarPaths(): {bin: string; script: string; cache: string; version: string} {
  return {
    bin: SIDECAR_BIN, script: SIDECAR_SCRIPT, cache: SIDECAR_CACHE, version: SIDECAR_VERSION,
  };
}

export type GepaOptimizationInput = {
  /** Prompt populations to evolve, keyed by identifier (e.g. 'system_prompt', 'tool:send_sms'). */
  prompts: Record<string, string>;
  /** Training transcripts / examples for reflection. */
  trainset: readonly unknown[];
  /** Maximum rollouts the optimizer may spend. */
  maxRollouts?: number;
};

export type GepaOptimizationResult = {
  /** Evolved prompts in the same keys as the input. */
  prompts: Record<string, string>;
  /** Per-prompt Pareto-front history if the optimizer reports it. */
  pareto?: unknown;
  /** Wall-clock duration in ms. */
  durationMs: number;
};

/**
 * Run GEPA against the inputs. Throws `GepaUnavailableError` if the Python
 * sidecar isn't installed — callers should catch and fall back to
 * single-shot proposer (`src/remediation/proposal.ts`).
 *
 * Phase 5 ships the contract; the subprocess invocation lands in Phase 5.x
 * alongside the postinstall venv setup. Today this throws GepaUnavailableError
 * with installation instructions.
 */
export async function runGepaOptimization(_input: GepaOptimizationInput): Promise<GepaOptimizationResult> {
  if (!isGepaAvailable()) {
    throw new GepaUnavailableError(`GEPA Python sidecar not installed at ${SIDECAR_CACHE}. `
      + 'Run `voice-evals doctor` to install (uv + python>=3.11 + gepa-ai/gepa), '
      + 'or fall back to the single-shot proposer in polishLoop. '
      + 'Sidecar install lands in Phase 5.x; see CHANGELOG.');
  }

  // Phase 5.x: spawnSync(SIDECAR_BIN, [SIDECAR_SCRIPT, ...]) with JSON IO.
  // For now we surface the same error even when the venv exists, since the
  // gepa_run.py contract isn't finalized yet.
  throw new GepaUnavailableError('GEPA Python sidecar install detected but the bridge protocol is not finalized in Phase 5; '
    + 'see Phase 5.x in CHANGELOG.md. polishLoop should continue to use the single-shot proposer.');
}

export class GepaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GepaUnavailableError';
  }
}
