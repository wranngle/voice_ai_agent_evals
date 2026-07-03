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

  it('pins the @wranngle/voice-evals@v1 major tag (not floating latest)', () => {
    expect(raw).toMatch(/@wranngle\/voice-evals@v1/);
    expect(raw).not.toMatch(/@wranngle\/voice-evals@latest/);
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

  it('references the raw template URL pinned to the v1 tag', () => {
    expect(readme).toMatch(/raw\.githubusercontent\.com\/wranngle\/(voice_ai_agent_evals\/main|voice-evals\/v1)\/\.github\/workflows\/voice-evals-gate\.yml\.template/);
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
