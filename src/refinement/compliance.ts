/**
 * One-page compliance artifact generator. Pitch promise (beat 3): "compliance
 * artifact generates as a one-page PDF the customer can hand to their lawyer."
 *
 * Ships an HTML artifact tuned for print → PDF (page-size A4, no JS deps).
 * Inside ElevenLabs this would render to PDF server-side via headless
 * Chromium; here we emit HTML that prints cleanly so the artifact exists
 * end-to-end today.
 */

import {normalizeReplayState} from './replay-state';
import type {RefinementSession} from './types';

function escape(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

/**
 * Enrichment fields inferred from an agent's system prompt can be mid-sentence
 * fragments ("production and won their Startup Grant — surface it whenever…").
 * A legal-facing artifact must not print scrape debris: cut at a sentence
 * boundary when one exists in range, and drop clear fragments entirely.
 */
export function presentableEnrichmentField(value: string | undefined, maxLength = 140): string | undefined {
  if (!value) {
    return undefined;
  }

  let text = value.trim().replaceAll(/\s+/g, ' ');
  if (text.length > maxLength) {
    const cut = text.slice(0, maxLength);
    const boundary = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    text = boundary > 40 ? cut.slice(0, boundary + 1) : `${cut.replace(/\s+\S*$/, '')}…`;
  }

  // Fragment heuristics: starts lowercase mid-clause, or ends mid-word after a
  // hyphenated truncation ("paste-re"). Better to omit than to print debris.
  if (/^[a-z]/.test(text) && !/^[a-z][\w-]*:/.test(text)) {
    return undefined;
  }

  return text;
}

export function renderComplianceArtifact(session: RefinementSession): string {
  const generated = new Date(session.finished_at ?? session.started_at).toLocaleString();
  const failureCount = session.detected_failures.length;
  const fixCount = session.prompt_diffs.length;
  // Fail CLOSED on legacy shapes: a pre-#184 live session carries a numeric
  // (fabricated) after-score and no replay field — the normalizer infers
  // 'deferred' from the recorded run mode, and every after-value below is
  // suppressed when replay is deferred, whatever the raw field says.
  const measured = normalizeReplayState(session) !== 'deferred';
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- scoreboard after-values are null (JSON round-trip), not undefined
  const dimAfter = (after: number | null): number | null => (measured ? after : null);
  const rubricRows = session.scoreboard.dimensions.map(d => {
    const after = dimAfter(d.after);
    return `
    <tr>
      <td>${escape(d.dimension)}</td>
      <td class="num">${pct(d.before)}</td>
      <td class="num">${after === null ? '<span class="pending">pending replay</span>' : pct(after)}</td>
      <td class="num delta">${after === null ? '—' : `${after >= d.before ? '+' : ''}${((after - d.before) * 100).toFixed(0)}`}</td>
    </tr>
  `;
  }).join('');

  const failureRows = session.detected_failures.slice(0, 10).map(f => `
    <tr>
      <td class="sev sev-${escape(f.severity)}">${escape(f.severity).toUpperCase()}</td>
      <td>${escape(f.mode_id)}</td>
      <td>${escape(f.persona_id)}</td>
      <td class="evidence">${escape(f.evidence.matched_phrase ?? f.evidence.surrounding_text.slice(0, 60))}</td>
    </tr>
  `).join('');

  const businessLink = session.enrichment.website_url
    ? ` · <a href="${escape(session.enrichment.website_url)}">${escape(session.enrichment.website_url)}</a>`
    : '';
  const overallBefore = (session.scoreboard.before * 100).toFixed(0);
  const effectiveAfter = dimAfter(session.scoreboard.after);
  const overallAfter = effectiveAfter === null ? null : (effectiveAfter * 100).toFixed(0);
  const overallDelta = effectiveAfter === null
    ? null
    : `${effectiveAfter >= session.scoreboard.before ? '+' : ''}${((effectiveAfter - session.scoreboard.before) * 100).toFixed(0)}`;
  const serviceArea = presentableEnrichmentField(session.enrichment.service_area);
  const hours = presentableEnrichmentField(session.enrichment.business_hours);
  const overallAfterCell = overallAfter === null ? '<span class="pending">pending replay</span>' : `${overallAfter}%`;
  let remediationSentence: string;
  if (measured) {
    remediationSentence = `${failureCount} detected defect(s) were remediated and re-measured against the same personas.`;
  } else if (failureCount === 0) {
    remediationSentence = 'No defects were detected on this pass, so no remediation was required; the after-column above is blank because no fix-replay cycle ran.';
  } else {
    remediationSentence = `${failureCount} detected defect(s) produced ${fixCount} proposed fix(es); `
      + 'the fixes have NOT yet been applied to the live agent or re-measured — '
      + 'the after-column above is intentionally blank until that replay runs.';
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Refinement Compliance Artifact · ${escape(session.enrichment.business_name)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  body { font-family: 'Inter', -apple-system, system-ui, sans-serif; color: #111; font-size: 11px; line-height: 1.45; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { color: #555; font-size: 11px; margin-bottom: 18px; }
  .hdr { display: flex; justify-content: space-between; border-bottom: 1px solid #ccc; padding-bottom: 8px; margin-bottom: 12px; }
  .kv { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; font-size: 11px; }
  .kv .k { color: #666; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e5e5e5; font-size: 10.5px; }
  th { background: #f7f7f7; font-weight: 600; color: #333; }
  td.num { font-variant-numeric: tabular-nums; text-align: right; }
  td.delta { color: #15803d; font-weight: 600; }
  .pending { color: #b45309; font-weight: 600; font-size: 10px; }
  td.evidence { font-family: ui-monospace, monospace; color: #444; font-size: 10px; }
  td.sev { font-family: ui-monospace, monospace; font-size: 10px; font-weight: 700; }
  .sev-critical { color: #b91c1c; }
  .sev-high { color: #d97706; }
  .sev-medium { color: #2563eb; }
  .sev-low { color: #6b7280; }
  h2 { font-size: 13px; margin: 14px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  .footer { color: #888; font-size: 9.5px; margin-top: 18px; }
  .attest { background: #fafafa; padding: 8px 10px; border-left: 3px solid #15803d; font-size: 10.5px; margin-top: 10px; }
</style>
</head>
<body>

<div class="hdr">
  <div>
    <h1>Voice Agent Refinement Report</h1>
    <div class="sub">${escape(session.enrichment.business_name)} · session ${escape(session.session_id)}</div>
  </div>
  <div class="sub">Generated ${escape(generated)}</div>
</div>

<div class="kv">
  <div class="k">Business</div><div>${escape(session.enrichment.business_name)}${businessLink}</div>
  <div class="k">Vertical</div><div>${escape(session.enrichment.vertical_label)}</div>
  ${serviceArea ? `<div class="k">Service area</div><div>${escape(serviceArea)}</div>` : ''}
  ${hours ? `<div class="k">Hours of operation</div><div>${escape(hours)}</div>` : ''}
  <div class="k">Template applied</div><div><code>${escape(session.vertical_template_id)}</code></div>
  <div class="k">Personas exercised</div><div>${session.persona_calls.map(p => escape(p.persona_name)).join(', ')}</div>
  <div class="k">Regression tests</div><div>${session.regression_suite_size} cases captured for future re-runs</div>
</div>

<h2>Outcome scoreboard${measured ? '' : ' — before-measurement only (fix replay pending)'}</h2>
<table>
  <thead><tr><th>Dimension</th><th class="num">Before</th><th class="num">After</th><th class="num">Δ</th></tr></thead>
  <tbody>${rubricRows || '<tr><td colspan="4">No rubric scored.</td></tr>'}</tbody>
  <tfoot><tr><th>Overall</th><th class="num">${overallBefore}%</th><th class="num">${overallAfterCell}</th><th class="num delta">${overallDelta ?? '—'}</th></tr></tfoot>
</table>

<h2>Defects detected (${failureCount}) → fixes ${measured ? 'applied' : 'proposed'} (${fixCount})</h2>
<table>
  <thead><tr><th>Severity</th><th>Failure mode</th><th>Caught on</th><th>Evidence excerpt</th></tr></thead>
  <tbody>${failureRows || '<tr><td colspan="4">No defects detected.</td></tr>'}</tbody>
</table>

<div class="attest">
  <strong>Attestation.</strong> The agent system prompt for ${escape(session.enrichment.business_name)} was exercised against
  ${session.persona_calls.length} canonical caller personas and scored against
  ${session.scoreboard.dimensions.length} rubric dimensions. ${remediationSentence}
  The regression suite of ${session.regression_suite_size} test cases is preserved for future re-runs.
  This artifact represents the agent's behavior at the time of refinement; it does not warrant future calls.
</div>

<div class="footer">
  voice-evals · refinement session · ${escape(session.session_id)} · generated by the Refinement orchestrator
</div>

</body>
</html>`;
}
