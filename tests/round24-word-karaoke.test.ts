import test from 'node:test';
import assert from 'node:assert/strict';
import {phoneticWeight,proportionalWordTimings,splitAyahWords,wordAtTime} from '../src/lib/word-timing';
import {findLayoutWord,normalizeMushafLayout} from '../server/mushaf-layout';

/* تقطيع الكلمة وتوقيتها هما ما يجعل التظليل يمشي مع التلاوة، وهما مصدر الخطأ الصامت الأول:
   إزاحة واحدة غلط تُلوّن حرفًا في كلمة أخرى. */

test('word splitting keeps exact character offsets and drops the ayah mark',()=>{
  const text='الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ ٢';
  const words=splitAyahWords(text);
  assert.equal(words.length,4,'ayah number is not a recited word');
  for(const w of words)assert.equal(text.slice(w.start,w.end),w.text,'offset round-trips to the same characters');
  assert.deepEqual(words.map(w=>w.index),[0,1,2,3]);
});

test('phonetic weight makes elongated words take longer than short ones',()=>{
  // المدّ يُشبع في التلاوة، فوزنه أعلى من كلمة قصيرة مساوية له في عدد الحروف.
  assert.ok(phoneticWeight('قَالُوا')>phoneticWeight('قُلْ'));
  assert.ok(phoneticWeight('مِن')>=1);
  assert.equal(phoneticWeight(''),1,'never zero — a word must not vanish from the distribution');
});

test('proportional timings tile the whole ayah with no gap or overlap',()=>{
  const text='الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ';
  const model=proportionalWordTimings(text,8000);
  assert.equal(model.assurance,'ESTIMATED_PROPORTIONAL');
  assert.equal(model.words.length,4);
  assert.equal(model.words[0].startMs,0);
  assert.equal(model.words[model.words.length-1].endMs,8000,'last word ends exactly at the audio end');
  for(let i=1;i<model.words.length;i++)assert.equal(model.words[i].startMs,model.words[i-1].endMs,'contiguous');
});

test('an unknown duration produces no timing rather than an invented one',()=>{
  for(const bad of [0,-1,NaN,Infinity]){
    const model=proportionalWordTimings('الْحَمْدُ لِلَّهِ',bad);
    assert.equal(model.words.length,0);
  }
});

test('wordAtTime finds the spoken word and reports none outside the ayah',()=>{
  const model=proportionalWordTimings('الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',8000);
  assert.equal(wordAtTime(model,0),0);
  assert.equal(wordAtTime(model,8000),-1,'past the end highlights nothing');
  const mid=model.words[2];
  assert.equal(wordAtTime(model,(mid.startMs+mid.endMs)/2),2);
  // كل لحظة داخل الآية تقع في كلمة واحدة بالضبط.
  for(let t=0;t<8000;t+=250)assert.ok(wordAtTime(model,t)>=0);
});

/* المُطبِّع يقرأ ملفات تخطيط مفتوحة المصدر مختلفة الأشكال. الشرط: يتعرّف أو يرفض — لا يخمّن. */

test('layout normalizer reads pixel boxes against declared page size',()=>{
  const raw={width:1000,height:1600,lines:[{line:2,words:[
    {surah:1,ayah:2,word:1,x:500,y:320,width:200,height:60},
    {surah:1,ayah:2,word:2,x:300,y:320,width:180,height:60}]}]};
  const layout=normalizeMushafLayout(raw,2);
  assert.ok(layout);assert.equal(layout!.scale,'DECLARED');
  assert.equal(layout!.words.length,2);
  const first=findLayoutWord(layout,1,2,0);
  assert.ok(first,'word numbering is rebased to zero to match the text split');
  assert.equal(first!.bbox.x,0.5);assert.equal(first!.bbox.width,0.2);
  assert.equal(first!.line,2);
});

test('layout normalizer accepts already-normalized and corner-style boxes',()=>{
  const raw=[{sura:2,aya:5,position:1,x1:0.1,y1:0.2,x2:0.3,y2:0.25}];
  const layout=normalizeMushafLayout(raw,3);
  assert.ok(layout);assert.equal(layout!.scale,'NORMALIZED');
  const w=findLayoutWord(layout,2,5,0);
  assert.ok(w);assert.ok(Math.abs(w!.bbox.width-0.2)<1e-9);
});

test('layout normalizer refuses shapes it cannot map, so the line lens stays',()=>{
  assert.equal(normalizeMushafLayout({nothing:'here'},1),null);
  assert.equal(normalizeMushafLayout([],1),null);
  // صناديق بلا هوية آية لا تُستعمل: عدسة على موضع مجهول أسوأ من لا عدسة.
  assert.equal(normalizeMushafLayout([{x:1,y:1,width:2,height:2}],1),null);
  assert.equal(normalizeMushafLayout({width:100,height:100,w:[{surah:1,ayah:1,word:1,x:0,y:0,width:0,height:5}]},1),null);
  assert.equal(normalizeMushafLayout({},700),null,'page outside the Mushaf is rejected');
});

test('layout normalizer drops words that fall outside the page',()=>{
  const raw={width:100,height:100,w:[
    {surah:1,ayah:1,word:1,x:10,y:10,width:20,height:10},
    {surah:1,ayah:1,word:2,x:90,y:10,width:40,height:10}]};
  const layout=normalizeMushafLayout(raw,1);
  assert.ok(layout);
  assert.equal(layout!.words.length,1,'the overflowing box is not trusted');
  assert.equal(findLayoutWord(layout,1,1,1),null);
});
