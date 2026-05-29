/**
 * @wranngle/voice-evals/remediation/sidecar/templates
 *
 * Embedded templates the install step writes to ~/.cache/voice-evals/python/<version>/.
 *
 * GEPA_RUN_SCRIPT is the JSON-IO contract between gepa-bridge.ts and the
 * Python sidecar:
 *   stdin  : JSON-encoded GepaOptimizationInput
 *   stdout : JSON-encoded GepaOptimizationResult
 *
 * The package ships a stub Python implementation that echoes prompts back
 * (so the round-trip and the venv are testable without depending on the
 * GEPA pip package being installable). The actual GEPA optimizer wiring
 * lands in v1.2 once we finalize the metric-callback transport.
 */

export const GEPA_RUN_SCRIPT = `#!/usr/bin/env python3
"""
voice-evals GEPA sidecar — JSON-IO protocol over stdin/stdout.

Read GepaOptimizationInput from stdin, run GEPA (or stub), write
GepaOptimizationResult to stdout.

Current release ships a stub: echoes prompts back unchanged so the
round-trip is testable without a working GEPA install. Full optimizer
wiring lands in v1.2 — see CHANGELOG.md.
"""
import json
import sys
import time


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        json.dump({"error": f"invalid JSON on stdin: {e}"}, sys.stdout)
        return 2

    prompts = payload.get("prompts", {})
    if not isinstance(prompts, dict):
        json.dump({"error": "prompts must be an object"}, sys.stdout)
        return 2

    start = time.time()

    # Stub: try to import gepa. If installed, we still echo for now
    # (the optimizer wiring is staged for v1.2); if missing, we still
    # succeed so the bridge contract is testable in environments without
    # the GEPA pip package.
    try:
        import gepa  # type: ignore  # noqa: F401
        gepa_available = True
    except ImportError:
        gepa_available = False

    result = {
        "prompts": prompts,
        "durationMs": int((time.time() - start) * 1000),
        "stub": True,
        "gepa_pip_installed": gepa_available,
        "note": "GEPA sidecar stub — full optimization lands in v1.2.",
    }
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
`;

export const SIDECAR_README = `# voice-evals Python sidecar

Installed by \`voice-evals doctor --install\` into \`~/.cache/voice-evals/python/<version>/\`.

Houses:
  .venv/                  Python virtualenv (uv or python -m venv)
  gepa_run.py             JSON-IO entry point invoked by gepa-bridge.ts

To reinstall, delete this directory and run \`voice-evals doctor --install\`
again. To opt out of the sidecar entirely, set
\`VOICE_EVALS_SKIP_PYTHON_INSTALL=1\` before \`npm install\` to skip the
postinstall hook (the doctor command still respects this).
`;
