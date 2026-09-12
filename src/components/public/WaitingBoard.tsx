import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock3, TriangleAlert, UsersRound, X } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { useDialogBehavior } from '../../lib/useDialogBehavior';
import { useScreenAwake } from '../../lib/use-screen-awake';
import { bilingualName } from '../../lib/ui-language';
import { Button } from '../design-system/Button';
import { QueueRibbon } from '../design-system/QueueRibbon';
import {
  HALL_NEXT_DEPTH, boardAge, buildDisplayBoard, categoryLine, describeAge, describeWait, venueClock,
  type CommitteeBoardSlice, type DisplayBoard,
} from '../../lib/display-board';

/*
 * شاشة القاعة.
 *
 * كانت تعرض «التالي» بقصّ أوّل ستّةٍ من طابورٍ **عام** للمسابقة كلّها. عند لجنتين كان
 * ذلك يكفي؛ وعند عشرٍ صار من أُسند للجنة العاشرة قد لا يرى كوده أبدًا وإن كان التالي
 * مباشرةً في لجنته. وبطاقاتُ النداء في عمودين كانت تفيض عن التلفاز قبل اللجنة السادسة.
 *
 * فصارت شبكةَ لجان: لكلٍّ خليّتها، وفيها نداؤها وتاليها وزمنُها المتوقّع — كل اللجان في
 * لقطةٍ واحدة بلا تمرير. ولكل خليّة هويّتها بفئتها، فيعرف الواقف أين يقف قبل أن يُنادى.
 *
 * والمعروض أكوادٌ فقط: هي عين ما ينادي به المنادي صوتًا، ولا اسم ولا سؤال ولا درجة.
 */

