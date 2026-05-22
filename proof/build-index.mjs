#!/usr/bin/env node
/**
 * proof/build-index.mjs — bundle every report under reports/ into a single
 * runs.json that the console loads on page boot. Run after each fresh
 * ceo-demo invocation. Also computes derived defect statistics from the
 * transcripts so the console doesn't have to recompute them client-side.
 */

import {
  readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPORTS = path.join(HERE, '..', 'reports');
const OUT = path.join(HERE, 'runs.json');

const BRACKET_RE = /\[[a-z][\w-]+]/gi;
const MUSTACHE_RE = /{{[\w.]+}}/g;
const PHONE_DIGITS_RE = /(?:\b\d[\s-]?){7,}/;

function deriveTrialMetrics(trial) {
  const transcript = trial.transcript ?? [];
  const agentTurns = transcript.filter(t => t.role === 'agent');
  const userTurns = transcript.filter(t => t.role === 'user');
  const agentText = agentTurns.map(t => t.message).join(' ');
  const userText = userTurns.map(t => t.message).join(' ');

  const bracketMatches = [...agentText.matchAll(BRACKET_RE)].map(m => m[0]);
  const bracketUnique = [...new Set(bracketMatches.map(s => s.toLowerCase()))];
  const mustacheMatches = [...agentText.matchAll(MUSTACHE_RE)].map(m => m[0]);

  const closingTurn = (agentTurns.at(-1)?.message ?? '').replaceAll(/\s+/g, ' ').trim();
  const emptyClose = closingTurn.length === 0;
  const truncatedByLimit = transcript.length >= 14; // new_turns_limit was 14

  const agentChars = agentText.length;
  const userChars = userText.length;
  const avgAgentTurnChars = agentTurns.length === 0 ? 0 : Math.round(agentChars / agentTurns.length);
  const avgUserTurnChars = userTurns.length === 0 ? 0 : Math.round(userChars / userTurns.length);

  const phoneInUser = PHONE_DIGITS_RE.test(userText.replaceAll(/\s+/g, ' '));

  return {
    derived: {
      bracket_leak_count: bracketMatches.length,
      bracket_leaks: bracketUnique,
      mustache_leak_count: mustacheMatches.length,
      empty_close: emptyClose,
      truncated_by_turn_limit: truncatedByLimit,
      agent_chars: agentChars,
      user_chars: userChars,
      avg_agent_turn_chars: avgAgentTurnChars,
      avg_user_turn_chars: avgUserTurnChars,
      phone_digits_volunteered: phoneInUser,
    },
  };
}

function loadRun(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const enrichedResults = (raw.results ?? []).map(r => ({
    ...r,
    ...(r.transcript ? deriveTrialMetrics(r) : {derived: null}),
  }));

  // Aggregate defect stats across the run.
  const defects = {
    bracket_leak_trials: 0,
    bracket_leaks_seen: {},
    mustache_leak_trials: 0,
    empty_close_trials: 0,
    truncated_trials: 0,
    has_transcripts: false,
  };
  for (const r of enrichedResults) {
    if (!r.derived) {
      continue;
    }

    defects.has_transcripts = true;
    if (r.derived.bracket_leak_count > 0) {
      defects.bracket_leak_trials++;
    }

    for (const b of r.derived.bracket_leaks) {
      defects.bracket_leaks_seen[b] = (defects.bracket_leaks_seen[b] ?? 0) + 1;
    }

    if (r.derived.mustache_leak_count > 0) {
      defects.mustache_leak_trials++;
    }

    if (r.derived.empty_close) {
      defects.empty_close_trials++;
    }

    if (r.derived.truncated_by_turn_limit) {
      defects.truncated_trials++;
    }
  }

  return {
    file: path.split('/').at(-1),
    summary: raw.summary,
    results: enrichedResults,
    defects,
  };
}

const files = readdirSync(REPORTS)
  .filter(f => f.startsWith('ceo-demo-') && f.endsWith('.json'))
  .sort();

const runs = files.map(f => loadRun(path.join(REPORTS, f)));

// Run-over-run trend: previous pass-rate, delta, defect deltas.
for (let i = 0; i < runs.length; i++) {
  const prev = i > 0 ? runs[i - 1] : null;
  runs[i].trend = {
    prev_pass_pct: prev?.summary.pass_rate_pct ?? null,
    pass_delta_pct: prev ? Number((runs[i].summary.pass_rate_pct - prev.summary.pass_rate_pct).toFixed(1)) : null,
    is_first: prev === null,
  };
}

const out = {
  built_at: new Date().toISOString(),
  run_count: runs.length,
  trial_count: runs.reduce((a, r) => a + (r.summary?.total ?? 0), 0),
  runs,
};

writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${OUT}`);
console.log(`  ${runs.length} runs, ${out.trial_count} trials`);
for (const r of runs) {
  console.log(`  ${r.file}  pass=${r.summary.pass_rate_pct}%  defects=${r.defects.bracket_leak_trials}brackets/${r.defects.empty_close_trials}empty  transcripts=${r.defects.has_transcripts}`);
}
