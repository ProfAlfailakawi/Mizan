import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildFaceIndex, canonicalBridgeFor, deterministicUnit, drawFace, faceInScope, faceIsWhole, facesForScope,
  MIN_DRAW_SHARE, nativeSurahEnds,
} from '../server/mushaf-face';
import { loadIslamwebReadingPackage } from '../server/islamweb-reading-packages';
import { ayahCountOf } from '../src/lib/quran-canon';
import { fullQuranScope, scopeFromAyahRange, scopeFromRanges } from '../src/lib/quran-scope';
import type { CandidateQuranVerse } from '../server/quran-candidate-source-vault';

/*
 * الوجهُ الكامل — وحدةُ تدريبٍ لم تكن ممكنةً قبل استعادة هندسة الصفحات.
 *
 * وثلاثةُ أخطارٍ تُحرس هنا: أن يُعرض وجهٌ نصفُه خارج نطاق الطالب فيُسأل عمّا لم
 * يُكلَّف به؛ وأن يُعرض وجهٌ فيه ثقبٌ (آيةٌ عابرةٌ سقطت) فيُحسب على الطالب انقطاعٌ لم
 * يقع؛ وأن يكون السحبُ عشوائيةً لا تُفسَّر ولا تُعاد.
 */

const verse = (surah: number, ayah: number, page?: number, ls = 1, le = 1): CandidateQuranVerse => ({
  sura_no: surah, aya_no: ayah, aya_text: `نصّ ${surah}:${ayah}`,
  ...(page !== undefined ? { page, line_start: ls, line_end: le } : {}),
});

test('الفهرسُ العكسيّ يبني الوجه من الآيات التي تحمل موضعًا وحدها', () => {
  const faces = buildFaceIndex([
    verse(2, 1, 2, 1, 2), verse(2, 2, 2, 3, 5), verse(2, 3, 2, 6, 6),
    verse(2, 4, 3, 1, 1),
    verse(2, 5), // بلا موضع — عابرةٌ صفحتين
  ]);
  assert.deepEqual([...faces.keys()].sort((a, b) => a - b), [2, 3]);
  const face = faces.get(2)!;
  assert.equal(face.ayat.length, 3);
  assert.deepEqual([face.surahStart, face.ayahStart, face.surahEnd, face.ayahEnd], [2, 1, 2, 3]);
  assert.equal(face.lineStart, 1);
  assert.equal(face.lineEnd, 6);
});

test('وجهٌ فيه ثقبٌ لا يُعرض — والفجوةُ تعني آيةً لا يراها النظام', () => {
  const whole = buildFaceIndex([verse(2, 1, 5), verse(2, 2, 5), verse(2, 3, 5)]).get(5)!;
  assert.equal(faceIsWhole(whole, ayahCountOf), true);
  const holed = buildFaceIndex([verse(2, 1, 5), verse(2, 3, 5)]).get(5)!;
  assert.equal(faceIsWhole(holed, ayahCountOf), false, 'وجهٌ بثقبٍ عُدّ متّصلًا');
});

test('انتقالُ السورة على الوجه مقبولٌ متى ختمت السابقةُ وبدأت التاليةُ من أوّلها', () => {
  const last = ayahCountOf(93); // الضحى
  const ok = buildFaceIndex([verse(93, last - 1, 596), verse(93, last, 596), verse(94, 1, 596)]).get(596)!;
  assert.equal(faceIsWhole(ok, ayahCountOf), true);
  /* سورةٌ تبدأ من غير أوّلها ⇒ سقطت آيةٌ بينهما. */
  const bad = buildFaceIndex([verse(93, last, 596), verse(94, 2, 596)]).get(596)!;
  assert.equal(faceIsWhole(bad, ayahCountOf), false);
  /* وسورةٌ سابقةٌ لم تختم ⇒ ثقبٌ أيضًا. */
  const unfinished = buildFaceIndex([verse(93, 3, 596), verse(94, 1, 596)]).get(596)!;
  assert.equal(faceIsWhole(unfinished, ayahCountOf), false);
});

