/**
 * @wranngle/voice-evals/remediation/proposal — LLM-driven fix proposer.
 *
 * Given an agent config + failing dimensions, ask the LLM to propose
 * targeted edits. The proposer is intentionally single-shot here (cheap,
 * deterministic enough at temperature=0). For sample-efficient iterative
 * optimization, the polish loop can route through GEPA (gepa-bridge.ts)
 * when Python is available; otherwise it falls back to this single-shot
 * proposer.
 */

import type {FixProposal, ProposeFixOptions} from './types';

const SYSTEM_PROMPT = `You are a voice AI agent debugging expert. Given an agent's current configuration and a list of failing eval dimensions, propose targeted edits that would address the failures without regressing what already passes.

Output a JSON array of fix objects. Each object MUST have:
  target: one of "system_prompt" | "tool_description" | "first_message" | "voice_stability" | "voice_similarity_boost" | "voice_speed" | "temperature" | "turn_eagerness"
  locator: for "tool_description", the tool's name; for everything else, "" (empty string)
  proposed_value: the new value as a string (numeric values still encoded as strings, e.g. "0.71")
  rationale: one to two sentences on why this should help
  addresses: array of dimension name strings (one or more entries from the failures input)
  confidence: optional 0-1 self-reported confidence

Output ONLY the JSON array. No prose. No code fences. No commentary.

Constraints:
  - Edit at most 3 fields per proposal pass; multiple proposals are fine.
  - Do not propose model swaps — that is operator-only, never agent-autonomous.
  - Do not propose tool removal — only description tightening.
  - Voice numeric ranges: stability [0-1], similarity_boost [0-1], speed [0.5-2.0], temperature [0-2].
  - turn_eagerness must be one of "relaxed" | "normal" | "eager".`;

export async function proposeFix(options: ProposeFixOptions): Promise<FixProposal[]> {
  if (options.failures.length === 0) {
    return [];
  }

  const user = buildUserPrompt(options);
  const raw = await options.llm({system: SYSTEM_PROMPT, user, responseFormat: 'json'});
  const parsed = parseProposerResponse(raw);
  return parsed
    .filter(item => isValidFixProposal(item))
    .map(item => sanitizeFixProposal(item));
}

function buildUserPrompt(options: ProposeFixOptions): string {
  const failuresBlock = options.failures
    .map(f => `  - ${f.name}: ${f.detail ?? '(no detail)'}`)
    .join('\n');

  const configBlock = JSON.stringify(options.agentConfig, null, 2).slice(0, 4000);
  const contextBlock = options.context ? `\n\nAdditional context:\n${options.context.slice(0, 2000)}` : '';
  return `Current agent configuration (truncated to 4000 chars if large):\n${configBlock}\n\nFailing dimensions:\n${failuresBlock}${contextBlock}\n\nPropose 1-5 targeted fixes.`;
}

function parseProposerResponse(raw: string): unknown[] {
  const cleaned = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const value = JSON.parse(cleaned) as unknown;
    if (Array.isArray(value)) {
      return value;
    }

    if (value && typeof value === 'object') {
      const envelope = value as Record<string, unknown>;
      for (const key of ['fixes', 'proposals', 'edits', 'results']) {
        if (Array.isArray(envelope[key])) {
          return envelope[key] as unknown[];
        }
      }
    }

    return [];
  } catch {
    return [];
  }
}

const ALLOWED_TARGETS = new Set<string>([
  'system_prompt',
  'tool_description',
  'first_message',
  'voice_stability',
  'voice_similarity_boost',
  'voice_speed',
  'temperature',
  'turn_eagerness',
]);

function isValidFixProposal(item: unknown): item is FixProposal {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const obj = item as Record<string, unknown>;
  return (
    typeof obj.target === 'string'
    && ALLOWED_TARGETS.has(obj.target)
    && typeof obj.locator === 'string'
    && typeof obj.proposed_value === 'string'
    && typeof obj.rationale === 'string'
    && Array.isArray(obj.addresses)
    && obj.addresses.every(a => typeof a === 'string')
  );
}

/**
 * Clip numeric values to allowed ranges; truncate over-long prompts.
 * Defensive layer — the LLM occasionally violates the constraints we
 * ask for, and a bad PATCH burns operator goodwill faster than a bad
 * fixture.
 */
function sanitizeFixProposal(proposal: FixProposal): FixProposal {
  switch (proposal.target) {
    case 'voice_stability':
    case 'voice_similarity_boost': {
      return clipNumeric(proposal, 0, 1);
    }

    case 'voice_speed': {
      return clipNumeric(proposal, 0.5, 2);
    }

    case 'temperature': {
      return clipNumeric(proposal, 0, 2);
    }

    case 'turn_eagerness': {
      const allowed = new Set(['relaxed', 'normal', 'eager']);
      if (!allowed.has(proposal.proposed_value)) {
        return {...proposal, proposed_value: 'normal'};
      }

      return proposal;
    }

    case 'system_prompt':
    case 'tool_description':
    case 'first_message':
    case 'unknown': {
      return proposal;
    }
  }
}

function clipNumeric(proposal: FixProposal, min: number, max: number): FixProposal {
  const value = Number.parseFloat(proposal.proposed_value);
  if (!Number.isFinite(value)) {
    return proposal;
  }

  const clipped = Math.min(max, Math.max(min, value));
  return {...proposal, proposed_value: String(clipped)};
}
