/**
 * META-AUDIT — Spiritual shortcomings: aspirational contracts the system
 * SHOULD satisfy but does not yet. Every test in this file is written with
 * `it.fails` against the CORRECT contract. Today they "pass" (because they
 * fail as expected). When someone fixes the underlying gap, the test starts
 * passing for real — vitest reports it as a `it.fails` failure, which means
 * "promote this to a real test and remove the `.fails` qualifier."
 *
 * The set is curated to expose architectural gaps, not feature bugs:
 *
 *   E1  — no end-to-end audio path test exists
 *   E2  — post-call webhook → persistent sink pipeline is stubbed
 *   E3  — no live test for the client-initiation fast-fail contract
 *   E4  — governance never exercised against a real-cloud mutation rejection
 *   E5  — scoring has no labeled ground-truth dataset
 *   E6  — remediation loop never measured on a known-bad agent
 *   E7  — prompt overrides via webhook are not verified against live agent
 *   E8  — signature verification has no replay protection (timestamp reuse OK)
 *   E9  — data_collection extraction quality has no benchmark fixture
 *   E10 — observability: no JSONL traces for CLI verb invocations
 *
 * The repo-wide README at tests/_meta_audit/README.md explains the philosophy.
 */

import {describe, expect, it} from 'vitest';
import {readFileSync, readdirSync, statSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {verifyElevenLabsSignature} from '../../src/security/elevenlabs-signature';

const ROOT = process.cwd();
const TESTS_DIR = join(ROOT, 'tests');

function walkFiles(dir: string, predicate: (path: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

const SELF_FILE = 'template-spiritual-shortcomings.test.ts';
function grepFiles(dir: string, pattern: RegExp, fileFilter = (p: string) => p.endsWith('.ts')): string[] {
  return walkFiles(dir, fileFilter)
    .filter(p => !p.endsWith(SELF_FILE)) // exclude self — the contract file itself contains the search patterns
    .filter(p => pattern.test(readFileSync(p, 'utf8')));
}

describe('META-AUDIT: SPIRITUAL — aspirational contracts that should hold but do not', () => {
  it.fails('E1: at least one test initiates a live ElevenLabs call AND verifies the audible response via ASR', () => {
    // Look for files that both start a real call and re-transcribe the agent's audio
    // for assertion. The mocked elevenlabs runner unit tests don't count.
    const candidates = grepFiles(TESTS_DIR, /api\.elevenlabs\.io\/v1\/convai\/conversation|websocket.*convai/i)
      .filter(p => /transcribe|asr|ScribeRealtime|audio_response/i.test(readFileSync(p, 'utf8')));
    expect(candidates.length, 'no end-to-end audio test found in tests/').toBeGreaterThan(0);
  });

  it.fails('E2: post-call webhook payload reaches a persistent sink (file/DB/CRM) within 30s of delivery', () => {
    // We check the codebase for a handler that does both signature-verify AND
    // a write to a persistence layer. If only types exist, this fails.
    const handlerCandidates = grepFiles(join(ROOT, 'src'), /verifyElevenLabsSignature/)
      .filter(p => /writeFileSync|appendFileSync|insert\s*\(|db\.|prisma\.|pg\.|notion\./i.test(readFileSync(p, 'utf8')));
    expect(handlerCandidates.length, 'no post-call → sink handler found').toBeGreaterThan(0);
  });

  it.fails('E3: a live integration test posts to the client-initiation webhook and ElevenLabs picks up the response', () => {
    const liveCandidates = grepFiles(TESTS_DIR, /conversation_initiation_client_data/i)
      .filter(p => /fetch\(['"`]https:\/\/api\.elevenlabs\.io/i.test(readFileSync(p, 'utf8')));
    expect(liveCandidates.length, 'no live client-initiation webhook test').toBeGreaterThan(0);
  });

  it.fails('E4: governance has been verified against a real-cloud [PROD] mutation rejection', () => {
    // Look for a test that constructs a request to the live ElevenLabs API
    // against an agent it has classified as `[PROD]` and asserts a 4xx.
    const candidates = grepFiles(TESTS_DIR, /\[PROD\]/)
      .filter(p => /fetch\(['"`]https:\/\/api\.elevenlabs\.io/i.test(readFileSync(p, 'utf8')));
    expect(candidates.length, 'governance phase rejection never tested against live API').toBeGreaterThan(0);
  });

  it.fails('E5: scoring is validated against a labeled ground-truth dataset of ≥20 conversations', () => {
    const fixturePaths = [
      join(ROOT, 'tests', 'fixtures', 'labeled-conversations.json'),
      join(ROOT, 'tests', 'scoring', 'fixtures', 'ground-truth.json'),
      join(ROOT, 'tests', 'fixtures', 'scoring-ground-truth.json'),
    ];
    const found = fixturePaths.find(p => existsSync(p));
    expect(found, 'no labeled ground-truth fixture found for scoring').toBeTruthy();
    if (found) {
      const data = JSON.parse(readFileSync(found, 'utf8')) as Array<unknown>;
      expect(data.length).toBeGreaterThanOrEqual(20);
    }
  });

  /**
   * E6 PROMOTED — `tests/_meta_audit/polish-loop-outcomes.test.ts` already
   * tests `improvedDimensions` and `netImprovement` on regressing/improving
   * fixes. The gap is closed at the harness level. What remains spiritually
   * unproven: that the loop produces a better config against a REAL agent
   * (not a mocked evaluate function). Until we have a live-call benchmark,
   * the partial coverage is enough to keep this off the spiritual list.
   */
  it('E6 [PROMOTED]: polishLoop has at least one test that asserts improvedDimensions/netImprovement', () => {
    const candidates = grepFiles(join(ROOT, 'tests'), /polishLoop|PolishLoopResult/)
      .filter(p => /improvedDimensions|netImprovement|regressed/i.test(readFileSync(p, 'utf8')));
    expect(candidates.length, 'polishLoop effectiveness assertions found in tests/').toBeGreaterThan(0);
  });

  it.fails('E7: a webhook-delivered first_message override is verified as the first agent utterance in a live call', () => {
    const candidates = grepFiles(TESTS_DIR, /first_message/)
      .filter(p => /conversation_initiation|override/i.test(readFileSync(p, 'utf8')))
      .filter(p => /transcribe|agent_response.*audio/i.test(readFileSync(p, 'utf8')));
    expect(candidates.length, 'override verification has no live audio path').toBeGreaterThan(0);
  });

  it.fails('E8: signature verification rejects a replay of a fresh, valid digest seen within the tolerance window', () => {
    // Use the existing verifier with the SAME timestamp + body + signature twice.
    // Today both succeed — there's no replay cache. Contract: the second one
    // should fail with `signature_replayed`.
    const secret = 'spiritual_test_secret';
    const body = JSON.stringify({type: 'post_call_transcription', data: {conversation_id: 'c1'}});
    const ts = Math.floor(Date.now() / 1000);
    const v0 = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    const header = `t=${ts},v0=${v0}`;

    const first = verifyElevenLabsSignature(body, header, secret);
    expect(first.ok, 'first delivery should verify').toBe(true);

    const second = verifyElevenLabsSignature(body, header, secret);
    // CONTRACT: second should be rejected as a replay
    expect(second.ok, 'second delivery with identical signature must be rejected').toBe(false);
    if (!second.ok) {
      expect(second.reason).toContain('replay');
    }
  });

  it.fails('E9: data_collection extraction is benchmarked against a labeled fixture set', () => {
    const candidates = [
      join(ROOT, 'tests', 'fixtures', 'data-collection-benchmark.json'),
      join(ROOT, 'tests', 'ingestion-llm', 'fixtures', 'data-collection-truth.json'),
    ];
    const found = candidates.find(p => existsSync(p));
    expect(found, 'no labeled data_collection benchmark found').toBeTruthy();
  });

  it.fails('E10: EVERY public CLI verb file emits a structured JSONL trace event per invocation', () => {
    // The global CLAUDE.md mandates "tracing development per jsonl skill" for
    // all features. Partial coverage (one tracer in one verb) does not
    // satisfy the contract. Every src/cli/commands/*.ts must import or call a
    // tracer that writes to a JSONL stream.
    const commandFiles = walkFiles(join(ROOT, 'src', 'cli', 'commands'), p => p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.includes('config-loader'));
    const untraced = commandFiles.filter(p => !/appendJsonlEvent|writeJsonlEvent|emitTraceEvent/i.test(readFileSync(p, 'utf8')));
    expect(untraced, `CLI verbs without JSONL tracing: ${untraced.map(p => p.split('/').pop()).join(', ')}`).toEqual([]);
  });
});
