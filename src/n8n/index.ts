/**
 * @wranngle/voice-evals/n8n — n8n workflow auto-corrector (Phase 2 of the
 * archive's supersystem).
 *
 * Public surface:
 *   createN8nCorrector({apiKey, baseUrl}) -> N8nCorrectorClient
 *   WORKFLOW_FIXES.{ADD_RETRY_LOGIC, ADD_ERROR_HANDLING, FIX_WEBHOOK_DATA, ADD_TIMEOUT}
 *   applyOperation(workflow, op)   - pure local mutation, useful for tests / dry-runs
 *
 * Node-level vs parameters-level key separation is enforced by
 * `applyNodeUpdate` — see types.ts for the canonical NODE_LEVEL_PROPS set.
 */

export {applyOperation, createN8nCorrector} from './corrector';
export {
  addErrorHandling, addRetryLogic, addTimeout, fixWebhookData, WORKFLOW_FIXES,
} from './patterns';
export type {WorkflowFixId} from './patterns';
export {NODE_LEVEL_PROPS} from './types';
export type {
  N8nConnectionMap,
  N8nConnectionTarget,
  N8nCorrectorClient,
  N8nCorrectorOptions,
  N8nNode,
  N8nNodeName,
  N8nWorkflow,
  NodeChanges,
  NodeOperation,
  WorkflowDiagnosis,
  WorkflowFailureContext,
} from './types';
