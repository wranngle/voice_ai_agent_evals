export type EvalMode =
  | 'chat_voice'
  | 'phone_inbound'
  | 'phone_outbound'
  | 'production_recording_batch';

export type CoverageStatus = 'covered' | 'partial' | 'missing';
export type ReadinessVerdict = 'green' | 'yellow' | 'red';

export type ModeCoverage = {
  mode: EvalMode;
  status: CoverageStatus;
  detail: string;
};

export type ArtifactCoverage = {
  artifact: string;
  status: CoverageStatus;
  detail: string;
};

export type MetricCoverage = {
  group: string;
  metric: string;
  status: CoverageStatus;
  detail: string;
};

export type EvalUtilitySnapshot = {
  totalRuns: number;
  totalTrials: number;
  currentRunTrials: number;
  passRatePct: number;
  scenarioCount: number;
  personaCount: number;
  minDimensionHitRatePct?: number;
  defectCount?: number;
  coveredModes?: EvalMode[];
  partialModes?: EvalMode[];
  artifacts?: string[];
  webhookSuccessRatePct?: number;
  toolCallSuccessRatePct?: number;
  lastSuccessAgeMinutes?: number;
  agentUpdateCount?: number;
};

export type EvalUtilityAssessment = {
  verdict: ReadinessVerdict;
  confidenceScore: number;
  modeCoverage: ModeCoverage[];
  artifactCoverage: ArtifactCoverage[];
  metricCoverage: MetricCoverage[];
  gaps: string[];
};

const MODE_DETAILS: Record<EvalMode, string> = {
  chat_voice: 'Synthetic chat or voice-agent conversation simulation.',
  phone_inbound: 'Inbound phone-call path with caller behavior, DTMF, timing, and transcript evidence.',
  phone_outbound: 'Outbound caller-agent path with dialer behavior, number pools, and passive QA evidence.',
  production_recording_batch: 'Uploaded real production calls analyzed as a batch.',
};

const REQUIRED_ARTIFACTS = [
  'transcript',
  'audio',
  'tool_calls',
  'webhook_logs',
  'latency_samples',
  'evaluator_rationale',
  'root_cause_analysis',
] as const;

const METRIC_GROUPS: Array<{
  group: string;
  metrics: string[];
  requires: string[];
}> = [
  {
    group: 'conversation_quality',
    metrics: [
      'hallucination',
      'bias',
      'toxicity',
      'compliance',
      'accuracy',
      'context_awareness',
      'completeness',
      'conversation_flow',
    ],
    requires: ['transcript', 'evaluator_rationale'],
  },
  {
    group: 'speech_voice_quality',
    metrics: [
      'voice_quality',
      'stt_accuracy',
      'background_noise_resilience',
      'barge_in_recovery',
    ],
    requires: ['audio', 'transcript'],
  },
  {
    group: 'call_control',
    metrics: [
      'dtmf_detection',
      'first_call_resolution',
      'intent_recognition',
      'csat_proxy',
      'containment_rate',
      'response_timing',
    ],
    requires: ['transcript', 'latency_samples'],
  },
  {
    group: 'integration_reliability',
    metrics: [
      'tool_call_success',
      'webhook_delivery',
      'last_success_monitoring',
      'artifact_collection',
    ],
    requires: ['tool_calls', 'webhook_logs'],
  },
  {
    group: 'rollout_governance',
    metrics: [
      'readiness_verdict',
      'confidence_by_volume',
      'agent_update_timeseries',
      'regression_stability',
    ],
    requires: ['root_cause_analysis'],
  },
];

const ALL_MODES = Object.keys(MODE_DETAILS) as EvalMode[];

export function assessEvalUtility(input: EvalUtilitySnapshot): EvalUtilityAssessment {
  const artifactSet = new Set(input.artifacts ?? []);
  const coveredModeSet = new Set(input.coveredModes ?? []);
  const partialModeSet = new Set(input.partialModes ?? []);

  const modeCoverage = ALL_MODES.map(mode => modeStatus(mode, coveredModeSet, partialModeSet));
  const artifactCoverage = REQUIRED_ARTIFACTS.map(artifact => ({
    artifact,
    status: artifactSet.has(artifact) ? 'covered' : 'missing',
    detail: artifactSet.has(artifact) ? 'captured for run review' : 'not captured in current run artifact set',
  } satisfies ArtifactCoverage));
  const metricCoverage = buildMetricCoverage(artifactSet, input);
  const confidenceScore = confidence(input, modeCoverage, artifactCoverage);
  const gaps = buildGaps(input, modeCoverage, artifactCoverage, metricCoverage);
  return {
    verdict: verdict(input, confidenceScore, modeCoverage, gaps),
    confidenceScore,
    modeCoverage,
    artifactCoverage,
    metricCoverage,
    gaps,
  };
}

function modeStatus(
  mode: EvalMode,
  coveredModes: Set<EvalMode>,
  partialModes: Set<EvalMode>,
): ModeCoverage {
  if (coveredModes.has(mode)) {
    return {mode, status: 'covered', detail: MODE_DETAILS[mode]};
  }

  if (partialModes.has(mode)) {
    return {mode, status: 'partial', detail: `${MODE_DETAILS[mode]} Partial signal only.`};
  }

  return {mode, status: 'missing', detail: MODE_DETAILS[mode]};
}

