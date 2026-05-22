/**
 * Live-mode adapter tests — verify the orchestrator can swap fixture
 * personas for ElevenLabs `simulateConversation` traffic. SDK is mocked at
 * the `raw.conversationalAi.agents` boundary; no network is touched.
 *
 * The contract under test: given a mocked simulateConversation response in
 * the SDK shape (role / message / toolCalls / toolResults / timeInCallSecs),
 * runLivePersonaCalls returns PersonaCall[] that the existing detector,
 * diff renderer, and orchestrator consume without modification.
 */

import {mkdtempSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {inferBusinessContextFromAgent, runLivePersonaCalls} from '../../src/refinement/live-adapter';
import {runRefinement} from '../../src/refinement/orchestrator';
import type {VoiceEvalsClient} from '../../src/wrapper/types';

type MockResponse = {simulatedConversation: Array<Record<string, unknown>>};

function makeMockClient(perPersonaResponses: MockResponse[]): {
  client: VoiceEvalsClient;
  simulateConversation: ReturnType<typeof vi.fn>;
  agentGet: ReturnType<typeof vi.fn>;
} {
  let callIndex = 0;
  const simulateConversation = vi.fn(async () => {
    const response = perPersonaResponses[callIndex] ?? perPersonaResponses[0];
    callIndex += 1;
    return response;
  });
  const agentGet = vi.fn(async (_agentId: string) => ({
    name: '[DEV] Riverside Heating Receptionist',
    conversationConfig: {
      agent: {
        prompt: {
          prompt: 'You are the AI receptionist for Riverside Heating & Cooling — an HVAC company serving Sacramento metro. Hours: Mon-Fri 7am-7pm.',
        },
      },
    },
  }));

  const client = {
    raw: {
      conversationalAi: {
        agents: {
          simulateConversation,
          get: agentGet,
        },
      },
    },
  } as unknown as VoiceEvalsClient;

  return {client, simulateConversation, agentGet};
}

const SAMPLE_LIVE_TRANSCRIPT = [
  {role: 'agent', message: 'Hi, Riverside Heating & Cooling — how can I help?', timeInCallSecs: 0.62},
  {role: 'user', message: 'Oh hello dear, my furnace is making a clanking sound. Can you help?', timeInCallSecs: 4.1},
  {role: 'agent', message: '[chuckles] Of course! I have you booked for Tuesday at 2pm.', timeInCallSecs: 8.4},
  {role: 'user', message: 'Thank you so much.', timeInCallSecs: 11},
  {role: 'agent', message: 'I just sent a confirmation to your phone.', timeInCallSecs: 13.5},
];

const CLEAN_TRANSCRIPT = [
  {role: 'agent', message: 'Riverside Heating & Cooling — how can I help?', timeInCallSecs: 0.58},
  {role: 'user', message: 'Hi, my furnace is making noise.', timeInCallSecs: 3},
  {
    role: 'agent',
    message: 'Got it — texting you the booking link now.',
    timeInCallSecs: 6.2,
    toolCalls: [{toolName: 'send_sms', toolCallId: 't1'}],
    toolResults: [{toolName: 'send_sms', status: 'success'}],
  },
];

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'voice-evals-live-'));
});

afterEach(() => {
  rmSync(workDir, {recursive: true, force: true});
});

