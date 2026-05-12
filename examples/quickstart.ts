/**
 * @wranngle/voice-evals — quickstart example.
 *
 * Demonstrates each v1.0 namespace end-to-end with synthesized data.
 * Run with: `bun run examples/quickstart.ts`
 *
 * No live ElevenLabs API key required — every external call is mocked.
 * For a real-agent integration, see docs/methodology.md and the
 * `testing:live:el` script.
 */

import {
  // wrapper
  cleanTools, parseAgentName,
  // scoring
  aggregate, compose, contains, llmRubric, not, rmsEnvelope,
  // ingestion
  CANONICAL_PERSONAS, importPostCallWebhook, proposeTestCases,
  // regression
  captureBaseline, diffAgainstBaseline,
  // remediation
  applyFix, proposeFix,
  // types
  type DimensionScore, type ElevenLabsPostCallPayload,
} from '../src';

// ---- wrapper: phase parsing ---------------------------------------------
const parsed = parseAgentName('[DEV] Sarah - Lead Specialist');
console.log('wrapper.parseAgentName:', parsed);

// ---- wrapper: tool schema cleaning --------------------------------------
const tools = cleanTools([{
  name: 'send_sms',
  description: 'Send SMS to the caller.',
  api_schema: {
    request_body_schema: {
      type: 'object',
      properties: {
        // Mutually exclusive fields the API rejects — cleanTools strips them.
        phone_number: {type: 'string', is_system_provided: true, enum: ['a', 'b']},
      },
    },
  },
}]);
console.log('wrapper.cleanTools:', JSON.stringify(tools, null, 2));

// ---- scoring: assertions + ensemble -------------------------------------
const transcriptCheck = compose<string>(
  contains('thanks for calling'),
  not(contains('I cannot')),
  llmRubric('Is the tone professional?', async () => ({score: 0.9, reasoning: 'warm'})),
);
const dimensions = await transcriptCheck('Hi, thanks for calling Wranngle. How can I help?');
console.log('scoring.compose result:', aggregate(dimensions as DimensionScore[]));

// ---- scoring: audio-native ----------------------------------------------
const sampleRate = 48_000;
const speech = new Float32Array(sampleRate * 0.6); // 600ms of "speech" at 0.5 amplitude
for (let i = 0; i < speech.length; i++) {
  speech[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
}

// Synthesize a tiny WAV header inline (real consumers would load from fs)
const env = rmsEnvelope(speech, sampleRate);
console.log('scoring.rmsEnvelope window count:', env.length, 'max =', Math.max(...env).toFixed(3));

// scoreVoiceActivity expects a parsed WavInfo — see tests/scoring/audio.test.ts
// for a `synthesizeWav()` helper that produces real WAV PCM bytes.

// ---- ingestion: post-call payload -> TestCase[] ------------------------
const payload: ElevenLabsPostCallPayload = {
  type: 'post_call_transcription',
  data: {
    agent_id: 'agent_xxxx_demo',
    conversation_id: 'conv_demo_1',
    transcript: [
      {role: 'agent', message: 'Hi, how can I help?'},
      {role: 'user', message: 'My account is locked.'},
    ],
    analysis: {
      transcript_summary: 'Caller asked about account lock',
      evaluation_criteria_results: {
        tone_friendly: {result: 'success', rationale: 'warm opening'},
        resolved_issue: {result: 'failure', rationale: 'transferred to human'},
      },
    },
  },
};
const {cases: importedCases} = importPostCallWebhook(payload);
console.log('ingestion.importPostCallWebhook: emitted', importedCases.length, 'TestCases');

// ---- ingestion: LLM-driven proposer ------------------------------------
const proposed = await proposeTestCases(
  'Caller: When do you open? Agent: We open at 9 AM weekdays.',
  {
    llm: async () => JSON.stringify([{
      suggested_id: 'hours-on-weekend',
      name: 'Hours on weekend',
      description: 'Verifies the agent surfaces weekend hours when asked.',
      intent: 'State weekend hours.',
      simulated_user: {first_message: 'And on Saturday?'},
      draft_assertions: ['Agent provides a Saturday open time.'],
    }]),
  },
);
console.log('ingestion.proposeTestCases:', proposed[0]?.suggested_id);

// ---- ingestion: canonical personas -------------------------------------
console.log('ingestion.CANONICAL_PERSONAS:', CANONICAL_PERSONAS.map(p => p.id).join(', '));

// ---- regression: baseline + diff ---------------------------------------
const baseline = captureBaseline(
  [{
    test_id: 'TC-1', outcome: {
      status: 'passed', dimensions: [], score: 0.9, errors: [],
    },
  }],
  {name: 'demo-baseline'},
);
const current = [{
  test_id: 'TC-1', outcome: {
    status: 'failed' as const, dimensions: [], score: 0.6, errors: ['regressed'],
  },
}];
const diff = diffAgainstBaseline(current, baseline);
console.log('regression.diffAgainstBaseline regressions:', diff.regressions.length);

// ---- remediation: proposer ---------------------------------------------
const fixes = await proposeFix({
  llm: async () => JSON.stringify([{
    target: 'voice_speed',
    locator: '',
    proposed_value: '0.95',
    rationale: 'Slow down to give callers room.',
    addresses: ['voice_activity'],
  }]),
  agentConfig: {tts: {speed: 1.1}},
  failures: [{name: 'voice_activity', status: 'failed', detail: 'too rushed'}],
});
console.log('remediation.proposeFix:', fixes);

// applyFix demo skipped here — it PATCHes a real agent. See tests/remediation/apply.test.ts
// for the mocked SDK pattern.
void applyFix;
