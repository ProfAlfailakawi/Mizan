#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT=Path.cwd()
CHANGED=[]

def read(rel:str)->str:
    p=ROOT/rel
    if not p.is_file(): raise RuntimeError(f'missing {rel}')
    return p.read_text(encoding='utf-8')

def write(rel:str,text:str)->None:
    p=ROOT/rel
    old=p.read_text(encoding='utf-8')
    if old!=text:
        p.write_text(text,encoding='utf-8')
        CHANGED.append(rel)

def replace_once(text:str,old:str,new:str,rel:str,label:str)->str:
    if old not in text:
        if new in text: return text
        raise RuntimeError(f'{rel}: anchor missing for {label}')
    return text.replace(old,new,1)

def sub_once(text:str,pattern:str,repl:str,rel:str,label:str,flags=0)->str:
    nxt,n=re.subn(pattern,repl,text,count=1,flags=flags)
    if n!=1: raise RuntimeError(f'{rel}: regex anchor missing for {label} ({n})')
    return nxt

# -----------------------------------------------------------------------------
# MFA: generic authenticator wording + safe re-setup. Keep old TOTP active until
# the newly verified factor is enrolled; only then remove the older factor(s).
# Secrets live in React memory only and QR stays local through RealQRCode.
# -----------------------------------------------------------------------------
TOTP=r'''import React, { useState } from 'react';
import {
 EmailAuthProvider,
 GoogleAuthProvider,
 TotpMultiFactorGenerator,
 getMultiFactorResolver,
 multiFactor,
 reauthenticateWithCredential,
 reauthenticateWithPopup,
 sendEmailVerification,
 signOut,
 type MultiFactorResolver,
 type TotpSecret,
} from '@firebase/auth';
import { CheckCircle2, Copy, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useAppStore } from '../../lib/store';
import { RealQRCode } from '../design-system/RealQRCode';

const errorCode=(error:unknown)=>String((error as {code?:string})?.code||'');
const totpHints=(resolver:MultiFactorResolver)=>resolver.hints.filter(h=>h.factorId===TotpMultiFactorGenerator.FACTOR_ID);

type SetupMode='idle'|'confirm-reset'|'reauth'|'setup';

export const TotpSecurity:React.FC<{bootstrap?:boolean}>=({bootstrap=false})=>{
 const {language}=useAppStore();const ar=language==='ar';const user=auth.currentUser;
 const [password,setPassword]=useState('');const [code,setCode]=useState('');const [secret,setSecret]=useState<TotpSecret|null>(null);const [uri,setUri]=useState('');
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [enrolledNow,setEnrolledNow]=useState(false);const [refreshKey,setRefreshKey]=useState(0);
 const [mode,setMode]=useState<SetupMode>('idle');const [replacement,setReplacement]=useState(false);const [oldFactorUids,setOldFactorUids]=useState<string[]>([]);const [cleanupPending,setCleanupPending]=useState<string[]>([]);
 const [reauthResolver,setReauthResolver]=useState<MultiFactorResolver|null>(null);const [reauthCode,setReauthCode]=useState('');const [reauthHintUid,setReauthHintUid]=useState('');
 const factors=user?multiFactor(user).enrolledFactors:[];const totpFactors=factors.filter(f=>f.factorId===TotpMultiFactorGenerator.FACTOR_ID);const alreadyEnrolled=Boolean(totpFactors.length||enrolledNow);
 const usesPassword=Boolean(user?.providerData.some(p=>p.providerId==='password'));const usesGoogle=Boolean(user?.providerData.some(p=>p.providerId==='google.com'));
 void refreshKey;

 const explain=(e:unknown)=>{const c=errorCode(e);if(c==='auth/requires-recent-login')return ar?'أعد التحقق من هويتك ثم حاول مرة أخرى.':'Reauthenticate and try again.';if(c==='auth/wrong-password'||c==='auth/invalid-credential')return ar?'كلمة المرور غير صحيحة.':'Incorrect password.';if(c==='auth/invalid-verification-code')return ar?'رمز تطبيق المصادقة غير صحيح أو انتهت مدته.':'The authenticator app code is invalid or expired.';if(c==='auth/unverified-email')return ar?'يجب توثيق البريد الإلكتروني أولًا.':'Verify your email first.';if(c==='auth/multi-factor-info-not-found')return ar?'تعذر قراءة عامل التحقق. أعد المحاولة.':'Could not read the MFA factor. Try again.';if(c==='auth/too-many-requests')return ar?'محاولات كثيرة متتابعة. انتظر قليلًا ثم أعد المحاولة.':'Too many attempts. Wait a little and try again.';if(c==='auth/network-request-failed')return ar?'تعذر الاتصال بخدمة الهوية. تحقق من الشبكة ثم أعد المحاولة.':'Could not reach the identity service. Check your network and try again.';return ar?`تعذر إكمال التحقق (${c||'خطأ غير معروف'}).`:`Could not complete MFA (${c||'unknown error'}).`};

 const clearSetup=()=>{setSecret(null);setUri('');setCode('');setPassword('');setReauthResolver(null);setReauthCode('');setReauthHintUid('');};
 const cancelSetup=()=>{clearSetup();setReplacement(false);setMode('idle');setMessage('')};
 const refreshUser=async()=>{const active=auth.currentUser||user;if(!active)return;setBusy(true);try{await active.reload();setRefreshKey(v=>v+1);setMessage(active.emailVerified?(ar?'البريد موثّق. يمكنك متابعة التفعيل.':'Email verified. You can continue.'):(ar?'لم يظهر التوثيق بعد. افتح رابط التوثيق ثم أعد الفحص.':'Verification is not visible yet. Open the verification link, then check again.'));}finally{setBusy(false)}};
 const sendVerification=async()=>{const active=auth.currentUser||user;if(!active)return;setBusy(true);setMessage('');try{await sendEmailVerification(active);setMessage(ar?'أرسلنا رابط توثيق البريد. افتحه ثم ارجع واضغط «تحققت من البريد».':'Verification email sent. Open it, then return and press “I verified my email”.');}catch(e){setMessage(explain(e))}finally{setBusy(false)}};

 const generateNewSecret=async()=>{const active=auth.currentUser||user;if(!active)return;const before=multiFactor(active).enrolledFactors.filter(f=>f.factorId===TotpMultiFactorGenerator.FACTOR_ID).map(f=>f.uid);setOldFactorUids(replacement?before:[]);const session=await multiFactor(active).getSession();const generated=await TotpMultiFactorGenerator.generateSecret(session);setSecret(generated);setUri(generated.generateQrCodeUrl(active.email||active.uid,'MIZAN'));setPassword('');setReauthResolver(null);setReauthCode('');setReauthHintUid('');setMode('setup');setMessage('')};
 const captureResolver=async(e:unknown)=>{if(errorCode(e)!=='auth/multi-factor-auth-required')return false;try{const resolver=getMultiFactorResolver(auth,e as Parameters<typeof getMultiFactorResolver>[1]);const hints=totpHints(resolver);if(!hints.length){setMessage(ar?'الحساب يحتاج عامل تحقق غير مدعوم في هذه الشاشة.':'This account requires an unsupported second factor.');return true}setReauthResolver(resolver);setReauthHintUid(hints[0].uid);setReauthCode('');setMessage(ar?'أكمل إعادة التحقق بالرمز الحالي من تطبيق المصادقة.':'Complete reauthentication with the current code from your authenticator app.');return true}catch{return false}};
 const beginReauth=async()=>{const active=auth.currentUser||user;if(!active)return;if(!active.emailVerified){setMessage(ar?'وثّق بريدك الإلكتروني أولًا.':'Verify your email first.');return}if(usesPassword&&!password){setMessage(ar?'اكتب كلمة مرور حسابك لإعادة التحقق من هويتك.':'Enter your account password to reauthenticate.');return}setBusy(true);setMessage('');try{if(usesPassword&&active.email)await reauthenticateWithCredential(active,EmailAuthProvider.credential(active.email,password));else if(usesGoogle)await reauthenticateWithPopup(active,new GoogleAuthProvider());else throw new Error('NO_REAUTH_PROVIDER');await generateNewSecret()}catch(e){if(!(await captureResolver(e)))setMessage(errorCode(e)?explain(e):(ar?'لا توجد طريقة إعادة تحقق مدعومة لهذا الحساب.':'No supported reauthentication method is available for this account.'))}finally{setBusy(false)}};
 const finishReauthMfa=async()=>{if(!reauthResolver)return;const clean=reauthCode.replace(/\s+/g,'');if(!/^\d{6}$/.test(clean)){setMessage(ar?'اكتب الرمز الحالي المكوّن من 6 أرقام.':'Enter the current 6-digit code.');return}const hints=totpHints(reauthResolver);const hint=hints.find(h=>h.uid===reauthHintUid)||(hints.length===1?hints[0]:undefined);if(!hint){setMessage(ar?'اختر عامل تطبيق المصادقة الذي تستخدمه حاليًا.':'Choose the authenticator factor you currently use.');return}setBusy(true);setMessage('');try{const assertion=TotpMultiFactorGenerator.assertionForSignIn(hint.uid,clean);await reauthResolver.resolveSignIn(assertion);await generateNewSecret()}catch(e){setMessage(explain(e))}finally{setBusy(false)}};

 const confirm=async()=>{const active=auth.currentUser||user;if(!active||!secret)return;const clean=code.replace(/\s+/g,'');if(!/^\d{6}$/.test(clean)){setMessage(ar?'اكتب رمز تطبيق المصادقة المكوّن من 6 أرقام.':'Enter the 6-digit authenticator app code.');return}setBusy(true);setMessage('');try{const assertion=TotpMultiFactorGenerator.assertionForEnrollment(secret,clean);await multiFactor(active).enroll(assertion,'MIZAN Authenticator');await active.reload();let cleanupErrors:string[]=[];if(replacement&&oldFactorUids.length){for(const uid of oldFactorUids){try{await multiFactor(active).unenroll(uid)}catch{cleanupErrors.push(uid)}}await active.reload()}setCleanupPending(cleanupErrors);setEnrolledNow(true);clearSetup();setReplacement(false);setMode('idle');setRefreshKey(v=>v+1);setMessage(cleanupErrors.length?(ar?'تم تفعيل المفتاح الجديد، لكن تعذر إلغاء عامل قديم. يبقى الحساب محميًا؛ أعد محاولة التنظيف قبل الاعتماد على مفتاح واحد فقط.':'The new key is active, but an older factor could not be removed. The account remains protected; retry cleanup before relying on a single key.'):(ar?'تم ربط تطبيق المصادقة بنجاح.':'Authenticator app linked successfully.'));}catch(e){setMessage(explain(e))}finally{setBusy(false)}};
 const retryCleanup=async()=>{const active=auth.currentUser||user;if(!active||!cleanupPending.length)return;setBusy(true);const failed:string[]=[];for(const uid of cleanupPending){try{await multiFactor(active).unenroll(uid)}catch{failed.push(uid)}}try{await active.reload()}catch{}setCleanupPending(failed);setRefreshKey(v=>v+1);setMessage(failed.length?(ar?'تعذر حذف العامل القديم. أعد إعداد تطبيق المصادقة بعد إعادة تسجيل الدخول إذا استمرت المشكلة.':'Could not remove the old factor. Re-run authenticator setup after signing in again if this persists.'):(ar?'تم حذف العامل القديم. بقي عامل TOTP واحد للحساب.':'Old factor removed. One TOTP factor remains on the account.'));setBusy(false)};
 const copySecret=async()=>{if(!secret)return;try{await navigator.clipboard.writeText(secret.secretKey);setMessage(ar?'تم نسخ مفتاح الإعداد.':'Setup key copied.');}catch{setMessage(ar?'تعذر النسخ تلقائيًا. انسخ المفتاح يدويًا.':'Automatic copy failed. Copy the key manually.')}};
 const freshSignIn=()=>{void signOut(auth).catch(()=>{}).finally(()=>window.location.reload())};

 if(!user)return <div className="text-xs text-[#636864]">{ar?'سجّل الدخول أولًا.':'Sign in first.'}</div>;

 if(alreadyEnrolled&&mode==='idle')return <div className={bootstrap?'':'mizan-surface p-5 sm:p-6'}><div className="flex items-start gap-3"><div className="w-11 h-11 rounded-xl bg-[#E7EEE9] grid place-items-center shrink-0"><CheckCircle2 className="w-5 h-5 text-[#2F6555]"/></div><div className="min-w-0 flex-1"><div className="font-black text-[#17352D]">{ar?'التحقق بخطوتين مفعّل':'Two-step verification is active'}</div><p className="text-xs text-[#636864] leading-6 mt-1">{ar?'حسابك محمي باستخدام تطبيق مصادقة. يمكن استخدام Apple Passwords أو Google Authenticator أو Microsoft Authenticator أو أي تطبيق TOTP متوافق.':'Your account is protected with an authenticator app. Apple Passwords, Google Authenticator, Microsoft Authenticator and any compatible TOTP app are supported.'}</p></div></div><button type="button" disabled={busy} onClick={()=>{setMode('confirm-reset');setMessage('')}} className="mt-5 min-h-11 px-4 rounded-xl border border-[#cddbd3] bg-white text-[#214C40] text-xs font-black disabled:opacity-50">{ar?'إعادة إعداد تطبيق المصادقة':'Set up authenticator again'}</button><p className="mt-2 text-[10px] leading-5 text-[#656b66]">{ar?'سيتم إنشاء مفتاح جديد. ستحتاج إلى إضافة المفتاح الجديد إلى تطبيقات المصادقة التي تريد استخدامها.':'A new key will be created. Add the new key to every authenticator app you want to use.'}</p>{cleanupPending.length>0&&<button type="button" disabled={busy} onClick={()=>void retryCleanup()} className="mt-3 min-h-11 px-4 rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-50">{ar?'إعادة محاولة حذف العامل القديم':'Retry old-factor cleanup'}</button>}{bootstrap&&<button type="button" onClick={freshSignIn} className="mt-5 w-full min-h-11 rounded-xl bg-[#214C40] text-white text-xs font-black">{ar?'تسجيل دخول محمي الآن':'Continue with protected sign-in'}</button>}{message&&<div className="mt-3 rounded-xl bg-[#f3f1eb] px-3 py-2.5 text-xs font-semibold leading-6">{message}</div>}</div>;

 if(mode==='confirm-reset')return <div className={bootstrap?'':'mizan-surface p-5 sm:p-6'}><div className="font-black text-[#17352D]">{ar?'إعادة إعداد تطبيق المصادقة':'Set up authenticator again'}</div><p className="text-xs text-[#636864] leading-6 mt-2">{ar?'سيتم إنشاء مفتاح أمان جديد. سيبقى العامل الحالي فعالًا أثناء الإعداد، وبعد نجاح التفعيل فقط سيُلغى المفتاح القديم.':'A new security key will be created. Your current factor stays active during setup and is removed only after the new factor is verified.'}</p><div className="mt-5 flex gap-2"><button type="button" onClick={cancelSetup} className="min-h-11 px-4 rounded-xl border border-[#dad7cf] bg-white text-xs font-black">{ar?'إلغاء':'Cancel'}</button><button type="button" onClick={()=>{setReplacement(true);setMode('reauth');setMessage('')}} className="min-h-11 flex-1 rounded-xl bg-[#214C40] text-white text-xs font-black">{ar?'متابعة':'Continue'}</button></div></div>;

 return <div className={bootstrap?'':'mizan-surface p-5 sm:p-6'}>
  <div className="flex items-start gap-3"><div className="w-11 h-11 rounded-xl bg-[#E7EEE9] grid place-items-center shrink-0"><ShieldCheck className="w-5 h-5 text-[#2F6555]"/></div><div><div className="font-black text-[#17352D]">{replacement?(ar?'إعداد تطبيق المصادقة':'Set up authenticator app'):(ar?'حماية حساب مالك المنصة':'Platform owner account protection')}</div><p className="text-xs text-[#636864] leading-6 mt-1">{ar?'اربط أي تطبيق TOTP متوافق. السر يبقى في ذاكرة هذه الصفحة أثناء الإعداد ولا يُرسل إلى خدمة QR خارجية.':'Link any compatible TOTP authenticator. The secret stays in this page memory during setup and is never sent to an external QR service.'}</p></div></div>
  {!user.emailVerified?<div className="mt-5 rounded-2xl border border-[#e1d9bd] bg-[#fffaf0] p-4"><div className="text-xs font-black">{ar?'أولًا: وثّق البريد الإلكتروني':'First: verify your email'}</div><p className="text-[11px] text-[#666a67] leading-6 mt-1">{user.email}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void sendVerification()} className="min-h-11 px-4 rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-50">{ar?'إرسال رابط التوثيق':'Send verification email'}</button><button type="button" disabled={busy} onClick={()=>void refreshUser()} className="min-h-11 px-4 rounded-xl border border-[#d8d6cf] bg-white text-xs font-black disabled:opacity-50">{ar?'تحققت من البريد':'I verified my email'}</button></div></div>:mode!=='setup'?<div className="mt-5"><div className="text-xs font-black">{ar?'1. أعد التحقق من هويتك':'1. Reauthenticate'}</div>{reauthResolver?<div className="mt-3"><p className="text-[11px] text-[#656b66] leading-5">{ar?'افتح تطبيق المصادقة واكتب الرمز الحالي المكوّن من 6 أرقام.':'Open your authenticator app and enter the current 6-digit code.'}</p>{totpHints(reauthResolver).length>1&&<select value={reauthHintUid} onChange={e=>setReauthHintUid(e.target.value)} className="mizan-input mt-3">{totpHints(reauthResolver).map((h,i)=><option key={h.uid} value={h.uid}>{h.displayName||`${ar?'عامل مصادقة':'Authenticator factor'} ${i+1}`}</option>)}</select>}<input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={reauthCode} onChange={e=>setReauthCode(e.target.value.replace(/\D/g,'').slice(0,6))} onKeyDown={e=>e.key==='Enter'&&void finishReauthMfa()} className="mizan-input mt-3 text-center tracking-[0.3em] font-black" dir="ltr"/><button type="button" disabled={busy||reauthCode.length!==6} onClick={()=>void finishReauthMfa()} className="mt-3 min-h-11 w-full rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-50">{busy?'…':ar?'تحقق وأنشئ المفتاح الجديد':'Verify & create new key'}</button></div>:<>{usesPassword&&<label className="block mt-3"><span className="text-[10px] font-black text-[#646965]">{ar?'كلمة مرور حسابك':'Account password'}</span><div className="relative mt-2"><LockKeyhole className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void beginReauth()} className="mizan-input ps-10"/></div></label>}<button type="button" disabled={busy||(usesPassword&&!password)} onClick={()=>void beginReauth()} className="mt-4 min-h-11 px-4 rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-50">{busy?'…':usesPassword?(ar?'تحقق وأنشئ QR':'Verify & create QR'):(ar?'التحقق بحساب Google وإنشاء QR':'Verify with Google & create QR')}</button></>} {replacement&&<button type="button" disabled={busy} onClick={cancelSetup} className="mt-3 min-h-11 px-4 rounded-xl border border-[#dad7cf] bg-white text-xs font-black">{ar?'إلغاء':'Cancel'}</button>}</div>:secret?<div className="mt-5"><div className="text-xs font-black">{ar?'2. امسح رمز QR باستخدام تطبيق المصادقة':'2. Scan the QR with your authenticator app'}</div><p className="text-[10px] text-[#656b66] leading-5 mt-2">{ar?'يعمل مع Apple Passwords وGoogle Authenticator وMicrosoft Authenticator وأي تطبيق TOTP متوافق.':'Works with Apple Passwords, Google Authenticator, Microsoft Authenticator and any compatible TOTP app.'}</p><div className="mt-4 flex justify-center"><div className="rounded-2xl border border-[#e0ded7] bg-white p-3"><RealQRCode value={uri} size={220} label={ar?'رمز QR لإعداد تطبيق المصادقة':'QR code for authenticator app setup'}/></div></div><div className="mt-4 rounded-xl bg-[#f3f1eb] p-3"><div className="text-[10px] font-black text-[#626864]">{ar?'مفتاح الإعداد اليدوي (Setup Key)':'Manual setup key (Setup Key)'}</div><div className="mt-2 flex items-center gap-2"><code className="flex-1 text-[11px] font-bold break-all select-all" dir="ltr">{secret.secretKey}</code><button type="button" onClick={()=>void copySecret()} className="w-11 h-11 rounded-lg border border-[#dad7cf] bg-white grid place-items-center" aria-label={ar?'نسخ المفتاح':'Copy key'}><Copy className="w-4 h-4"/></button></div><p className="text-[10px] text-[#656b66] leading-5 mt-2">{ar?'يمكنك استخدام هذا المفتاح لإضافة الحساب يدويًا إلى Apple Passwords أو أي تطبيق مصادقة متوافق.':'Use this key to add the account manually to Apple Passwords or any compatible authenticator app.'}</p></div><label className="block mt-4"><span className="text-[10px] font-black text-[#646965]">{ar?'3. أدخل الرمز المكوّن من 6 أرقام':'3. Enter the 6-digit code'}</span><div className="relative mt-2"><KeyRound className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} onKeyDown={e=>e.key==='Enter'&&void confirm()} className="mizan-input ps-10 text-center tracking-[0.3em] font-black" dir="ltr"/></div></label><div className="mt-4 flex gap-2"><button type="button" disabled={busy||code.length!==6} onClick={()=>void confirm()} className="min-h-11 flex-1 rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-50">{busy?'…':ar?'تأكيد وتفعيل':'Confirm & enable'}</button><button type="button" disabled={busy} onClick={cancelSetup} className="min-h-11 px-4 rounded-xl border border-[#dad7cf] bg-white text-xs font-black">{ar?'إلغاء':'Cancel'}</button></div></div>:null}
  {message&&<div className="mt-4 rounded-xl bg-[#f3f1eb] px-3 py-2.5 text-xs font-semibold leading-6">{message}</div>}
 </div>;
};

export const TotpSecurityCard:React.FC=()=> <TotpSecurity/>;
'''
write('src/components/auth/TotpSecurity.tsx',TOTP)

