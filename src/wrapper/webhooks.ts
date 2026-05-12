/**
 * @wranngle/voice-evals/wrapper/webhooks — ElevenLabs HMAC verifier.
 *
 * Re-exports the verifier from src/security/ so consumers can pull
 * everything from the wrapper namespace without reaching into private
 * internals. The actual implementation stays in src/security/ — moving
 * it would churn 30+ tests for no behavioural gain.
 */

export {verifyElevenLabsSignature, signElevenLabsPayload} from '../security/elevenlabs-signature';
export type {VerifyOptions, VerifyResult} from '../security/elevenlabs-signature';
