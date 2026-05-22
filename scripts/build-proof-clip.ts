#!/usr/bin/env bun
/**
 * Build the CEO-grade proof clip — TTS-synthesize a hero conversation from
 * one of the ceo-demo report's passing transcripts, stitch into a single MP3.
 *
 * Two voices: Charlotte (the live agent voice) for AGENT turns, Roger
 * (casual male) for USER turns. Standard multilingual_v2 TTS — no v3
 * conversational cue interpretation, no `[brackets]` ever spoken.
 *
 * Outputs:
 *   proof/audio/turn-NN.mp3   per-turn raw TTS
 *   proof/audio/clip.mp3      stitched single-file output (ffmpeg concat)
 *   proof/transcript.json     the transcript used + metadata
 */

import {
  existsSync, mkdirSync, readFileSync, writeFileSync, rmSync,
} from 'node:fs';
import {execSync} from 'node:child_process';
import {join} from 'node:path';

const API_BASE = 'https://api.elevenlabs.io/v1';
const VOICE_AGENT = '6fZce9LFNG3iEITDfqZZ'; // Charlotte (live agent voice)
const VOICE_CALLER = 'CwhRBWXzGAHq8TQ4Fs17'; // Roger - Laid-Back, Casual, Resonant
const TTS_MODEL = 'eleven_multilingual_v2'; // standard, NO v3 cue interpretation
const PROOF_DIR = join(process.cwd(), 'proof');
const AUDIO_DIR = join(PROOF_DIR, 'audio');
const REPORT = join(process.cwd(), 'reports', 'ceo-demo-2026-05-14T04-50-11Z.json');
const MAX_TURNS = 9; // tight arc — enough to show greeting → urgency → intake → confirm

const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) {
  console.error('ELEVENLABS_API_KEY not set');
  process.exit(2);
}

if (!existsSync(REPORT)) {
  console.error(`report missing: ${REPORT}`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(REPORT, 'utf8')) as {
  results: Array<{
    scenario_id: string;
    persona_id: string;
    passed: boolean;
    transcript?: Array<{role: string; message: string}>;
  }>;
};

// Pick the dramatic demo: emergency × frustrated-rusher — passing trial that
// shows guardrail discipline under pressure.
const hero = report.results.find(r => r.scenario_id === 'emergency' && r.persona_id === 'frustrated-rusher');
if (!hero?.transcript) {
  console.error('hero trial not found in report');
  process.exit(1);
}

const cleanTurn = (s: string): string => s.replaceAll(/\s+/g, ' ').trim();

const turns = hero.transcript
  .slice(0, MAX_TURNS)
  .map(t => ({role: t.role, message: cleanTurn(t.message)}))
  .filter(t => t.message.length > 0);

console.log(`Hero: ${hero.scenario_id} | ${hero.persona_id}`);
console.log(`Turns: ${turns.length} (truncated from ${hero.transcript.length})`);
console.log('');

// Wipe and recreate the audio dir.
if (existsSync(AUDIO_DIR)) {
  rmSync(AUDIO_DIR, {recursive: true, force: true});
}

mkdirSync(AUDIO_DIR, {recursive: true});

async function tts(text: string, voiceId: string): Promise<Uint8Array> {
  const r = await fetch(`${API_BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {'xi-api-key': apiKey!, 'content-type': 'application/json'},
    body: JSON.stringify({
      text,
      model_id: TTS_MODEL,
      voice_settings: {
        stability: 0.55, similarity_boost: 0.75, style: 0, use_speaker_boost: true,
      },
    }),
  });
  if (!r.ok) {
    throw new Error(`TTS ${voiceId} HTTP ${r.status}: ${await r.text()}`);
  }

  return new Uint8Array(await r.arrayBuffer());
}

// Run TTS in sequence to respect rate limits (TTS endpoint is sensitive).
const files: string[] = [];
for (let i = 0; i < turns.length; i++) {
  const t = turns[i];
  const voiceId = t.role === 'agent' ? VOICE_AGENT : VOICE_CALLER;
  const label = t.role === 'agent' ? 'AGENT  (Charlotte)' : 'CALLER (Roger)   ';
  process.stdout.write(`  [${String(i + 1).padStart(2, ' ')}/${turns.length}] ${label}  ${t.message.slice(0, 64)}...\n`);
  const mp3 = await tts(t.message, voiceId);
  const path = join(AUDIO_DIR, `turn-${String(i).padStart(2, '0')}-${t.role}.mp3`);
  writeFileSync(path, mp3);
  files.push(path);
}

console.log('');
console.log('Stitching with ffmpeg (0.4s silence between turns)...');

// Build an ffmpeg concat list with brief silence between turns.
// Use the "concat" demuxer with each file and a generated silent gap.
const silencePath = join(AUDIO_DIR, '_silence.mp3');
execSync(`ffmpeg -y -f lavfi -i "anullsrc=channel_layout=mono:sample_rate=44100" -t 0.4 -q:a 9 -acodec libmp3lame "${silencePath}" 2>/dev/null`);

const listPath = join(AUDIO_DIR, '_concat-list.txt');
const interleaved: string[] = [];
for (let i = 0; i < files.length; i++) {
  interleaved.push(`file '${files[i]}'`);
  if (i < files.length - 1) {
    interleaved.push(`file '${silencePath}'`);
  }
}

writeFileSync(listPath, interleaved.join('\n'));

const outPath = join(AUDIO_DIR, 'clip.mp3');
execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${outPath}" 2>/dev/null`);

// Get duration via ffprobe.
let durationSec = 0;
try {
  const probe = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${outPath}"`).toString().trim();
  durationSec = Number.parseFloat(probe);
} catch {
  durationSec = 0;
}

const sizeKB = Math.round((readFileSync(outPath).byteLength / 1024) * 10) / 10;

// Write the transcript metadata that the HTML page will read.
const meta = {
  built_at: new Date().toISOString(),
  agent_id: 'agent_7601krfykfpwfjxrjqcshg64pcby',
  agent_name: '[DEV] INBOUND TEMPLATE [TEMPLATE]',
  scenario: hero.scenario_id,
  persona: hero.persona_id,
  voices: {
    agent: {voice_id: VOICE_AGENT, label: 'Charlotte', model: TTS_MODEL},
    caller: {voice_id: VOICE_CALLER, label: 'Roger', model: TTS_MODEL},
  },
  turns,
  total_turns_in_full_trial: hero.transcript.length,
  duration_sec: durationSec,
  size_kb: sizeKB,
};
writeFileSync(join(PROOF_DIR, 'transcript.json'), JSON.stringify(meta, null, 2));

console.log('');
console.log(`✓ clip:        ${outPath}`);
console.log(`  duration:    ${durationSec.toFixed(1)}s`);
console.log(`  size:        ${sizeKB} KB`);
console.log(`  turns:       ${turns.length} (truncated from ${hero.transcript.length})`);
console.log('  agent voice: Charlotte');
console.log('  caller voice:Roger');
console.log(`  transcript:  ${join(PROOF_DIR, 'transcript.json')}`);
