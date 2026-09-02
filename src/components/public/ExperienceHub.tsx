import React from 'react';
import {
  ArrowLeft, Award, Baby, Building2, Crown, FileSearch, Gavel, Headphones,
  LifeBuoy, Microscope, RadioTower, ScanLine, ShieldCheck, Sparkles, UserRound,
  UsersRound, Globe2, Plus, BadgeCheck
} from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Pictogram } from '../design-system/Pictogram';
import { Role } from '../../types';

const ROLES: Array<{role:Role; ar:string; en:string; noteAr:string; noteEn:string; icon:React.ComponentType<{className?:string}>; group:'core'|'governance'|'support'}> = [
  {role:'participant',ar:'المتسابق',en:'Participant',noteAr:'رحلة بسيطة من الوصول إلى النتيجة',noteEn:'From arrival to result',icon:UserRound,group:'core'},
  {role:'judge',ar:'المحكم',en:'JudgeOS',noteAr:'تحكيم بلا تشتيت ولا حسابات يدوية',noteEn:'Distraction-free judging',icon:Headphones,group:'core'},
  {role:'head_judge',ar:'رئيس التحكيم',en:'Head Judge',noteAr:'الاستثناءات والمراجعات فقط',noteEn:'Reviews and exceptions only',icon:Gavel,group:'core'},
  {role:'ops_manager',ar:'غرفة العمليات',en:'Command Center',noteAr:'صحة المسابقة وحركة اللجان',noteEn:'Live competition health',icon:RadioTower,group:'core'},
  {role:'comp_admin',ar:'مدير المسابقة',en:'Competition Admin',noteAr:'بناء وسياسات وتشغيل المسابقة',noteEn:'Build, govern and run',icon:ShieldCheck,group:'core'},
  {role:'delegation_manager',ar:'إدارة الوفد',en:'Delegation',noteAr:'الترشيحات والسفر والمتابعة',noteEn:'Nomination and travel',icon:UsersRound,group:'core'},
  {role:'scientific_admin',ar:'الإدارة العلمية',en:'Scientific Governance',noteAr:'المصادر والقواعد واعتماد الذكاء',noteEn:'Sources, rules and AI certification',icon:Microscope,group:'governance'},
  {role:'org_admin',ar:'مدير الجهة',en:'Organization',noteAr:'المسابقات والهوية والتكاملات',noteEn:'Portfolio and integrations',icon:Building2,group:'governance'},
  {role:'super_admin',ar:'إدارة المنصة',en:'Platform Admin',noteAr:'المؤسسات والتراخيص وصحة المنصة',noteEn:'Tenants and platform health',icon:Crown,group:'governance'},
  {role:'auditor',ar:'المدقق',en:'Auditor',noteAr:'سجل غير قابل للتعديل وتتبع القرارات',noteEn:'Immutable decision trail',icon:FileSearch,group:'governance'},
  {role:'exception_host',ar:'مكتب الاستثناءات',en:'Exception Desk',noteAr:'يتدخل فقط عندما يحتاج الإنسان',noteEn:'Human help only when needed',icon:ScanLine,group:'support'},
  {role:'guardian',ar:'ولي الأمر',en:'Guardian',noteAr:'الموافقات والمتابعة للقصّر',noteEn:'Consent and minor journey',icon:Baby,group:'support'},
  {role:'support_agent',ar:'الدعم',en:'Support',noteAr:'جلسات دعم مؤقتة ومدققة',noteEn:'Audited temporary support',icon:LifeBuoy,group:'support'},
  {role:'broadcast_operator',ar:'البث والحفل',en:'Broadcast',noteAr:'واجهة العرض والنتائج المسرحية',noteEn:'Ceremony and broadcast',icon:Award,group:'support'},
];

interface Props { onEnterRole:(role:Role)=>void; onOpenKiosk:()=>void; onOpenCeremony:()=>void; onOpenWaiting:()=>void; }

