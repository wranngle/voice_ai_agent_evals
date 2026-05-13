/**
 * `voice-evals webhooks` — bootstrap, status, and rotate the n8n + ElevenLabs
 * webhook plumbing. The package's onboarding surface for webhook wiring.
 *
 * Subcommands:
 *   status [--agent-id <id>]     Show current wiring state across n8n + ElevenLabs.
 *   provision --agent-id <id>... Deploy n8n workflows + register workspace
 *                                webhook + wire post_call_webhook_id +
 *                                client-initiation webhook URL on each agent.
 *                                Idempotent: re-running updates existing.
 *   rotate                       Cycle the post-call webhook secret: unwire all
 *                                consumers, delete + recreate the workspace
 *                                webhook, save the new secret, rewire.
 *
 * All cloud writes go via direct HTTPS (not MCP) per AGENTS.md.
 *
 * Env:
 *   ELEVENLABS_API_KEY                       Required.
 *   N8N_API_URL                              Required (e.g. https://n8n.example.com/api/v1).
 *   N8N_API_KEY                              Required.
 *   ELEVENLABS_POST_CALL_WEBHOOK_SECRET      Set by provision/rotate. Read by `voice-evals webhooks status`.
 *   EVALS_INGEST_URL                         Optional downstream for post_call_transcription.
 *   AUDIO_SINK_URL                           Optional downstream for post_call_audio.
 *   ALERT_WEBHOOK_URL                        Optional downstream for call_initiation_failure.
 *
 * Bootstrappability note: when packaged, downstream consumers can call this
 * verb as a one-shot setup step. Defaults assume the agents already exist
 * (use `voice-evals agent create` / `agent clone` first).
 */

import {execFile as execFileCb} from 'node:child_process';
import {promisify} from 'node:util';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createTracer} from '../../internal/jsonl-trace';

const execFile = promisify(execFileCb);

type WebhooksOptions = {argv: string[]};

const HELP = `voice-evals webhooks — bootstrap and manage ElevenLabs n8n webhook plumbing

USAGE
  voice-evals webhooks <subcommand> [options]

SUBCOMMANDS
  status [--agent-id <id>]
      Inspect the live wiring: n8n workflow IDs + activity, workspace
      webhook registration, and per-agent post_call_webhook_id +
      client-initiation URL. If --agent-id is given, only that agent.

  provision --agent-id <id> [--agent-id <id> ...]
      Deploy the three n8n workflows (post-call, monitoring, client-init),
      register a workspace post-call webhook in ElevenLabs (if none for the
      target URL), persist the secret to ~/.agents/.env, and wire each
      agent's platform_settings.workspace_overrides accordingly. Idempotent.

  rotate
      Cycle the post-call webhook secret. Unwires every agent currently
      using the webhook id, deletes + recreates the workspace webhook,
      updates ~/.agents/.env, and rewires all previously-consuming agents.

ENV
  ELEVENLABS_API_KEY                  ElevenLabs API key (required).
  N8N_API_URL                         n8n REST base (e.g. https://n8n.host/api/v1).
  N8N_API_KEY                         n8n API key.
  ELEVENLABS_POST_CALL_WEBHOOK_SECRET Webhook signing secret (wsec_*). Set by
                                      provision/rotate; read by other steps.
  EVALS_INGEST_URL                    Optional downstream for transcripts.
  AUDIO_SINK_URL                      Optional downstream for audio.
  ALERT_WEBHOOK_URL                   Optional downstream for failure events.

EXAMPLES
  voice-evals webhooks status
  voice-evals webhooks provision --agent-id agent_8401...
  voice-evals webhooks rotate
`;

type EnvCheck = {
  elevenLabsApiKey: string;
  n8nApiUrl: string;
  n8nApiKey: string;
};

