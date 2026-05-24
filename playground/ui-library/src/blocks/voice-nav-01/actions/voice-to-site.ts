// Client-side shim of the upstream server action — uses /api/voice-nav
// (which proxies STT + sitemap fetch + llm.sh for URL match).
export async function voiceToSiteAction(audio: File) {
  try {
    if (!audio) return { data: {} as { url?: string } }
    const fd = new FormData()
    fd.append("audio", audio, audio.name || "audio.webm")
    const r = await fetch("/api/voice-nav", { method: "POST", body: fd })
    const d = await r.json()
    return { data: (d?.data ?? {}) as { url?: string } }
  } catch {
    return { data: {} as { url?: string } }
  }
}
