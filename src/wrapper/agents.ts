/**
 * @wranngle/voice-evals/wrapper/agents — agent CRUD with governance gating.
 *
 * Phase 1 shipped read-only `list` + `get`. Phase G (v1.1) adds `create`,
 * `update`, `clone`, `archive`, `promote` with `[PHASE]` enforcement per
 * AGENTS.md:
 *
 *   - `create` forces a `[DEV]` prefix on the agent name. Pre-prefixed
 *     non-DEV names (`[PROD] …`, `[BETA] …`) are rejected — promotion is
 *     the only path out of DEV, by design. The requested `llm` (if set)
 *     is validated against the project's banned-model list.
 *   - `update` runs `enforceMutation` against the current agent's name;
 *     by default only `[DEV]` agents are mutable. Phase-changing renames
 *     are rejected — use `promote()` instead.
 *   - `clone` duplicates the source agent via the SDK's `.duplicate()`
 *     then renames the new agent with the caller's namePrefix; the
 *     resulting agent is `[DEV]`-tagged regardless of source phase, and
 *     `overrides.name` cannot override that.
 *   - `archive` renames the agent with `[ARCHIVED]` prefix. Default
 *     policy: only `[DEV]` agents archive without ceremony; archiving a
 *     non-DEV agent requires explicit `allowedPhases` (typically with
 *     `approvedBy` + `reason` for audit), same shape as `update`.
 *   - `promote` swaps the `[PHASE]` prefix to a new phase; requires the
 *     caller to include the target phase in `allowedPhases` explicitly
 *     (typically combined with `{approvedBy, reason}` for audit).
 */

import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import type {
  AgentCloneOptions,
  AgentCreateInput,
  AgentCreateOptions,
  AgentPromoteOptions,
  AgentSummary,
  AgentUpdateInput,
  AgentWithConfig,
  AgentsApi,
  GovernanceOptions,
  ModelRankings,
  Phase,
} from './types';
import {GovernanceError, assertModelAllowed, enforceMutation, parseAgentName} from './governance';

type AgentsApiDeps = {
  raw: ElevenLabsClient;
  modelRankings: ModelRankings;
};

const PHASE_PATTERN = /^\[(DEV|ALPHA|BETA|PROD|ARCHIVED)]\s+/;

