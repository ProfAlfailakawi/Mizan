#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path.cwd()

def read(rel):
    p=ROOT/rel
    if not p.is_file(): raise RuntimeError(f"missing {rel}")
    return p.read_text(encoding="utf-8")

def write(rel,text):
    (ROOT/rel).write_text(text,encoding="utf-8")

def replace_once(text, old, new, rel, label):
    count=text.count(old)
    if count!=1:
        raise RuntimeError(f"{rel}: expected 1 anchor for {label}, got {count}")
    return text.replace(old,new,1)

def replace_block(text, start, end, new, rel, label):
    i=text.find(start)
    if i<0: raise RuntimeError(f"{rel}: start anchor missing for {label}")
    j=text.find(end,i+len(start))
    if j<0: raise RuntimeError(f"{rel}: end anchor missing for {label}")
    return text[:i]+new+text[j:]

# 1) First-time QR activation: new Firebase user chooses their own password.
rel='src/components/auth/AuthPortal.tsx'
old=read(rel)
if "createUserWithEmailAndPassword" not in old:
    if "signInWithEmailAndPassword, sendPasswordResetEmail" not in old:
        raise RuntimeError(f"{rel}: unexpected baseline")
    new=r"""import React, {useEffect, useState} from 'react';
import { createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail, signInWithEmailAndPassword, type User } from 'firebase/auth';
import { KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { activationTokenFromLocation } from '../../lib/useMizanAuth';
import { useAppStore } from '../../lib/store';
import { Button } from '../design-system/Button';
import { MizanLogo } from '../design-system/MizanLogo';

type InvitationPreview={email:string;displayName:string;requestedRole:string;organizationId:string;competitionId?:string;expiresAt:string};

export const AuthPortal:React.FC=()=>{
 const {language}=useAppStore();const ar=language==='ar';
 const activationToken=activationTokenFromLocation();
 const [preview,setPreview]=useState<InvitationPreview|null>(null); const [previewLoading,setPreviewLoading]=useState(Boolean(activationToken));
 const [existingMode,setExistingMode]=useState(false);
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [confirmPassword,setConfirmPassword]=useState('');
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');

 const AUTH_AR:Record<string,string>={
  'auth/invalid-credential':'بيانات الدخول غير صحيحة.',
  'auth/wrong-password':'كلمة المرور غير صحيحة.',
  'auth/user-not-found':'لا يوجد حساب بهذا البريد.',
  'auth/invalid-email':'صيغة البريد غير صحيحة.',
  'auth/missing-password':'اكتب كلمة المرور.',
  'auth/weak-password':'اختر كلمة مرور أقوى (8 أحرف على الأقل).',
  'auth/email-already-in-use':'هذا البريد لديه حساب بالفعل. اختر «لدي حساب» وسجّل الدخول بكلمة مروره الحالية.',
  'auth/user-disabled':'هذا الحساب موقوف. راجع إدارة الجهة.',
  'auth/too-many-requests':'محاولات كثيرة متتابعة، فأُوقف الدخول مؤقتًا. انتظر دقائق ثم أعد المحاولة.',
  'auth/network-request-failed':'تعذّر الاتصال بخدمة الهوية. راجع الشبكة ثم أعد المحاولة.',
  'auth/unauthorized-domain':'هذا النطاق غير مصرّح به في إعدادات الهوية.',
  'auth/operation-not-allowed':'الدخول بالبريد وكلمة المرور غير مفعّل في إعدادات الهوية.',
  'auth/api-key-not-valid':'مفتاح الواجهة مرفوض. راجع قيود المفتاح والنطاقات المسموح بها.',
  'auth/internal-error':'رفضت خدمة الهوية الطلب. راجع إعدادات خدمة الهوية.',
 };

 useEffect(()=>{
  if(!activationToken){setPreviewLoading(false);return;}
  let live=true;
  void fetch('/api/identity/invitation/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({activationToken})})
   .then(async r=>({ok:r.ok,body:await r.json().catch(()=>({}))}))
   .then(({ok,body})=>{if(!live)return;if(!ok){setMessage(ar?'رابط التفعيل غير صالح أو انتهت صلاحيته. اطلب QR جديدًا من مدير المسابقة.':'Activation link is invalid or expired. Ask the competition manager for a new QR.');return;}setPreview(body.invitation as InvitationPreview);setEmail(String(body.invitation?.email||''));})
   .catch(()=>{if(live)setMessage(ar?'تعذر التحقق من دعوة التفعيل. أعد المحاولة.':'Could not verify the activation invitation.');})
   .finally(()=>{if(live)setPreviewLoading(false)});
  return()=>{live=false};
 },[activationToken,ar]);

 const finishActivation=async(user:User)=>{
  if(!activationToken)return;
  const token=await user.getIdToken(true);
  const r=await fetch('/api/identity/activate',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({activationToken})});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(String(body.code||'ACTIVATION_FAILED'));
  if(window.location.hash.startsWith('#a='))history.replaceState(null,'',`${window.location.pathname}${window.location.search}`);
  window.location.reload();
 };

 const signIn=async()=>{
  setBusy(true);setMessage('');
  try{
   const cred=await signInWithEmailAndPassword(auth,email,password);
   if(activationToken)await finishActivation(cred.user);
  }catch(e:unknown){
   const code=String((e as {code?:string;message?:string})?.code||'');
   const raw=String((e as Error)?.message||'');
   setMessage(ar?(AUTH_AR[code]||(raw.includes('ACTIVATION_')?`تعذر تفعيل الدعوة (${raw.split(':').pop()}).`:`تعذّر تسجيل الدخول (${code||'سبب غير معروف'}).`)):(code||raw||'Sign-in failed'));
  }finally{setBusy(false)}
 };

 const createInvitedAccount=async()=>{
  if(!preview)return;
  if(password.length<8){setMessage(ar?'اختر كلمة مرور من 8 أحرف على الأقل.':'Use at least 8 characters.');return;}
  if(password!==confirmPassword){setMessage(ar?'كلمتا المرور غير متطابقتين.':'Passwords do not match.');return;}
  setBusy(true);setMessage('');let created:User|null=null;
  try{
   const cred=await createUserWithEmailAndPassword(auth,preview.email,password);created=cred.user;
   await finishActivation(cred.user);
  }catch(e:unknown){
   const code=String((e as {code?:string;message?:string})?.code||'');
   const raw=String((e as Error)?.message||'');
   if(created){try{await deleteUser(created)}catch{}}
   if(code==='auth/email-already-in-use')setExistingMode(true);
   setMessage(ar?(AUTH_AR[code]||(raw.includes('ACTIVATION_')?`تعذر تفعيل الدعوة (${raw.split(':').pop()}).`:`تعذر إنشاء الحساب (${code||'سبب غير معروف'}).`)):(code||raw||'Could not create account'));
  }finally{setBusy(false)}
 };

 const reset=async()=>{if(!email)return setMessage(ar?'أدخل البريد الإلكتروني أولًا':'Enter your email first');setBusy(true);try{await sendPasswordResetEmail(auth,email);setMessage(ar?'تم إرسال رابط استعادة كلمة المرور':'Reset link sent');}catch{setMessage(ar?'تعذر إرسال رابط الاستعادة':'Could not send reset link');}finally{setBusy(false}};

 const activating=Boolean(activationToken&&preview);
 const title=activating?(ar?'فعّل حسابك':'Activate your account'):(ar?'تسجيل الدخول':'Sign in');
 const subtitle=activating
  ?(ar?'هذه الدعوة مرتبطة بهذا البريد وبهذه المسابقة فقط. أنت تختار كلمة مرورك؛ مدير المسابقة لا يراها ولا ينشئها.':'This invitation is bound to this email and competition only. You choose your password; the manager never sees it.')
  :(ar?'تُطبّق هوية المستخدم وصلاحيات المؤسسة قبل السماح بأي إجراء تشغيلي.':'Identity and tenant permissions are enforced before operational access.');

 return <div className="min-h-screen bg-[#F8F5ED] grid place-items-center p-5" dir={ar?'rtl':'ltr'}><div className="w-full max-w-md">
  <div className="text-center"><div className="flex justify-center"><MizanLogo language={language}/></div><div className="mizan-kicker mt-7">{activating?(ar?'دعوة مسابقة':'COMPETITION INVITATION'):(ar?'وصول محمي':'Secure access')}</div><h1 className="text-3xl font-black mt-2 text-[#17352D]">{title}</h1><p className="text-xs text-[#636864] mt-2 leading-6">{subtitle}</p></div>
  <div className="mizan-surface p-6 mt-7">
   {previewLoading?<div className="py-8 text-center text-xs font-bold text-[#636864]">{ar?'جارٍ قراءة الدعوة…':'Reading invitation…'}</div>:<>
    <label className="block"><span className="text-[10px] font-black text-[#646965]">{ar?'البريد الإلكتروني':'Email'}</span><div className="relative mt-2"><Mail className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input autoComplete="email" value={email} readOnly={activating} onChange={e=>setEmail(e.target.value)} className={`w-full rounded-xl border border-[#ddd] ps-10 pe-3 py-3 text-sm ${activating?'bg-[#f5f4ef] text-[#4f5551]':''}`}/></div></label>
    {activating&&<div className="mt-3 rounded-xl bg-[#E7EEE9] px-3 py-2.5 text-[10px] font-bold text-[#214C40]"><KeyRound className="inline w-3.5 h-3.5 me-1.5"/>{ar?`الدعوة باسم ${preview?.displayName||''} · الصلاحية تخص هذه المسابقة فقط`:`Invitation for ${preview?.displayName||''} · access is limited to this competition`}</div>}
    <label className="block mt-4"><span className="text-[10px] font-black text-[#646965]">{activating&&!existingMode?(ar?'اختر كلمة المرور':'Choose password'):(ar?'كلمة المرور':'Password')}</span><div className="relative mt-2"><LockKeyhole className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input type="password" autoComplete={activating&&!existingMode?'new-password':'current-password'} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&(activating&&!existingMode?createInvitedAccount():signIn())} className="w-full rounded-xl border border-[#ddd] ps-10 pe-3 py-3 text-sm"/></div></label>
    {activating&&!existingMode&&<label className="block mt-4"><span className="text-[10px] font-black text-[#646965]">{ar?'تأكيد كلمة المرور':'Confirm password'}</span><div className="relative mt-2"><LockKeyhole className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&createInvitedAccount()} className="w-full rounded-xl border border-[#ddd] ps-10 pe-3 py-3 text-sm"/></div></label>}
    {message&&<div className="mt-4 rounded-xl bg-[#f3f1eb] px-3 py-2.5 text-xs font-semibold break-words">{message}</div>}
    <Button className="w-full mt-5" disabled={busy||!email||!password||(activating&&!existingMode&&!confirmPassword)} onClick={()=>void(activating&&!existingMode?createInvitedAccount():signIn())} icon={<ShieldCheck className="w-4 h-4"/>}>{busy?'…':activating&&!existingMode?(ar?'إنشاء حسابي وتفعيله':'Create & activate my account'):(ar?'دخول آمن':'Sign in')}</Button>
    {activating&&<button onClick={()=>{setExistingMode(v=>!v);setPassword('');setConfirmPassword('');setMessage('')}} className="w-full min-h-11 mt-3 text-xs font-bold text-[#45675b]">{existingMode?(ar?'هذا أول حساب لي — اختر كلمة مرور جديدة':'This is my first account — choose a new password'):(ar?'لدي حساب بهذا البريد':'I already have an account with this email')}</button>}
    {(!activating||existingMode)&&<button onClick={reset} className="w-full min-h-11 mt-2 text-xs font-bold text-[#45675b]">{ar?'نسيت كلمة المرور؟':'Forgot password?'}</button>}
   </>}
  </div>
  <p className="text-[10px] text-[#686d6a] text-center mt-5 leading-5">{ar?'مدير المسابقة يمنح الصلاحية فقط. كلمة المرور ملك المستخدم ولا تُحفظ في ميزان.':'The competition manager grants access only. Passwords belong to the user and are not stored by MIZAN.'}</p>
 </div></div>
}
"""
    write(rel,new)

