import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MushafFaceSurface, type FaceWord, type MushafFaceSurfaceProps } from '../src/components/participant/MushafFaceSurface';
import { FACE_MARK_STYLE, markTint, primaryMark } from '../src/components/participant/FaceMarks';
import type { FaceMark } from '../src/lib/face-reading';

/*
 * الوجهُ يُلوَّن بتلاوته — ويُقاس بالتصيير، لا بقراءة نصّ الشيفرة.
 *
 * وخطران يُحرسان: أن يُطمس النصُّ القرآنيّ تحت الصبغ، وأن تُقال للطالب كلمةُ حكمٍ
 * («أخطأت») حيث لم يقع إلا قياسُ مسافةٍ صوتيّة.
 */

const words: FaceWord[] = [
  { index: 0, text: 'ٱلْحَمْدُ', surah: 1, ayah: 2, endsAyah: false },
  { index: 1, text: 'لِلَّهِ', surah: 1, ayah: 2, endsAyah: false },
  { index: 2, text: 'رَبِّ', surah: 1, ayah: 2, endsAyah: false },
  { index: 3, text: 'ٱلْعَٰلَمِينَ', surah: 1, ayah: 2, endsAyah: true },
  { index: 4, text: 'ٱلرَّحْمَٰنِ', surah: 1, ayah: 3, endsAyah: false },
  { index: 5, text: 'ٱلرَّحِيمِ', surah: 1, ayah: 3, endsAyah: true },
];

const render = (over: Partial<MushafFaceSurfaceProps> = {}) =>
  renderToStaticMarkup(React.createElement(MushafFaceSurface, {
    ar: true, page: 1, surahName: 'الفاتحة', words, ...over,
  }));

const visibleText = (markup: string) =>
  markup.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('الوجهُ يُعرض كاملًا وكلماتُه بفهارسها التي يعدّها المحرّك', () => {
  const html = render();
  assert.match(html, /data-face-words="6"/);
  for (const w of words) {
    assert.ok(html.includes(`data-word="${w.index}"`), `الكلمة ${w.index} لم تُعرض`);
    assert.ok(html.includes(w.text), `نصُّ الكلمة ${w.index} تغيّر`);
  }
});

test('فاصلةُ الآية تُرسم عند نهايتها وحدها', () => {
  const html = render();
  const marks = [...html.matchAll(/class="mizan-ayah-mark"[^>]*data-ayah="(\d+)"|data-ayah="(\d+)"[^>]*class="mizan-ayah-mark"/g)]
    .map(m => Number(m[1] ?? m[2]));
  assert.deepEqual(marks, [2, 3], `فواصل: ${JSON.stringify(marks)}`);
});

test('وجهٌ قبل التلاوة يُعرض نظيفًا — لا صبغَ ولا دليل', () => {
  const html = render();
  assert.equal(/data-mark=/.test(html), false, 'ظهرت علامةٌ بلا تلاوة');
  assert.equal(/data-legend=/.test(html), false, 'ظهر دليلُ علاماتٍ بلا علامات');
});

test('العلامةُ تصبغ كلمتَها هي ولا تمسّ سواها', () => {
  const marks: FaceMark[] = [{ word: 2, kind: 'repeat', intensity: 1 }];
  const html = render({ marks });
  assert.match(html, /data-word="2"[^>]*data-mark="repeat"/);
  assert.equal(/data-word="1"[^>]*data-mark=/.test(html), false, 'صُبغت كلمةٌ مجاورة');
  assert.match(html, /data-legend="repeat"/);
});

test('النصُّ أولى من العلامة: الصبغُ لا يطمسه', () => {
  /* ٣٨٪ حدٌّ أقصى — وما فوقه يجعل الرسمَ العثمانيَّ عسيرَ القراءة. */
  const strongest = markTint({ word: 0, kind: 'strain', intensity: 1 })!;
  const alpha = parseInt(strongest.slice(-2), 16) / 255;
  /* والتسامحُ خطوةُ قناةٍ واحدة (١/٢٥٥): الشفافيّةُ تُكتب بايتًا فتُقرّب إليه. */
  assert.ok(alpha <= 0.38 + 1 / 255, `شفافيّةُ الصبغ ${alpha}`);
  const faintest = markTint({ word: 0, kind: 'strain', intensity: 0 })!;
  assert.ok(parseInt(faintest.slice(-2), 16) / 255 >= 0.1, 'علامةٌ ضعيفةٌ اختفت تمامًا');
  /* والنصُّ يبقى كما هو حرفًا بحرف تحت أشدّ صبغ. */
  const html = render({ marks: words.map(w => ({ word: w.index, kind: 'strain' as const, intensity: 1 })) });
  for (const w of words) assert.ok(html.includes(w.text), `نصُّ ${w.index} تغيّر تحت الصبغ`);
});

