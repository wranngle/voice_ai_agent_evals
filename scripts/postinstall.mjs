#!/usr/bin/env node
/**
 * @wranngle/voice-evals postinstall hook.
 *
 * Intentionally a noop. The Python sidecar (uv-managed venv + GEPA pip +
 * staged PyRIT) lives at ~/.cache/voice-evals/python/<version>/ and is
 * installed on demand via `voice-evals doctor --install` — never
 * automatically at `npm install` time, because:
 *   - many consumers run `npm install` in CI / containers / build images
 *     that lack `uv` or Python; auto-install would break those installs
 *   - the core eval/runner surface does not depend on Python; only
 *     GEPA-driven optimization (v1.2) requires the sidecar
 *
 * Opt out of even running this script: set VOICE_EVALS_SKIP_PYTHON_INSTALL=1
 * or run `npm install --ignore-scripts`. Failures here MUST NOT block
 * install — exit 0 always.
 */

const noop = reason => {
  process.stdout.write(`[voice-evals] postinstall noop (${reason}); run \`voice-evals doctor --install\` when you want the Python sidecar.\n`);
  process.exit(0);
};

if (process.env.VOICE_EVALS_SKIP_PYTHON_INSTALL === '1') {
  noop('VOICE_EVALS_SKIP_PYTHON_INSTALL=1');
}

if (process.env.CI === 'true' || process.env.CI === '1') {
  // CI runs install thousands of times; skip the sidecar there. Consumers can
  // run `voice-evals doctor --install` inside CI when they actually need
  // remediation.
  noop('CI=true');
}

noop('opt-in design');
