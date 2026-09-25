import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

import {
  attemptFrom, faceNote, faceSupportsListening, faceSurahSegments, listenableFaces, loadFaceAttempts, rememberFaceAttempt, segmentAt,
  forgetFaceAttempts, MAX_REMEMBERED_ATTEMPTS, serialQueue, DRAIN_DEADLINE_MS, reviewNote,
} from '../src/lib/face-review';
import { accumulateWordSignals } from '../server/alignment/word-signals';
import { readRecitation, settleRecitation, stepsFromSamples, type FaceWordKey } from '../src/lib/face-session';
import { faceWeights } from '../src/lib/face-memory';

/*
 * قراراتُ الشاشة التي لا تُرى في التصيير: أيُّ وجهٍ يصحّ الاستماعُ إليه، وأيُّ محاولةٍ
 * تدخل الذاكرة، وبأيّ لغةٍ يُقال التعذّر.
 */

const face = (page: number, surahStart: number, surahEnd = surahStart) => ({
  page, surahStart, ayahStart: 1, surahEnd, ayahEnd: 5, ayahCount: 5,
});

test('الوجهُ العابرُ سورتين يُستمع إليه — وكان ٥٤ صفحةً بلا ميكروفون، منها ١٩ من جزء عمّ', () => {
  const faces = [face(1, 2), face(2, 2, 3), face(3, 3)];
  assert.deepEqual(listenableFaces(faces, { reading: 'hafs' }).map(f => f.page), [1, 2, 3]);
  assert.deepEqual(listenableFaces(faces, null).map(f => f.page), [1, 2, 3]);
  assert.equal(faceSupportsListening(face(2, 2, 3)), true, 'العابرُ لا يُفتح له ميكروفون');
  assert.equal(faceSupportsListening(face(3, 5)), true);
  assert.equal(faceSupportsListening(null), false);
  assert.equal(faceSupportsListening(undefined), false);
});

test('والموضعُ التقريبيُّ يُطلب لقطعة السورة التي يقرأ فيها الطالب — ولسورةٍ واحدةٍ دائمًا', () => {
  /* الوجه ٥٣١: خاتمةُ القمر (٥٠–٥٥) ثمّ فاتحةُ الرحمن (١–١٨). */
  const words = [
    ...Array.from({ length: 6 }, (_, i) => ({ index: i, surah: 54, ayah: 50 + i })),
    ...Array.from({ length: 18 }, (_, i) => ({ index: 6 + i, surah: 55, ayah: 1 + i })),
  ];
  const segments = faceSurahSegments(words);
  assert.deepEqual(segments, [
    { surah: 54, startAyah: 50, endAyah: 55, firstIndex: 0, lastIndex: 5 },
    { surah: 55, startAyah: 1, endAyah: 18, firstIndex: 6, lastIndex: 23 },
  ]);
  assert.equal(segmentAt(segments, 0)!.surah, 54);
  assert.equal(segmentAt(segments, 5)!.surah, 54);
  assert.equal(segmentAt(segments, 6)!.surah, 55, 'أوّلُ كلمةٍ في الرحمن');
  assert.equal(segmentAt(segments, 99)!.surah, 55, 'بعد آخر الوجه: القطعةُ الأخيرة');
  assert.equal(segmentAt([], 0), null);
  const screen = fs.readFileSync('src/components/participant/MushafListens.tsx', 'utf8');
  assert.match(screen, /surah: part\.surah, startAyah: part\.startAyah, endAyah: part\.endAyah,/, 'الطلبُ لا يحمل مدى الوجه العابر كلَّه');
  assert.match(screen, /if \(alignSurah\.current !== part\.surah\) \{ alignSurah\.current = part\.surah; lastGlobal\.current = -1; \}/, 'المرساةُ لا تعبر إلى سورةٍ أخرى');
});

test('محاولةٌ لم يُسمع فيها شيءٌ لا تدخل الذاكرة', () => {
  /*
   * ولو حُفظت لرجّحت وجهًا بلا سبب: يعود الطالبُ إلى موضعٍ لم يتعثّر فيه قطّ، وإنما
   * فشل ميكروفونُه أو لم تُهيَّأ الخدمة.
   */
  const marks = [{ kind: 'repeat' as const, intensity: 1 }];
  assert.equal(attemptFrom(300, marks, 0), null, 'حُفظت محاولةٌ بلا سماع');
  assert.equal(attemptFrom(300, marks, -1), null);
  assert.equal(attemptFrom(300, marks, 1.5), null);
  const kept = attemptFrom(300, marks, 4, new Date('2026-09-20T10:00:00.000Z'));
  assert.ok(kept, 'أُسقطت محاولةٌ سُمعت');
  assert.equal(kept!.page, 300);
  assert.equal(kept!.at, '2026-09-20T10:00:00.000Z');
  assert.deepEqual(kept!.marks, marks);

  /* وأثرُها يظهر في الترجيح: الوجهُ المتعثَّرُ فيه أثقلُ من وجهٍ لم يُقرأ. */
  const weigh = faceWeights([kept!], Date.parse('2026-09-27T10:00:00.000Z'));
  assert.ok(weigh(300) > weigh(301), 'الوجهُ المتعثَّرُ فيه لم يثقل');
});

test('وجهٌ نظيفٌ يُحفظ أيضًا — فالنظافةُ خبرٌ كالتعثّر', () => {
  /* وبها يُعرف أنّه رُوجع، فلا يُعاد فورًا ولو لم يتعثّر فيه. */
  const clean = attemptFrom(120, [], 9);
  assert.ok(clean, 'أُسقطت محاولةٌ نظيفة');
  assert.deepEqual(clean!.marks, []);
  const now = Date.now();
  const weigh = faceWeights([{ ...clean!, at: new Date(now - 60_000).toISOString() }], now);
  assert.ok(weigh(120) < weigh(121), 'وجهٌ رُوجع للتوّ لم يُهدَّأ');
});

test('التعذّرُ يُقال بلغة الطالب — ولا يُعرض رمزٌ داخليّ في وجهه', () => {
  const codes = [
    'PRACTICE_FACE_READING_UNKNOWN', 'PRACTICE_FACE_NOT_WHOLE', 'PRACTICE_FACE_NOT_IN_PACKAGE',
    'QURAN_INTELLIGENCE_NOT_CONFIGURED', 'QURAN_ALIGNMENT_BACKEND_HTTP_502',
    'QURAN_ALIGNMENT_BENCHMARK_NOT_APPROVED', 'IDENTITY_REQUIRED', 'HTTP_403', 'SOMETHING_ELSE', '',
  ];
  for (const code of codes) {
    for (const ar of [true, false]) {
      const note = faceNote(code, ar);
      assert.ok(note.length > 10, `«${code}» بلا بيان`);
      assert.equal(/[A-Z]{3,}_[A-Z]/.test(note), false, `رمزٌ داخليّ تسرّب في «${code}»: ${note}`);
      /* ولا يُقال للطالب إنّه أخطأ حين يكون العطلُ في الخدمة. */
      for (const verdict of ['خطأ', 'أخطأ', 'ضعيف', 'راسب']) {
        assert.equal(note.includes(verdict), false, `بيانُ «${code}» حكمٌ على الطالب`);
      }
    }
  }
  /* وكلُّ سببٍ يُميَّز عن غيره: بيانٌ واحدٌ للجميع لا يدلّ على شيء. */
  const distinct = new Set(codes.slice(0, 7).map(c => faceNote(c, true)));
  assert.ok(distinct.size >= 5, `بياناتٌ متمايزة: ${distinct.size}`);
});

/* ── ذاكرةُ المحاولات على الجهاز ───────────────────────────────────────── */

