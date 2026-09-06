import test from 'node:test';
import assert from 'node:assert/strict';
import {measuredWordTimings,proportionalWordTimings,splitAyahWords,wordAtTime,type MeasuredSegment} from '../src/lib/word-timing';

/*
 * توقيت مقيس بدل مقدَّر — بشرط أن يُثبت أنه لهذه الآية ولهذا التسجيل.
 *
 * الخطر هنا ليس غياب البيانات بل **حضورها في غير موضعها**: مقاطع قارئ رُكّبت على تسجيل آخر
 * تُنتج تظليلًا واثقًا يمشي متأخّرًا عن الصوت، فيُصدّقه الحَكَم لأنه لا يبدو تقديرًا. لذلك كل
 * اختبار هنا يسأل: متى **يرفض** النظام القياس ويعود إلى التقدير الموسوم؟
 */

const TEXT='الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ';
const N=splitAyahWords(TEXT).length;
const GOOD:MeasuredSegment[]=[[0,1,0,1000],[1,2,1010,2000],[2,3,2010,2900],[3,4,2910,8000]];

test('real segments produce measured timings, marked as measured',()=>{
  assert.equal(N,4);
  const {model,rejected}=measuredWordTimings(TEXT,8000,GOOD);
  assert.equal(rejected,undefined);
  assert.equal(model.assurance,'MEASURED_ALIGNED');
  assert.equal(model.words.length,4);
  assert.deepEqual(model.words.map(w=>w.startMs),[0,1010,2010,2910]);
  // الفجوات بين المقاطع محفوظة كما قيست، لا تُمَطّ لتلامس بعضها.
  assert.equal(model.words[0].endMs,1000);
  assert.equal(wordAtTime(model,2500),2);
  assert.equal(wordAtTime(model,1005),-1,'a measured gap belongs to no word');
});

test('a word count that disagrees with the text is refused, not silently reindexed',()=>{
  // هذه حال 12:1 و15:1 و37:130 حقيقةً: تقطيع المقطّعات يختلف بين مصحف ومصدر المحاذاة.
  const {model,rejected}=measuredWordTimings(TEXT,8000,[[0,1,0,1000],[1,5,1010,8000]]);
  assert.equal(rejected,'WORD_COUNT_MISMATCH');
  assert.equal(model.assurance,'ESTIMATED_PROPORTIONAL');
});

test('segments belonging to a different recording are caught by the duration check',()=>{
  // نفس القارئ، نسخة أخرى: الفهارس تبدو سليمة والتظليل ينزاح. المدّة وحدها تكشفه.
  const {rejected}=measuredWordTimings(TEXT,14000,GOOD);
  assert.equal(rejected,'DURATION_MISMATCH');
  assert.equal(measuredWordTimings(TEXT,8300,GOOD).rejected,undefined,'a small honest difference still passes');
});

test('overlapping or reversed segments are refused',()=>{
  assert.equal(measuredWordTimings(TEXT,8000,[[0,1,0,3000],[1,2,2000,4000],[2,4,4010,8000]]).rejected,'NON_MONOTONIC');
  assert.equal(measuredWordTimings(TEXT,8000,[[0,1,1000,500],[1,4,1010,8000]]).rejected,'NON_MONOTONIC');
  // مقطع نهايته قبل بدايته في ترتيب الكلمات؛ يُبنى بحيث يجتاز فحص العدد ليصل إلى فحص الترتيب.
  assert.equal(measuredWordTimings(TEXT,8000,[[2,1,0,4000],[0,4,4010,8000]]).rejected,'NON_MONOTONIC');
});

test('a segment covering several words gives them the measured span, and highlights from its start',()=>{
  // دقّة الملف هي المقطع؛ توزيعه على كلمتيه داخليًا تخمين لا يسنده شيء.
  const {model,rejected}=measuredWordTimings(TEXT,8000,[[0,2,0,4000],[2,4,4010,8000]]);
  assert.equal(rejected,undefined);
  assert.equal(model.words.length,4);
  assert.deepEqual(model.words.map(w=>w.startMs),[0,0,4010,4010]);
  assert.equal(wordAtTime(model,2000),0,'the pair highlights from the first of the two');
});

test('missing segments or an unknown duration fall back to the marked estimate',()=>{
  for(const [dur,segs,code] of [[8000,undefined,'NO_SEGMENTS'],[8000,[],'NO_SEGMENTS'],[0,GOOD,'NO_DURATION'],[NaN,GOOD,'NO_DURATION']] as const){
    const {model,rejected}=measuredWordTimings(TEXT,dur as number,segs as MeasuredSegment[]|undefined);
    assert.equal(rejected,code);
    assert.equal(model.assurance,'ESTIMATED_PROPORTIONAL');
  }
});

test('the fallback is the same estimate as before, so refusing costs nothing',()=>{
  const direct=proportionalWordTimings(TEXT,8000);
  const {model}=measuredWordTimings(TEXT,8000,[[0,9,0,8000]]);
  assert.deepEqual(model.words.map(w=>[w.startMs,w.endMs]),direct.words.map(w=>[w.startMs,w.endMs]));
});

/*
 * المخزن الخادمي. الخطر الذي يحرسه: ربط توقيت بتسجيل ليس له. ولذلك الفهرسة بمعرّف التسجيل
 * لا باسم القارئ، والربط بيان يكتبه المشغّل لا استنتاج من تشابه الأسماء.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WordTimingStore} from '../server/word-timing-store';

const store=(manifest:Record<string,string>|null,files:Record<string,unknown>={})=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-wt-'));
  if(manifest)fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));
  for(const [name,body] of Object.entries(files))fs.writeFileSync(path.join(dir,name),JSON.stringify(body));
  return new WordTimingStore(dir);
};
const SET={reciter:'Husary_64kbps',assurance:'MEASURED_ALIGNED',ayat:{'1:2':[[0,1,0,900],[1,2,910,2000]]}};

test('a recording listed in the manifest gets its measured segments',()=>{
  const s=store({'hafs-husary':'Husary_64kbps.json'},{'Husary_64kbps.json':SET});
  const hit=s.segments('hafs-husary',1,2);
  assert.ok(hit);
  assert.deepEqual(hit!.segments,[[0,1,0,900],[1,2,910,2000]]);
  assert.equal(hit!.meta.assurance,'MEASURED_ALIGNED');
  assert.equal((hit!.meta as unknown as Record<string,unknown>).ayat,undefined,'the whole book is not shipped to answer for one ayah');
});

test('a recording with no registered timings gets nothing, which is the normal case',()=>{
  const s=store({'hafs-husary':'Husary_64kbps.json'},{'Husary_64kbps.json':SET});
  // نفس القارئ لا يكفي: تسجيل آخر توقيتُه آخر.
  assert.equal(s.segments('hafs-muaiqly',1,2),null);
  assert.equal(s.segments('hafs-husary',2,255),null,'an ayah outside the set is absent, not fabricated');
  assert.deepEqual(s.recordings(),['hafs-husary']);
});

test('no manifest means an empty store rather than a broken server',()=>{
  const s=store(null);
  assert.deepEqual(s.recordings(),[]);
  assert.equal(s.segments('anything',1,1),null);
});

test('a manifest entry cannot reach outside the timings directory',()=>{
  const s=store({evil:'../../../etc/passwd'});
  assert.equal(s.segments('evil',1,1),null);
});
