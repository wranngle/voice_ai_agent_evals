/**
 * Shared n8n URL helpers.
 *
 * Three callers (`src/testing/runners/n8n-eval-runner.ts`,
 * `scripts/monitor-executions.ts`, `scripts/list-workflows.ts`) used to keep
 * identical copies of `normalizeN8nApiUrl`. Centralized here so a future
 * change (path version bumps, alternative bases, etc.) lands in one place.
 */

/**
 * Accept either `https://host` or `https://host/api/v1` for the n8n API
 * base. Trim trailing slashes; append `/api/v1` if missing. Empty input
 * returns the bare `/api/v1` suffix — callers should guard against an
 * empty source URL before calling.
 */
export function normalizeN8nApiUrl(value: string): string {
  const trimmed = trimTrailingSlashes(value.trim());
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

/**
 * Imperative linear-time trailing-slash trim. Avoids `/\/+$/` which CodeQL
 * flags as polynomial-regex risk on user-controlled input.
 */
function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.codePointAt(end - 1) === 47 /* '/' */) {
    end--;
  }

  return end === value.length ? value : value.slice(0, end);
}
