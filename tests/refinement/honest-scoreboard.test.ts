/**
 * Regression: the refinement scoreboard must be honest and deterministic.
 *
 * History: live-mode runs fabricated their after-state — afterCalls were
 * beforeCalls with ttfb scaled by 0.65, afterFailures hardwired [], and
 * per-dimension scores carried Math.random() jitter. Those numbers landed in
 * session.json, the proof console, and the legal-facing compliance artifact
 * as if measured. These tests lock the honest contract:
 *   - mock runs replay against 'after' fixtures → replay: 'measured'
 *   - identical inputs → byte-identical scoreboard (strict determinism)
 *   - regression suite test_ids never collide
 *   - rescoreSession re-derives analytics from recorded transcripts
 */

import {
  existsSync, mkdtempSync, readFileSync, rmSync,
} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest';
import {rescoreSession, runRefinement} from '../../src/refinement/orchestrator';
import {loadCatalog} from '../../src/refinement/failure-detector';
import {loadVerticalTemplates} from '../../src/refinement/template-selector';

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'voice-evals-honest-'));
});

afterEach(() => {
  rmSync(workDir, {recursive: true, force: true});
});

describe('scoreboard determinism (no synthetic jitter)', () => {
  it('two identical mock runs produce identical scoreboards', async () => {
    const opts = {business_name: 'Riverside Heating & Cooling', mock: true, out_dir: workDir};
    const a = await runRefinement({...opts, session_id: 'det-a'});
    const b = await runRefinement({...opts, session_id: 'det-b'});
    expect(a.scoreboard).toStrictEqual(b.scoreboard);
  });

  it('mock runs measure a real replay: replay=measured, numeric after', async () => {
    const s = await runRefinement({
      business_name: 'Riverside Heating & Cooling', mock: true, session_id: 'measured', out_dir: workDir,
    });
    expect(s.scoreboard.replay).toBe('measured');
    expect(typeof s.scoreboard.after).toBe('number');
    for (const d of s.scoreboard.dimensions) {
      expect(typeof d.after).toBe('number');
    }
  });

  it('dimension scores reflect the template mode mapping, not uniform noise', async () => {
    const s = await runRefinement({
      business_name: 'Riverside Heating & Cooling', mock: true, session_id: 'dims', out_dir: workDir,
    });
    // hvac fixtures fire sms_premature_confirmation → sms_truthfulness must
    // score strictly below a dimension with no detected related failures.
    const byName = Object.fromEntries(s.scoreboard.dimensions.map(d => [d.dimension, d]));
    const firedModes = new Set(s.detected_failures.map(f => f.mode_id));
    expect(firedModes.has('sms_premature_confirmation')).toBe(true);
    expect(byName.sms_truthfulness.before).toBeLessThan(1);
  });
});

describe('regression suite integrity', () => {
  it('test_ids are unique even when one mode fires repeatedly', async () => {
    const s = await runRefinement({
      business_name: 'Prairie & Hayes LLP', mock: true, session_id: 'unique-ids', out_dir: workDir,
    });
    const suite = JSON.parse(readFileSync(join(workDir, 'unique-ids', 'regression-suite.json'), 'utf8')) as Array<{test_id: string}>;
    const ids = suite.map(t => t.test_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(s.regression_suite_size).toBe(ids.length);
  });
});

describe('rescoreSession', () => {
  it('re-derives analytics from recorded transcripts with the current detector', async () => {
    const s = await runRefinement({
      business_name: 'Riverside Heating & Cooling', mock: true, session_id: 'rescore-me', out_dir: workDir,
    });
    const dir = join(workDir, 'rescore-me');
    const rescored = rescoreSession({sessionDir: dir});
    expect(rescored.detected_failures.length).toBe(s.detected_failures.length);
    expect(rescored.scoreboard).toStrictEqual(s.scoreboard);
    // Idempotent event marker: rescoring twice keeps exactly one marker.
    rescoreSession({sessionDir: dir});
    const onDisk = JSON.parse(readFileSync(join(dir, 'session.json'), 'utf8')) as {events: Array<{step: string}>};
    expect(onDisk.events.filter(e => e.step === 'session.rescore').length).toBe(1);
  });

  it('honors ttsModelId for the model-aware voice_marker guard', async () => {
    await runRefinement({
      business_name: 'Riverside Heating & Cooling', mock: true, session_id: 'v3-rescore', out_dir: workDir,
    });
    const dir = join(workDir, 'v3-rescore');
    const base = rescoreSession({sessionDir: dir});
    const baseVoiceMarkers = base.detected_failures.filter(f => f.mode_id === 'voice_marker_leakage').length;
    expect(baseVoiceMarkers).toBeGreaterThan(0);
    const v3 = rescoreSession({sessionDir: dir, ttsModelId: 'eleven_v3_conversational'});
    expect(v3.detected_failures.filter(f => f.mode_id === 'voice_marker_leakage').length).toBe(0);
  });
});

describe('doctrine drift: rubric dimension mode mappings', () => {
  it('every related_failure_modes id in every vertical template exists in the catalog', () => {
    const catalog = loadCatalog();
    const known = new Set(catalog.modes.map(m => m.id));
    for (const template of loadVerticalTemplates()) {
      for (const rubric of template.evaluation_rubric) {
        expect(rubric.related_failure_modes, `${template.id}/${rubric.dimension} missing related_failure_modes`).toBeTruthy();
        for (const mode of rubric.related_failure_modes ?? []) {
          expect(known.has(mode), `${template.id}/${rubric.dimension} references unknown mode ${mode}`).toBe(true);
        }
      }
    }
  });
});

describe('shipped proof sessions match the shipped detector', () => {
  const proofRoot = join(import.meta.dirname ?? __dirname, '..', '..', 'proof', 'sessions');

  it('no session carries an after-calls.json when its replay is deferred', () => {
    // eslint-disable-next-line @typescript-eslint/no-restricted-types -- null survives JSON round-trips; undefined does not
    const index = JSON.parse(readFileSync(join(proofRoot, 'index.json'), 'utf8')) as Array<{session_id: string; score_after: number | null}>;
    for (const entry of index) {
      if (entry.score_after === null) {
        expect(
          existsSync(join(proofRoot, entry.session_id, 'after-calls.json')),
          `${entry.session_id} is deferred but ships an after-calls.json`,
        ).toBe(false);
      }
    }
  });

  it('shipped regression suites have globally unique test_ids', () => {
    const index = JSON.parse(readFileSync(join(proofRoot, 'index.json'), 'utf8')) as Array<{session_id: string}>;
    for (const entry of index) {
      const suitePath = join(proofRoot, entry.session_id, 'regression-suite.json');
      const ids = (JSON.parse(readFileSync(suitePath, 'utf8')) as Array<{test_id: string}>).map(t => t.test_id);
      expect(new Set(ids).size, `${entry.session_id} has colliding test_ids`).toBe(ids.length);
    }
  });
});
