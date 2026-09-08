from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(text, encoding='utf-8')


def require(path: str, text: str, needle: str, label: str) -> None:
    if needle not in text:
        raise SystemExit(f'{path}: missing expected structure: {label}')


# -----------------------------------------------------------------------------
# QR encoder: retain the dependency-free implementation but add Version 6-L.
# This keeps TOTP secrets entirely in-browser instead of sending otpauth URIs to a
# third-party QR service. Version 6-L carries up to 134 UTF-8 bytes.
# -----------------------------------------------------------------------------
write('src/components/design-system/RealQRCode.tsx', r'''import React, { useMemo } from 'react';

// Dependency-free QR Model 2 encoder for MIZAN operational payloads.
// Version 4-L remains the compact default (78 UTF-8 bytes). Version 6-L is selected
// automatically for longer local-only payloads such as TOTP otpauth URIs (134 bytes).
// No QR payload ever leaves the browser.

type QrConfig={version:4|6;size:number;dataCodewords:number;eccPerBlock:number;blockDataLengths:number[];alignmentCenters:number[];maxUtf8Bytes:number};
const CONFIGS:QrConfig[]=[
 {version:4,size:33,dataCodewords:80,eccPerBlock:20,blockDataLengths:[80],alignmentCenters:[6,26],maxUtf8Bytes:78},
 {version:6,size:41,dataCodewords:136,eccPerBlock:18,blockDataLengths:[68,68],alignmentCenters:[6,34],maxUtf8Bytes:134},
];
const FORMAT_XOR=0x5412;
const FORMAT_POLY=0x537;

const gfExp=new Array<number>(512).fill(0);
const gfLog=new Array<number>(256).fill(0);
(function initGalois(){let x=1;for(let i=0;i<255;i++){gfExp[i]=x;gfLog[x]=i;x<<=1;if(x&0x100)x^=0x11d;}for(let i=255;i<512;i++)gfExp[i]=gfExp[i-255];})();
const gfMul=(a:number,b:number)=>a===0||b===0?0:gfExp[gfLog[a]+gfLog[b]];

function generatorPolynomial(degree:number){let poly=[1];for(let i=0;i<degree;i++){const next=new Array(poly.length+1).fill(0);for(let j=0;j<poly.length;j++){next[j]^=poly[j];next[j+1]^=gfMul(poly[j],gfExp[i]);}poly=next;}return poly;}
function reedSolomon(data:number[],degree:number){const gen=generatorPolynomial(degree);const rem=new Array(degree).fill(0);for(const byte of data){const factor=byte^rem[0];rem.shift();rem.push(0);for(let i=0;i<degree;i++)rem[i]^=gfMul(gen[i+1],factor);}return rem;}
function bitLength(n:number){let d=0;while(n){d++;n>>>=1;}return d;}
function bchFormat(data:number){let d=data<<10;while(bitLength(d)-bitLength(FORMAT_POLY)>=0)d^=FORMAT_POLY<<(bitLength(d)-bitLength(FORMAT_POLY));return ((data<<10)|d)^FORMAT_XOR;}

function configFor(text:string){const byteLength=new TextEncoder().encode(text).length;const config=CONFIGS.find(c=>byteLength<=c.maxUtf8Bytes);if(!config)throw new Error(`MIZAN QR payload exceeds ${CONFIGS.at(-1)!.maxUtf8Bytes} UTF-8 byte capacity`);return config;}

function encodeData(text:string,config:QrConfig){
 const bytes=Array.from(new TextEncoder().encode(text));const bits:number[]=[];const push=(value:number,count:number)=>{for(let i=count-1;i>=0;i--)bits.push((value>>>i)&1)};
 push(0b0100,4);push(bytes.length,8);bytes.forEach(b=>push(b,8));const maxBits=config.dataCodewords*8;for(let i=0;i<4&&bits.length<maxBits;i++)bits.push(0);while(bits.length%8)bits.push(0);
 const data:number[]=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=(b<<1)|(bits[i+j]||0);data.push(b);}let pad=true;while(data.length<config.dataCodewords){data.push(pad?0xec:0x11);pad=!pad;}
 const blocks:number[][]=[];let offset=0;for(const length of config.blockDataLengths){blocks.push(data.slice(offset,offset+length));offset+=length;}if(offset!==data.length)throw new Error('MIZAN QR block configuration mismatch');
 const ecc=blocks.map(block=>reedSolomon(block,config.eccPerBlock));const stream:number[]=[];const longest=Math.max(...blocks.map(b=>b.length));
 for(let i=0;i<longest;i++)for(const block of blocks)if(i<block.length)stream.push(block[i]);
 for(let i=0;i<config.eccPerBlock;i++)for(const block of ecc)stream.push(block[i]);
 return stream;
}

type Cell=boolean|null;
function mask0(row:number,col:number){return (row+col)%2===0;}
export function createQrMatrix(text:string){
 const config=configFor(text);const SIZE=config.size;const modules:Cell[][]=Array.from({length:SIZE},()=>Array<Cell>(SIZE).fill(null));
 const finder=(row:number,col:number)=>{for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){const rr=row+r,cc=col+c;if(rr<0||rr>=SIZE||cc<0||cc>=SIZE)continue;const dark=r>=0&&r<=6&&c>=0&&c<=6&&(r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4));modules[rr][cc]=dark;}};
 finder(0,0);finder(SIZE-7,0);finder(0,SIZE-7);
 for(let r=8;r<SIZE-8;r++)if(modules[r][6]===null)modules[r][6]=r%2===0;
 for(let c=8;c<SIZE-8;c++)if(modules[6][c]===null)modules[6][c]=c%2===0;
 const alignment=(row:number,col:number)=>{if(modules[row][col]!==null)return;for(let r=-2;r<=2;r++)for(let c=-2;c<=2;c++)modules[row+r][col+c]=Math.max(Math.abs(r),Math.abs(c))!==1;};
 for(const row of config.alignmentCenters)for(const col of config.alignmentCenters)alignment(row,col);
 // Reserve and write 15-bit format information: EC level L (01), mask 0.
 const format=bchFormat((0b01<<3)|0);
 for(let i=0;i<15;i++){
  const dark=((format>>>i)&1)===1;
  if(i<6)modules[i][8]=dark;else if(i<8)modules[i+1][8]=dark;else modules[SIZE-15+i][8]=dark;
  if(i<8)modules[8][SIZE-i-1]=dark;else if(i<9)modules[8][15-i]=dark;else modules[8][15-i-1]=dark;
 }
 modules[SIZE-8][8]=true;
 const stream=encodeData(text,config);let byteIndex=0,bitIndex=7,row=SIZE-1,inc=-1;
 for(let col=SIZE-1;col>0;col-=2){if(col===6)col--;while(true){for(let c=0;c<2;c++){const cc=col-c;if(modules[row][cc]!==null)continue;let dark=false;if(byteIndex<stream.length)dark=((stream[byteIndex]>>>bitIndex)&1)===1;if(mask0(row,cc))dark=!dark;modules[row][cc]=dark;bitIndex--;if(bitIndex<0){byteIndex++;bitIndex=7;}}row+=inc;if(row<0||row>=SIZE){row-=inc;inc=-inc;break;}}}
 return modules.map(r=>r.map(v=>Boolean(v)));
}

export const RealQRCode:React.FC<{value:string;size?:number;label?:string;className?:string}>=({value,size=160,label='رمز مرور ميزان',className=''})=>{
 const matrix=useMemo(()=>createQrMatrix(value),[value]);const quiet=4;const total=matrix.length+quiet*2;const path=useMemo(()=>{const parts:string[]=[];matrix.forEach((row,r)=>row.forEach((dark,c)=>{if(dark)parts.push(`M${c+quiet} ${r+quiet}h1v1h-1z`)}));return parts.join('');},[matrix]);
 return <svg className={className} width={size} height={size} viewBox={`0 0 ${total} ${total}`} role="img" aria-label={label} shapeRendering="crispEdges"><rect width={total} height={total} fill="#fffefb"/><path d={path} fill="#17221e"/></svg>;
};

export const makeMizanPassPayload=(participantCode:string)=>`MZ1|${participantCode.trim()}`;
export const parseMizanPassPayload=(raw:string)=>{const v=raw.trim();return v.startsWith('MZ1|')?v.slice(4).trim():v;};
''')

