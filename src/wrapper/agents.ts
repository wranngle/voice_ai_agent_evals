/**
 * @wranngle/voice-evals/wrapper/agents — agent CRUD with governance gating.
 *
 * Phase 1 shipped read-only `list` + `get`. Phase G (v1.1) adds `create`,
 * `update`, `clone`, `archive`, `promote` with `[PHASE]` enforcement per
 * AGENTS.md:
 *
 *   - `create` auto-prefixes `[DEV]` on the agent name when the caller's
 *     name doesn't already start with a `[PHASE]` prefix. Mirrors the
 *     archive's policy that all new agents start in `[DEV]`.
 *   - `update` runs `enforceMutation` against the current agent's name;
 *     by default only `[DEV]` agents are mutable.
 *   - `clone` duplicates the source agent via the SDK's `.duplicate()`
 *     then renames the new agent with the caller's namePrefix; the
 *     resulting agent is `[DEV]`-tagged regardless of source phase.
 *   - `archive` renames the agent with `[ARCHIVED]` prefix (the SDK
 *     does have a `delete` method but per AGENTS.md policy we never call
 *     it — archival is the official retirement path).
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
  Phase,
} from './types';
import {enforceMutation, parseAgentName} from './governance';

type AgentsApiDeps = {
  raw: ElevenLabsClient;
};

const PHASE_PATTERN = /^\[(DEV|ALPHA|BETA|PROD|ARCHIVED)]\s+/;

export function createAgentsApi({raw}: AgentsApiDeps): AgentsApi {
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
      const name = autoPrefix && !PHASE_PATTERN.test(spec.name)
        ? `[DEV] ${spec.name}`
        : spec.name;

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

      const renamePatch: AgentUpdateInput = {
        name: newName,
        ...options.overrides,
      };
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
      // Archive can be invoked on ANY phase (including [PROD]) — that IS
      // its purpose. We just require some prefix awareness, so we pass
      // allowUntagged + allowedPhases = all phases.
      enforceMutation(currentName, {
        allowedPhases: ['DEV', 'ALPHA', 'BETA', 'PROD', 'ARCHIVED'],
        allowUntagged: true,
        reason: 'agents.archive',
        ...options,
      });

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

function toAgentWithConfig(raw: unknown): AgentWithConfig {
  const summary = toAgentSummary(raw);
  const item = (raw ?? {}) as Record<string, unknown>;
  return {
    ...summary,
    config: item.conversation_config ?? null,
  };
}
