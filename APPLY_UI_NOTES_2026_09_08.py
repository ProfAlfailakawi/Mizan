#!/usr/bin/env python3
from pathlib import Path
import re

ROOT=Path.cwd()
changed=[]

def load(p): return (ROOT/p).read_text(encoding='utf-8')
def save(p,s):
    path=ROOT/p
    old=path.read_text(encoding='utf-8')
    if old!=s:
        path.write_text(s,encoding='utf-8'); changed.append(p)
def must_replace(s,old,new,label,count=1):
    if old not in s: raise RuntimeError(f'missing anchor: {label}')
    return s.replace(old,new,count)
def replace_block(s,start,next_anchor,new,label):
    i=s.find(start)
    if i<0: raise RuntimeError(f'missing block start: {label}')
    j=s.find(next_anchor,i+len(start))
    if j<0: raise RuntimeError(f'missing block end: {label}')
    return s[:i]+new+s[j:]

def patch_identity_governance():
    p='src/components/admin/IdentityGovernance.tsx'; s=load(p)
    s=s.replace('KeyRound,ShieldCheck,UserPlus,Laptop2,RefreshCcw,Trash2,QrCode,Copy,Pause,Play,RotateCcw','KeyRound,UserPlus,Laptop2,Trash2,QrCode,Copy,Pause,Play,RotateCcw')
    s=re.sub(r'\n  \{production&&<div className="mt-4 rounded-xl bg-\[#E7EEE9\].*?</div>\}\n', '\n', s, count=1)
    old="{g.status==='ACTIVE'&&<IconButton title={ar?'إصدار QR جديد':'Reissue QR'} onClick={()=>void reissue(g)}><QrCode className=\"w-4 h-4\"/></IconButton>}"
    new="{g.status==='ACTIVE'&&a.status!=='ACTIVE'&&<IconButton title={ar?'إصدار QR جديد':'Reissue QR'} onClick={()=>void reissue(g)}><QrCode className=\"w-4 h-4\"/></IconButton>}"
    s=must_replace(s,old,new,'hide QR for activated account')
    if 'العزل والتجميد والحذف تفرض من الخادم' in s: raise RuntimeError('technical banner remains')
    save(p,s)

