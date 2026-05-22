/**
 * In-process HTTP receiver for ElevenLabs post-call webhooks.
 *
 * Verifies HMAC signatures and appends each payload as a JSONL line to
 * `<logsDir>/post-call-<ISO-date>.ndjson`. Use it as the local destination
 * for the n8n workflow's HTTP-Request forwarder (set EVALS_INGEST_URL to
 * this server's URL), or as a standalone receiver during integration tests.
 *
 * Public API:
 *   const receiver = await startPostCallReceiver({port, secret});
 *   // ... receive POSTs ...
 *   await receiver.close();
 *
 * Receiver writes to `process.cwd()/logs/elevenlabs/` by default — flat
 * project-root convention. Override with `logsDir`.
 */

import {createServer, type Server} from 'node:http';
import {appendFileSync, existsSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {verifyElevenLabsSignature, type ReplayCache} from '../security/elevenlabs-signature';
import {createTracer} from '../internal/jsonl-trace';

export type StartReceiverOptions = {
  /** Port to bind. 0 = OS-assigned. Default 0. */
  port?: number;
  /** HMAC secret matching the ElevenLabs workspace webhook. Required. */
  secret: string;
  /** Directory for NDJSON sink files. Default: `<cwd>/logs/elevenlabs/`. */
  logsDir?: string;
  /** Optional replay cache. Default: module-scoped in-memory cache. */
  replayCache?: ReplayCache;
};

export type RunningReceiver = {
  url: string;
  port: number;
  close: () => Promise<void>;
};

export async function startPostCallReceiver(options: StartReceiverOptions): Promise<RunningReceiver> {
  const logsDir = options.logsDir ?? join(process.cwd(), 'logs', 'elevenlabs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, {recursive: true});
  }

  const trace = createTracer('post-call-receiver');

  const server: Server = createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, {'content-type': 'application/json'});
      res.end(JSON.stringify({ok: false, reason: 'method_not_allowed'}));
      return;
    }

    const chunks: Uint8Array[] = [];
    req.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      const sigHeader = req.headers['elevenlabs-signature'];
      const sig = typeof sigHeader === 'string' ? sigHeader : undefined;

      const verify = verifyElevenLabsSignature(rawBody, sig, options.secret, {
        replayCache: options.replayCache,
      });
      if (!verify.ok) {
        trace.warn('rejected', {reason: verify.reason});
        res.writeHead(401, {'content-type': 'application/json'});
        res.end(JSON.stringify({ok: false, reason: verify.reason}));
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, {'content-type': 'application/json'});
        res.end(JSON.stringify({ok: false, reason: 'invalid_json'}));
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const file = join(logsDir, `post-call-${today}.ndjson`);
      const event = {received_at: new Date().toISOString(), payload};
      try {
        appendFileSync(file, `${JSON.stringify(event)}\n`);
      } catch (error) {
        trace.error('append_failed', {file, err: String(error)});
        res.writeHead(500, {'content-type': 'application/json'});
        res.end(JSON.stringify({ok: false, reason: 'sink_write_failed'}));
        return;
      }

      const conversationId = (payload as {data?: {conversation_id?: string}})?.data?.conversation_id;
      trace.info('persisted', {file, conversation_id: conversationId});
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({ok: true, conversation_id: conversationId}));
    });
  });

  await new Promise<void>(resolve => {
    server.listen(options.port ?? 0, () => {
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : (options.port ?? 0);

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    close: async () => new Promise<void>(resolve => {
      server.close(() => {
        resolve();
      });
    }),
  };
}
