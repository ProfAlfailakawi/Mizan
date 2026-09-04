import React, { Suspense, lazy, useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { useAppStore } from './lib/store';
import { useMizanAuth } from './lib/useMizanAuth';
import { Header } from './components/layout/Header';
import { AuthPortal } from './components/auth/AuthPortal';
import { auth } from './lib/firebase';
import { DemoReturn } from './components/public/DemoReturn';
import { OnboardingExperience, onboardingWasSeen } from './components/public/OnboardingExperience';
import { MizanLogo } from './components/design-system/MizanLogo';
import { SplashExperience } from './components/public/SplashExperience';

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
  certificateVerification: () => import('./components/public/CertificateVerification'),
  registrationFlow: () => import('./components/public/RegistrationFlow'),
  competitionLanding: () => import('./components/public/CompetitionLanding'),
  trustVerification: () => import('./components/public/TrustVerification'),
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
const CertificateVerification = pick(VIEWS.certificateVerification, 'CertificateVerification');
const RegistrationFlow = pick(VIEWS.registrationFlow, 'RegistrationFlow');
const CompetitionLanding = pick(VIEWS.competitionLanding, 'CompetitionLanding');
const TrustVerification = pick(VIEWS.trustVerification, 'TrustVerification');
const SuperAdminConsole = pick(VIEWS.rolePortals, 'SuperAdminConsole');
const OrganizationHome = pick(VIEWS.rolePortals, 'OrganizationHome');
const ScientificStudio = pick(VIEWS.rolePortals, 'ScientificStudio');
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
const Page: React.FC<{children: React.ReactNode}> = ({children}) => <Suspense fallback={<ViewFallback/>}>{children}</Suspense>;
const Overlay: React.FC<{children: React.ReactNode}> = ({children}) => <Suspense fallback={<OverlayFallback/>}>{children}</Suspense>;

export default function App() {
 const {currentUser,switchRole,accessibilityProfiles,ensureAccessibilityProfile,language}=useAppStore();
 useEffect(()=>{const p=accessibilityProfiles.find(x=>x.userId===currentUser.id)||ensureAccessibilityProfile();const el=document.documentElement;el.dataset.mizanText=p.textScale;el.dataset.mizanTouch=p.touchScale;el.dataset.mizanContrast=p.contrast;el.dataset.mizanMotion=p.motion;},[currentUser.id,accessibilityProfiles.length]);
 useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';},[language]);
 useEffect(()=>{warmViews()},[]);
 const requireAuth=import.meta.env.VITE_REQUIRE_AUTH==='true';
 const {signedIn,authReady,accessError,activationToken,setActivationToken,activationMessage,activateAccount}=useMizanAuth(requireAuth);
 const demoMode=!requireAuth;
 const [splashOpen,setSplashOpen]=useState(()=>!window.location.hash);
 const [onboardingOpen,setOnboardingOpen]=useState(()=>!onboardingWasSeen());
 const [experienceHome,setExperienceHome]=useState(()=>demoMode && !window.location.hash);
 const [kiosk,setKiosk]=useState(false); const [ceremony,setCeremony]=useState(false); const [waitingBoard,setWaitingBoard]=useState(false); const [hallMap,setHallMap]=useState(false); const [broadcast,setBroadcast]=useState(false); const [hash,setHash]=useState(window.location.hash);
 useEffect(()=>{const fn=()=>setHash(window.location.hash);window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn)},[]);
 if(splashOpen) return <SplashExperience onDone={()=>setSplashOpen(false)}/>;
 if(!authReady) return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] text-xs font-bold text-[#636864]"><MizanLogo language="ar" compact/></div>;
 if(requireAuth&&accessError) return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] p-5"><div className="mizan-surface p-7 max-w-md text-center"><div className="flex justify-center mb-4"><MizanLogo language={currentUser?.id? 'ar':'ar'} compact/></div><div className="mizan-kicker">حوكمة الوصول</div><h1 className="text-xl font-black mt-2">{accessError==='MFA_REQUIRED'?'يلزم تحقق بخطوتين لهذا الدور':accessError==='PRIVILEGED_SESSION_CONFLICT'?'الحساب مفتوح على جهاز حساس آخر':'الحساب غير مفوض'}</h1><p className="text-xs text-[#636864] mt-3 leading-6">{accessError==='MFA_REQUIRED'?'لأن هذا الحساب يستطيع التأثير في مسابقة عالية الحساسية، لا يسمح ميزان بالدخول الأحادي. فعّل المصادقة متعددة العوامل لدى موفر الهوية ثم أعد تسجيل الدخول.':accessError==='PRIVILEGED_SESSION_CONFLICT'?'منع ميزان جلسة متزامنة لهذا الدور. اطلب من مدير المسابقة إغلاق الجلسة القديمة إذا كان الجهاز السابق مفقودًا أو متعطلًا.':'الهوية صحيحة، لكن الحساب يحتاج دعوة وصلاحية محددة داخل المؤسسة قبل الدخول.'}</p>{accessError==='ACCOUNT_NOT_PROVISIONED'&&<div className="mt-5 text-start"><label className="text-[10px] font-black text-[#616763]">رمز التفعيل لمرة واحدة</label><input value={activationToken} onChange={e=>setActivationToken(e.target.value)} className="mizan-input mt-2" placeholder="رمز التفعيل"/><button onClick={()=>void activateAccount()} className="mt-3 w-full rounded-xl bg-[#214C40] text-white py-2.5 text-xs font-black">ربط هذا الحساب بالدعوة</button>{activationMessage&&<div className="mt-2 text-[10px] text-center text-[#656b66]">{activationMessage==='ACTIVATED'?'تم تفعيل الحساب':activationMessage==='ACTIVATION_FAILED'?'تعذر تفعيل الحساب':'تعذر إكمال التفعيل'}</div>}</div>}<div className="text-[10px] text-[#696f6b] mt-3">{accessError==='MFA_REQUIRED'?'تحقق إضافي مطلوب':accessError==='PRIVILEGED_SESSION_CONFLICT'?'تعارض جلسة حساسة':accessError==='ACCOUNT_NOT_PROVISIONED'?'الحساب بانتظار التفعيل':'تعذر التحقق من صلاحية الحساب'}</div><button onClick={()=>signOut(auth)} className="mt-5 text-xs font-bold text-[#214C40]">تسجيل الخروج</button></div></div>;
 if(requireAuth&&!signedIn) return <AuthPortal/>;
 if(onboardingOpen) return <OnboardingExperience onDone={()=>setOnboardingOpen(false)}/>;
 const returnToExperience=()=>{window.location.hash='';setHash('');setExperienceHome(true)};
 if(hash.startsWith('#trust-verify')) return <><Page><TrustVerification/></Page>{demoMode&&<DemoReturn onReturn={returnToExperience}/>}</>;
 if(hash.startsWith('#competition')) return <><Page><CompetitionLanding/></Page>{demoMode&&<DemoReturn onReturn={returnToExperience}/>}</>;
 if(hash.startsWith('#verify')) return <div className="min-h-screen text-[#171b18] font-arabic"><Page><CertificateVerification/></Page>{demoMode&&<DemoReturn onReturn={returnToExperience}/>}</div>;
 if(hash.startsWith('#register')) return <div className="min-h-screen text-[#171b18] font-arabic"><Page><RegistrationFlow onSuccess={()=>{window.location.hash='';setExperienceHome(demoMode)}}/></Page>{demoMode&&<DemoReturn onReturn={returnToExperience}/>}</div>;
 if(hash.startsWith('#broadcast')) return <><Overlay><BroadcastStage onClose={returnToExperience}/></Overlay></>;
 if(demoMode&&experienceHome) return <><Page><ExperienceHub onEnterRole={(role)=>{switchRole(role);setExperienceHome(false)}} onOpenKiosk={()=>setKiosk(true)} onOpenCeremony={()=>setCeremony(true)} onOpenWaiting={()=>setWaitingBoard(true)} onOpenHall={()=>setHallMap(true)} onOpenBroadcast={()=>setBroadcast(true)}/></Page>{kiosk&&<Overlay><KioskMode onClose={()=>setKiosk(false)}/></Overlay>} {waitingBoard&&<Overlay><WaitingBoard onClose={()=>setWaitingBoard(false)}/></Overlay>} {hallMap&&<Overlay><HallRecitationMap onClose={()=>setHallMap(false)}/></Overlay>} {broadcast&&<Overlay><BroadcastStage onClose={()=>setBroadcast(false)}/></Overlay>} {ceremony&&<Overlay><CeremonyView onClose={()=>setCeremony(false)}/></Overlay>}</>;
 const roleView = () => {
  switch(currentUser.role){
   case 'super_admin': return <SuperAdminConsole/>;
   case 'org_admin': return <OrganizationHome/>;
   case 'comp_admin': return <CompetitionOverview/>;
   case 'scientific_admin': return <ScientificStudio/>;
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
   default: return <CompetitionOverview/>;
  }
 };
 const isBroadcast=currentUser.role==='broadcast_operator';
 return <div className="min-h-screen text-[#171b18] font-arabic">
  {!isBroadcast&&<Header onOpenKiosk={()=>setKiosk(true)} onOpenCeremony={()=>setCeremony(true)} onOpenExperienceHome={demoMode?()=>setExperienceHome(true):undefined}/>}
  <main><Page>{roleView()}</Page></main>
  {demoMode&&isBroadcast&&<DemoReturn onReturn={()=>setExperienceHome(true)}/>}
  {kiosk&&<Overlay><KioskMode onClose={()=>setKiosk(false)}/></Overlay>}
  {waitingBoard&&<Overlay><WaitingBoard onClose={()=>setWaitingBoard(false)}/></Overlay>}
  {broadcast&&<Overlay><BroadcastStage onClose={()=>setBroadcast(false)}/></Overlay>}
  {ceremony&&<Overlay><CeremonyView onClose={()=>setCeremony(false)}/></Overlay>}
 </div>
}
