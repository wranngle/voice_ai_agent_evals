# n8n workflow auto-corrector

`@wranngle/voice-evals/n8n` ports the archive's `layer2-workflow-corrector.js` into a typed module. Diagnose n8n workflow failures, apply targeted fixes, batch the PUT calls.

Direct REST calls — no `@n8n/rest-api-client` dep (axios + flatted + several other `@n8n/*` packages with opaque license). Lean by design.

## Critical invariant

Error handling lives at the **node level**, NOT inside `parameters`. The archive flagged this as the single most common bug:

```ts
// ✅ correct — node-level
{name: 'HTTP', type: '…', retryOnFail: true, maxTries: 3, onError: 'continueErrorOutput'}

// ❌ wrong — silently broken
{name: 'HTTP', type: '…', parameters: {retryOnFail: true, maxTries: 3}}
```

`NODE_LEVEL_PROPS` exports the canonical set: `onError`, `retryOnFail`, `maxTries`, `waitBetweenTries`, `continueOnFail`, `disabled`, `notes`, `position`.

`applyNodeUpdate` enforces the split:

- Bare keys in `NODE_LEVEL_PROPS` → `node[key] = value`
- `parameters.foo.bar` dot-notation → `setNestedValue(node.parameters, 'foo.bar', value)`
- Literal `parameters` key → shallow merge into `node.parameters`
- Anything else → applied at node level (defensive default)

## Quick reference — the 4 canonical fixes

```ts
import {WORKFLOW_FIXES} from '@wranngle/voice-evals/n8n';

WORKFLOW_FIXES.ADD_RETRY_LOGIC('HTTP')
// node-level: retryOnFail=true, maxTries=3, waitBetweenTries=1000

WORKFLOW_FIXES.ADD_ERROR_HANDLING('HTTP')
// node-level: onError='continueErrorOutput', continueOnFail=true

WORKFLOW_FIXES.ADD_TIMEOUT('HTTP', 5000)
// parameters.options.timeout = 5000

WORKFLOW_FIXES.FIX_WEBHOOK_DATA('HTTP', 'body.payload.email')
// parameters.body.payload.email = "={{ $json.body.email }}"
```

## End-to-end

```ts
import {createN8nCorrector} from '@wranngle/voice-evals/n8n';

const corrector = createN8nCorrector({
  apiKey: process.env.N8N_API_KEY!,
  baseUrl: process.env.N8N_BASE_URL!, // either /api/v1 or /
});

const diagnosis = corrector.diagnoseWorkflowFailure({
  workflowId: 'wf_42',
  errorMessage: 'ETIMEDOUT: HTTP request timed out',
  nodeName: 'HTTP',
});

if (diagnosis.confidence >= 0.5) {
  const result = await corrector.applyWorkflowFixes('wf_42', diagnosis.operations);
  console.log(`success=${result.success}`);
}
```

`applyWorkflowFixes` batches in groups of 5 (matches n8n MCP's per-call limit) and records per-batch success/failure without aborting the rest.

## Heuristics

`diagnoseWorkflowFailure` matches common error classes:

| Error substring | Operations emitted | Confidence |
|---|---|---|
| `timeout` / `ETIMEDOUT` | ADD_RETRY_LOGIC + ADD_TIMEOUT | 0.8 |
| `ECONNREFUSED` / `ENOTFOUND` | ADD_RETRY_LOGIC + ADD_ERROR_HANDLING | 0.8 |
| `undefined` / `Cannot read` | ADD_ERROR_HANDLING | 0.8 |
| anything else | (none) | 0.3 |

When the heuristic doesn't help, hand-build `NodeOperation[]` directly. The union covers `updateNode`, `addNode`, `removeNode`, `addConnection`, `removeConnection`, `updateSettings`, `updateName`.

## Pure local mutation (no network)

`applyOperation(workflow, op)` mutates a workflow object in place. Useful for unit tests + dry-runs:

```ts
import {applyOperation, type N8nWorkflow} from '@wranngle/voice-evals/n8n';

const workflow: N8nWorkflow = JSON.parse(readFileSync('workflow.json', 'utf8'));
applyOperation(workflow, WORKFLOW_FIXES.ADD_RETRY_LOGIC('HTTP'));
writeFileSync('workflow.fixed.json', JSON.stringify(workflow, null, 2));
```
