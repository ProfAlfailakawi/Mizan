import React, { Suspense, lazy, useEffect, useState } from 'react';
import { LanguageSwitcher } from './components/design-system/LanguageSwitcher';
import { PersistenceAlert } from './components/design-system/PersistenceAlert';
import { VenueLockButton, VenueUnlockGuard, useVenueLockState } from './components/design-system/VenueLockControl';
import { signOut } from 'firebase/auth';
import { useAppStore } from './lib/store';
import { useMizanAuth } from './lib/useMizanAuth';
import { Header } from './components/layout/Header';
import { useIdleSignOut } from './lib/useIdleSignOut';
import { useOpsHeartbeat } from './lib/ops-heartbeat';
import { useBoardPublisher } from './lib/use-board-publisher';
import { AuthPortal } from './components/auth/AuthPortal';
import { TotpSecurity } from './components/auth/TotpSecurity';
import { auth } from './lib/firebase';
import { DemoReturn } from './components/public/DemoReturn';
import { OnboardingExperience, onboardingWasSeen } from './components/public/OnboardingExperience';
import { fetchTenant } from './lib/tenant';
import { MizanLogo } from './components/design-system/MizanLogo';
import { SplashExperience, splashWasSeen } from './components/public/SplashExperience';
import { hostSurface } from './lib/host-surface';
import { parsePanelKeys, type DisplayBoard } from './lib/display-board';

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
  committeeDisplay: () => import('./components/public/CommitteeDisplay'),
  hallRecitationMap: () => import('./components/public/HallRecitationMap'),
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
const CommitteeDisplay = pick(VIEWS.committeeDisplay, 'CommitteeDisplay');
const HallRecitationMap = pick(VIEWS.hallRecitationMap, 'HallRecitationMap');
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
const VENUE_LABEL:Record<string,string>={kiosk:'بوابة الحضور',waitingBoard:'لوحة الانتظار',committeeBoard:'شاشة اللجنة',hallMap:'خريطة القاعة',ceremony:'شاشة الحفل'};
const VenueSurfaces:React.FC<{kiosk:boolean;waitingBoard:boolean;committeeBoard:boolean;hallMap:boolean;ceremony:boolean;close:Record<string,()=>void>}>=({kiosk,waitingBoard,committeeBoard,hallMap,ceremony,close})=>{
 const {language}=useAppStore(); const ar=language==='ar';
 const {lock,apply}=useVenueLockState();
 const active=kiosk?'kiosk':waitingBoard?'waitingBoard':committeeBoard?'committeeBoard':hallMap?'hallMap':ceremony?'ceremony':'';
 if(!active) return null;
 const locked=!!lock;
 const lockSurface=async(next:Parameters<typeof apply>[0])=>{apply(next);try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen()}catch{/* Mobile Safari may decline fullscreen; app chrome is still removed. */}};
 const unlockSurface=()=>{apply(null);if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{})};
 // مقفول ⇒ بلا مخرج. مفتوح ⇒ يغلق كالمعتاد.
 const exit=locked?undefined:close[active];
 const surface=VENUE_LABEL[active]||active;
 return <>
  <Overlay>
   {kiosk&&<KioskMode onClose={exit}/>}
   {waitingBoard&&<WaitingBoard onClose={exit}/>}
   {committeeBoard&&<CommitteeDisplay onClose={exit}/>}
   {hallMap&&<HallRecitationMap onClose={exit}/>}
   {ceremony&&<CeremonyView onClose={exit}/>}
  </Overlay>
  {locked
   ? <VenueUnlockGuard lock={lock!} ar={ar} onUnlocked={unlockSurface}/>
   : <div className="fixed bottom-4 inset-x-0 z-[80] flex justify-end px-4 pointer-events-none"><div className="pointer-events-auto"><VenueLockButton surface={surface} ar={ar} onLocked={next=>void lockSurface(next)}/></div></div>}
 </>;
};