function requireEnv(out: (line: string) => void): EnvCheck | null {
  const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY ?? '';
  const n8nApiUrl = (process.env.N8N_API_URL ?? '').replace(/\/$/, '');
  const n8nApiKey = process.env.N8N_API_KEY ?? '';
  const missing: string[] = [];
  if (!elevenLabsApiKey) missing.push('ELEVENLABS_API_KEY');
  if (!n8nApiUrl) missing.push('N8N_API_URL');
  if (!n8nApiKey) missing.push('N8N_API_KEY');
  if (missing.length > 0) {
    out(`Missing required env vars: ${missing.join(', ')}`);
    out('Set these (e.g. in ~/.agents/.env) and retry.');
    return null;
  }

  return {elevenLabsApiKey, n8nApiUrl, n8nApiKey};
}

function n8nApiBase(url: string): string {
  return url.endsWith('/api/v1') ? url : `${url}/api/v1`;
}

function n8nPublicBase(url: string): string {
  return url.replace(/\/api\/v1$/, '');
}

async function n8nFetch(env: EnvCheck, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${n8nApiBase(env.n8nApiUrl)}${path}`, {
    ...init,
    headers: {
      'X-N8N-API-KEY': env.n8nApiKey,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function elevenLabsFetch(env: EnvCheck, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.elevenlabs.io${path}`, {
    ...init,
    headers: {
      'xi-api-key': env.elevenLabsApiKey,
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

function readArg(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i === -1 || i + 1 >= argv.length) return undefined;
  return argv[i + 1];
}

function readAllArgs(argv: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && i + 1 < argv.length) out.push(argv[i + 1]);
  }

  return out;
}

async function runDeployScript(out: (line: string) => void): Promise<number> {
  // Shell out to scripts/deploy-n8n-workflows.mjs — the canonical deployer.
  // Inherits process.env so the secret + URLs flow through.
  const script = join(process.cwd(), 'scripts', 'deploy-n8n-workflows.mjs');
  if (!existsSync(script)) {
    out(`Deploy script missing: ${script}`);
    return 1;
  }

  try {
    const {stdout, stderr} = await execFile('node', [script], {env: process.env, maxBuffer: 5 * 1024 * 1024});
    if (stdout) out(stdout.trimEnd());
    if (stderr) out(stderr.trimEnd());
    return 0;
  } catch (err: unknown) {
    out(`Deploy failed: ${String(err)}`);
    return 1;
  }
}

async function findWorkspaceWebhookByUrl(env: EnvCheck, url: string): Promise<{webhook_id: string; name: string} | null> {
  const r = await elevenLabsFetch(env, '/v1/workspace/webhooks');
  if (!r.ok) return null;
  const j = await r.json() as {webhooks?: Array<{webhook_id: string; webhook_url: string; name: string}>};
  return j.webhooks?.find(w => w.webhook_url === url) ?? null;
}

async function registerWorkspaceWebhook(env: EnvCheck, name: string, url: string): Promise<{webhook_id: string; webhook_secret: string} | null> {
  const r = await elevenLabsFetch(env, '/v1/workspace/webhooks', {
    method: 'POST',
    body: JSON.stringify({settings: {name, webhook_url: url, auth_type: 'hmac'}}),
  });
  if (!r.ok) return null;
  return r.json() as Promise<{webhook_id: string; webhook_secret: string}>;
}

async function deleteWorkspaceWebhook(env: EnvCheck, webhookId: string): Promise<boolean> {
  const r = await elevenLabsFetch(env, `/v1/workspace/webhooks/${webhookId}`, {method: 'DELETE'});
  return r.ok;
}

async function getAgentPlatform(env: EnvCheck, agentId: string): Promise<Record<string, unknown> | null> {
  const r = await elevenLabsFetch(env, `/v1/convai/agents/${agentId}`);
  if (!r.ok) return null;
  const j = await r.json() as {platform_settings: Record<string, unknown>};
  return j.platform_settings;
}

async function patchAgentPlatform(env: EnvCheck, agentId: string, platform: Record<string, unknown>): Promise<boolean> {
  const r = await elevenLabsFetch(env, `/v1/convai/agents/${agentId}`, {
    method: 'PATCH',
    body: JSON.stringify({platform_settings: platform}),
  });
  return r.ok;
}

