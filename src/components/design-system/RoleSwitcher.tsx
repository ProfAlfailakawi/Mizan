import React, { useEffect, useState } from 'react';
import { ChevronDown, Crown, Gavel, Headphones, RadioTower, ScanLine, ShieldCheck, UserRound, UsersRound, Building2, FileSearch, LifeBuoy, Baby } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Role } from '../../types';

type RoleMeta={ar:string;en:string;icon:React.ComponentType<{className?:string}>};

const ROLE_META: Partial<Record<Role,RoleMeta>> = {
  super_admin:{ar:'إدارة المنصة',en:'Super Admin',icon:Crown},
  operator_owner:{ar:'مالك المشغّل',en:'Operator Owner',icon:Building2},
  operator_admin:{ar:'مدير المشغّل',en:'Operator Admin',icon:ShieldCheck},
  org_admin:{ar:'مدير الجهة',en:'Organization Admin',icon:Building2},
  storage_admin:{ar:'مدير التخزين',en:'Storage Admin',icon:FileSearch},
  billing_admin:{ar:'مدير الفوترة',en:'Billing Admin',icon:FileSearch},
  branch_admin:{ar:'مدير الفرع',en:'Branch Admin',icon:Building2},
  comp_admin:{ar:'مدير المسابقة',en:'Competition Admin',icon:ShieldCheck},
  head_judge:{ar:'رئيس التحكيم',en:'Head Judge',icon:Gavel},
  judge:{ar:'محكم',en:'Judge',icon:Headphones},
  ops_manager:{ar:'مدير التشغيل',en:'Operations',icon:RadioTower},
  exception_host:{ar:'مكتب الاستثناء',en:'Exception Desk',icon:ScanLine},
  delegation_manager:{ar:'مندوب الوفد',en:'Delegation',icon:UsersRound},
  participant:{ar:'متسابق',en:'Participant',icon:UserRound},
  broadcast_operator:{ar:'البث والحفل',en:'Broadcast',icon:RadioTower},
  auditor:{ar:'مدقق',en:'Auditor',icon:FileSearch},
  guardian:{ar:'ولي الأمر',en:'Guardian',icon:Baby},
  support_agent:{ar:'الدعم',en:'Support',icon:LifeBuoy},
};

const FALLBACK_META:RoleMeta={ar:'دور غير مدعوم',en:'Unsupported role',icon:ShieldCheck};

export const RoleSwitcher: React.FC = () => {
  const { currentUser, switchRole, language } = useAppStore();
  const [open,setOpen]=useState(false);
  useEffect(()=>{ if(!open) return; const onKey=(e:KeyboardEvent)=>{ if(e.key==='Escape') setOpen(false) }; window.addEventListener('keydown',onKey); return ()=>window.removeEventListener('keydown',onKey); },[open]);
  const meta=ROLE_META[currentUser.role]||FALLBACK_META; const Icon=meta.icon;
  const previewEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_ROLE_PREVIEW === 'true';
  if (!previewEnabled) return <div className="flex items-center gap-2 px-2"><span className="w-8 h-8 rounded-lg bg-[#E7EEE9] text-[#214C40] grid place-items-center"><Icon className="w-4 h-4"/></span><span className="hidden lg:block text-xs font-bold text-[#303733] whitespace-nowrap">{language==='ar'?(currentUser.nameArabic||currentUser.name):currentUser.name}</span></div>;
  return <div className="relative">
    <button onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2 rounded-xl px-2.5 py-2 hover:bg-[#efede7] transition" aria-label={language==='ar'?'تبديل الدور التجريبي':'Switch demo role'}>
      <span className="w-8 h-8 rounded-lg bg-[#E7EEE9] text-[#214C40] grid place-items-center"><Icon className="w-4 h-4"/></span>
      <span className="hidden lg:block text-start leading-tight"><span className="block text-xs font-bold text-[#303733] whitespace-nowrap">{language==='ar'?(currentUser.nameArabic||currentUser.name):currentUser.name}</span><span className="block text-[10px] text-[#666a67]">{language==='ar'?meta.ar:meta.en}</span></span>
      <ChevronDown className={`w-3.5 h-3.5 text-[#666a67] transition ${open?'rotate-180':''}`}/>
    </button>
    {open&&<><button className="fixed inset-0 z-40 cursor-default" onClick={()=>setOpen(false)} aria-label={language==='ar'?'إغلاق':'Close'} /><div role="menu" aria-label={language==='ar'?'الأدوار':'Roles'} className="absolute end-0 top-full mt-2 z-50 w-[min(18rem,calc(100vw-1.5rem))] bg-[#FFFEFB] border border-[#DFDED7] rounded-2xl shadow-lg p-2">
      <div className="px-3 py-2 text-[11px] font-bold text-[#666a67]">{language==='ar'?'معاينة الأدوار — وضع التطوير':'Role preview — development'}</div>
      <div className="grid grid-cols-2 gap-1">{(Object.entries(ROLE_META) as [Role,RoleMeta][]).map(([role,m])=>{const I=m.icon;const active=role===currentUser.role;return <button key={role} role="menuitem" aria-current={active} onClick={()=>{switchRole(role);setOpen(false)}} className="mizan-role-tile"><I className={`w-4 h-4 mb-2 ${active?'text-white':'text-[#2F6555]'}`}/><span className="block text-[11px] font-bold">{language==='ar'?m.ar:m.en}</span></button>})}</div>
    </div></>}
  </div>;
};
