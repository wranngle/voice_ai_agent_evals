/**
 * End-to-end + unit tests for the Refinement orchestrator.
 *
 * The central promise tested here (per project test imperatives): one
 * `runRefinement({mock:true, ...})` call returns a session that survives
 * a full round-trip — enrichment → template → personas → detect →
 * diff → score → compliance → regression-suite — and persists all
 * artifacts to disk.
 *
 * Failure-mode catalog drift is also tested: every priority_failure_modes
 * entry in every shipped vertical template MUST resolve to a real entry in
 * config/failure-mode-catalog.json. This is the bidirectional-drift test
 * required by the project test imperatives whenever a constant lives in
 * 2+ files (yaml templates ↔ JSON catalog).
 */

import {
  existsSync, mkdtempSync, readFileSync, rmSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest';
import {detectFailures, loadCatalog} from '../../src/refinement/failure-detector';
import {runRefinement} from '../../src/refinement/orchestrator';
import {getPersonaCalls} from '../../src/refinement/persona-fixtures';
import {buildPromptDiffs} from '../../src/refinement/prompt-diff';
import {loadVerticalTemplates} from '../../src/refinement/template-selector';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'voice-evals-refine-'));
});

afterEach(() => {
  rmSync(workDir, {recursive: true, force: true});
});

describe('refinement orchestrator — central product promise', () => {
  it('runs the full enrich → template → personas → detect → diff → score → compliance pipeline end-to-end', async () => {
    const events: string[] = [];
    const session = await runRefinement({
      business_name: 'Riverside Heating & Cooling',
      mock: true,
      session_id: 'e2e-test',
      out_dir: workDir,
    }, event => {
      events.push(event.step);
    });

    expect(session.session_id).toBe('e2e-test');
    expect(session.status).toBe('complete');
    expect(session.vertical_template_id).toBe('hvac');
    expect(session.persona_calls.length).toBe(5);
    expect(session.detected_failures.length).toBeGreaterThan(0);
    expect(session.prompt_diffs.length).toBeGreaterThan(0);
    expect(session.scoreboard.after).toBeGreaterThan(session.scoreboard.before);
    expect(session.regression_suite_size).toBeGreaterThan(0);

    const expectedSteps = [
      'session.start',
      'enrichment.start',
      'enrichment.done',
      'template.select',
      'template.selected',
      'prompt.fill',
      'personas.before.start',
      'personas.before.done',
      'detect.start',
      'detect.done',
      'diff.start',
      'diff.done',
      'personas.after.start',
      'personas.after.done',
      'scoreboard',
      'regression.persist',
      'artifact.prompt',
      'compliance.persist',
      'session.persist',
      'session.complete',
    ];
    for (const step of expectedSteps) {
      expect(events, `step ${step} should fire`).toContain(step);
    }

    const sessionDir = join(workDir, 'e2e-test');
    expect(existsSync(join(sessionDir, 'session.json'))).toBe(true);
    expect(existsSync(join(sessionDir, 'compliance.html'))).toBe(true);
    expect(existsSync(join(sessionDir, 'regression-suite.json'))).toBe(true);
    expect(existsSync(join(sessionDir, 'system-prompt.md'))).toBe(true);
    expect(existsSync(join(sessionDir, 'after-calls.json'))).toBe(true);
    expect(existsSync(join(workDir, 'index.json'))).toBe(true);
  });

  it('detects at least one failure from the catalog for every shipped vertical', async () => {
    const verticals = ['hvac', 'dental', 'restaurant', 'legal'];
    const businesses: Record<string, string> = {
      hvac: 'Riverside Heating & Cooling',
      dental: 'Brightwater Family Dentistry',
      restaurant: 'Marisol\'s Coastal Kitchen',
      legal: 'Prairie & Hayes LLP',
    };

    for (const vertical of verticals) {
      const session = await runRefinement({
        business_name: businesses[vertical],
        mock: true,
        session_id: `e2e-${vertical}`,
        out_dir: workDir,
      });
      expect(session.vertical_template_id).toBe(vertical);
      expect(session.detected_failures.length, `${vertical} should detect at least one failure`).toBeGreaterThan(0);
      expect(session.scoreboard.after).toBeGreaterThan(session.scoreboard.before);
    }
  });

  it('compliance artifact is self-contained HTML with print-CSS', async () => {
    const session = await runRefinement({
      business_name: 'Riverside Heating & Cooling',
      mock: true,
      session_id: 'compliance-test',
      out_dir: workDir,
    });
    const html = readFileSync(join(workDir, 'compliance-test', 'compliance.html'), 'utf8');
    expect(html).toContain('@page { size: A4');
    expect(html).toContain('Riverside Heating');
    expect(html).toContain('Outcome scoreboard');
    expect(html).toContain('Attestation');
    expect(session.enrichment.business_name).toBe('Riverside Heating & Cooling');
  });

  it('session index aggregates multiple runs and orders by recency', async () => {
    await runRefinement({
      business_name: 'Riverside Heating & Cooling', mock: true, session_id: 'a', out_dir: workDir,
    });
    await runRefinement({
      business_name: 'Brightwater Family Dentistry', mock: true, session_id: 'b', out_dir: workDir,
    });
    const index = JSON.parse(readFileSync(join(workDir, 'index.json'), 'utf8')) as Array<{session_id: string}>;
    expect(index.length).toBe(2);
    expect(index.map(e => e.session_id).sort()).toEqual(['a', 'b']);
  });
});

