/**
 * @wranngle/voice-evals/wrapper/agents — agent CRUD with governance gating.
 *
 * Phase 1 ships read-only operations (list, get) plus the rename helper
 * needed to bring naming-standard violations into compliance. Write
 * operations (create, update, archive) land in subsequent phases.
 */

import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import type {
  AgentSummary, AgentWithConfig, AgentsApi,
} from './types';
import {parseAgentName} from './governance';

type AgentsApiDeps = {
  raw: ElevenLabsClient;
};

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
