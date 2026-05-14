/**
 * @wranngle/voice-evals/n8n/patterns — canonical workflow fix patterns.
 *
 * Ports `WORKFLOW_FIXES` from the archive's
 * `supersystem/layer2-workflow-corrector.js`. Each fix factory emits a single
 * `NodeOperation` that can be passed to `applyPartialUpdate`.
 *
 * Every fix is intentionally small and reversible — apply 1-3 per workflow,
 * not 20.
 */

import type {N8nNodeName, NodeOperation} from './types';

/**
 * Add retry logic to a node (HTTP requests, webhooks, etc.).
 *   retryOnFail=true, maxTries=3, waitBetweenTries=1000ms
 * Sits at the **node level**, NOT inside `parameters`.
 */
export function addRetryLogic(nodeName: N8nNodeName): NodeOperation {
  return {
    type: 'updateNode',
    nodeName,
    changes: {
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 1000,
    },
  };
}

/**
 * Add error handling: continue on error and route through the error output
 * branch so downstream nodes can react.
 *   onError='continueErrorOutput', continueOnFail=true
 * Sits at the **node level**.
 */
export function addErrorHandling(nodeName: N8nNodeName): NodeOperation {
  return {
    type: 'updateNode',
    nodeName,
    changes: {
      onError: 'continueErrorOutput',
      continueOnFail: true,
    },
  };
}

/**
 * Fix the common webhook-data-access mistake: agents often access
 * `$json.fieldName` directly when the webhook payload nests it under
 * `$json.body.fieldName`. This rewrites a single parameter to use
 * `$json.body.<leaf>`.
 *
 * `parameters.` prefix indicates the change targets a nested parameter,
 * NOT a node-level property.
 */
export function fixWebhookData(nodeName: N8nNodeName, fieldPath: string): NodeOperation {
  const parts = fieldPath.split('.');
  const leaf = parts.at(-1) ?? fieldPath;
  return {
    type: 'updateNode',
    nodeName,
    changes: {
      [`parameters.${fieldPath}`]: `={{ $json.body.${leaf} }}`,
    },
  };
}

/**
 * Add a request timeout to an HTTP / API node.
 *   parameters.options.timeout = <ms>
 * Sits inside `parameters.options` — NOT a node-level property.
 */
export function addTimeout(nodeName: N8nNodeName, timeoutMs = 30_000): NodeOperation {
  return {
    type: 'updateNode',
    nodeName,
    changes: {
      'parameters.options.timeout': timeoutMs,
    },
  };
}

export const WORKFLOW_FIXES = {
  ADD_RETRY_LOGIC: addRetryLogic,
  ADD_ERROR_HANDLING: addErrorHandling,
  FIX_WEBHOOK_DATA: fixWebhookData,
  ADD_TIMEOUT: addTimeout,
} as const;

export type WorkflowFixId = keyof typeof WORKFLOW_FIXES;
