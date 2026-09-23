import React from 'react';
import { GitBranch } from 'lucide-react';
import { arabicIndicDigits } from '../judge/AyahMark';

/*
 * «دخلتَ على نظيرتها» — بطاقةُ المفترق.
 *
 * أشدُّ ما يُتعب الحافظ ليس الكلمةَ المنسيّة بل الآيةَ المتشابهة: عبارةٌ مشتركة، ثمّ
 * تفترق الآيتان بكلمة. فإن قال كلمةَ الأخرى فالتصحيحُ بالكلمة وحدها ناقص — يعود فيقع
 * فيها غدًا. البطاقةُ تُريه المفترقَ نفسَه: العبارةَ المشتركة، ثم الطريقين جنبًا إلى جنب،
 * واسمَ الآية التي انتقل إليها. هكذا يُحفظ الفرق لا الكلمة.
 *
 * ولا حكمَ هنا ولا لومَ: «سُمع» لا «أخطأت» — فالمحرّكُ قد يخطئ السمع.
 */

export interface SimilarSlip {
  /** موضعُ المفترق في الوجه. */
  wordIndex: number;
  /** العبارةُ المشتركة قبل المفترق. */
  shared: string;
  /** كلمةُ آيته هنا. */
  expected: string;
  /** الكلمةُ التي سُمعت — كلمةُ الآية النظيرة. */
  heard: string;
  surah: number;
  ayah: number;
  surahName?: string;
}

export const SimilarSlipCard: React.FC<{ slip: SimilarSlip; ar: boolean }> = ({ slip, ar }) => {
  const where = ar
    ? `${slip.surahName ? `سورة ${slip.surahName}` : `السورة ${arabicIndicDigits(slip.surah)}`} · الآية ${arabicIndicDigits(slip.ayah)}`
    : `${slip.surahName ?? `Surah ${slip.surah}`} · ayah ${slip.ayah}`;
  return (
    <aside className="mizan-slip-card" role="status" aria-live="polite" data-similar-slip={slip.wordIndex}>
      <div className="mizan-slip-card__head">
        <span className="mizan-slip-card__icon" aria-hidden="true"><GitBranch className="h-4 w-4" /></span>
        <div className="min-w-0">
          <div className="mizan-slip-card__title">{ar ? 'انتقلتَ إلى آيةٍ متشابهة' : 'You slid into a similar ayah'}</div>
          <div className="mizan-slip-card__where">{ar ? `سُمعت كلمةُ ${where}` : `Heard the word of ${where}`}</div>
        </div>
      </div>
      <div className="mizan-slip-card__fork" dir="rtl">
        <span className="mizan-slip-card__shared font-quran">{slip.shared}</span>
        <span className="mizan-slip-card__branches">
          <span className="mizan-slip-card__branch is-yours">
            <em>{ar ? 'في آيتك' : 'Your ayah'}</em>
            <b className="font-quran">{slip.expected}</b>
          </span>
          <span className="mizan-slip-card__branch is-other">
            <em>{ar ? 'في نظيرتها' : 'Its twin'}</em>
            <b className="font-quran">{slip.heard}</b>
          </span>
        </span>
      </div>
    </aside>
  );
};