/* مخزنٌ في الذاكرة يقوم مقام مخزن المتصفّح — والمنطقُ هو هو. */
function stubStorage(): Map<string, string> {
  const box = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (box.has(k) ? box.get(k)! : null),
      setItem: (k: string, v: string) => { box.set(k, v); },
      removeItem: (k: string) => { box.delete(k); },
    },
  };
  return box;
}

test('ذاكرةُ الوجوه تُفصل بين طالبٍ وآخر، وبين روايةٍ وأخرى', () => {
  stubStorage();
  const one = attemptFrom(100, [{ kind: 'repeat', intensity: 1 }], 3)!;
  rememberFaceAttempt('participant-a', 'hafs', one);
  assert.equal(loadFaceAttempts('participant-a', 'hafs').length, 1);
  assert.deepEqual(loadFaceAttempts('participant-b', 'hafs'), [], 'ذاكرةُ طالبٍ تسرّبت إلى آخر');
  assert.deepEqual(loadFaceAttempts('participant-a', 'warsh'), [], 'ذاكرةُ روايةٍ تسرّبت إلى أخرى');
});

test('الأحدثُ أوّلًا، والتاريخُ محدودٌ فلا ينتفخ بلا نهاية', () => {
  stubStorage();
  for (let i = 0; i < MAX_REMEMBERED_ATTEMPTS + 25; i += 1) {
    rememberFaceAttempt('p', 'hafs', { page: (i % 604) + 1, at: new Date(2026, 0, 1, 0, i).toISOString(), marks: [] });
  }
  const kept = loadFaceAttempts('p', 'hafs');
  assert.equal(kept.length, MAX_REMEMBERED_ATTEMPTS, `حُفظ ${kept.length}`);
  assert.ok(Date.parse(kept[0].at) > Date.parse(kept[kept.length - 1].at), 'الأحدثُ ليس أوّلًا');
});

test('ذاكرةٌ مشوّهةٌ تُطرح ولا تُصلَّح بالتخمين', () => {
  /* فذاكرةٌ فارغةٌ أصدقُ من ذاكرةٍ مخترعة: الفارغةُ تسحب متساويًا، والمخترعةُ تكذب. */
  const box = stubStorage();
  const key = [...(() => { rememberFaceAttempt('p', 'hafs', { page: 5, at: new Date().toISOString(), marks: [] }); return box.keys(); })()][0];
  box.set(key, JSON.stringify([
    { page: 5, at: new Date().toISOString(), marks: [] },
    { page: 0, at: new Date().toISOString(), marks: [] },
    { page: 900, at: new Date().toISOString(), marks: [] },
    { page: 7, at: 'ليس تاريخًا', marks: [] },
    { page: 8, at: new Date().toISOString(), marks: 'ليست علامات' },
    { page: 9, at: new Date().toISOString(), marks: [{ kind: 'repeat' }] },
    'ليست محاولة', null, 42,
  ]));
  assert.deepEqual(loadFaceAttempts('p', 'hafs').map(a => a.page), [5], 'مرّت محاولةٌ مشوّهة');

  box.set(key, 'ليس JSON أصلًا');
  assert.deepEqual(loadFaceAttempts('p', 'hafs'), [], 'مخزنٌ فاسدٌ لم يُطرح');

  forgetFaceAttempts('p', 'hafs');
  assert.deepEqual(loadFaceAttempts('p', 'hafs'), []);
});

test('غيابُ المخزن لا يكسر الشاشة — يُقرأ فارغًا ويُكتب بلا أثر', () => {
  /* نافذةٌ خاصّةٌ أو مخزنٌ ممنوع: تبقى المراجعةُ عاملةً بلا ذاكرة. */
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('SecurityError'); },
      removeItem: () => { throw new Error('SecurityError'); },
    },
  };
  assert.deepEqual(loadFaceAttempts('p', 'hafs'), []);
  assert.doesNotThrow(() => rememberFaceAttempt('p', 'hafs', { page: 3, at: new Date().toISOString(), marks: [] }));
  assert.doesNotThrow(() => forgetFaceAttempts('p', 'hafs'));
  delete (globalThis as { window?: unknown }).window;
});

/* ── ما كشفته مراجعةٌ آليّة على الوصل (PR #244) ─────────────────────────── */

const faceWords: FaceWordKey[] = Array.from({ length: 6 }, (_, i) => ({
  index: i, surah: 1, ayah: 2, ayahWordIndex: i + 1,
}));

test('الإنهاءُ لا يقرأ قبل آخرِ مقطعٍ وقبلَ فراغ الطابور', async () => {
  /*
   * فـ`stop()` يُطلق آخرَ `dataavailable` بعد عودته، وقد تبقى ردودٌ في الطريق. ومن قرأ
   * فورَ الضغط أسقط آخرَ ثانيتين من تلاوة الطالب — وهي غالبًا خاتمةُ الوجه.
   */
  const order: string[] = [];
  const out = await settleRecitation({
    flush: async () => { await new Promise(r => setTimeout(r, 10)); order.push('flush'); },
    drain: async () => { await new Promise(r => setTimeout(r, 10)); order.push('drain'); return true; },
    read: complete => { order.push('read'); return complete ? 'تامّ' : 'ناقص'; },
  });
  assert.deepEqual(order, ['flush', 'drain', 'read'], `الترتيب: ${order.join(' → ')}`);
  assert.equal(out, 'تامّ');

  /* وجوابُ الإفراغ يصل القارئَ — فلا تُقرأ تلاوةٌ ناقصةٌ وكأنّها تامّة. */
  const partial = await settleRecitation({
    flush: async () => undefined,
    drain: async () => false,
    read: complete => (complete ? 'تامّ' : 'ناقص'),
  });
  assert.equal(partial, 'ناقص', 'نقصُ التلاوة لم يبلغ القارئ');
});

test('القراءةُ تجمع ما سُمع، وتحكم في المحاولة بما عُرف موضعُه', () => {
  const heard = [1, 2, 3].map(w => ({ surah: 1, ayah: 2, wordIndex: w, alignmentState: 'LOCKED' }));
  const settled = readRecitation(heard, faceWords, 300, { at: new Date('2026-09-20T12:00:00.000Z') });
  assert.equal(settled.reading.indices.reach, 3, 'أبعدُ ما بلغ لم يُقرأ');
  assert.ok(settled.attempt, 'أُسقطت محاولةٌ سُمعت');
  assert.equal(settled.attempt!.page, 300);
  assert.equal(settled.attempt!.at, '2026-09-20T12:00:00.000Z');
});

test('تلاوةٌ كلُّها انقطاعٌ لا تُحفظ محاولةً «نظيفة»', () => {
  /*
   * فميكروفونٌ لا يلتقط إلا ضجيجًا يعود بردودٍ كلُّها `LOST`: لا كلمةَ عُرفت، ولا علامةَ
   * ظهرت. فلو عُدّت الردودُ لحُفظت محاولةٌ نظيفةٌ وهُدّئت الصفحةُ، فلا تعود إلى الطالب
   * وهو لم يقرأها قطّ. والعدُّ الصادقُ هو الكلماتُ التي بلغها المحرّك.
   */
  const allLost = Array.from({ length: 12 }, () => ({ surah: 1, ayah: 2, wordIndex: 1, alignmentState: 'LOST' }));
  const signals = accumulateWordSignals(stepsFromSamples(allLost, faceWords));
  assert.equal(signals.frames, 12, 'لم تُعدّ الردود أصلًا');
  assert.equal(signals.visitedWords, 0, 'كلمةٌ عُرفت من ضجيج');
  assert.equal(attemptFrom(300, [], signals.visitedWords), null, 'حُفظت محاولةٌ من انقطاعٍ كلِّه');
  /* ولو عُدّت الردودُ بدل المواضع لحُفظت — وهذا هو العيبُ بعينه. */
  assert.notEqual(attemptFrom(300, [], signals.frames), null);
  /* والقراءةُ الكاملةُ تحكم بالحكم نفسِه: لا محاولةَ من ضجيج. */
  assert.equal(readRecitation(allLost, faceWords, 300).attempt, null, 'حُفظت محاولةٌ من ضجيجٍ عبر القراءة');
});

