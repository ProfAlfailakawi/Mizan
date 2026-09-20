import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

import { practiceFaceCatalogue, practiceFacePage, splitAyahWords, PracticeFaceError } from '../server/practice-face-service';
import { loadIslamwebReadingPackage } from '../server/islamweb-reading-packages';
import { buildFaceIndex, faceIsWhole, nativeSurahEnds } from '../server/mushaf-face';
import { ayahCountOf } from '../src/lib/quran-canon';
import { scopeFromAyahRange } from '../src/lib/quran-scope';

/*
 * وجوهُ التمرين تُقاس من الحزم نفسِها، لا من جدولٍ مكتوبٍ في اختبار.
 *
 * وخطران يُحرسان هنا: أن يُعرض على الطالب وجهٌ ناقصٌ فيظنّ حفظه ناقصًا، وأن يُمسّ
 * الرسمُ العثمانيُّ في طريقه من الحزمة إلى الشاشة.
 */

const READINGS = ['hafs', 'warsh', 'qalun', 'shubah'];

test('كلُّ روايةٍ ذاتِ مواضعَ تُخرج وجوهًا، وكلُّها كاملةٌ بعدّها هي', () => {
  for (const rawi of READINGS) {
    const catalogue = practiceFaceCatalogue(rawi);
    assert.equal(catalogue.supportsFaces, true, `${rawi} بلا وجوه`);
    assert.ok(catalogue.faces.length >= 500, `${rawi}: ${catalogue.faces.length} وجهًا فقط`);
    assert.ok(catalogue.faces.length <= 604, `${rawi}: ${catalogue.faces.length} وجهًا — أكثر من المصحف`);

    /* لا وجهَ مكرّرًا ولا رقمَ خارج المصحف، والترتيبُ تصاعديّ. */
    const pages = catalogue.faces.map(f => f.page);
    assert.equal(new Set(pages).size, pages.length, `${rawi}: وجهٌ مكرّر`);
    assert.deepEqual(pages, [...pages].sort((a, b) => a - b), `${rawi}: الوجوهُ غيرُ مرتّبة`);
    for (const f of catalogue.faces) {
      assert.ok(f.page >= 1 && f.page <= 604, `${rawi}: وجه ${f.page}`);
      assert.ok(f.ayahCount >= 1, `${rawi}: وجه ${f.page} بلا آيات`);
    }
  }
});

test('الوجهُ يُقاس بعدد آيات روايته هي — لا بعدّ حفص', () => {
  /*
   * وهذا الخطأُ وقع مرّةً في هذه الشجرة: حُكم على ورشٍ بأعداد حفص، فظهر ٢٥ وجهًا
   * «مثقوبًا» وهي تامّة. وورشٌ يخالف الجدولَ القانونيّ في خمسين سورة.
   *
   * وأوّلُ صياغةٍ لهذا الحارس اكتفت بأن تكون كلُّ آيةٍ داخلَ عدّ روايتها، فمرّت طفرةُ
   * «احكم بعدّ حفص» خضراءَ: الحكمُ الخاطئ **يُسقط** وجوهًا ولا يُدخل آيةً خارجة. فصار
   * الفحصُ على **العدد المقيس** نفسِه، ومعه الفرقُ الذي يُحدثه الحكمُ بغير مسطرتها.
   */
  const measured: Record<string, number> = { hafs: 604, shubah: 604, warsh: 597, qalun: 597 };
  for (const [rawi, count] of Object.entries(measured)) {
    assert.equal(practiceFaceCatalogue(rawi).wholeFaces, count,
      `${rawi}: عددُ وجوهه الكاملة تغيّر عن المقيس من بايتات حزمته`);
  }

  /* والحكمُ بالجدول القانونيّ يُسقط من ورشٍ خمسةً وعشرين وجهًا تامّة — فالفرقُ محسوس. */
  const warshVerses = loadIslamwebReadingPackage('warsh').verses;
  const byCanonicalTable = [...buildFaceIndex(warshVerses).values()].filter(f => faceIsWhole(f, ayahCountOf)).length;
  assert.equal(byCanonicalTable, 572, 'الحكمُ بالجدول القانونيّ لم يعد يُسقط ما كان يُسقطه');
  assert.equal(measured.warsh - byCanonicalTable, 25, 'الفرقُ بين المسطرتين تغيّر');

  /* ولا آيةَ على وجهٍ خارجَ عدّ روايتها بحال. */
  const nativeEnd = nativeSurahEnds(warshVerses);
  for (const summary of practiceFaceCatalogue('warsh').faces.slice(0, 40)) {
    for (const w of practiceFacePage('warsh', summary.page).words) {
      assert.ok(w.ayah <= nativeEnd(w.surah), `آيةٌ ${w.surah}:${w.ayah} خارج عدّ ورش (${nativeEnd(w.surah)})`);
    }
  }
});

