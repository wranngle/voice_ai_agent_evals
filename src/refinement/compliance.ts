/**
 * One-page compliance artifact generator. Pitch promise (beat 3): "compliance
 * artifact generates as a one-page PDF the customer can hand to their lawyer."
 *
 * Ships an HTML artifact tuned for print → PDF (page-size A4, no JS deps).
 * Inside ElevenLabs this would render to PDF server-side via headless
 * Chromium; here we emit HTML that prints cleanly so the artifact exists
 * end-to-end today.
 */

import type {RefinementSession} from './types';

function escape(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderComplianceArtifact(session: RefinementSession): string {
  const generated = new Date(session.finished_at ?? session.started_at).toLocaleString();
  const failureCount = session.detected_failures.length;
  const fixCount = session.prompt_diffs.length;
  const rubricRows = session.scoreboard.dimensions.map(d => `
    <tr>
      <td>${escape(d.dimension)}</td>
      <td class="num">${(d.before * 100).toFixed(0)}%</td>
      <td class="num">${(d.after * 100).toFixed(0)}%</td>
      <td class="num delta">+${((d.after - d.before) * 100).toFixed(0)}</td>
    </tr>
  `).join('');

  const failureRows = session.detected_failures.slice(0, 10).map(f => `
    <tr>
      <td class="sev sev-${escape(f.severity)}">${escape(f.severity).toUpperCase()}</td>
      <td>${escape(f.mode_id)}</td>
      <td>${escape(f.persona_id)}</td>
      <td class="evidence">${escape(f.evidence.matched_phrase ?? f.evidence.surrounding_text.slice(0, 60))}</td>
    </tr>
  `).join('');

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
  <div class="k">Business</div><div>${escape(session.enrichment.business_name)}${session.enrichment.website_url ? ` · <a href="${escape(session.enrichment.website_url)}">${escape(session.enrichment.website_url)}</a>` : ''}</div>
  <div class="k">Vertical</div><div>${escape(session.enrichment.vertical_label)}</div>
  <div class="k">Service area</div><div>${escape(session.enrichment.service_area)}</div>
  <div class="k">Hours of operation</div><div>${escape(session.enrichment.business_hours)}</div>
  <div class="k">Template applied</div><div><code>${escape(session.vertical_template_id)}</code></div>
  <div class="k">Personas exercised</div><div>${session.persona_calls.map(p => escape(p.persona_name)).join(', ')}</div>
  <div class="k">Regression tests</div><div>${session.regression_suite_size} cases captured for re-runs</div>
</div>

<h2>Outcome scoreboard</h2>
<table>
  <thead><tr><th>Dimension</th><th class="num">Before</th><th class="num">After</th><th class="num">Δ</th></tr></thead>
  <tbody>${rubricRows || '<tr><td colspan="4">No rubric scored.</td></tr>'}</tbody>
  <tfoot><tr><th>Overall</th><th class="num">${(session.scoreboard.before * 100).toFixed(0)}%</th><th class="num">${(session.scoreboard.after * 100).toFixed(0)}%</th><th class="num delta">+${((session.scoreboard.after - session.scoreboard.before) * 100).toFixed(0)}</th></tr></tfoot>
</table>

<h2>Defects detected (${failureCount}) → fixes applied (${fixCount})</h2>
<table>
  <thead><tr><th>Severity</th><th>Failure mode</th><th>Caught on</th><th>Evidence excerpt</th></tr></thead>
  <tbody>${failureRows || '<tr><td colspan="4">No defects detected.</td></tr>'}</tbody>
</table>

<div class="attest">
  <strong>Attestation.</strong> The agent system prompt for ${escape(session.enrichment.business_name)} was exercised against
  ${session.persona_calls.length} canonical caller personas, scored against
  ${session.scoreboard.dimensions.length} rubric dimensions, and remediated against ${failureCount} detected defects mapped to the
  ElevenLabs configuration surface. The regression suite of ${session.regression_suite_size} test cases is preserved and re-runnable.
  This artifact represents the agent's behavior at the time of refinement; it does not warrant future calls.
</div>

<div class="footer">
  voice-evals · refinement session · ${escape(session.session_id)} · generated by the Refinement orchestrator
</div>

</body>
</html>`;
}
