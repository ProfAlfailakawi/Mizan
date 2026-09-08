import React,{useState} from 'react';
import { Award, Radio, Wifi, WifiOff, Search, LayoutDashboard, CircleHelp, LogOut, Headphones, LifeBuoy } from 'lucide-react';
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

interface HeaderProps { onOpenKiosk?:()=>void; onOpenCeremony?:()=>void; onOpenExperienceHome?:()=>void; }

export const LiveSupportControl:React.FC<{floating?:boolean}>=({floating=false})=>{
 const {language,currentUser,supportSessions,requestSupportSession}=useAppStore();const ar=language==='ar';const [open,setOpen]=useState(false);const [reason,setReason]=useState('');
 const active=supportSessions.find(session=>session.requestedBy===currentUser.id&&!['ended','rejected'].includes(session.status)&&Date.parse(session.expiresAt)>Date.now());
 const submit=()=>{const clean=reason.trim();if(clean.length<3)return;requestSupportSession(clean);setReason('');setOpen(false)};
 const cls=floating?'fixed start-4 bottom-4 z-[120] h-11 px-4 inline-flex items-center gap-2 rounded-xl border border-[#cddbd3] bg-[#F7FAF8] text-[#214C40] shadow-md font-black text-xs':'hidden lg:inline-flex h-11 px-3 items-center gap-1.5 rounded-xl border border-[#cddbd3] bg-[#EBF2EE] hover:bg-[#DCEAE2] text-[#214C40] font-black text-xs shrink-0 transition';
 return <><button type="button" onClick={()=>setOpen(true)} className={cls} aria-label={ar?'الدعم المباشر':'Live support'}><LifeBuoy className="w-4 h-4 shrink-0"/><span>{ar?'الدعم المباشر':'Live support'}</span>{active&&<span className="w-1.5 h-1.5 rounded-full bg-[#2F6555]" aria-hidden="true"/>}</button><Modal isOpen={open} onClose={()=>setOpen(false)} title={ar?'الدعم المباشر':'Live support'} subtitle={ar?'طلب دعم مراقب ومؤقت دون منح باب خلفي للنظام.':'Request a temporary, audited support session without granting a backdoor.'} maxWidth="md">{active?<div className="rounded-2xl border border-[#cddbd3] bg-[#F7FAF8] p-4"><div className="text-sm font-black text-[#214C40]">{ar?'طلب الدعم قائم':'Support request is active'}</div><p className="text-xs text-[#636864] leading-6 mt-2">{ar?'تم إرسال طلبك، وسيبقى مرتبطًا بسبب واضح وينتهي تلقائيًا وفق مدة الجلسة.':'Your request was sent with a recorded reason and will expire automatically with the session window.'}</p></div>:<div><label className="block text-xs font-black text-[#4f5752]">{ar?'ما الذي تحتاج مساعدة فيه؟':'What do you need help with?'}</label><textarea autoFocus value={reason} onChange={e=>setReason(e.target.value)} rows={4} className="mizan-input mt-2 resize-none" placeholder={ar?'اكتب المشكلة باختصار ووضوح':'Describe the issue briefly and clearly'}/><div className="mt-4 flex justify-end"><button type="button" disabled={reason.trim().length<3} onClick={submit} className="min-h-11 px-4 rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-40">{ar?'إرسال طلب الدعم':'Send support request'}</button></div></div>}</Modal></>;
};

