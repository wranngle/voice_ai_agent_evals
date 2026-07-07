#!/usr/bin/env bun
/**
 * Re-derive a stored proof session's analytics (defects, fix proposals,
 * scoreboard, regression suite, compliance artifact, index entry) from its
 * recorded transcripts using the CURRENT failure-mode catalog + detector.
 *
 * Usage:
 *   bun run scripts/rescore-session.ts proof/sessions/<id> [--tts-model <model_id>]
 *
 * --tts-model supplies the agent's TTS model for sessions recorded before the
 * orchestrator captured it (enables the model-aware voice_marker_leakage
 * guard — e.g. eleven_v3_conversational for the Cartographer session).
 */

import {rescoreSession} from '../src/refinement/orchestrator';

const sessionDir = process.argv[2];
if (!sessionDir) {
  console.error('usage: bun run scripts/rescore-session.ts proof/sessions/<id> [--tts-model <model_id>]');
  process.exit(2);
}

const modelFlag = process.argv.indexOf('--tts-model');
const ttsModelId = modelFlag === -1 ? undefined : process.argv[modelFlag + 1];

const session = rescoreSession({sessionDir, ttsModelId});
const afterLabel = session.scoreboard.after === null
  ? 'pending replay'
  : `${(session.scoreboard.after * 100).toFixed(1)}%`;
console.log(`re-scored ${session.session_id}:`);
console.log(`  defects:    ${session.detected_failures.length}`);
console.log(`  fixes:      ${session.prompt_diffs.length} proposed`);
console.log(`  regression: ${session.regression_suite_size} cases`);
console.log(`  score:      ${(session.scoreboard.before * 100).toFixed(1)}% before · after ${afterLabel}`);
