import React from 'react';
import { CircleHelp, X, ShieldCheck, ScanSearch, Ticket, Gavel, Microscope, RadioTower, UserRound } from 'lucide-react';
import type { Role } from '../../types';

type Props={open:boolean;onClose:()=>void;role:Role;ar:boolean};
type Step={titleAr:string;titleEn:string;noteAr:string;noteEn:string};

const ROLE_GUIDE:Partial<Record<Role,{titleAr:string;titleEn:string;steps:Step[]}>>={
 participant:{titleAr:'رحلتك باختصار',titleEn:'Your journey',steps:[
  {titleAr:'خذ رقمك',titleEn:'Take your number',noteAr:'رقم الوصول الأصلي يبقى ثابتًا حتى لو تغيّرت لجنتك.',noteEn:'Your original arrival number remains fixed even if your panel changes.'},
  {titleAr:'انتظر الاستدعاء',titleEn:'Wait for the call',noteAr:'الشاشة تعرض الكود واللجنة دون معلومات خاصة غير لازمة.',noteEn:'The display shows only the code and panel information needed.'},
  {titleAr:'ادخل اللجنة',titleEn:'Enter the panel',noteAr:'لا يُكشف السؤال للمحكمين قبل التأكد من وجودك.',noteEn:'The question stays sealed until your presence is confirmed.'},
 ]},
 judge:{titleAr:'التحكيم في أربع خطوات',titleEn:'Judging in four steps',steps:[
  {titleAr:'أكد الحضور',titleEn:'Confirm presence',noteAr:'لا يظهر موضع الاختبار قبل وجود المتسابق أمام اللجنة.',noteEn:'The passage is hidden until the participant is physically present.'},
  {titleAr:'وافق على الكشف',titleEn:'Approve reveal',noteAr:'كل محكم مكلّف يوافق بشكل مستقل حسب سياسة المسابقة.',noteEn:'Each assigned judge approves independently under competition policy.'},
  {titleAr:'احكم باستقلال',titleEn:'Judge independently',noteAr:'لا ترى درجات بقية المحكمين ولا إشارات الذكاء قبل القفل.',noteEn:'Other judges’ scores and AI observations stay hidden before lock.'},
  {titleAr:'أنهِ الموضع ثم اقفل',titleEn:'End then lock',noteAr:'النظام ينطق إشارة التوقف ثم ينتقل؛ الدرجة الرسمية بشرية.',noteEn:'The system plays the stop cue and transitions; official scoring remains human.'},
 ]},
 head_judge:{titleAr:'ما يحتاجك فقط',titleEn:'Only what needs you',steps:[
  {titleAr:'راجع الاختلافات',titleEn:'Review disagreements',noteAr:'تصل لك الحالات التي تحتاج قرارًا بشريًا أو علميًا.',noteEn:'Only cases needing human or scientific review reach you.'},
  {titleAr:'لا تغيّر حكم المحكم سرًا',titleEn:'No silent override',noteAr:'أي قرار أو تعديل يبقى مسجلًا في سجل التدقيق.',noteEn:'Every decision or adjustment remains in the audit trail.'},
 ]},
 ops_manager:{titleAr:'تشغيل عادل وهادئ',titleEn:'Fair, calm operations',steps:[
  {titleAr:'راقب الاختناقات',titleEn:'Watch bottlenecks',noteAr:'ركز على الانتظار، الأعطال، واللجان المتوقفة فقط.',noteEn:'Focus on waiting, failures, and unavailable panels.'},
  {titleAr:'انقل بدون ظلم',titleEn:'Transfer fairly',noteAr:'يمكن نقل صف كامل أو متسابق واحد مع حفظ أسبقيته الأصلية أو إرساله لآخر الصف.',noteEn:'Move a whole queue or one participant while preserving original priority or placing them last.'},
  {titleAr:'كل نقل مدقق',titleEn:'Every move audited',noteAr:'السبب والمنفذ وترتيب ما قبل/بعد النقل محفوظ.',noteEn:'Reason, actor, and before/after ordering are recorded.'},
 ]},
 comp_admin:{titleAr:'من اللائحة إلى يوم المسابقة',titleEn:'From policy to event day',steps:[
  {titleAr:'اضبط السياسة',titleEn:'Set the policy',noteAr:'الفئات، السحب، التحكيم، النتائج، الخصوصية، والصوت.',noteEn:'Categories, draw, judging, results, privacy, and audio.'},
  {titleAr:'شغّل الجاهزية',titleEn:'Run readiness',noteAr:'المانع الأحمر يجب إصلاحه؛ التحذير يحتاج قرارًا واعيًا.',noteEn:'Red blockers must be fixed; warnings require an informed decision.'},
  {titleAr:'شغّل البروفة',titleEn:'Run rehearsal',noteAr:'سجلات البروفة منفصلة ولا تلوث النتائج الرسمية.',noteEn:'Rehearsal records stay isolated from official results.'},
 ]},
 scientific_admin:{titleAr:'الثقة العلمية أولًا',titleEn:'Scientific trust first',steps:[
  {titleAr:'مصدر القرآن',titleEn:'Quran source',noteAr:'اعتماد نسخة محددة ببصمتها، لا نص مولّد ولا تحويل بين الروايات.',noteEn:'Approve an exact hashed source package; never generated or converted Quran text.'},
  {titleAr:'الصوت المرجعي',titleEn:'Reference audio',noteAr:'اعتمد تسجيلًا محدد القراءة والآية والبصمة قبل استخدامه في بداية السؤال.',noteEn:'Approve reading-, ayah-, and hash-scoped audio before it can prompt a contestant.'},
  {titleAr:'قدرة الذكاء',titleEn:'AI capability',noteAr:'كل قدرة تُعتمد وحدها لنموذج وإصدار ورواية ونطاق محدد.',noteEn:'Each capability is certified separately for an exact model, version, reading, and scope.'},
 ]},
 auditor:{titleAr:'أثبت، لا تفترض',titleEn:'Verify, do not assume',steps:[
  {titleAr:'تتبّع المصدر',titleEn:'Trace provenance',noteAr:'انتقل من النتيجة إلى السياسة والمصدر والبصمة والموافقات.',noteEn:'Trace the result to policy, source, hash, and approvals.'},
  {titleAr:'تحقق من الإثبات',titleEn:'Verify proof',noteAr:'الختم، Merkle، السحب العادل، والشهادة لها أدلة قابلة للفحص.',noteEn:'Seal, Merkle, FairDraw, and certificate evidence can be checked.'},
 ]},
};

