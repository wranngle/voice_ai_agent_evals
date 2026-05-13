import {
  describe, expect, it, vi,
} from 'vitest';
import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import {runSupersystem} from '../../src/remediation/supersystem';
import {createVoiceEvalsClient} from '../../src/wrapper/client';
import type {N8nCorrectorClient} from '../../src/n8n';
import type {DimensionScore} from '../../src/scoring/types';
import type {FixProposal} from '../../src/remediation/types';
import type {ModelRankings} from '../../src/wrapper/types';

const rankings: ModelRankings = {
  default: 'gemini-3-flash-preview',
  recommended: ['gemini-3-flash-preview'],
  banned: ['gpt-4o-mini'],
};

function makeClient() {
  const raw = {
    conversationalAi: {
      agents: {
        get: vi.fn().mockResolvedValue({
          agent_id: 'agent_demo',
          name: '[DEV] Sarah',
          conversation_config: {agent: {prompt: {prompt: 'You are Sarah.'}}, tts: {speed: 1}},
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    },
  } as unknown as ElevenLabsClient;
  return createVoiceEvalsClient({client: raw, modelRankings: rankings});
}

const PROPOSAL: FixProposal = {
  target: 'voice_speed',
  locator: '',
  proposed_value: '1.1',
  rationale: 'pace up',
  addresses: ['voice_activity'],
};

const fail = (name: string): DimensionScore => ({name, status: 'failed', detail: '–'});
const pass = (name: string): DimensionScore => ({name, status: 'passed'});

function makeN8nCorrector(diagnoses: Array<{operations: unknown[]; confidence: number}> = []): N8nCorrectorClient {
  const calls: unknown[] = [];
  return {
    getWorkflow: vi.fn(),
    updateWorkflowFull: vi.fn(),
    applyPartialUpdate: vi.fn(),
    diagnoseWorkflowFailure: vi.fn().mockImplementation((ctx: unknown) => {
      calls.push(ctx);
      return diagnoses[calls.length - 1] ?? {workflowId: '', operations: [], confidence: 0.3};
    }),
    applyWorkflowFixes: vi.fn().mockResolvedValue({success: true, results: [], timestamp: ''}),
  };
}

describe('runSupersystem', () => {
  it('terminates on all_passing when polishLoop succeeds and no n8n hooks are provided', async () => {
    const client = makeClient();
    const evaluate = vi.fn().mockResolvedValue([pass('a')]);
    const llm = vi.fn();
    const result = await runSupersystem({
      client, agentId: 'agent_demo', evaluate, llm,
    });
    expect(result.stopped_because).toBe('all_passing');
    expect(result.cycles).toBe(1);
    expect(result.regressed).toBe(false);
    expect(result.n8nRuns).toEqual([]);
  });

  it('flips regressed=true and stops on agent_regressed when polishLoop regresses', async () => {
    const client = makeClient();
    // First polishLoop call: regressing fix scenario.
    const sequence: DimensionScore[][] = [
      [fail('a'), pass('b')],
      [fail('a'), fail('b')], // b regressed
      [fail('a'), fail('b')],
      [fail('a'), fail('b')],
      [fail('a'), fail('b')],
      [fail('a'), fail('b')],
    ];
    let i = 0;
    const evaluate = vi.fn(async () => sequence[Math.min(i++, sequence.length - 1)]);
    const llm = vi.fn().mockResolvedValue(JSON.stringify([PROPOSAL]));
    const result = await runSupersystem({
      client, agentId: 'agent_demo', evaluate, llm, maxCycles: 5, maxIterationsPerCycle: 5,
    });
    expect(result.regressed).toBe(true);
    expect(result.stopped_because).toBe('agent_regressed');
    expect(result.cycles).toBe(1); // bailed after first regressing polishLoop
  });

  it('runs the n8n diagnose+fix pipeline when failures are reported', async () => {
    const client = makeClient();
    // polishLoop: pass immediately so we don't need agent fixes.
    const evaluate = vi.fn().mockResolvedValue([pass('a')]);
    const llm = vi.fn();
    const diagnosis = {workflowId: 'wf_1', operations: [{type: 'updateNode', nodeName: 'HTTP', changes: {retryOnFail: true}}], confidence: 0.8};
    const corrector = makeN8nCorrector([diagnosis]);
    const collectFailures = vi.fn().mockResolvedValueOnce([
      {workflowId: 'wf_1', errorMessage: 'ETIMEDOUT', nodeName: 'HTTP'},
    ]).mockResolvedValue([]);
    const result = await runSupersystem({
      client,
      agentId: 'agent_demo',
      evaluate,
      llm,
      n8n: {corrector, collectFailures},
      maxCycles: 5,
    });
    expect(corrector.diagnoseWorkflowFailure).toHaveBeenCalledTimes(1);
    expect(corrector.applyWorkflowFixes).toHaveBeenCalledTimes(1);
    // Cycle 1 applies 1 fix; cycle 2 sees no failures + agent still passing -> stops.
    // The second cycle is intentional: after an n8n fix, the agent eval is re-run
    // to confirm the workflow change didn't regress the agent's downstream behavior.
    expect(result.stopped_because).toBe('all_passing');
    expect(result.n8nRuns).toHaveLength(2);
    expect(result.n8nRuns[0].applied).toBe(1);
    expect(result.n8nRuns[1].applied).toBe(0);
  });

  it('respects maxCycles when both layers keep finding work', async () => {
    const client = makeClient();
    const evaluate = vi.fn().mockResolvedValue([fail('a')]);
    const llm = vi.fn().mockResolvedValue(JSON.stringify([PROPOSAL]));
    const diagnosis = {
      workflowId: 'wf_1',
      operations: [{type: 'updateNode', nodeName: 'HTTP', changes: {retryOnFail: true}}],
      confidence: 0.8,
    };
    const corrector = makeN8nCorrector(Array.from({length: 10}, () => diagnosis as never));
    const collectFailures = vi.fn().mockResolvedValue([
      {workflowId: 'wf_1', errorMessage: 'ETIMEDOUT', nodeName: 'HTTP'},
    ]);
    const result = await runSupersystem({
      client,
      agentId: 'agent_demo',
      evaluate,
      llm,
      n8n: {corrector, collectFailures},
      maxCycles: 3,
      maxIterationsPerCycle: 1,
    });
    expect(result.cycles).toBe(3);
    expect(result.stopped_because).toBe('max_cycles');
  });

  it('stops on no_action when polishLoop has nothing to propose AND no n8n hooks', async () => {
    const client = makeClient();
    const evaluate = vi.fn().mockResolvedValue([fail('a')]);
    const llm = vi.fn().mockResolvedValue('[]'); // no proposal
    const result = await runSupersystem({
      client, agentId: 'agent_demo', evaluate, llm,
    });
    expect(result.stopped_because).toBe('no_action');
    expect(result.cycles).toBe(1);
  });
});
