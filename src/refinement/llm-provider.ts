/**
 * Default LLM provider for the Refinement orchestrator. Backs the
 * rubric_judge failure detectors (and any future LLM-driven step) with a
 * Gemini callback constructed from GEMINI_API_KEY.
 *
 * Returns `undefined` when no key is present so the orchestrator stays
 * deterministic and offline in mock / CI mode — rubric_judge modes simply
 * don't fire, exactly as before. Production builds inside ElevenLabs would
 * inject their own model here.
 *
 * Model defaults to gemini-3-flash-preview (the project's low-latency voice
 * default per CLAUDE.md). Override with REFINE_JUDGE_MODEL.
 */
import {execFile, execFileSync} from 'node:child_process';
import {accessSync, constants as fsConstants} from 'node:fs';
import {promisify} from 'node:util';
import type {LlmCompleteCallback} from '../ingestion/types';

const execFileAsync = promisify(execFile);

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export function createGeminiLlm(apiKey: string, model = process.env.REFINE_JUDGE_MODEL ?? 'gemini-3-flash-preview'): LlmCompleteCallback {
  return async ({system, user, responseFormat}) => {
    const body = {
      systemInstruction: {parts: [{text: system}]},
      contents: [{role: 'user', parts: [{text: user}]}],
      generationConfig: {
        temperature: 0.1,
        ...(responseFormat === 'json' ? {responseMimeType: 'application/json'} : {}),
      },
    };

    const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini ${model} returned ${response.status}: ${errorBody.slice(0, 200)}`);
    }

    const json = await response.json() as {
      candidates?: Array<{content?: {parts?: Array<{text?: string}>}}>;
    };
    return json.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';
  };
}

/**
 * Provider backed by a unified LLM CLI (`llm.sh` and compatibles) resolved
 * from `LLM_SH` or PATH. The CLI handles its own provider fallback + auth,
 * which is why this works on machines where raw REST keys are stale. Stays a
 * no-op for package consumers who don't have such a CLI installed.
 */
export function createCliLlm(binPath: string): LlmCompleteCallback {
  return async ({system, user, responseFormat}) => {
    const env = {...process.env, ...(system ? {LLM_SYSTEM: system} : {})};
    const args = responseFormat === 'json'
      ? ['--schema', '{"type":"object"}', user]
      : [user];
    const {stdout} = await execFileAsync(binPath, args, {
      env,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout.trim();
  };
}

function resolveLlmCli(): string | undefined {
  // Honor LLM_SH only when the path points to an existing executable. A
  // stale/mistyped LLM_SH would otherwise be preferred over a valid Gemini
  // key, and createCliLlm would fail at exec time — rubric detection
  // swallows that error per call, so the run silently reports zero rubric
  // findings. Fall through to PATH lookup, then to undefined (offline-safe).
  if (process.env.LLM_SH) {
    try {
      accessSync(process.env.LLM_SH, fsConstants.X_OK);
      return process.env.LLM_SH;
    } catch {
      // not executable / does not exist — ignore and fall through
    }
  }

  try {
    return execFileSync('command', ['-v', 'llm.sh'], {encoding: 'utf8', shell: '/bin/bash'}).trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Construct the default judge LLM. Preference order:
 *   1. A unified LLM CLI (`llm.sh`) on PATH / via LLM_SH — it owns auth + fallback.
 *   2. A Gemini REST key in the environment.
 *   3. undefined — rubric_judge modes are skipped (offline-safe).
 */
export function resolveDefaultJudgeLlm(): LlmCompleteCallback | undefined {
  const cli = resolveLlmCli();
  if (cli) {
    return createCliLlm(cli);
  }

  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  return key ? createGeminiLlm(key) : undefined;
}
