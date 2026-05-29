# agent_evals

Synthetic ElevenLabs Conversational AI evaluation harness. Reads recorded conversation fixtures, scores them against a small set of contract rules, and emits a markdown summary the operator can consume.

## Run

From the project root:

```bash
bun install
bun run test:offline                                    # all offline test suites incl. agent_evals
bun run vitest run --project agent_evals                # just this package's tests
bun run src/agent_evals/runtime/cli.ts <fixture-path>   # run the evaluator end-to-end
```

Tests include contract validation for ElevenLabs-style webhook events using synthetic fixtures (`fixtures/webhook-events.json`).

## Layout

```
src/agent_evals/
  types/        arktype-parsed shapes and public contracts. Imports nothing.
                Conversation, Turn, EvaluationResult, WebhookPayload.
  config/       Env-driven runtime config. Imports types only.
  repo/         Fixture-backed conversation reader. Imports types, config.
  providers/    Cross-cutting boundaries (clock, logger, metrics). Imports types only.
  service/      Evaluation business rules. Imports types, repo, providers.
  runtime/      CLI entry point that wires the layers. Imports anything.
  ui/           Markdown renderer for evaluation results. Imports types, service.
  fixtures/     Synthetic conversation transcripts and webhook events.
tests/agent_evals/   Per-layer unit tests + webhook contract tests (at project root, not nested here).
```

## Architecture rule

Imports must flow forward through `types → config → repo → providers → service → runtime → ui`. The UI must never bypass the service layer. The convention is enforced by code review and the per-layer tests in `tests/agent_evals/`; there is no separate static linter for it (yet).
