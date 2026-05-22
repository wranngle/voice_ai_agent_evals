import {describe, expect, test} from 'vitest';
import {assessEvalUtility} from '../../src/agent_evals/service';

describe('assessEvalUtility', () => {
  test('rejects a narrow perfect run as not battle-tested', () => {
    const assessment = assessEvalUtility({
      totalRuns: 5,
      totalTrials: 15,
      currentRunTrials: 15,
      passRatePct: 100,
      scenarioCount: 3,
      personaCount: 5,
      minDimensionHitRatePct: 86.7,
      defectCount: 0,
      coveredModes: ['chat_voice'],
      partialModes: ['phone_inbound'],
      artifacts: ['transcript'],
    });

    expect(assessment.verdict).toBe('red');
    expect(assessment.confidenceScore).toBeLessThan(55);
    expect(assessment.gaps).toContain('weakest dimension is 86.7%, below 95%');
    expect(assessment.gaps.some(gap => gap.includes('production_recording_batch'))).toBe(true);
  });

  test('returns green only when breadth, artifacts, integrations, and recency are present', () => {
    const assessment = assessEvalUtility({
      totalRuns: 24,
      totalTrials: 144,
      currentRunTrials: 96,
      passRatePct: 99.2,
      scenarioCount: 12,
      personaCount: 8,
      minDimensionHitRatePct: 98.5,
      defectCount: 0,
      coveredModes: [
        'chat_voice',
        'phone_inbound',
        'phone_outbound',
        'production_recording_batch',
      ],
      artifacts: [
        'transcript',
        'audio',
        'tool_calls',
        'webhook_logs',
        'latency_samples',
        'evaluator_rationale',
        'root_cause_analysis',
      ],
      webhookSuccessRatePct: 99.9,
      toolCallSuccessRatePct: 99.4,
      lastSuccessAgeMinutes: 7,
      agentUpdateCount: 4,
    });

    expect(assessment.verdict).toBe('green');
    expect(assessment.confidenceScore).toBe(100);
    expect(assessment.gaps).toEqual([]);
  });

  test('keeps integration metrics partial when rates are present but below hands-free thresholds', () => {
    const assessment = assessEvalUtility({
      totalRuns: 12,
      totalTrials: 96,
      currentRunTrials: 48,
      passRatePct: 97,
      scenarioCount: 10,
      personaCount: 8,
      minDimensionHitRatePct: 96,
      coveredModes: ['chat_voice', 'phone_inbound', 'phone_outbound'],
      partialModes: ['production_recording_batch'],
      artifacts: ['transcript', 'audio', 'tool_calls', 'webhook_logs', 'latency_samples'],
      webhookSuccessRatePct: 96,
      toolCallSuccessRatePct: 98.5,
      lastSuccessAgeMinutes: 75,
      agentUpdateCount: 2,
    });

    const partials = assessment.metricCoverage.filter(metric =>
      metric.group === 'integration_reliability' && metric.status === 'partial');
    expect(partials.map(metric => metric.metric)).toEqual([
      'tool_call_success',
      'webhook_delivery',
      'last_success_monitoring',
      'artifact_collection',
    ]);
    expect(assessment.verdict).toBe('yellow');
  });
});
