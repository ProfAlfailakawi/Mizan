import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {UNLOCK_GESTURE_MS,createVenueLock,isValidPin,isWeakPin,readVenueLock,unlockDelayMs,verifyVenuePin,writeVenueLock,clearVenueLock,VENUE_LOCK_STORAGE_KEY} from '../src/lib/venue-lock';

/*
 * شاشات القاعة تُترك على أجهزة في أماكن عامة، وكان الخروج منها زرًّا يضغطه أي مارّ.
 * هذه الاختبارات تحرس القفل: لا رمز مخزَّن نصًّا، ولا تخمين رخيص، ولا مخرج بلا رمز.
 */

test('a code must be digits of a sane length',()=>{
  assert.equal(isValidPin('4819'),true);
  assert.equal(isValidPin('123'),false,'too short');
  assert.equal(isValidPin('123456789'),false,'too long');
  assert.equal(isValidPin('48a9'),false,'digits only — the pad has no letters');
  assert.equal(isValidPin(''),false);
});

test('codes that a passer-by would try first are refused',()=>{
  for(const weak of ['0000','1111','1234','4321','2345','9876']) assert.equal(isWeakPin(weak),true,`${weak} must be refused`);
  assert.equal(isWeakPin('4819'),false);
  assert.equal(isWeakPin('7301'),false);
});

test('the code is never stored, only a salted digest of it',async()=>{
  const lock=await createVenueLock('4819','بوابة الحضور');
  /*
   * الخاصية المقصودة أن النص الصريح غير مستعاد من المخزون — لا أن سلسلة الأرقام غائبة عن
   * ستٍّ وتسعين خانة عشوائية. البحث عن «4819» داخل ملح وبصمة عشوائيين يفشل بالصدفة نحو مرة
   * في الألف، واختبارٌ أمنيّ يرتجف يُفقد الثقة في الحارس نفسه. فالفحص هنا حتميّ.
   */
  for(const [k,v] of Object.entries(lock)) assert.notEqual(v,'4819',`${k} must not hold the code itself`);
  assert.match(lock.pinHash,/^[0-9a-f]{64}$/);
  assert.match(lock.salt,/^[0-9a-f]{32}$/);
  assert.notEqual(lock.pinHash,lock.salt);
  assert.equal(lock.surface,'بوابة الحضور');
  // بصمة رمزٍ آخر بنفس الملح تختلف، فالبصمة تعتمد الرمز فعلًا ولا تكون قيمة ثابتة.
  const other=await createVenueLock('7301','بوابة الحضور');
  assert.notEqual(other.pinHash,lock.pinHash);
});

test('two devices locked with the same code do not share a digest',async()=>{
  const a=await createVenueLock('4819','بوابة الحضور');
  const b=await createVenueLock('4819','بوابة الحضور');
  assert.notEqual(a.salt,b.salt);
  assert.notEqual(a.pinHash,b.pinHash,'a shared digest would let one leak unlock the other');
});

test('only the right code opens the device',async()=>{
  const lock=await createVenueLock('4819','لوحة الانتظار');
  assert.equal(await verifyVenuePin(lock,'4819'),true);
  assert.equal(await verifyVenuePin(lock,'4818'),false);
  assert.equal(await verifyVenuePin(lock,'481'),false);
  assert.equal(await verifyVenuePin(lock,''),false);
});

test('repeated wrong attempts slow down, and the slowdown is bounded',()=>{
  assert.equal(unlockDelayMs(1),0,'a mistyped digit is not punished');
  assert.equal(unlockDelayMs(2),0);
  assert.ok(unlockDelayMs(3)>0,'guessing starts to cost');
  assert.ok(unlockDelayMs(6)>unlockDelayMs(4),'the cost grows');
  assert.equal(unlockDelayMs(30),120000,'but never locks a supervisor out for ever');
});

test('the hidden gesture is long enough not to be found by accident',()=>{
  assert.ok(UNLOCK_GESTURE_MS>=2000,'a brief touch would be discovered by any passer-by');
});

test('lock storage round-trips and rejects damaged records',()=>{
  const bag=new Map<string,string>();
  const storage={getItem:(k:string)=>bag.get(k)??null,setItem:(k:string,v:string)=>{bag.set(k,v)},removeItem:(k:string)=>{bag.delete(k)}};
  assert.equal(readVenueLock(storage),null);
  const lock={salt:'a'.repeat(32),pinHash:'b'.repeat(64),lockedAt:new Date().toISOString(),surface:'شاشة الحفل'};
  writeVenueLock(storage,lock);
  assert.deepEqual(readVenueLock(storage),lock);
  bag.set(VENUE_LOCK_STORAGE_KEY,'{not json');
  assert.equal(readVenueLock(storage),null,'a damaged record must not throw or half-lock the device');
  bag.set(VENUE_LOCK_STORAGE_KEY,JSON.stringify({surface:'x'}));
  assert.equal(readVenueLock(storage),null,'a record without a digest is not a lock');
  writeVenueLock(storage,lock); clearVenueLock(storage);
  assert.equal(readVenueLock(storage),null);
});

test('a locked venue screen is given no way out',()=>{
  // القفل يعمل بإلغاء onClose أصلًا، فلا زرّ ولا Escape ولا دور dialog — لا بحارسٍ فوق زرٍّ باقٍ.
  const app=fs.readFileSync('src/App.tsx','utf8');
  assert.match(app,/const exit=locked\?undefined:close\[active\]/,'the exit handler is withheld while locked');
  assert.match(app,/VenueUnlockGuard/,'the unlock guard is mounted for a locked surface');
  assert.match(app,/VenueLockButton/,'locking is offered while the surface is open');
});
