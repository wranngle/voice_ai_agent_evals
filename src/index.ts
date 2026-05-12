/**
 * @wranngle/voice-evals — audio-native voice AI agent eval, polish, and
 * regression-test factory wrapping ElevenLabs Conversational AI.
 *
 * v1.0 in-progress: the public surface re-exported here will be reshaped
 * substantially in Phases 1-6 (wrapper, scoring, ingestion, regression,
 * remediation). See README.md "v1.0 roadmap" for the target shape.
 *
 * Phase 0 ships the existing eval-harness surface under the new package name
 * so consumers can install `@wranngle/voice-evals` today and migrate as the
 * v1.0 subpath exports (`/wrapper`, `/scoring`, `/scenarios`, `/ingestion`,
 * `/regression`, `/remediation`) land.
 */

export * from './testing/index';
export type * from './extraction/types';
export {verifyElevenLabsSignature} from './security/elevenlabs-signature';
