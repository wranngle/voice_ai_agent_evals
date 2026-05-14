#!/usr/bin/env node
/**
 * Build the three ElevenLabs n8n workflow JSON bodies for the deploy step.
 *
 * Exported builders return the full n8n workflow JSON. The deploy script
 * substitutes the HMAC `<<<SECRET>>>` token at deploy time with the runtime
 * secret (kept out of git).
 *
 * v2 workflow shape (post-call + monitoring):
 *
 *   Webhook (raw body)
 *     → Parse Signature (Code)
 *     → HMAC Compute (Crypto node — sandbox-safe, doesn't use require)
 *     → Verify Signature (IF: v0 matches AND age < 30min)
 *         ├── true → Route by Event Type (Switch on payload.type)
 *         │           ├── transcription → Format → optional ingest → Respond 200
 *         │           ├── audio         → Format → optional sink   → Respond 200
 *         │           ├── failure       → Format → optional alert  → Respond 200
 *         │           └── default       → Log unknown              → Respond 200
 *         └── false → Respond 401
 *
 * Downstream HTTP-Request hooks are gated by env vars on the n8n side:
 *   - $env.EVALS_INGEST_URL    — receives post_call_transcription payloads
 *   - $env.AUDIO_SINK_URL      — receives post_call_audio payloads
 *   - $env.ALERT_WEBHOOK_URL   — receives call_initiation_failure alerts
 *
 * Unset env vars skip the call. The workflow still ACKs with 200; nothing
 * gets dropped.
 */

import {randomUUID} from 'node:crypto';

const PARSE_SIG_CODE = `// Extract t and v0 from the ElevenLabs-Signature header.
// Build signing_string = "\${t}.\${rawBody}" — the input the Crypto node hashes.
// No 'crypto' dependency here; n8n's sandbox blocks it.
const item = $input.first();
const headers = item.json.headers || {};
const sigHeader = headers['elevenlabs-signature'] || headers['ElevenLabs-Signature'] || '';
const rawBody = item.json.rawBody || (typeof item.json.body === 'string' ? item.json.body : JSON.stringify(item.json.body || item.json));
const parts = sigHeader.split(',').reduce((acc, p) => { const [k, v] = p.split('='); acc[k] = v; return acc; }, {});
const t = parts.t || '';
const v0 = parts.v0 || '';
const ageSeconds = t ? Math.abs(Math.floor(Date.now()/1000) - parseInt(t, 10)) : 999999;
const payload = typeof item.json.body === 'string' ? JSON.parse(item.json.body) : (item.json.body || item.json);
return [{json: {
  signing_string: t + '.' + rawBody,
  t,
  v0_received: v0,
  age_seconds: ageSeconds,
  signature_present: Boolean(t && v0),
  payload,
  event_type: payload.type || 'unknown',
  received_at: new Date().toISOString()
}}];`;

const FORMAT_TRANSCRIPTION_CODE = `// Extract the structured fields from a post_call_transcription payload.
const item = $input.first().json;
const data = item.payload?.data || {};
return [{json: {
  event: 'post_call_transcription',
  conversation_id: data.conversation_id,
  agent_id: data.agent_id,
  agent_name: data.agent_name,
  status: data.status,
  call_duration_secs: data.metadata?.call_duration_secs,
  caller_id: data.metadata?.caller_id,
  called_number: data.metadata?.called_number,
  phone_provider: data.metadata?.phone_provider,
  transcript_turns: (data.transcript || []).length,
  summary: data.analysis?.summary,
  evaluation_results: data.analysis?.evaluation_results || {},
  data_collection: data.analysis?.data_collection || {},
  has_audio: data.has_audio,
  raw: item.payload
}}];`;

const FORMAT_AUDIO_CODE = `// Extract metadata from a post_call_audio payload. The base64-encoded audio
// lives in payload.data.full_audio — large, may exceed n8n's default item
// size limits. Keep only the metadata in the structured output; pass the raw
// payload through to downstream sinks that handle binary.
const item = $input.first().json;
const data = item.payload?.data || {};
return [{json: {
  event: 'post_call_audio',
  conversation_id: data.conversation_id,
  agent_id: data.agent_id,
  audio_bytes: data.full_audio ? Buffer.from(data.full_audio, 'base64').length : 0,
  audio_base64_length: data.full_audio?.length || 0,
  raw: item.payload
}}];`;

