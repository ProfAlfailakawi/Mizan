import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_FACE_MEMORY, attemptBurden, explainChoice, faceWeights, type FaceAttempt } from '../src/lib/face-memory';

/*
 * ذاكرةُ الوجوه — «الذكاء» الذي طلبه المالك، مقيسًا لا مدّعًى.
 *
 * وثلاثةُ أخطارٍ تُحرس: أن يُقصي وجهًا فيُنسى نطاقٌ من حفظه؛ وأن يلاحقه بزلّةٍ ماتت
 * قبل شهر؛ وأن يعيد عليه الوجهَ نفسَه فورًا فيحفظ لحظةً ولا يُرسّخ.
 */

const DAY = 86_400_000;
const now = Date.parse('2026-09-20T12:00:00Z');
const ago = (ms: number) => new Date(now - ms).toISOString();

const attempt = (page: number, ms: number, marks: FaceAttempt['marks']): FaceAttempt =>
  ({ page, at: ago(ms), marks });

test('ثقلُ المحاولة يجمع علاماتها موزونةً بأنواعها', () => {
  assert.equal(attemptBurden({ page: 1, at: ago(0), marks: [] }), 0);
  const one = attemptBurden({ page: 1, at: ago(0), marks: [{ kind: 'repeat', intensity: 1 }] });
  const soft = attemptBurden({ page: 1, at: ago(0), marks: [{ kind: 'strain', intensity: 1 }] });
  assert.ok(one > soft, 'الإعادةُ لم تُوزَن أثقلَ من شدّة الصوت');
  /* والشدّةُ تُقيَّد في ٠..١ فلا يُهرَّب وزنٌ برقمٍ كبير. */
  const absurd = attemptBurden({ page: 1, at: ago(0), marks: [{ kind: 'repeat', intensity: 1000 }] });
  assert.equal(absurd, one);
  const negative = attemptBurden({ page: 1, at: ago(0), marks: [{ kind: 'repeat', intensity: -5 }] });
  assert.equal(negative, 0);
});

test('وجهٌ تعثّر فيه يُرجَّح على وجهٍ أتقنه — والأساسُ يبقى لكليهما', () => {
  const weights = faceWeights([
    attempt(100, 2 * DAY, [{ kind: 'repeat', intensity: 1 }, { kind: 'confusable', intensity: 1 }]),
    attempt(200, 2 * DAY, []),
  ], now);
  assert.ok(weights(100) > weights(200), 'التعثّرُ لم يُرجّح');
  assert.ok(weights(200) >= 1, 'وجهٌ أُتقن هبط تحت الأساس');
  assert.ok(weights(999) >= 1, 'وجهٌ لم يُتلَ قطّ لم يأخذ الأساس');
});

test('لا إقصاء: كلُّ وجهٍ يبقى وزنُه موجبًا مهما كان', () => {
  const weights = faceWeights([attempt(7, 0, [{ kind: 'repeat', intensity: 1 }])], now);
  assert.ok(weights(7) > 0, 'وجهٌ في التهدئة صار صفرًا فاختفى');
  assert.ok(weights(8) > 0);
});

test('التعثّرُ القديمُ يخفّ — ولا يُلاحَق الطالبُ بزلّةٍ ماتت', () => {
  const fresh = faceWeights([attempt(5, 1 * DAY, [{ kind: 'repeat', intensity: 1 }])], now)(5);
  const old = faceWeights([attempt(5, 60 * DAY, [{ kind: 'repeat', intensity: 1 }])], now)(5);
  assert.ok(fresh > old, 'الزمنُ لم يُضعِف الأثر');
  assert.ok(old < 1.05, `أثرُ ستّين يومًا ما زال ${old.toFixed(3)}`);
  /* وعند نصف العمر يكون الأثرُ نصفًا — لا تقريبًا بل بالحساب. */
  const atHalf = faceWeights([attempt(5, DEFAULT_FACE_MEMORY.halfLifeDays * DAY, [{ kind: 'repeat', intensity: 1 }])], now)(5);
  assert.ok(Math.abs((atHalf - 1) - (MARK_REPEAT / 2)) < 1e-9, `عند نصف العمر ${atHalf}`);
});
const MARK_REPEAT = 1.0;