# AuthPortal: generic wording and explicit factor selection when more than one TOTP exists.
rel='src/components/auth/AuthPortal.tsx';t=read(rel)
t=replace_once(t,"const [mfaResolver,setMfaResolver]=useState<MultiFactorResolver|null>(null); const [mfaCode,setMfaCode]=useState('');","const [mfaResolver,setMfaResolver]=useState<MultiFactorResolver|null>(null); const [mfaCode,setMfaCode]=useState(''); const [mfaHintUid,setMfaHintUid]=useState('');",rel,'MFA hint state')
old="if(code==='auth/multi-factor-auth-required'){\n    try{const resolver=getMultiFactorResolver(auth,e as Parameters<typeof getMultiFactorResolver>[1]);if(!resolver.hints.some(h=>h.factorId===TotpMultiFactorGenerator.FACTOR_ID)){setMessage(ar?'الحساب يتطلب عامل تحقق غير مدعوم في هذه الشاشة.':'This account requires an unsupported second factor.');return;}setMfaResolver(resolver);setMfaCode('');setPassword('');setMessage('');return;}catch{setMessage(ar?'تعذر بدء التحقق بخطوتين. أعد المحاولة.':'Could not start two-step verification. Try again.');return;}\n   }"
new="if(code==='auth/multi-factor-auth-required'){\n    try{const resolver=getMultiFactorResolver(auth,e as Parameters<typeof getMultiFactorResolver>[1]);const hints=resolver.hints.filter(h=>h.factorId===TotpMultiFactorGenerator.FACTOR_ID);if(!hints.length){setMessage(ar?'الحساب يتطلب عامل تحقق غير مدعوم في هذه الشاشة.':'This account requires an unsupported second factor.');return;}setMfaResolver(resolver);setMfaHintUid(hints[0].uid);setMfaCode('');setPassword('');setMessage('');return;}catch{setMessage(ar?'تعذر بدء التحقق بخطوتين. أعد المحاولة.':'Could not start two-step verification. Try again.');return;}\n   }"
t=replace_once(t,old,new,rel,'sign-in resolver capture')
t=sub_once(t,r" const finishMfaSignIn=async\(\)=>\{.*?\n\n const reset=async",r''' const finishMfaSignIn=async()=>{if(!mfaResolver)return;const clean=mfaCode.replace(/\s+/g,'');if(!/^\d{6}$/.test(clean)){setMessage(ar?'اكتب رمز تطبيق المصادقة المكوّن من 6 أرقام.':'Enter the 6-digit authenticator app code.');return;}const hints=mfaResolver.hints.filter(h=>h.factorId===TotpMultiFactorGenerator.FACTOR_ID);const hint=hints.find(h=>h.uid===mfaHintUid)||(hints.length===1?hints[0]:undefined);if(!hint){setMessage(ar?'اختر عامل تطبيق المصادقة.':'Choose an authenticator factor.');return;}setBusy(true);setMessage('');try{const assertion=TotpMultiFactorGenerator.assertionForSignIn(hint.uid,clean);const cred=await mfaResolver.resolveSignIn(assertion);setMfaResolver(null);setMfaHintUid('');setMfaCode('');if(activationToken)await finishActivation(cred.user);}catch(e:unknown){const code=String((e as {code?:string})?.code||'');setMessage(code==='auth/invalid-verification-code'?(ar?'الرمز غير صحيح أو انتهت مدته. استخدم الرمز الحالي من تطبيق المصادقة.':'The code is invalid or expired. Use the current code from your authenticator app.'):code==='auth/too-many-requests'?(ar?'محاولات كثيرة متتابعة. انتظر قليلًا ثم أعد المحاولة.':'Too many attempts. Wait a little and try again.'):code==='auth/network-request-failed'?(ar?'تعذر الاتصال بخدمة الهوية. تحقق من الشبكة.':'Could not reach the identity service. Check your network.'):(ar?`تعذر إكمال التحقق (${code||'خطأ غير معروف'}).`:`Could not complete verification (${code||'unknown error'}).`));}finally{setBusy(false)}};

 const reset=async''',rel,'MFA sign-in resolution',re.S)
