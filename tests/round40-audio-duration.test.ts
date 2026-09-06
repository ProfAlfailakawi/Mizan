import test from 'node:test';
import assert from 'node:assert/strict';
// وحدة سكربت بصيغة mjs، تُستورد كما هي.
import {mp3DurationMs,buildFrameHeader} from '../scripts/lib/audio-duration.mjs';

/*
 * قراءة المدّة ليست ترفًا: هي الفحص الذي يكشف أن المقاطع تخصّ **تسجيلًا آخر** لنفس القارئ،
 * حيث تبدو الفهارس سليمة والتظليل ينزاح بصمت. فخطأ هنا يُبطل الحارس كلّه.
 *
 * الإطارات هنا مبنيّة بالبتّات لا منسوخة من ملف، فالمدّة المتوقّعة محسوبة يدويًا لا مرصودة.
 */

/** ملف بمعدّل ثابت: إطارات متتابعة بنفس الترويسة. */
const cbr=(opts:{bitrateIndex:number;rateIndex?:number;frames:number;id3?:number})=>{
  const head=buildFrameHeader({bitrateIndex:opts.bitrateIndex,rateIndex:opts.rateIndex??0}) as Buffer;
  const bitrates=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
  const rates=[44100,48000,32000];
  const bitrate=bitrates[opts.bitrateIndex]*1000,sampleRate=rates[opts.rateIndex??0];
  const frameLength=Math.floor((1152/8)*bitrate/sampleRate);
  const parts:Buffer[]=[];
  if(opts.id3){const tag=Buffer.alloc(opts.id3);tag.write('ID3','latin1');
    const size=opts.id3-10;tag[6]=(size>>21)&0x7f;tag[7]=(size>>14)&0x7f;tag[8]=(size>>7)&0x7f;tag[9]=size&0x7f;parts.push(tag)}
  for(let i=0;i<opts.frames;i++){const f=Buffer.alloc(frameLength);head.copy(f,0);parts.push(f)}
  return {buf:Buffer.concat(parts),bitrate,frameLength};
};

test('a constant-bitrate file yields the duration its size implies',()=>{
  // 128 kbps, 44.1 kHz, 100 إطار. كل إطار 1152 عيّنة ⇒ 115200/44100 ثانية ≈ 2612 مللي.
  const {buf,bitrate,frameLength}=cbr({bitrateIndex:9,frames:100});
  const expected=Math.round((frameLength*100*8*1000)/bitrate);
  const got=mp3DurationMs(buf);
  assert.ok(got!==null);
  assert.ok(Math.abs(got-expected)<=2,`${got} vs ${expected}`);
  // والقيمة قريبة من الحساب بالعيّنات، وهو تحقّق مستقل عن حساب الحجم.
  assert.ok(Math.abs(got-Math.round(100*1152*1000/44100))<50);
});

test('an ID3 tag before the audio does not inflate the duration',()=>{
  const plain=mp3DurationMs(cbr({bitrateIndex:9,frames:80}).buf);
  const tagged=mp3DurationMs(cbr({bitrateIndex:9,frames:80,id3:4096}).buf);
  assert.ok(plain!==null&&tagged!==null);
  assert.ok(Math.abs(plain-tagged)<=2,'the tag is skipped, not counted as audio');
});

test('bitrate and sample rate are read, not assumed',()=>{
  // نفس عدد الإطارات بمعدّل بتّ مختلف ⇒ نفس المدّة تقريبًا (المدّة تتبع العيّنات لا البايتات).
  const a=mp3DurationMs(cbr({bitrateIndex:9,frames:120}).buf);
  const b=mp3DurationMs(cbr({bitrateIndex:14,frames:120}).buf);
  assert.ok(a!==null&&b!==null);
  assert.ok(Math.abs(a-b)<60,`${a} vs ${b} — frame count governs duration`);
  // ومعدّل عيّنات مختلف يغيّر المدّة فعلًا: 32 kHz أبطأ استهلاكًا للعيّنات.
  const slow=mp3DurationMs(cbr({bitrateIndex:9,rateIndex:2,frames:120}).buf);
  assert.ok(slow!==null&&slow>a,'32 kHz stretches the same frame count');
});

test('a Xing frame count is preferred over the size estimate',()=>{
  const {buf,frameLength}=cbr({bitrateIndex:9,frames:50});
  // تُزرع ترويسة Xing تعلن 500 إطار في ملف حجمه 50 — فالمعلن هو ما يُصدَّق.
  const sideInfo=17; // MPEG1 mono
  const at=4+sideInfo;
  buf.write('Xing',at,'latin1');
  buf.writeUInt32BE(1,at+4);        // راية: يحمل عدد الإطارات
  buf.writeUInt32BE(500,at+8);
  const got=mp3DurationMs(buf);
  assert.ok(got!==null);
  assert.equal(got,Math.round(500*1152*1000/44100));
  assert.ok(got>Math.round(50*frameLength*8*1000/128000),'the declared count wins over file size');
});

test('anything that is not a recognisable MP3 returns null rather than a guess',()=>{
  // مدّةٌ مخمَّنة تُفسد الفحص الذي وُجدت من أجله، فالامتناع هو الصواب.
  assert.equal(mp3DurationMs(Buffer.alloc(0)),null);
  assert.equal(mp3DurationMs(Buffer.from('this is plainly not audio at all')),null);
  assert.equal(mp3DurationMs(Buffer.alloc(9000)),null,'silence of zero bytes is not a frame');
  assert.equal(mp3DurationMs(null as unknown as Buffer),null);
  // ترويسة واحدة بلا تاليةٍ تؤكّدها: تطابق عابر لا يُبنى عليه.
  const lone=Buffer.concat([Buffer.alloc(64),buildFrameHeader({bitrateIndex:9}) as Buffer,Buffer.alloc(8)]);
  assert.equal(mp3DurationMs(lone),null);
});