# -----------------------------------------------------------------------------
# TOTP enrollment surface. Firebase's secret and otpauth URI stay local; the user
# reauthenticates before a secret is generated. Unenrollment is deliberately omitted
# from this surface so the platform owner cannot accidentally remove their last factor.
# -----------------------------------------------------------------------------
write('src/components/auth/TotpSecurity.tsx', r'''import React, { useState } from 'react';
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
} from 'firebase/auth';
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
  {!user.emailVerified?<div className="mt-5 rounded-2xl border border-[#e1d9bd] bg-[#fffaf0] p-4"><div className="text-xs font-black">{ar?'أولًا: وثّق البريد الإلكتروني':'First: verify your email'}</div><p className="text-[11px] text-[#666a67] leading-6 mt-1">{user.email}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={()=>void sendVerification()} className="min-h-11 px-4 rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-50">{ar?'إرسال رابط التوثيق':'Send verification email'}</button><button type="button" disabled={busy} onClick={()=>void refreshUser()} className="min-h-11 px-4 rounded-xl border border-[#d8d6cf] bg-white text-xs font-black disabled:opacity-50">{ar?'تحققت من البريد':'I verified my email'}</button></div></div>:!secret?<div className="mt-5"><div className="text-xs font-black">{ar?'1. أعد التحقق من هويتك':'1. Reauthenticate'}</div>{usesPassword&&<label className="block mt-3"><span className="text-[10px] font-black text-[#646965]">{ar?'كلمة مرور حسابك':'Account password'}</span><div className="relative mt-2"><LockKeyhole className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void begin()} className="mizan-input ps-10"/></div></label>}<button type="button" disabled={busy||(usesPassword&&!password)} onClick={()=>void begin()} className="mt-4 min-h-11 px-4 rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-50">{busy?'…':usesPassword?(ar?'تحقق وأنشئ QR':'Verify & create QR'):(ar?'التحقق بحساب Google وإنشاء QR':'Verify with Google & create QR')}</button></div>:<div className="mt-5"><div className="text-xs font-black">{ar?'2. امسح QR في Google Authenticator':'2. Scan the QR in Google Authenticator'}</div><div className="mt-4 flex justify-center"><div className="rounded-2xl border border-[#e0ded7] bg-white p-3"><RealQRCode value={uri} size={220} label={ar?'رمز QR لتفعيل Google Authenticator':'QR code for Google Authenticator enrollment'}/></div></div><div className="mt-4 rounded-xl bg-[#f3f1eb] p-3"><div className="text-[10px] font-black text-[#626864]">{ar?'المفتاح اليدوي الاحتياطي':'Manual backup key'}</div><div className="mt-2 flex items-center gap-2"><code className="flex-1 text-[11px] font-bold break-all select-all" dir="ltr">{secret.secretKey}</code><button type="button" onClick={()=>void copySecret()} className="w-10 h-10 rounded-lg border border-[#dad7cf] bg-white grid place-items-center" aria-label={ar?'نسخ المفتاح':'Copy key'}><Copy className="w-4 h-4"/></button></div></div><label className="block mt-4"><span className="text-[10px] font-black text-[#646965]">{ar?'3. اكتب الرمز المكوّن من 6 أرقام':'3. Enter the 6-digit code'}</span><div className="relative mt-2"><KeyRound className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} onKeyDown={e=>e.key==='Enter'&&void confirm()} className="mizan-input ps-10 text-center tracking-[0.3em] font-black" dir="ltr"/></div></label><div className="mt-4 flex gap-2"><button type="button" disabled={busy||code.length!==6} onClick={()=>void confirm()} className="min-h-11 flex-1 rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-50">{busy?'…':ar?'تأكيد وتفعيل MFA':'Confirm & enable MFA'}</button><button type="button" disabled={busy} onClick={()=>{setSecret(null);setUri('');setCode('');setMessage('')}} className="min-h-11 px-4 rounded-xl border border-[#dad7cf] bg-white text-xs font-black">{ar?'إلغاء':'Cancel'}</button></div></div>}
  {message&&<div className="mt-4 rounded-xl bg-[#f3f1eb] px-3 py-2.5 text-xs font-semibold leading-6">{message}</div>}
 </div>;
};

export const TotpSecurityCard:React.FC=()=> <TotpSecurity/>;
''')