old="if(mfaResolver)return <div className=\"min-h-screen bg-[#F8F5ED] grid place-items-center p-5\" dir={ar?'rtl':'ltr'}><div className=\"w-full max-w-md\"><div className=\"text-center\"><div className=\"flex justify-center\"><MizanLogo language={language}/></div><div className=\"mizan-kicker mt-7\">{ar?'تحقق بخطوتين':'TWO-STEP VERIFICATION'}</div><h1 className=\"text-3xl font-black mt-2 text-[#17352D]\">{ar?'رمز Authenticator':'Authenticator code'}</h1><p className=\"text-xs text-[#636864] mt-2 leading-6\">{ar?'افتح Google Authenticator واكتب الرمز الحالي المكوّن من 6 أرقام.':'Open Google Authenticator and enter the current 6-digit code.'}</p></div><div className=\"mizan-surface p-6 mt-7\"><label className=\"block\"><span className=\"text-[10px] font-black text-[#646965]\">{ar?'رمز التحقق':'Verification code'}</span><div className=\"relative mt-2\"><KeyRound className=\"w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]\"/><input autoFocus inputMode=\"numeric\" autoComplete=\"one-time-code\" maxLength={6} value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\\D/g,'').slice(0,6))} onKeyDown={e=>e.key==='Enter'&&void finishMfaSignIn()} className=\"w-full rounded-xl border border-[#ddd] ps-10 pe-3 py-3 text-center tracking-[0.3em] font-black\" dir=\"ltr\"/></div></label>{message&&<div className=\"mt-4 rounded-xl bg-[#f3f1eb] px-3 py-2.5 text-xs font-semibold\">{message}</div>}<Button className=\"w-full mt-5\" disabled={busy||mfaCode.length!==6} onClick={()=>void finishMfaSignIn()} icon={<ShieldCheck className=\"w-4 h-4\"/>}>{busy?'…':ar?'تحقق وادخل':'Verify & sign in'}</Button><button type=\"button\" onClick={()=>{setMfaResolver(null);setMfaCode('');setMessage('')}} className=\"w-full min-h-11 mt-3 text-xs font-bold text-[#45675b]\">{ar?'العودة لتسجيل الدخول':'Back to sign in'}</button></div></div></div>;"
new="if(mfaResolver){const hints=mfaResolver.hints.filter(h=>h.factorId===TotpMultiFactorGenerator.FACTOR_ID);return <div className=\"min-h-screen bg-[#F8F5ED] grid place-items-center p-5\" dir={ar?'rtl':'ltr'}><div className=\"w-full max-w-md\"><div className=\"text-center\"><div className=\"flex justify-center\"><MizanLogo language={language}/></div><div className=\"mizan-kicker mt-7\">{ar?'تحقق بخطوتين':'TWO-STEP VERIFICATION'}</div><h1 className=\"text-3xl font-black mt-2 text-[#17352D]\">{ar?'رمز تطبيق المصادقة':'Authenticator app code'}</h1><p className=\"text-xs text-[#636864] mt-2 leading-6\">{ar?'افتح تطبيق المصادقة واكتب الرمز الحالي المكوّن من 6 أرقام.':'Open your authenticator app and enter the current 6-digit code.'}</p></div><div className=\"mizan-surface p-6 mt-7\">{hints.length>1&&<label className=\"block mb-4\"><span className=\"text-[10px] font-black text-[#646965]\">{ar?'عامل المصادقة':'Authenticator factor'}</span><select value={mfaHintUid} onChange={e=>setMfaHintUid(e.target.value)} className=\"mizan-input mt-2\">{hints.map((h,i)=><option key={h.uid} value={h.uid}>{h.displayName||`${ar?'عامل':'Factor'} ${i+1}`}</option>)}</select></label>}<label className=\"block\"><span className=\"text-[10px] font-black text-[#646965]\">{ar?'رمز التحقق':'Verification code'}</span><div className=\"relative mt-2\"><KeyRound className=\"w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]\"/><input autoFocus inputMode=\"numeric\" autoComplete=\"one-time-code\" maxLength={6} value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\\D/g,'').slice(0,6))} onKeyDown={e=>e.key==='Enter'&&void finishMfaSignIn()} className=\"w-full rounded-xl border border-[#ddd] ps-10 pe-3 py-3 text-center tracking-[0.3em] font-black\" dir=\"ltr\"/></div></label>{message&&<div className=\"mt-4 rounded-xl bg-[#f3f1eb] px-3 py-2.5 text-xs font-semibold\">{message}</div>}<Button className=\"w-full mt-5\" disabled={busy||mfaCode.length!==6} onClick={()=>void finishMfaSignIn()} icon={<ShieldCheck className=\"w-4 h-4\"/>}>{busy?'…':ar?'تحقق وادخل':'Verify & sign in'}</Button><button type=\"button\" onClick={()=>{setMfaResolver(null);setMfaHintUid('');setMfaCode('');setMessage('')}} className=\"w-full min-h-11 mt-3 text-xs font-bold text-[#45675b]\">{ar?'العودة لتسجيل الدخول':'Back to sign in'}</button></div></div></div>}"
t=replace_once(t,old,new,rel,'MFA challenge UI')
write(rel,t)

