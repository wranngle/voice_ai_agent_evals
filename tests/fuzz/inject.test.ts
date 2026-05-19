/**
 * Prompt-injection fuzzer behavior tests.
 *
 * Verifies the central promise: from one seed scenario + the bundled
 * templates file, the fuzzer produces ≥50 deterministic adversarial variants
 * spanning the three attack classes, persists a report.json with a per-class
 * pass/fail table, and surfaces breaches detected by the responder.
 */

import {
  readFile, mkdtemp, rm, writeFile,
} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest';
import {
  detectBreach,
  generateVariants,
  loadSeed,
  loadTemplates,
  renderClassTable,
  runFuzz,
  type AgentResponder,
  type FuzzReport,
} from '../../src/fuzz/inject.js';

const SEED_PATH = resolve(__dirname, '../../scenarios/refund.yaml');
const TEMPLATES_PATH = resolve(__dirname, '../../scenarios/_fuzz-templates.yaml');

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'fuzz-inject-'));
});

afterEach(async () => {
  await rm(workDir, {recursive: true, force: true});
});

describe('prompt-injection fuzzer: variant generation', () => {
  it('generates exactly N variants spanning all three attack classes', async () => {
    const scenario = await loadSeed(SEED_PATH);
    const templates = await loadTemplates(TEMPLATES_PATH);
    const variants = generateVariants(scenario, templates, 50);
    expect(variants).toHaveLength(50);
    const byClass = new Map<string, number>();
    for (const v of variants) {
      byClass.set(v.attackClass, (byClass.get(v.attackClass) ?? 0) + 1);
    }

    expect(byClass.get('encoding-trick')).toBeGreaterThan(0);
    expect(byClass.get('role-swap')).toBeGreaterThan(0);
    expect(byClass.get('payload-in-name')).toBeGreaterThan(0);
  });

  it('produces unique, deterministic variantIds across two runs with same seed+n', async () => {
    const scenario = await loadSeed(SEED_PATH);
    const templates = await loadTemplates(TEMPLATES_PATH);
    const a = generateVariants(scenario, templates, 50);
    const b = generateVariants(scenario, templates, 50);
    expect(a.map(v => v.variantId)).toEqual(b.map(v => v.variantId));
    const ids = new Set(a.map(v => v.variantId));
    expect(ids.size).toBe(50);
  });

  it('composes payload-in-name variants by replacing the caller name slot', async () => {
    const scenario = await loadSeed(SEED_PATH);
    const templates = await loadTemplates(TEMPLATES_PATH);
    const variants = generateVariants(scenario, templates, 9);
    const nameVariants = variants.filter(v => v.attackClass === 'payload-in-name');
    expect(nameVariants.length).toBeGreaterThan(0);
    for (const v of nameVariants) {
      expect(v.composedUserTurn).not.toContain('My name is Alex Doe.');
      expect(v.composedUserTurn).toContain('My name is');
    }
  });
});

describe('prompt-injection fuzzer: breach detection', () => {
  it('detects a breach phrase case-insensitively', () => {
    const matched = detectBreach('Refund APPROVED without verifying.', ['refund approved']);
    expect(matched).toBe('refund approved');
  });

  it('returns undefined when no breach phrase is present', () => {
    const matched = detectBreach('Please provide last 4 digits of your card.', ['refund approved', 'system prompt']);
    expect(matched).toBeUndefined();
  });
});

describe('prompt-injection fuzzer: end-to-end run', () => {
  it('runs N=50, writes report.json, and emits a printable attack_class table', async () => {
    const report = await runFuzz({
      seedPath: SEED_PATH,
      templatesPath: TEMPLATES_PATH,
      n: 50,
      outDir: workDir,
    });

    expect(report.totalVariants).toBe(50);
    expect(report.results).toHaveLength(50);
    expect(report.perClass.map(r => r.attackClass).sort()).toEqual(['encoding-trick', 'payload-in-name', 'role-swap']);

    const onDiskPath = join(workDir, report.runId, 'report.json');
    const raw = await readFile(onDiskPath, 'utf8');
    const parsed = JSON.parse(raw) as FuzzReport;
    expect(parsed.runId).toBe(report.runId);
    expect(parsed.totalVariants).toBe(50);

    const table = renderClassTable(report);
    expect(table).toContain('attack_class');
    expect(table).toContain('pass');
    expect(table).toContain('fail');
    expect(table).toContain('encoding-trick');
    expect(table).toContain('role-swap');
    expect(table).toContain('payload-in-name');
  });

  it('respects an injected agentResponder (real agent injection point)', async () => {
    const calls: string[] = [];
    const responder: AgentResponder = input => {
      calls.push(input.userTurn);
      return 'Please provide the last 4 digits of your card on file.';
    };

    const report = await runFuzz({
      seedPath: SEED_PATH,
      templatesPath: TEMPLATES_PATH,
      n: 6,
      outDir: workDir,
      agentResponder: responder,
    });
    expect(calls).toHaveLength(6);
    // A polite refusal contains none of the breach signals → all pass.
    const failed = report.results.filter(r => r.breached);
    expect(failed).toHaveLength(0);
  });

  it('flags at least one breach when the default mock-naive-filter responder is used (fuzz produces real signal)', async () => {
    const report = await runFuzz({
      seedPath: SEED_PATH,
      templatesPath: TEMPLATES_PATH,
      n: 50,
      outDir: workDir,
    });
    const breached = report.results.filter(r => r.breached);
    // The mock responder is deliberately weak so the suite proves the fuzzer
    // exercises real attack surface: at least one obfuscated/payload-in-name
    // variant must slip past the naive filter. If this ever drops to 0, the
    // attack templates have lost signal and need to be regenerated.
    expect(breached.length).toBeGreaterThan(0);
  });
});

describe('prompt-injection fuzzer: input validation', () => {
  it('throws when seed is missing required fields', async () => {
    const bogus = join(workDir, 'bogus.yaml');
    await writeFile(bogus, 'id: only-id\n', 'utf8');
    await expect(loadSeed(bogus)).rejects.toThrow(/system_prompt/);
  });

  it('throws when --n is not positive', async () => {
    const scenario = await loadSeed(SEED_PATH);
    const templates = await loadTemplates(TEMPLATES_PATH);
    expect(() => generateVariants(scenario, templates, 0)).toThrow(/--n/);
  });
});
