import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  describe, expect, it, vi,
} from 'vitest';
import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import {polishLoop} from '../../src/remediation/polish-loop';
import {createVoiceEvalsClient} from '../../src/wrapper/client';
import type {DimensionScore} from '../../src/scoring/types';
import type {FixProposal} from '../../src/remediation/types';
import type {ModelRankings} from '../../src/wrapper/types';

const rankings: ModelRankings = {
  default: 'gemini-3-flash-preview',
  recommended: ['gemini-3-flash-preview'],
  banned: ['gpt-4o-mini'],
};

const VALID_PROPOSAL: FixProposal = {
  target: 'voice_speed',
  locator: '',
  proposed_value: '1.1',
  rationale: 'pace up slightly',
  addresses: ['voice_activity'],
};

function buildMockClient(opts: {
  agentName?: string;
  update?: ReturnType<typeof vi.fn>;
  systemPrompt?: string;
} = {}) {
  const update = opts.update ?? vi.fn().mockResolvedValue(undefined);
  const conversationConfig: Record<string, unknown> = {tts: {speed: 1, stability: 0.7}};
  if (opts.systemPrompt !== undefined) {
    conversationConfig.agent = {prompt: {prompt: opts.systemPrompt, temperature: 0.7}};
  }

  const raw = {
    conversationalAi: {
      agents: {
        list: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({
          agent_id: 'agent_xxxx_demo',
          name: opts.agentName ?? '[DEV] Sarah - Test',
          conversation_config: conversationConfig,
        }),
        update,
      },
    },
  } as unknown as ElevenLabsClient;
  return {client: createVoiceEvalsClient({client: raw, modelRankings: rankings}), update};
}

const FAILING: DimensionScore = {name: 'voice_activity', status: 'failed', detail: 'too rushed'};