# Identity governance: active users no longer expose activation QR; remove internal technical banner.
rel='src/components/admin/IdentityGovernance.tsx';t=read(rel)
t=sub_once(t,r"\n const reissue=async\(grant:any\)=>\{.*?\};",'',rel,'active reissue function',re.S)
t=re.sub(r"\{production&&<div className=\"mt-4 rounded-xl bg\[#E7EEE9\].*?</div>\}\n",'',t,count=1,flags=re.S)
# exact banner fallback if class-regex misses
banner="  {production&&<div className=\"mt-4 rounded-xl bg-[#E7EEE9] text-[#214C40] px-4 py-3 flex items-center gap-3\"><ShieldCheck className=\"w-4 h-4\"/><div className=\"text-[11px] font-bold flex-1\">{ar?'العزل والتجميد والحذف تفرض من الخادم، لا بإخفاء الأزرار.':'Isolation, freeze and removal are server-enforced.'}</div><button className=\"w-11 h-11 grid place-items-center\" onClick={()=>void loadRemote()} aria-label={ar?'تحديث':'Refresh'}><RefreshCcw className={`w-4 h-4 ${loading?'animate-spin':''}`}/></button></div>}\n"
t=t.replace(banner,'')
t=t.replace("{g.status==='ACTIVE'&&<IconButton title={ar?'إصدار QR جديد':'Reissue QR'} onClick={()=>void reissue(g)}><QrCode className=\"w-4 h-4\"/></IconButton>}",'')
t=t.replace("competitionScoped?(ar?'فريق هذه المسابقة فقط':'This competition team only'):(ar?'صلاحيات هذه الجهة':'Organization access')","competitionScoped?(ar?'فريق هذه المسابقة فقط':'This competition team only'):(ar?'مستخدمو هذه الجهة':'Organization users')")
t=t.replace("(ar?'رؤية مركزية للحسابات والدعوات وكل صلاحية حسب المسابقة.':'A central view of accounts, invitations and every competition-scoped grant.')","(ar?'الحسابات والدعوات المرتبطة بهذه الجهة تظهر هنا. موظفو كل مسابقة يديرهم مدير الجهة من المسابقة نفسها.':'Accounts and invitations for this organization appear here. Competition staff are managed by the organization from each competition.')")
write(rel,t)

# Tenant console: owner manages tenant creation/status/users; branding belongs to tenant itself.
rel='src/components/admin/TenantConsole.tsx';t=read(rel)
t=t.replace("import React,{useCallback,useEffect,useState} from 'react';import {Building2,Globe2,Plus,RefreshCw,ShieldCheck,XCircle,Sparkles,KeyRound} from 'lucide-react';","import React,{useCallback,useEffect,useState} from 'react';import {Building2,Globe2,Plus,RefreshCw,ShieldCheck,XCircle,UsersRound} from 'lucide-react';")
t=t.replace("import {TenantBrandStudio} from './TenantBrandStudio';",'')
t=t.replace("const [busy,setBusy]=useState('');const [brandOrg,setBrandOrg]=useState<string|null>(null);const [accessOrg,setAccessOrg]=useState<string|null>(null);","const [busy,setBusy]=useState('');const [accessOrg,setAccessOrg]=useState<string|null>(null);")
t=t.replace("{ar?'الإيقاف فعلي من الخادم، والهوية والصلاحيات لكل جهة مرئية للمالك من هنا.':'Suspension is server-enforced; tenant identity and access are visible here.'}","{ar?'أنشئ الجهة وأدر حالتها ومستخدميها الأساسيين. هوية الجهة وشعارها تديرهما الجهة بنفسها.':'Create the organization and manage its status and core users. The organization manages its own brand and logo.'}")
# Replace three-button block with users + suspend only.
t=sub_once(t,r"<div className=\"flex flex-wrap gap-2\"><Button size=\"sm\" variant=\"outline\" icon=\{<Sparkles.*?</Button><Button size=\"sm\" variant=\"outline\" icon=\{<KeyRound.*?</Button><Button size=\"sm\" variant=\"outline\" icon=\{suspended\?<ShieldCheck.*?</Button></div>","<div className=\"flex flex-wrap gap-2\"><Button size=\"sm\" variant=\"outline\" icon={<UsersRound className=\"w-4 h-4\"/>} onClick={()=>setAccessOrg(x=>x===t.orgId?null:t.orgId)}>{accessOrg===t.orgId?(ar?'إغلاق المستخدمين':'Close users'):(ar?'المستخدمون':'Users')}</Button><Button size=\"sm\" variant=\"outline\" icon={suspended?<ShieldCheck className=\"w-4 h-4\"/>:<XCircle className=\"w-4 h-4\"/>} disabled={busy===t.orgId} onClick={()=>void toggle(t)}>{busy===t.orgId?'…':suspended?(ar?'إعادة التفعيل':'Activate'):(ar?'إيقاف':'Suspend')}</Button></div>",rel,'tenant action buttons',re.S)
t=re.sub(r"\{brandOrg===t\.orgId&&<div.*?</div>\}","",t,count=1,flags=re.S)
write(rel,t)

# Header: Super Admin is a platform owner, not a venue operator. Keep search/help/language/logout.
rel='src/components/layout/Header.tsx';t=read(rel)
t=replace_once(t," const production=(import.meta.env as Record<string,string|undefined>).VITE_REQUIRE_AUTH==='true';"," const production=(import.meta.env as Record<string,string|undefined>).VITE_REQUIRE_AUTH==='true';\n const superAdmin=currentUser.role==='super_admin';",rel,'superadmin header flag')
t=t.replace('<LiveSupportControl/>','{!superAdmin&&<LiveSupportControl/>}')
t=t.replace('{onOpenExperienceHome&&<button','{!superAdmin&&onOpenExperienceHome&&<button')
t=t.replace('{onOpenKiosk&&canGate&&<button','{!superAdmin&&onOpenKiosk&&canGate&&<button')
t=t.replace('{onOpenCeremony&&canCeremony&&<button','{!superAdmin&&onOpenCeremony&&canCeremony&&<button')
old="      <button onClick={toggleOffline} className={`w-11 h-11 grid place-items-center rounded-xl transition ${isOffline?'bg-[#F2EADC] text-[#8a6738]':'hover:bg-[#efede7] text-[#66706a]'}`} title={isOffline?(language==='ar'?'استمرارية دون إنترنت':'Offline continuity'):(language==='ar'?'متصل':'Online')} aria-label={isOffline?(language==='ar'?'استمرارية دون إنترنت':'Offline continuity'):(language==='ar'?'متصل':'Online')}>{isOffline?<WifiOff className=\"w-4 h-4\"/>:<Wifi className=\"w-4 h-4\"/>}</button>\n      <EmergencyControl iconOnly/>"
new="      {!superAdmin&&<button onClick={toggleOffline} className={`w-11 h-11 grid place-items-center rounded-xl transition ${isOffline?'bg-[#F2EADC] text-[#8a6738]':'hover:bg-[#efede7] text-[#66706a]'}`} title={isOffline?(language==='ar'?'استمرارية دون إنترنت':'Offline continuity'):(language==='ar'?'متصل':'Online')} aria-label={isOffline?(language==='ar'?'استمرارية دون إنترنت':'Offline continuity'):(language==='ar'?'متصل':'Online')}>{isOffline?<WifiOff className=\"w-4 h-4\"/>:<Wifi className=\"w-4 h-4\"/>}</button>}\n      {!superAdmin&&<EmergencyControl iconOnly/>}"
t=replace_once(t,old,new,rel,'owner venue controls')
t=t.replace('      <RoleSwitcher/>','      {!superAdmin&&<RoleSwitcher/>}')
write(rel,t)

# Super Admin: remove non-persistent module toggles; tenants/users + owner MFA stay.
rel='src/components/admin/RolePortals.tsx';t=read(rel)
t=t.replace(" const store=useAppStore(); const {language,competition,participants,judges,auditLogs,organizations,featureFlags}=store; const ar=isAr(language);\n const modules=['ai_integrity','shadow_mode','hospitality','remote_rounds','broadcast','benchmark'];"," const store=useAppStore(); const {language,competition,participants,judges,auditLogs,organizations}=store; const ar=isAr(language);")
t=re.sub(r"\n   <div className=\"mizan-surface p-5 sm:p-6\"><div className=\"mizan-kicker\">\{ar\?'حوكمة الوحدات'.*?</div></div>","",t,count=1,flags=re.S)
write(rel,t)