# 2) Organization home opens a competition workspace without changing the authenticated org_admin role.
rel='src/components/admin/RolePortals.tsx'
t=read(rel)
t=replace_once(t,
" const store=useAppStore(); const {language,competition,competitions,organization,updateOrganizationBrand,switchRole,selectCompetition,createCompetition}=store; const ar=isAr(language); const [creating,setCreating]=useState(false); const [name,setName]=useState('');",
" const store=useAppStore(); const {language,competition,competitions,organization,updateOrganizationBrand,selectCompetition,createCompetition}=store; const ar=isAr(language); const [creating,setCreating]=useState(false); const [name,setName]=useState('');",
rel,'org home no role switching')
t=replace_once(t,
" const create=()=>{ if(!name.trim())return; createCompetition(name,name); setCreating(false);setName(''); switchRole('comp_admin'); };",
" const create=()=>{ if(!name.trim())return; createCompetition(name,name); setCreating(false);setName(''); window.location.hash='#manage-competition'; };",
rel,'new competition enter workspace')
t=replace_once(t,
"  <IdentityGovernance/>\n  <div className=\"space-y-2\">{competitions.map(c=><button key={c.id} onClick={()=>{selectCompetition(c.id);switchRole('comp_admin')}}",
"  <div className=\"space-y-2\">{competitions.map(c=><button key={c.id} onClick={()=>{selectCompetition(c.id);window.location.hash='#manage-competition'}}",
rel,'move identity inside competitions')
write(rel,t)

