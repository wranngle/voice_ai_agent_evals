/**
 * ElevenLabs Widget & UI Showcase — dev server.
 *
 * Static host for `public/` + a thin proxy to api.elevenlabs.io so the real
 * API key never reaches the browser. PATCH is governance-guarded: only agents
 * with a `[DEV]` (or prefix-less = implicit DEV) name may be mutated.
 *
 * Run: `bun run playground/server.ts`  (or `bun playground`)
 */
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, extname } from "node:path";

const EL = "https://api.elevenlabs.io";
const PORT = Number(process.env.PLAYGROUND_PORT ?? 4321);
const PUBLIC_DIR = join(import.meta.dir, "public");
const AGENT_JSON = join(import.meta.dir, "agent.json");

function loadApiKey(): string {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  for (const p of [join(process.cwd(), ".env"), join(homedir(), ".agents/.env")]) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(/^ELEVENLABS_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, "");
  }
  throw new Error("ELEVENLABS_API_KEY not found in env, ./.env, or ~/.agents/.env");
}
const API_KEY = loadApiKey();
const showcaseAgentId = existsSync(AGENT_JSON)
  ? JSON.parse(readFileSync(AGENT_JSON, "utf8")).showcaseAgentId
  : "";

const GOVERNED = /^\[(ALPHA|BETA|PROD|ARCHIVED)\]/i;

const elFetch = (path: string, init: RequestInit = {}) =>
  fetch(`${EL}${path}`, { ...init, headers: { "xi-api-key": API_KEY, ...(init.headers ?? {}) } });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function agentIsMutable(agentId: string): Promise<{ ok: boolean; name?: string; reason?: string }> {
  const r = await elFetch(`/v1/convai/agents/${agentId}`);
  if (!r.ok) return { ok: false, reason: `agent fetch ${r.status}` };
  const name: string = ((await r.json()) as any).name ?? "";
  if (GOVERNED.test(name)) return { ok: false, name, reason: `governed phase ${name.match(GOVERNED)![0]} — needs explicit approval` };
  return { ok: true, name }; // [DEV] or prefix-less (implicit DEV)
}

const CT: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
};

