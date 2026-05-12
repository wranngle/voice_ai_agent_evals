#!/usr/bin/env node
/**
 * @wranngle/voice-evals build orchestrator.
 *
 * Emits to dist/:
 *   index.js  — ESM bundle (the public library)
 *   index.cjs — CJS bundle (for legacy Node consumers)
 *   cli.js    — ESM bundle with #!/usr/bin/env node shebang + chmod +x
 *   *.d.ts    — declarations from tsc --emitDeclarationOnly
 *
 * @elevenlabs/elevenlabs-js is marked external (peerDependency); consumers
 * bring their own copy so we don't double-bundle the SDK.
 */

import {
  rm, readFile, writeFile, chmod,
} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';

const EXTERNAL = ['@elevenlabs/elevenlabs-js', 'arktype'];

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

  run('./node_modules/.bin/tsc', ['-p', 'tsconfig.build.json'], 'declarations');

  process.stdout.write('✓ dist/ built\n');
}

await main();
