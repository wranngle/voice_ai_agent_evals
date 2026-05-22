/**
 * @wranngle/voice-evals/n8n/corrector — n8n workflow auto-corrector.
 *
 * Ports `layer2-workflow-corrector.js` from the archive.
 *
 *   const corrector = createN8nCorrector({apiKey, baseUrl});
 *   const ops = corrector.diagnoseWorkflowFailure({workflowId, errorMessage, nodeName});
 *   await corrector.applyWorkflowFixes(workflowId, ops.operations);
 *
 * Direct REST calls — no @n8n/rest-api-client dep (axios + flatted + several
 * other @n8n packages with opaque license). Keep it lean.
 *
 * CRITICAL INVARIANT (repeated from types.ts because it matters):
 * onError / retryOnFail / maxTries / waitBetweenTries / continueOnFail are
 * **NODE-LEVEL**, not parameter-level. `applyNodeUpdate` enforces the split.
 */

import {normalizeN8nApiUrl} from '../n8n-url';
import {addErrorHandling, addRetryLogic, addTimeout} from './patterns';
import {
  NODE_LEVEL_PROPS,
  type N8nCorrectorClient,
  type N8nCorrectorOptions,
  type N8nWorkflow,
  type NodeChanges,
  type NodeOperation,
  type WorkflowDiagnosis,
  type WorkflowFailureContext,
} from './types';

const BATCH_SIZE = 5;

