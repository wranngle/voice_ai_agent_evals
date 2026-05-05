#!/usr/bin/env bun
/**
 * Run gtm_ops through the voice_ai_agent_evals external-app adapter.
 */

import {parseArgs} from 'node:util';
import {runGtmOpsAdapter} from '../lib/testing/adapters/gtm-ops';

const {values} = parseArgs({
  options: {
    root: {type: 'string'},
    tag: {type: 'string', multiple: true},
    'include-disabled': {type: 'boolean'},
    json: {type: 'boolean', short: 'j'},
    help: {type: 'boolean', short: 'h'},
  },
});

function showHelp(): void {
  console.log(`
Run gtm_ops via the voice_ai_agent_evals adapter.

Usage:
  bun run scripts/run-gtm-ops-adapter.ts [options]

Options:
      --root <path>          Path to gtm_ops (default: ../gtm_ops)
      --tag <tag>            Run only commands carrying a manifest tag
      --include-disabled     Include disabled manifest commands
  -j, --json                 Print full JSON result
  -h, --help                 Show help
`);
}

if (values.help) {
  showHelp();
  process.exit(0);
}

const run = await runGtmOpsAdapter({
  projectRoot: values.root,
  tags: values.tag,
  includeDisabled: values['include-disabled'] ?? false,
});

if (values.json) {
  console.log(JSON.stringify(run, null, 2));
} else {
  console.log(`gtm_ops adapter: ${run.status}`);
  console.log(`total=${run.total} passed=${run.passed} failed=${run.failed} errors=${run.errors} skipped=${run.skipped}`);
  for (const result of run.results) {
    const marker = result.status === 'passed' ? 'PASS' : result.status.toUpperCase();
    console.log(`${marker} ${result.test_id} ${result.latency_ms}ms`);
    if (result.error_message) {
      console.log(`  ${result.error_message}`);
    }
  }
}

process.exit(run.status === 'passed' ? 0 : 1);