# 3) Competition workspace: explicit back button + identity/access tab scoped to current competition.
rel='src/components/admin/CompetitionOverview.tsx'
t=read(rel)
t=replace_once(t,
"  Search, Settings2, ShieldCheck, Sparkles, Trash2, UsersRound\n",
"  ArrowRight, Search, Settings2, ShieldCheck, Sparkles, Trash2, UsersRound\n",
rel,'back icon')
t=replace_once(t,
"import { EnterpriseWorkspace } from './EnterpriseWorkspace';",
"import { EnterpriseWorkspace } from './EnterpriseWorkspace';\nimport { IdentityGovernance } from './IdentityGovernance';",
rel,'identity import')
t=replace_once(t,
"type MainView='overview'|'design'|'participants'|'operations'|'results'|'enterprise';",
"type MainView='overview'|'design'|'participants'|'operations'|'results'|'access'|'enterprise';",
rel,'access view type')
t=replace_once(t,
" const nav=[{id:'overview' as const,icon:LayoutDashboard,ar:'اليوم',en:'Overview'},{id:'design' as const,icon:Settings2,ar:'DNA المسابقة',en:'Competition DNA'},{id:'participants' as const,icon:UsersRound,ar:'المشاركون',en:'Participants'},{id:'operations' as const,icon:RadioTower,ar:'التشغيل',en:'Operations'},{id:'results' as const,icon:Award,ar:'النتائج',en:'Results'},{id:'enterprise' as const,icon:ShieldCheck,ar:'المؤسسة',en:'Enterprise'}];",
" const orgManager=store.currentUser.role==='org_admin'; const leaveCompetition=()=>{window.location.hash='';};\n const nav=[{id:'overview' as const,icon:LayoutDashboard,ar:'اليوم',en:'Overview'},{id:'design' as const,icon:Settings2,ar:'DNA المسابقة',en:'Competition DNA'},{id:'participants' as const,icon:UsersRound,ar:'المشاركون',en:'Participants'},{id:'operations' as const,icon:RadioTower,ar:'التشغيل',en:'Operations'},{id:'results' as const,icon:Award,ar:'النتائج',en:'Results'},{id:'access' as const,icon:ShieldCheck,ar:'الهوية والصلاحيات',en:'Identity & access'},{id:'enterprise' as const,icon:ShieldCheck,ar:'المؤسسة',en:'Enterprise'}];",
rel,'competition nav access')
t=replace_once(t,
"  <main className=\"min-w-0 flex-1\">\n   <div className=\"lg:hidden flex gap-1 overflow-x-auto pb-4 mb-4 border-b border-[#dfded7]\">",
"  <main className=\"min-w-0 flex-1\">\n   {orgManager&&<div className=\"mb-4\"><Button size=\"sm\" variant=\"ghost\" onClick={leaveCompetition} icon={<ArrowRight className=\"w-4 h-4\"/>}>{ar?'العودة إلى إعدادات الجهة':'Back to organization settings'}</Button></div>}\n   <div className=\"lg:hidden flex gap-1 overflow-x-auto pb-4 mb-4 border-b border-[#dfded7]\">",
rel,'back to org settings')
t=replace_once(t,
"   {view==='results'&&<ResultsView store={store} ar={ar}/>} \n   {view==='enterprise'&&<EnterpriseWorkspace/>}",
"   {view==='results'&&<ResultsView store={store} ar={ar}/>} \n   {view==='access'&&<IdentityGovernance competitionId={competition.id}/>} \n   {view==='enterprise'&&<EnterpriseWorkspace/>}",
rel,'access render')
write(rel,t)

# 4) App route keeps org_admin identity while opening the selected competition workspace.
rel='src/App.tsx'
t=read(rel)
t=replace_once(t,
"  switch(currentUser.role){\n   case 'super_admin': return <SuperAdminConsole/>;\n   case 'org_admin': return <OrganizationHome/>;",
"  switch(currentUser.role){\n   case 'super_admin': return <SuperAdminConsole/>;\n   case 'org_admin': return hash.startsWith('#manage-competition')?<CompetitionOverview/>:<OrganizationHome/>;",
rel,'org manager competition route')
write(rel,t)

# 5) Identity UI is competition-scoped for tenant managers.
rel='src/components/admin/IdentityGovernance.tsx'
t=read(rel)
t=replace_once(t,
"export const IdentityGovernance:React.FC=()=>{\n const s=useAppStore();const ar=s.language==='ar';const production=import.meta.env.VITE_REQUIRE_AUTH==='true';",
"export const IdentityGovernance:React.FC<{competitionId?:string}>=({competitionId})=>{\n const s=useAppStore();const ar=s.language==='ar';const production=import.meta.env.VITE_REQUIRE_AUTH==='true'; const competitionScoped=Boolean(competitionId);",
rel,'identity component scope prop')
t=replace_once(t,
" const loadRemote=async()=>{if(!production)return;setLoading(true);try{const target=s.currentUser.role==='super_admin'?`?organizationId=${encodeURIComponent(s.organization.id)}`:'';const r=await api(`/api/identity/governance${target}`);",
" const loadRemote=async()=>{if(!production)return;setLoading(true);try{const params=new URLSearchParams();if(s.currentUser.role==='super_admin')params.set('organizationId',s.organization.id);if(competitionId)params.set('competitionId',competitionId);const target=params.size?`?${params.toString()}`:'';const r=await api(`/api/identity/governance${target}`);",
rel,'remote competition query')
old_dev=""" const devAccounts=useMemo(()=>s.identityAccounts.filter(a=>a.organizationId===s.organization.id&&!s.roleGrants.some(g=>g.accountId===a.id&&g.role==='super_admin'&&g.status==='ACTIVE')),[s.identityAccounts,s.roleGrants,s.organization.id]);
 const accounts=production?(remote?.accounts||[]):devAccounts;
 const invitations=production?(remote?.invitations||[]):s.identityInvitations.filter(i=>i.organizationId===s.organization.id&&i.requestedRole!=='scientific_admin');
 const grants=production?(remote?.grants||[]):s.roleGrants.filter(g=>g.organizationId===s.organization.id&&g.role!=='scientific_admin');
 const sessions=production?(remote?.sessions||[]):s.authSessions.filter(x=>x.organizationId===s.organization.id);"""
new_dev=""" const devGrants=useMemo(()=>s.roleGrants.filter(g=>g.organizationId===s.organization.id&&g.role!=='scientific_admin'&&(!competitionId||g.competitionId===competitionId)),[s.roleGrants,s.organization.id,competitionId]);
 const devAccountIds=useMemo(()=>new Set(devGrants.map(g=>g.accountId)),[devGrants]);
 const devAccounts=useMemo(()=>s.identityAccounts.filter(a=>a.organizationId===s.organization.id&&devAccountIds.has(a.id)&&!s.roleGrants.some(g=>g.accountId===a.id&&g.role==='super_admin'&&g.status==='ACTIVE')),[s.identityAccounts,s.roleGrants,s.organization.id,devAccountIds]);
 const accounts=production?(remote?.accounts||[]):devAccounts;
 const invitations=production?(remote?.invitations||[]):s.identityInvitations.filter(i=>i.organizationId===s.organization.id&&i.requestedRole!=='scientific_admin'&&(!competitionId||i.competitionId===competitionId));
 const grants=production?(remote?.grants||[]):devGrants;
 const sessions=production?(remote?.sessions||[]):s.authSessions.filter(x=>x.organizationId===s.organization.id&&(!competitionId||(x as any).competitionId===competitionId));"""
