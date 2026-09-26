import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BellRing, CalendarClock, Clock3, MapPin, RefreshCw, Sparkles } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { MizanLogo } from '../design-system/MizanLogo';
import { describeAge, describeWait, type DisplayBoard } from '../../lib/display-board';
import { deriveSimpleQueueState } from '../../lib/simple-queue-view';

/*
 * «متى دوري؟» — بخطٍّ كبير وهدوء.
 *
 * وليّ الأمر في الممرّ، والطفل بجانبه قلق. صفحة الرحلة الكاملة تقول كل شيء، وهذه تقول شيئًا
 * واحدًا يُقرأ من بعيد: كم أمامك، وكم تقريبًا، ثم — حين يحين — «دورك في اللجنة X».
 *
 * لا بيانات جديدة ولا صلاحية جديدة: الرحلة من رابط القدرة الخاص نفسه (يحلّه الخادم)، وحال
 * اللجنة من إسقاط شاشة القاعة المنشور (أكوادٌ فقط، مقروءٌ للعامة أصلًا). ولا يُعرض هنا إلا
 * الاسم الأول لصاحب الرابط نفسه.
 */

const BOARD_REFRESH_MS = 10_000;

export interface SimpleJourneyView {
  competitionId: string;
  participantCode: string;
  participantName: string;
  participantNameArabic: string;
  status: string;
  queueNumber?: number | null;
  committee?: { code: string; hall?: string | null } | null;
  venueName?: string | null;
}

