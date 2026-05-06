import {
  mkdirSync, rmSync, utimesSync, writeFileSync,
} from 'node:fs';
import {join} from 'node:path';
import {
  afterEach, beforeEach, describe, expect, test,
} from 'vitest';
import {
  clearAllDataSync,
  discoverScenarioTestCases,
  loadScenarioDefinition,
  loadScenarioTranscript,
  parseScenarioYaml,
  ScenarioRunner,
  scenarioToTestCase,
  scoreScenario,
} from '../../lib/testing';

const UNIQUE_STORAGE_DIR = join(process.cwd(), '.test-data-scenario-runner-' + process.pid);
const LOOKUP_SCENARIO = join(process.cwd(), 'tests/scenarios/lookup-record-greeting/scenario.yaml');

describe('Scenario runner', () => {
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

  test('loads scenario YAML and transcript fixtures', () => {
    const scenario = loadScenarioDefinition(LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);

    expect(scenario.id).toBe('lookup-record-greeting');
    expect(scenario.success_criteria).toHaveLength(6);
    expect(scenario.thresholds.tool_call_round_trip_ms).toBe(2000);
    expect(scenario.thresholds.ttfb_p95_ms).toBe(800);
    expect(transcript.metrics?.ttfb_p95_ms).toBe(612);
  });

  test('accepts ElevenLabs webhook transcript turns with null tool arrays', () => {
    const scenarioDir = join(UNIQUE_STORAGE_DIR, 'webhook-null-tool-arrays');
    const scenarioPath = join(scenarioDir, 'scenario.yaml');
    mkdirSync(scenarioDir, {recursive: true});
    writeFileSync(scenarioPath, `
id: webhook-null-tool-arrays
description: Official post-call webhooks can emit null tool arrays on transcript turns.
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
    weight: 1.0
`);
    writeFileSync(join(scenarioDir, 'transcript.json'), JSON.stringify({
      scenario_id: 'webhook-null-tool-arrays',
      agent_id: 'agent_xxxx_demo',
      turns: [
        {
          role: 'agent',
          message: 'Hi, how can I help?',
          tool_calls: null,
          tool_results: null,
        },
        {
          role: 'caller',
          message: 'I need help with my account.',
          tool_calls: null,
          tool_results: null,
        },
      ],
      tool_calls: null,
      metrics: {
        ttfb_p95_ms: 100,
      },
    }));

    const scenario = loadScenarioDefinition(scenarioPath);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, transcript);

    expect(result.status).toBe('passed');
    expect(result.failure_messages).toEqual([]);
  });

  test('rejects malformed transcript tool-call evidence before scoring', () => {
    const scenarioDir = join(UNIQUE_STORAGE_DIR, 'bad-tool-evidence');
    const scenarioPath = join(scenarioDir, 'scenario.yaml');
    mkdirSync(scenarioDir, {recursive: true});
    writeFileSync(scenarioPath, `
id: bad-tool-evidence
description: Tool evidence without a tool name must not reach scorer logic.
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
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`);
    writeFileSync(join(scenarioDir, 'transcript.json'), JSON.stringify({
      scenario_id: 'bad-tool-evidence',
      turns: [
        {
          turn: 1,
          role: 'agent',
          tool_call: {
            arguments: {id: '+15550100'},
            schema_pass: true,
          },
        },
      ],
      metrics: {
        ttfb_p95_ms: 100,
      },
    }));

    const scenario = loadScenarioDefinition(scenarioPath);
    expect(() => loadScenarioTranscript(scenario)).toThrow('turns[0].tool_call.name must be a non-empty string');
  });

  test('rejects malformed transcript latency fixtures before scoring', () => {
    const scenarioDir = join(UNIQUE_STORAGE_DIR, 'bad-latency-evidence');
    const scenarioPath = join(scenarioDir, 'scenario.yaml');
    mkdirSync(scenarioDir, {recursive: true});
    writeFileSync(scenarioPath, `
id: bad-latency-evidence
description: Latency fixtures must be numeric evidence, not vague labels.
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
`);
    writeFileSync(join(scenarioDir, 'transcript.json'), JSON.stringify({
      scenario_id: 'bad-latency-evidence',
      turns: [],
      metrics: {
        ttfb_p95_ms: 'fast',
      },
    }));

    const scenario = loadScenarioDefinition(scenarioPath);
    expect(() => loadScenarioTranscript(scenario)).toThrow('metrics.ttfb_p95_ms must be a non-negative finite number');
  });

  test('rejects latency breakdown keys that no scorer reads', () => {
    const scenarioDir = join(UNIQUE_STORAGE_DIR, 'dead-latency-evidence');
    const scenarioPath = join(scenarioDir, 'scenario.yaml');
    mkdirSync(scenarioDir, {recursive: true});
    writeFileSync(scenarioPath, `
id: dead-latency-evidence
description: Dead latency evidence must not make fixture coverage look richer.
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
`);
    writeFileSync(join(scenarioDir, 'transcript.json'), JSON.stringify({
      scenario_id: 'dead-latency-evidence',
      turns: [],
      metrics: {
        ttfb_p95_ms: 100,
      },
      latency_breakdown_ms: {
        ttfb_p95_ms: [900],
      },
    }));

    const scenario = loadScenarioDefinition(scenarioPath);
    expect(() => loadScenarioTranscript(scenario)).toThrow('latency_breakdown_ms.ttfb_p95_ms is not read by any latency scorer');
  });

  test('rejects transcript metrics that no scorer reads', () => {
    const scenarioDir = join(UNIQUE_STORAGE_DIR, 'dead-summary-metric');
    const scenarioPath = join(scenarioDir, 'scenario.yaml');
    mkdirSync(scenarioDir, {recursive: true});
    writeFileSync(scenarioPath, `
id: dead-summary-metric
description: Dead summary metrics must not make fixture coverage look richer.
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
`);
    writeFileSync(join(scenarioDir, 'transcript.json'), JSON.stringify({
      scenario_id: 'dead-summary-metric',
      turns: [],
      metrics: {
        ttfb_p95_ms: 100,
        asr_confidence_p95: 0.99,
      },
    }));

    const scenario = loadScenarioDefinition(scenarioPath);
    expect(() => loadScenarioTranscript(scenario)).toThrow('metrics.asr_confidence_p95 is not read by any scenario scorer');
  });

  test('rejects real-looking agent IDs in committed transcript fixtures', () => {
    const scenarioDir = join(UNIQUE_STORAGE_DIR, 'real-agent-fixture');
    const scenarioPath = join(scenarioDir, 'scenario.yaml');
    mkdirSync(scenarioDir, {recursive: true});
    writeFileSync(scenarioPath, `
id: real-agent-fixture
description: Transcript fixtures must not carry live ElevenLabs agent IDs.
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
`);
    writeFileSync(join(scenarioDir, 'transcript.json'), JSON.stringify({
      scenario_id: 'real-agent-fixture',
      agent_id: 'agent_3701k3ttaq12ewp8b7qv5rfyszkz',
      turns: [],
      metrics: {
        ttfb_p95_ms: 100,
      },
    }));

    const scenario = loadScenarioDefinition(scenarioPath);
    expect(() => loadScenarioTranscript(scenario)).toThrow('agent_id must be a synthetic demo id like agent_xxxx_demo');
  });

  test('rejects real-looking phone numbers anywhere in transcript fixtures', () => {
    const scenarioDir = join(UNIQUE_STORAGE_DIR, 'real-phone-fixture');
    const scenarioPath = join(scenarioDir, 'scenario.yaml');
    mkdirSync(scenarioDir, {recursive: true});
    writeFileSync(scenarioPath, `
id: real-phone-fixture
description: Transcript fixtures must use synthetic caller numbers.
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
`);
    writeFileSync(join(scenarioDir, 'transcript.json'), JSON.stringify({
      scenario_id: 'real-phone-fixture',
      agent_id: 'agent_xxxx_demo',
      turns: [
        {
          turn: 1,
          role: 'caller',
          text: 'My callback number is +14155551212.',
        },
      ],
      metrics: {
        ttfb_p95_ms: 100,
      },
    }));

    const scenario = loadScenarioDefinition(scenarioPath);
    expect(() => loadScenarioTranscript(scenario)).toThrow('contains non-synthetic phone number +14155551212');
  });

  test('rejects unversioned prompt tags in transcript fixtures', () => {
    const scenarioDir = join(UNIQUE_STORAGE_DIR, 'unversioned-prompt-tag');
    const scenarioPath = join(scenarioDir, 'scenario.yaml');
    mkdirSync(scenarioDir, {recursive: true});
    writeFileSync(scenarioPath, `
id: unversioned-prompt-tag
description: Prompt provenance must be versioned for run correlation.
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
`);
    writeFileSync(join(scenarioDir, 'transcript.json'), JSON.stringify({
      scenario_id: 'unversioned-prompt-tag',
      agent_id: 'agent_xxxx_demo',
      prompt_tag: 'primary-latest',
      turns: [],
      metrics: {
        ttfb_p95_ms: 100,
      },
    }));

    const scenario = loadScenarioDefinition(scenarioPath);
    expect(() => loadScenarioTranscript(scenario)).toThrow('prompt_tag must look like prompt/<name>/v<N>');
  });

  test('passes the lookup-record fixture with per-axis dimensions', async () => {
    const runner = new ScenarioRunner();
    const testCase = discoverScenarioTestCases().find(test => test.test_id === 'SCEN-lookup-record-greeting');
    expect(testCase).toBeDefined();
    if (!testCase) {
      throw new Error('lookup scenario fixture was not discovered');
    }

    const result = await runner.execute(testCase);

    expect(result.status).toBe('passed');
    expect(result.assertions_passed).toBe(6);
    expect(result.assertions_failed).toBe(0);
    expect(result.dimensions?.map(dimension => dimension.name)).toContain('tool_call_schema');
    expect(result.dimensions?.map(dimension => dimension.name)).toContain('tool_call_round_trip_ms');
    expect(result.dimensions?.map(dimension => dimension.name)).not.toContain('barge_in_recovery');
    expect(result.actual_output.weighted_score).toBe(1);
  });

  test('scenario test-case metadata does not depend on fixture mtime', () => {
    const scenarioDir = join(UNIQUE_STORAGE_DIR, 'metadata-stability');
    const scenarioPath = join(scenarioDir, 'scenario.yaml');
    mkdirSync(scenarioDir, {recursive: true});
    writeFileSync(join(scenarioDir, 'transcript.json'), JSON.stringify({
      scenario_id: 'metadata-stability',
      turns: [],
      metrics: {
        ttfb_p95_ms: 100,
      },
    }));
    writeFileSync(scenarioPath, `
id: metadata-stability
description: Stable metadata for deterministic scenario discovery.
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
    weight: 1.0
`);

    utimesSync(scenarioPath, new Date('2026-01-01T00:00:00.000Z'), new Date('2026-01-01T00:00:00.000Z'));
    const first = scenarioToTestCase(loadScenarioDefinition(scenarioPath));

    utimesSync(scenarioPath, new Date('1999-01-01T00:00:00.000Z'), new Date('1999-01-01T00:00:00.000Z'));
    const second = scenarioToTestCase(loadScenarioDefinition(scenarioPath));

    expect(first.created_at).toBe(second.created_at);
    expect(first.updated_at).toBe(second.updated_at);
    expect(first.created_at).not.toBe('2026-01-01T00:00:00.000Z');
    expect(second.updated_at).not.toBe('1999-01-01T00:00:00.000Z');
  });

  test('fails tool schema when parameters_pass lacks an explicit fixture verdict', () => {
    const scenario = loadScenarioDefinition(LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: transcript.tool_calls?.map(toolCall => ({
        ...toolCall,
        schema_pass: undefined,
      })),
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('schema_pass verdict');
  });

  test('does not let top-level tool_calls hide turn-level tool evidence', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: A top-level empty tool call list must not erase transcript evidence.
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
    expected: n/a
    weight: 1.0
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: [],
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('expected no tool call');
    expect(result.failure_messages.join('\n')).toContain('lookup_record');
  });

  test('scores ElevenLabs-native turn-level tool calls and results', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Native simulate-conversation traces should be first-class fixture evidence.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
  - name: tool_call_routing
  - name: tool_call_round_trip_ms
  - name: ttfb_p95_ms
thresholds:
  tool_call_round_trip_ms: 2000
  ttfb_p95_ms: 800
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, parameters_pass: true, response_consumed_in_next_turn: true }
    weight: 1.0
  - axis: tool_call_routing
    expected: { route: tool, name: lookup_record }
    weight: 1.0
  - axis: tool_call_round_trip_ms
    expected: { name: lookup_record }
    weight: 0.5
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: undefined,
      turns: [
        {
          role: 'agent',
          tool_calls: [
            {
              request_id: 'native_lookup_1',
              tool_name: 'lookup_record',
              params_as_json: '{"id":"+15550100"}',
              tool_has_been_called: true,
              schema_pass: true,
              response_consumed_in_next_turn: true,
            },
          ],
        },
        {
          role: 'agent',
          tool_results: [
            {
              request_id: 'native_lookup_1',
              tool_name: 'lookup_record',
              result_value: '{"status":"found"}',
              tool_has_been_called: true,
              tool_latency_secs: 0.41,
            },
          ],
        },
      ],
    });

    expect(result.status).toBe('passed');
    expect(result.failure_messages).toEqual([]);
  });

  test('does not let emitted-only native tool calls satisfy execution axes', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Emitted-only native tool traces must not count as executed tools.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
  - name: tool_call_round_trip_ms
  - name: ttfb_p95_ms
thresholds:
  tool_call_round_trip_ms: 2000
  ttfb_p95_ms: 800
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, parameters_pass: true, response_consumed_in_next_turn: true }
    weight: 1.0
  - axis: tool_call_round_trip_ms
    expected: { name: lookup_record }
    weight: 0.5
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: undefined,
      turns: [
        {
          role: 'agent',
          tool_calls: [
            {
              request_id: 'native_lookup_emitted_only',
              tool_name: 'lookup_record',
              params_as_json: '{"id":"+15550100"}',
              tool_has_been_called: false,
              schema_pass: true,
              round_trip_ms: 410,
              response_consumed_in_next_turn: true,
            },
          ],
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('tool_has_been_called=false');
  });

  test('does not let failed native tool results satisfy execution axes', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Failed native tool results must not count as successful tool execution.
agent: primary
fixture:
  transcript: transcript.json
axes:
  - name: tool_call_schema
  - name: tool_call_round_trip_ms
  - name: ttfb_p95_ms
thresholds:
  tool_call_round_trip_ms: 2000
  ttfb_p95_ms: 800
success_criteria:
  - axis: tool_call_schema
    expected: { name: lookup_record, parameters_pass: true, response_consumed_in_next_turn: true }
    weight: 1.0
  - axis: tool_call_round_trip_ms
    expected: { name: lookup_record }
    weight: 0.5
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: undefined,
      turns: [
        {
          role: 'agent',
          tool_calls: [
            {
              request_id: 'native_lookup_failed',
              tool_name: 'lookup_record',
              params_as_json: '{"id":"+15550100"}',
              tool_has_been_called: true,
              schema_pass: true,
            },
          ],
        },
        {
          role: 'agent',
          tool_results: [
            {
              request_id: 'native_lookup_failed',
              tool_name: 'lookup_record',
              result_value: '{"error":"crm unavailable"}',
              is_error: true,
              error_type: 'webhook_500',
              raw_error_message: 'crm unavailable',
              tool_has_been_called: true,
              tool_latency_secs: 0.41,
              response_consumed_in_next_turn: true,
            },
          ],
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('is_error: true');
    expect(result.failure_messages.join('\n')).toContain('webhook_500');
  });

  test('does not ignore ElevenLabs-native tool traces in no-tool scenarios', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Native tool trace evidence must fail explicit no-tool coverage.
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
    expected: n/a
    weight: 1.0
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: undefined,
      turns: [
        {
          role: 'agent',
          tool_calls: [
            {
              request_id: 'native_lookup_1',
              tool_name: 'lookup_record',
              params_as_json: '{"id":"+15550100"}',
              tool_has_been_called: true,
            },
          ],
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('expected no tool call');
    expect(result.failure_messages.join('\n')).toContain('lookup_record');
  });

  test('merges duplicate top-level and turn-level tool call evidence', () => {
    const scenario = loadScenarioDefinition(LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: [
        {
          name: 'lookup_record',
          arguments: {id: '+15550100'},
        },
      ],
      turns: transcript.turns.map(turn => turn.tool_call
        ? {
          ...turn,
          tool_call: {
            ...turn.tool_call,
            schema_pass: true,
            round_trip_ms: 410,
            response_consumed_in_next_turn: true,
          },
        }
        : turn),
    });

    expect(result.status).toBe('passed');
  });

  test('does not double-count summary-only top-level tool calls over turn evidence', () => {
    const scenario = loadScenarioDefinition(LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: [
        {
          name: 'lookup_record',
        },
      ],
      turns: transcript.turns.map(turn => turn.tool_call
        ? {
          ...turn,
          tool_call: {
            ...turn.tool_call,
            schema_pass: true,
            round_trip_ms: 410,
            response_consumed_in_next_turn: true,
          },
        }
        : turn),
    });

    expect(result.status).toBe('passed');
    expect(result.failure_messages).toEqual([]);
  });

  test('does not let summary tool evidence hide a turn-level schema failure', () => {
    const scenario = loadScenarioDefinition(LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: [
        {
          name: 'lookup_record',
          arguments: {id: '+15550100'},
          schema_pass: true,
          round_trip_ms: 410,
          response_consumed_in_next_turn: true,
        },
      ],
      turns: transcript.turns.map(turn => turn.tool_call
        ? {
          ...turn,
          tool_call: {
            ...turn.tool_call,
            schema_pass: false,
            round_trip_ms: 410,
            response_consumed_in_next_turn: true,
          },
        }
        : turn),
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('parameters failed schema validation');
  });

  test('fails tool schema when any repeated matching call has bad evidence', () => {
    const scenario = loadScenarioDefinition(LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      turns: transcript.turns.filter(turn => !turn.tool_call),
      tool_calls: [
        {
          name: 'lookup_record',
          arguments: {id: '+15550100'},
          schema_pass: true,
          round_trip_ms: 410,
          response_consumed_in_next_turn: true,
        },
        {
          name: 'lookup_record',
          arguments: {id: '+15550101'},
          schema_pass: false,
          round_trip_ms: 415,
          response_consumed_in_next_turn: true,
        },
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('lookup_record[1] parameters failed schema validation');
  });

  test('fails tool schema when expected tool response is not consumed next turn', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Tool result must be reflected by the next agent turn.
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
    expected: { name: lookup_record, parameters_pass: true, response_consumed_in_next_turn: true }
    weight: 1.0
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: transcript.tool_calls?.map(toolCall => ({
        ...toolCall,
        response_consumed_in_next_turn: false,
      })),
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('not consumed in the next agent turn');
  });

  test('does not let response-consumption checks ignore explicit schema failures', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Response handling cannot wash out malformed tool parameters.
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
    expected: { name: lookup_record, response_consumed_in_next_turn: true }
    weight: 1.0
  - axis: ttfb_p95_ms
    expected: pass
    weight: 0.5
`, LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: transcript.tool_calls?.map(toolCall => ({
        ...toolCall,
        schema_pass: false,
        response_consumed_in_next_turn: true,
      })),
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('parameters failed schema validation');
  });

  test('fails tool round-trip latency when fixture breaches the budget', () => {
    const scenario = loadScenarioDefinition(LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: transcript.tool_calls?.map(toolCall => ({
        ...toolCall,
        round_trip_ms: 2500,
      })),
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('tool_call_round_trip_ms');
    expect(result.failure_messages.join('\n')).toContain('exceeded budget');
  });

  test('fails tool round-trip latency without explicit fixture evidence', () => {
    const scenario = loadScenarioDefinition(LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      tool_calls: transcript.tool_calls?.map(toolCall => ({
        ...toolCall,
        round_trip_ms: undefined,
      })),
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('round_trip_ms fixture evidence');
  });

  test('does not let stale latency summary metrics hide breakdown breaches', () => {
    const scenario = parseScenarioYaml(`
id: lookup-record-greeting
description: Latency breakdown evidence must be scored when summaries are stale.
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
    weight: 1.0
`, LOOKUP_SCENARIO);
    const transcript = loadScenarioTranscript(scenario);
    const result = scoreScenario(scenario, {
      ...transcript,
      metrics: {
        ttfb_p95_ms: 100,
      },
      latency_breakdown_ms: {
        ttfb: [100, 200, 900],
      },
    });

    expect(result.status).toBe('failed');
    expect(result.failure_messages.join('\n')).toContain('ttfb_p95_ms');
    expect(result.failure_messages.join('\n')).toContain('900ms exceeded budget');
  });
});
