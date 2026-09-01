import React from 'react';
import { AlertTriangle, Award, Languages, Radio, Wifi, WifiOff } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { RoleSwitcher } from '../design-system/RoleSwitcher';

interface HeaderProps { onOpenKiosk?:()=>void; onOpenCeremony?:()=>void; }

export const Header: React.FC<HeaderProps> = ({onOpenKiosk,onOpenCeremony}) => {
 const {language,setLanguage,competition,isOffline,toggleOffline,emergencyFrozen,toggleEmergencyFreeze,currentUser}=useAppStore();
 const canEmergency=['comp_admin','ops_manager','super_admin'].includes(currentUser.role);
 const canGate=['comp_admin','ops_manager','exception_host','super_admin'].includes(currentUser.role);
 const canCeremony=['comp_admin','broadcast_operator','super_admin'].includes(currentUser.role);
 return <header className="sticky top-0 z-30 border-b border-[#DFDED7]/90 bg-[#F7F5EF]/92 backdrop-blur-xl">
  <div className="max-w-[1500px] mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-9 h-9 rounded-xl bg-[#214C40] text-white grid place-items-center font-black">م</div>
      <div className="min-w-0">
        <div className="flex items-center gap-2"><span className="font-extrabold tracking-tight">MIZAN</span><span className={`w-1.5 h-1.5 rounded-full ${competition.status==='live'?'bg-[#2F6555]':'bg-[#9B7542]'}`}/></div>
        <div className="text-[10px] text-[#737a75] truncate max-w-[240px]">{language==='ar'?competition.nameArabic:competition.name}</div>
      </div>
    </div>
    <div className="flex items-center gap-1">
      {onOpenKiosk&&canGate&&<button onClick={onOpenKiosk} className="hidden lg:grid w-9 h-9 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'بوابة الحضور':'Gate'}><Radio className="w-4 h-4"/></button>}
      {onOpenCeremony&&canCeremony&&<button onClick={onOpenCeremony} className="hidden lg:grid w-9 h-9 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'وضع الحفل':'Ceremony'}><Award className="w-4 h-4"/></button>}
      <button onClick={toggleOffline} className={`w-9 h-9 grid place-items-center rounded-xl transition ${isOffline?'bg-[#F2EADC] text-[#8a6738]':'hover:bg-[#efede7] text-[#66706a]'}`} title={isOffline?(language==='ar'?'استمرارية دون إنترنت':'Offline continuity'):(language==='ar'?'متصل':'Online')}>{isOffline?<WifiOff className="w-4 h-4"/>:<Wifi className="w-4 h-4"/>}</button>
      {canEmergency&&<button onClick={toggleEmergencyFreeze} className={`w-9 h-9 grid place-items-center rounded-xl transition ${emergencyFrozen?'bg-[#A34D43] text-white':'hover:bg-[#F4E6E3] text-[#A34D43]'}`} title={language==='ar'?'الطوارئ':'Emergency'}><AlertTriangle className="w-4 h-4"/></button>}
      <button onClick={()=>setLanguage(language==='ar'?'en':'ar')} className="w-9 h-9 grid place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'English':'العربية'}><Languages className="w-4 h-4"/></button>
      <RoleSwitcher/>
    </div>
  </div>
  {emergencyFrozen&&<div className="bg-[#A34D43] text-white text-center text-xs font-bold py-2 px-4">{language==='ar'?'تم إيقاف الاستدعاء الجديد. الجلسات النشطة محفوظة ويمكن استئناف التشغيل بأمان.':'New dispatch paused. Active sessions are preserved and operations can resume safely.'}</div>}
 </header>
}
