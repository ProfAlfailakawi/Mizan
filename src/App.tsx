import React, { useEffect, useState } from 'react';
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
import { AuditorConsole, DelegationPortal, ExceptionDesk, OrganizationHome, ScientificStudio, SuperAdminConsole } from './components/admin/RolePortals';

export default function App() {
 const {currentUser}=useAppStore();
 const [kiosk,setKiosk]=useState(false); const [ceremony,setCeremony]=useState(false); const [hash,setHash]=useState(window.location.hash);
 useEffect(()=>{const fn=()=>setHash(window.location.hash);window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn)},[]);
 if(hash.startsWith('#verify')) return <div className="min-h-screen text-[#171b18] font-arabic"><CertificateVerification/></div>;
 if(hash.startsWith('#register')) return <div className="min-h-screen text-[#171b18] font-arabic"><RegistrationFlow onSuccess={()=>{window.location.hash=''}}/></div>;
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
   default: return <CompetitionOverview/>;
  }
 };
 const isBroadcast=currentUser.role==='broadcast_operator';
 return <div className="min-h-screen text-[#171b18] font-arabic">
  {!isBroadcast&&<Header onOpenKiosk={()=>setKiosk(true)} onOpenCeremony={()=>setCeremony(true)}/>} 
  <main>{roleView()}</main>
  {kiosk&&<KioskMode onClose={()=>setKiosk(false)}/>} 
  {ceremony&&<CeremonyView onClose={()=>setCeremony(false)}/>} 
 </div>
}
