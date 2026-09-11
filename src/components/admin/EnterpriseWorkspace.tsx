import React, {Suspense, lazy, useEffect, useMemo, useState} from 'react';
import { Bell, Cable, DatabaseBackup, FileUp, Globe2, HardDrive, Plane, Radar, RadioTower, ShieldCheck, Stethoscope, UsersRound, Wifi, Copy, Download, Play, RefreshCw, Plus, CheckCircle2, AlertTriangle, Fingerprint, WandSparkles } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import { Modal } from '../design-system/Modal';
import { useConfirm } from '../design-system/ConfirmDialog';
import { EmergencyControl } from '../design-system/EmergencyControl';
import { notificationTemplateLabel, channelLabel, uiToken } from '../../lib/ui-language';

/*
 * Only one section renders at a time, yet all seven panels were imported eagerly —
 * roughly 79 kB of source that a competition admin downloaded before seeing the first
 * one. They load on demand now.
 *
 * warmPanels() then pulls the rest during idle, for the same reason the route-level
 * split does: MIZAN promises the app keeps working when the venue drops offline, and
 * the service worker can only serve a chunk it has already seen.
 */
const PANELS = {
  deploymentStudio: () => import('./DeploymentStudio'),
  deviceCenter: () => import('./DeviceCenter'),
  trustProtocolLab: () => import('./TrustProtocolLab'),
  beyondLab: () => import('./BeyondLab'),
  readinessLab: () => import('./ReadinessLab'),
};
const panel = (loader: () => Promise<any>, name: string) =>
  lazy(() => loader().then((m: any) => ({ default: m[name] })));

const DeploymentStudio = panel(PANELS.deploymentStudio, 'DeploymentStudio');
const DeviceCenter = panel(PANELS.deviceCenter, 'DeviceCenter');
const TrustProtocolLab = panel(PANELS.trustProtocolLab, 'TrustProtocolLab');
const BeyondLab = panel(PANELS.beyondLab, 'BeyondLab');
const ReadinessLab = panel(PANELS.readinessLab, 'ReadinessLab');

let panelsWarmed = false;
function warmPanels(){
  if (panelsWarmed || typeof window === 'undefined') return;
  const conn = (navigator as any).connection;
  if (conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || '')) return;
  if (!navigator.onLine) { window.addEventListener('online', () => warmPanels(), { once: true }); return; }
  panelsWarmed = true;
  const run = () => { for (const load of Object.values(PANELS)) void load().catch(() => { panelsWarmed = false; }); };
  const idle = (window as any).requestIdleCallback;
  window.setTimeout(() => { idle ? idle(run, { timeout: 4000 }) : run(); }, 2500);
}

const PanelFallback: React.FC = () => (
  <div className="mizan-surface p-8 grid place-items-center min-h-40" role="status" aria-live="polite">
    <span className="mizan-status-orb" />
    <span className="sr-only">جارٍ التحميل</span>
  </div>
);