t=replace_once(t,old_dev,new_dev,rel,'dev competition scope')
old_create="if(production){try{const r=await api('/api/identity/invitations',{method:'POST',body:JSON.stringify({email,displayName:name,requestedRole:role,organizationId:s.currentUser.role==='super_admin'?s.organization.id:undefined,competitionId:role==='org_admin'?undefined:s.competition.id,reason:'Authorized tenant role provisioning'})});"
new_create="if(production){try{if(s.currentUser.role!=='super_admin'&&!competitionId){setMessage('COMPETITION_SCOPE_REQUIRED');return;}const r=await api('/api/identity/invitations',{method:'POST',body:JSON.stringify({email,displayName:name,requestedRole:role,organizationId:s.currentUser.role==='super_admin'?s.organization.id:undefined,competitionId:s.currentUser.role==='super_admin'?undefined:competitionId,reason:'Authorized competition role provisioning'})});"
t=replace_once(t,old_create,new_create,rel,'production competition grant')
t=replace_once(t,
"const r=await s.createIdentityInvitation({email,displayName:name,requestedRole:role,competitionId:s.competition.id,reason:'Authorized tenant role provisioning'});",
"if(!competitionId){setMessage('COMPETITION_SCOPE_REQUIRED');return;}const r=await s.createIdentityInvitation({email,displayName:name,requestedRole:role,competitionId,reason:'Authorized competition role provisioning'});",
rel,'dev competition grant')
old_actions=""" const suspend=async(account:any)=>{const reason=ar?'تعليق إداري لحساب داخل الجهة':'Administrative tenant account suspension';if(production){const r=await api(`/api/identity/accounts/${encodeURIComponent(account.id)}/suspend`,{method:'POST',body:JSON.stringify({reason})});const body=await r.json().catch(()=>({}));setMessage(r.ok?(ar?'تم تعليق الحساب وإغلاق جلساته النشطة.':'Account suspended and active sessions revoked.'):String(body.code||'SUSPEND_FAILED'));await loadRemote();return}s.suspendIdentityAccount(account.id,reason)};
 const revokeSessions=async(account:any)=>{if(!production)return;const r=await api(`/api/identity/accounts/${encodeURIComponent(account.id)}/revoke-sessions`,{method:'POST',body:JSON.stringify({reason:ar?'تسليم آمن لجهاز بديل':'Secure handover to a replacement device'})});const body=await r.json().catch(()=>({}));setMessage(r.ok?(ar?`أُغلقت ${body.count||0} جلسة. يمكن تسجيل الدخول من الجهاز البديل الآن.`:`${body.count||0} session(s) revoked; replacement device may sign in.`):String(body.code||'SESSION_REVOKE_FAILED'));await loadRemote()};
 const remove=async()=>{if(!deleteTarget||!production)return;setDeleting(true);try{const r=await api(`/api/identity/accounts/${encodeURIComponent(deleteTarget.id)}`,{method:'DELETE',body:JSON.stringify({reason:'User removed by authorized tenant administrator'})});const body=await r.json().catch(()=>({}));if(!r.ok){setMessage(String(body.code||'REMOVE_FAILED'));return;}setMessage(ar?'تم حذف وصول المستخدم من الجهة مع حفظ الأثر التدقيقي.':'User access removed while preserving the audit trail.');setDeleteTarget(null);await loadRemote()}finally{setDeleting(false)}};"""
new_actions=""" const grantFor=(account:any)=>grants.find((g:any)=>g.accountId===account.id&&['ACTIVE','SUSPENDED'].includes(g.status));
 const suspend=async(account:any)=>{const reason=ar?'تعليق صلاحية المستخدم في هذه المسابقة':'Competition access suspended by authorized manager';if(production){const grant=grantFor(account);if(competitionScoped&&grant){const r=await api(`/api/identity/grants/${encodeURIComponent(grant.id)}/suspend`,{method:'POST',body:JSON.stringify({reason})});const body=await r.json().catch(()=>({}));setMessage(r.ok?(ar?'تم تعليق الصلاحية في هذه المسابقة فقط.':'Access suspended for this competition only.'):String(body.code||'SUSPEND_FAILED'));await loadRemote();return;}const r=await api(`/api/identity/accounts/${encodeURIComponent(account.id)}/suspend`,{method:'POST',body:JSON.stringify({reason})});const body=await r.json().catch(()=>({}));setMessage(r.ok?(ar?'تم تعليق الحساب.':'Account suspended.'):String(body.code||'SUSPEND_FAILED'));await loadRemote();return}s.suspendIdentityAccount(account.id,reason)};
 const revokeSessions=async(account:any)=>{if(!production)return;const grant=grantFor(account);const path=competitionScoped&&grant?`/api/identity/grants/${encodeURIComponent(grant.id)}/revoke-sessions`:`/api/identity/accounts/${encodeURIComponent(account.id)}/revoke-sessions`;const r=await api(path,{method:'POST',body:JSON.stringify({reason:ar?'تسليم آمن لجهاز بديل':'Secure handover to a replacement device'})});const body=await r.json().catch(()=>({}));setMessage(r.ok?(ar?`أُغلقت ${body.count||0} جلسة تخص هذا النطاق.`:`${body.count||0} scoped session(s) revoked.`):String(body.code||'SESSION_REVOKE_FAILED'));await loadRemote()};
 const remove=async()=>{if(!deleteTarget||!production)return;setDeleting(true);try{const grant=grantFor(deleteTarget);const path=competitionScoped&&grant?`/api/identity/grants/${encodeURIComponent(grant.id)}`:`/api/identity/accounts/${encodeURIComponent(deleteTarget.id)}`;const r=await api(path,{method:'DELETE',body:JSON.stringify({reason:competitionScoped?'Competition access removed by authorized manager':'User removed by authorized tenant administrator'})});const body=await r.json().catch(()=>({}));if(!r.ok){setMessage(String(body.code||'REMOVE_FAILED'));return;}setMessage(competitionScoped?(ar?'أُلغيت صلاحية المستخدم في هذه المسابقة فقط، وبقيت صلاحياته الأخرى كما هي.':'User access to this competition was removed; other competition access is unchanged.'):(ar?'تم حذف وصول المستخدم من الجهة مع حفظ الأثر التدقيقي.':'User access removed while preserving the audit trail.'));setDeleteTarget(null);await loadRemote()}finally{setDeleting(false)}};"""
