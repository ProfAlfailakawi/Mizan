import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, Check, FileCheck2, UserRound } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { getCompetitionPolicy } from '../../lib/competition-config';
import { Button } from '../design-system/Button';
import { normalizeFieldValue, isValidEmail } from '../../lib/input-normalize';
import { searchCountries, countryStoredValue } from '../../lib/countries';
import {bilingualName,  localizedCountry } from '../../lib/ui-language';
import type { Participant } from '../../types';
import { describeScope } from '../../lib/quran-scope';
import { categoryScopeOf } from '../../lib/scope-engine';

const hashParam=(name:string)=>{if(typeof window==='undefined')return '';const raw=window.location.hash.split('?')[1]||'';return new URLSearchParams(raw).get(name)||''};

export const RegistrationFlow: React.FC<{onSuccess?:(participant:Participant)=>void;localPreview?:boolean}> = ({onSuccess,localPreview=false}) => {
 const store=useAppStore(); const {language,competition}=store; const ar=language==='ar'; const policy=getCompetitionPolicy(competition);
 const [step,setStep]=useState(0); const [submitted,setSubmitted]=useState<any>(null); const [submitting,setSubmitting]=useState(false); const [submitError,setSubmitError]=useState(''); const [termsAccepted,setTermsAccepted]=useState(false); const [privacyAccepted,setPrivacyAccepted]=useState(false); const [audioAccepted,setAudioAccepted]=useState(false); const [aiProcessingAccepted,setAiProcessingAccepted]=useState(false); const [guardianAccepted,setGuardianAccepted]=useState(false); const [guardianName,setGuardianName]=useState('');
 const requestedCategory=hashParam('category');
 const initialCategory=competition.categories.find(c=>c.id===requestedCategory)||competition.categories[0];
 const [form,setForm]=useState({fullNameArabic:'',fullName:'',email:'',phone:'',country:'Kuwait (الكويت)',nationality:'كويتي',nationalIdOrPassport:'',dateOfBirth:'2010-01-01',gender:'male' as 'male'|'female',categoryId:initialCategory?.id||'',riwaya:''});

 useEffect(()=>{
  // App يحمل الإسقاط المنشور في المسارات العامة. لا نطلب latest من داخل النموذج ولا
  // نستبدل الفئات أثناء تعبئة الطالب. إعادة الجلب هنا مسموحة فقط لمعاينة محلية صريحة.
  if(!localPreview||competition.categories?.length||competition.id==='comp-pending-setup')return;
  void store.loadPublicCompetition(competition.id);
 },[localPreview,competition.id,competition.categories?.length]);

 useEffect(()=>{
  const categories=competition.categories||[];
  const currentIsValid=categories.some(c=>c.id===form.categoryId);
  if(!categories.length){
   if(form.categoryId)setForm(f=>({...f,categoryId:''}));
   return;
  }
  // لا نُبقي معرّف فئة من نسخة قديمة إذا وصلت نسخة منشورة مختلفة للمسابقة.
  if(!currentIsValid){
   const cat=categories.find(c=>c.id===requestedCategory)||categories[0];
   setForm(f=>({...f,categoryId:cat.id,riwaya:''}));
  }
 },[competition.id,competition.categories,requestedCategory,form.categoryId]);
 const category=competition.categories.find(c=>c.id===form.categoryId); const age=Math.floor((Date.now()-new Date(form.dateOfBirth).getTime())/31557600000); const minor=Number.isFinite(age)&&age<18; const guardianRequired=minor&&policy.registration.requireGuardianForMinors;
 const requiredConsentsAccepted=termsAccepted&&privacyAccepted&&(!policy.judging.requireAudioRecording||audioAccepted);
 /* النطاق مصدره الفئة وحدها. المتسابق لا يعيد اختيار نطاق سبق أن حددته الجهة. */
 const categoryReading=String(category?.riwaya||'').trim();
 /* قد تُفتح الفئة على أكثر من رواية؛ الاختيار يبقى صريحًا ومن داخل القائمة المعلنة. */
 const allowedReadings=Array.from(new Set([categoryReading,...((category?.allowedRiwayat||[]).map(x=>String(x||'').trim()))].filter(Boolean)));
 const readingOk=!!category&&allowedReadings.includes(form.riwaya.trim());
 const steps=[{ar:'بياناتي',en:'Profile'},{ar:'مشاركتي',en:'Entry'},{ar:'مراجعة',en:'Review'}];
 const reviewStep=steps.length-1;
 const fieldValue=(id:string)=>({fullNameArabic:form.fullNameArabic,fullName:form.fullName,email:form.email,phone:form.phone,country:form.country,nationality:form.nationality,dateOfBirth:form.dateOfBirth,gender:form.gender,identity:form.nationalIdOrPassport} as Record<string,string>)[id]??'';
 const requiredProfileFields=policy.registration.fields.filter(f=>f.visible&&f.required);
 // البريد (إن كان ظاهرًا وله قيمة) لا يُقبل إلا بصيغة صحيحة قبل المتابعة.
 const emailField=policy.registration.fields.find(f=>f.visible&&f.type==='email');
 const emailOk=!emailField||(!emailField.required&&!form.email.trim())||isValidEmail(form.email);
 const canNext=step===0?(requiredProfileFields.every(f=>String(fieldValue(f.id)).trim().length>0)&&emailOk):step===1?readingOk:true;
  const submit=async()=>{
    if(submitting||!requiredConsentsAccepted||!readingOk||(guardianRequired&&(!guardianAccepted||!guardianName.trim())))return;
    setSubmitting(true);
    setSubmitError('');
    try{
      const response=await fetch(`/api/public/competitions/${encodeURIComponent(competition.id)}/register`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({...form,guardianName,website:'',consents:{terms:termsAccepted,privacy:privacyAccepted,guardian:guardianRequired?guardianAccepted:false,audioRecording:policy.judging.requireAudioRecording?audioAccepted:false,aiProcessing:policy.privacy.allowAiProcessing?aiProcessingAccepted:false}})
      });
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(String(body.code||`HTTP_${response.status}`));
      setSubmitted({...body.participant,journeyAccessToken:body.journeyAccessToken,guardianAccessToken:body.guardianAccessToken,journeyUrl:body.journeyUrl,guardianUrl:body.guardianUrl})
    }catch(error){
      const code=error instanceof Error?error.message:'SERVER_ERROR';
      setSubmitError(registrationError(code,ar))
    }finally{
      setSubmitting(false)
    }
  };
  if(submitted) return <div className="max-w-xl mx-auto px-4 py-16"><div className="mizan-surface p-8 text-center"><span className="w-14 h-14 rounded-full bg-[#E7EEE9] text-[#214C40] grid place-items-center mx-auto"><BadgeCheck className="w-7 h-7"/></span><div className="mizan-kicker mt-5">{submitted.code}</div><h1 className="text-2xl font-black mt-2">{submitted.status==='approved'?(ar?'تم قبول مشاركتك':'Participation approved'):(ar?'تم استلام طلبك':'Application received')}</h1><p className="text-sm text-[#636864] mt-2">{submitted.status==='approved'?(ar?'تم إنشاء ملفك ورحلتك فعليًا. احتفظ برابطك الخاص.':'Your participant record and journey are ready. Keep your private link.'):(ar?'تم إنشاء رحلتك، ويحتاج الطلب مراجعة وفق سياسة المسابقة.':'Your journey is ready while the application awaits policy review.')}</p><div className="mt-6 grid gap-2 sm:grid-cols-2"><Button onClick={()=>{if(onSuccess)onSuccess(submitted);else window.location.href=submitted.journeyUrl}}>{ar?'فتح رحلة الطالب':'Open participant journey'}</Button><Button variant="outline" onClick={()=>void navigator.clipboard.writeText(submitted.guardianUrl)}>{ar?'نسخ رابط ولي الأمر':'Copy guardian link'}</Button></div><p className="mt-4 text-[10px] leading-5 text-[#68706b]">{ar?'رابط ولي الأمر مستقل ويعمل من جهاز آخر. لن يظهر الرمزان الخامان مرة أخرى بعد مغادرة هذه الصفحة.':'The guardian link is independent and works on another device. Raw access codes are shown only now.'}</p></div></div>;
  return <div className="max-w-2xl mx-auto px-4 sm:px-6 py-7"><div className="mb-6"><div className="mizan-kicker">{ar?'التسجيل الإلكتروني':'ONLINE REGISTRATION'}</div><h1 className="text-3xl font-black mt-1">{bilingualName(competition,ar)}</h1><div className="flex items-center gap-1.5 mt-5">{steps.map((s,i)=><React.Fragment key={i}><span className={`w-8 h-8 rounded-full grid place-items-center text-xs font-black ${i<=step?'bg-[#214C40] text-white':'bg-[#e9e7e1] text-[#696f6b]'}`}>{i<step?<Check className="w-4 h-4"/>:i+1}</span>{i<steps.length-1&&<span className={`h-px flex-1 ${i<step?'bg-[#2F6555]':'bg-[#dcdad3]'}`}/>}</React.Fragment>)}</div></div>
  <div className="mizan-surface p-6 sm:p-8 min-h-[420px]">
   {step===0&&<div className="space-y-5"><Title icon={UserRound} title={ar?'بياناتك':'Your profile'} sub={ar?'تظهر فقط الحقول التي اختارتها هذه المسابقة.':'Only fields enabled by this competition are shown.'}/><div className="grid sm:grid-cols-2 gap-4">{policy.registration.fields.filter(f=>f.visible).map(f=>{
 const label=(ar?f.labelArabic:f.labelEnglish)+(f.required?' *':''); const value=fieldValue(f.id);
 const set=(raw:string)=>{ const map:Record<string,string>={fullNameArabic:'fullNameArabic',fullName:'fullName',email:'email',phone:'phone',country:'country',nationality:'nationality',dateOfBirth:'dateOfBirth',gender:'gender',identity:'nationalIdOrPassport'}; const key=map[f.id]; if(key)setForm(prev=>({...prev,[key]:normalizeFieldValue(f.id,f.type,raw)})); };
 // الدولة: قائمة كل دول العالم مع بحث سريع، بدل قائمة ثابتة قصيرة.
 if(f.id==='country'||f.id==='nationality'){const key=f.id;return <CountryField key={f.id} label={label} value={value} ar={ar} onChange={(v)=>setForm(prev=>({...prev,[key]:v}))}/>;}
 if(f.type==='select') return <label key={f.id} className="block"><span className="block text-xs font-black text-[#686f6a] mb-2">{label}</span><select value={value} onChange={e=>set(e.target.value)} className="mizan-input text-sm">{f.options?.map(o=><option key={o.value} value={o.value}>{ar?o.labelArabic:o.labelEnglish}</option>)}</select></label>;
 const invalid=f.type==='email'&&f.required&&value.trim().length>0&&!isValidEmail(value);
 return <div key={f.id}><Input label={label} type={f.type==='email'?'email':f.type==='date'?'date':f.type==='phone'?'tel':'text'} value={value} onChange={set} dir={f.id==='fullNameArabic'?'rtl':f.id==='fullName'||f.type==='email'?'ltr':undefined}/>{invalid&&<span className="mt-1 block text-[10px] font-bold text-[#A34D43]">{ar?'صيغة البريد غير صحيحة':'Invalid email format'}</span>}</div>;
 })}</div></div>}
   {step===1&&<div className="space-y-5"><Title icon={FileCheck2} title={ar?'اختر مشاركتك':'Choose your entry'} sub={ar?'الفئة تحدد نطاق الحفظ وشروط الأهلية، ثم تختار الرواية المعتمدة صراحةً قبل المتابعة.':'The category defines the memorization scope and eligibility; then explicitly confirm its approved reading before continuing.'}/><div className="space-y-2">{competition.categories.length?competition.categories.map(c=><button key={c.id} type="button" onClick={()=>setForm({...form,categoryId:c.id,riwaya:''})} className={`w-full p-4 rounded-2xl border text-start transition ${form.categoryId===c.id?'border-[#214C40] bg-[#E7EEE9]':'border-[#deddd6] bg-white hover:bg-[#f7f5ef]'}`}><div className="font-black text-sm">{bilingualName(c,ar)}</div><div className="text-[11px] text-[#636864] mt-1">{describeScope(categoryScopeOf(c),ar)}</div></button>):<div role="status" className="rounded-2xl border border-[#e0cfb4] bg-[#F5EDE2] p-5 text-center"><div className="text-sm font-black text-[#725630]">{ar?'لم تُنشر فئات التسجيل بعد':'Registration categories are not published yet'}</div><p className="text-xs text-[#77654a] mt-2">{ar?'راجع رابط المسابقة لاحقًا أو تواصل مع الجهة المنظمة.':'Please check this competition link later or contact the organizer.'}</p></div>}</div>{category&&<div className="rounded-2xl border border-[#dcdad2] bg-white p-4"><div className="text-xs font-black text-[#4e5752]">{ar?'الرواية':'Riwaya / reading'}</div>{allowedReadings.length?<div className="mt-3 space-y-2">{allowedReadings.map(r=>{const on=form.riwaya.trim()===r;return <button key={r} type="button" onClick={()=>setForm(f=>({...f,riwaya:r}))} aria-pressed={on} className={`w-full rounded-xl border px-4 py-3 text-start transition ${on?'border-[#214C40] bg-[#E7EEE9] text-[#214C40]':'border-[#deddd6] hover:bg-[#f7f5ef]'}`}><span className="inline-flex items-center gap-2 text-sm font-black"><span className={`w-5 h-5 rounded-full border grid place-items-center ${on?'border-[#214C40] bg-[#214C40] text-white':'border-[#bfc2be]'}`}>{on?<Check className="w-3.5 h-3.5"/>:null}</span>{r}</span></button>;})}</div>:<div role="alert" className="mt-3 rounded-xl bg-[#F4E6E3] p-3 text-xs font-bold text-[#87483f]">{ar?'هذه الفئة لم تُضبط لها رواية بعد. تواصل مع الجهة المنظمة.':'This category does not have an approved reading yet. Contact the organizer.'}</div>}{allowedReadings.length>0&&!readingOk&&<div role="status" className="mt-2 text-[11px] font-bold text-[#8a6536]">{ar?'اختر الرواية أعلاه للمتابعة.':'Select the reading above to continue.'}</div>}</div>}<div className="rounded-xl bg-[#f1efe9] p-3 text-xs text-[#656d68]">{policy.registration.autoApproveEligible?(ar?'إذا استوفيت الشروط الموضوعية يمكن اعتمادك تلقائيًا.':'Eligible applications may be auto-approved.'):(ar?'كل الطلبات تمر على مراجعة بشرية في هذه المسابقة.':'This competition requires human application review.')}</div></div>}
   {step===reviewStep&&<div className="space-y-5"><Title icon={BadgeCheck} title={ar?'مراجعة واحدة':'One final review'} sub={ar?'لن تعيد إدخال هذه البيانات في الاستقبال أو اللجنة أو الشهادة.':'These details will not be re-entered at gate, committee or certificate.'}/><div className="divide-y divide-[#e5e3dc]"><ReviewRow label={ar?'الاسم':'Name'} value={ar?form.fullNameArabic:form.fullName}/><ReviewRow label={ar?'الفئة':'Category'} value={ar?category?.nameArabic||'—':category?.name||'—'}/><ReviewRow label={ar?'الرواية':'Riwaya'} value={form.riwaya||'—'}/><ReviewRow label={ar?'البريد':'Email'} value={form.email}/></div><div className="rounded-2xl bg-[#f3f1eb] p-4 space-y-3"><Consent checked={termsAccepted} onChange={setTermsAccepted} label={ar?'أوافق على شروط المشاركة.':'I accept the participation terms.'}/><Consent checked={privacyAccepted} onChange={setPrivacyAccepted} label={ar?'أوافق على سياسة الخصوصية.':'I accept the privacy policy.'}/>{policy.judging.requireAudioRecording&&<Consent checked={audioAccepted} onChange={setAudioAccepted} label={ar?'أوافق على تسجيل تلاوتي صوتيًا؛ وهو مطلوب لهذه المسابقة وفق لائحتها.':'I consent to audio recording of my recitation; it is required by this competition policy.'}/>} {policy.privacy.allowAiProcessing&&<Consent checked={aiProcessingAccepted} onChange={setAiProcessingAccepted} label={ar?'أوافق اختياريًا على المعالجة التقنية المساندة عند تفعيلها. رفضها لا يمنع إرسال الطلب.':'I optionally consent to enabled assistive technical processing. Declining does not prevent submission.'}/>} {guardianRequired&&<div className="pt-2 border-t border-[#ddd] space-y-3"><input value={guardianName} onChange={e=>setGuardianName(e.target.value)} placeholder={ar?'اسم ولي الأمر':'Guardian name'} className="mizan-input text-sm"/><Consent checked={guardianAccepted} onChange={setGuardianAccepted} label={ar?'موافقة ولي الأمر على المشاركة.':'Guardian consent to participate.'}/></div>}</div></div>}
   {submitError&&<div role="alert" className="mt-5 rounded-xl bg-[#F4E6E3] p-3 text-xs font-bold text-[#87483f]">{submitError}</div>}
   <div className="mt-8 pt-5 border-t border-[#e5e3dc] flex items-center justify-between"><Button variant="ghost" disabled={step===0||submitting} onClick={()=>setStep(s=>Math.max(0,s-1))} icon={ar?<ArrowRight className="w-4 h-4"/>:<ArrowLeft className="w-4 h-4"/>}>{ar?'رجوع':'Back'}</Button>{step<reviewStep?<Button disabled={!canNext} onClick={()=>setStep(s=>s+1)} icon={ar?<ArrowLeft className="w-4 h-4"/>:<ArrowRight className="w-4 h-4"/>}>{ar?'التالي':'Next'}</Button>:<Button disabled={submitting||!requiredConsentsAccepted||!readingOk||(guardianRequired&&(!guardianAccepted||!guardianName.trim()))} onClick={()=>void submit()}>{submitting?'…':(ar?'إرسال الطلب':'Submit')}</Button>}</div>
  </div>
 </div>
}
const registrationError=(code:string,ar:boolean)=>{const key=code.split(':')[0];const labels:Record<string,[string,string]>={COMPETITION_NOT_FOUND:['لم نعثر على المسابقة.','Competition not found.'],COMPETITION_REGISTRATION_CLOSED:['التسجيل مغلق لهذه المسابقة.','Registration is closed for this competition.'],REGISTRATION_IDENTITY_REQUIRED:['رقم الهوية أو الجواز مطلوب وفق سياسة المسابقة.','ID or passport number is required by competition policy.'],REGISTRATION_CATEGORY_INVALID:['الفئة المختارة لم تعد متاحة. حدّث الصفحة واختر من جديد.','The selected category is no longer available.'],REGISTRATION_AGE_NOT_ELIGIBLE:['العمر لا يطابق شروط الفئة المختارة.','Age does not meet the selected category rules.'],REGISTRATION_GENDER_NOT_ELIGIBLE:['الفئة المختارة لا تطابق شروط المشاركة.','The selected category does not match the entry rules.'],REGISTRATION_CONSENT_REQUIRED:['يلزم قبول الشروط والخصوصية.','Terms and privacy consent are required.'],REGISTRATION_AUDIO_CONSENT_REQUIRED:['يلزم قبول تسجيل التلاوة صوتيًا لهذه المسابقة.','Audio recording consent is required for this competition.'],REGISTRATION_GUARDIAN_REQUIRED:['يلزم اسم وموافقة ولي الأمر.','Guardian name and consent are required.'],REGISTRATION_NOT_ELIGIBLE:['الطلب لا يطابق شروط الأهلية المنشورة.','The application does not meet published eligibility rules.'],REGISTRATION_POLICY_REQUIRES_REVIEW:['هذه الحالة تحتاج تسجيلًا بمراجعة الجهة.','This case requires organizer-assisted registration.'],RATE_LIMITED:['تكررت المحاولات سريعًا. انتظر قليلًا ثم حاول.','Too many attempts. Please wait and retry.'],PUBLIC_REGISTRATION_NOT_CONFIGURED:['خدمة التسجيل غير مهيأة على الخادم.','Registration service is not configured.'],FIRESTORE_UNAVAILABLE:['تعذّر الوصول إلى سجل المسابقة الرسمي الآن. لم يُنشأ تسجيل ناقص أو مخفي؛ حاول مجددًا بعد قليل.','The official competition store is unavailable right now. No hidden or partial registration was created; please try again shortly.'],FIRESTORE_PERMISSION_DENIED:['تعذر الحفظ بسبب صلاحيات الخادم. تواصل مع الجهة.','The server could not save due to a permission error.'],
 /* هذه رفضاتٌ يستطيع مقدّم الطلب إصلاحها بنفسه، وكانت كلها تسقط على «حدث خطأ في الخادم» —
    فيُقال له إن العطل من المنصة وهو في الحقيقة حقلٌ ينقصه رقم أو تاريخ. */
 REGISTRATION_EMAIL_INVALID:['صيغة البريد الإلكتروني غير صحيحة.','The email address is not valid.'],
 REGISTRATION_PHONE_INVALID:['صيغة رقم الهاتف غير صحيحة.','The phone number is not valid.'],
 REGISTRATION_DATE_OF_BIRTH_INVALID:['تاريخ الميلاد غير صحيح. تأكد من اليوم والشهر والسنة.','The date of birth is not valid.'],
 REGISTRATION_FIELD_REQUIRED:['أحد الحقول المطلوبة فارغ. راجع النموذج وأكمل الناقص.','A required field is empty. Review the form and complete it.'],
 REGISTRATION_READING_INVALID:['الرواية المختارة غير متاحة في هذه المسابقة.','The selected reading is not available in this competition.'],
 REGISTRATION_CLOSED:['التسجيل مغلق لهذه المسابقة.','Registration is closed for this competition.'],
 REGISTRATION_REJECTED:['لم يُقبل الطلب وفق شروط هذه المسابقة. تواصل مع الجهة المنظِّمة.','The application was not accepted under this competition\u2019s rules. Contact the organizer.'],
 REGISTRATION_NOT_CONFIGURED:['خدمة التسجيل غير مهيأة على الخادم.','Registration service is not configured.'],
 DUPLICATE_ID:['هذا الرقم مسجّل مسبقًا في هذه المسابقة.','This ID is already registered in this competition.']};if(labels[key])return labels[key][ar?0:1];if(code==='Failed to fetch'||code.startsWith('HTTP_'))return ar?'تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.':'Could not reach the server. Check your connection and retry.';return ar?'حدث خطأ في الخادم ولم يُسجل الطلب. أعد المحاولة.':'A server error occurred and the application was not saved.'};
