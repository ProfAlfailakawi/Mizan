import React, { useMemo } from 'react';
import { BookMarked, Flame, Target } from 'lucide-react';
import { arabicIndicDigits } from '../judge/AyahMark';
import { surahNameArabic } from '../../lib/quran-canon';
import type { FaceAttempt, AttemptWordKind } from '../../lib/face-memory';
import { hardWords, journeySummary, JUZ_START_PAGES, neediestPage, pageMemory, type Ledger, type PageState } from '../../lib/hifz-journey';

/*
 * «رحلةُ حفظك» — خريطةُ المصحف كلِّه من تلاواتك، وسلسلةُ أيّامك، وكلماتُك الصعبة.
 *
 * كلُّها من ذاكرة جهازك وحده: لا صوتَ يُحفظ، ولا يصل الخادمَ منها شيء، ولا درجة. والصفحةُ
 * التي في نطاقك تُضغط فتُتلى الآن؛ وما خارج نطاقك يُرى ولا يُفتح.
 */

const STATE_LABEL: Record<PageState | 'none', [string, string]> = {
  strong: ['متينة', 'Solid'],
  review: ['تحتاج مراجعة', 'Needs review'],
  weak: ['ضعيفة — أعِد إليها', 'Weak — return to it'],
  none: ['لم تُتلَ بعد', 'Not recited yet'],
};

const KIND_LABEL: Record<AttemptWordKind, [string, string]> = {
  skipped: ['سقطت', 'skipped'],
  substituted: ['أُبدلت', 'replaced'],
  added: ['زِيد قبلها', 'added'],
  vowel: ['حركة', 'vowel'],
  tajweed: ['تجويد', 'tajweed'],
  letter: ['حرف', 'letter'],
  repeat: ['أعدتَ', 'repeated'],
  confusable: ['متشابه', 'similar ayah'],
};

function ago(ms: number, now: number, ar: boolean): string {
  const days = Math.floor((now - ms) / 86_400_000);
  if (days <= 0) return ar ? 'اليوم' : 'today';
  if (days === 1) return ar ? 'أمس' : 'yesterday';
  return ar ? `قبل ${arabicIndicDigits(days)} أيّام` : `${days} days ago`;
}

