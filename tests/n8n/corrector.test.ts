import {
  describe, expect, it, vi,
} from 'vitest';
import {
  addErrorHandling, addRetryLogic, addTimeout, applyOperation,
  createN8nCorrector, fixWebhookData, NODE_LEVEL_PROPS,
  type N8nWorkflow, type NodeOperation,
} from '../../src/n8n';

function makeWorkflow(): N8nWorkflow {
  return {
    id: 'wf_1',
    name: 'demo',
    nodes: [
      {name: 'Webhook', type: 'n8n-nodes-base.webhook', parameters: {path: '/in'}},
      {name: 'HTTP', type: 'n8n-nodes-base.httpRequest', parameters: {url: 'https://x', options: {}}},
    ],
    connections: {
      Webhook: {main: [[{node: 'HTTP', type: 'main', index: 0}]]},
    },
  };
}

describe('NODE_LEVEL_PROPS contract', () => {
  it('contains the exact set the archive documented as node-level', () => {
    expect([...NODE_LEVEL_PROPS].sort()).toEqual([
      'continueOnFail',
      'disabled',
      'maxTries',
      'notes',
      'onError',
      'position',
      'retryOnFail',
      'waitBetweenTries',
    ]);
  });
});

describe('WORKFLOW_FIXES emit node-level vs parameters-level keys correctly', () => {
  it('addRetryLogic sets retryOnFail / maxTries / waitBetweenTries at node level', () => {
    const op = addRetryLogic('HTTP');
    if (op.type !== 'updateNode') {
      throw new Error('expected updateNode');
    }

    for (const key of Object.keys(op.changes)) {
      expect(NODE_LEVEL_PROPS.has(key)).toBe(true);
    }
  });

  it('addErrorHandling sets onError / continueOnFail at node level', () => {
    const op = addErrorHandling('HTTP');
    if (op.type !== 'updateNode') {
      throw new Error('expected updateNode');
    }

    for (const key of Object.keys(op.changes)) {
      expect(NODE_LEVEL_PROPS.has(key)).toBe(true);
    }
  });

  it('addTimeout targets parameters.options.timeout (NOT node level)', () => {
    const op = addTimeout('HTTP', 5000);
    if (op.type !== 'updateNode') {
      throw new Error('expected updateNode');
    }

    expect(Object.keys(op.changes)).toEqual(['parameters.options.timeout']);
    expect(op.changes['parameters.options.timeout']).toBe(5000);
  });

  it('fixWebhookData rewrites the parameter to $json.body.<leaf>', () => {
    const op = fixWebhookData('HTTP', 'body.payload.email');
    if (op.type !== 'updateNode') {
      throw new Error('expected updateNode');
    }

    const [key] = Object.keys(op.changes);
    expect(key).toBe('parameters.body.payload.email');
    expect(op.changes[key]).toBe('={{ $json.body.email }}');
  });
});