export const SimpleQueueView: React.FC<{ journey: SimpleJourneyView; journeyUpdatedAt: number; onBack: () => void }> = ({ journey, journeyUpdatedAt, onBack }) => {
  const { language, loadPublicDisplayBoard } = useAppStore();
  const ar = language === 'ar';
  const Back = ar ? ArrowRight : ArrowLeft;
  const [board, setBoard] = useState<DisplayBoard | null>(null);
  const [boardAt, setBoardAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  /* إسقاط القاعة: استطلاعٌ هادئ، يتوقّف حين تُخفى الصفحة ويُستأنف فور عودتها. */
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const next = await loadPublicDisplayBoard(journey.competitionId);
      if (cancelled) return;
      /* إخفاقٌ عابر لا يمسح ما يُعرض: تبقى آخر نسخة ويُعلن عمرها. */
      if (next) { setBoard(next); setBoardAt(Date.now()); }
    };
    void pull();
    const t = window.setInterval(() => void pull(), BOARD_REFRESH_MS);
    const onVisibility = () => { if (document.visibilityState === 'visible') void pull(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; window.clearInterval(t); document.removeEventListener('visibilitychange', onVisibility); };
  }, [journey.competitionId, loadPublicDisplayBoard]);

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 5_000); return () => window.clearInterval(t); }, []);

  const state = useMemo(() => deriveSimpleQueueState(journey, board), [journey, board]);
  const name = String((ar ? journey.participantNameArabic : journey.participantName) || '').trim().split(/\s+/)[0] || '';
  const lastUpdated = Math.max(journeyUpdatedAt || 0, boardAt || 0);
  const ageSeconds = lastUpdated ? Math.max(0, Math.floor((now - lastUpdated) / 1000)) : null;
  const panel = state.committeeCode;

  let headline: string;
  let detail: string | null = null;
  if (state.stage === 'called') {
    headline = ar ? `دورك في اللجنة ${panel || ''}`.trim() : `It's your turn — panel ${panel || ''}`.trim();
    detail = state.hall ? (ar ? `توجّه بهدوء إلى ${state.hall}` : `Please walk calmly to ${state.hall}`) : (ar ? 'توجّه بهدوء إلى اللجنة' : 'Please walk calmly to the panel');
  } else if (state.stage === 'waiting') {
    headline = state.position === 1
      ? (ar ? 'أنت التالي' : 'You are next')
      : state.position
        ? (ar ? `أمامك ${state.position - 1}` : `${state.position - 1} ahead of you`)
        : (ar ? 'أنت في الطابور' : 'You are in the queue');
    detail = ar ? 'خذ نفسًا عميقًا — سنُظهر دورك هنا فور النداء.' : 'Take a deep breath — your turn will show here the moment you are called.';
  } else if (state.stage === 'before') {
    headline = ar ? 'لم يبدأ الانتظار بعد' : 'Waiting has not started yet';
    detail = ar ? 'حين تدخل الطابور يظهر هنا موضعك ووقتك التقريبي.' : 'Once you join the queue, your place and approximate time appear here.';
  } else if (state.stage === 'done') {
    headline = ar ? 'انتهى دورك — بارك الله فيك' : 'Your turn is complete — well done';
    detail = ar ? 'تظهر النتيجة في صفحة الرحلة حين تُعتمد.' : 'The result appears on the journey page once it is published.';
  } else {
    headline = ar ? 'نتابع حالتك' : 'Following your status';
  }

  return <div className="mizan-simple-queue min-h-screen bg-[#FAF8F2] text-[#171B18]" dir={ar ? 'rtl' : 'ltr'} data-stage={state.stage}>
    <header className="border-b border-[#e5dfd0] bg-[#FAF8F2]/95">
      <div className="max-w-2xl mx-auto h-16 px-4 flex items-center justify-between gap-3">
        <MizanLogo language={language} compact />
        <button type="button" onClick={onBack} className="min-h-11 px-3 rounded-xl text-sm font-black text-[#214C40] inline-flex items-center gap-2">
          <Back className="w-4 h-4" aria-hidden="true" />{ar ? 'الرحلة الكاملة' : 'Full journey'}
        </button>
      </div>
    </header>
    <main className="max-w-2xl mx-auto px-4 py-8 sm:py-12 space-y-5">
      {name && <p className="text-center text-xl sm:text-2xl font-bold text-[#3a4a43]">{ar ? `أهلًا ${name}` : `Hello ${name}`}</p>}

      <section aria-live="polite" aria-atomic="true"
        className={`mizan-simple-queue__hero rounded-[28px] p-7 sm:p-10 text-center ${state.stage === 'called' ? 'bg-[#214C40] text-white' : 'mizan-surface'}`}>
        <div className={`mx-auto w-16 h-16 rounded-2xl grid place-items-center ${state.stage === 'called' ? 'bg-[#E8CB93] text-[#183a31] mizan-simple-queue__pulse' : 'bg-[#E7EEE9] text-[#214C40]'}`} aria-hidden="true">
          {state.stage === 'called' ? <BellRing className="w-8 h-8" /> : state.stage === 'done' ? <Sparkles className="w-8 h-8" /> : state.stage === 'waiting' ? <Clock3 className="w-8 h-8" /> : <CalendarClock className="w-8 h-8" />}
        </div>
        <h1 className="mt-5 font-black leading-tight text-[2.25rem] sm:text-[3rem]" style={{ fontFamily: 'var(--font-display)' }}>{headline}</h1>
        {detail && <p className={`mt-4 text-lg sm:text-xl leading-relaxed ${state.stage === 'called' ? 'text-white/90' : 'text-[#46524c]'}`}>{detail}</p>}
      </section>

      {state.stage === 'waiting' && <section className="grid sm:grid-cols-2 gap-4">
        <Fact icon={Clock3} label={ar ? 'الوقت التقريبي' : 'Approximate wait'}
          value={state.estimatedWaitMinutes == null ? (ar ? 'يُحسب بعد قليل' : 'Calculating shortly') : `${state.estimateIsUpperBound ? (ar ? 'حتى ' : 'up to ') : ''}${describeWait(state.estimatedWaitMinutes, ar)}`} />
        <Fact icon={MapPin} label={ar ? 'اللجنة' : 'Panel'}
          value={panel ? `${panel}${state.hall ? ` · ${state.hall}` : ''}` : (ar ? 'تُحدَّد عند النداء' : 'Assigned when called')} />
        {state.position == null && state.waitingCount != null && state.waitingCount > 0 && <p className="sm:col-span-2 text-center text-base text-[#46524c]">
          {ar ? `في طابور اللجنة ${state.waitingCount} متسابقًا الآن.` : `${state.waitingCount} participants are in this panel's queue now.`}
        </p>}
      </section>}

      {journey.queueNumber ? <p className="text-center text-base text-[#46524c]">{ar ? 'رقم بطاقتك' : 'Your ticket number'} <b className="text-[#171B18] text-xl" dir="ltr">{journey.queueNumber}</b></p> : null}

      <p className="flex items-center justify-center gap-2 text-base text-[#4d5752]">
        <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
        {ageSeconds == null ? (ar ? 'جارٍ التحديث…' : 'Updating…') : `${ar ? 'آخر تحديث' : 'Last updated'}: ${describeAge(ageSeconds, ar)}`}
      </p>
      <p className="text-center text-sm leading-7 text-[#5b6460]">{ar ? 'تتحدّث هذه الصفحة تلقائيًا، ولا حاجة لإعادة تحميلها. الأوقات تقريبية.' : 'This page updates by itself; no need to reload. Times are approximate.'}</p>
    </main>
  </div>;
};

const Fact = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) =>
  <div className="mizan-surface p-5 text-center">
    <Icon className="w-6 h-6 mx-auto text-[#2F6555]" />
    <div className="mt-2 text-base font-bold text-[#4d5752]">{label}</div>
    <div className="mt-1 text-2xl sm:text-[1.75rem] font-black text-[#171B18]">{value}</div>
  </div>;