/*
 * شاشات القاعة حين تُفتح برابطٍ لا بطبقة.
 *
 * هذا المسار هو ما يجعل الشاشة **بلا امتياز**: تقرأ إسقاطًا منشورًا بالأكواد وحدها، بلا
 * حساب ولا جلسة. والبديل — أن يُسجَّل جهاز عرضٍ بدورٍ تشغيليّ — يعطي تلفازًا في ممرّ
 * صلاحيةَ قراءةِ سجلّ المتسابقين كاملًا.
 *
 * وجهازٌ مصرَّح فتح الرابط لا يُحرم: إن لم يجد إسقاطًا منشورًا بنى إسقاطه من مخزنه.
 *
 * والقفل هو قفل القاعة نفسه: مفتوحةً لها زرّ خروج، ومقفولةً لا مخرج إلا الإيماءة الخفيّة
 * ثم الرمز — جهازٌ معلَّقٌ في ممرّ لا يُترك بزرّ خروجٍ يضغطه أيُّ مارّ.
 */
const BOARD_POLL_MS = 5_000;

const BoardRoute:React.FC<{panelKeys:string[];rotateSeconds:number;competitionId:string|null;hallView:boolean;onExit:()=>void}>=({panelKeys,rotateSeconds,competitionId,hallView,onExit})=>{
 const {language,competition,loadPublicDisplayBoard}=useAppStore(); const ar=language!=='en';
 const {lock,apply}=useVenueLockState();
 const targetId=competitionId||competition.id;
 const [published,setPublished]=useState<DisplayBoard|null>(null);
 const [probed,setProbed]=useState(false);

 /* استطلاعٌ دوري بدل اشتراكٍ لحظي: الاشتراك المجهول يفتح اتصالًا دائمًا لكل شاشة، والفارق
    على لوحة نداءٍ ثوانٍ لا تُلحظ. */
 useEffect(()=>{
  let cancelled=false;
  const pull=async()=>{
   const board=await loadPublicDisplayBoard(targetId);
   if(cancelled)return;
   /* إخفاقٌ عابر لا يمسح ما يُعرض: تبقى آخر نسخة معروفة ويُعلن عمرها وحده. */
   if(board)setPublished(board);
   setProbed(true);
  };
  void pull();
  const t=setInterval(()=>void pull(),BOARD_POLL_MS);
  return()=>{cancelled=true;clearInterval(t)};
 },[targetId,loadPublicDisplayBoard]);

 const locked=!!lock;
 const lockSurface=async(next:Parameters<typeof apply>[0])=>{apply(next);try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen()}catch{/* قد يرفض سفاري ملء الشاشة؛ الشاشة تعمل بلا زخرفة التطبيق. */}};
 const unlockSurface=()=>{apply(null);if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{})};
 const exit=locked?undefined:onExit;
 const surface=hallView?VENUE_LABEL.waitingBoard:VENUE_LABEL.committeeBoard;

 /* لا إسقاط منشورًا ولا مخزنَ مسابقةٍ مطابقًا ⇒ قل السبب بدل عرض مسابقةٍ أخرى. */
 const canFallBackToStore=competition.id===targetId;
 if(!published&&probed&&!canFallBackToStore) return <BoardUnavailable ar={ar} competitionId={targetId} onExit={onExit}/>;
 if(!published&&!probed&&!canFallBackToStore) return <OverlayFallback/>;

 return <>
  <Overlay>
   {hallView
    ? <WaitingBoard board={published||undefined} onClose={exit}/>
    : <CommitteeDisplay panelKeys={panelKeys} rotateSeconds={rotateSeconds} board={published||undefined} onClose={exit}/>}
  </Overlay>
  {locked
   ? <VenueUnlockGuard lock={lock} ar={ar} onUnlocked={unlockSurface}/>
   : <div className="fixed bottom-4 inset-x-0 z-[80] flex justify-end px-4 pointer-events-none"><div className="pointer-events-auto"><VenueLockButton surface={surface} ar={ar} onLocked={next=>void lockSurface(next)}/></div></div>}
 </>;
};

