/**
 * Adversarial scenario preset catalogue.
 *
 * Four presets exercise the most common voice-agent failure modes: noisy
 * environments, mid-turn interruption, low-articulation speech, and
 * non-native accents. Each preset carries a deterministic audio overlay
 * descriptor plus the success criteria a generated scenario.yaml should
 * inherit — so the catalogue is a single source of truth for both the
 * runtime overlay applier and the YAML scenario emitter.
 *
 * The SNR / attenuation / offset values are tuned to be *just* over the
 * thresholds a well-built agent should clear; they are not random worst-case
 * stressors. The point is regression detection, not failure manufacturing.
 */

import type {AdversarialPreset} from './types';

export const NOISE_PRESET: AdversarialPreset = {
  id: 'noise',
  description: 'Restaurant background noise bed at +6dB SNR — exercises ASR robustness on a typical service-call environment.',
  scenarioSlug: 'adversarial-noise-restaurant',
  audioOverlay: {
    kind: 'noise',
    profile: 'restaurant',
    snrDb: 6,
  },
  assertions: [
    {axis: 'asr_word_error_rate', expected: {max: 0.15}, weight: 1},
    {axis: 'ttfb_p95_ms', expected: 'pass', weight: 0.5},
    {axis: 'total_turn_p95_ms', expected: 'pass', weight: 0.5},
  ],
  partialCredit: true,
};

export const INTERRUPT_PRESET: AdversarialPreset = {
  id: 'interrupt',
  description: 'Caller barges in 400ms into the agent turn — exercises barge-in detection and graceful yield.',
  scenarioSlug: 'adversarial-interrupt-mid-turn',
  audioOverlay: {
    kind: 'interrupt',
    offsetMs: 400,
    caller_phrase: 'wait — actually, can you',
  },
  assertions: [
    {axis: 'barge_in_recovery', expected: {yielded: true, max_yield_ms: 350}, weight: 1},
    {axis: 'tool_call_routing', expected: {route: 'continue'}, weight: 0.5},
    {axis: 'total_turn_p95_ms', expected: 'pass', weight: 0.5},
  ],
  partialCredit: false,
};

export const MUMBLE_PRESET: AdversarialPreset = {
  id: 'mumble',
  description: 'Low-articulation caller — high-frequency attenuation plus slow rate, exercises low-confidence ASR re-prompting.',
  scenarioSlug: 'adversarial-mumble-low-articulation',
  audioOverlay: {
    kind: 'mumble',
    highFreqAttenuationDb: 12,
    rate: 'slow',
  },
  assertions: [
    {axis: 'reprompt_on_low_confidence', expected: {triggered: true}, weight: 1},
    {axis: 'tool_call_schema', expected: {parameters_pass: true}, weight: 0.5},
    {axis: 'ttfb_p95_ms', expected: 'pass', weight: 0.5},
  ],
  partialCredit: true,
};

export const ACCENT_PRESET: AdversarialPreset = {
  id: 'accent',
  description: 'Moderate non-native English prosody — exercises accent-robust ASR and tool-call slot extraction.',
  scenarioSlug: 'adversarial-accent-en-in',
  audioOverlay: {
    kind: 'accent',
    locale: 'en-IN',
    severity: 'moderate',
  },
  assertions: [
    {axis: 'asr_word_error_rate', expected: {max: 0.12}, weight: 1},
    {axis: 'tool_call_schema', expected: {parameters_pass: true}, weight: 1},
    {axis: 'total_turn_p95_ms', expected: 'pass', weight: 0.5},
  ],
  partialCredit: true,
};

export const adversarialPresets: AdversarialPreset[] = [
  NOISE_PRESET,
  INTERRUPT_PRESET,
  MUMBLE_PRESET,
  ACCENT_PRESET,
];

export function getAdversarialPreset(id: AdversarialPreset['id']): AdversarialPreset {
  const found = adversarialPresets.find(p => p.id === id);
  if (!found) {
    throw new Error(`unknown adversarial preset id: ${id}`);
  }

  return found;
}
