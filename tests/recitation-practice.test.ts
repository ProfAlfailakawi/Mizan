import assert from 'node:assert/strict';
import test from 'node:test';
import { finalJudgment, liveJudgment } from '../src/lib/live-judging';
import { dropWordsUnderAlert, EMPTY_ALERT_MEMORY, planAlert } from '../src/lib/recitation-alerts';
import { bandsFromInkProfile, bandSpan } from '../src/lib/mushaf-line-bands';

test('live recitation waits behind the reading frontier and final catches a skipped word',()=>{
 const expected=['الحمد','لله','رب','العالمين','الرحمن','الرحيم'].map((text,index)=>({text,index}));
 const heard=['الحمد','لله','العالمين','الرحمن','الرحيم'].map(text=>({text,confidence:.99}));
 const gate={word:'OPEN' as const,tashkeel:'CLOSED' as const};
 const live=liveJudgment(expected,heard,gate,1);assert.ok(live.frontier>=0);
 const final=finalJudgment(expected,heard,gate);assert.ok(final);assert.ok(final!.mistakes.some(m=>m.kind==='skipped'&&m.wordIndex===2));
});

test('audio cue is emitted once for a settled skipped word',()=>{
 const mistakes=[{kind:'skipped' as const,wordIndex:2,expected:'رب',confidence:.99}];
 const first=planAlert(mistakes,EMPTY_ALERT_MEMORY,2000);assert.equal(first.sound?.wordIndex,2);
 const second=planAlert(mistakes,first.memory,4000);assert.equal(second.sound,null);
});

test('alert echo guard keeps a real Quran word and drops foreign echo',()=>{
 const out=dropWordsUnderAlert([{text:'رب',confidence:.9,startMs:2000,endMs:2050},{text:'beep',confidence:.8,startMs:2000,endMs:2050}],[{startMs:1900,endMs:2200}],t=>t==='رب');
 assert.deepEqual(out.kept.map(x=>x.text),['رب']);assert.deepEqual(out.dropped.map(x=>x.text),['beep']);
});

test('line-band fallback still locates all expected Mushaf lines',()=>{
 const ink=new Array(1000).fill(0);for(let i=0;i<15;i++){const center=100+i*55;for(let y=center-8;y<=center+8;y++)ink[y]=100}ink[20]=95;
 const bands=bandsFromInkProfile(ink,{expectedLines:15});assert.equal(bands.length,15);const first=bandSpan(bands,1,1);assert.ok(first);assert.ok(first!.top>.07&&first!.top<.13);
});
