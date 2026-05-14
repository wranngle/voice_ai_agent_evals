/**
 * META-AUDIT: package.json `exports` ↔ scripts/build.mjs alignment.
 *
 * Every subpath under `exports` (other than `.` and `./package.json`) must
 * have a runtime file emitted by the build, otherwise published consumers
 * doing `import … from '@wranngle/voice-evals/<subpath>'` get
 * ERR_MODULE_NOT_FOUND. This test enforces the bidirectional invariant.
 */

import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';

type ExportEntry = {types?: string; import?: string; require?: string; default?: string};

describe('META-AUDIT: package exports ↔ build script', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
    exports: Record<string, ExportEntry | string>;
  };
  const buildScript = readFileSync('scripts/build.mjs', 'utf8');

  // The src/<dir>/index.ts entry points that the build script promises to
  // emit. Keep in lock-step with SUBPATH_ENTRIES in scripts/build.mjs.
  const declaredSubpaths = Object.entries(pkg.exports)
    .filter(([key]) => key !== '.' && key !== './package.json')
    .map(([key, value]) => ({
      key,
      importTarget: typeof value === 'string'
        ? value
        : value.import ?? value.default ?? '',
    }));

  for (const {key, importTarget} of declaredSubpaths) {
    it(`exports["${key}"] points at a path the build emits: ${importTarget}`, () => {
      // The path must be referenced in scripts/build.mjs either via the
      // entry SUBPATH_ENTRIES table (preferred) or directly as an outfile.
      // We grep for the trailing path fragment after `dist/` because the
      // SUBPATH_ENTRIES table lists outdirs, not full filenames.
      const fragment = importTarget.replace(/^\.\/dist\//, '');
      const dirFragment = fragment.replace(/\/[^/]+$/, '');
      expect(
        buildScript.includes(fragment) || buildScript.includes(dirFragment),
        `scripts/build.mjs does not mention ${importTarget}; consumers will hit ERR_MODULE_NOT_FOUND`,
      ).toBe(true);
    });
  }

  it('root export ./ has both import and require targets', () => {
    const root = pkg.exports['.'];
    expect(typeof root).toBe('object');
    if (typeof root === 'object') {
      expect(root.import).toBeTruthy();
      expect(root.require).toBeTruthy();
    }
  });
});
