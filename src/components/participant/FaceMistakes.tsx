import React from 'react';
import type { Mistake, MistakeKind } from '../../lib/recitation-diff';

/*
 * مواضعُ الخطأ على الوجه — وهي غيرُ العلامات، وفرقُها ليس في الشكل.
 *
 * علاماتُ `FaceMarks` **وصفٌ** لما جرى: «لبثتَ»، «رجعتَ». وهي لا تقول صوابًا ولا
 * خطأً، لأنّ مسارَها يعرف **أين** بلغ الطالبُ ولا يعرف **ماذا** قال.
 *
 * وهذه **حكم**: «لم تُسمع هذه الكلمة»، «سُمع غيرُها». ولا تُعرض إلا بإذنٍ مقيس —
 * تقريرُ قياسٍ لمحرّكٍ على رواية الطالب بعينها. وبغير الإذن لا تُعرض ولا تُحسب.
 *
 * ولذلك تُكتب هنا بأدبٍ مقصود:
 *
 *  ـ لا يُقال «أخطأتَ» بل يُقال **ما سُمع**: «لم تُسمع»، «سُمع غيرُها». فالمحرّكُ قد
 *    يخطئ، ونسبةُ خطئه مكتوبةٌ في تقريره لا مخفيّة.
 *  ـ ولا أحمرَ صارخ: خطٌّ تحت الكلمة لا صبغٌ يطمسها — فالمصحفُ يُقرأ ولا يُلوَّن
 *    بالحمرة تحت عين حافظ.
 *  ـ ويُقال صراحةً تحت الوجه إنّ هذا سماعُ محرّكٍ لا حكمُ لجنة.
 */

export interface FaceMistakeStyle {
  ar: string;
  en: string;
  hintAr: string;
  hintEn: string;
  glyph: string;
  tint: string;
}

/*
 * وكلُّ `tint` يُرسم خطًّا تحت كلمةٍ على أرضيّة المصحف (#f7f5ef)، فلا ينزل عن ٣:١ —
 * حدُّ WCAG للعناصر الرسوميّة. وله حارسٌ يفحص هذا الجدولَ نفسَه، لأنّ حارسَ التباين
 * العامَّ يقرأ `text-[#…]` ولا يرى لونًا يُكتب في `style`.
 */
export const FACE_MISTAKE_STYLE: Record<MistakeKind, FaceMistakeStyle> = {
  skipped: {
    ar: 'لم تُسمع', en: 'Not heard',
    hintAr: 'لم يسمع المحرّكُ هذه الكلمة بين ما قبلها وما بعدها. وقد تكون أُسقطت، وقد يكون الصوتُ لم يبلغه.',
    hintEn: 'The engine did not hear this word between the ones around it — it may have been skipped, or the audio may not have carried.',
    glyph: '␣', tint: '#8C2F22',
  },
  substituted: {
    ar: 'سُمع غيرُها', en: 'Heard otherwise',
    hintAr: 'سمع المحرّكُ في موضعها كلمةً أخرى. وهذا موضعُ المراجعة، لا حكمَ عليك.',
    hintEn: 'The engine heard a different word in this place — a place to check, not a verdict.',
    glyph: '≠', tint: '#A3341F',
  },
  tashkeel: {
    ar: 'شكلٌ مختلف', en: 'Different vowels',
    hintAr: 'الكلمةُ نفسُها وشكلُها مختلف. وهذا أضعفُ ما يُقال، ولا يُعرض إلا لمحرّكٍ قِيس على روايتك بعينها.',
    hintEn: 'The same word with different vowels — the weakest claim here, and only shown for an engine measured on your own riwayah.',
    glyph: 'ِ', tint: '#4A5A86',
  },
  added: {
    ar: 'كلمةٌ زائدة', en: 'Extra word',
    hintAr: 'سمع المحرّكُ كلمةً ليست في الوجه. وأكثرُ ما يأتي هذا من ضجيجٍ أو صدًى، فلا يُصوَّت عليه.',
    hintEn: 'The engine heard a word that is not on this face — most often noise or echo, so it is never sounded.',
    glyph: '＋', tint: '#5C5A52',
  },
};

/** ترتيبُ الأهمّية حين تجتمع على كلمةٍ واحدة: أقواها دلالةً أوّلًا. */
const PRIORITY: MistakeKind[] = ['skipped', 'substituted', 'tashkeel', 'added'];

export function mistakesByWord(mistakes: readonly Mistake[]): Map<number, Mistake[]> {
  const out = new Map<number, Mistake[]>();
  for (const mistake of mistakes) {
    if (mistake.wordIndex === null) continue;
    const list = out.get(mistake.wordIndex);
    if (list) list.push(mistake); else out.set(mistake.wordIndex, [mistake]);
  }
  return out;
}

export function primaryMistake(mistakes: readonly Mistake[]): Mistake | null {
  for (const kind of PRIORITY) {
    const found = mistakes.find(m => m.kind === kind);
    if (found) return found;
  }
  return null;
}

/** كلماتٌ سُمعت ولا موضعَ لها في الوجه — تُعدّ ولا تُعلَّم على كلمةٍ بعينها. */
export const addedCount = (mistakes: readonly Mistake[]) => mistakes.filter(m => m.wordIndex === null).length;

export const FaceMistakeLegend: React.FC<{ mistakes: readonly Mistake[]; ar: boolean }> = ({ mistakes, ar }) => {
  const kinds = PRIORITY.filter(kind => mistakes.some(m => m.kind === kind));
  if (!kinds.length) return null;
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10px] font-bold text-[#5f6663]" data-mistake-legend={kinds.length}>
      {kinds.map(kind => {
        const style = FACE_MISTAKE_STYLE[kind];
        const count = mistakes.filter(m => m.kind === kind).length;
        return (
          <li key={kind} className="inline-flex items-center gap-1.5" title={ar ? style.hintAr : style.hintEn}>
            <span aria-hidden="true" className="inline-block h-[3px] w-4 rounded-full" style={{ background: style.tint }} />
            <span>{ar ? style.ar : style.en}</span>
            <span className="tabular-nums opacity-70" dir="ltr">{count}</span>
          </li>
        );
      })}
    </ul>
  );
};
