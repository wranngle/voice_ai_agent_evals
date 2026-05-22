/**
 * `voice-evals factory generate` — expand YAML templates into N concrete tests.
 *
 * Reads:
 *   <templates>/industries.yaml
 *   <templates>/variants.yaml
 *   <templates>/base-scenarios.yaml
 *
 * Writes a JSON array of GeneratedTest to --output (or stdout).
 */

import {existsSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {
  expandAll, loadIndustries, loadTemplates, loadVariants, type ExpansionStrategy, type GeneratedTest,
} from '../../../factory';
import {createTracer} from '../../../internal/jsonl-trace';

const trace = createTracer('cli.factory.generate');
// JSONL tracing — emit start/end events from dispatch entry points.

void trace;

export type FactoryGenerateOptions = {
  templatesDir?: string;
  strategy?: ExpansionStrategy;
  count?: number;
  seed?: number;
  output?: string;
  out?: (line: string) => void;
};

const DEFAULT_TEMPLATES_DIR = 'templates/factory';

export async function runFactoryGenerate(options: FactoryGenerateOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });

  const dir = options.templatesDir ?? DEFAULT_TEMPLATES_DIR;
  const strategy: ExpansionStrategy = options.strategy ?? 'sample';

  const industriesPath = join(dir, 'industries.yaml');
  const variantsPath = join(dir, 'variants.yaml');
  const scenariosPath = join(dir, 'base-scenarios.yaml');

  for (const p of [industriesPath, variantsPath, scenariosPath]) {
    if (!existsSync(p)) {
      out(`error: required template file missing: ${p}`);
      out('hint: copy templates/factory/ into your project or pass --templates <dir>');
      return 1;
    }
  }

  const industries = loadIndustries(industriesPath);
  const variants = loadVariants(variantsPath);
  const templates = loadTemplates(scenariosPath);
  const context = {...variants, industries};

  const seed = options.seed ?? 1;
  // Global budget: with --count N, N is the FINAL test count across all
  // templates. Per-template sampleCount must be a generous upper bound
  // (not N itself) so each template contributes candidates to the global
  // pool, otherwise small templates dominate and the slice biases toward
  // early templates. Use N per template as the cap, then shuffle the
  // union deterministically and slice to N.
  const targetCount = options.count;
  const perTemplateBudget = strategy === 'sample'
    ? (targetCount === undefined
      ? 100
      : Math.max(targetCount, 10))
    : undefined;

  let tests: GeneratedTest[];
  try {
    tests = expandAll(templates, context, {
      strategy,
      seed,
      sampleCount: perTemplateBudget,
    });
  } catch (error: unknown) {
    out(`error: template expansion failed: ${(error as Error).message}`);
    return 1;
  }

  const limited = targetCount !== undefined && tests.length > targetCount
    ? sampleGlobally(tests, targetCount, seed)
    : tests;

  if (options.output) {
    writeFileSync(options.output, JSON.stringify(limited, null, 2));
    out(`Wrote ${limited.length} tests to ${options.output} (strategy=${strategy})`);
  } else {
    out(JSON.stringify(limited, null, 2));
  }

  return 0;
}

/* eslint-disable no-bitwise -- mulberry32 is a hash function; bitwise is canonical. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D_2B_79_F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
/* eslint-enable no-bitwise */

function sampleGlobally<T>(items: readonly T[], n: number, seed: number): T[] {
  if (n >= items.length) {
    return [...items];
  }

  const rng = mulberry32(seed);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, n);
}