export const Header: React.FC<HeaderProps> = ({onOpenKiosk,onOpenCeremony,onOpenExperienceHome}) => {
 const {language,competition,isOffline,toggleOffline,emergencyFrozen,currentUser}=useAppStore(); const [searchOpen,setSearchOpen]=useState(false); const [helpOpen,setHelpOpen]=useState(false);
 const brandInfo = useBrandInfo();
 const canGate=['comp_admin','ops_manager','exception_host','super_admin'].includes(currentUser.role);
 const canCeremony=['comp_admin','broadcast_operator','super_admin'].includes(currentUser.role);
 const production=(import.meta.env as Record<string,string|undefined>).VITE_REQUIRE_AUTH==='true';
 const logout=()=>{void signOut(auth).catch(()=>{}).finally(()=>window.location.reload())};
 return <header className="sticky top-0 z-30 border-b border-[#DFDED7]/90 bg-[#F7F5EF]/92 backdrop-blur-md">
  <div className="max-w-[1500px] mx-auto h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0">
      <MizanLogo language={language} compact/>
      <div className="min-w-0 hidden sm:block">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full ${competition.status==='live'?'bg-[#2F6555]':'bg-[#9B7542]'}`}/>
          <span className="text-[10px] text-[#636864] truncate max-w-[min(52vw,520px)]" title={language==='ar'?competition.nameArabic:competition.name}>{language==='ar'?competition.nameArabic:competition.name}</span>
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
    <div className="flex items-center gap-1">
      <LiveSupportControl/>
      {onOpenExperienceHome&&<button onClick={onOpenExperienceHome} className="hidden sm:grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'كل التجارب':'All experiences'} aria-label={language==='ar'?'كل التجارب':'All experiences'}><LayoutDashboard className="w-4 h-4"/></button>}
      <button onClick={()=>setSearchOpen(true)} className="hidden sm:grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'بحث سريع':'Quick search'} aria-label={language==='ar'?'بحث سريع':'Quick search'}><Search className="w-4 h-4"/></button><button onClick={()=>setHelpOpen(true)} className="hidden sm:grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'اشرح لي هذه الواجهة':'Explain this screen'} aria-label={language==='ar'?'شرح مبسط':'Plain-language guide'}><CircleHelp className="w-4 h-4"/></button>
      {onOpenKiosk&&canGate&&<button onClick={onOpenKiosk} className="hidden lg:grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'بوابة الحضور':'Gate'} aria-label={language==='ar'?'بوابة الحضور':'Gate'}><Radio className="w-4 h-4"/></button>}
      {onOpenCeremony&&canCeremony&&<button onClick={onOpenCeremony} className="hidden lg:grid w-11 h-11 place-items-center rounded-xl hover:bg-[#efede7] text-[#66706a]" title={language==='ar'?'وضع الحفل':'Ceremony'} aria-label={language==='ar'?'وضع الحفل':'Ceremony'}><Award className="w-4 h-4"/></button>}
      <button onClick={toggleOffline} className={`w-11 h-11 grid place-items-center rounded-xl transition ${isOffline?'bg-[#F2EADC] text-[#8a6738]':'hover:bg-[#efede7] text-[#66706a]'}`} title={isOffline?(language==='ar'?'استمرارية دون إنترنت':'Offline continuity'):(language==='ar'?'متصل':'Online')} aria-label={isOffline?(language==='ar'?'استمرارية دون إنترنت':'Offline continuity'):(language==='ar'?'متصل':'Online')}>{isOffline?<WifiOff className="w-4 h-4"/>:<Wifi className="w-4 h-4"/>}</button>
      <EmergencyControl iconOnly/>
      <LanguageSwitcher compact/>
      <RoleSwitcher/>
      {/* الخروج ليس أيقونةً بين أيقونات: على جهازٍ مشترك يجب أن يُرى من أول نظرة، فله
          إطارٌ ولونٌ ونصّ. على الجوال يبقى النص «خروج» ليتّسع الشريط. */}
      {production&&<button onClick={logout} aria-label={language==='ar'?'تسجيل الخروج':'Sign out'} className="ms-1 h-11 ps-3 pe-3.5 inline-flex items-center gap-2 rounded-xl border border-[#e3cfca] bg-[#F9F0EE] hover:bg-[#F4E6E3] text-[#8a4f45] text-xs font-black shrink-0"><LogOut className="w-4 h-4"/><span className="hidden sm:inline">{language==='ar'?'تسجيل الخروج':'Sign out'}</span><span className="sm:hidden">{language==='ar'?'خروج':'Out'}</span></button>}
    </div>
  </div>
  <CommandPalette open={searchOpen} onOpenChange={setSearchOpen}/><ClarityGuide open={helpOpen} onClose={()=>setHelpOpen(false)} role={currentUser.role} ar={language==='ar'}/>
  {emergencyFrozen&&<div className="bg-[#A34D43] text-white text-center text-xs font-bold py-2 px-4">{language==='ar'?'تم إيقاف الاستدعاء الجديد. الجلسات النشطة محفوظة ويمكن استئناف التشغيل بأمان.':'New dispatch paused. Active sessions are preserved and operations can resume safely.'}</div>}
 </header>
}