test('كلماتُ الوجه متّصلةُ الفهرس، والفاصلةُ عند نهاية الآية وحدها', () => {
  const face = practiceFacePage('hafs', 435);
  assert.ok(face.words.length > 0, 'وجهٌ بلا كلمات');
  face.words.forEach((w, i) => assert.equal(w.index, i, `فهرسُ الكلمة ${i} مكسور`));

  /* فهرسُ الكلمة داخل آيتها يبدأ بواحدٍ ويتّصل — وهو ما يرسله المحاذي. */
  const seen = new Map<string, number[]>();
  for (const w of face.words) {
    const key = `${w.surah}:${w.ayah}`;
    const list = seen.get(key) || [];
    list.push(w.ayahWordIndex);
    seen.set(key, list);
  }
  for (const [locus, indices] of seen) {
    assert.deepEqual(indices, indices.map((_, i) => i + 1), `فهارسُ كلمات ${locus} ليست ١..ن`);
  }

  /* وفي كلّ آيةٍ نهايةٌ واحدة، هي آخرُ كلماتها. */
  for (const [locus] of seen) {
    const inAyah = face.words.filter(w => `${w.surah}:${w.ayah}` === locus);
    assert.equal(inAyah.filter(w => w.endsAyah).length, 1, `${locus}: نهاياتٌ متعدّدة أو معدومة`);
    assert.equal(inAyah[inAyah.length - 1].endsAyah, true, `${locus}: النهايةُ ليست آخرَ كلمة`);
  }
});

test('الرسمُ العثمانيّ يصل الشاشةَ كما هو في الحزمة — حرفًا بحرف', () => {
  /*
   * والتقطيعُ على المسافات وحدها: لا تُحذف حركةٌ ولا يُوحَّد همزٌ ولا يُسقط حرفٌ صغير.
   * فيُعاد جمعُ الكلمات ويُقابَل بنصّ الحزمة بعد طيّ المسافات لا غير.
   */
  const verses = new Map(loadIslamwebReadingPackage('hafs').verses.map(v => [`${v.sura_no}:${v.aya_no}`, v.aya_text]));
  for (const page of [1, 2, 77, 293, 435, 604]) {
    const face = practiceFacePage('hafs', page);
    const byAyah = new Map<string, string[]>();
    for (const w of face.words) {
      const key = `${w.surah}:${w.ayah}`;
      byAyah.set(key, [...(byAyah.get(key) || []), w.text]);
    }
    for (const [locus, parts] of byAyah) {
      const original = verses.get(locus);
      assert.ok(original !== undefined, `آيةٌ ${locus} ليست في الحزمة`);
      /*
       * والمقابلةُ بنصّ الحزمة نفسِه، لا بمخرَج الدالّة المقيسة.
       *
       * فأوّلُ صياغةٍ قابلت `parts` بـ`splitAyahWords(original)` — أي قابلت الدالّةَ
       * بنفسها. فمرّت طفرةُ «احذف الحركات» خضراءَ: حُذفت من الطرفين معًا. فصار الطيُّ
       * هنا محلّيًّا: مسافاتٌ لا غير.
       */
      assert.equal(parts.join(' '), (original as string).trim().replace(/\s+/g, ' '), `نصُّ ${locus} تغيّر في الطريق`);
    }
  }
});

test('وجهٌ خارج المصحف أو خارج الحزمة يُردّ — ولا يُختلق', () => {
  for (const bad of [0, 605, 1.5, Number.NaN]) {
    assert.throws(() => practiceFacePage('hafs', bad), PracticeFaceError, `الصفحة ${bad} لم تُردّ`);
  }
  /* وروايةٌ بلا أثرٍ على القرص تُردّ بخطأٍ صريح، ولا تُستعار وجوهُ غيرها. */
  assert.throws(() => practiceFaceCatalogue('la-yujad-abadan'), PracticeFaceError);
});

test('وجوهُ روايةٍ تخالف وجوهَ أخرى حيث يخالف عدُّها — ولا تُنسخ', () => {
  /*
   * ولو كانت قائمةُ الوجوه مشتركةً بين الروايات لظهرت متطابقةً دائمًا. فاختلافُها
   * دليلُ أنّ كلَّ روايةٍ تُقرأ من حزمتها.
   */
  const hafs = practiceFaceCatalogue('hafs').faces.length;
  const warsh = practiceFaceCatalogue('warsh').faces.length;
  assert.notEqual(hafs, warsh, 'حفصٌ وورشٌ بعدد وجوهٍ واحد — أيُقرآن من حزمةٍ واحدة؟');

  /* ومدياتُ الوجه الواحد تختلف بينهما حيث يختلف العدّ. */
  const differing = practiceFaceCatalogue('warsh').faces
    .filter(w => {
      const h = practiceFaceCatalogue('hafs').faces.find(x => x.page === w.page);
      return h && (h.ayahStart !== w.ayahStart || h.ayahEnd !== w.ayahEnd || h.surahStart !== w.surahStart);
    });
  assert.ok(differing.length > 0, 'لا وجهَ واحدٌ يختلف بين حفصٍ وورش');
});

