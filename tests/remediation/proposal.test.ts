import {
  describe, expect, it, vi,
} from 'vitest';
import {proposeFix} from '../../src/remediation/proposal';
import type {DimensionScore} from '../../src/scoring/types';
import type {FixProposal} from '../../src/remediation/types';

const VALID_PROPOSAL: FixProposal = {
  target: 'voice_speed',
  locator: '',
  proposed_value: '1.04',
  rationale: 'Faster speed reduces dead-air complaints.',
  addresses: ['voice_activity'],
  confidence: 0.7,
};

const FAILURES: DimensionScore[] = [
  {name: 'voice_activity', status: 'failed', detail: '120ms of speech, expected 500ms'},
];

describe('proposeFix', () => {
  it('returns [] when there are no failures', async () => {
    const llm = vi.fn();
    const result = await proposeFix({
      llm,
      agentConfig: {},
      failures: [],
    });
    expect(result).toHaveLength(0);
    expect(llm).not.toHaveBeenCalled();
  });

  it('parses a valid JSON array of proposals', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify([VALID_PROPOSAL]));
    const result = await proposeFix({llm, agentConfig: {tts: {speed: 1}}, failures: FAILURES});
    expect(result).toHaveLength(1);
    expect(result[0].target).toBe('voice_speed');
    expect(result[0].proposed_value).toBe('1.04');
  });

  it('tolerates ```json``` code-fence wrappers', async () => {
    const llm = vi.fn().mockResolvedValue(`\`\`\`json\n${JSON.stringify([VALID_PROPOSAL])}\n\`\`\``);
    const result = await proposeFix({llm, agentConfig: {}, failures: FAILURES});
    expect(result).toHaveLength(1);
  });

  it('tolerates {fixes: [...]} envelopes', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify({fixes: [VALID_PROPOSAL]}));
    const result = await proposeFix({llm, agentConfig: {}, failures: FAILURES});
    expect(result).toHaveLength(1);
  });

  it('drops proposals with invalid targets', async () => {
    const malformed = {...VALID_PROPOSAL, target: 'model_swap'};
    const llm = vi.fn().mockResolvedValue(JSON.stringify([malformed, VALID_PROPOSAL]));
    const result = await proposeFix({llm, agentConfig: {}, failures: FAILURES});
    expect(result).toHaveLength(1);
    expect(result[0].target).toBe('voice_speed');
  });

  it('clips voice_stability outside [0, 1]', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify([
      {...VALID_PROPOSAL, target: 'voice_stability', proposed_value: '1.5'},
    ]));
    const result = await proposeFix({llm, agentConfig: {}, failures: FAILURES});
    expect(result[0].proposed_value).toBe('1');
  });

  it('clips voice_speed outside [0.5, 2.0]', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify([
      {...VALID_PROPOSAL, target: 'voice_speed', proposed_value: '5'},
    ]));
    const result = await proposeFix({llm, agentConfig: {}, failures: FAILURES});
    expect(result[0].proposed_value).toBe('2');
  });

  it('forces turn_eagerness into the allowed enum', async () => {
    const llm = vi.fn().mockResolvedValue(JSON.stringify([
      {...VALID_PROPOSAL, target: 'turn_eagerness', proposed_value: 'super-eager'},
    ]));
    const result = await proposeFix({llm, agentConfig: {}, failures: FAILURES});
    expect(result[0].proposed_value).toBe('normal');
  });

  it('returns [] on invalid JSON', async () => {
    const llm = vi.fn().mockResolvedValue('not json');
    const result = await proposeFix({llm, agentConfig: {}, failures: FAILURES});
    expect(result).toHaveLength(0);
  });

  it('emits a deterministic proposal for SMS_AFTER_DECLINE without calling the LLM', async () => {
    const llm = vi.fn();
    const result = await proposeFix({
      llm,
      agentConfig: {agent: {prompt: {prompt: 'You are Sarah, an HVAC specialist.'}}},
      failures: FAILURES,
      detectedPatterns: [
        {pattern: 'SMS_AFTER_DECLINE', description: 'SMS after decline'},
      ],
    });
    expect(llm).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].target).toBe('system_prompt');
    expect(result[0].proposed_value).toContain('SMS CONSENT');
    expect(result[0].proposed_value).toContain('You are Sarah'); // current prompt preserved
  });

  it('skips the pattern proposal if the addendum headline is already in the prompt', async () => {
    const llm = vi.fn().mockResolvedValue('[]');
    // The dedup check looks for the actual addition's first non-empty
    // line (the headline), NOT the pattern id. Earlier code matched the
    // pattern id, which never appeared in the addition itself — so the
    // same block was re-appended every polish-loop iteration.
    const existingPrompt = 'You are Sarah. [AUTOREFINEMENT] CRITICAL SMS CONSENT RULE: prior block here.';
    const result = await proposeFix({
      llm,
      agentConfig: {agent: {prompt: {prompt: existingPrompt}}},
      failures: FAILURES,
      detectedPatterns: [
        {pattern: 'SMS_AFTER_DECLINE', description: 'SMS after decline'},
      ],
    });
    expect(llm).toHaveBeenCalled(); // dedup → fell through to LLM
    expect(result).toHaveLength(0); // LLM returned []
  });

  it('does NOT dedup when only the pattern id (not the addendum) appears in the prompt', async () => {
    // Regression for the bug Codex flagged: the prior dedup matched the
    // pattern id literal in the prompt, but the canonical addition never
    // contains that id, so the same block would be re-appended forever.
    const llm = vi.fn();
    const result = await proposeFix({
      llm,
      agentConfig: {agent: {prompt: {prompt: 'You are Sarah. SMS_AFTER_DECLINE rules already applied.'}}},
      failures: FAILURES,
      detectedPatterns: [
        {pattern: 'SMS_AFTER_DECLINE', description: 'SMS after decline'},
      ],
    });
    expect(llm).not.toHaveBeenCalled(); // pattern proposal emits without LLM
    expect(result).toHaveLength(1);
    expect(result[0].target).toBe('system_prompt');
  });

  it('emits a temperature-reduction proposal for INCONSISTENT_BEHAVIOR', async () => {
    const llm = vi.fn();
    const result = await proposeFix({
      llm,
      agentConfig: {agent: {prompt: {prompt: 'sys', temperature: 0.8}}},
      failures: FAILURES,
      detectedPatterns: [
        {pattern: 'INCONSISTENT_BEHAVIOR', description: 'variance detected'},
      ],
    });
    expect(llm).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].target).toBe('temperature');
    expect(Number.parseFloat(result[0].proposed_value)).toBeCloseTo(0.5, 2);
  });
});