export const ExperienceHub:React.FC<Props>=({onEnterRole,onOpenKiosk,onOpenCeremony,onOpenWaiting})=>{
  const {competition,language}=useAppStore();
  const ar=language==='ar';
  const groups:[typeof ROLES,string,string][]=[
    [ROLES.filter(r=>r.group==='core'),ar?'التجارب الأساسية':'Core journeys',ar?'ما يراه أغلب مستخدمي المسابقة':'The operational heart of MIZAN'],
    [ROLES.filter(r=>r.group==='governance'),ar?'الحوكمة والثقة':'Governance & trust',ar?'السياسات، العلم، التدقيق والمنصة':'Policy, science, audit and platform'],
    [ROLES.filter(r=>r.group==='support'),ar?'التجارب المساندة':'Supporting journeys',ar?'الاستثناءات، الحفل، ولي الأمر والدعم':'Exceptions, ceremony, guardians and support'],
  ];
  return <div className="min-h-screen bg-[#F7F5EF] text-[#171b18] font-arabic">
    <div className="max-w-[1380px] mx-auto px-5 sm:px-8 py-8 sm:py-12">
      <section className="rounded-[30px] border border-[#DEDCD4] bg-[#FFFEFB] px-6 py-8 sm:px-10 sm:py-10">
        <div className="relative max-w-3xl">
          <div className="flex items-center gap-2 text-[10px] font-black tracking-[.18em] text-[#5F6B64]"><Sparkles className="w-3.5 h-3.5"/> {ar?'تجربة ميزان':'MIZAN EXPERIENCE'}</div>
          <h1 className="mt-4 text-3xl sm:text-5xl font-black tracking-[-.03em] leading-[1.06]">{ar?'جرّب ميزان كما يراه كل شخص':'See MIZAN through every role'}</h1>
          <p className="mt-3 text-sm text-[#68716B]">{ar?'دور واحد. مهمة واحدة. شاشة واحدة.':'One role. One job. One screen.'}</p>
          <div className="mt-7 flex flex-wrap gap-2">
            <button onClick={()=>{window.location.hash='#competition'}} className="inline-flex items-center gap-2 rounded-xl bg-[#214C40] px-4 py-2.5 text-xs font-black text-white"><Globe2 className="w-4 h-4"/>{ar?'صفحة المسابقة العامة':'Public competition'}</button>
            <button onClick={()=>{window.location.hash='#register'}} className="inline-flex items-center gap-2 rounded-xl border border-[#DCDAD2] bg-white px-4 py-2.5 text-xs font-black"><Plus className="w-4 h-4"/>{ar?'التسجيل':'Registration'}</button>
            <button onClick={()=>{window.location.hash='#verify'}} className="inline-flex items-center gap-2 rounded-xl border border-[#DCDAD2] bg-white px-4 py-2.5 text-xs font-black"><BadgeCheck className="w-4 h-4"/>{ar?'شهادة':'Certificate'}</button><button onClick={()=>{window.location.hash='#trust-verify'}} className="inline-flex items-center gap-2 rounded-xl border border-[#DCDAD2] bg-white px-4 py-2.5 text-xs font-black"><ShieldCheck className="w-4 h-4"/>{ar?'تحقق من إثبات':'Trust proof'}</button>
          </div>
        </div>
        <div className="relative mt-8 flex items-center gap-2 text-[11px] text-[#79817C]"><span className="w-2 h-2 rounded-full bg-[#2F6555]"/><span>{ar?competition.nameArabic:competition.name}</span></div>
      </section>

      {groups.map(([items,title,subtitle])=><section key={title} className="mt-10">
        <div className="flex items-end justify-between gap-4 mb-4"><div><h2 className="text-lg font-black">{title}</h2><p className="text-xs text-[#7B827D] mt-1">{subtitle}</p></div></div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map(item=>{const Icon=item.icon;return <button key={item.role} onClick={()=>onEnterRole(item.role)} className="group min-h-[138px] text-start rounded-[22px] border border-[#DFDED7] bg-[#FFFEFB] p-5 transition hover:border-[#AEBEB5] focus:outline-none focus:ring-2 focus:ring-[#214C40]/30">
            <div className="flex items-start justify-between gap-3"><Pictogram icon={Icon} size="sm"/><ArrowLeft className={`w-4 h-4 text-[#A3A9A5] opacity-0 group-hover:opacity-100 transition ${ar?'':'rotate-180'}`}/></div>
            <div className="mt-5 font-black text-sm">{ar?item.ar:item.en}</div>
            <div className="mt-1.5 text-[10px] leading-5 text-[#79817C] line-clamp-1">{ar?item.noteAr:item.noteEn}</div>
          </button>})}
        </div>
      </section>)}

      <section className="mt-10 border-t border-[#DEDDD6] pt-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><div className="text-sm font-black">{ar?'واجهات يوم المسابقة':'Venue experiences'}</div><div className="text-xs text-[#7A817D] mt-1">{ar?'تُفتح بكامل الشاشة أثناء الحدث':'Full-screen modes used on-site'}</div></div>
        <div className="flex gap-2">
          <button onClick={onOpenKiosk} className="rounded-xl border border-[#DCDAD2] bg-white px-4 py-2.5 text-xs font-black inline-flex gap-2 items-center"><ScanLine className="w-4 h-4"/>{ar?'بوابة الحضور':'Gate kiosk'}</button>
          <button onClick={onOpenWaiting} className="rounded-xl border border-[#DCDAD2] bg-white px-4 py-2.5 text-xs font-black inline-flex gap-2 items-center"><RadioTower className="w-4 h-4"/>{ar?'شاشة الانتظار':'Waiting display'}</button><button onClick={onOpenCeremony} className="rounded-xl bg-[#171B18] text-white px-4 py-2.5 text-xs font-black inline-flex gap-2 items-center"><Award className="w-4 h-4"/>{ar?'وضع الحفل':'Ceremony'}</button>
        </div>
      </section>
    </div>
  </div>
}
