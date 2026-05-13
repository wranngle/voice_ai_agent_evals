/**
 * Meta-audit — addresses S5 (no adversarial fuzz on governance).
 *
 * PHASE_PATTERN = /^\[(DEV|ALPHA|BETA|PROD|ARCHIVED)]\s+/
 *
 * The happy-path tests (15 of them in tests/wrapper/governance.test.ts) cover:
 *   - "[DEV] Sarah" -> phase DEV, name "Sarah" ✓
 *   - "Untagged" -> phase undefined ✓
 *
 * This file covers what the happy path ignores:
 *   - emoji in the name
 *   - mixed case [dev]
 *   - two phase tags
 *   - phase tag mid-string
 *   - phase tag with no trailing space
 *   - phase tag with extra brackets
 *
 * For each case, we assert the CURRENT behavior — bug or not — and document
 * which results would surprise a careful operator.
 */

import {describe, expect, it} from 'vitest';
import {parseAgentName} from '../../src/wrapper/governance';

describe('META-AUDIT: governance edge cases', () => {
  it('lowercase [dev] is NOT recognized as a phase', () => {
    // Reasonable behavior given the case-sensitive enum, but operators
    // who paste from chat with lowercase tags will be surprised.
    const parsed = parseAgentName('[dev] Sarah');
    expect(parsed.phase).toBeUndefined();
    expect(parsed.baseName).toBe('[dev] Sarah'); // whole string treated as name
  });

  it('phase tag without trailing space is NOT recognized', () => {
    const parsed = parseAgentName('[DEV]Sarah');
    expect(parsed.phase).toBeUndefined();
  });

  it('phase tag mid-string is ignored', () => {
    const parsed = parseAgentName('Sarah [DEV] – HVAC Lead');
    expect(parsed.phase).toBeUndefined();
    expect(parsed.baseName).toBe('Sarah [DEV] – HVAC Lead');
  });

  it('two phase tags: only the first is parsed; the second leaks into the displayName', () => {
    const parsed = parseAgentName('[DEV] [ALPHA] Sarah');
    expect(parsed.phase).toBe('DEV');
    expect(parsed.baseName).toBe('[ALPHA] Sarah'); // ALPHA leaks into displayName
  });

  it('emoji in display name passes through unmodified', () => {
    const parsed = parseAgentName('[DEV] 🚀 Sarah');
    expect(parsed.phase).toBe('DEV');
    expect(parsed.baseName).toBe('🚀 Sarah');
  });

  it('empty string returns undefined phase + empty displayName', () => {
    const parsed = parseAgentName('');
    expect(parsed.phase).toBeUndefined();
    expect(parsed.baseName).toBe('');
  });

  it('bare brackets [] is not a phase', () => {
    const parsed = parseAgentName('[] Sarah');
    expect(parsed.phase).toBeUndefined();
  });

  it.fails('NON-canonical phase like [STAGING] should be flagged as a naming violation, not silently passed through', () => {
    // CURRENT behavior: [STAGING] is treated as part of the name. No flag, no warning.
    // INTENDED: a phase-shaped prefix that is NOT in the canonical set should at least
    // surface a warning. The wrapper has no such API today.
    const parsed = parseAgentName('[STAGING] Sarah');
    expect((parsed as Record<string, unknown>).warning).toContain('non-canonical phase');
  });
});
