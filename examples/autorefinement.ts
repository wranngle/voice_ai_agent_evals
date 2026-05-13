#!/usr/bin/env bun
/**
 * examples/autorefinement.ts — drive polishLoop with deterministic patterns.
 *
 * This example uses an in-process mock evaluate/llm to demonstrate the
 * autorefinement loop end-to-end without touching real ElevenLabs.
 *
 * Run:
 *   bun examples/autorefinement.ts
 */

// Inside this repo we import from ../src directly so the example is
// runnable without installing the package against itself. In a consumer
// project, replace these with: import {...} from '@wranngle/voice-evals/...';
import type {ElevenLabsClient} from '@elevenlabs/elevenlabs-js';
import {polishLoop} from '../src/remediation';
import {createVoiceEvalsClient} from '../src/wrapper';
import type {DimensionScore} from '../src/scoring/types';

async function main() {
  // Fake SDK: just enough surface to satisfy the wrapper. In production you'd
  // pass `new ElevenLabsClient({apiKey})` here.
  const fakeRaw = {
    conversationalAi: {
      agents: {
        get: async () => ({
          agent_id: 'agent_demo',
          name: '[DEV] Sarah',
          conversation_config: {agent: {prompt: {prompt: 'You are Sarah.'}}, tts: {speed: 1}},
        }),
        update: async () => undefined,
      },
    },
  } as unknown as ElevenLabsClient;

  const client = createVoiceEvalsClient({
    client: fakeRaw,
    modelRankings: {
      default: 'gemini-3-flash-preview',
      recommended: ['gemini-3-flash-preview'],
      banned: ['gpt-4o-mini', 'gpt-5-mini', 'gemini-2.0-flash-001'],
    },
  });

  // Simulated eval: starts failing on `voice_activity`, the LLM proposer
  // tunes voice_speed, the second run passes.
  let runCount = 0;
  const evaluate = async (): Promise<DimensionScore[]> => {
    runCount++;
    if (runCount === 1) {
      return [{name: 'voice_activity', status: 'failed', detail: 'too rushed'}];
    }

    return [{name: 'voice_activity', status: 'passed'}];
  };

  // Mock LLM proposer: emits one voice_speed fix.
  const llm = async () => JSON.stringify([{
    target: 'voice_speed',
    locator: '',
    proposed_value: '0.95',
    rationale: 'slow down for clarity',
    addresses: ['voice_activity'],
  }]);

  // ANALYZE callback: feeds a transcript snippet to the pattern detector.
  // Returns DetectionInput; an empty turns list means no patterns fire and
  // the LLM proposer runs normally.
  const analyze = () => ({
    turns: [
      {role: 'user' as const, message: 'Could you slow down a bit?'},
      {role: 'agent' as const, message: 'Of course.'},
    ],
  });

  const result = await polishLoop({
    client,
    agentId: 'agent_demo',
    evaluate,
    llm,
    analyze,
    maxIterations: 3,
  });

  console.log(`Stopped: ${result.stopped_because}`);
  console.log(`Improved: ${result.improvedDimensions?.join(', ')}`);
  console.log(`Regressed: ${result.regressed === true ? '⚠ YES' : 'no'}`);
  console.log(`Net dim change: ${result.netImprovement}`);
  console.log(`Iterations: ${result.iterations}`);
}

await main();
