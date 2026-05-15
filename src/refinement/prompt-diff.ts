/**
 * Plain-language prompt diff renderer. Pitch promise (beat 3): "fix proposal
 * shows the prompt diff in plain language, not engineer language."
 * Converts a list of DetectedFailure → PromptDiff records that describe the
 * intent of each rule addition in language the business owner can read.
 */

import type {DetectedFailure, PromptDiff} from './types';

const PLAIN_LANGUAGE_TITLES: Record<string, string> = {
  voice_marker_leakage: 'Stop the agent from reading stage directions out loud',
  tts_directive_emission: 'Remove tone instructions from the spoken script',
  hallucinated_business_hours: 'Never invent business hours',
  wrong_service_area: 'Confirm the caller is in our service area before booking',
  calendar_overpromise: "Don't promise a time the calendar hasn't confirmed",
  sms_premature_confirmation: "Don't say the text was sent until it actually sends",
  hipaa_data_leak_on_recording: 'Never repeat sensitive ID numbers on the recording',
  medical_advice_emission: 'Never give medical advice — intake only',
  legal_advice_emission: 'Never give legal advice — intake only',
  attorney_client_relationship_implication: 'Use neutral language; no implied representation',
  fee_disclosure_unauthorized: "Don't quote fees, retainers, or contingencies",
  hallucinated_menu_items: 'Only describe dishes that are actually on the menu',
  allergen_advice_emission: 'Never declare a dish safe for an allergy',
  reservation_overpromise: "Don't confirm a table — send the booking link",
  emergency_misclassification: 'Always ask explicitly whether the call is an emergency',
  insurance_overclaim: "Don't list insurance plans verbally",
  confidentiality_re_disclosure: 'Acknowledge the matter once; do not re-state details',
  persona_collapse: 'Stay in character as the business assistant',
  off_topic_drift: 'Redirect off-topic chat back to the reason for the call',
  language_mismatch: "Match the caller's language",
  latency_floor_breach: 'Reply faster on the greeting',
};

function summarizeAcrossPersonas(failures: DetectedFailure[]): string {
  const personas = [...new Set(failures.map(f => f.persona_id))];
  if (personas.length === 1) {
    return `Caught on the ${personas[0]} persona call`;
  }
  return `Caught on ${personas.length} persona calls (${personas.slice(0, 3).join(', ')}${personas.length > 3 ? '…' : ''})`;
}

export function buildPromptDiffs(failures: DetectedFailure[]): PromptDiff[] {
  const byMode = new Map<string, DetectedFailure[]>();
  for (const failure of failures) {
    const existing = byMode.get(failure.mode_id) ?? [];
    existing.push(failure);
    byMode.set(failure.mode_id, existing);
  }

  const diffs: PromptDiff[] = [];
  for (const [modeId, occurrences] of byMode.entries()) {
    const title = PLAIN_LANGUAGE_TITLES[modeId] ?? `Address ${modeId.replaceAll('_', ' ')}`;
    const evidenceSample = occurrences[0].evidence.matched_phrase ?? occurrences[0].evidence.surrounding_text.slice(0, 80);
    diffs.push({
      field: 'system_prompt.guardrails',
      rationale_plain_language: `${title}. ${summarizeAcrossPersonas(occurrences)} — heard "${evidenceSample}".`,
      after_excerpt: occurrences[0].fix_proposal,
      related_failure_mode_ids: [modeId],
    });
  }

  diffs.sort((a, b) => {
    const aSev = a.related_failure_mode_ids[0];
    const bSev = b.related_failure_mode_ids[0];
    return aSev.localeCompare(bSev);
  });

  return diffs;
}
