import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LiveMushafPage, type LiveState, type OverlayState } from './LiveMushafPage';
import type { TashkeelFinding } from '../../lib/quran-intelligence';
import { AyahMark, arabicIndicDigits } from '../judge/AyahMark';
import { FaceMarkLegend, FACE_MARK_STYLE, markTint, marksByWord, primaryMark } from './FaceMarks';
import { FaceMistakeLegend, FACE_MISTAKE_STYLE, addedCount, mistakesByWord, primaryMistake } from './FaceMistakes';
import type { FaceMark, FaceMarkKind, FaceIndices } from '../../lib/face-reading';
import type { Mistake } from '../../lib/recitation-diff';
import { fetchOfficialMushafPage, officialMushafPackageForReading } from '../../lib/kfgqpc-library';
import { useQuranFontReady } from '../../lib/quran-font';

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
  /** موضعُ الكلمة في آيتها (من واحد) — به تُعرف على سطرها في التخطيط. */
  ayahWordIndex?: number;
}

export interface MushafFaceSurfaceProps {
  ar: boolean;
  page: number;
  /** اسمُ السورة — أو أسماؤها حين يحمل الوجهُ خاتمةَ سورةٍ وفاتحةَ أخرى. */
  surahName?: string;
  surahNames?: Readonly<Record<number, string>>;
  words: readonly FaceWord[];
  /** العلاماتُ بعد التلاوة. وقبلها تكون فارغةً فيُعرض الوجهُ نظيفًا. */
  marks?: readonly FaceMark[];
  /*
   * مواضعُ الخطأ — وهي **حكم** لا وصف، فلا تُمرَّر إلا بإذنٍ مقيس.
   *
   * وغيابُها ليس «لا خطأ»: هو «لم يُحكم». ولذلك `undefined` لا `[]` حين لا إذن،
   * ومصفوفةٌ فارغةٌ حين حُكم فلم يُوجد شيء — والذيلُ أسفل الوجه يفرّق بينهما.
   */
  mistakes?: readonly Mistake[];
  indices?: FaceIndices;
  /*
   * وحدةُ القياس الزمنيّ كما هي في المسار الذي قاس فعلًا.
   *
   * المحاذاةُ المحلّيّة تعدّ إطاراتٍ صوتيّةً (عشراتُ المللي ثانية)، ومسارُ التدريب الحيّ
   * يعدّ مقاطعَ من ثانيتين. فلو سُمّيت المقاطعُ إطاراتٍ لقُرئ «٣ من ٣٠» على أنّه جزءٌ
   * من ثانية، وهو دقيقة. فتُسمّى الوحدةُ بما هي.
   */
  frameUnit?: 'frame' | 'chunk';
  /** العلاماتُ التي يقدر هذا المسارُ على قياسها — وما سواها يُقال إنّه غيرُ متاح. */
  measurableMarks?: readonly FaceMarkKind[];
  /** سببُ اختيار هذا الوجه — يُقال للطالب فلا يظنّ الجهازَ يلاحقه. */
  choiceNote?: string;
  /** حين لا يعمل التحليلُ العميق: يُقال السببُ ولا يُتظاهر. */
  analysisNote?: string;
  officialFont?: boolean;
  /** مفتاح حزمة الرواية. */
  deliveryReading?: string;
  /*
   * تصويرُ الصفحة المطبوعة بدل النصّ — وهو مطفأٌ ما لم يُطلب.
   *
   * كان يُعرض أوّلًا ما دامت طبقةُ القلم تُقاس عليه، فإن تعذّرت (وهو الغالب) نزل العرضُ إلى
   * النصّ. فكان الطالبُ يرى صورةَ المصحف المدنيّ لحظةً ثمّ تتبدّل إلى الخطّ — وقرارُ صاحب
   * المنصّة (٢٤ سبتمبر ٢٠٢٦) أنّ الخطَّ أجملُ وأنفعُ للطالب، فيُعرض من أوّل لحظة.
   */
  pageImage?: boolean;
  /** التلاوةُ الجارية: موضعُ القلم، وما تُلي، والحجاب. */
  live?: LiveState;
  /** ملاحظاتُ المعلّم بعد التلاوة (الحركاتُ والمدود). */
  notes?: readonly TashkeelFinding[];
}

