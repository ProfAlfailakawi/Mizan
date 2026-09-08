import React, {useEffect, useState} from 'react';
import { createUserWithEmailAndPassword, deleteUser, getMultiFactorResolver, sendPasswordResetEmail, signInWithEmailAndPassword, TotpMultiFactorGenerator, type MultiFactorResolver, type User } from '@firebase/auth';
import { KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { activationTokenFromLocation } from '../../lib/useMizanAuth';
import { useAppStore } from '../../lib/store';
import { Button } from '../design-system/Button';
import { MizanLogo } from '../design-system/MizanLogo';

type InvitationPreview={email:string;displayName:string;requestedRole:string;organizationId:string;competitionId?:string;expiresAt:string;existingAccount?:boolean};

export const AuthPortal:React.FC=()=>{
 const {language}=useAppStore();const ar=language==='ar';
 const activationToken=activationTokenFromLocation();
 const [preview,setPreview]=useState<InvitationPreview|null>(null); const [previewLoading,setPreviewLoading]=useState(Boolean(activationToken));
 const [existingMode,setExistingMode]=useState(false);
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [confirmPassword,setConfirmPassword]=useState('');
 const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
 const [mfaResolver,setMfaResolver]=useState<MultiFactorResolver|null>(null); const [mfaCode,setMfaCode]=useState('');

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
   .then(({ok,body})=>{if(!live)return;if(!ok){setMessage(ar?'رابط التفعيل غير صالح أو انتهت صلاحيته. اطلب QR جديدًا من مدير المسابقة.':'Activation link is invalid or expired. Ask the competition manager for a new QR.');return;}setPreview(body.invitation as InvitationPreview);setEmail(String(body.invitation?.email||''));setExistingMode(Boolean(body.invitation?.existingAccount));})
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
   if(code==='auth/multi-factor-auth-required'){
    try{const resolver=getMultiFactorResolver(auth,e as Parameters<typeof getMultiFactorResolver>[1]);if(!resolver.hints.some(h=>h.factorId===TotpMultiFactorGenerator.FACTOR_ID)){setMessage(ar?'الحساب يتطلب عامل تحقق غير مدعوم في هذه الشاشة.':'This account requires an unsupported second factor.');return;}setMfaResolver(resolver);setMfaCode('');setPassword('');setMessage('');return;}catch{setMessage(ar?'تعذر بدء التحقق بخطوتين. أعد المحاولة.':'Could not start two-step verification. Try again.');return;}
   }
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

 const finishMfaSignIn=async()=>{if(!mfaResolver)return;const clean=mfaCode.replace(/\s+/g,'');if(!/^\d{6}$/.test(clean)){setMessage(ar?'اكتب رمز Authenticator المكوّن من 6 أرقام.':'Enter the 6-digit Authenticator code.');return;}const hint=mfaResolver.hints.find(h=>h.factorId===TotpMultiFactorGenerator.FACTOR_ID);if(!hint){setMessage(ar?'عامل Authenticator غير موجود لهذا الحساب.':'No Authenticator factor is enrolled on this account.');return;}setBusy(true);setMessage('');try{const assertion=TotpMultiFactorGenerator.assertionForSignIn(hint.uid,clean);const cred=await mfaResolver.resolveSignIn(assertion);setMfaResolver(null);setMfaCode('');if(activationToken)await finishActivation(cred.user);}catch(e:unknown){const code=String((e as {code?:string})?.code||'');setMessage(code==='auth/invalid-verification-code'?(ar?'الرمز غير صحيح أو انتهت مدته. جرّب الرمز الحالي في التطبيق.':'The code is invalid or expired. Use the current code from your app.'):(ar?`تعذر إكمال التحقق (${code||'خطأ غير معروف'}).`:`Could not complete verification (${code||'unknown error'}).`));}finally{setBusy(false)}};

 const reset=async()=>{if(!email)return setMessage(ar?'أدخل البريد الإلكتروني أولًا':'Enter your email first');setBusy(true);try{await sendPasswordResetEmail(auth,email);setMessage(ar?'تم إرسال رابط استعادة كلمة المرور':'Reset link sent');}catch{setMessage(ar?'تعذر إرسال رابط الاستعادة':'Could not send reset link');}finally{setBusy(false)}};

 if(mfaResolver)return <div className="min-h-screen bg-[#F8F5ED] grid place-items-center p-5" dir={ar?'rtl':'ltr'}><div className="w-full max-w-md"><div className="text-center"><div className="flex justify-center"><MizanLogo language={language}/></div><div className="mizan-kicker mt-7">{ar?'تحقق بخطوتين':'TWO-STEP VERIFICATION'}</div><h1 className="text-3xl font-black mt-2 text-[#17352D]">{ar?'رمز Authenticator':'Authenticator code'}</h1><p className="text-xs text-[#636864] mt-2 leading-6">{ar?'افتح Google Authenticator واكتب الرمز الحالي المكوّن من 6 أرقام.':'Open Google Authenticator and enter the current 6-digit code.'}</p></div><div className="mizan-surface p-6 mt-7"><label className="block"><span className="text-[10px] font-black text-[#646965]">{ar?'رمز التحقق':'Verification code'}</span><div className="relative mt-2"><KeyRound className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))} onKeyDown={e=>e.key==='Enter'&&void finishMfaSignIn()} className="w-full rounded-xl border border-[#ddd] ps-10 pe-3 py-3 text-center tracking-[0.3em] font-black" dir="ltr"/></div></label>{message&&<div className="mt-4 rounded-xl bg-[#f3f1eb] px-3 py-2.5 text-xs font-semibold">{message}</div>}<Button className="w-full mt-5" disabled={busy||mfaCode.length!==6} onClick={()=>void finishMfaSignIn()} icon={<ShieldCheck className="w-4 h-4"/>}>{busy?'…':ar?'تحقق وادخل':'Verify & sign in'}</Button><button type="button" onClick={()=>{setMfaResolver(null);setMfaCode('');setMessage('')}} className="w-full min-h-11 mt-3 text-xs font-bold text-[#45675b]">{ar?'العودة لتسجيل الدخول':'Back to sign in'}</button></div></div></div>;

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
