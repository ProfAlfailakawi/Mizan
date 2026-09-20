import React, { useMemo } from 'react';
import { AyahMark, arabicIndicDigits } from '../judge/AyahMark';
import { FaceMarkLegend, FACE_MARK_STYLE, markTint, marksByWord, primaryMark } from './FaceMarks';
import type { FaceMark, FaceIndices } from '../../lib/face-reading';

/*
 * الوجهُ يُلوَّن بتلاوته — والصفحةُ نفسُها هي التقرير.
 *
 * التقريرُ الذي يُعرض جدولَ أرقامٍ تحت الصفحة يُقرأ مرّةً ويُنسى. والذي يُرسَم **على
 * الصفحة** يبقى: يرى الطالبُ حفظَه مصبوغًا، فيعرف بنظرةٍ أين انساب وأين شقّ عليه،
 * ويعود إلى الموضع بعينه لا إلى «الوجه كلِّه».
 *
 * وحدٌّ لا يُتجاوز: **النصُّ أولى من العلامة**. الصبغُ لا يزيد على ٣٨٪ شفافيّةً، ولا
 * علامةَ تُكتب فوق الحرف، ولا يُغيَّر رسمُ الكلمة ولا تُزاد فيها حركة. العلامةُ طبقةٌ
 * فوق النصّ كما كانت فاصلةُ الآية — لا حرفٌ يُدسّ فيه.
 */

export interface FaceWord {
  /** فهرسُ الكلمة العامّ في الوجه — هو نفسُه الذي يعدّه المحرّك. */
  index: number;
  text: string;
  surah: number;
  ayah: number;
  /** آخرُ كلمةٍ في الآية: بعدها تُرسم الفاصلة. */
  endsAyah: boolean;
}

export interface MushafFaceSurfaceProps {
  ar: boolean;
  page: number;
  surahName?: string;
  words: readonly FaceWord[];
  /** العلاماتُ بعد التلاوة. وقبلها تكون فارغةً فيُعرض الوجهُ نظيفًا. */
  marks?: readonly FaceMark[];
  indices?: FaceIndices;
  /** سببُ اختيار هذا الوجه — يُقال للطالب فلا يظنّ الجهازَ يلاحقه. */
  choiceNote?: string;
  /** حين لا يعمل التحليلُ العميق: يُقال السببُ ولا يُتظاهر. */
  analysisNote?: string;
  officialFont?: boolean;
}

export const MushafFaceSurface: React.FC<MushafFaceSurfaceProps> = ({
  ar, page, surahName, words, marks = [], indices, choiceNote, analysisNote, officialFont = false,
}) => {
  const index = useMemo(() => marksByWord(marks), [marks]);
  const pageLabel = ar ? arabicIndicDigits(page) : String(page);

  return (
    <section className="mizan-mushaf-sheet mx-auto max-w-4xl" aria-label={ar ? `وجه المصحف ${pageLabel}` : `Mushaf face ${page}`}>
      <header className="mizan-mushaf-band">
        <span className="mizan-mushaf-band__name">{surahName ? (ar ? `سُورَةُ ${surahName}` : surahName) : '—'}</span>
        <span className="mizan-mushaf-band__range" dir={ar ? 'rtl' : 'ltr'}>
          {ar ? `وجه ${pageLabel}` : `Face ${page}`}
        </span>
      </header>

      <div
        className="font-quran text-center text-[1.55rem] leading-[2.6] text-[#202622] sm:text-[2.1rem]"
        style={officialFont ? { fontFamily: '"MIZAN KFGQPC Official"' } : undefined}
        data-face-words={words.length}
      >
        {words.map(word => {
          const wordMarks = index.get(word.index) || [];
          const top = primaryMark(wordMarks);
          const style = top ? FACE_MARK_STYLE[top.kind] : null;
          return (
            <React.Fragment key={word.index}>
              <span
                data-word={word.index}
                data-mark={top?.kind}
                title={style ? (ar ? style.hintAr : style.hintEn) : undefined}
                className="mizan-face-word"
                style={top ? { background: markTint(top), boxShadow: `0 1.5px 0 ${style!.tint}66` } : undefined}
              >
                {word.text}
                {style && <span className="sr-only">{` — ${ar ? style.hintAr : style.hintEn}`}</span>}
              </span>
              {word.endsAyah && <AyahMark ayah={word.ayah} ar={ar} />}
              {' '}
            </React.Fragment>
          );
        })}
      </div>

      {analysisNote && (
        <p className="mt-6 rounded-2xl border border-[#e8d6b8] bg-[#fdf6e8] p-3.5 text-center text-[11px] font-bold leading-6 text-[#6b4f18]">
          {analysisNote}
        </p>
      )}

      {!!marks.length && <div className="mt-6"><FaceMarkLegend marks={marks} ar={ar} /></div>}

      {indices && <FaceIndicesRow indices={indices} ar={ar} />}

      {choiceNote && (
        <p className="mt-4 text-center text-[10px] leading-5 text-[#6b716d]">{choiceNote}</p>
      )}

      <p className="mt-5 text-center text-[10px] leading-5 text-[#6b716d]">
        {ar
          ? 'وصفٌ لتلاوتك أنت، لا درجة ولا حكم على صوابها. والنظام يعرف أين بلغتَ وكم بَعُد صوتُك عن المرجع، ولا يعرف ماذا قلت.'
          : 'A description of your own run — never a score, and never a verdict on correctness.'}
      </p>
    </section>
  );
};

/*
 * المؤشّراتُ أعدادٌ تُسمّي ما تعدّه — ولا تُجمع في رقمٍ واحد.
 *
 * وكلُّ خانةٍ تحمل عددَها الخامَ إلى جانب أيّ نسبةٍ تُعرض، فلا يُقرأ «٨٠٪» بلا أن
 * يُعرف من كم. والنسبةُ تُحسب هنا للعرض وحده ولا تُخزَّن ولا تُبنى عليها ذاكرة.
 */
const FaceIndicesRow: React.FC<{ indices: FaceIndices; ar: boolean }> = ({ indices, ar }) => {
  const cells: { key: string; label: string; value: string; note?: string }[] = [
    {
      key: 'traversed',
      label: ar ? 'كلماتٌ بلغها المحرّك' : 'words tracked',
      value: `${indices.traversed} / ${indices.expected}`,
    },
    {
      key: 'steadiness',
      label: ar ? 'انقطاعُ الأثر' : 'tracking lost',
      value: indices.totalFrames > 0 ? `${indices.lostFrames} / ${indices.totalFrames}` : '—',
      note: ar ? 'إطارًا صوتيًّا' : 'audio frames',
    },
    {
      key: 'returns',
      label: ar ? 'إعادةٌ وتخطٍّ' : 'repeats & skips',
      value: `${indices.repeats} · ${indices.skips}`,
    },
    {
      key: 'attention',
      label: ar ? 'مواضعُ شدّةٍ والتباس' : 'strain & similar',
      value: `${indices.strainedWords} · ${indices.confusableWords}`,
    },
  ];
  return (
    <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {cells.map(cell => (
        <div key={cell.key} data-index={cell.key} className="rounded-2xl bg-[#f4f2ec] p-3 text-center">
          <dd className="text-sm font-black tabular-nums text-[#39423d]" dir="ltr">{cell.value}</dd>
          <dt className="mt-0.5 text-[10px] leading-4 text-[#5f6663]">{cell.label}</dt>
          {cell.note && <div className="text-[9px] text-[#6b716d]">{cell.note}</div>}
        </div>
      ))}
    </dl>
  );
};
