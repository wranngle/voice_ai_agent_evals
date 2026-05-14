import {describe, expect, it} from 'vitest';
import {adversarialPresets, getAdversarialPreset} from '@wranngle/voice-evals/scenarios';

describe('adversarial preset catalogue: shape contract', () => {
  it('exposes at least four presets', () => {
    expect(adversarialPresets.length).toBeGreaterThanOrEqual(4);
  });

  it('covers the four canonical failure modes by id', () => {
    const ids = adversarialPresets.map((p: {id: string}) => p.id).sort();
    expect(ids).toEqual(['accent', 'interrupt', 'mumble', 'noise']);
  });

  it('every preset has a non-empty audioOverlay descriptor', () => {
    for (const preset of adversarialPresets) {
      expect(preset.audioOverlay).toBeDefined();
      expect(preset.audioOverlay.kind).toBeTruthy();
      expect(Object.keys(preset.audioOverlay).length).toBeGreaterThan(1);
    }
  });

  it('every preset has a non-empty assertions array with axis/expected/weight', () => {
    for (const preset of adversarialPresets) {
      expect(Array.isArray(preset.assertions)).toBe(true);
      expect(preset.assertions.length).toBeGreaterThan(0);
      for (const assertion of preset.assertions) {
        expect(assertion.axis).toBeTruthy();
        expect(assertion.expected).toBeDefined();
        expect(typeof assertion.weight).toBe('number');
      }
    }
  });

  it('preset ids are unique', () => {
    const ids = adversarialPresets.map((p: {id: string}) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getAdversarialPreset round-trips by id', () => {
    for (const preset of adversarialPresets) {
      expect(getAdversarialPreset(preset.id)).toBe(preset);
    }
  });

  it('getAdversarialPreset throws on unknown id', () => {
    expect(() => getAdversarialPreset('does-not-exist' as never)).toThrow(/unknown adversarial preset/);
  });
});

describe('adversarial preset catalogue: snapshot', () => {
  it('matches the committed shape', () => {
    expect(adversarialPresets).toMatchSnapshot();
  });
});
