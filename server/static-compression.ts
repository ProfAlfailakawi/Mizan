import compression from 'compression';
import type { RequestHandler } from 'express';
// stubs.d.ts declares 'express' with only its default export and RequestHandler; server.ts takes
// Request/Response from express-serve-static-core for the same reason.
import type { Request, Response } from 'express-serve-static-core';

/*
 * Gzip/brotli for the built client only: the JS and CSS bundles, the SVG/manifest files and
 * the HTML shell.
 *
 * server.ts mounts this directly before express.static, after every API, webhook, legal-page
 * and health route, so those responses never pass through it. The filter is a second guard,
 * so that a route added later, or an unknown /api GET that falls through to the SPA fallback,
 * is still sent exactly as before:
 *  - /api/** — includes the payment webhooks (/api/payments/webhook, /api/payments/webhook/
 *    gateways/:id), the audio routes (/api/public/quran-audio/:file, /api/public/cue-audio,
 *    /api/align/session/:id/audio, /api/quran/alignment/shadow/audio, the practice and
 *    judge-follow recognisers), the AI routes (/api/copilot/query, /api/ai/integrity/analyze)
 *    and the KFGQPC delivery (/api/public/kfgqpc/*);
 *  - any /internal/** path, and any path with a /webhook or /webhooks segment;
 *  - any text/event-stream response: a gzip buffer would hold events back instead of letting
 *    each frame reach the client as it is written;
 *  - any 206 byte-range reply, whose Content-Range counts uncompressed bytes.
 * Everything else defers to compression's own filter (compressible Content-Type only).
 * compression itself also skips HEAD requests, bodies under 1 KB and Cache-Control: no-transform.
 */
const NEVER_COMPRESS_PATH = /^\/(?:api|internal)(?:\/|$)|\/webhooks?(?:\/|$)/i;
const EVENT_STREAM = /^\s*text\/event-stream\b/i;

export function shouldCompress(req: Request, res: Response): boolean {
  if (NEVER_COMPRESS_PATH.test(req.path)) return false;
  if (EVENT_STREAM.test(String(res.getHeader('Content-Type') ?? ''))) return false;
  if (res.statusCode === 206) return false;
  return compression.filter(req, res);
}

export function staticCompression(): RequestHandler {
  return compression({ filter: shouldCompress });
}
