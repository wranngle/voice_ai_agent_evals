# Runbook

Operational diagnostics for the eval harness and the live agent. Each section is command-line first, prose second.

## the agent making bad calls in production

**Symptom**: a real call sounds wrong — agent talks over caller, mishandles a tool call, gives stale info, drops a number.

```bash
# 1. Roll back to the last known-good prompt.
git checkout prompt/primary/v<N-1> -- prompts/primary.md

# 2. Push the rolled-back prompt to the live agent.
node scripts/stepwise-agent-update.js

# 3. Verify the live agent now reflects the old prompt.
node scripts/check-elevenlabs-agent.js
```

If you don't know which version was last good: `git log --oneline prompts/primary.md | head -10` shows the commit history; pick the commit before the suspect one.

If the issue persists after rollback, the regression isn't in the prompt — it's in a tool, the n8n workflow, or the ElevenLabs platform. Skip to the relevant section below.

## Eval CI failing

**Symptom**: a PR's CI run fails with `bun test` errors.

```bash
# 1. Reproduce locally with the same flags CI uses.
bun test --mock                    # CI runs against agent-registry.example.yaml

# 2. If it passes locally and fails in CI, check fixture path determinism.
git status tests/scenarios/        # untracked or stale fixtures often cause CI/local divergence

# 3. Run only the failing scenario for tight feedback loop.
bun test --filter <scenario-id>
```

Expected output shape on a green run is in `tests/runs/<scenario-id>-passing/`; diff against that for the failing scenario.

If it's a flaky scenario (passes 80% of the time): the scenario isn't deterministic. See [`docs/extending-the-harness.md`](docs/extending-the-harness.md) §"Anti-patterns" — most likely a wall-clock or unseeded LLM call leaked in. Fix the fixture, don't retry the test.

## ElevenLabs 5xx (API errors)

**Symptom**: `scripts/test-elevenlabs-runner.ts` or live calls returning 5xx from ElevenLabs.

```bash
# 1. Check ElevenLabs status page.
curl -s https://status.elevenlabs.io/api/v2/status.json | jq '.status'

# 2. Verify our credentials.
node scripts/check-elevenlabs-agent.js   # exits non-zero on auth failure

# 3. If credentials are bad, refresh the .env entry.
# Required env vars:
#   ELEVENLABS_API_KEY
#   ELEVENLABS_AGENT_ID
#   ELEVENLABS_POST_CALL_SECRET (webhook HMAC)

# 4. Retry policy: idempotent operations only.
#    Do NOT retry on 401/403 (auth — fix the env var).
#    Retry once on 502/503/504 with 5s backoff.
#    Retry never on 4xx (request-side bug; fix the code).
```

Fallback agent: `agent-registry.yaml` ships a secondary agent (`agent_yyyy_demo` placeholder) for failover routing — Twilio's TwiML can route to it if the primary is down. The harness verifies the fallback responds via the same regression set.

## Webhook signature verification failing

**Symptom**: post-call webhooks returning 401 — either the live agent stopped delivering, or the harness logs `signature_mismatch` / `stale_or_missing_signature`.

```bash
# 1. Confirm the webhook secret env var is set in BOTH n8n and the harness.
echo "${ELEVENLABS_POST_CALL_SECRET:-MISSING}"
# (in n8n) Settings → Credentials → "ElevenLabs Post-Call Secret" — value must match.

# 2. Inspect the failing request.
#    Tail the n8n workflow execution log; look for the X-Signature header.
#    If header missing entirely → ElevenLabs config issue, not signature mismatch.

# 3. Common causes (in observed frequency order):
#    - Secret was rotated on one side but not the other.
#    - Body was re-serialized before HMAC verification (whitespace changes the digest).
#    - System clock drift > tolerance window (default 30 min).

# 4. Reproduce locally.
node scripts/secure-elevenlabs-hmac.js --verify --payload <captured-body> --signature <header>
```

The verification logic is in [`docs/webhook-security.md`](docs/webhook-security.md); the implementation is `scripts/secure-elevenlabs-hmac.js`. If the harness logs are silent on the failure, the request never reached the n8n workflow — check Twilio + ElevenLabs side first.

## Local dev without dotfiles

**Symptom**: cloned the repo on a clean machine; can't run anything because the dotfiles environment isn't there.

```bash
# 1. Install runtime + tooling without the dotfiles bootstrap.
mise install                  # picks up .mise.toml (node 24, bun 1.1)
bun install                   # all package deps

# 2. Run in --mock mode (no live ElevenLabs / Twilio / n8n needed).
cp agent-registry.example.yaml agent-registry.yaml   # placeholder IDs only
bun test --mock

# 3. To run against a real ElevenLabs sandbox agent:
cp .env.example .env
# Edit .env: set ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID for a sandbox agent.
bun test --filter <scenario-id>
```

The harness has a hard rule: **CI never needs secrets**. If `bun test --mock` works on a clean machine without `~/.dotfiles`, the harness is healthy. If it doesn't, that's the bug — fix the harness to read placeholders, not the operator's setup.
