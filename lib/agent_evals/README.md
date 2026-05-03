# agent-evals

Synthetic ElevenLabs Conversational AI evaluation harness. Reads recorded conversation fixtures, scores them against a small set of contract rules, and emits a markdown summary the ops console can consume.

This package is also the reference implementation of the repo's layered-domain architecture rule. See `docs/references/layered-domain-architecture.md` for the binding contract; see this package for what it looks like in practice.

## Run

```bash
bun install
bun test
bun run evaluate fixtures/conversations.json
```

Tests include contract validation for ElevenLabs-style webhook events using synthetic fixtures (`fixtures/webhook-events.json`).

## Layout

```
src/
  types/        Zod-parsed shapes and public contracts. Imports nothing.
                Includes Conversation, Turn, EvaluationResult, and WebhookPayload types.
  config/       Env-driven runtime config. Imports types only.
  repo/         Fixture-backed conversation reader. Imports types, config.
  providers/    Cross-cutting boundaries (clock, logger, metrics). Imports types only.
  service/      Evaluation business rules. Imports types, repo, providers.
  runtime/      CLI entry point that wires the layers. Imports anything.
  ui/           Markdown renderer for evaluation results. Imports types, service.
fixtures/       Synthetic conversation transcripts and webhook events.
tests/          Per-layer unit tests and webhook contract tests.
```

## Architecture Rule

Imports must flow forward through `types → config → repo → providers → service → runtime → ui`. The UI must never bypass the service layer. `scripts/lint-layered-architecture.sh` enforces this mechanically.
