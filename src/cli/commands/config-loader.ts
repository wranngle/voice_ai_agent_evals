/**
 * @wranngle/voice-evals/cli/commands/config-loader
 *
 * Find + dynamic-import the user's voice-evals.config.{ts,mjs,js} from cwd.
 *
 * .ts works under Bun (which the package targets first-class). Under Node,
 * .ts dynamic-import fails — caller should rename to .mjs and strip TS
 * syntax. The error message says exactly that.
 */

import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export type VoiceEvalsRuntimeConfig = {
  [extra: string]: unknown;
  client?: unknown;
  llm?: unknown;
  evaluate?: unknown;
  config?: Record<string, unknown>;
};

const CANDIDATES = [
  'voice-evals.config.ts',
  'voice-evals.config.mjs',
  'voice-evals.config.js',
] as const;

export async function loadConfig(cwd: string = process.cwd()): Promise<VoiceEvalsRuntimeConfig> {
  let lastError: Error | undefined;
  for (const candidate of CANDIDATES) {
    const path = join(cwd, candidate);
    if (!existsSync(path)) {
      continue;
    }

    try {
      const url = pathToFileURL(path).href;
      const mod = (await import(url)) as {default?: VoiceEvalsRuntimeConfig};
      return mod.default ?? (mod);
    } catch (error) {
      lastError = error as Error;
    }
  }

  if (lastError) {
    throw new Error(`Failed to load voice-evals config: ${lastError.message}\n`
      + '  Under Node, .ts configs need a loader — rename to voice-evals.config.mjs '
      + 'and strip TypeScript syntax. Or run via Bun: `bunx voice-evals <cmd>`.');
  }

  throw new Error('No voice-evals.config.{ts,mjs,js} found in cwd. '
    + 'Run `voice-evals init` to scaffold one.');
}
