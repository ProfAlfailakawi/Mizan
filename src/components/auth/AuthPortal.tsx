import React, {useState} from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { useAppStore } from '../../lib/store';
import { Button } from '../design-system/Button';
import { MizanLogo } from '../design-system/MizanLogo';

export const AuthPortal:React.FC=()=>{
 const {language}=useAppStore();const ar=language==='ar';
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
 const signIn=async()=>{setBusy(true);setMessage('');try{await signInWithEmailAndPassword(auth,email,password);}catch(e:any){setMessage(ar?(e?.code==='auth/invalid-credential'?'بيانات الدخول غير صحيحة':'تعذر تسجيل الدخول'):(e?.code==='auth/invalid-credential'?'Invalid credentials':'Sign-in failed'));}finally{setBusy(false)}};
 const reset=async()=>{if(!email)return setMessage(ar?'أدخل البريد الإلكتروني أولًا':'Enter your email first');setBusy(true);try{await sendPasswordResetEmail(auth,email);setMessage(ar?'تم إرسال رابط استعادة كلمة المرور':'Reset link sent');}catch{setMessage(ar?'تعذر إرسال رابط الاستعادة':'Could not send reset link');}finally{setBusy(false)}};
 return <div className="min-h-screen bg-[#F8F5ED] grid place-items-center p-5" dir={ar?'rtl':'ltr'}><div className="w-full max-w-md">
  <div className="text-center"><div className="flex justify-center"><MizanLogo language={language}/></div><div className="mizan-kicker mt-7">{ar?'وصول محمي':'Secure access'}</div><h1 className="text-3xl font-black mt-2 text-[#17352D]">{ar?'تسجيل الدخول':'Sign in'}</h1><p className="text-xs text-[#636864] mt-2 leading-6">{ar?'تُطبّق هوية المستخدم وصلاحيات المؤسسة قبل السماح بأي إجراء تشغيلي.':'Identity and tenant permissions are enforced before operational access.'}</p></div>
  <div className="mizan-surface p-6 mt-7"><label className="block"><span className="text-[10px] font-black text-[#646965]">{ar?'البريد الإلكتروني':'Email'}</span><div className="relative mt-2"><Mail className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-xl border border-[#ddd] ps-10 pe-3 py-3 text-sm"/></div></label>
  <label className="block mt-4"><span className="text-[10px] font-black text-[#646965]">{ar?'كلمة المرور':'Password'}</span><div className="relative mt-2"><LockKeyhole className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&signIn()} className="w-full rounded-xl border border-[#ddd] ps-10 pe-3 py-3 text-sm"/></div></label>
  {message&&<div className="mt-4 rounded-xl bg-[#f3f1eb] px-3 py-2.5 text-xs font-semibold">{message}</div>}<Button className="w-full mt-5" disabled={busy||!email||!password} onClick={signIn} icon={<ShieldCheck className="w-4 h-4"/>}>{busy?'…':ar?'دخول آمن':'Sign in'}</Button><button onClick={reset} className="w-full mt-4 text-xs font-bold text-[#45675b]">{ar?'نسيت كلمة المرور؟':'Forgot password?'}</button></div>
  <p className="text-[10px] text-[#686d6a] text-center mt-5 leading-5">{ar?'تخضع الأدوار الحساسة للمصادقة متعددة العوامل وسياسات التصعيد المعتمدة لدى المؤسسة.':'MFA and step-up policies are tenant-controlled.'}</p>
 </div></div>
}
