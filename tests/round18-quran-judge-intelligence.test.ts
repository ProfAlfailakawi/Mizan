import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {QuranSessionEvidenceStore} from '../server/quran-session-evidence';

test('session evidence records shadow alignment and human markers without score authority leakage',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-quran-evidence-'));const repo=new QuranSessionEvidenceStore(root);
 const first=repo.appendAlignment({actorId:'judge-1',sessionId:'session-1',timestamp:'2026-09-03T03:00:00.000Z',reading:'hafs',surah:1,ayah:1,wordIndex:1,alignmentState:'LOCKED',recoveryState:'NONE',confidence:.95,acousticQuality:.92});
 assert.equal(first.events.length,1);assert.equal(first.events[0].scoreAuthority,'HUMAN_ONLY');assert.equal(first.events[0].source,'MIZAN_SHADOW_ALIGNMENT');
 const marked=repo.appendHumanMarker({actorId:'judge-1',sessionId:'session-1',eventType:'tajweed'});assert.equal(marked.summary.humanMarkers,1);assert.equal(marked.events.at(-1)?.source,'JUDGE_INPUT');assert.match(marked.integrity.sha256,/^[a-f0-9]{64}$/);
});

test('session evidence deduplicates materially identical shadow samples and preserves recovery milestones',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-quran-evidence-'));const repo=new QuranSessionEvidenceStore(root);
 repo.appendAlignment({actorId:'j',sessionId:'s',timestamp:'2026-09-03T03:00:00.000Z',reading:'hafs',surah:2,ayah:5,wordIndex:2,alignmentState:'LOCKED',recoveryState:'NONE',confidence:.91});
 repo.appendAlignment({actorId:'j',sessionId:'s',timestamp:'2026-09-03T03:00:01.000Z',reading:'hafs',surah:2,ayah:5,wordIndex:2,alignmentState:'LOCKED',recoveryState:'NONE',confidence:.92});
 const lost=repo.appendAlignment({actorId:'j',sessionId:'s',timestamp:'2026-09-03T03:00:02.000Z',reading:'hafs',surah:2,ayah:5,wordIndex:2,alignmentState:'LOST',recoveryState:'SILENCE',confidence:.3});
 assert.equal(lost.events.length,2);assert.equal(lost.summary.lostEvents,1);assert.equal(lost.summary.recoveryEvents,1);
});

test('JudgeOS integration remains shadow-only and cross-reading fallback is explicitly forbidden',()=>{
 const judge=fs.readFileSync(path.resolve('src/components/judge/JudgeOS.tsx'),'utf8');const dock=fs.readFileSync(path.resolve('src/components/judge/QuranIntelligenceDock.tsx'),'utf8');const service=fs.readFileSync(path.resolve('server/quran-intelligence-service.ts'),'utf8');const venue=fs.readFileSync(path.resolve('src/lib/kfgqpc-library.ts'),'utf8');
 assert.match(judge,/postQuranHumanMarker/);assert.match(judge,/fetchQuranReadingGuard/);assert.match(dock,/HUMAN SCORE AUTHORITY/);assert.match(service,/crossReadingFallback:'FORBIDDEN'/);assert.match(service,/scoreDelta:0/);assert.match(venue,/mizan-quran-venue-v1/);
});
