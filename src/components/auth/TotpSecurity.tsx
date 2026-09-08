import React, { useState } from 'react';
import {
 EmailAuthProvider,
 GoogleAuthProvider,
 TotpMultiFactorGenerator,
 multiFactor,
 reauthenticateWithCredential,
 reauthenticateWithPopup,
 sendEmailVerification,
 signOut,
 type TotpSecret,
} from '@firebase/auth';
import { CheckCircle2, Copy, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useAppStore } from '../../lib/store';
import { RealQRCode } from '../design-system/RealQRCode';

const errorCode=(error:unknown)=>String((error as {code?:string})?.code||'');

export const TotpSecurity:React.FC<{bootstrap?:boolean}>=({bootstrap=false})=>{
 const {language}=useAppStore();const ar=language==='ar';const user=auth.currentUser;
 const [password,setPassword]=useState('');const [code,setCode]=useState('');const [secret,setSecret]=useState<TotpSecret|null>(null);const [uri,setUri]=useState('');
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [enrolledNow,setEnrolledNow]=useState(false);const [refreshKey,setRefreshKey]=useState(0);
 const factors=user?multiFactor(user).enrolledFactors:[];const totpFactor=factors.find(f=>f.factorId===TotpMultiFactorGenerator.FACTOR_ID);const alreadyEnrolled=Boolean(totpFactor||enrolledNow);
 const usesPassword=Boolean(user?.providerData.some(p=>p.providerId==='password'));const usesGoogle=Boolean(user?.providerData.some(p=>p.providerId==='google.com'));
 void refreshKey;

 const explain=(e:unknown)=>{const c=errorCode(e);if(c==='auth/requires-recent-login')return ar?'أعد التحقق من هويتك ثم حاول مرة أخرى.':'Reauthenticate and try again.';if(c==='auth/wrong-password'||c==='auth/invalid-credential')return ar?'كلمة المرور غير صحيحة.':'Incorrect password.';if(c==='auth/invalid-verification-code')return ar?'رمز Authenticator غير صحيح أو انتهت مدته.':'The Authenticator code is invalid or expired.';if(c==='auth/unverified-email')return ar?'يجب توثيق البريد الإلكتروني أولًا.':'Verify your email first.';if(c==='auth/multi-factor-info-not-found')return ar?'تعذر قراءة عامل التحقق. أعد المحاولة.':'Could not read the MFA factor. Try again.';return ar?`تعذر إكمال التحقق (${c||'خطأ غير معروف'}).`:`Could not complete MFA (${c||'unknown error'}).`};

 const refreshUser=async()=>{if(!user)return;setBusy(true);try{await user.reload();setRefreshKey(v=>v+1);setMessage(user.emailVerified?(ar?'البريد موثّق. يمكنك متابعة التفعيل.':'Email verified. You can continue.'):(ar?'لم يظهر التوثيق بعد. افتح رابط التوثيق ثم أعد الفحص.':'Verification is not visible yet. Open the verification link, then check again.'));}finally{setBusy(false)}};
 const sendVerification=async()=>{if(!user)return;setBusy(true);setMessage('');try{await sendEmailVerification(user);setMessage(ar?'أرسلنا رابط توثيق البريد. افتحه ثم ارجع واضغط «تحققت من البريد».':'Verification email sent. Open it, then return and press “I verified my email”.');}catch(e){setMessage(explain(e))}finally{setBusy(false)}};

 const begin=async()=>{if(!user)return;if(!user.emailVerified){setMessage(ar?'وثّق بريدك الإلكتروني أولًا؛ Firebase لا يسمح بتسجيل MFA لبريد غير موثّق.':'Verify your email first; Firebase does not allow MFA enrollment on an unverified email.');return}if(usesPassword&&!password){setMessage(ar?'اكتب كلمة مرور حسابك لإعادة التحقق من هويتك.':'Enter your account password to reauthenticate.');return}setBusy(true);setMessage('');try{
   if(usesPassword&&user.email)await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,password));
   else if(usesGoogle)await reauthenticateWithPopup(user,new GoogleAuthProvider());
   else throw new Error('NO_REAUTH_PROVIDER');
   const session=await multiFactor(user).getSession();const generated=await TotpMultiFactorGenerator.generateSecret(session);const qr=generated.generateQrCodeUrl(user.email||user.uid,'MIZAN');
   setSecret(generated);setUri(qr);setPassword('');setMessage('');
  }catch(e){setMessage(errorCode(e)?explain(e):(ar?'لا توجد طريقة إعادة تحقق مدعومة لهذا الحساب.':'No supported reauthentication method is available for this account.'))}finally{setBusy(false)}};

 const confirm=async()=>{if(!user||!secret)return;const clean=code.replace(/\s+/g,'');if(!/^\d{6}$/.test(clean)){setMessage(ar?'اكتب رمز Authenticator المكوّن من 6 أرقام.':'Enter the 6-digit Authenticator code.');return}setBusy(true);setMessage('');try{const assertion=TotpMultiFactorGenerator.assertionForEnrollment(secret,clean);await multiFactor(user).enroll(assertion,'MIZAN Authenticator');await user.reload();setEnrolledNow(true);setSecret(null);setUri('');setCode('');setMessage(ar?'تم ربط Google Authenticator بحسابك بنجاح.':'Google Authenticator is now linked to your account.');}catch(e){setMessage(explain(e))}finally{setBusy(false)}};
 const copySecret=async()=>{if(!secret)return;try{await navigator.clipboard.writeText(secret.secretKey);setMessage(ar?'تم نسخ المفتاح الاحتياطي.':'Backup key copied.');}catch{setMessage(ar?'تعذر النسخ تلقائيًا. انسخ المفتاح يدويًا.':'Automatic copy failed. Copy the key manually.')}};
 const freshSignIn=()=>{void signOut(auth).catch(()=>{}).finally(()=>window.location.reload())};

 if(!user)return <div className="text-xs text-[#636864]">{ar?'سجّل الدخول أولًا.':'Sign in first.'}</div>;
 if(alreadyEnrolled)return <div className={bootstrap?'':'mizan-surface p-5 sm:p-6'}><div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl bg-[#E7EEE9] grid place-items-center shrink-0"><CheckCircle2 className="w-5 h-5 text-[#2F6555]"/></div><div className="min-w-0"><div className="font-black text-[#17352D]">{ar?'التحقق بخطوتين مفعّل':'Two-step verification is active'}</div><p className="text-xs text-[#636864] leading-6 mt-1">{ar?'حسابك مرتبط بتطبيق Authenticator. للدخول التالي ستستخدم كلمة المرور ثم رمز الـ6 أرقام.':'Your account is linked to an Authenticator app. Future sign-ins use your password and then the 6-digit code.'}</p></div></div>{bootstrap&&<button type="button" onClick={freshSignIn} className="mt-5 w-full min-h-11 rounded-xl bg-[#214C40] text-white text-xs font-black">{ar?'تسجيل دخول محمي الآن':'Continue with protected sign-in'}</button>}{message&&<div className="mt-3 text-xs font-bold text-[#214C40]">{message}</div>}</div>;

 return <div className={bootstrap?'':'mizan-surface p-5 sm:p-6'}>
  <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl bg-[#E7EEE9] grid place-items-center shrink-0"><ShieldCheck className="w-5 h-5 text-[#2F6555]"/></div><div><div className="font-black text-[#17352D]">{ar?'حماية حساب مالك المنصة':'Platform owner account protection'}</div><p className="text-xs text-[#636864] leading-6 mt-1">{ar?'اربط تطبيق Google Authenticator أو أي تطبيق TOTP متوافق. السر يبقى في جهازك ولا يُرسل إلى خدمة QR خارجية.':'Link Google Authenticator or another TOTP app. The secret stays in your browser and is never sent to an external QR service.'}</p></div></div>
  {!user.emailVerified?<div className="mt-5 rounded-2xl border border-[#e1d9bd] bg-[#fffaf0] p-4"><div className="text-xs font-black">{ar?'أولًا: وثّق البريد الإلكتروني':'First: verify your email'}</div><p className="text-[11px] text-[#666a67] leading-6 mt-1">{user.email}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void sendVerification()} className="min-h-11 px-4 rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-50">{ar?'إرسال رابط التوثيق':'Send verification email'}</button><button type="button" disabled={busy} onClick={()=>void refreshUser()} className="min-h-11 px-4 rounded-xl border border-[#d8d6cf] bg-white text-xs font-black disabled:opacity-50">{ar?'تحققت من البريد':'I verified my email'}</button></div></div>:!secret?<div className="mt-5"><div className="text-xs font-black">{ar?'1. أعد التحقق من هويتك':'1. Reauthenticate'}</div>{usesPassword&&<label className="block mt-3"><span className="text-[10px] font-black text-[#646965]">{ar?'كلمة مرور حسابك':'Account password'}</span><div className="relative mt-2"><LockKeyhole className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void begin()} className="mizan-input ps-10"/></div></label>}<button type="button" disabled={busy||(usesPassword&&!password)} onClick={()=>void begin()} className="mt-4 min-h-11 px-4 rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-50">{busy?'…':usesPassword?(ar?'تحقق وأنشئ QR':'Verify & create QR'):(ar?'التحقق بحساب Google وإنشاء QR':'Verify with Google & create QR')}</button></div>:<div className="mt-5"><div className="text-xs font-black">{ar?'2. امسح QR في Google Authenticator':'2. Scan the QR in Google Authenticator'}</div><div className="mt-4 flex justify-center"><div className="rounded-2xl border border-[#e0ded7] bg-white p-3"><RealQRCode value={uri} size={220} label={ar?'رمز QR لتفعيل Google Authenticator':'QR code for Google Authenticator enrollment'}/></div></div><div className="mt-4 rounded-xl bg-[#f3f1eb] p-3"><div className="text-[10px] font-black text-[#626864]">{ar?'المفتاح اليدوي الاحتياطي':'Manual backup key'}</div><div className="mt-2 flex items-center gap-2"><code className="flex-1 text-[11px] font-bold break-all select-all" dir="ltr">{secret.secretKey}</code><button type="button" onClick={()=>void copySecret()} className="w-11 h-11 rounded-lg border border-[#dad7cf] bg-white grid place-items-center" aria-label={ar?'نسخ المفتاح':'Copy key'}><Copy className="w-4 h-4"/></button></div></div><label className="block mt-4"><span className="text-[10px] font-black text-[#646965]">{ar?'3. اكتب الرمز المكوّن من 6 أرقام':'3. Enter the 6-digit code'}</span><div className="relative mt-2"><KeyRound className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} onKeyDown={e=>e.key==='Enter'&&void confirm()} className="mizan-input ps-10 text-center tracking-[0.3em] font-black" dir="ltr"/></div></label><div className="mt-4 flex gap-2"><button type="button" disabled={busy||code.length!==6} onClick={()=>void confirm()} className="min-h-11 flex-1 rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-50">{busy?'…':ar?'تأكيد وتفعيل MFA':'Confirm & enable MFA'}</button><button type="button" disabled={busy} onClick={()=>{setSecret(null);setUri('');setCode('');setMessage('')}} className="min-h-11 px-4 rounded-xl border border-[#dad7cf] bg-white text-xs font-black">{ar?'إلغاء':'Cancel'}</button></div></div>}
  {message&&<div className="mt-4 rounded-xl bg-[#f3f1eb] px-3 py-2.5 text-xs font-semibold leading-6">{message}</div>}
 </div>;
};

export const TotpSecurityCard:React.FC=()=> <TotpSecurity/>;
