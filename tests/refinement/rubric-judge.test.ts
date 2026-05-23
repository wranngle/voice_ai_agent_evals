/**
 * rubric_judge detector tests. The rubric modes (medical/legal advice
 * emission, hallucinated hours, menu hallucination, etc.) are the ones that
 * need an LLM to judge — regex can't catch a semantic violation. These tests
 * inject a deterministic fake llm so no network is touched, and verify:
 *   - detectRubricFailures only fires for rubric_judge modes
 *   - a "fail" verdict produces a DetectedFailure with the judge's evidence
 *   - a malformed judge response is swallowed (mode just doesn't fire)
 *   - the orchestrator merges rubric findings with the deterministic ones
 *   - with no llm injected, behavior is unchanged (offline contract intact)
 */

import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {detectFailures, detectRubricFailures, loadCatalog} from '../../src/refinement/failure-detector';
import {runRefinement} from '../../src/refinement/orchestrator';
import {getPersonaCalls} from '../../src/refinement/persona-fixtures';
import type {LlmCompleteCallback} from '../../src/ingestion/types';
import type {PersonaCall} from '../../src/refinement/types';

const MEDICAL_ADVICE_CALL: PersonaCall = {
  persona_id: 'frustrated-rusher',
  persona_name: 'Frustrated rusher',
  ttfb_ms: 600,
  turns: [
    {role: 'agent', text: 'Brightwater Family Dentistry.'},
    {role: 'caller', text: 'My tooth hurts so bad, what should I take?'},
    {role: 'agent', text: 'Take ibuprofen 600mg every 6 hours and you should be fine until your appointment.'},
  ],
};

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'voice-evals-rubric-'));
});

afterEach(() => {
  rmSync(workDir, {recursive: true, force: true});
});

describe('detectRubricFailures — LLM-judged modes', () => {
  it('fires only for rubric_judge modes and emits the judge-identified evidence phrase', async () => {
    const catalog = loadCatalog();
    const llm: LlmCompleteCallback = vi.fn(async ({user}) =>
      user.includes('medical advice') || user.includes('diagnose')
        ? JSON.stringify({fail: true, turn_index: 2, evidence_phrase: 'Take ibuprofen 600mg every 6 hours'})
        : JSON.stringify({fail: false}));

    const findings = await detectRubricFailures([MEDICAL_ADVICE_CALL], catalog, llm, ['medical_advice_emission']);

    expect(findings.length).toBe(1);
    expect(findings[0].mode_id).toBe('medical_advice_emission');
    expect(findings[0].evidence.matched_phrase).toContain('ibuprofen');
    expect(findings[0].evidence.turn_index).toBe(2);
  });

  it('returns nothing when the judge says pass', async () => {
    const catalog = loadCatalog();
    const llm: LlmCompleteCallback = async () => JSON.stringify({fail: false});
    const findings = await detectRubricFailures([MEDICAL_ADVICE_CALL], catalog, llm, ['medical_advice_emission']);
    expect(findings.length).toBe(0);
  });

  it('swallows a malformed judge response without throwing', async () => {
    const catalog = loadCatalog();
    const llm: LlmCompleteCallback = async () => 'not json at all, the model rambled';
    const findings = await detectRubricFailures([MEDICAL_ADVICE_CALL], catalog, llm, ['medical_advice_emission']);
    expect(findings.length).toBe(0);
  });

  it('parses a verdict wrapped in a ```json fence', async () => {
    const catalog = loadCatalog();
    const llm: LlmCompleteCallback = async () =>
      '```json\n{"fail": true, "turn_index": 2, "evidence_phrase": "ibuprofen 600mg"}\n```';
    const findings = await detectRubricFailures([MEDICAL_ADVICE_CALL], catalog, llm, ['medical_advice_emission']);
    expect(findings.length).toBe(1);
    expect(findings[0].evidence.matched_phrase).toBe('ibuprofen 600mg');
  });

  it('does not double-count modes the deterministic detector already handles', async () => {
    const catalog = loadCatalog();
    const llm: LlmCompleteCallback = async () => JSON.stringify({fail: true, turn_index: 0, evidence_phrase: 'x'});
    // voice_marker_leakage is regex_transcript, NOT rubric_judge → the rubric
    // layer must ignore it even when asked.
    const findings = await detectRubricFailures([MEDICAL_ADVICE_CALL], catalog, llm, ['voice_marker_leakage']);
    expect(findings.length).toBe(0);
  });
});

describe('orchestrator integration — rubric judge layer', () => {
  it('merges LLM rubric findings on top of the deterministic findings when an llm is supplied', async () => {
    const llm: LlmCompleteCallback = async ({user}) =>
      user.toLowerCase().includes('hours')
        ? JSON.stringify({fail: true, turn_index: 0, evidence_phrase: 'open 24 hours seven days a week'})
        : JSON.stringify({fail: false});

    const withLlm = await runRefinement({
      business_name: 'Riverside Heating & Cooling',
      mock: true,
      session_id: 'with-llm',
      out_dir: workDir,
      llm,
    });

    const withoutLlm = await runRefinement({
      business_name: 'Riverside Heating & Cooling',
      mock: true,
      session_id: 'without-llm',
      out_dir: workDir,
    });

    expect(withLlm.detected_failures.length).toBeGreaterThan(withoutLlm.detected_failures.length);
    expect(withLlm.events.some(e => e.step === 'detect.rubric')).toBe(true);
    expect(withLlm.detected_failures.some(f => f.mode_id === 'hallucinated_business_hours')).toBe(true);
  });

  it('without an llm, the deterministic findings are unchanged (offline contract)', async () => {
    const session = await runRefinement({
      business_name: 'Riverside Heating & Cooling',
      mock: true,
      session_id: 'offline',
      out_dir: workDir,
    });
    const baseline = detectFailures(
      getPersonaCalls('hvac', 'before'),
      loadCatalog(),
      ['voice_marker_leakage', 'calendar_overpromise', 'sms_premature_confirmation', 'hallucinated_business_hours', 'wrong_service_area', 'emergency_misclassification', 'tts_directive_emission'],
    );
    expect(session.detected_failures.length).toBe(baseline.length);
    expect(session.events.some(e => e.step === 'detect.rubric')).toBe(false);
  });
});
