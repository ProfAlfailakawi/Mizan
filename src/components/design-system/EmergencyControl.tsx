import React,{useState} from 'react';
import {AlertTriangle,ShieldCheck} from 'lucide-react';
import {useAppStore} from '../../lib/store';
import {Modal} from './Modal';
import {Button} from './Button';

export const EmergencyControl:React.FC<{iconOnly?:boolean;className?:string}>=({iconOnly=false,className=''})=>{
 const s=useAppStore(); const ar=s.language==='ar'; const [open,setOpen]=useState(false); const [reason,setReason]=useState(''); const [error,setError]=useState('');
 const allowed=['comp_admin','ops_manager','org_admin'].includes(s.currentUser.role);
 if(!allowed)return null;
 const active=s.emergencyFrozen;
 const submit=()=>{const r=s.setEmergencyMode(!active,reason);if(!r.ok){setError(ar?'اكتب سببًا واضحًا قبل التنفيذ.':'Enter a clear reason before continuing.');return;}setReason('');setError('');setOpen(false)};
 return <>
  {iconOnly?<button onClick={()=>setOpen(true)} className={`w-11 h-11 grid place-items-center rounded-xl transition ${active?'bg-[#A34D43] text-white':'hover:bg-[#F4E6E3] text-[#A34D43]'} ${className}`} title={ar?'الطوارئ':'Emergency'} aria-label={ar?'الطوارئ':'Emergency'}><AlertTriangle className="w-4 h-4"/></button>:<Button size="sm" variant={active?'primary':'outline'} className={className} icon={active?<ShieldCheck className="w-4 h-4"/>:<AlertTriangle className="w-4 h-4"/>} onClick={()=>setOpen(true)}>{active?(ar?'استئناف آمن':'Safe resume'):(ar?'وضع الطوارئ':'Emergency')}</Button>}
  <Modal isOpen={open} onClose={()=>{setOpen(false);setError('')}} title={active?(ar?'استئناف التشغيل':'Safe resume'):(ar?'تفعيل الطوارئ':'Emergency mode')} subtitle={active?(ar?'تبقى كل الجلسات والأحداث محفوظة.':'All active work remains preserved.'):(ar?'يوقف الاستدعاءات الجديدة ويحفظ الجلسات النشطة.':'Pauses new dispatch while preserving active judging.')} maxWidth="sm">
   <div className="space-y-4">
    <div className={`rounded-2xl p-4 flex gap-3 ${active?'bg-[#E7EEE9] text-[#214C40]':'bg-[#F4E6E3] text-[#7d3933]'}`}><AlertTriangle className="w-5 h-5 shrink-0 mt-0.5"/><div className="text-xs font-bold leading-5">{active?(ar?'سيعود التوجيه والاستدعاء فقط بعد تسجيل سبب الاستئناف.':'Routing and calls resume only after the reason is recorded.'):(ar?'لن تُفقد درجات أو جلسات نشطة. كل إجراء يُسجل في الأثر التدقيقي.':'No active score or session is destroyed. Every action is audited.')}</div></div>
    <label className="block"><span className="text-[11px] font-black text-[#68706b]">{ar?'السبب':'Reason'}</span><textarea autoFocus rows={3} value={reason} onChange={e=>{setReason(e.target.value);setError('')}} className="mizan-input mt-1 resize-none" placeholder={active?(ar?'مثال: تأكد استقرار الشبكة':'e.g. Network stability confirmed'):(ar?'مثال: انقطاع كهرباء في القاعة B':'e.g. Power interruption in Hall B')}/></label>
    {error&&<div className="text-xs font-bold text-[#A34D43]">{error}</div>}
    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>setOpen(false)}>{ar?'إلغاء':'Cancel'}</Button><Button variant={active?'primary':'danger'} disabled={reason.trim().length<3} onClick={submit}>{active?(ar?'استئناف':'Resume'):(ar?'تفعيل':'Activate')}</Button></div>
   </div>
  </Modal>
 </>;
};