const FORMAT_FAILURE_CODE = `// Extract failure detail from a call_initiation_failure payload — alert-worthy.
const item = $input.first().json;
const data = item.payload?.data || {};
const body = data.metadata?.body || {};
return [{json: {
  event: 'call_initiation_failure',
  alert_severity: 'high',
  conversation_id: data.conversation_id,
  agent_id: data.agent_id,
  failure_reason: data.failure_reason,
  provider: data.metadata?.type,
  from_number: body.from_number,
  to_number: body.to_number,
  sip_status_code: body.sip_status_code,
  error_reason: body.error_reason,
  call_sid: body.call_sid,
  raw: item.payload
}}];`;

const FORMAT_UNKNOWN_CODE = `// Catch-all for unknown event types — log but do not alarm.
const item = $input.first().json;
return [{json: {
  event: 'unknown_event_type',
  declared_type: item.event_type,
  payload_keys: Object.keys(item.payload || {}),
  raw: item.payload
}}];`;

const FORMAT_MONITORING_CODE = `// Monitoring webhook payloads stream real-time events: user_transcript,
// agent_response, agent_response_correction. Format for ingest.
const item = $input.first().json;
const p = item.payload || {};
return [{json: {
  event: 'monitoring_stream',
  stream_event_type: p.type || p.event_type,
  conversation_id: p.conversation_id,
  agent_id: p.agent_id,
  text: p.message || p.transcript || p.response,
  raw: p
}}];`;

const RESPOND_OK_BODY = `={{ JSON.stringify({status: 'ok', event: $json.event || $json.event_type || 'unknown', conversation_id: $json.conversation_id}) }}`;
const RESPOND_DROPPED_BODY = `={{ JSON.stringify({status: 'rejected', reason: 'signature_invalid_or_stale'}) }}`;

