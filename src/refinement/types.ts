/**
 * @wranngle/voice-evals/refinement — types for the one-button Refinement
 * orchestrator. The strategic destination is a feature inside ElevenLabs's
 * agent builder; the SDK form is the wedge / proof artifact (see project
 * memory: project-positioning-refinement-inside-elevenlabs).
 */

export type EnrichmentSource = 'website' | 'google_maps' | 'firmographic' | 'manual' | 'mock';

export type EnrichmentResult = {
  business_name: string;
  website_url?: string;
  vertical_label: string;
  category_hint: string;
  service_area: string;
  business_hours: string;
  services_summary: string;
  response_window?: string;
  phone?: string;
  locations?: string[];
  sources: EnrichmentSource[];
  confidence: number;
};

export type VerticalTemplate = {
  id: string;
  display_name: string;
  category_aliases: string[];
  default_voice: {
    voice_id: string;
    voice_name: string;
    model_id: string;
    stability: number;
    similarity_boost: number;
    speed: number;
  };
  llm: {
    model: string;
    temperature: number;
  };
  system_prompt: string;
  integrations: Array<{
    id: string;
    purpose: string;
    required: boolean;
  }>;
  dynamic_variables: string[];
  priority_failure_modes: string[];
  evaluation_rubric: Array<{
    dimension: string;
    weight: number;
    pass: string;
  }>;
};

export type FailureModeId = string;

export type FailureDetectorSpec =
  | {
    type: 'regex_transcript';
    channel: 'agent' | 'caller';
    patterns: string[];
    case_insensitive?: boolean;
  }
  | {
    type: 'rubric_judge';
    rubric: string;
  }
  | {
    type: 'transcript_tool_coherence';
    rule: string;
    patterns?: string[];
  }
  | {
    type: 'transcript_repetition_count';
    rule: string;
  }
  | {
    type: 'audio_metric';
    metric: string;
    threshold_max?: number;
    threshold_min?: number;
    secondary_metric?: string;
    secondary_threshold_max?: number;
  };

export type FailureModeEntry = {
  id: FailureModeId;
  config_field: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  summary: string;
  detector: FailureDetectorSpec;
  fix_proposal: string;
};

export type FailureModeCatalog = {
  $schema?: string;
  version: string;
  description: string;
  modes: FailureModeEntry[];
};

export type TranscriptTurn = {
  role: 'agent' | 'caller';
  text: string;
  timestamp_ms?: number;
  tool_calls?: Array<{
    tool: string;
    status: 'success' | 'error' | 'pending';
    payload?: unknown;
  }>;
};

export type PersonaCall = {
  persona_id: string;
  persona_name: string;
  turns: TranscriptTurn[];
  ttfb_ms?: number;
  barge_in_response_ms?: number;
  audio_clip_path?: string;
};

export type DetectedFailure = {
  mode_id: FailureModeId;
  severity: FailureModeEntry['severity'];
  persona_id: string;
  evidence: {
    turn_index: number;
    role: 'agent' | 'caller';
    matched_phrase?: string;
    surrounding_text: string;
  };
  fix_proposal: string;
};

export type PromptDiff = {
  field: string;
  rationale_plain_language: string;
  before_excerpt?: string;
  after_excerpt: string;
  related_failure_mode_ids: FailureModeId[];
};

export type RefinementSession = {
  session_id: string;
  started_at: string;
  finished_at?: string;
  status: 'enriching' | 'templating' | 'simulating' | 'detecting' | 'patching' | 'complete' | 'failed';
  enrichment: EnrichmentResult;
  vertical_template_id: string;
  persona_calls: PersonaCall[];
  detected_failures: DetectedFailure[];
  prompt_diffs: PromptDiff[];
  regression_suite_size: number;
  scoreboard: {
    before: number;
    after: number;
    dimensions: Array<{
      dimension: string;
      before: number;
      after: number;
    }>;
  };
  compliance_artifact_path?: string;
  events: SessionEvent[];
};

export type SessionEvent = {
  at: string;
  step: string;
  status: 'start' | 'ok' | 'warn' | 'fail';
  detail: string;
  data?: Record<string, unknown>;
};

export type RefineOptions = {
  business_name?: string;
  website_url?: string;
  vertical_override?: string;
  session_id?: string;
  mock?: boolean;
  out_dir?: string;
  persona_ids?: string[];
  /** Live-mode: refine an existing ElevenLabs agent. Requires ELEVENLABS_API_KEY. */
  agent_id?: string;
  /** Inject a pre-built VoiceEvalsClient (mostly for tests; the orchestrator constructs one from env when omitted). */
  client?: unknown;
};