t=replace_once(t,old_actions,new_actions,rel,'grant scoped actions')
old_header="<h2 className=\"text-xl font-black mt-1\">{ar?'كل شخص بحسابه. مدير الجهة يدير فريقه.':'Named accounts. Delegated tenant authority.'}</h2><p className=\"text-xs leading-6 text-[#636864] mt-2 max-w-2xl\">{ar?'اعتماد مالك ميزان لمدير الجهة هو التفويض. بعدها ينشئ مدير الجهة أو مدير المسابقة الأدوار المسموحة له مباشرة؛ أما القرارات الحرجة داخل المسابقة فتبقى خاضعة لفصل الصلاحيات حيث تقرره اللائحة.':'The platform owner delegates authority once. Tenant managers then provision allowed staff directly; high-risk competition decisions keep their independent approval rules.'}</p>"
new_header="<h2 className=\"text-xl font-black mt-1\">{competitionScoped?(ar?'فريق هذه المسابقة فقط':'This competition team only'):(ar?'كل شخص بحسابه. مدير الجهة يدير فريقه.':'Named accounts. Delegated tenant authority.')}</h2><p className=\"text-xs leading-6 text-[#636864] mt-2 max-w-2xl\">{competitionScoped?(ar?'أي محكم أو مدير أو موظف تضيفه هنا تُربط صلاحيته بهذه المسابقة وحدها، ولا تنتقل تلقائيًا إلى أي مسابقة أخرى للجهة.':'Every role created here is bound to this competition only and never carries over to another competition.'):(ar?'اعتماد مالك ميزان لمدير الجهة هو التفويض. بعدها يدير مدير الجهة فريق مسابقاته من داخل كل مسابقة.':'The platform owner delegates the tenant administrator once; competition teams are then managed inside each competition.')}</p>"
t=replace_once(t,old_header,new_header,rel,'competition scoped header')
t=replace_once(t,
"{ar?'مستخدمو هذه الجهة فقط':'THIS TENANT ONLY'}",
"{competitionScoped?(ar?'مستخدمو هذه المسابقة فقط':'THIS COMPETITION ONLY'):(ar?'مستخدمو هذه الجهة فقط':'THIS TENANT ONLY')}",
rel,'scoped list label')
t=replace_once(t,
"title={ar?'حذف المستخدم من الجهة':'Remove user from tenant'}",
"title={competitionScoped?(ar?'إلغاء الصلاحية من هذه المسابقة':'Remove competition access'):(ar?'حذف المستخدم من الجهة':'Remove user from tenant')}",
rel,'delete modal title')
t=replace_once(t,
"{ar?'سيُلغى وصول هذا المستخدم وصلاحياته وجلساته فورًا، مع بقاء الأثر التدقيقي والسجل التاريخي. لا يستطيع مدير الجهة حذف مالك المنصة أو مستخدم من جهة أخرى.':'This revokes access, grants and active sessions immediately while preserving audit/history. Tenant admins cannot remove the platform owner or another tenant’s user.'}",
"{competitionScoped?(ar?'ستُلغى صلاحية هذا المستخدم في هذه المسابقة فقط. لن تتأثر أي صلاحية أخرى له في مسابقات الجهة.':'Only this competition grant will be revoked. Access to other competitions remains unchanged.'):(ar?'سيُلغى وصول هذا المستخدم وصلاحياته وجلساته فورًا، مع بقاء الأثر التدقيقي والسجل التاريخي.':'This revokes tenant access while preserving audit/history.')}",
rel,'delete modal text')
write(rel,t)

# 6) Server repository: invitation preview + mandatory competition scope + multi-competition grants.
rel='server/identity-governance.ts'
t=read(rel)

# Improve account visibility for identities that have grants in more than one competition.
t=replace_once(t,
"  private activeGrantFor(s:State,accountId:string){return s.grants.find(g=>g.accountId===accountId&&g.status==='ACTIVE'&&!RETIRED_ROLES.has(g.role))}",
"  private activeGrantFor(s:State,accountId:string,competitionId?:string){return s.grants.find(g=>g.accountId===accountId&&g.status==='ACTIVE'&&!RETIRED_ROLES.has(g.role)&&(!competitionId||g.competitionId===competitionId))}",
rel,'active grant competition scope')
old_visible="""  private accountVisibleTo(actor:ServerIdentity,s:State,a:Account,requestedOrganizationId?:string){
    const scope=actor.role==='super_admin'&&requestedOrganizationId?requestedOrganizationId:actor.organizationId;
    if(a.organizationId!==scope)return false;
    if(actor.role!=='super_admin'&&this.isSuperAdminAccount(s,a.id))return false;
    const grant=this.activeGrantFor(s,a.id);
    if(!grant)return false;
    if(actor.role==='comp_admin'&&actor.competitionId&&grant.competitionId&&grant.competitionId!==actor.competitionId)return false;
    return true;
  }"""
new_visible="""  private accountVisibleTo(actor:ServerIdentity,s:State,a:Account,requestedOrganizationId?:string,requestedCompetitionId?:string){
    const scope=actor.role==='super_admin'&&requestedOrganizationId?requestedOrganizationId:actor.organizationId;
    if(a.organizationId!==scope)return false;
    if(actor.role!=='super_admin'&&this.isSuperAdminAccount(s,a.id))return false;
    const competitionScope=actor.role==='comp_admin'&&actor.competitionId?actor.competitionId:requestedCompetitionId;
    const grant=this.activeGrantFor(s,a.id,competitionScope);
    if(!grant)return false;
    return true;
  }"""
t=replace_once(t,old_visible,new_visible,rel,'account visibility competition scope')

t=replace_once(t,
"type AuthSession={id:string;uid:string;accountId:string;organizationId:string;role:GovernanceRole;",
"type AuthSession={id:string;uid:string;accountId:string;organizationId:string;competitionId?:string;role:GovernanceRole;",
rel,'session competition id')

# replace list method
start="  list(actor:ServerIdentity,requestedOrganizationId?:string){"
end="  createInvitation(actor:ServerIdentity,input:"
i=t.find(start); j=t.find(end,i)
if i<0 or j<0: raise RuntimeError(f"{rel}: list/create markers missing")
new_list="""  list(actor:ServerIdentity,requestedOrganizationId?:string,requestedCompetitionId?:string){
    const s=this.read();this.cleanup(s);this.write(s);
    const scope=actor.role==='super_admin'&&requestedOrganizationId?requestedOrganizationId:actor.organizationId;
    const competitionScope=actor.role==='comp_admin'&&actor.competitionId?actor.competitionId:requestedCompetitionId;
    if(actor.role==='comp_admin'&&requestedCompetitionId&&actor.competitionId&&requestedCompetitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    const scopedGrants=s.grants.filter(g=>g.organizationId===scope&&!RETIRED_ROLES.has(g.role)&&(!competitionScope||g.competitionId===competitionScope));
    const ids=new Set(scopedGrants.map(g=>g.accountId));
    const accounts=s.accounts.filter(a=>ids.has(a.id)&&this.accountVisibleTo(actor,s,a,scope,competitionScope));
    const visibleIds=new Set(accounts.map(a=>a.id));
    return {
      accounts,
      grants:scopedGrants.filter(g=>visibleIds.has(g.accountId)),
      invitations:s.invitations.filter(inv=>inv.organizationId===scope&&!RETIRED_ROLES.has(inv.requestedRole)&&(!competitionScope||inv.competitionId===competitionScope)&&(actor.role!=='comp_admin'||!actor.competitionId||!inv.competitionId||inv.competitionId===actor.competitionId)).map(inv=>({...inv,activationTokenHash:undefined})),
      sessions:s.sessions.filter(x=>visibleIds.has(x.accountId)&&x.status==='ACTIVE'&&(!competitionScope||x.competitionId===competitionScope)),
    };
  }

"""
t=t[:i]+new_list+t[j:]