export function createN8nCorrector(options: N8nCorrectorOptions): N8nCorrectorClient {
  const base = normalizeN8nApiUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  async function request(
    method: 'GET' | 'PUT' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<{status: number; data: unknown}> {
    const url = `${base}${path}`;
    const response = await fetchImpl(url, {
      method,
      headers: {
        'X-N8N-API-KEY': options.apiKey,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let data: unknown;
    try {
      data = text === '' ? null : JSON.parse(text);
    } catch {
      data = text;
    }

    return {status: response.status, data};
  }

  async function getWorkflow(workflowId: string): Promise<N8nWorkflow> {
    const result = await request('GET', `/workflows/${workflowId}`);
    if (result.status !== 200) {
      throw new Error(`Failed to get workflow ${workflowId}: ${describeError(result.data)}`);
    }

    return result.data as N8nWorkflow;
  }

  async function updateWorkflowFull(workflowId: string, workflow: N8nWorkflow): Promise<N8nWorkflow> {
    const result = await request('PUT', `/workflows/${workflowId}`, workflow);
    if (result.status !== 200) {
      throw new Error(`Failed to update workflow ${workflowId}: ${describeError(result.data)}`);
    }

    return result.data as N8nWorkflow;
  }

  async function applyPartialUpdate(workflowId: string, operations: NodeOperation[]): Promise<N8nWorkflow> {
    const workflow = await getWorkflow(workflowId);
    for (const op of operations) {
      applyOperation(workflow, op);
    }

    return updateWorkflowFull(workflowId, workflow);
  }

  function diagnoseWorkflowFailure(context: WorkflowFailureContext): WorkflowDiagnosis {
    const operations: NodeOperation[] = [];
    const errorMessage = context.errorMessage ?? '';
    const {nodeName} = context;

    if (nodeName) {
      if (/timeout|etimedout/i.test(errorMessage)) {
        operations.push(addRetryLogic(nodeName), addTimeout(nodeName));
      }

      if (/econnrefused|enotfound/i.test(errorMessage)) {
        operations.push(addRetryLogic(nodeName), addErrorHandling(nodeName));
      }

      if (/undefined|cannot read/i.test(errorMessage)) {
        operations.push(addErrorHandling(nodeName));
      }
    }

    return {
      workflowId: context.workflowId,
      operations,
      confidence: operations.length > 0 ? 0.8 : 0.3,
    };
  }

  async function applyWorkflowFixes(workflowId: string, operations: NodeOperation[]) {
    if (operations.length === 0) {
      return {
        success: false,
        results: [],
        timestamp: new Date().toISOString(),
      };
    }

    const batches: NodeOperation[][] = [];
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      batches.push(operations.slice(i, i + BATCH_SIZE));
    }

    const results: Array<{success: boolean; batch: NodeOperation[]; error?: string}> = [];
    for (const batch of batches) {
      try {
        await applyPartialUpdate(workflowId, batch);
        results.push({success: true, batch});
      } catch (error: unknown) {
        results.push({
          success: false,
          batch,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: results.every(r => r.success),
      results,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    getWorkflow,
    updateWorkflowFull,
    applyPartialUpdate,
    diagnoseWorkflowFailure,
    applyWorkflowFixes,
  };
}

function describeError(data: unknown): string {
  if (data === null || data === undefined) {
    return 'no response body';
  }

  if (typeof data === 'string') {
    return data;
  }

  return JSON.stringify(data);
}

/**
 * Mutates `workflow` in place to apply `op`.
 * Pure on its inputs in the sense that the input ops + workflow snapshot
 * fully determine the output — but it does mutate the workflow object.
 */
export function applyOperation(workflow: N8nWorkflow, op: NodeOperation): void {
  switch (op.type) {
    case 'updateNode': {
      applyNodeUpdate(workflow, op.nodeName, op.changes);
      return;
    }

    case 'addNode': {
      workflow.nodes.push(op.node);
      return;
    }

    case 'removeNode': {
      workflow.nodes = workflow.nodes.filter(n => n.name !== op.nodeName);
      const {[op.nodeName]: _removed, ...remaining} = workflow.connections;
      workflow.connections = remaining;
      for (const conns of Object.values(workflow.connections)) {
        for (const branch of conns.main ?? []) {
          const filtered = branch.filter(c => c.node !== op.nodeName);
          branch.length = 0;
          branch.push(...filtered);
        }
      }

      return;
    }

    case 'addConnection': {
      addConnection({
        workflow,
        source: op.source,
        target: op.target,
        sourceOutput: op.sourceOutput ?? 0,
        targetInput: op.targetInput ?? 0,
      });
      return;
    }

    case 'removeConnection': {
      removeConnection(workflow, op.source, op.target);
      return;
    }

    case 'updateSettings': {
      workflow.settings = {...workflow.settings, ...op.settings};
      return;
    }

    case 'updateName': {
      workflow.name = op.name;
    }
  }
}

/**
 * The critical function: handle node-level vs parameters-level keys.
 *
 *   - bare key in NODE_LEVEL_PROPS    -> node[key] = value
 *   - `parameters.foo.bar` dot-key    -> setNestedValue(node.parameters, 'foo.bar', value)
 *   - literal `parameters` key        -> shallow merge into node.parameters
 *   - anything else                   -> applied at node level (defensive default)
 */
function applyNodeUpdate(workflow: N8nWorkflow, nodeName: string, changes: NodeChanges): void {
  const node = workflow.nodes.find(n => n.name === nodeName);
  if (!node) {
    throw new Error(`Node not found: ${nodeName}`);
  }

  for (const [key, value] of Object.entries(changes)) {
    if (NODE_LEVEL_PROPS.has(key)) {
      node[key] = value;
    } else if (key.startsWith('parameters.')) {
      const paramKey = key.slice('parameters.'.length);
      node.parameters ??= {};
      setNestedValue(node.parameters, paramKey, value);
    } else if (key === 'parameters' && value !== null && typeof value === 'object') {
      node.parameters = {...node.parameters, ...value as Record<string, unknown>};
    } else {
      node[key] = value;
    }
  }
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = current[part];
    if (next === undefined || next === null || typeof next !== 'object') {
      current[part] = {};
    }

    current = current[part] as Record<string, unknown>;
  }

  const leaf = parts.at(-1);
  if (leaf !== undefined) {
    current[leaf] = value;
  }
}

function addConnection(input: {
  workflow: N8nWorkflow;
  source: string;
  target: string;
  sourceOutput: number;
  targetInput: number;
}): void {
  const {
    workflow, source, target, sourceOutput, targetInput,
  } = input;
  workflow.connections[source] ??= {main: [[]]};
  while (workflow.connections[source].main.length <= sourceOutput) {
    workflow.connections[source].main.push([]);
  }

  workflow.connections[source].main[sourceOutput].push({
    node: target,
    type: 'main',
    index: targetInput,
  });
}

function removeConnection(workflow: N8nWorkflow, source: string, target: string): void {
  const conns = workflow.connections[source];
  if (!conns) {
    return;
  }

  for (const branch of conns.main ?? []) {
    const idx = branch.findIndex(c => c.node === target);
    if (idx !== -1) {
      branch.splice(idx, 1);
    }
  }
}
