/**
 * @wranngle/voice-evals/scenarios
 *
 * Curated scenario preset catalogues. Today this surface exposes the
 * adversarial preset library (noise, interrupt, mumble, accent) used by the
 * scenario runner and the YAML scenario emitter; additional preset families
 * (regression-baseline, tool-call-zoo, compliance) are expected to land here
 * over subsequent ticks.
 */

export * from './adversarial/index';