function buildMetricCoverage(
  artifacts: Set<string>,
  input: EvalUtilitySnapshot,
): MetricCoverage[] {
  return METRIC_GROUPS.flatMap(group => group.metrics.map(metric => {
    const requiredPresent = group.requires.filter(item => artifacts.has(item)).length;
    const status = metric === 'artifact_collection'
      ? artifactCollectionStatus(artifacts)
      : metricStatus(group.requires.length, requiredPresent, input, metric);
    return {
      group: group.group,
      metric,
      status,
      detail: metricDetail(metric, status),
    };
  }));
}

function artifactCollectionStatus(artifacts: Set<string>): CoverageStatus {
  const present = REQUIRED_ARTIFACTS.filter(artifact => artifacts.has(artifact)).length;
  if (present === REQUIRED_ARTIFACTS.length) {
    return 'covered';
  }

  return present > 0 ? 'partial' : 'missing';
}

function metricStatus(
  requiredCount: number,
  presentCount: number,
  input: EvalUtilitySnapshot,
  metric: string,
): CoverageStatus {
  if (metric === 'tool_call_success' && typeof input.toolCallSuccessRatePct === 'number') {
    return input.toolCallSuccessRatePct >= 99 ? 'covered' : 'partial';
  }

  if (metric === 'webhook_delivery' && typeof input.webhookSuccessRatePct === 'number') {
    return input.webhookSuccessRatePct >= 99 ? 'covered' : 'partial';
  }

  if (metric === 'last_success_monitoring' && typeof input.lastSuccessAgeMinutes === 'number') {
    return input.lastSuccessAgeMinutes <= 30 ? 'covered' : 'partial';
  }

  if (metric === 'agent_update_timeseries' && typeof input.agentUpdateCount === 'number') {
    return input.agentUpdateCount > 0 ? 'covered' : 'missing';
  }

  if (presentCount === requiredCount) {
    return 'covered';
  }

  return presentCount > 0 ? 'partial' : 'missing';
}

function metricDetail(metric: string, status: CoverageStatus): string {
  if (status === 'covered') {
    return `${metric} has the required evidence path`;
  }

  if (status === 'partial') {
    return `${metric} has partial evidence but cannot be trusted hands-free`;
  }

  return `${metric} has no current run evidence`;
}

function confidence(
  input: EvalUtilitySnapshot,
  modes: ModeCoverage[],
  artifacts: ArtifactCoverage[],
): number {
  const sample = Math.min(25, (input.totalTrials / 120) * 25);
  const scenarios = Math.min(15, (input.scenarioCount / 12) * 15);
  const personas = Math.min(15, (input.personaCount / 8) * 15);
  const modePoints = modes.filter(m => m.status === 'covered').length / ALL_MODES.length * 15;
  const artifactPoints = artifacts.filter(a => a.status === 'covered').length / REQUIRED_ARTIFACTS.length * 15;
  const minDimension = input.minDimensionHitRatePct ?? input.passRatePct;
  const stability = input.passRatePct >= 98 && minDimension >= 95 ? 15 : (input.passRatePct >= 90 ? 8 : 0);
  return Math.round(sample + scenarios + personas + modePoints + artifactPoints + stability);
}

function buildGaps(
  input: EvalUtilitySnapshot,
  modes: ModeCoverage[],
  artifacts: ArtifactCoverage[],
  metrics: MetricCoverage[],
): string[] {
  const gaps: string[] = [];
  const missingModes = modes.filter(m => m.status === 'missing').map(m => m.mode);
  if (missingModes.length > 0) {
    gaps.push(`missing eval modes: ${missingModes.join(', ')}`);
  }

  if (input.totalTrials < 60) {
    gaps.push(`sample size ${input.totalTrials} is below the 60-run minimum for credible launch confidence`);
  }

  if (input.scenarioCount < 8) {
    gaps.push(`scenario breadth ${input.scenarioCount} is too narrow for factorial stress testing`);
  }

  if (input.personaCount < 6) {
    gaps.push(`persona breadth ${input.personaCount} misses caller-disappointment coverage`);
  }

  if ((input.minDimensionHitRatePct ?? 100) < 95) {
    gaps.push(`weakest dimension is ${(input.minDimensionHitRatePct ?? 0).toFixed(1)}%, below 95%`);
  }

  if ((input.defectCount ?? 0) > 0) {
    gaps.push(`${input.defectCount} defect signals remain in the current run`);
  }

  const missingArtifacts = artifacts.filter(a => a.status === 'missing').map(a => a.artifact);
  if (missingArtifacts.length > 0) {
    gaps.push(`missing artifacts: ${missingArtifacts.join(', ')}`);
  }

  const missingMetricGroups = new Set(metrics.filter(m => m.status === 'missing').map(m => m.group));
  if (missingMetricGroups.size > 0) {
    gaps.push(`unproven metric groups: ${[...missingMetricGroups].join(', ')}`);
  }

  return gaps;
}

function verdict(
  input: EvalUtilitySnapshot,
  score: number,
  modes: ModeCoverage[],
  gaps: string[],
): ReadinessVerdict {
  const missingCriticalMode = modes.some(m => m.mode !== 'chat_voice' && m.status === 'missing');
  if (input.passRatePct < 90 || score < 55 || missingCriticalMode) {
    return 'red';
  }

  if (score < 85 || gaps.length > 0) {
    return 'yellow';
  }

  return 'green';
}