export const MushafFaceSurface: React.FC<MushafFaceSurfaceProps> = ({
  ar, page, surahName, surahNames, words, marks = [], mistakes, indices, frameUnit = 'frame', measurableMarks,
  choiceNote, analysisNote, officialFont = false, deliveryReading, pageImage = false, live, notes,
}) => {
  /* ملاحظةُ المعلّم الأولى على كلّ كلمة: نوعُها يُلوِّن، ونصُّها يُقرأ عند الإشارة ولقارئ الشاشة. */
  const noteOf = useMemo(() => new Map<number, TashkeelFinding>((notes ?? []).map(n => [n.wordIndex, n] as const).reverse()), [notes]);
  const index = useMemo(() => marksByWord(marks), [marks]);
  const faults = useMemo(() => mistakesByWord(mistakes ?? []), [mistakes]);
  /* وحُكم؟ لا «أَوُجد خطأ؟» — والفرقُ بينهما هو الفرقُ بين «لم يُسمع» و«لم يُخطئ». */
  const judged = mistakes !== undefined;
  const pageLabel = ar ? arabicIndicDigits(page) : String(page);
  const nameOf = (surah: number) => surahNames?.[surah] ?? (words[0] && surah === words[0].surah ? surahName : undefined);
  /* اسمُ الشريط الأعلى: أوّلُ سورةٍ على الوجه — والتاليةُ يُعلنها شريطُها عند موضعها. */
  const openingName = words.length ? nameOf(words[0].surah) : surahName;
  const packageId = pageImage ? officialMushafPackageForReading(deliveryReading) : undefined;
  /* والكلماتُ لا تُكشف بخطٍّ احتياطيٍّ ثمّ تتبدّل: تنتظر خطَّ المصحف (بمهلةٍ قصيرة). */
  const fontReady = useQuranFontReady();
  const [officialPage,setOfficialPage]=useState<string|null>(null);
  useEffect(()=>{let live=true;let url:string|null=null;setOfficialPage(null);
    if(!packageId)return;
    void fetchOfficialMushafPage(packageId,page).then(found=>{url=found;if(live)setOfficialPage(found);else if(found)URL.revokeObjectURL(found)});
    return()=>{live=false;if(url)URL.revokeObjectURL(url)};
  },[packageId,page]);

  /*
   * الصورةُ الصامتة لا تُعرض حيث يلزم الكلام.
   *
   * كانت صورةُ الصفحة تُعرض والكلماتُ تحتها مخفيّة، فلا يرى الطالبُ قلمًا ولا أثرًا ولا
   * موضعَ مراجعة. فالطبقةُ الحيّة تُرسم فوق الصورة حيث يُعرف تخطيطُها (مصحفُ المدينة)؛
   * وحيث لا يُعرف — وثَمّ ما يُرسم — يُعرض النصُّ الحيُّ بدلها.
   */
  const overlayPossible = deliveryReading === 'hafs';
  const [overlay, setOverlay] = useState<OverlayState>('pending');
  const onOverlay = useCallback((state: OverlayState) => setOverlay(state), []);
  useEffect(() => { setOverlay('pending'); }, [officialPage]);
  const needsVoice = !!live || judged || marks.length > 0 || !!notes?.length;
  /* ما دامت الطبقةُ تُقاس تبقى الصورة (فالقياسُ يحتاجها)؛ فإن تعذّرت نزل العرضُ إلى النصّ الحيّ. */
  const showImage = !!officialPage && (!needsVoice || (overlayPossible && overlay !== 'none'));
  const reached = live?.reached ?? 0;
  const pen = live?.cursor ?? null;

  return (
    <section className="mizan-mushaf-sheet mx-auto max-w-4xl" aria-label={ar ? `وجه المصحف ${pageLabel}` : `Mushaf face ${page}`}>
      <header className="mizan-mushaf-band">
        <span className="mizan-mushaf-band__name">{openingName ? (ar ? `سُورَةُ ${openingName}` : openingName) : '—'}</span>
        <span className="mizan-mushaf-band__range" dir={ar ? 'rtl' : 'ltr'}>
          {ar ? `وجه ${pageLabel}` : `Face ${page}`}
        </span>
      </header>

      {officialPage && showImage && <div className="relative mx-auto mb-5 flex max-h-[70vh] max-w-full items-center justify-center overflow-hidden rounded-[2px] bg-[#efede6] p-2 sm:p-3" data-official-mushaf-page={page}>
        <LiveMushafPage ar={ar} page={page} url={officialPage} words={words} live={live} mistakes={mistakes} marks={marks} notes={notes}
          overlay={overlayPossible} onReady={onOverlay} />
        {marks.length>0&&<div aria-hidden className="pointer-events-none absolute inset-y-2 end-2 w-1.5 overflow-hidden rounded-full bg-black/[0.04]">{marks.slice(0,24).map((mark,i)=><span key={`${mark.word}-${mark.kind}-${i}`} className="absolute inset-x-0 rounded-full" style={{top:`${Math.max(0,Math.min(96,(mark.word/Math.max(1,words.length))*100))}%`,height:'4%',background:FACE_MARK_STYLE[mark.kind].tint}}/>)}</div>}
      </div>}
      <div
        className={`${officialPage && showImage?'sr-only':'font-quran text-center text-[1.55rem] leading-[2.6] text-[#202622] sm:text-[2.1rem]'}`}
        style={{
          ...(!(officialPage && showImage) && officialFont ? { fontFamily: '"MIZAN KFGQPC Official"' } : {}),
          ...(!(officialPage && showImage) && !fontReady ? { visibility: 'hidden' as const } : {}),
        }}
        aria-busy={!fontReady || undefined}
        data-quran-font={fontReady ? 'ready' : 'loading'}
        data-face-words={words.length}
      >
        {words.map((word, i) => {
          /*
           * وجهٌ واحدٌ قد يحمل خاتمةَ سورةٍ وفاتحةَ أخرى، فلا يُترك مطلعُ الثانية تحت
           * عنوان الأولى بلا حدٍّ يُرى. وحدُّها يُرسم حيث يتغيّر رقمُ السورة في مجرى
           * الكلمات — لا من عنوانٍ واحدٍ يُوصف به الوجهُ كلُّه.
           */
          const opensSurah = i > 0 && words[i - 1].surah !== word.surah;
          const wordMarks = index.get(word.index) || [];
          const top = primaryMark(wordMarks);
          const style = top ? FACE_MARK_STYLE[top.kind] : null;
          /*
           * والحكمُ طبقةٌ أخرى: خطٌّ تحت الكلمة لا صبغٌ يطمسها، فيجتمع الوصفُ والحكمُ
           * على كلمةٍ واحدةٍ بلا أن يحجب أحدُهما الآخر — وكلاهما يُقرأ بالصوت أيضًا.
           */
          const fault = primaryMistake(faults.get(word.index) || []);
          const faultStyle = fault ? FACE_MISTAKE_STYLE[fault.kind] : null;
          return (
            <React.Fragment key={word.index}>
              {opensSurah && (
                <span className="mizan-face-surah-break" data-surah-break={word.surah} role="separator"
                  aria-label={ar ? `بداية سورة ${nameOf(word.surah) ?? ''}`.trim() : `Start of surah ${word.surah}`}>
                  {nameOf(word.surah) ? (ar ? `سُورَةُ ${nameOf(word.surah)}` : (nameOf(word.surah) as string)) : (ar ? `سُورَةٌ جديدة` : 'New surah')}
                </span>
              )}
              <span
                data-word={word.index}
                data-live={live ? (word.index === pen ? 'pen' : word.index < reached && !fault ? 'done' : undefined) : undefined}
                data-veiled={live?.veiled && word.index >= reached && word.index !== live.hint ? 'true' : undefined}
                data-note={noteOf.get(word.index)?.kind}
                data-mark={top?.kind}
                data-mistake={fault?.kind}
                title={[style && (ar ? style.hintAr : style.hintEn), faultStyle && (ar ? faultStyle.hintAr : faultStyle.hintEn), noteOf.get(word.index) && (ar ? noteOf.get(word.index)!.messageAr : noteOf.get(word.index)!.messageEn)].filter(Boolean).join(' · ') || undefined}
                className="mizan-face-word"
                style={top || faultStyle
                  ? {
                    background: top ? markTint(top) : undefined,
                    boxShadow: [top && `0 1.5px 0 ${style!.tint}66`, faultStyle && `0 4px 0 -1px ${faultStyle.tint}`].filter(Boolean).join(', ') || undefined,
                  }
                  : undefined}
              >
                {word.text}
                {style && <span className="sr-only">{` — ${ar ? style.hintAr : style.hintEn}`}</span>}
                {faultStyle && <span className="sr-only">{` — ${ar ? faultStyle.ar : faultStyle.en}: ${ar ? faultStyle.hintAr : faultStyle.hintEn}`}</span>}
                {noteOf.get(word.index) && <span className="sr-only">{` — ${ar ? 'المعلّم' : 'Teacher'}: ${ar ? noteOf.get(word.index)!.messageAr : noteOf.get(word.index)!.messageEn}`}</span>}
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

      {judged && !!mistakes!.length && <div className="mt-3"><FaceMistakeLegend mistakes={mistakes!} ar={ar} /></div>}

      {judged && !!addedCount(mistakes!) && (
        <p className="mt-2 text-center text-[10px] leading-5 text-[#6b716d]" data-added-words={addedCount(mistakes!)}>
          {ar
            ? `وسُمعت ${addedCount(mistakes!)} كلمةً لا موضعَ لها في هذا الوجه — وأكثرُ ما يأتي هذا من ضجيجٍ أو صدًى.`
            : `${addedCount(mistakes!)} heard words have no place on this face — most often noise or echo.`}
        </p>
      )}

      {indices && <FaceIndicesRow indices={indices} ar={ar} frameUnit={frameUnit} />}

      {measurableMarks && <UnmeasurableNote measurable={measurableMarks} ar={ar} />}

      {choiceNote && (
        <p className="mt-4 text-center text-[10px] leading-5 text-[#6b716d]">{choiceNote}</p>
      )}

      {/*
        * وذيلُ الوجه يقول حدَّ ما يعرفه النظامُ الآن — وهو يتغيّر بتغيّر ما جرى فعلًا.
        *
        * فبلا إذنٍ للحكم لا يعرف النظامُ ماذا قال الطالب، ويُقال ذلك. وبإذنٍ صار
        * يسمع كلماتٍ، فقولُ «لا يعرف ماذا قلت» حينئذٍ **كذب**. ويبقى الثابتُ: لا
        * درجة، ولا حكمَ في المسابقة إلا للبشر.
        */}
      <p className="mt-5 text-center text-[10px] leading-5 text-[#6b716d]">
        {judged
          ? (ar
            ? 'وما تحته خطٌّ سمعه محرّكٌ قِيس على روايتك بعينها — سماعُ آلةٍ لا حكمُ لجنة، والآلةُ تخطئ. فما شككتَ فيه فارجع إلى مصحفك. ولا درجة هنا، والحكمُ في المسابقة للبشر وحدهم.'
            : 'The underlined words were heard by an engine measured on your own riwayah — a machine hearing, not a verdict, and machines err. Check your Mushaf where you doubt. No score here; human judges alone decide.')
          : (ar
            ? 'وصفٌ لتلاوتك أنت، لا درجة ولا حكم على صوابها. والنظام يعرف أين بلغتَ وكم بَعُد صوتُك عن المرجع، ولا يعرف ماذا قلت.'
            : 'A description of your own run — never a score, and never a verdict on correctness.')}
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
const FaceIndicesRow: React.FC<{ indices: FaceIndices; ar: boolean; frameUnit: 'frame' | 'chunk' }> = ({ indices, ar, frameUnit }) => {
  const cells: { key: string; label: string; value: string; note?: string }[] = [
    {
      /* أبعدُ ما بلغ، لا عددُ ما رُصد: القياسُ الخشنُ يرصد قليلًا ممّا قُرئ كلُّه. */
      key: 'reach',
      label: ar ? 'بلغتَ حتى الكلمة' : 'reached word',
      value: `${indices.reach} / ${indices.expected}`,
    },
    {
      key: 'steadiness',
      label: ar ? 'انقطاعُ الأثر' : 'tracking lost',
      value: indices.totalFrames > 0 ? `${indices.lostFrames} / ${indices.totalFrames}` : '—',
      note: frameUnit === 'chunk' ? (ar ? 'مقطعًا صوتيًّا' : 'audio chunks') : (ar ? 'إطارًا صوتيًّا' : 'audio frames'),
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

/*
 * ما لا يقدر هذا المسارُ على قياسه يُقال، ولا يُترك الطالبُ يظنّ أنّ خلوَّ وجهه من
 * علامةٍ شهادةٌ له بها.
 *
 * فغيابُ «موضعٍ مشابه» عن وجهٍ قِيس بمسارٍ لا يقيس التشابه ليس معناه «لم تلتبس عليك»،
 * بل «لم يُنظر في ذلك». والفرقُ بينهما هو الفرقُ بين الصدق وضدّه.
 */
const UnmeasurableNote: React.FC<{ measurable: readonly FaceMarkKind[]; ar: boolean }> = ({ measurable, ar }) => {
  const able = new Set(measurable);
  const missing = (Object.keys(FACE_MARK_STYLE) as FaceMarkKind[]).filter(k => !able.has(k));
  if (!missing.length) return null;
  const names = missing.map(k => (ar ? FACE_MARK_STYLE[k].ar : FACE_MARK_STYLE[k].en)).join(ar ? '، ' : ', ');
  return (
    <p data-unmeasurable={missing.join(',')}
      className="mt-4 rounded-2xl border border-[#dfe3e0] bg-[#f4f6f5] p-3 text-center text-[10px] font-bold leading-5 text-[#5f6663]">
      {ar
        ? `لم يُنظر في: ${names}. قياسُها يحتاج تلاوةً مرجعيّةً مُعتمدةً لروايتك، وهي غيرُ متوفّرةٍ بعد — فخلوُّ وجهك منها ليس شهادةً لك بها.`
        : `Not examined here: ${names}. These need a certified reference recitation for your reading, which is not yet available — their absence is not a verdict in your favour.`}
    </p>
  );
};

