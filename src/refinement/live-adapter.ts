/**
 * Live-mode adapter — wraps the ElevenLabs SDK's `agents.simulateConversation`
 * so the Refinement orchestrator can swap the deterministic fixture loader
 * for real agent traffic. Same `PersonaCall` schema either way; the
 * detector / diff / scoreboard / compliance pipeline downstream is identical.
 *
 * Persona behavior is injected by giving the simulated USER its own
 * AgentConfig: the persona description becomes the user's system prompt,
 * and the persona's canonical opening line becomes `firstMessage`.
 */

import {CANONICAL_PERSONAS, getPersona, type Persona} from '../ingestion/persona-generator';
import type {VoiceEvalsClient} from '../wrapper/types';
import type {PersonaCall, TranscriptTurn} from './types';

const PERSONA_OPENERS: Record<string, string> = {
  'polite-elderly': "Oh hello dear, I'm hoping you can help me with something.",
  'frustrated-rusher': "Yeah look I don't have a lot of time — can you help me or not?",
  'esl-non-native': "Hello, please, I need help. My English not so good.",
  'confused-meanderer': "So I was thinking, and my neighbor said something, and I'm not sure where to start…",
  'hostile-skeptic': "Wait — am I talking to a real person or one of those AI bots?",
};

function buildSimulatedUserPrompt(persona: Persona, businessContext: string): string {
  return [
    `You are a SIMULATED CALLER to a small business voice agent. You are NOT the agent.`,
    `You are: ${persona.name} — ${persona.traits.description}`,
    `Pace: ~${persona.traits.pace_wpm} wpm. Interruption tendency: ${persona.traits.interruption_tendency}. Frustration slope: ${persona.traits.frustration_slope}.`,
    `Business context the agent will be serving: ${businessContext}`,
    `Stay in character. Do not break the fourth wall. End the call naturally after your need is addressed or you give up.`,
  ].join(' ');
}

type SimulatedTranscriptItem = {
  role?: string;
  message?: string;
  toolCalls?: Array<{
    toolName?: string;
    toolCallId?: string;
    status?: string;
  }>;
  toolResults?: Array<{
    status?: string;
    toolName?: string;
  }>;
  timeInCallSecs?: number;
};

function toPersonaCall(
  persona: Persona,
  rawTranscript: SimulatedTranscriptItem[],
): PersonaCall {
  const turns: TranscriptTurn[] = [];
  let firstAgentTimeMs: number | undefined;

  for (const item of rawTranscript) {
    const role: 'agent' | 'caller' = (item.role === 'agent' || item.role === 'assistant') ? 'agent' : 'caller';
    const text = item.message ?? '';
    const timestampMs = typeof item.timeInCallSecs === 'number' ? Math.round(item.timeInCallSecs * 1000) : undefined;
    if (role === 'agent' && firstAgentTimeMs === undefined && typeof timestampMs === 'number') {
      firstAgentTimeMs = timestampMs;
    }

    const toolCalls = (item.toolCalls ?? []).map(tc => {
      const matchingResult = (item.toolResults ?? []).find(r => r.toolName === tc.toolName);
      const status: 'success' | 'error' | 'pending' = matchingResult?.status === 'failure' || matchingResult?.status === 'error'
        ? 'error'
        : matchingResult
          ? 'success'
          : 'pending';
      return {
        tool: tc.toolName ?? 'unknown',
        status,
      };
    });

    turns.push({
      role,
      text,
      ...(typeof timestampMs === 'number' ? {timestamp_ms: timestampMs} : {}),
      ...(toolCalls.length > 0 ? {tool_calls: toolCalls} : {}),
    });
  }

  return {
    persona_id: persona.id,
    persona_name: persona.name,
    turns,
    ...(typeof firstAgentTimeMs === 'number' ? {ttfb_ms: firstAgentTimeMs} : {}),
  };
}

export type LiveAdapterOptions = {
  client: VoiceEvalsClient;
  agentId: string;
  businessContext: string;
  personaIds?: string[];
  dynamicVariables?: Record<string, string | number | boolean>;
  newTurnsLimit?: number;
};

export async function runLivePersonaCalls(options: LiveAdapterOptions): Promise<PersonaCall[]> {
  const {
    client, agentId, businessContext,
    personaIds, dynamicVariables, newTurnsLimit = 16,
  } = options;

  const personas = (personaIds ?? CANONICAL_PERSONAS.map(p => p.id))
    .map(id => getPersona(id))
    .filter((p): p is Persona => Boolean(p));

  const results: PersonaCall[] = [];

  for (const persona of personas) {
    const userPrompt = buildSimulatedUserPrompt(persona, businessContext);
    const firstMessage = PERSONA_OPENERS[persona.id] ?? 'Hi, I have a question.';

    const response = await client.raw.conversationalAi.agents.simulateConversation(agentId, {
      simulationSpecification: {
        simulatedUserConfig: {
          firstMessage,
          language: 'en',
          prompt: {prompt: userPrompt} as unknown as never,
        },
        ...(dynamicVariables ? {dynamicVariables: dynamicVariables as never} : {}),
      },
      newTurnsLimit,
    });

    const transcript = (response as unknown as {simulatedConversation?: SimulatedTranscriptItem[]}).simulatedConversation ?? [];
    results.push(toPersonaCall(persona, transcript));
  }

  return results;
}

export async function inferBusinessContextFromAgent(
  client: VoiceEvalsClient,
  agentId: string,
): Promise<{name: string; systemPrompt: string; rawConfig: unknown}> {
  const response = await client.raw.conversationalAi.agents.get(agentId);
  const raw = response as unknown as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.replace(/^\[(?:DEV|ALPHA|BETA|PROD|ARCHIVED)]\s*/i, '') : `agent ${agentId}`;
  const config = raw.conversationConfig ?? raw.conversation_config;
  const agentBlock = (config as Record<string, unknown> | undefined)?.agent as Record<string, unknown> | undefined;
  const promptBlock = agentBlock?.prompt as Record<string, unknown> | undefined;
  const systemPrompt = typeof promptBlock?.prompt === 'string' ? promptBlock.prompt : '';
  return {name, systemPrompt, rawConfig: raw};
}