/** `board` يأتي من وثيقةٍ منشورة على شاشةٍ بلا تسجيل دخول؛ وغيابه يبني الإسقاط من المخزن. */
export const WaitingBoard: React.FC<{ board?: DisplayBoard; onClose?: () => void }> = ({ board: externalBoard, onClose }) => {
  const venueRef = useRef<HTMLDivElement | null>(null);
  useDialogBehavior(!!onClose, onClose || (() => {}), venueRef, { autoFocus: false });
  useScreenAwake(true);

  const { language, participants, committees, competition, activeSession } = useAppStore();
  const ar = language !== 'en';

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 5000); return () => clearInterval(t) }, []);

  const localBoard = useMemo(() => buildDisplayBoard({
    competitionId: competition.id,
    competitionName: competition.name,
    competitionNameArabic: competition.nameArabic,
    participants,
    committees,
    categories: competition.categories || [],
    fallbackSessionMinutes: competition.ruleSet?.questionDurationMinutes,
    elapsedSecondsByCommittee: activeSession.committee
      ? { [activeSession.committee.id]: activeSession.durationSeconds }
      : undefined,
    nextDepth: HALL_NEXT_DEPTH,
    ar,
    now,
  }), [competition, participants, committees, activeSession.committee, activeSession.durationSeconds, ar, now]);

  const board = externalBoard || localBoard;
  const age = boardAge(board.generatedAt, now);
  const calling = board.committees.filter((c) => c.nowCalling);

  return <div
    ref={venueRef}
    role={onClose?"dialog":undefined}
    aria-modal={onClose?true:undefined}
    aria-label={ar?'شاشة الانتظار':'Waiting display'}
    className={`fixed inset-0 z-50 mizan-venue-2 text-white font-arabic overflow-auto ${age.state === 'STALE' ? 'mizan-board-stale' : ''}`}
  >
    <div className="min-h-full p-5 sm:p-8 lg:p-10 flex flex-col">
      <header className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="text-[11px] font-black tracking-[.2em] mizan-venue-muted">{ar ? 'الدور الآن' : 'NOW SERVING'}</div>
          <h1 className="text-2xl sm:text-3xl font-black mt-1">{ar ? 'قاعة الانتظار' : 'Waiting Hall'}</h1>
          <div className="text-xs mizan-venue-muted mt-1 truncate">{bilingualName({ name: board.competitionName, nameArabic: board.competitionNameArabic }, ar)}</div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-end">
            <div dir="ltr" className="text-xl font-black tabular-nums">{venueClock(now)}</div>
            <FreshnessLine state={age.state} ageSeconds={age.ageSeconds} ar={ar} />
          </div>
          {onClose && <Button shape="square" variant="venue" onClick={onClose} aria-label={ar ? 'إغلاق شاشة الانتظار' : 'Close waiting display'}><X className="w-5 h-5" /></Button>}
        </div>
      </header>

      <main className="my-auto py-7">
        {board.committees.length
          ? <div className="mizan-board-grid">{board.committees.map((c) => <PanelCell key={c.committeeId} slice={c} ar={ar} />)}</div>
          : <div className="py-16 text-center mizan-venue-faint text-sm">{ar ? 'لا توجد لجان في هذه المسابقة بعد.' : 'This competition has no panels yet.'}</div>}

        {/* النداء نصًّا لقارئ الشاشة: الوميض وحده لا يصل الكفيف. */}
        <p aria-live="polite" className="sr-only">
          {calling.length
            ? calling.map((c) => ar ? `اللجنة ${c.code} تنادي ${c.nowCalling!.code}` : `Panel ${c.code} calling ${c.nowCalling!.code}`).join('، ')
            : (ar ? 'لا يوجد استدعاء حاليًا' : 'No active call')}
        </p>
      </main>

      <footer className="space-y-2">
        {/*
          منتظرٌ بلا لجنة لا يظهر في أي خليّة. لولا هذا السطر لغاب عن الشاشة وعن انتباه
          المشرف معًا — وهي حالةٌ حقيقية: البوابة تُرجع «لا إسناد» حين لا تؤهّله أيُّ لجنة.
        */}
        {board.unassignedWaiting > 0 && <div className="rounded-2xl border border-[#f0c9a0]/30 bg-[#f0c9a0]/10 px-4 py-3 flex items-center gap-3">
          <TriangleAlert className="w-4 h-4 text-[#f0c9a0] shrink-0" aria-hidden />
          <span className="text-[11px] font-bold text-[#f0c9a0]">
            {ar
              ? `${board.unassignedWaiting} في الانتظار بلا لجنة مُسندة — يحتاجون إسنادًا يدويًا من المشرف.`
              : `${board.unassignedWaiting} waiting with no panel assigned — these need a supervisor's manual routing.`}
          </span>
        </div>}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <Stat icon={UsersRound} n={board.totalWaiting} t={ar ? 'في الانتظار' : 'Waiting'} />
          <Stat icon={Clock3} n={board.activePanels} t={ar ? 'لجان عاملة' : 'Active panels'} />
          {/*
            الانتظار يصير تقدّمًا حين يُرى مجموعه: القاعة ترى ما أنجزته اليوم، وكل
            اكتمالٍ يومض مرّة. المفتاح هو العدد، فتغيّره يعيد تشغيل الومضة بلا مؤقّت.
          */}
          <div className="rounded-2xl border border-white/8 px-4 py-3 flex items-center gap-3">
            <span key={board.totalCompleted} className="mizan-done-mark text-[#7fae9a]"><CheckCircle2 className="w-4 h-4" /></span>
            <div><div className="text-xl font-black tabular-nums">{board.totalCompleted}</div><div className="text-[10px] mizan-venue-faint">{ar ? 'أُنجز اليوم' : 'Completed today'}</div></div>
          </div>
        </div>
      </footer>
    </div>
  </div>;
};

/**
 * سطر الصدق الزمني — بالاستثناء لا بالدوام.
 *
 * كان هنا سطرٌ ثابت يقول «تحديث تلقائي» في كل حال، فأُزيل: لافتةٌ تَعِد بالحياة لا تعرف
 * أحيّةٌ هي لا تُصدَّق، وشاشةٌ متجمّدة كانت تحمله وهي ميتة. فالبديل ألّا يُقال شيءٌ ما دام
 * كل شيءٍ على ما يرام، وأن يُقال بوضوحٍ حين يتأخّر التحديث أو يتوقّف — فلا يظهر السطر
 * إلا وله معنى، ولا يقرأ أحدٌ بياناتٍ قديمة ظنًّا أنها الآن.
 */
