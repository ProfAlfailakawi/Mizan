import React, { Suspense, lazy, useEffect, useState } from 'react';
import { PersistenceAlert } from './components/design-system/PersistenceAlert';
import { VenueLockButton, VenueUnlockGuard, useVenueLockState } from './components/design-system/VenueLockControl';
import { signOut } from 'firebase/auth';
import { useAppStore } from './lib/store';
import { useMizanAuth } from './lib/useMizanAuth';
import { Header, LiveSupportControl } from './components/layout/Header';
import { useIdleSignOut } from './lib/useIdleSignOut';
import { AuthPortal } from './components/auth/AuthPortal';
import { TotpSecurity } from './components/auth/TotpSecurity';
import { auth } from './lib/firebase';
import { DemoReturn } from './components/public/DemoReturn';
import { OnboardingExperience, onboardingWasSeen } from './components/public/OnboardingExperience';
import { fetchTenant } from './lib/tenant';
import { MizanLogo } from './components/design-system/MizanLogo';
import { SplashExperience, splashWasSeen } from './components/public/SplashExperience';
import { hostSurface } from './lib/host-surface';

/*
 * Route-level code splitting.
 *
 * Every role portal and venue screen used to sit in a single 871 kB entry chunk, so a judge
 * downloaded the platform-admin console, the deployment studio and the ceremony renderer
 * before their own first screen painted.
 *
 * These loaders are declared once and used twice: React.lazy consumes them for the split,
 * and warmViews() replays them on idle. That second pass is not an optimisation — it is the
 * reason the split is safe. MIZAN promises competition-day continuity when the venue drops
 * offline, and the service worker can only serve a chunk it has already seen. Splitting
 * without warming would mean a screen nobody opened while online simply fails at the venue.
 */
const VIEWS = {
  experienceHub: () => import('./components/public/ExperienceHub'),
  rolePortals: () => import('./components/admin/RolePortals'),
  competitionOverview: () => import('./components/admin/CompetitionOverview'),
  judgeOS: () => import('./components/judge/JudgeOS'),
  headJudgeInbox: () => import('./components/head-judge/HeadJudgeInbox'),
  commandCenter: () => import('./components/operations/CommandCenter'),
  participantDashboard: () => import('./components/participant/ParticipantDashboard'),
  kioskMode: () => import('./components/gate/KioskMode'),
  ceremonyView: () => import('./components/public/CeremonyView'),
  waitingBoard: () => import('./components/public/WaitingBoard'),
  hallRecitationMap: () => import('./components/public/HallRecitationMap'),
  broadcastStage: () => import('./components/public/BroadcastStage'),
  judgeIntelligenceLab: () => import('./components/public/JudgeIntelligenceLab'),
  certificateVerification: () => import('./components/public/CertificateVerification'),
  registrationFlow: () => import('./components/public/RegistrationFlow'),
  competitionLanding: () => import('./components/public/CompetitionLanding'),
  journeyAccess: () => import('./components/public/JourneyAccess'),
  passwordResetPortal: () => import('./components/auth/PasswordResetPortal'),
  trustVerification: () => import('./components/public/TrustVerification'),
  marketingSite: () => import('./components/marketing/MarketingSite'),
};

const pick = (loader: () => Promise<any>, name: string) =>
  lazy(() => loader().then((m: any) => ({ default: m[name] })));