def patch_competition_overview():
    p='src/components/admin/CompetitionOverview.tsx'; s=load(p)
    s=s.replace("import { IdentityGovernance } from './IdentityGovernance';\n",'')
    s=s.replace("type MainView='overview'|'design'|'participants'|'operations'|'results'|'access'|'enterprise';","type MainView='overview'|'design'|'participants'|'operations'|'results'|'enterprise';")
    s=s.replace(",{id:'access' as const,icon:ShieldCheck,ar:'الهوية والصلاحيات',en:'Identity & access'}",'')
    s=s.replace("   {view==='access'&&<IdentityGovernance competitionId={competition.id}/>} \n",'')

    old=" const {competition,participants,committees,sealApprovals}=store; const canPublish=['draft','configured'].includes(competition.status);\n const publish=()=>store.publishCompetition();"
    new=""" const {competition,participants,committees,sealApprovals}=store; const canPublish=['draft','configured'].includes(competition.status);
 const [publishNote,setPublishNote]=useState(''); const [publishOk,setPublishOk]=useState(false);
 const publish=()=>{const out=store.publishCompetition();if(out.ok){setPublishOk(true);setPublishNote(ar?'تم فتح التسجيل بنجاح.':'Registration is now open.')}else{setPublishOk(false);const items=(out.issues||[]).filter(Boolean);setPublishNote(items.length?(ar?`تعذر فتح التسجيل: ${items.join(' · ')}`:`Could not open registration: ${items.join(' · ')}`):(ar?'تعذر فتح التسجيل. راجع متطلبات الجاهزية.':'Could not open registration. Review readiness requirements.'))}};"""
    s=must_replace(s,old,new,'publish feedback')
    s=s.replace('<Button disabled={readiness.length>0} onClick={publish} icon={<Activity className="w-4 h-4"/>}>','<Button onClick={publish} icon={<Activity className="w-4 h-4"/>}>',1)
    ov=s.find('const Overview=')
    sec_end=s.find('</section>',ov)
    if sec_end<0: raise RuntimeError('overview first section missing')
    sec_end+=len('</section>')
    note="{publishNote&&<div role=\"status\" className={`rounded-xl p-3 text-xs font-bold leading-6 ${publishOk?'bg-[#E7EEE9] text-[#214C40]':'bg-[#F5EDE2] text-[#7a5a2f]'}`}>{publishNote}</div>}"
    s=s[:sec_end]+note+s[sec_end:]

    identity=r'''const IdentitySection=({store,ar}:{store:Store;ar:boolean})=>{
 const c=store.competition; const [selected,setSelected]=useState(c.categories[0]?.id||''); const [adding,setAdding]=useState(false);
 const [draft,setDraft]=useState({nameArabic:'',name:'',riwaya:'',memorizationScope:'',juzCount:0,targetDurationMinutes:0,minAge:0,maxAge:0,genderConstraint:'all' as 'all'|'male'|'female'});
 const cat=c.categories.find(x=>x.id===selected); const patch=(p:Partial<Competition>)=>store.updateCompetitionDetails(p); const patchCat=(p:Partial<Category>)=>cat&&store.updateCategory(cat.id,p);
 useEffect(()=>{if(selected&&!c.categories.some(x=>x.id===selected))setSelected(c.categories[0]?.id||'')},[c.categories,selected]);
 const resetDraft=()=>setDraft({nameArabic:'',name:'',riwaya:'',memorizationScope:'',juzCount:0,targetDurationMinutes:0,minAge:0,maxAge:0,genderConstraint:'all'});
 const canSaveDraft=!!draft.nameArabic.trim()&&!!draft.name.trim()&&!!draft.riwaya.trim()&&!!draft.memorizationScope.trim()&&draft.juzCount>0&&draft.targetDurationMinutes>0;
 const saveDraft=()=>{if(!canSaveDraft)return;const x=store.addCategory({nameArabic:draft.nameArabic.trim(),name:draft.name.trim(),riwaya:draft.riwaya.trim(),memorizationScope:draft.memorizationScope.trim(),juzCount:draft.juzCount,targetDurationMinutes:draft.targetDurationMinutes,minAge:draft.minAge||undefined,maxAge:draft.maxAge||undefined,genderConstraint:draft.genderConstraint,targetParticipants:0,description:''});setAdding(false);resetDraft();setSelected(x.id)};
 const uploadLogo=(file?:File)=>{if(!file)return;if(!file.type.startsWith('image/'))return;const r=new FileReader();r.onload=()=>{const value=typeof r.result==='string'?r.result:'';if(value)patch({logoUrl:value})};r.readAsDataURL(file)};
 return <div className="space-y-7"><SectionTitle title={ar?'إعداد المسابقة':'Competition setup'} subtitle={ar?'افصل هوية المسابقة عن فئاتها: الهوية تصف المسابقة، والفئات تحدد النطاق والرواية والشروط.':'Competition identity describes the event; categories define scope, reading and conditions.'}/>
  <section className="space-y-4"><div><div className="text-sm font-black text-[#303733]">{ar?'هوية المسابقة':'Competition identity'}</div><div className="text-[11px] leading-5 text-[#656b66] mt-1">{ar?'الاسم والمكان والتاريخ والعلامة تخص هذه المسابقة نفسها.':'Name, venue, dates and branding belong to this competition.'}</div></div>
   <div className="grid lg:grid-cols-2 gap-4 [&>*]:min-w-0"><TextControl label={ar?'الاسم بالعربية':'Arabic name'} value={c.nameArabic} onChange={v=>patch({nameArabic:v})}/><TextControl label={ar?'الاسم بالإنجليزية':'English name'} value={c.name} onChange={v=>patch({name:v})}/><TextControl label={ar?'المنطقة الزمنية':'Timezone'} value={c.timezone} onChange={v=>patch({timezone:v})}/><TextControl label={ar?'المكان':'Venue'} value={c.venueName} onChange={v=>patch({venueName:v})}/><TextControl type="date" label={ar?'بداية المسابقة':'Start date'} value={c.startDate} onChange={v=>patch({startDate:v})}/><TextControl type="date" label={ar?'نهاية المسابقة':'End date'} value={c.endDate} onChange={v=>patch({endDate:v})}/><Control label={ar?'الأتمتة':'Automation'}><TinySelect value={c.automationLevel} onChange={v=>patch({automationLevel:v as any})}><option value="assisted">{automationLevelLabel('assisted',ar)}</option><option value="automated">{automationLevelLabel('automated',ar)}</option><option value="autopilot">{automationLevelLabel('autopilot',ar)}</option></TinySelect></Control><TextControl label={ar?'اسم العلامة لهذه المسابقة (يظهر بدل «ميزان»)':'Wordmark for this competition (replaces “MIZAN”)'} value={ar?(c.displayNameArabic||''):(c.displayName||'')} onChange={v=>patch(ar?{displayNameArabic:v||undefined}:{displayName:v||undefined})}/></div>
   <div className="rounded-2xl border border-[#dfddd6] p-4"><div className="text-xs font-black text-[#606662]">{ar?'شعار هذه المسابقة':'Competition logo'}</div><div className="mt-3 flex flex-wrap items-center gap-3">{c.logoUrl&&<img src={c.logoUrl} alt="" className="w-16 h-16 object-contain rounded-xl border border-[#e1dfd8] bg-white p-1"/>}<label className="min-h-11 px-4 rounded-xl border border-[#d9d7cf] bg-white text-xs font-black text-[#214C40] inline-flex items-center cursor-pointer">{c.logoUrl?(ar?'استبدال الشعار':'Replace logo'):(ar?'رفع الشعار':'Upload logo')}<input type="file" accept="image/*" className="sr-only" onChange={e=>{uploadLogo(e.target.files?.[0]);e.currentTarget.value=''}}/></label>{c.logoUrl&&<Button size="sm" variant="ghost" onClick={()=>patch({logoUrl:undefined})}>{ar?'حذف الشعار':'Remove logo'}</Button>}</div><div className="text-[10px] text-[#656b66] mt-2">{ar?'إذا لم ترفع شعارًا تستخدم المسابقة شعار الجهة تلقائيًا.':'Without a competition logo, the organization logo remains the fallback.'}</div></div>
  </section>
  <section className="space-y-4 border-t border-[#e5e3dc] pt-6"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black text-[#303733]">{ar?'فئات المسابقة':'Competition categories'}</div><div className="text-[11px] leading-5 text-[#656b66] mt-1">{ar?'كل فئة تحدد نطاق الحفظ والرواية والشروط الخاصة بها. لا تُنشأ أي فئة افتراضية.':'Each category defines its own memorization scope, reading and conditions. No category is created by default.'}</div></div><button type="button" onClick={()=>{setAdding(true);setSelected('');resetDraft()}} className="min-h-11 px-3 rounded-xl inline-flex items-center gap-1 text-xs font-black text-[#214C40] border border-[#d9d7cf] bg-white"><Plus className="w-3.5 h-3.5"/>{ar?'فئة جديدة':'New category'}</button></div>
   {c.categories.length>0&&<div className="flex gap-2 overflow-x-auto">{c.categories.map(x=><button key={x.id} onClick={()=>{setAdding(false);setSelected(x.id)}} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold border ${selected===x.id&&!adding?'bg-[#E7EEE9] text-[#214C40] border-[#b7ccc2]':'border-[#deddd6] bg-white text-[#626a65]'}`}>{ar?x.nameArabic:x.name}</button>)}</div>}
   {adding&&<div className="rounded-2xl border border-[#cfdcd5] bg-[#F7FAF8] p-4 sm:p-5 space-y-4"><div className="text-sm font-black">{ar?'إضافة فئة جديدة':'Add a new category'}</div><div className="grid lg:grid-cols-2 gap-3"><TextControl label={ar?'اسم الفئة بالعربية':'Arabic category name'} value={draft.nameArabic} onChange={v=>setDraft(d=>({...d,nameArabic:v}))}/><TextControl label={ar?'اسم الفئة بالإنجليزية':'English category name'} value={draft.name} onChange={v=>setDraft(d=>({...d,name:v}))}/><TextControl label={ar?'الرواية / القراءة':'Riwaya / Qira’a'} value={draft.riwaya} onChange={v=>setDraft(d=>({...d,riwaya:v}))}/><TextControl label={ar?'نطاق الحفظ':'Memorization scope'} value={draft.memorizationScope} onChange={v=>setDraft(d=>({...d,memorizationScope:v}))}/><NumberControl label={ar?'الأجزاء':'Juz'} value={draft.juzCount} onChange={v=>setDraft(d=>({...d,juzCount:Math.max(0,v)}))}/><NumberControl label={ar?'الزمن المستهدف بالدقائق':'Target minutes'} value={draft.targetDurationMinutes} onChange={v=>setDraft(d=>({...d,targetDurationMinutes:Math.max(0,v)}))}/><NumberControl label={ar?'العمر الأدنى':'Minimum age'} value={draft.minAge} onChange={v=>setDraft(d=>({...d,minAge:Math.max(0,v)}))}/><NumberControl label={ar?'العمر الأعلى':'Maximum age'} value={draft.maxAge} onChange={v=>setDraft(d=>({...d,maxAge:Math.max(0,v)}))}/><Control label={ar?'الجنس حسب الشروط':'Gender constraint'}><TinySelect value={draft.genderConstraint} onChange={v=>setDraft(d=>({...d,genderConstraint:v as 'all'|'male'|'female'}))}><option value="all">{ar?'الكل':'All'}</option><option value="male">{ar?'رجال':'Male'}</option><option value="female">{ar?'نساء':'Female'}</option></TinySelect></Control></div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={()=>{setAdding(false);resetDraft();setSelected(c.categories[0]?.id||'')}}>{ar?'إلغاء':'Cancel'}</Button><Button disabled={!canSaveDraft} onClick={saveDraft}>{ar?'حفظ الفئة':'Save category'}</Button></div></div>}
   {!adding&&cat&&<div className="rounded-2xl bg-[#f4f2ec] p-4 sm:p-5 space-y-4"><div className="grid lg:grid-cols-2 gap-3 [&>*]:min-w-0"><TextControl label={ar?'اسم الفئة عربي':'Arabic category'} value={cat.nameArabic} onChange={v=>patchCat({nameArabic:v})}/><TextControl label={ar?'اسم الفئة إنجليزي':'English category'} value={cat.name} onChange={v=>patchCat({name:v})}/><TextControl label={ar?'الرواية / القراءة':'Riwaya / Qira’a'} value={cat.riwaya} onChange={v=>patchCat({riwaya:v})}/><TextControl label={ar?'نطاق الحفظ':'Scope'} value={cat.memorizationScope} onChange={v=>patchCat({memorizationScope:v})}/><NumberControl label={ar?'الأجزاء':'Juz'} value={cat.juzCount} onChange={v=>patchCat({juzCount:v})}/><NumberControl label={ar?'عدد الأسئلة (هذه الفئة)':'Questions (this category)'} value={cat.questionsCount||0} onChange={v=>patchCat({questionsCount:v>0?v:undefined})}/><Control label={ar?'مقدار الموضع من الوجه':'Passage size on the page'}><TinySelect value={cat.pagePortion||''} onChange={v=>patchCat({pagePortion:(v||undefined) as any})}><option value="">{ar?'تلقائي':'Automatic'}</option><option value="full">{ar?'وجه كامل':'Full page'}</option><option value="half">{ar?'نصف وجه':'Half page'}</option><option value="third">{ar?'ثلث وجه':'Third of a page'}</option><option value="quarter">{ar?'ربع وجه':'Quarter page'}</option></TinySelect><span className="block text-[10px] leading-5 text-[#656b66] mt-2">{ar?'يظهر الوجه كاملًا للمتسابق دائمًا، والتظليل يقع على هذا المقدار وحده. تقديري لأن أطوال الآيات تتفاوت.':'The full page is always shown; the highlight covers only this portion. Approximate, since ayah lengths vary.'}</span></Control><NumberControl label={ar?'عدد الآيات لكل سؤال':'Ayat per question'} value={cat.ayatPerQuestion||0} onChange={v=>patchCat({ayatPerQuestion:v>0?v:undefined})}/><NumberControl label={ar?'زمن مستهدف بالدقائق':'Target minutes'} value={cat.targetDurationMinutes} onChange={v=>patchCat({targetDurationMinutes:v})}/><NumberControl label={ar?'العمر الأدنى':'Minimum age'} value={cat.minAge||0} onChange={v=>patchCat({minAge:v||undefined})}/><NumberControl label={ar?'العمر الأعلى':'Maximum age'} value={cat.maxAge||0} onChange={v=>patchCat({maxAge:v||undefined})}/><Control label={ar?'الجنس حسب الشروط':'Gender constraint'}><TinySelect value={cat.genderConstraint||'all'} onChange={v=>patchCat({genderConstraint:v as any})}><option value="all">{ar?'الكل':'All'}</option><option value="male">{ar?'رجال':'Male'}</option><option value="female">{ar?'نساء':'Female'}</option></TinySelect></Control><Control label={ar?'لائحة التحكيم':'Rule set'}><TinySelect value={cat.ruleSetId||c.ruleSet.id} onChange={v=>patchCat({ruleSetId:v})}>{(c.ruleSets||[c.ruleSet]).map(r=><option key={r.id} value={r.id}>{r.name} · {r.version}</option>)}</TinySelect></Control></div><div className="flex justify-end"><Button size="sm" variant="ghost" disabled={store.participants.some(p=>p.categoryId===cat.id)} onClick={()=>{if(store.removeCategory(cat.id))setSelected(c.categories.find(x=>x.id!==cat.id)?.id||'')}} icon={<Trash2 className="w-4 h-4"/>}>{ar?'حذف الفئة':'Remove category'}</Button></div></div>}
  </section>
  {c.categories.length>0&&<ShareRegistration c={c} ar={ar}/>} 
 </div>;
};

'''
    s=replace_block(s,'const IdentitySection=', '\nconst RegistrationSection=', identity, 'identity/categories')

    registration=r'''const RegistrationSection=({ar,policy,patch}:{ar:boolean;policy:CompetitionPolicy;patch:(fn:(p:CompetitionPolicy)=>void)=>void})=><div className="space-y-5"><SectionTitle title={ar?'التسجيل والشروط':'Registration & conditions'} subtitle={ar?'اعرض فقط ما يعمل فعليًا في رحلة تسجيل المتسابق.':'Only settings enforced by the participant registration flow are shown.'}/><div className="mizan-surface-soft px-4"><Toggle value={policy.registration.autoApproveEligible} onChange={v=>patch(p=>{p.registration.autoApproveEligible=v})} label={ar?'اعتماد تلقائي لمن يستوفي شروط الفئة':'Auto-approve category-eligible applications'}/><Toggle value={policy.registration.requireGuardianForMinors} onChange={v=>patch(p=>{p.registration.requireGuardianForMinors=v})} label={ar?'ولي أمر للقاصر':'Guardian for minors'}/></div><div><div className="text-xs font-black text-[#606662] mb-2">{ar?'حقول التسجيل':'Registration fields'}</div><div className="divide-y divide-[#e5e3dc] border-y border-[#e5e3dc]">{policy.registration.fields.map((f,i)=><RegistrationFieldRow key={f.id} f={f} ar={ar} onVisible={v=>patch(p=>{p.registration.fields[i].visible=v})} onRequired={v=>patch(p=>{p.registration.fields[i].required=v})}/>)}</div></div><div className="rounded-xl bg-[#F2EADC] text-[#725630] p-3 text-xs">{ar?'شروط الفئات مثل العمر والجنس والنطاق تُطبّق فوق حقول التسجيل، وأي حالة غير محسومة تذهب للمراجعة البشرية.':'Category conditions such as age, gender and scope apply on top of registration fields; unresolved cases go to human review.'}</div></div>;

'''
    s=replace_block(s,'const RegistrationSection=', '\nconst WorkflowSection=', registration, 'registration working controls')

    explain="<p className=\"text-[10px] leading-5 text-[#656b66] mb-2\">{ar?'«يبدأ السحب» أي سحب سؤال المتسابق: عند تفعيله يضغط المتسابق زر السحب أمام اللجنة، وإلا يبدأه النظام. البقية ضوابط لتوزيع الأسئلة.':'“Initiates draw” means drawing the participant’s question: when on, the participant presses draw before the panel; otherwise the system starts it. The rest govern question distribution.'}</p>"
    toggle="<Toggle value={policy.questions.participantInitiatedDraw} onChange={v=>patch(p=>{p.questions.participantInitiatedDraw=v})} label={ar?'المتسابق يبدأ سحب سؤاله':'Participant initiates the question draw'}/>"
    s=s.replace(explain,'').replace(toggle,'')
    s=s.replace('className="grid sm:grid-cols-2 gap-4"><Control label={ar?\'توزيع المهام\'','className="grid lg:grid-cols-2 gap-4 [&>*]:min-w-0"><Control label={ar?\'توزيع المهام\'',1)
    s=s.replace('className="p-3 grid md:grid-cols-[1fr_1fr_90px_80px_150px_auto] gap-2 items-center"','className="p-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_90px_80px_150px_auto] gap-2 items-center [&>*]:min-w-0"')
    s=s.replace('className="py-3 grid sm:grid-cols-[1fr_160px_85px_auto_auto] gap-2 items-center"','className="py-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_160px_85px_auto_auto] gap-2 items-center [&>*]:min-w-0"')

    old_select="<select value={c.status} onChange={e=>store.updateCommittee(c.id,{status:e.target.value as any})} className=\"text-[11px] bg-transparent outline-none text-[#636864]\"><option value=\"ready\">{uiToken('ready',ar)}</option><option value=\"testing\">{uiToken('testing',ar)}</option><option value=\"paused\">{uiToken('paused',ar)}</option><option value=\"offline\">{uiToken('offline',ar)}</option></select>"
    new_select="<label className=\"min-w-[150px]\"><span className=\"block text-[10px] font-black text-[#656b66] mb-1\">{ar?'حالة اللجنة':'Panel status'}</span><select aria-label={ar?'حالة اللجنة':'Panel status'} value={c.status} onChange={e=>store.updateCommittee(c.id,{status:e.target.value as any})} className=\"w-full rounded-xl border border-[#dcdad2] bg-white px-3 py-2.5 text-xs font-bold text-[#3d4641]\"><option value=\"ready\">{uiToken('ready',ar)}</option><option value=\"testing\">{uiToken('testing',ar)}</option><option value=\"paused\">{uiToken('paused',ar)}</option><option value=\"offline\">{uiToken('offline',ar)}</option></select></label>"
    s=must_replace(s,old_select,new_select,'committee status select')
    save(p,s)