export function createAgentsApi({raw, modelRankings}: AgentsApiDeps): AgentsApi {
  return {
    async list() {
      const response = await raw.conversationalAi.agents.list();
      const items = extractListItems(response);
      return items.map(item => toAgentSummary(item));
    },

    async get(agentId) {
      const response = await raw.conversationalAi.agents.get(agentId);
      return toAgentWithConfig(response);
    },

    async create(spec: AgentCreateInput, options: AgentCreateOptions = {}) {
      const autoPrefix = options.autoPrefixDev ?? true;
      const existingPrefix = PHASE_PATTERN.exec(spec.name);
      // Reject pre-prefixed non-DEV names: promotion is the only path out
      // of [DEV]. AGENTS.md: "New agents you create are auto-assigned
      // [DEV]; promotions to any other phase need the user to explicitly
      // say 'yes, promote to BETA'."
      if (autoPrefix && existingPrefix && existingPrefix[1] !== 'DEV') {
        throw new GovernanceError(
          'phase_not_allowed',
          `agents.create: name "${spec.name}" is pre-prefixed with [${existingPrefix[1]}]. `
          + 'New agents must start in [DEV]; use agents.promote() to move phases. '
          + 'Pass { autoPrefixDev: false } if you intentionally want to bypass (caller-owned audit).',
        );
      }

      const name = autoPrefix && !existingPrefix
        ? `[DEV] ${spec.name}`
        : spec.name;

      const requestedModel = extractLlm(spec.conversationConfig);
      if (requestedModel) {
        assertModelAllowed(requestedModel, modelRankings);
      }

      const response = await raw.conversationalAi.agents.create({
        ...(spec as Record<string, unknown>),
        name,
        conversationConfig: spec.conversationConfig ?? {},
      });

      const id = pickString((response as unknown as Record<string, unknown>)?.agent_id)
        ?? pickString((response as unknown as Record<string, unknown>)?.id)
        ?? '';
      return {
        id,
        name,
        parsedName: parseAgentName(name),
        raw: response,
      };
    },

    async update(agentId, patch: AgentUpdateInput, options: GovernanceOptions = {}) {
      const current = await raw.conversationalAi.agents.get(agentId);
      const currentName = pickString((current as unknown as Record<string, unknown>)?.name) ?? '';
      enforceMutation(currentName, {reason: 'agents.update', ...options});

      // Reject phase-changing renames: AGENTS.md encodes phase ONLY in the
      // name prefix, so a name-only patch from [DEV] → [PROD] would be a
      // silent promotion. Force callers through agents.promote() so the
      // approval metadata + allowedPhases gate apply.
      if (typeof patch.name === 'string') {
        const currentPhase = parseAgentName(currentName).phase;
        const patchPhase = parseAgentName(patch.name).phase;
        if (patchPhase && patchPhase !== currentPhase) {
          throw new GovernanceError(
            'phase_not_allowed',
            `agents.update: patch.name changes phase [${currentPhase ?? 'untagged'}] → [${patchPhase}]. `
            + 'Use agents.promote(agentId, toPhase, { allowedPhases, approvedBy, reason }) instead.',
          );
        }
      }

      const requestedModel = extractLlm(patch.conversationConfig);
      if (requestedModel) {
        assertModelAllowed(requestedModel, modelRankings);
      }

      await raw.conversationalAi.agents.update(
        agentId,
        patch as unknown as Parameters<typeof raw.conversationalAi.agents.update>[1],
      );

      const updated = await raw.conversationalAi.agents.get(agentId);
      return toAgentWithConfig(updated);
    },

    async clone(sourceAgentId, options: AgentCloneOptions = {}) {
      const source = await raw.conversationalAi.agents.get(sourceAgentId);
      const sourceName = pickString((source as unknown as Record<string, unknown>)?.name) ?? sourceAgentId;
      const baseName = sourceName.replace(PHASE_PATTERN, '');
      const prefix = options.namePrefix ?? 'Clone of';
      const newName = `[DEV] ${prefix} ${baseName}`.trim();

      const dup = await raw.conversationalAi.agents.duplicate(sourceAgentId);
      const newId = pickString((dup as unknown as Record<string, unknown>)?.agent_id)
        ?? pickString((dup as unknown as Record<string, unknown>)?.id)
        ?? '';

      // Spread overrides FIRST then pin name=newName — clones are [DEV]
      // by contract; overrides.name (eg "[PROD] X") must not slip past.
      const renamePatch: AgentUpdateInput = {
        ...options.overrides,
        name: newName,
      };

      const requestedModel = extractLlm(renamePatch.conversationConfig);
      if (requestedModel) {
        assertModelAllowed(requestedModel, modelRankings);
      }

      await raw.conversationalAi.agents.update(
        newId,
        renamePatch as unknown as Parameters<typeof raw.conversationalAi.agents.update>[1],
      );

      return {
        id: newId,
        name: newName,
        parsedName: parseAgentName(newName),
        raw: dup,
      };
    },

    async archive(agentId, options: GovernanceOptions = {}) {
      const current = await raw.conversationalAi.agents.get(agentId);
      const currentName = pickString((current as unknown as Record<string, unknown>)?.name) ?? '';
      // Archive is a mutation against the source phase. The default gate
      // is [DEV]-only, same as update; archiving a non-DEV agent requires
      // explicit allowedPhases (typically `{ allowedPhases: ['PROD'],
      // approvedBy, reason }`). AGENTS.md: only [DEV] may be modified
      // autonomously; everything else requires explicit user approval.
      enforceMutation(currentName, {reason: 'agents.archive', ...options});

      const baseName = currentName.replace(PHASE_PATTERN, '');
      const newName = `[ARCHIVED] ${baseName}`.trim();
      await raw.conversationalAi.agents.update(
        agentId,
        {name: newName},
      );

      return {
        id: agentId,
        name: newName,
        parsedName: parseAgentName(newName),
        raw: current,
      };
    },

    async promote(agentId, toPhase: Phase, options: AgentPromoteOptions) {
      if (!options.allowedPhases?.includes(toPhase)) {
        throw new Error(`agents.promote: allowedPhases must include the target phase [${toPhase}]. `
          + 'Pass { allowedPhases: [\'' + toPhase + '\'], approvedBy, reason } explicitly.');
      }

      const current = await raw.conversationalAi.agents.get(agentId);
      const currentName = pickString((current as unknown as Record<string, unknown>)?.name) ?? '';
      // Promotion can move between phases — require source phase be in
      // allowedPhases too (since promote is itself a mutation against the
      // source phase). For ergonomics, expand allowedPhases to include the
      // current phase plus the target.
      const parsed = parseAgentName(currentName);
      const sourcePhases: Phase[] = parsed.phase ? [parsed.phase] : [];
      enforceMutation(currentName, {
        ...options,
        allowedPhases: [...new Set([...(options.allowedPhases ?? []), ...sourcePhases])],
        allowUntagged: options.allowUntagged,
        reason: options.reason ?? `agents.promote -> [${toPhase}]${options.approvedBy ? ` by ${options.approvedBy}` : ''}`,
      });

      const baseName = currentName.replace(PHASE_PATTERN, '');
      const newName = `[${toPhase}] ${baseName}`.trim();
      await raw.conversationalAi.agents.update(
        agentId,
        {name: newName},
      );

      return {
        id: agentId,
        name: newName,
        parsedName: parseAgentName(newName),
        raw: current,
      };
    },
  };
}