describe('live-adapter — runLivePersonaCalls', () => {
  it('issues one simulateConversation call per persona and returns PersonaCall[] in the detector schema', async () => {
    const {client, simulateConversation} = makeMockClient(Array.from({length: 5}, () => ({simulatedConversation: SAMPLE_LIVE_TRANSCRIPT})));

    const calls = await runLivePersonaCalls({
      client,
      agentId: 'agent_test_001',
      businessContext: 'Riverside Heating & Cooling — HVAC',
    });

    expect(simulateConversation).toHaveBeenCalledTimes(5);
    expect(calls.length).toBe(5);
    expect(calls.map(c => c.persona_id).sort()).toEqual([
      'confused-meanderer', 'esl-non-native', 'frustrated-rusher', 'hostile-skeptic', 'polite-elderly',
    ]);

    for (const call of calls) {
      expect(call.turns.length).toBe(SAMPLE_LIVE_TRANSCRIPT.length);
      expect(call.turns[0].role).toBe('agent');
      expect(typeof call.ttfb_ms).toBe('number');
      expect(call.ttfb_ms).toBeGreaterThan(0);
    }
  });

  it('passes simulatedUserConfig with persona-derived firstMessage', async () => {
    const {client, simulateConversation} = makeMockClient([{simulatedConversation: CLEAN_TRANSCRIPT}]);
    await runLivePersonaCalls({
      client,
      agentId: 'agent_test_002',
      businessContext: 'Riverside Heating',
      personaIds: ['polite-elderly'],
    });

    expect(simulateConversation).toHaveBeenCalledTimes(1);
    const callArgs = simulateConversation.mock.calls[0];
    expect(callArgs[0]).toBe('agent_test_002');
    const request = callArgs[1] as Record<string, unknown>;
    const spec = request.simulationSpecification as Record<string, unknown>;
    const userConfig = spec.simulatedUserConfig as Record<string, unknown>;
    expect(typeof userConfig.firstMessage).toBe('string');
    expect((userConfig.firstMessage as string).length).toBeGreaterThan(5);
  });

  it('translates tool_calls + tool_results into the PersonaCall tool_calls shape', async () => {
    const {client} = makeMockClient([{simulatedConversation: CLEAN_TRANSCRIPT}]);
    const calls = await runLivePersonaCalls({
      client,
      agentId: 'agent_test_003',
      businessContext: 'Riverside Heating',
      personaIds: ['polite-elderly'],
    });

    const toolTurn = calls[0].turns.find(t => t.tool_calls && t.tool_calls.length > 0);
    expect(toolTurn).toBeDefined();
    expect(toolTurn?.tool_calls?.[0].tool).toBe('send_sms');
    expect(toolTurn?.tool_calls?.[0].status).toBe('success');
  });

  it('marks tool_calls without a matching result as pending', async () => {
    const transcript = [
      {
        role: 'agent', message: 'Sending text.', toolCalls: [{toolName: 'send_sms'}], timeInCallSecs: 1,
      },
    ];
    const {client} = makeMockClient([{simulatedConversation: transcript}]);
    const calls = await runLivePersonaCalls({
      client,
      agentId: 'agent',
      businessContext: 'ctx',
      personaIds: ['polite-elderly'],
    });
    expect(calls[0].turns[0].tool_calls?.[0].status).toBe('pending');
  });
});

describe('live-adapter — inferBusinessContextFromAgent', () => {
  it('strips the [PHASE] prefix from the agent name and pulls the system prompt', async () => {
    const {client} = makeMockClient([{simulatedConversation: SAMPLE_LIVE_TRANSCRIPT}]);
    const ctx = await inferBusinessContextFromAgent(client, 'agent_x');
    expect(ctx.name).toBe('Riverside Heating Receptionist');
    expect(ctx.systemPrompt).toContain('HVAC');
    expect(ctx.systemPrompt).toContain('Sacramento');
  });
});

describe('live-adapter — orchestrator integration', () => {
  it('runRefinement against a mocked live client produces a full session bundle and detects failures from the live transcript', async () => {
    const {client, simulateConversation, agentGet} = makeMockClient(Array.from({length: 5}, () => ({simulatedConversation: SAMPLE_LIVE_TRANSCRIPT})));

    const session = await runRefinement({
      agent_id: 'agent_live_e2e',
      session_id: 'live-e2e',
      out_dir: workDir,
      client,
    });

    expect(agentGet).toHaveBeenCalledTimes(1);
    expect(simulateConversation).toHaveBeenCalledTimes(5);
    expect(session.status).toBe('complete');
    expect(session.persona_calls.length).toBe(5);
    expect(session.detected_failures.length).toBeGreaterThan(0);
    expect(session.detected_failures.some(f => f.mode_id === 'voice_marker_leakage')).toBe(true);
    expect(session.detected_failures.some(f => f.mode_id === 'calendar_overpromise')).toBe(true);
    expect(existsSync(join(workDir, 'live-e2e', 'compliance.html'))).toBe(true);
  });
});
