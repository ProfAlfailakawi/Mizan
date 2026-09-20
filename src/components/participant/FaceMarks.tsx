import React from 'react';
import type { FaceMark, FaceMarkKind } from '../../lib/face-reading';

/*
 * العلاماتُ على الوجه — كلُّ واحدةٍ تُسمّي ما قِيس، لا ما يُستنتج.
 *
 * وهذا الملفُّ هو الحدُّ الذي يقف عنده الصدق. ما قبله أرقامٌ، وما بعده كلامٌ يقرؤه
 * طالبٌ يحفظ كتاب الله ويصدّقه. فلا يُكتب هنا «أخطأتَ» ولا «أحسنتَ» — بل ما جرى:
 * «رجعتَ وأعدتَ»، «بَعُد صوتُك عن المرجع»، «كِدتَ تنتقل إلى موضعٍ مشابه».
 *
 * والألوانُ كذلك: لا أحمرَ صارخٌ يقول «خطأ»، بل تدرّجٌ ترابيٌّ يقول «هنا شيء». فمن
 * يرى حفظَه مصبوغًا بالأحمر ينكسر، ومن يراه متدرّجًا يعرف أين يعود.
 */

export interface FaceMarkStyle {
  ar: string;
  en: string;
  /* شرحٌ يقول ما قِيس بالضبط — يبلغ اللمسَ وقارئَ الشاشة. */
  hintAr: string;
  hintEn: string;
  glyph: string;
  tint: string;
}

/*
 * وكلُّ `tint` هنا يُرسم رمزًا على أرضيّة المصحف الفاتحة (#f7f5ef)، فلا ينزل عن
 * ٣:١ — وهو حدُّ WCAG للعناصر الرسوميّة. وقد سقطت `dwell` أوّلَ مرّةٍ عند ٢٫٨٥:١
 * لأنّ حارسَ التباينِ يفحص `text-[#…]` ولا يرى لونًا يُكتب في `style`. فصار له
 * حارسٌ يفحص هذا الجدولَ نفسَه.
 */
export const FACE_MARK_STYLE: Record<FaceMarkKind, FaceMarkStyle> = {
  repeat: {
    ar: 'أعدتَ', en: 'Repeated',
    hintAr: 'رجع المحرّك إلى هذه الكلمة بعد أن تجاوزها — أي أعدتَ من هنا.',
    hintEn: 'The engine returned to this word after passing it — you went back here.',
    glyph: '↺', tint: '#8A5A2B',
  },
  skip: {
    ar: 'تخطّيتَ', en: 'Skipped',
    hintAr: 'وصل المحرّك إلى هذه الكلمة من كلمةٍ قبلها بغير تتابع — أي تُرك ما بينهما.',
    hintEn: 'The engine arrived here out of sequence — what lay between was passed over.',
    glyph: '⤴', tint: '#9B3B2F',
  },
  confusable: {
    ar: 'موضعٌ مشابه', en: 'Similar passage',
    hintAr: 'كان صوتُك عند هذه الكلمة قريبًا من موضعٍ آخرَ في المصحف قربًا شديدًا. وهذا موضعُ الزلل المعتاد عند الحفّاظ.',
    hintEn: 'Your audio here was nearly as close to another passage as to this one — the classic slip.',
    glyph: '⇄', tint: '#7A5AA3',
  },
  lost: {
    ar: 'انقطع الأثر', en: 'Tracking lost',
    hintAr: 'لم يعد المحرّك يعرف أين أنت. وقد يكون توقّفًا وقد يكون خفوتَ صوت — انظر وضوحَ الصوت قبل أن تحكم على حفظك.',
    hintEn: 'The engine stopped knowing where you were — a pause, or a quiet microphone.',
    glyph: '○', tint: '#6B7280',
  },
  dwell: {
    ar: 'لبثتَ', en: 'Dwelt',
    hintAr: 'بقيتَ عند هذه الكلمة أطولَ من بقيّة تلاوتك في هذه الجلسة.',
    hintEn: 'You stayed on this word longer than the rest of this run.',
    glyph: '◍', tint: '#3A7370',
  },
  strain: {
    ar: 'بَعُد صوتُك', en: 'Drifted',
    hintAr: 'بَعُد صوتُك عن التلاوة المرجعية هنا أكثرَ من بقيّة تلاوتك. وليس هذا حكمًا بخطأ: يرفعه الخطأُ ويرفعه أيضًا خفوتُ الصوت والضجيج.',
    hintEn: 'Your audio was further from the reference here than elsewhere — not a verdict of error.',
    glyph: '◐', tint: '#9B7542',
  },
};

/** ترتيبُ الأهمّية حين تجتمع علاماتٌ على كلمةٍ واحدة: أدلُّها على الحفظ أوّلًا. */
const PRIORITY: FaceMarkKind[] = ['confusable', 'repeat', 'skip', 'lost', 'dwell', 'strain'];

/** أبرزُ علامةٍ على كلمة — فلا تُكدَّس ستُّ أيقوناتٍ فوق كلمةٍ واحدة. */
export function primaryMark(marks: readonly FaceMark[]): FaceMark | null {
  for (const kind of PRIORITY) {
    const found = marks.filter(m => m.kind === kind).sort((a, b) => b.intensity - a.intensity)[0];
    if (found) return found;
  }
  return null;
}

/** علاماتُ كلّ كلمة، مفهرسةً — تُبنى مرّةً لا مرّةً لكلّ كلمةٍ على الوجه. */
export function marksByWord(marks: readonly FaceMark[]): Map<number, FaceMark[]> {
  const index = new Map<number, FaceMark[]>();
  for (const mark of marks) {
    const list = index.get(mark.word);
    if (list) list.push(mark); else index.set(mark.word, [mark]);
  }
  return index;
}

/*
 * لونُ الكلمة: شفافيّةٌ تتدرّج بالشدّة فوق لون نوعها.
 *
 * والحدُّ الأدنى ١٢٪ فلا تختفي علامةٌ ضعيفة، والأقصى ٣٨٪ فلا يُطمس النصُّ القرآنيّ
 * تحت الصبغ. والنصُّ أولى من العلامة.
 */
export function markTint(mark: FaceMark | null): string | undefined {
  if (!mark) return undefined;
  const style = FACE_MARK_STYLE[mark.kind];
  if (!style) return undefined;
  const alpha = 0.12 + Math.max(0, Math.min(1, mark.intensity)) * 0.26;
  return `${style.tint}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

export const FaceMarkLegend: React.FC<{ marks: readonly FaceMark[]; ar: boolean }> = ({ marks, ar }) => {
  const present = PRIORITY.filter(kind => marks.some(m => m.kind === kind));
  if (!present.length) return null;
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2" aria-label={ar ? 'دليل العلامات' : 'Mark legend'}>
      {present.map(kind => {
        const style = FACE_MARK_STYLE[kind];
        const count = marks.filter(m => m.kind === kind).length;
        return (
          <li key={kind} data-legend={kind} title={ar ? style.hintAr : style.hintEn}
            className="inline-flex items-center gap-1.5 text-[10px] font-black text-[#5b6460]">
            <span aria-hidden="true" className="grid h-5 w-5 place-items-center rounded-md text-[11px]"
              style={{ background: `${style.tint}22`, color: style.tint }}>{style.glyph}</span>
            <span>{ar ? style.ar : style.en}</span>
            <span className="tabular-nums text-[#6b716d]">{count}</span>
            <span className="sr-only">{ar ? style.hintAr : style.hintEn}</span>
          </li>
        );
      })}
    </ul>
  );
};
