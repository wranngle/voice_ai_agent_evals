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
import { join, extname, resolve } from "node:path";

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

// Governance classification — single source of truth. Doctrine: mutable IFF the
// name has no [PHASE] prefix OR the prefix is exactly [DEV]. Every other prefix
// ([ALPHA]/[BETA]/[PROD]/[ARCHIVED]/[TEMPLATE]/[STAGING]/anything) needs explicit
// approval. The old regex only blocked the 4 named phases, silently leaving
// [TEMPLATE] and any unknown prefix mutable.
const phaseOf = (name: string): string => name.match(/^\[([^\]]+)\]/)?.[1]?.trim().toUpperCase() ?? "DEV";
const isMutableName = (name: string): boolean => phaseOf(name) === "DEV";

// The EL docs sitemap rarely changes; voice-nav was re-downloading it on every
// request (hundreds of KB + upstream RTT). Cache for an hour.
const SITEMAP_TTL_MS = 60 * 60 * 1000;
let sitemapCache: { urls: string[]; expiresAt: number } | null = null;
// Spawn llm.sh with a hard timeout — without one, a hung subprocess blocks the
// request until Bun's 120s idleTimeout closes the connection. 30s is far longer
// than any normal LLM call but cuts the worst-case 4× and frees the connection.
async function runLlmSh(input: string, systemPrompt: string, timeoutMs = 30_000): Promise<string> {
  const proc = Bun.spawn(["llm.sh"], { stdin: "pipe", stdout: "pipe", stderr: "ignore", env: { ...process.env, LLM_SYSTEM: systemPrompt } });
  proc.stdin.write(input);
  proc.stdin.end();
  const killer = setTimeout(() => { try { proc.kill(); } catch { /* already exited */ } }, timeoutMs);
  try { return (await new Response(proc.stdout).text()).trim(); }
  finally { clearTimeout(killer); }
}

async function getSitemapUrls(): Promise<string[]> {
  if (sitemapCache && Date.now() < sitemapCache.expiresAt) return sitemapCache.urls;
  console.log("[server] sitemap cache miss — fetching elevenlabs.io/docs/sitemap.xml");
  const sm = await (await fetch("https://elevenlabs.io/docs/sitemap.xml")).text();
  const urls = [...new Set((sm.match(/<loc>(.*?)<\/loc>/g) || []).map((m) => m.replace(/<\/?loc>/g, "")))].slice(0, 200);
  sitemapCache = { urls, expiresAt: Date.now() + SITEMAP_TTL_MS };
  return urls;
}

const elFetch = (path: string, init: RequestInit = {}) =>
  fetch(`${EL}${path}`, { ...init, headers: { "xi-api-key": API_KEY, ...(init.headers ?? {}) } });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

async function agentIsMutable(agentId: string): Promise<{ ok: boolean; name?: string; reason?: string }> {
  const r = await elFetch(`/v1/convai/agents/${agentId}`);
  if (!r.ok) return { ok: false, reason: `agent fetch ${r.status}` };
  const name: string = ((await r.json()) as any).name ?? "";
  if (!isMutableName(name)) return { ok: false, name, reason: `governed phase [${phaseOf(name)}] — needs explicit approval` };
  return { ok: true, name }; // [DEV] or prefix-less (implicit DEV)
}

const CT: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".map": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",  // capability TTS samples — were served as application/octet-stream
};

// Build the SPA bundle from source on startup so what we serve is never stale.
// The committed artifact is gitignored — source under ui-library/src is the
// only truth, and a contributor can never forget to rebuild.
const buildResult = await Bun.build({
  entrypoints: [join(import.meta.dir, "ui-library/src/gallery-main.tsx")],
  outdir: join(PUBLIC_DIR, "ui-library"),
  target: "browser",
  format: "esm",
  define: { "process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID": JSON.stringify(showcaseAgentId) },
});
if (!buildResult.success) {
  console.error("\n  ✗ playground bundle build failed:");
  for (const m of buildResult.logs) console.error("   ", m);
  process.exit(1);
}

// Defensive response headers applied to every Response (including unhandled
// errors). Relevant once PLAYGROUND_BIND exposes the server beyond localhost
// — same threat model as the source-leak fix: clickjacking via iframe, MIME
// sniffing of forwarded uploads, and referer-URL leakage outbound.
const SEC_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
};
function withSec(res: Response): Response {
  for (const [k, v] of Object.entries(SEC_HEADERS)) res.headers.set(k, v);
  return res;
}

