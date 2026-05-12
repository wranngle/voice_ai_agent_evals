import {describe, expect, it} from 'vitest';
import {
  GovernanceError,
  assertModelAllowed,
  enforceMutation,
  isPhase,
  parseAgentName,
} from '../../src/wrapper/governance';
import type {ModelRankings} from '../../src/wrapper/types';

describe('parseAgentName', () => {
  it('parses [DEV] prefix and base name', () => {
    const parsed = parseAgentName('[DEV] Sarah - Wranngle Lead Specialist');
    expect(parsed).toEqual({
      phase: 'DEV',
      baseName: 'Sarah - Wranngle Lead Specialist',
      raw: '[DEV] Sarah - Wranngle Lead Specialist',
      isTagged: true,
    });
  });

  it.each(['ALPHA', 'BETA', 'PROD', 'ARCHIVED'] as const)(
    'parses [%s] prefix',
    phase => {
      const parsed = parseAgentName(`[${phase}] Agent`);
      expect(parsed.phase).toBe(phase);
      expect(parsed.baseName).toBe('Agent');
      expect(parsed.isTagged).toBe(true);
    },
  );

  it('treats unprefixed names as untagged', () => {
    const parsed = parseAgentName('Sarah v2');
    expect(parsed.phase).toBeUndefined();
    expect(parsed.isTagged).toBe(false);
    expect(parsed.baseName).toBe('Sarah v2');
  });

  it('rejects malformed prefixes (no space after bracket)', () => {
    const parsed = parseAgentName('[DEV]Sarah');
    expect(parsed.isTagged).toBe(false);
  });

  it('rejects unknown phase tokens', () => {
    const parsed = parseAgentName('[STAGING] Sarah');
    expect(parsed.isTagged).toBe(false);
  });
});

describe('enforceMutation', () => {
  it('allows [DEV] mutation by default', () => {
    expect(() => enforceMutation('[DEV] Sarah')).not.toThrow();
  });

  it.each(['ALPHA', 'BETA', 'PROD', 'ARCHIVED'] as const)(
    'rejects [%s] mutation by default',
    phase => {
      const error = catchSync(() => enforceMutation(`[${phase}] Agent`));
      expect(error).toBeInstanceOf(GovernanceError);
      expect((error as GovernanceError).code).toBe('phase_not_allowed');
    },
  );

  it('rejects untagged names by default', () => {
    const error = catchSync(() => enforceMutation('Sarah v2'));
    expect(error).toBeInstanceOf(GovernanceError);
    expect((error as GovernanceError).code).toBe('untagged');
    expect(error?.message).toContain('[DEV] Sarah v2');
  });

  it('allows non-DEV mutation with explicit allowedPhases', () => {
    expect(() => enforceMutation('[BETA] Sarah', {allowedPhases: ['BETA']})).not.toThrow();
  });

  it('allows untagged with explicit allowUntagged=true', () => {
    expect(() => enforceMutation('Sarah v2', {allowUntagged: true})).not.toThrow();
  });

  it('surfaces the caller reason in rejection messages', () => {
    const error = catchSync(() =>
      enforceMutation('[PROD] Sarah', {reason: 'user did not say yes'}));
    expect(error?.message).toContain('user did not say yes');
  });
});

describe('assertModelAllowed', () => {
  const rankings: ModelRankings = {
    default: 'gemini-3-flash-preview',
    recommended: ['gemini-3-flash-preview', 'claude-haiku-4-5'],
    banned: ['gpt-4o-mini', 'gpt-5-mini', 'gemini-2.0-flash-001'],
  };

  it('passes for default model', () => {
    expect(() => {
      assertModelAllowed('gemini-3-flash-preview', rankings);
    }).not.toThrow();
  });

  it('passes for any recommended model', () => {
    expect(() => {
      assertModelAllowed('claude-haiku-4-5', rankings);
    }).not.toThrow();
  });

  it('passes for an unranked but not-banned model (caller responsibility)', () => {
    expect(() => {
      assertModelAllowed('some-future-model-id', rankings);
    }).not.toThrow();
  });

  it.each(['gpt-4o-mini', 'gpt-5-mini', 'gemini-2.0-flash-001'])(
    'rejects banned model %s',
    model => {
      const error = catchSync(() => {
        assertModelAllowed(model, rankings);
      });
      expect(error).toBeInstanceOf(GovernanceError);
      expect((error as GovernanceError).code).toBe('banned_model');
      expect(error?.message).toContain(model);
      expect(error?.message).toContain('gemini-3-flash-preview'); // default cited
    },
  );
});

describe('isPhase', () => {
  it('returns true for valid phases', () => {
    for (const phase of ['DEV', 'ALPHA', 'BETA', 'PROD', 'ARCHIVED']) {
      expect(isPhase(phase)).toBe(true);
    }
  });

  it('returns false for invalid tokens', () => {
    expect(isPhase('STAGING')).toBe(false);
    expect(isPhase('dev')).toBe(false); // case-sensitive
    expect(isPhase('')).toBe(false);
  });
});

function catchSync(fn: () => unknown): Error | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error as Error;
  }
}