describe('applyOperation enforces the node-level vs parameters-level split', () => {
  it('applies retryOnFail at node level on updateNode', () => {
    const wf = makeWorkflow();
    applyOperation(wf, {
      type: 'updateNode',
      nodeName: 'HTTP',
      changes: {retryOnFail: true, maxTries: 3},
    });
    const http = wf.nodes.find(n => n.name === 'HTTP');
    expect(http?.retryOnFail).toBe(true);
    expect(http?.maxTries).toBe(3);
    // The CRITICAL inverse check: not nested inside parameters
    expect((http?.parameters)?.retryOnFail).toBeUndefined();
  });

  it('routes parameters.options.timeout via setNestedValue', () => {
    const wf = makeWorkflow();
    applyOperation(wf, {
      type: 'updateNode',
      nodeName: 'HTTP',
      changes: {'parameters.options.timeout': 5000},
    });
    const http = wf.nodes.find(n => n.name === 'HTTP');
    expect((http?.parameters as Record<string, Record<string, unknown>>).options.timeout).toBe(5000);
  });

  it('shallow-merges a literal `parameters` key', () => {
    const wf = makeWorkflow();
    applyOperation(wf, {
      type: 'updateNode',
      nodeName: 'HTTP',
      changes: {parameters: {method: 'POST'}},
    });
    const http = wf.nodes.find(n => n.name === 'HTTP');
    if (!http?.parameters) {
      throw new Error('expected http.parameters');
    }

    expect(http.parameters.method).toBe('POST');
    expect(http.parameters.url).toBe('https://x'); // preserved
  });

  it('addNode appends to nodes[]', () => {
    const wf = makeWorkflow();
    applyOperation(wf, {
      type: 'addNode',
      node: {name: 'Slack', type: 'n8n-nodes-base.slack'},
    });
    expect(wf.nodes.map(n => n.name)).toEqual(['Webhook', 'HTTP', 'Slack']);
  });

  it('removeNode drops the node + its connections', () => {
    const wf = makeWorkflow();
    applyOperation(wf, {type: 'removeNode', nodeName: 'HTTP'});
    expect(wf.nodes.map(n => n.name)).toEqual(['Webhook']);
    expect(wf.connections.Webhook.main[0]).toEqual([]);
  });

  it('addConnection appends to connections[source].main[sourceOutput]', () => {
    const wf = makeWorkflow();
    applyOperation(wf, {
      type: 'addNode',
      node: {name: 'Slack', type: 'n8n-nodes-base.slack'},
    });
    applyOperation(wf, {
      type: 'addConnection', source: 'HTTP', target: 'Slack',
    });
    expect(wf.connections.HTTP.main[0]).toEqual([{node: 'Slack', type: 'main', index: 0}]);
  });

  it('removeConnection drops the matching target', () => {
    const wf = makeWorkflow();
    applyOperation(wf, {
      type: 'removeConnection', source: 'Webhook', target: 'HTTP',
    });
    expect(wf.connections.Webhook.main[0]).toEqual([]);
  });

  it('updateSettings shallow-merges into workflow.settings', () => {
    const wf = makeWorkflow();
    applyOperation(wf, {type: 'updateSettings', settings: {executionTimeout: 60}});
    expect(wf.settings?.executionTimeout).toBe(60);
  });

  it('updateName mutates workflow.name', () => {
    const wf = makeWorkflow();
    applyOperation(wf, {type: 'updateName', name: 'renamed'});
    expect(wf.name).toBe('renamed');
  });

  it('throws when targeting a node that does not exist', () => {
    const wf = makeWorkflow();
    expect(() => {
      applyOperation(wf, {
        type: 'updateNode', nodeName: 'ghost', changes: {retryOnFail: true},
      });
    }).toThrow(/Node not found/);
  });
});

