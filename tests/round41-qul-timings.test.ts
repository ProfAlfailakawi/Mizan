import test from 'node:test';
import assert from 'node:assert/strict';
// وحدة سكربت بصيغة mjs، تُستورد كما هي.
import {parseWordsColumn,detectIndexBase,convertQulTimings} from '../scripts/lib/qul-timings.mjs';

/*
 * قواعد QUL تحزم توقيت الكلمات في عمود نصّي واحد. والخطر الأول هنا **أساس الترقيم**: افتراضه
 * خطأً يزيح كل كلمة موضعًا، وهو انزياح لا يظهر في الأرقام ويظهر في التظليل — أي أسوأ أنواع
 * الخطأ: صامت في الفحص، مرئي للحَكَم.
 */

const layout=new Map<string,number>([['1:2',4],['1:3',2],['2:1',1]]);
const rows=(words:string,key='1:2')=>{const [s,a]=key.split(':');return [{sura:Number(s),ayah:Number(a),time:0,words}]};

test('the packed words column is read, and malformed entries are dropped not guessed',()=>{
  const w=parseWordsColumn('1:0:900,2:910:1800,bad,3::,4:1810:1700,5:2000:2500');
  assert.deepEqual(w.map(x=>x.index),[1,2,5],'reversed and unparsable entries are refused');
  assert.deepEqual(parseWordsColumn(''),[]);
  assert.deepEqual(parseWordsColumn(null as unknown as string),[]);
});

test('the index base is derived from the data, never assumed',()=>{
  assert.equal(detectIndexBase(rows('1:0:100,2:110:200')),1);
  assert.equal(detectIndexBase(rows('0:0:100,1:110:200')),0);
  // ترقيم يبدأ من غير الصفر والواحد شكلٌ مجهول: يُرفض ولا يُخمَّن.
  assert.equal(detectIndexBase(rows('7:0:100,8:110:200')),null);
});

test('one-based source is rebased to zero so it lines up with our word split',()=>{
  const out=convertQulTimings(rows('1:0:900,2:910:1800,3:1810:2700,4:2710:3600'),layout);
  assert.ok(out.ok);
  assert.equal(out.indexBase,1);
  assert.deepEqual(out.ayat['1:2'],[[0,1,0,900],[1,2,910,1800],[2,3,1810,2700],[3,4,2710,3600]]);
});

test('a zero-based source is left where it is',()=>{
  const out=convertQulTimings(rows('0:0:900,1:910:1800,2:1810:2700,3:2710:3600'),layout);
  assert.ok(out.ok);
  assert.equal(out.indexBase,0);
  assert.equal(out.ayat['1:2'][0][0],0);
  assert.equal(out.ayat['1:2'][3][1],4);
});

test('an ayah whose word count disagrees with the Mushaf is excluded by name',()=>{
  // 1:2 عندنا أربع كلمات؛ مصدرٌ يعطي ثلاثًا يقطّع النصّ تقطيعًا آخر.
  const out=convertQulTimings(rows('1:0:900,2:910:1800,3:1810:2700'),layout);
  assert.equal(out.ok,false);
  assert.equal((out as {code:string}).code,'NO_AYAT_AGREED');

  const mixed=convertQulTimings([
    ...rows('1:0:900,2:910:1800,3:1810:2700,4:2710:3600','1:2'),
    ...rows('1:0:500,2:510:900,3:910:1200','1:3'),
  ],layout);
  assert.ok(mixed.ok);
  assert.deepEqual(Object.keys(mixed.ayat),['1:2']);
  assert.deepEqual(mixed.mismatchedAyat,['1:3'],'the disagreeing ayah is named, not silently trimmed');
});

test('an ayah-only database is refused with a reason a person can act on',()=>{
  const out=convertQulTimings([{sura:1,ayah:2,time:5000,words:''}],layout);
  assert.equal(out.ok,false);
  assert.equal((out as {code:string}).code,'NO_WORD_TIMINGS');
  assert.match((out as {message:string}).message,/ayah timings only/);
});

test('overlapping words inside one ayah drop that ayah rather than mistiming it',()=>{
  const out=convertQulTimings([
    ...rows('1:0:2000,2:1000:2500,3:2600:3000,4:3100:3600','1:2'),
    ...rows('1:0:500,2:510:900','1:3'),
  ],layout);
  assert.ok(out.ok);
  assert.deepEqual(Object.keys(out.ayat),['1:3']);
  assert.equal(out.dropped,1);
});