def patch_registration_flow():
    p='src/components/public/RegistrationFlow.tsx'; s=load(p)
    s=s.replace('الفئة هي التي تحدد النطاق والرواية وشروط الأهلية.','الفئة هي التي تحدد النطاق والرواية والشروط.')
    save(p,s)

def patch_config():
    p='src/lib/competition-config.ts'; s=load(p)
    s=s.replace('participantInitiatedDraw: true','participantInitiatedDraw: false',1)
    save(p,s)

def patch_deployment():
    p='src/components/admin/DeploymentStudio.tsx'; s=load(p)
    s=must_replace(s,"useState<VenueInventory>({laptops:6,desktops:0,tablets:2,tvs:3,printers:1,usbScanners:0,edgeMiniPcs:0,wifi:true})","useState<VenueInventory>({laptops:0,desktops:0,tablets:0,tvs:0,printers:0,usbScanners:0,edgeMiniPcs:0,wifi:false})",'no fake venue inventory')
    save(p,s)

def patch_enterprise():
    p='src/components/admin/EnterpriseWorkspace.tsx'; s=load(p)
    international=r'''const International=({s,ar}:{s:ReturnType<typeof useAppStore>;ar:boolean})=>{
 const [pid,setPid]=useState(s.participants[0]?.id||''); const [flightNumber,setFlightNumber]=useState(''); const [arrivalAirport,setArrivalAirport]=useState('');
 const travel=s.travelRecords.find(r=>r.participantId===pid&&r.competitionId===s.competition.id); const participants=s.participants.filter(p=>p.competitionId===s.competition.id);
 useEffect(()=>{if(pid&&!participants.some(p=>p.id===pid))setPid(participants[0]?.id||'')},[participants.length,pid]);
 const schedule=()=>{if(!pid||!flightNumber.trim()||!arrivalAirport.trim())return;s.upsertTravelRecord(pid,{flightNumber:flightNumber.trim().toUpperCase(),arrivalAirport:arrivalAirport.trim().toUpperCase(),transportStatus:'scheduled'})};
 const downloadTemplate=()=>{const headers=['fullName','fullNameArabic','email','phone','country','nationality','identity','dateOfBirth','gender','categoryId','riwaya','institution'];const csv='\uFEFF'+headers.join(',')+'\n';const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='mizan-participants-excel-template.csv';a.click();URL.revokeObjectURL(a.href)};
 return <div className="grid xl:grid-cols-2 gap-4"><div className="mizan-surface p-5"><div className="flex items-center gap-2"><Plane className="w-4 h-4 text-[#2F6555]"/><h2 className="font-extrabold">{ar?'السفر والوفود':'Travel & delegations'}</h2></div>{participants.length?<><select value={pid} onChange={e=>setPid(e.target.value)} className="w-full mt-4 rounded-xl border border-[#ddd] px-3 py-2.5 text-sm"><option value="" disabled>{ar?'اختر المتسابق':'Choose participant'}</option>{participants.slice(0,50).map(p=><option key={p.id} value={p.id}>{p.code} · {ar?p.fullNameArabic:p.fullName}</option>)}</select><div className="grid sm:grid-cols-2 gap-2 mt-3"><input dir="ltr" value={flightNumber} onChange={e=>setFlightNumber(e.target.value)} className="mizan-input" placeholder={ar?'رقم الرحلة':'Flight number'}/><input dir="ltr" value={arrivalAirport} onChange={e=>setArrivalAirport(e.target.value)} className="mizan-input" placeholder={ar?'رمز مطار الوصول':'Arrival airport code'}/></div><div className="grid grid-cols-2 gap-2 mt-3"><Button size="sm" variant="outline" disabled={!pid||!flightNumber.trim()||!arrivalAirport.trim()} onClick={schedule}>{ar?'حفظ وجدولة الوصول':'Save arrival'}</Button><Button size="sm" variant="outline" disabled={!pid} onClick={()=>s.runRemoteCheck(pid)}>{ar?'فحص تأهل عن بعد':'Remote check'}</Button></div>{travel&&<div className="rounded-xl bg-[#f3f1eb] p-3 mt-3 text-xs font-semibold" dir="ltr">{travel.flightNumber||'—'} · {travel.arrivalAirport||'—'} · <span dir="rtl">{uiToken(travel.transportStatus,ar)}</span></div>}</>:<div className="py-8 text-center text-xs text-[#696f6b]">{ar?'لا يوجد متسابقون في هذه المسابقة بعد.':'No participants in this competition yet.'}</div>}</div><div className="mizan-surface p-5"><div className="flex items-center gap-2"><FileUp className="w-4 h-4 text-[#2F6555]"/><h2 className="font-extrabold">{ar?'الاستيراد':'Import'}</h2></div><p className="text-xs text-[#636965] mt-2">{ar?'حمّل نموذج Excel المتوافق، املأه ثم احفظه بصيغة CSV. ميزان يتحقق من كل الصفوف قبل إدخال أي سجل؛ وجود خطأ يمنع الاستيراد كله.':'Download the Excel-compatible template, fill it, then save as CSV. MIZAN validates every row before committing anything.'}</p><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={downloadTemplate} icon={<Download className="w-4 h-4"/>}>{ar?'تحميل نموذج Excel':'Download Excel template'}</Button><label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#214C40] text-white px-3 py-2.5 text-xs font-bold"><FileUp className="w-4 h-4"/>{ar?'اختيار CSV':'Choose CSV'}<input type="file" accept=".csv,text/csv" className="sr-only" onChange={async e=>{const f=e.target.files?.[0];if(f){await s.importParticipantsCsv(f.name,await f.text());e.currentTarget.value=''}}}/></label></div>{s.competition.categories.length>0&&<div className="mt-3 rounded-xl bg-[#f7f5ef] p-3 text-[10px] leading-5 text-[#656b66]"><div className="font-black text-[#454c48]">{ar?'رموز الفئات المقبولة في عمود categoryId':'Allowed categoryId values'}</div>{s.competition.categories.map(c=><div key={c.id} dir="ltr">{c.code} — <span dir={ar?'rtl':'ltr'}>{ar?c.nameArabic:c.name}</span></div>)}</div>}{s.importJobs[0]&&<div className="mt-4 grid grid-cols-3 gap-2"><Mini n={s.importJobs[0].totalRows} t={ar?'صف':'Rows'}/><Mini n={s.importJobs[0].validRows} t={ar?'صالح':'Valid'}/><Mini n={s.importJobs[0].invalidRows} t={ar?'مراجعة':'Review'}/></div>}{s.importJobs[0]?.errors?.length>0&&<div className="mt-3 rounded-xl bg-[#F4E6E3] text-[#89453d] p-3 text-[11px] font-semibold">{s.importJobs[0].errors.slice(0,8).map(e=><div key={`${e.row}-${e.message}`}>{ar?'صف':'Row'} {e.row}: {e.message}</div>)}</div>}</div></div>}
'''
    s=replace_block(s,'const International=', '\nconst Shadow=', international, 'international/travel/import')
    save(p,s)