const ExperienceHub = pick(VIEWS.experienceHub, 'ExperienceHub');
const CompetitionOverview = pick(VIEWS.competitionOverview, 'CompetitionOverview');
const JudgeOS = pick(VIEWS.judgeOS, 'JudgeOS');
const HeadJudgeInbox = pick(VIEWS.headJudgeInbox, 'HeadJudgeInbox');
const CommandCenter = pick(VIEWS.commandCenter, 'CommandCenter');
const ParticipantDashboard = pick(VIEWS.participantDashboard, 'ParticipantDashboard');
const KioskMode = pick(VIEWS.kioskMode, 'KioskMode');
const CeremonyView = pick(VIEWS.ceremonyView, 'CeremonyView');
const WaitingBoard = pick(VIEWS.waitingBoard, 'WaitingBoard');
const HallRecitationMap = pick(VIEWS.hallRecitationMap, 'HallRecitationMap');
const BroadcastStage = pick(VIEWS.broadcastStage, 'BroadcastStage');
const JudgeIntelligenceLab = pick(VIEWS.judgeIntelligenceLab, 'JudgeIntelligenceLab');
const CertificateVerification = pick(VIEWS.certificateVerification, 'CertificateVerification');
const RegistrationFlow = pick(VIEWS.registrationFlow, 'RegistrationFlow');
const CompetitionLanding = pick(VIEWS.competitionLanding, 'CompetitionLanding');
const JourneyAccess = pick(VIEWS.journeyAccess, 'JourneyAccess');
const PasswordResetPortal = pick(VIEWS.passwordResetPortal, 'PasswordResetPortal');
const TrustVerification = pick(VIEWS.trustVerification, 'TrustVerification');
const MarketingSite = pick(VIEWS.marketingSite, 'MarketingSite');
const SuperAdminConsole = pick(VIEWS.rolePortals, 'SuperAdminConsole');
const OrganizationHome = pick(VIEWS.rolePortals, 'OrganizationHome');
const OperatorWorkspace = lazy(()=>import('./components/admin/SaaSWorkspace').then(m=>({default:m.OperatorWorkspace})));
const ExceptionDesk = pick(VIEWS.rolePortals, 'ExceptionDesk');
const DelegationPortal = pick(VIEWS.rolePortals, 'DelegationPortal');
const AuditorConsole = pick(VIEWS.rolePortals, 'AuditorConsole');
const GuardianPortal = pick(VIEWS.rolePortals, 'GuardianPortal');
const SupportConsole = pick(VIEWS.rolePortals, 'SupportConsole');

let warmed = false;
/* Pull every remaining view into the service-worker cache once the first screen is
   interactive, so going offline later never strands an unopened role.
   The delay is deliberate: requestIdleCallback alone fires while the entry chunks are
   still arriving on a slow venue link, and 26 background requests would then compete
   with the screen the reader is actually waiting for. Wait until the splash has handed
   over, then use idle time. */
const WARM_AFTER_MS = 3000;
function warmViews() {
  if (warmed || typeof window === 'undefined') return;
  const conn = (navigator as any).connection;
  // Never spend a metered or 2G connection on screens the reader has not asked for.
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || '')) return;
  if (!navigator.onLine) { window.addEventListener('online', () => warmViews(), { once: true }); return; }
  warmed = true;
  const run = () => { for (const load of Object.values(VIEWS)) void load().catch(() => { warmed = false; }); };
  const idle = (window as any).requestIdleCallback;
  window.setTimeout(() => { if (idle) idle(run, { timeout: 4000 }); else run(); }, WARM_AFTER_MS);
}

const ViewFallback: React.FC = () => (
  <div className="min-h-screen grid place-items-center bg-[#f7f5ef]" role="status" aria-live="polite">
    <MizanLogo language="ar" compact/>
    <span className="sr-only">جارٍ التحميل</span>
  </div>
);
const OverlayFallback: React.FC = () => (
  <div className="fixed inset-0 z-50 grid place-items-center bg-[#16241f]" role="status" aria-live="polite">
    <MizanLogo language="ar" tone="inverse" compact/>
    <span className="sr-only">جارٍ التحميل</span>
  </div>
);
// كل شاشة تحمل شريط عطل الحفظ: التنبيه الذي يظهر في شاشة واحدة لا يُرى حين يقع العطل في غيرها.
/* شاشة الدور غير المُسنَد: تقول الحقيقة ولا تمنح صلاحية. */
const NoRoleConsole: React.FC = () => (
  <div className="min-h-[60vh] grid place-items-center p-6">
    <div className="mizan-surface p-8 max-w-md text-center">
      <div className="mizan-kicker">حوكمة الوصول</div>
      <h1 className="text-xl font-black mt-2">لا توجد شاشة لهذا الدور</h1>
      <p className="text-xs text-[#636864] mt-3 leading-6">الحساب موثّق، لكن دوره غير مرتبط بواجهة تشغيلية في هذا الإصدار. راجع مدير المؤسسة لإسناد دور معروف.</p>
    </div>
  </div>
);


