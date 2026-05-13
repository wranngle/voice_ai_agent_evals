/**
 * Meta-audit — addresses S5 (no adversarial fuzz) + S6 (magic numbers).
 *
 * The FAILURE_PATTERNS regex tests in `tests/remediation/patterns.test.ts`
 * cover the happy paths. This file documents the unhappy ones — the false
 * positives and false negatives that ship today.
 *
 * `it.fails` is used where the current behavior is broken-by-design and
 * we want the failure recorded for future fixes. PASS == the bug is
 * still present.
 */

import {describe, expect, it} from 'vitest';
import {detectPatterns} from '../../src/remediation/patterns';

describe('META-AUDIT: SMS_AFTER_DECLINE false positives', () => {
  it.fails('flags "no, but please text me" — should NOT fire SMS_AFTER_DECLINE (user agreed)', () => {
    const ids = detectPatterns({
      turns: [
        {role: 'user', message: 'no, but please text me anyway'},
        {role: 'agent', message: 'sending now.', toolCalls: [{name: 'send_sms'}]},
      ],
    }).map(d => d.pattern);
    expect(ids).not.toContain('SMS_AFTER_DECLINE');
  });

  it.fails('"I can\'t" is semantic decline but DECLINE_RE misses it', () => {
    const ids = detectPatterns({
      turns: [
        {role: 'user', message: 'I can\'t take SMS'},
        {role: 'agent', message: 'sending.', toolCalls: [{name: 'send_sms'}]},
      ],
    }).map(d => d.pattern);
    expect(ids).toContain('SMS_AFTER_DECLINE');
  });

  it('the same phrase "no problem" — should NOT fire as a decline (positive context)', () => {
    const ids = detectPatterns({
      turns: [
        {role: 'user', message: 'no problem, please text me'},
        {role: 'agent', message: 'sending.', toolCalls: [{name: 'send_sms'}]},
      ],
    }).map(d => d.pattern);
    // This DOES fire (false positive). Asserting it fires to document the bug.
    expect(ids).toContain('SMS_AFTER_DECLINE');
  });
});

describe('META-AUDIT: HOSTILE_RESPONSE false positives', () => {
  it('agent quoting the caller verbatim ("you said it was stupid") fires HOSTILE_RESPONSE', () => {
    const ids = detectPatterns({
      turns: [
        {role: 'user', message: 'this is stupid'},
        {role: 'agent', message: 'I hear you say it feels stupid. Let me help.'},
      ],
    }).map(d => d.pattern);
    // The agent is being empathetic, but HOSTILE_RE doesn't care.
    expect(ids).toContain('HOSTILE_RESPONSE');
  });

  it.fails('actually hostile agent ("you\'re wrong, this is annoying") SHOULD fire — and does, but…', () => {
    // The pattern fires. But proves nothing about the ACTUAL hostility of the agent —
    // because the empathy case above ALSO fires. Signal-to-noise is the bug.
    const ids = detectPatterns({
      turns: [{role: 'agent', message: 'you\'re wrong, this is annoying'}],
    }).map(d => d.pattern);
    // INTENT: this test should isolate to genuinely hostile. CURRENT: it fires on benign too.
    // We assert that the detector would FAIL to distinguish — i.e. specificity is unproven.
    expect(ids).toEqual([]); // <-- intentionally wrong; reality fires HOSTILE_RESPONSE
  });
});

describe('META-AUDIT: INCONSISTENT_BEHAVIOR threshold is a magic number', () => {
  it('CV exactly 0.4 — boundary case behavior is undocumented', () => {
    // Construct a history with CV ≈ 0.4 (just under and just over). The detect threshold
    // is `cv > 0.4`. Anything exactly at 0.4 returns false. Anything slightly over returns
    // true. No spec, no tuning study, no rationale beyond "feels right".
    const justUnder = [10, 7, 13, 10]; // mean 10, stddev 2.12, cv 0.212 — well under
    const justOver = [10, 2, 18, 2]; // mean 8, stddev 6.93, cv 0.866 — well over
    expect(detectPatterns({iterationHistory: justUnder}).map(d => d.pattern))
      .not.toContain('INCONSISTENT_BEHAVIOR');
    expect(detectPatterns({iterationHistory: justOver}).map(d => d.pattern))
      .toContain('INCONSISTENT_BEHAVIOR');
    // The bug here isn't the math — it's that 0.4 has no provenance in the codebase.
    // No test asserts WHY 0.4 is the right cutoff.
  });
});
