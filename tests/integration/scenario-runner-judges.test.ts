import {
  mkdirSync, rmSync, writeFileSync,
} from 'node:fs';
import {join} from 'node:path';
import {
  afterEach, beforeEach, describe, expect, test, vi,
} from 'vitest';
import {
  clearAllDataSync,
  discoverScenarioTestCases,
  loadScenarioDefinition,
  loadScenarioTranscript,
  parseScenarioYaml,
  ScenarioRunner,
  scoreScenario,
  TestOrchestrator,
} from '../../lib/testing';

const UNIQUE_STORAGE_DIR = join(process.cwd(), '.test-data-scenario-runner-judges-' + process.pid);
const LOOKUP_SCENARIO = join(process.cwd(), 'tests/scenarios/lookup-record-greeting/scenario.yaml');
const BARGE_SCENARIO = join(process.cwd(), 'tests/scenarios/barge-in-mid-question/scenario.yaml');

describe('Scenario runner (judges + scoring)', () => {
  beforeEach(() => {
    process.env.TEST_STORAGE_DIR = UNIQUE_STORAGE_DIR;
    mkdirSync(UNIQUE_STORAGE_DIR, {recursive: true});
    clearAllDataSync();
  });

  afterEach(() => {
    clearAllDataSync();
    rmSync(UNIQUE_STORAGE_DIR, {recursive: true, force: true});
    delete process.env.TEST_STORAGE_DIR;
  });

  test('fails the barge-in fixture with useful axis failures', async () => {
    const runner = new ScenarioRunner();
    const testCase = discoverScenarioTestCases().find(test => test.test_id === 'SCEN-barge-in-mid-question');
    expect(testCase).toBeDefined();
    if (!testCase) {
      throw new Error('barge-in scenario fixture was not discovered');
    }

    const result = await runner.execute(testCase);

    expect(result.status).toBe('failed');
    expect(result.assertions_failed).toBe(2);
    expect(result.error_message).toContain('barge_in_recovery');
    expect(result.error_message).toContain('total_turn_p95_ms');
    // Failing latency axis must surface the breach amount, not echo the
    // pass-branch wording — otherwise log readers cannot tell pass from fail.
    expect(result.error_message).toContain('exceeded budget');
    expect(result.error_message).toContain('500ms'); // worst evidence: 3500 breakdown p95 - 3000 budget
  });

  test('orchestrator can run discovered scenarios without ingesting them', async () => {
    const orchestrator = new TestOrchestrator();
    const summary = await orchestrator.run({
      id: 'SCEN-lookup-record-greeting',
      extraTestCases: discoverScenarioTestCases(),
    });

    expect(summary.total_tests).toBe(1);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(0);
  });

  test('validates missing scenario paths clearly', () => {
    const runner = new ScenarioRunner();
    const validation = runner.validate({
      test_id: 'SCEN-missing',
      type: 'scenario',
      name: 'missing',
      description: 'missing',
      input: {scenario_path: join(process.cwd(), 'tests/scenarios/nope/scenario.yaml')},
      expected_output: {},
      tags: ['scenario'],
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    expect(validation.valid).toBe(false);
    expect(validation.errors.join('\n')).toContain('nope/scenario.yaml');
  });

  test('loads the committed failing fixture path', () => {
    const scenario = loadScenarioDefinition(BARGE_SCENARIO);
    expect(scenario.partial_credit).toBe(true);
    expect(scenario.judge_llm).toBe('claude-haiku-4-5');
  });

  test('discovery skips a malformed scenario without dropping the rest', () => {
    const brokenDir = join(process.cwd(), 'tests/scenarios/zz-malformed-fixture-temp');
    mkdirSync(brokenDir, {recursive: true});
    writeFileSync(join(brokenDir, 'scenario.yaml'), 'not: actually: valid yaml at all\n');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const cases = discoverScenarioTestCases();
      // Lookup + barge-in fixtures should still surface; broken one is dropped.
      expect(cases.find(testCase => testCase.test_id === 'SCEN-lookup-record-greeting')).toBeDefined();
      expect(cases.find(testCase => testCase.test_id === 'SCEN-zz-malformed-fixture-temp')).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('zz-malformed-fixture-temp'));
    } finally {
      warn.mockRestore();
      rmSync(brokenDir, {recursive: true, force: true});
    }
  });

  test('rejects declared axes that would not be scored', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Missing criterion for declared latency axis.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, parameters_pass: true }
    weight: 1.0
`, LOOKUP_SCENARIO)).toThrow('axis "ttfb_p95_ms" is declared but has no success_criteria item');
  });

  test('rejects scenario IDs that do not match the directory name', () => {
    expect(() => parseScenarioYaml(`
id: stale-copy
description: Copied fixture with stale scenario identity.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('id "stale-copy" must match scenario directory "lookup-record-greeting"');
  });

  test('supports inline YAML comments without changing scalar values', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: "Caller #1 lookup fixture" # quoted hash is part of the value
agent: primary
fixture:
  transcript: transcript.json # deterministic transcript fixture
axes:
  - name: ttfb_p95_ms # latency budget
thresholds:
  ttfb_p95_ms: 800 # ms
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass # required expectation
    weight: 0.5 # relative weight
partial_credit: false # must stay false
`, LOOKUP_SCENARIO);

    expect(scenario.description).toBe('Caller #1 lookup fixture');
    expect(scenario.fixture.transcript).toBe('transcript.json');
    expect(scenario.success_criteria[0].expected).toBe('pass');
    expect(scenario.success_criteria[0].weight).toBe(0.5);
    expect(scenario.partial_credit).toBe(false);
  });

  test('rejects duplicate axis declarations', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Duplicate axes make scored dimensions ambiguous.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('Duplicate axis "ttfb_p95_ms"');
  });

  test('rejects duplicate thresholds instead of silently overwriting budgets', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Duplicate latency budgets must not let the last value win.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
  ttfb_p95_ms: 5000
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('Duplicate threshold "ttfb_p95_ms"');
  });

  test('rejects unsupported thresholds instead of storing inert budgets', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Threshold typos must not look like enforced coverage.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
  ttfb_p99_ms: 1200
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('threshold "ttfb_p99_ms" is not supported');
  });

  test('rejects barge-in yield budgets that no barge-in scorer will read', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Barge-in threshold without barge-in recovery is dead config.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
  barge_in_yield_ms: 400
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('barge_in_yield_ms threshold requires a barge_in_recovery success_criteria item');
  });

  test('rejects duplicate inline expectation keys', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Duplicate expected keys must not rewrite the intended tool name.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, name: delete_account, parameters_pass: true }
    weight: 1.0
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('Duplicate inline object key "name"');
  });

  test('rejects scenarios without a latency threshold', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Missing voice latency budget.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
thresholds:
  barge_in_yield_ms: 400
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, parameters_pass: true }
    weight: 1.0
`, LOOKUP_SCENARIO)).toThrow('at least one latency threshold is required');
  });

  test('accepts tool-call round-trip latency as latency coverage', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Tool-call latency is a real latency budget, not optional metadata.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_round_trip_ms
thresholds:
  tool_call_round_trip_ms: 2000
success_criteria:
  - axis: tool_call_round_trip_ms
    expected: { name: lookup_record }
    weight: 1.0
`, LOOKUP_SCENARIO);
    const result = scoreScenario(scenario, loadScenarioTranscript(scenario));

    expect(result.status).toBe('passed');
    expect(result.failure_messages).toEqual([]);
  });

  test('rejects no-tool latency criteria as the only latency coverage', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Tool latency n/a proves no tool path, not a latency budget.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_round_trip_ms
thresholds:
  tool_call_round_trip_ms: 2000
success_criteria:
  - axis: tool_call_round_trip_ms
    expected: n/a
    weight: 1.0
`, LOOKUP_SCENARIO)).toThrow('at least one measured latency success_criteria item is required');
  });

  test('rejects latency thresholds that are not scored', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Latency thresholds must not imply coverage unless a criterion scores them.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, parameters_pass: true }
    weight: 1.0
