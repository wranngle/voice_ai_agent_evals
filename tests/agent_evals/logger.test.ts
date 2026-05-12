import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, test} from 'vitest';
import {createFileSink, createJsonLogger} from '../../src/agent_evals/providers/logger';

describe('logger', () => {
  test('file sink writes one JSON line per event', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-evals-logger-'));
    const path = join(dir, 'events.jsonl');
    try {
      const logger = createJsonLogger(createFileSink(path));
      logger.info('first', {a: 1});
      logger.warn('second', {b: 2});
      const lines = readFileSync(path, 'utf-8')
        .trim()
        .split('\n')
        .map(l => JSON.parse(l));
      expect(lines).toHaveLength(2);
      expect(lines[0]?.['log.level']).toBe('info');
      expect(lines[0]?.message).toBe('first');
      expect(lines[0]?.a).toBe(1);
      expect(lines[1]?.['log.level']).toBe('warn');
      expect(lines[1]?.b).toBe(2);
      expect(typeof lines[0]?.['@timestamp']).toBe('string');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  test('custom sink receives raw JSON lines', () => {
    const captured: string[] = [];
    const logger = createJsonLogger({
      write(line: string) {
        captured.push(line);
      },
    });
    logger.info('captured');
    expect(captured).toHaveLength(1);
    expect(captured[0]?.endsWith('\n')).toBe(true);
    const event = JSON.parse(captured[0] ?? '{}');
    expect(event.message).toBe('captured');
    expect(event['service.name']).toBe('agent-evals');
  });
});
