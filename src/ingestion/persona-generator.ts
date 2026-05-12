/**
 * @wranngle/voice-evals/ingestion/persona-generator — synthetic user personas.
 *
 * A persona is a behavioural profile applied to a simulated user. The
 * combinatorial cross of personas × scenarios catches failure modes that
 * a single persona ("the default polite caller") would miss.
 *
 * Phase 3 MVP ships canonical personas inspired by PolyPersona (arXiv
 * 2512.14562) and the Hamming AI accent / pace matrix. Phase 3.x adds
 * LLM-generated persona derivation from production call samples.
 */

export type PersonaTraits = {
  /** Demographic / role descriptor — what the LLM uses to "be" the user. */
  description: string;
  /** Speaking pace — words per minute approximation. */
  pace_wpm: number;
  /** Tendency to interrupt the agent mid-utterance, 0-1. */
  interruption_tendency: number;
  /** Tendency to fillers ("um", "uh", "like"), 0-1. */
  disfluency_rate: number;
  /** Frustration ramp-up rate when things go wrong, 0-1. */
  frustration_slope: number;
  /** Accent / region hint (informational; voice synthesis uses separately). */
  accent?: string;
};

export type Persona = {
  /** Stable slug. Use this in scenario YAMLs. */
  id: string;
  /** Human-readable name. */
  name: string;
  traits: PersonaTraits;
};

export const CANONICAL_PERSONAS: readonly Persona[] = Object.freeze([
  {
    id: 'polite-elderly',
    name: 'Polite elderly caller',
    traits: {
      description: 'A friendly elderly caller, slow pace, asks for clarification, never interrupts.',
      pace_wpm: 110,
      interruption_tendency: 0.05,
      disfluency_rate: 0.15,
      frustration_slope: 0.1,
      accent: 'american-midwest',
    },
  },
  {
    id: 'frustrated-rusher',
    name: 'Frustrated rusher',
    traits: {
      description: 'Time-pressured caller, talks fast, interrupts often, escalates if not served quickly.',
      pace_wpm: 180,
      interruption_tendency: 0.6,
      disfluency_rate: 0.05,
      frustration_slope: 0.8,
      accent: 'american-east-coast',
    },
  },
  {
    id: 'esl-non-native',
    name: 'Non-native English speaker',
    traits: {
      description: 'Caller with limited English, may need repetitions, uses simple sentences.',
      pace_wpm: 90,
      interruption_tendency: 0.1,
      disfluency_rate: 0.4,
      frustration_slope: 0.3,
      accent: 'esl-generic',
    },
  },
  {
    id: 'confused-meanderer',
    name: 'Confused meanderer',
    traits: {
      description: 'Caller goes off-topic, brings up multiple issues, expects the agent to track context.',
      pace_wpm: 130,
      interruption_tendency: 0.2,
      disfluency_rate: 0.3,
      frustration_slope: 0.4,
    },
  },
  {
    id: 'hostile-skeptic',
    name: 'Hostile skeptic',
    traits: {
      description: 'Caller is openly hostile or skeptical; probes for "are you a real person", tests the agent.',
      pace_wpm: 150,
      interruption_tendency: 0.5,
      disfluency_rate: 0.05,
      frustration_slope: 0.9,
    },
  },
] as const);

export function getPersona(id: string): Persona | undefined {
  return CANONICAL_PERSONAS.find(p => p.id === id);
}

export function listPersonas(): readonly Persona[] {
  return CANONICAL_PERSONAS;
}

/**
 * Inject persona traits into a system prompt for a simulated-user LLM.
 * Pair with src/wrapper/simulate.ts (Phase 1.x) or your own simulator.
 */
export function buildPersonaSystemPrompt(persona: Persona, scenarioIntent: string): string {
  const t = persona.traits;
  return `You are roleplaying as ${persona.name}. ${t.description}

Speaking style: pace ~${t.pace_wpm} wpm; disfluency rate ${t.disfluency_rate.toFixed(2)} (insert "um"/"uh"/false starts at that rate); interruption tendency ${t.interruption_tendency.toFixed(2)} (probability of cutting the agent off mid-utterance); frustration ramps at slope ${t.frustration_slope.toFixed(2)} (0 = unflappable, 1 = explodes quickly).

Scenario intent: ${scenarioIntent}

Stay in character. Do not break the fourth wall. Do not narrate your traits — embody them.`;
}