/** لا شيء يُعرض، فيُقال السبب وما يُفعل — لا شاشة سوداء يقف أمامها المشرف حائرًا. */
const BoardUnavailable:React.FC<{ar:boolean;competitionId:string;onExit:()=>void}>=({ar,competitionId,onExit})=>(
 <div className="fixed inset-0 z-50 mizan-venue-2 text-white font-arabic grid place-items-center p-6">
  <div className="max-w-md text-center">
   <MizanLogo language="ar" tone="inverse" compact/>
   <h1 className="text-xl font-black mt-6">{ar?'لم تُنشر شاشة هذه المسابقة بعد':'This competition has no published board yet'}</h1>
   <p className="text-xs mizan-venue-muted mt-3 leading-6">
    {ar
     ?'تُنشر الشاشة من جهاز إدارة المسابقة وهي مفتوحة. افتح المسابقة من جهاز الإدارة، ثم ستظهر هذه الشاشة وحدها بلا إعادة تحميل.'
     :'The board is published from the competition console while it is open. Open it there and this screen fills in on its own.'}
   </p>
   <p className="text-[10px] mizan-venue-faint mt-4 font-mono break-all">{competitionId}</p>
   <button type="button" onClick={onExit} className="mt-6 min-h-11 px-5 rounded-2xl bg-white/10 text-xs font-black">{ar?'رجوع':'Back'}</button>
  </div>
 </div>
);

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
/*
 * معاملات شاشة العرض من الرابط: `#board?comp=…&panel=C7,C8&rotate=20`.
 *
 * الرابط هو ما يجعل الشاشة تعود وحدها. أسطح القاعة الأخرى تُفتح طبقةً بيد موظّفٍ مسجّل،
 * فإذا انقطعت الكهرباء عن تلفازٍ في الممر لم يعد إلى شيء. وهذه تعود إلى لجنتها بلا أحد.
 */