const Input=({label,value,onChange,type='text',dir}:{label:string;value:string;onChange:(v:string)=>void;type?:string;dir?:'rtl'|'ltr'})=><label className="block"><span className="block text-xs font-black text-[#686f6a] mb-2">{label}</span><input type={type} dir={dir} value={value} onChange={e=>onChange(e.target.value)} className="mizan-input text-sm"/></label>;

/* حقل الدولة: قائمة كل دول العالم مع بحث سريع (عربي/إنجليزي/رمز). القيمة تُخزَّن ثنائية اللغة. */
const CountryField:React.FC<{label:string;value:string;ar:boolean;onChange:(v:string)=>void}>=({label,value,ar,onChange})=>{
 const [open,setOpen]=useState(false); const [q,setQ]=useState('');
 const results=useMemo(()=>searchCountries(q).slice(0,60),[q]);
 const shown=value?localizedCountry(value,ar):(ar?'اختر الدولة':'Select country');
 return <label className="block relative"><span className="block text-xs font-black text-[#686f6a] mb-2">{label}</span>
  <button type="button" onClick={()=>setOpen(o=>!o)} className="w-full rounded-xl border border-[#dcdad2] bg-white px-3 py-3 text-sm text-start flex items-center justify-between gap-2">
   <span className={value?'':'text-[#9a9f9b]'}>{shown}</span>
   <ArrowLeft className={`w-4 h-4 shrink-0 transition ${open?'-rotate-90':'rotate-90'}`}/>
  </button>
  {open&&<div className="absolute z-20 mt-1 w-full rounded-xl border border-[#dcdad2] bg-white shadow-lg overflow-hidden">
   <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder={ar?'ابحث عن دولة…':'Search country…'} className="w-full border-b border-[#eceae3] px-3 py-2.5 text-sm outline-none"/>
   <div className="max-h-64 overflow-y-auto">
    {results.length===0&&<div className="px-3 py-3 text-xs text-[#9a9f9b]">{ar?'لا توجد نتيجة':'No match'}</div>}
    {results.map(c=><button key={c.code} type="button" onClick={()=>{onChange(countryStoredValue(c));setOpen(false);setQ('')}} className="w-full text-start px-3 py-2.5 text-sm hover:bg-[#f3f1eb] flex items-center justify-between gap-3"><span>{ar?c.ar:c.en}</span><span className="text-[10px] text-[#9a9f9b]">{c.code}</span></button>)}
   </div>
  </div>}
 </label>;
};
const Title=({icon:Icon,title,sub}:{icon:React.ComponentType<{className?:string}>;title:string;sub:string})=><div className="flex items-start gap-3"><span className="w-10 h-10 rounded-xl bg-[#E7EEE9] text-[#214C40] grid place-items-center"><Icon className="w-5 h-5"/></span><div><h2 className="text-xl font-black">{title}</h2><p className="text-xs text-[#646965] mt-1">{sub}</p></div></div>;
const ReviewRow=({label,value}:{label:string;value:string})=><div className="py-3 flex items-center justify-between gap-4"><span className="text-xs text-[#646965]">{label}</span><span className="text-sm font-bold text-end">{value}</span></div>;

const Consent=({checked,onChange,label}:{checked:boolean;onChange:(v:boolean)=>void;label:string})=><label className="mizan-consent text-xs font-semibold text-[#4f5752]"><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)} className="w-4 h-4 accent-[#214C40]"/><span>{label}</span></label>;
