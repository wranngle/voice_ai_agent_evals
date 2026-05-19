import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {CompareResult, CompareRow, Status} from './types';

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = join(here, 'templates', 'scorecard-compare.html');

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function formatScore(score: number): string {
  return score.toFixed(2);
}

function formatDelta(delta: number | undefined): string {
  if (delta === undefined) {
    return '—';
  }

  if (delta === 0) {
    return '0.00';
  }

  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(2)}`;
}

function deltaClass(delta: number | undefined): string {
  if (delta === undefined) {
    return 'cell-missing';
  }

  if (delta > 0) {
    return 'delta-positive';
  }

  if (delta < 0) {
    return 'delta-negative';
  }

  return 'delta-zero';
}

function renderAgentHeaders(agents: readonly string[]): string {
  return agents
    .map(a => `<th data-agent="${escapeHtml(a)}">${escapeHtml(a)}</th>`)
    .join('\n      ');
}

function renderDeltaHeaders(agents: readonly string[]): string {
  // One Δ column per non-baseline agent. The bare `<th>Δ</th>` form is the
  // proof-artifact contract; per-column metadata moves to the data cells.
  const others = agents.slice(1);
  if (others.length === 0) {
    return '';
  }

  return others.map(() => '<th>Δ</th>').join('\n      ');
}

function renderRow(row: CompareRow): string {
  const cellCells = row.cells.map(cell => {
    const klass = cell.status === 'missing' ? 'cell-missing' : `cell-${cell.status}`;
    const text = cell.status === 'missing'
      ? '—'
      : `${formatScore(cell.score)} <small>(${cell.status})</small>`;
    const detailAttr = cell.detail ? ` title="${escapeHtml(cell.detail)}"` : '';
    return `<td class="${klass}" data-agent="${escapeHtml(cell.agentId)}"${detailAttr}>${text}</td>`;
  });
  const baselineAgent = row.cells[0]?.agentId ?? '';
  const deltaCells = row.deltas.map((d, i) => {
    const klass = `delta ${deltaClass(d.score)}`;
    const text = formatDelta(d.score);
    const statusAttr = d.statusDelta ? ` data-status-delta="${escapeHtml(d.statusDelta)}"` : '';
    const otherAgent = row.cells[i + 1]?.agentId ?? '';
    const refAttrs = ` data-delta-of="${escapeHtml(otherAgent)}" data-baseline="${escapeHtml(baselineAgent)}"`;
    return `<td class="${klass}"${refAttrs}${statusAttr}>${text}</td>`;
  });
  return `<tr>
      <td class="dim">${escapeHtml(row.dimension)}</td>
      ${[...cellCells, ...deltaCells].join('\n      ')}
    </tr>`;
}

function summaryRowClass(status: Status): string {
  return `summary-${status}`;
}

function renderSummaryRow(s: CompareResult['summaries'][number]): string {
  return `<tr>
      <td data-agent="${escapeHtml(s.agentId)}">${escapeHtml(s.agentId)}</td>
      <td class="${summaryRowClass(s.status)}">${escapeHtml(s.status)}</td>
      <td>${formatScore(s.aggregateScore)}</td>
      <td>${s.passedCount}</td>
      <td>${s.failedCount}</td>
    </tr>`;
}

export type RenderCompareHtmlOptions = {
  /** Override the ISO timestamp embedded in the footer; deterministic-by-default for tests. */
  now?: string;
};

/**
 * Render a CompareResult as a self-contained HTML document. The output exposes:
 *  - one `<th>Δ</th>` column per non-baseline agent (with `data-delta-of`)
 *  - one `data-agent="..."` attribute per agent column header
 *  - a `data-testid="compare-table"` root for downstream UI checks
 *
 * No external CSS / JS / fonts — drops cleanly into `out/compare.html` for the
 * `npm run demo:compare` proof artifact and works offline.
 */
export function renderCompareHtml(result: CompareResult, options: RenderCompareHtmlOptions = {}): string {
  const template = readFileSync(templatePath, 'utf8');
  const rows = result.rows.map(r => renderRow(r)).join('\n    ');
  const summaryRows = result.summaries.map(s => renderSummaryRow(s)).join('\n    ');
  return template
    .replaceAll('{{SCENARIO}}', escapeHtml(result.scenario))
    .replaceAll('{{AGENT_COUNT}}', String(result.agents.length))
    .replaceAll('{{AGENT_HEADERS}}', renderAgentHeaders(result.agents))
    .replaceAll('{{DELTA_HEADERS}}', renderDeltaHeaders(result.agents))
    .replaceAll('{{ROWS}}', rows)
    .replaceAll('{{SUMMARY_ROWS}}', summaryRows)
    .replaceAll('{{TIMESTAMP}}', escapeHtml(options.now ?? new Date().toISOString()));
}
