# Test factory — bulk test generation + execution

The factory subsystem turns YAML templates into N concrete ElevenLabs tests, uploads them via the Tests API, runs them as a batch, and reports pass/fail.

It is the v1.1 port of the archived `wranngle/voice_ai_agents/supersystem/test-factory/`. The combinatorial engine is pure TypeScript (~150 LOC), so no Python sidecar is required.

## Quickstart (CLI)

```sh
# 1. Copy templates into your project (or use the bundled ones)
cp -r node_modules/@wranngle/voice-evals/templates/factory ./templates/factory

# 2. Generate 50 tests, write them to disk
voice-evals factory generate \
  --strategy pairwise \
  --count 50 \
  --output tests.json

# 3. Upload to the portal (visible at elevenlabs.io)
ELEVENLABS_API_KEY=... voice-evals factory upload \
  --input tests.json \
  --agent-id agent_xxx \
  --manifest manifest.json

# 4. Run them and wait for the verdict
ELEVENLABS_API_KEY=... voice-evals factory execute \
  --agent-id agent_xxx \
  --manifest manifest.json
```

Or — one-shot end-to-end:

```sh
ELEVENLABS_API_KEY=... voice-evals factory run \
  --agent-id agent_xxx \
  --count 50 \
  --strategy pairwise
```

## Expansion strategies

`expand_with: [industries, demo_close_variants]` × strategy gates how the cross-product is realized:

| Strategy | Tests for 14 × 5 vars | When to use |
|---|---|---|
| `cartesian` | 70 (every combination) | Small spaces, comprehensive coverage |
| `pairwise` | ~20-25 | Most cases — every (k_i, k_j) pair covered once |
| `sample` | `--count` (default 100) | Smoke tests, nightly sweeps |

Pairwise uses a greedy IPO-style algorithm: every value of variable `A` appears with every value of variable `B` at least once. Catches most 2-way bugs at a fraction of the cartesian cost.

## Template structure

`templates/factory/industries.yaml`:

```yaml
industries:
  - id: hvac
    name: HVAC
    greeting: "Hi, my AC stopped working"
    pain_point: "no cooling in 95F heat"
```

`templates/factory/variants.yaml`:

```yaml
demo_close_variants:
  - id: yes_text
    name: "Yes, text me"
    response: "Yes please send the link via SMS"
    expected_behavior: "agent calls send_sms"
```

`templates/factory/base-scenarios.yaml`:

```yaml
templates:
  - id: industry_demo_{industry}_{demo_close_variant}
    name: "{industry_name} - {demo_close_variant_name}"
    type: llm
    expand_with: [industries, demo_close_variants]
    chat_history:
      - role: user
        message: "{industry_greeting}, {industry_pain_point}"
      - role: agent
        message: "Want me to text you a demo link?"
      - role: user
        message: "{demo_close_variant_response}"
    success_condition: "{demo_close_variant_expected_behavior}"
```

Placeholders: `{<bucket>}` (the `.id`), `{<bucket>_<field>}` (any field). `<bucket>` is the singular form of the array name in `variants.yaml` / `industries.yaml`.

## Programmatic API

```ts
import {
  expandAll, loadIndustries, loadTemplates, loadVariants,
  generatedToCreatePayload,
} from '@wranngle/voice-evals/factory';
import {createVoiceEvalsClient} from '@wranngle/voice-evals/wrapper';

const industries = loadIndustries('templates/factory/industries.yaml');
const variants = loadVariants('templates/factory/variants.yaml');
const templates = loadTemplates('templates/factory/base-scenarios.yaml');

const tests = expandAll(templates, {...variants, industries}, {
  strategy: 'pairwise',
  seed: 1,
});

const client = createVoiceEvalsClient({apiKey: process.env.ELEVENLABS_API_KEY!});
for (const test of tests) {
  await client.tests.create(generatedToCreatePayload(test));
}
```

## See also

- `docs/autorefinement.md` — what to do when factory tests reveal regressions
- `docs/methodology.md` — the broader testing model
