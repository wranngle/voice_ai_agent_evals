// Client-side shim of the upstream server action — uses the playground's
// /api/scribe-token proxy (same xi-api-key flow, just key-safe via Bun server).
export interface ScribeTokenResult {
  token?: string
  error?: string
}

export async function getScribeToken(): Promise<ScribeTokenResult> {
  try {
    const r = await fetch("/api/scribe-token")
    const d = await r.json()
    return d?.token ? { token: d.token } : { error: d?.error || "no token" }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "fetch failed" }
  }
}
