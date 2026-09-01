import React, {useMemo} from 'react';
import { Check, HardDrive, Printer, QrCode, Server, ScanLine, Sparkles, RadioTower, WalletCards } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { buildDeploymentPlan, DeploymentProfile } from '../../lib/deployment-planner';

const iconFor=(id:string)=>({gate:HardDrive,scanner:QrCode,ticket:WalletCards,judge:ScanLine,display:RadioTower,edge:Server,printer:Printer}[id]||HardDrive);

export const DeploymentStudio:React.FC=()=>{
  const s=useAppStore(); const ar=s.language==='ar'; const p=s.competition.policy!; const profile=p.operations.deploymentProfile;
  const plan=useMemo(()=>buildDeploymentPlan(s.competition,profile),[s.competition,profile]);
  const choose=(v:DeploymentProfile)=>s.updateCompetitionPolicy(pol=>({...pol,operations:{...pol.operations,deploymentProfile:v,hardwareStrategy:v==='lean'?'reuse_existing':v==='balanced'?'mixed':'dedicated',gateStationMode:v==='lean'?'computer_only':'touch_kiosk',ticketMode:v==='premium'?'print_optional':'screen_number'}}));
  const profiles:[DeploymentProfile,string,string,string][]=[
    ['lean',ar?'اقتصادي ذكي':'Lean',ar?'أقل أجهزة ممكنة':'Minimum hardware',ar?'كمبيوتر عادي يكفي كبوابة، لا طابعة إلزامية، والأجهزة الحالية تُعاد استخدامها.':'A normal computer can be the gate; no mandatory printer; reuse existing devices.'],
    ['balanced',ar?'متوازن':'Balanced',ar?'راحة أعلى بلا هدر':'Comfort without waste',ar?'Kiosk مخصص عند الحاجة فقط، مع إبقاء بقية التشغيل على أجهزة عادية.':'Dedicated kiosk only where useful; keep the rest on ordinary devices.'],
    ['premium',ar?'رسمي موسّع':'Premium',ar?'احتياط وتجهيز أكبر':'Higher redundancy',ar?'مناسب للفعاليات الكبرى والبث والاعتمادية العالية.':'For major events, broadcast and higher redundancy.']
  ];
  return <div className="space-y-4">
    <div className="mizan-surface p-5 sm:p-6">
      <div className="mizan-kicker">DEPLOYMENT STUDIO</div>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mt-1">
        <div><h2 className="text-xl sm:text-2xl font-black">{ar?'شغّل ميزان بما لديك':'Run MIZAN with what you already have'}</h2><p className="text-xs text-[#747c77] mt-2 max-w-2xl">{ar?'المنصة لا تفرض أجهزة خاصة. كل نقطة تشغيل لها مسار اقتصادي ومسار موسّع، والوظيفة نفسها تبقى واحدة.':'MIZAN never forces proprietary hardware. Every station has a lean and expanded path while the workflow stays identical.'}</p></div>
        <div className="rounded-2xl bg-[#E7EEE9] px-4 py-3 text-[#214C40] min-w-[190px]"><div className="text-[10px] font-black opacity-60">{ar?'الحد الأدنى الميداني':'MINIMUM FLOOR STAFF'}</div><div className="text-3xl font-black mt-1">{plan.staffFloor}</div><div className="text-[10px] font-bold opacity-70">{ar?'مع مسار استثناء بشري':'with one exception path'}</div></div>
      </div>
      <div className="grid md:grid-cols-3 gap-3 mt-6">{profiles.map(([id,title,sub,desc])=><button key={id} onClick={()=>choose(id)} className={`text-start rounded-2xl border p-4 transition ${profile===id?'border-[#214C40] bg-[#eef3ef] shadow-[0_0_0_1px_#214C40]':'border-[#dedcd5] hover:bg-[#faf9f5]'}`}><div className="flex items-center justify-between"><div className="font-black text-sm">{title}</div>{profile===id&&<span className="w-6 h-6 rounded-full bg-[#214C40] text-white grid place-items-center"><Check className="w-3.5 h-3.5"/></span>}</div><div className="text-[11px] font-bold text-[#68716b] mt-1">{sub}</div><p className="text-[11px] text-[#7a817c] mt-3 leading-5">{desc}</p></button>)}</div>
    </div>
    <div className="grid xl:grid-cols-[1.35fr_.65fr] gap-4">
      <div className="mizan-surface p-5"><div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#2F6555]"/><h3 className="font-extrabold">{ar?'خريطة الأجهزة المقترحة':'Suggested hardware map'}</h3></div><div className="mt-4 divide-y divide-[#e7e5df]">{plan.items.map(item=>{const Icon=iconFor(item.id);return <div key={item.id} className="py-3.5 flex gap-3 items-start"><span className="w-9 h-9 rounded-xl bg-[#f1efe9] grid place-items-center shrink-0"><Icon className="w-4 h-4 text-[#58625c]"/></span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-extrabold">{ar?item.labelAr:item.labelEn}</span>{item.required?<span className="text-[9px] font-black text-[#2F6555]">{ar?'أساسي':'CORE'}</span>:<span className="text-[9px] font-black text-[#979b98]">{ar?'اختياري':'OPTIONAL'}</span>}</div><div className="text-[11px] text-[#767e79] mt-1">{ar?item.noteAr:item.noteEn}</div></div><div className="text-2xl font-black tabular-nums">{item.quantity}</div></div>})}</div></div>
      <div className="space-y-4"><div className="mizan-surface p-5"><div className="mizan-kicker">GATE</div><h3 className="font-black mt-1">{ar?'الاستقبال بلا كاونتر':'Reception without a counter'}</h3><div className="mt-4 space-y-3 text-xs"><Flow n="01" t={ar?'يمسح QR أو يدخل الكود':'Scan QR or enter code'}/><Flow n="02" t={ar?'يظهر رقم الانتظار فورًا':'Queue number appears instantly'}/><Flow n="03" t={ar?'التوجيه للجنة آلي':'Automatic committee routing'}/><Flow n="04" t={ar?'شاشة الانتظار تنادي بالكود':'Waiting display calls by code'}/></div><div className="rounded-xl bg-[#f4f2ec] p-3 mt-4 text-[11px] font-semibold text-[#616a64]">{ar?'يمكن تشغيل البوابة على كمبيوتر موجود مع شاشة فقط. قارئ QR والطابعة والكشك المخصص ترقيات اختيارية وليست شروطًا.':'The gate can run on an existing computer and screen. QR scanner, printer and dedicated kiosk are upgrades—not requirements.'}</div></div>
      <div className="mizan-surface p-5"><div className="mizan-kicker">CURRENT PROFILE</div><div className="text-sm font-black mt-2">{ar?plan.principleAr:plan.principleEn}</div><div className="grid grid-cols-2 gap-2 mt-4"><Metric n={plan.gateStations} t={ar?'بوابة':'Gate'}/><Metric n={plan.publicDisplays} t={ar?'شاشة':'Display'}/><Metric n={plan.edgeServers} t="Edge"/><Metric n={plan.printers} t={ar?'طابعة':'Printer'}/></div></div></div>
    </div>
  </div>
}
const Flow=({n,t}:{n:string;t:string})=><div className="flex items-center gap-3"><span className="text-[10px] font-black text-[#96a09a]">{n}</span><span className="font-bold">{t}</span></div>;
const Metric=({n,t}:{n:number;t:string})=><div className="rounded-xl bg-[#f3f1eb] p-3"><div className="text-xl font-black">{n}</div><div className="text-[10px] text-[#777f7a] mt-1">{t}</div></div>;