test('تلاوةٌ عُرف فيها موضعٌ واحدٌ تُحفظ — فالنقصُ خبرٌ أيضًا', () => {
  const mixed = [
    { surah: 1, ayah: 2, wordIndex: 1, alignmentState: 'LOST' },
    { surah: 1, ayah: 2, wordIndex: 3, alignmentState: 'LOCKED' },
    { surah: 1, ayah: 2, wordIndex: 9, alignmentState: 'LOST' },
  ];
  const signals = accumulateWordSignals(stepsFromSamples(mixed, faceWords));
  assert.equal(signals.visitedWords, 1);
  assert.notEqual(attemptFrom(300, [], signals.visitedWords), null, 'أُسقطت محاولةٌ عُرف فيها موضع');
  assert.notEqual(readRecitation(mixed, faceWords, 300).attempt, null, 'أُسقطت عبر القراءة');
});

test('ترتيبُ المقاطع يغيّر الحكم — فالرجوعُ الكاذب يُصنع من فوضى الوصول', () => {
  /*
   * وهذا ما يحرسه الطابورُ في الشاشة: كلُّ مقطعٍ كان يُرسل مستقلًّا، فتعود الردودُ
   * بترتيب إتمامها لا بترتيب التلاوة. ويُقاس هنا أثرُ ذلك: تلاوةٌ مستقيمةٌ تُقرأ
   * مستقيمةً بترتيبها، و**تُقرأ رجوعًا** إن اختلّ الترتيب. فليست مسألةَ أناقة.
   */
  const inOrder = [1, 2, 3, 4, 5, 6].map(w => ({ surah: 1, ayah: 2, wordIndex: w, alignmentState: 'LOCKED' }));
  const straight = accumulateWordSignals(stepsFromSamples(inOrder, faceWords));
  assert.equal(straight.backwardJumps, 0, 'تلاوةٌ مستقيمةٌ قُرئت رجوعًا');

  const shuffled = [1, 4, 2, 5, 3, 6].map(w => ({ surah: 1, ayah: 2, wordIndex: w, alignmentState: 'LOCKED' }));
  const scrambled = accumulateWordSignals(stepsFromSamples(shuffled, faceWords));
  assert.ok(scrambled.backwardJumps > 0, 'اختلالُ الترتيب لم يصنع رجوعًا — فالعيّنةُ لا تقيس الخطر');
});

test('الطابورُ يحفظ ترتيبَ التلاوة ولو عادت الردودُ مقلوبة', () => {
  /*
   * والعيّنةُ مقصودةٌ على أسوأ حال: الأوّلُ أبطأُ ما يكون والأخيرُ أسرعُ. فبلا طابورٍ
   * ينقلب الترتيبُ انقلابًا تامًّا — وهو ما يصنع «أعدتَ» كاذبة.
   */
  const done: number[] = [];
  const q = serialQueue();
  const delays = [40, 30, 20, 10, 0];
  delays.forEach((ms, i) => q.push(() => new Promise<void>(r => setTimeout(() => { done.push(i); r(); }, ms))));
  assert.equal(q.length, 5, 'الدفعُ ليس تزامنيًّا — وقد سبق متأخّرٌ سابقَه في الربط');
  return q.drain().then(complete => {
    assert.equal(complete, true, 'قيل إنّ الطابورَ لم يفرغ وقد فرغ');
    assert.deepEqual(done, [0, 1, 2, 3, 4], `ترتيبُ الإتمام: ${done.join(',')}`);
  });
});

test('الانتظارُ يبلغ آخرَ مقطعٍ ولو دُفع أثناء الانتظار', () => {
  /*
   * فـ`stop()` يُطلق آخرَ `dataavailable` بعد عودته، فيدخل الطابورَ ومسحُه جارٍ.
   * وانتظارٌ يقرأ الذيلَ مرّةً واحدةً يسقطه — وهو غالبًا خاتمةُ الوجه.
   */
  const done: string[] = [];
  const q = serialQueue();
  q.push(() => new Promise<void>(r => setTimeout(() => {
    done.push('first');
    /* والمقطعُ المتأخّرُ ذو فجوةٍ حقيقيّة (مؤقّت)، فلا ينجو انتظارٌ ناقصٌ بترتيب المهامّ الدقيقة. */
    q.push(() => new Promise<void>(done2 => setTimeout(() => { done.push('late'); done2(); }, 10)));
    r();
  }, 5)));
  return q.drain().then(() => assert.deepEqual(done, ['first', 'late'], 'أُسقط آخرُ مقطع'));
});

test('سقوطُ مقطعٍ لا يقطع الطابور — التلاوةُ تمضي', () => {
  const done: number[] = [];
  const q = serialQueue();
  q.push(async () => { done.push(1); });
  q.push(async () => { throw new Error('CHUNK_FAILED'); });
  q.push(async () => { done.push(3); });
  return q.drain().then(() => assert.deepEqual(done, [1, 3], 'مقطعٌ ساقطٌ أوقف ما بعده'));
});

