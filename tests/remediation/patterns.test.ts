import {describe, expect, it} from 'vitest';
import {
  detectPatterns, diagnoseFromFailure, FAILURE_PATTERNS, getPattern,
  type DetectionInput, type TranscriptTurn,
} from '../../src/remediation/patterns';

function turn(role: TranscriptTurn['role'], message: string, toolCalls: Array<{name: string}> = []): TranscriptTurn {
  return {role, message, toolCalls};
}

describe('FAILURE_PATTERNS registry', () => {
  it('exposes exactly the 5 canonical patterns', () => {
    const ids = FAILURE_PATTERNS.map(p => p.id).sort();
    expect(ids).toEqual([
      'CONTEXT_LOST',
      'HOSTILE_RESPONSE',
      'INCONSISTENT_BEHAVIOR',
      'SMS_AFTER_DECLINE',
      'TOOL_NOT_CALLED',
    ]);
  });

  it('getPattern returns the matching pattern by id', () => {
    const p = getPattern('SMS_AFTER_DECLINE');
    expect(p?.id).toBe('SMS_AFTER_DECLINE');
    expect(p?.fixTarget).toBe('system_prompt');
    expect(p?.promptAddition).toContain('SMS CONSENT');
  });

  it('getPattern returns undefined for unknown id', () => {
    // @ts-expect-error -- intentional bad id
    expect(getPattern('NOT_A_PATTERN')).toBeUndefined();
  });
});

describe('SMS_AFTER_DECLINE detection', () => {
  it('fires when send_sms was called after user said "no"', () => {
    const input: DetectionInput = {
      turns: [
        turn('user', 'Hi, can you help me with a quote?'),
        turn('agent', 'Of course! Want me to text you a demo link?'),
        turn('user', 'No, please do not text me.'),
        turn('agent', 'OK, sending now.', [{name: 'send_sms'}]),
      ],
    };
    const detected = detectPatterns(input);
    const ids = detected.map(d => d.pattern);
    expect(ids).toContain('SMS_AFTER_DECLINE');
  });

  it('does not fire when send_sms was called WITHOUT a decline', () => {
    const input: DetectionInput = {
      turns: [
        turn('user', 'Yes please text me.'),
        turn('agent', 'On it.', [{name: 'send_sms'}]),
      ],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).not.toContain('SMS_AFTER_DECLINE');
  });

  it('does not fire when caller declined but agent did NOT call send_sms', () => {
    const input: DetectionInput = {
      turns: [
        turn('user', 'No SMS please.'),
        turn('agent', 'Understood, I will not text you.'),
      ],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).not.toContain('SMS_AFTER_DECLINE');
  });

  it('supports flat toolCalls + transcript fallback (no structured turns)', () => {
    const input: DetectionInput = {
      transcript: 'User: stop texting me. Agent: ok.',
      toolCalls: [{name: 'send_sms'}],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).toContain('SMS_AFTER_DECLINE');
  });
});

describe('TOOL_NOT_CALLED detection', () => {
  it('fires when an expected tool is absent', () => {
    const input: DetectionInput = {
      expectedTools: ['process_lead', 'send_sms'],
      toolCalls: [{name: 'process_lead'}],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).toContain('TOOL_NOT_CALLED');
  });

  it('does not fire when all expected tools were called', () => {
    const input: DetectionInput = {
      expectedTools: ['process_lead'],
      toolCalls: [{name: 'process_lead'}, {name: 'send_sms'}],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).not.toContain('TOOL_NOT_CALLED');
  });

  it('does not fire when expectedTools is empty', () => {
    const ids = detectPatterns({expectedTools: [], toolCalls: []}).map(d => d.pattern);
    expect(ids).not.toContain('TOOL_NOT_CALLED');
  });

  it('emits evidence listing the missing tool', () => {
    const detected = detectPatterns({
      expectedTools: ['process_lead', 'send_sms'],
      toolCalls: [{name: 'process_lead'}],
    });
    const match = detected.find(d => d.pattern === 'TOOL_NOT_CALLED');
    expect(match?.evidence).toContain('send_sms');
  });
});

