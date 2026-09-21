import React from 'react';
import { Highlighter } from 'lucide-react';
import { AyahMark, arabicIndicDigits } from './AyahMark';
import { TajweedAyah, TajweedAyahWords, TajweedLegend, type TajweedSpan } from './TajweedText';

/*
 * عرضُ النصّ حين لا يُتاح أصلُ الصفحة.
 *
 * فُصل عن `OfficialMushafSurface` لسببين: أنه لا يجلب شيئًا — يعرض ما سُلِّم إليه — فيُقاس
 * وحده بالتصيير الحقيقي لا بقراءة نصّ شيفرته؛ وأن الفاصلة واللوحة والكرتوش صارت هيئةً
 * واحدة يشترك فيها المحكّم والمتسابق وشاشة الممرّ، فلو نُسخت في موضعين لافترقت.
 */

export interface MushafSheetAyah {
  ayah: number;
  text: string;
  tajweed?: TajweedSpan[];
}

export interface MushafSheetLocus { page: number; lineStart: number; lineEnd: number }

export interface MushafSheetProps {
  ar: boolean;
  /** اسم السورة كما تحمله الحزمة؛ لا يُخمَّن حين يغيب. */
  surahName?: string;
  startAyah: number;
  endAyah: number;
  loci?: MushafSheetLocus[];
  /** آياتُ المقطع كما سُلِّمت. حين تغيب يُعرض النصّ الخام بلا فواصل — لأن حدودها مجهولة. */
  ayat?: MushafSheetAyah[];
  fallbackText?: string;
  officialFont?: boolean;
  activeAyah?: number | null;
  activeWords?: { index: number; start: number; end: number }[];
  activeWordIndex?: number;
  tajweedOn: boolean;
  onToggleTajweed: () => void;
  tajweedScopeNote?: string;
  sourceLabel: string;
  loaded: boolean;
}

export const MushafSheet: React.FC<MushafSheetProps> = ({
  ar, surahName, startAyah, endAyah, loci = [], ayat, fallbackText = '',
  officialFont = false, activeAyah = null, activeWords = [], activeWordIndex = -1,
  tajweedOn, onToggleTajweed, tajweedScopeNote, loaded,
}) => {
  const allTajweed = ayat ? ayat.flatMap(a => a.tajweed || []) : [];
  const range = ar
    ? `${arabicIndicDigits(startAyah)} — ${arabicIndicDigits(endAyah)}`
    : `${startAyah} — ${endAyah}`;
  const place = loci
    .map(x => `${ar ? 'ص' : 'p.'}${ar ? arabicIndicDigits(x.page) : x.page} · ${ar ? 'س' : 'L'}${ar ? arabicIndicDigits(x.lineStart) : x.lineStart}${x.lineEnd !== x.lineStart ? `–${ar ? arabicIndicDigits(x.lineEnd) : x.lineEnd}` : ''}`)
    .join(' | ');

  return (
    <div className="mizan-mushaf-body px-3 sm:px-8 py-5 sm:py-9">
      <div className="mizan-mushaf-sheet mx-auto max-w-4xl">

        <div className="mizan-mushaf-band">
          <span className="mizan-mushaf-band__name">
            {surahName ? (ar ? `سُورَةُ ${surahName}` : surahName) : '—'}
          </span>
          <span className="mizan-mushaf-band__range" dir={ar ? 'rtl' : 'ltr'}>
            {ar ? `الآيات ${range}` : `Ayat ${range}`}
          </span>
        </div>

        <div
          className="font-quran text-center text-[1.7rem] sm:text-[2.45rem] leading-[2.5] text-[#202622]"
          style={officialFont ? { fontFamily: '"MIZAN KFGQPC Official"' } : undefined}
        >
          {ayat
            ? ayat.map((a, i) => (
              <React.Fragment key={a.ayah}>
                {i ? ' ' : ''}
                <span
                  data-ayah={a.ayah}
                  className={a.ayah === activeAyah
                    ? 'rounded-lg px-1.5 py-0.5 bg-[#E7EEE9] shadow-[0_0_0_2px_#d5e4dc] transition-colors duration-300'
                    : 'transition-colors duration-300'}
                >
                  {a.ayah === activeAyah && activeWords.length
                    ? <TajweedAyahWords text={a.text} spans={a.tajweed} enabled={tajweedOn} words={activeWords} activeWord={activeWordIndex} />
                    : <TajweedAyah text={a.text} spans={a.tajweed} enabled={tajweedOn} />}
                  {' '}
                  <AyahMark ayah={a.ayah} active={a.ayah === activeAyah} ar={ar} />
                </span>
              </React.Fragment>
            ))
            : fallbackText}
        </div>

        {ayat && allTajweed.length > 0 && (
          <div className="mt-6 flex flex-col items-center gap-2.5">
            <button
              type="button" onClick={onToggleTajweed} aria-pressed={tajweedOn}
              className="min-h-11 px-3.5 inline-flex items-center gap-2 rounded-xl border border-[#e0dcd2] text-[9px] font-black text-[#59615c] hover:bg-[#f7f5ef]"
            >
              <Highlighter className="w-3.5 h-3.5" />
              {tajweedOn ? (ar ? 'إخفاء أحكام التجويد' : 'Hide tajweed') : (ar ? 'إظهار أحكام التجويد' : 'Show tajweed')}
            </button>
            {tajweedOn && <TajweedLegend spans={allTajweed} ar={ar} />}
            {tajweedOn && tajweedScopeNote && (
              <p className="max-w-xl text-center text-[9px] leading-5 text-[#636864]">{tajweedScopeNote}</p>
            )}
          </div>
        )}

        {(!loaded || place) && (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[9px] text-[#666b68]">
            {!loaded && <span>{ar ? 'جارٍ تحميل أصل الصفحة…' : 'Loading the page master…'}</span>}
            {place && <span className="font-black text-[#8A7438]" dir={ar ? 'rtl' : 'ltr'}>{place}</span>}
          </div>
        )}

      </div>
    </div>
  );
};
