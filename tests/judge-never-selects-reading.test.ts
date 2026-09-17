import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * أهمّ قاعدة في مسار المسابقة: المحكّم لا يختار الرواية.
 *
 * الرواية تأتي من تسجيل المتسابق وفئته وتنتقل تلقائيًا؛ فوجودُ أي مُنتقٍ في شاشة المحكّم
 * يعني أن روايةً قد تُبدَّل أثناء الجلسة، فيُقاس المتسابق بغير روايته. والقاعدة اليوم
 * محفوظة — JudgeOS يشتقّ الرواية من المتسابق — وهذا الاختبار يحرسها من تعديلٍ لاحق
 * يُدخل مُنتقيًا بلا أن ينتبه أحد.
 */

const JUDGE_DIR = path.join(process.cwd(), 'src', 'components', 'judge');

function judgeSources(): { file: string; text: string }[] {
  return fs.readdirSync(JUDGE_DIR)
    .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map(f => ({ file: f, text: fs.readFileSync(path.join(JUDGE_DIR, f), 'utf8') }));
}

test('the judge screen exposes no control that changes the reading', () => {
  const sources = judgeSources();
  assert.ok(sources.length > 0, 'judge components found');

  // مُغيِّرات حالةٍ أو مُعالِجات تُبدّل الرواية.
  const mutators = /\b(set(Riwaya|Rawi|Qiraah|Reading)|on(Riwaya|Rawi|Qiraah|Reading)Change|change(Riwaya|Rawi|Qiraah|Reading)|select(Riwaya|Rawi|Qiraah))\s*[({]/i;
  // عنصر إدخال/انتقاء مربوطٌ باسم الرواية.
  const readingControl = /<(select|input)\b[^>]*\b(riwaya|rawi|qiraah|reading)\b[^>]*>/is;

  for (const { file, text } of sources) {
    const mutatorHit = text.match(mutators);
    assert.equal(mutatorHit, null, `${file} must not mutate the reading: ${mutatorHit?.[0] ?? ''}`);
    const controlHit = text.match(readingControl);
    assert.equal(controlHit, null, `${file} must not bind a select/input to the reading: ${controlHit?.[0] ?? ''}`);
  }
});

test('the judge screen derives the reading from the participant instead', () => {
  const judgeOs = judgeSources().find(s => s.file === 'JudgeOS.tsx');
  assert.ok(judgeOs, 'JudgeOS.tsx present');
  // الرواية تُشتقّ من تسجيل المتسابق، لا تُختار في الشاشة.
  assert.match(judgeOs!.text, /resolveReading\(\s*\{\s*riwaya\s*:\s*participant\.riwaya/,
    'JudgeOS resolves the reading from participant.riwaya');
});

test('no judge component offers a reading picker in Arabic copy either', () => {
  // نصوصٌ تدلّ على منتقٍ معروض للمحكّم («اختر الرواية»، «تغيير الرواية»).
  const arabicPicker = /(اختر|اختيار|تغيير|تبديل)\s*(ال)?(رواية|قراءة)/;
  for (const { file, text } of judgeSources()) {
    const hit = text.match(arabicPicker);
    assert.equal(hit, null, `${file} must not offer a reading picker: ${hit?.[0] ?? ''}`);
  }
});
