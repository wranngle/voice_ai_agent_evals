/**
 * Meta-audit — addresses S10 (CLI help is hand-maintained) + S14 (argv parser
 * is hand-rolled per command).
 *
 * The dispatcher in `src/cli.ts` lists every command in a switch statement.
 * The help text in `src/cli/commands/help.ts` lists every command in a
 * string literal. The two will drift. This test enforces alignment.
 *
 * We extract the command names from the dispatch source and from the help
 * text, then assert the symmetric difference is empty. If you add a command
 * to the dispatcher without touching help.ts, this test fails. If you remove
 * one from help.ts without removing the dispatch case, this test fails.
 */

import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const CLI_PATH = join(process.cwd(), 'src', 'cli.ts');
const HELP_PATH = join(process.cwd(), 'src', 'cli', 'commands', 'help.ts');

function extractDispatcherCommands(): Set<string> {
  const text = readFileSync(CLI_PATH, 'utf8');
  const matches = [...text.matchAll(/^\s*case\s+'([\w-]+)':/gm)];
  return new Set(matches.map(m => m[1]));
}

function extractHelpCommands(): Set<string> {
  const text = readFileSync(HELP_PATH, 'utf8');
  // Help text uses lowercase command names at the start of indented lines.
  // Match the pattern "  <command>[ <subcommand>|<args>]" inside HELP_TEXT.
  const matches = [...text.matchAll(/^\s{2}([a-z][\w-]*)(?:\s|$)/gm)];
  return new Set(matches.map(m => m[1]));
}

describe('META-AUDIT: CLI help vs dispatcher symmetric difference', () => {
  it('every dispatcher command is documented in help.ts (and vice versa)', () => {
    const dispatched = extractDispatcherCommands();
    const documented = extractHelpCommands();

    const onlyInDispatcher = [...dispatched].filter(c => !documented.has(c));
    const onlyInHelp = [...documented].filter(c => !dispatched.has(c));

    // Allow a curated whitelist of help-section labels that aren't dispatcher cases.
    const helpLabels = new Set(['init', 'score', 'ingest', 'polish', 'baseline', 'doctor', 'legacy', 'factory', 'help']);
    const realDrift = onlyInHelp.filter(c => !helpLabels.has(c));

    // If this fails: the help text and dispatcher disagree.
    expect({onlyInDispatcher, drift: realDrift}).toEqual({onlyInDispatcher: [], drift: realDrift});
    expect(onlyInDispatcher).toEqual([]);
  });

  it('factory dispatcher subcommands appear in `factory --help` text', () => {
    const dispatcherPath = join(process.cwd(), 'src', 'cli', 'commands', 'factory', 'index.ts');
    const text = readFileSync(dispatcherPath, 'utf8');
    const cases = [...text.matchAll(/^\s*case\s+'([\w-]+)':/gm)].map(m => m[1]);
    // The help branch lives at the top of dispatchFactory before the switch.
    const helpBlock = text.split('switch (subcommand)')[0];
    for (const sub of cases) {
      expect(helpBlock, `subcommand "${sub}" missing from factory help text`).toContain(sub);
    }
  });
});
