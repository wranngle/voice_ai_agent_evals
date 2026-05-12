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
import {spawnSync} from 'node:child_process';

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
 * Run GEPA against the inputs by spawning the Python sidecar with a
 * JSON-IO protocol (stdin: GepaOptimizationInput; stdout:
 * GepaOptimizationResult). Throws `GepaUnavailableError` if the sidecar
 * isn't installed — callers should catch and fall back to the single-shot
 * proposer (`src/remediation/proposal.ts`).
 *
 * Install the sidecar with `voice-evals doctor --install`.
 *
 * v1.0 ships a Python stub that echoes prompts back; full GEPA optimization
 * wiring lands in v1.1 once the metric-callback transport is finalized
 * (today there is no clean way to drive the GEPA reflection loop's
 * per-rollout LLM judge from TypeScript without round-tripping per call).
 */
export async function runGepaOptimization(input: GepaOptimizationInput): Promise<GepaOptimizationResult> {
  if (!isGepaAvailable()) {
    throw new GepaUnavailableError(`GEPA Python sidecar not installed at ${SIDECAR_CACHE}. `
      + 'Run `voice-evals doctor --install` (requires Python 3.11+; uv preferred), '
      + 'or fall back to the single-shot proposer in polishLoop. '
      + 'See CHANGELOG.md for sidecar install + v1.1 plan.');
  }

  const start = Date.now();
  const result = spawnSync(SIDECAR_BIN, [SIDECAR_SCRIPT], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 10 * 60 * 1000,
    maxBuffer: 32 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new GepaUnavailableError(`GEPA sidecar exited ${result.status ?? 'with no status'}; stderr: ${(result.stderr ?? '').slice(0, 500)}`);
  }

  let parsed: Partial<GepaOptimizationResult> & {error?: string};
  try {
    parsed = JSON.parse(result.stdout ?? '{}') as typeof parsed;
  } catch {
    throw new GepaUnavailableError(`GEPA sidecar emitted non-JSON stdout: ${(result.stdout ?? '').slice(0, 200)}`);
  }

  if (parsed.error) {
    throw new GepaUnavailableError(`GEPA sidecar error: ${parsed.error}`);
  }

  return {
    prompts: parsed.prompts ?? input.prompts,
    pareto: parsed.pareto,
    durationMs: parsed.durationMs ?? (Date.now() - start),
  };
}

export class GepaUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GepaUnavailableError';
  }
}
