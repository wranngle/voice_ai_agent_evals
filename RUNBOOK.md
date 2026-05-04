# Runbook

Operational diagnostics for the eval harness. Each section is command-line first, prose second.

## Eval CI failing

**Symptom**: a PR's CI run fails with offline test errors.

```bash
# 1. Reproduce locally with the same flags CI uses.
bun run test:offline

# 2. If it passes locally and fails in CI, check fixture path determinism.
git status tests/scenarios/        # untracked or stale fixtures often cause CI/local divergence

# 3. Run only the failing project for tight feedback loop.
bun run test --project <project-name>     # ingestion, integration, governance, agent_evals
```

Expected output shape on a green run is in `tests/runs/`; diff against that for the failing scenario.

If it's a flaky scenario (passes 80% of the time): the scenario isn't deterministic. See [`docs/extending-the-harness.md`](docs/extending-the-harness.md) — most likely a wall-clock or unseeded LLM call leaked in. Fix the fixture, don't retry the test.

## Live-agent regression (your agent making bad calls)

**Symptom**: a real call sounds wrong — agent talks over caller, mishandles a tool call, gives stale info.

```bash
# 1. Roll back to the last known-good prompt (whatever you tag your prompts as).
git log --oneline -- prompts/<your-prompt>.md | head -10
git checkout <good-commit> -- prompts/<your-prompt>.md

# 2. Push the rolled-back prompt to the live agent (your own deploy script).
# 3. Verify the live agent now reflects the old prompt.
bun run scripts/check-elevenlabs-agent.ts
```

If the issue persists after rollback, the regression isn't in the prompt — it's in a tool, an upstream workflow, or the ElevenLabs platform itself. Skip to the relevant section below.

## ElevenLabs 5xx (API errors)

**Symptom**: `scripts/test-elevenlabs-runner.ts` or live calls returning 5xx from ElevenLabs.

```bash
# 1. Check ElevenLabs status page.
curl -s https://status.elevenlabs.io/api/v2/status.json | jq '.status'

# 2. Verify credentials.
bun run scripts/check-elevenlabs-agent.ts   # exits non-zero on auth failure

# 3. If credentials are bad, refresh the .env entry.
#    Required env vars:
#      ELEVENLABS_API_KEY
#      ELEVENLABS_AGENT_ID

# 4. Retry policy: idempotent operations only.
#    Do NOT retry on 401/403 (auth — fix the env var).
#    Retry once on 502/503/504 with 5s backoff.
#    Retry never on 4xx (request-side bug; fix the code).
```

## Webhook signature verification failing

**Symptom**: post-call webhooks returning 401 — either the live agent stopped delivering, or the harness logs `signature_mismatch` / `stale_or_missing_signature`.

```bash
# 1. Confirm the webhook secret env var is set in BOTH the receiver and the harness.
echo "${ELEVENLABS_POST_CALL_SECRET:-MISSING}"

# 2. Common causes (in observed frequency order):
#    - Secret was rotated on one side but not the other.
#    - Body was re-serialized before HMAC verification (whitespace changes the digest).
#    - System clock drift > tolerance window (default 30 min).
```

The verification logic is documented in [`docs/webhook-security.md`](docs/webhook-security.md). If the harness logs are silent on the failure, the request never reached your handler — check Twilio + ElevenLabs delivery logs first.

## Local dev on a clean machine

**Symptom**: cloned the repo on a clean machine; can't run anything.

```bash
# 1. Install runtime + tooling.
bun install

# 2. Run offline tests (no live ElevenLabs / Twilio / n8n needed).
bun run test:offline

# 3. To run against a real ElevenLabs sandbox agent:
cp .env.example .env
# Edit .env: set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID for a sandbox agent.
bun run testing:live:el
```

The harness has a hard rule: **CI never needs secrets**. If `bun run test:offline` works on a clean machine, the harness is healthy.