function persistSecretToAgentsEnv(secret: string): {path: string; ok: boolean} {
  const home = process.env.HOME ?? '';
  if (!home) return {path: '(no $HOME)', ok: false};
  const envPath = join(home, '.agents', '.env');
  if (!existsSync(join(home, '.agents'))) {
    mkdirSync(join(home, '.agents'), {recursive: true});
  }

  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const filtered = existing.split('\n').filter(line => !line.startsWith('ELEVENLABS_POST_CALL_WEBHOOK_SECRET=')).join('\n');
  const next = `${filtered.replace(/\n+$/, '')}\nELEVENLABS_POST_CALL_WEBHOOK_SECRET=${secret}\n`;
  writeFileSync(envPath, next);
  return {path: envPath, ok: true};
}

async function runStatus(env: EnvCheck, out: (line: string) => void, agentFilter?: string): Promise<number> {
  out('=== n8n workflows ===');
  const wfList = await n8nFetch(env, '/workflows?limit=100');
  if (!wfList.ok) {
    out(`Failed to list n8n workflows: HTTP ${wfList.status}`);
    return 1;
  }

  const wfJson = await wfList.json() as {data?: Array<{id: string; name: string; active: boolean; nodes?: Array<{type: string; parameters?: {path?: string}}>}>};
  const targets = ['elevenlabs_post_call_webhook', 'elevenlabs_monitoring_webhook', 'elevenlabs_client_initiation_data_webhook'];
  const public_base = n8nPublicBase(env.n8nApiUrl);
  for (const name of targets) {
    const wf = wfJson.data?.find(w => w.name === name);
    if (!wf) {
      out(`  ${name}: NOT DEPLOYED`);
      continue;
    }

    const webhookNode = wf.nodes?.find(n => n.type === 'n8n-nodes-base.webhook');
    const url = webhookNode?.parameters?.path ? `${public_base}/webhook/${webhookNode.parameters.path}` : '(no webhook path)';
    out(`  ${name}: id=${wf.id} active=${wf.active}`);
    out(`    URL: ${url}`);
  }

  out('');
  out('=== ElevenLabs workspace webhooks ===');
  const wsR = await elevenLabsFetch(env, '/v1/workspace/webhooks');
  if (!wsR.ok) {
    out(`Failed to list workspace webhooks: HTTP ${wsR.status}`);
  } else {
    const wsJ = await wsR.json() as {webhooks?: Array<{webhook_id: string; webhook_url: string; name: string; is_disabled: boolean; auth_type: string}>};
    for (const w of wsJ.webhooks ?? []) {
      const stale = w.is_disabled ? ' [DISABLED]' : '';
      out(`  ${w.name}: id=${w.webhook_id} auth=${w.auth_type}${stale}`);
      out(`    URL: ${w.webhook_url}`);
    }
  }

  out('');
  out('=== Agent wiring ===');
  const agentIds: string[] = [];
  if (agentFilter) {
    agentIds.push(agentFilter);
  } else {
    const lr = await elevenLabsFetch(env, '/v1/convai/agents?page_size=100');
    if (lr.ok) {
      const lj = await lr.json() as {agents?: Array<{agent_id: string; name: string}>};
      for (const a of lj.agents ?? []) {
        if (/TEMPLATE/i.test(a.name)) agentIds.push(a.agent_id);
      }
    }
  }

  for (const id of agentIds) {
    const p = await getAgentPlatform(env, id);
    if (!p) {
      out(`  ${id}: failed to fetch`);
      continue;
    }

    const wo = (p.workspace_overrides ?? {}) as Record<string, unknown>;
    const cw = (wo.conversation_initiation_client_data_webhook ?? null) as null | {url?: string};
    const wh = (wo.webhooks ?? {}) as {post_call_webhook_id?: string | null};
    out(`  ${id}:`);
    out(`    client_init_webhook: ${cw?.url ?? '(none)'}`);
    out(`    post_call_webhook_id: ${wh.post_call_webhook_id ?? '(none)'}`);
  }

  out('');
  out('=== Secret presence ===');
  out(`  ELEVENLABS_POST_CALL_WEBHOOK_SECRET set: ${process.env.ELEVENLABS_POST_CALL_WEBHOOK_SECRET ? 'yes' : 'no'}`);
  out(`  EVALS_INGEST_URL: ${process.env.EVALS_INGEST_URL ?? '(unset)'}`);
  out(`  AUDIO_SINK_URL: ${process.env.AUDIO_SINK_URL ?? '(unset)'}`);
  out(`  ALERT_WEBHOOK_URL: ${process.env.ALERT_WEBHOOK_URL ?? '(unset)'}`);
  return 0;
}