describe('createN8nCorrector — REST integration (mocked fetch)', () => {
  function makeFetch(opts: {workflow?: N8nWorkflow; updateOk?: boolean} = {}) {
    const wf = opts.workflow ?? makeWorkflow();
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === 'GET' || init?.method === undefined) {
        return new Response(JSON.stringify(wf), {status: 200});
      }

      if (init?.method === 'PUT') {
        if (opts.updateOk === false) {
          return new Response(JSON.stringify({error: 'nope'}), {status: 400});
        }

        return new Response(init.body as string, {status: 200});
      }

      return new Response('{}', {status: 200});
    }) as unknown as typeof globalThis.fetch;
    return {fetchImpl, wf};
  }

  it('getWorkflow GETs /api/v1/workflows/{id} with the api key header', async () => {
    const {fetchImpl} = makeFetch();
    const corrector = createN8nCorrector({
      apiKey: 'sk_test', baseUrl: 'https://n8n.example.com', fetchImpl,
    });
    const wf = await corrector.getWorkflow('wf_1');
    expect(wf.id).toBe('wf_1');

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe('https://n8n.example.com/api/v1/workflows/wf_1');
    const headers = calls[0][1].headers as Record<string, string>;
    expect(headers['X-N8N-API-KEY']).toBe('sk_test');
  });

  it('applyPartialUpdate fetches, mutates locally, PUTs the result', async () => {
    const {fetchImpl} = makeFetch();
    const corrector = createN8nCorrector({
      apiKey: 'sk', baseUrl: 'https://n8n.example.com', fetchImpl,
    });

    const ops: NodeOperation[] = [
      addRetryLogic('HTTP'),
      addTimeout('HTTP', 5000),
    ];
    await corrector.applyPartialUpdate('wf_1', ops);

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit]>;
    const putCall = calls.find(c => c[1].method === 'PUT');
    if (!putCall) {
      throw new Error('expected a PUT call');
    }

    const putBody = JSON.parse(putCall[1].body as string) as N8nWorkflow;
    const http = putBody.nodes.find(n => n.name === 'HTTP');
    expect(http?.retryOnFail).toBe(true);
    expect((http?.parameters as Record<string, Record<string, unknown>>).options.timeout).toBe(5000);
  });

  it('applyWorkflowFixes returns success=false when no ops provided', async () => {
    const {fetchImpl} = makeFetch();
    const corrector = createN8nCorrector({
      apiKey: 'sk', baseUrl: 'https://n8n.example.com', fetchImpl,
    });
    const out = await corrector.applyWorkflowFixes('wf_1', []);
    expect(out.success).toBe(false);
    expect(out.results).toHaveLength(0);
  });

  it('applyWorkflowFixes batches in groups of 5', async () => {
    const {fetchImpl} = makeFetch();
    const corrector = createN8nCorrector({
      apiKey: 'sk', baseUrl: 'https://n8n.example.com', fetchImpl,
    });
    const ops: NodeOperation[] = Array.from({length: 12}, () =>
      addRetryLogic('HTTP'));
    const out = await corrector.applyWorkflowFixes('wf_1', ops);
    expect(out.success).toBe(true);
    expect(out.results.map(r => r.batch.length)).toEqual([5, 5, 2]);
  });

  it('applyWorkflowFixes records per-batch errors without aborting subsequent batches', async () => {
    let putCount = 0;
    const wf = makeWorkflow();
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        putCount++;
        if (putCount === 1) {
          return new Response(JSON.stringify({error: 'bad'}), {status: 400});
        }

        return new Response(init.body as string, {status: 200});
      }

      return new Response(JSON.stringify(wf), {status: 200});
    }) as unknown as typeof globalThis.fetch;

    const corrector = createN8nCorrector({
      apiKey: 'sk', baseUrl: 'https://n8n.example.com', fetchImpl,
    });
    const ops: NodeOperation[] = Array.from({length: 8}, () =>
      addRetryLogic('HTTP'));
    const out = await corrector.applyWorkflowFixes('wf_1', ops);
    expect(out.success).toBe(false);
    expect(out.results[0].success).toBe(false);
    expect(out.results[1].success).toBe(true);
  });

  it('diagnoseWorkflowFailure emits retry+timeout for ETIMEDOUT', () => {
    const corrector = createN8nCorrector({
      apiKey: 'sk', baseUrl: 'https://n8n.example.com', fetchImpl: globalThis.fetch,
    });
    const out = corrector.diagnoseWorkflowFailure({
      workflowId: 'wf_1',
      errorMessage: 'ETIMEDOUT: HTTP request timed out',
      nodeName: 'HTTP',
    });
    expect(out.operations).toHaveLength(2);
    expect(out.confidence).toBeGreaterThan(0.5);
    const changeKeys = out.operations
      .filter((o): o is Extract<NodeOperation, {type: 'updateNode'}> => o.type === 'updateNode')
      .flatMap(o => Object.keys(o.changes));
    expect(changeKeys).toContain('retryOnFail');
    expect(changeKeys).toContain('parameters.options.timeout');
  });

  it('diagnoseWorkflowFailure emits retry+errorHandling for ECONNREFUSED', () => {
    const corrector = createN8nCorrector({
      apiKey: 'sk', baseUrl: 'https://n8n.example.com', fetchImpl: globalThis.fetch,
    });
    const out = corrector.diagnoseWorkflowFailure({
      workflowId: 'wf_1', errorMessage: 'ECONNREFUSED', nodeName: 'HTTP',
    });
    const keys = out.operations
      .filter((o): o is Extract<NodeOperation, {type: 'updateNode'}> => o.type === 'updateNode')
      .flatMap(o => Object.keys(o.changes));
    expect(keys).toContain('retryOnFail');
    expect(keys).toContain('onError');
  });

  it('diagnoseWorkflowFailure returns low confidence when nothing matches', () => {
    const corrector = createN8nCorrector({
      apiKey: 'sk', baseUrl: 'https://n8n.example.com', fetchImpl: globalThis.fetch,
    });
    const out = corrector.diagnoseWorkflowFailure({
      workflowId: 'wf_1', errorMessage: 'unrelated error', nodeName: 'HTTP',
    });
    expect(out.operations).toHaveLength(0);
    expect(out.confidence).toBe(0.3);
  });

  it('getWorkflow surfaces the n8n error body on non-200', async () => {
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({message: 'not found'}),
      {status: 404},
    )) as unknown as typeof globalThis.fetch;
    const corrector = createN8nCorrector({
      apiKey: 'sk', baseUrl: 'https://n8n.example.com', fetchImpl,
    });
    await expect(corrector.getWorkflow('missing')).rejects.toThrow(/not found/);
  });
});