test('علاماتٌ كثيرةٌ على كلمةٍ واحدة: تُعرض أدلُّها ولا تُكدَّس', () => {
  const marks: FaceMark[] = [
    { word: 1, kind: 'strain', intensity: 1 },
    { word: 1, kind: 'confusable', intensity: 0.3, rival: 900 },
    { word: 1, kind: 'dwell', intensity: 1 },
  ];
  assert.equal(primaryMark(marks)!.kind, 'confusable', 'لم تُقدَّم أدلُّ العلامات على الحفظ');
  const html = render({ marks });
  const onWord = [...html.matchAll(/data-word="1"[^>]*data-mark="([a-z]+)"/g)].map(m => m[1]);
  assert.deepEqual(onWord, ['confusable'], `كُدِّست ${onWord.length} علاماتٍ على كلمة`);
  /* والدليلُ أسفل الوجه يذكرها كلَّها — فلا يضيع ما قِيس. */
  for (const kind of ['strain', 'confusable', 'dwell']) assert.match(html, new RegExp(`data-legend="${kind}"`));
});

test('لا كلمةَ حكمٍ في وجه الطالب — وصفٌ لا تخطئة', () => {
  /*
   * وأوّلُ صياغةٍ لهذا الحارس منعت كلمةَ «خطأ» من الصفحة كلِّها، فسقطت على **التنبيه
   * الذي ينفيه**: «وليس هذا حكمًا بخطأ». فصار الفحصُ على ما يخصّ: **أسماءُ العلامات**
   * التي يقرؤها الطالبُ بنظرة، ونصُّ الذيل. أمّا الشرحُ فله أن يذكر الخطأ لينفيه.
   */
  const marks: FaceMark[] = [
    { word: 0, kind: 'strain', intensity: 1 }, { word: 1, kind: 'repeat', intensity: 1 },
    { word: 2, kind: 'skip', intensity: 1 }, { word: 3, kind: 'confusable', intensity: 1, rival: 5 },
    { word: 4, kind: 'lost', intensity: 1 }, { word: 5, kind: 'dwell', intensity: 1 },
  ];
  const verdicts = ['خطأ', 'أخطأ', 'صحيح', 'صواب', 'درجة', 'ممتاز', 'ضعيف', 'راسب', 'ناجح'];

  /* ١) اسمُ كلّ علامةٍ وصفٌ لفعلٍ وقع، لا حكمٌ عليه. */
  for (const style of Object.values(FACE_MARK_STYLE)) {
    for (const verdict of verdicts) {
      assert.equal(style.ar.includes(verdict), false, `اسمُ العلامة «${style.ar}» حكمٌ لا وصف`);
    }
  }

  /* ٢) وكلُّ شرحٍ يذكر «خطأ» فإنما يذكره لينفيه — لا ليُثبته. */
  for (const style of Object.values(FACE_MARK_STYLE)) {
    if (!style.hintAr.includes('خطأ') && !style.hintAr.includes('الخطأ')) continue;
    assert.match(style.hintAr, /ليس|وليس|لا يعرف|قد يكون/, `شرحُ «${style.ar}» يذكر الخطأ ولا ينفيه`);
  }

  /* ٣) وذيلُ الصفحة يقول حدَّ ما يعرفه النظام، ويقول إنه ليس درجة. */
  const text = visibleText(render({
    marks,
    indices: { traversed: 6, expected: 6, lostFrames: 3, totalFrames: 80, repeats: 1, skips: 1, strainedWords: 1, confusableWords: 1 },
  }));
  assert.ok(text.includes('لا درجة'), 'لم يُقل للطالب إنه وصفٌ لا درجة');
  assert.ok(text.includes('ولا يعرف ماذا قلت'), 'لم يُقل حدُّ ما يعرفه النظام');
  assert.ok(text.includes('لا حكم على صوابها'), 'لم يُنفَ الحكمُ على الصواب');
});