async function runProvision(env: EnvCheck, out: (line: string) => void, agentIds: string[]): Promise<number> {
  if (agentIds.length === 0) {
    out('provision: --agent-id required (one or more)');
    return 1;
  }

  // Step 1: ensure secret. If not set, register a new workspace webhook (and capture secret).
  const publicBase = n8nPublicBase(env.n8nApiUrl);
  const postCallUrl = `${publicBase}/webhook/elevenlabs/post-call`;

  let secret = process.env.ELEVENLABS_POST_CALL_WEBHOOK_SECRET ?? '';
  const existing = await findWorkspaceWebhookByUrl(env, postCallUrl);
  let webhookId = existing?.webhook_id ?? '';

  if (!webhookId) {
    out(`Registering workspace webhook for ${postCallUrl} ...`);
    const created = await registerWorkspaceWebhook(env, 'elevenlabs_post_call_webhook_template_2026', postCallUrl);
    if (!created) {
      out('Failed to register workspace webhook.');
      return 1;
    }

    webhookId = created.webhook_id;
    secret = created.webhook_secret;
    const persisted = persistSecretToAgentsEnv(secret);
    out(`  webhook_id=${webhookId}`);
    out(`  secret persisted to ${persisted.path}`);
  } else if (!secret) {
    out(`Workspace webhook already exists (id=${webhookId}) but secret is not in env.`);
    out('Run `voice-evals webhooks rotate` to cycle and persist a fresh secret.');
    return 1;
  } else {
    out(`Workspace webhook already present: id=${webhookId}`);
  }

  // Step 2: deploy n8n workflows with the secret.
  process.env.ELEVENLABS_POST_CALL_WEBHOOK_SECRET = secret;
  out('');
  out('Deploying n8n workflows ...');
  const deployRc = await runDeployScript(out);
  if (deployRc !== 0) return deployRc;

  // Step 3: wire each agent.
  const clientInitUrl = `${publicBase}/webhook/elevenlabs/initiation`;
  out('');
  out('Wiring agents ...');
  for (const agentId of agentIds) {
    const platform = await getAgentPlatform(env, agentId);
    if (!platform) {
      out(`  ${agentId}: fetch FAILED`);
      continue;
    }

    platform.workspace_overrides = (platform.workspace_overrides ?? {}) as Record<string, unknown>;
    const wo = platform.workspace_overrides as Record<string, unknown>;
    wo.conversation_initiation_client_data_webhook = {url: clientInitUrl, request_headers: {}};
    wo.webhooks = {
      ...((wo.webhooks ?? {}) as Record<string, unknown>),
      post_call_webhook_id: webhookId,
    };
    const ok = await patchAgentPlatform(env, agentId, platform);
    out(`  ${agentId}: ${ok ? 'wired' : 'WIRE FAILED'}`);
  }

  return 0;
}