# -----------------------------------------------------------------------------
# Login challenge: after enrollment, Firebase intentionally throws
# auth/multi-factor-auth-required at the password step. Resolve that with the enrolled
# TOTP hint so the owner can actually get back in.
# -----------------------------------------------------------------------------
path='src/components/auth/AuthPortal.tsx';t=read(path)
old="import { createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail, signInWithEmailAndPassword, type User } from 'firebase/auth';"
new="import { createUserWithEmailAndPassword, deleteUser, getMultiFactorResolver, sendPasswordResetEmail, signInWithEmailAndPassword, TotpMultiFactorGenerator, type MultiFactorResolver, type User } from 'firebase/auth';"
require(path,t,old,'Firebase auth import');t=t.replace(old,new,1)
anchor=" const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');\n"
require(path,t,anchor,'auth state anchor');t=t.replace(anchor,anchor+" const [mfaResolver,setMfaResolver]=useState<MultiFactorResolver|null>(null); const [mfaCode,setMfaCode]=useState('');\n",1)
old_catch="""  }catch(e:unknown){
   const code=String((e as {code?:string;message?:string})?.code||'');
   const raw=String((e as Error)?.message||'');
   setMessage(ar?(AUTH_AR[code]||(raw.includes('ACTIVATION_')?`تعذر تفعيل الدعوة (${raw.split(':').pop()}).`:`تعذّر تسجيل الدخول (${code||'سبب غير معروف'}).`)):(code||raw||'Sign-in failed'));
  }finally{setBusy(false)}
 };"""
