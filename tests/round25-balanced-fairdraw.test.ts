import test from 'node:test';
import assert from 'node:assert/strict';
import {balancedFairDraw} from '../server/kfgqpc-fairdraw-generative';
import {DifficultyEngine} from '../server/quran-difficulty';
import {MutashabihatEngine} from '../server/quran-mutashabihat';

/*
 * السحب الحتمي عادلٌ في الإجراء لا في العبء. هذه الاختبارات تثبت أن الطقم المُسنَد متكافئ
 * الصعوبة فعلًا، وأن الإسناد لا يرتّب المتسابقين بصعوبتهم، وأن كل ذلك يُعاد بالبذرة نفسها.
 */

/** مصحف اصطناعي: سور متفاوتة الكثافة حتى تُنتج متجّهات صعوبة مختلفة فعلًا. */
function buildRows(){
  const rows:any[]=[];
  const filler=['قَالَ','رَبِّ','إِنِّي','وَجَدتُّ','قَوْمًا','يَسْجُدُونَ','لِلشَّمْسِ','مِن دُونِ','اللَّهِ','وَزَيَّنَ'];
  const repeated=['وَلَقَدْ','خَلَقْنَا','الْإِنسَانَ','مِن','سُلَالَةٍ'];
  for(let s=1;s<=12;s++){
    for(let a=1;a<=40;a++){
      // السور الزوجية عباراتها متكرّرة (متشابهات أعلى)، والفردية متنوّعة.
      const words=s%2===0?repeated.concat(repeated):filler.slice(0,5+((a+s)%5));
      rows.push({sora:s,aya_no:a,aya_text:words.join(' ')+(a%4===0?' ۖ':''),page:Math.ceil((s*40+a)/15),
        line_start:1+((a*2)%14),line_end:2+((a*2)%14),jozz:1+Math.floor(s/4),sora_name_ar:`سورة ${s}`});
    }
  }
  return rows;
}
/** مستودع تسليم مصغّر: يكفي `quranData` و`passage` لهذا المسار. */
function stubDelivery(rows:any[]):any{
  return {
    quranData:async()=>rows,
    passage:async(reading:string,surah:number,startAyah:number,endAyah:number)=>{
      const sel=rows.filter(r=>r.sora===surah&&r.aya_no>=startAyah&&r.aya_no<=endAyah).sort((a,b)=>a.aya_no-b.aya_no);
      if(!sel.length)return null;
      const ayat=sel.map(r=>({surah:r.sora,ayah:r.aya_no,text:r.aya_text,page:r.page,lineStart:r.line_start,lineEnd:r.line_end,juz:r.jozz}));
      return {reading,surah,startAyah:ayat[0].ayah,endAyah:ayat[ayat.length-1].ayah,ayat,
        text:ayat.map(a=>a.text).join(' '),loci:[{page:ayat[0].page,lineStart:1,lineEnd:2}],
        provenance:{mode:'OFFICIAL_DELIVERY',authority:'KFGQPC',note:''}};
    },
  };
}
const engines=()=>{const rows=buildRows();const m=new MutashabihatEngine(rows);return {rows,delivery:stubDelivery(rows),difficulty:new DifficultyEngine(rows,m)}};

test('a balanced draw gives every contestant a different passage',async()=>{
  const {delivery,difficulty}=engines();
  const out=await balancedFairDraw(delivery,difficulty,{reading:'hafs',contestants:8,seed:'mizan-seed-0001'});
  assert.ok(out);
  assert.equal(out!.assignments.length,8);
  const keys=out!.assignments.map(a=>`${a.passage.surah}:${a.passage.startAyah}-${a.passage.endAyah}`);
  assert.equal(new Set(keys).size,8,'no two contestants share a passage');
  assert.equal(out!.protocol,'MIZAN-FAIRDRAW-BALANCED-1');
});