test('وجهٌ تُلي قبل قليلٍ يُخفَّض — التباعدُ يُرسّخ والإعادةُ الفوريّةُ لا', () => {
  const justNow = faceWeights([attempt(9, 30 * 60_000, [{ kind: 'repeat', intensity: 1 }])], now)(9);
  const yesterday = faceWeights([attempt(9, 1 * DAY, [{ kind: 'repeat', intensity: 1 }])], now)(9);
  assert.ok(justNow < yesterday, 'وجهٌ تُلي قبل نصف ساعةٍ لم يُخفَّض');
  assert.ok(justNow < 1, 'التهدئةُ لم تنزل به تحت الأساس');
  assert.ok(justNow > 0);
});

test('سقفٌ للوزن: وجهٌ واحدٌ لا يبتلع السحب كلَّه', () => {
  /*
   * والمحاولاتُ كلُّها **خارج مدّة التهدئة** عمدًا: أوّلُ صياغةٍ لهذا الاختبار جعلت
   * أحدثَها قبل ٦١ دقيقة — داخل التهدئة — فضُرب الوزنُ في ٠٫١٥ ولم يبلغ السقفَ أصلًا.
   * فما كنتُ أقيس السقفَ بل التهدئة.
   */
  const afterCooldown = (DEFAULT_FACE_MEMORY.cooldownHours + 1) * 3_600_000;
  const many = Array.from({ length: 60 }, (_, i) => attempt(3, afterCooldown + i * 3_600_000, [
    { kind: 'repeat', intensity: 1 }, { kind: 'confusable', intensity: 1 }, { kind: 'lost', intensity: 1 },
  ]));
  const w = faceWeights(many, now)(3);
  assert.ok(w <= DEFAULT_FACE_MEMORY.maxWeight, `تجاوز السقف: ${w}`);
  assert.equal(w, DEFAULT_FACE_MEMORY.maxWeight, `لم يبلغ السقفَ: ${w}`);
  /* وبلا سقفٍ كان سيتجاوز ٨٠ — فالسقفُ يعمل ولا يخنق. */
  const uncapped = faceWeights(many, now, { ...DEFAULT_FACE_MEMORY, maxWeight: Number.POSITIVE_INFINITY })(3);
  assert.ok(uncapped > 40, `بلا سقفٍ ${uncapped} — لم يتراكم الثقل`);
});

test('التهدئةُ تُضرب بعد السقف لا قبله — فتُخفَّض حتى أثقلُ الأوجه', () => {
  const heavy = Array.from({ length: 30 }, (_, i) => attempt(3, (i + 1) * 3_600_000, [
    { kind: 'repeat', intensity: 1 }, { kind: 'confusable', intensity: 1 },
  ]));
  /* أحدثُها قبل ساعةٍ: داخل التهدئة. */
  const w = faceWeights(heavy, now)(3);
  /* ٨ (السقف) × ٠٫١٥ (التهدئة) = ١٫٢ — لا صفرٌ ولا ثمانية. */
  assert.ok(Math.abs(w - DEFAULT_FACE_MEMORY.maxWeight * DEFAULT_FACE_MEMORY.cooldownFactor) < 1e-9,
    `وزنُ المثقل في التهدئة ${w}`);
  /* وهو أقلُّ بكثيرٍ مما لو لم تُطبَّق التهدئة — فهي تعمل على المثقل كما على الخفيف. */
  const rested = faceWeights(heavy.map(a => ({ ...a, at: new Date(Date.parse(a.at) - 12 * 3_600_000).toISOString() })), now)(3);
  assert.ok(rested > w * 4, `بلا تهدئةٍ ${rested} ومعها ${w} — لم يظهر أثرُها`);
});