new_catch="""  }catch(e:unknown){
   const code=String((e as {code?:string;message?:string})?.code||'');
   const raw=String((e as Error)?.message||'');
   if(code==='auth/multi-factor-auth-required'){
    try{const resolver=getMultiFactorResolver(auth,e as Parameters<typeof getMultiFactorResolver>[1]);if(!resolver.hints.some(h=>h.factorId===TotpMultiFactorGenerator.FACTOR_ID)){setMessage(ar?'الحساب يتطلب عامل تحقق غير مدعوم في هذه الشاشة.':'This account requires an unsupported second factor.');return;}setMfaResolver(resolver);setMfaCode('');setPassword('');setMessage('');return;}catch{setMessage(ar?'تعذر بدء التحقق بخطوتين. أعد المحاولة.':'Could not start two-step verification. Try again.');return;}
   }
   setMessage(ar?(AUTH_AR[code]||(raw.includes('ACTIVATION_')?`تعذر تفعيل الدعوة (${raw.split(':').pop()}).`:`تعذّر تسجيل الدخول (${code||'سبب غير معروف'}).`)):(code||raw||'Sign-in failed'));
  }finally{setBusy(false)}
 };"""
require(path,t,old_catch,'sign-in catch');t=t.replace(old_catch,new_catch,1)
reset_anchor=" const reset=async()=>{if(!email)return setMessage(ar?'أدخل البريد الإلكتروني أولًا':'Enter your email first');setBusy(true);try{await sendPasswordResetEmail(auth,email);setMessage(ar?'تم إرسال رابط استعادة كلمة المرور':'Reset link sent');}catch{setMessage(ar?'تعذر إرسال رابط الاستعادة':'Could not send reset link');}finally{setBusy(false)}};\n\n"
require(path,t,reset_anchor,'reset anchor')
mfa_fn=r''' const finishMfaSignIn=async()=>{if(!mfaResolver)return;const clean=mfaCode.replace(/\s+/g,'');if(!/^\d{6}$/.test(clean)){setMessage(ar?'اكتب رمز Authenticator المكوّن من 6 أرقام.':'Enter the 6-digit Authenticator code.');return;}const hint=mfaResolver.hints.find(h=>h.factorId===TotpMultiFactorGenerator.FACTOR_ID);if(!hint){setMessage(ar?'عامل Authenticator غير موجود لهذا الحساب.':'No Authenticator factor is enrolled on this account.');return;}setBusy(true);setMessage('');try{const assertion=TotpMultiFactorGenerator.assertionForSignIn(hint.uid,clean);const cred=await mfaResolver.resolveSignIn(assertion);setMfaResolver(null);setMfaCode('');if(activationToken)await finishActivation(cred.user);}catch(e:unknown){const code=String((e as {code?:string})?.code||'');setMessage(code==='auth/invalid-verification-code'?(ar?'الرمز غير صحيح أو انتهت مدته. جرّب الرمز الحالي في التطبيق.':'The code is invalid or expired. Use the current code from your app.'):(ar?`تعذر إكمال التحقق (${code||'خطأ غير معروف'}).`:`Could not complete verification (${code||'unknown error'}).`));}finally{setBusy(false)}};

'''
t=t.replace(reset_anchor,mfa_fn+reset_anchor,1)
render_anchor=" const activating=Boolean(activationToken&&preview);\n"
require(path,t,render_anchor,'main render anchor')
mfa_render=r''' if(mfaResolver)return <div className="min-h-screen bg-[#F8F5ED] grid place-items-center p-5" dir={ar?'rtl':'ltr'}><div className="w-full max-w-md"><div className="text-center"><div className="flex justify-center"><MizanLogo language={language}/></div><div className="mizan-kicker mt-7">{ar?'تحقق بخطوتين':'TWO-STEP VERIFICATION'}</div><h1 className="text-3xl font-black mt-2 text-[#17352D]">{ar?'رمز Authenticator':'Authenticator code'}</h1><p className="text-xs text-[#636864] mt-2 leading-6">{ar?'افتح Google Authenticator واكتب الرمز الحالي المكوّن من 6 أرقام.':'Open Google Authenticator and enter the current 6-digit code.'}</p></div><div className="mizan-surface p-6 mt-7"><label className="block"><span className="text-[10px] font-black text-[#646965]">{ar?'رمز التحقق':'Verification code'}</span><div className="relative mt-2"><KeyRound className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#6a6f6c]"/><input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))} onKeyDown={e=>e.key==='Enter'&&void finishMfaSignIn()} className="w-full rounded-xl border border-[#ddd] ps-10 pe-3 py-3 text-center tracking-[0.3em] font-black" dir="ltr"/></div></label>{message&&<div className="mt-4 rounded-xl bg-[#f3f1eb] px-3 py-2.5 text-xs font-semibold">{message}</div>}<Button className="w-full mt-5" disabled={busy||mfaCode.length!==6} onClick={()=>void finishMfaSignIn()} icon={<ShieldCheck className="w-4 h-4"/>}>{busy?'…':ar?'تحقق وادخل':'Verify & sign in'}</Button><button type="button" onClick={()=>{setMfaResolver(null);setMfaCode('');setMessage('')}} className="w-full min-h-11 mt-3 text-xs font-bold text-[#45675b]">{ar?'العودة لتسجيل الدخول':'Back to sign in'}</button></div></div></div>;

'''
t=t.replace(render_anchor,mfa_render+render_anchor,1)
write(path,t)

