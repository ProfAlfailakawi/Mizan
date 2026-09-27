import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DnaStepper } from '../dna/DnaKit';
import { ArrowLeft, ArrowRight, Award, BadgeCheck, CalendarClock, CircleDot, LockKeyhole, MapPin, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { MizanLogo } from '../design-system/MizanLogo';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import { WarmupSanctuary } from '../participant/WarmupSanctuary';
import { TestCompletePanel } from '../participant/CompletionSeal';
import { JOURNEY_ORDER, displayParticipantName, formatParticipantCode, journeyStepIndex } from '../../lib/journey-progress';

type Audience = 'participant' | 'guardian';
type PublicJourney = {
  organizationId: string;
  competitionId: string;
  participantId: string;
  audience: Audience;
  competitionName: string;
  competitionNameArabic: string;
  participantCode: string;
  participantName: string;
  participantNameArabic: string;
  status: string;
  arrivalSlot?: string | null;
  queueNumber?: number | null;
  venueName?: string | null;
  committee?: { code: string; name: string; nameArabic: string; hall?: string | null } | null;
  result?: { score: number; rank: number; status: string } | null;
  certificate?: { number: string; verificationUrl?: string } | null;
  preparation?: { scopeTextArabic?: string | null; scopeTextEnglish?: string | null; spreadAcrossZones?: boolean; questionCount?: number; minutesPerQuestion?: number } | null;
  revoked?: boolean;
  updatedAt: string;
};

const tokenFromHash = () => {
  try {
    const q = window.location.hash.split('?')[1] || '';
    return new URLSearchParams(q).get('key') || '';
  } catch {
    return '';
  }
};

const stepLabel = (index: number, ar: boolean) => {
  const arLabels = ['تم استلام الطلب', 'المراجعة', 'تم الاعتماد', 'الحضور', 'الانتظار', 'التحكيم', 'اكتمل التحكيم', 'اعتراض', 'النتيجة/الشهادة'];
  const enLabels = ['Application received', 'Review', 'Approved', 'Check-in', 'Waiting', 'Judging', 'Judging complete', 'Appeal', 'Result / certificate'];
  return (ar ? arLabels : enLabels)[index];
};

export const JourneyAccess: React.FC<{ audience: Audience }> = ({ audience }) => {
  const { competition, language } = useAppStore();
  const ar = language === 'ar';
  const Arrow = ar ? ArrowLeft : ArrowRight;
  const storageKey = `mizan_public_${audience}_${competition.id}`;
  const [token, setToken] = useState('');
  const [input, setInput] = useState('');
  const [journey, setJourney] = useState<PublicJourney | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /*
   * انتهاء المسابقة ليس إلغاءً لرحلة المتسابق. النتيجة والشهادة والحفل تقع بعد التحكيم،
   * لذلك لا نغلق هذه الصفحة بناءً على competition.status. الخادم وحده يقرر الإلغاء عبر
   * journey.revoked، وهو ما تستخدمه الإدارة عند الإغلاق النهائي/سحب البطاقة.
   */
  const load = useCallback(async (raw: string, options?: { silent?: boolean }) => {
    const clean = raw.trim();
    if (!clean) return;
    const silent = !!options?.silent;
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const response = await fetch('/api/public/journeys/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ competitionId: competition.id, audience, key: clean }),
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(body.code || `HTTP_${response.status}`));
      const data = body.journey as PublicJourney;
      if (!data || data.competitionId !== competition.id || data.audience !== audience) throw new Error('JOURNEY_TOKEN_INVALID');
      setJourney(data);
      setToken(clean);
      setError('');
      localStorage.setItem(storageKey, clean);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'SERVER_ERROR';
      const terminal = ['JOURNEY_TOKEN_INVALID', 'JOURNEY_NOT_FOUND', 'JOURNEY_REVOKED', 'COMPETITION_NOT_FOUND'].includes(code.split(':')[0]);
      if (terminal || !silent) {
        setJourney(null);
        setError(journeyError(code, ar));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [ar, audience, competition.id, storageKey]);

  /* المسابقة قد تتغير في رابط عام داخل نفس الجلسة؛ لا نسمح لبطاقة مسابقة سابقة بالتسرّب. */
  /* الإدخال اليدوي يُفحص شكله أولًا، فلا يُرسل رقم متسابق إلى الخادم ليعود بخطأ عامّ. */
  const submit = useCallback(() => {
    const clean = input.trim();
    if (!clean) return;
    if (!looksLikeJourneyToken(clean) && looksLikeParticipantCode(clean)) {
      setJourney(null);
      setError(journeyError('PARTICIPANT_CODE_NOT_A_JOURNEY_CODE', ar));
      return;
    }
    void load(clean);
  }, [input, ar, load]);


  useEffect(() => {
    const fromHash = tokenFromHash();
    const remembered = localStorage.getItem(storageKey) || '';
    const next = fromHash || remembered;
    setJourney(null);
    setError('');
    setToken(next);
    setInput(fromHash || next);
    if (next) void load(next);
  }, [competition.id, audience, storageKey, load]);

  /*
   * الرحلة شاشة حيّة، لا لقطةً عند الفتح. تحديث صامت يلتقط الاستدعاء للجنة والنتيجة
   * والشهادة من دون وميض loading أو إجبار الطالب/ولي الأمر على إعادة تحميل الصفحة.
   */
  useEffect(() => {
    if (!token || !journey) return;
    const refresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void load(token, { silent: true });
    };
    const timer = window.setInterval(refresh, 30_000);
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [token, journey?.participantId, load]);

  /* المسار من أقوى شاهد: النتيجة والشهادة تتقدّمان على حالةٍ مكتوبةٍ تأخّرت. */
  const idx = journey ? journeyStepIndex({ status: journey.status, hasResult: !!journey.result, hasCertificate: !!journey.certificate }) : 0;
  /* «اعتراض» خطوةٌ لا يمرّ بها الجميع: تُعرض لمن اعترض فقط. */
  const steps = JOURNEY_ORDER.map((_, i) => i).filter(i => i !== 7 || idx === 7);
  const currentStepRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    currentStepRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
  }, [idx]);
  const next = useMemo(() => journey && idx < 8 ? stepLabel(idx === 6 ? 8 : idx + 1, ar) : null, [journey, idx, ar]);
  /* بعد انتهاء التلاوة: لا «خطوة تالية» ولا موعد ولا رقم دور — بل «انتهى اختبارك» وحدها. */
  const finished = !!journey && idx >= 6;
  const [showResult, setShowResult] = useState(false);
  const resultRef = useRef<HTMLElement | null>(null);
  const canPrepare = audience === 'participant' && !!journey && ['approved', 'checked_in', 'in_queue'].includes(JOURNEY_ORDER[idx]);

  const verifyCertificate = () => {
    if (!journey?.certificate) return;
    window.location.hash = `verify?certificate=${encodeURIComponent(journey.certificate.number)}`;
  };

  return <div className="min-h-screen bg-[#FAF8F2] text-[#171B18]" dir={ar ? 'rtl' : 'ltr'}>
    <header className="border-b border-[#e5dfd0] bg-[#FAF8F2]/95">
      <div className="max-w-4xl mx-auto h-16 px-4 flex items-center justify-between">
        <MizanLogo language={language} compact />
        <a href={`#competition?comp=${competition.id}`} className="text-xs font-black text-[#214C40] inline-flex items-center gap-2"><Arrow className="w-4 h-4" />{ar ? 'واجهة المسابقة' : 'Competition page'}</a>
      </div>
    </header>
    <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      {!journey ? <section className="mizan-surface max-w-xl mx-auto p-6 sm:p-8 text-center">
        <div className="mx-auto w-20 h-20 rounded-3xl bg-[#E7EEE9] text-[#214C40] grid place-items-center">{audience === 'guardian' ? <UsersRound className="w-10 h-10" /> : <UserRound className="w-10 h-10" />}</div>
        <div className="mizan-kicker mt-5">{audience === 'guardian' ? (ar ? 'دخول ولي الأمر' : 'GUARDIAN ACCESS') : (ar ? 'رحلة المتسابق' : 'PARTICIPANT JOURNEY')}</div>
        <h1 className="text-3xl font-black mt-2">{audience === 'guardian' ? (ar ? 'تابع ابنك بلا حساب وكلمة مرور' : 'Follow the journey without an account') : (ar ? 'تابع رحلتك في المسابقة' : 'Follow your competition journey')}</h1>
        <p className="text-base text-[#636864] leading-7 mt-3">{ar ? 'اكتب الرمز الذي أرسلته الجهة. بلا حساب ولا كلمة مرور.' : 'Use the private journey code sent by the organizer. This device remembers it after the first use; no account or password is required.'}</p>
        {/*
          * «من أين آتي بالرمز؟» سؤالٌ كان بلا جواب في الشاشة.
          *
          * وليّ الأمر يصل إلى هنا ومعه رقم ابنه فقط، فيكتبه ويفشل. ورقم المتسابق معلنٌ في
          * الكشوف، فلو فُتحت به المتابعة لاطّلع كل أحدٍ على رحلة كل أحد. فالرمز خاصٌّ
          * بالضرورة، ويُقال هنا من أين يأتي بدل أن يُترك يُخمّن.
          */}
        {audience === 'guardian' && <div className="mt-4 rounded-2xl border border-[#e3e6e0] bg-[#f7f9f6] p-4 text-start">
          <div className="text-sm font-black text-[#24463a]">{ar ? 'من أين آتي بالرمز؟' : 'Where do I get the code?'}</div>
          <p className="mt-1.5 text-sm leading-7 text-[#5b6460]">{ar
            ? 'من رسالة الجهة بعد قبول ابنك: افتح الرابط فقط. رقم المتسابق لا يصلح هنا لأنه معلن في الكشوف.'
            : 'The organizer sends it once the application is approved: a private link or QR in the registration message. Open the link directly. The participant number does not work here — it is public on the roster, so anyone knowing it could read the journey.'}</p>
        </div>}
        <div className="mt-6 flex flex-col sm:flex-row gap-3"><input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void submit(); }} className="mizan-input flex-1 min-h-14 text-lg" dir="ltr" placeholder={ar ? 'رمز الرحلة الخاص' : 'Private journey code'} /><Button size="lg" className="min-h-14" disabled={!input.trim() || loading} onClick={() => void submit()}>{loading ? '…' : (ar ? 'دخول' : 'Open')}</Button></div>
        {error && <div role="alert" className="mt-4 rounded-xl bg-[#F4E6E3] text-[#87483f] p-3 text-xs font-bold">{error}</div>}
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-[#68706b]"><LockKeyhole className="w-4 h-4" />{ar ? 'رمزٌ خاص وآمن.' : 'The opaque code can be revoked and replaced by the organizer.'}</div>
      </section> : <div className="space-y-4">
        <section className="mizan-surface p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5"><div><div className="mizan-kicker">{audience === 'guardian' ? (ar ? 'متابعة ولي الأمر' : 'GUARDIAN VIEW') : (ar ? 'رحلتي في المسابقة' : 'MY JOURNEY')}</div><h1 className="text-3xl sm:text-4xl font-black mt-2">{displayParticipantName(ar ? journey.participantNameArabic || journey.participantName : journey.participantName || journey.participantNameArabic, journey.participantCode, ar)}</h1><div className="text-base text-[#4f5752] mt-2"><span className="font-black tabular-nums" dir="ltr">{formatParticipantCode(journey.participantCode)}</span> · {ar ? journey.competitionNameArabic : journey.competitionName}</div></div><Badge variant="emerald" className="text-sm">{stepLabel(idx, ar)}</Badge></div>
          {next && !finished && <div className="mt-6 rounded-2xl bg-[#E7EEE9] text-[#214C40] p-5 flex items-center gap-4"><Arrow className="w-8 h-8 shrink-0" aria-hidden="true" /><div><div className="text-sm font-black">{ar ? 'الخطوة التالية' : 'Next'}</div><div className="text-xl font-black mt-1">{next}</div></div></div>}
        </section>
        {finished && <TestCompletePanel ar={ar} resultReady={!!journey.result || !!journey.certificate} onShowResult={() => { setShowResult(true); window.setTimeout(() => resultRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }), 50); }} />}
        <details open={!finished} className="mizan-surface p-5 sm:p-6" data-journey-step={JOURNEY_ORDER[idx]}><summary className={`min-h-11 text-lg font-black ${finished ? 'cursor-pointer text-[var(--emerald)]' : 'list-none pointer-events-none'}`}>{finished ? (ar ? 'عرض مراحل رحلتك' : 'Show your journey steps') : (ar ? 'مسار الرحلة' : 'Journey')}</summary><div ref={currentStepRef} className="mt-5"><DnaStepper size="sm" ariaLabel={ar ? 'مسار الرحلة' : 'Journey'} stateText={ar ? undefined : { done: 'done', current: 'current', pending: 'upcoming', returned: 'returned', blocked: 'blocked' }} steps={steps.map(i => ({ key: String(i), label: stepLabel(i, ar), state: i < idx ? 'done' as const : i === idx ? 'current' as const : 'pending' as const }))} /></div></details>
        {!finished && <section className="grid sm:grid-cols-3 gap-3"><Info icon={CalendarClock} label={ar ? 'الموعد' : 'Time'} value={journey.arrivalSlot || (ar ? 'لم يحدد بعد' : 'Not assigned yet')} /><Info icon={MapPin} label={ar ? 'المكان' : 'Location'} value={journey.committee?.hall || journey.venueName || (ar ? 'لم يحدد بعد' : 'Not assigned yet')} /><Info icon={CircleDot} label={ar ? 'رقم دورك' : 'Queue number'} value={journey.queueNumber ? journey.queueNumber.toLocaleString(ar ? 'ar-EG' : 'en-US') : (ar ? 'لم يحدد بعد' : 'Not assigned yet')} /></section>}
        {audience === 'participant' && !finished && ['submitted', 'under_review', 'approved'].includes(String(journey.status)) && competition.status === 'registration_open' && <RegistrationEditPanel ar={ar} competitionId={competition.id} token={token} />}
        {canPrepare && <section className="mizan-surface p-5 sm:p-6"><div className="mb-4"><div className="mizan-kicker">{ar ? 'التحضير للاختبار' : 'TEST PREPARATION'}</div><h2 className="mt-1 text-lg font-black">{ar ? 'تهيّأ قبل دورك' : 'Settle your range, breathing, and private rehearsal'}</h2><p className="mt-1 text-sm leading-7 text-[#646965]">{ar ? 'لك وحدك — لا تمسّ درجتك.' : 'This preparation is private; nothing is sent to the panel or affects your score.'}</p></div><WarmupSanctuary ar={ar} scopeText={ar ? journey.preparation?.scopeTextArabic || undefined : journey.preparation?.scopeTextEnglish || undefined} spreadAcrossZones={journey.preparation?.spreadAcrossZones} questionCount={journey.preparation?.questionCount} minutesPerQuestion={journey.preparation?.minutesPerQuestion} journeyPracticeAuth={{competitionId:journey.competitionId,key:token}}/></section>}
        {journey.committee && !finished && <section className="mizan-surface p-5"><div className="text-sm font-black text-[#656b66]">{ar ? 'اللجنة' : 'PANEL'}</div><div className="text-xl font-black mt-1">{journey.committee.code} · {ar ? journey.committee.nameArabic : journey.committee.name}</div></section>}
        {journey.result && (showResult || !finished) && <section ref={resultRef} className="mizan-surface p-6 text-center"><ShieldCheck className="w-7 h-7 text-[#2F6555] mx-auto" /><div className="mizan-kicker mt-3">{ar ? 'النتيجة المعتمدة' : 'PUBLISHED RESULT'}</div><div className="text-4xl font-black mt-2">{journey.result.score}</div><div className="text-xl font-black text-[#3f4642] mt-2">{ar ? 'الترتيب' : 'Rank'} #{journey.result.rank}</div>{journey.certificate && <button onClick={verifyCertificate} className="mt-5 min-h-14 px-6 rounded-2xl border border-[#d9dfdb] text-base font-black text-[#214C40]">{ar ? 'التحقق من الشهادة' : 'Verify certificate'}</button>}</section>}
        {journey.certificate && !journey.result && (showResult || !finished) && <section ref={resultRef} className="mizan-surface p-6 text-center"><Award className="w-7 h-7 text-[#2F6555] mx-auto" /><div className="mizan-kicker mt-3">{ar ? 'الشهادة جاهزة' : 'CERTIFICATE READY'}</div><div className="text-sm font-black mt-2" dir="ltr">{journey.certificate.number}</div><button onClick={verifyCertificate} className="mt-5 min-h-14 px-6 rounded-2xl border border-[#d9dfdb] text-base font-black text-[#214C40]">{ar ? 'التحقق من الشهادة' : 'Verify certificate'}</button></section>}
        <div className="text-center"><button onClick={() => { localStorage.removeItem(storageKey); setJourney(null); setToken(''); setInput(''); setError(''); }} className="min-h-11 px-4 text-xs font-bold text-[#6b716d]">{ar ? 'استخدام بطاقة رحلة أخرى' : 'Use another journey pass'}</button></div>
      </div>}
    </main>
  </div>;
};

