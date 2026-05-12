/**
 * @wranngle/voice-evals/wrapper/governance
 *
 * Pure functions for ElevenLabs agent governance per AGENTS.md:
 *   - Parse `[PHASE] Name - Role` display names.
 *   - Enforce `[DEV]`-only mutation by default; any other phase requires
 *     an explicit `allowedPhases` opt-in.
 *   - Reject banned / deprecated LLM model IDs at mutation time.
 *
 * No I/O. No SDK calls. No filesystem. All side effects live in
 * client.ts / agents.ts so this module is unit-testable in isolation.
 */

import {
  type GovernanceOptions, type ModelRankings, type ParsedAgentName, type Phase, PHASES,
} from './types';

const PHASE_PATTERN = /^\[(DEV|ALPHA|BETA|PROD|ARCHIVED)]\s+(.+)$/;

export class GovernanceError extends Error {
  readonly code: 'phase_not_allowed' | 'untagged' | 'banned_model';
  constructor(code: GovernanceError['code'], message: string) {
    super(message);
    this.name = 'GovernanceError';
    this.code = code;
  }
}

/**
 * Parse an agent display name against the `[PHASE] Name` convention.
 *
 * `[DEV] Sarah - Wranngle Lead Specialist` → { phase: 'DEV', baseName: 'Sarah - Wranngle Lead Specialist', isTagged: true }.
 * `Sarah v2`                                → { phase: undefined, baseName: 'Sarah v2',                    isTagged: false }.
 */
export function parseAgentName(raw: string): ParsedAgentName {
  const match = PHASE_PATTERN.exec(raw);
  if (!match) {
    return {
      phase: undefined, baseName: raw, raw, isTagged: false,
    };
  }

  return {
    phase: match[1] as Phase,
    baseName: match[2],
    raw,
    isTagged: true,
  };
}

/**
 * Throw if the agent's phase doesn't permit the requested mutation.
 *
 * Default policy: only `[DEV]`-tagged agents are mutable; untagged names
 * are rejected as naming-standard violations. Override with
 * `{ allowedPhases: ['BETA'], reason: 'promoting to BETA via approved flow' }`
 * when the user explicitly authorized a non-DEV mutation.
 */
export function enforceMutation(
  agentName: string,
  options: GovernanceOptions = {},
): ParsedAgentName {
  const parsed = parseAgentName(agentName);
  const allowed = options.allowedPhases ?? ['DEV'];
  const allowUntagged = options.allowUntagged ?? false;

  if (!parsed.isTagged) {
    if (allowUntagged) {
      return parsed;
    }

    throw new GovernanceError(
      'untagged',
      `Agent "${agentName}" has no [PHASE] prefix. Rename to "[DEV] ${agentName}" `
      + 'before mutating, or pass { allowUntagged: true }. See AGENTS.md.',
    );
  }

  if (parsed.phase && !allowed.includes(parsed.phase)) {
    const allowList = allowed.map(p => `[${p}]`).join(', ');
    const reasonClause = options.reason ? ` Reason: ${options.reason}.` : '';
    throw new GovernanceError(
      'phase_not_allowed',
      `Agent "${agentName}" is in phase [${parsed.phase}]; mutation requires one of ${allowList}.${reasonClause}`,
    );
  }

  return parsed;
}

/**
 * Throw if the requested LLM model is on the banned list.
 *
 * Banned IDs typically represent deprecated or known-bad-for-voice models
 * (e.g. `gpt-4o-mini`, `gemini-2.0-flash-001`). The project default
 * (`gemini-3-flash-preview` as of 2026-05) is preferred for low-latency
 * voice — see config/model-rankings.json.
 */
export function assertModelAllowed(model: string, rankings: ModelRankings): void {
  if (rankings.banned.includes(model)) {
    throw new GovernanceError(
      'banned_model',
      `Model "${model}" is on the banned list in config/model-rankings.json. `
      + `Default for new ElevenLabs agents is "${rankings.default}"; recommended set: `
      + `${rankings.recommended.join(', ')}.`,
    );
  }
}

export function isPhase(value: string): value is Phase {
  return (PHASES as readonly string[]).includes(value);
}
