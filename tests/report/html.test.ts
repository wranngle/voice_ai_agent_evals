import {
  existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, join} from 'node:path';
import {
  afterEach, beforeEach, describe, expect, it,
} from 'vitest';
import {renderHtml, renderHtmlString} from '../../src/report/html';
import type {DimensionScore} from '../../src/scoring/types';

const sampleDimensions: DimensionScore[] = [
  {
    name: 'voice_activity', status: 'passed', score: 1, detail: 'caller spoke 820ms ≥ 500ms threshold',
  },
  {
    name: 'barge_in_recovery', status: 'failed', score: 0.4, detail: 'overlap 360ms > 250ms budget',
  },
  {name: 'transcript_fidelity', status: 'skipped', detail: 'no reference transcript supplied'},
];

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'voice-evals-html-'));
});

afterEach(() => {
  rmSync(tmp, {recursive: true, force: true});
});

describe('renderHtmlString', () => {
  it('embeds overall score, dimension rows, and audio testid hooks', () => {
    const html = renderHtmlString({
      runId: 'run-001',
      audioPath: '/tmp/sample.wav',
      audioSummary: 'stereo, 48000 Hz, 16-bit, 1200ms',
      dimensions: sampleDimensions,
      generatedAt: new Date('2026-05-14T00:00:00Z'),
    });

    expect(html).toContain('data-testid="overall-score"');
    expect(html).toContain('data-testid="transcript-audio"');
    const rowMatches = html.match(/data-testid="dimension-row"/g) ?? [];
    expect(rowMatches.length).toBe(sampleDimensions.length);
    for (const dimension of sampleDimensions) {
      expect(html).toContain(`data-dimension="${dimension.name}"`);
    }

    expect(html).toContain('stereo, 48000 Hz, 16-bit, 1200ms');
    expect(html).toContain('run-001');
  });

  it('marks the overall status from worst dimension and escapes hostile detail', () => {
    const dims: DimensionScore[] = [
      {
        name: 'voice_activity', status: 'passed', score: 1, detail: 'ok',
      },
      {
        name: 'judge_safety', status: 'failed', score: 0, detail: '<script>alert(1)</script>',
      },
    ];
    const html = renderHtmlString({
      runId: 'r',
      audioPath: '/tmp/x.wav',
      audioSummary: 'mono, 48000 Hz, 16-bit, 1000ms',
      dimensions: dims,
      generatedAt: new Date('2026-05-14T00:00:00Z'),
    });

    expect(html).toContain('data-status="failed"');
    expect(html).toContain('status-failed');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('aggregates weighted score correctly and rounds to 2dp', () => {
    const html = renderHtmlString({
      runId: 'r',
      audioPath: '/tmp/x.wav',
      audioSummary: '',
      dimensions: [
        {
          name: 'a', status: 'passed', score: 1, weight: 1,
        },
        {
          name: 'b', status: 'failed', score: 0.4, weight: 1,
        },
      ],
      generatedAt: new Date('2026-05-14T00:00:00Z'),
    });

    const overall = /data-testid="overall-score">([^<]+)</.exec(html);
    expect(overall?.[1]).toBe('0.70');
  });
});

describe('renderHtml (filesystem)', () => {
  it('writes index.html into outDir and copies the audio file next to it', () => {
    const audioPath = join(tmp, 'fixture.wav');
    writeFileSync(audioPath, new Uint8Array([0x52, 0x49, 0x46, 0x46]));

    const outDir = join(tmp, 'run-001');
    const result = renderHtml(
      {
        runId: 'run-001',
        audioPath,
        audioSummary: 'mono, 48000 Hz, 16-bit, 1000ms',
        dimensions: sampleDimensions,
        generatedAt: new Date('2026-05-14T00:00:00Z'),
      },
      outDir,
    );

    expect(result.htmlPath).toBe(join(outDir, 'index.html'));
    expect(existsSync(result.htmlPath)).toBe(true);
    expect(result.audioCopied).toBe(true);
    expect(existsSync(join(outDir, basename(audioPath)))).toBe(true);

    const html = readFileSync(result.htmlPath, 'utf8');
    expect(html).toContain(`src="${basename(audioPath)}"`);
    expect(html).toContain('data-testid="overall-score"');
  });

  it('matches a stable snapshot for fixed inputs', () => {
    const html = renderHtmlString({
      runId: 'snapshot-fixture',
      audioPath: '/fixtures/sample.wav',
      audioSummary: 'stereo, 48000 Hz, 16-bit, 1200ms',
      dimensions: sampleDimensions,
      generatedAt: new Date('2026-05-14T00:00:00Z'),
    });
    expect(html).toMatchSnapshot();
  });
});