async function runRotate(env: EnvCheck, out: (line: string) => void): Promise<number> {
  const publicBase = n8nPublicBase(env.n8nApiUrl);
  const postCallUrl = `${publicBase}/webhook/elevenlabs/post-call`;

  const existing = await findWorkspaceWebhookByUrl(env, postCallUrl);
  if (!existing) {
    out(`No existing webhook for ${postCallUrl}. Run \`voice-evals webhooks provision\` first.`);
    return 1;
  }

  // Identify all agents currently wired to this webhook id.
  out(`Identifying agents wired to webhook_id=${existing.webhook_id} ...`);
  const lr = await elevenLabsFetch(env, '/v1/convai/agents?page_size=100');
  const lj = (await lr.json()) as {agents?: Array<{agent_id: string; name: string}>};
  const wired: string[] = [];
  for (const a of lj.agents ?? []) {
    const p = await getAgentPlatform(env, a.agent_id);
    const wh = ((p?.workspace_overrides as Record<string, unknown> | undefined)?.webhooks ?? {}) as {post_call_webhook_id?: string | null};
    if (wh.post_call_webhook_id === existing.webhook_id) wired.push(a.agent_id);
  }

  out(`  found ${wired.length} consumer(s)`);

  // Unwire each
  for (const id of wired) {
    const p = await getAgentPlatform(env, id);
    if (!p) continue;
    const wo = (p.workspace_overrides ?? {}) as Record<string, unknown>;
    wo.webhooks = {...((wo.webhooks ?? {}) as Record<string, unknown>), post_call_webhook_id: null};
    await patchAgentPlatform(env, id, p);
  }

  out('  unwired');

  // Delete + recreate
  out(`Deleting webhook ${existing.webhook_id} ...`);
  if (!await deleteWorkspaceWebhook(env, existing.webhook_id)) {
    out('  delete FAILED');
    return 1;
  }

  out('Registering fresh webhook ...');
  const created = await registerWorkspaceWebhook(env, 'elevenlabs_post_call_webhook_template_2026', postCallUrl);
  if (!created) return 1;
  const newId = created.webhook_id;
  const newSecret = created.webhook_secret;
  out(`  new webhook_id=${newId}`);

  const persisted = persistSecretToAgentsEnv(newSecret);
  out(`  secret persisted to ${persisted.path}`);
  process.env.ELEVENLABS_POST_CALL_WEBHOOK_SECRET = newSecret;

  // Redeploy workflows so the new secret is embedded in HMAC node
  out('Redeploying n8n workflows with new secret ...');
  const deployRc = await runDeployScript(out);
  if (deployRc !== 0) return deployRc;

  // Rewire all previous consumers
  out('Rewiring consumers ...');
  for (const id of wired) {
    const p = await getAgentPlatform(env, id);
    if (!p) continue;
    const wo = (p.workspace_overrides ?? {}) as Record<string, unknown>;
    wo.webhooks = {...((wo.webhooks ?? {}) as Record<string, unknown>), post_call_webhook_id: newId};
    const ok = await patchAgentPlatform(env, id, p);
    out(`  ${id}: ${ok ? 'rewired' : 'REWIRE FAILED'}`);
  }

  return 0;
}

export async function dispatchWebhooks(options: WebhooksOptions): Promise<number> {
  const out = (line: string) => {
    process.stdout.write(`${line}\n`);
  };

  const [sub, ...rest] = options.argv;
  if (!sub || sub === '--help' || sub === '-h') {
    out(HELP);
    return 0;
  }

  const env = requireEnv(out);
  if (!env) return 2;

  const trace = createTracer(`webhooks.${sub}`);
  trace.info('start', {argv: rest});

  let rc: number;
  switch (sub) {
    case 'status': {
      rc = await runStatus(env, out, readArg(rest, '--agent-id'));
      break;
    }

    case 'provision': {
      rc = await runProvision(env, out, readAllArgs(rest, '--agent-id'));
      break;
    }

    case 'rotate': {
      rc = await runRotate(env, out);
      break;
    }

    default: {
      out(`unknown webhooks subcommand: ${sub}`);
      out('Run `voice-evals webhooks --help` for the surface.');
      trace.error('unknown_subcommand', {sub});
      return 1;
    }
  }

  trace.info('end', {rc});
  return rc;
}
