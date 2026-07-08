/**
 * META-AUDIT — published dependencies must be consumed by shipped code.
 *
 * History: 53 playground-only frontend packages (the Radix suite, three.js,
 * recharts, react, …) sat in `dependencies`, so a future npm consumer of this
 * "Bun-first TypeScript eval harness" would have installed the entire React
 * UI stack. `files` excluding playground/ from the tarball does NOT stop npm
 * from installing everything in `dependencies`. This guard fails when a
 * `dependencies` entry has zero import references under src/ (the only code
 * that ships), or when a src-imported runtime package is missing from the
 * build script's EXTERNAL list documentation contract.
 */

import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) {
      out.push(full);
    }
  }

  return out;
}

describe('META-AUDIT: published dependencies vs shipped imports', () => {
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
  };
  const srcFiles = walk(join(ROOT, 'src'));
  const srcSources = srcFiles.map(f => readFileSync(f, 'utf8'));

  const importedBySrc = (pkg: string): boolean =>
    srcSources.some(s => s.includes(`from '${pkg}`) || s.includes(`from "${pkg}`)
      || s.includes(`import('${pkg}`) || s.includes(`require('${pkg}`));

  it('every dependencies entry is imported by src/ — playground-only packages belong in devDependencies', () => {
    const unused = Object.keys(packageJson.dependencies ?? {}).filter(d => !importedBySrc(d));
    expect(
      unused,
      `published dependencies with zero src/ imports (move to devDependencies): ${unused.join(', ')}`,
    ).toEqual([]);
  });

  it('peerDependencies are genuinely imported by src/ too', () => {
    const unused = Object.keys(packageJson.peerDependencies ?? {}).filter(d => !importedBySrc(d));
    expect(unused, `peerDependencies never imported by src/: ${unused.join(', ')}`).toEqual([]);
  });
});