/*
 * أسطح القاعة تحت القفل.
 *
 * حين يكون الجهاز مقفولًا لا تُمرَّر `onClose` إلى الشاشة إطلاقًا: فلا زرّ إغلاق ولا Escape
 * ولا دور dialog — لأن السطح حينها ليس نافذةً فوق التطبيق بل هو الجهاز كله. وهذا يستعمل
 * التصميم القائم (شاشة بلا onClose = سطح دائم) بدل أن يضيف حارسًا يمكن تجاوزه.
 */
const VENUE_LABEL:Record<string,string>={kiosk:'بوابة الحضور',waitingBoard:'لوحة الانتظار',hallMap:'خريطة القاعة',broadcast:'شاشة البث',jiLab:'مختبر ذكاء التحكيم',ceremony:'شاشة الحفل'};
const VenueSurfaces:React.FC<{kiosk:boolean;waitingBoard:boolean;hallMap:boolean;broadcast:boolean;jiLab:boolean;ceremony:boolean;close:Record<string,()=>void>}>=({kiosk,waitingBoard,hallMap,broadcast,jiLab,ceremony,close})=>{
 const {language}=useAppStore(); const ar=language==='ar';
 const {lock,apply}=useVenueLockState();
 const active=kiosk?'kiosk':waitingBoard?'waitingBoard':hallMap?'hallMap':broadcast?'broadcast':jiLab?'jiLab':ceremony?'ceremony':'';
 if(!active) return null;
 const locked=!!lock;
 // مقفول ⇒ بلا مخرج. مفتوح ⇒ يغلق كالمعتاد.
 const exit=locked?undefined:close[active];
 const surface=VENUE_LABEL[active]||active;
 return <>
  <Overlay>
   {kiosk&&<KioskMode onClose={exit}/>}
   {waitingBoard&&<WaitingBoard onClose={exit}/>}
   {hallMap&&<HallRecitationMap onClose={exit}/>}
   {broadcast&&<BroadcastStage onClose={exit}/>}
   {jiLab&&<JudgeIntelligenceLab onClose={exit}/>}
   {ceremony&&<CeremonyView onClose={exit}/>}
  </Overlay>
  {locked
   ? <VenueUnlockGuard lock={lock!} ar={ar} onUnlocked={()=>apply(null)}/>
   : <div className="fixed bottom-4 inset-x-0 z-[80] flex justify-center pointer-events-none"><div className="pointer-events-auto"><VenueLockButton surface={surface} ar={ar} onLocked={apply}/></div></div>}
 </>;
};

const Page: React.FC<{children: React.ReactNode}> = ({children}) => <><PersistenceAlert/><Suspense fallback={<ViewFallback/>}>{children}</Suspense></>;
const Overlay: React.FC<{children: React.ReactNode}> = ({children}) => <Suspense fallback={<OverlayFallback/>}>{children}</Suspense>;

/*
 * روابط المسابقة المخصصة.
 *
 * كل مسابقة تُشارَك برابط مباشر يحمل معرّفها: `#register?comp=<id>` أو `#competition?comp=<id>`.
 * هكذا يرسل المنظّم رابط مسابقته وحدها، فيفتح المتسابق نموذج تلك المسابقة تحديدًا بدل
 * الاعتماد على المسابقة النشطة في المتجر. بلا المعامل يبقى السلوك القديم (المسابقة النشطة).
 */
