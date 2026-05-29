import {
  describe, expect, it, vi,
} from 'vitest';
import {
  scoreAiHumanHandoff,
  scoreCustomerSatisfaction,
  scoreFirstCallResolution,
  scoreInstructionFollowing,
  scoreIntentRecognition,
  scoreResponseConsistency,
  scoreTaskCompletion,
} from '../../src/scoring/rubrics';

const transcript = 'caller: I want to book Tuesday at 2pm.\nagent: Confirmed for Tuesday at 2pm.';

// Mock helper — returns an LlmCompleteCallback that emits a canned response
// for any call, and lets the test inspect what was sent.
function mockLlm(reply: string) {
  return vi.fn(async () => reply);
}

describe('scoreIntentRecognition', () => {
  it('passes when judge emits <score>1</score>', async () => {
    const llm = mockLlm('Looks aligned with the booking intent. <score>1</score>');
    const dim = await scoreIntentRecognition(llm, {transcript, expectedIntent: 'book appointment'});
    expect(dim.status).toBe('passed');
    expect(dim.score).toBe(1);
    expect(dim.detail).toContain('booking intent');
  });

  it('fails when judge emits <score>0</score>', async () => {
    const llm = mockLlm('Agent answered the wrong intent. <score>0</score>');
    const dim = await scoreIntentRecognition(llm, {transcript, expectedIntent: 'cancel subscription'});
    expect(dim.status).toBe('failed');
    expect(dim.score).toBe(0);
  });

  it('errors when judge emits no score tag', async () => {
    const llm = mockLlm('I cannot judge this.');
    const dim = await scoreIntentRecognition(llm, {transcript, expectedIntent: 'book appointment'});
    expect(dim.status).toBe('error');
    expect(dim.detail).toContain('did not emit');
  });

  it('errors when the LLM throws', async () => {
    const llm = vi.fn(async () => {
      throw new Error('network down');
    });
    const dim = await scoreIntentRecognition(llm, {transcript, expectedIntent: 'book'});
    expect(dim.status).toBe('error');
    expect(dim.detail).toContain('network down');
  });
});

describe('scoreInstructionFollowing', () => {
  it('passes when judge gives 5/5 (rawScale 5 → 1.0)', async () => {
    const llm = mockLlm('No violations. <score>5</score>');
    const dim = await scoreInstructionFollowing(llm, {
      transcript,
      instructions: ['Never offer to discount.', 'Always confirm phone format.'],
    });
    expect(dim.status).toBe('passed');
    expect(dim.score).toBe(1);
  });

  it('fails when judge gives 2/5 (rawScale 5 → 0.25, below 0.8 threshold)', async () => {
    const llm = mockLlm('Major violation. <score>2</score>');
    const dim = await scoreInstructionFollowing(llm, {transcript, instructions: 'Be brief.'});
    expect(dim.status).toBe('failed');
    expect(dim.score).toBe(0.25);
  });

  it('numbers a list of instructions in the user prompt', async () => {
    const llm = mockLlm('All good. <score>5</score>');
    await scoreInstructionFollowing(llm, {transcript, instructions: ['rule one', 'rule two']});
    expect(llm).toHaveBeenCalledOnce();
    const [{user}] = llm.mock.calls[0] as Array<{system: string; user: string}>;
    expect(user).toContain('1. rule one');
    expect(user).toContain('2. rule two');
  });
});

describe('scoreTaskCompletion', () => {
  it('passes when judge emits <score>1</score>', async () => {
    const llm = mockLlm('Booking confirmed. <score>1</score>');
    const dim = await scoreTaskCompletion(llm, {transcript, task: 'book Tuesday 2pm'});
    expect(dim.status).toBe('passed');
  });

  it('fails when judge emits <score>0</score>', async () => {
    const llm = mockLlm('Agent stalled and never confirmed. <score>0</score>');
    const dim = await scoreTaskCompletion(llm, {transcript, task: 'book'});
    expect(dim.status).toBe('failed');
  });
});

