// Client-side shim of the upstream server action — uses /api/extract-form
// (which proxies STT + llm.sh for structured extraction).
import type { ExampleFormValues } from "@/blocks/voice-form-01/schema"

export async function voiceToFormAction(audio: File) {
  try {
    if (!audio) return { data: {} as Partial<ExampleFormValues> }
    const fd = new FormData()
    fd.append("audio", audio, audio.name || "audio.webm")
    const r = await fetch("/api/extract-form", { method: "POST", body: fd })
    const d = await r.json()
    return { data: (d?.data ?? {}) as Partial<ExampleFormValues> }
  } catch {
    return { data: {} as Partial<ExampleFormValues> }
  }
}