const compParam = (h: string): string | null => {
  const i = h.indexOf('?');
  if (i === -1) return null;
  try { return new URLSearchParams(h.slice(i + 1)).get('comp'); } catch { return null; }
};
/* شاشة تظهر حين يحمل الرابط معرّف مسابقة غير موجودة: تقول الحقيقة بدل أن تُسقط الزائر على مسابقة أخرى. */
const CompetitionNotFound: React.FC = () => (
  <div className="min-h-screen grid place-items-center bg-[#f7f5ef] p-5">
    <div className="mizan-surface p-8 max-w-md text-center">
      <div className="mizan-kicker">رابط المسابقة</div>
      <h1 className="text-xl font-black mt-2">هذه المسابقة غير متاحة</h1>
      <p className="text-xs text-[#636864] mt-3 leading-6">الرابط يشير إلى مسابقة غير موجودة أو أُغلق تسجيلها. تأكد من الرابط الذي شاركته جهة المسابقة.</p>
    </div>
  </div>
);

const TenantSuspendedScreen:React.FC<{language:string}>=({language})=>{const ar=language==='ar';return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] p-5" dir={ar?'rtl':'ltr'}><div className="mizan-surface max-w-lg p-8 sm:p-10 text-center"><div className="flex justify-center"><MizanLogo language={ar?'ar':'en'} compact/></div><div className="mizan-kicker mt-6">{ar?'حالة الجهة':'ORGANIZATION STATUS'}</div><h1 className="text-2xl font-black mt-2">{ar?'تم إيقاف وصول هذه الجهة مؤقتًا':'Organization access is temporarily suspended'}</h1><p className="text-sm text-[#636864] leading-7 mt-4">{ar?'بيانات الجهة ومسابقاتها محفوظة بالكامل، لكن الوصول التشغيلي متوقف حاليًا. يرجى التواصل مع إدارة المنصة.':'All organization data remains محفوظة; operational access is temporarily unavailable. Please contact the platform administrator.'}</p></div></div>};

export default function App() {
 const {currentUser,competitions,switchRole,selectCompetition,loadPublicCompetition,accessibilityProfiles,ensureAccessibilityProfile,language,updateOrganizationBrand}=useAppStore();
 useEffect(()=>{const p=accessibilityProfiles.find(x=>x.userId===currentUser.id)||ensureAccessibilityProfile();const el=document.documentElement;el.dataset.mizanText=p.textScale;el.dataset.mizanTouch=p.touchScale;el.dataset.mizanContrast=p.contrast;el.dataset.mizanMotion=p.motion;},[currentUser.id,accessibilityProfiles.length]);
 useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';},[language]);
 useEffect(()=>{warmViews()},[]);
 const requireAuth=import.meta.env.VITE_REQUIRE_AUTH==='true';
 /* mizan.<domain> وجهٌ تسويقي عام: لا يمرّ ببداية العرض ولا ببوابة الدخول ولا بهوية جهة.
    وفي وضع العرض (بلا مصادقة) يبقى التطبيق كما هو حتى لا ينقلب العرض المحلي صفحةَ بيع. */
 const marketing=requireAuth&&hostSurface()==='marketing';
 const {signedIn,authReady,accessError,activationToken,setActivationToken,activationFromQr,activationMessage,activateAccount,takeoverSession}=useMizanAuth(requireAuth);
 const idleWarnSeconds=useIdleSignOut(requireAuth&&signedIn);
 const demoMode=!requireAuth;
 // Deep links skip the splash, and so do repeat loads inside the same session: the
 // assembly is a 2.8s first-impression, not a per-reload toll for staff reopening the app.
 const [splashOpen,setSplashOpen]=useState(()=>!window.location.hash && !splashWasSeen());
 const [onboardingOpen,setOnboardingOpen]=useState(()=>!onboardingWasSeen());
 const [experienceHome,setExperienceHome]=useState(()=>demoMode && !window.location.hash);
 const [tenantSuspended,setTenantSuspended]=useState(false);
 const [kiosk,setKiosk]=useState(false); const [ceremony,setCeremony]=useState(false); const [waitingBoard,setWaitingBoard]=useState(false); const [hallMap,setHallMap]=useState(false); const [broadcast,setBroadcast]=useState(false); const [jiLab,setJiLab]=useState(false); const [hash,setHash]=useState(window.location.hash);
 useEffect(()=>{const fn=()=>setHash(window.location.hash);window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn)},[]);
 useEffect(()=>{const fn=(ev:Event)=>{const surface=(ev as CustomEvent<string>).detail; if(surface==='kiosk')setKiosk(true); else if(surface==='waitingBoard')setWaitingBoard(true); else if(surface==='hallMap')setHallMap(true); else if(surface==='broadcast')setBroadcast(true); else if(surface==='jiLab')setJiLab(true); else if(surface==='ceremony')setCeremony(true);}; window.addEventListener('mizan:open-venue',fn as EventListener); return()=>window.removeEventListener('mizan:open-venue',fn as EventListener)},[]);
 /* الجهة صاحبة هذا النطاق: يسأل المتصفح مرة واحدة عند الإقلاع، فتظهر هوية الجهة (اسمها
    وشعارها) لزوّار نطاقها الخاص أو الفرعي. نشرٌ بجهة واحدة يعيد لا شيء فتبقى «ميزان». */
 useEffect(()=>{const c=new AbortController();void fetchTenant(c.signal).then(t=>{if(!t)return;setTenantSuspended(t.status==='suspended');if(t.status==='suspended')return;
  updateOrganizationBrand({
    displayName:t.displayName||undefined,
    displayNameArabic:t.displayNameArabic||undefined,
    logoUrl:t.logoUrl||undefined,
    slogan:t.slogan||undefined,
    sloganArabic:t.sloganArabic||undefined,
    websiteUrl:t.websiteUrl||undefined,
    phoneNumber:t.phoneNumber||undefined,
    supportEmail:t.supportEmail||undefined,
    address:t.address||undefined,
    addressArabic:t.addressArabic||undefined,
    displayPlacements:t.displayPlacements||undefined,
  });});
  return()=>c.abort()},[]);
 // رابط يحمل معرّف مسابقة ⇒ اجعلها المسابقة النشطة قبل عرض صفحتها. غياب المعرّف يبقي المسابقة الحالية.
 const requestedComp=compParam(hash);
 const [compMissing,setCompMissing]=useState(false); const [compLoading,setCompLoading]=useState(false);
 useEffect(()=>{
  let alive=true;
  if(!requestedComp){setCompMissing(false);setCompLoading(false);return()=>{alive=false}}
  const publicRoute=hash.startsWith('#register')||hash.startsWith('#competition')||hash.startsWith('#journey')||hash.startsWith('#guardian');
  const localExists=competitions.some(c=>c.id===requestedComp);
  // الروابط العامة تعيد جلب النسخة المنشورة أولًا حتى لا تعرض ذاكرة المتصفح فئات قديمة.
  // ولا نختار النسخة المحلية قبل الجلب: اختيارها يفعّل مزامنة الإدارة وقد يعيد نشر نسخة قديمة.
  if(publicRoute){
   setCompLoading(true);setCompMissing(false);
   void loadPublicCompetition(requestedComp).then(ok=>{if(!alive)return;if(!ok&&localExists)selectCompetition(requestedComp);setCompMissing(!ok&&!localExists);setCompLoading(false)});
   return()=>{alive=false};
  }
  // شاشة الإدارة تفضّل النسخة المحلية الأحدث ولا تستبدلها بنسخة نشر قديمة.
  if(selectCompetition(requestedComp)){setCompMissing(false);setCompLoading(false);return()=>{alive=false}}
  setCompLoading(true);setCompMissing(false);
  void loadPublicCompetition(requestedComp).then(ok=>{if(!alive)return;setCompMissing(!ok);setCompLoading(false)});
  return()=>{alive=false};
 },[requestedComp,hash]);
 if(marketing) return <Suspense fallback={<ViewFallback/>}><MarketingSite/></Suspense>;
 if(tenantSuspended) return <TenantSuspendedScreen language={language}/>;
 if(splashOpen) return <SplashExperience onDone={()=>setSplashOpen(false)}/>;
 if(!authReady) return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] text-xs font-bold text-[#636864]"><MizanLogo language="ar" compact/></div>;
 // التسجيل وصفحة المسابقة روابط عامة؛ لا تُجبر الزائر على حساب موظف.
 if((hash.startsWith('#competition')||hash.startsWith('#register')||hash.startsWith('#journey')||hash.startsWith('#guardian'))&&compLoading) return <ViewFallback/>;
 if(hash.startsWith('#competition')) return compMissing?<CompetitionNotFound/>:<Page><CompetitionLanding/></Page>;
 if(hash.startsWith('#register')) return compMissing?<CompetitionNotFound/>:<div className="min-h-screen text-[#171b18] font-arabic"><Page><RegistrationFlow onSuccess={(participant)=>{window.location.hash=`#journey?comp=${encodeURIComponent(requestedComp||participant.competitionId||'')}&key=${encodeURIComponent(participant.journeyAccessToken||'')}`}}/></Page></div>;
 if(hash.startsWith('#journey')) return compMissing?<CompetitionNotFound/>:<Page><JourneyAccess audience="participant"/></Page>;
 if(hash.startsWith('#guardian')) return compMissing?<CompetitionNotFound/>:<Page><JourneyAccess audience="guardian"/></Page>;
 // استعادة كلمة المرور رابط عام محمي برمز لمرة واحدة؛ لا يتطلب جلسة موظف.
 if(hash.startsWith('#reset-password')) return <div className="min-h-screen text-[#171b18] font-arabic"><Page><PasswordResetPortal/></Page></div>;
 // التحقق من الشهادة خدمة عامة بالكامل ولا تمر ببوابة الموظفين.
 if(hash.startsWith('#verify')) return <div className="min-h-screen text-[#171b18] font-arabic"><Page><CertificateVerification/></Page>{demoMode&&<DemoReturn onReturn={()=>{window.location.hash='';setExperienceHome(true)}}/>}</div>;
 if(requireAuth&&accessError) return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] p-5"><div className="mizan-surface p-7 max-w-md w-full text-center"><div className="flex justify-center mb-4"><MizanLogo language="ar" compact/></div><div className="mizan-kicker">حوكمة الوصول</div><h1 className="text-xl font-black mt-2">{accessError==='MFA_REQUIRED'?'يلزم تحقق إضافي لهذا الحساب':accessError==='PRIVILEGED_SESSION_CONFLICT'?'الحساب مفتوح على جهاز حساس آخر':'الحساب غير مفوض'}</h1><p className="text-xs text-[#636864] mt-3 leading-6">{accessError==='MFA_REQUIRED'?'حساب مالك المنصة محمي بالتحقق بخطوتين. إذا لم تربط Authenticator بعد، أكمل التفعيل هنا دون تسجيل الخروج.':accessError==='PRIVILEGED_SESSION_CONFLICT'?'منع ميزان جلسة متزامنة لهذا الدور. يمكن لصاحب الصلاحية إغلاق الجلسة القديمة ثم المتابعة بأمان.':'الهوية صحيحة، لكن الحساب يحتاج دعوة وصلاحية محددة داخل الجهة قبل الدخول.'}</p>{accessError==='MFA_REQUIRED'&&<div className="mt-6 text-start"><TotpSecurity bootstrap/></div>}{accessError==='ACCOUNT_NOT_PROVISIONED'&&<div className="mt-5 text-start">{activationFromQr?<div className="rounded-2xl bg-[#E7EEE9] text-[#214C40] p-4 text-xs font-bold leading-6 text-center">{activationMessage==='ACTIVATING'?'تمت قراءة QR — جارٍ ربط الحساب بالدعوة…':'تمت قراءة QR التفعيل. سيُربط الحساب تلقائيًا بالبريد المدعو.'}</div>:<><label className="text-[10px] font-black text-[#616763]">رمز التفعيل الاحتياطي</label><input value={activationToken} onChange={e=>setActivationToken(e.target.value)} className="mizan-input mt-2" placeholder="ألصق الرمز فقط إذا تعذر مسح QR"/><button onClick={()=>void activateAccount()} className="mt-3 w-full rounded-xl bg-[#214C40] text-white py-2.5 text-xs font-black">تفعيل الحساب</button></>}{activationMessage&&activationMessage!=='ACTIVATING'&&<div className="mt-2 text-[10px] text-center text-[#656b66]">{activationMessage==='ACTIVATED'?'تم تفعيل الحساب':activationMessage==='ACTIVATION_FAILED'?'تعذر تفعيل الحساب':activationMessage}</div>}</div>}<div className="text-[10px] text-[#696f6b] mt-3">{accessError==='MFA_REQUIRED'?'تحقق إضافي مطلوب':accessError==='PRIVILEGED_SESSION_CONFLICT'?'تعارض جلسة حساسة':accessError==='ACCOUNT_NOT_PROVISIONED'?'الحساب بانتظار التفعيل':'تعذر التحقق من صلاحية الحساب'}</div>{accessError==='PRIVILEGED_SESSION_CONFLICT'&&<button onClick={()=>{void takeoverSession()}} className="mt-6 w-full rounded-2xl bg-[#214C40] text-white text-sm font-black py-3">متابعة هنا وإغلاق الجلسة الأخرى</button>}{accessError!=='MFA_REQUIRED'&&<button onClick={()=>{void signOut(auth).catch(()=>{}).finally(()=>window.location.reload())}} className="mt-5 text-xs font-bold text-[#214C40]">تسجيل الخروج</button>}</div></div>;
 if(requireAuth&&!signedIn) return <AuthPortal/>;
 if(onboardingOpen) return <OnboardingExperience onDone={()=>setOnboardingOpen(false)}/>;
 const returnToExperience=()=>{window.location.hash='';setHash('');setExperienceHome(true)};
 if(hash.startsWith('#trust-verify')) return <><Page><TrustVerification/></Page>{demoMode&&<DemoReturn onReturn={returnToExperience}/>}</>;
 if(hash.startsWith('#broadcast')) return <><Overlay><BroadcastStage onClose={returnToExperience}/></Overlay></>;
 if(hash.startsWith('#judge-intelligence')) return <><Overlay><JudgeIntelligenceLab onClose={returnToExperience}/></Overlay></>;
 if(demoMode&&experienceHome) return <><Page><ExperienceHub onEnterRole={(role)=>{switchRole(role);setExperienceHome(false)}} onOpenKiosk={()=>setKiosk(true)} onOpenCeremony={()=>setCeremony(true)} onOpenWaiting={()=>setWaitingBoard(true)} onOpenHall={()=>setHallMap(true)} onOpenBroadcast={()=>setBroadcast(true)} onOpenLab={()=>setJiLab(true)}/></Page><VenueSurfaces kiosk={kiosk} waitingBoard={waitingBoard} hallMap={hallMap} broadcast={broadcast} jiLab={jiLab} ceremony={ceremony} close={{kiosk:()=>setKiosk(false),waitingBoard:()=>setWaitingBoard(false),hallMap:()=>setHallMap(false),broadcast:()=>setBroadcast(false),jiLab:()=>setJiLab(false),ceremony:()=>setCeremony(false)}}/></>;
 const competitionClosed=['completed','archived'].includes((competitions.find(c=>c.id===requestedComp)||competitions[0])?.status||'');
 const operationalRoles=['comp_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','participant','broadcast_operator','guardian','support_agent'];
 if(competitionClosed&&operationalRoles.includes(currentUser.role)) return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] p-6" dir="rtl"><div className="mizan-surface max-w-lg w-full p-8 text-center"><MizanLogo language="ar" compact/><div className="mizan-kicker mt-6">المسابقة مغلقة</div><h1 className="text-2xl font-black mt-2">انتهت المسابقة وتم إيقاف الوصول التشغيلي</h1><p className="text-sm text-[#636864] mt-4 leading-7">تم حفظ السجل والنتائج والشهادات، لكن جميع صلاحيات التشغيل والدخول لهذه المسابقة متوقفة.</p><button onClick={()=>void signOut(auth)} className="mt-6 rounded-2xl bg-[#214C40] text-white px-6 py-3 text-sm font-black">تسجيل الخروج</button></div></div>;
 const roleView = () => {
  switch(currentUser.role){
   case 'super_admin': return <SuperAdminConsole/>;
   case 'operator_owner': case 'operator_admin': return <OperatorWorkspace/>;
   case 'org_admin': return hash.startsWith('#manage-competition')?<CompetitionOverview/>:<OrganizationHome/>;
   case 'storage_admin': case 'billing_admin': case 'branch_admin': return <OrganizationHome/>;
   case 'comp_admin': return <CompetitionOverview/>;
   case 'head_judge': return <HeadJudgeInbox/>;
   case 'judge': return <JudgeOS/>;
   case 'ops_manager': return <CommandCenter/>;
   case 'exception_host': return <ExceptionDesk/>;
   case 'delegation_manager': return <DelegationPortal/>;
   case 'participant': return <ParticipantDashboard/>;
   case 'broadcast_operator': return <CeremonyView/>;
   case 'auditor': return <AuditorConsole/>;
   case 'guardian': return <GuardianPortal/>;
   case 'support_agent': return <SupportConsole/>;
   /* دور لا نعرفه لا يُمنح شاشة الإدارة. الافتراضي كان يُسقط أي دور غير مُعالَج على
      لوحة إدارة المسابقة — امتيازٌ بالصمت. الفشل هنا مغلق: لا شاشة حتى يُسنَد دور معروف. */
   default: return <NoRoleConsole/>;
  }
 };
 const isBroadcast=currentUser.role==='broadcast_operator';
 const isSuperAdmin=currentUser.role==='super_admin';
 return <div className="min-h-screen text-[#171b18] font-arabic">
  {idleWarnSeconds!==null&&<div className="fixed inset-x-0 top-0 z-[210] bg-[#8a4f45] text-white text-center text-xs font-black py-2 px-4">{language==='ar'?`ستُغلق الجلسة تلقائيًا خلال ${idleWarnSeconds} ثانية لعدم النشاط. حرّك الفأرة أو المس الشاشة للبقاء.`:`Signing out in ${idleWarnSeconds}s due to inactivity — move to stay.`}</div>}
  {!isBroadcast&&<Header onOpenExperienceHome={demoMode?()=>setExperienceHome(true):undefined}/>}
  {!isBroadcast&&!isSuperAdmin&&<div className="lg:hidden"><LiveSupportControl floating/></div>}
  {isBroadcast&&<LiveSupportControl floating/>}
  <main><Page>{roleView()}</Page></main>
  {demoMode&&isBroadcast&&<DemoReturn onReturn={()=>setExperienceHome(true)}/>}
  <VenueSurfaces kiosk={kiosk} waitingBoard={waitingBoard} hallMap={hallMap} broadcast={broadcast} jiLab={jiLab} ceremony={ceremony} close={{kiosk:()=>setKiosk(false),waitingBoard:()=>setWaitingBoard(false),hallMap:()=>setHallMap(false),broadcast:()=>setBroadcast(false),jiLab:()=>setJiLab(false),ceremony:()=>setCeremony(false)}}/>
 </div>
}
