// Session state management (§35, §36, §48).
//
// Each session is fully isolated (never mix reciters). The manager resolves two providers before it
// will start a real session — the canonical TEXT (from the certified vault) and the acoustic
// REFERENCE (backend). If either is unavailable, the session FAILS CLOSED: it never falls back to a
// guess, a different reading, or fabricated audio. Sessions emit events only; MIZAN consumes them.

import { AlignmentSessionSpec, AlignmentConfig, DEFAULT_CONFIG, AlignmentEvent } from './types';
import { CanonicalPassage } from './canonical';
import { AcousticBackend } from './acoustic/backend';
import { AlignmentEngine } from './engine';
import { buildManifest, AlignmentManifest } from './manifest';
import { isOperationalReading } from './reading';

/** Resolves the certified canonical passage for a session (from MIZAN's Quran Source Vault). */
export interface CanonicalProvider {
  getPassage(spec: AlignmentSessionSpec): CanonicalPassage | null;
}
/** Resolves the acoustic reference backend for a session (reference recitation of the passage). */
export interface AcousticProvider {
  getBackend(spec: AlignmentSessionSpec, passage: CanonicalPassage, cfg: AlignmentConfig): AcousticBackend | null;
}

export class SessionFailClosed extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'SessionFailClosed'; }
}

export interface SessionHandle {
  spec: AlignmentSessionSpec;
  engine: AlignmentEngine;
  manifest: AlignmentManifest;
  createdAt: number;
  lastAudioAt: number;
  nextSeq: number;      // expected chunk sequence number (backpressure/order)
  events: AlignmentEvent[]; // recent event ring (bounded)
}

export class AlignmentSessionManager {
  private sessions = new Map<string, SessionHandle>();

  constructor(
    private canonical: CanonicalProvider,
    private acoustic: AcousticProvider,
    private cfg: AlignmentConfig = DEFAULT_CONFIG,
  ) {}

  /** Create an isolated session or fail closed with a specific code. Returns the SESSION_STARTED event. */
  create(spec: AlignmentSessionSpec): { handle: SessionHandle; startedEvent: AlignmentEvent } {
    if (this.sessions.has(spec.sessionId)) throw new SessionFailClosed('SESSION_EXISTS', 'Session id already active.');
    if (!isOperationalReading(spec.readingId)) throw new SessionFailClosed('READING_NOT_OPERATIONAL', `No operational path for reading ${spec.readingId}.`);

    const passage = this.canonical.getPassage(spec);
    if (!passage) throw new SessionFailClosed('CANONICAL_UNAVAILABLE', 'Certified canonical passage unavailable for this session.');
    if (passage.canonicalTextHash !== spec.canonicalTextHash) throw new SessionFailClosed('CANONICAL_HASH_MISMATCH', 'Canonical text hash does not match the provisioned passage.');

    const backend = this.acoustic.getBackend(spec, passage, this.cfg);
    if (!backend) throw new SessionFailClosed('ACOUSTIC_REFERENCE_UNAVAILABLE', 'Acoustic reference for this passage is not ingested; refusing to align (fail-closed).');

    let engine: AlignmentEngine;
    try {
      engine = new AlignmentEngine(spec, passage, backend, this.cfg);
    } catch (err) {
      throw new SessionFailClosed('ENGINE_INIT_FAILED', err instanceof Error ? err.message : 'engine init failed');
    }

    const manifest = buildManifest({ reading: spec.readingId, backend, canonicalPackageVersion: spec.canonicalPackageVersion, canonicalTextHash: spec.canonicalTextHash, cfg: this.cfg });
    const handle: SessionHandle = { spec, engine, manifest, createdAt: Date.now(), lastAudioAt: 0, nextSeq: 0, events: [] };
    this.sessions.set(spec.sessionId, handle);
    const startedEvent = engine.sessionStartedEvent();
    handle.events.push(startedEvent);
    return { handle, startedEvent };
  }

  get(sessionId: string): SessionHandle | undefined { return this.sessions.get(sessionId); }

  /** Feed an ordered audio chunk. Rejects out-of-order chunks (backpressure/reconnect safety). */
  pushAudio(sessionId: string, seq: number, bytes: Uint8Array, sourceRate = 16000): AlignmentEvent[] {
    const h = this.sessions.get(sessionId);
    if (!h) throw new SessionFailClosed('SESSION_NOT_FOUND', 'Unknown session.');
    if (bytes.length === 0 || bytes.length % 2 !== 0) throw new SessionFailClosed('AUDIO_MALFORMED', 'PCM chunk must be non-empty and 16-bit aligned.');
    if (seq !== h.nextSeq) throw new SessionFailClosed('AUDIO_OUT_OF_ORDER', `Expected chunk ${h.nextSeq}, received ${seq}.`);
    h.nextSeq++;
    h.lastAudioAt = Date.now();
    const events = h.engine.pushAudio(bytes, sourceRate);
    h.events.push(...events);
    if (h.events.length > 500) h.events.splice(0, h.events.length - 500);
    return events;
  }

  complete(sessionId: string): AlignmentEvent {
    const h = this.sessions.get(sessionId);
    if (!h) throw new SessionFailClosed('SESSION_NOT_FOUND', 'Unknown session.');
    const ev = h.engine.complete();
    h.events.push(ev);
    return ev;
  }

  destroy(sessionId: string): void { this.sessions.delete(sessionId); }

  /** Reap sessions idle longer than ttlMs (timeout safety). */
  reap(ttlMs: number): number {
    const now = Date.now();
    let n = 0;
    for (const [id, h] of this.sessions) {
      const idle = now - (h.lastAudioAt || h.createdAt);
      if (idle > ttlMs) { this.sessions.delete(id); n++; }
    }
    return n;
  }

  get activeCount(): number { return this.sessions.size; }
}