# -----------------------------------------------------------------------------
# MFA_REQUIRED is now a bootstrap surface, not a dead end. Existing enrolled owners
# get a fresh-sign-in action; unenrolled owners can enroll in-place without logging out.
# -----------------------------------------------------------------------------
path='src/App.tsx';t=read(path)
import_anchor="import { AuthPortal } from './components/auth/AuthPortal';\n"
require(path,t,import_anchor,'AuthPortal import');t=t.replace(import_anchor,import_anchor+"import { TotpSecurity } from './components/auth/TotpSecurity';\n",1)
start=t.find(' if(requireAuth&&accessError) return <div')
end=t.find(' if(requireAuth&&!signedIn) return <AuthPortal/>;',start)
if start<0 or end<0:raise SystemExit(f'{path}: access error screen boundary not found')
replacement=r''' if(requireAuth&&accessError) return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] p-5"><div className="mizan-surface p-7 max-w-md w-full text-center"><div className="flex justify-center mb-4"><MizanLogo language="ar" compact/></div><div className="mizan-kicker">حوكمة الوصول</div><h1 className="text-xl font-black mt-2">{accessError==='MFA_REQUIRED'?'يلزم تحقق إضافي لهذا الحساب':accessError==='PRIVILEGED_SESSION_CONFLICT'?'الحساب مفتوح على جهاز حساس آخر':'الحساب غير مفوض'}</h1><p className="text-xs text-[#636864] mt-3 leading-6">{accessError==='MFA_REQUIRED'?'حساب مالك المنصة محمي بالتحقق بخطوتين. إذا لم تربط Authenticator بعد، أكمل التفعيل هنا دون تسجيل الخروج.':accessError==='PRIVILEGED_SESSION_CONFLICT'?'منع ميزان جلسة متزامنة لهذا الدور. يمكن لصاحب الصلاحية إغلاق الجلسة القديمة ثم المتابعة بأمان.':'الهوية صحيحة، لكن الحساب يحتاج دعوة وصلاحية محددة داخل الجهة قبل الدخول.'}</p>{accessError==='MFA_REQUIRED'&&<div className="mt-6 text-start"><TotpSecurity bootstrap/></div>}{accessError==='ACCOUNT_NOT_PROVISIONED'&&<div className="mt-5 text-start">{activationFromQr?<div className="rounded-2xl bg-[#E7EEE9] text-[#214C40] p-4 text-xs font-bold leading-6 text-center">{activationMessage==='ACTIVATING'?'تمت قراءة QR — جارٍ ربط الحساب بالدعوة…':'تمت قراءة QR التفعيل. سيُربط الحساب تلقائيًا بالبريد المدعو.'}</div>:<><label className="text-[10px] font-black text-[#616763]">رمز التفعيل الاحتياطي</label><input value={activationToken} onChange={e=>setActivationToken(e.target.value)} className="mizan-input mt-2" placeholder="ألصق الرمز فقط إذا تعذر مسح QR"/><button onClick={()=>void activateAccount()} className="mt-3 w-full rounded-xl bg-[#214C40] text-white py-2.5 text-xs font-black">تفعيل الحساب</button></>}{activationMessage&&activationMessage!=='ACTIVATING'&&<div className="mt-2 text-[10px] text-center text-[#656b66]">{activationMessage==='ACTIVATED'?'تم تفعيل الحساب':activationMessage==='ACTIVATION_FAILED'?'تعذر تفعيل الحساب':activationMessage}</div>}</div>}<div className="text-[10px] text-[#696f6b] mt-3">{accessError==='MFA_REQUIRED'?'تحقق إضافي مطلوب':accessError==='PRIVILEGED_SESSION_CONFLICT'?'تعارض جلسة حساسة':accessError==='ACCOUNT_NOT_PROVISIONED'?'الحساب بانتظار التفعيل':'تعذر التحقق من صلاحية الحساب'}</div>{accessError==='PRIVILEGED_SESSION_CONFLICT'&&<button onClick={()=>{void takeoverSession()}} className="mt-6 w-full rounded-2xl bg-[#214C40] text-white text-sm font-black py-3">متابعة هنا وإغلاق الجلسة الأخرى</button>}{accessError!=='MFA_REQUIRED'&&<button onClick={()=>{void signOut(auth).catch(()=>{}).finally(()=>window.location.reload())}} className="mt-5 text-xs font-bold text-[#214C40]">تسجيل الخروج</button>}</div></div>;
'''
t=t[:start]+replacement+t[end:]
write(path,t)

