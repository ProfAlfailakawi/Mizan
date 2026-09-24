import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Highlighter } from 'lucide-react';
import { AyahMark, arabicIndicDigits } from './AyahMark';
import { TajweedAyah, TajweedAyahWords, TajweedLegend, type TajweedSpan } from './TajweedText';
import { splitAyahWords } from '../../lib/word-timing';

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
  /**
   * داخل قمرة المحكّم: الورقةُ على قدر وجه المصحف نفسه — بنسبة الصفحة وعددِ صفحات المقطع —
   * ويُقاس الخطُّ ليدخل المقطعُ كلُّه فيها بلا تمرير. وبغيابه تبقى الورقةُ كما كانت.
   */
  frame?: { pageAspect: number; pages: number } | null;
  /** لونُ التظليل: تلاوةٌ مرجعيّة تُسمع، أو قارئٌ حيٌّ يُتبَع، أو موضعٌ ممسوكٌ حتى يُستعاد. */
  tone?: 'audio' | 'track' | 'held';
}

/* ألوانُ التظليل هي ألوانُ عدسة الصفحة نفسها، فلا يتعلّم المحكّمُ لونين لمعنى واحد. */
const TONE: Record<'audio' | 'track' | 'held', { ayah: string; word: string }> = {
  audio: { ayah: 'rgba(226,180,92,.20)', word: 'rgba(226,180,92,.42)' },
  track: { ayah: 'rgba(95,163,135,.16)', word: 'rgba(95,163,135,.38)' },
  held: { ayah: 'rgba(139,134,118,.12)', word: 'rgba(139,134,118,.26)' },
};

const MIN_FONT = 12;
const MAX_FONT = 46;

/*
 * أكبرُ خطٍّ يدخل به المقطعُ كلُّه في الورقة — بحثٌ ثنائيّ على القياس الفعليّ.
 *
 * كانت الورقةُ بخطٍّ ثابت وارتفاعٍ أقصى، فإذا طال المقطعُ فاض: شريطُ تمرير، وسطورٌ تحت
 * الحاشية، والحاشيةُ الذهبيّة تقطع النصّ. والآن يُجرَّب الخطُّ على الورقة نفسها حتى يدخل.
 */
function useFitFont(frameOn: boolean, deps: unknown[]) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const fit = useCallback(() => {
    const box = boxRef.current, text = textRef.current;
    if (!frameOn || !box || !text || !box.clientHeight || !box.clientWidth) return;
    const fits = (px: number) => {
      text.style.fontSize = `${px}px`;
      return text.scrollHeight <= box.clientHeight + 1 && text.scrollWidth <= box.clientWidth + 1;
    };
    let lo = MIN_FONT, hi = MAX_FONT;
    if (fits(hi)) lo = hi;
    else for (let i = 0; i < 12 && hi - lo > 0.25; i += 1) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    const px = Math.floor(lo * 4) / 4;
    text.style.fontSize = `${px}px`;
    setSize(px);
  }, [frameOn]);
  useLayoutEffect(fit, [fit, ...deps]);
  useEffect(() => {
    if (!frameOn || typeof ResizeObserver === 'undefined' || !boxRef.current) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(boxRef.current);
    /* الخطُّ القرآنيّ يصل بعد الرسم الأوّل، فيتغيّر عرضُ الكلمات: يُقاس ثانيةً حين يصل. */
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
    void fonts?.ready.then(() => fit());
    fonts?.addEventListener?.('loadingdone', fit);
    return () => { ro.disconnect(); fonts?.removeEventListener?.('loadingdone', fit); };
  }, [fit, frameOn]);
  return { boxRef, textRef, size };
}