# Competition config defaults: registration reflects the actually implemented public form;
# participant never manually initiates random draw.
rel='src/lib/competition-config.ts';t=read(rel)
t=t.replace("mode: 'hybrid',\n    accountMode: 'otp',","mode: 'public',\n    accountMode: 'no_account',")
t=t.replace("participantInitiatedDraw: true,","participantInitiatedDraw: false,")
write(rel,t)

# Store: clean category creation, clean new competition user-facing fields, registration open
# should be blocked by setup readiness—not judging-day source/runtime gates.
rel='src/lib/store.ts';t=read(rel)
t=sub_once(t,r"  const addCategory = \(\) => \{.*?\n  \};\n\n  const updateCategory",r'''  const addCategory = (input: Partial<Category> = {}) => {
    const id = newId('cat');
    const category: Category = {
      id, competitionId: globalState.competition.id, code:`CAT-${globalState.competition.categories.length+1}`,
      name:input.name?.trim()||'', nameArabic:input.nameArabic?.trim()||'', description:input.description||'', riwaya:input.riwaya||'', memorizationScope:input.memorizationScope||'', juzCount:Math.max(0,input.juzCount||0),
      genderConstraint:input.genderConstraint||'all', targetParticipants:Math.max(0,input.targetParticipants||0), targetDurationMinutes:Math.max(0,input.targetDurationMinutes||0), ruleSetId:input.ruleSetId||globalState.competition.ruleSet.id,
      minAge:input.minAge,maxAge:input.maxAge,questionsCount:input.questionsCount,ayatPerQuestion:input.ayatPerQuestion,pagePortion:input.pagePortion
    };
    globalState.competition = { ...globalState.competition, categories:[...globalState.competition.categories, category] };
    notify(); return category;
  };

  const updateCategory''',rel,'clean addCategory',re.S)
# Clear inherited user-facing competition fields after the spread.
t=t.replace("...JSON.parse(JSON.stringify(globalState.competition)), id:newId('comp'), name:nameEnglish, nameArabic, edition:'', status:'draft',\n      startDate:'', endDate:'', registrationStartDate:'', registrationEndDate:'', totalRegistered:0, totalApproved:0, totalAttended:0, currentDay:0,","...JSON.parse(JSON.stringify(globalState.competition)), id:newId('comp'), name:nameEnglish, nameArabic, displayName:undefined, displayNameArabic:undefined, logoUrl:undefined, edition:'', status:'draft',\n      country:'', timezone:'', venueName:'', venuesCount:0, automationLevel:'assisted', startDate:'', endDate:'', registrationStartDate:'', registrationEndDate:'', totalRegistered:0, totalApproved:0, totalAttended:0, currentDay:0,")
# Reset policy to baseline rather than inheriting another competition's customized policy.
anchor="      readinessChecklist:{datesConfigured:false,categoriesConfigured:false,ruleSetFrozen:false,judgesAssigned:false,quranSourceLocked:false,devicesRegistered:false,certificatesReady:false}\n    };"
if anchor in t:
    t=t.replace(anchor,anchor+"\n    base.policy={...getCompetitionPolicy({...base,policy:undefined} as Competition),updatedAt:new Date().toISOString(),frozenAt:undefined};",1)
# Replace publishCompetition up to next function.
t=sub_once(t,r"  const publishCompetition = \(\) => \{.*?\n  \};\n\n  const sourceResolvedQuestionPool",r'''  const publishCompetition = () => {
    const issues=getReadinessIssues(globalState.competition);
    if(issues.length)return {ok:false,issues:issues.map(x=>globalState.language==='ar'?x.ar:x.en),scientificBlockers:[],contradictions:[]};
    globalState.competition={...globalState.competition,status:'registration_open'};
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'COMPETITION_REGISTRATION_OPENED',entityType:'Competition',entityId:globalState.competition.id,humanSummaryArabic:'فتح التسجيل بعد اكتمال إعدادات التسجيل الأساسية.',humanSummaryEnglish:'Opened registration after core registration setup was complete.',currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify();return {ok:true,issues:[],scientificBlockers:[],contradictions:[]};
  };

  const sourceResolvedQuestionPool''',rel,'registration opening semantics',re.S)
write(rel,t)

