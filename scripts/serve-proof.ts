#!/usr/bin/env bun
/**
 * `bun run proof` — static server for the proof/ artifact.
 *
 * The proof console (refine.html, index.html, pitch.html) loads session data
 * with fetch(), which every major browser blocks under file:// — so "just
 * open the HTML" cannot work. This serves proof/ read-only on localhost.
 *
 * Port: PROOF_PORT env or 4173 (matches the URL docs/ux-roast.md references).
 * Binds 127.0.0.1 only — this is a local viewing surface, not a deployment.
 */

import {join, normalize} from 'node:path';

const PORT = Number(process.env.PROOF_PORT ?? 4173);
const ROOT = join(import.meta.dir, '..', 'proof');

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);
    let path = normalize(decodeURIComponent(url.pathname));
    // normalize() collapses ../ sequences; anything still escaping is refused.
    if (path.includes('..')) {
      return new Response('Forbidden', {status: 403});
    }

    if (path === '/' || path === '') {
      path = '/refine.html';
    }

    const file = Bun.file(join(ROOT, path));
    if (!(await file.exists())) {
      return new Response('Not found', {status: 404});
    }

    return new Response(file);
  },
});

console.log(`proof console → http://localhost:${server.port}/refine.html`);
console.log(`data console  → http://localhost:${server.port}/index.html`);
console.log(`pitch deck    → http://localhost:${server.port}/pitch.html`);