test('نصفُ وجهٍ ليس وجهًا: كلُّ آياته داخل النطاق أو لا يُعرض', () => {
  const face = buildFaceIndex([verse(2, 10, 7), verse(2, 11, 7), verse(2, 12, 7)]).get(7)!;
  assert.equal(faceInScope(face, scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 20 })), true);
  assert.equal(faceInScope(face, scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: 11 })), false,
    'وجهٌ آخرُ آيةٍ فيه خارج النطاق عُدَّ داخلَه');
  assert.equal(faceInScope(face, scopeFromAyahRange({ surah: 2, ayah: 11 }, { surah: 2, ayah: 30 })), false,
    'وجهٌ أوّلُ آيةٍ فيه خارج النطاق عُدَّ داخلَه');
});

test('السحبُ حتميٌّ بالبذرة — تُعاد الجلسةُ نفسُها ويُراجَع اختيارُها', () => {
  const faces = [1, 2, 3, 4, 5].map(p => buildFaceIndex([verse(2, p, p)]).get(p)!);
  const a = drawFace(faces, 'طالب:٧ · جولة:١');
  const b = drawFace(faces, 'طالب:٧ · جولة:١');
  assert.equal(a!.page, b!.page, 'البذرةُ نفسُها أعطت وجهين مختلفين');
  const other = drawFace(faces, 'طالب:٧ · جولة:٢');
  assert.ok(other, 'بذرةٌ أخرى لم تُعطِ وجهًا');
  /* ولا تُعطي البذرةُ نفسَها دائمًا نفسَ الرقم لبذورٍ مختلفة — وإلا فليست عشوائية. */
  const spread = new Set(Array.from({ length: 40 }, (_, i) => drawFace(faces, `جولة:${i}`)!.page));
  assert.ok(spread.size >= 3, `السحبُ تجمّع في ${spread.size} وجهًا فقط`);
});

test('الوزنُ يميل ولا يُقصي — ولا يختفي وجهٌ أبدًا', () => {
  const faces = [1, 2, 3].map(p => buildFaceIndex([verse(2, p, p)]).get(p)!);
  const drawn = Array.from({ length: 300 }, (_, i) => drawFace(faces, `جولة:${i}`, p => (p === 2 ? 20 : 1))!.page);
  const counts = new Map<number, number>();
  for (const p of drawn) counts.set(p, (counts.get(p) || 0) + 1);
  assert.ok((counts.get(2) || 0) > (counts.get(1) || 0), 'الوزنُ لم يُرجّح');
  assert.ok((counts.get(1) || 0) > 0 && (counts.get(3) || 0) > 0, 'وجهٌ اختفى بسبب الوزن');
  /* ووزنٌ صفرٌ أو سالبٌ أو NaN لا يُسقط وجهًا من الوجود. */
  const withZero = new Set(Array.from({ length: 200 }, (_, i) => drawFace(faces, `z:${i}`, p => (p === 1 ? 0 : 1))!.page));
  assert.ok(withZero.size >= 2);
  assert.ok(drawFace(faces, 's', () => Number.NaN));
});

test('بلا وجهٍ صالحٍ يُرجع لا شيء — ولا يُختلق وجهٌ خارج النطاق', () => {
  assert.equal(drawFace([], 'بذرة'), null);
  const faces = buildFaceIndex([verse(2, 1, 4)]);
  assert.deepEqual(facesForScope(faces, scopeFromRanges([]), ayahCountOf), []);
});