def patch_store():
    p='src/lib/store.ts'; s=load(p)
    s=s.replace("import { applyTemplate as applyCompetitionTemplate, getCompetitionPolicy, getEnabledJudgeActions, getReadinessIssues } from './competition-config';","import { BASE_POLICY, applyTemplate as applyCompetitionTemplate, getCompetitionPolicy, getEnabledJudgeActions, getReadinessIssues } from './competition-config';")
    addcat=r'''  const addCategory = (input: Partial<Category> = {}) => {
    const id = newId('cat');
    const category: Category = {
      id, competitionId: globalState.competition.id, code: input.code || `CAT-${globalState.competition.categories.length+1}`,
      name: input.name?.trim() || '', nameArabic: input.nameArabic?.trim() || '', description: input.description || '', riwaya: input.riwaya?.trim() || '', memorizationScope: input.memorizationScope?.trim() || '', juzCount: Math.max(0,input.juzCount || 0),
      genderConstraint: input.genderConstraint || 'all', targetParticipants: Math.max(0,input.targetParticipants || 0), targetDurationMinutes: Math.max(0,input.targetDurationMinutes || 0), ruleSetId: input.ruleSetId || globalState.competition.ruleSet.id,
      minAge: input.minAge, maxAge: input.maxAge, questionsCount: input.questionsCount, ayatPerQuestion: input.ayatPerQuestion, pagePortion: input.pagePortion, readingContexts: input.readingContexts, questionBlueprintId: input.questionBlueprintId
    };
    globalState.competition = { ...globalState.competition, categories:[...globalState.competition.categories, category] };
    notify(); return category;
  };

'''
    s=replace_block(s,'  const addCategory = () => {','\n  const updateCategory',addcat,'addCategory explicit')

    create=r'''  const createCompetition = (nameArabic: string, nameEnglish: string) => {
    const rule: RuleSet = { ...JSON.parse(JSON.stringify(SEED_COMPETITION.ruleSet)), id:newId('rule'), version:'1.0.0', frozenAt:undefined };
    const policy: CompetitionPolicy = JSON.parse(JSON.stringify(BASE_POLICY)); policy.updatedAt=new Date().toISOString(); policy.questions.participantInitiatedDraw=false;
    const base: Competition = {
      id:newId('comp'), organizationId:globalState.organization.id, name:nameEnglish.trim(), nameArabic:nameArabic.trim(), displayName:undefined, displayNameArabic:undefined, logoUrl:undefined,
      edition:'', country:'', timezone:'', status:'draft', automationLevel:'assisted', startDate:'', endDate:'', registrationStartDate:'', registrationEndDate:'', categories:[], ruleSet:rule, ruleSets:[rule], venueName:'', venuesCount:1,
      totalRegistered:0,totalApproved:0,totalAttended:0,currentDay:0,totalDays:1,policy,
      readinessChecklist:{datesConfigured:false,categoriesConfigured:false,ruleSetFrozen:false,judgesAssigned:false,quranSourceLocked:false,devicesRegistered:false,certificatesReady:false}
    };
    globalState.competition=base; globalState.competitions=[base,...(globalState.competitions||[]).filter(c=>c.id!==base.id)];
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:base.organizationId,competitionId:base.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'COMPETITION_CREATED',entityType:'Competition',entityId:base.id,humanSummaryArabic:`إنشاء مسابقة جديدة: ${base.nameArabic}`,humanSummaryEnglish:`Created competition: ${base.name}`,currentStateHash:`competition:${base.id}`},...globalState.auditLogs];
    notify(); return base;
  };

'''
    s=replace_block(s,'  const createCompetition = (nameArabic: string, nameEnglish: string) => {','\n  const ',create,'clean createCompetition')
    s=s.replace("if(issues.length||blockers.length||(productionMode&&scientificBlockers.length)) return {ok:false,issues:[...issues,...blockers.map(x=>x.title),...scientificBlockers.map(x=>x.message)],scientificBlockers,contradictions};","if(issues.length||blockers.length) return {ok:false,issues:[...issues,...blockers.map(x=>x.title)],scientificBlockers,contradictions};",1)
    save(p,s)