export const FreshnessLine: React.FC<{ state: ReturnType<typeof boardAge>['state']; ageSeconds: number; ar: boolean }> = ({ state, ageSeconds, ar }) => {
  if (state === 'STALE') return <div className="text-[11px] font-black text-[#f0c9a0] mt-0.5">{ar ? `التحديث متوقف · ${describeAge(ageSeconds, ar)}` : `Updates stopped · ${describeAge(ageSeconds, false)}`}</div>;
  if (state === 'LAGGING') return <div className="text-[11px] font-bold mizan-venue-muted mt-0.5">{ar ? `آخر تحديث ${describeAge(ageSeconds, ar)}` : `Updated ${describeAge(ageSeconds, false)}`}</div>;
  return null;
};

/**
 * خليّة لجنة. مفتاحُ النداء هو الكود نفسه: تغيّره يعيد تركيب العنصر فيعيد تشغيل وميض
 * الوصول بلا مؤقّت — ومرّةً واحدة، فالوميض المتكرّر ضوضاءُ في قاعةِ تلاوة.
 */
const PanelCell: React.FC<{ slice: CommitteeBoardSlice; ar: boolean }> = ({ slice, ar }) => {
  const offline = slice.status === 'offline';
  return <section className={`mizan-board-cell ${offline ? 'is-offline' : ''} ${slice.status === 'testing' ? 'is-testing' : ''} ${slice.stalled ? 'is-stalled' : ''}`}>
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="shrink-0 w-11 h-11 rounded-xl bg-[#dbe7df] text-[#16372d] grid place-items-center font-black tabular-nums text-sm">{slice.code}</span>
      <span className="min-w-0 text-end">
        <span className="mizan-board-tag text-[10px]">{categoryLine(slice.categories, ar)}</span>
      </span>
    </div>

    <div key={slice.nowCalling?.code || 'idle'} className={`rounded-2xl px-3 py-3 text-center ${slice.nowCalling ? 'mizan-call-arrive bg-white/[.06]' : ''}`}>
      <div className="text-[10px] font-black tracking-[.14em] mizan-venue-faint">{ar ? 'الآن' : 'NOW'}</div>
      {slice.nowCalling
        ? <div className="mizan-board-code mizan-venue-code mt-1.5" dir="ltr">{slice.nowCalling.code}</div>
        : <div className="mt-2 mb-0.5 text-sm font-black mizan-venue-faint">{offline ? (ar ? 'متوقفة' : 'Offline') : (ar ? '—' : '—')}</div>}
    </div>

    <div className="flex items-center justify-between gap-2 text-[11px] border-t border-white/8 pt-2.5">
      <span className="mizan-venue-faint font-bold shrink-0">{ar ? 'التالي' : 'Next'}</span>
      <span className="mizan-venue-code truncate" dir="ltr">{slice.next[0]?.code || '—'}</span>
    </div>

    {/* طول الطابور يُرى قبل أن يُقرأ. */}
    <QueueRibbon total={slice.waitingCount} ar={ar} className="text-[#b9cec4] min-h-4" />

    <div className="flex items-center justify-between gap-2 text-[10px] mizan-venue-muted font-bold">
      <span>{ar ? `${slice.waitingCount} منتظرًا` : `${slice.waitingCount} waiting`}</span>
      <span className="truncate">{describeWait(slice.estimatedWaitMinutes, ar)}</span>
    </div>

    {/* لجنةٌ شاغرة وأمامها منتظرون: عطبٌ تشغيليّ يُقال، لا حكمٌ على سرعة اللجنة. */}
    {slice.stalled && <div className="text-[10px] font-black text-[#f0c9a0]">{ar ? 'شاغرة — لم يُنادَ أحد بعد' : 'Free — nobody called yet'}</div>}
  </section>;
};

const Stat = ({ icon: Icon, n, t }: { icon: React.ComponentType<{ className?: string }>; n: number; t: string }) => (
  <div className="rounded-2xl border border-white/8 px-4 py-3 flex items-center gap-3">
    <Icon className="w-4 h-4 text-[#b9cec4]" />
    <div><div className="text-xl font-black tabular-nums">{n}</div><div className="text-[10px] mizan-venue-faint">{t}</div></div>
  </div>
);