function buildPostCallWorkflow({secret, ingestUrl, audioSinkUrl, alertWebhookUrl}) {
  return {
    name: 'elevenlabs_post_call_webhook',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 0],
        webhookId: randomUUID(),
        parameters: {
          httpMethod: 'POST',
          path: 'elevenlabs/post-call',
          responseMode: 'responseNode',
          options: {rawBody: true},
        },
      },
      {
        name: 'Parse Signature',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [220, 0],
        parameters: {language: 'javaScript', jsCode: PARSE_SIG_CODE},
      },
      {
        name: 'HMAC Compute',
        type: 'n8n-nodes-base.crypto',
        typeVersion: 1,
        position: [440, 0],
        parameters: {
          action: 'hmac',
          type: 'SHA256',
          value: '={{$json.signing_string}}',
          secret,
          encoding: 'hex',
          dataPropertyName: 'v0_computed',
        },
      },
      {
        name: 'Verify Signature',
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        position: [660, 0],
        parameters: {
          conditions: {
            options: {caseSensitive: true, leftValue: '', typeValidation: 'strict'},
            conditions: [
              {
                id: 'sig-eq',
                leftValue: '={{$json.v0_computed}}',
                rightValue: '={{$json.v0_received}}',
                operator: {type: 'string', operation: 'equals'},
              },
              {
                id: 'sig-fresh',
                leftValue: '={{$json.age_seconds}}',
                rightValue: 1800,
                operator: {type: 'number', operation: 'lt'},
              },
            ],
            combinator: 'and',
          },
        },
      },
      {
        name: 'Route by Event Type',
        type: 'n8n-nodes-base.switch',
        typeVersion: 3,
        position: [880, -160],
        parameters: {
          rules: {
            values: [
              {
                conditions: {
                  options: {},
                  conditions: [{id: 'r-tr', leftValue: '={{$json.event_type}}', rightValue: 'post_call_transcription', operator: {type: 'string', operation: 'equals'}}],
                  combinator: 'and',
                },
                outputKey: 'transcription',
                renameOutput: true,
              },
              {
                conditions: {
                  options: {},
                  conditions: [{id: 'r-au', leftValue: '={{$json.event_type}}', rightValue: 'post_call_audio', operator: {type: 'string', operation: 'equals'}}],
                  combinator: 'and',
                },
                outputKey: 'audio',
                renameOutput: true,
              },
              {
                conditions: {
                  options: {},
                  conditions: [{id: 'r-fa', leftValue: '={{$json.event_type}}', rightValue: 'call_initiation_failure', operator: {type: 'string', operation: 'equals'}}],
                  combinator: 'and',
                },
                outputKey: 'failure',
                renameOutput: true,
              },
            ],
          },
          options: {fallbackOutput: 'extra'},
        },
      },
      {
        name: 'Format Transcription',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [1120, -320],
        parameters: {language: 'javaScript', jsCode: FORMAT_TRANSCRIPTION_CODE},
      },
      {
        name: 'Format Audio',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [1120, -160],
        parameters: {language: 'javaScript', jsCode: FORMAT_AUDIO_CODE},
      },
      {
        name: 'Format Failure',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [1120, 0],
        parameters: {language: 'javaScript', jsCode: FORMAT_FAILURE_CODE},
      },
      {
        name: 'Format Unknown',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [1120, 160],
        parameters: {language: 'javaScript', jsCode: FORMAT_UNKNOWN_CODE},
      },
      {
        name: 'Has Ingest URL?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        position: [1340, -320],
        parameters: {
          conditions: {
            options: {caseSensitive: true},
            conditions: [{id: 'has-ing', leftValue: ingestUrl || '', rightValue: '', operator: {type: 'string', operation: 'notEmpty'}}],
            combinator: 'and',
          },
        },
      },
      {
        name: 'POST Ingest',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [1560, -360],
        parameters: {
          method: 'POST',
          url: ingestUrl || 'http://localhost/elevenlabs-ingest',
          sendBody: true,
          contentType: 'json',
          jsonBody: '={{ JSON.stringify($json) }}',
          options: {timeout: 5000, response: {response: {neverError: true}}},
        },
      },
      {
        name: 'Has Audio Sink URL?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        position: [1340, -160],
        parameters: {
          conditions: {
            options: {caseSensitive: true},
            conditions: [{id: 'has-asu', leftValue: audioSinkUrl || '', rightValue: '', operator: {type: 'string', operation: 'notEmpty'}}],
            combinator: 'and',
          },
        },
      },
      {
        name: 'POST Audio Sink',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [1560, -200],
        parameters: {
          method: 'POST',
          url: audioSinkUrl || 'http://localhost/elevenlabs-audio',
          sendBody: true,
          contentType: 'json',
          jsonBody: '={{ JSON.stringify($json) }}',
          options: {timeout: 10000, response: {response: {neverError: true}}},
        },
      },
      {
        name: 'Has Alert URL?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        position: [1340, 0],
        parameters: {
          conditions: {
            options: {caseSensitive: true},
            conditions: [{id: 'has-alert', leftValue: alertWebhookUrl || '', rightValue: '', operator: {type: 'string', operation: 'notEmpty'}}],
            combinator: 'and',
          },
        },
      },
      {
        name: 'POST Alert',
        type: 'n8n-nodes-base.httpRequest',
        typeVersion: 4,
        position: [1560, -40],
        parameters: {
          method: 'POST',
          url: alertWebhookUrl || 'http://localhost/elevenlabs-alert',
          sendBody: true,
          contentType: 'json',
          jsonBody: '={{ JSON.stringify($json) }}',
          options: {timeout: 5000, response: {response: {neverError: true}}},
        },
      },
      {
        name: 'Respond 200',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        position: [1800, -120],
        parameters: {respondWith: 'json', responseBody: RESPOND_OK_BODY, options: {responseCode: 200}},
      },
      {
        name: 'Respond 401',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        position: [880, 160],
        parameters: {respondWith: 'json', responseBody: RESPOND_DROPPED_BODY, options: {responseCode: 401}},
      },
    ],
    connections: {
      Webhook: {main: [[{node: 'Parse Signature', type: 'main', index: 0}]]},
      'Parse Signature': {main: [[{node: 'HMAC Compute', type: 'main', index: 0}]]},
      'HMAC Compute': {main: [[{node: 'Verify Signature', type: 'main', index: 0}]]},
      'Verify Signature': {
        main: [
          [{node: 'Route by Event Type', type: 'main', index: 0}],
          [{node: 'Respond 401', type: 'main', index: 0}],
        ],
      },
      'Route by Event Type': {
        main: [
          [{node: 'Format Transcription', type: 'main', index: 0}],
          [{node: 'Format Audio', type: 'main', index: 0}],
          [{node: 'Format Failure', type: 'main', index: 0}],
          [{node: 'Format Unknown', type: 'main', index: 0}],
        ],
      },
      'Format Transcription': {main: [[{node: 'Has Ingest URL?', type: 'main', index: 0}]]},
      'Has Ingest URL?': {
        main: [
          [{node: 'POST Ingest', type: 'main', index: 0}],
          [{node: 'Respond 200', type: 'main', index: 0}],
        ],
      },
      'POST Ingest': {main: [[{node: 'Respond 200', type: 'main', index: 0}]]},
      'Format Audio': {main: [[{node: 'Has Audio Sink URL?', type: 'main', index: 0}]]},
      'Has Audio Sink URL?': {
        main: [
          [{node: 'POST Audio Sink', type: 'main', index: 0}],
          [{node: 'Respond 200', type: 'main', index: 0}],
        ],
      },
      'POST Audio Sink': {main: [[{node: 'Respond 200', type: 'main', index: 0}]]},
      'Format Failure': {main: [[{node: 'Has Alert URL?', type: 'main', index: 0}]]},
      'Has Alert URL?': {
        main: [
          [{node: 'POST Alert', type: 'main', index: 0}],
          [{node: 'Respond 200', type: 'main', index: 0}],
        ],
      },
      'POST Alert': {main: [[{node: 'Respond 200', type: 'main', index: 0}]]},
      'Format Unknown': {main: [[{node: 'Respond 200', type: 'main', index: 0}]]},
    },
    settings: {executionOrder: 'v1'},
  };
}