test('النطاقُ يحصر الوجوه — ويُقاس بترقيم الرواية عبر جسره لا بمسطرة غيرها', () => {
  /*
   * والوجهُ الذي لا يُحسم مقابلُه القانونيُّ يسقط مغلقًا: لا يُعرض على الطالب موضعٌ
   * لا نعرف أهو في نطاقه أم لا.
   */
  const all = practiceFaceCatalogue('hafs');
  const juzAmma = practiceFaceCatalogue('hafs', scopeFromAyahRange({ surah: 78, ayah: 1 }, { surah: 114, ayah: 6 }));
  assert.ok(juzAmma.faces.length > 0, 'جزءُ عمّ بلا وجوه');
  assert.ok(juzAmma.faces.length < all.faces.length, 'النطاقُ لم يحصر شيئًا');
  /* وكلُّ وجهٍ فيه من آخر المصحف — لا وجهَ من البقرة في جزء عمّ. */
  for (const f of juzAmma.faces) {
    assert.ok(f.surahStart >= 78, `وجه ${f.page} يبدأ بسورة ${f.surahStart} وهي خارج جزء عمّ`);
    assert.ok(f.page >= 560, `وجه ${f.page} خارج مدى جزء عمّ في المصحف`);
  }
  /* والعددُ الكامل يبقى معلومًا مع الحصر — فيُعرف كم حُصر ومن كم. */
  assert.equal(juzAmma.wholeFaces, all.wholeFaces);

  /* ونطاقٌ لا يقع فيه وجهٌ كاملٌ يُخرج قائمةً فارغةً صريحة، لا وجهًا مقارِبًا. */
  const sliver = practiceFaceCatalogue('hafs', scopeFromAyahRange({ surah: 2, ayah: 3 }, { surah: 2, ayah: 4 }));
  assert.deepEqual(sliver.faces, [], 'أُعطي الطالبُ وجهًا خارج نطاقه');
  assert.equal(sliver.supportsFaces, true, 'نُفيت قدرةُ الرواية لأنّ نطاقًا ضاق');
});

test('مسارا الوجوه محروسان كما يُحرس مسارُ الاستماع — لا أضعفَ منه', () => {
  /*
   * فالوجوهُ تُقرأ من حزمة الرواية، وبناءُ الفهرس مرورٌ على ستّة آلاف آية. ومسارٌ بلا
   * دورٍ ولا حدّ معدّلٍ بابٌ لاستنزاف الخادم، ولطالبٍ ليس في مسابقةٍ أن يمسح المصحف.
   */
  const server = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  for (const route of ["app.post('/api/quran/practice/faces'", "app.get('/api/quran/practice/face'"]) {
    const at = server.indexOf(route);
    assert.notEqual(at, -1, `${route} غيرُ مسجَّل`);
    const line = server.slice(at, server.indexOf('\n', at));
    assert.ok(line.includes("requireFirebaseRoles(['participant'])"), `${route} بلا دورٍ يحرسه`);
    assert.ok(line.includes('practiceAlignmentIpRateLimit'), `${route} بلا حدّ معدّل`);
    assert.ok(line.includes("res.setHeader('Cache-Control','no-store')"), `${route} يُخزَّن في وسيط`);
    /* والروايةُ تُقرأ من مصفاةٍ واحدة، فلا يفترق مسارٌ عن أخيه في حراسته. */
    assert.ok(line.includes('practiceFaceRawi(req)'), `${route} يقرأ الرواية بنفسه لا بمصفاته`);
  }
  /* والمصفاةُ نفسُها ترفض المعامل المكرّر وتردّ ما لا تعرفه — لا تخمّن رواية. */
  const helper = server.slice(server.indexOf('const practiceFaceRawi='), server.indexOf('const practiceFaceFailure='));
  assert.ok(helper.includes("soleParam(req.query.reading,'reading')"), 'المصفاةُ تقرأ الرواية خامًا');
  assert.ok(helper.includes('candidateRawiForDeliveryKey'), 'الروايةُ تُخمَّن ولا تُطابَق');
  assert.ok(helper.includes('PRACTICE_FACE_READING_UNKNOWN'), 'مفتاحٌ مجهولٌ لا يُردّ صراحة');
});