test('المؤشّراتُ تُعرض بأعدادها الخام — لا نسبةً مجرّدة', () => {
  const html = render({
    indices: { traversed: 48, expected: 60, lostFrames: 12, totalFrames: 400, repeats: 2, skips: 1, strainedWords: 5, confusableWords: 3 },
  });
  const text = visibleText(html);
  assert.ok(text.includes('48 / 60'), 'عددُ الكلمات لم يُعرض من كم');
  assert.ok(text.includes('12 / 400'), 'الانقطاعُ عُرض بلا مقامه');
  assert.equal(/\d+%/.test(text), false, 'ظهرت نسبةٌ مئويّة');
  for (const key of ['traversed', 'steadiness', 'returns', 'attention']) {
    assert.match(html, new RegExp(`data-index="${key}"`));
  }
});

test('حين لا يعمل التحليلُ يُقال السبب، ولا يُتظاهر بتلاوةٍ حُلّلت', () => {
  const html = render({ analysisNote: 'التحليلُ العميق يحتاج تلاوةً مرجعيّةً لروايتك، وهي غيرُ متوفّرةٍ بعد.' });
  assert.ok(visibleText(html).includes('غيرُ متوفّرةٍ بعد'));
  assert.equal(/data-mark=/.test(html), false, 'عُرضت علاماتٌ مع تعذُّر التحليل');
});

test('سببُ اختيار الوجه يُقال — فلا يظنّ الطالبُ الجهازَ يلاحقه', () => {
  const html = render({ choiceNote: 'عُدتَ إليه لأنك أعدتَ فيه في قراءةٍ سابقة.' });
  assert.ok(visibleText(html).includes('أعدتَ فيه في قراءةٍ سابقة'));
});

/* مقطعُ كلمةٍ بعينها من التصيير — فلا يُقبل دليلٌ أسفلَ الوجه شاهدًا على كلمةٍ فيه. */
const wordSegment = (markup: string, index: number): string => {
  const at = markup.indexOf(`data-word="${index}"`);
  assert.notEqual(at, -1, `الكلمة ${index} لم تُعرض`);
  const next = markup.indexOf('data-word="', at + 1);
  return markup.slice(at, next === -1 ? markup.length : next);
};

test('لكلّ علامةٍ شرحٌ يبلغ اللمسَ وقارئَ الشاشة — عند كلمتها هي', () => {
  /*
   * وأوّلُ صياغةٍ لهذا الحارس اكتفت بوجود `sr-only` في الصفحة كلِّها، فمرّت طفرةُ
   * «لا شرحَ على الكلمة» خضراءَ: الدليلُ أسفلَ الوجه يحمل `sr-only` فيكفيه. فصار
   * الفحصُ في **مقطع الكلمة** وحده.
   */
  const html = render({ marks: [{ word: 3, kind: 'confusable', intensity: 1, rival: 900 }] });
  const segment = wordSegment(html, 3);
  assert.match(segment, /title="[^"]*"/, 'الشرحُ لم يبلغ اللمس عند الكلمة');
  assert.ok(segment.includes('class="sr-only"'), 'لا نصَّ لقارئ الشاشة عند الكلمة');
  assert.ok(segment.includes(FACE_MARK_STYLE.confusable.hintAr), 'شرحُ العلامة لم يُنطَق عند كلمتها');
  /* وكلمةٌ بلا علامةٍ لا تُثقَل بنصٍّ زائدٍ يقرؤه المكفوف. */
  assert.equal(wordSegment(html, 2).includes('sr-only'), false, 'كلمةٌ بلا علامةٍ حملت نصًّا خفيًّا');
});

test('حين تتكرّر العلامةُ من نوعٍ واحد تُعرض أشدُّها، لا أوّلُها ولا أضعفُها', () => {
  /*
   * فالشدّةُ هي ما يُترجَم لونًا. ولو عُرضت أضعفُ العلامتين لرأى الطالبُ موضعَ
   * شدّةٍ باهتًا، فلا يعود إليه.
   */
  const faint: FaceMark = { word: 1, kind: 'dwell', intensity: 0.1 };
  const severe: FaceMark = { word: 1, kind: 'dwell', intensity: 0.95 };
  assert.equal(primaryMark([faint, severe])!.intensity, 0.95, 'عُرضت أضعفُ العلامتين');
  assert.equal(primaryMark([severe, faint])!.intensity, 0.95, 'تُبع ترتيبُ الورود لا الشدّة');
  /* ويُقاس أثرُ ذلك في الصبغ نفسه: الأشدُّ أغمق. */
  const alphaOf = (m: FaceMark) => parseInt(markTint(m)!.slice(-2), 16);
  assert.ok(alphaOf(severe) > alphaOf(faint), 'الشدّةُ لا تُترجَم لونًا');
  const html = render({ marks: [faint, severe] });
  assert.ok(wordSegment(html, 1).includes(markTint(severe)!), 'لونُ الكلمة ليس لونَ أشدّ علاماتها');
});

