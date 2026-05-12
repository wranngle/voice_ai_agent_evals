import {describe, expect, it} from 'vitest';
import {
  CANONICAL_PERSONAS,
  buildPersonaSystemPrompt,
  getPersona,
  listPersonas,
} from '../../src/ingestion/persona-generator';

describe('CANONICAL_PERSONAS', () => {
  it('ships at least 5 personas with the required traits shape', () => {
    expect(CANONICAL_PERSONAS.length).toBeGreaterThanOrEqual(5);
    for (const persona of CANONICAL_PERSONAS) {
      expect(persona.id).toMatch(/^[\da-z-]+$/);
      expect(persona.name.length).toBeGreaterThan(0);
      expect(persona.traits.pace_wpm).toBeGreaterThan(0);
      expect(persona.traits.interruption_tendency).toBeGreaterThanOrEqual(0);
      expect(persona.traits.interruption_tendency).toBeLessThanOrEqual(1);
      expect(persona.traits.disfluency_rate).toBeGreaterThanOrEqual(0);
      expect(persona.traits.frustration_slope).toBeGreaterThanOrEqual(0);
      expect(persona.traits.frustration_slope).toBeLessThanOrEqual(1);
    }
  });

  it('persona slugs are unique', () => {
    const ids = CANONICAL_PERSONAS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getPersona / listPersonas', () => {
  it('returns the named persona by slug', () => {
    expect(getPersona('polite-elderly')?.name).toContain('elderly');
    expect(getPersona('frustrated-rusher')?.traits.interruption_tendency).toBeGreaterThan(0.4);
  });

  it('returns undefined for an unknown slug', () => {
    expect(getPersona('mystery-caller')).toBeUndefined();
  });

  it('listPersonas returns every canonical persona', () => {
    expect(listPersonas()).toEqual(CANONICAL_PERSONAS);
  });
});

describe('buildPersonaSystemPrompt', () => {
  it('embeds persona name, traits, and scenario intent in the prompt', () => {
    const persona = getPersona('frustrated-rusher')!;
    const prompt = buildPersonaSystemPrompt(persona, 'Schedule a callback before noon.');
    expect(prompt).toContain('Frustrated rusher');
    expect(prompt).toContain('pace ~180 wpm');
    expect(prompt).toContain('Schedule a callback before noon.');
    expect(prompt).toContain('Stay in character');
  });
});