test('محاولةٌ بتاريخٍ فاسدٍ أو في المستقبل تُهمل ولا تُصحَّح بالتخمين', () => {
  const weights = faceWeights([
    { page: 4, at: 'ليس تاريخًا', marks: [{ kind: 'repeat', intensity: 1 }] },
    { page: 4, at: new Date(now + 10 * DAY).toISOString(), marks: [{ kind: 'repeat', intensity: 1 }] },
  ], now);
  assert.equal(weights(4), 1, `وزنُ ٤ صار ${weights(4)} من محاولاتٍ فاسدة`);
});

test('نوعُ علامةٍ مجهولٌ يُهمل ولا يُفسد الوزن', () => {
  const burden = attemptBurden({ page: 1, at: ago(0), marks: [{ kind: 'خارق' as never, intensity: 1 }] });
  assert.equal(burden, 0);
});

test('يُقال للطالب لماذا عاد — ولا يُترك يظنّ الجهازَ يلاحقه', () => {
  assert.match(explainChoice(11, [], now), /لم تقرأه/);
  const withRepeat = explainChoice(11, [attempt(11, DAY, [{ kind: 'repeat', intensity: 1 }])], now);
  assert.match(withRepeat, /أعدتَ فيه/);
  const withConfusable = explainChoice(11, [attempt(11, DAY, [
    { kind: 'confusable', intensity: 1 }, { kind: 'confusable', intensity: 1 }, { kind: 'strain', intensity: 1 },
  ])], now);
  assert.match(withConfusable, /مشابه/, 'لم يُذكر أغلبُ ما وقع');
  assert.match(explainChoice(11, [attempt(11, DAY, [])], now), /لتُثبّته/);
  assert.match(explainChoice(11, [], now, false), /have not read/);
});

test('الوزنُ دالّةٌ لا خريطة: ٦٠٤ صفحةً لا تُذكر ليُسحب ما لم يُقرأ', () => {
  const weights = faceWeights([attempt(1, DAY, [{ kind: 'repeat', intensity: 1 }])], now);
  for (const page of [1, 2, 300, 604]) assert.ok(weights(page) > 0, `الصفحة ${page} بلا وزن`);
  assert.ok(weights(1) > weights(604));
});

test('أرضيّةُ الوزن تصمد حتى لو ضُبطت التهدئةُ على الصفر', () => {
  /*
   * هذا الحارسُ وُلد من طفرةٍ مرّت خضراء: حذفتُ `Math.max(EPSILON, …)` فلم يسقط
   * اختبار — لأن الوزنَ بالقيم الافتراضية لا يبلغ الصفرَ أصلًا (١ × ٠٫١٥ = ٠٫١٥).
   * فالأرضيّةُ لا تُختبر إلا بضبطٍ يبلغها. و«لا إقصاء» قاعدةٌ لا تُترك بلا قياس:
   * وزنُ صفرٍ يحذف الوجهَ من السحب حذفًا.
   */
  const now = Date.parse('2026-09-20T12:00:00Z');
  const justRead: FaceAttempt = { page: 12, at: new Date(now - 60_000).toISOString(), marks: [] };
  const zeroed = faceWeights([justRead], now, { ...DEFAULT_FACE_MEMORY, cooldownFactor: 0 })(12);
  assert.ok(zeroed > 0, 'وزنٌ صفرٌ أقصى الوجهَ من السحب');
  /* وأرضيّةٌ ثانيةٌ في السحب نفسِه — دفاعٌ بطبقتين، وكلتاهما مقيسة. */
  const negative = faceWeights([justRead], now, { ...DEFAULT_FACE_MEMORY, cooldownFactor: -3 })(12);
  assert.ok(negative > 0, 'معاملٌ سالبٌ أعطى وزنًا سالبًا');
});
