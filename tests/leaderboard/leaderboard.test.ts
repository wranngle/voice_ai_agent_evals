import {
  mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  aggregateAgent,
  buildLeaderboard,
  DEMO_AGENTS,
  renderJson,
  renderMarkdown,
} from '../../src/leaderboard';
import {runCli} from '../../src/leaderboard/cli';
import type {LeaderboardAgentInput} from '../../src/leaderboard/types';

const FIXED_NOW = '2026-05-14T12:00:00.000Z';

function makeAgent(overrides: Partial<LeaderboardAgentInput> & {agent: string}): LeaderboardAgentInput {
  return {
    runs: [
      {
        test_id: 'TC-1',
        outcome: {
          status: 'passed', dimensions: [], score: 0.9, errors: [],
        },
        latency_ms: 800,
        cost_usd: 0.001,
      },
      {
        test_id: 'TC-2',
        outcome: {
          status: 'failed', dimensions: [], score: 0.4, errors: ['nope'],
        },
        latency_ms: 1200,
        cost_usd: 0.002,
      },
    ],
    ...overrides,
  };
}

describe('aggregateAgent', () => {
  it('computes mean score, p95 latency, summed cost, and pass percent', () => {
    const row = aggregateAgent(makeAgent({agent: 'foo'}));
    expect(row.agent).toBe('foo');
    expect(row.runs).toBe(2);
    expect(row.score).toBeCloseTo(0.65, 5);
    // nearest-rank p95 of [800, 1200] is the 2nd value: 1200.
    expect(row.latency_p95_ms).toBe(1200);
    expect(row.cost_usd).toBeCloseTo(0.003, 5);
    expect(row.pass_pct).toBe(50);
  });

  it('returns null for latency/cost when no run reports either', () => {
    const row = aggregateAgent({
      agent: 'no-telemetry',
      runs: [{
        test_id: 'T',
        outcome: {
          status: 'passed', dimensions: [], score: 1, errors: [],
        },
      }],
    });
    expect(row.latency_p95_ms).toBeNull();
    expect(row.cost_usd).toBeNull();
    expect(row.pass_pct).toBe(100);
  });
});

describe('buildLeaderboard', () => {
  it('sorts rows by score descending, ties broken by agent name asc', () => {
    const board = buildLeaderboard([
      makeAgent({agent: 'b-mid'}),
      makeAgent({
        agent: 'a-top',
        runs: [{
          test_id: 'T',
          outcome: {
            status: 'passed', dimensions: [], score: 0.99, errors: [],
          },
        }],
      }),
      makeAgent({
        agent: 'c-mid',
        runs: makeAgent({agent: 'x'}).runs,
      }),
    ], {now: () => FIXED_NOW});
    expect(board.generatedAt).toBe(FIXED_NOW);
    expect(board.rows.map(r => r.agent)).toEqual(['a-top', 'b-mid', 'c-mid']);
  });
});

describe('renderMarkdown', () => {
  it('emits the exact header row spec downstream consumers grep against', () => {
    const board = buildLeaderboard(DEMO_AGENTS, {now: () => FIXED_NOW});
    const md = renderMarkdown(board);
    expect(md).toContain('| Agent | Score | Latency p95 | Cost | Pass% |');
    // header separator line follows
    expect(md).toContain('| --- | --- | --- | --- | --- |');
  });

  it('renders one data row per agent', () => {
    const board = buildLeaderboard(DEMO_AGENTS, {now: () => FIXED_NOW});
    const md = renderMarkdown(board);
    for (const agent of DEMO_AGENTS) {
      expect(md).toContain(`| ${agent.agent} |`);
    }
  });

  it('formats null telemetry as em-dash', () => {
    const board = buildLeaderboard([{
      agent: 'sparse',
      runs: [{
        test_id: 'T',
        outcome: {
          status: 'passed', dimensions: [], score: 1, errors: [],
        },
      }],
    }], {now: () => FIXED_NOW});
    const md = renderMarkdown(board);
    expect(md).toContain('| sparse | 1.000 | — | — | 100.0% |');
  });
});

describe('renderJson', () => {
  it('round-trips through JSON.parse with the same rows', () => {
    const board = buildLeaderboard(DEMO_AGENTS, {now: () => FIXED_NOW});
    const parsed = JSON.parse(renderJson(board));
    expect(parsed.generatedAt).toBe(FIXED_NOW);
    expect(parsed.rows.length).toBe(DEMO_AGENTS.length);
    expect(parsed.rows[0]).toHaveProperty('agent');
    expect(parsed.rows[0]).toHaveProperty('latency_p95_ms');
  });
});

describe('runCli', () => {
  it('writes leaderboard.md + leaderboard.json with the demo fixture', () => {
    const dir = mkdtempSync(join(tmpdir(), 'voice-evals-leaderboard-'));
    try {
      runCli(['--out-dir', dir]);
      const md = readFileSync(join(dir, 'leaderboard.md'), 'utf8');
      const json = readFileSync(join(dir, 'leaderboard.json'), 'utf8');
      expect(md).toContain('| Agent | Score | Latency p95 | Cost | Pass% |');
      // at least one data row (proof acceptance)
      expect(md.split('\n').filter(l => l.startsWith('| ') && !l.includes('Agent') && !l.includes('---')).length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(json);
      expect(parsed.rows.length).toBe(DEMO_AGENTS.length);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it('accepts --in pointing at a JSON array of agent inputs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'voice-evals-leaderboard-in-'));
    try {
      const inPath = join(dir, 'agents.json');
      const customAgents: LeaderboardAgentInput[] = [{
        agent: 'custom-agent',
        runs: [{
          test_id: 'TC-X',
          outcome: {
            status: 'passed', dimensions: [], score: 0.77, errors: [],
          },
          latency_ms: 500,
          cost_usd: 0.0005,
        }],
      }];
      writeFileSync(inPath, JSON.stringify(customAgents), 'utf8');
      runCli(['--in', inPath, '--out-dir', dir]);
      const md = readFileSync(join(dir, 'leaderboard.md'), 'utf8');
      expect(md).toContain('| custom-agent |');
      expect(md).toContain('| Agent | Score | Latency p95 | Cost | Pass% |');
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });
});
