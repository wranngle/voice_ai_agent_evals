/**
 * Adversarial scenario preset types.
 *
 * Presets are *data*, not behaviour — they describe an audio overlay to apply
 * to a baseline fixture (noise bed, interrupt at offset, mumble filter, accent
 * shift) plus a list of declarative assertions the scenario runner can lift
 * into the existing `success_criteria` array. Keeping the shape declarative
 * means YAML scenarios can be generated from a preset, and unit tests can
 * snapshot the catalogue without instantiating an audio pipeline.
 */

export type AdversarialPresetId = 'noise' | 'interrupt' | 'mumble' | 'accent';

export type AudioOverlay =
  | {
    /** Additive background noise bed. SNR in dB; lower = harder. */
    kind: 'noise';
    profile: 'pink' | 'white' | 'restaurant' | 'street' | 'office';
    snrDb: number;
  }
  | {
    /** Caller barge-in cut into the agent turn at offsetMs from agent start. */
    kind: 'interrupt';
    offsetMs: number;
    caller_phrase: string;
  }
  | {
    /** Low-articulation filter — reduces high-frequency band energy. */
    kind: 'mumble';
    highFreqAttenuationDb: number;
    rate: 'slow' | 'normal' | 'fast';
  }
  | {
    /** Accent / non-native-prosody shift — applied to the caller leg only. */
    kind: 'accent';
    locale: string;
    severity: 'light' | 'moderate' | 'heavy';
  };

/**
 * Declarative assertion. Mirrors the YAML `success_criteria` row shape so a
 * preset can be lowered into `tests/scenarios/<id>/scenario.yaml` verbatim.
 * The `axis` value is the same string the scenario runner's axis registry
 * already understands (see src/testing/runners/scenario-runner.ts).
 */
export type PresetAssertion = {
  axis: string;
  expected: unknown;
  weight: number;
};

export type AdversarialPreset = {
  id: AdversarialPresetId;
  description: string;
  /** Suggested kebab-case scenario directory name when materialised. */
  scenarioSlug: string;
  audioOverlay: AudioOverlay;
  assertions: PresetAssertion[];
  /** Partial-credit threshold for the materialised scenario. */
  partialCredit: boolean;
};
