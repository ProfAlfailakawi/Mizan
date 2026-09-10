import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Bell, Share2, Radio, Check, Clock3, Gavel, Award, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { queueOrderValue } from '../../lib/judging-integrity';
import { Badge } from '../design-system/Badge';
import { Button } from '../design-system/Button';
import type { Participant } from '../../types';

// "Your child is with the panel now." A consent-gated, privacy-safe live thread for a guardian:
// queue position, the moment they enter the committee, and the moment their result is revealed at
// the ceremony — so a family in a distant village can share the moment. Built on the existing
// One-QR journey + adaptive queue; no new tracking of anyone but the guardian's own child.

type Stage = 'registered' | 'arrived' | 'queued' | 'in_committee' | 'result';

export const GuardianLiveLink: React.FC<{ child: Participant }> = ({ child }) => {
  const store = useAppStore();
  const ar = store.language === 'ar';
  const [notify, setNotify] = useState(false);
  const [copied, setCopied] = useState(false);
  /* نسخ فاشل بلا خبر يعني زرًّا لا يفعل شيئًا ولا يقول لماذا. */
  const [shareNote, setShareNote] = useState('');
  /*
   * وعدٌ لا يُوفى أسوأ من غيابه: كان الزر يقول لولي الأمر «سنرسل تنبيهًا عند الاستدعاء» وهو
   * لا يفعل شيئًا سوى تلوين نفسه — لا إذن ولا قناة ولا إرسال. صار الآن تنبيه المتصفح فعليًا،
   * ولا يُقال إنه مفعّل إلا بعد منح الإذن، ونصّه يوضّح أنه يعمل ما دامت الصفحة مفتوحة.
   */
  const [notifyDenied, setNotifyDenied] = useState(false);
  const lastNotifiedStage = useRef<string>('');
  /* اسم المتسابق بدل ضمير المذكّر: الصفحة نفسها تخدم ابنًا وابنة. */
  const childName = (ar ? child.fullNameArabic : child.fullName) || child.code;
  const firstName = String(childName).trim().split(/\s+/)[0] || childName;

  const consent = store.consents.some((c) => c.participantId === child.id && c.kind === 'guardian' && c.accepted);

  const queue = useMemo(() => store.participants.filter((p) => p.status === 'in_queue').sort((a, b) => queueOrderValue(a) - queueOrderValue(b)), [store.participants]);
  const position = queue.findIndex((p) => p.id === child.id) + 1;
  const committee = store.committees.find((c) => c.id === child.assignedCommitteeId);
  const result = store.results.find((r) => r.participantId === child.id);
  const sealed = !!result && store.sealApprovals.length > 0;

  const stage: Stage = result ? 'result' : child.status === 'in_session' ? 'in_committee' : child.status === 'in_queue' ? 'queued' : child.checkedInAt ? 'arrived' : 'registered';

  const steps: { key: Stage; icon: React.ComponentType<{ className?: string }>; ar: string; en: string; done: boolean; active: boolean }[] = [
    { key: 'registered', icon: Check, ar: 'مسجّل', en: 'Registered', done: true, active: stage === 'registered' },
    { key: 'arrived', icon: MapPin, ar: 'وصل القاعة', en: 'Arrived', done: !!child.checkedInAt || ['queued', 'in_committee', 'result'].includes(stage), active: stage === 'arrived' },
    { key: 'queued', icon: Clock3, ar: 'في الطابور', en: 'In queue', done: ['in_committee', 'result'].includes(stage), active: stage === 'queued' },
    { key: 'in_committee', icon: Gavel, ar: 'أمام اللجنة', en: 'With the panel', done: stage === 'result', active: stage === 'in_committee' },
    { key: 'result', icon: Award, ar: 'النتيجة', en: 'Result', done: stage === 'result' && sealed, active: stage === 'result' },
  ];

  /*
   * الرابط القديم كان `#guardian-live/<code>` — مسار غير موجود في التطبيق إطلاقًا، فكل من
   * أرسله لأهله أرسل صفحة فارغة. الرابط الحقيقي هو صفحة ولي الأمر نفسها بمفتاحها الخاص،
   * وهي التي بين يديه الآن. وإن فُتحت هذه البطاقة من مسار آخر فلا رابط يُشارَك، ولا يُعرض زر.
   */
  const currentUrl = typeof location !== 'undefined' ? location.href : '';
  const shareLink = currentUrl.includes('#guardian') ? currentUrl : '';
  const copy = async () => {
    if (!shareLink) return;
    setShareNote('');
    try { await navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setShareNote(ar ? 'تعذّر النسخ من المتصفح. انسخ الرابط من شريط العنوان أعلى الصفحة.' : 'The browser blocked copying. Copy the link from the address bar instead.'); }
  };

  const toggleNotify = async () => {
    if (notify) { setNotify(false); return; }
    setNotifyDenied(false);
    const api = typeof window !== 'undefined' ? (window as unknown as { Notification?: typeof Notification }).Notification : undefined;
    if (!api) { setNotifyDenied(true); return; }
    let permission = api.permission;
    if (permission === 'default') { try { permission = await api.requestPermission(); } catch { permission = 'denied'; } }
    if (permission !== 'granted') { setNotifyDenied(true); return; }
    setNotify(true);
  };

  useEffect(() => {
    if (!notify || typeof window === 'undefined') return;
    if (stage !== 'in_committee' && stage !== 'result') return;
    if (lastNotifiedStage.current === stage) return;
    lastNotifiedStage.current = stage;
    const body = stage === 'in_committee'
      ? (ar ? `${firstName} أمام اللجنة الآن.` : `${firstName} is with the panel now.`)
      : (ar ? `صدرت نتيجة ${firstName} وتُكشف في الحفل.` : `${firstName}'s result is in; it is revealed at the ceremony.`);
    try { new Notification(ar ? 'ميزان' : 'MIZAN', { body }); } catch { /* المتصفح رفض الإشعار: لا يُعطَّل شيء بسببه */ }
  }, [notify, stage, ar, firstName]);

  return (
    <div className="mizan-surface p-6 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-black tracking-[.14em] text-[#5F6B64]"><Radio className="w-3.5 h-3.5 text-[#2F6555]" />{ar ? 'المتابعة الحية' : 'LIVE THREAD'}</div>
        <Badge variant={stage === 'in_committee' ? 'amber' : stage === 'result' ? 'emerald' : 'neutral'}>
          {ar ? (stage === 'in_committee' ? 'أمام اللجنة الآن' : stage === 'queued' ? `الترتيب ${position || '—'}` : stage === 'result' ? 'صدرت النتيجة' : 'قبل الدخول') : (stage === 'in_committee' ? 'With panel now' : stage === 'queued' ? `#${position || '—'}` : stage === 'result' ? 'Result out' : 'Before entry')}
        </Badge>
      </div>

      {/* Live headline */}
      <div className="mt-4 rounded-2xl bg-gradient-to-b from-[#20493d] to-[#17362b] text-white p-5">
        <div className="text-[11px] text-white/50 font-black">{ar ? child.fullNameArabic : child.fullName} · {child.code}</div>
        <div className="text-xl sm:text-2xl font-black mt-1">
          {stage === 'in_committee' ? (ar ? `${firstName} الآن أمام ${committee?.code || 'اللجنة'}` : `${firstName} is now with ${committee?.code || 'the panel'}`)
            : stage === 'queued' ? (ar ? `الترتيب في الطابور: ${position || '—'}` : `Queue position: ${position || '—'}`)
            : stage === 'result' ? (ar ? 'صدرت النتيجة — تُكشف في الحفل' : 'Result is in — revealed at the ceremony')
            : stage === 'arrived' ? (ar ? 'الوصول إلى القاعة تمّ، والانتظار للدور' : 'Arrived, awaiting turn')
            : (ar ? 'التسجيل تمّ، والوصول لم يقع بعد' : 'Registered, not yet arrived')}
        </div>
        {stage === 'queued' && position > 1 && <div className="text-xs text-white/55 mt-2">{ar ? `يسبقه ${position - 1} في الطابور` : `${position - 1} ahead in the queue`}</div>}
      </div>

      {/* Journey rail */}
      <div className="mt-5 flex items-center justify-between">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <React.Fragment key={s.key}>
              <div className="flex flex-col items-center gap-1.5 text-center min-w-0">
                <span className={`w-10 h-10 rounded-full grid place-items-center ${s.done ? 'bg-[#214C40] text-white' : s.active ? 'bg-[#F2EADC] text-[#7d5e34] ring-2 ring-[#d7c39e]' : 'bg-[#eeece6] text-[#9aa09b]'}`}><Icon className="w-4 h-4" /></span>
                <span className={`text-[10px] font-bold ${s.active ? 'text-[#7d5e34]' : s.done ? 'text-[#214C40]' : 'text-[#9aa09b]'}`}>{ar ? s.ar : s.en}</span>
              </div>
              {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-1 rounded-full ${steps[i + 1].done || steps[i + 1].active ? 'bg-[#bcd0c7]' : 'bg-[#e6e4dd]'}`} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Consent-gated actions */}
      {consent ? (
        <div className="mt-6 pt-5 border-t border-[#e5e3dc] grid sm:grid-cols-2 gap-3">
          <button onClick={() => void toggleNotify()} className={`rounded-2xl border p-4 text-start transition ${notify ? 'border-[#214C40] bg-[#E7EEE9]' : 'border-[#dcdad2] bg-white hover:border-[#bcc7c1]'}`}>
            <div className="flex items-center justify-between"><Bell className={`w-4 h-4 ${notify ? 'text-[#214C40]' : 'text-[#666b67]'}`} />{notify && <Check className="w-4 h-4 text-[#214C40]" />}</div>
            <div className="text-sm font-black mt-3">{ar ? 'نبّهني عند الدخول' : 'Alert me at the turn'}</div>
            <div className="text-[10px] text-[#656b66] mt-1">{notifyDenied ? (ar ? 'المتصفح لا يسمح بالتنبيهات. تابع من هذه الصفحة، فهي تتحدّث تلقائيًا.' : 'The browser blocks notifications. Follow this page instead; it updates on its own.') : notify ? (ar ? 'سيصلك تنبيه عند دخول اللجنة وعند صدور النتيجة، ما دامت هذه الصفحة مفتوحة.' : 'You will be notified at panel entry and at the result, while this page stays open.') : (ar ? 'دخول اللجنة وإعلان النتيجة' : 'Panel entry & result reveal')}</div>
          </button>
          {shareLink && <button onClick={() => void copy()} className="rounded-2xl border border-[#dcdad2] bg-white p-4 text-start hover:border-[#bcc7c1] transition">
            <div className="flex items-center justify-between"><Share2 className="w-4 h-4 text-[#666b67]" />{copied && <span className="text-[10px] font-black text-[#214C40]">{ar ? 'نُسخ' : 'Copied'}</span>}</div>
            <div className="text-sm font-black mt-3">{ar ? 'رابط العائلة الخاص' : 'Private family link'}</div>
            <div className="text-[10px] text-[#656b66] mt-1">{shareNote || (ar ? 'عرض فقط. الرابط مفتاح خاص بك، فشاركه مع العائلة وحدها ولا تنشره.' : 'View-only. This link is your private key — share it with family only.')}</div>
          </button>}
        </div>
      ) : (
        <div className="mt-6 pt-5 border-t border-[#e5e3dc] flex items-center gap-2 text-[11px] text-[#696f6b]"><ShieldCheck className="w-4 h-4" />{ar ? 'المتابعة الحية والتنبيهات تُفعّل بعد موافقة ولي الأمر أعلاه.' : 'Live thread and alerts activate after guardian consent above.'}</div>
      )}

      <div className="mt-4 text-[10px] text-[#696f6b] leading-6">
        {ar ? 'يخص طفلك وحده وبعد موافقتك. لا يكشف الرابط بيانات متسابقين آخرين. البث الحي للحفل يتطلب تجهيز القاعة وموافقة صريحة، ولا يدّعي ميزان تشغيله قبل توفره فعليًا.' : "Scoped to your own child and gated by your consent. The link never exposes other participants. Live ceremony streaming needs venue setup and explicit consent; MIZAN never claims it works before it truly does."}
      </div>
    </div>
  );
};
