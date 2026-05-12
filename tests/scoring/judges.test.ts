import {
  describe, expect, it, vi,
} from 'vitest';
import {
  arenaJudge, evaluateDag, gEvalJudge, leaf, lynxJudge, regexBranch,
} from '../../src/scoring/judges';

describe('gEvalJudge', () => {
  it('parses <score>N</score> and normalizes 1-5 -> 0-1', async () => {
    const llm = vi.fn().mockResolvedValue('Reasoning here.\n<score>4</score>');
    const judge = gEvalJudge(llm);
    const result = await judge('rubric text', 'output text');
    expect(result.score).toBeCloseTo(0.75); // (4-1)/4 = 0.75
    expect(result.reasoning).toBe('Reasoning here.');
  });

  it('clips out-of-range scores to [1, 5] before normalizing', async () => {
    const llmHigh = vi.fn().mockResolvedValue('<score>9</score>');
    const high = await gEvalJudge(llmHigh)('r', 'o');
    expect(high.score).toBe(1);
    const llmLow = vi.fn().mockResolvedValue('<score>-2</score>');
    // -2 clipped to 1 -> (1-1)/4 = 0
    const low = await gEvalJudge(llmLow)('r', 'o');
    expect(low.score).toBe(0);
  });

  it('handles decimal scores', async () => {
    const llm = vi.fn().mockResolvedValue('<score>3.5</score>');
    const decimal = await gEvalJudge(llm)('r', 'o');
    expect(decimal.score).toBeCloseTo(0.625);
  });

  it('returns 0 when no <score> tag emitted', async () => {
    const llm = vi.fn().mockResolvedValue('I think it is good but I forgot the tag.');
    const result = await gEvalJudge(llm)('r', 'o');
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('did not emit <score> tag');
  });

  it('respects custom systemPrompt', async () => {
    const llm = vi.fn().mockResolvedValue('<score>3</score>');
    await gEvalJudge(llm, {systemPrompt: 'CUSTOM SYSTEM'})('r', 'o');
    expect(llm).toHaveBeenCalledWith(expect.objectContaining({system: 'CUSTOM SYSTEM'}));
  });
});

describe('arenaJudge', () => {
  it('returns "current" when verdict B (no swap)', async () => {
    const llm = vi.fn().mockResolvedValue('B looks more thorough.\n<verdict>B</verdict>');
    const judge = arenaJudge(llm, {randomizePosition: false});
    const result = await judge('rubric', 'baseline text', 'current text');
    expect(result.winner).toBe('current');
    expect(result.reasoning).toContain('thorough');
  });

  it('returns "baseline" when verdict A', async () => {
    const llm = vi.fn().mockResolvedValue('<verdict>A</verdict>');
    const result = await arenaJudge(llm, {randomizePosition: false})('r', 'b', 'c');
    expect(result.winner).toBe('baseline');
  });

  it('returns "tie" when verdict tie', async () => {
    const llm = vi.fn().mockResolvedValue('<verdict>tie</verdict>');
    const tie = await arenaJudge(llm, {randomizePosition: false})('r', 'b', 'c');
    expect(tie.winner).toBe('tie');
  });

  it('un-swaps the verdict when position randomization is on and rng < 0.5', async () => {
    // With rng=0, swap is true: outputA = current, outputB = baseline.
    // LLM says <verdict>A</verdict> -> "outputA wins" -> current wins after un-swap.
    const llm = vi.fn().mockResolvedValue('<verdict>A</verdict>');
    const result = await arenaJudge(llm, {rng: () => 0})('r', 'baseline', 'current');
    expect(result.winner).toBe('current');
  });

  it('un-swaps to baseline when verdict B with swap', async () => {
    // With rng=0, swap: A=current, B=baseline. <verdict>B</verdict> -> baseline wins.
    const llm = vi.fn().mockResolvedValue('<verdict>B</verdict>');
    const result = await arenaJudge(llm, {rng: () => 0})('r', 'baseline', 'current');
    expect(result.winner).toBe('baseline');
  });

  it('falls back to tie when no verdict tag', async () => {
    const llm = vi.fn().mockResolvedValue('I am unable to decide.');
    const fallback = await arenaJudge(llm, {randomizePosition: false})('r', 'b', 'c');
    expect(fallback.winner).toBe('tie');
  });
});

describe('lynxJudge', () => {
  it('returns score 1 when LLM says FAITHFUL', async () => {
    const llm = vi.fn().mockResolvedValue('Reasoning here.\n<verdict>FAITHFUL</verdict>');
    const result = await lynxJudge(llm)('Context says X.', 'Output says X.');
    expect(result.score).toBe(1);
    expect(result.reasoning).toBe('Reasoning here.');
  });

  it('returns score 0 when LLM says HALLUCINATED', async () => {
    const llm = vi.fn().mockResolvedValue('<verdict>HALLUCINATED</verdict>');
    const hallucinated = await lynxJudge(llm)('ctx', 'out');
    expect(hallucinated.score).toBe(0);
  });

  it('returns 0 when no verdict tag', async () => {
    const llm = vi.fn().mockResolvedValue('unsure');
    const result = await lynxJudge(llm)('ctx', 'out');
    expect(result.score).toBe(0);
    expect(result.reasoning).toContain('did not emit <verdict>');
  });
});

describe('evaluateDag', () => {
  it('traverses a single-leaf tree', async () => {
    const tree = leaf('only-leaf', 0.85, 'flat win');
    const result = await evaluateDag(tree, 'any');
    expect(result.score).toBe(0.85);
    expect(result.path).toEqual(['only-leaf']);
    expect(result.reasoning).toBe('flat win');
  });

  it('descends via decision node based on pick()', async () => {
    const tree = regexBranch(
      'has-greeting',
      /^(hi|hello)/i,
      leaf('greet-pass', 1, 'greeted'),
      leaf('greet-fail', 0, 'no greeting'),
    );
    const yes = await evaluateDag(tree, 'Hello there');
    expect(yes.score).toBe(1);
    expect(yes.path).toEqual(['has-greeting', 'greet-pass']);

    const no = await evaluateDag(tree, 'What do you want?');
    expect(no.score).toBe(0);
    expect(no.path).toEqual(['has-greeting', 'greet-fail']);
  });

  it('returns score 0 + diagnostic when pick returns invalid index', async () => {
    const tree = {
      type: 'decision' as const,
      name: 'bad-pick',
      children: [leaf('a', 1, 'a'), leaf('b', 0, 'b')],
      async pick() {
        return 99;
      },
    };
    const result = await evaluateDag(tree, 'x');
    expect(result.score).toBe(0);
    expect(result.path).toEqual(['bad-pick']);
    expect(result.reasoning).toContain('invalid child');
  });

  it('supports deep nesting', async () => {
    const tree = regexBranch(
      'is-question',
      /\?$/,
      regexBranch(
        'is-greeting-question',
        /^(hi|hello)/i,
        leaf('greet-question', 1, 'asked greeting question'),
        leaf('non-greet-question', 0.5, 'asked non-greeting question'),
      ),
      leaf('statement', 0.2, 'not a question'),
    );
    const result = await evaluateDag(tree, 'Hello, can you help?');
    expect(result.score).toBe(1);
    expect(result.path).toEqual(['is-question', 'is-greeting-question', 'greet-question']);
  });
});
