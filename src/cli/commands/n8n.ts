/**
 * `voice-evals n8n <subcommand>` — n8n workflow CLI.
 *
 *   diagnose <workflow-id> <error-message> [--node <name>]
 *       Map an error string to a list of recommended NodeOperations. Prints
 *       JSON to stdout — pipe to `voice-evals n8n fix --ops -` to apply.
 *
 *   fix <workflow-id> --ops <file|->
 *       Apply a NodeOperation[] (JSON) to a workflow.
 *
 *   eval --config <yaml-or-json>
 *       Run the black-box workflow eval suite (Layer 7) + print summary.
 *
 * Requires N8N_API_KEY + N8N_BASE_URL in env.
 */

import {existsSync, readFileSync} from 'node:fs';
import {parse as parseYaml} from 'yaml';
import {createN8nCorrector} from '../../n8n/corrector';
import {evaluateWorkflows, type WorkflowEvalConfig} from '../../n8n/workflow-eval';
import type {NodeOperation} from '../../n8n/types';

export type N8nDispatchOptions = {
  argv: readonly string[];
  out?: (line: string) => void;
};

export async function dispatchN8n(options: N8nDispatchOptions): Promise<number> {
  const out = options.out ?? ((line: string) => {
    process.stdout.write(`${line}\n`);
  });
  const subcommand = options.argv[0];

  if (!subcommand || subcommand === '--help' || subcommand === '-h') {
    out('voice-evals n8n <subcommand>');
    out('');
    out('  diagnose <workflow-id> <error-message> [--node <name>]');
    out('  fix <workflow-id> --ops <file|->');
    out('  eval --config <yaml-or-json>');
    return 0;
  }

  switch (subcommand) {
    case 'diagnose': {
      return runDiagnose(options.argv, out);
    }

    case 'fix': {
      return runFix(options.argv, out);
    }

    case 'eval': {
      return runEval(options.argv, out);
    }

    default: {
      out(`unknown n8n subcommand: ${subcommand}`);
      return 1;
    }
  }
}

function runDiagnose(argv: readonly string[], out: (line: string) => void): number {
  const workflowId = argv[1];
  const errorMessage = argv[2];
  if (!workflowId || !errorMessage) {
    out('error: voice-evals n8n diagnose <workflow-id> <error-message> required');
    return 1;
  }

  const node = readStringFlag(argv, '--node');
  const corrector = buildCorrector(out);
  if (!corrector) {
    return 1;
  }

  const diagnosis = corrector.diagnoseWorkflowFailure({workflowId, errorMessage, nodeName: node});
  out(JSON.stringify(diagnosis, null, 2));
  return diagnosis.operations.length > 0 ? 0 : 1;
}

async function runFix(argv: readonly string[], out: (line: string) => void): Promise<number> {
  const workflowId = argv[1];
  const opsPath = readStringFlag(argv, '--ops');
  if (!workflowId || !opsPath) {
    out('error: voice-evals n8n fix <workflow-id> --ops <file|-> required');
    return 1;
  }

  let opsText: string;
  if (opsPath === '-') {
    opsText = readFileSync(0, 'utf8'); // stdin
  } else {
    if (!existsSync(opsPath)) {
      out(`error: ops file not found: ${opsPath}`);
      return 1;
    }

    opsText = readFileSync(opsPath, 'utf8');
  }

  let operations: NodeOperation[];
  try {
    const parsed = JSON.parse(opsText) as unknown;
    operations = Array.isArray(parsed) ? parsed as NodeOperation[] : (parsed as {operations: NodeOperation[]}).operations;
  } catch (error: unknown) {
    out(`error: failed to parse ops JSON: ${(error as Error).message}`);
    return 1;
  }

  const corrector = buildCorrector(out);
  if (!corrector) {
    return 1;
  }

  const result = await corrector.applyWorkflowFixes(workflowId, operations);
  out(`success=${result.success}, batches=${result.results.length}`);
  return result.success ? 0 : 1;
}

async function runEval(argv: readonly string[], out: (line: string) => void): Promise<number> {
  const configPath = readStringFlag(argv, '--config');
  if (!configPath) {
    out('error: voice-evals n8n eval --config <yaml-or-json> required');
    return 1;
  }

  if (!existsSync(configPath)) {
    out(`error: config file not found: ${configPath}`);
    return 1;
  }

  const text = readFileSync(configPath, 'utf8');
  let config: WorkflowEvalConfig;
  try {
    config = configPath.endsWith('.json')
      ? JSON.parse(text) as WorkflowEvalConfig
      : parseYaml(text) as WorkflowEvalConfig;
  } catch (error: unknown) {
    out(`error: failed to parse config: ${(error as Error).message}`);
    return 1;
  }

  const result = await evaluateWorkflows(config);
  out(`Total: ${result.summary.total_tests}  Passed: ${result.summary.passed}  Failed: ${result.summary.failed}  Errors: ${result.summary.errors}  Pass rate: ${result.summary.pass_rate.toFixed(1)}%`);
  for (const wf of result.workflows) {
    out(`  ${wf.id}: ${wf.summary.passed}/${wf.summary.total} (${wf.summary.pass_rate.toFixed(1)}%)`);
  }

  return result.summary.failed === 0 && result.summary.errors === 0 ? 0 : 1;
}

function buildCorrector(out: (line: string) => void): ReturnType<typeof createN8nCorrector> | undefined {
  const apiKey = process.env.N8N_API_KEY;
  const baseUrl = process.env.N8N_BASE_URL;
  if (!apiKey || !baseUrl) {
    out('error: N8N_API_KEY and N8N_BASE_URL env vars required');
    return undefined;
  }

  return createN8nCorrector({apiKey, baseUrl});
}

function readStringFlag(argv: readonly string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) {
    return undefined;
  }

  return argv[idx + 1];
}