test('على البيانات الحقيقية: حفصٌ يملك أوجهًا، وحزمُ إسلام ويب لا تملك ولا تستعير', () => {
  const pkg = loadIslamwebReadingPackage('hafs');
  const hafs = buildFaceIndex(pkg.verses);
  assert.equal(hafs.size, 604, `أوجهُ حفص ${hafs.size}`);
  const whole = facesForScope(hafs, fullQuranScope(), nativeSurahEnds(pkg.verses));
  assert.ok(whole.length >= 580, `الأوجهُ المتّصلة ${whole.length} من ٦٠٤`);
  assert.ok(whole.length <= 604);
  /* والوجهُ الأوّل هو الفاتحة، والأخيرُ يختم بالناس. */
  assert.equal(whole[0].page, 1);
  assert.equal(whole[whole.length - 1].surahEnd, 114);

  const hisham = buildFaceIndex(loadIslamwebReadingPackage('hisham').verses);
  assert.equal(hisham.size, 0, 'ظهرت أوجهٌ لرواية لا مواضعَ في حزمتها');
});

test('نطاقُ جزءٍ واحدٍ يُعطي أوجهَه وحدها', () => {
  const pkg = loadIslamwebReadingPackage('hafs');
  const hafs = buildFaceIndex(pkg.verses);
  const juz30 = scopeFromAyahRange({ surah: 78, ayah: 1 }, { surah: 114, ayah: ayahCountOf(114) });
  const faces = facesForScope(hafs, juz30, nativeSurahEnds(pkg.verses));
  assert.ok(faces.length > 10 && faces.length < 40, `أوجهُ جزء عمّ ${faces.length}`);
  assert.ok(faces.every(f => f.page >= 580), 'وجهٌ خارج جزء عمّ');
  assert.ok(faces.every(f => f.ayat.every(a => a.surah >= 78)), 'آيةٌ خارج النطاق على وجهٍ معروض');
});

test('المولّدُ يوزّع ولا يعلق على قيمة', () => {
  const values = Array.from({ length: 500 }, (_, i) => deterministicUnit(`س:${i}`));
  assert.ok(values.every(v => v >= 0 && v < 1), 'قيمةٌ خارج [0,1)');
  assert.ok(new Set(values).size > 450, 'المولّدُ يكرّر نفسه');
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(mean > 0.4 && mean < 0.6, `متوسطٌ منحاز ${mean.toFixed(3)}`);
});

test('العدُّ الأصليُّ لا القانونيّ — وإلا حُكم على روايةٍ بمسطرة غيرها', () => {
  /*
   * قِيس: ترقيمُ ورشٍ يخالف القانونيَّ في ٥٠ سورة. فبالعدّ القانونيّ تظهر ٢٥ صفحةً
   * «مثقوبة» وهي سليمة، وبالعدّ الأصليّ صفر. وهذا حارسُ انحدارٍ على الخطأ بعينه.
   */
  const pkg = loadIslamwebReadingPackage('warsh');
  const faces = buildFaceIndex(pkg.verses);
  const native = nativeSurahEnds(pkg.verses);

  let differing = 0;
  for (let surah = 1; surah <= 114; surah += 1) if (native(surah) !== ayahCountOf(surah)) differing += 1;
  assert.ok(differing > 40, `سورٌ مختلفةُ العدّ ${differing} — تغيّرت البيانات`);

  const byCanonical = [...faces.values()].filter(f => !faceIsWhole(f, ayahCountOf)).length;
  const byNative = [...faces.values()].filter(f => !faceIsWhole(f, native)).length;
  assert.ok(byCanonical > byNative, `القانونيّ ${byCanonical} والأصليّ ${byNative} — لم يظهر الفرق`);
});

test('آيةٌ بلا موضعٍ تُسقط الوجهين معًا — لا وجهًا واحدًا ولا صفرًا', () => {
  /*
   * الفجوةُ تقع على **حدّ** الوجهين لا داخل أحدهما، فلا يكشفها فحصُ الاتّصال. وأوّلُ
   * صياغةٍ لهذا الفهرس أسقطتها بصمت فبدا الوجهان سليمين.
   */
  const faces = buildFaceIndex([
    verse(2, 1, 10), verse(2, 2, 10),
    verse(2, 3), // عابرةٌ: ١٠ ← ١١
    verse(2, 4, 11), verse(2, 5, 11),
    verse(2, 6, 12),
  ]);
  assert.equal(faces.get(10)!.hasUnplacedNeighbour, true, 'الصفحةُ السابقة لم تُعلَّم');
  assert.equal(faces.get(11)!.hasUnplacedNeighbour, true, 'الصفحةُ التالية لم تُعلَّم');
  assert.equal(faces.get(12)!.hasUnplacedNeighbour, false, 'صفحةٌ بعيدةٌ عُلِّمت بلا سبب');
  const ends = nativeSurahEnds([verse(2, 1), verse(2, 6)]);
  assert.equal(faceIsWhole(faces.get(10)!, ends), false);
  assert.equal(faceIsWhole(faces.get(11)!, ends), false);
  assert.equal(faceIsWhole(faces.get(12)!, ends), true);
});