# CompetitionOverview: remove duplicate access nav, add explicit publish feedback,
# explicit category draft/save, local logo upload, working-only registration controls,
# system-owned draw and clearer responsive panel status.
rel='src/components/admin/CompetitionOverview.tsx';t=read(rel)
t=t.replace('  Fingerprint, Gavel, LayoutDashboard, ListChecks, LockKeyhole, Network, Plus, QrCode, RadioTower,','  Fingerprint, Gavel, LayoutDashboard, ListChecks, LockKeyhole, Network, Plus, QrCode, RadioTower, FileUp,')
t=t.replace("import { IdentityGovernance } from './IdentityGovernance';\n",'')
t=t.replace("type MainView='overview'|'design'|'participants'|'operations'|'results'|'access'|'enterprise';","type MainView='overview'|'design'|'participants'|'operations'|'results'|'enterprise';")
t=t.replace(",{id:'access' as const,icon:ShieldCheck,ar:'الهوية والصلاحيات',en:'Identity & access'}",'')
t=t.replace("   {view==='access'&&<IdentityGovernance competitionId={competition.id}/>} \n",'')
# Overview rewrite only function header/body first section while preserving rest.
t=t.replace(" const {competition,participants,committees,sealApprovals}=store; const canPublish=['draft','configured'].includes(competition.status);\n const publish=()=>store.publishCompetition();"," const {competition,participants,committees,sealApprovals}=store; const canPublish=['draft','configured'].includes(competition.status); const [publishIssues,setPublishIssues]=useState<string[]>([]);\n const publish=()=>{const out=store.publishCompetition();setPublishIssues(out.ok?[]:out.issues||[ar?'تعذر فتح التسجيل.':'Could not open registration.'])};")
t=t.replace("{canPublish&&<Button disabled={readiness.length>0} onClick={publish} icon={<Activity className=\"w-4 h-4\"/>}>{ar?'فتح التسجيل':'Open registration'}</Button>}</div></div></section>","{canPublish&&<Button onClick={publish} icon={<Activity className=\"w-4 h-4\"/>}>{ar?'فتح التسجيل':'Open registration'}</Button>}</div></div>{publishIssues.length>0&&<div role=\"status\" className=\"mt-5 rounded-xl bg-[#F2EADC] text-[#725630] p-3 text-xs font-bold\"><div>{ar?'قبل فتح التسجيل أكمل التالي:':'Complete these before opening registration:'}</div><ul className=\"mt-2 list-disc list-inside space-y-1\">{publishIssues.map(x=><li key={x}>{x}</li>)}</ul></div>}</section>")
# Replace IdentitySection wholesale.
identity=r'''const IdentitySection=({store,ar}:{store:Store;ar:boolean})=>{const c=store.competition; const [selected,setSelected]=useState(c.categories[0]?.id||''); const cat=c.categories.find(x=>x.id===selected); const [adding,setAdding]=useState(false); const emptyDraft=()=>({nameArabic:'',name:'',riwaya:'',memorizationScope:'',juzCount:'',questionsCount:'',ayatPerQuestion:'',targetDurationMinutes:'',minAge:'',maxAge:'',genderConstraint:'all' as 'all'|'male'|'female'}); const [draft,setDraft]=useState(emptyDraft());
 const patch=(p:Partial<Competition>)=>store.updateCompetitionDetails(p); const patchCat=(p:Partial<Category>)=>cat&&store.updateCategory(cat.id,p);
 const saveCategory=()=>{if(!draft.nameArabic.trim()&&!draft.name.trim())return;const x=store.addCategory({nameArabic:draft.nameArabic.trim()||draft.name.trim(),name:draft.name.trim()||draft.nameArabic.trim(),riwaya:draft.riwaya.trim(),memorizationScope:draft.memorizationScope.trim(),juzCount:Number(draft.juzCount)||0,questionsCount:Number(draft.questionsCount)>0?Number(draft.questionsCount):undefined,ayatPerQuestion:Number(draft.ayatPerQuestion)>0?Number(draft.ayatPerQuestion):undefined,targetDurationMinutes:Number(draft.targetDurationMinutes)||0,minAge:Number(draft.minAge)>0?Number(draft.minAge):undefined,maxAge:Number(draft.maxAge)>0?Number(draft.maxAge):undefined,genderConstraint:draft.genderConstraint});setSelected(x.id);setDraft(emptyDraft());setAdding(false)};
 const uploadLogo=(file?:File)=>{if(!file)return;if(!file.type.startsWith('image/')||file.size>2*1024*1024){window.alert(ar?'اختر صورة PNG/SVG/JPG/WebP بحجم لا يتجاوز 2MB.':'Choose a PNG/SVG/JPG/WebP image up to 2MB.');return}const reader=new FileReader();reader.onload=()=>patch({logoUrl:String(reader.result||'')||undefined});reader.readAsDataURL(file)};
 return <div className="space-y-6"><SectionTitle title={ar?'هوية المسابقة':'Competition identity'} subtitle={ar?'بيانات المسابقة في الأعلى، والفئات تُضاف وتحفظ بشكل مستقل في الأسفل.':'Competition details are above; categories are added and saved independently below.'}/>
  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 [&>*]:min-w-0"><TextControl label={ar?'الاسم بالعربية':'Arabic name'} value={c.nameArabic} onChange={v=>patch({nameArabic:v})}/><TextControl label={ar?'الاسم بالإنجليزية':'English name'} value={c.name} onChange={v=>patch({name:v})}/><TextControl label={ar?'المنطقة الزمنية':'Timezone'} value={c.timezone} onChange={v=>patch({timezone:v})}/><TextControl label={ar?'المكان':'Venue'} value={c.venueName} onChange={v=>patch({venueName:v})}/><TextControl type="date" label={ar?'بداية المسابقة':'Start date'} value={c.startDate} onChange={v=>patch({startDate:v})}/><TextControl type="date" label={ar?'نهاية المسابقة':'End date'} value={c.endDate} onChange={v=>patch({endDate:v})}/><Control label={ar?'الأتمتة':'Automation'}><TinySelect value={c.automationLevel} onChange={v=>patch({automationLevel:v as any})}><option value="assisted">{automationLevelLabel('assisted',ar)}</option><option value="automated">{automationLevelLabel('automated',ar)}</option><option value="autopilot">{automationLevelLabel('autopilot',ar)}</option></TinySelect></Control><TextControl label={ar?'اسم العلامة لهذه المسابقة (يظهر بدل «ميزان»)':'Wordmark for this competition (replaces “MIZAN”)'} value={ar?(c.displayNameArabic||''):(c.displayName||'')} onChange={v=>patch(ar?{displayNameArabic:v||undefined}:{displayName:v||undefined})}/><Control label={ar?'شعار هذه المسابقة':'Competition logo'}><div className="rounded-xl border border-[#dcdad2] bg-white p-3"><div className="flex flex-wrap items-center gap-3">{c.logoUrl?<img src={c.logoUrl} alt={ar?'شعار المسابقة':'Competition logo'} className="w-16 h-16 rounded-xl object-contain border bg-white"/>:<div className="w-16 h-16 rounded-xl border border-dashed grid place-items-center text-[10px] text-[#777]">{ar?'لا شعار':'No logo'}</div>}<label className="min-h-11 px-4 rounded-xl bg-[#214C40] text-white text-xs font-black inline-flex items-center gap-2 cursor-pointer"><FileUp className="w-4 h-4"/>{c.logoUrl?(ar?'استبدال الشعار':'Replace logo'):(ar?'رفع الشعار':'Upload logo')}<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={e=>{uploadLogo(e.target.files?.[0]);e.currentTarget.value='' }}/></label>{c.logoUrl&&<button type="button" onClick={()=>patch({logoUrl:undefined})} className="min-h-11 px-4 rounded-xl border text-xs font-black">{ar?'حذف':'Remove'}</button>}</div></div></Control></div>
  <div className="border-t border-[#e5e3dc] pt-5"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-black">{ar?'الفئات':'Categories'}</div><p className="text-[10px] text-[#656b66] mt-1">{ar?'لا توجد فئة افتراضية. أضف الفئة التي تريدها ثم احفظها.':'There is no default category. Add the category you need, then save it.'}</p></div><button type="button" onClick={()=>setAdding(true)} className="min-h-11 px-3 rounded-xl inline-flex items-center gap-1 text-xs font-black text-[#214C40] border border-[#cddbd3] bg-white"><Plus className="w-4 h-4"/>{ar?'فئة':'Category'}</button></div>{!c.categories.length&&!adding&&<div className="mt-4 rounded-xl bg-[#f7f5ef] p-5 text-center text-xs text-[#656b66]">{ar?'لا توجد فئات بعد. اضغط «+ فئة» لإضافة الأولى.':'No categories yet. Press “+ Category” to add the first one.'}</div>}{c.categories.length>0&&<div className="flex gap-2 overflow-x-auto mt-3">{c.categories.map(x=><button key={x.id} onClick={()=>{setSelected(x.id);setAdding(false)}} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold border ${selected===x.id&&!adding?'bg-[#E7EEE9] text-[#214C40] border-[#b7ccc2]':'border-[#deddd6] bg-white text-[#626a65]'}`}>{ar?x.nameArabic:x.name}</button>)}</div>}</div>
  {adding&&<div className="rounded-2xl border border-[#cddbd3] bg-[#F7FAF8] p-4 sm:p-5 space-y-4"><div className="text-sm font-black">{ar?'إضافة فئة جديدة':'Add new category'}</div><div className="grid grid-cols-1 xl:grid-cols-2 gap-3 [&>*]:min-w-0"><TextControl label={ar?'اسم الفئة عربي':'Arabic category'} value={draft.nameArabic} onChange={v=>setDraft(d=>({...d,nameArabic:v}))}/><TextControl label={ar?'اسم الفئة إنجليزي':'English category'} value={draft.name} onChange={v=>setDraft(d=>({...d,name:v}))}/><TextControl label={ar?'الرواية / القراءة':'Riwaya / Qira’a'} value={draft.riwaya} onChange={v=>setDraft(d=>({...d,riwaya:v}))}/><TextControl label={ar?'نطاق الحفظ':'Scope'} value={draft.memorizationScope} onChange={v=>setDraft(d=>({...d,memorizationScope:v}))}/><DraftNumber label={ar?'الأجزاء':'Juz'} value={draft.juzCount} onChange={v=>setDraft(d=>({...d,juzCount:v}))}/><DraftNumber label={ar?'عدد الأسئلة':'Questions'} value={draft.questionsCount} onChange={v=>setDraft(d=>({...d,questionsCount:v}))}/><DraftNumber label={ar?'عدد الآيات لكل سؤال':'Ayat per question'} value={draft.ayatPerQuestion} onChange={v=>setDraft(d=>({...d,ayatPerQuestion:v}))}/><DraftNumber label={ar?'زمن مستهدف بالدقائق':'Target minutes'} value={draft.targetDurationMinutes} onChange={v=>setDraft(d=>({...d,targetDurationMinutes:v}))}/><DraftNumber label={ar?'العمر الأدنى':'Minimum age'} value={draft.minAge} onChange={v=>setDraft(d=>({...d,minAge:v}))}/><DraftNumber label={ar?'العمر الأعلى':'Maximum age'} value={draft.maxAge} onChange={v=>setDraft(d=>({...d,maxAge:v}))}/><Control label={ar?'الجنس حسب الشروط':'Gender constraint'}><TinySelect value={draft.genderConstraint} onChange={v=>setDraft(d=>({...d,genderConstraint:v as any}))}><option value="all">{ar?'الكل':'All'}</option><option value="male">{ar?'رجال':'Male'}</option><option value="female">{ar?'نساء':'Female'}</option></TinySelect></Control></div><div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={()=>{setDraft(emptyDraft());setAdding(false)}}>{ar?'إلغاء':'Cancel'}</Button><Button size="sm" disabled={!draft.nameArabic.trim()&&!draft.name.trim()} onClick={saveCategory}>{ar?'حفظ الفئة':'Save category'}</Button></div></div>}
  {!adding&&cat&&<div className="rounded-2xl bg-[#f4f2ec] p-4 sm:p-5 space-y-4"><div className="grid grid-cols-1 xl:grid-cols-2 gap-3 [&>*]:min-w-0"><TextControl label={ar?'اسم الفئة عربي':'Arabic category'} value={cat.nameArabic} onChange={v=>patchCat({nameArabic:v})}/><TextControl label={ar?'اسم الفئة إنجليزي':'English category'} value={cat.name} onChange={v=>patchCat({name:v})}/><TextControl label={ar?'الرواية / القراءة':'Riwaya / Qira’a'} value={cat.riwaya} onChange={v=>patchCat({riwaya:v})}/><TextControl label={ar?'نطاق الحفظ':'Scope'} value={cat.memorizationScope} onChange={v=>patchCat({memorizationScope:v})}/><NumberControl label={ar?'الأجزاء':'Juz'} value={cat.juzCount} onChange={v=>patchCat({juzCount:v})}/><NumberControl label={ar?'عدد الأسئلة (هذه الفئة)':'Questions (this category)'} value={cat.questionsCount||0} onChange={v=>patchCat({questionsCount:v>0?v:undefined})}/><Control label={ar?'مقدار الموضع من الوجه':'Passage size on the page'}><TinySelect value={cat.pagePortion||''} onChange={v=>patchCat({pagePortion:(v||undefined) as any})}><option value="">{ar?'تلقائي':'Automatic'}</option><option value="full">{ar?'وجه كامل':'Full page'}</option><option value="half">{ar?'نصف وجه':'Half page'}</option><option value="third">{ar?'ثلث وجه':'Third of a page'}</option><option value="quarter">{ar?'ربع وجه':'Quarter page'}</option></TinySelect></Control><NumberControl label={ar?'عدد الآيات لكل سؤال':'Ayat per question'} value={cat.ayatPerQuestion||0} onChange={v=>patchCat({ayatPerQuestion:v>0?v:undefined})}/><NumberControl label={ar?'زمن مستهدف بالدقائق':'Target minutes'} value={cat.targetDurationMinutes} onChange={v=>patchCat({targetDurationMinutes:v})}/><NumberControl label={ar?'العمر الأدنى':'Minimum age'} value={cat.minAge||0} onChange={v=>patchCat({minAge:v||undefined})}/><NumberControl label={ar?'العمر الأعلى':'Maximum age'} value={cat.maxAge||0} onChange={v=>patchCat({maxAge:v||undefined})}/><Control label={ar?'الجنس حسب الشروط':'Gender constraint'}><TinySelect value={cat.genderConstraint||'all'} onChange={v=>patchCat({genderConstraint:v as any})}><option value="all">{ar?'الكل':'All'}</option><option value="male">{ar?'رجال':'Male'}</option><option value="female">{ar?'نساء':'Female'}</option></TinySelect></Control><Control label={ar?'لائحة التحكيم':'Rule set'}><TinySelect value={cat.ruleSetId||c.ruleSet.id} onChange={v=>patchCat({ruleSetId:v})}>{(c.ruleSets||[c.ruleSet]).map(r=><option key={r.id} value={r.id}>{r.name} · {r.version}</option>)}</TinySelect></Control></div><div className="flex justify-end"><Button size="sm" variant="ghost" disabled={store.participants.some(p=>p.categoryId===cat.id)} onClick={()=>{if(store.removeCategory(cat.id))setSelected(c.categories.find(x=>x.id!==cat.id)?.id||'')}} icon={<Trash2 className="w-4 h-4"/>}>{ar?'حذف الفئة':'Remove category'}</Button></div></div>}
  <ShareRegistration c={c} ar={ar}/>
 </div>;
};
const DraftNumber=({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void})=><Control label={label}><input type="number" min="0" value={value} onChange={e=>onChange(e.target.value.replace(/[^0-9.]/g,''))} className="w-full rounded-xl border border-[#dcdad2] bg-white px-3 py-2.5 text-sm font-semibold" dir="ltr"/></Control>;

'''
t=sub_once(t,r"const IdentitySection=.*?\n\nconst RegistrationSection=",identity+'const RegistrationSection=',rel,'identity/category section',re.S)
# Registration: keep only controls wired to actual registration flow/store.
t=sub_once(t,r"const RegistrationSection=.*?\n\nconst WorkflowSection=",r'''const RegistrationSection=({ar,policy,patch}:{ar:boolean;policy:CompetitionPolicy;patch:(fn:(p:CompetitionPolicy)=>void)=>void})=><div className="space-y-5"><SectionTitle title={ar?'التسجيل والشروط':'Registration & rules'} subtitle={ar?'المتسابق يرى فقط الحقول والشروط التي تحتاجها هذه المسابقة.':'Participants see only the fields and rules used by this competition.'}/><div className="mizan-surface-soft px-4"><Toggle value={policy.registration.autoApproveEligible} onChange={v=>patch(p=>{p.registration.autoApproveEligible=v})} label={ar?'اعتماد تلقائي إذا استوفى الشروط':'Auto-approve when rules are met'}/><Toggle value={policy.registration.requireGuardianForMinors} onChange={v=>patch(p=>{p.registration.requireGuardianForMinors=v})} label={ar?'ولي أمر للقاصر':'Guardian for minors'}/></div><div><div className="text-xs font-black text-[#606662] mb-2">{ar?'حقول التسجيل':'Registration fields'}</div><div className="divide-y divide-[#e5e3dc] border-y border-[#e5e3dc]">{policy.registration.fields.map((f,i)=><RegistrationFieldRow key={f.id} f={f} ar={ar} onVisible={v=>patch(p=>{p.registration.fields[i].visible=v})} onRequired={v=>patch(p=>{p.registration.fields[i].required=v})}/>)}</div></div><div className="rounded-xl bg-[#F2EADC] text-[#725630] p-3 text-xs">{ar?'شروط الفئة مثل العمر والجنس والنطاق تُطبّق فوق هذه الحقول، وأي حالة غير محسومة تذهب للمراجعة البشرية.':'Category rules such as age, gender and scope apply on top of these fields; unresolved cases go to human review.'}</div></div>;

const WorkflowSection=''',rel,'working registration settings only',re.S)
# Remove participant-initiated draw explanatory paragraph/toggle.
t=re.sub(r"<p className=\"text-\[10px\] leading-5 text-\[#656b66\] mb-2\">\{ar\?'«يبدأ السحب».*?</p><Toggle value=\{policy\.questions\.participantInitiatedDraw\}.*?</Toggle>","",t,count=1,flags=re.S)
# clearer judging top layout.
t=t.replace('<div className="grid sm:grid-cols-2 gap-4"><Control label={ar?\'توزيع المهام\'','<div className="grid grid-cols-1 xl:grid-cols-2 gap-4 [&>*]:min-w-0"><Control label={ar?\'توزيع المهام\'',1)
# Operations status cards: replace tiny select with labeled full select and safer responsive card.
old="<div className=\"grid sm:grid-cols-2 xl:grid-cols-4 gap-3\">{store.committees.map(c=><div key={c.id} className=\"mizan-surface p-4\"><div className=\"flex justify-between\"><Badge variant={c.status==='offline'?'rose':c.status==='testing'?'blue':'emerald'}>{c.code}</Badge><select value={c.status} onChange={e=>store.updateCommittee(c.id,{status:e.target.value as any})} className=\"text-[11px] bg-transparent outline-none text-[#636864]\"><option value=\"ready\">{uiToken('ready',ar)}</option><option value=\"testing\">{uiToken('testing',ar)}</option><option value=\"paused\">{uiToken('paused',ar)}</option><option value=\"offline\">{uiToken('offline',ar)}</option></select></div>"
new="<div className=\"grid sm:grid-cols-2 xl:grid-cols-4 gap-3\">{store.committees.map(c=><div key={c.id} className=\"mizan-surface p-4 min-w-0\"><div className=\"flex items-start justify-between gap-3\"><Badge variant={c.status==='offline'?'rose':c.status==='testing'?'blue':'emerald'}>{c.code}</Badge><label className=\"min-w-[145px]\"><span className=\"block text-[9px] font-black text-[#656b66] mb-1\">{ar?'حالة اللجنة':'Panel status'}</span><select value={c.status} onChange={e=>store.updateCommittee(c.id,{status:e.target.value as any})} className=\"w-full rounded-xl border border-[#dcdad2] bg-white px-2 py-2 text-xs font-bold\"><option value=\"ready\">{uiToken('ready',ar)}</option><option value=\"testing\">{uiToken('testing',ar)}</option><option value=\"paused\">{uiToken('paused',ar)}</option><option value=\"offline\">{uiToken('offline',ar)}</option></select></label></div>"
t=replace_once(t,old,new,rel,'committee status control')
write(rel,t)

