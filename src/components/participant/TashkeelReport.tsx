import React from 'react';
import { BookOpenCheck, Loader2, Mic, RotateCcw, Square, Volume2 } from 'lucide-react';
import type { TashkeelBenchmark, TashkeelFinding, TashkeelKind, TashkeelMode } from '../../lib/quran-intelligence';
import type { UnclearAyah } from '../../lib/tashkeel-run';
import { arabicIndicDigits } from '../judge/AyahMark';

/*
 * تقريرُ المعلّم — الحركاتُ والمدودُ بعد التلاوة.
 *
 * يُقال للطالب ما سمعه المعلّمُ بعربيّةٍ مفهومة، على الكلمة نفسها: «الجيم: حركتُها فتحة،
 * وسُمعت ضمّة»، «المدّ المنفصل: مقدارُه ٤ حركات، وسُمع نحو ٢». ولا رسمَ صوتيَّ يُعرض،
 * ولا درجة، ولا «أخطأت»: «سُمع» — فالآلةُ قد تخطئ السمع، وتُقال حدودُها تحت التقرير.
 *
 * وكلُّ حالٍ تُقال كما هي: يُحلَّل، يستعدّ، انتهى بلا ملاحظة، لم يتّضح بعضُه، غيرُ متاحٍ
 * لروايتك — فالصمتُ عن الحال يُقرأ براءةً وليس كذلك.
 */

export type TashkeelPhase = 'idle' | 'analysing' | 'warming' | 'done' | 'unavailable' | 'failed';

export interface TashkeelState {
  phase: TashkeelPhase;
  /** مقاطعُ أُرسلت وعادت / مجموعُها. */
  done: number;
  total: number;
  findings: TashkeelFinding[];
  /** آياتٌ راجعها المعلّم فعلًا، وآياتٌ لم يتّضح صوتُها. */
  reviewed: number;
  unclear: number;
  /** الآياتُ التي لم يُحكم عليها، بأسبابها — ولكلٍّ «أعِدها». */
  unclearAyat: UnclearAyah[];
  /** «تجريبي» ما لم يُقَس؛ و«مفتوح» بتقرير قياسٍ اجتاز شروطه (وأرقامُه). */
  mode?: TashkeelMode;
  benchmark?: TashkeelBenchmark;
  note?: string;
}

export const EMPTY_TASHKEEL: TashkeelState = { phase: 'idle', done: 0, total: 0, findings: [], reviewed: 0, unclear: 0, unclearAyat: [] };

/** إعادةُ آيةٍ واحدة: تُسجَّل وحدها ثم يراجعها المعلّم، وتُدمج في التقرير نفسه. */
export interface TashkeelRetake {
  surah: number;
  ayah: number;
  phase: 'recording' | 'reviewing' | 'failed';
  seconds: number;
  note?: string;
}

/** ما يُقال للطالب في آيةٍ لم يُحكم عليها — سببُها وما يفعل. */
export function unclearReason(reason: string, ar: boolean): string {
  switch (reason) {
    case 'LOW_CONFIDENCE':
      return ar ? 'لم يتّضح صوتُها للمعلّم — اقترب من الميكروفون، في مكانٍ هادئ، واقرأها بتؤدة.' : 'Not clear enough — move closer to the mic, somewhere quiet, and recite steadily.';
    case 'TOO_MANY_DIFFERENCES':
      return ar ? 'سُمع فيها ما يخالفها كثيرًا — لعلّك قرأت غيرَها، أو تداخلت أصوات.' : 'Much of what was heard differs from it — perhaps another ayah, or overlapping voices.';
    case 'AUDIO_TOO_SHORT':
      return ar ? 'مقطعُها قصيرٌ جدًّا — اقرأها كاملةً.' : 'Too short — recite it in full.';
    case 'NOT_HEARD':
      return ar ? 'لم يُسمع منها ما يكفي لمراجعتها.' : 'Too little of it was heard to review.';
    default:
      return ar ? 'تعذّرت مراجعتُها تقنيًّا.' : 'It could not be reviewed for a technical reason.';
  }
}

/* ألوانُ الأنواع — كلٌّ بلونه ورمزه، ولا يُعتمد على اللون وحده. */
export const TASHKEEL_STYLE: Record<TashkeelKind, { ar: string; en: string; tint: string; glyph: string }> = {
  tashkeel: { ar: 'حركة', en: 'Vowel', tint: '#4A5A86', glyph: 'ـَ' },
  tajweed: { ar: 'تجويد', en: 'Tajweed', tint: '#7A4EA3', glyph: '〰' },
  letter: { ar: 'حرف', en: 'Letter', tint: '#A3341F', glyph: 'ح' },
};

