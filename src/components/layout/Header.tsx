import React,{useState} from 'react';
import { bilingualName } from '../../lib/ui-language';
import { Wifi, WifiOff, Search, LayoutDashboard, CircleHelp, Menu, LogOut, Headphones, LifeBuoy } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useAppStore } from '../../lib/store';
import { RoleSwitcher } from '../design-system/RoleSwitcher';
import { LanguageSwitcher } from '../design-system/LanguageSwitcher';
import { CommandPalette } from '../design-system/CommandPalette';
import { EmergencyControl } from '../design-system/EmergencyControl';
import { ClarityGuide } from '../design-system/ClarityGuide';
import { Modal } from '../design-system/Modal';
import { MizanLogo, useBrandInfo } from '../design-system/MizanLogo';
import { NotificationCenter } from './NotificationCenter';

interface HeaderProps { onOpenExperienceHome?:()=>void; }


export const Header: React.FC<HeaderProps> = ({onOpenExperienceHome}) => {
 const {language,competition,isOffline,emergencyFrozen,currentUser}=useAppStore(); const [searchOpen,setSearchOpen]=useState(false); const [helpOpen,setHelpOpen]=useState(false);
 const brandInfo = useBrandInfo();
 const production=(import.meta.env as Record<string,string|undefined>).VITE_REQUIRE_AUTH==='true';
 const superAdmin=currentUser.role==='super_admin';
 const logout=()=>{void signOut(auth).catch(()=>{}).finally(()=>window.location.reload())};
 return <header className="sticky top-0 z-30 border-b border-[#DFDED7]/90 bg-[#F7F5EF]/92 backdrop-blur-md">
  <div className="max-w-[1500px] mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0 overflow-hidden">
      <MizanLogo language={language} compact/>
      <div className="min-w-0 hidden sm:block">
        <div className="flex items-center gap-2">
          {(() => { const person = (language==='ar' ? (currentUser.nameArabic||currentUser.name) : currentUser.name)?.trim(); return person ? <span className="text-[11px] font-black text-[#2b332e] truncate max-w-[32vw]" title={person}>{person}</span> : null; })()}
          <span className={`w-1.5 h-1.5 rounded-full ${competition.status==='live'?'bg-[#2F6555]':'bg-[#9B7542]'}`}/>
          <span className="text-[10px] text-[#636864] truncate max-w-[min(44vw,460px)]" title={bilingualName(competition,language==='ar')}>{bilingualName(competition,language==='ar')}</span>
          {brandInfo.placements.showHeaderContact && (brandInfo.phoneNumber || brandInfo.supportEmail) && (
            <a
              href={brandInfo.phoneNumber ? `tel:${brandInfo.phoneNumber}` : `mailto:${brandInfo.supportEmail}`}
              className="hidden xl:inline-flex items-center gap-1 text-[10px] text-[#2F6555] font-bold px-2 py-0.5 rounded-full bg-[#EBF2EE] hover:bg-[#DCEAE2] transition"
              title={language==='ar'?'رقم التواصل والدعم المعتمد':'Official support contact'}
            >
              <Headphones className="w-3 h-3"/>
              <span dir="ltr">{brandInfo.phoneNumber || brandInfo.supportEmail}</span>
            </a>
          )}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-1 shrink-0">
      {!superAdmin&&onOpenExperienceHome&&<button onClick={onOpenExperienceHome} className="hidden sm:grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'كل التجارب':'All experiences'} aria-label={language==='ar'?'كل التجارب':'All experiences'}><LayoutDashboard className="w-4 h-4"/></button>}
      <button onClick={()=>setSearchOpen(true)} className="hidden sm:grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'بحث سريع':'Quick search'} aria-label={language==='ar'?'بحث سريع':'Quick search'}><Search className="w-4 h-4"/></button>{!superAdmin&&<button onClick={()=>setHelpOpen(true)} className="hidden sm:grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'اشرح لي هذه الواجهة':'Explain this screen'} aria-label={language==='ar'?'شرح مبسط':'Plain-language guide'}><CircleHelp className="w-4 h-4"/></button>}
      {/* على الجوال كانت نصف الوظائف تختفي بصمت؛ قائمة «المزيد» تُبقيها في متناول إبهام واحد. */}
      <details className="relative sm:hidden">
        <summary className="list-none w-11 h-11 grid place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a] cursor-pointer" aria-label={language==='ar'?'المزيد':'More'}><Menu className="w-4 h-4"/></summary>
        <div className="absolute right-0 top-12 z-50 w-56 max-w-[calc(100vw-16px)] rounded-2xl border border-[#e2e0d8] bg-white p-1.5 shadow-[0_18px_45px_rgba(25,39,33,.16)]">
          {!superAdmin&&onOpenExperienceHome&&<button onClick={onOpenExperienceHome} className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-[#3f4742] hover:bg-[#f2f0ea] text-start"><LayoutDashboard className="w-4 h-4 text-[#66706a]"/>{language==='ar'?'كل التجارب':'All experiences'}</button>}
          <button onClick={()=>setSearchOpen(true)} className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-[#3f4742] hover:bg-[#f2f0ea] text-start"><Search className="w-4 h-4 text-[#66706a]"/>{language==='ar'?'بحث سريع':'Quick search'}</button>
          {!superAdmin&&<button onClick={()=>setHelpOpen(true)} className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-bold text-[#3f4742] hover:bg-[#f2f0ea] text-start"><CircleHelp className="w-4 h-4 text-[#66706a]"/>{language==='ar'?'اشرح لي هذه الواجهة':'Explain this screen'}</button>}
        </div>
      </details>
      {!superAdmin&&<span role="status" aria-live="polite" className={`w-11 h-11 grid place-items-center rounded-xl ${isOffline?'bg-[#F2EADC] text-[#8a6738]':'text-[#656b66]'}`} title={isOffline?(language==='ar'?'استمرارية دون إنترنت — يعمل ميزان محليًا':'Offline continuity — MIZAN is running locally'):(language==='ar'?'متصل':'Online')} aria-label={isOffline?(language==='ar'?'الحالة: استمرارية دون إنترنت':'Status: offline continuity'):(language==='ar'?'الحالة: متصل':'Status: online')}>{isOffline?<WifiOff className="w-4 h-4"/>:<Wifi className="w-4 h-4"/>}</span>}
      {!superAdmin&&<EmergencyControl iconOnly/>}
      <NotificationCenter/>
      <LanguageSwitcher compact/>
      {!superAdmin&&<RoleSwitcher/>}
      {/* الخروج ليس أيقونةً بين أيقونات: على جهازٍ مشترك يجب أن يُرى من أول نظرة، فله
          إطارٌ ولونٌ ونصّ. على الجوال يبقى النص «خروج» ليتّسع الشريط. */}
      {production&&<button onClick={logout} aria-label={language==='ar'?'تسجيل الخروج':'Sign out'} className="ms-1 h-11 ps-3 pe-3.5 inline-flex items-center gap-2 rounded-xl border border-[#e3cfca] bg-[#F9F0EE] hover:bg-[#F4E6E3] text-[#8a4f45] text-xs font-black shrink-0"><LogOut className="w-4 h-4"/><span className="hidden sm:inline">{language==='ar'?'تسجيل الخروج':'Sign out'}</span><span className="sm:hidden">{language==='ar'?'خروج':'Out'}</span></button>}
    </div>
  </div>
  <CommandPalette open={searchOpen} onOpenChange={setSearchOpen}/><ClarityGuide open={helpOpen} onClose={()=>setHelpOpen(false)} role={currentUser.role} ar={language==='ar'}/>
  {emergencyFrozen&&<div className="bg-[#A34D43] text-white text-center text-xs font-bold py-2 px-4">{language==='ar'?'تم إيقاف الاستدعاء الجديد. الجلسات النشطة محفوظة ويمكن استئناف التشغيل بأمان.':'New dispatch paused. Active sessions are preserved and operations can resume safely.'}</div>}
 </header>
}
