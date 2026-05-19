import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import {dirname} from 'node:path';
import {type} from 'arktype';

export type NotifyProvider = 'slack' | 'discord';

export type NotifyPayload = {
  total: number;
  passed: number;
  delta: number | undefined;
};

export type NotifySink = {
  report(input: NotifyPayload): Promise<void>;
};

export const NoopNotifySink: NotifySink = {
  async report(): Promise<void> {
    // intentional no-op
  },
};

const BaselineSchema = type({
  passed: 'number.integer >= 0',
  total: 'number.integer >= 0',
});

type Baseline = typeof BaselineSchema.infer;

export function readBaseline(path: string): Baseline | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return BaselineSchema.assert(raw);
  } catch {
    return undefined;
  }
}

export function writeBaseline(path: string, baseline: Baseline): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, {recursive: true});
  }

  writeFileSync(path, `${JSON.stringify(baseline)}\n`, 'utf8');
}

export function formatSummaryText({passed, total, delta}: NotifyPayload): string {
  const deltaSegment = delta === undefined
    ? ''
    : ` (Δ ${delta >= 0 ? '+' : ''}${delta})`;
  return `voice-evals: ${passed}/${total} pass${deltaSegment}`;
}

export function buildSlackBody(payload: NotifyPayload): {text: string} {
  return {text: formatSummaryText(payload)};
}

export function buildDiscordBody(payload: NotifyPayload): {content: string} {
  return {content: formatSummaryText(payload)};
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type WebhookSinkOptions = {
  url: string;
  provider: NotifyProvider;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

function pickProviderFromUrl(url: string): NotifyProvider {
  return url.includes('discord.com') ? 'discord' : 'slack';
}

function pickProvider(rawProvider: string, url: string): NotifyProvider {
  if (rawProvider === 'discord') {
    return 'discord';
  }

  if (rawProvider === 'slack') {
    return 'slack';
  }

  return pickProviderFromUrl(url);
}

export function createWebhookNotifySink(options: WebhookSinkOptions): NotifySink {
  const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  return {
    async report(payload: NotifyPayload): Promise<void> {
      const body = options.provider === 'slack'
        ? buildSlackBody(payload)
        : buildDiscordBody(payload);
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      try {
        await fetchImpl(options.url, {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export type NotifyEnv = Record<string, string | undefined>;

export function notifySinkFromEnv(
  env: NotifyEnv,
  fetchImpl: FetchLike = fetch,
): NotifySink {
  const url = env.VOICE_EVALS_NOTIFY_WEBHOOK_URL;
  if (!url) {
    return NoopNotifySink;
  }

  const rawProvider = (env.VOICE_EVALS_NOTIFY_PROVIDER ?? '').toLowerCase();
  const provider = pickProvider(rawProvider, url);
  return createWebhookNotifySink({url, provider, fetchImpl});
}

export function defaultBaselinePath(env: NotifyEnv = process.env): string {
  return env.VOICE_EVALS_NOTIFY_BASELINE_FILE
    ?? '.artifacts/voice-evals/notify-baseline.json';
}