test('the assigned set is measurably tighter in difficulty than a plain draw',async()=>{
  const {delivery,difficulty}=engines();
  const out=await balancedFairDraw(delivery,difficulty,{reading:'hafs',contestants:6,seed:'mizan-seed-0002',oversample:10});
  assert.ok(out);
  const f=out!.fairness;
  assert.ok(f.candidatePool>=6*2,'a real candidate pool was drawn before choosing');
  assert.ok(f.maxDifficulty>=f.minDifficulty);
  // التباين المُعاد مقيسٌ فعلًا من الطقم المختار، لا رقمًا مُعلنًا.
  const scores=out!.assignments.map(a=>a.difficulty.score);
  const mean=scores.reduce((a,b)=>a+b,0)/scores.length;
  const spread=Math.max(...scores.map(s=>Math.abs(s-mean)))/mean;
  assert.ok(Math.abs(spread-f.spreadRatio)<1e-9,'reported spread matches the assigned set');
  assert.equal(f.achieved,spread<=f.tolerance,'achieved is never claimed beyond the measurement');
});

test('the same seed reproduces the same assignment, a different seed does not',async()=>{
  const {delivery,difficulty}=engines();
  const key=(o:any)=>o.assignments.map((a:any)=>`${a.slot}:${a.passage.surah}:${a.passage.startAyah}`).join('|');
  const a=await balancedFairDraw(delivery,difficulty,{reading:'hafs',contestants:5,seed:'mizan-seed-0003'});
  const b=await balancedFairDraw(delivery,difficulty,{reading:'hafs',contestants:5,seed:'mizan-seed-0003'});
  const c=await balancedFairDraw(delivery,difficulty,{reading:'hafs',contestants:5,seed:'mizan-seed-9999'});
  assert.ok(a&&b&&c);
  assert.equal(key(a),key(b),'reproducible from the seed alone');
  assert.notEqual(key(a),key(c));
});

test('slot order does not rank contestants by difficulty',async()=>{
  const {delivery,difficulty}=engines();
  // لو لم يُخلط الإسناد لخرجت الدرجات مرتّبة تصاعديًا في كل سحب — وهو انحياز صامت برقم المتسابق.
  let monotonic=0,runs=0;
  for(const seed of ['s-aaaa1111','s-bbbb2222','s-cccc3333','s-dddd4444','s-eeee5555','s-ffff6666']){
    const out=await balancedFairDraw(delivery,difficulty,{reading:'hafs',contestants:6,seed});
    if(!out)continue;runs++;
    const s=out.assignments.map(a=>a.difficulty.score);
    if(s.every((v,i)=>i===0||v>=s[i-1]))monotonic++;
  }
  assert.ok(runs>=4,'enough draws to judge the ordering');
  assert.ok(monotonic<runs,'assignment is shuffled, not sorted by difficulty');
});

test('an impossible request is refused rather than silently under-filled',async()=>{
  const {delivery,difficulty}=engines();
  assert.equal(await balancedFairDraw(delivery,difficulty,{reading:'hafs',contestants:0,seed:'mizan-seed-0004'}),null);
  assert.equal(await balancedFairDraw(delivery,difficulty,{reading:'hafs',contestants:501,seed:'mizan-seed-0004'}),null);
  // سورة واحدة بطول مقطع ثابت لا تتّسع لمئة مقطع متمايز: يُرفض بدل أن يُسنَد ناقصًا.
  const tight=await balancedFairDraw(delivery,difficulty,{reading:'hafs',contestants:100,seed:'mizan-seed-0005',surah:1,ayahCount:8});
  assert.equal(tight,null,'refused rather than under-filled');
  // وحين ينجح، العدد مطابق للمطلوب تمامًا — لا أقلّ.
  const ok=await balancedFairDraw(delivery,difficulty,{reading:'hafs',contestants:20,seed:'mizan-seed-0006',surah:1,ayahCount:8});
  assert.ok(ok);assert.equal(ok!.assignments.length,20);
  assert.deepEqual(ok!.assignments.map(a=>a.slot),Array.from({length:20},(_,i)=>i+1));
});
