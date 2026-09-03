// Streaming alignment API (§34) — HTTP chunked transport (no extra dependencies).
//
// Lifecycle:
//   POST   /api/align/session                  → provision an isolated session (fail-closed if the
//                                                 reading/canonical/reference are unavailable).
//   POST   /api/align/session/:id/audio        → send an ordered PCM chunk {seq, audioBase64,
//                                                 sourceRate}; responds with the events it produced.
//   POST   /api/align/session/:id/complete     → finalize; returns SESSION_COMPLETED + metrics.
//   GET    /api/align/session/:id              → status/metrics/manifest.
//   DELETE /api/align/session/:id              → cancel.
//
// The engine is advisory only. Every response carries mode SHADOW_ONLY and every event has
// scoreDelta:0 / authority:HUMAN_ONLY — MIZAN must treat output as evidence, never as a verdict,
// until production gates promote a specific reading to LIVE_ASSIST (§41, §42).

import express from 'express';
import crypto from 'crypto';
import { AlignmentSessionManager, SessionFailClosed } from './session';
import { AlignmentSessionSpec } from './types';
import { isKnownReading } from './reading';

export interface AlignmentApiOptions {
  manager: AlignmentSessionManager;
  auth?: any;                     // optional express middleware guarding these routes
  mode?: 'SHADOW_ONLY' | 'LIVE_ASSIST';
  // DEV ONLY: fill in the canonical text hash for a spec so a developer client need not know it in
  // advance. Wired only when MIZAN_ALIGNMENT_DEV_SYNTH is enabled; never in production.
  devCanonicalHash?: (spec: AlignmentSessionSpec) => string | undefined;
}

const failStatus = (code: string): number =>
  /NOT_FOUND/.test(code) ? 404
  : /EXISTS|OUT_OF_ORDER/.test(code) ? 409
  : /UNAVAILABLE|NOT_OPERATIONAL/.test(code) ? 503
  : 400;

export function createAlignmentRouter(opts: AlignmentApiOptions) {
  const router = express.Router();
  const mode = opts.mode || 'SHADOW_ONLY';
  const guard = opts.auth || ((_req: any, _res: any, next: any) => next());
  const envelope = (extra: Record<string, unknown>) => ({ mode, authority: 'HUMAN_ONLY', scoreDeltaGuarantee: 0, ...extra });

  router.post('/session', guard, (req: any, res: any) => {
    const b = req.body || {};
    if (!isKnownReading(String(b.readingId || ''))) return res.status(400).json({ code: 'READING_UNKNOWN' });
    const spec: AlignmentSessionSpec = {
      sessionId: crypto.randomUUID(),
      readingId: b.readingId,
      surah: Number(b.surah),
      startAyah: Number(b.startAyah),
      endAyah: Number(b.endAyah),
      expectedStartWordIndex: b.expectedStartWordIndex === undefined ? undefined : Number(b.expectedStartWordIndex),
      backtrackMarginWords: b.backtrackMarginWords === undefined ? undefined : Number(b.backtrackMarginWords),
      forwardMarginWords: b.forwardMarginWords === undefined ? undefined : Number(b.forwardMarginWords),
      canonicalTextHash: String(b.canonicalTextHash || ''),
      canonicalPackageVersion: String(b.canonicalPackageVersion || ''),
    };
    if (!Number.isInteger(spec.surah) || !Number.isInteger(spec.startAyah) || !Number.isInteger(spec.endAyah) || spec.endAyah < spec.startAyah) {
      return res.status(400).json({ code: 'SESSION_SPEC_INVALID' });
    }
    if (!spec.canonicalTextHash && opts.devCanonicalHash) {
      spec.canonicalTextHash = opts.devCanonicalHash(spec) || '';
    }
    try {
      const { handle, startedEvent } = opts.manager.create(spec);
      return res.status(201).json(envelope({ sessionId: spec.sessionId, manifest: handle.manifest, event: startedEvent }));
    } catch (err) {
      const code = err instanceof SessionFailClosed ? err.code : 'SESSION_CREATE_FAILED';
      return res.status(failStatus(code)).json({ code, detail: err instanceof Error ? err.message : undefined });
    }
  });

  router.post('/session/:id/audio', guard, (req: any, res: any) => {
    const b = req.body || {};
    const seq = Number(b.seq);
    const sourceRate = b.sourceRate ? Number(b.sourceRate) : 16000;
    if (!Number.isInteger(seq) || seq < 0) return res.status(400).json({ code: 'SEQ_INVALID' });
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(Buffer.from(String(b.audioBase64 || ''), 'base64'));
    } catch {
      return res.status(400).json({ code: 'AUDIO_DECODE_FAILED' });
    }
    try {
      const events = opts.manager.pushAudio(String(req.params.id), seq, bytes, sourceRate);
      const h = opts.manager.get(String(req.params.id));
      return res.json(envelope({ seq, events, metrics: h?.engine.getMetrics(), state: h?.engine.state }));
    } catch (err) {
      const code = err instanceof SessionFailClosed ? err.code : 'AUDIO_PUSH_FAILED';
      return res.status(failStatus(code)).json({ code, detail: err instanceof Error ? err.message : undefined });
    }
  });

  router.post('/session/:id/complete', guard, (req: any, res: any) => {
    try {
      const event = opts.manager.complete(String(req.params.id));
      const h = opts.manager.get(String(req.params.id));
      const metrics = h?.engine.getMetrics();
      opts.manager.destroy(String(req.params.id));
      return res.json(envelope({ event, metrics }));
    } catch (err) {
      const code = err instanceof SessionFailClosed ? err.code : 'COMPLETE_FAILED';
      return res.status(failStatus(code)).json({ code });
    }
  });

  router.get('/session/:id', guard, (req: any, res: any) => {
    const h = opts.manager.get(String(req.params.id));
    if (!h) return res.status(404).json({ code: 'SESSION_NOT_FOUND' });
    return res.json(envelope({ sessionId: h.spec.sessionId, state: h.engine.state, metrics: h.engine.getMetrics(), manifest: h.manifest, nextSeq: h.nextSeq }));
  });

  router.delete('/session/:id', guard, (req: any, res: any) => {
    opts.manager.destroy(String(req.params.id));
    return res.json(envelope({ cancelled: true }));
  });

  router.get('/health', (_req: any, res: any) => res.json(envelope({ activeSessions: opts.manager.activeCount })));

  return router;
}