/*
 * رقم المتسابق ليس رمز رحلة.
 *
 * وليّ الأمر يجد أمامه رقم ابنه (A-2064326) فيكتبه، والخادم يردّ برمز خطأ عامّ فيُقال له
 * «حدث خطأ في الخادم» — فيظنّ النظام معطلًا وهو لم يُعطَ الرمز الصحيح أصلًا. والشكل
 * يُعرف قبل أي نداء: رمز الرحلة يبدأ بـ mz_guardian_ أو mz_journey_.
 */
export const looksLikeParticipantCode = (value: string) => /^[A-Za-z]{0,3}-?\d{3,12}$/.test(value.trim());
export const looksLikeJourneyToken = (value: string) => /^mz_(journey|guardian)_[A-Za-z0-9_-]+$/.test(value.trim());

const journeyError = (code: string, ar: boolean) => {
  const labels: Record<string, [string, string]> = {
    RATE_LIMITED: ['تكررت المحاولات سريعًا. انتظر قليلًا ثم حاول.', 'Too many attempts. Please wait and retry.'],
    PARTICIPANT_CODE_NOT_A_JOURNEY_CODE: ['هذا رقم المتسابق، وليس رمز الرحلة. رمز الرحلة رابطٌ خاص أو رمز QR ترسله الجهة لوليّ الأمر بعد اعتماد الطلب — اطلبه منها.', 'That is the participant number, not a journey code. Ask the organizer for the private link or QR they issue to guardians.'],
    JOURNEY_TOKEN_INVALID: ['الرمز غير صحيح. استخدم الرابط كاملًا كما أرسلته الجهة.', 'The code is invalid. Use the full link sent by the organizer.'],
    JOURNEY_NOT_FOUND: ['الرحلة غير موجودة أو لم يكتمل إنشاؤها. اطلب رابطًا جديدًا من الجهة.', 'The journey was not found or was not created. Ask the organizer for a new link.'],
    JOURNEY_REVOKED: ['هذا الرابط أُلغي ولم يعد صالحًا.', 'This link was revoked and is no longer valid.'],
    COMPETITION_NOT_FOUND: ['المسابقة غير موجودة.', 'Competition not found.'],
    COMPETITION_ACCESS_CLOSED: ['أُغلق دخول الرحلات لهذه المسابقة.', 'Journey access is closed for this competition.'],
    PUBLIC_REGISTRATION_NOT_CONFIGURED: ['خدمة الرحلات غير مهيأة على الخادم.', 'Journey service is not configured.'],
    FIRESTORE_PERMISSION_DENIED: ['الخادم لا يملك صلاحية قراءة الرحلة.', 'The server does not have permission to read this journey.'],
    FIRESTORE_UNAVAILABLE: ['خدمة الرحلات غير متاحة مؤقتًا. أعد المحاولة بعد قليل.', 'Journey service is temporarily unavailable. Please retry shortly.'],
  };
  const key = code.split(':')[0];
  if (labels[key]) return labels[key][ar ? 0 : 1];
  if (code === 'Failed to fetch' || code.startsWith('HTTP_')) return ar ? 'تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.' : 'Could not connect to the server. Check your network and retry.';
  return ar ? 'حدث خطأ في الخادم. أعد المحاولة لاحقًا.' : 'A server error occurred. Please retry later.';
};

