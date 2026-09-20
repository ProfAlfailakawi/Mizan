import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

import {
  attemptFrom, faceNote, faceSupportsListening, listenableFaces, loadFaceAttempts, rememberFaceAttempt,
  forgetFaceAttempts, MAX_REMEMBERED_ATTEMPTS, serialQueue, DRAIN_DEADLINE_MS,
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

test('الوجهُ العابرُ سورتين لا يُستمع إليه — والمحاذاةُ تُطلب لسورةٍ واحدة', () => {
  const faces = [face(1, 2), face(2, 2, 3), face(3, 3)];
  assert.deepEqual(listenableFaces(faces, { reading: 'hafs' }).map(f => f.page), [1, 3]);
  /* وبلا محرّكٍ يُعرض كلُّ وجهٍ للمراجعة الصامتة: القيدُ قيدُ القياس لا قيدُ العرض. */
  assert.deepEqual(listenableFaces(faces, null).map(f => f.page), [1, 2, 3]);
});

test('نطاقٌ كلُّ وجوهه عابرةٌ لا يُترك بلا وجه — لكنّه يُراجَع صامتًا', () => {
  /*
   * وإلا قيل لصاحب النطاق الضيّق «لا وجهَ لك» وله وجوهٌ تُقرأ وإن لم تُقس كاملة.
   *
   * لكنّ العودةَ إلى العابرة لا تعني فتحَ ميكروفونٍ عليها: المحاذاةُ تُطلب لسورةٍ ومدى
   * آياتٍ فيها، فمدًى ينتهي في سورةٍ أخرى يردّه الخادم — فيقرأ الطالبُ وجهًا كاملًا ثم
   * يُعطى تقريرًا فارغًا لا يعرف سببه. فالسؤالُ يُسأل عن **الوجه المسحوب** لا عن القائمة.
   */
  const crossing = [face(1, 2, 3), face(2, 3, 4)];
  const offered = listenableFaces(crossing, { reading: 'hafs' });
  assert.deepEqual(offered.map(f => f.page), [1, 2], 'تُرك صاحبُ النطاق الضيّق بلا وجه');
  for (const f of offered) {
    assert.equal(faceSupportsListening(f), false, `وجه ${f.page} عابرٌ وفُتح له ميكروفون`);
  }
  /* والوجهُ في سورةٍ واحدةٍ يُستمع إليه، وما لا وجهَ له لا يُستمع إليه. */
  assert.equal(faceSupportsListening(face(3, 5)), true);
  assert.equal(faceSupportsListening(null), false);
  assert.equal(faceSupportsListening(undefined), false);
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
  const settled = readRecitation(heard, faceWords, 300, new Date('2026-09-20T12:00:00.000Z'));
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
