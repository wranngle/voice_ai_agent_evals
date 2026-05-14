/**
 * HTML scorecard renderer.
 *
 * Consumed by `voice-evals score --html-out <dir>`. Writes a self-contained
 * `index.html` with inlined CSS (no CDN deps). The template uses {{TOKEN}}
 * substitution — no handlebars runtime, no DOM build step.
 *
 * Required testids surfaced by the template:
 *   - overall-score      (aggregate)
 *   - dimension-row      (one per DimensionScore)
 *   - transcript-audio   (<audio> pointing at the source WAV)
 */

import {
  mkdirSync, writeFileSync, copyFileSync, readFileSync, existsSync,
} from 'node:fs';
import {
  basename, join, resolve, relative, dirname, isAbsolute,
} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {DimensionScore} from '../scoring/types';

export type ScorecardInput = {
  runId?: string;
  audioPath: string;
  audioSummary: string;
  dimensions: DimensionScore[];
  generatedAt?: Date;
};

export type RenderResult = {
  htmlPath: string;
  audioHref: string;
  audioCopied: boolean;
};

const TEMPLATE_PATH = resolveTemplatePath();

export function renderHtml(input: ScorecardInput, outDir: string): RenderResult {
  const absOut = resolve(outDir);
  mkdirSync(absOut, {recursive: true});

  const audioHref = embedAudio(input.audioPath, absOut);
  const html = renderHtmlString(input, audioHref);
  const htmlPath = join(absOut, 'index.html');
  writeFileSync(htmlPath, html, 'utf8');
  return {htmlPath, audioHref, audioCopied: audioHref !== input.audioPath};
}

export function renderHtmlString(input: ScorecardInput, audioHref?: string): string {
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const generatedAt = (input.generatedAt ?? new Date()).toISOString();
  const overall = aggregate(input.dimensions);
  const rows = input.dimensions.map(d => renderDimensionRow(d)).join('\n');
  const href = audioHref ?? input.audioPath;
  return template
    .replaceAll('{{RUN_ID}}', escapeHtml(input.runId ?? defaultRunId(input.audioPath)))
    .replaceAll('{{GENERATED_AT}}', escapeHtml(generatedAt))
    .replaceAll('{{OVERALL_SCORE}}', overall.score.toFixed(2))
    .replaceAll('{{OVERALL_STATUS}}', overall.status)
    .replaceAll('{{AUDIO_SUMMARY}}', escapeHtml(input.audioSummary))
    .replaceAll('{{AUDIO_HREF}}', escapeAttr(href))
    .replaceAll('{{AUDIO_PATH}}', escapeHtml(input.audioPath))
    .replaceAll('{{DIMENSION_ROWS}}', rows);
}

function renderDimensionRow(d: DimensionScore): string {
  const flag = d.status === 'passed' ? '✓' : (d.status === 'skipped' ? '·' : '✗');
  const score = d.score === undefined ? '' : d.score.toFixed(2);
  return [
    `      <tr data-testid="dimension-row" data-dimension="${escapeAttr(d.name)}" data-status="${d.status}">`,
    `        <td class="flag status-${d.status}">${flag}</td>`,
    `        <td class="name">${escapeHtml(d.name)}</td>`,
    `        <td class="score-cell">${score}</td>`,
    `        <td class="detail">${escapeHtml(d.detail ?? '')}</td>`,
    '      </tr>',
  ].join('\n');
}

function aggregate(dims: DimensionScore[]): {score: number; status: DimensionScore['status']} {
  if (dims.length === 0) {
    return {score: 0, status: 'skipped'};
  }

  let weightSum = 0;
  let scoreSum = 0;
  let anyFailed = false;
  let anyError = false;
  for (const d of dims) {
    const weight = d.weight ?? 1;
    const score = d.score ?? (d.status === 'passed' ? 1 : 0);
    if (d.status !== 'skipped') {
      weightSum += weight;
      scoreSum += weight * score;
    }

    if (d.status === 'failed') {
      anyFailed = true;
    }

    if (d.status === 'error') {
      anyError = true;
    }
  }

  const score = weightSum === 0 ? 0 : scoreSum / weightSum;
  const status: DimensionScore['status'] = anyError ? 'error' : (anyFailed ? 'failed' : 'passed');
  return {score, status};
}

function embedAudio(audioPath: string, outDir: string): string {
  if (!audioPath) {
    return '';
  }

  if (!isAbsolute(audioPath) || !existsSync(audioPath)) {
    return audioPath;
  }

  const dest = join(outDir, basename(audioPath));
  try {
    copyFileSync(audioPath, dest);
    return relative(outDir, dest) || basename(audioPath);
  } catch {
    return audioPath;
  }
}

function defaultRunId(audioPath: string): string {
  const base = audioPath ? basename(audioPath).replace(/\.[^.]+$/, '') : 'run';
  return `${base}-${Date.now()}`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function resolveTemplatePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, 'templates', 'scorecard.html');
}