test('الشاشةُ تبني تقريرَها من البنيتين وحدَهما، ولا تشقّ طريقًا ثانيًا', () => {
  /*
   * وهذا فحصُ نصٍّ لا قياسُ تشغيل، ويُقال كما هو: دالّةُ الإنهاء تعيش في ردّ فعلٍ لا
   * يبلغه اختبارُ عقدة — لا مايكروفون ولا مسجّل. فالمقيسُ فيما سبق هو **البنيتان**:
   * `settleRecitation` تضمن الترتيب، و`readRecitation` تضمن الحكم. والذي يحرسه هذا
   * الفحصُ شيءٌ واحد: ألّا تُترك البنيتان جانبًا فيُعاد بناءُ التقرير في الشاشة، حيث
   * لا يحرسه شيء. وهو يُثبت أنّ الطريق الثاني غيرُ مشقوق، لا أنّ الأوّل يُسلك.
   */
  const screen = fs.readFileSync(path.resolve(process.cwd(), 'src/components/participant/MushafListens.tsx'), 'utf8');
  assert.match(screen, /await settleRecitation\(\{/, 'التقريرُ لا يمرّ بترتيب الإنهاء');
  assert.match(screen, /read: complete => \(\{ \.\.\.readRecitation\(/, 'القراءةُ ليست هي المقيسة');
  /* ونقصُ الإفراغ يبلغ القراءةَ فلا تُحفظ مراجعةٌ ناقصة. */
  assert.match(screen, /readRecitation\(samples\.current, face\.words, face\.page, \{ complete \}\)/,
    'نقصُ المقاطع لا يبلغ القراءة، فتُحفظ مراجعةٌ ناقصة');
  assert.match(screen, /flush: stopAndRelease/, 'آخرُ مقطعٍ لا يُنتظر');
  /*
   * والميكروفونُ يُطلق داخلَ إيقاف التسجيل لا بعد انتظار الطابور: فعلٌ واحدٌ لا ترتيبٌ
   * يُنسى. ولو كان بعده لبقي مفتوحًا حين يتعلّق طلبٌ لا يعود.
   */
  const stopper = screen.slice(screen.indexOf('const stopAndRelease'), screen.indexOf('const stopAudio'));
  assert.match(stopper, /releaseMic\(\)/, 'إيقافُ التسجيل لا يُطلق الميكروفون');
  assert.equal(/await queue\.current\.drain\(\);\s*\n\s*releaseMic\(\)/.test(screen), false,
    'الميكروفونُ يُطلق بعد انتظار الطابور — فيبقى مفتوحًا إن تعلّق طلب');
  assert.match(screen, /drain: \(\) => queue\.current\.drain\(\)/, 'الطابورُ لا يُفرَّغ');
  /* ولا تُستدعى أدواتُ القراءة الخام في الشاشة: لا طريقَ ثانٍ إلى تقرير. */
  for (const bypass of ['readFace(', 'accumulateWordSignals(', 'stepsFromSamples(']) {
    assert.equal(screen.includes(bypass), false, `الشاشةُ تبني تقريرَها بـ${bypass} خارجَ ما يُحرس`);
  }
  /* والمقاطعُ تدخل الطابورَ ولا تُرسل مستقلّةً. */
  assert.match(screen, /queue\.current\.push\(/, 'المقاطعُ لا تدخل الطابور');
  assert.equal(/ondataavailable = async/.test(screen), false, 'الربطُ بالطابور ليس تزامنيًّا');
  /*
   * ولا `try` في مهمّة المقطع: الخطأُ يمرّ إلى الطابور فيُعدّ ساقطًا، والبيانُ للطالب
   * يُسلَّم إلى `onFailure`. وقد وقع العكسُ مرّةً فصار عدّادُ السقوط ميتًا: المهمّةُ
   * تبتلع خطأها فيرى الطابورُ نجاحًا، فيقول «تمّ» ومقطعٌ لم يصل.
   */
  const chunkTask = screen.slice(screen.indexOf('queue.current.push(async live'), screen.indexOf('rec.start(CHUNK_MS)'));
  assert.equal(/\btry\s*\{/.test(chunkTask), false, 'مهمّةُ المقطع تبتلع خطأها فلا يُعدّ ساقطًا');
  assert.match(chunkTask, /\}, error => \{/, 'لا بيانَ للطالب عند سقوط مقطع');
  assert.match(chunkTask, /setNote\(listeningFailureNote\(code, ar\)\)/, 'سببُ التعذّر لا يبلغ الطالب');

  /* والمقطعُ يسأل الطابورَ قبل أن يكتب، والطابورُ القديم يُترك عند كلّ وجهٍ جديد. */
  assert.match(screen, /if \(!alive\.current \|\| !live\(\)\) return;/, 'المقطعُ يكتب بلا أن يسأل');
  /*
   * والترك يقع في ثلاثة مواضعَ بعينها، لا «مرّتين في مكانٍ ما»: عند سحب وجهٍ جديد،
   * وعند بدء تلاوةٍ جديدة، وعند مغادرة الشاشة. وعدُّ المواضع وحده يمرّ إن نُقل الترك
   * من موضعه إلى غيره — فيُفحص كلُّ موضعٍ بجاره.
   */
  /*
   * ويُترك **قبل** تغيّر الحال، ولو صار بينهما سطرُ طابورٍ ثانٍ: المقصودُ أنّ ما بقي
   * من الوجه السابق لا يكتب في الوجه الجديد، لا شكلُ السطرين.
   */
  for (const [where, owner, stage] of [
    ['سحبُ وجهٍ جديد', 'const draw = useCallback', 'loading'],
    ['بدءُ تلاوة', 'const begin = useCallback', 'reciting'],
  ] as const) {
    /* ويُبحث داخل الدالّة المعنيّة: `setStage('loading')` يقع في غيرها أيضًا. */
    const scope = screen.indexOf(owner);
    assert.ok(scope > 0, `لا موضعَ لـ${owner}`);
    const at = screen.indexOf(`setStage('${stage}')`, scope);
    assert.ok(at > scope, `لا موضعَ لـ${where}`);
    const before = screen.slice(scope, at);
    assert.match(before, /queue\.current\.abandon\(\); queue\.current = serialQueue\(\);/, `الطابورُ القديم لا يُترك عند ${where}`);
    assert.match(before, /recognition\.current\.abandon\(\); recognition\.current = serialQueue\(\);/, `طابورُ السماع لا يُترك عند ${where}`);
  }
  /*
   * وطلبُ الميكروفون نفسُه يأتي بعد استبدال الطابورين: فالإذنُ قد يطول، وما بقي من
   * الوجه السابق لا يجوز أن يكتب فيه.
   */
  const beginBlock = screen.slice(screen.indexOf('const begin = useCallback'), screen.indexOf('rec.ondataavailable'));
  const beginQueueReset = beginBlock.indexOf('queue.current.abandon(); queue.current = serialQueue();');
  const beginMicRequest = beginBlock.indexOf('navigator.mediaDevices.getUserMedia');
  assert.ok(beginQueueReset >= 0, 'الطابورُ القديم لا يُترك عند بدءُ تلاوة');
  assert.ok(beginMicRequest > beginQueueReset, 'طلب الميكروفون يبدأ قبل استبدال الطابور');
  /*
   * والثالثُ عند مغادرة الشاشة. وكان يُفحص بنصّ سطرٍ واحد، فلمّا صار للتنظيف ثالثةٌ
   * (إغلاقُ سمّاعة التنبيه) كسره الشكلُ لا المعنى. فيُقرأ جسمُ التنظيف ويُشترط فيه
   * **ثلاثتُها**: تركُ الطابور، وإطلاقُ الميكروفون، وإغلاقُ السمّاعة.
   */
  const cleanup = screen.slice(screen.indexOf('useEffect(() => () => {'), screen.indexOf('}, [stopAudio]);'));
  assert.ok(cleanup.length > 0 && cleanup.length < 400, 'لم يُعثر على تنظيف المغادرة');
  for (const call of ['queue.current.abandon()', 'recognition.current.abandon()', 'stopAudio()', 'speaker.current?.close()']) {
    assert.ok(cleanup.includes(call), `تنظيفُ المغادرة لا يشمل ${call}`);
  }
});

/*
 * ومهلةُ الاختبار مقصودة: بلا حدٍّ في الشيفرة يتعلّق هذا الانتظارُ أبدًا، فيعلّق السيرَ
 * كلَّه بدل أن يحمرّ. وحارسٌ يُعلّق CI أسوأُ من حارسٍ يسقط.
 */
test('طلبٌ لا يعود لا يحبس الشاشة — للانتظار حدٌّ يُقال بعده الحقّ', { timeout: 5_000 }, () => {
  /*
   * فخادمٌ توقّف عن الرد يترك المقطعَ معلّقًا، فيتعلّق الطابور، فتبقى الشاشةُ عند
   * «يُقرأ ما سُمع…» بلا نهاية — والطالبُ لا يملك إلا إغلاقَ الصفحة. وأسوأُ من ذلك
   * أنّ إطلاقَ الميكروفون كان بعد الانتظار، فيبقى مفتوحًا وضوءُه مضاءٌ وقد أنهى.
   */
  const q = serialQueue();
  let released = false;
  q.push(() => new Promise<void>(() => { /* لا يعود أبدًا */ }));
  q.push(async () => { released = true; });
  const started = Date.now();
  return q.drain(60).then(complete => {
    assert.equal(complete, false, 'قيل إنّ الطابورَ فرغ وفيه معلّق');
    assert.ok(Date.now() - started < 5_000, 'الانتظارُ لم ينقطع عند حدّه');
    assert.equal(released, false, 'مضت مهمّةٌ بعد المعلّق — فالترتيبُ ضاع');
  });
});

test('والحدُّ الافتراضيّ معلنٌ وواسعٌ لمقطعٍ من ثانيتين', () => {
  assert.ok(DRAIN_DEADLINE_MS >= 5_000, `الحدُّ ${DRAIN_DEADLINE_MS}ms أضيقُ من أن يسع شبكةً بطيئة`);
  assert.ok(DRAIN_DEADLINE_MS <= 60_000, `الحدُّ ${DRAIN_DEADLINE_MS}ms أطولُ من صبر طالب`);
});

test('طابورٌ فارغٌ يفرغ فورًا ويُقال إنّه تامّ', () => {
  const q = serialQueue();
  return q.drain(50).then(complete => assert.equal(complete, true));
});

test('مقطعٌ عاد بعد انقضاء مهلته لا يكتب في وجهٍ آخر', () => {
  /*
   * وهذا أخطرُ ما في المهلة: الطابورُ المتروك يبقى جاريًا، فإذا عاد طلبُه المتأخّر
   * والطالبُ قد انتقل إلى وجهٍ آخر كتب في مواضع الجديد مواضعَ القديم — فيختلط تقريرٌ
   * بتقرير، وتُحفظ محاولةٌ مغشوشة تُرجّح وجهًا بغير سبب.
   *
   * والطابورُ لا يملك إيقافَ مهمّةٍ جارية، لكنّه يملك أن يقول لها: كُفّي.
   */
  const written: string[] = [];
  const q = serialQueue();
  let unblock: (() => void) | null = null;
  q.push(async live => {
    await new Promise<void>(r => { unblock = r; });
    if (!live()) return;
    written.push('متأخّر');
  });

  return q.drain(40).then(complete => {
    assert.equal(complete, false, 'قيل إنّ الطابورَ فرغ وفيه معلّق');
    /* الطالبُ ينتقل إلى وجهٍ آخر: يُترك الطابورُ القديم. */
    q.abandon();
    unblock!();
    return new Promise(r => setTimeout(r, 20));
  }).then(() => {
    assert.deepEqual(written, [], 'كتب مقطعٌ متأخّرٌ في وجهٍ ليس وجهَه');
  });
});

test('طابورٌ متروكٌ لا يبدأ فيه ما لم يبدأ', () => {
  const ran: number[] = [];
  const q = serialQueue();
  q.push(async () => { ran.push(1); q.abandon(); });
  q.push(async () => { ran.push(2); });
  q.abandon();
  q.push(async () => { ran.push(3); });
  assert.equal(q.length, 2, 'قُبلت مهمّةٌ بعد الترك');
  return q.drain(200).then(() => assert.deepEqual(ran, [], 'بدأ الطابورُ المتروك'));
});

test('مقطعٌ سقط يجعل التقريرَ ناقصًا ولو لم تنقضِ مهلة', () => {
  /*
   * فسقوطُ الطلب — انقطاعُ شبكةٍ أو ردُّ خطأٍ — مقطعٌ لم يصل. وكان الطابورُ يبتلع
   * السقوطَ ويقول «تمّ»، فيُعرض تقريرٌ ناقصٌ على أنّه تامّ ويُكتم التنبيه.
   */
  const q = serialQueue();
  q.push(async () => { /* وصل */ });
  q.push(async () => { throw new Error('CHUNK_FAILED'); });
  q.push(async () => { /* وصل */ });
  return q.drain(500).then(complete => {
    assert.equal(complete, false, 'قيل «تمّ» ومقطعٌ ساقط');
    assert.equal(q.failed, 1, `عُدّ ${q.failed} ساقطًا`);
  });
});

test('ولا سقوطَ ولا انقضاء ⇒ تامّ', () => {
  const q = serialQueue();
  q.push(async () => { /* وصل */ });
  q.push(async () => { /* وصل */ });
  return q.drain(500).then(complete => {
    assert.equal(complete, true, 'قيل «ناقص» وكلُّ شيءٍ وصل');
    assert.equal(q.failed, 0);
  });
});

test('بيانُ السقوط يُسلَّم إلى الطابور — فالعدُّ لا يعتمد على أدب المهمّة', () => {
  /*
   * ولو تُرك الالتقاطُ للمهمّة لابتلعت خطأها ومضت، فرأى الطابورُ نجاحًا حيث وقع
   * سقوط. فصار البلعُ غيرَ ممكن: الخطأُ يمرّ إلى الطابور دائمًا، والبيانُ يُعطى هنا.
   */
  const seen: unknown[] = [];
  const q = serialQueue();
  q.push(async () => { throw new Error('CHUNK_FAILED'); }, error => { seen.push(error); });
  return q.drain(500).then(complete => {
    assert.equal(complete, false, 'قيل «تمّ» ومقطعٌ ساقط');
    assert.equal(q.failed, 1);
    assert.equal(seen.length, 1, 'لم يُبلَّغ بالسقوط');
    assert.equal((seen[0] as Error).message, 'CHUNK_FAILED');
  });
});

test('وبيانٌ تعذّر هو نفسُه لا يُلغي أنّ المقطع سقط', () => {
  const q = serialQueue();
  q.push(async () => { throw new Error('CHUNK_FAILED'); }, () => { throw new Error('NOTE_FAILED'); });
  q.push(async () => { /* وصل */ });
  return q.drain(500).then(complete => {
    assert.equal(complete, false);
    assert.equal(q.failed, 1, 'سقوطُ البيان ابتلع عدَّ المقطع');
  });
});

test('السببُ المعروفُ يتقدّم على البيان العامّ — ولا يُبتلع', () => {
  /*
   * فسقوطُ المقاطع يجعل التقريرَ ناقصًا، وكان النقصُ يتقدّم فيُقال لمن انتهت جلستُه
   * «الشبكةُ بطيئة، أعِد» — وهو لا يُفيده إعادةٌ، إنّما يُفيده أن يعيد الدخول. والسببُ
   * البنيويُّ هو وحده الذي يدلّه على ما يفعل.
   */
  const expired = faceNote('IDENTITY_REQUIRED', true);
  const both = reviewNote({ listening: true, faceListenable: true, note: expired, incomplete: true, ar: true })!;
  assert.ok(both.includes(expired), 'ابتُلع السببُ المعروف');
  assert.ok(both.includes('ولم يصل بعضُ المقاطع'), 'أُسقط بيانُ النقص');

  /* وبلا سببٍ معروف: يُقال النقصُ وحده. */
  const onlyPartial = reviewNote({ listening: true, faceListenable: true, incomplete: true, ar: true })!;
  assert.equal(onlyPartial.includes('ولم يصل'), true);
  /* ويُقال له إنّها لم تُحفظ: وإلا ظنّ الوجهَ قد رُوجع وحُسب فلا يعود إليه. */
  assert.ok(onlyPartial.includes('لم تُحفظ'), 'سُكت عن أنّ المراجعة الناقصة لا تدخل الذاكرة');
  assert.ok(both.includes('لم تُحفظ'), 'سُكت عن ذلك حين اجتمع سببٌ ونقص');

  /* وبلا نقصٍ: السببُ وحده، بلا ذيلٍ يُوهم نقصًا لم يقع. */
  const onlyNote = reviewNote({ listening: true, faceListenable: true, note: expired, incomplete: false, ar: true })!;
  assert.equal(onlyNote, expired);

  /* وتلاوةٌ تامّةٌ بلا سبب: لا بيانَ أصلًا. */
  assert.equal(reviewNote({ listening: true, faceListenable: true, incomplete: false, ar: true }), undefined);
});

test('وتعذُّرُ المحرّك أو الوجهِ يتقدّم على كلّ ما سواه', () => {
  /* فلا معنى لأن يُقال «لم يصل بعضُ المقاطع» ولا مقطعَ أُرسل أصلًا. */
  const noEngine = reviewNote({ listening: false, faceListenable: true, note: 'س', incomplete: true, ar: true })!;
  assert.ok(noEngine.includes('غيرُ مهيّأ'), 'تعذُّرُ المحرّك لم يتقدّم');
  assert.equal(noEngine.includes('لم يصل بعضُ المقاطع'), false, 'قيل نقصٌ ولا إرسال');

  const crossing = reviewNote({ listening: true, faceListenable: false, note: 'س', incomplete: true, ar: true })!;
  assert.ok(crossing.includes('يحمل خاتمةَ سورةٍ وفاتحةَ أخرى'), 'سببُ الوجه لم يتقدّم');

  /* والإنجليزيّةُ تقول ما تقوله العربيّة — لا صمتَ في لغةٍ دون أخرى. */
  for (const input of [
    { listening: false, faceListenable: true, incomplete: false },
    { listening: true, faceListenable: false, incomplete: false },
    { listening: true, faceListenable: true, incomplete: true },
  ]) {
    assert.ok((reviewNote({ ...input, ar: false }) || '').length > 10, `بيانٌ إنجليزيٌّ ناقص: ${JSON.stringify(input)}`);
  }
});

test('بيانُ طابورٍ متروكٍ لا يُسلَّم — فلا يُغلَق ميكروفونُ وجهٍ جديد', () => {
  /*
   * وهذا مرآةُ ثقبٍ سُدَّ من قبل: حُرست الكتابةُ بـ`live()` وتُرك البيانُ بلا حارس.
   * وهو أخطر: البيانُ يوقف الميكروفون، فمقطعٌ من وجهٍ قديمٍ يسقط **فيُغلق ميكروفونَ
   * الوجه الجديد** والطالبُ يقرأ فيه.
   */
  const announced: unknown[] = [];
  const q = serialQueue();
  let unblock: (() => void) | null = null;
  q.push(
    async () => { await new Promise<void>(r => { unblock = r; }); throw new Error('CHUNK_FAILED'); },
    error => { announced.push(error); },
  );
  return q.drain(40).then(complete => {
    assert.equal(complete, false);
    q.abandon();
    unblock!();
    return new Promise(r => setTimeout(r, 20));
  }).then(() => {
    assert.deepEqual(announced, [], 'سُلّم بيانٌ من طابورٍ متروك — فأُغلق ميكروفونُ وجهٍ جديد');
  });
});

test('مراجعةٌ ناقصةٌ لا تدخل الذاكرة — وإن عُرضت للطالب', () => {
  /*
   * فنقصُ المقاطع يُنقص الدليل: علاماتٌ لم تُرَ لأنّ صوتَها لم يصل، لا لأنّها لم تقع.
   * فلو حُفظت لجمعت أسوأ الأمرين: تُهدَّأ الصفحةُ فلا تعود إليه قريبًا، ويُنقَص وزنُها
   * فلا تُرجَّح — فيُحرَم موضعَ ضعفه مرّتين.
   */
  const heard = [1, 2, 3].map(w => ({ surah: 1, ayah: 2, wordIndex: w, alignmentState: 'LOCKED' }));

  const partial = readRecitation(heard, faceWords, 300, { complete: false });
  assert.equal(partial.attempt, null, 'حُفظت مراجعةٌ ناقصة');
  /* ومع ذلك تُعرض له: العرضُ شيءٌ والذاكرةُ شيء. */
  assert.equal(partial.reading.indices.reach, 3, 'حُجب عن الطالب ما قِيس فعلًا');
  assert.ok(partial.reading.indices.totalFrames > 0);

  const whole = readRecitation(heard, faceWords, 300, { complete: true });
  assert.notEqual(whole.attempt, null, 'أُسقطت مراجعةٌ تامّة');

  /* والافتراضُ «تامّ»: من لم يُصرّح فقد قاس كلَّ شيء. */
  assert.notEqual(readRecitation(heard, faceWords, 300).attempt, null);
});

/* ── مسارُ السماع في الشاشة: ما لا يبلغه اختبارُ عقدة يُفحص نصًّا ──────────── */

test('الشاشةُ لا تحكم بنفسها: لا مقابلةَ إلا عبر ما يشترط الإذن', () => {
  /*
   * `diffRecitation` يقابل نصّين ولا يسأل عن إذن — وهو صوابٌ في موضعه (القياسُ
   * والاختبار). أمّا في الشاشة فلا: الطريقُ الوحيدُ إلى قولِ «أخطأت» هو
   * `liveJudgment`/`finalJudgment`، وكلاهما يأخذ إذنًا ويعيد `null` بدونه.
   */
  const screen = fs.readFileSync(path.resolve(process.cwd(), 'src/components/participant/MushafListens.tsx'), 'utf8');
  for (const bypass of ['diffRecitation(', 'judgeRecitation(', 'diffOptionsForGate(']) {
    assert.equal(screen.includes(bypass), false, `الشاشةُ تحكم بـ${bypass} خارجَ ما يشترط الإذن`);
  }
  assert.match(screen, /liveJudgment\(expectedRef\.current, heardWords\.current, permission(?:, undefined, trustedFrontier\.current)?\)/, 'الحكمُ الحيُّ ليس هو المستعمل');
  assert.match(screen, /finalJudgment\(expectedRef\.current, heardWords\.current, permission\)/, 'حكمُ الخاتمة ليس هو المستعمل');
  /* ولا يُخترع إذنٌ في الشاشة: يُسأل عنه الخادم. */
  assert.equal(/word:\s*'OPEN'/.test(screen), false, 'الشاشةُ تفتح البابَ لنفسها');
  assert.match(screen, /await fetchPracticeJudgingGate\(/, 'الإذنُ لا يُسأل عنه أصلًا');
});

test('لكلّ مسارٍ طابورُه المرتَّب — وسقوطُ أحدهما لا يُحاسَب به الآخر', () => {
  /*
   * فالترتيبُ لازمٌ في المسارين: مقطعان يتسابقان يخلطان ما سُمع فيُصنع خطأٌ حيث لا
   * خطأ — وهي علّةُ «أعدتَ» الكاذبة بعينها.
   *
   * **ولا يُقاسَم الطابورُ بينهما**: الطابورُ يعدّ أيَّ مهمّةٍ سقطت ناقصةً، ومن ذلك
   * العدّ يُعرف أنّ التلاوة لم تكتمل فلا تُحفظ المراجعة. فلمّا دخل السماعُ الطابورَ
   * نفسَه صار سقوطُ مقطعِ سماعٍ يُسقط **وصفَ التلاوة وحفظَها** — وقِيس ذلك في
   * متصفّح: «محاولات ٠» في تلاوةٍ تتبُّعُها تامّ.
   */
  const screen = fs.readFileSync(path.resolve(process.cwd(), 'src/components/participant/MushafListens.tsx'), 'utf8');
  const handler = screen.slice(screen.indexOf('rec.ondataavailable'), screen.indexOf('rec.start(CHUNK_MS)'));
  assert.equal((handler.match(/queue\.current\.push\(/g) || []).length, 1, 'مسارُ المحاذاة لا يدخل طابورَه وحدَه');
  assert.equal((handler.match(/recognition\.current\.push\(/g) || []).length, 1, 'مسارُ السماع لا يدخل طابورَه');
  assert.equal(/new Promise|Promise\.all|void submitPracticeRecognitionChunk/.test(handler), false,
    'مقطعُ السماع يُرسل خارجَ الطابور');
  assert.match(handler, /await submitPracticeRecognitionChunk\(/, 'السماعُ لا يُنتظر داخل مهمّته');

  /* واكتمالُ التلاوة يُقرأ من طابور المحاذاة وحدَه. */
  assert.match(screen, /drain: \(\) => queue\.current\.drain\(\)/, 'اكتمالُ التلاوة يُقرأ من غير طابورها');
  /* وطابورُ السماع يُنتظر على حدة، وتأخّرُه يُطرح به الحكمُ لا التلاوة. */
  assert.match(screen, /!\(await recognition\.current\.drain\(\)\)/, 'طابورُ السماع لا يُنتظر عند الخاتمة');
  const lateDrain = screen.slice(screen.indexOf('!(await recognition.current.drain())'));
  /*
   * ويُترك طابورُ السماع نفسُه، لا الإذنُ وحده: المهمّةُ الجاريةُ التقطت إذنَها قبل
   * أن تنتظر، فجوابُها المتأخّرُ كان يكتب أخطاءً وينغّم بعد أن قيل «لم يُحكم».
   */
  assert.match(lateDrain.slice(0, 600), /recognition\.current\.abandon\(\);[\s\S]*attemptJudging\.current = null;/,
    'طابورُ السماع لا يُترك بعد فوات مهلته');
  assert.match(lateDrain.slice(0, 600), /attemptJudging\.current = null;[\s\S]*setJudgingLost\(true\);/,
    'تأخّرُ السماع لا يُطرح به الحكم');
  /* والطابوران يُتركان معًا في المواضع الثلاثة. */
  assert.match(screen, /recognition\.current\.abandon\(\); recognition\.current = serialQueue\(\);\s*\n\s*setStage\('loading'\)/,
    'طابورُ السماع لا يُترك عند سحبُ وجهٍ جديد');
  /*
   * وعند البدء يُترك قبل طلب الميكروفون: فالحالُ «يتلو» لا تُضبط إلا بعد الإذن، وما
   * يعني هو ألّا يكتب مقطعٌ من المحاولة السابقة في هذه — لا تجاورُ السطرين.
   */
  const begin = screen.slice(screen.indexOf('const begin = useCallback'), screen.indexOf('rec.ondataavailable'));
  const reset = begin.indexOf('recognition.current.abandon(); recognition.current = serialQueue();');
  assert.ok(reset >= 0, 'طابورُ السماع لا يُترك عند بدءُ تلاوة');
  assert.ok(begin.indexOf('navigator.mediaDevices.getUserMedia') > reset, 'الميكروفونُ يُفتح قبل ترك طابور السماع');
});

test('رقمُ المقطع وموضعُه يُقرآن تزامنيًّا، لا داخلَ المهمّة', () => {
  /*
   * فتوقيتُ الكلمة يعود مُسنَدًا إلى أوّل المقطع، ويُحتاج مُسنَدًا إلى أوّل التلاوة.
   * ولو قُرئ العدّادُ بعد انتظارٍ لقرأ رقمَ مقطعٍ آخر — فتُطرح كلماتٌ صحيحةٌ ويُبقى صدًى.
   * والموضعُ يُقاس من المقطع نفسه (`timecode`) لا من رقمه: المقطعُ ليس ١٥٠٠ ملّي ثانيةٍ بالضبط.
   */
  const screen = fs.readFileSync(path.resolve(process.cwd(), 'src/components/participant/MushafListens.tsx'), 'utf8');
  const handler = screen.slice(screen.indexOf('rec.ondataavailable'), screen.indexOf('rec.start(CHUNK_MS)'));
  const readsIndex = handler.indexOf('chunkClock.current?.add(index, (e as BlobEvent).timecode, performance.now())');
  const firstPush = handler.indexOf('queue.current.push(');
  assert.ok(readsIndex > 0, 'لا يُسجَّل موضعُ المقطع أصلًا');
  assert.ok(readsIndex < firstPush, 'موضعُ المقطع يُسجَّل بعد دخول الطابور');
  assert.ok(handler.indexOf('const index = chunkIndex.current;') < firstPush, 'رقمُ المقطع يُقرأ بعد دخول الطابور');
  assert.match(screen, /chunkClock\.current = new ChunkTimeline\(performance\.now\(\)\);\s*rec\.start\(CHUNK_MS\);/, 'الساعةُ لا تبدأ مع التسجيل');
});

test('ما سُمع تحت نغمةٍ يُطرح قبل أن يُضاف — لا بعده', () => {
  /* وإلا حُكم على صدى النغمة، فنُبِّه عليه، فصُنعت نغمةٌ أخرى — دورةٌ لا تنتهي. */
  const screen = fs.readFileSync(path.resolve(process.cwd(), 'src/components/participant/MushafListens.tsx'), 'utf8');
  const drop = screen.indexOf('dropWordsUnderAlert(timed, alertWindows.current,');
  const append = screen.indexOf('heardWords.current = keepFaceEntry([...heardWords.current, ...kept]');
  assert.ok(drop > 0 && append > 0, 'الطرحُ أو الإضافةُ غير موجودين');
  assert.ok(drop < append, 'الإضافةُ تسبق الطرح');
  assert.match(screen, /alertWindows\.current = \[\.\.\.alertWindows\.current, alertWindow\(now\)\]/, 'النغمةُ لا تُسجَّل نافذةً');
  /*
   * ويُعطى الطارحُ نصَّ الوجه، وإلا طرح كلماتٍ صحيحةً فصارت «لم تُسمع» — وهو ما وقع
   * فعلًا وكشفه أوّلُ تشغيلٍ في متصفّح: ثلاثُ كلماتٍ صحيحةٍ عُلّمت، وكلُّها جارةُ نغمة.
   */
  assert.match(screen, /faceSkeletonsRef\.current\.has\(quranSkeleton\(text\)\)/, 'الطارحُ لا يعرف كلماتِ الوجه');
});

test('سقوطُ السماع لا يُسقط التتبّع', () => {
  /*
   * فالعلاماتُ (لبثتَ، أعدتَ، انقطع الأثر) تُقاس من مسارٍ آخر. ومحرّكُ سماعٍ يسقط
   * يُغلق بابَ الحكم وحدَه — ولا يُطفئ ميكروفونًا ولا يُنهي مراجعة.
   */
  const screen = fs.readFileSync(path.resolve(process.cwd(), 'src/components/participant/MushafListens.tsx'), 'utf8');
  const start = screen.indexOf('await submitPracticeRecognitionChunk(');
  const handler = screen.slice(start, screen.indexOf('rec.start(CHUNK_MS)'));
  assert.equal(handler.includes('stopAudio()'), false, 'سقوطُ السماع يُطفئ الميكروفون');
  assert.match(handler, /setMistakes\(undefined\)/, 'بابٌ أُغلق يترك أحكامًا معروضة');
});

test('إذنُ الحكم يُلتقط عند بدء التلاوة ويثبت إلى آخرها', () => {
  /*
   * فسؤالُ البوّابة طلبٌ لا يعود فورًا. ولو قُرئ الإذنُ عند كلّ مقطعٍ لبدأ الطالبُ
   * قبل أن يعود الجواب، فتُهمل أوّلُ مقاطعه، ثمّ يُفتح البابُ في أثناء التلاوة
   * فتُقابَل بقيّةُ ما سُمع بالوجه كلِّه — فيُعدّ أوّلُ الوجه الذي قرأه ساقطًا.
   */
  const screen = fs.readFileSync(path.resolve(process.cwd(), 'src/components/participant/MushafListens.tsx'), 'utf8');
  assert.match(screen, /attemptJudging\.current = judgingRef\.current;/, 'الإذنُ لا يُلتقط عند البدء');
  const handler = screen.slice(screen.indexOf('rec.ondataavailable'), screen.indexOf('rec.start(CHUNK_MS)'));
  /*
   * ولا **يُقرأ** الإذنُ المتحرّكُ داخل معالج المقطع. وكتابتُه مسموحة: سقوطٌ بنيويٌّ
   * يُغلق بابَ الشاشة كلَّه فلا تُعاد المحاولةُ على محرّكٍ ميت. والمنكَرُ القراءةُ
   * وحدها — أن يُحكم بإذنٍ تبدّل بعد أن بدأت التلاوة.
   */
  const reads = [...handler.matchAll(/judgingRef\.current(?!\s*=)/g)];
  assert.deepEqual(reads.map(m => m[0]), [], 'مقطعُ السماع يقرأ إذنًا متحرّكًا لا لقطةَ المحاولة');
  assert.match(handler, /if \(attemptJudging\.current \|\| wordFollow\.current\) \{/, 'مقطعُ السماع لا يُشترط بلقطة الإذن');
  /* والتتبّعُ بلا إذنٍ لا يحكم: لا خطأَ يُعرض ولا نغمة — يعود قبل الحكم. */
  const follow = handler.slice(handler.indexOf('if (!permission || hole) {'), handler.indexOf('if (!answerKeepsPermission'));
  assert.match(follow, /followFrontier\(expectedRef\.current, heardWords\.current(?:, trustedFrontier\.current)?\)[\s\S]*return;\s*\n\s*\}/);
  assert.doesNotMatch(follow, /setMistakes|planAlert|noticeSlips/, 'التتبّعُ بلا إذنٍ يُظهر أخطاء');
  /* وحكمُ الخاتمة باللقطة نفسِها، لا بإذنٍ تبدّل بعد أن بدأ. */
  const finish = screen.slice(screen.indexOf('const finish = useCallback'), screen.indexOf('const words: FaceWord[]'));
  assert.match(finish, /const permission = attemptJudging\.current;/, 'حكمُ الخاتمة يقرأ إذنًا متحرّكًا');
  /* ويُطرح الإذنُ عند سحب وجهٍ جديد، فلا تُحكم مراجعةٌ بإذن سابقتها. */
  assert.match(screen, /attemptJudging\.current = null;\s*\n\s*setMistakes\(undefined\); setJudgingLost\(false\);/, 'الإذنُ لا يُطرح عند السحب');
});

test('طلبُ سماعٍ يسقط لا يُبطل الحكمَ إلا إن بقي صوتُه بلا سماع', () => {
  /*
   * فمقطعٌ لم يُسمع يترك ثقبًا في ما سُمع، والمقابلةُ تقرأ الثقبَ إسقاطًا: كلماتٌ قرأها الطالبُ صحيحةً
   * تُعلَّم «لم تُسمع» ويُنبَّه عليها بصوت. لكنّ طلبًا سقط لا يترك ثقبًا بنفسه منذ نافذة اللحاق (#282):
   * آخرُ مُثبَّتٍ لم يتقدّم به، والنافذةُ التالية تبدأ قبله فتعيد صوتَه. قِيس على الموقع بعد النشر:
   * مهلةٌ واحدةٌ أبطلت محاولةً كاملة، وقد سمعت النافذةُ التالية كلَّ ما فاتها (بدأت من الصفر).
   * فالإبطالُ للثقب الحقيقيّ: نافذةٌ تبدأ بعد آخر مُثبَّت، أو المقطعُ الأخير، أو علّةٌ بنيويّة، أو طلبٌ
   * سقط ولم تُعِده نافذةٌ قبل الخاتمة.
   */
  const screen = fs.readFileSync(path.resolve(process.cwd(), 'src/components/participant/MushafListens.tsx'), 'utf8');
  const start = screen.indexOf('await submitPracticeRecognitionChunk(');
  const failure = screen.slice(screen.indexOf('}, error => {', start), screen.indexOf('rec.start(CHUNK_MS)'));
  /* السقوطُ العابرُ ينتظر النافذةَ التالية — إلا المقطعَ الأخير والعلّةَ البنيويّة. */
  const transient = failure.indexOf('if (!structural && !finalChunk) {');
  const kill = failure.indexOf('attemptJudging.current = null;');
  assert.ok(transient > 0, 'كلُّ سقوطٍ يُبطل الحكمَ وإن أعادت النافذةُ التالية صوتَه');
  assert.ok(kill > transient, 'السقوطُ العابرُ لا ينتظر النافذةَ التالية');
  assert.match(failure, /const structural = \/GATE_CHANGED\|NOT_CONFIGURED\|JUDGING_CLOSED\|MISMATCH\|MODEL_NOT_BENCHMARKED\/\.test\(code\);/, 'العلّةُ البنيويّةُ تُعامَل عابرة');
  assert.match(failure.slice(transient, kill), /if \(unheardSince\.current === null\) unheardSince\.current = coveredUntil\.current;\s*\n\s*return;/, 'السقوطُ العابرُ لا يُحفظ حدُّ ما لم يُسمع');
  assert.match(failure, /const changed = \/GATE_CHANGED\/\.test\(code\);\s*\n\s*setJudgingLost\(changed \? 'changed' : true\)/, 'لا يُقال للطالب إنّ الحكمَ سقط');
  /* وتبدّلٌ كشفه الخادمُ تُسأل بعده البوّابةُ الجديدة — ولا تبقى القديمةُ تُلتقط للمحاولة التالية. */
  const serverChanged = failure.slice(failure.indexOf("if (code === 'QURAN_ASR_GATE_CHANGED')"));
  assert.ok(failure.includes("if (code === 'QURAN_ASR_GATE_CHANGED')"), 'تبدّلُ الخادم لا يُعالج');
  assert.match(serverChanged.slice(0, 300), /judgingRef\.current = null;[\s\S]*fetchPracticeJudgingGate\(/, 'البوّابةُ القديمةُ تبقى بعد تبدّلٍ كشفه الخادم');
  /* والنافذةُ التي تبدأ بعد آخر مُثبَّت ثقبٌ يُبطل الحكم — ويبقى التتبّعُ بها؛ وغيرُها يمحو الانتظار. */
  const task = screen.slice(start, screen.indexOf('}, error => {', start));
  assert.match(task, /const heardUntil = coveredUntil\.current;\s*\n\s*coveredUntil\.current = Math\.max\(coveredUntil\.current, reach\.commitUntilMs\);[\s\S]*?const hole = !!permission && leavesHole\(reach\.startMs, heardUntil\);\s*\n\s*if \(hole\) \{\s*\n\s*attemptJudging\.current = null;\s*\n\s*setMistakes\(undefined\);\s*\n\s*setJudgingLost\(true\);/, 'الثقبُ لا يُبطل الحكم');
  assert.ok(task.indexOf('unheardSince.current = null;') > task.indexOf('const hole ='), 'النافذةُ التالية لا تمحو انتظارَ ما سقط');
  /* وجوابٌ ببوّابةٍ تبدّلت يُرمى قبل أن يُكتب منه شيء — فيبلغ هذا الإبطال. */
  const check = task.indexOf('if (!answerKeepsPermission(permission, out))');
  assert.ok(check > 0, 'جوابٌ ببوّابةٍ تبدّلت يُقبل');
  const judged = task.indexOf('return;', task.indexOf('if (!permission || hole) {'));
  assert.ok(check < task.indexOf('heardWords.current = keepFaceEntry([', judged), 'يُكتب ما سُمع قبل فحص البوّابة');
  assert.match(task.slice(check, check + 400), /throw new Error\('QURAN_JUDGING_GATE_CHANGED'\)/, 'التبدّلُ لا يُبطل المحاولة');
  assert.equal(failure.includes('stopAudio()'), false, 'سقوطُ السماع يُطفئ الميكروفون');
  /* وفي الخاتمة: طلبٌ سقط ولم تُعِده نافذةٌ بعده — لا حكم. */
  const finish = screen.slice(screen.indexOf('const finish = useCallback'), screen.indexOf('const permission = attemptJudging.current;', screen.indexOf('const finish = useCallback')));
  assert.match(finish, /if \(attemptJudging\.current && unheardSince\.current !== null\) \{\s*\n\s*attemptJudging\.current = null;[\s\S]*?setJudgingLost\(true\);/, 'سقوطٌ لم تُعِده نافذةٌ يُحكم معه');
});
