// Client-side shim of the upstream server action — uses /api/stt proxy.
export interface TranscriptionResult {
  text?: string
  error?: string
  transcriptionTime?: number
}
export type TranscribeAudioInput = { audio: File }

export async function transcribeAudio({ audio }: TranscribeAudioInput): Promise<TranscriptionResult> {
  try {
    if (!audio) return { error: "No audio file provided" }
    const fd = new FormData()
    fd.append("audio", audio, audio.name || "audio.webm")
    fd.append("model_id", "scribe_v1")
    fd.append("language_code", "en")
    const t0 = Date.now()
    const r = await fetch("/api/stt", { method: "POST", body: fd })
    const d = await r.json()
    const text = d?.text
    if (!r.ok) return { error: d?.error || `STT HTTP ${r.status}` }
    if (!text) return { error: "No transcription available" }
    return { text, transcriptionTime: Date.now() - t0 }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "transcribe failed" }
  }
}