def patch_role_portals():
    p='src/components/admin/RolePortals.tsx'; s=load(p)
    old="const [page,setPage]=useState<'competitions'|'organization'>('competitions'); const [creating,setCreating]=useState(false); const [name,setName]=useState(''); const [accessCompetitionId,setAccessCompetitionId]=useState('');\n const create=()=>{if(!name.trim())return;createCompetition(name,name);setCreating(false);setName('');};"
    new="const [page,setPage]=useState<'competitions'|'organization'>('competitions'); const [creating,setCreating]=useState(false); const [name,setName]=useState(''); const [accessCompetitionId,setAccessCompetitionId]=useState(''); const [createdId,setCreatedId]=useState('');\n const create=()=>{if(!name.trim())return;const created=createCompetition(name,name);setCreatedId(created.id);setCreating(false);setName('');};"
    s=must_replace(s,old,new,'competition created confirmation')
    marker="<h2 className=\"text-lg font-black mt-3 break-words\">{ar?c.nameArabic:c.name}</h2>"
    s=must_replace(s,marker,marker+"{createdId===c.id&&<div className=\"mt-2 text-[10px] font-black text-[#2F6555]\">{ar?'تم إنشاء المسابقة':'Competition created'}</div>}",'created state')
    save(p,s)

def patch_latin_digits():
    for path in list((ROOT/'src').rglob('*.ts'))+list((ROOT/'src').rglob('*.tsx')):
        s=path.read_text(encoding='utf-8'); old=s
        for loc in ['ar-KW','ar-SA','ar-EG','ar-AE','ar-QA','ar-BH','ar-OM']:
            s=re.sub(rf"{loc}(?!-u-nu-latn)",loc+'-u-nu-latn',s)
        # Generic Arabic locale used only for Intl/locale formatting calls.
        s=s.replace("toLocaleString('ar')","toLocaleString('ar-u-nu-latn')").replace('toLocaleString("ar")','toLocaleString("ar-u-nu-latn")')
        s=s.replace("toLocaleDateString('ar')","toLocaleDateString('ar-u-nu-latn')").replace('toLocaleDateString("ar")','toLocaleDateString("ar-u-nu-latn")')
        if s!=old: path.write_text(s,encoding='utf-8'); changed.append(str(path.relative_to(ROOT)))