# Registration public flow: no fake participant defaults, explicit category, requested wording.
rel='src/components/public/RegistrationFlow.tsx';t=read(rel)
t=t.replace("const [form,setForm]=useState({fullNameArabic:'',fullName:'',email:'',phone:'',country:'Kuwait (الكويت)',nationality:'كويتي',nationalIdOrPassport:'',dateOfBirth:'2010-01-01',gender:'male' as 'male'|'female',categoryId:competition.categories[0]?.id||'',riwaya:competition.categories[0]?.riwaya||'حفص عن عاصم'});","const [form,setForm]=useState({fullNameArabic:'',fullName:'',email:'',phone:'',country:'',nationality:'',nationalIdOrPassport:'',dateOfBirth:'',gender:'male' as 'male'|'female',categoryId:'',riwaya:''});")
t=t.replace("الفئة هي التي تحدد النطاق والرواية وشروط الأهلية.","الفئة هي التي تحدد النطاق والرواية والشروط.")
t=t.replace("Category controls scope, riwaya and eligibility.","Category controls scope, riwaya and rules.")
write(rel,t)

# Deployment: never claim hardware the user did not enter.
rel='src/components/admin/DeploymentStudio.tsx';t=read(rel)
t=t.replace("useState<VenueInventory>({laptops:6,desktops:0,tablets:2,tvs:3,printers:1,usbScanners:0,edgeMiniPcs:0,wifi:true})","useState<VenueInventory>({laptops:0,desktops:0,tablets:0,tvs:0,printers:0,usbScanners:0,edgeMiniPcs:0,wifi:false})")
write(rel,t)

# Enterprise international/import: remove fake MZ417/KWI and provide an Excel-friendly CSV template.
rel='src/components/admin/EnterpriseWorkspace.tsx';t=read(rel)
intl=r'''const International=({s,ar}:{s:ReturnType<typeof useAppStore>;ar:boolean})=>{const [pid,setPid]=useState(s.participants[0]?.id||'');const [flight,setFlight]=useState('');const [airport,setAirport]=useState('');const travel=s.travelRecords.find(r=>r.participantId===pid);const schedule=()=>{if(!pid||!flight.trim()||!airport.trim())return;s.upsertTravelRecord(pid,{flightNumber:flight.trim(),arrivalAirport:airport.trim().toUpperCase(),transportStatus:'scheduled'});setFlight('');setAirport('')};const downloadTemplate=()=>{const headers=['fullName','fullNameArabic','email','phone','country','nationality','identity','dateOfBirth','gender','categoryId','riwaya','institution'];const cat=s.competition.categories[0];const sample=['Sample Name','اسم تجريبي','sample@example.com','+96500000000','Kuwait','Kuwaiti','P000000','2010-01-01','male',cat?.code||cat?.id||'CATEGORY_CODE',cat?.riwaya||'','Example Club'];const esc=(v:string)=>`"${String(v).replaceAll('"','""')}"`;const csv='\uFEFF'+headers.map(esc).join(',')+'\n'+sample.map(esc).join(',')+'\n';const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`mizan-participants-template-${s.competition.id}.csv`;a.click();URL.revokeObjectURL(a.href)};return <div className="grid xl:grid-cols-2 gap-4"><div className="mizan-surface p-5"><div className="flex items-center gap-2"><Plane className="w-4 h-4 text-[#2F6555]"/><h2 className="font-extrabold">{ar?'السفر والوفود':'Travel & delegations'}</h2></div>{s.participants.length?<><select value={pid} onChange={e=>setPid(e.target.value)} className="w-full mt-4 rounded-xl border border-[#ddd] px-3 py-2.5 text-sm"><option value="">{ar?'اختر متسابقًا':'Choose participant'}</option>{s.participants.slice(0,20).map(p=><option key={p.id} value={p.id}>{p.code} · {ar?p.fullNameArabic:p.fullName}</option>)}</select><div className="grid sm:grid-cols-2 gap-2 mt-3"><input dir="ltr" value={flight} onChange={e=>setFlight(e.target.value)} className="mizan-input" placeholder={ar?'رقم الرحلة':'Flight number'}/><input dir="ltr" value={airport} onChange={e=>setAirport(e.target.value)} className="mizan-input" placeholder={ar?'رمز المطار':'Airport code'}/></div><div className="grid grid-cols-2 gap-2 mt-3"><Button size="sm" variant="outline" disabled={!pid||!flight.trim()||!airport.trim()} onClick={schedule}>{ar?'جدولة الوصول':'Schedule arrival'}</Button><Button size="sm" variant="outline" disabled={!pid} onClick={()=>s.runRemoteCheck(pid)}>{ar?'فحص تأهل عن بعد':'Remote check'}</Button></div>{travel&&<div className="rounded-xl bg-[#f3f1eb] p-3 mt-3 text-xs font-semibold">{travel.flightNumber} · {travel.arrivalAirport} · {uiToken(travel.transportStatus,ar)}</div>}</>:<div className="py-8 text-center text-xs text-[#696f6b]">{ar?'أضف المتسابقين أولًا؛ لا توجد بيانات سفر افتراضية.':'Add participants first; no travel data is fabricated.'}</div>}</div><div className="mizan-surface p-5"><div className="flex items-center gap-2"><FileUp className="w-4 h-4 text-[#2F6555]"/><h2 className="font-extrabold">{ar?'الاستيراد':'Migration'}</h2></div><p className="text-xs text-[#636965] mt-2">{ar?'الاستيراد يتحقق من الملف كاملًا قبل إدخال أي سجل. إذا وُجد خطأ لا يتم الاستيراد.':'The whole file is validated before any record is committed. Errors stop the import.'}</p><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={downloadTemplate} icon={<Download className="w-4 h-4"/>}>{ar?'تحميل نموذج Excel':'Download Excel template'}</Button><label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#214C40] text-white px-3 py-2.5 text-xs font-bold"><FileUp className="w-4 h-4"/>{ar?'اختيار CSV':'Choose CSV'}<input type="file" accept=".csv,text/csv" className="sr-only" onChange={async e=>{const f=e.target.files?.[0];if(f){await s.importParticipantsCsv(f.name,await f.text());e.currentTarget.value=''}}}/></label></div><p className="mt-2 text-[10px] leading-5 text-[#656b66]">{ar?'النموذج يفتح مباشرة في Excel وهو بصيغة CSV المتوافقة مع الاستيراد. لا تغيّر أسماء الأعمدة واحذف صف المثال قبل الرفع.':'The template opens directly in Excel and uses the CSV format accepted by import. Keep the headers unchanged and delete the sample row before upload.'}</p>{s.importJobs[0]&&<div className="mt-4 grid grid-cols-3 gap-2"><Mini n={s.importJobs[0].totalRows} t={ar?'صف':'Rows'}/><Mini n={s.importJobs[0].validRows} t={ar?'صالح':'Valid'}/><Mini n={s.importJobs[0].invalidRows} t={ar?'مراجعة':'Review'}/></div>}{s.importJobs[0]?.errors?.length>0&&<div className="mt-3 rounded-xl bg-[#F4E6E3] text-[#89453d] p-3 text-[11px] font-semibold">{s.importJobs[0].errors.slice(0,3).map(e=><div key={`${e.row}-${e.message}`}>{ar?'صف':'Row'} {e.row}: {e.message}</div>)}</div>}</div></div>}
'''
t=sub_once(t,r"const International=.*?\nconst Shadow=",intl+'const Shadow=',rel,'international and import',re.S)
write(rel,t)

