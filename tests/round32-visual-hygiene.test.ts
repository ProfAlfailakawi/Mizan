import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * ما رُئي بالعين يُثبَّت هنا حتى لا يعود.
 *
 * هذه الاختبارات وُلدت من فحص الشاشات الأربعين (حاسوب وجوال) في متصفّح حقيقي: أرقام مقلوبة
 * بالاتجاه، ورموز إنجليزية خام في واجهة عربية، وشاشات صامتة بلا إرشاد.
 */

const walk=(d:string,out:string[]=[]):string[]=>{for(const n of fs.readdirSync(d)){const p=path.join(d,n);fs.statSync(p).isDirectory()?walk(p,out):p.endsWith('.tsx')&&out.push(p)}return out};
const screens=walk('src/components');
const read=(p:string)=>fs.readFileSync(p,'utf8');

test('no ratio is left for the bidi algorithm to reverse',()=>{
  // «0 / 1» داخل فقرة عربية تظهر «1 / 0»، فيقرأ الحَكَم موافقةً حيث لا موافقة.
  const offenders:string[]=[];
  for(const f of screens){
    const s=read(f);
    if(f.endsWith('Ratio.tsx'))continue;
    for(const m of s.matchAll(/\}\s*\/\s*\{/g)){
      const around=s.slice(Math.max(0,m.index!-260),m.index!+60);
      if(!/dir="ltr"/.test(around))offenders.push(`${path.basename(f)} @${m.index}`);
    }
  }
  assert.deepEqual(offenders,[],'wrap the ratio in <Ratio/> or an explicit dir="ltr"');
});

test('operational codes are not printed raw into the Arabic surface',()=>{
  // الرمز يبقى في البيانات؛ والعرض بالعربية عبر uiToken / auditActionLabel / roleLabel.
  const raw=/\{(?:log|selected|x|e|ev)\.(?:action|actorRole)\}|\{competition\.(?:status|automationLevel)\}/;
  const offenders=screens.filter(f=>raw.test(read(f))).map(f=>path.basename(f));
  assert.deepEqual(offenders,[],'render these through a label helper');
});

test('the head judge screen keeps its sections behind tabs',()=>{
  // كانت أربعة أقسام وخمسة رسوم مكدّسة قبل أن يصل رئيس التحكيم إلى عمله (1925px/2807px).
  const s=read('src/components/head-judge/HeadJudgeInbox.tsx');
  assert.match(s,/type Tab='reviews'\|'appeals'\|'panel'\|'seal'/,'all four areas are tabbed');
  for(const t of ["tab==='panel'","tab==='seal'","tab==='reviews'","tab==='appeals'"])
    assert.ok(s.includes(t),`${t} must gate its section`);
});

test('a shared empty state exists and says what to do next',()=>{
  const p='src/components/design-system/EmptyState.tsx';
  assert.ok(fs.existsSync(p),'the shared empty state exists');
  const s=read(p);
  assert.match(s,/hint\?:\s*string/,'an empty screen explains itself rather than going silent');
  assert.match(s,/action\?:/,'and offers the next step when there is one');
});

test('the numeric keypad stays left-to-right',()=>{
  // لوحة الأرقام المقلوبة تجعل المشرف يخطئ رمزًا يحفظه إصبعه.
  const s=read('src/components/design-system/VenueLockControl.tsx');
  const pad=s.slice(s.indexOf('const PinPad'),s.indexOf('const PinPad')+700);
  assert.match(pad,/dir="ltr"/,'a phone keypad reads 1-2-3 from the left in every locale');
});

test('venue screens can be locked, and a locked one exposes no exit',()=>{
  const app=read('src/App.tsx');
  assert.match(app,/const exit=locked\?undefined:close\[active\]/);
  for(const surface of ['KioskMode','WaitingBoard','HallRecitationMap','BroadcastStage','CeremonyView'])
    assert.ok(app.includes(`<${surface} onClose={exit}/>`),`${surface} must take its exit from the lock`);
});
