// JSONL logger for the one-page console — mirrors src/internal/jsonl-trace.ts.
// Module-level pub/sub so any component can log and the Terminal re-renders.
import { useEffect, useState } from "react"

export type Ev = { ts: string; channel: string; level: string; run_id: string; key?: string; msg: string; fields?: Record<string, unknown> }

const RUN_ID = (globalThis.crypto?.randomUUID?.() || String(Date.now()))
let AGENT_KEY = ""
const RING: Ev[] = []
const MAX = 600
const subs = new Set<() => void>()
const queue: Ev[] = []
let timer: ReturnType<typeof setTimeout> | null = null

export const setAgentKey = (k: string) => { AGENT_KEY = k || "" }
export const getEvents = () => RING

export function logEvent(channel: string, msg: string, fields?: Record<string, unknown> | null, level = "info") {
  const ev: Ev = { ts: new Date().toISOString(), channel, level, run_id: RUN_ID, msg, ...(fields ? { fields } : {}), ...(AGENT_KEY ? { key: AGENT_KEY } : {}) }
  RING.unshift(ev); if (RING.length > MAX) RING.length = MAX
  queue.push(ev)
  if (!timer) timer = setTimeout(flush, 350)
  subs.forEach((f) => f())
}

async function flush() {
  const batch = queue.splice(0, queue.length); timer = null
  if (!batch.length) return
  try { await fetch("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events: batch }) }) } catch { /* offline ok */ }
}

export function clearEvents() { RING.length = 0; subs.forEach((f) => f()) }

// Subscribe a component to the ring.
export function useLog(): Ev[] {
  const [, bump] = useState(0)
  useEffect(() => { const f = () => bump((n) => n + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  return RING
}
