#!/usr/bin/env node
/**
 * Deploy the three ElevenLabs webhook workflows to n8n via REST API.
 *
 * Uses the builders in scripts/build-elevenlabs-workflows.mjs so the workflow
 * JSON is generated fresh each run with a runtime-injected secret and
 * destination URLs. Keeps the secret out of git.
 *
 * Env:
 *   N8N_API_URL                            n8n REST base (e.g. https://n8n.example.com/api/v1)
 *   N8N_API_KEY                            n8n API key
 *   ELEVENLABS_POST_CALL_WEBHOOK_SECRET    wsec_* secret from workspace webhook registration
 *   EVALS_INGEST_URL                       (optional) downstream URL for post_call_transcription
 *   AUDIO_SINK_URL                         (optional) downstream URL for post_call_audio
 *   ALERT_WEBHOOK_URL                      (optional) downstream URL for call_initiation_failure
 *
 * Idempotent: if a workflow with the target name already exists, PUTs the
 * update. Otherwise POSTs to create. Either way, deactivates → updates →
 * reactivates so the webhook router picks up node changes.
 */

import {writeFileSync, existsSync, mkdirSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildPostCallWorkflow, buildMonitoringWorkflow, buildClientInitiationWorkflow} from './build-elevenlabs-workflows.mjs';
import {createTracer} from './lib/jsonl-trace.mjs';

const trace = createTracer('script.deploy-n8n-workflows');
trace.info('start');

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), '..');

const N8N_API_URL = (process.env.N8N_API_URL || '').replace(/\/$/, '');
const N8N_API_KEY = process.env.N8N_API_KEY;
if (!N8N_API_URL || !N8N_API_KEY) {
  console.error('N8N_API_URL and N8N_API_KEY required');
  process.exit(2);
}

const SECRET = process.env.ELEVENLABS_POST_CALL_WEBHOOK_SECRET;
if (!SECRET) {
  console.error('ELEVENLABS_POST_CALL_WEBHOOK_SECRET required (rotate via scripts/rotate-post-call-webhook.mjs if needed)');
  process.exit(2);
}

const INGEST_URL = process.env.EVALS_INGEST_URL || '';
const AUDIO_SINK_URL = process.env.AUDIO_SINK_URL || '';
const ALERT_WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL || '';

const API_BASE = N8N_API_URL.endsWith('/api/v1') ? N8N_API_URL : `${N8N_API_URL}/api/v1`;
const PUBLIC_BASE = N8N_API_URL.replace(/\/api\/v1$/, '');

async function n8n(path, init = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

async function findByName(name) {
  const r = await n8n(`/workflows?name=${encodeURIComponent(name)}`);
  if (!r.ok) return null;
  const j = await r.json();
  const list = j.data || j;
  return Array.isArray(list) ? list.find(w => w.name === name) : null;
}

async function deploy(builderOutput) {
  const {name, nodes, connections, settings} = builderOutput;
  const existing = await findByName(name);
  const body = {name, nodes, connections, settings};

  let resp;
  if (existing) {
    console.log(`  ${name}: PUT update (id=${existing.id})`);
    await n8n(`/workflows/${existing.id}/deactivate`, {method: 'POST'});
    resp = await n8n(`/workflows/${existing.id}`, {method: 'PUT', body: JSON.stringify(body)});
  } else {
    console.log(`  ${name}: POST create`);
    resp = await n8n('/workflows', {method: 'POST', body: JSON.stringify(body)});
  }

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`  ${name}: FAILED HTTP ${resp.status}: ${errBody}`);
    trace.error('deploy_failed', {workflow: name, http: resp.status, body: errBody});
    return null;
  }
  const result = await resp.json();
  const wf = result.data || result;

  const act = await n8n(`/workflows/${wf.id}/activate`, {method: 'POST'});
  console.log(`  ${name}: id=${wf.id} active=true (activate HTTP ${act.status})`);
  trace.info('deployed', {workflow: name, id: wf.id, activate_http: act.status});

  const webhookPath = nodes.find(n => n.type === 'n8n-nodes-base.webhook')?.parameters?.path;
  return {id: wf.id, name, webhook_url: `${PUBLIC_BASE}/webhook/${webhookPath}`};
}

console.log(`\nDeploying to ${PUBLIC_BASE} ...\n`);

const post = await deploy(buildPostCallWorkflow({secret: SECRET, ingestUrl: INGEST_URL, audioSinkUrl: AUDIO_SINK_URL, alertWebhookUrl: ALERT_WEBHOOK_URL}));
const mon = await deploy(buildMonitoringWorkflow({secret: SECRET, ingestUrl: INGEST_URL}));
const init = await deploy(buildClientInitiationWorkflow());

const registry = {
  deployed_at: new Date().toISOString(),
  n8n_base: PUBLIC_BASE,
  workflows: {
    elevenlabs_post_call_webhook: post,
    elevenlabs_monitoring_webhook: mon,
    elevenlabs_client_initiation_data_webhook: init,
  },
  downstream_env: {
    EVALS_INGEST_URL: INGEST_URL || '(unset — post_call_transcription terminates at execution log)',
    AUDIO_SINK_URL: AUDIO_SINK_URL || '(unset — post_call_audio terminates at execution log)',
    ALERT_WEBHOOK_URL: ALERT_WEBHOOK_URL || '(unset — call_initiation_failure terminates at execution log)',
  },
};

const snapshotsDir = join(ROOT, 'snapshots');
if (!existsSync(snapshotsDir)) mkdirSync(snapshotsDir, {recursive: true});
const registryPath = join(snapshotsDir, `n8n-webhooks-${new Date().toISOString().slice(0, 10)}.json`);
writeFileSync(registryPath, JSON.stringify(registry, null, 2));
console.log(`\nRegistry: ${registryPath}`);
trace.info('end', {registry: registryPath, post: post?.id, mon: mon?.id, init: init?.id});
