/**
 * @wranngle/voice-evals/regression/baseline — capture + load BaselineSnapshots.
 *
 * Storage is plain JSON on disk. The convention is `baselines/<name>.json`,
 * relative to the project root, with the snapshot committed to git for
 * reproducibility.
 *
 * `captureBaseline` is pure — it just shapes an in-memory object. Persistence
 * (loadBaseline / saveBaseline) is opt-in and isolated so the same module
 * is usable in a non-Node consumer.
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
} from 'node:fs';
import {dirname, join} from 'node:path';
import type {BaselineRun, BaselineSnapshot, CaptureBaselineOptions} from './types';

const DEFAULT_BASELINES_DIR = 'baselines';

export function captureBaseline(
  runs: readonly BaselineRun[],
  options: CaptureBaselineOptions,
): BaselineSnapshot {
  const now = options.now ? options.now() : new Date().toISOString();
  const runsByTestId: Record<string, BaselineRun> = {};
  for (const run of runs) {
    runsByTestId[run.test_id] = run;
  }

  return {
    name: options.name,
    capturedAt: now,
    ref: options.ref,
    runs: runsByTestId,
  };
}

/**
 * Read a baseline snapshot from disk. Throws if missing — the caller should
 * either `existsSync` first or catch and treat as no-baseline.
 */
export function loadBaseline(name: string, baselineDir = DEFAULT_BASELINES_DIR): BaselineSnapshot {
  const path = baselinePath(name, baselineDir);
  if (!existsSync(path)) {
    throw new Error(`Baseline "${name}" not found at ${path}`);
  }

  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as BaselineSnapshot;
  if (!parsed || typeof parsed !== 'object' || typeof parsed.name !== 'string' || !parsed.runs) {
    throw new Error(`Baseline at ${path} is malformed`);
  }

  return parsed;
}

export function saveBaseline(
  snapshot: BaselineSnapshot,
  baselineDir = DEFAULT_BASELINES_DIR,
): string {
  const path = baselinePath(snapshot.name, baselineDir);
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return path;
}

export function baselineExists(name: string, baselineDir = DEFAULT_BASELINES_DIR): boolean {
  return existsSync(baselinePath(name, baselineDir));
}

function baselinePath(name: string, baselineDir: string): string {
  // Strip dots from the slug to neutralize path-traversal-like names
  // (`../foo` -> `-foo`). Trailing/leading hyphens get collapsed too.
  const safe = name
    .replaceAll(/[^\w-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
  return join(baselineDir, `${safe}.json`);
}
