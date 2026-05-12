#!/usr/bin/env bun
/**
 * @wranngle/voice-evals CLI entry.
 *
 * v1.0 in-progress: subcommands move under src/cli/commands/ in Phase 6.
 * Phase 0 delegates straight to the existing testing CLI (which still owns
 * run / list / validate / report / ingest / clear).
 */

// Side-effect import: src/testing/cli.ts calls main() at module load. Phase 6
// will refactor this to an explicit runCli() export and drop the suppression.
// eslint-disable-next-line import-x/no-unassigned-import
import './testing/cli';
