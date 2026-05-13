# Autorefinement — 6-phase closed-loop remediation

`polishLoop` from `@wranngle/voice-evals/remediation` runs the v1.1 autorefinement loop ported from the archive's `supersystem/autorefinement-engine.js`. It iterates evaluate → analyze → propose → apply → verify → log until tests pass or it hits a stop condition.

## Loop structure

```
┌──────────────────────────────────────────────────────────────┐
│                    AUTOREFINEMENT LOOP                        │
├──────────────────────────────────────────────────────────────┤
│  1. EVALUATE   run the eval suite, collect failing dimensions │
│  2. ANALYZE    (optional) detect known failure patterns       │
│  3. PROPOSE    deterministic (pattern) OR LLM-driven          │
│  4. APPLY      governance-gated PATCH                         │
│  5. VERIFY     re-evaluate, compute delta                     │
│  6. LOG        (optional) append events to JSONL friction log │
└──────────────────────────────────────────────────────────────┘
```

Stop conditions:

| `stopped_because` | Meaning |
|---|---|
| `all_passing` | Zero failing dimensions — done. |
| `max_iterations` | Hit the `maxIterations` cap (default 3). |
| `patience_exhausted` | `patience` consecutive iterations with no improvement (default 2). |
| `no_proposal` | Proposer returned nothing for a failing run (LLM or patterns). |

## The 5 failure patterns

ANALYZE is fed by `analyze: (failures) => DetectionInput` — return the structured transcript / tool-calls / expected-tools the patterns need.

| Pattern | Fires when | Fix |
|---|---|---|
| `SMS_AFTER_DECLINE` | `send_sms` was called after caller said no/don't/stop/never mind/cancel/do not | Append SMS consent rule to system_prompt |
| `TOOL_NOT_CALLED` | An expected tool is absent from `tool_calls[]` | Append tool-invocation rule to system_prompt |
| `CONTEXT_LOST` | Agent re-asked for info already given ("what's your name again?") | Append context-retention rule to system_prompt |
| `HOSTILE_RESPONSE` | Agent matched negative tone or used defensive phrasing ("like I said…") | Append professional-tone rule to system_prompt |
| `INCONSISTENT_BEHAVIOR` | Failing count variance across 3+ iterations (CV > 0.4) | Reduce `temperature` by 0.3 (clipped at 0.1) |

When a pattern fires, the proposer emits a deterministic FixProposal — no LLM call, no temperature randomness. Idempotent: if the addendum is already in the prompt, the LLM fallback runs.

## Example

```ts
import {polishLoop} from '@wranngle/voice-evals/remediation';

const result = await polishLoop({
  client,
  agentId: 'agent_xxx',
  evaluate: async () => {
    const run = await runEvalSuite();
    return run.dimensions;
  },
  llm: async ({system, user}) => callMyLlm({system, user}),
  analyze: async failures => {
    const lastRun = await getLastConversation();
    return {
      turns: lastRun.turns,
      toolCalls: lastRun.tool_calls,
      expectedTools: ['send_sms', 'process_lead'],
    };
  },
  maxIterations: 5,
  patience: 2,
  frictionLogPath: 'data/friction-log.jsonl',
});

console.log(`Stopped: ${result.stopped_because}`);
console.log(`Patterns: ${JSON.stringify(result.patternsDetected)}`);
```

## Friction log

When `frictionLogPath` is set, every iteration appends a JSONL event:

```jsonl
{"timestamp":"…","type":"PATTERN_DETECTED","pattern":"SMS_AFTER_DECLINE","agentId":"…","success":false,"resolved":false}
{"timestamp":"…","type":"REMEDIATION_APPLIED","pattern":"system_prompt","agentId":"…","success":true,"detail":"before=3 after=1","resolved":false}
{"timestamp":"…","type":"VERIFICATION_FAILED","pattern":"system_prompt","agentId":"…","success":false,"detail":"before=1 after=1","resolved":false}
```

`logFriction`, `readFrictionLog`, `getUnresolvedFrictions`, `resolveFriction` from `@wranngle/voice-evals/remediation` round-trip the log.

## Aggregating across runs

```ts
import {aggregateCycleStats} from '@wranngle/voice-evals/remediation';

const stats = aggregateCycleStats(result.history, result);
// {iterations, initialFailing, finalFailing, proposals, applied,
//  improvedIterations, regressedIterations, flatIterations,
//  improvementRate, patternsDetected, stoppedBecause}
```

Stream `stats` into your dashboard of choice — it's plain JSON-friendly.

## See also

- `docs/factory.md` — generating the tests the loop polishes against
- `docs/methodology.md` — testing philosophy + dimensions
