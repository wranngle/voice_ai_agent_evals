#!/usr/bin/env node
/**
 * Deploy the three n8n workflows defined under templates/n8n-workflows/ via the n8n REST API.
 * Skips create if a workflow with the same name already exists; PATCHes instead.
 *
 * Env:  N8N_API_URL  (e.g. https://your-n8n.example.com)  — trailing slash trimmed
 *       N8N_API_KEY  (X-N8N-API-KEY)
 */

import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const N8N_API_URL = (process.env.N8N_API_URL || '').replace(/\/$/, '');
const N8N_API_KEY = process.env.N8N_API_KEY;
if (!N8N_API_URL || !N8N_API_KEY) {
  console.error('N8N_API_URL and N8N_API_KEY required');
  process.exit(2);
}

const apiBase = N8N_API_URL.endsWith('/api/v1') ? N8N_API_URL : `${N8N_API_URL}/api/v1`;

const WORKFLOWS = [
  'elevenlabs_client_initiation_data_webhook',
  'elevenlabs_post_call_webhook',
  'elevenlabs_monitoring_webhook',
];

const registry = {deployed_at: new Date().toISOString(), workflows: {}};

async function n8nFetch(path, init = {}) {
  const r = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      'X-N8N-API-KEY': N8N_API_KEY,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  return r;
}

async function findExisting(name) {
  const r = await n8nFetch(`/workflows?name=${encodeURIComponent(name)}`);
  if (!r.ok) return null;
  const j = await r.json();
  const list = j.data || j;
  return Array.isArray(list) ? list.find(w => w.name === name) : null;
}

for (const wfName of WORKFLOWS) {
  const path = join(process.cwd(), 'templates', 'n8n-workflows', `${wfName}.json`);
  const body = JSON.parse(readFileSync(path, 'utf8'));

  console.log(`\n→ ${wfName}`);
  const existing = await findExisting(wfName);

  let resp;
  if (existing) {
    console.log(`  Found existing id=${existing.id} — PUTting update`);
    resp = await n8nFetch(`/workflows/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  } else {
    console.log(`  Creating new`);
    resp = await n8nFetch('/workflows', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`  FAILED HTTP ${resp.status}: ${errBody}`);
    registry.workflows[wfName] = {error: errBody, status: resp.status};
    continue;
  }
  const result = await resp.json();
  const wf = result.data || result;
  console.log(`  OK id=${wf.id} active=${wf.active}`);

  // Activate (best-effort)
  if (!wf.active) {
    const act = await n8nFetch(`/workflows/${wf.id}/activate`, {method: 'POST'});
    if (act.ok) console.log(`  Activated`);
    else console.log(`  Activation skipped (HTTP ${act.status})`);
  }

  // Compute webhook URL
  const webhookPath = body.nodes.find(n => n.type === 'n8n-nodes-base.webhook')?.parameters?.path;
  const baseUrl = N8N_API_URL.replace(/\/api\/v1$/, '');
  const webhookUrl = `${baseUrl}/webhook/${webhookPath}`;

  registry.workflows[wfName] = {id: wf.id, active: wf.active, webhook_url: webhookUrl};
}

const registryPath = join(process.cwd(), 'snapshots', 'n8n-webhooks-2026-05-12.json');
writeFileSync(registryPath, JSON.stringify(registry, null, 2));
console.log(`\nRegistry: ${registryPath}`);