/**
 * The ElevenLabs SDK can return agents either as an array directly or as
 * `{ agents: [...] }` depending on the endpoint version. Handle both
 * defensively so we don't break when Fern regenerates the SDK with a
 * different envelope shape.
 */
function extractListItems(response: unknown): unknown[] {
  if (Array.isArray(response)) {
    return response;
  }

  if (response && typeof response === 'object') {
    const envelope = response as Record<string, unknown>;
    if (Array.isArray(envelope.agents)) {
      return envelope.agents;
    }

    if (Array.isArray(envelope.items)) {
      return envelope.items;
    }

    if (Array.isArray(envelope.data)) {
      return envelope.data;
    }
  }

  return [];
}

function toAgentSummary(raw: unknown): AgentSummary {
  const item = (raw ?? {}) as Record<string, unknown>;
  const id = pickString(item.agent_id) ?? pickString(item.id) ?? '';
  const name = pickString(item.name) ?? '';
  return {
    id,
    name,
    parsedName: parseAgentName(name),
    raw,
  };
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Walk `conversationConfig.agent.prompt.llm` defensively. The SDK accepts
 * both `agent.prompt.llm` and a top-level `prompt.llm` shape on some
 * endpoints; the wrapper checks both so the banned-model gate fires
 * regardless of which envelope the caller used.
 */
function extractLlm(config: unknown): string | undefined {
  if (!config || typeof config !== 'object') {
    return undefined;
  }

  const top = config as Record<string, unknown>;
  const agent = top.agent as Record<string, unknown> | undefined;
  const agentPrompt = agent?.prompt as Record<string, unknown> | undefined;
  const direct = top.prompt as Record<string, unknown> | undefined;
  return pickString(agentPrompt?.llm) ?? pickString(direct?.llm);
}

function toAgentWithConfig(raw: unknown): AgentWithConfig {
  const summary = toAgentSummary(raw);
  const item = (raw ?? {}) as Record<string, unknown>;
  return {
    ...summary,
    config: item.conversation_config ?? null,
  };
}
