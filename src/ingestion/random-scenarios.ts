/**
 * @wranngle/voice-evals/ingestion/random-scenarios — random simulated-user
 * scenario generator.
 *
 * Ports the archive's `generateIndustryScenario` / `generateObjectionScenario`
 * functions from `supersystem/layer3-data-manager.js`. Produces N random
 * scenario specs by sampling from cross-products of:
 *   - 14 industries (loaded from templates/factory/industries.yaml)
 *   - 24 names (a deterministic pool baked into this module)
 *   - 5 call volumes, 4 interest levels
 *   - 70/30 split between SMS-accept and SMS-decline
 *
 * Each scenario is a `RandomScenario` ready to drive a single simulated
 * conversation. The randomization is seeded; same seed -> same scenarios.
 *
 * For voice-evals consumers: `generateRandomScenarios` complements the
 * combinatorial factory in `src/factory/` — use combinatorial when you
 * want exhaustive coverage, random when you want a representative
 * sample (e.g. for nightly regression sweeps).
 */

export type RandomScenario = {
  id: string;
  name: string;
  category: 'random_industry' | 'random_objection';
  /** System prompt for the simulated user LLM. */
  prompt: string;
  /** Tools the agent is expected to call in this scenario. */
  expectedTools: string[];
  /** Tools the agent is explicitly forbidden from calling. */
  forbiddenTools: string[];
  /** Variable assignment that produced this scenario (for reproducibility). */
  assignment: {
    industry?: string;
    name: string;
    callVolume?: string;
    interestLevel?: string;
    objection?: string;
    willAcceptSms?: boolean;
  };
};

export type GenerateRandomScenariosOptions = {
  /** RNG seed; same seed -> same output. Default 1. */
  seed?: number;
  /** Industries to sample from. Defaults to a built-in pool of 14. */
  industries?: ReadonlyArray<{id: string; name: string}>;
  /** Names to sample from. Defaults to a 24-name pool. */
  names?: readonly string[];
  /** Ratio of industry scenarios vs objection scenarios. Default 0.7 / 0.3. */
  industryRatio?: number;
};

const DEFAULT_INDUSTRIES = [
  {id: 'hvac', name: 'HVAC'},
  {id: 'plumbing', name: 'Plumbing'},
  {id: 'electrical', name: 'Electrical'},
  {id: 'property_management', name: 'Property Management'},
  {id: 'roofing', name: 'Roofing'},
  {id: 'pest_control', name: 'Pest Control'},
  {id: 'landscaping', name: 'Landscaping'},
  {id: 'garage_door', name: 'Garage Door'},
  {id: 'legal', name: 'Legal'},
  {id: 'veterinary', name: 'Veterinary'},
  {id: 'automotive', name: 'Automotive'},
  {id: 'retail', name: 'Retail'},
  {id: 'healthcare', name: 'Healthcare'},
  {id: 'other', name: 'Other'},
] as const;

const DEFAULT_NAMES = [
  'Sarah',
  'James',
  'Jessica',
  'Michael',
  'Linda',
  'David',
  'Karen',
  'Robert',
  'Patricia',
  'John',
  'Susan',
  'Thomas',
  'Mary',
  'Charles',
  'Lisa',
  'Daniel',
  'Nancy',
  'Steven',
  'Margaret',
  'Paul',
  'Sandra',
  'Mark',
  'Donna',
  'Kevin',
] as const;

const CALL_VOLUMES = ['low (1-3/day)', 'moderate (4-10/day)', 'busy (10-25/day)', 'very busy (25-50/day)', 'extreme (50+/day)'] as const;
const INTEREST_LEVELS = ['curious', 'interested', 'eager', 'cautiously interested'] as const;
const OBJECTIONS = ['too expensive', 'too small', 'AI skeptic', 'happy with current', 'looking at competitors', 'no budget'] as const;

export function generateRandomScenarios(
  count: number,
  options: GenerateRandomScenariosOptions = {},
): RandomScenario[] {
  if (count <= 0) {
    return [];
  }

  const industries = options.industries ?? DEFAULT_INDUSTRIES;
  const names = options.names ?? DEFAULT_NAMES;
  const ratio = options.industryRatio ?? 0.7;
  const rng = mulberry32(options.seed ?? 1);
  const out: RandomScenario[] = [];

  for (let i = 0; i < count; i++) {
    const useIndustry = rng() < ratio;
    out.push(useIndustry
      ? generateIndustryScenario(i, industries, names, rng)
      : generateObjectionScenario(i, names, rng));
  }

  return out;
}

function generateIndustryScenario(
  index: number,
  industries: ReadonlyArray<{id: string; name: string}>,
  names: readonly string[],
  rng: () => number,
): RandomScenario {
  const industry = industries[Math.floor(rng() * industries.length)];
  const name = names[Math.floor(rng() * names.length)];
  const callVolume = CALL_VOLUMES[Math.floor(rng() * CALL_VOLUMES.length)];
  const interestLevel = INTEREST_LEVELS[Math.floor(rng() * INTEREST_LEVELS.length)];
  const willAcceptSms = rng() < 0.7;
  const smsInstruction = willAcceptSms
    ? 'When the agent asks if you want a demo link by text, AGREE and provide a phone number.'
    : 'When the agent asks if you want a demo link by text, DECLINE — say you do not want SMS.';

  const prompt = [
    `You are ${name}, a ${interestLevel} prospect from a ${industry.name} business.`,
    `Your call volume is ${callVolume}.`,
    'You\'re calling about AI voice agents to handle after-hours calls.',
    smsInstruction,
  ].join(' ');

  return {
    id: `random_industry_${index}`,
    name: `Random: ${name} from ${industry.name}`,
    category: 'random_industry',
    prompt,
    expectedTools: willAcceptSms ? ['send_sms'] : [],
    forbiddenTools: willAcceptSms ? [] : ['send_sms'],
    assignment: {
      industry: industry.id,
      name,
      callVolume,
      interestLevel,
      willAcceptSms,
    },
  };
}

function generateObjectionScenario(
  index: number,
  names: readonly string[],
  rng: () => number,
): RandomScenario {
  const objection = OBJECTIONS[Math.floor(rng() * OBJECTIONS.length)];
  const name = names[Math.floor(rng() * names.length)];

  const prompt = `You are ${name}. You're skeptical about AI voice agents — your objection is "${objection}". Push back on the agent's pitch with this objection. Do not accept an SMS demo link.`;

  return {
    id: `random_objection_${index}`,
    name: `Random objection: ${name} (${objection})`,
    category: 'random_objection',
    prompt,
    expectedTools: [],
    forbiddenTools: ['send_sms'],
    assignment: {name, objection, willAcceptSms: false},
  };
}

/* eslint-disable no-bitwise -- mulberry32 is a hash function; bitwise is canonical */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D_2B_79_F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
/* eslint-enable no-bitwise */
