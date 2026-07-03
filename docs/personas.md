# Personas + random scenarios

The ingestion namespace exposes two complementary mechanisms for driving simulated-user conversations:

1. **Canonical personas** — 5 hand-tuned archetypes with audio-relevant traits.
2. **Random scenarios** — N machine-generated industry / objection profiles.

Both can feed the same eval suite or factory pipeline.

## Canonical personas

```ts
import {CANONICAL_PERSONAS, getPersona, buildPersonaSystemPrompt} from '@wranngle/voice-evals/ingestion';

const persona = getPersona('frustrated-rusher');
const prompt = buildPersonaSystemPrompt(persona, 'You need an HVAC quote, fast.');
// Feeds the simulated-user LLM
```

| id | accent | pace_wpm | interruption_tendency | frustration_slope |
|---|---|---|---|---|
| polite-elderly | american-midwest | 110 | 0.05 | 0.10 |
| frustrated-rusher | american-east-coast | 180 | 0.60 | 0.80 |
| esl-non-native | esl-generic | 90 | 0.10 | 0.30 |
| confused-meanderer | — | 130 | 0.20 | 0.40 |
| hostile-skeptic | — | 150 | 0.50 | 0.90 |

These are deliberately small in number. They exist to surface different acoustic / dialogue regimes (pace, interruption, accent) without bulk dilution.

## Random scenarios

```ts
import {generateRandomScenarios} from '@wranngle/voice-evals/ingestion';

const scenarios = generateRandomScenarios(50, {seed: 1});
// 50 RandomScenario objects, ~35 industry + ~15 objection (70/30 default)
```

Each scenario:

```ts
{
  id: 'random_industry_0',
  name: 'Random: Sarah from HVAC',
  category: 'random_industry',
  prompt: 'You are Sarah, an interested prospect from a HVAC business…',
  expectedTools: ['send_sms'],
  forbiddenTools: [],
  assignment: {industry: 'hvac', name: 'Sarah', callVolume: '…', willAcceptSms: true},
}
```

Deterministic: same `seed` → same scenarios. Use it to generate a 50-scenario nightly suite that doesn't drift run-to-run, OR pick a fresh seed daily for a soak test.

## Tuning the pool

```ts
generateRandomScenarios(100, {
  seed: 42,
  industries: [{id: 'legal', name: 'Legal'}, {id: 'vet', name: 'Veterinary'}],
  names: ['Casey', 'Pat', 'Alex'],
  industryRatio: 0.5, // 50/50 industry vs objection
});
```

Industries default to the 12 in the factory's `industries.yaml` (hvac, plumbing, electrical, property_management, roofing, pest_control, landscaping, garage_door, locksmith, pool_service, appliance_repair, general_contractor). Names default to a 24-name pool with mixed genders.

## When to use which

| Goal | Choose |
|---|---|
| Audio-native regression — accent / pace / interruption coverage | Canonical personas |
| Bulk industry coverage — does the agent handle non-HVAC verticals? | Random scenarios |
| Combinatorial 2-way gap finder (industry × variant × demo-close) | Factory (`docs/factory.md`) |

The three layers compose — a single test run can mix all three.
