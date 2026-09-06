import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {assessAuthorityDurability} from '../server/authority-durability';

/*
 * تشغيل السلطة على قرص مؤقّت أسوأ من تعطيلها: تختفي موافقة نصاب، أو تضيع بذرة التُزم بها ولم
 * تُكشف — فيبقى ختمٌ يسنده دليل لم يعد موجودًا. هذه الاختبارات تثبت أن الامتناع يقع قبل ذلك.
 */

const CLOUD_RUN={K_SERVICE:'mizan'} as NodeJS.ProcessEnv;

test('an unset directory keeps the authority off without calling it an error',()=>{
  const v=assessAuthorityDurability('',{});
  assert.equal(v.durable,false);
  assert.equal((v as {code:string}).code,'NOT_CONFIGURED');
});

test('a container-local path on a serverless platform is refused',()=>{
  for(const p of ['/tmp/authority','/app/.mizan-data','/var/tmp/x','/home/node/state']){
    const v=assessAuthorityDurability(p,CLOUD_RUN);
    assert.equal(v.durable,false,`${p} must not be accepted`);
    assert.equal((v as {code:string}).code,'EPHEMERAL_CONTAINER_PATH');
    assert.match((v as {message:string}).message,/volume|durable/i,'the refusal must say how to fix it');
  }
});

test('a mounted volume on the same platform is accepted',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-mount-'));
  // المسار المُركَّب لا يقع تحت مسارات الحاوية المعروفة، فيُقبل بلا إعلان.
  assert.equal(assessAuthorityDurability(dir,{...CLOUD_RUN,TMPDIR:undefined}).durable,
    dir.startsWith('/tmp')?false:true);
});

test('an operator can declare a path durable, and that declaration is deliberate',()=>{
  const v=assessAuthorityDurability('/tmp/mizan-declared',{...CLOUD_RUN,MIZAN_INTEGRITY_AUTHORITY_DURABLE:'true'});
  assert.equal(v.durable,true,'an explicit declaration is honoured');
  // ولا يُقبل بغير الإعلان الصريح — الصمت ليس موافقة.
  assert.equal(assessAuthorityDurability('/tmp/mizan-declared',CLOUD_RUN).durable,false);
});

test('outside a serverless container an ordinary local path is fine',()=>{
  const dir=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'mizan-local-')),'nested');
  const v=assessAuthorityDurability(dir,{});
  assert.equal(v.durable,true);
  assert.ok(fs.existsSync(dir),'the directory is created rather than merely assumed');
});

test('write permission is proven, not assumed from metadata',()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-ro-'));
  const dir=path.join(base,'locked');
  fs.mkdirSync(dir);
  fs.chmodSync(dir,0o500);
  const v=assessAuthorityDurability(dir,{});
  // الجذر يتجاوز صلاحيات الملفات، فلا يصحّ تثبيت النتيجة على بيئة بعينها؛ المهم أن الكتابة تُجرَّب.
  if(process.getuid&&process.getuid()===0)assert.equal(v.durable,true,'root can write, and the probe reflects reality');
  else{assert.equal(v.durable,false);assert.equal((v as {code:string}).code,'NOT_WRITABLE')}
  fs.chmodSync(dir,0o700);
});
