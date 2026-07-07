#!/usr/bin/env node
/**
 * @wranngle/voice-evals build orchestrator.
 *
 * Emits to dist/:
 *   index.js               — ESM bundle (the public library)
 *   index.cjs              — CJS bundle (for legacy Node consumers)
 *   cli.js                 — ESM bundle with #!/usr/bin/env node shebang + chmod +x
 *   <subpath>/index.js     — ESM bundle for each `exports[./<subpath>]` entry
 *   wrapper/tests.js       — ESM bundle for `exports[./tests-api]`
 *   *.d.ts                 — declarations from tsc --emitDeclarationOnly
 *
 * Each subpath listed in package.json `exports` (other than `.`) must have a
 * runtime file emitted here, otherwise consumers calling
 * `import … from '@wranngle/voice-evals/factory'` get ERR_MODULE_NOT_FOUND.
 *
 * The EXTERNAL array below lists three packages excluded from bundling:
 *   - `@elevenlabs/elevenlabs-js` — declared as a peerDependency; consumers
 *     bring their own copy so we don't double-bundle the SDK.
 *   - `arktype` + `yaml` — declared as regular `dependencies` (npm installs
 *     them automatically). Kept external because they ship their own ESM,
 *     are stable across versions, and inlining them inflates the dist/
 *     bundle 4-5× without runtime benefit.
 */

import {
  rm, readFile, writeFile, chmod,
} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';

const EXTERNAL = ['@elevenlabs/elevenlabs-js', 'arktype', 'yaml'];

const SUBPATH_ENTRIES = [
  {name: 'wrapper', entry: 'src/wrapper/index.ts', outdir: 'dist/wrapper'},
  {name: 'tests-api', entry: 'src/wrapper/tests.ts', outdir: 'dist/wrapper'},
  {name: 'scoring', entry: 'src/scoring/index.ts', outdir: 'dist/scoring'},
  {name: 'ingestion', entry: 'src/ingestion/index.ts', outdir: 'dist/ingestion'},
  {name: 'regression', entry: 'src/regression/index.ts', outdir: 'dist/regression'},
  {name: 'remediation', entry: 'src/remediation/index.ts', outdir: 'dist/remediation'},
  {name: 'factory', entry: 'src/factory/index.ts', outdir: 'dist/factory'},
  {name: 'n8n', entry: 'src/n8n/index.ts', outdir: 'dist/n8n'},
  {name: 'compare', entry: 'src/compare/index.ts', outdir: 'dist/compare'},
  {name: 'scenarios', entry: 'src/scenarios/index.ts', outdir: 'dist/scenarios'},
];

function run(cmd, args, label) {
  process.stdout.write(`  → ${label}\n`);
  const result = spawnSync(cmd, args, {stdio: 'inherit'});
  if (result.status !== 0) {
    process.stderr.write(`✗ ${label} failed (exit ${result.status})\n`);
    process.exit(result.status ?? 1);
  }
}

async function main() {
  process.stdout.write('build: @wranngle/voice-evals\n');

  await rm('dist', {recursive: true, force: true});

  const externalFlags = EXTERNAL.flatMap(spec => ['--external', spec]);

  run('bun', [
    'build',
    'src/index.ts',
    '--target=node',
    '--outdir=dist',
    '--format=esm',
    ...externalFlags,
  ], 'ESM bundle');

  run('bun', [
    'build',
    'src/index.ts',
    '--target=node',
    '--outfile=dist/index.cjs',
    '--format=cjs',
    ...externalFlags,
  ], 'CJS bundle');

  run('bun', [
    'build',
    'src/cli.ts',
    '--target=node',
    '--outdir=dist',
    '--format=esm',
    ...externalFlags,
  ], 'CLI bundle');

  // Prepend Node shebang to dist/cli.js and chmod +x. Bun's source shebang
  // is `#!/usr/bin/env bun` (right for dev); the published binary must use
  // Node so consumers without Bun can run `voice-evals`.
  const cliPath = 'dist/cli.js';
  if (!existsSync(cliPath)) {
    process.stderr.write(`✗ ${cliPath} missing after CLI bundle step\n`);
    process.exit(1);
  }

  const cliSource = await readFile(cliPath, 'utf8');
  const stripped = cliSource.startsWith('#!')
    ? cliSource.slice(cliSource.indexOf('\n') + 1)
    : cliSource;
  await writeFile(cliPath, `#!/usr/bin/env node\n${stripped}`);
  await chmod(cliPath, 0o755);

  for (const sub of SUBPATH_ENTRIES) {
    run('bun', [
      'build',
      sub.entry,
      '--target=node',
      `--outdir=${sub.outdir}`,
      '--format=esm',
      ...externalFlags,
    ], `subpath: ${sub.name} (${sub.entry} -> ${sub.outdir})`);
  }

  run('./node_modules/.bin/tsc', ['-p', 'tsconfig.build.json'], 'declarations');

  // Verify each declared export resolves to an emitted file.
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const missing = [];
  for (const [key, target] of Object.entries(pkg.exports ?? {})) {
    if (key === './package.json' || typeof target !== 'object') {
      continue;
    }

    const importPath = target.import ?? target.default;
    if (importPath && !existsSync(importPath.replace(/^\.\//, ''))) {
      missing.push(`${key} -> ${importPath}`);
    }
  }

  if (missing.length > 0) {
    process.stderr.write(`✗ exports without runtime files:\n  ${missing.join('\n  ')}\n`);
    process.exit(1);
  }

  process.stdout.write('✓ dist/ built\n');
}

await main();
