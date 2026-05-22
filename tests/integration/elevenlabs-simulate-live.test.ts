/**
 * Live end-to-end exercise of an ElevenLabs agent via the simulate-conversation
 * API. Closes spiritual E1 (e2e through the agent's text+LLM pipeline).
 * The first-message override check is opt-in because the current
 * simulate-conversation API reference does not list conversation_config_override
 * as a supported request field.
 *
 * What this proves:
 *   - The agent is reachable and the API host accepts conversations.
 *   - The simulated_conversation returned by ElevenLabs is non-empty and structured.
 *   - When explicitly enabled by env, whether a `conversation_config_override`
 *     appears in the rendered first agent turn for the configured agent/API
 *     version.
 *
 * What this DOES NOT prove (honest about the audio gap):
 *   - Audio is synthesized correctly via TTS.
 *   - The audible utterance matches what was transcribed.
 *   - WebRTC handshake / Twilio integration succeeds on a real call.
 *
 * To truly close the audio gap would require a WebRTC test client or a Twilio
 * phone-number harness. Out of scope for this suite — that work is tracked
 * as a separate forcing function once we have a test phone number budget.
 *
 * Skipped in CI / without ELEVENLABS_API_KEY.
 */

import {describe, expect, it} from 'vitest';

const SKIP = process.env.CI === 'true' || !process.env.ELEVENLABS_API_KEY;
const RUN_OVERRIDE_CHECK = process.env.VOICE_EVALS_SIMULATE_OVERRIDE_CHECK === '1';
const AGENT_ID = process.env.VOICE_EVALS_TEST_INBOUND_AGENT_ID
  ?? 'agent_7601krfykfpwfjxrjqcshg64pcby'; // [DEV] INBOUND TEMPLATE

function elevenLabsHeaders(): Record<string, string> {
  return {
    'xi-api-key': process.env.ELEVENLABS_API_KEY!,
    'content-type': 'application/json',
  };
}

async function simulate(body: unknown): Promise<{ok: boolean; status: number; json: unknown}> {
  const res = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}/simulate-conversation`, {
    method: 'POST',
    headers: elevenLabsHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // leave as string
  }

  return {ok: res.ok, status: res.status, json: parsed};
}

describe.skipIf(SKIP)('META-AUDIT: live ElevenLabs simulate-conversation', () => {
  it('returns a structured transcript when we run a basic simulation (E1 proxy)', async () => {
    const result = await simulate({
      simulation_specification: {
        simulated_user_config: {
          first_message: 'Hi, I want to book a furnace service for Tuesday morning.',
          language: 'en',
        },
      },
      extra_evaluation_criteria: [],
      new_turns_limit: 2,
    });

    expect(result.status, `simulate-conversation HTTP ${result.status}; body=${JSON.stringify(result.json).slice(0, 300)}`).toBeLessThan(500);
    if (result.status === 200) {
      const turns = extractSimulatedConversation(result.json);
      expect(turns.length, `simulated_conversation missing/empty from simulation result: ${JSON.stringify(result.json).slice(0, 300)}`).toBeGreaterThan(0);
      // Some agents have an analysis block, some don't — assert only the
      // transcript is present.
    } else {
      // Even a 4xx is useful — surface the API error so the operator can fix
      // (e.g. agent missing voice id, banned model, etc).
      throw new Error(`Simulation failed with HTTP ${result.status}: ${JSON.stringify(result.json)}`);
    }
  }, 120_000);

  it.skipIf(!RUN_OVERRIDE_CHECK)('honors conversation_config_override on first_message when the endpoint supports it', async () => {
    const overrideMessage = 'OVERRIDE_FIRST_MESSAGE_TEST_' + Date.now();
    const result = await simulate({
      simulation_specification: {
        simulated_user_config: {
          first_message: 'Hi there.',
          language: 'en',
        },
      },
      extra_evaluation_criteria: [],
      new_turns_limit: 2,
      conversation_config_override: {
        agent: {first_message: overrideMessage},
      },
    });

    if (result.status === 200) {
      const agentTurns = extractSimulatedConversation(result.json).filter(t => t.role === 'agent');
      // The first agent turn (or one of the early ones) should match the override.
      const found = agentTurns.some(t => t.message?.includes(overrideMessage));
      const preview = JSON.stringify(agentTurns.slice(0, 3));
      expect(found, `override "${overrideMessage}" not present in agent transcript: ${preview}`).toBe(true);
    } else if (result.status === 403 || result.status === 422) {
      // Override may be disabled on the agent — surface the error explicitly.
      const message = `Override path rejected with HTTP ${result.status}: ${JSON.stringify(result.json)}. `
        + 'Check that platform_settings.overrides.conversation_config_override.agent.first_message=true on the test agent.';
      throw new Error(message);
    } else {
      throw new Error(`Simulation failed with HTTP ${result.status}: ${JSON.stringify(result.json)}`);
    }
  }, 120_000);
});

function extractSimulatedConversation(json: unknown): Array<{role: string; message?: string}> {
  if (!json || typeof json !== 'object') {
    return [];
  }

  const envelope = json as Record<string, unknown>;
  const turns = envelope.simulated_conversation ?? envelope.simulatedConversation ?? envelope.transcript;
  if (!Array.isArray(turns)) {
    return [];
  }

  const normalized: Array<{role: string; message?: string}> = [];
  for (const turn of turns) {
    if (!turn || typeof turn !== 'object') {
      continue;
    }

    const item = turn as Record<string, unknown>;
    if (typeof item.role !== 'string') {
      continue;
    }

    normalized.push({
      role: item.role,
      message: typeof item.message === 'string' ? item.message : undefined,
    });
  }

  return normalized;
}