/** سببُ التعذّر بكلامٍ يفهمه الطالب — ولا يُعرض رمزُ خطأ. */
export function tashkeelFailureNote(code: string, ar: boolean): string {
  if (/TEXT_MISMATCH/.test(code)) return ar ? 'نصُّ هذا الوجه لا يطابق مصحفَ حفص المعتمد في الخادم، فلم يُراجَع.' : 'This face does not match the certified Hafs text on the server, so it was not reviewed.';
  if (/SCOPE_MISMATCH/.test(code)) return ar ? 'هذا الوجهُ خارج نطاقك المعتمد، فلم يُراجَع.' : 'This face is outside your approved range.';
  if (/AUDIO_INVALID|BODY_TOO_LARGE|HTTP_413/.test(code)) return ar ? 'التلاوةُ أطولُ من أن تُراجَع مرّةً واحدة — اقرأ وجهًا أقصر أو جزءًا منه.' : 'The recitation is too long to review at once.';
  if (/HTTP_429|RATE/.test(code)) return ar ? 'كثُرت المراجعاتُ في وقتٍ قصير — أعِد بعد دقيقة.' : 'Too many reviews in a short time — retry in a minute.';
  if (/WARMING/.test(code)) return ar ? 'لم يستيقظ المعلّمُ في المهلة — أعِد بعد قليل.' : 'The Teacher did not wake in time — retry shortly.';
  return ar ? 'تعذّر الوصولُ إلى المعلّم الآن — ما وصل من ملاحظاتٍ باقٍ، ولك أن تعيد.' : 'The Teacher could not be reached — notes already received remain; you may retry.';
}

export const TASHKEEL_HAFS_ONLY_NOTE = (ar: boolean) => ar
  ? 'المعلّمُ يراجع الحركاتِ والمدودَ لرواية حفص وحدها الآن؛ فنموذجُه مبنيٌّ على رسمها الصوتيّ، ولا يُقاس قارئُ روايةٍ بمسطرة أخرى. وتلاوتُك تُراجَع بالكلمات كما ترى.'
  : 'The Teacher reviews vowels and madd for Hafs only for now; your reading is reviewed word by word as shown.';

interface Props {
  ar: boolean;
  state: TashkeelState;
  /** نصُّ الكلمة بفهرسها في الوجه، ورقمُ آيتها. */
  wordOf: (index: number) => { text: string; ayah: number } | undefined;
  onRetry?: () => void;
  /** «استمع لتلاوتك هنا»: الكلمةُ بصوت الطالب من تسجيله في ذاكرة الصفحة — حيث يُعرف زمنُها. */
  canListen?: (index: number) => boolean;
  onListen?: (index: number) => void;
  /** «القارئ»: الكلمةُ نفسُها من تلاوة المرجع (حفص). */
  canHearReference?: (index: number) => boolean;
  onHearReference?: (index: number) => void;
  /** «أعِد هذه الآية». */
  retake?: TashkeelRetake | null;
  onRetake?: (ayah: UnclearAyah) => void;
  onRetakeStop?: () => void;
}

