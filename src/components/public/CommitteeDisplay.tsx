import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, MonitorX, UsersRound, X } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { useDialogBehavior } from '../../lib/useDialogBehavior';
import { useScreenAwake } from '../../lib/use-screen-awake';
import { bilingualName } from '../../lib/ui-language';
import { Button } from '../design-system/Button';
import { QueueRibbon } from '../design-system/QueueRibbon';
import { FreshnessLine } from './WaitingBoard';
import {
  PANEL_NEXT_DEPTH, boardAge, buildDisplayBoard, categoryLine, describePanelStatus,
  describeWait, selectCommitteeSlices, venueClock, type DisplayBoard,
} from '../../lib/display-board';

/*
 * شاشة اللجنة.
 *
 * شاشة القاعة تخدم كل الحاضرين؛ وهذه تخدم من يقف أمام بابها وحده. فتعرض أقلّ، وأكبر:
 * كودًا واحدًا يملأ الشاشة، وحالةً تُقرأ من آخر الممر، وثلاثة تالين.
 *
 * وتضيف ما لا يتّسع له جدول القاعة وهو أوّل ما يسأل عنه الواقف: **أيّ لجنةٍ هذه؟** لا
 * برمزها `C7` وحده — فالرمز لا يقول شيئًا لمن جاء اليوم أوّل مرّة — بل بفئتها: «القرآن
 * كامل»، «عشرون جزءًا». الرمز للمنظّم، والفئة للمتسابق.
 *
 * وما لا تعرضه هذه الشاشة أهمّ مما تعرضه:
 *
 *   • **لا سؤال ولا موضعه.** من ينتظر خلف الباب يرى شاشة اللجنة، فعرضُ السؤال يوسّع
 *     نطاق انكشافه على من لم يُسأل بعد — وهو ما يسجّله النظام دليلَ اعتراضٍ لا يصنعه.
 *   • **لا درجة ولا خصم.** الحكم لا يُعلن قبل ختمه، وإعلانه في ممرٍّ يضغط اللجنة والتالي.
 *   • **لا اسم محكّم ولا نشاطه.** ترتيب الأفراد محظورٌ في النظام، والشاشة لا تلتفّ عليه.
 *   • **لا اسم متسابق.** الكود وحده، وهو عين ما ينادي به المنادي صوتًا.
 */

const PANEL_STORAGE_KEY = 'mizan_committee_display_panel_v1';