/* الورقةُ على قدر الوجه: كما تُقاس صورةُ الصفحة في `OfficialPage` تمامًا. */
function useFrameBox(frame: MushafSheetProps['frame']) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!frame || !el || typeof ResizeObserver === 'undefined') { setBox(null); return; }
    const measure = () => {
      const cs = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const h = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (w <= 0 || h <= 0) return;
      const pages = Math.max(1, frame.pages), gap = 16 * (pages - 1);
      const height = Math.floor(Math.min(h, (w - gap) / pages / frame.pageAspect));
      const width = Math.floor(Math.min(w, height * frame.pageAspect * pages + gap));
      setBox(b => (b && b.width === width && b.height === height ? b : { width, height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [frame?.pageAspect, frame?.pages]);
  return { bodyRef, box };
}

/*
 * الآيةُ وفاصلتُها لا تفترقان.
 *
 * كانت الفاصلةُ تُلحق بعد مسافةٍ عادية، فيجوز للسطر أن ينكسر بينهما: تنزل الفاصلةُ وحدها
 * أوّلَ السطر التالي — وذلك لا يكون في مصحفٍ قطّ. فتُضمّ آخرُ كلمةٍ والفاصلةُ في وحدةٍ لا
 * تنكسر، ويبقى ما قبلها يجري على السطور كما هو، بأحكام تجويده في مواضعها.
 */
const clip = (spans: TajweedSpan[] | undefined, from: number, to: number) =>
  (spans || []).filter(x => x.end > from && x.start < to)
    .map(x => ({ ...x, start: Math.max(0, x.start - from), end: Math.min(to, x.end) - from }));

const AyahWithMark: React.FC<{
  text: string; spans?: TajweedSpan[]; tajweedOn: boolean;
  words?: { index: number; start: number; end: number }[]; activeWord: number; mark: React.ReactNode;
}> = ({ text, spans, tajweedOn, words, activeWord, mark }) => {
  const all = words && words.length ? words : splitAyahWords(text);
  const last = all[all.length - 1];
  if (!last) return <><TajweedAyah text={text} spans={spans} enabled={tajweedOn} />{' '}{mark}</>;
  const head = text.slice(0, last.start);
  const tail = text.slice(last.start);
  const tailActive = activeWord === last.index;
  return (
    <>
      {words && words.length
        ? <TajweedAyahWords text={head} spans={clip(spans, 0, last.start)} enabled={tajweedOn} words={all.slice(0, -1)} activeWord={activeWord} />
        : <TajweedAyah text={head} spans={clip(spans, 0, last.start)} enabled={tajweedOn} />}
      <span className="mizan-sheet-tail">
        <span data-word={last.index} data-active-word={tailActive ? 'true' : undefined} className={tailActive ? 'rounded-md' : undefined}
          style={tailActive ? { background: 'var(--mizan-word, #dCe9e1)', boxShadow: '0 0 0 1px var(--mizan-word, #bcd6c9)' } : undefined}>
          <TajweedAyah text={tail} spans={clip(spans, last.start, text.length)} enabled={tajweedOn} />
        </span>
        {'\u00A0'}{mark}
      </span>
    </>
  );
};

export const MushafSheet: React.FC<MushafSheetProps> = ({
  ar, surahName, startAyah, endAyah, loci = [], ayat, fallbackText = '',
  officialFont = false, activeAyah = null, activeWords = [], activeWordIndex = -1,
  tajweedOn, onToggleTajweed, tajweedScopeNote, loaded, frame = null, tone = 'audio',
}) => {
  const allTajweed = ayat ? ayat.flatMap(a => a.tajweed || []) : [];
  const range = ar
    ? `${arabicIndicDigits(startAyah)} — ${arabicIndicDigits(endAyah)}`
    : `${startAyah} — ${endAyah}`;
  const place = loci
    .map(x => `${ar ? 'ص' : 'p.'}${ar ? arabicIndicDigits(x.page) : x.page} · ${ar ? 'س' : 'L'}${ar ? arabicIndicDigits(x.lineStart) : x.lineStart}${x.lineEnd !== x.lineStart ? `–${ar ? arabicIndicDigits(x.lineEnd) : x.lineEnd}` : ''}`)
    .join(' | ');
  const framed = !!frame;
  const { bodyRef, box } = useFrameBox(frame);
  const textKey = ayat ? ayat.map(a => `${a.ayah}:${a.text.length}`).join('|') : fallbackText;
  const { boxRef, textRef, size } = useFitFont(framed && !!box, [box?.width, box?.height, textKey, tajweedOn, officialFont, allTajweed.length]);
  /* المقطعُ القصير لا يملأ الوجه ولو بأكبر خطّ: يُوسَّط، فالضبطُ على العرض يفرّق كلماته. */
  const short = size !== null && size >= MAX_FONT - 0.5;
  const colors = TONE[tone];

  const text = (
    <div
      ref={textRef}
      data-fill={framed ? (short ? 'short' : 'full') : undefined}
      className={framed
        ? 'mizan-mushaf-sheet__text font-quran text-[#202622]'
        : 'font-quran text-center text-[1.7rem] sm:text-[2.45rem] leading-[2.5] text-[#202622]'}
      style={officialFont ? { fontFamily: '"MIZAN KFGQPC Official"' } : undefined}
    >
      {ayat
        ? ayat.map((a, i) => (
          <React.Fragment key={a.ayah}>
            {i ? ' ' : ''}
            {/* التظليلُ لونٌ بلا حشوة: لا يزيح حرفًا، فلا ينكسر سطرٌ حين يمرّ القلم. */}
            <span
              data-ayah={a.ayah}
              data-active-ayah={a.ayah === activeAyah ? tone : undefined}
              className="mizan-sheet-ayah transition-colors duration-300"
              style={a.ayah === activeAyah ? { background: colors.ayah, ['--mizan-word' as string]: colors.word } : undefined}
            >
              <AyahWithMark text={a.text} spans={a.tajweed} tajweedOn={tajweedOn}
                words={a.ayah === activeAyah && activeWords.length ? activeWords : undefined}
                activeWord={a.ayah === activeAyah ? activeWordIndex : -1}
                mark={<AyahMark ayah={a.ayah} active={a.ayah === activeAyah} ar={ar} />} />
            </span>
          </React.Fragment>
        ))
        : fallbackText}
    </div>
  );

  const tools = ayat && allTajweed.length > 0 && (
    <div className={framed ? 'mizan-mushaf-sheet__tools' : 'mt-6 flex flex-col items-center gap-2.5'}>
      <button
        type="button" onClick={onToggleTajweed} aria-pressed={tajweedOn}
        className="min-h-11 px-3.5 inline-flex items-center gap-2 rounded-xl border border-[#e0dcd2] text-[9px] font-black text-[#59615c] hover:bg-[#f7f5ef]"
      >
        <Highlighter className="w-3.5 h-3.5" />
        {tajweedOn ? (ar ? 'إخفاء أحكام التجويد' : 'Hide tajweed') : (ar ? 'إظهار أحكام التجويد' : 'Show tajweed')}
      </button>
      {tajweedOn && <TajweedLegend spans={allTajweed} ar={ar} />}
      {tajweedOn && tajweedScopeNote && !framed && (
        <p className="max-w-xl text-center text-[9px] leading-5 text-[#636864]">{tajweedScopeNote}</p>
      )}
    </div>
  );

  const foot = (!loaded || place) && (
    <div className={framed ? 'mizan-mushaf-sheet__foot' : 'mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[9px] text-[#666b68]'}>
      {!loaded && <span>{ar ? 'جارٍ تحميل أصل الصفحة…' : 'Loading the page master…'}</span>}
      {place && <span className="font-black text-[#8A7438]" dir={ar ? 'rtl' : 'ltr'}>{place}</span>}
    </div>
  );

  const band = (
    <div className="mizan-mushaf-band">
      <span className="mizan-mushaf-band__name">
        {surahName ? (ar ? `سُورَةُ ${surahName}` : surahName) : '—'}
      </span>
      <span className="mizan-mushaf-band__range" dir={ar ? 'rtl' : 'ltr'}>
        {ar ? `الآيات ${range}` : `Ayat ${range}`}
      </span>
    </div>
  );

  if (framed) {
    return (
      <div ref={bodyRef} className="mizan-mushaf-body relative p-2 sm:p-3" data-sheet-frame={box ? 'fit' : 'measuring'}>
        <div className="mizan-mushaf-sheet mizan-mushaf-sheet--framed mx-auto" style={box ? { width: box.width, height: box.height } : { visibility: 'hidden' }}>
          {band}
          <div ref={boxRef} className="mizan-mushaf-sheet__page">{text}</div>
          {tools}
          {foot}
        </div>
      </div>
    );
  }

  return (
    <div className="mizan-mushaf-body px-3 sm:px-8 py-5 sm:py-9">
      <div className="mizan-mushaf-sheet mx-auto max-w-4xl">
        {band}
        {text}
        {tools}
        {foot}
      </div>
    </div>
  );
};
