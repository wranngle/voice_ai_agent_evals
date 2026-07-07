/**
 * Regression: voice_marker_leakage must be model-aware.
 *
 * The mode flags inline cue strings ([chuckles], *sigh*) as "spoken verbatim".
 * Per the catalog (config_field conversation_config.tts.model_id) that defect is
 * specific to v2 TTS — on a v3 model (eleven_v3*) the cues are PERFORMED, so the
 * flag is a false positive. Discovered live against the Cartographer agent
 * (eleven_v3_conversational), which legitimately uses [chuckles]/[warmly] tags.
 */

import {describe, expect, it} from 'vitest';
import {detectFailures, loadCatalog} from '../../src/refinement/failure-detector';

const catalog = loadCatalog();
const call = {
  persona_id: 'test',
  persona_name: 'Test Persona',
  turns: [
    {role: 'agent' as const, text: '[chuckles] Sure — let me grab that for you.'},
    {role: 'caller' as const, text: 'Thanks.'},
  ],
};

const vmCount = (modelId?: string) =>
  detectFailures([call], catalog, ['voice_marker_leakage'], modelId)
    .filter(f => f.mode_id === 'voice_marker_leakage').length;

describe('voice_marker_leakage is model-aware', () => {
  it('flags v3 cue tags on a v2 TTS model (real defect)', () => {
    expect(vmCount('eleven_flash_v2')).toBeGreaterThan(0);
  });

  it('suppresses the flag on a v3 model (cues are performed, not spoken)', () => {
    expect(vmCount('eleven_v3_conversational')).toBe(0);
  });

  it('preserves legacy behavior when no model id is supplied', () => {
    expect(vmCount(undefined)).toBeGreaterThan(0);
  });
});
