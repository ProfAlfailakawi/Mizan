import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attemptFrom, faceNote, listenableFaces, loadFaceAttempts, rememberFaceAttempt, forgetFaceAttempts,
  MAX_REMEMBERED_ATTEMPTS,
} from '../src/lib/face-review';
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

test('نطاقٌ كلُّ وجوهه عابرةٌ لا يُترك بلا وجه', () => {
  /* وإلا قيل لصاحب النطاق الضيّق «لا وجهَ لك» وله وجوهٌ تُقرأ وإن لم تُقس كاملة. */
  const crossing = [face(1, 2, 3), face(2, 3, 4)];
  assert.deepEqual(listenableFaces(crossing, { reading: 'hafs' }).map(f => f.page), [1, 2]);
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
