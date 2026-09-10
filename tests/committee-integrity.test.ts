import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeCommitteeIntegrity, COMMITTEE_INTEGRITY_VERSION, type ScoreEvent } from '../src/lib/committee-integrity';

function rows(committeeId: string, n: number, make: (i: number) => Partial<ScoreEvent>): ScoreEvent[] {
  return Array.from({ length: n }, (_, i) => ({ committeeId, penalty: 1, ...make(i) }));
}

test('report is non-official and forbids individual ranking', () => {
  const r = analyzeCommitteeIntegrity(rows('C1', 6, () => ({ submitOffsetMs: 1000 })));
  assert.equal(r.version, COMMITTEE_INTEGRITY_VERSION);
  assert.equal(r.nonOfficial, true);
  assert.equal(r.individualRankingProhibited, true);
});

test('tight submission clustering is flagged for a synchrony review', () => {
  const r = analyzeCommitteeIntegrity(rows('C1', 8, () => ({ submitOffsetMs: 120 })));
  assert.equal(r.committees[0].synchrony, 'REVIEW_SYNC');
  assert.equal(r.committees[0].status, 'REVIEW');
});

test('well-spaced submissions read as independent', () => {
  const r = analyzeCommitteeIntegrity(rows('C1', 8, i => ({ submitOffsetMs: 800 + i * 100 })));
  assert.equal(r.committees[0].synchrony, 'INDEPENDENT');
});

test('a regional deduction gap within a committee is flagged', () => {
  const events: ScoreEvent[] = [
    ...rows('C1', 4, () => ({ region: 'A', penalty: 0.2, submitOffsetMs: 900 })),
    ...rows('C1', 4, () => ({ region: 'B', penalty: 1.4, submitOffsetMs: 950 })),
  ];
  const r = analyzeCommitteeIntegrity(events);
  assert.equal(r.committees[0].regionalEvenness, 'REVIEW_REGIONAL');
  assert.ok((r.committees[0].regionalPenaltyGap ?? 0) > 0.5);
});

test('small samples are marked insufficient rather than accused', () => {
  const r = analyzeCommitteeIntegrity(rows('C1', 3, () => ({ submitOffsetMs: 100, region: 'A' })));
  assert.equal(r.committees[0].synchrony, 'INSUFFICIENT');
  assert.equal(r.committees[0].regionalEvenness, 'INSUFFICIENT');
  assert.equal(r.committees[0].status, 'CLEAR');
});

test('a judge assigned weaker reciters is not labelled harsh',async()=>{
 const {calibrateJudges}=await import('../server/judge-calibration');
 // Judge A only ever judged a weak field; judge B only a strong one. They never overlap.
 const observations=[
  ...['w1','w2','w3','w4','w5'].map(p=>({judgeId:'A',sessionId:`s-${p}`,participantId:p,score:60})),
  ...['x1','x2','x3','x4','x5'].map(p=>({judgeId:'B',sessionId:`t-${p}`,participantId:p,score:95})),
 ];
 for(const j of calibrateJudges(observations).judges){
  assert.equal(j.tendency,'INSUFFICIENT_DATA',`${j.judgeId} shares no participant with anyone, so no tendency may be claimed`);
  assert.equal(j.shrunkBias,0);
 }

 // Real severity — same participants, consistently lower — is still detected.
 const shared=Array.from({length:12},(_,i)=>`p${i}`).flatMap(p=>[
  {judgeId:'A',sessionId:p,participantId:p,score:80},
  {judgeId:'B',sessionId:p,participantId:p,score:90},
  {judgeId:'C',sessionId:p,participantId:p,score:90},
 ]);
 const report=calibrateJudges(shared);
 const a=report.judges.find(x=>x.judgeId==='A')!;
 assert.equal(a.tendency,'HAWK');
 assert.ok(a.shrunkBias<0,'a consistently lower judge reads as harsher than the panel');
 assert.equal(report.advisoryOnly,true,'the report may never be treated as a score correction');
});
