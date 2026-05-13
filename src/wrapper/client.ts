/**
 * @wranngle/voice-evals/wrapper/client — factory for the wrapped client.
 *
 * `createVoiceEvalsClient` is the public entry point. It wires the
 * ElevenLabs SDK with the governance + cleaning + verification helpers
 * and exposes the SDK directly via `.raw` for endpoints we have not yet
 * wrapped (escape hatch — see CLAUDE.md "Cloud-First Source of Truth").
 */

import {readFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import type {
  ModelRankings, ToolsApi, VoiceEvalsClient, VoiceEvalsClientOptions,
  WebhooksApi,
} from './types';
import {cleanProperty, cleanTools} from './tools';
import {verifyElevenLabsSignature} from './webhooks';
import {createAgentsApi} from './agents';
import {createTestsApi} from './tests';

const DEFAULT_RANKINGS_PATH = 'config/model-rankings.json';

const FALLBACK_RANKINGS: ModelRankings = {
  default: 'gemini-3-flash-preview',
  recommended: ['gemini-3-flash-preview', 'claude-haiku-4-5', 'gpt-5-nano'],
  banned: ['gpt-4o-mini', 'gpt-5-mini', 'gemini-2.0-flash-001'],
};

export function createVoiceEvalsClient(options: VoiceEvalsClientOptions): VoiceEvalsClient {
  const raw = resolveSdkClient(options);
  const modelRankings = resolveModelRankings(options);
  const agents = createAgentsApi({raw});
  const tests = createTestsApi({raw});
  const tools: ToolsApi = {cleanProperty, cleanTools};
  const webhooks: WebhooksApi = {verify: verifyElevenLabsSignature};

  return {
    raw,
    modelRankings,
    agents,
    tests,
    tools,
    webhooks,
  };
}

function resolveSdkClient(options: VoiceEvalsClientOptions): ElevenLabsClient {
  if ('client' in options) {
    return options.client;
  }

  return new ElevenLabsClient({
    apiKey: options.apiKey,
    ...(options.baseUrl ? {environment: options.baseUrl} : {}),
  });
}

function resolveModelRankings(options: VoiceEvalsClientOptions): ModelRankings {
  if (options.modelRankings) {
    return options.modelRankings;
  }

  const candidate = options.modelRankingsPath
    ?? join(process.cwd(), DEFAULT_RANKINGS_PATH);
  if (!existsSync(candidate)) {
    return FALLBACK_RANKINGS;
  }

  try {
    const raw = readFileSync(candidate, 'utf8');
    const parsed = JSON.parse(raw) as ModelRankings;
    if (typeof parsed.default !== 'string'
      || !Array.isArray(parsed.recommended)
      || !Array.isArray(parsed.banned)) {
      return FALLBACK_RANKINGS;
    }

    return parsed;
  } catch {
    return FALLBACK_RANKINGS;
  }
}
