/**
 * Bundled fixture run for the public leaderboard demo. Deterministic so
 * `npm run leaderboard` produces a stable, reviewable artifact without
 * needing live ElevenLabs/n8n credentials.
 *
 * Three agents on a 3-scenario refund-flow synthetic suite. Score, latency,
 * and cost are illustrative — chosen to give the rendered table a visible
 * delta between leaderboard rows.
 */

import type {LeaderboardAgentInput} from './types';

const dimensions = (score: number, status: 'passed' | 'failed') => [
  {name: 'intent_match', status, score},
  {name: 'latency_budget', status, score},
];

export const DEMO_AGENTS: LeaderboardAgentInput[] = [
  {
    agent: 'refund-bot-v2',
    model: 'eleven-flash-2',
    runs: [
      {
        test_id: 'TC-refund-happy',
        outcome: {
          status: 'passed', dimensions: dimensions(0.95, 'passed'), score: 0.95, errors: [],
        },
        latency_ms: 820,
        cost_usd: 0.0011,
      },
      {
        test_id: 'TC-refund-edge',
        outcome: {
          status: 'passed', dimensions: dimensions(0.88, 'passed'), score: 0.88, errors: [],
        },
        latency_ms: 950,
        cost_usd: 0.0013,
      },
      {
        test_id: 'TC-refund-adversarial',
        outcome: {
          status: 'passed', dimensions: dimensions(0.81, 'passed'), score: 0.81, errors: [],
        },
        latency_ms: 1180,
        cost_usd: 0.0015,
      },
    ],
  },
  {
    agent: 'refund-bot-v1',
    model: 'eleven-turbo-1',
    runs: [
      {
        test_id: 'TC-refund-happy',
        outcome: {
          status: 'passed', dimensions: dimensions(0.9, 'passed'), score: 0.9, errors: [],
        },
        latency_ms: 1100,
        cost_usd: 0.0009,
      },
      {
        test_id: 'TC-refund-edge',
        outcome: {
          status: 'failed', dimensions: dimensions(0.4, 'failed'), score: 0.4, errors: ['intent_match: missed cancellation policy'],
        },
        latency_ms: 1320,
        cost_usd: 0.001,
      },
      {
        test_id: 'TC-refund-adversarial',
        outcome: {
          status: 'passed', dimensions: dimensions(0.72, 'passed'), score: 0.72, errors: [],
        },
        latency_ms: 1490,
        cost_usd: 0.0012,
      },
    ],
  },
  {
    agent: 'baseline-rule-based',
    runs: [
      {
        test_id: 'TC-refund-happy',
        outcome: {
          status: 'passed', dimensions: dimensions(0.65, 'passed'), score: 0.65, errors: [],
        },
        latency_ms: 240,
        cost_usd: 0,
      },
      {
        test_id: 'TC-refund-edge',
        outcome: {
          status: 'failed', dimensions: dimensions(0.2, 'failed'), score: 0.2, errors: ['fallback to generic apology'],
        },
        latency_ms: 260,
        cost_usd: 0,
      },
      {
        test_id: 'TC-refund-adversarial',
        outcome: {
          status: 'failed', dimensions: dimensions(0.1, 'failed'), score: 0.1, errors: ['no policy lookup'],
        },
        latency_ms: 280,
        cost_usd: 0,
      },
    ],
  },
];