function buildMonitoringWorkflow({secret, ingestUrl}) {
  return {
    name: 'elevenlabs_monitoring_webhook',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 0],
        webhookId: randomUUID(),
        parameters: {httpMethod: 'POST', path: 'elevenlabs/monitoring', responseMode: 'responseNode', options: {rawBody: true}},
      },
      {name: 'Parse Signature', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0],
        parameters: {language: 'javaScript', jsCode: PARSE_SIG_CODE}},
      {name: 'HMAC Compute', type: 'n8n-nodes-base.crypto', typeVersion: 1, position: [440, 0],
        parameters: {action: 'hmac', type: 'SHA256', value: '={{$json.signing_string}}', secret, encoding: 'hex', dataPropertyName: 'v0_computed'}},
      {name: 'Verify Signature', type: 'n8n-nodes-base.if', typeVersion: 2, position: [660, 0],
        parameters: {conditions: {options: {caseSensitive: true, leftValue: '', typeValidation: 'strict'}, conditions: [
          {id: 'sig-eq', leftValue: '={{$json.v0_computed}}', rightValue: '={{$json.v0_received}}', operator: {type: 'string', operation: 'equals'}},
          {id: 'sig-fresh', leftValue: '={{$json.age_seconds}}', rightValue: 1800, operator: {type: 'number', operation: 'lt'}},
        ], combinator: 'and'}}},
      {name: 'Format Monitoring', type: 'n8n-nodes-base.code', typeVersion: 2, position: [880, -80],
        parameters: {language: 'javaScript', jsCode: FORMAT_MONITORING_CODE}},
      {name: 'Has Ingest URL?', type: 'n8n-nodes-base.if', typeVersion: 2, position: [1100, -80],
        parameters: {conditions: {options: {caseSensitive: true}, conditions: [{id: 'has-ing', leftValue: ingestUrl || '', rightValue: '', operator: {type: 'string', operation: 'notEmpty'}}], combinator: 'and'}}},
      {name: 'POST Ingest', type: 'n8n-nodes-base.httpRequest', typeVersion: 4, position: [1320, -120],
        parameters: {method: 'POST', url: ingestUrl || 'http://localhost/elevenlabs-ingest', sendBody: true, contentType: 'json', jsonBody: '={{ JSON.stringify($json) }}', options: {timeout: 3000, response: {response: {neverError: true}}}}},
      {name: 'Respond 200', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1, position: [1540, -80],
        parameters: {respondWith: 'json', responseBody: RESPOND_OK_BODY, options: {responseCode: 200}}},
      {name: 'Respond 401', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1, position: [880, 120],
        parameters: {respondWith: 'json', responseBody: RESPOND_DROPPED_BODY, options: {responseCode: 401}}},
    ],
    connections: {
      Webhook: {main: [[{node: 'Parse Signature', type: 'main', index: 0}]]},
      'Parse Signature': {main: [[{node: 'HMAC Compute', type: 'main', index: 0}]]},
      'HMAC Compute': {main: [[{node: 'Verify Signature', type: 'main', index: 0}]]},
      'Verify Signature': {main: [
        [{node: 'Format Monitoring', type: 'main', index: 0}],
        [{node: 'Respond 401', type: 'main', index: 0}],
      ]},
      'Format Monitoring': {main: [[{node: 'Has Ingest URL?', type: 'main', index: 0}]]},
      'Has Ingest URL?': {main: [
        [{node: 'POST Ingest', type: 'main', index: 0}],
        [{node: 'Respond 200', type: 'main', index: 0}],
      ]},
      'POST Ingest': {main: [[{node: 'Respond 200', type: 'main', index: 0}]]},
    },
    settings: {executionOrder: 'v1'},
  };
}