test('العدُّ القانونيُّ لا يُقابَل بالترقيم الأصليّ إلا عبر الجسر', () => {
  /*
   * النطاقُ قانونيٌّ والآياتُ أصليّة. ومقابلتُهما مباشرةً تُسقط أوجهًا سليمةً — قِيس:
   * ورشٌ يفقد ١٨ وجهًا بلا جسرٍ ولا يفقدها به. والأخطرُ عكسُه: وجهٌ **خارج** نطاقه
   * يُعدّ داخلَه لأن الرقمين تصادفا.
   */
  const pkg = loadIslamwebReadingPackage('warsh');
  const faces = buildFaceIndex(pkg.verses);
  const ends = nativeSurahEnds(pkg.verses);
  const raw = facesForScope(faces, fullQuranScope(), ends).length;
  const bridged = facesForScope(faces, fullQuranScope(), ends, canonicalBridgeFor('warsh')).length;
  assert.ok(bridged > raw, `بالجسر ${bridged} وبلا جسر ${raw} — لم يظهر الفرق`);
});

test('على الحزم الثماني: الأوجهُ تتبع ما يُحلّ جسرُها — والموقوفةُ تسقط بالصواب', () => {
  const measured: Record<string, number> = {};
  for (const rawiId of ['hafs', 'warsh', 'shubah', 'qalun', 'al-duri-abu-amr', 'al-susi', 'al-bazzi', 'qunbul']) {
    const pkg = loadIslamwebReadingPackage(rawiId);
    const faces = buildFaceIndex(pkg.verses);
    assert.equal(faces.size, 604, `${rawiId}: أوجهٌ ${faces.size}`);
    measured[rawiId] = facesForScope(faces, fullQuranScope(), nativeSurahEnds(pkg.verses), canonicalBridgeFor(rawiId)).length;
  }
  /* حفصٌ وشعبةُ ترقيمُهما هو القانونيّ ولا آيةَ عابرةً فيهما: الوجوهُ كاملة. */
  assert.equal(measured.hafs, 604);
  assert.equal(measured.shubah, 604);
  /* ورشٌ وقالونُ يفقدان أوجهَ آياتهما العابرة وحدها. */
  assert.ok(measured.warsh >= 590 && measured.warsh < 604, `ورش ${measured.warsh}`);
  assert.equal(measured.qalun, measured.warsh, 'ورشٌ وقالونُ من نظام عدٍّ واحد فليَسقط منهما سواء');
  /*
   * والبزّيُّ من الروايات الخمس الموقوفة: جسرُها غيرُ محلول، فأكثرُ أوجهها لا تُعرض.
   * وهذا هو **الصواب** لا عطب: العائقُ نفسُه الذي يمنع أسئلتها يمنع أوجهها.
   */
  assert.ok(measured['al-bazzi'] < 400, `البزّي ${measured['al-bazzi']} — عُرضت أوجهٌ بجسرٍ غير محلول`);
  assert.ok(measured['al-bazzi'] > 0, 'سقطت أوجهُ البزّي كلُّها');
});