/** الشاشة تُعلَّق وتُنسى. جهازٌ أُعيد تشغيله فجرًا يعود إلى لجنته بلا مشرفٍ يعيد ضبطه. */
function readStoredPanels(): string[] {
  try {
    const raw = window.localStorage.getItem(PANEL_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch { return [] }
}
function writeStoredPanels(keys: string[]): void {
  try { window.localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(keys)) } catch { /* وضع خاص */ }
}

/**
 * `board` هو الإسقاط حين يأتي من وثيقةٍ منشورة — شاشةٌ بلا تسجيل دخول. وغيابه يعني
 * جهازًا مصرَّحًا يبني إسقاطه من مخزنه. العدسة واحدة والمصدر مختلف.
 */
export const CommitteeDisplay: React.FC<{ panelKeys?: string[]; rotateSeconds?: number; board?: DisplayBoard; onClose?: () => void }> = ({ panelKeys, rotateSeconds = 0, board: externalBoard, onClose }) => {
  const venueRef = useRef<HTMLDivElement | null>(null);
  useDialogBehavior(!!onClose, onClose || (() => {}), venueRef, { autoFocus: false });
  useScreenAwake(true);

  const { language, participants, committees, competition, activeSession } = useAppStore();
  const ar = language !== 'en';

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 5000); return () => clearInterval(t) }, []);

  /* مفاتيح الرابط تسبق المحفوظ، والمحفوظ يسبق الاختيار اليدوي. */
  const [chosen, setChosen] = useState<string[]>(() => (panelKeys?.length ? panelKeys : readStoredPanels()));
  useEffect(() => { if (panelKeys?.length) setChosen(panelKeys) }, [panelKeys?.join(',')]);
  const pick = (keys: string[]) => { setChosen(keys); writeStoredPanels(keys) };

  const localBoard: DisplayBoard = useMemo(() => buildDisplayBoard({
    competitionId: competition.id,
    competitionName: competition.name,
    competitionNameArabic: competition.nameArabic,
    participants,
    committees,
    categories: competition.categories || [],
    fallbackSessionMinutes: competition.ruleSet?.questionDurationMinutes,
    /* الجهاز يعرف بقيّة جلسته وحدها؛ وبقيّة اللجان تُقدَّر بنصف المتوسّط. */
    elapsedSecondsByCommittee: activeSession.committee
      ? { [activeSession.committee.id]: activeSession.durationSeconds }
      : undefined,
    nextDepth: PANEL_NEXT_DEPTH,
    ar,
    now,
  }), [competition, participants, committees, activeSession.committee, activeSession.durationSeconds, ar, now]);

  const board = externalBoard || localBoard;
  const slices = useMemo(() => selectCommitteeSlices(board, chosen), [board, chosen]);

  /* التناوب حين تقلّ الشاشات عن اللجان: لجنتان على تلفازٍ واحد أشرف من نصف قاعةٍ بلا شاشة. */
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    if (slices.length < 2 || rotateSeconds <= 0) return;
    const t = setInterval(() => setTurn((n) => n + 1), rotateSeconds * 1000);
    return () => clearInterval(t);
  }, [slices.length, rotateSeconds]);

  const slice = slices.length ? slices[turn % slices.length] : undefined;
  const age = boardAge(board.generatedAt, now);

  /* لا لجنة مختارة بعد ⇒ اختيارٌ صريح بدل شاشةٍ فارغة يقف أمامها المشرف حائرًا. */
  if (!slice) {
    return <Shell venueRef={venueRef} ar={ar} onClose={onClose}>
      <PanelChooser board={board} ar={ar} missing={chosen.length > 0} onPick={(id) => pick([id])} />
    </Shell>;
  }

  const reciting = !externalBoard && !!activeSession.isReciting && activeSession.committee?.id === slice.committeeId;
  const statusText = describePanelStatus(slice.status, reciting, ar);
  const live = slice.status === 'testing';

  return <Shell venueRef={venueRef} ar={ar} onClose={onClose} stale={age.state === 'STALE'}>
    {/* هوية اللجنة: الرمز للمنظّم، والفئة للمتسابق. */}
    <header className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <span className="shrink-0 grid place-items-center rounded-2xl bg-[#dbe7df] text-[#16372d] font-black tabular-nums w-14 h-14 sm:w-[4.5rem] sm:h-[4.5rem] text-xl sm:text-3xl">{slice.code}</span>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-black truncate">{bilingualName(slice, ar)}</h1>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {slice.categories.length
              ? slice.categories.map((tag) => <span key={tag.id} className="mizan-board-tag text-[11px]">
                  {tag.label}{tag.scopeLabel && tag.scopeLabel !== tag.label ? ` · ${tag.scopeLabel}` : ''}
                </span>)
              : <span className="mizan-board-tag text-[11px] opacity-70">{categoryLine([], ar)}</span>}
            {slice.venueHall && <span className="text-[11px] mizan-venue-faint">· {slice.venueHall}</span>}
          </div>
        </div>
      </div>
      <div className="text-end shrink-0">
        <div dir="ltr" className="text-lg sm:text-2xl font-black tabular-nums">{venueClock(now)}</div>
        <FreshnessLine state={age.state} ageSeconds={age.ageSeconds} ar={ar} />
      </div>
    </header>

    {/* النداء. الكود وحده يملأ ما بين الرأس والتذييل. */}
    <main className="my-auto py-6 sm:py-10">
      <section
        /* المفتاح هو الكود: تغيّره يعيد تركيب العنصر فيعيد تشغيل وميض الوصول بلا مؤقّت. */
        key={slice.nowCalling?.code || 'idle'}
        className={`relative overflow-hidden rounded-[34px] border border-white/10 text-center px-5 py-10 sm:py-16 ${slice.nowCalling ? 'mizan-call-arrive' : ''}`}
      >
        <span className="mizan-call-halo" aria-hidden />
        <div className="relative z-[1]">
          <div className="text-[11px] font-black tracking-[.2em] mizan-venue-muted">{ar ? 'الآن' : 'NOW CALLING'}</div>
          {slice.nowCalling
            ? <div className="mizan-call-code mizan-venue-code mt-4 sm:mt-6" dir="ltr">{slice.nowCalling.code}</div>
            : <div className="mt-8 sm:mt-12 mb-4 text-2xl sm:text-4xl font-black mizan-venue-faint">{ar ? 'لا يوجد استدعاء' : 'No active call'}</div>}
          {slice.stalled && <div className="mt-5 text-sm font-black text-[#f0c9a0]">{ar ? 'اللجنة شاغرة — لم يُنادَ أحد بعد' : 'Panel is free — nobody called yet'}</div>}
          <div className="mt-6 sm:mt-9 inline-flex items-center gap-2.5 rounded-full border border-white/12 bg-white/[.05] px-4 py-2">
            <span aria-hidden className={`w-2.5 h-2.5 rounded-full ${live ? 'bg-[#e8cb93]' : slice.status === 'offline' ? 'bg-[#8a5f55]' : 'bg-[#7fae9a]'} ${reciting ? 'mizan-call-live' : ''}`} />
            <span className="text-xs sm:text-sm font-black">{statusText}</span>
          </div>
        </div>
      </section>

      {/* قارئ الشاشة يسمع النداء نصًّا؛ الوميض وحده لا يصل الكفيف. */}
      <p aria-live="polite" className="sr-only">
        {slice.nowCalling
          ? (ar ? `اللجنة ${slice.code} تنادي ${slice.nowCalling.code}` : `Panel ${slice.code} is calling ${slice.nowCalling.code}`)
          : (ar ? `اللجنة ${slice.code}: لا يوجد استدعاء` : `Panel ${slice.code}: no active call`)}
      </p>
    </main>

    <footer className="space-y-3">
      <section className="rounded-[26px] border border-white/10 bg-white/[.03] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-black tracking-[.17em] mizan-venue-muted">{ar ? 'التالي' : 'NEXT'}</div>
          <UsersRound className="w-4 h-4 mizan-venue-muted" aria-hidden />
        </div>
        {slice.next.length
          ? <ol className="flex flex-wrap items-center gap-2.5 sm:gap-4 mt-3">
              {slice.next.map((slot) => <li key={slot.code} className="flex items-center gap-2.5 rounded-2xl bg-white/[.06] px-3.5 py-2.5">
                <span className="text-[11px] font-black mizan-venue-faint tabular-nums">{slot.position}</span>
                <span className="mizan-board-next mizan-venue-code" dir="ltr">{slot.code}</span>
              </li>)}
            </ol>
          : <div className="py-4 text-sm font-bold mizan-venue-faint">{ar ? 'لا أحد في انتظار هذه اللجنة' : 'Nobody is waiting for this panel'}</div>}
        {/* طول الطابور يُرى قبل أن يُقرأ: نقطةٌ لكل منتظر أمام هذا الباب. */}
        <QueueRibbon total={slice.waitingCount} ar={ar} className="text-[#b9cec4] mt-3.5" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-bold mizan-venue-muted">
          <span>{ar ? `${slice.waitingCount} في الانتظار` : `${slice.waitingCount} waiting`}</span>
          <span>{describeWait(slice.estimatedWaitMinutes, ar)}</span>
          <span className="inline-flex items-center gap-1.5">
            <span key={slice.completedCount} className="mizan-done-mark text-[#7fae9a]"><CheckCircle2 className="w-3.5 h-3.5" /></span>
            {ar ? `أُنجز ${slice.completedCount}` : `${slice.completedCount} completed`}
          </span>
        </div>
      </div>

      {slices.length > 1 && <div className="flex items-center justify-center gap-1.5" aria-hidden>
        {slices.map((s, i) => <span key={s.committeeId} className={`h-1.5 rounded-full transition-all ${i === turn % slices.length ? 'w-6 bg-[#e8cb93]' : 'w-1.5 bg-white/20'}`} />)}
      </div>}
    </footer>
  </Shell>;
};