const server = Bun.serve({
  port: PORT,
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // ---- API proxy ----
    if (pathname === "/api/config") {
      return json({ showcaseAgentId, embedScript: "https://unpkg.com/@elevenlabs/convai-widget-embed" });
    }

    if (pathname === "/api/agents") {
      const r = await elFetch(`/v1/convai/agents?page_size=100`);
      const d = (await r.json()) as any;
      const phaseOf = (n: string) => (n.match(/^\[(\w+)\]/)?.[1] ?? "DEV").toUpperCase();
      return json((d.agents ?? []).map((a: any) => ({
        agent_id: a.agent_id, name: a.name, phase: phaseOf(a.name ?? ""),
        mutable: !GOVERNED.test(a.name ?? ""),
      })));
    }

    const widgetMatch = pathname.match(/^\/api\/widget\/(agent_[\w]+)$/);
    if (widgetMatch) {
      const id = widgetMatch[1];
      if (req.method === "GET") {
        const r = await elFetch(`/v1/convai/agents/${id}/widget`);
        return json(await r.json(), r.status);
      }
      if (req.method === "PATCH") {
        const guard = await agentIsMutable(id);
        if (!guard.ok) return json({ error: guard.reason, name: guard.name }, 403);
        const widget = await req.json(); // partial platform_settings.widget
        const r = await elFetch(`/v1/convai/agents/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform_settings: { widget } }),
        });
        const body = await r.text();
        return new Response(body, { status: r.status, headers: { "content-type": "application/json" } });
      }
    }

    const fullMatch = pathname.match(/^\/api\/agent\/(agent_[\w]+)$/);
    if (fullMatch && req.method === "GET") {
      const r = await elFetch(`/v1/convai/agents/${fullMatch[1]}`);
      const d = (await r.json()) as any;
      return json({ agent_id: d.agent_id, name: d.name, platform_settings: d.platform_settings, conversation_config: d.conversation_config }, r.status);
    }

    const signedMatch = pathname.match(/^\/api\/signed-url\/(agent_[\w]+)$/);
    if (signedMatch) {
      const r = await elFetch(`/v1/convai/conversation/get-signed-url?agent_id=${signedMatch[1]}`);
      return json(await r.json(), r.status);
    }

    const tokenMatch = pathname.match(/^\/api\/conversation-token\/(agent_[\w]+)$/);
    if (tokenMatch) {
      const r = await elFetch(`/v1/convai/conversation/token?agent_id=${tokenMatch[1]}`);
      return json(await r.json(), r.status);
    }

    // Scribe (STT) single-use token — per ElevenLabs docs, mint via the real endpoint.
    if (pathname === "/api/scribe-token") {
      const r = await elFetch(`/v1/single-use-token/realtime_scribe`, { method: "POST" });
      return json(await r.json(), r.status);
    }

    // JSONL action/event log — browser POSTs events, server appends per repo's
    // jsonl-trace spec (logs/voice-evals-<ISO-date>.jsonl rooted at CWD).
    if (pathname === "/api/log" && req.method === "POST") {
      try {
        const body = (await req.json()) as { events?: any[] };
        const events = Array.isArray(body.events) ? body.events : [body];
        const date = new Date().toISOString().slice(0, 10);
        const dir = join(process.cwd(), "logs");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const file = join(dir, `voice-evals-${date}.jsonl`);
        const lines = events.map((e: any) => JSON.stringify({
          ts: new Date().toISOString(),
          channel: e?.channel ?? "playground.unknown",
          level: e?.level ?? "info",
          ...(e?.run_id ? { run_id: e.run_id } : {}),
          ...(e?.key ? { key: e.key } : {}),
          ...(e?.msg ? { msg: e.msg } : {}),
          ...(e?.fields ? { fields: e.fields } : {}),
        })).join("\n") + "\n";
        appendFileSync(file, lines);
        return json({ ok: true, appended: events.length, file: `logs/voice-evals-${date}.jsonl` });
      } catch (e: any) {
        return json({ ok: false, error: e?.message || String(e) }, 500);
      }
    }

    // Audio → URL match (STT + sitemap fetch + llm.sh) — used by voice-nav-01.
    if (pathname === "/api/voice-nav" && req.method === "POST") {
      const form = await req.formData();
      const file = form.get("audio") as File | null;
      if (!file) return json({ data: {}, error: "no audio" }, 400);
      const sttFd = new FormData();
      sttFd.append("file", file, (file as any).name ?? "audio.webm");
      sttFd.append("model_id", "scribe_v1");
      sttFd.append("language_code", "en");
      const sttRes = await elFetch(`/v1/speech-to-text`, { method: "POST", body: sttFd });
      if (!sttRes.ok) return json({ data: {}, error: `STT ${sttRes.status}` }, 500);
      const transcript = (((await sttRes.json()) as any).text || "").trim();
      if (!transcript) return json({ data: {}, error: "empty transcript" });
      const sm = await (await fetch("https://elevenlabs.io/docs/sitemap.xml")).text();
      const urls = [...new Set((sm.match(/<loc>(.*?)<\/loc>/g) || []).map((m) => m.replace(/<\/?loc>/g, "")))].slice(0, 200);
      const sys = `Match the user's intent to ONE URL from this list and respond ONLY with JSON like {"url":"https://..."} — no fences, no prose.\n\nURLs:\n${urls.join("\n")}`;
      const proc = Bun.spawn(["llm.sh"], { stdin: "pipe", stdout: "pipe", stderr: "ignore", env: { ...process.env, LLM_SYSTEM: sys } });
      proc.stdin.write(`User intent: ${transcript}`);
      proc.stdin.end();
      const out = (await new Response(proc.stdout).text()).trim();
      try { return json({ data: JSON.parse(out), transcript }); }
      catch { return json({ data: {}, transcript, error: "LLM did not return JSON: " + out.slice(0, 160) }); }
    }

    // Audio → JSON extraction (STT + llm.sh) — used by voice-form-01 block.
    // Replaces its upstream "use server" `voiceToFormAction`.
    if (pathname === "/api/extract-form" && req.method === "POST") {
      const form = await req.formData();
      const file = form.get("audio") as File | null;
      if (!file) return json({ data: {}, error: "no audio" }, 400);
      const sttFd = new FormData();
      sttFd.append("file", file, (file as any).name ?? "audio.webm");
      sttFd.append("model_id", "scribe_v1");
      sttFd.append("language_code", "en");
      const sttRes = await elFetch(`/v1/speech-to-text`, { method: "POST", body: sttFd });
      if (!sttRes.ok) return json({ data: {}, error: `STT ${sttRes.status}` }, 500);
      const transcript = (((await sttRes.json()) as any).text || "").trim();
      if (!transcript) return json({ data: {}, error: "empty transcript" });
      const sys = 'Extract firstName and lastName from this voice transcript. Respond ONLY with valid JSON like {"firstName":"...","lastName":"..."} — no fences, no prose. Omit fields that are missing.';
      const proc = Bun.spawn(["llm.sh"], { stdin: "pipe", stdout: "pipe", stderr: "ignore", env: { ...process.env, LLM_SYSTEM: sys } });
      proc.stdin.write(`Transcript: ${transcript}`);
      proc.stdin.end();
      const out = (await new Response(proc.stdout).text()).trim();
      try { return json({ data: JSON.parse(out), transcript }); }
      catch { return json({ data: {}, transcript, error: "LLM did not return JSON: " + out.slice(0, 160) }); }
    }

    // Batch STT — proxies an audio file upload to ElevenLabs speech-to-text.
    // Used by the transcriber-01 reference block (its server action lives in
    // the upstream repo; we expose the same surface client-side via /api).
    if (pathname === "/api/stt" && req.method === "POST") {
      const form = await req.formData();
      const file = form.get("audio") as File | null;
      if (!file) return json({ error: "no audio file" }, 400);
      const fd = new FormData();
      fd.append("file", file, (file as any).name ?? "audio.webm");
      fd.append("model_id", (form.get("model_id") as string) || "scribe_v1");
      const lang = form.get("language_code") as string | null;
      if (lang) fd.append("language_code", lang);
      const r = await elFetch(`/v1/speech-to-text`, { method: "POST", body: fd });
      return new Response(await r.text(), { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json" } });
    }

    const avatarMatch = pathname.match(/^\/api\/avatar\/(agent_[\w]+)$/);
    if (avatarMatch && req.method === "POST") {
      const guard = await agentIsMutable(avatarMatch[1]);
      if (!guard.ok) return json({ error: guard.reason, name: guard.name }, 403);
      const r = await elFetch(`/v1/convai/agents/${avatarMatch[1]}/avatar`, { method: "POST", body: req.body, headers: req.headers.get("content-type") ? { "content-type": req.headers.get("content-type")! } : {} });
      return new Response(await r.text(), { status: r.status, headers: { "content-type": "application/json" } });
    }

    if (pathname.startsWith("/api/")) return json({ error: "unknown endpoint" }, 404);

    // ---- static ----
    // It's one page now: the console at "/" (gallery.html) holds the showcase and
    // the live control plane. The old standalone pages 302 home so there's a single
    // surface; their files are retained for reference but no longer routed to.
    const LEGACY = new Set(["/widget.html", "/index.html", "/react.html", "/components.html", "/ui-library.html", "/examples.html", "/blocks.html"]);
    if (LEGACY.has(pathname)) return new Response(null, { status: 302, headers: { location: "/" } });
    let rel = pathname === "/" ? "/gallery.html" : pathname;
    const file = Bun.file(join(PUBLIC_DIR, rel));
    if (await file.exists()) {
      return new Response(file, { headers: { "content-type": CT[extname(rel)] ?? "application/octet-stream" } });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`\n  ElevenLabs UI Showcase → http://localhost:${server.port}`);
console.log(`  Showcase agent: ${showcaseAgentId || "(run playground/setup to create)"}`);
console.log(`  API key: loaded (${API_KEY.slice(0, 6)}…, never sent to browser)\n`);