test('موضعٌ لا يُحلّ قانونيًّا لا يُعدّ داخل النطاق — فشلٌ مغلق', () => {
  const face = buildFaceIndex([verse(2, 1, 9), verse(2, 2, 9)]).get(9)!;
  assert.equal(faceInScope(face, fullQuranScope()), true);
  assert.equal(faceInScope(face, fullQuranScope(), () => undefined), false,
    'موضعٌ مجهولُ المقابل عُدَّ داخل النطاق');
});

/*
 * أرضيّةُ الوزن — دعوى صارت خاصّيّة (ملاحظةُ مراجعةٍ آليّة، PR #243).
 *
 * كانت الأرضيّةُ `Number.EPSILON`: موجبةٌ على الورق، وممتنعةٌ في القسمة. ومولّدُنا
 * يُخرج ٢^٣٢ قيمةً لا غير، فنصيبٌ مقدارُه ٢^-٥٢ لا تقع فيه قيمةٌ واحدة. فقِيس ذلك
 * فإذا وجهٌ وزنُه صفرٌ لم يُسحب مرّةً في ٢٠٠٠٠٠ بذرة — وكان الاختبارُ السابق يقنع
 * بأنّ الوزنَ موجبٌ ولا يسأل: أيقع فيه المولّد؟
 */
const bareFace = (page: number) => ({
  page, hasUnplacedNeighbour: false,
  surahStart: 1, ayahStart: 1, surahEnd: 1, ayahEnd: 1,
  ayat: [], lineStart: 1, lineEnd: 1,
});

test('وجهٌ ساقطُ الوزن يبقى مسحوبًا فعلًا — لا موجبًا على الورق وحده', () => {
  const two = [bareFace(1), bareFace(2)];
  let drawn = 0;
  for (let i = 0; i < 20000; i += 1) {
    if (drawFace(two, `s${i}`, page => (page === 1 ? 1 : 0))!.page === 2) drawn += 1;
  }
  assert.ok(drawn > 0, 'الوجهُ الساقطُ لم يُسحب ولا مرّةً في ٢٠٠٠٠ بذرة — فهو مُقصًى لا نادر');
  /* ونادرٌ بحقٍّ أيضًا: لا يُنصَف من لا وزنَ له. */
  assert.ok(drawn < 20000 * MIN_DRAW_SHARE * 12, `سُحب ${drawn} مرّةً — أكثرُ من نصيبه`);
});

test('والوجهُ الساقطُ مسحوبٌ ولو كان بين وجوه المصحف كلِّها', () => {
  /*
   * والعدُّ الحقيقيُّ ٦٠٤ وجهًا، فنصيبُ الساقط نحوُ واحدٍ من ٦٠٠ ألف. فلا يُبحث عنه
   * في كلّ تشغيل: بذرةٌ وُجدت بالقياس مرّةً (بعد ٨٢٨٨١٠ محاولة) تُثبت أنّه ممكن،
   * والممتنعُ لا تُوجد له بذرةٌ أبدًا.
   */
  const all = Array.from({ length: 604 }, (_, i) => bareFace(i + 1));
  const weightOf = (page: number) => (page === 7 ? 0 : 1);
  assert.equal(drawFace(all, 'seed828810', weightOf)!.page, 7, 'البذرةُ المقيسة لم تعد تسحب الوجهَ الساقط');
  /* ونصيبُه أكبرُ من خطوة المولّد (٢^-٣٢)، وإلا كان ممتنعًا حسابًا. */
  const share = MIN_DRAW_SHARE / (603 + MIN_DRAW_SHARE);
  assert.ok(share > 2 ** -32, `نصيبُ الوجه الساقط ${share} دون خطوة المولّد`);
});

test('أوزانٌ كلُّها ساقطة: السحبُ متساوٍ ولا يُرجَّح أوّلُها', () => {
  const two = [bareFace(1), bareFace(2)];
  let second = 0;
  for (let i = 0; i < 20000; i += 1) if (drawFace(two, `z${i}`, () => 0)!.page === 2) second += 1;
  assert.ok(second > 20000 * 0.4 && second < 20000 * 0.6, `الثاني سُحب ${second} من ٢٠٠٠٠`);
});