type Section='integrations'|'operations'|'international'|'shadow'|'governance'|'tools'|'trust'|'beyond';
const isAr=(l:string)=>l==='ar';
export const EnterpriseWorkspace:React.FC=()=>{
 const s=useAppStore(); const ar=isAr(s.language); const [section,setSection]=useState<Section>('integrations');
 useEffect(()=>{warmPanels()},[]);
 const pending=s.notifications.filter(n=>n.status==='failed').length; const online=s.devices.filter(d=>d.status==='online').length;
 // الأدوات العميقة (الثقة/ما بعد/Shadow) خاصة بمالك المنصة؛ لا تظهر لعملاء الجهات حتى لا تُعقّد
 // واجهتهم بما لا يحتاجونه. غياب دور المالك ⇒ لا يظهر التبويب ولا يُعرض محتواه.
 const platformOwner=s.currentUser.role==='super_admin';
 const ownerOnly:Section[]=['shadow','trust','beyond'];
 const allSections:[Section,any,string][]=[['integrations',Cable,ar?'القنوات':'Channels'],['operations',RadioTower,ar?'البنية الميدانية':'Field'],['international',Plane,ar?'الدولي':'International'],['shadow',Radar,ar?'الظل':'Shadow'],['governance',ShieldCheck,ar?'الجاهزية':'Readiness'],['tools',DatabaseBackup,ar?'أدوات الإدارة':'Admin tools'],['trust',Fingerprint,ar?'الثقة':'Trust 8'],['beyond',WandSparkles,ar?'ما بعد':'Beyond']];
 const sections=allSections.filter(([id])=>platformOwner||!ownerOnly.includes(id));
 const activeSection=(!platformOwner&&ownerOnly.includes(section))?'integrations':section;
 return <div className="space-y-4">
  <div><div className="mizan-kicker">{ar?'طبقة المؤسسات':'ENTERPRISE LAYER'}</div><h1 className="text-2xl sm:text-3xl font-black mt-1">{ar?'القوة مخفية خلف البساطة':'Enterprise power, quietly contained'}</h1><p className="text-sm text-[#626864] mt-2 max-w-2xl">{ar?'تكاملات وتشغيل دولي واستمرارية وحوكمة، دون تلويث تجربة المستخدم اليومية.':'Integrations, international operations, continuity and governance stay out of the daily user flow.'}</p></div>
  <div role="tablist" aria-label={ar?'أقسام طبقة المؤسسات':'Enterprise sections'} className="mizan-tabs max-w-full overflow-x-auto">{sections.map(([id,Icon,label])=><button key={id} type="button" role="tab" aria-selected={activeSection===id} onClick={()=>setSection(id)} className={`mizan-tab shrink-0 ${activeSection===id?'is-active':''}`}><Icon className="w-4 h-4"/>{label}</button>)}</div>
  {activeSection==='integrations'&&<Integrations s={s} ar={ar} pending={pending}/>}
  {activeSection==='operations'&&<Field s={s} ar={ar} online={online}/>}
  {activeSection==='international'&&<International s={s} ar={ar}/>}
  {activeSection==='shadow'&&<Shadow s={s} ar={ar}/>}
  {activeSection==='governance'&&<Suspense fallback={<PanelFallback/>}><ReadinessLab onNavigate={t=>setSection(t==='field'?'operations':'integrations')}/></Suspense>}
  {activeSection==='tools'&&<Governance s={s} ar={ar}/>}
  {activeSection==='trust'&&<Suspense fallback={<PanelFallback/>}><TrustProtocolLab/></Suspense>}
  {activeSection==='beyond'&&<Suspense fallback={<PanelFallback/>}><BeyondLab/></Suspense>}
 </div>
}
const Integrations=({s,ar,pending}:{s:ReturnType<typeof useAppStore>;ar:boolean;pending:number})=>{
 const kinds=['email','sms','whatsapp','storage','identity','broadcast'] as const;
 const [editing,setEditing]=useState<(typeof kinds)[number]|null>(null);const [provider,setProvider]=useState('');const [serviceUrl,setServiceUrl]=useState('');
 const start=(kind:(typeof kinds)[number])=>{const cfg=s.integrations.find(i=>i.kind===kind);setEditing(kind);setProvider(cfg?.name||'');setServiceUrl(cfg?.endpoint||'');window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{document.getElementById('mizan-integration-editor')?.scrollIntoView({behavior:'smooth',block:'center'});document.getElementById('mizan-integration-provider')?.focus()}))};
 const save=()=>{if(!editing)return;const name=provider.trim()||`${editing} provider`;s.configureIntegration(editing,name,true,serviceUrl.trim()||undefined);setEditing(null)};
 return <div className="space-y-4"><div className="mizan-surface p-5 sm:p-6"><div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3"><div><div className="mizan-kicker">{ar?'قنوات ميزان':'MIZAN CHANNELS'}</div><h2 className="font-extrabold mt-1">{ar?'اربط خدمات الجهة من هنا':'Connect organization services here'}</h2><p className="text-xs text-[#636965] mt-2 max-w-2xl">{ar?'لا شاشة مطور ولا إعدادات تقنية منفصلة. اختر القناة، اكتب اسم المزود وعنوان خدمته الآمن، واحفظها من داخل ميزان. مفاتيح المزود الحساسة لا تُكتب في المتصفح.':'No separate developer console or technical surface. Choose a channel, enter the provider and secure service URL, and manage it from MIZAN. Provider secrets are never entered in the browser.'}</p></div><Badge variant={pending?'amber':'emerald'}>{pending?`${pending} ${ar?'إشعار يحتاج معالجة':'notification issues'}`:(ar?'الإشعارات هادئة':'Notifications quiet')}</Badge></div><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-5">{kinds.map(k=>{const cfg=s.integrations.find(i=>i.kind===k);const ready=cfg?.status==='configured'&&cfg.enabled;return <div key={k} className={`rounded-2xl border p-4 transition ${ready?'border-[#cadbd2] bg-[#f7faf8]':'border-[#e2e0d9] bg-[#fffefb]'}`}><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className={`w-9 h-9 rounded-xl grid place-items-center ${ready?'bg-[#E7EEE9] text-[#214C40]':'bg-[#f1efe9] text-[#666d68]'}`}><Cable className="w-4 h-4"/></span><div><div className="text-sm font-black">{channelLabel(k,ar)}</div><div className="text-[10px] text-[#656b66] mt-0.5">{ready?(ar?'محفوظ ومفعّل':'Saved & enabled'):cfg?(ar?'محفوظ — بانتظار تحقق الخادم':'Saved — awaiting server verification'):(ar?'غير مربوط':'Not connected')}</div></div></div><span className={`w-2.5 h-2.5 rounded-full ${ready?'bg-[#2F6555]':'bg-[#c9c5bb]'}`}/></div>{cfg?.name&&<div className="text-[10px] text-[#656b66] mt-3 truncate">{cfg.name}</div>}<div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={()=>start(k)}>{cfg?(ar?'إدارة':'Manage'):(ar?'ربط':'Connect')}</Button>{cfg&&<Button size="sm" variant="ghost" onClick={()=>s.configureIntegration(k,cfg.name,!cfg.enabled,cfg.endpoint)}>{cfg.enabled?(ar?'إيقاف':'Disable'):(ar?'تفعيل':'Enable')}</Button>}</div></div>})}</div>{editing&&<div id="mizan-integration-editor" className="mt-5 rounded-2xl border border-[#d9d7d0] bg-[#f7f5ef] p-4 scroll-mt-24"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black">{ar?`ربط ${channelLabel(editing,true)}`:`Connect ${editing}`}</div><div className="text-[10px] text-[#656b66] mt-1">{ar?'بيانات الربط غير السرية فقط؛ الأسرار تبقى في بيئة الخادم.':'Non-secret connection metadata only; credentials remain server-side.'}</div></div><button type="button" onClick={()=>setEditing(null)} className="text-xs font-bold text-[#656b66]">{ar?'إغلاق':'Close'}</button></div><div className="grid sm:grid-cols-2 gap-3 mt-4"><label><span className="block text-[10px] font-black text-[#656b66] mb-1">{ar?'اسم المزود أو الحساب':'Provider / account name'}</span><input id="mizan-integration-provider" value={provider} onChange={e=>setProvider(e.target.value)} className="mizan-input" placeholder={ar?'مثال: بوابة الرسائل الرسمية':'Official messaging provider'}/></label><label><span className="block text-[10px] font-black text-[#656b66] mb-1">{ar?'عنوان الخدمة الآمن':'Secure service URL'}</span><input dir="ltr" value={serviceUrl} onChange={e=>setServiceUrl(e.target.value)} className="mizan-input" placeholder="https://…"/></label></div><div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] text-[#656b66]">{serviceUrl&&!/^https:\/\//i.test(serviceUrl)?(ar?'العنوان يجب أن يبدأ بـ https://':'URL must start with https://'):''}</span><Button size="sm" disabled={!provider.trim()||!/^https:\/\//i.test(serviceUrl)} onClick={save}>{ar?'حفظ الربط':'Save connection'}</Button></div></div>}</div></div>
}
const Field=({s,ar,online}:{s:ReturnType<typeof useAppStore>;ar:boolean;online:number})=>{
 /* ثلاث لوحات ثقيلة — النشر والأجهزة والاستمرارية — كانت تتراص في عمود واحد ولا تُقرأ معًا. */
 const [fieldTab,setFieldTab]=useState<'deployment'|'devices'|'continuity'>('deployment');
 return <div className="space-y-4">
  <div role="tablist" aria-label={ar?'أقسام البنية الميدانية':'Field sections'} className="mizan-tabs mizan-tabs-sub">
   {([['deployment',ar?'النشر':'Deployment'],['devices',ar?'الأجهزة':'Devices'],['continuity',ar?'الاستمرارية':'Continuity']] as const).map(([id,label])=><button key={id} type="button" role="tab" aria-selected={fieldTab===id} onClick={()=>setFieldTab(id)} className={`mizan-tab ${fieldTab===id?'is-active':''}`}>{label}</button>)}
  </div>
  {fieldTab==='deployment'&&<Suspense fallback={<PanelFallback/>}><DeploymentStudio/></Suspense>}
  {fieldTab==='devices'&&<Suspense fallback={<PanelFallback/>}><DeviceCenter/></Suspense>}
  {fieldTab==='continuity'&&<div className="grid gap-4"><div className="mizan-surface p-5 h-fit"><div className="flex items-center gap-2"><Wifi className="w-4 h-4 text-[#2F6555]"/><h2 className="font-extrabold">{ar?'الاستمرارية':'Continuity'}</h2></div><div className="mt-4 space-y-3"><State ar={ar} ok={!s.isOffline} label={ar?'السحابة':'Cloud'}/><State ar={ar} ok={s.devices.some(d=>d.type==='edge_server'&&d.status==='online')} label="MIZAN Edge"/><State ar={ar} ok={!s.emergencyFrozen} label={ar?'التوجيه':'Dispatch'}/></div><div className="mt-4 grid gap-2"><Button size="sm" variant="outline" onClick={s.toggleOffline}>{s.isOffline?(ar?'استعادة الاتصال':'Reconnect'):(ar?'محاكاة انقطاع':'Simulate outage')}</Button><EmergencyControl/></div></div></div>}
 </div>;
};
const International=({s,ar}:{s:ReturnType<typeof useAppStore>;ar:boolean})=>{
 const [pid,setPid]=useState('');
 const delegationMembers=s.participants.filter(p=>!!p.delegationId);
 const [flightNumber,setFlightNumber]=useState('');
 const [arrivalAirport,setArrivalAirport]=useState('');
 const travel=s.travelRecords.find(r=>r.participantId===pid);
 useEffect(()=>{setFlightNumber(travel?.flightNumber||'');setArrivalAirport(travel?.arrivalAirport||'')},[travel?.id,pid]);
 const saveTravel=()=>{if(!pid||!flightNumber.trim()||!arrivalAirport.trim())return;s.upsertTravelRecord(pid,{flightNumber:flightNumber.trim(),arrivalAirport:arrivalAirport.trim(),transportStatus:'scheduled'})};
 const downloadTemplate=()=>{
  const csv='\ufefffullNameArabic,fullName,email,phone,country,nationality,dateOfBirth,gender,categoryId,riwaya\nأحمد محمد,Ahmad Mohammad,ahmad@example.com,+96550000000,Kuwait,Kuwaiti,2005-01-01,male,CATEGORY_ID,Hafs';
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='mizan-participants-template.csv';a.click();URL.revokeObjectURL(a.href);
 };
 return <div className="grid xl:grid-cols-2 gap-4"><div className="mizan-surface p-5"><div className="flex items-center gap-2"><Plane className="w-4 h-4 text-[#2F6555]"/><h2 className="font-extrabold">{ar?'السفر والوفود':'Travel & delegations'}</h2></div><select value={pid} onChange={e=>setPid(e.target.value)} className="w-full mt-4 rounded-xl border border-[#ddd] px-3 py-2.5 text-sm"><option value="">{ar?'اختر مشاركًا':'Choose participant'}</option>{delegationMembers.slice(0,50).map(p=><option key={p.id} value={p.id}>{p.code} · {ar?p.fullNameArabic:p.fullName}{p.country?` · ${p.country}`:''}</option>)}{!delegationMembers.length&&<option value="" disabled>{ar?'لا يوجد أعضاء وفود في هذه المسابقة':'No delegation members in this competition'}</option>}</select>{pid&&<div className="grid sm:grid-cols-2 gap-2 mt-3"><label className="block"><span className="mizan-field-label">{ar?'رقم الرحلة':'Flight number'}</span><input value={flightNumber} onChange={e=>setFlightNumber(e.target.value)} className="mizan-input" placeholder="KU512"/></label><label className="block"><span className="mizan-field-label">{ar?'مطار الوصول':'Arrival airport'}</span><input value={arrivalAirport} onChange={e=>setArrivalAirport(e.target.value)} className="mizan-input" placeholder={ar?'مطار الكويت الدولي':'KWI'}/></label></div>}<div className="grid sm:grid-cols-2 gap-2 mt-3"><Button size="sm" variant="outline" disabled={!pid||!flightNumber.trim()||!arrivalAirport.trim()} onClick={saveTravel}>{ar?'حفظ الوصول':'Save arrival'}</Button><Button size="sm" variant="outline" disabled={!pid} onClick={()=>pid&&s.runRemoteCheck(pid)}>{ar?'فحص تأهل عن بعد':'Remote check'}</Button></div>{travel&&<div className="rounded-xl bg-[#f3f1eb] p-3 mt-3 text-xs font-semibold">{travel.flightNumber} · {travel.arrivalAirport} · {uiToken(travel.transportStatus,ar)}</div>}{!pid&&<div className="mt-3 text-xs text-[#696f6b]">{ar?'لن يُنشئ ميزان أي رحلة تلقائيًا. اختر مشاركًا وأدخل بيانات السفر عند الحاجة.':'MIZAN never creates travel records automatically. Choose a participant and enter real travel data when needed.'}</div>}</div><div className="mizan-surface p-5"><div className="flex items-center gap-2"><FileUp className="w-4 h-4 text-[#2F6555]"/><h2 className="font-extrabold">{ar?'الاستيراد':'Migration'}</h2></div><p className="text-xs text-[#636965] mt-2">{ar?'حمّل النموذج الجاهز، عبّئه، ثم ارفعه. يتحقق ميزان من الملف قبل إدخال أي سجل، وإذا وُجد خطأ لا يتم الاستيراد.':'Download the ready template, fill it, then upload it. MIZAN validates the file before any record is committed.'}</p><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" icon={<Download className="w-4 h-4"/>} onClick={downloadTemplate}>{ar?'تحميل النموذج':'Download template'}</Button><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#214C40] text-white px-3 py-2.5 text-xs font-bold"><FileUp className="w-4 h-4"/>{ar?'اختيار CSV':'Choose CSV'}<input type="file" accept=".csv,text/csv" className="sr-only" onChange={async e=>{const f=e.target.files?.[0];if(f){await s.importParticipantsCsv(f.name,await f.text());e.currentTarget.value=''}}}/></label></div>{s.importJobs[0]&&<div className="mt-4 grid grid-cols-3 gap-2"><Mini n={s.importJobs[0].totalRows} t={ar?'صف':'Rows'}/><Mini n={s.importJobs[0].validRows} t={ar?'صالح':'Valid'}/><Mini n={s.importJobs[0].invalidRows} t={ar?'مراجعة':'Review'}/></div>}{s.importJobs[0]?.errors?.length>0&&<div className="mt-3 rounded-xl bg-[#F4E6E3] text-[#89453d] p-3 text-[11px] font-semibold">{s.importJobs[0].errors.slice(0,3).map(e=><div key={`${e.row}-${e.message}`}>{ar?'صف':'Row'} {e.row}: {e.message}</div>)}</div>}</div></div>
}
const Shadow=({s,ar}:{s:ReturnType<typeof useAppStore>;ar:boolean})=>{const run=s.shadowRuns[0];return <div className="mizan-surface p-5 sm:p-6"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div><div className="mizan-kicker">{ar?'التحقق الصامت':'SHADOW MODE'}</div><h2 className="font-extrabold mt-1">{ar?'أثبت القيمة قبل الاستبدال':'Prove value before replacement'}</h2><p className="text-xs text-[#636965] mt-2 max-w-xl">{ar?'يعمل خلف النظام الحالي دون التأثير في النتيجة، ثم يقارن التشغيل والنزاهة والوقت.':'Run behind the legacy system without affecting scores, then compare operations and integrity.'}</p></div>{!run?<Button onClick={()=>s.startShadowRun('compare')} icon={<Play className="w-4 h-4"/>}>{ar?'بدء':'Start'}</Button>:run.status==='running'?<Button onClick={()=>s.completeShadowRun(run.id)} icon={<CheckCircle2 className="w-4 h-4"/>}>{ar?'إنهاء وتحليل':'Finish & analyze'}</Button>:<Badge variant="emerald">{ar?'اكتمل':'Complete'}</Badge>}</div>{run?.observations.length>0&&<div className="mt-5 grid md:grid-cols-3 gap-3">{run.observations.map((o,i)=><div key={i} className="rounded-xl bg-[#f4f2ec] p-4"><div className={`text-[10px] font-black text-[#656b66] ${ar?'':'uppercase'}`}>{uiToken(o.type,ar)}</div><div className="text-xs font-bold mt-2">{o.summary}</div></div>)}</div>}</div>}
const Governance=({s,ar}:{s:ReturnType<typeof useAppStore>;ar:boolean})=>{
 const backups=s.backups.filter(b=>b.competitionId===s.competition.id&&b.status==='ready'); const backup=backups[0];
 const {confirm,confirmDialog}=useConfirm(ar);
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [closeOpen,setCloseOpen]=useState(false); const [closePhrase,setClosePhrase]=useState(''); const [closeReason,setCloseReason]=useState(''); const [closing,setClosing]=useState(false);
 const create=async()=>{setBusy(true);setMessage('');try{await s.createBackup();setMessage(ar?'تم إنشاء نقطة استعادة فعلية من بيانات المسابقة الحالية.':'A real restore point was created from current competition data.')}catch{setMessage(ar?'تعذر إنشاء النسخة الاحتياطية.':'Backup failed.')}finally{setBusy(false)}};
 const restore=async()=>{if(!backup)return;if(!(await confirm({
  title:ar?'استعادة نقطة سابقة؟':'Restore this point?',
  body:ar?'ستحلّ بيانات نقطة الاستعادة محلّ بيانات المسابقة الحاضرة كلها. كل ما تغيّر بعد تلك النقطة يزول، ولا يمكن التراجع.':'The restore point replaces all current competition data. Everything changed since then is lost, and this cannot be undone.',
  confirmLabel:ar?'استعادة':'Restore',tone:'destructive'})))return;const out=s.restoreBackup(backup.id);setMessage(out.ok?(ar?'تمت الاستعادة بنجاح.':'Restore completed.'):(ar?`تعذرت الاستعادة: ${out.message}`:`Restore failed: ${out.message}`))};
 const exportFile=()=>{const blob=new Blob([s.exportCompetitionSnapshot()],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mizan-${s.competition.id}-backup.json`;a.click();URL.revokeObjectURL(a.href)};
 const importFile=async(file?:File)=>{if(!file)return;if(!(await confirm({
  title:ar?'استيراد نسخة واستبدال البيانات؟':'Import and replace?',
  body:ar?`سيُفحص «${file.name}» أولًا، وإن كان صالحًا حلّت بياناته محلّ بيانات المسابقة الحاضرة. الملف غير الصالح يُرفض ولا يُغيَّر شيء.`:`“${file.name}” is validated first; if valid, its data replaces the current competition data. An invalid file is rejected and nothing changes.`,
  confirmLabel:ar?'فحص واستبدال':'Validate & replace',tone:'destructive'})))return;const out=s.restoreCompetitionSnapshot(await file.text());setMessage(out.ok?(ar?'تم استيراد النسخة واستعادتها.':'Snapshot imported and restored.'):(ar?`الملف غير صالح: ${out.message}`:`Invalid snapshot: ${out.message}`))};
 const clone=async()=>{if(!(await confirm({
  title:ar?'نسخ هيكل المسابقة؟':'Clone competition structure?',
  body:ar?'تُنشأ مسابقة جديدة بالفئات والقواعد ولائحة التحكيم نفسها. ولا يُنسخ المتسابقون ولا النتائج ولا التواريخ؛ تبدأ فارغة كمسودّة.':'A new competition is created with the same categories, rules and rulebook. Participants, results and dates are not copied; it starts empty as a draft.',
  confirmLabel:ar?'إنشاء نسخة':'Create clone'})))return;s.cloneCompetition()};
 return <div className="space-y-4">{confirmDialog}{message&&<div role="status" className="rounded-xl bg-[#E7EEE9] text-[#214C40] p-3 text-xs font-bold">{message}</div>}<div className="grid xl:grid-cols-3 gap-4">
  <div className="mizan-surface p-5"><DatabaseBackup className="w-5 h-5 text-[#2F6555]"/><div className="mizan-kicker mt-3">{ar?'سلامة بيانات المسابقة':'DATA INTEGRITY'}</div><h2 className="font-extrabold mt-1">{ar?'النسخ الاحتياطي والاستعادة':'Backup & restore'}</h2><p className="text-xs text-[#646965] mt-2 leading-5">{ar?'أنشئ نسخة فعلية من بيانات المسابقة، ثم ارجع إليها عند الحاجة. لا توجد نقطة وهمية أو حالة شكلية.':'Create a real competition snapshot and restore it when needed; no placeholder states.'}</p>{backup?<div className="mt-3 rounded-xl bg-[#f4f2ec] p-3"><Badge variant="emerald">{ar?'نسخة جاهزة':'Ready backup'}</Badge><div className="text-[10px] text-[#656b66] mt-2">{new Date(backup.createdAt).toLocaleString(ar?'ar-KW':'en')} · {backup.sizeLabel}</div><div className="text-[9px] text-[#777] mt-1 font-mono truncate" dir="ltr">{backup.checksum}</div></div>:<div className="mt-3 text-xs text-[#696f6b]">{ar?'لا توجد نسخة احتياطية بعد.':'No backup yet.'}</div>}<div className="mt-4 flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={()=>void create()}>{busy?'…':(ar?'إنشاء نسخة احتياطية':'Create backup')}</Button><Button size="sm" variant="outline" disabled={!backup} onClick={()=>void restore()}>{ar?'استعادة آخر نسخة':'Restore latest'}</Button></div></div>
   <div className="mizan-surface p-5"><Download className="w-5 h-5 text-[#2F6555]"/><h2 className="font-extrabold mt-3">{ar?'تصدير أو استعادة ملف المسابقة':'Export / restore file'}</h2><p className="text-xs text-[#646965] mt-2 leading-5">{ar?'ملف JSON يحتوي بنية المسابقة والسجلات التشغيلية المرتبطة بها، ويمكن استعادته بعد التحقق منه.':'Portable JSON snapshot of the competition and its scoped operational records.'}</p><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={exportFile}>{ar?'تصدير نسخة':'Export snapshot'}</Button><label className="inline-flex min-h-10 cursor-pointer items-center rounded-xl border border-[#d8d6cf] bg-white px-3 text-xs font-black text-[#214C40] hover:bg-[#f7f5ef]">{ar?'استعادة من ملف':'Restore from file'}<input type="file" accept="application/json,.json" className="sr-only" onChange={e=>{void importFile(e.target.files?.[0]);e.currentTarget.value=''}}/></label></div></div>
   <div className="mizan-surface p-5"><Copy className="w-5 h-5 text-[#2F6555]"/><div className="mizan-kicker mt-3">{ar?'إصدار جديد من المسابقة':'NEW EDITION'}</div><h2 className="font-extrabold mt-1">{ar?'إنشاء مسابقة جديدة بنفس الإعدادات':'New competition from these settings'}</h2><p className="text-xs text-[#646965] mt-2 leading-5">{ar?'ينسخ الهيكل والقواعد والفئات فقط، ويبدأ مسابقة مستقلة بلا متسابقين أو نتائج أو تواريخ سابقة.':'Copies structure, rules and categories only; starts clean with no participants, results or old dates.'}</p><Button size="sm" variant="outline" className="mt-4" onClick={()=>void clone()}>{ar?'إصدار جديد من المسابقة':'Create new edition'}</Button></div>
 </div>{s.currentUser.role==='org_admin'&&!['completed','archived'].includes(s.competition.status)&&<div className="mizan-surface p-5 border border-[#e4c6c0]"><div className="flex flex-col md:flex-row md:items-center justify-between gap-4"><div><div className="text-xs font-black text-[#8a4f45]">{ar?'نهاية دورة المسابقة':'COMPETITION CLOSURE'}</div><h2 className="font-extrabold mt-1">{ar?'انتهت المسابقة؟ أغلقها من هنا مرة واحدة.':'Competition finished? Close it once from here.'}</h2><p className="text-xs text-[#646965] mt-2 leading-6 max-w-3xl">{ar?'سيُوقف الوصول التشغيلي والجلسات والدعوات وروابط المتسابق وولي الأمر والدعم، وتبقى النتائج والشهادات والسجلات محفوظة.':'Operational access, sessions, invites, journey links and support are stopped; records, results and certificates remain preserved.'}</p></div><Button onClick={()=>setCloseOpen(true)}>{ar?'إنهاء المسابقة وإغلاقها':'End and close competition'}</Button></div></div>}<Modal isOpen={closeOpen} onClose={()=>{if(!closing){setCloseOpen(false);setClosePhrase('')}}} title={ar?'إنهاء المسابقة وإغلاق كل الوصول':'End competition and close all access'} subtitle={ar?'إجراء نهائي عالي الأثر. لا يتم بمجرد ضغطة واحدة.':'High-impact final action with explicit confirmation.'} maxWidth="lg"><div className="space-y-4"><div className="rounded-xl bg-[#F9F0EE] text-[#7f4c44] p-4 text-xs font-bold leading-6">{ar?'بعد الإغلاق لن يستطيع فريق المسابقة أو المحكمون أو التشغيل أو المتسابقون أو أولياء الأمور الدخول إلى المسابقة. ستظل السجلات والنتائج والشهادات محفوظة للأرشفة والتحقق العام المسموح.':'After closure, operational staff, judges, participants and guardians cannot enter the competition. Records remain retained.'}</div><label className="block text-xs font-black">{ar?'سبب الإغلاق':'Closure reason'}<textarea value={closeReason} onChange={e=>setCloseReason(e.target.value)} rows={3} className="mizan-input mt-2 resize-none" placeholder={ar?'مثال: انتهت جميع فعاليات المسابقة وتم اعتماد النتائج':'Reason for closure'}/></label><label className="block text-xs font-black">{ar?'للتأكيد اكتب: إنهاء المسابقة':'Type: إنهاء المسابقة'}<input dir="rtl" value={closePhrase} onChange={e=>setClosePhrase(e.target.value)} className="mizan-input mt-2" placeholder="إنهاء المسابقة"/></label><div className="flex justify-end gap-2"><Button variant="ghost" disabled={closing} onClick={()=>setCloseOpen(false)}>{ar?'تراجع':'Cancel'}</Button><Button disabled={closing||closePhrase.trim()!=='إنهاء المسابقة'||closeReason.trim().length<5} onClick={async()=>{setClosing(true);const out=await s.closeCompetition(closeReason);setClosing(false);if(out.ok){setCloseOpen(false);window.location.hash=''}else setMessage(ar?`تعذر الإغلاق: ${out.code||''}`:`Closure failed: ${out.code||''}`)}}>{closing?'…':(ar?'تأكيد الإنهاء النهائي':'Confirm final closure')}</Button></div></div></Modal></div>;
}

const State=({ok,label,ar}:{ok:boolean;label:string;ar?:boolean})=><div className="flex items-center justify-between text-xs"><span>{label}</span><Badge variant={ok?'emerald':'amber'}>{ok?(ar?'سليم':'OK'):(ar?'انتباه':'ATTN')}</Badge></div>;
const Mini=({n,t}:{n:number;t:string})=><div className="rounded-xl bg-[#f3f1eb] p-3"><div className="text-lg font-black">{n}</div><div className="text-[10px] text-[#656b66]">{t}</div></div>;
const Empty=({ar}:{ar:boolean})=><div className="py-5 text-center text-xs text-[#696f6b]">{ar?'لا يوجد بعد':'None yet'}</div>;
