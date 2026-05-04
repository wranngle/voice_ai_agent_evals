/**
 * Shared helpers for runners that gate on environment configuration.
 *
 * Three runners (ElevenLabs, n8n-eval, MCP) share an identical
 * "missing API key" guard at the top of execute(). Centralized here
 * so the message stays uniform and a future change (e.g. adding a
 * link to the troubleshooting doc) lands in one place.
 */

import type {TestExecutionResult} from './types';

/**
 * Build the canonical "missing API key" error result.
 *
 * @param envVar  The env-var name the operator should set (e.g. "N8N_API_KEY").
 *                Used in both `actual_output.error` and `error_message`.
 * @param startTime  The Date.now() captured at the start of execute(), used
 *                   to compute latency_ms even on the early-exit path.
 */
export function missingApiKeyResult(envVar: string, startTime: number): TestExecutionResult {
  return {
    status: 'error',
    actual_output: {error: `${envVar} not configured`},
    latency_ms: Date.now() - startTime,
    error_message: `${envVar} environment variable or constructor parameter required`,
    assertions_passed: 0,
    assertions_failed: 0,
  };
}