type BoardParams = { panelKeys: string[]; rotateSeconds: number; competitionId: string | null; hallView: boolean };
const boardParams = (h: string): BoardParams => {
  const empty: BoardParams = { panelKeys: [], rotateSeconds: 0, competitionId: null, hallView: true };
  const i = h.indexOf('?');
  if (i === -1) return empty;
  try {
    const q = new URLSearchParams(h.slice(i + 1));
    const rotate = Number(q.get('rotate'));
    const panelKeys = parsePanelKeys(q.get('panel'));
    const view = String(q.get('view') || '').toLowerCase();
    return {
      panelKeys,
      /* تناوبٌ أسرع من خمس ثوانٍ لا يُقرأ على شاشةِ قاعة، فيُهمل بدل أن يُطبَّق. */
      rotateSeconds: Number.isFinite(rotate) && rotate >= 5 ? rotate : 0,
      competitionId: q.get('comp'),
      /* لجنةٌ مسمّاة أو طلبٌ صريح للوحة اللجنة ⇒ عدسة اللجنة؛ وإلا فالقاعة كلها. */
      hallView: view === 'hall' ? true : !(panelKeys.length || view === 'panel'),
    };
  } catch { return empty; }
};
/* شاشة تظهر حين يحمل الرابط معرّف مسابقة غير موجودة: تقول الحقيقة بدل أن تُسقط الزائر على مسابقة أخرى. */
/*
 * شريطٌ لا يراه إلا من تظهر عنده المشكلة.
 *
 * يظهر حين تكون الصفحة مرسومة من ذاكرة هذا الجهاز بينما لا سجلَّ لها على الخادم: أي
 * لصاحب الجهاز وحده — ولا يراه المتسابق، لأنه لا يصل إلى هذه الصفحة أصلًا. وهو يقول
 * الفرق بين ما يرى وما يرى الناس، في موضع الوهم نفسه لا في شاشةٍ أخرى.
 */
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
 const store=useAppStore();
 const {currentUser,competitions,switchRole,selectCompetition,loadPublicCompetition,accessibilityProfiles,ensureAccessibilityProfile,language,updateOrganizationBrand,isOffline:storeIsOffline,persistenceError:activePersistenceError,competition:activeCompetition}=store;
 const activeCompetitionId=activeCompetition?.id;
 useEffect(()=>{const p=accessibilityProfiles.find(x=>x.userId===currentUser.id)||ensureAccessibilityProfile();const el=document.documentElement;el.dataset.mizanText=p.textScale;el.dataset.mizanTouch=p.touchScale;el.dataset.mizanContrast=p.contrast;el.dataset.mizanMotion=p.motion;},[currentUser.id,accessibilityProfiles.length]);
 useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';},[language]);
 useEffect(()=>{warmViews()},[]);
 const requireAuth=import.meta.env.VITE_REQUIRE_AUTH==='true';
 /* mizan.<domain> وجهٌ تسويقي عام: لا يمرّ ببداية العرض ولا ببوابة الدخول ولا بهوية جهة.
    وفي وضع العرض (بلا مصادقة) يبقى التطبيق كما هو حتى لا ينقلب العرض المحلي صفحةَ بيع. */
 const marketing=requireAuth&&hostSurface()==='marketing';
 const {signedIn,authReady,accessError,activationToken,setActivationToken,activationFromQr,activationMessage,activateAccount,takeoverSession}=useMizanAuth(requireAuth);
 const idleWarnSeconds=useIdleSignOut(requireAuth&&signedIn);
 /* جهازٌ واحد مصرَّح ينشر ما تعرضه كل شاشات القاعة، فتبقى الشاشات بلا حساب ولا امتياز.
    الأهلية تُفحص داخل المخزن، فالنداء هنا غير مشروط ولا يخالف ترتيب الخطّافات. */
 void useBoardPublisher(signedIn, store);
 /* تعثّر المستخدم كان يموت عند شاشته: يُعرض له ولا يبلغ أحدًا. هذه النبضة تُعلم لوحة
    المالك بالجلسات المتعثّرة والصامتة، ولا تعطّل شيئًا إن تعذّرت أو لم يُهيَّأ التتبّع. */
 useOpsHeartbeat({
   signedIn:requireAuth&&signedIn,
   isOffline:storeIsOffline,
   subjectId:currentUser.id,
   role:currentUser.role,
   name:currentUser.name,
   competitionId:activeCompetitionId,
   errorCode:activePersistenceError?.code??null,
 });
 const demoMode=!requireAuth;
 // Deep links skip the splash, and so do repeat loads inside the same session: the
 // assembly is a 2.8s first-impression, not a per-reload toll for staff reopening the app.
 const [splashOpen,setSplashOpen]=useState(()=>!window.location.hash && !splashWasSeen());
 const [onboardingOpen,setOnboardingOpen]=useState(()=>!onboardingWasSeen());
 const [experienceHome,setExperienceHome]=useState(()=>demoMode && !window.location.hash);
 const [tenantSuspended,setTenantSuspended]=useState(false);
 const [kiosk,setKiosk]=useState(false); const [ceremony,setCeremony]=useState(false); const [waitingBoard,setWaitingBoard]=useState(false); const [committeeBoard,setCommitteeBoard]=useState(false); const [hallMap,setHallMap]=useState(false); const [hash,setHash]=useState(window.location.hash);
 useEffect(()=>{const fn=()=>setHash(window.location.hash);window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn)},[]);
 useEffect(()=>{const fn=(ev:Event)=>{const surface=(ev as CustomEvent<string>).detail; if(surface==='kiosk')setKiosk(true); else if(surface==='waitingBoard')setWaitingBoard(true); else if(surface==='committeeBoard')setCommitteeBoard(true); else if(surface==='hallMap')setHallMap(true); else if(surface==='ceremony')setCeremony(true);}; window.addEventListener('mizan:open-venue',fn as EventListener); return()=>window.removeEventListener('mizan:open-venue',fn as EventListener)},[]);
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
 /*
  * نسخةٌ محلية على جهازٍ واحد ليست صفحةً منشورة.
  *
  * حين لا يجد الرابط العام سجلَّ المسابقة على الخادم، وكانت نسخةٌ منها في ذاكرة هذا
  * الجهاز (وهو حال جهاز الإدارة وحده)، كانت الصفحة تُعرض كاملةً كأنّ كل شيء يعمل —
  * فيختبرها المسؤول من جهازه فتنجح، ويفتحها المتسابق من جهازه فلا يجد شيئًا، أو يملأ
  * النموذج كلَّه ثم يردّه الخادم بـ«لم نعثر على المسابقة». والفرق لا يظهر إلا هنا.
  */
  useEffect(()=>{
   let alive=true;
   const publicRoute=hash.startsWith('#register')||hash.startsWith('#competition')||hash.startsWith('#journey')||hash.startsWith('#guardian');
   if(!requestedComp&&!publicRoute){setCompMissing(false);setCompLoading(false);return()=>{alive=false}}
   const localExists=requestedComp?competitions.some(c=>c.id===requestedComp):false;
   // الروابط العامة تعيد جلب النسخة المنشورة أولًا حتى لا تعرض ذاكرة المتصفح فئات قديمة.
   if(publicRoute){
    setCompLoading(true);setCompMissing(false);
    void loadPublicCompetition(requestedComp).then(state=>{if(!alive)return;const ok=state==='loaded';if(!ok&&localExists&&requestedComp)selectCompetition(requestedComp);setCompMissing(!ok&&!localExists&&!!requestedComp);setCompLoading(false)});
    return()=>{alive=false};
   }
   // شاشة الإدارة تفضّل النسخة المحلية الأحدث ولا تستبدلها بنسخة نشر قديمة.
   if(requestedComp&&selectCompetition(requestedComp)){setCompMissing(false);setCompLoading(false);return()=>{alive=false}}
   setCompLoading(true);setCompMissing(false);
   void loadPublicCompetition(requestedComp).then(state=>{if(!alive)return;setCompMissing(state!=='loaded');setCompLoading(false)});
   return()=>{alive=false};
  },[requestedComp,hash]);
 if(marketing) return <Suspense fallback={<ViewFallback/>}><MarketingSite/></Suspense>;
 // رابط الاستعادة عام؛ لا ينتظر تهيئة جلسة الموظف أو نطاق الجهة.
 if(hash.startsWith('#reset-password')) return <div className="min-h-screen text-[#171b18] font-arabic"><Page><PasswordResetPortal/></Page></div>;
 if(tenantSuspended) return <TenantSuspendedScreen language={language}/>;
 if(splashOpen) return <SplashExperience onDone={()=>setSplashOpen(false)}/>;
 if(!authReady) return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] text-xs font-bold text-[#636864]"><MizanLogo language="ar" compact/></div>;
 // التسجيل وصفحة المسابقة روابط عامة؛ لا تُجبر الزائر على حساب موظف.
 if((hash.startsWith('#competition')||hash.startsWith('#register')||hash.startsWith('#journey')||hash.startsWith('#guardian'))&&compLoading) return <ViewFallback/>;
 if(hash.startsWith('#competition')) return compMissing?<CompetitionNotFound/>:<Page><CompetitionLanding/></Page>;
 if(hash.startsWith('#register')) return compMissing?<CompetitionNotFound/>:<div className="min-h-screen text-[#171b18] font-arabic"><Page><RegistrationFlow onSuccess={(participant)=>{window.location.hash=`#journey?comp=${encodeURIComponent(requestedComp||participant.competitionId||'')}&key=${encodeURIComponent(participant.journeyAccessToken||'')}`}}/></Page></div>;
 if(hash.startsWith('#journey')) return compMissing?<CompetitionNotFound/>:<Page><JourneyAccess audience="participant"/></Page>;
 if(hash.startsWith('#guardian')) return compMissing?<CompetitionNotFound/>:<Page><JourneyAccess audience="guardian"/></Page>;
 // التحقق من الشهادة خدمة عامة بالكامل ولا تمر ببوابة الموظفين.
 if(hash.startsWith('#verify')) return <div className="min-h-screen text-[#171b18] font-arabic"><Page><CertificateVerification/></Page>{demoMode&&<DemoReturn onReturn={()=>{window.location.hash='';setExperienceHome(true)}}/>}</div>;
 if(requireAuth&&accessError) return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] p-5"><div className="mizan-surface p-7 max-w-md w-full text-center"><div className="flex justify-center mb-4"><MizanLogo language="ar" compact/></div><div className="mizan-kicker">حوكمة الوصول</div><h1 className="text-xl font-black mt-2">{accessError==='MFA_REQUIRED'?'يلزم تحقق إضافي لهذا الحساب':accessError==='PRIVILEGED_SESSION_CONFLICT'?'الحساب مفتوح على جهاز حساس آخر':'الحساب غير مفوض'}</h1><p className="text-xs text-[#636864] mt-3 leading-6">{accessError==='MFA_REQUIRED'?'حساب مالك المنصة محمي بالتحقق بخطوتين. إذا لم تربط Authenticator بعد، أكمل التفعيل هنا دون تسجيل الخروج.':accessError==='PRIVILEGED_SESSION_CONFLICT'?'منع ميزان جلسة متزامنة لهذا الدور. يمكن لصاحب الصلاحية إغلاق الجلسة القديمة ثم المتابعة بأمان.':(accessError==='ACCOUNT_NOT_PROVISIONED'||accessError==='ACCOUNT_CLAIMS_REQUIRED')?'الهوية صحيحة، لكن الحساب يحتاج تفعيل الدعوة التي أرسلها مدير جهتك. إذا وصلك رمز أو QR تفعيل، أكمل التفعيل من هنا قبل الدخول.':'هويتك صحيحة، وتعذّر على ميزان تأكيد صلاحيتها الآن. أعد المحاولة بعد قليل، فإن تكرّر فاطلب من مدير جهتك إغلاق جلساتك السابقة من «الفريق والصلاحيات».'}</p>{accessError==='MFA_REQUIRED'&&<div className="mt-6 text-start"><TotpSecurity bootstrap/></div>}{(accessError==='ACCOUNT_NOT_PROVISIONED'||accessError==='ACCOUNT_CLAIMS_REQUIRED')&&<div className="mt-5 text-start">{activationFromQr?<div className="rounded-2xl bg-[#E7EEE9] text-[#214C40] p-4 text-xs font-bold leading-6 text-center">{activationMessage==='ACTIVATING'?'تمت قراءة QR — جارٍ ربط الحساب بالدعوة…':'تمت قراءة QR التفعيل. سيُربط الحساب تلقائيًا بالبريد المدعو.'}</div>:<><label className="text-[10px] font-black text-[#616763]">رمز التفعيل الاحتياطي</label><input value={activationToken} onChange={e=>setActivationToken(e.target.value)} className="mizan-input mt-2" placeholder="ألصق الرمز فقط إذا تعذر مسح QR"/><button onClick={()=>void activateAccount()} className="mt-3 w-full rounded-xl bg-[#214C40] text-white py-2.5 text-xs font-black">تفعيل الحساب</button></>}{activationMessage&&activationMessage!=='ACTIVATING'&&<div className="mt-2 text-[10px] text-center text-[#656b66]">{activationMessage==='ACTIVATED'?'تم تفعيل الحساب':activationMessage==='ACTIVATION_FAILED'?'تعذر تفعيل الحساب':activationMessage}</div>}</div>}<div className="text-[10px] text-[#696f6b] mt-3">{accessError==='MFA_REQUIRED'?'تحقق إضافي مطلوب':accessError==='PRIVILEGED_SESSION_CONFLICT'?'تعارض جلسة حساسة':accessError==='ACCOUNT_NOT_PROVISIONED'||accessError==='ACCOUNT_CLAIMS_REQUIRED'?'الحساب بانتظار التفعيل':'تعذر التحقق من صلاحية الحساب'}</div>{accessError==='PRIVILEGED_SESSION_CONFLICT'&&<button onClick={()=>{void takeoverSession()}} className="mt-6 w-full rounded-2xl bg-[#214C40] text-white text-sm font-black py-3">متابعة هنا وإغلاق الجلسة الأخرى</button>}{accessError!=='MFA_REQUIRED'&&<button onClick={()=>{void signOut(auth).catch(()=>{}).finally(()=>window.location.reload())}} className="mt-5 text-xs font-bold text-[#214C40]">تسجيل الخروج</button>}</div></div>;
 /*
  * شاشات القاعة برابطها — قبل بوابة الدخول عمدًا.
  *
  * جهاز العرض المعلّق في ممرّ لا يملك حسابًا ولا ينبغي أن يملكه: يقرأ إسقاطًا منشورًا
  * بالأكواد وحدها. ولو وقع هذا المسار بعد البوابة لطالبت شاشةَ تلفازٍ بتسجيل دخول.
  */
 if(hash.startsWith('#board')) return <BoardRoute {...boardParams(hash)} onExit={()=>{window.location.hash='';setHash('')}}/>;
 if(requireAuth&&!signedIn) return <AuthPortal/>;
 if(onboardingOpen) return <OnboardingExperience onDone={()=>setOnboardingOpen(false)}/>;
 const returnToExperience=()=>{window.location.hash='';setHash('');setExperienceHome(true)};
 if(hash.startsWith('#trust-verify')) return <><Page><TrustVerification/></Page>{demoMode&&<DemoReturn onReturn={returnToExperience}/>}</>;
 if(demoMode&&experienceHome) return <><Page><ExperienceHub onEnterRole={(role)=>{switchRole(role);setExperienceHome(false)}} onOpenKiosk={()=>setKiosk(true)} onOpenCeremony={()=>setCeremony(true)} onOpenWaiting={()=>setWaitingBoard(true)} onOpenHall={()=>setHallMap(true)}/></Page><VenueSurfaces kiosk={kiosk} waitingBoard={waitingBoard} committeeBoard={committeeBoard} hallMap={hallMap} ceremony={ceremony} close={{kiosk:()=>setKiosk(false),waitingBoard:()=>setWaitingBoard(false),committeeBoard:()=>setCommitteeBoard(false),hallMap:()=>setHallMap(false),ceremony:()=>setCeremony(false)}}/></>;
 const competitionClosed=['completed','archived'].includes((competitions.find(c=>c.id===requestedComp)||competitions[0])?.status||'');
 const operationalRoles=['comp_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','participant','broadcast_operator','guardian','support_agent'];
 if(competitionClosed&&operationalRoles.includes(currentUser.role)) return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] p-6" dir="rtl"><div className="mizan-surface max-w-lg w-full p-8 text-center"><MizanLogo language="ar" compact/><div className="mizan-kicker mt-6">المسابقة مغلقة</div><h1 className="text-2xl font-black mt-2">انتهت المسابقة وتم إيقاف الوصول التشغيلي</h1><p className="text-sm text-[#636864] mt-4 leading-7">تم حفظ السجل والنتائج والشهادات، لكن جميع صلاحيات التشغيل والدخول لهذه المسابقة متوقفة.</p><button onClick={()=>void signOut(auth)} className="mt-6 rounded-2xl bg-[#214C40] text-white px-6 py-3 text-sm font-black">تسجيل الخروج</button></div></div>;
 const roleView = () => {
  switch(currentUser.role){
   case 'super_admin': return <SuperAdminConsole/>;
   case 'operator_owner': case 'operator_admin': return <OperatorWorkspace/>;
   /* مدير الفرع يملك إنشاء المسابقة وضبطها وإدارة لجانها، ولم يكن له مسار إلى أيٍّ منها:
      يضغط بطاقة المسابقة فيتغيّر العنوان ولا تتغيّر الصفحة. */
   case 'org_admin': case 'branch_admin': return hash.startsWith('#manage-competition')?<CompetitionOverview/>:<OrganizationHome/>;
   case 'storage_admin': case 'billing_admin': return <OrganizationHome/>;
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
  {isBroadcast&&<div className="fixed top-3 inset-x-3 z-[190] flex items-center justify-between gap-2 pointer-events-none">
   <span className="pointer-events-auto rounded-xl bg-[#101a16]/85 backdrop-blur px-3 py-2 text-[11px] font-black text-white/80">{language==='ar'?'شاشة البثّ':'Broadcast surface'}</span>
   <span className="pointer-events-auto flex items-center gap-2"><LanguageSwitcher compact/>{requireAuth&&<button onClick={()=>{void signOut(auth).catch(()=>{}).finally(()=>window.location.reload())}} className="min-h-11 px-3 rounded-xl bg-[#101a16]/85 backdrop-blur text-[11px] font-black text-white/85">{language==='ar'?'خروج':'Sign out'}</button>}</span>
  </div>}
  <main><Page>{roleView()}</Page></main>
  {demoMode&&isBroadcast&&<DemoReturn onReturn={()=>setExperienceHome(true)}/>}
  <VenueSurfaces kiosk={kiosk} waitingBoard={waitingBoard} committeeBoard={committeeBoard} hallMap={hallMap} ceremony={ceremony} close={{kiosk:()=>setKiosk(false),waitingBoard:()=>setWaitingBoard(false),committeeBoard:()=>setCommitteeBoard(false),hallMap:()=>setHallMap(false),ceremony:()=>setCeremony(false)}}/>
 </div>
}