# Western digits for Arabic UI locale formatters: keep Arabic words but force latn digits.
for p in (ROOT/'src').rglob('*'):
    if p.suffix not in {'.ts','.tsx'}: continue
    txt=p.read_text(encoding='utf-8')
    nxt=txt.replace("'ar-KW'","'ar-KW-u-nu-latn'").replace('"ar-KW"','"ar-KW-u-nu-latn"').replace("'ar-SA'","'ar-SA-u-nu-latn'").replace('"ar-SA"','"ar-SA-u-nu-latn"')
    if nxt!=txt:
        p.write_text(nxt,encoding='utf-8');CHANGED.append(str(p.relative_to(ROOT)))

# Regression/source-contract tests for the behavior requested in this batch.
TEST=r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const s=(p:string)=>fs.readFileSync(p,'utf8');

test('MFA re-setup is generic, local, and enrolls new TOTP before old-factor cleanup',()=>{
 const x=s('src/components/auth/TotpSecurity.tsx');
 assert.match(x,/إعادة إعداد تطبيق المصادقة/);
 assert.match(x,/مفتاح الإعداد اليدوي \(Setup Key\)/);
 assert.match(x,/Apple Passwords/);
 assert.match(x,/RealQRCode value=\{uri\}/);
 assert.match(x,/multiFactor\(active\)\.enroll/);
 assert.match(x,/multiFactor\(active\)\.unenroll/);
 assert.ok(x.indexOf('multiFactor(active).enroll')<x.indexOf('multiFactor(active).unenroll'));
 assert.doesNotMatch(x,/localStorage|sessionStorage|api\.qrserver|quickchart|chart\.google/i);
});

test('MFA sign-in exposes factor choice if replacement temporarily leaves more than one TOTP',()=>{
 const x=s('src/components/auth/AuthPortal.tsx');
 assert.match(x,/mfaHintUid/);
 assert.match(x,/hints\.length>1/);
 assert.match(x,/تطبيق المصادقة/);
 assert.doesNotMatch(x,/افتح Google Authenticator/);
});

test('activated staff never get a reissue activation QR and technical enforcement copy is hidden',()=>{
 const x=s('src/components/admin/IdentityGovernance.tsx');
 assert.doesNotMatch(x,/reissue-qr/);
 assert.doesNotMatch(x,/العزل والتجميد والحذف تفرض من الخادم/);
});

test('competition access lives under its card, not duplicated inside competition navigation',()=>{
 const x=s('src/components/admin/CompetitionOverview.tsx');
 assert.doesNotMatch(x,/id:'access'/);
 assert.doesNotMatch(x,/IdentityGovernance competitionId/);
});

test('category creation is explicit and has no fake default category values',()=>{
 const overview=s('src/components/admin/CompetitionOverview.tsx');
 const store=s('src/lib/store.ts');
 assert.match(overview,/حفظ الفئة/);
 assert.match(overview,/لا توجد فئة افتراضية/);
 assert.doesNotMatch(store,/name:'New category'.*nameArabic:'فئة جديدة'/s);
 assert.doesNotMatch(store,/memorizationScope:'Custom'.*juzCount:30/s);
});

test('registration admin exposes only controls that the public flow actually consumes',()=>{
 const x=s('src/components/admin/CompetitionOverview.tsx');
 const a=x.indexOf('const RegistrationSection=');const b=x.indexOf('const WorkflowSection=',a);const section=x.slice(a,b);
 assert.doesNotMatch(section,/نوع التسجيل|Registration mode|طريقة الدخول|accountMode/);
 assert.match(section,/autoApproveEligible/);
 assert.match(section,/requireGuardianForMinors/);
});

test('participant never initiates the random draw from admin settings',()=>{
 const x=s('src/components/admin/CompetitionOverview.tsx');
 assert.doesNotMatch(x,/المتسابق يبدأ سحب سؤاله/);
 const cfg=s('src/lib/competition-config.ts');
 assert.match(cfg,/participantInitiatedDraw: false/);
});

test('venue and travel screens do not fabricate hardware or flights',()=>{
 const d=s('src/components/admin/DeploymentStudio.tsx');
 const e=s('src/components/admin/EnterpriseWorkspace.tsx');
 assert.match(d,/laptops:0,desktops:0,tablets:0,tvs:0,printers:0/);
 assert.doesNotMatch(e,/MZ 417/);
 assert.match(e,/تحميل نموذج Excel/);
});

test('super admin header is reduced to platform-owner controls and tenant brand stays tenant-owned',()=>{
 const h=s('src/components/layout/Header.tsx');const t=s('src/components/admin/TenantConsole.tsx');
 assert.match(h,/superAdmin=currentUser\.role==='super_admin'/);
 assert.match(h,/!superAdmin&&<EmergencyControl/);
 assert.match(h,/!superAdmin&&<RoleSwitcher/);
 assert.doesNotMatch(t,/TenantBrandStudio/);
 assert.match(t,/مستخدمو هذه الجهة|المستخدمون/);
});

test('open registration reports blockers instead of swallowing a disabled click',()=>{
 const x=s('src/components/admin/CompetitionOverview.tsx');
 assert.match(x,/publishIssues/);
 assert.doesNotMatch(x,/disabled=\{readiness\.length>0\}.*فتح التسجيل/s);
 const store=s('src/lib/store.ts');
 const a=store.indexOf('const publishCompetition =');const b=store.indexOf('const sourceResolvedQuestionPool',a);const block=store.slice(a,b);
 assert.match(block,/getReadinessIssues/);
 assert.doesNotMatch(block,/scientificSourcesForCompetition/);
});
'''
write('tests/final-ux-mfa-batch.test.ts',TEST)

# Extend existing MFA test assumptions to the new active-user path if needed.
rel='tests/totp-mfa-flow.test.ts';t=read(rel)
t=t.replace("assert.match(security,/multiFactor\\(user\\)\\.getSession\\(\\)/);","assert.match(security,/multiFactor\\(active\\)\\.getSession\\(\\)/);")
t=t.replace("assert.match(security,/generateQrCodeUrl\\(user\\.email\\|\\|user\\.uid,'MIZAN'\\)/);","assert.match(security,/generateQrCodeUrl\\(active\\.email\\|\\|active\\.uid,'MIZAN'\\)/);")
write(rel,t)

# Postconditions before CI.
checks={
 'MFA reset button':('src/components/auth/TotpSecurity.tsx','إعادة إعداد تطبيق المصادقة'),
 'Apple TOTP helper':('src/components/auth/TotpSecurity.tsx','Apple Passwords'),
 'no active QR reissue':('src/components/admin/IdentityGovernance.tsx','reissue-qr'),
 'no fake flight':('src/components/admin/EnterpriseWorkspace.tsx','MZ 417'),
 'no duplicate access nav':('src/components/admin/CompetitionOverview.tsx',"id:'access'"),
}
for label,(rel,needle) in checks.items():
    txt=read(rel)
    if label.startswith('no ') and needle in txt: raise RuntimeError(f'postcondition failed: {label}')
    if not label.startswith('no ') and needle not in txt: raise RuntimeError(f'postcondition failed: {label}')

print('Changed files:')
for x in sorted(set(CHANGED)): print(' -',x)
