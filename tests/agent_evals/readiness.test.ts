import {readFileSync} from 'node:fs';
import {join} from 'node:path';
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

  test('audio stays a required artifact and reports missing when a run captures no audio', () => {
    // Mirrors the ceo-demo proof runs: transcript + tool + latency evidence,
    // but no per-run audio. The fixed side-rail greeting clip is a voice demo,
    // not run evidence, so audio must surface as a missing artifact rather than
    // being fabricated as covered.
    const assessment = assessEvalUtility({
      totalRuns: 3,
      totalTrials: 30,
      currentRunTrials: 10,
      passRatePct: 100,
      scenarioCount: 5,
      personaCount: 5,
      minDimensionHitRatePct: 96,
      coveredModes: ['chat_voice'],
      artifacts: ['transcript', 'tool_calls', 'latency_samples'],
    });

    const audio = assessment.artifactCoverage.find(coverage => coverage.artifact === 'audio');
    expect(audio?.status).toBe('missing');
    expect(assessment.gaps.some(gap => gap.includes('audio'))).toBe(true);

    // Voice metrics depend on audio; with only a transcript they must not read
    // as fully covered — no audio means no trustworthy voice-quality evidence.
    const voiceMetrics = assessment.metricCoverage.filter(metric => metric.group === 'speech_voice_quality');
    expect(voiceMetrics.length).toBeGreaterThan(0);
    expect(voiceMetrics.every(metric => metric.status !== 'covered')).toBe(true);
  });
});

const REQUIRED_ARTIFACTS_RE = /REQUIRED_ARTIFACTS\s*=\s*\[([\s\S]*?)]/;

function extractRequiredArtifacts(source: string): string[] {
  const block = REQUIRED_ARTIFACTS_RE.exec(source);
  if (!block) {
    throw new Error('REQUIRED_ARTIFACTS array not found in source');
  }

  return [...block[1].matchAll(/['"]([a-z_]+)['"]/g)].map(match => match[1]);
}

describe('REQUIRED_ARTIFACTS drift', () => {
  // The proof console (proof/index.html) re-derives readiness client-side and
  // cannot import from src/, so it hardcodes its own copy of REQUIRED_ARTIFACTS.
  // A duplicated constant across two files is a silent-drift hazard; this locks
  // the two lists together so audio (and the other required artifacts) cannot be
  // quietly removed from one side to paper over the proof accounting.
  test('proof console mirrors the canonical readiness artifact set exactly', () => {
    const root = process.cwd();
    const canonical = extractRequiredArtifacts(readFileSync(join(root, 'src/agent_evals/service/readiness.ts'), 'utf8'));
    const proofConsole = extractRequiredArtifacts(readFileSync(join(root, 'proof/index.html'), 'utf8'));

    expect(canonical.length).toBeGreaterThan(0);
    expect(proofConsole).toEqual(canonical);
    expect(canonical).toContain('audio');
  });
});
