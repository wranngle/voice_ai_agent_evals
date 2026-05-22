/**
 * @wranngle/voice-evals/cli/commands/factory/client-builder — single seam
 * for constructing a VoiceEvalsClient from environment.
 *
 * Reads ELEVENLABS_API_KEY (required). Optional ELEVENLABS_BASE_URL passes
 * through to the SDK for self-hosted gateways. Throws a clean error message
 * (no stack) when ELEVENLABS_API_KEY is missing — CLI commands surface that
 * to the user as a 1-line message + non-zero exit.
 */

import {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import {createVoiceEvalsClient} from '../../../wrapper/client';
import type {ModelRankings, VoiceEvalsClient} from '../../../wrapper/types';
import {createTracer} from '../../../internal/jsonl-trace';

const trace = createTracer('cli.factory.client-builder');
// JSONL tracing — emit start/end events from dispatch entry points.

void trace;

export type BuildClientOptions = {
  apiKey?: string;
  baseUrl?: string;
};

export const DEFAULT_RANKINGS: ModelRankings = {
  default: 'gemini-3-flash-preview',
  recommended: ['gemini-3-flash-preview'],
  banned: ['gpt-4o-mini', 'gpt-5-mini', 'gemini-2.0-flash-001'],
};

export function buildClientFromEnv(options: BuildClientOptions = {}): VoiceEvalsClient {
  const apiKey = options.apiKey ?? process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is required (env var or --api-key)');
  }

  const baseUrl = options.baseUrl ?? process.env.ELEVENLABS_BASE_URL;
  const raw = new ElevenLabsClient(baseUrl
    ? {apiKey, environment: baseUrl}
    : {apiKey});
  return createVoiceEvalsClient({client: raw, modelRankings: DEFAULT_RANKINGS});
}