describe('CONTEXT_LOST detection', () => {
  it('fires when the agent re-asks for the caller name', () => {
    const input: DetectionInput = {
      turns: [
        turn('user', 'Hi, I am Cody.'),
        turn('agent', 'Hi Cody.'),
        turn('user', 'I need a quote.'),
        turn('agent', 'Sure, what is your name again?'),
      ],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).toContain('CONTEXT_LOST');
  });

  it('does not fire on benign agent text', () => {
    const input: DetectionInput = {
      turns: [
        turn('agent', 'Thanks, I have your details. How can I help?'),
      ],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).not.toContain('CONTEXT_LOST');
  });
});

describe('HOSTILE_RESPONSE detection', () => {
  it('fires on overtly negative agent vocabulary', () => {
    const input: DetectionInput = {
      turns: [turn('agent', 'That is a ridiculous question.')],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).toContain('HOSTILE_RESPONSE');
  });

  it('fires on defensive phrasing', () => {
    const input: DetectionInput = {
      turns: [turn('agent', 'Like I said, you need to provide your address first.')],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).toContain('HOSTILE_RESPONSE');
  });

  it('does not fire on neutral agent text', () => {
    const input: DetectionInput = {
      turns: [turn('agent', 'Could you share your address so I can look up service in your area?')],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).not.toContain('HOSTILE_RESPONSE');
  });
});

describe('INCONSISTENT_BEHAVIOR detection', () => {
  it('fires when failingAfter has high coefficient-of-variation', () => {
    const input: DetectionInput = {
      iterationHistory: [10, 2, 9, 3],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).toContain('INCONSISTENT_BEHAVIOR');
  });

  it('does not fire on a stable trajectory', () => {
    const input: DetectionInput = {
      iterationHistory: [5, 5, 5, 4],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).not.toContain('INCONSISTENT_BEHAVIOR');
  });

  it('does not fire with fewer than 3 iterations', () => {
    const input: DetectionInput = {iterationHistory: [10, 0]};
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).not.toContain('INCONSISTENT_BEHAVIOR');
  });

  it('does not fire when mean is zero', () => {
    const input: DetectionInput = {iterationHistory: [0, 0, 0]};
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).not.toContain('INCONSISTENT_BEHAVIOR');
  });
});

describe('diagnoseFromFailure (companion API for aggregated input)', () => {
  it('fires TOOL_NOT_CALLED when missingTools is non-empty', () => {
    const out = diagnoseFromFailure({missingTools: ['send_sms', 'process_lead']});
    expect(out.map(d => d.pattern)).toContain('TOOL_NOT_CALLED');
    expect(out[0].evidence).toContain('send_sms');
  });

  it('fires CONTEXT_LOST when analysis mentions repeat/context', () => {
    const out = diagnoseFromFailure({analysis: 'Agent had to repeat the question about caller name.'});
    expect(out.map(d => d.pattern)).toContain('CONTEXT_LOST');
  });

  it('fires HOSTILE_RESPONSE when analysis mentions rude/frustrated', () => {
    const out = diagnoseFromFailure({analysis: 'Agent was rude and dismissive.'});
    expect(out.map(d => d.pattern)).toContain('HOSTILE_RESPONSE');
  });

  it('fires INCONSISTENT_BEHAVIOR when turnCount > 20', () => {
    const out = diagnoseFromFailure({turnCount: 25});
    expect(out.map(d => d.pattern)).toContain('INCONSISTENT_BEHAVIOR');
  });

  it('returns [] on empty input', () => {
    expect(diagnoseFromFailure({})).toEqual([]);
  });

  it('does NOT infer SMS_AFTER_DECLINE without transcripts', () => {
    const out = diagnoseFromFailure({analysis: 'caller said no but agent texted'});
    expect(out.map(d => d.pattern)).not.toContain('SMS_AFTER_DECLINE');
  });
});

describe('detectPatterns ensemble', () => {
  it('returns multiple matches when independent patterns both fire', () => {
    const input: DetectionInput = {
      turns: [
        turn('user', 'no, do not text me'),
        turn('agent', 'sending text.', [{name: 'send_sms'}]),
        turn('agent', 'like I said, please confirm.'),
      ],
    };
    const ids = detectPatterns(input).map(d => d.pattern);
    expect(ids).toContain('SMS_AFTER_DECLINE');
    expect(ids).toContain('HOSTILE_RESPONSE');
  });

  it('returns empty when no patterns match', () => {
    const detected = detectPatterns({
      turns: [turn('user', 'hello'), turn('agent', 'how can I help?')],
    });
    expect(detected).toEqual([]);
  });
});
