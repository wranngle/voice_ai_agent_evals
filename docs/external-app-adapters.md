# External App Adapters

External app adapters let this harness orchestrate app-owned eval suites without
moving those tests into this repo.

## Boundary

The app repo owns:

- UI, API, domain, and fixture semantics.
- Playwright/Vitest/axe/perf/eval commands.
- Artifact production.
- Synthetic-data enforcement.

`voice_ai_agent_evals` owns:

- Command orchestration through the `external-command` runner.
- Normalized pass/fail/error status.
- Output tails, latency, dimensions, and artifact references.
- Cross-run reporting.

## gtm_ops

`gtm_ops` publishes `eval-harness.manifest.json`. Run it from this repo:

```bash
bun run testing:gtm-ops --root ../gtm_ops
```

Target a subset with manifest tags:

```bash
bun run testing:gtm-ops --root ../gtm_ops --tag ui
bun run testing:gtm-ops --root ../gtm_ops --tag unit
```

The adapter falls back to a conservative default command list if the manifest is
missing, but the manifest is the contract. Keep the app repo manifest aligned
with its `AGENTS.md` validation gates and `package.json` scripts.

## Manifest Shape

```json
{
  "schema_version": "voice_ai_agent_evals.gtm_ops.v1",
  "project": "gtm_ops",
  "commands": [
    {
      "id": "console-e2e",
      "name": "Playwright console UI suite",
      "command": "bun run test:console",
      "tags": ["ui", "playwright", "a11y"],
      "timeout_ms": 300000,
      "expected_output": {
        "exit_code": 0,
        "stdout_not_contains": ["REGRESSION DETECTED"]
      },
      "artifacts": [
        {
          "name": "Playwright console report",
          "path": "playwright-console-report/index.html",
          "kind": "html",
          "producer": "bun run test:console"
        }
      ]
    }
  ]
}
```
