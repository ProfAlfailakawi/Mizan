import React, { useState } from 'react';
import { ChevronDown, Crown, Gavel, Headphones, RadioTower, ScanLine, ShieldCheck, UserRound, UsersRound, Building2, Microscope, FileSearch, LifeBuoy, Baby } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Role } from '../../types';

const ROLE_META: Record<Role, { ar:string; en:string; icon: React.ComponentType<{className?:string}> }> = {
  super_admin:{ar:'سوبر أدمن',en:'Super Admin',icon:Crown}, org_admin:{ar:'مدير الجهة',en:'Organization Admin',icon:Building2}, comp_admin:{ar:'مدير المسابقة',en:'Competition Admin',icon:ShieldCheck}, scientific_admin:{ar:'الإدارة العلمية',en:'Scientific Admin',icon:Microscope}, head_judge:{ar:'رئيس التحكيم',en:'Head Judge',icon:Gavel}, judge:{ar:'محكم',en:'Judge',icon:Headphones}, ops_manager:{ar:'مدير التشغيل',en:'Operations',icon:RadioTower}, exception_host:{ar:'مكتب الاستثناء',en:'Exception Desk',icon:ScanLine}, delegation_manager:{ar:'مندوب الوفد',en:'Delegation',icon:UsersRound}, participant:{ar:'متسابق',en:'Participant',icon:UserRound}, broadcast_operator:{ar:'البث والحفل',en:'Broadcast',icon:RadioTower}, auditor:{ar:'مدقق',en:'Auditor',icon:FileSearch}, guardian:{ar:'ولي الأمر',en:'Guardian',icon:Baby}, support_agent:{ar:'الدعم',en:'Support',icon:LifeBuoy}
};

export const RoleSwitcher: React.FC = () => {
  const { currentUser, switchRole, language } = useAppStore();
  const [open,setOpen]=useState(false);
  const meta=ROLE_META[currentUser.role]; const Icon=meta.icon;
  const previewEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_ROLE_PREVIEW === 'true';
  if (!previewEnabled) return <div className="flex items-center gap-2 px-2"><span className="w-8 h-8 rounded-lg bg-[#E7EEE9] text-[#214C40] grid place-items-center"><Icon className="w-4 h-4"/></span><span className="hidden sm:block text-xs font-bold text-[#303733] max-w-32 truncate">{language==='ar'?(currentUser.nameArabic||currentUser.name):currentUser.name}</span></div>;
  return <div className="relative">
    <button onClick={()=>setOpen(v=>!v)} className="flex items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-[#efede7] transition" aria-label={language==='ar'?'تبديل الدور التجريبي':'Switch demo role'}>
      <span className="w-8 h-8 rounded-lg bg-[#E7EEE9] text-[#214C40] grid place-items-center"><Icon className="w-4 h-4"/></span>
      <span className="hidden sm:block text-start leading-tight">
        <span className="block text-xs font-bold text-[#303733] max-w-32 truncate">{language==='ar'?(currentUser.nameArabic||currentUser.name):currentUser.name}</span>
        <span className="block text-[10px] text-[#7b817d]">{language==='ar'?meta.ar:meta.en}</span>
      </span>
      <ChevronDown className={`w-3.5 h-3.5 text-[#7b817d] transition ${open?'rotate-180':''}`}/>
    </button>
    {open&&<>
      <button className="fixed inset-0 z-40 cursor-default" onClick={()=>setOpen(false)} aria-label="close" />
      <div className="absolute end-0 top-full mt-2 z-50 w-72 bg-[#FFFEFB] border border-[#DFDED7] rounded-2xl shadow-xl p-2">
        <div className="px-3 py-2 text-[11px] font-bold text-[#7b817d]">{language==='ar'?'معاينة الأدوار — وضع التطوير':'Role preview — development'}</div>
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(ROLE_META) as Role[]).map(role=>{ const m=ROLE_META[role]; const I=m.icon; const active=role===currentUser.role; return <button key={role} onClick={()=>{switchRole(role);setOpen(false)}} className={`min-h-16 rounded-xl p-2.5 text-start transition border ${active?'bg-[#214C40] text-white border-[#214C40]':'bg-white text-[#303733] border-transparent hover:bg-[#f3f1eb]'}`}>
            <I className={`w-4 h-4 mb-2 ${active?'text-white':'text-[#2F6555]'}`}/><span className="block text-[11px] font-bold">{language==='ar'?m.ar:m.en}</span>
          </button>})}
        </div>
      </div>
    </>}
  </div>
}
