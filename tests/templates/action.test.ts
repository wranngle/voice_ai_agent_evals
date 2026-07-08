import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, it, expect} from 'vitest';
import YAML from 'yaml';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TEMPLATE_PATH = path.join(REPO_ROOT, '.github/workflows/voice-evals-gate.yml.template');
const README_PATH = path.join(REPO_ROOT, 'README.md');

describe('voice-evals-gate.yml.template — consumer-facing gating workflow', () => {
  const raw = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const doc = YAML.parse(raw) as Record<string, unknown>;

  it('exists at the documented copy-paste path', () => {
    expect(fs.existsSync(TEMPLATE_PATH)).toBe(true);
  });

  it('parses as valid YAML with required workflow keys', () => {
    expect(doc).toBeTypeOf('object');
    expect(doc.name).toBe('voice-evals-gate');
    expect(doc.on).toBeDefined();
    expect(doc.jobs).toBeDefined();
  });

  it('runs the harness from source — no npm install of an unpublished package', () => {
    // The package is not on npm (research stage), so any bunx/npx of
    // @wranngle/voice-evals would 404 in the consumer's CI. The template must
    // check out this repo and invoke the CLI from source instead. (The header
    // comment may mention the bunx shape to warn against it — only executable
    // lines count.)
    const executable = raw.split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n');
    expect(executable).not.toMatch(/bunx[^\n]*@wranngle\/voice-evals/);
    expect(executable).not.toMatch(/npx[^\n]*@wranngle\/voice-evals/);
    expect(executable).toMatch(/repository:\s*wranngle\/voice_ai_agent_evals/);
    expect(executable).toMatch(/src\/cli\.ts run -t scenario --json/);
  });

  it('fails closed when no scenario fixtures are found — via a reachable branch', () => {
    expect(raw).toMatch(/failing closed/);
    // The CLI itself exits 1 when `-t scenario` matches zero fixtures, which
    // would abort the -e shell before the friendly verdict line. `|| true` on
    // the run plus a `// 0` jq default keep the zero-case branch reachable.
    expect(raw).toMatch(/\|\| true/);
    expect(raw).toMatch(/\.total_tests \/\/ 0/);
  });

  it('requires no secrets — the scenario gate is fixture-driven and offline', () => {
    const executable = raw.split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n');
    expect(executable).not.toMatch(/secrets\./);
    expect(executable).not.toMatch(/TEST_STORAGE_DIR/);
  });

  it('uses `if: failure()` gating so failures actually block the merge', () => {
    expect(raw).toMatch(/if:\s*failure\(\)/);
    const steps = (doc.jobs as any)?.gate?.steps as Array<Record<string, unknown>> | undefined;
    expect(Array.isArray(steps)).toBe(true);
    const guarded = steps!.filter(s => typeof s.if === 'string' && (s.if).includes('failure()'));
    expect(guarded.length).toBeGreaterThanOrEqual(1);
  });

  it('triggers on pull_request to main', () => {
    const on = doc.on as Record<string, any>;
    expect(on.pull_request).toBeDefined();
    expect(on.pull_request.branches).toContain('main');
  });

  it('declares minimum permissions (least-privilege)', () => {
    const perms = doc.permissions as Record<string, string>;
    expect(perms.contents).toBe('read');
  });
});

describe('README — 4-line copy-paste install snippet', () => {
  const readme = fs.readFileSync(README_PATH, 'utf8');

  it('documents the gating template under a discoverable heading', () => {
    expect(readme).toMatch(/Gate merges on voice-evals score/);
  });

  it('references the raw template URL at the live repo path', () => {
    // Tightened 2026-07-07 per the original transition note: the rename-
    // transition PRs all landed, the repo is `voice_ai_agent_evals`, and the
    // legacy `voice-evals/v1` URL is dead (no such repo/tag) — a README
    // regression to it must fail here.
    expect(readme).toMatch(/raw\.githubusercontent\.com\/wranngle\/voice_ai_agent_evals\/main\/\.github\/workflows\/voice-evals-gate\.yml\.template/);
    expect(readme).not.toMatch(/wranngle\/voice-evals\/v1/);
  });

  it('shows a ≤4-line shell command sequence (mkdir, curl, gh, git)', () => {
    const block = /```bash\nmkdir -p \.github\/workflows[\s\S]*?```/.exec(readme);
    expect(block, 'install bash block not found').toBeTruthy();
    const lines = block![0]
      .split('\n')
      .filter(l => l && !l.startsWith('```') && !l.trim().startsWith('#'));
    const logicalLines = lines.reduce((acc, l) => acc + (l.trimEnd().endsWith('\\') ? 0 : 1), 0);
    expect(logicalLines).toBeLessThanOrEqual(4);
    expect(logicalLines).toBeGreaterThanOrEqual(3);
  });
});