# replace createInvitation method through compatibility comment
start="  createInvitation(actor:ServerIdentity,input:"
end="  /** Compatibility only:"
i=t.find(start); j=t.find(end,i)
if i<0 or j<0: raise RuntimeError(f"{rel}: create invitation markers missing")
new_create="""  createInvitation(actor:ServerIdentity,input:{email:string;displayName:string;requestedRole:GovernanceRole;organizationId?:string;competitionId?:string;committeeId?:string;reason:string}){
    if(RETIRED_ROLES.has(input.requestedRole))throw new Error('ROLE_RETIRED');
    if(!this.canGrant(actor,input.requestedRole))throw new Error('ROLE_GRANT_NOT_ALLOWED');
    const targetOrganizationId=actor.role==='super_admin'&&input.organizationId?input.organizationId:actor.organizationId;
    if(actor.role!=='super_admin'&&input.organizationId&&input.organizationId!==actor.organizationId)throw new Error('CROSS_TENANT_GRANT_BLOCKED');
    const competitionScopedActor=actor.role==='org_admin'||actor.role==='comp_admin';
    if(competitionScopedActor&&!input.competitionId)throw new Error('COMPETITION_SCOPE_REQUIRED');
    if(actor.role==='comp_admin'&&actor.competitionId&&input.competitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    const email=normalizeEmail(input.email);
    if(!email||!input.displayName.trim()||input.reason.trim().length<5)throw new Error('INVITATION_FIELDS_REQUIRED');
    const s=this.read();this.cleanup(s);
    const existing=s.accounts.find(a=>a.organizationId===targetOrganizationId&&normalizeEmail(a.email)===email&&a.status==='ACTIVE');
    if(existing&&s.grants.some(g=>g.accountId===existing.id&&g.status==='ACTIVE'&&g.competitionId===input.competitionId))throw new Error('ACCOUNT_ALREADY_ACTIVE_IN_COMPETITION');
    if(s.invitations.some(inv=>inv.organizationId===targetOrganizationId&&inv.email===email&&inv.competitionId===input.competitionId&&inv.status==='READY'))throw new Error('INVITATION_ALREADY_PENDING');
    for(const old of s.invitations)if(old.organizationId===targetOrganizationId&&old.email===email&&old.competitionId===input.competitionId&&old.status==='PENDING_APPROVAL')old.status='REVOKED';
    const rawToken=crypto.randomBytes(24).toString('base64url');
    const invitation:Invitation={id:crypto.randomUUID(),organizationId:targetOrganizationId,competitionId:input.competitionId||actor.competitionId,committeeId:input.committeeId,email,displayName:input.displayName.trim(),requestedRole:input.requestedRole,reason:input.reason.trim(),status:'READY',createdAt:new Date().toISOString(),createdBy:actor.uid,expiresAt:new Date(Date.now()+48*3600_000).toISOString(),activationTokenHash:hash(rawToken)};
    s.invitations.unshift(invitation);this.write(s);
    this.appendAudit({...actor,organizationId:targetOrganizationId},'IDENTITY_INVITATION_CREATED','Invitation',invitation.id,input.reason);
    return {invitation:{...invitation,activationTokenHash:undefined},activationToken:rawToken};
  }

  previewInvitation(token:string){
    const s=this.read();this.cleanup(s);this.write(s);const tokenHash=hash(String(token||''));const inv=s.invitations.find(x=>x.status==='READY'&&x.activationTokenHash===tokenHash);
    if(!inv)throw new Error('ACTIVATION_TOKEN_INVALID');
    return {email:inv.email,displayName:inv.displayName,requestedRole:inv.requestedRole,organizationId:inv.organizationId,competitionId:inv.competitionId,expiresAt:inv.expiresAt};
  }

"""
t=t[:i]+new_create+t[j:]