async function handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const { pathname } = url;

    // ---- API proxy ----
    if (pathname === "/api/config") {
      return json({ showcaseAgentId, embedScript: "https://unpkg.com/@elevenlabs/convai-widget-embed" });
    }

    if (pathname === "/api/agents") {
      const r = await elFetch(`/v1/convai/agents?page_size=100`);
      const d = (await r.json()) as any;
      return json((d.agents ?? []).map((a: any) => ({
        agent_id: a.agent_id, name: a.name, phase: phaseOf(a.name ?? ""),
        mutable: isMutableName(a.name ?? ""),
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
        let widget: unknown; // partial platform_settings.widget
        try { widget = await req.json(); }
        catch { return json({ error: "invalid JSON body" }, 400); } // client error, not a leaked 500
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
      let body: { events?: any[] };
      try { body = (await req.json()) as { events?: any[] }; }
      catch { return json({ ok: false, error: "invalid JSON body" }, 400); } // client error, not 500
      // Require an explicit events array. The previous `[body]` fallback turned
      // any malformed POST ({}) into a single "playground.unknown" log line —
      // silent log pollution. Validate up front instead.
      if (!Array.isArray(body.events)) return json({ ok: false, error: "missing or invalid `events` array" }, 400);
      try {
        const events = body.events;
        const date = new Date().toISOString().slice(0, 10);
        const dir = join(process.cwd(), "logs");
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const file = join(dir, `voice-evals-${date}.jsonl`);
        // Preserve client-emit `ts` — per src/internal/jsonl-trace.ts spec, ts
        // is the event-origin timestamp. For /api/log the browser is the
        // emitter; the previous unconditional server-side toISOString() shifted
        // every event by the 350ms client queue flush + network RTT, which
        // hides ordering and burst patterns in the trace. Validate ISO 8601
        // shape so a malformed payload can't poison the stream; fall back to
        // server time when missing (e.g. gate-internal POSTs without a ts).
        const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
        const lines = events.map((e: any) => JSON.stringify({
          ts: typeof e?.ts === "string" && ISO.test(e.ts) ? e.ts : new Date().toISOString(),
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
        // Disk full, permissions, parent dir gone — without server-side
        // logging, the operator only sees the client's 500. Log the stack
        // here (same posture as the Bun.serve error() handler in #79); the
        // response body still has just the message, no internals.
        console.error("[server] /api/log write failed:", e?.stack || e?.message || e);
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
      const urls = await getSitemapUrls();
      const sys = `Match the user's intent to ONE URL from this list and respond ONLY with JSON like {"url":"https://..."} — no fences, no prose.\n\nURLs:\n${urls.join("\n")}`;
      const out = await runLlmSh(`User intent: ${transcript}`, sys);
      let parsed: { url?: string } = {};
      try { parsed = JSON.parse(out) as { url?: string }; }
      catch { return json({ data: {}, transcript, error: "LLM did not return JSON: " + out.slice(0, 160) }); }
      // Enforce allowlist: LLM may hallucinate or be prompt-injected via the
      // transcript. The Voice Nav iframe loads the returned URL, so accept only
      // entries that appeared in the fetched ElevenLabs sitemap.
      if (!parsed.url || !urls.includes(parsed.url)) {
        return json({ data: {}, transcript, error: "LLM returned URL not in sitemap allowlist", llm_out: out.slice(0, 200) });
      }
      return json({ data: parsed, transcript });
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
      const out = await runLlmSh(`Transcript: ${transcript}`, sys);
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
    // Resolve the requested path and confirm it stays inside PUBLIC_DIR;
    // a request with `..` segments could otherwise escape and read arbitrary
    // local files — especially risky when PLAYGROUND_BIND is set beyond localhost.
    const requestedPath = resolve(PUBLIC_DIR, "." + rel);
    if (requestedPath !== PUBLIC_DIR && !requestedPath.startsWith(PUBLIC_DIR + "/")) {
      return new Response("Not found", { status: 404 });
    }
    const file = Bun.file(requestedPath);
    if (await file.exists()) {
      return new Response(file, { headers: { "content-type": CT[extname(rel)] ?? "application/octet-stream" } });
    }
    return new Response("Not found", { status: 404 });
}

const server = Bun.serve({
  hostname: process.env.PLAYGROUND_BIND ?? "127.0.0.1",  // localhost-only by default; PROD opt-in via env
  port: PORT,
  idleTimeout: 120,
  async fetch(req) { return withSec(await handleRequest(req)); },
  // Without this, an unhandled throw falls to Bun's default error page, whose
  // __bunfallback payload base64-encodes the server SOURCE + stack — an info
  // leak the moment PLAYGROUND_BIND exposes this beyond localhost. Log it
  // server-side, return a clean JSON 500 with no internals (still sec-headered).
  error(err: Error) {
    // Log the stack server-side — that's where you debug from. The response
    // body stays internals-free per the source-leak fix in #51.
    console.error("[server] unhandled:", err?.stack || err?.message || err);
    return withSec(new Response(JSON.stringify({ ok: false, error: "internal error" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    }));
  },
});

console.log(`\n  ElevenLabs UI Showcase → http://localhost:${server.port}`);
console.log(`  Showcase agent: ${showcaseAgentId || "(none — write playground/agent.json with {\"showcaseAgentId\":\"agent_...\"})"}`);
console.log(`  API key: loaded (never sent to browser)\n`);