const TERMS:Step[]=[
 {titleAr:'السحب العادل',titleEn:'FairDraw',noteAr:'اختيار يمكن إعادة إنتاجه والتحقق من التزامه ونسخة مجموعة الأسئلة.',noteEn:'A draw that can be reproduced and checked against its commitment and pool version.'},
 {titleAr:'الختم',titleEn:'Seal',noteAr:'حالة تمنع التغيير الصامت وتربط النتيجة بدليل وتدقيق.',noteEn:'A state that prevents silent change and binds the result to evidence and audit.'},
 {titleAr:'مصدر معتمد',titleEn:'Certified source',noteAr:'حزمة قرآن محددة النسخة والبصمة وافق عليها المختصون المخولون.',noteEn:'An exact versioned Quran package whose hash was approved by authorized scientific reviewers.'},
 {titleAr:'مراجعة متاحة',titleEn:'Review available',noteAr:'إشارة للمراجعة بعد قفل الحكم؛ ليست خصمًا ولا حكمًا آليًا.',noteEn:'A post-lock review signal, never an automatic deduction or judgment.'},
 {titleAr:'حجز السؤال',titleEn:'Question escrow',noteAr:'يبقى نص السؤال خارج جهاز المحكم في الوضع الإنتاجي الآمن، ولا يُفرج عنه إلا بعد حضور المتسابق واكتمال موافقات اللجنة.',noteEn:'In secure production mode, question plaintext stays off the judge device until participant presence and panel approval.'},
 {titleAr:'أسبقية الدور',titleEn:'Queue priority',noteAr:'رقم الوصول الأصلي لا يتغير. عند نقل المتسابق يمكن حفظ أسبقيته أو نقله لآخر الصف بقرار صريح ومدقق.',noteEn:'Original arrival priority is immutable; a transfer can preserve it or explicitly move the participant last.'},
 {titleAr:'اعتماد قدرة AI',titleEn:'AI capability certification',noteAr:'الاعتماد يخص قدرة محددة ونموذجًا وإصدارًا ورواية ونطاقًا بعينه؛ لا يوجد اعتماد شامل للنموذج.',noteEn:'Certification applies to one capability, model/version, reading and scope; never to the model globally.'},
];