describe('scoreFirstCallResolution', () => {
  it('passes when goal resolved in-call', async () => {
    const llm = mockLlm('Goal resolved end-to-end. <score>1</score>');
    const dim = await scoreFirstCallResolution(llm, {transcript, goal: 'book appointment'});
    expect(dim.status).toBe('passed');
  });

  it('fails when goal needs a callback', async () => {
    const llm = mockLlm('Agent promised callback. <score>0</score>');
    const dim = await scoreFirstCallResolution(llm, {transcript, goal: 'refund request'});
    expect(dim.status).toBe('failed');
  });
});

describe('scoreCustomerSatisfaction', () => {
  it('passes for a high CSAT estimate (5/5 normalizes to 1.0)', async () => {
    const llm = mockLlm('Caller seemed happy. <score>5</score>');
    const dim = await scoreCustomerSatisfaction(llm, {transcript});
    expect(dim.status).toBe('passed');
    expect(dim.score).toBe(1);
  });

  it('passes at threshold (3/5 → 0.5, default threshold 0.5)', async () => {
    const llm = mockLlm('Neutral tone throughout. <score>3</score>');
    const dim = await scoreCustomerSatisfaction(llm, {transcript});
    expect(dim.status).toBe('passed');
    expect(dim.score).toBe(0.5);
  });

  it('fails for low CSAT (1/5 → 0.0)', async () => {
    const llm = mockLlm('Frustration markers throughout. <score>1</score>');
    const dim = await scoreCustomerSatisfaction(llm, {transcript});
    expect(dim.status).toBe('failed');
    expect(dim.score).toBe(0);
  });
});

describe('scoreAiHumanHandoff', () => {
  it('passes for a clean handoff (5/5)', async () => {
    const llm = mockLlm('Clear reason, context preserved. <score>5</score>');
    const dim = await scoreAiHumanHandoff(llm, {transcript});
    expect(dim.status).toBe('passed');
  });

  it('fails for an abandoned mid-sentence transfer (1/5)', async () => {
    const llm = mockLlm('Caller dropped without warning. <score>1</score>');
    const dim = await scoreAiHumanHandoff(llm, {transcript});
    expect(dim.status).toBe('failed');
    expect(dim.score).toBe(0);
  });
});

describe('shared judge plumbing', () => {
  it('handles non-numeric score tags as error', async () => {
    const llm = mockLlm('something is wrong <score>NaN</score>');
    const dim = await scoreIntentRecognition(llm, {transcript, expectedIntent: 'x'});
    expect(dim.status).toBe('error');
    expect(dim.detail).toContain('non-numeric');
  });

  it('strips the <score> tag from the reasoning detail', async () => {
    const llm = mockLlm('Aligned well. <score>1</score> trailing-text-after');
    const dim = await scoreIntentRecognition(llm, {transcript, expectedIntent: 'book'});
    expect(dim.detail).not.toContain('<score>');
    expect(dim.detail).toContain('Aligned well');
  });
});

describe('scoreResponseConsistency', () => {
  it('passes when judge finds responses semantically aligned (5/5)', async () => {
    const llm = mockLlm('All three responses converge on the same booking. <score>5</score>');
    const dim = await scoreResponseConsistency(llm, {
      responses: ['Booked Tue 2pm.', 'Confirmed Tuesday at 14:00.', 'Reserved your slot Tuesday 2pm.'],
    });
    expect(dim.status).toBe('passed');
    expect(dim.score).toBe(1);
  });

  it('fails when judge flags drift (2/5)', async () => {
    const llm = mockLlm('Response 3 picked a different day. <score>2</score>');
    const dim = await scoreResponseConsistency(llm, {
      responses: ['Tue 2pm.', 'Tue 2pm.', 'Wed 3pm.'],
    });
    expect(dim.status).toBe('failed');
    expect(dim.score).toBe(0.25);
  });

  it('errors when only one response is supplied (need ≥2 to compare)', async () => {
    const llm = mockLlm('<score>5</score>');
    const dim = await scoreResponseConsistency(llm, {responses: ['single']});
    expect(dim.status).toBe('error');
    expect(dim.detail).toContain('at least 2');
    expect(llm).not.toHaveBeenCalled();
  });

  it('numbers responses in the user prompt', async () => {
    const llm = mockLlm('<score>5</score>');
    await scoreResponseConsistency(llm, {responses: ['a', 'b']});
    const [{user}] = llm.mock.calls[0] as Array<{system: string; user: string}>;
    expect(user).toContain('Response 1');
    expect(user).toContain('Response 2');
  });
});
