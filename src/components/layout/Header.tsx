import React,{useState} from 'react';
import { Award, Radio, Wifi, WifiOff, Search, LayoutDashboard, CircleHelp } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { RoleSwitcher } from '../design-system/RoleSwitcher';
import { LanguageSwitcher } from '../design-system/LanguageSwitcher';
import { CommandPalette } from '../design-system/CommandPalette';
import { EmergencyControl } from '../design-system/EmergencyControl';
import { ClarityGuide } from '../design-system/ClarityGuide';
import { MizanLogo } from '../design-system/MizanLogo';

interface HeaderProps { onOpenKiosk?:()=>void; onOpenCeremony?:()=>void; onOpenExperienceHome?:()=>void; }

export const Header: React.FC<HeaderProps> = ({onOpenKiosk,onOpenCeremony,onOpenExperienceHome}) => {
 const {language,competition,isOffline,toggleOffline,emergencyFrozen,currentUser}=useAppStore(); const [searchOpen,setSearchOpen]=useState(false); const [helpOpen,setHelpOpen]=useState(false);
 const canGate=['comp_admin','ops_manager','exception_host','super_admin'].includes(currentUser.role);
 const canCeremony=['comp_admin','broadcast_operator','super_admin'].includes(currentUser.role);
 return <header className="sticky top-0 z-30 border-b border-[#DFDED7]/90 bg-[#F7F5EF]/92 backdrop-blur-md">
  <div className="max-w-[1500px] mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0">
      <MizanLogo language={language} compact/>
      <div className="min-w-0 hidden sm:block"><div className="flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${competition.status==='live'?'bg-[#2F6555]':'bg-[#9B7542]'}`}/><span className="text-[10px] text-[#636864] truncate max-w-[260px]">{language==='ar'?competition.nameArabic:competition.name}</span></div></div>
    </div>
    <div className="flex items-center gap-1">
      {onOpenExperienceHome&&<button onClick={onOpenExperienceHome} className="grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'كل التجارب':'All experiences'} aria-label={language==='ar'?'كل التجارب':'All experiences'}><LayoutDashboard className="w-4 h-4"/></button>}
      <button onClick={()=>setSearchOpen(true)} className="hidden sm:grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'بحث سريع':'Quick search'}><Search className="w-4 h-4"/></button><button onClick={()=>setHelpOpen(true)} className="grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'اشرح لي هذه الواجهة':'Explain this screen'} aria-label={language==='ar'?'شرح مبسط':'Plain-language guide'}><CircleHelp className="w-4 h-4"/></button>
      {onOpenKiosk&&canGate&&<button onClick={onOpenKiosk} className="hidden lg:grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'بوابة الحضور':'Gate'}><Radio className="w-4 h-4"/></button>}
      {onOpenCeremony&&canCeremony&&<button onClick={onOpenCeremony} className="hidden lg:grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'وضع الحفل':'Ceremony'}><Award className="w-4 h-4"/></button>}
      <button onClick={toggleOffline} className={`w-11 h-11 grid place-items-center rounded-xl transition ${isOffline?'bg-[#F2EADC] text-[#8a6738]':'hover:bg-[#efede7] text-[#66706a]'}`} title={isOffline?(language==='ar'?'استمرارية دون إنترنت':'Offline continuity'):(language==='ar'?'متصل':'Online')}>{isOffline?<WifiOff className="w-4 h-4"/>:<Wifi className="w-4 h-4"/>}</button>
      <EmergencyControl iconOnly/>
      <LanguageSwitcher compact/>
      <RoleSwitcher/>
    </div>
  </div>
  <CommandPalette open={searchOpen} onOpenChange={setSearchOpen}/><ClarityGuide open={helpOpen} onClose={()=>setHelpOpen(false)} role={currentUser.role} ar={language==='ar'}/>
  {emergencyFrozen&&<div className="bg-[#A34D43] text-white text-center text-xs font-bold py-2 px-4">{language==='ar'?'تم إيقاف الاستدعاء الجديد. الجلسات النشطة محفوظة ويمكن استئناف التشغيل بأمان.':'New dispatch paused. Active sessions are preserved and operations can resume safely.'}</div>}
 </header>
}