export const ClarityGuide:React.FC<Props>=({open,onClose,role,ar})=>{
 if(!open)return null;
 const guide=ROLE_GUIDE[role]||{titleAr:'دليل سريع',titleEn:'Quick guide',steps:TERMS.slice(0,3)};
 const roleIcon=role==='judge'?Gavel:role==='scientific_admin'?Microscope:role==='ops_manager'?RadioTower:role==='participant'?UserRound:ShieldCheck;
 const Icon=roleIcon;
 return <div className="fixed inset-0 z-[90] bg-[#171b18]/35 backdrop-blur-[2px]" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <aside className={`absolute top-0 bottom-0 w-full max-w-md bg-[#FFFEFB] shadow-2xl p-5 sm:p-6 overflow-y-auto ${ar?'left-0 border-r':'right-0 border-l'} border-[#dedcd5]`} role="dialog" aria-modal="true" aria-label={ar?'دليل مبسط':'Plain-language guide'}>
   <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><span className="w-11 h-11 rounded-2xl bg-[#E7EEE9] text-[#214C40] grid place-items-center"><Icon className="w-5 h-5"/></span><div><div className="text-[10px] font-black tracking-[.15em] text-[#68716b]">{ar?'شرح مبسط':'PLAIN LANGUAGE'}</div><h2 className="text-xl font-black mt-1">{ar?guide.titleAr:guide.titleEn}</h2></div></div><button onClick={onClose} className="w-10 h-10 rounded-xl grid place-items-center hover:bg-[#efede7]" aria-label={ar?'إغلاق':'Close'}><X className="w-4 h-4"/></button></div>
   <div className="mt-6 divide-y divide-[#e6e4dd]">{guide.steps.map((x,i)=><div key={`${x.titleEn}-${i}`} className="py-4 grid grid-cols-[30px_1fr] gap-3"><span className="w-7 h-7 rounded-lg bg-[#f0eee8] grid place-items-center text-[11px] font-black">{i+1}</span><div><div className="text-sm font-black">{ar?x.titleAr:x.titleEn}</div><div className="text-xs leading-6 text-[#616763] mt-1">{ar?x.noteAr:x.noteEn}</div></div></div>)}</div>
   <div className="mt-7 pt-5 border-t border-[#dedcd5]"><div className="flex items-center gap-2"><CircleHelp className="w-4 h-4 text-[#53615a]"/><div className="text-xs font-black">{ar?'مصطلحات قد تراها':'Terms you may see'}</div></div><div className="mt-3 space-y-2">{TERMS.map(x=><details key={x.titleEn} className="rounded-xl bg-[#f5f3ed] px-3 py-2.5"><summary className="cursor-pointer text-xs font-black list-none flex items-center justify-between gap-2"><span>{ar?x.titleAr:x.titleEn}</span><ScanSearch className="w-3.5 h-3.5 text-[#646a66]"/></summary><p className="text-[11px] leading-5 text-[#616763] mt-2">{ar?x.noteAr:x.noteEn}</p></details>)}</div></div>
   <div className="mt-6 rounded-2xl bg-[#E7EEE9] text-[#214C40] p-4 flex gap-3"><Ticket className="w-5 h-5 shrink-0"/><p className="text-xs leading-6 font-semibold">{ar?'إذا كان الخيار لا يغير مسار عملك، لا تحتاج إلى فهم تفاصيله المتقدمة. ميزان يعرض العمق عند الطلب فقط.':'If a capability does not change your job, you do not need its advanced details. MIZAN reveals depth only on demand.'}</p></div>
  </aside>
 </div>;
};
