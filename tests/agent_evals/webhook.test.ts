import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, test} from 'vitest';
import {type as arkType} from 'arktype';
import {
  WebhookPayloadSchema,
  WebhookEventTypeSchema,
  AnalysisDataSchema,
  type WebhookPayload,
} from '../../lib/agent_evals/types';

type SafeParseResult<T> =
  | {success: true; data: T}
  | {success: false; error: {message: string}};

function safeParse<T>(
  schema: (value: unknown) => T | arkType.errors,
  value: unknown,
): SafeParseResult<T> {
  const out = schema(value);
  if (out instanceof arkType.errors) {
    return {success: false, error: {message: out.summary}};
  }

  return {success: true, data: out};
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', '..', 'lib', 'agent_evals', 'fixtures');

describe('webhook contracts', () => {
  test('all webhook event fixtures conform to schema', () => {
    const fixturePath = join(fixturesDir, 'webhook-events.json');
    const raw = readFileSync(fixturePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);

    expect(Array.isArray(parsed)).toBe(true);
    const events = parsed as WebhookPayload[];
    expect(events.length).toBeGreaterThan(0);

    for (const event of events) {
      const result = safeParse(WebhookPayloadSchema, event);
      expect(
        result.success,
        `Event validation failed: ${result.success ? '' : result.error.message}`,
      ).toBe(true);
    }
  });

  test('conversation.started events include metadata', () => {
    const fixturePath = join(fixturesDir, 'webhook-events.json');
    const raw = readFileSync(fixturePath, 'utf-8');
    const events = JSON.parse(raw) as WebhookPayload[];

    const startedEvents = events.filter(e => e.type === 'conversation.started');
    expect(startedEvents.length).toBeGreaterThan(0);

    for (const event of startedEvents) {
      expect(event.conversationMetadata).toBeDefined();
      expect(event.conversationMetadata?.conversationId).toBeTruthy();
      expect(event.conversationMetadata?.agentId).toBeTruthy();
      expect(event.conversationMetadata?.startedAtMs).toBeDefined();
    }
  });

  test('transcript.ready events include transcript data', () => {
    const fixturePath = join(fixturesDir, 'webhook-events.json');
    const raw = readFileSync(fixturePath, 'utf-8');
    const events = JSON.parse(raw) as WebhookPayload[];

    const transcriptEvents = events.filter(e => e.type === 'transcript.ready');
    expect(transcriptEvents.length).toBeGreaterThan(0);

    for (const event of transcriptEvents) {
      expect(event.transcriptData).toBeDefined();
      expect(event.transcriptData?.conversationId).toBeTruthy();
      expect(event.transcriptData?.turns.length).toBeGreaterThan(0);
      expect(event.transcriptData?.completedAtMs).toBeGreaterThan(0);

      for (const turn of event.transcriptData?.turns ?? []) {
        expect(['agent', 'caller']).toContain(turn.role);
        expect(turn.text.length).toBeGreaterThan(0);
        expect(turn.startedAtMs).toBeGreaterThanOrEqual(0);
        expect(turn.durationMs).toBeGreaterThan(0);
      }
    }
  });

  test('conversation.ended events have metadata with endedAtMs', () => {
    const fixturePath = join(fixturesDir, 'webhook-events.json');
    const raw = readFileSync(fixturePath, 'utf-8');
    const events = JSON.parse(raw) as WebhookPayload[];

    const endedEvents = events.filter(e => e.type === 'conversation.ended');
    expect(endedEvents.length).toBeGreaterThan(0);

    for (const event of endedEvents) {
      expect(event.conversationMetadata).toBeDefined();
      expect(event.conversationMetadata?.endedAtMs).toBeDefined();
      expect((event.conversationMetadata?.endedAtMs ?? 0)
        >= (event.conversationMetadata?.startedAtMs ?? 0)).toBe(true);
    }
  });

  test('all webhook event fixtures use synthetic conversation IDs', () => {
    const fixturePath = join(fixturesDir, 'webhook-events.json');
    const raw = readFileSync(fixturePath, 'utf-8');
    const events = JSON.parse(raw) as WebhookPayload[];

    for (const event of events) {
      const conversationId
        = event.conversationMetadata?.conversationId
          || event.transcriptData?.conversationId;
      expect(
        conversationId?.startsWith('synth-'),
        `Event ${event.type} has non-synthetic conversation ID: ${conversationId}`,
      ).toBe(true);
    }
  });

  test('all webhook event fixtures use synthetic agent IDs', () => {
    const fixturePath = join(fixturesDir, 'webhook-events.json');
    const raw = readFileSync(fixturePath, 'utf-8');
    const events = JSON.parse(raw) as WebhookPayload[];

    for (const event of events) {
      const agentId = event.conversationMetadata?.agentId;
      if (agentId) {
        expect(
          agentId.startsWith('synth-'),
          `Event ${event.type} has non-synthetic agent ID: ${agentId}`,
        ).toBe(true);
      }
    }
  });

  test('webhook payloads contain valid ISO 8601 timestamps', () => {
    const fixturePath = join(fixturesDir, 'webhook-events.json');
    const raw = readFileSync(fixturePath, 'utf-8');
    const events = JSON.parse(raw) as WebhookPayload[];

    for (const event of events) {
      const timestamp = new Date(event.timestamp);
      expect(timestamp instanceof Date).toBe(true);
      expect(timestamp.getTime()).toBeGreaterThan(0);
      const isoRegex
        = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
      expect(isoRegex.test(event.timestamp)).toBe(true);
    }
  });

  test('webhook transcript turns have monotonic timestamps', () => {
    const fixturePath = join(fixturesDir, 'webhook-events.json');
    const raw = readFileSync(fixturePath, 'utf-8');
    const events = JSON.parse(raw) as WebhookPayload[];

    const transcriptEvents = events.filter(e => e.type === 'transcript.ready');
    for (const event of transcriptEvents) {
      const turns = event.transcriptData?.turns ?? [];
      let lastStartTime = -1;
      for (const turn of turns) {
        expect(turn.startedAtMs).toBeGreaterThan(lastStartTime);
        lastStartTime = turn.startedAtMs;
      }
    }
  });

  test('webhook event type schema covers expected event types', () => {
    const expectedTypes = [
      'conversation.started',
      'conversation.ended',
      'transcript.ready',
      'analysis.complete',
    ];
    for (const eventType of expectedTypes) {
      const result = safeParse(WebhookEventTypeSchema, eventType);
      expect(result.success).toBe(true);
    }
  });

  test('analysis.complete events include analysis data with synthetic IDs', () => {
    const fixturePath = join(fixturesDir, 'webhook-events.json');
    const raw = readFileSync(fixturePath, 'utf-8');
    const events = JSON.parse(raw) as WebhookPayload[];

    const analysisEvents = events.filter(e => e.type === 'analysis.complete');
    expect(analysisEvents.length).toBeGreaterThan(0);

    for (const event of analysisEvents) {
      expect(event.analysisData).toBeDefined();
      const result = safeParse(AnalysisDataSchema, event.analysisData);
      expect(result.success, `AnalysisData validation failed: ${result.success ? '' : result.error.message}`).toBe(true);
      expect(event.analysisData?.conversationId.startsWith('synth-')).toBe(true);
      expect(['positive', 'neutral', 'negative']).toContain(event.analysisData?.sentiment);
      expect(typeof event.analysisData?.resolved).toBe('boolean');
      expect((event.analysisData?.summaryText.length ?? 0)).toBeGreaterThan(0);
    }
  });

  test('all four webhook event types appear in fixtures', () => {
    const fixturePath = join(fixturesDir, 'webhook-events.json');
    const raw = readFileSync(fixturePath, 'utf-8');
    const events = JSON.parse(raw) as WebhookPayload[];

    const types = new Set(events.map(e => e.type));
    expect(types.has('conversation.started')).toBe(true);
    expect(types.has('conversation.ended')).toBe(true);
    expect(types.has('transcript.ready')).toBe(true);
    expect(types.has('analysis.complete')).toBe(true);
  });
});
