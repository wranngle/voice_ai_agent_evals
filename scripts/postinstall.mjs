#!/usr/bin/env node
/**
 * @wranngle/voice-evals postinstall hook.
 *
 * Phase 5 will install a Python sidecar (uv + GEPA + PyRIT) into
 * ~/.cache/voice-evals/python/<version>/ for closed-loop remediation and
 * audio-native adversarial campaigns. Phase 0 ships an idempotent stub so
 * the script field is wired without doing anything yet.
 *
 * Opt out entirely: set VOICE_EVALS_SKIP_PYTHON_INSTALL=1 or run
 * `npm install --ignore-scripts`.
 *
 * Failures here MUST NOT block install — the core eval/runner surface
 * does not depend on Python.
 */

const noop = reason => {
  process.stdout.write(`[voice-evals] postinstall noop (${reason}); core install fine.\n`);
  process.exit(0);
};

if (process.env.VOICE_EVALS_SKIP_PYTHON_INSTALL === '1') {
  noop('VOICE_EVALS_SKIP_PYTHON_INSTALL=1');
}

if (process.env.CI === 'true' || process.env.CI === '1') {
  // CI runs install thousands of times; skip the sidecar there. Consumers can
  // run `voice-evals doctor` inside CI when they actually need remediation.
  noop('CI=true');
}

noop('Phase 0 stub; Python sidecar lands in Phase 5');
