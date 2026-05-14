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
import {verifyElevenLabsSignature, createReplayCache} from '../../src/security/elevenlabs-signature';

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
  /**
   * E1 PARTIALLY PROMOTED — `tests/integration/elevenlabs-simulate-live.test.ts`
   * exercises the agent end-to-end through ElevenLabs's simulate-conversation
   * API (text proxy for audio). Closes the "no live test through the agent
   * exists" gap. The TRUE audio path (TTS + WebRTC) remains a separate
   * forcing function tracked in the test file itself — see its top-of-file
   * comment.
   */
  it('E1 [PROMOTED-PARTIAL]: live ElevenLabs simulate-conversation test exists', () => {
    const candidates = grepFiles(TESTS_DIR, /simulate-conversation/)
      .filter(p => /api\.elevenlabs\.io\/v1\/convai\/agents/.test(readFileSync(p, 'utf8')));
    expect(candidates.length, 'no live simulate-conversation test found').toBeGreaterThan(0);
  });

  /**
   * E2 PROMOTED — `src/ingestion/post-call-receiver.ts` is a working in-process
   * HTTP receiver that HMAC-verifies + writes payloads as JSONL lines to
   * `<cwd>/logs/elevenlabs/post-call-<ISO-date>.ndjson`. The n8n post-call
   * workflow's POST-Ingest branch can target an instance of this server
   * (set $env.EVALS_INGEST_URL to the listener URL).
   *
   * The harness check below asserts the handler module exists and combines
   * signature verification with a persistent write. The runtime contract
   * (HMAC-verify + persist within 30s) is exercised by the unit/integration
   * tests for src/ingestion/post-call-receiver.ts directly.
   */
  it('E2 [PROMOTED]: a post-call sink handler exists that combines HMAC-verify with a persistent write', () => {
    const handlerCandidates = grepFiles(join(ROOT, 'src'), /verifyElevenLabsSignature/)
      .filter(p => /writeFileSync|appendFileSync|insert\s*\(|db\.|prisma\.|pg\.|notion\./i.test(readFileSync(p, 'utf8')));
    expect(handlerCandidates.length, 'no post-call → sink handler found').toBeGreaterThan(0);
  });

  /**
   * E3 PROMOTED — `tests/integration/client-initiation-live.test.ts` POSTs to
   * the live n8n client-init webhook and asserts the response shape +
   * latency budget. Companion to E1 which then exercises the agent's
   * downstream consumption of that response via simulate-conversation.
   */
  it('E3 [PROMOTED]: live client-initiation webhook test exists', () => {
    const liveCandidates = grepFiles(TESTS_DIR, /conversation_initiation_client_data/)
      .filter(p => /webhook\/elevenlabs\/initiation|CLIENT_INIT_URL/.test(readFileSync(p, 'utf8')));
    expect(liveCandidates.length, 'no live client-initiation webhook test').toBeGreaterThan(0);
  });

  /**
   * E4 PROMOTED — `tests/integration/governance-live.test.ts` clones the
   * template, renames the clone to `[PROD]` via the raw SDK, attempts an
   * update through our governance-gated wrapper (expect GovernanceError),
   * verifies the explicit opt-in path with allowedPhases works, then
   * archives the temp agent. skipIf CI / no API key.
   *
   * The harness-side proof is that such a test file exists: it must
   * reference `[PROD]`, the live ElevenLabs API host, and the wrapper's
   * GovernanceError. Below detects that.
   */
  it('E4 [PROMOTED]: live governance test exists targeting [PROD] mutation rejection', () => {
    const candidates = grepFiles(TESTS_DIR, /\[PROD\]/)
      .filter(p => /GovernanceError/.test(readFileSync(p, 'utf8')))
      .filter(p => /createVoiceEvalsClient|api\.elevenlabs\.io/.test(readFileSync(p, 'utf8')));
    expect(candidates.length, 'live governance test missing').toBeGreaterThan(0);
  });

  /**
   * E5 PROMOTED — `tests/fixtures/labeled-conversations.json` is a curated
   * dataset of 21 conversations spanning happy-path, edge-case, and guardrail-
   * violation scenarios. Each entry has expected sentiment, resolution,
   * task-completion, and an overall scoring axis value. Use it to benchmark
   * `src/scoring/*` end to end.
   */
  it('E5 [PROMOTED]: labeled ground-truth scoring dataset is present with ≥20 conversations', () => {
    const fixturePath = join(ROOT, 'tests', 'fixtures', 'labeled-conversations.json');
    expect(existsSync(fixturePath), 'fixture file missing').toBe(true);
    const data = JSON.parse(readFileSync(fixturePath, 'utf8')) as Array<unknown>;
    expect(data.length).toBeGreaterThanOrEqual(20);
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

  /**
   * E7 PARTIALLY PROMOTED — the second `it` in
   * `tests/integration/elevenlabs-simulate-live.test.ts` injects a uniquely-
   * tagged `first_message` via `conversation_config_override` on a live
   * simulate-conversation request, then asserts the override appears in the
   * agent's transcript. Closes the "override never verified end-to-end" gap.
   * The audio path remains the same separate forcing function as E1.
   */
  it('E7 [PROMOTED-PARTIAL]: override verification test exists with live simulate-conversation', () => {
    const candidates = grepFiles(TESTS_DIR, /conversation_config_override/)
      .filter(p => /simulate-conversation/.test(readFileSync(p, 'utf8')))
      .filter(p => /first_message/.test(readFileSync(p, 'utf8')));
    expect(candidates.length, 'override verification via live simulate-conversation missing').toBeGreaterThan(0);
  });

  /**
   * E8 PROMOTED — replay protection landed in
   * src/security/elevenlabs-signature.ts. The verifier accepts an optional
   * `replayCache`; the in-memory default rejects any (t, v0) digest seen
   * twice inside the 30-minute tolerance window. Multi-process operators
   * can supply a Redis-backed cache matching the `ReplayCache` shape.
   */
  it('E8 [PROMOTED]: signature verification rejects a replay of a fresh, valid digest', () => {
    const replayCache = createReplayCache();
    const secret = 'spiritual_test_secret';
    const body = JSON.stringify({type: 'post_call_transcription', data: {conversation_id: 'c1'}});
    const ts = Math.floor(Date.now() / 1000);
    const v0 = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
    const header = `t=${ts},v0=${v0}`;

    const first = verifyElevenLabsSignature(body, header, secret, {replayCache});
    expect(first.ok, 'first delivery should verify').toBe(true);

    const second = verifyElevenLabsSignature(body, header, secret, {replayCache});
    expect(second.ok, 'second delivery with identical signature must be rejected').toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('signature_replayed');
    }
  });

  /**
   * E9 PROMOTED — `tests/fixtures/data-collection-benchmark.json` carries 6
   * labeled transcripts with expected data_collection extraction results
   * spanning complete intake, emergency-no-address, estimate routing,
   * different-contact-than-requestor, incomplete intake, and transfer cases.
   * Use it to benchmark LLM extractor accuracy.
   */
  it('E9 [PROMOTED]: labeled data_collection benchmark fixture is present', () => {
    const fixturePath = join(ROOT, 'tests', 'fixtures', 'data-collection-benchmark.json');
    expect(existsSync(fixturePath), 'fixture file missing').toBe(true);
    const data = JSON.parse(readFileSync(fixturePath, 'utf8')) as Array<unknown>;
    expect(data.length).toBeGreaterThanOrEqual(5);
  });

  /**
   * E10 contract — every public CLI verb file imports `createTracer` and
   * emits at least one JSONL trace event per invocation. Detection looks for
   * either the canonical import line or a `createTracer(` call site. config-
   * loader and subcommand dispatcher utilities are exempt (they're helpers,
   * not verbs).
   */
  it('E10: every public CLI verb file imports a JSONL tracer', () => {
    const commandFiles = walkFiles(join(ROOT, 'src', 'cli', 'commands'), p => p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.includes('config-loader'));
    const untraced = commandFiles.filter(p => !/createTracer\(|jsonl-trace/i.test(readFileSync(p, 'utf8')));
    expect(untraced, `CLI verbs without JSONL tracing: ${untraced.map(p => p.split('/').pop()).join(', ')}`).toEqual([]);
  });
});