# -----------------------------------------------------------------------------
# Once the owner is inside with a true MFA-authenticated session, expose security state
# as a first-class card in the Super Admin console.
# -----------------------------------------------------------------------------
path='src/components/admin/RolePortals.tsx';t=read(path)
import_anchor="import { IdentityGovernance } from './IdentityGovernance';\n"
require(path,t,import_anchor,'IdentityGovernance import');t=t.replace(import_anchor,import_anchor+"import { TotpSecurityCard } from '../auth/TotpSecurity';\n",1)
portal_anchor="   <TenantConsole/>\n"
require(path,t,portal_anchor,'SuperAdmin TenantConsole');t=t.replace(portal_anchor,portal_anchor+"   <TotpSecurityCard/>\n",1)
write(path,t)

# -----------------------------------------------------------------------------
# Regression contracts.
# -----------------------------------------------------------------------------
write('tests/totp-mfa-flow.test.ts', r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createQrMatrix } from '../src/components/design-system/RealQRCode';

const source=(path:string)=>fs.readFileSync(path,'utf8');

test('QR encoder keeps compact passes and supports local TOTP otpauth payloads',()=>{
 assert.equal(createQrMatrix('MZ1|A-104').length,33);
 const totp='otpauth://totp/MIZAN:owner%40example.com?secret=ABCDEFGHIJKLMNOPQRSTUVWX234567&issuer=MIZAN&algorithm=SHA1&digits=6&period=30';
 assert.ok(new TextEncoder().encode(totp).length>78);
 assert.ok(new TextEncoder().encode(totp).length<=134);
 assert.equal(createQrMatrix(totp).length,41);
 assert.throws(()=>createQrMatrix('x'.repeat(135)),/exceeds 134/);
});

