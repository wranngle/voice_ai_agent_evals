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

  let tests: GeneratedTest[];
  try {
    tests = expandAll(templates, context, {
      strategy,
      seed: options.seed ?? 1,
      sampleCount: options.count,
    });
  } catch (error: unknown) {
    out(`error: template expansion failed: ${(error as Error).message}`);
    return 1;
  }

  const limited = options.count !== undefined && tests.length > options.count
    ? tests.slice(0, options.count)
    : tests;

  if (options.output) {
    writeFileSync(options.output, JSON.stringify(limited, null, 2));
    out(`Wrote ${limited.length} tests to ${options.output} (strategy=${strategy})`);
  } else {
    out(JSON.stringify(limited, null, 2));
  }

  return 0;
}