describe('refinement — failure-mode regex detectors', () => {
  it('catches voice marker leakage in agent transcript', () => {
    const calls = getPersonaCalls('hvac', 'before', ['polite-elderly']);
    const catalog = loadCatalog();
    const findings = detectFailures(calls, catalog);
    expect(findings.some(f => f.mode_id === 'voice_marker_leakage')).toBe(true);
  });

  it('catches calendar overpromise when no calendar_booking tool fires', () => {
    const calls = getPersonaCalls('hvac', 'before', ['polite-elderly', 'frustrated-rusher']);
    const catalog = loadCatalog();
    const findings = detectFailures(calls, catalog);
    expect(findings.some(f => f.mode_id === 'calendar_overpromise')).toBe(true);
  });

  it('after-fix transcripts pass every priority failure mode (the proof of remediation)', () => {
    const calls = getPersonaCalls('hvac', 'after');
    const catalog = loadCatalog();
    const findings = detectFailures(calls, catalog, ['voice_marker_leakage', 'calendar_overpromise', 'sms_premature_confirmation', 'hallucinated_business_hours']);
    expect(findings.length).toBe(0);
  });

  it('legal vertical catches HIPAA-style PII leakage (SSN repeated by agent)', () => {
    const calls = getPersonaCalls('legal', 'before', ['esl-non-native']);
    const catalog = loadCatalog();
    const findings = detectFailures(calls, catalog);
    expect(findings.some(f => f.mode_id === 'hipaa_data_leak_on_recording')).toBe(true);
  });
});

describe('refinement — plain-language prompt diff renderer', () => {
  it('collapses many occurrences of the same mode into one diff card', () => {
    const calls = getPersonaCalls('hvac', 'before');
    const catalog = loadCatalog();
    const failures = detectFailures(calls, catalog);
    const diffs = buildPromptDiffs(failures);
    const modes = new Set(failures.map(f => f.mode_id));
    expect(diffs.length).toBe(modes.size);
  });

  it('diff rationale references the persona it was caught on', () => {
    const calls = getPersonaCalls('hvac', 'before', ['polite-elderly']);
    const catalog = loadCatalog();
    const failures = detectFailures(calls, catalog);
    const diffs = buildPromptDiffs(failures);
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs[0].rationale_plain_language).toMatch(/polite-elderly/);
  });
});

describe('refinement — doctrine drift: templates ↔ failure-mode catalog', () => {
  it('every priority_failure_modes id in every vertical template exists in the catalog', () => {
    const templates = loadVerticalTemplates();
    const catalog = loadCatalog();
    const catalogIds = new Set(catalog.modes.map(m => m.id));

    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      for (const modeId of template.priority_failure_modes) {
        expect(catalogIds, `template ${template.id} references unknown mode ${modeId}`).toContain(modeId);
      }
    }
  });

  it('every shipped vertical template has a non-empty system prompt and at least one required integration', () => {
    const templates = loadVerticalTemplates();
    expect(templates.length).toBe(4);
    for (const template of templates) {
      expect(template.system_prompt.length).toBeGreaterThan(50);
      expect(template.integrations.some(i => i.required)).toBe(true);
      expect(template.evaluation_rubric.length).toBeGreaterThan(0);
    }
  });
});
