import {mkdtempSync, readFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {runDemo} from '../../src/cli/commands/demo';

describe('runDemo', () => {
  it('writes a self-contained HTML report and exits 0 in under 60 seconds', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'voice-evals-demo-test-'));
    const lines: string[] = [];
    const t0 = Date.now();
    const code = await runDemo({
      outDir,
      runId: 'test-run',
      out: line => lines.push(line),
    });
    const elapsed = Date.now() - t0;

    expect(code).toBe(0);
    expect(elapsed).toBeLessThan(60_000);

    const joined = lines.join('\n');
    expect(joined).toContain('voice-evals demo');
    expect(joined).toContain('voice_activity_caller');
    expect(joined).toContain('voice_activity_agent');
    expect(joined).toContain('barge_in_recovery');
    expect(joined).toContain('overall:');
    expect(joined).toMatch(/report:.*index\.html/);

    const htmlPath = join(outDir, 'index.html');
    const wavPath = join(outDir, 'fixture.wav');
    expect(existsSync(htmlPath)).toBe(true);
    expect(existsSync(wavPath)).toBe(true);
    const html = readFileSync(htmlPath, 'utf8');
    expect(html).toContain('data-testid="overall-score"');
    expect(html).toContain('<audio');
    expect(html).toContain('fixture.wav');
    expect(html.toLowerCase()).toContain('voice-evals demo report');
  });

  it('synthesizes a deterministic fixture with three named dimensions', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'voice-evals-demo-test-'));
    const lines: string[] = [];
    await runDemo({outDir, runId: 'fix', out: l => lines.push(l)});
    const dimLines = lines.filter(l => l.includes('voice_activity_caller')
      || l.includes('voice_activity_agent')
      || l.includes('barge_in_recovery'));
    expect(dimLines).toHaveLength(3);
  });
});