`, LOOKUP_SCENARIO)).toThrow('latency threshold "ttfb_p95_ms" is declared but has no success_criteria item');
  });

  test('rejects scored latency axes without a matching threshold', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Latency criteria must have the exact budget they enforce.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('latency success_criteria axis "ttfb_p95_ms" requires a matching threshold');
  });

  test('rejects success criteria without explicit expectations', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Missing expected value would let latency axes pass by threshold alone.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: ttfb_p95_ms
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('success_criteria[0].expected is required');
  });

  test('rejects tool schema criteria that only check the tool name', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Name-only tool schema checks overclaim schema coverage.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record }
    weight: 1.0
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('must include parameters_pass: true or response_consumed_in_next_turn: true');
  });

  test('rejects typoed tool schema expectation fields', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Typoed tool schema keys must not disable schema checks.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, parameter_pass: true }
    weight: 1.0
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('unsupported key "parameter_pass"');

    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Typoed booleans must not be treated as disabled checks.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, parameters_pass: tru }
    weight: 1.0
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('parameters_pass for tool_call_schema must be true');
  });

  test('rejects typoed tool latency max_ms overrides', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Per-tool latency overrides must not silently fall back to the looser global threshold.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_round_trip_ms
thresholds:
  tool_call_round_trip_ms: 2000
success_criteria:
  - axis: tool_call_round_trip_ms
    expected: { name: lookup_record, max_ms: 800ms }
    weight: 1.0
`, LOOKUP_SCENARIO)).toThrow('expected.max_ms for tool_call_round_trip_ms must be a non-negative number');
  });

  test('rejects threshold values with non-numeric suffixes', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Threshold units must not be silently parsed away.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800ms
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('Threshold "ttfb_p95_ms" must be numeric');
  });

  test('rejects weight values with non-numeric suffixes', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Criterion weight typos must not become partial numbers.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5oops
`, LOOKUP_SCENARIO)).toThrow('Criterion weight must be numeric');
  });

  test('rejects non-positive success criterion weights', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Non-positive weights can distort partial-credit scoring.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0
`, LOOKUP_SCENARIO)).toThrow('success_criteria[0].weight must be greater than 0');
  });

  test('rejects subjective axes without an explicit judge model', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Missing judge model for subjective axis.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tone_judge
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: tone_judge
    expected: polite
    weight: 1.0
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('judge_llm is required for subjective axes: tone_judge');
  });

  test('tone judge scores agent tone, not caller frustration', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: A frustrated caller should not make a calm agent fail tone.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tone_judge
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tone_judge
    expected: polite
    weight: 1.0
  - axis: total_turn_p95_ms
    expected: pass
    weight: 0.5
judge_llm: claude-haiku-4-5
`, LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      metrics: {
        total_turn_p95_ms: 100,
      },
      turns: [
        {role: 'caller', text: 'This is stupid, I already told you my zip code.'},
        {role: 'agent', text: 'I hear you. I can keep going from the zip code you already gave me.'},
      ],
    });

    expect(result.status).toBe('passed');
    expect(result.axes.find(axis => axis.name === 'tone_judge')).toMatchObject({
      pass: true,
      detail: expect.stringContaining('offline politeness heuristic passed'),
    });
  });

  test('tone judge fails rude agent language even when caller is calm', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Agent-side rude language must fail tone.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tone_judge
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tone_judge
    expected: polite
    weight: 1.0
  - axis: total_turn_p95_ms
    expected: pass
    weight: 0.5
judge_llm: claude-haiku-4-5
`, LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      metrics: {
        total_turn_p95_ms: 100,
      },
      turns: [
        {role: 'caller', text: 'Could you repeat that?'},
        {role: 'agent', text: 'Obviously, you need to listen more carefully.'},
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('offline politeness heuristic failed');
  });

  test('tone judge fails when a fixture claims tone coverage without agent speech', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Tone coverage requires agent-side utterance evidence.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tone_judge
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tone_judge
    expected: polite
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
judge_llm: claude-haiku-4-5
`, LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      metrics: {
        total_turn_p95_ms: 100,
      },
      turns: [
        {role: 'caller', text: 'Hello? Is anyone there?'},
      ],
    });

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('requires at least one agent utterance');
    expect(result.axes.find(axis => axis.name === 'tone_judge')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('does not let partial credit pass an unsupported axis', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Unsupported axes are invalid coverage even with partial credit.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: unsupported_voice_axis
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: unsupported_voice_axis
    expected: pass
    weight: 0.1
  - axis: ttfb_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const result = scoreScenario(scenario, loadScenarioTranscript(scenario));

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('no offline scorer registered');
    expect(result.axes.find(axis => axis.name === 'unsupported_voice_axis')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('rejects typoed latency expectations before scoring', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Latency expectation typo must not pass just because the fixture is fast.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
  - name: total_turn_p95_ms
thresholds:
  ttfb_p95_ms: 800
  total_turn_p95_ms: 3000
success_criteria:
  - axis: ttfb_p95_ms
    expected: pas
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO)).toThrow('success_criteria[0].expected for ttfb_p95_ms must be pass');
  });

  test('does not let partial credit pass missing latency evidence', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Missing latency fixture evidence must not be washed out by partial credit.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
  - name: total_turn_p95_ms
thresholds:
  ttfb_p95_ms: 800
  total_turn_p95_ms: 3000
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      metrics: {
        total_turn_p95_ms: 100,
      },
      latency_breakdown_ms: {
        total_turn: [100],
      },
    });

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('ttfb_p95_ms metric is missing');
    expect(result.axes.find(axis => axis.name === 'ttfb_p95_ms')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('does not let partial credit pass a latency budget breach', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Latency budgets are hard gates even when other axes pass.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
  - name: total_turn_p95_ms
thresholds:
  ttfb_p95_ms: 800
  total_turn_p95_ms: 3000
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      metrics: {
        ttfb_p95_ms: 900,
        total_turn_p95_ms: 100,
      },
    });

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('ttfb_p95_ms');
    expect(result.failure_messages.join('\n')).toContain('exceeded budget');
    expect(result.axes.find(axis => axis.name === 'ttfb_p95_ms')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('does not let partial credit pass missing tool latency evidence', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Tool latency axes require fixture evidence even under partial credit.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_round_trip_ms
  - name: total_turn_p95_ms
thresholds:
  tool_call_round_trip_ms: 2000
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tool_call_round_trip_ms
    expected: { name: lookup_record }
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: transcript.tool_calls?.map(toolCall => ({
        ...toolCall,
        round_trip_ms: undefined,
      })),
    });

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('round_trip_ms fixture evidence');
    expect(result.axes.find(axis => axis.name === 'tool_call_round_trip_ms')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('does not let partial credit pass a tool latency budget breach', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Tool latency budgets are hard gates even when other axes pass.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_round_trip_ms
  - name: total_turn_p95_ms
thresholds:
  tool_call_round_trip_ms: 2000
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tool_call_round_trip_ms
    expected: { name: lookup_record }
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      metrics: {
        total_turn_p95_ms: 100,
      },
      tool_calls: transcript.tool_calls?.map(toolCall => ({
        ...toolCall,
        round_trip_ms: 2500,
      })),
    });

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('tool_call_round_trip_ms');
    expect(result.failure_messages.join('\n')).toContain('exceeded budget');
    expect(result.axes.find(axis => axis.name === 'tool_call_round_trip_ms')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('does not let partial credit pass missing tool schema evidence', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Tool schema axes require explicit fixture verdicts under partial credit.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, parameters_pass: true }
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: transcript.tool_calls?.map(toolCall => ({
        ...toolCall,
        schema_pass: undefined,
      })),
    });

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('schema_pass verdict');
    expect(result.axes.find(axis => axis.name === 'tool_call_schema')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('does not let partial credit pass failed tool schema evidence', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Tool schema failures are hard gates even when other axes pass.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, parameters_pass: true }
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: transcript.tool_calls?.map(toolCall => ({
        ...toolCall,
        schema_pass: false,
      })),
    });

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('parameters failed schema validation');
    expect(result.axes.find(axis => axis.name === 'tool_call_schema')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('does not let partial credit pass unconsumed tool responses', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Tool responses must affect the next agent turn even under partial credit.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, response_consumed_in_next_turn: true }
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: transcript.tool_calls?.map(toolCall => ({
        ...toolCall,
        response_consumed_in_next_turn: false,
      })),
    });

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('not consumed in the next agent turn');
    expect(result.axes.find(axis => axis.name === 'tool_call_schema')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('does not let partial credit pass unexpected tool calls in no-tool scenarios', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: No-tool expectations must not become soft misses under partial credit.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tool_call_schema
    expected: n/a
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const result = scoreScenario(scenario, loadScenarioTranscript(scenario));

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('expected no tool call');
    expect(result.axes.find(axis => axis.name === 'tool_call_schema')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('does not let partial credit pass unexpected tool calls for n/a tool latency', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Tool latency n/a means no tool path should be present.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_round_trip_ms
  - name: total_turn_p95_ms
thresholds:
  tool_call_round_trip_ms: 2000
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tool_call_round_trip_ms
    expected: n/a
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const result = scoreScenario(scenario, loadScenarioTranscript(scenario));

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('expected no tool call');
    expect(result.axes.find(axis => axis.name === 'tool_call_round_trip_ms')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('does not let partial credit pass wrong tool routing', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Routing correctness is a hard gate even when other axes pass.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_routing
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tool_call_routing
    expected: kb
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const result = scoreScenario(scenario, loadScenarioTranscript(scenario));

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('expected knowledge-base route');
    expect(result.axes.find(axis => axis.name === 'tool_call_routing')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('passes exact tool routing when the expected tool is called', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Routing can assert the exact server-side tool, not just any tool.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_routing
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tool_call_routing
    expected: { route: tool, name: lookup_record }
    weight: 1.0
  - axis: total_turn_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO);

    const result = scoreScenario(scenario, loadScenarioTranscript(scenario));

    expect(result.status).toBe('passed');
    expect(result.failure_messages).toEqual([]);
    expect(result.axes.find(axis => axis.name === 'tool_call_routing')).toMatchObject({
      pass: true,
      detail: 'agent chose expected tool route "lookup_record"',
    });
  });

  test('does not let partial credit pass routing to the wrong specific tool', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: A send_email route must not satisfy a send_sms routing expectation.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_routing
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tool_call_routing
    expected: { route: tool, name: send_sms }
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const result = scoreScenario(scenario, loadScenarioTranscript(scenario));

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('expected tool route via "send_sms"');
    expect(result.failure_messages.join('\n')).toContain('lookup_record');
    expect(result.axes.find(axis => axis.name === 'tool_call_routing')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('rejects malformed exact tool routing expectations before scoring', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Routing objects must declare which route is being asserted.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_routing
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tool_call_routing
    expected: { name: lookup_record }
    weight: 1.0
  - axis: total_turn_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('expected.route for tool_call_routing must be tool, kb, or knowledge_base');

    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Knowledge-base routes cannot name a server-side tool.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_routing
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: tool_call_routing
    expected: { route: kb, name: lookup_record }
    weight: 1.0
  - axis: total_turn_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO)).toThrow('expected.name for tool_call_routing is only valid when route is tool');
  });

  test('does not let partial credit pass a barge-in yield budget breach', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Barge-in yield budgets are hard gates even when other axes pass.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: barge_in_recovery
  - name: total_turn_p95_ms
thresholds:
  barge_in_yield_ms: 400
  total_turn_p95_ms: 3000
success_criteria:
  - axis: barge_in_recovery
    expected: true
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      metrics: {
        total_turn_p95_ms: 100,
      },
      turns: [
        {
          role: 'caller',
          text: 'Actually, that is not what I meant.',
          agent_yielded_at_ms_after_caller_start: 900,
        },
      ],
    });

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('barge_in_recovery');
    expect(result.failure_messages.join('\n')).toContain('expected <= 400ms');
    expect(result.axes.find(axis => axis.name === 'barge_in_recovery')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('fails barge-in recovery when a later interruption breaches the budget', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Multiple interruptions must all recover inside the yield budget.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: barge_in_recovery
  - name: total_turn_p95_ms
thresholds:
  barge_in_yield_ms: 400
  total_turn_p95_ms: 3000
success_criteria:
  - axis: barge_in_recovery
    expected: true
    weight: 1.0
  - axis: total_turn_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO);

    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      metrics: {
        total_turn_p95_ms: 100,
      },
      turns: [
        {
          turn: 'barge_in_event_1',
          agent_yielded_at_ms_after_caller_start: 250,
        },
        {
          turn: 'barge_in_event_2',
          agent_yielded_at_ms_after_caller_start: 900,
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('barge_in_recovery');
    expect(result.failure_messages.join('\n')).toContain('worst yield 900ms');
    expect(result.failure_messages.join('\n')).toContain('expected <= 400ms');
  });

  test('does not let stale barge-in turn evidence hide aggregate yield breaches', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Aggregate barge-in yield evidence must be scored when present.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: barge_in_recovery
  - name: total_turn_p95_ms
thresholds:
  barge_in_yield_ms: 400
  total_turn_p95_ms: 3000
success_criteria:
  - axis: barge_in_recovery
    expected: true
    weight: 1.0
  - axis: total_turn_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO);

    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      metrics: {
        total_turn_p95_ms: 100,
      },
      latency_breakdown_ms: {
        total_turn: [100],
        barge_in_yield_latency: [250, 900],
      },
      turns: [
        {
          turn: 'barge_in_event',
          agent_yielded_at_ms_after_caller_start: 250,
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('barge_in_yield_latency p95');
    expect(result.failure_messages.join('\n')).toContain('worst yield 900ms');
  });

  test('does not let partial credit pass missing barge-in evidence', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Barge-in coverage requires an actual interruption event.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: barge_in_recovery
  - name: total_turn_p95_ms
thresholds:
  barge_in_yield_ms: 400
  total_turn_p95_ms: 3000
success_criteria:
  - axis: barge_in_recovery
    expected: true
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const result = scoreScenario(scenario, loadScenarioTranscript(scenario));

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('transcript has no barge-in event');
    expect(result.axes.find(axis => axis.name === 'barge_in_recovery')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('does not let partial credit pass unexpected barge-in events for n/a coverage', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Explicit no-barge-in coverage must fail if the fixture contains an interruption event.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: barge_in_recovery
  - name: total_turn_p95_ms
thresholds:
  total_turn_p95_ms: 3000
success_criteria:
  - axis: barge_in_recovery
    expected: n/a
    weight: 0.1
  - axis: total_turn_p95_ms
    expected: pass
    weight: 1.0
partial_credit: true
`, LOOKUP_SCENARIO);

    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      metrics: {
        total_turn_p95_ms: 100,
      },
      turns: [
        {
          turn: 'barge_in_event',
          agent_yielded_at_ms_after_caller_start: 250,
        },
      ],
    });

    expect(result.weighted_score).toBeGreaterThan(0.7);
    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('expected no caller barge-in');
    expect(result.axes.find(axis => axis.name === 'barge_in_recovery')).toMatchObject({
      hard_fail: true,
      pass: false,
    });
  });

  test('rejects non-boolean partial credit values', () => {
    expect(() => parseScenarioYaml(`
id: lookup-record-greeting
description: Partial-credit typos must not silently enable partial scoring.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
partial_credit: yes
`, LOOKUP_SCENARIO)).toThrow('partial_credit must be true or false');
  });

  test('fails barge-in recovery when the fixture has no barge-in event', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Illegitimately claiming barge-in coverage from a normal lookup fixture.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: barge_in_recovery
  - name: ttfb_p95_ms
thresholds:
  ttfb_p95_ms: 800
success_criteria:
  - axis: barge_in_recovery
    expected: true
    weight: 1.0
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO);
    const result = scoreScenario(scenario, loadScenarioTranscript(scenario));

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('transcript has no barge-in event');
  });
});
