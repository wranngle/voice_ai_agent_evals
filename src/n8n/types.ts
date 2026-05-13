/**
 * @wranngle/voice-evals/n8n — types for the n8n workflow corrector.
 *
 * Minimal subset of the n8n REST API shape. We don't import @n8n/api-types
 * because that package pulls in axios + n8n-workflow + several internal
 * @n8n packages we don't need (and has an opaque license).
 *
 * CRITICAL INVARIANT: error handling lives at the **node level**, NOT inside
 * `parameters`. The archive's `layer2-workflow-corrector.js` documented this
 * as a frequent bug source — agents would write `parameters.retryOnFail`
 * thinking it was equivalent. It is not.
 *
 *   ✅ node-level:    { name, type, retryOnFail, maxTries, onError, ... }
 *   ❌ wrong:         { name, parameters: { retryOnFail: true } }
 *
 * The `applyNodeUpdate` function preserves the split: keys in
 * `NODE_LEVEL_PROPS` go on the node; `parameters.*` dot-notation keys go
 * into `parameters` via setNestedValue; the literal key `parameters` is
 * shallow-merged into the existing parameters object.
 */

export type N8nNodeName = string;

export type N8nNode = {
  /** Stable index signature kept first per linter rule. */
  [extra: string]: unknown;
  name: N8nNodeName;
  type: string;
  parameters?: Record<string, unknown>;
  position?: [number, number];
  /** Node-level error handling. */
  onError?: 'continueRegularOutput' | 'continueErrorOutput' | 'stopWorkflow' | string;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  continueOnFail?: boolean;
  disabled?: boolean;
  notes?: string;
};

export type N8nConnectionTarget = {
  node: N8nNodeName;
  type: string;
  index: number;
};

/**
 * n8n connection map: `connections[sourceNodeName].main[outputIndex]` is an
 * array of `{node, type, index}` connection targets.
 */
export type N8nConnectionMap = Record<N8nNodeName, {main: N8nConnectionTarget[][]}>;

export type N8nWorkflow = {
  id?: string;
  name?: string;
  nodes: N8nNode[];
  connections: N8nConnectionMap;
  settings?: Record<string, unknown>;
  active?: boolean;
};

/**
 * Properties that live at the **node** level rather than inside `parameters`.
 * Agents writing changes targeting any of these keys without `parameters.`
 * prefix have them applied at node level.
 */
export const NODE_LEVEL_PROPS = new Set<string>([
  'onError',
  'retryOnFail',
  'maxTries',
  'waitBetweenTries',
  'continueOnFail',
  'disabled',
  'notes',
  'position',
]);

/**
 * A single change to a node. Three input formats are supported:
 *   - bare property name (e.g. `retryOnFail`) — applied at node level
 *   - `parameters.foo.bar` dot-notation — sets the nested parameter
 *   - `parameters` — shallow-merge into the existing parameters object
 */
export type NodeChanges = Record<string, unknown>;

export type NodeOperation =
  | {type: 'updateNode'; nodeName: N8nNodeName; changes: NodeChanges}
  | {type: 'addNode'; node: N8nNode; afterNode?: N8nNodeName}
  | {type: 'removeNode'; nodeName: N8nNodeName}
  | {type: 'addConnection'; source: N8nNodeName; target: N8nNodeName; sourceOutput?: number; targetInput?: number}
  | {type: 'removeConnection'; source: N8nNodeName; target: N8nNodeName}
  | {type: 'updateSettings'; settings: Record<string, unknown>}
  | {type: 'updateName'; name: string};

export type WorkflowFailureContext = {
  workflowId: string;
  errorMessage?: string;
  nodeName?: N8nNodeName;
  /** Optional category hint from the caller's diagnostics (e.g. 'timeout', 'auth'). */
  category?: string;
};

export type WorkflowDiagnosis = {
  workflowId: string;
  operations: NodeOperation[];
  /** 0-1 confidence that the operations will fix the failure. */
  confidence: number;
};

export type N8nCorrectorClient = {
  /** GET /api/v1/workflows/{id} */
  getWorkflow(workflowId: string): Promise<N8nWorkflow>;
  /** PUT /api/v1/workflows/{id} — full replacement. */
  updateWorkflowFull(workflowId: string, workflow: N8nWorkflow): Promise<N8nWorkflow>;
  /** Diff-apply: fetch, mutate locally, PUT. Batches of 5 ops per request. */
  applyPartialUpdate(workflowId: string, operations: NodeOperation[]): Promise<N8nWorkflow>;
  /** Heuristic diagnosis: map an error message to suggested operations. */
  diagnoseWorkflowFailure(context: WorkflowFailureContext): WorkflowDiagnosis;
  /** End-to-end: diagnose -> applyPartialUpdate (batched). */
  applyWorkflowFixes(workflowId: string, operations: NodeOperation[]): Promise<{
    success: boolean;
    results: Array<{success: boolean; batch: NodeOperation[]; error?: string}>;
    timestamp: string;
  }>;
};

export type N8nCorrectorOptions = {
  /** API key for `X-N8N-API-KEY` header. */
  apiKey: string;
  /** Base URL of the n8n instance. Trailing `/api/v1` is optional. */
  baseUrl: string;
  /** Override the fetch implementation (for testing). Defaults to global fetch. */
  fetchImpl?: typeof globalThis.fetch;
};