test('owner can enroll TOTP from the MFA-required bootstrap without external QR services',()=>{
 const security=source('src/components/auth/TotpSecurity.tsx');
 const app=source('src/App.tsx');
 assert.match(security,/multiFactor\(user\)\.getSession\(\)/);
 assert.match(security,/TotpMultiFactorGenerator\.generateSecret/);
 assert.match(security,/assertionForEnrollment/);
 assert.match(security,/reauthenticateWithCredential/);
 assert.match(security,/generateQrCodeUrl\(user\.email\|\|user\.uid,'MIZAN'\)/);
 assert.match(security,/<RealQRCode value=\{uri\}/);
 assert.doesNotMatch(security,/api\.qrserver|chart\.google|quickchart/i);
 assert.match(app,/accessError==='MFA_REQUIRED'.*<TotpSecurity bootstrap\/>/s);
});

test('password login resolves the enrolled TOTP second-factor challenge',()=>{
 const auth=source('src/components/auth/AuthPortal.tsx');
 assert.match(auth,/auth\/multi-factor-auth-required/);
 assert.match(auth,/getMultiFactorResolver/);
 assert.match(auth,/assertionForSignIn/);
 assert.match(auth,/resolveSignIn/);
 assert.match(auth,/Authenticator/);
});

test('Super Admin console exposes account security state after protected sign-in',()=>{
 const portals=source('src/components/admin/RolePortals.tsx');
 const start=portals.indexOf('export const SuperAdminConsole');
 const end=portals.indexOf('export const OrganizationHome',start);
 assert.ok(start>=0&&end>start);
 assert.match(portals.slice(start,end),/<TotpSecurityCard\/>/);
});
''')

print('TOTP MFA source implementation applied.')
