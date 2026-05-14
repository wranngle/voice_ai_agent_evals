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
  it('lowercase [dev] is NOT recognized as a phase, but now warns', () => {
    const parsed = parseAgentName('[dev] Sarah');
    expect(parsed.phase).toBeUndefined();
    expect(parsed.baseName).toBe('[dev] Sarah'); // whole string treated as name
    expect(parsed.warning).toContain('non-canonical phase');
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

  it('NON-canonical phase like [STAGING] surfaces a warning (post-fix)', () => {
    const parsed = parseAgentName('[STAGING] Sarah');
    expect(parsed.phase).toBeUndefined();
    expect(parsed.warning).toContain('non-canonical phase');
    expect(parsed.warning).toContain('STAGING');
  });

  it('canonical phase has no warning', () => {
    const parsed = parseAgentName('[DEV] Sarah');
    expect(parsed.phase).toBe('DEV');
    expect(parsed.warning).toBeUndefined();
  });
});
