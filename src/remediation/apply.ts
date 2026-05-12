/**
 * @wranngle/voice-evals/remediation/apply — governance-gated fix apply.
 *
 * `applyFix` translates a FixProposal into the appropriate PATCH on
 * `conversation_config`, enforces the [DEV]-only governance gate via
 * the wrapper, then delegates to the SDK's `agents.update`.
 *
 * Dry-run mode (`dryRun: true`) computes the patch but does not send
 * it — useful for showing the operator what would change before
 * committing to a remediation cycle.
 */

import {enforceMutation} from '../wrapper/governance';
import type {ApplyFixOptions, ApplyFixResult, FixProposal} from './types';

export async function applyFix(options: ApplyFixOptions): Promise<ApplyFixResult> {
  const {client, agentId, fix, governance, dryRun} = options;

  const agent = await client.agents.get(agentId);
  enforceMutation(agent.name, governance ?? {reason: 'closed-loop remediation'});

  const before = (agent.config ?? {}) as Record<string, unknown>;
  const patch = buildPatch(before, fix);

  if (dryRun) {
    return {
      applied: false, dryRun: true, patch, before,
    };
  }

  // SDK uses camelCase `conversationConfig`; the wire format is snake_case but
  // Fern's TypeScript bindings normalize. Don't switch to raw fetch here — the
  // SDK error surface is fine for vanilla PATCHes (the tool-schema cleaning
  // PATCH is a separate raw-fetch path).
  await client.raw.conversationalAi.agents.update(agentId, {
    conversationConfig: patch,
  });

  return {
    applied: true, dryRun: false, patch, before,
  };
}

/**
 * Translate a FixProposal into a `conversation_config` patch. We construct
 * the full `agent.prompt` / `agent.first_message` / `tts.*` shape the API
 * expects, with the proposal's target field swapped in.
 */
function buildPatch(
  currentConfig: Record<string, unknown>,
  fix: FixProposal,
): Record<string, unknown> {
  const config = deepClone(currentConfig);
  const agent = ensureObject(config, 'agent');
  const prompt = ensureObject(agent, 'prompt');
  const tts = ensureObject(config, 'tts');
  const turn = ensureObject(config, 'turn');
  const llm = ensureObject(prompt, 'llm');

  switch (fix.target) {
    case 'system_prompt': {
      prompt.prompt = fix.proposed_value;
      break;
    }

    case 'first_message': {
      agent.first_message = fix.proposed_value;
      break;
    }

    case 'tool_description': {
      const toolsRaw = prompt.tools;
      if (!Array.isArray(toolsRaw)) {
        break;
      }

      for (const t of toolsRaw) {
        if (t && typeof t === 'object') {
          const tool = t as Record<string, unknown>;
          if (tool.name === fix.locator) {
            tool.description = fix.proposed_value;
          }
        }
      }

      break;
    }

    case 'voice_stability': {
      tts.stability = Number.parseFloat(fix.proposed_value);
      break;
    }

    case 'voice_similarity_boost': {
      tts.similarity_boost = Number.parseFloat(fix.proposed_value);
      break;
    }

    case 'voice_speed': {
      tts.speed = Number.parseFloat(fix.proposed_value);
      break;
    }

    case 'temperature': {
      // 'llm' is an object on agent.prompt — temperature lives there per
      // the ElevenLabs best-agent-config-2026.yaml convention.
      Object.assign(llm, {temperature: Number.parseFloat(fix.proposed_value)});
      break;
    }

    case 'turn_eagerness': {
      turn.turn_eagerness = fix.proposed_value;
      break;
    }

    case 'unknown': {
      // Leave config untouched.
      break;
    }
  }

  return config;
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function ensureObject(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) {
    parent[key] = {};
  }

  return parent[key] as Record<string, unknown>;
}