/*
 * ألوانُ العلامات تُكتب في `style` لا في `text-[#…]`، وحارسُ التباين العامّ يفحص
 * الثانيةَ وحدها. فمرّت `dwell` عند ٢٫٨٥:١ على أرضيّة المصحف حتى قِيست هنا.
 */
const CANVAS = '#f7f5ef';
const channel = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = (hex: string) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

test('رموزُ العلامات تُرى على أرضيّة المصحف — ٣:١ حدُّ العناصر الرسوميّة', () => {
  for (const [kind, style] of Object.entries(FACE_MARK_STYLE)) {
    const ratio = contrast(style.tint, CANVAS);
    assert.ok(ratio >= 3, `لونُ «${kind}» (${style.tint}) عند ${ratio.toFixed(2)}:1 على أرضيّة المصحف`);
  }
});

test('لكلّ علامةٍ لونُها ورمزُها — فلا يلتبس نوعان على الطالب', () => {
  const tints = Object.values(FACE_MARK_STYLE).map(s => s.tint.toLowerCase());
  assert.equal(new Set(tints).size, tints.length, `ألوانٌ متكرّرة: ${tints.join(' ')}`);
  const glyphs = Object.values(FACE_MARK_STYLE).map(s => s.glyph);
  assert.equal(new Set(glyphs).size, glyphs.length, `رموزٌ متكرّرة: ${glyphs.join(' ')}`);
  /* واللونُ وحده لا يحمل المعنى: لكلٍّ اسمٌ وشرحٌ بالعربيّة والإنجليزيّة. */
  for (const [kind, style] of Object.entries(FACE_MARK_STYLE)) {
    for (const field of ['ar', 'en', 'hintAr', 'hintEn'] as const) {
      assert.ok(style[field].trim().length > 0, `«${kind}» بلا ${field}`);
    }
  }
});

test('وجهٌ يحمل خاتمةَ سورةٍ وفاتحةَ أخرى: لكلٍّ حدُّها الذي يُرى', () => {
  /*
   * ملاحظةُ مراجعةٍ آليّة (PR #243): الوجهُ قد يعبر سورتين، وعنوانٌ واحدٌ أعلاه يجعل
   * مطلعَ الثانية يُقرأ تحت اسم الأولى. والحدُّ يُشتقّ من مجرى الكلمات نفسِه — من
   * تغيّر رقم السورة — لا من عنوانٍ يوصف به الوجهُ كلُّه.
   */
  const crossing: FaceWord[] = [
    { index: 0, text: 'وَتَوَاصَوْا۟', surah: 103, ayah: 3, endsAyah: false },
    { index: 1, text: 'بِٱلصَّبْرِ', surah: 103, ayah: 3, endsAyah: true },
    { index: 2, text: 'وَيْلٌۭ', surah: 104, ayah: 1, endsAyah: false },
    { index: 3, text: 'لِّكُلِّ', surah: 104, ayah: 1, endsAyah: false },
  ];
  const html = renderToStaticMarkup(React.createElement(MushafFaceSurface, {
    ar: true, page: 601, words: crossing, surahNames: { 103: 'العَصر', 104: 'الهُمَزة' },
  }));
  const text = visibleText(html);
  assert.ok(text.includes('العَصر'), 'اسمُ السورة الأولى لم يُعرض');
  assert.ok(text.includes('الهُمَزة'), 'مطلعُ السورة الثانية بلا اسمها');
  assert.match(html, /data-surah-break="104"/, 'لا حدَّ يُرى بين السورتين');
  /* والحدُّ عند مطلع الثانية وحده — لا قبل كلّ كلمة. */
  assert.equal([...html.matchAll(/data-surah-break="/g)].length, 1, 'تكرّر الحدُّ بلا موجب');

  /* ووجهٌ في سورةٍ واحدة لا يُشقّ بحدٍّ لا معنى له. */
  const single = renderToStaticMarkup(React.createElement(MushafFaceSurface, {
    ar: true, page: 1, surahName: 'الفاتحة', words,
  }));
  assert.equal(/data-surah-break=/.test(single), false, 'شُقّ وجهٌ في سورةٍ واحدة');
});