describe('polishLoop', () => {
  it('returns all_passing immediately when evaluate returns no failures', async () => {
    const {client} = buildMockClient();
    const evaluate = vi.fn().mockResolvedValue([{name: 'voice_activity', status: 'passed'}]);
    const llm = vi.fn();
    const result = await polishLoop({
      client, agentId: 'agent_xxxx_demo', evaluate, llm,
    });
    expect(result.stopped_because).toBe('all_passing');
    expect(result.iterations).toBe(1);
    expect(result.applied).toHaveLength(0);
    expect(result.finalFailingCount).toBe(0);
    expect(llm).not.toHaveBeenCalled();
  });

  it('returns no_proposal when the LLM returns []', async () => {
    const {client} = buildMockClient();
    const evaluate = vi.fn().mockResolvedValue([FAILING]);
    const llm = vi.fn().mockResolvedValue('[]');
    const result = await polishLoop({
      client, agentId: 'agent_xxxx_demo', evaluate, llm,
    });
    expect(result.stopped_because).toBe('no_proposal');
    expect(result.iterations).toBe(1);
    expect(result.applied).toHaveLength(0);
    expect(result.finalFailingCount).toBe(1);
  });

  it('applies a proposal when one is returned and returns all_passing on success', async () => {
    const {client, update} = buildMockClient();
    const evaluate = vi.fn()
      .mockResolvedValueOnce([FAILING]) // iteration 1 before
      .mockResolvedValueOnce([{name: 'voice_activity', status: 'passed'}]); // iteration 1 after
    const llm = vi.fn().mockResolvedValue(JSON.stringify([VALID_PROPOSAL]));
    const result = await polishLoop({
      client, agentId: 'agent_xxxx_demo', evaluate, llm,
    });
    expect(result.stopped_because).toBe('all_passing');
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].target).toBe('voice_speed');
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('stops on max_iterations when failures persist without improvement of < patience', async () => {
    const {client} = buildMockClient();
    // Single failing dim every time; pevFailing stays infinite then == on each iter
    // -> consecutiveNoImprovement increments each iter -> hits patience or max.
    const evaluate = vi.fn().mockResolvedValue([FAILING]);
    const llm = vi.fn().mockResolvedValue(JSON.stringify([VALID_PROPOSAL]));
    const result = await polishLoop({
      client, agentId: 'agent_xxxx_demo', evaluate, llm,
      maxIterations: 5,
      patience: 99, // huge patience -> never trips
    });
    expect(result.stopped_because).toBe('max_iterations');
    expect(result.iterations).toBe(5);
    expect(result.applied).toHaveLength(5);
  });

  it('stops on patience_exhausted when consecutive no-improvement hits the patience cap', async () => {
    const {client} = buildMockClient();
    // failing remains constant at 1 -> no improvement on every iter
    const evaluate = vi.fn().mockResolvedValue([FAILING]);
    const llm = vi.fn().mockResolvedValue(JSON.stringify([VALID_PROPOSAL]));
    const result = await polishLoop({
      client, agentId: 'agent_xxxx_demo', evaluate, llm,
      maxIterations: 99,
      patience: 2,
    });
    expect(result.stopped_because).toBe('patience_exhausted');
    // Iter 1 sets prev=1 (was Infinity); iter 2 is the 1st no-improvement;
    // iter 3 is the 2nd, triggering patience=2.
    expect(result.iterations).toBe(3);
  });

  it('dryRun does not PATCH and treats failingAfter == failingBefore', async () => {
    const {client, update} = buildMockClient();
    const evaluate = vi.fn().mockResolvedValue([FAILING]);
    const llm = vi.fn().mockResolvedValue(JSON.stringify([VALID_PROPOSAL]));
    const result = await polishLoop({
      client, agentId: 'agent_xxxx_demo', evaluate, llm,
      maxIterations: 1,
      dryRun: true,
    });
    expect(update).not.toHaveBeenCalled();
    expect(result.applied).toHaveLength(0); // dryRun doesn't count as applied
    expect(result.history[0].applied).toBe(false);
    expect(result.history[0].failingAfter).toBe(1);
  });

  it('propagates governance failure when agent is not [DEV] and governance default applies', async () => {
    const {client} = buildMockClient({agentName: '[PROD] Sarah'});
    const evaluate = vi.fn().mockResolvedValue([FAILING]);
    const llm = vi.fn().mockResolvedValue(JSON.stringify([VALID_PROPOSAL]));
    await expect(polishLoop({
      client, agentId: 'agent_xxxx_demo', evaluate, llm,
    }))
      .rejects.toThrow(/\[PROD]/);
  });

  it('runs ANALYZE callback and emits a deterministic proposal that bypasses the LLM', async () => {
    const {client, update} = buildMockClient({systemPrompt: 'You are Sarah, an HVAC lead specialist.'});
    const evaluate = vi.fn()
      .mockResolvedValueOnce([FAILING])
      .mockResolvedValueOnce([{name: 'voice_activity', status: 'passed'}]);
    const llm = vi.fn(); // must NOT be called
    const analyze = vi.fn().mockReturnValue({
      turns: [
        {role: 'user' as const, message: 'No, do not text me.'},
        {role: 'agent' as const, message: 'Sending now.', toolCalls: [{name: 'send_sms'}]},
      ],
    });
    const result = await polishLoop({
      client, agentId: 'agent_xxxx_demo', evaluate, llm, analyze,
    });

    expect(llm).not.toHaveBeenCalled();
    expect(analyze).toHaveBeenCalled();
    expect(result.stopped_because).toBe('all_passing');
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].target).toBe('system_prompt');
    expect(result.applied[0].rationale).toContain('SMS_AFTER_DECLINE');
    expect(result.history[0].patternsDetected?.map(p => p.pattern))
      .toContain('SMS_AFTER_DECLINE');
    expect(result.patternsDetected?.SMS_AFTER_DECLINE).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('falls back to the LLM when ANALYZE finds no matching patterns', async () => {
    const {client} = buildMockClient({systemPrompt: 'You are Sarah.'});
    const evaluate = vi.fn()
      .mockResolvedValueOnce([FAILING])
      .mockResolvedValueOnce([{name: 'voice_activity', status: 'passed'}]);
    const llm = vi.fn().mockResolvedValue(JSON.stringify([VALID_PROPOSAL]));
    const analyze = vi.fn().mockReturnValue({
      turns: [{role: 'user' as const, message: 'hi'}, {role: 'agent' as const, message: 'hello'}],
    });
    const result = await polishLoop({
      client, agentId: 'agent_xxxx_demo', evaluate, llm, analyze,
    });

    expect(llm).toHaveBeenCalledTimes(1);
    expect(result.stopped_because).toBe('all_passing');
    expect(result.applied[0].target).toBe('voice_speed');
  });

  it('appends friction-log entries when frictionLogPath is set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'voice-evals-polish-friction-'));
    const frictionLogPath = join(dir, 'friction.jsonl');
    try {
      const {client} = buildMockClient({systemPrompt: 'You are Sarah.'});
      const evaluate = vi.fn()
        .mockResolvedValueOnce([FAILING])
        .mockResolvedValueOnce([{name: 'voice_activity', status: 'passed'}]);
      const llm = vi.fn();
      const analyze = vi.fn().mockReturnValue({
        turns: [
          {role: 'user' as const, message: 'No, do not text me.'},
          {role: 'agent' as const, message: 'Sending.', toolCalls: [{name: 'send_sms'}]},
        ],
      });
      await polishLoop({
        client, agentId: 'agent_xxxx_demo', evaluate, llm, analyze, frictionLogPath,
      });

      const lines = readFileSync(frictionLogPath, 'utf8').trim().split('\n');
      const events = lines.map(l => JSON.parse(l) as Record<string, unknown>);
      const types = events.map(e => e.type);
      expect(types).toContain('PATTERN_DETECTED');
      expect(types).toContain('REMEDIATION_APPLIED');
      expect(events[0].pattern).toBe('SMS_AFTER_DECLINE');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('records per-iteration history with failingBefore / failingAfter', async () => {
    const {client} = buildMockClient();
    // Iter 1: 3 failing -> apply -> 2 failing
    // Iter 2: 2 failing -> apply -> 1 failing
    // Iter 3 (max): 1 failing -> apply -> 0 failing -> all_passing
    const failures = (n: number): DimensionScore[] => Array.from({length: n}, (_, i) => ({
      name: `fail_${i}`,
      status: 'failed' as const,
      detail: 'detail',
    }));
    const evaluate = vi.fn()
      .mockResolvedValueOnce(failures(3))
      .mockResolvedValueOnce(failures(2))
      .mockResolvedValueOnce(failures(2))
      .mockResolvedValueOnce(failures(1))
      .mockResolvedValueOnce(failures(1))
      .mockResolvedValueOnce([{name: 'ok', status: 'passed'}]);
    const llm = vi.fn().mockResolvedValue(JSON.stringify([VALID_PROPOSAL]));
    const result = await polishLoop({
      client, agentId: 'agent_xxxx_demo', evaluate, llm,
      maxIterations: 5,
    });
    expect(result.stopped_because).toBe('all_passing');
    expect(result.history.length).toBeGreaterThanOrEqual(3);
    // Check we recorded progress on the first two iterations
    expect(result.history[0].failingBefore).toBe(3);
    expect(result.history[0].failingAfter).toBe(2);
  });
});
