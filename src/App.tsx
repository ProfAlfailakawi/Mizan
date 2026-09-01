import React, { useEffect, useState } from 'react';
import { getIdTokenResult, onAuthStateChanged, signOut } from 'firebase/auth';
import { useAppStore } from './lib/store';
import { Header } from './components/layout/Header';
import { CompetitionOverview } from './components/admin/CompetitionOverview';
import { JudgeOS } from './components/judge/JudgeOS';
import { HeadJudgeInbox } from './components/head-judge/HeadJudgeInbox';
import { CommandCenter } from './components/operations/CommandCenter';
import { ParticipantDashboard } from './components/participant/ParticipantDashboard';
import { KioskMode } from './components/gate/KioskMode';
import { CeremonyView } from './components/public/CeremonyView';
import { CertificateVerification } from './components/public/CertificateVerification';
import { RegistrationFlow } from './components/public/RegistrationFlow';
import { CompetitionLanding } from './components/public/CompetitionLanding';
import { AuthPortal } from './components/auth/AuthPortal';
import { auth } from './lib/firebase';
import { Role } from './types';
import { AuditorConsole, DelegationPortal, ExceptionDesk, OrganizationHome, ScientificStudio, SuperAdminConsole, GuardianPortal, SupportConsole } from './components/admin/RolePortals';
import { ExperienceHub } from './components/public/ExperienceHub';
import { DemoReturn } from './components/public/DemoReturn';
import { WaitingBoard } from './components/public/WaitingBoard';
import { TrustVerification } from './components/public/TrustVerification';

export default function App() {
 const {currentUser,applyAuthenticatedIdentity,switchRole,accessibilityProfiles,ensureAccessibilityProfile}=useAppStore();
 useEffect(()=>{const p=accessibilityProfiles.find(x=>x.userId===currentUser.id)||ensureAccessibilityProfile();const el=document.documentElement;el.dataset.mizanText=p.textScale;el.dataset.mizanTouch=p.touchScale;el.dataset.mizanContrast=p.contrast;el.dataset.mizanMotion=p.motion;},[currentUser.id,accessibilityProfiles.length]);
 const requireAuth=import.meta.env.VITE_REQUIRE_AUTH==='true'; const [signedIn,setSignedIn]=useState(!requireAuth); const [authReady,setAuthReady]=useState(!requireAuth); const [accessError,setAccessError]=useState('');
 useEffect(()=>{if(!requireAuth)return; return onAuthStateChanged(auth,async u=>{if(!u){setSignedIn(false);setAuthReady(true);return;}try{const token=await getIdTokenResult(u,true);const role=String(token.claims.role||'') as Role;const organizationId=String(token.claims.org_id||'');const allowed:Role[]=['super_admin','org_admin','comp_admin','scientific_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','participant','broadcast_operator','auditor','guardian','support_agent'];if(!allowed.includes(role)||!organizationId){setAccessError('ACCOUNT_CLAIMS_REQUIRED');setSignedIn(false);setAuthReady(true);return;}applyAuthenticatedIdentity({id:u.uid,email:u.email||'',name:u.displayName||u.email||u.uid,role,organizationId,competitionId:token.claims.competition_id?String(token.claims.competition_id):undefined});setAccessError('');setSignedIn(true);}catch{setAccessError('IDENTITY_TOKEN_ERROR');setSignedIn(false);}finally{setAuthReady(true)}})},[requireAuth]);
 const demoMode=!requireAuth;
 const [experienceHome,setExperienceHome]=useState(()=>demoMode && !window.location.hash);
 const [kiosk,setKiosk]=useState(false); const [ceremony,setCeremony]=useState(false); const [waitingBoard,setWaitingBoard]=useState(false); const [hash,setHash]=useState(window.location.hash);
 useEffect(()=>{const fn=()=>setHash(window.location.hash);window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn)},[]);
 if(!authReady) return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] text-xs font-bold text-[#737a75]">MIZAN…</div>;
 if(requireAuth&&accessError) return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] p-5"><div className="mizan-surface p-7 max-w-md text-center"><div className="mizan-kicker">ACCESS GOVERNANCE</div><h1 className="text-xl font-black mt-2">الحساب غير مفوض / Account not provisioned</h1><p className="text-xs text-[#737a75] mt-3">The identity is valid, but MIZAN requires tenant-scoped org_id and role claims.</p><button onClick={()=>signOut(auth)} className="mt-5 text-xs font-bold text-[#214C40]">Sign out</button></div></div>;
 if(requireAuth&&!signedIn) return <AuthPortal/>;
 const returnToExperience=()=>{window.location.hash='';setHash('');setExperienceHome(true)};
 if(hash.startsWith('#trust-verify')) return <><TrustVerification/>{demoMode&&<DemoReturn onReturn={returnToExperience}/>}</>;
 if(hash.startsWith('#competition')) return <><CompetitionLanding/>{demoMode&&<DemoReturn onReturn={returnToExperience}/>}</>;
 if(hash.startsWith('#verify')) return <div className="min-h-screen text-[#171b18] font-arabic"><CertificateVerification/>{demoMode&&<DemoReturn onReturn={returnToExperience}/>}</div>;
 if(hash.startsWith('#register')) return <div className="min-h-screen text-[#171b18] font-arabic"><RegistrationFlow onSuccess={()=>{window.location.hash='';setExperienceHome(demoMode)}}/>{demoMode&&<DemoReturn onReturn={returnToExperience}/>}</div>;
 if(demoMode&&experienceHome) return <><ExperienceHub onEnterRole={(role)=>{switchRole(role);setExperienceHome(false)}} onOpenKiosk={()=>setKiosk(true)} onOpenCeremony={()=>setCeremony(true)} onOpenWaiting={()=>setWaitingBoard(true)}/>{kiosk&&<KioskMode onClose={()=>setKiosk(false)}/>} {waitingBoard&&<WaitingBoard onClose={()=>setWaitingBoard(false)}/>} {ceremony&&<CeremonyView onClose={()=>setCeremony(false)}/>}</>;
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
  <main>{roleView()}</main>
  {demoMode&&isBroadcast&&<DemoReturn onReturn={()=>setExperienceHome(true)}/>}
  {kiosk&&<KioskMode onClose={()=>setKiosk(false)}/>} 
  {waitingBoard&&<WaitingBoard onClose={()=>setWaitingBoard(false)}/>}
  {ceremony&&<CeremonyView onClose={()=>setCeremony(false)}/>} 
 </div>
}
