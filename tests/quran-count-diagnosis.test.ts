/*
 * السؤالُ الذي يُعجز مَن يُسأل ليس سؤالًا.
 *
 * كان الخطابُ إلى اللجنة يطلب في مسألة أبي عمرو «خريطةَ حدودِ آيٍ لإحدى وأربعين سورة».
 * وسببُ ذلك أننا قابلنا حزمتَه بالعدّ **البصريّ** وحدَه لأن أبا عمرٍو بصريّ. فلمّا قوبلت
 * بالأعداد الستّة كلِّها تبيّن أن أقربَها إليها **المدنيُّ الأول** بفارق ثلاث سور.
 * والسؤالُ عن ثلاثٍ يُجاب؛ وعن إحدى وأربعين يُؤجَّل — فبقيت روايتان موقوفتين بلا داعٍ
 * لهذا الاتّساع.
 *
 * وكان في الخطاب أسوأُ من ذلك: الرقمان في المسألتين الأولى والثانية **مقلوبان** — نُسب
 * إلى الحزمة ما هو للمرجع وبالعكس. وخطابٌ يسأل أهلَ العلم برقمٍ مقلوب يُجاب عن غير ما
 * يُراد.
 *
 * فهذه الحرّاس تربط ما في `docs/REQUEST-AYAH-COUNTS.md` بما تقوله البايتات: كلُّ رقمٍ
 * في الخطاب يُعاد حسابُه هنا، فإن انحرف الخطابُ عن القياس سقط الاختبار.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { distancesToUpstream, measureRawi } from '../scripts/quran-count-diagnosis';
import { NATIVE_SURAH_AYAH_COUNTS } from '../src/lib/quran-native-count-systems';

const LETTER = fs.readFileSync(path.join(process.cwd(), 'docs/REQUEST-AYAH-COUNTS.md'), 'utf8');
/* الخطابُ يكتب أرقامَه بالأرقام العربية، فتُحوَّل القيمةُ المقيسة إليها بدل تثبيت نصٍّ. */
const arabicIndic = (n: number) => String(n).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

test('Ibn Kathir differs from the published Makki count in An-Naba alone, and the package is the higher one', () => {
  const ranked = distancesToUpstream(NATIVE_SURAH_AYAH_COUNTS.MAKKI_IBN_KATHIR_DELIVERY);
  assert.equal(ranked[0].system, 'makki', 'the package sits closest to the Makki count');
  assert.equal(ranked[0].mismatches.length, 1, 'exactly one surah is in dispute');
  const [only] = ranked[0].mismatches;
  assert.equal(only.surah, 78);
  assert.ok(only.packaged > only.upstream,
    'the package counts MORE than the reference here — the letter must not state it the other way round');
  assert.ok(LETTER.includes(arabicIndic(only.packaged)) && LETTER.includes(arabicIndic(only.upstream)),
    'both measured numbers must appear in the letter');
});

test('Rawh differs from the published Basri count in Al-Inshiqaq alone, and the package is the higher one', () => {
  const ranked = distancesToUpstream(NATIVE_SURAH_AYAH_COUNTS.BASRI_YAQUB_RAWH);
  assert.equal(ranked[0].system, 'basri');
  assert.equal(ranked[0].mismatches.length, 1);
  const [only] = ranked[0].mismatches;
  assert.equal(only.surah, 84);
  assert.ok(only.packaged > only.upstream,
    'Rawh packages MORE ayahs than the Basri reference here, not fewer');
});

test('the two Yaqub packages are byte-identical in count except for that one surah', () => {
  const rawh = measureRawi('rawh');
  const ruways = measureRawi('ruways');
  const differing = rawh.map((v, i) => (v === ruways[i] ? null : i + 1)).filter(Boolean) as number[];
  assert.deepEqual(differing, [84],
    'the whole weight of question two is that two rawis of one shaykh part company in exactly one surah');
  assert.ok(LETTER.includes('رويس'),
    'the letter must carry that evidence — it is the strongest thing we can hand the committee');
});

test('the Abu Amr package is nearest the First Madani count, not the Basri one the letter used to assume', () => {
  const ranked = distancesToUpstream(NATIVE_SURAH_AYAH_COUNTS.BASRI_ABU_AMR_DELIVERY);
  assert.equal(ranked[0].system, 'madani-first');
  const basri = ranked.find(r => r.system === 'basri')!;
  assert.ok(basri.mismatches.length > ranked[0].mismatches.length * 5,
    'asking about the far system instead of the near one is what made this an unanswerable request');
  const surahs = ranked[0].mismatches.map(m => m.surah);
  assert.deepEqual(surahs, [37, 80, 81]);
  for (const surah of surahs) {
    assert.ok(LETTER.includes(arabicIndic(surah)), `the letter must name surah ${surah} explicitly`);
  }
});

test('the letter asks about three surahs, never again about forty-one', () => {
  const ranked = distancesToUpstream(NATIVE_SURAH_AYAH_COUNTS.BASRI_ABU_AMR_DELIVERY);
  const basri = ranked.find(r => r.system === 'basri')!;
  /*
   * الرقمُ الواسع مسموحٌ في جدول المسافات وفي شرحِ الوهم — فذكرُه هناك اعترافٌ لا طلب.
   * وإنما يُمنع في الطلب نفسه: ما بعد «السؤال:» هو ما تقرؤه اللجنةُ على أنه المهمّة.
   */
  const third = LETTER.slice(LETTER.indexOf('المسألة الثالثة'));
  const ask = third.slice(third.indexOf('**السؤال:**'));
  assert.ok(ask.length > 40, 'question three must actually carry a question');
  assert.equal(new RegExp(`${arabicIndic(basri.mismatches.length)}\\s*سورة`).test(ask), false,
    'the wide number may stand as evidence above, never as the request itself');
  assert.ok(ask.includes('ثلاث') || ask.includes(arabicIndic(3)),
    'the request is the narrow one the measurement supports');
});