const Info = ({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) => <div className="mizan-surface p-5 flex items-center gap-4"><Icon className="w-9 h-9 shrink-0 text-[#2F6555]" aria-hidden="true" /><div><div className="text-sm text-[#565d59]">{label}</div><div className="text-xl font-black mt-1">{value}</div></div></div>;

/*
 * تعديل التسجيل قبل الإغلاق — برمز الرحلة نفسه. الحقول الفارغة تبقى كما هي، والخادم يعيد
 * التحقق كاملًا ويرفض بعد إغلاق التسجيل أو بعد الحضور، ويسجّل أيّ الحقول تغيّر.
 */
const RegistrationEditPanel: React.FC<{ ar: boolean; competitionId: string; token: string }> = ({ ar, competitionId, token }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullNameArabic: '', fullName: '', email: '', phone: '' });
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; text?: string }>({ kind: 'idle' });
  const labels: Record<keyof typeof form, [string, string]> = { fullNameArabic: ['الاسم بالعربية', 'Arabic name'], fullName: ['الاسم بالإنجليزية', 'English name'], email: ['البريد الإلكتروني', 'Email'], phone: ['الهاتف', 'Phone'] };
  const save = async () => {
    const changes = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim()));
    if (!Object.keys(changes).length) return;
    setState({ kind: 'busy' });
    try {
      const r = await fetch(`/api/public/competitions/${encodeURIComponent(competitionId)}/registration`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: token, ...changes }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(body.code || `HTTP_${r.status}`));
      setState({ kind: 'ok', text: ar ? 'حُفظت التعديلات.' : 'Your changes were saved.' });
      setForm({ fullNameArabic: '', fullName: '', email: '', phone: '' });
    } catch (e) {
      const code = e instanceof Error ? e.message : '';
      const locked = code.startsWith('REGISTRATION_LOCKED') || code.startsWith('REGISTRATION_EDIT_NOT_ALLOWED');
      setState({ kind: 'error', text: locked ? (ar ? 'انتهت فترة تعديل التسجيل.' : 'The registration can no longer be edited.') : journeyError(code, ar) });
    }
  };
  return <section className="mizan-surface p-5">
    <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className="min-h-11 text-sm font-black text-[#214C40] underline">{ar ? 'تعديل بيانات التسجيل' : 'Edit my registration'}</button>
    {open && <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {(Object.keys(form) as (keyof typeof form)[]).map(k => <label key={k} className="block text-xs font-bold">{labels[k][ar ? 0 : 1]}<input className="mizan-input mt-1" dir={k === 'fullNameArabic' ? 'rtl' : 'ltr'} placeholder={ar ? 'اتركه فارغًا إن لم يتغيّر' : 'Leave empty if unchanged'} value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} /></label>)}
      <div className="sm:col-span-2"><button type="button" disabled={state.kind === 'busy'} onClick={() => void save()} className="min-h-11 rounded-full bg-[#214C40] px-5 text-sm font-bold text-white">{ar ? 'حفظ التعديلات' : 'Save changes'}</button></div>
      {state.text && <p role={state.kind === 'error' ? 'alert' : 'status'} className={`sm:col-span-2 text-xs font-bold ${state.kind === 'error' ? 'text-[#A34D43]' : 'text-[#2F6555]'}`}>{state.text}</p>}
    </div>}
  </section>;
};
