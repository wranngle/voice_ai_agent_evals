import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import {
  buildDiscordBody,
  buildSlackBody,
  createWebhookNotifySink,
  formatSummaryText,
  notifySinkFromEnv,
  readBaseline,
  writeBaseline,
  NoopNotifySink,
} from '../../src/notify';

type FetchSpyArgs = [string, RequestInit?];
type FetchSpy = ((...args: FetchSpyArgs) => Promise<Response>) & {
  mock: {calls: FetchSpyArgs[]};
};

function fetchMock(responseBuilder: () => Response): FetchSpy {
  return vi.fn(async (_url: string, _init?: RequestInit) => responseBuilder());
}

function bodyString(init: RequestInit | undefined): string {
  const {body} = init ?? {};
  if (typeof body !== 'string') {
    throw new TypeError('expected request body to be a JSON string');
  }

  return body;
}

function parseBody(init: RequestInit | undefined): Record<string, unknown> {
  return JSON.parse(bodyString(init));
}

describe('notify reporter — summary formatting', () => {
  test('renders Slack text with positive delta', () => {
    expect(formatSummaryText({passed: 9, total: 10, delta: 1}))
      .toBe('voice-evals: 9/10 pass (Δ +1)');
  });

  test('renders negative delta with explicit minus sign', () => {
    expect(formatSummaryText({passed: 7, total: 10, delta: -2}))
      .toBe('voice-evals: 7/10 pass (Δ -2)');
  });

  test('omits delta segment when baseline is absent', () => {
    expect(formatSummaryText({passed: 5, total: 5, delta: undefined}))
      .toBe('voice-evals: 5/5 pass');
  });

  test('Slack body uses {text}, Discord body uses {content}', () => {
    expect(buildSlackBody({passed: 9, total: 10, delta: 1}))
      .toEqual({text: 'voice-evals: 9/10 pass (Δ +1)'});
    expect(buildDiscordBody({passed: 9, total: 10, delta: 1}))
      .toEqual({content: 'voice-evals: 9/10 pass (Δ +1)'});
  });
});

describe('notify reporter — webhook POST', () => {
  test('POSTs Slack-shaped body to configured URL', async () => {
    const fetchSpy = fetchMock(() => new Response('ok', {status: 200}));
    const sink = createWebhookNotifySink({
      url: 'https://hooks.slack.com/services/T/B/X',
      provider: 'slack',
      fetchImpl: fetchSpy,
    });

    await sink.report({passed: 9, total: 10, delta: 1});

    expect(fetchSpy.mock.calls.length).toBe(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/services/T/B/X');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({'content-type': 'application/json'});
    expect(parseBody(init)).toEqual({text: 'voice-evals: 9/10 pass (Δ +1)'});
    expect(bodyString(init)).toContain('"text":"voice-evals: 9/10 pass (Δ +1)"');
  });

  test('POSTs Discord-shaped body when provider is discord', async () => {
    const fetchSpy = fetchMock(() => new Response(null, {status: 204}));
    const sink = createWebhookNotifySink({
      url: 'https://discord.com/api/webhooks/123/abc',
      provider: 'discord',
      fetchImpl: fetchSpy,
    });

    await sink.report({passed: 9, total: 10, delta: 1});

    const [, init] = fetchSpy.mock.calls[0];
    expect(parseBody(init)).toEqual({content: 'voice-evals: 9/10 pass (Δ +1)'});
  });

  test('does not throw when remote returns non-2xx', async () => {
    const fetchSpy = fetchMock(() => new Response('rate-limited', {status: 429}));
    const sink = createWebhookNotifySink({
      url: 'https://hooks.slack.com/services/T/B/X',
      provider: 'slack',
      fetchImpl: fetchSpy,
    });

    await expect(sink.report({passed: 1, total: 1, delta: undefined})).resolves.toBeUndefined();
  });
});

describe('notify reporter — env wiring', () => {
  test('returns NoopNotifySink when URL env is unset', () => {
    expect(notifySinkFromEnv({})).toBe(NoopNotifySink);
  });

  test('infers Discord provider from URL host when not set explicitly', async () => {
    const fetchSpy = fetchMock(() => new Response('ok'));
    const sink = notifySinkFromEnv(
      {VOICE_EVALS_NOTIFY_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/x'},
      fetchSpy,
    );
    await sink.report({passed: 3, total: 3, delta: undefined});
    expect(parseBody(fetchSpy.mock.calls[0][1])).toHaveProperty('content');
  });

  test('defaults to Slack provider for unknown hosts', async () => {
    const fetchSpy = fetchMock(() => new Response('ok'));
    const sink = notifySinkFromEnv(
      {VOICE_EVALS_NOTIFY_WEBHOOK_URL: 'https://intranet.example/hook'},
      fetchSpy,
    );
    await sink.report({passed: 3, total: 3, delta: undefined});
    expect(parseBody(fetchSpy.mock.calls[0][1])).toHaveProperty('text');
  });

  test('explicit VOICE_EVALS_NOTIFY_PROVIDER overrides host inference', async () => {
    const fetchSpy = fetchMock(() => new Response('ok'));
    const sink = notifySinkFromEnv(
      {
        VOICE_EVALS_NOTIFY_WEBHOOK_URL: 'https://discord.com/api/webhooks/1/x',
        VOICE_EVALS_NOTIFY_PROVIDER: 'slack',
      },
      fetchSpy,
    );
    await sink.report({passed: 1, total: 1, delta: undefined});
    expect(parseBody(fetchSpy.mock.calls[0][1])).toHaveProperty('text');
  });
});

describe('notify reporter — baseline persistence', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'notify-baseline-'));
  });
  afterEach(() => {
    rmSync(dir, {recursive: true, force: true});
  });

  test('round-trips passed/total', () => {
    const path = join(dir, 'baseline.json');
    writeBaseline(path, {passed: 8, total: 10});
    expect(readBaseline(path)).toEqual({passed: 8, total: 10});
  });

  test('returns undefined when file is missing', () => {
    expect(readBaseline(join(dir, 'missing.json'))).toBeUndefined();
  });

  test('returns undefined when file content is malformed', () => {
    const path = join(dir, 'bad.json');
    writeBaseline(path, {passed: 1, total: 1});
    rmSync(path);
    expect(readBaseline(path)).toBeUndefined();
  });

  test('creates parent directories when missing', () => {
    const path = join(dir, 'nested', 'deeper', 'baseline.json');
    writeBaseline(path, {passed: 2, total: 3});
    expect(readBaseline(path)).toEqual({passed: 2, total: 3});
  });
});