export const TashkeelReport: React.FC<Props> = ({ ar, state, wordOf, onRetry, canListen, onListen, canHearReference, onHearReference, retake, onRetake, onRetakeStop }) => {
  if (state.phase === 'idle') return null;
  const n = (v: number) => (ar ? arabicIndicDigits(v) : String(v));

  if (state.phase === 'unavailable') {
    return state.note ? (
      <p className="mizan-tashkeel-note" data-tashkeel="unavailable">{state.note}</p>
    ) : null;
  }

  const byAyah = new Map<number, { finding: TashkeelFinding; word?: { text: string; ayah: number } }[]>();
  for (const finding of state.findings) {
    const word = wordOf(finding.wordIndex);
    const ayah = word?.ayah ?? 0;
    byAyah.set(ayah, [...(byAyah.get(ayah) ?? []), { finding, word }]);
  }
  const counts = (kind: TashkeelKind) => state.findings.filter(f => f.kind === kind).length;

  return (
    <section className="mizan-tashkeel" data-tashkeel={state.phase} aria-live="polite">
      <header className="mizan-tashkeel__head">
        <span className="mizan-tashkeel__icon" aria-hidden="true">
          {state.phase === 'analysing' || state.phase === 'warming' ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="mizan-tashkeel__title">
            {ar ? 'المعلّم: الحركاتُ والمدود' : 'The Teacher: vowels and madd'}
            {state.mode === 'trial' && <span className="mizan-tashkeel__badge" data-tashkeel-mode="trial">{ar ? 'تجريبي — قيد القياس' : 'Trial — being measured'}</span>}
            {state.mode === 'open' && <span className="mizan-tashkeel__badge" data-tashkeel-mode="open">{ar ? 'مقيس' : 'Measured'}</span>}
          </h3>
          <p className="mizan-tashkeel__sub">
            {state.phase === 'warming' && (ar ? 'المعلّمُ يستعدّ — أوّلُ مراجعةٍ بعد سكونٍ تأخذ دقيقةً أو نحوها.' : 'The Teacher is waking — the first review after idle takes about a minute.')}
            {state.phase === 'analysing' && (ar ? `يراجع آيةً آية… ${n(state.done)} من ${n(state.total)}` : `Reviewing ayah by ayah… ${state.done} of ${state.total}`)}
            {state.phase === 'failed' && (state.note || (ar ? 'تعذّرت المراجعةُ الآن.' : 'The review could not run now.'))}
            {state.phase === 'done' && (state.findings.length
              ? (ar ? `راجع ${n(state.reviewed)} ${state.reviewed === 1 ? 'آية' : 'آيات'}، وله ${n(state.findings.length)} ${state.findings.length === 1 ? 'ملاحظة' : 'ملاحظات'}.` : `Reviewed ${state.reviewed} ayat — ${state.findings.length} notes.`)
              : (ar ? `راجع ${n(state.reviewed)} ${state.reviewed === 1 ? 'آية' : 'آيات'} ولم يجد ملاحظةً في الحركات ولا المدود على ما سمعه.` : `Reviewed ${state.reviewed} ayat — no vowel or madd notes on what it heard.`))}
          </p>
        </div>
        {state.phase === 'failed' && onRetry && (
          <button type="button" onClick={onRetry} className="mizan-tashkeel__retry">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />{ar ? 'أعِد' : 'Retry'}
          </button>
        )}
      </header>

      {state.phase === 'analysing' && state.total > 0 && (
        <div className="mizan-tashkeel__bar" role="progressbar" aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={state.done}>
          <span style={{ width: `${Math.round((state.done / state.total) * 100)}%` }} />
        </div>
      )}

      {state.findings.length > 0 && (
        <>
          <div className="mizan-tashkeel__legend">
            {(['tashkeel', 'tajweed', 'letter'] as TashkeelKind[]).filter(k => counts(k)).map(k => (
              <span key={k} className="mizan-tashkeel__chip" style={{ ['--k' as string]: TASHKEEL_STYLE[k].tint }}>
                {ar ? TASHKEEL_STYLE[k].ar : TASHKEEL_STYLE[k].en} · {n(counts(k))}
              </span>
            ))}
          </div>
          <ol className="mizan-tashkeel__list">
            {[...byAyah.entries()].sort((a, b) => a[0] - b[0]).map(([ayah, rows]) => (
              <li key={ayah} className="mizan-tashkeel__ayah">
                <div className="mizan-tashkeel__ayah-no">{ar ? `الآية ${n(ayah)}` : `Ayah ${ayah}`}</div>
                <ul>
                  {rows.map(({ finding, word }, i) => (
                    <li key={`${finding.wordIndex}-${i}`} className="mizan-tashkeel__row" data-kind={finding.kind} style={{ ['--k' as string]: TASHKEEL_STYLE[finding.kind].tint }}>
                      <span className="mizan-tashkeel__word font-quran">{word?.text ?? '—'}</span>
                      <span className="mizan-tashkeel__kind">{ar ? TASHKEEL_STYLE[finding.kind].ar : TASHKEEL_STYLE[finding.kind].en}</span>
                      <span className="mizan-tashkeel__msg">{ar ? finding.messageAr : finding.messageEn}</span>
                      <span className="mizan-tashkeel__hear">
                        {onListen && canListen?.(finding.wordIndex) && (
                          <button type="button" className="mizan-tashkeel__listen" data-listen-word={finding.wordIndex}
                            onClick={() => onListen(finding.wordIndex)} aria-label={ar ? `استمع لتلاوتك: ${word?.text ?? ''}` : `Hear your recitation: ${word?.text ?? ''}`}>
                            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />{ar ? 'تلاوتك' : 'You'}
                          </button>
                        )}
                        {onHearReference && canHearReference?.(finding.wordIndex) && (
                          <button type="button" className="mizan-tashkeel__listen" data-reference-word={finding.wordIndex}
                            onClick={() => onHearReference(finding.wordIndex)} aria-label={ar ? `استمع للقارئ: ${word?.text ?? ''}` : `Hear the reciter: ${word?.text ?? ''}`}>
                            <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />{ar ? 'القارئ' : 'Reciter'}
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}

      {(state.phase === 'done' || state.phase === 'failed') && state.unclearAyat.length > 0 && (
        <div className="mizan-tashkeel__unclear" data-unclear-ayat={state.unclearAyat.length}>
          <div className="mizan-tashkeel__ayah-no">{ar ? 'لم يحكم عليها المعلّم — لا يُقال فيها صوابٌ ولا خطأ' : 'Not reviewed — nothing is said about these'}</div>
          <ul>
            {state.unclearAyat.map(u => {
              const mine = retake && retake.surah === u.surah && retake.ayah === u.ayah ? retake : null;
              return (
                <li key={`${u.surah}:${u.ayah}`} className="mizan-tashkeel__unclear-row" data-unclear-reason={u.reason}>
                  <span className="mizan-tashkeel__kind">{ar ? `الآية ${n(u.ayah)}` : `Ayah ${u.ayah}`}</span>
                  <span className="mizan-tashkeel__msg">
                    {mine?.phase === 'recording' ? (ar ? `اقرأ الآية ${n(u.ayah)} الآن… ${n(mine.seconds)} ث` : `Recite ayah ${u.ayah} now… ${mine.seconds}s`)
                      : mine?.phase === 'reviewing' ? (ar ? 'يراجعها المعلّم…' : 'The Teacher is reviewing it…')
                      : mine?.phase === 'failed' ? (mine.note || unclearReason(u.reason, ar))
                      : unclearReason(u.reason, ar)}
                  </span>
                  {mine?.phase === 'recording' && onRetakeStop
                    ? <button type="button" className="mizan-tashkeel__retry" data-retake-stop onClick={onRetakeStop}><Square className="h-3.5 w-3.5" aria-hidden="true" />{ar ? 'انتهيت' : 'Done'}</button>
                    : mine?.phase === 'reviewing' ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
                    : onRetake && <button type="button" className="mizan-tashkeel__retry" data-retake={`${u.surah}:${u.ayah}`} disabled={!!retake && retake.phase !== 'failed'} onClick={() => onRetake(u)}><Mic className="h-3.5 w-3.5" aria-hidden="true" />{ar ? 'أعِد هذه الآية' : 'Recite again'}</button>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {state.mode === 'open' && state.benchmark && (
        <p className="mizan-tashkeel__foot" data-benchmark>
          {ar
            ? `مقيسٌ على تلاوات ${n(state.benchmark.reciters)} من كبار القرّاء (${n(state.benchmark.words)} كلمة): ملاحظاتٌ كاذبة ${(state.benchmark.falseAlarmRate * 100).toFixed(2)}٪، ويرى ${Math.round(state.benchmark.substitutionRecall * 100)}٪ من زلّات المتشابه.`
            : `Measured on ${state.benchmark.reciters} master reciters: ${(state.benchmark.falseAlarmRate * 100).toFixed(2)}% false notes; catches ${Math.round(state.benchmark.substitutionRecall * 100)}% of similar-ayah slips.`}
        </p>
      )}
      {state.mode === 'trial' && state.phase === 'done' && (
        <p className="mizan-tashkeel__foot" data-trial>
          {ar ? 'المعلّمُ في طور القياس: ملاحظاتُه للتدريب، ولم تُعتمد بعدُ بتقرير دقّة.' : 'The Teacher is still being measured: its notes are for practice and not yet certified.'}
        </p>
      )}
      {state.phase === 'done' && (
        <p className="mizan-tashkeel__foot">
          {ar
            ? 'سماعُ آلةٍ لروايةِ حفص، لا حكمُ شيخ: المدودُ تُعدّ تقريبًا («نحو»)، وما يجيزه حفصٌ من أوجه المدّ لا يُعدّ خطأ. فما شككتَ فيه فاعرضه على معلّمك. ولا درجة هنا، ولا يُحفظ صوتُك.'
            : 'A machine hearing for Hafs, not a teacher’s verdict: madd lengths are approximate and every length Hafs permits is accepted. Check doubts with your teacher. No score, and your voice is not stored.'}
        </p>
      )}
    </section>
  );
};