# replace activate method through identityForUid
start="  activate(base:{uid:string;email?:string},token:string){"
end="  identityForUid(uid:string){"
i=t.find(start); j=t.find(end,i)
if i<0 or j<0: raise RuntimeError(f"{rel}: activation markers missing")
new_activate="""  activate(base:{uid:string;email?:string},token:string){
    if(!base.uid||!base.email)throw new Error('VERIFIED_EMAIL_REQUIRED');
    const s=this.read();this.cleanup(s);const tokenHash=hash(String(token||''));const inv=s.invitations.find(x=>x.status==='READY'&&x.activationTokenHash===tokenHash);
    if(!inv)throw new Error('ACTIVATION_TOKEN_INVALID');if(RETIRED_ROLES.has(inv.requestedRole))throw new Error('ROLE_RETIRED');if(normalizeEmail(base.email)!==inv.email)throw new Error('ACTIVATION_EMAIL_MISMATCH');
    const existingByUid=s.accounts.find(a=>a.uid===base.uid&&a.status==='ACTIVE');
    const existingByEmail=s.accounts.find(a=>a.organizationId===inv.organizationId&&normalizeEmail(a.email)===inv.email&&a.status==='ACTIVE');
    if(existingByUid&&existingByEmail&&existingByUid.id!==existingByEmail.id)throw new Error('IDENTITY_BINDING_CONFLICT');
    if(existingByUid&&existingByUid.organizationId!==inv.organizationId)throw new Error('CROSS_TENANT_IDENTITY_BLOCKED');
    const account=existingByUid||existingByEmail;
    if(account&&s.grants.some(g=>g.accountId===account.id&&g.status==='ACTIVE'&&g.competitionId===inv.competitionId))throw new Error('IDENTITY_ALREADY_BOUND_TO_COMPETITION');
    const now=new Date().toISOString();
    const resolvedAccount:Account=account||{id:crypto.randomUUID(),uid:base.uid,organizationId:inv.organizationId,email:inv.email,displayName:inv.displayName,status:'ACTIVE',createdAt:now,activatedFromInvitationId:inv.id};
    if(!account)s.accounts.unshift(resolvedAccount);
    else if(!resolvedAccount.uid)resolvedAccount.uid=base.uid;
    const grant:Grant={id:crypto.randomUUID(),accountId:resolvedAccount.id,organizationId:inv.organizationId,competitionId:inv.competitionId,committeeId:inv.committeeId,role:inv.requestedRole,status:'ACTIVE',createdAt:now,createdBy:inv.createdBy,approvedBy:inv.approvedBy};
    inv.status='ACTIVATED';delete inv.activationTokenHash;s.grants.unshift(grant);this.write(s);
    this.appendAudit({uid:base.uid,role:grant.role,organizationId:grant.organizationId},'IDENTITY_ACTIVATED','Account',resolvedAccount.id,`One-time invitation bound to ${grant.competitionId||'organization'}`);
    return {account:resolvedAccount,grant};
  }

  identityForUid(uid:string,competitionId?:string){
    const s=this.read();this.cleanup(s);this.write(s);const account=s.accounts.find(a=>a.uid===uid&&a.status==='ACTIVE');if(!account)return null;
    let grants=s.grants.filter(g=>g.accountId===account.id&&g.status==='ACTIVE'&&!RETIRED_ROLES.has(g.role));if(competitionId){const exact=grants.filter(g=>g.competitionId===competitionId);if(exact.length)grants=exact;else grants=grants.filter(g=>!g.competitionId);}
    if(!grants.length)return null;
    const rank:GovernanceRole[]=['super_admin','org_admin','comp_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator','auditor','support_agent','guardian','participant','scientific_admin'];
    grants.sort((a,b)=>rank.indexOf(a.role)-rank.indexOf(b.role));return {account,grant:grants[0],grants};
  }

"""
t=t[:i]+new_activate+t[j+len(end):]
# remove old identityForUid body that now follows method signature tail, ending before suspend
old_tail_start=t.find("\n    const s=this.read();this.cleanup(s);this.write(s);const account=s.accounts.find", t.find("identityForUid(uid:string,competitionId?:string)"))
# If replacement slicing already skipped only signature, the old body remains; cut it.
if old_tail_start>=0:
    suspend_marker="\n  suspend(actor:ServerIdentity,accountId:string,reason:string){"
    k=t.find(suspend_marker,old_tail_start)
    if k<0: raise RuntimeError(f"{rel}: suspend marker missing after identity replacement")
    # Keep the new method through its closing brace before the stray old tail. Find the first '\n  }' after new signature.
    sig=t.find("  identityForUid(uid:string,competitionId?:string){")
    new_close=t.find("\n  }",sig)+4
    if old_tail_start<new_close:
        raise RuntimeError(f"{rel}: identity replacement overlap")
    t=t[:new_close]+t[k:]

# insert grant-scoped lifecycle before account-level suspend
marker="  suspend(actor:ServerIdentity,accountId:string,reason:string){"
idx=t.find(marker)
if idx<0: raise RuntimeError(f"{rel}: suspend marker missing")
grant_methods=r"""  private scopedGrant(actor:ServerIdentity,s:State,grantId:string){
    const grant=s.grants.find(g=>g.id===grantId&&!RETIRED_ROLES.has(g.role));if(!grant)throw new Error('GRANT_NOT_FOUND');
    if(actor.role!=='super_admin'&&grant.organizationId!==actor.organizationId)throw new Error('GRANT_NOT_FOUND');
    if(actor.role==='comp_admin'&&actor.competitionId&&grant.competitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    if(actor.role!=='super_admin'&&!this.canGrant(actor,grant.role))throw new Error('ACCOUNT_MANAGEMENT_NOT_ALLOWED');
    const account=s.accounts.find(a=>a.id===grant.accountId&&a.status==='ACTIVE');if(!account)throw new Error('ACCOUNT_NOT_FOUND');
    if(account.uid===actor.uid)throw new Error('SELF_ACCOUNT_CHANGE_NOT_ALLOWED');
    if(actor.role!=='super_admin'&&this.isSuperAdminAccount(s,account.id))throw new Error('SUPER_ADMIN_PROTECTED');
    return {grant,account};
  }

  suspendGrant(actor:ServerIdentity,grantId:string,reason:string){
    if(!['super_admin','org_admin','comp_admin'].includes(actor.role))throw new Error('SUSPEND_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('SUSPEND_REASON_REQUIRED');
    const s=this.read();const {grant,account}=this.scopedGrant(actor,s,grantId);grant.status='SUSPENDED';let count=0;
    for(const x of s.sessions)if(x.accountId===account.id&&x.competitionId===grant.competitionId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason='Competition grant suspended';count++}
    this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'IDENTITY_GRANT_SUSPENDED','Grant',grant.id,reason);return {grant,revokedSessions:count};
  }

  removeGrant(actor:ServerIdentity,grantId:string,reason:string){
    if(!['super_admin','org_admin','comp_admin'].includes(actor.role))throw new Error('DELETE_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('DELETE_REASON_REQUIRED');
    const s=this.read();const {grant,account}=this.scopedGrant(actor,s,grantId);grant.status='REVOKED';let count=0;
    for(const x of s.sessions)if(x.accountId===account.id&&x.competitionId===grant.competitionId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason='Competition grant removed';count++}
    this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'IDENTITY_GRANT_REMOVED','Grant',grant.id,reason);return {removed:true,grantId:grant.id,revokedSessions:count};
  }

  revokeGrantSessions(actor:ServerIdentity,grantId:string,reason:string){
    if(!['super_admin','org_admin','comp_admin','head_judge'].includes(actor.role))throw new Error('SESSION_REVOCATION_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('REVOCATION_REASON_REQUIRED');
    const s=this.read();const grant=s.grants.find(g=>g.id===grantId&&g.status==='ACTIVE');if(!grant)throw new Error('GRANT_NOT_FOUND');
    if(actor.role!=='super_admin'&&grant.organizationId!==actor.organizationId)throw new Error('GRANT_NOT_FOUND');if(actor.role==='comp_admin'&&actor.competitionId&&grant.competitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    let count=0;for(const x of s.sessions)if(x.accountId===grant.accountId&&x.competitionId===grant.competitionId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason=reason.trim();count++}
    this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'AUTH_GRANT_SESSIONS_REVOKED','Grant',grant.id,reason);return {count};
  }

"""
t=t[:idx]+grant_methods+t[idx:]

# sessions carry the chosen competition id; openSession resolves the exact grant.
t=t.replace("const s=this.read();this.cleanup(s);const resolved=this.identityForUid(identity.uid);", "const s=this.read();this.cleanup(s);const resolved=this.identityForUid(identity.uid,identity.competitionId);",1)
t=t.replace("organizationId:identity.organizationId,role:identity.role", "organizationId:identity.organizationId,competitionId:identity.competitionId,role:identity.role")
write(rel,t)