def write_tests():
    p=ROOT/'tests/ui-notes-2026-09-08.test.ts'
    p.write_text(r'''import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=(p:string)=>fs.readFileSync(p,'utf8');
test('competition setup UI contains only explicit, non-misleading controls',()=>{const x=read('src/components/admin/CompetitionOverview.tsx');assert.ok(!x.includes("id:'access' as const"));assert.ok(!x.includes('المتسابق يبدأ سحب سؤاله'));assert.ok(!x.includes("value={policy.registration.accountMode}"));assert.ok(!x.includes("value={policy.registration.mode}"));assert.ok(x.includes('حفظ الفئة'));assert.ok(x.includes('رفع الشعار'));assert.ok(x.includes('حالة اللجنة'));assert.ok(x.includes('تعذر فتح التسجيل'));});
test('new competitions and categories start clean',()=>{const x=read('src/lib/store.ts');assert.ok(x.includes("timezone:'', status:'draft'"));assert.ok(x.includes('categories:[]'));assert.ok(!x.includes("name:'New category', nameArabic:'فئة جديدة'"));assert.ok(x.includes('input: Partial<Category> = {}'));});
test('question draw and registration wording match product policy',()=>{const cfg=read('src/lib/competition-config.ts');const reg=read('src/components/public/RegistrationFlow.tsx');assert.ok(cfg.includes('participantInitiatedDraw: false'));assert.ok(reg.includes('الفئة هي التي تحدد النطاق والرواية والشروط.'));});
test('enterprise surfaces do not fabricate travel or venue data',()=>{const e=read('src/components/admin/EnterpriseWorkspace.tsx');const d=read('src/components/admin/DeploymentStudio.tsx');assert.ok(!e.includes("flightNumber:'MZ 417'"));assert.ok(e.includes('تحميل نموذج Excel'));assert.ok(d.includes('laptops:0,desktops:0,tablets:0,tvs:0,printers:0'));});
test('activated accounts do not expose QR reissue and internal banner is gone',()=>{const x=read('src/components/admin/IdentityGovernance.tsx');assert.ok(x.includes("g.status==='ACTIVE'&&a.status!=='ACTIVE'"));assert.ok(!x.includes('العزل والتجميد والحذف تفرض من الخادم'));});
''',encoding='utf-8')
    changed.append(str(p.relative_to(ROOT)))

def main():
    patch_identity_governance();patch_competition_overview();patch_registration_flow();patch_config();patch_deployment();patch_enterprise();patch_store();patch_role_portals();patch_latin_digits();write_tests()
    print('changed files:')
    for x in sorted(set(changed)): print(' -',x)
main()
