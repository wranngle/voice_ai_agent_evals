/**
 * Meta-audit — addresses S5 (no adversarial fuzz) + S6 (magic numbers).
 *
 * After the v1.1 audit-loop fix, the SMS_AFTER_DECLINE and HOSTILE_RESPONSE
 * patterns are context-aware:
 *   - "no problem", "no, but please send it" no longer fire DECLINE.
 *   - "I can't take SMS" now fires DECLINE (was missed).
 *   - Agent quoting the caller via "you said" / "I hear you" is no longer
 *     flagged HOSTILE.
 *
 * The INCONSISTENT_BEHAVIOR magic-number test is kept as documentation: the
 * CV > 0.4 threshold has no provenance in the codebase. A real tuning study
 * would either lock the number with a justification comment or replace it
 * with a percentile cutoff.
 */

import {describe, expect, it} from 'vitest';
import {detectPatterns} from '../../src/remediation/patterns';

describe('META-AUDIT: SMS_AFTER_DECLINE specificity (post-fix)', () => {
  it('"no, but please text me anyway" — positive-followup negation does NOT fire', () => {
    const ids = detectPatterns({
      turns: [
        {role: 'user', message: 'no, but please text me anyway'},
        {role: 'agent', message: 'sending now.', toolCalls: [{name: 'send_sms'}]},
      ],
    }).map(d => d.pattern);
    expect(ids).not.toContain('SMS_AFTER_DECLINE');
  });

  it('"I can\'t take SMS" is caught (semantic decline)', () => {
    const ids = detectPatterns({
      turns: [
        {role: 'user', message: "I can't take SMS"},
        {role: 'agent', message: 'sending.', toolCalls: [{name: 'send_sms'}]},
      ],
    }).map(d => d.pattern);
    expect(ids).toContain('SMS_AFTER_DECLINE');
  });

  it('"no problem, please text me" does NOT fire (friendly idiom)', () => {
    const ids = detectPatterns({
      turns: [
        {role: 'user', message: 'no problem, please text me'},
        {role: 'agent', message: 'sending.', toolCalls: [{name: 'send_sms'}]},
      ],
    }).map(d => d.pattern);
    expect(ids).not.toContain('SMS_AFTER_DECLINE');
  });

  it('genuine decline still fires (regression guard)', () => {
    const ids = detectPatterns({
      turns: [
        {role: 'user', message: "No, don't text me. I do not want SMS."},
        {role: 'agent', message: 'sending now.', toolCalls: [{name: 'send_sms'}]},
      ],
    }).map(d => d.pattern);
    expect(ids).toContain('SMS_AFTER_DECLINE');
  });
});

describe('META-AUDIT: HOSTILE_RESPONSE specificity (post-fix)', () => {
  it('agent paraphrasing the caller ("I hear you say it feels stupid") does NOT fire', () => {
    const ids = detectPatterns({
      turns: [
        {role: 'user', message: 'this is stupid'},
        {role: 'agent', message: 'I hear you say it feels stupid. Let me help.'},
      ],
    }).map(d => d.pattern);
    expect(ids).not.toContain('HOSTILE_RESPONSE');
  });

  it('genuinely hostile agent still fires (regression guard)', () => {
    const ids = detectPatterns({
      turns: [{role: 'agent', message: "you're wrong, this is annoying"}],
    }).map(d => d.pattern);
    expect(ids).toContain('HOSTILE_RESPONSE');
  });

  it('defensive phrasing ("like I said") fires', () => {
    const ids = detectPatterns({
      turns: [{role: 'agent', message: 'Like I said, please confirm.'}],
    }).map(d => d.pattern);
    expect(ids).toContain('HOSTILE_RESPONSE');
  });
});

describe('META-AUDIT: INCONSISTENT_BEHAVIOR threshold is a magic number', () => {
  it('CV > 0.4 fires; CV well under does not — but 0.4 itself has no justification', () => {
    const justUnder = [10, 7, 13, 10]; // CV ~0.21
    const justOver = [10, 2, 18, 2]; // CV ~0.87
    expect(detectPatterns({iterationHistory: justUnder}).map(d => d.pattern))
      .not.toContain('INCONSISTENT_BEHAVIOR');
    expect(detectPatterns({iterationHistory: justOver}).map(d => d.pattern))
      .toContain('INCONSISTENT_BEHAVIOR');
    // S6 — the 0.4 cutoff in src/remediation/patterns.ts has no tuning study.
    // A future commit should either justify it inline (with sample data) or
    // replace it with an adaptive percentile threshold.
  });
});