# 7) Express routes: preview invitation; list scope; grant lifecycle.
rel='server.ts'
t=read(rel)
t=replace_once(t,
"const managed=identityGovernance?.identityForUid(base.uid);",
"const managed=identityGovernance?.identityForUid(base.uid,base.raw.competition_id?String(base.raw.competition_id):undefined);",
rel,'managed identity competition preference')
t=replace_once(t,
"  // Named-account identity governance. MIZAN stores no passwords; a verified Firebase identity is bound once to a scoped MIZAN invitation.\n  app.get('/api/identity/me'",
"  // Named-account identity governance. MIZAN stores no passwords; a verified Firebase identity is bound once to a scoped MIZAN invitation.\n  app.post('/api/identity/invitation/preview',sensitiveIdentityRateLimit,(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{return res.json({invitation:identityGovernance.previewInvitation(String(req.body?.activationToken||''))})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'ACTIVATION_TOKEN_INVALID'})}});\n  app.get('/api/identity/me'",
rel,'preview route')
old_list="app.get('/api/identity/governance',requireGovernanceRoles(['super_admin','org_admin','comp_admin','auditor']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.list((req as any).mizanIdentity,req.query.organizationId?String(req.query.organizationId):undefined))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'IDENTITY_LIST_FAILED'})}});"
new_list="app.get('/api/identity/governance',requireGovernanceRoles(['super_admin','org_admin','comp_admin','auditor']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.list((req as any).mizanIdentity,req.query.organizationId?String(req.query.organizationId):undefined,req.query.competitionId?String(req.query.competitionId):undefined))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'IDENTITY_LIST_FAILED'})}});"
t=replace_once(t,old_list,new_list,rel,'competition list route')
anchor="  app.delete('/api/identity/accounts/:id',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.remove((req as any).mizanIdentity,String(req.params.id),String(req.body?.reason||'User removed by authorized administrator')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'REMOVE_FAILED'})}});\n"
if anchor not in t: raise RuntimeError(f"{rel}: account delete route anchor missing")
grant_routes="""  app.post('/api/identity/grants/:id/suspend',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.suspendGrant((req as any).mizanIdentity,String(req.params.id),String(req.body?.reason||'')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'GRANT_SUSPEND_FAILED'})}});
  app.delete('/api/identity/grants/:id',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.removeGrant((req as any).mizanIdentity,String(req.params.id),String(req.body?.reason||'Competition access removed by authorized administrator')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'GRANT_REMOVE_FAILED'})}});
  app.post('/api/identity/grants/:id/revoke-sessions',requireGovernanceRoles(['super_admin','org_admin','comp_admin','head_judge']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.revokeGrantSessions((req as any).mizanIdentity,String(req.params.id),String(req.body?.reason||'')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'SESSION_REVOKE_FAILED'})}});
"""
t=t.replace(anchor,anchor+grant_routes,1)
write(rel,t)

# 8) Regression tests.
test_rel='tests/competition-scoped-identity-onboarding.test.ts'
test_text=r"""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IdentityGovernanceRepository } from '../server/identity-governance';

test('tenant managers must issue roles inside a competition and one Firebase identity may serve separate competitions',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-comp-scope-'));
 try{
  const repo=new IdentityGovernanceRepository(dir);
  const admin={uid:'org-admin-1',email:'admin@example.test',role:'org_admin' as const,organizationId:'org-1'};
  assert.throws(()=>repo.createInvitation(admin,{email:'judge@example.test',displayName:'Judge',requestedRole:'judge',reason:'Assign judge safely'}),/COMPETITION_SCOPE_REQUIRED/);

  const a=repo.createInvitation(admin,{email:'judge@example.test',displayName:'Judge',requestedRole:'judge',competitionId:'comp-a',reason:'Assign judge to A'});
  const first=repo.activate({uid:'firebase-judge',email:'judge@example.test'},a.activationToken);
  assert.equal(first.grant.competitionId,'comp-a');

  const b=repo.createInvitation(admin,{email:'judge@example.test',displayName:'Judge',requestedRole:'judge',competitionId:'comp-b',reason:'Assign judge to B'});
  const second=repo.activate({uid:'firebase-judge',email:'judge@example.test'},b.activationToken);
  assert.equal(second.account.id,first.account.id);
  assert.equal(second.grant.competitionId,'comp-b');

  const listA=repo.list(admin,undefined,'comp-a');
  const listB=repo.list(admin,undefined,'comp-b');
  assert.equal(listA.grants.length,1);
  assert.equal(listA.grants[0].competitionId,'comp-a');
  assert.equal(listB.grants.length,1);
  assert.equal(listB.grants[0].competitionId,'comp-b');

  repo.removeGrant(admin,listA.grants[0].id,'Remove access from A only');
  assert.equal(repo.identityForUid('firebase-judge','comp-a'),null);
  assert.equal(repo.identityForUid('firebase-judge','comp-b')?.grant.competitionId,'comp-b');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('QR onboarding creates the invited Firebase account and organization admin returns from competition without role impersonation',()=>{
 const auth=fs.readFileSync('src/components/auth/AuthPortal.tsx','utf8');
 const org=fs.readFileSync('src/components/admin/RolePortals.tsx','utf8');
 const comp=fs.readFileSync('src/components/admin/CompetitionOverview.tsx','utf8');
 const app=fs.readFileSync('src/App.tsx','utf8');
 const server=fs.readFileSync('server.ts','utf8');
 assert.match(auth,/createUserWithEmailAndPassword/);
 assert.match(auth,/\/api\/identity\/invitation\/preview/);
 assert.match(auth,/\/api\/identity\/activate/);
 assert.match(org,/#manage-competition/);
 assert.doesNotMatch(org,/selectCompetition\(c\.id\);switchRole\('comp_admin'\)/);
 assert.match(comp,/IdentityGovernance competitionId=\{competition\.id\}/);
 assert.match(comp,/العودة إلى إعدادات الجهة/);
 assert.match(app,/currentUser\.role==='org_admin'&&hash\.startsWith\('#manage-competition'\)/);
 assert.match(server,/\/api\/identity\/grants\/:id/);
});
"""
write(test_rel,test_text)

# Postconditions
checks={
 'src/components/auth/AuthPortal.tsx':['createUserWithEmailAndPassword','/api/identity/invitation/preview','/api/identity/activate'],
 'src/components/admin/RolePortals.tsx':["window.location.hash='#manage-competition'"],
 'src/components/admin/CompetitionOverview.tsx':['IdentityGovernance competitionId={competition.id}','العودة إلى إعدادات الجهة'],
 'src/components/admin/IdentityGovernance.tsx':['competitionId?:string','THIS COMPETITION ONLY','/api/identity/grants/'],
 'server/identity-governance.ts':['previewInvitation(token:string)','COMPETITION_SCOPE_REQUIRED','removeGrant(actor:ServerIdentity','identityForUid(uid:string,competitionId?:string)'],
 'server.ts':["/api/identity/invitation/preview","/api/identity/grants/:id/suspend"],
}
for rel,needles in checks.items():
    txt=read(rel)
    for n in needles:
        if n not in txt: raise RuntimeError(f"{rel}: missing postcondition {n}")

print("Competition-scoped identity + QR first-run onboarding patch applied.")