function buildClientInitiationWorkflow() {
  // Fast-fail valid-object responder. No HMAC (init webhooks not signed in
  // current ElevenLabs API). Mirrors src/webhook/client-initiation.ts.
  const RESPOND_CODE = `// Fast-fail valid-object responder. ALL declared dynamic variables get a
// typed default so ElevenLabs never falls back to dashboard defaults on a
// slow/dead enrichment. Mirrors src/webhook/client-initiation.ts.
const body = $input.first().json.body || $input.first().json;
const callerId = body.caller_id || '';
const agentId = body.agent_id || '';

const specs = [
  {identifier: 'system_prompt_context', type: 'string', default: 'none'},
  {identifier: 'agent_name', type: 'string', default: 'the assistant'},
  {identifier: 'company_name', type: 'string', default: 'this business'},
  {identifier: 'primary_language', type: 'string', default: 'English'},
  {identifier: 'transfer_enabled', type: 'boolean', default: false},
  {identifier: 'agent_voice_marker', type: 'string', default: ''}
];

const dynamic_variables = {};
for (const spec of specs) {
  dynamic_variables[spec.identifier] = spec.default;
}

// TODO: enrich via $env.CRM_LOOKUP_URL with caller_id; race against a 2s timeout.
// Until that is wired, defaults are the floor.

return [{json: {
  type: 'conversation_initiation_client_data',
  dynamic_variables
}}];`;

  return {
    name: 'elevenlabs_client_initiation_data_webhook',
    nodes: [
      {
        name: 'Webhook',
        type: 'n8n-nodes-base.webhook',
        typeVersion: 2,
        position: [0, 0],
        webhookId: randomUUID(),
        parameters: {httpMethod: 'POST', path: 'elevenlabs/initiation', responseMode: 'responseNode', options: {}},
      },
      {
        name: 'Build Fast-Fail Response',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [240, 0],
        parameters: {language: 'javaScript', jsCode: RESPOND_CODE},
      },
      {
        name: 'Respond to Webhook',
        type: 'n8n-nodes-base.respondToWebhook',
        typeVersion: 1,
        position: [480, 0],
        parameters: {respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {responseCode: 200}},
      },
    ],
    connections: {
      Webhook: {main: [[{node: 'Build Fast-Fail Response', type: 'main', index: 0}]]},
      'Build Fast-Fail Response': {main: [[{node: 'Respond to Webhook', type: 'main', index: 0}]]},
    },
    settings: {executionOrder: 'v1'},
  };
}

export {buildPostCallWorkflow, buildMonitoringWorkflow, buildClientInitiationWorkflow};

// CLI: when invoked directly, print all three to /tmp for inspection.
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = {secret: 'PLACEHOLDER_SECRET', ingestUrl: '', audioSinkUrl: '', alertWebhookUrl: ''};
  const out = {
    post_call: buildPostCallWorkflow(args),
    monitoring: buildMonitoringWorkflow(args),
    client_initiation: buildClientInitiationWorkflow(),
  };
  console.log(JSON.stringify(out, null, 2));
}
