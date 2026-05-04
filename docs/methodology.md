# Eval methodology

How this harness tests ElevenLabs voice agents and what it gates on.

## 0. Positioning vs. the ElevenLabs dashboard simulator

ElevenLabs ships a built-in conversation simulator on the agent dashboard. It's the right tool for **manual exploration**: try a what-if turn, hear the voice, sanity-check a prompt change before you commit. This harness does what the dashboard simulator structurally can't:

| Capability | Dashboard sim | This harness |
|---|---|---|
| Manual exploration of a prompt change | ✅ | — |
| Ad-hoc what-if on a voice or LLM swap | ✅ | — |
| **Automated regression on every commit** | — | ✅ |
| **Scenario-as-code** (versioned in git, diffable) | — | ✅ |
| **n8n-integrated post-call assertions** (verify the workflow fans out correctly) | — | ✅ |
| **Custom scoring rubric** (per-axis, partial credit, judge LLM choice) | — | ✅ |
| **CI-gated prompt promotion** (no merge if a scenario regresses) | — | ✅ |
| **Latency budgets enforced as hard thresholds** | — | ✅ |
| **Tool-call schema validation** (golden-file shape comparison) | — | ✅ |

The dashboard sim is where you discover a bug. This harness is where you keep it from coming back.

## 1. Determinism

Every scenario in `tests/scenarios/` is reproducible because we control every input that enters the agent:

- **Synthetic transcripts** are seeded — given the same scenario YAML, the same simulated user turns are generated bit-for-bit.
- **Audio fixtures** for any test that exercises ASR are recorded once and committed; we never re-synthesize TTS at test time.
- **Time** is injected via a `Clock` provider; `Date.now()` is forbidden in scenario assertions (caught by `lint-time-in-providers.sh` if those rules ever ship here too).

Determinism rule: a scenario's pass/fail must depend only on the agent under test, not on the network, wall clock, or model temperature. Temperature is pinned per scenario; an LLM-judge is invoked with `seed` set when the runner supports it.

See `tests/runs/` for committed sample outputs that prove the suite reproduces clean across machines.

## 2. Latency budgets

Latency matters more for voice than for any other agent surface — every 100 ms shows up as a noticeable hesitation. The harness's intent is to score four separate axes:

| Axis | Target p95 budget | Where it's measured | Implemented? |
|---|---|---|---|
| Time-to-first-byte (TTFB) | **≤ 800 ms** | Outbound `convai.send` to first byte returned | ❌ not yet |
| End-to-first-audio | **≤ 1.4 s** | Caller's last word to first audio sample of the agent's reply | ❌ not yet |
| Total-turn | **≤ 3.0 s** | Caller's last word to agent's last word of the same turn | ⚠️ partial — captured per-test as `latency_ms`, no p95 aggregation |
| Tool-call round-trip | **≤ 2.0 s** | LLM tool-call emission to tool result delivered back to LLM | ❌ not yet |

**Current state.** Each runner records one round-trip latency per test (`latency_ms` on the result, `avg_latency_ms` on the run summary). Scenario YAMLs declare the axes and budgets above as conventions; nothing in `lib/testing/` yet reads them and asserts. Treat the budgets as design intent, not a runtime gate. See `tests/scenarios/barge-in-mid-question/scenario.yaml` for the canonical YAML shape.

**What needs to land** for the budgets to bite: (1) per-segment timing capture in the ElevenLabs runner (TTFB vs first-audio vs total-turn — likely from the `convai` event stream), (2) a scenario-loader that pulls `thresholds.*_p95_ms`, (3) a rolling-window p95 aggregator in the orchestrator, (4) failure mode that emits a per-axis breakdown to `tests/runs/<id>/NOTE.md`.

## 3. Prompt and agent-config versioning

The harness versions the **full `agent.prompt` shape**, not just the prose:

```yaml
# Versioned per scenario commit:
agent:
  prompt:
    prompt: <markdown body>           # your prompt source file (kept under prompts/)
    llm: <model id>                   # e.g. gpt-4o-mini
    temperature: <float>
    tools: <tool array>               # full server-side tool definitions
    knowledge_base: <kb attachments>  # which KBs are mounted
```

Recommended convention: tag every prompt change `prompt/<name>/v<N>` on commit so rollbacks are addressable:

```bash
git checkout prompt/<name>/v<N-1> -- prompts/<name>.md
# then redeploy via your own deploy script
```

Tool-schema changes get the same treatment via `agent-registry.yaml` (gitignored; example shape in `agent-registry.example.yaml`).

The eval harness reads the agent state at run-time, not from a pinned config file, so a "prompt promotion" PR that changes a prompt file automatically re-runs the whole regression set against the new prompt before merge.

## 4. Scoring rubric

Each scenario specifies pass criteria in YAML:

```yaml
success_criteria:
  - axis: barge_in_recovery
    expected: true
    weight: 1.0
  - axis: tool_call_schema
    expected: { name: lookup_record, parameters_pass: true }
    weight: 1.0
  - axis: ttfb_p95
    expected: { lte_ms: 800 }
    weight: 0.5

partial_credit: true   # scenario passes if weighted score ≥ 0.7
judge_llm: claude-haiku-4-5  # explicit judge for subjective axes (tone, empathy)
```

Subjective axes (tone, empathy, clarity) are scored by an explicit judge LLM. The choice of judge is committed alongside the scenario — never default to "the same model that produced the response."

## 5. Voice-specific axes

Generic LLM evals don't catch voice-specific failure modes. The intended axes:

- **Barge-in recovery** — caller interrupts mid-utterance; does the agent yield, listen, and re-plan? Failure mode: agent talks over the caller.
- **Interruption recovery** — caller's audio drops mid-turn; does the agent pick up coherently when audio resumes?
- **TTS prosody sanity** — generated audio is not robotic, doesn't hallucinate punctuation, doesn't loop on rare tokens.
- **ASR confidence handling** — when the agent's STT confidence is low, does it confirm or escalate rather than guess?
- **Timeout behavior** — silence handling: how long before the agent prompts again? When does it gracefully end the call?

**Implementation status.** Each axis has a YAML key in `tests/scenarios/_template/scenario.yaml` and at least one fixture (`tests/scenarios/barge-in-mid-question/`). **The scoring engine that reads these axes does not exist yet.** `tests/runs/2026-04-fail-barge-in/NOTE.md` is a hand-authored example of the postmortem shape — not produced by an automated scoring pass. Wiring this up is on the roadmap, not in main.

## 6. Tool-call evaluation

Phone-based ElevenLabs agents (Twilio inbound) are server-side by construction — the LLM emits a tool call and a webhook handler (n8n or any other receiver) responds. Client-side tools don't apply here; that distinction matters because the eval surface is different (we assert on webhook delivery + response shape, not on a client's local execution).

The harness validates:

- **Schema conformance** — the emitted tool call's `name` and `parameters` match `agent.prompt.tools[*]`'s JSON Schema (arktype validation on the runner side).
- **Error-path coverage** — for every tool, at least one scenario exercises a tool-error response (4xx, 5xx, timeout) and asserts the agent recovers gracefully.
- **Server-side vs. client-side** — explicit. The harness refuses to run a "client-side tool" scenario against a server-side tool definition.
- **Knowledge-base vs. tool boundary** — when an agent should use a KB lookup vs. a tool call: see [`tool-calling.md`](tool-calling.md).

Every assertion in this section cites or links to an example run in `tests/runs/`; the methodology is not aspirational.