export const HifzJourney: React.FC<{
  ar: boolean;
  attempts: readonly FaceAttempt[];
  /** سجلُّ الرحلة الدائم (ما وراء ذاكرة السحب القصيرة). */
  ledger?: Ledger;
  /** صفحاتُ نطاقك التي تُتلى هنا. */
  practisable: ReadonlySet<number>;
  onPractise: (page: number) => void;
  /** الوجهُ المعروضُ الآن — يُعلَّم على الخريطة. */
  current?: number;
  now?: number;
}> = ({ ar, attempts, ledger, practisable, onPractise, current, now = Date.now() }) => {
  const memory = useMemo(() => pageMemory(attempts, now, ledger), [attempts, now, ledger]);
  const summary = useMemo(() => journeySummary(attempts, now, ledger), [attempts, now, ledger]);
  const hard = useMemo(() => hardWords(attempts, now), [attempts, now]);
  const n = (x: number) => (ar ? arabicIndicDigits(x) : String(x));
  if (!attempts.length && !Object.keys(ledger?.pages ?? {}).length) return null;

  const neediest = neediestPage(attempts, now, practisable, current, ledger);

  return (
    <details className="mizan-journey" data-hifz-journey>
      <summary className="mizan-journey__summary">
        <span className="mizan-journey__icon" aria-hidden="true"><BookMarked className="h-4 w-4" /></span>
        <span className="mizan-journey__title">{ar ? 'رحلةُ حفظك' : 'Your hifz journey'}</span>
        <span className="mizan-journey__stats">
          {summary.streak > 0 && (
            <span data-streak={summary.streak}><Flame className="h-3.5 w-3.5" aria-hidden="true" />{ar ? `${n(summary.streak)} ${summary.streak === 1 ? 'يوم' : 'أيّام'} متتالية` : `${summary.streak}-day streak`}</span>
          )}
          <span>{ar ? `${n(summary.pages)} وجهًا تُلي` : `${summary.pages} faces recited`}</span>
          {summary.weak > 0 && <span className="mizan-journey__weak">{ar ? `${n(summary.weak)} تحتاج عودة` : `${summary.weak} to revisit`}</span>}
        </span>
      </summary>

      <div className="mizan-journey__body">
        <div className="mizan-journey__legend" aria-hidden="true">
          {(['strong', 'review', 'weak', 'none'] as const).map(s => (
            <span key={s}><i className={`mizan-journey__swatch is-${s}`} />{ar ? STATE_LABEL[s][0] : STATE_LABEL[s][1]}</span>
          ))}
        </div>

        {neediest !== null && (
          <button type="button" className="mizan-journey__neediest" data-neediest={neediest} onClick={() => onPractise(neediest)}>
            <Target className="h-4 w-4" aria-hidden="true" />
            {ar ? `راجِع أحوجَ صفحةٍ إليك — صفحة ${arabicIndicDigits(neediest)}` : `Review the page that needs you most — page ${neediest}`}
          </button>
        )}

        <div className="mizan-journey__map" aria-label={ar ? 'خريطة المصحف: كلّ سطرٍ جزء، وكلّ مربّعٍ صفحة' : 'Mushaf map: each row a juz, each square a page'}>
          {JUZ_START_PAGES.map((start, k) => {
            const end = k + 1 < JUZ_START_PAGES.length ? JUZ_START_PAGES[k + 1] - 1 : 604;
            return (
              <div key={start} className="mizan-journey__juz" data-juz={k + 1}>
                <span className="mizan-journey__juz-no" aria-hidden="true">{n(k + 1)}</span>
                <div className="mizan-journey__cells">
                  {Array.from({ length: end - start + 1 }, (_, j) => start + j).map(page => {
                    const m = memory.get(page);
                    const state: PageState | 'none' = m?.state ?? 'none';
                    const open = practisable.has(page);
                    const label = ar
                      ? `صفحة ${arabicIndicDigits(page)} · الجزء ${arabicIndicDigits(k + 1)} · ${STATE_LABEL[state][0]}${m ? ` · تُليت ${m.attempts === 1 ? 'مرّة' : m.attempts === 2 ? 'مرّتين' : `${arabicIndicDigits(m.attempts)} ${m.attempts <= 10 ? 'مرّات' : 'مرّة'}`}، آخرها ${ago(m.lastAt, now, true)}` : ''}`
                      : `Page ${page} · juz ${k + 1} · ${STATE_LABEL[state][1]}${m ? ` · ${m.attempts}×, last ${ago(m.lastAt, now, false)}` : ''}`;
                    return (
                      <button key={page} type="button" disabled={!open} title={label} aria-label={label}
                        data-page={page} data-state={state} data-current={page === current ? '' : undefined}
                        aria-current={page === current ? 'page' : undefined}
                        className={`mizan-journey__cell is-${state}${page === current ? ' is-current' : ''}`}
                        onClick={() => onPractise(page)} />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mizan-journey__hint">
          {ar ? 'اضغط صفحةً من نطاقك لتتلوها الآن. والخريطةُ من تلاواتك في هذا الجهاز وحده.' : 'Tap a page in your range to recite it now. Built from this device only.'}
        </p>

        {hard.length > 0 && (
          <section className="mizan-journey__hard" data-hard-words={hard.length}>
            <h4><Target className="h-4 w-4" aria-hidden="true" />{ar ? 'كلماتُك الصعبة' : 'Your hard words'}</h4>
            <p className="mizan-journey__hint">{ar ? 'تعثّرتَ فيها أكثرَ من مرّة. ما أتقنته بعدُ ينزل وحده.' : 'You stumbled on these more than once. What you master drops off by itself.'}</p>
            <ol>
              {hard.map(h => (
                <li key={`${h.page}:${h.index}`} data-hard-word={`${h.page}:${h.index}`}>
                  <span className="mizan-journey__word font-quran">{h.text}</span>
                  <span className="mizan-journey__where">
                    {ar
                      ? `${surahNameArabic(h.surah) || `السورة ${arabicIndicDigits(h.surah)}`} · الآية ${arabicIndicDigits(h.ayah)} · ${h.times === 2 ? 'مرّتين' : `${arabicIndicDigits(h.times)} ${h.times <= 10 ? 'مرّات' : 'مرّة'}`} · آخرها ${ago(h.lastAt, now, true)}`
                      : `${h.surah}:${h.ayah} · ${h.times}× · last ${ago(h.lastAt, now, false)}`}
                  </span>
                  <span className="mizan-journey__kinds">{h.kinds.map(k => (ar ? KIND_LABEL[k][0] : KIND_LABEL[k][1])).join(ar ? '، ' : ', ')}</span>
                  {practisable.has(h.page) && (
                    <button type="button" className="mizan-journey__go" onClick={() => onPractise(h.page)} data-practise-page={h.page}>
                      {ar ? 'تدرّب على وجهها' : 'Practise its face'}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </details>
  );
};
