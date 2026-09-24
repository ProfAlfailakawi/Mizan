import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { arabicIndicDigits } from '../src/components/judge/AyahMark';
import { MushafSheet } from '../src/components/judge/MushafSheet';
import { DEMO_BAR_SHELL_PADDING } from '../src/components/layout/demo-shell';

/*
 * فاصلةُ الآية تُقاس بالتصيير لا بقراءة الشيفرة.
 *
 * هذا الملفّ يصيّر الورقة فعلًا ويقرأ ما خرج منها: كم فاصلةً ظهرت، وبأيّ أرقام، وهل بقي
 * نصُّ الآية كما سُلِّم حرفًا بحرف. ودعوى في نصّ الشيفرة لا تثبت شيئًا من ذلك.
 */

const AYAT = [
  { ayah: 4, text: 'وَإِن يُكَذِّبُوكَ فَقَدۡ كُذِّبَتۡ رُسُلٞ مِّن قَبۡلِكَ' },
  { ayah: 5, text: 'يَٰٓأَيُّهَا ٱلنَّاسُ إِنَّ وَعۡدَ ٱللَّهِ حَقّٞ' },
  { ayah: 10, text: 'إِنَّ ٱلشَّيۡطَٰنَ لَكُمۡ عَدُوّٞ' },
];

const sheet = (over: Record<string, unknown> = {}) => renderToStaticMarkup(
  React.createElement(MushafSheet, {
    ar: true,
    surahName: 'فاطر',
    startAyah: 4,
    endAyah: 10,
    loci: [{ page: 435, lineStart: 1, lineEnd: 6 }],
    ayat: AYAT,
    tajweedOn: false,
    onToggleTajweed: () => {},
    sourceLabel: 'KFGQPC',
    loaded: true,
    ...over,
  } as never),
);

const marks = (html: string) => [...html.matchAll(/data-ayah="(\d+)"[^>]*class="mizan-ayah-mark"|class="mizan-ayah-mark"[^>]*data-ayah="(\d+)"/g)]
  .map(m => Number(m[1] ?? m[2]));

test('الأرقام تُحوَّل إلى هندية، والعدد غير الصحيح يُرفض', () => {
  assert.equal(arabicIndicDigits(0), '٠');
  assert.equal(arabicIndicDigits(7), '٧');
  assert.equal(arabicIndicDigits(42), '٤٢');
  assert.equal(arabicIndicDigits(286), '٢٨٦');
  assert.throws(() => arabicIndicDigits(1.5), /AYAH_NUMBER_NOT_A_COUNT/);
  assert.throws(() => arabicIndicDigits(-1), /AYAH_NUMBER_NOT_A_COUNT/);
});

test('كلُّ آيةٍ تُختم بفاصلةٍ تحمل رقمها', () => {
  const html = sheet();
  const found = marks(html);
  assert.deepEqual(found, [4, 5, 10], `فواصل مصيَّرة: ${JSON.stringify(found)}`);
  for (const digits of ['٤', '٥', '١٠']) {
    assert.ok(html.includes(`>${digits}</span>`), `رقم الآية ${digits} لم يظهر في الفاصلة`);
  }
});

test('الفاصلة طبقةُ عرضٍ فوق النصّ، لا حرفٌ يُضاف إليه', () => {
  const html = sheet();
  /* آخرُ كلمةٍ تُضمّ إلى فاصلتها في وحدةٍ لا تنكسر، فيُقرأ النصُّ بلا وسوم — حرفًا بحرف. */
  const plain = html.replace(/<[^>]+>/g, '');
  for (const a of AYAT) {
    assert.ok(plain.includes(a.text), `نصّ الآية ${a.ayah} تغيّر عمّا سُلِّم`);
  }
  /* لا رقمَ عربيًّا هنديًّا داخل نصّ الآية نفسه — الأرقام كلُّها في الفواصل وحدها. */
  const insideText = AYAT.some(a => /[٠-٩]/.test(a.text));
  assert.equal(insideText, false);
});

test('الآيةُ الجاري تلاوتُها تُعلَّم في فاصلتها وحدها', () => {
  const html = sheet({ activeAyah: 5 });
  const active = [...html.matchAll(/data-ayah="(\d+)"[^>]*data-active="true"/g)].map(m => Number(m[1]));
  assert.deepEqual(active, [5]);
});

test('بلا آياتٍ مفصّلة لا تُخترع فواصل', () => {
  const html = sheet({ ayat: undefined, fallbackText: 'نصٌّ متّصل بلا حدودٍ معلومة' });
  assert.deepEqual(marks(html), []);
  assert.ok(html.includes('نصٌّ متّصل بلا حدودٍ معلومة'));
});

test('كرتوشُ السورة يحمل الاسم والمدى، ولا يخمّن اسمًا غائبًا', () => {
  const html = sheet();
  assert.ok(html.includes('سُورَةُ فاطر'));
  assert.ok(html.includes('الآيات ٤ — ١٠'), 'مدى الآيات لم يظهر بالأرقام الهندية');
  assert.ok(html.includes('ص٤٣٥'), 'موضع الصفحة لم يظهر');
  const nameless = sheet({ surahName: undefined });
  assert.ok(nameless.includes('>—</span>'));
});

/*
 * حشوةُ قدم الصفحة تُشتقّ من ارتفاع الشريط — حارسُ انفراقٍ لا دعوى سلوك.
 * القياسُ السلوكيّ هو ارتفاع الشريط المصيَّر؛ وهذا يمنع عودة رقمٍ ثانٍ في القشرة.
 */
test('شريطُ بيئة العرض وحشوتُه رقمٌ واحد', () => {
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.ok(app.length > 1000, 'لم يُقرأ ملفّ القشرة أصلًا');
  assert.ok(app.includes('DEMO_BAR_SHELL_PADDING'), 'القشرة لا تشتقّ الحشوة من الشريط');
  assert.equal(/pb-28/.test(app), false, 'عاد رقمُ الحشوة المنسوخ إلى القشرة');
  assert.equal(/'7rem'/.test(app), false, 'عاد ارتفاعُ الشريط منسوخًا في القشرة');
  assert.match(DEMO_BAR_SHELL_PADDING, /^\d+(\.\d+)?rem$/);
});

test('الفاصلةُ لا تنفصل عن آخر كلمةٍ من آيتها', () => {
  const html = sheet();
  assert.equal((html.match(/class="mizan-sheet-tail"/g) || []).length, AYAT.length, 'لكلّ آيةٍ وحدةٌ تضمّ آخرَ كلمةٍ وفاصلتها');
  const plain = html.replace(/<[^>]+>/g, '');
  for (const a of AYAT) {
    const last = a.text.split(' ').pop()!;
    /* مسافةٌ لا تنكسر (U+00A0) بين الكلمة ورقم الآية — لا مسافةٌ عاديّة يجوز الكسرُ عندها. */
    assert.ok(plain.includes(`${last}\u00A0${arabicIndicDigits(a.ayah)}`), `الكلمة «${last}» لا تلتصق بفاصلتها`);
  }
});