/* ── الهيكل ─────────────────────────────────────────────────────────────── */

const Shell: React.FC<{ venueRef: { current: HTMLDivElement | null }; ar: boolean; onClose?: () => void; stale?: boolean; children: React.ReactNode }> = ({ venueRef, ar, onClose, stale, children }) => (
  <div
    ref={venueRef}
    role={onClose?"dialog":undefined}
    aria-modal={onClose?true:undefined}
    aria-label={ar?'شاشة اللجنة':'Committee display'}
    className={`fixed inset-0 z-50 mizan-venue-2 text-white font-arabic overflow-auto ${stale ? 'mizan-board-stale' : ''}`}
  >
    <div className="min-h-full p-5 sm:p-8 lg:p-10 flex flex-col">
      {onClose && <div className="absolute top-4 end-4 z-10">
        <Button shape="square" variant="venue" onClick={onClose} aria-label={ar ? 'إغلاق شاشة اللجنة' : 'Close committee display'}><X className="w-5 h-5" /></Button>
      </div>}
      {children}
    </div>
  </div>
);

/** اختيار لجنة هذه الشاشة. يُحفظ، فلا يُعاد الضبط بعد كل إعادة تشغيل. */
const PanelChooser: React.FC<{ board: DisplayBoard; ar: boolean; missing: boolean; onPick: (id: string) => void }> = ({ board, ar, missing, onPick }) => (
  <div className="my-auto py-10 max-w-3xl mx-auto w-full text-center">
    <MonitorX className="w-8 h-8 mx-auto mizan-venue-muted" aria-hidden />
    <h1 className="text-2xl sm:text-3xl font-black mt-4">{ar ? 'أيّ لجنةٍ تعرض هذه الشاشة؟' : 'Which panel is this screen?'}</h1>
    <p className="text-xs mizan-venue-faint mt-3 leading-6">
      {missing
        ? (ar ? 'اللجنة المطلوبة في الرابط غير موجودة في هذه المسابقة. اختر لجنةً من القائمة.' : 'The panel named in the link is not part of this competition. Choose one below.')
        : (ar ? 'يُحفظ الاختيار على هذا الجهاز، فيعود إليه بعد إعادة التشغيل بلا ضبطٍ جديد.' : 'The choice is stored on this device, so it returns after a restart.')}
    </p>
    {board.committees.length
      ? <div className="grid sm:grid-cols-2 gap-3 mt-7 text-start">
          {board.committees.map((c) => <button key={c.committeeId} type="button" onClick={() => onPick(c.code || c.committeeId)}
            className="rounded-3xl border border-white/12 bg-white/[.045] hover:bg-white/[.09] transition p-4 flex items-center gap-4 min-h-16">
            <span className="shrink-0 w-12 h-12 rounded-2xl bg-[#dbe7df] text-[#16372d] grid place-items-center font-black tabular-nums">{c.code}</span>
            <span className="min-w-0">
              <span className="block text-sm font-black truncate">{bilingualName(c, ar)}</span>
              <span className="block text-[11px] mizan-venue-muted truncate mt-0.5">{categoryLine(c.categories, ar)}{c.venueHall ? ` · ${c.venueHall}` : ''}</span>
            </span>
          </button>)}
        </div>
      : <p className="mt-8 text-sm font-bold mizan-venue-faint">{ar ? 'لا توجد لجان في هذه المسابقة بعد.' : 'This competition has no panels yet.'}</p>}
  </div>
);
