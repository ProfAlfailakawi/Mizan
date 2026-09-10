import React, { useEffect, useRef, useState } from 'react';
import { certificateCodeFromLocation, certificateVerifyUrl, fetchPublicCertificateVerdict, type PublicCertificateView } from '../../lib/certificate-verification';
import { Link2, Printer, Search, ShieldCheck } from 'lucide-react';
import { RealQRCode } from '../design-system/RealQRCode';
import { useAppStore } from '../../lib/store';
import { getCompetitionPolicy } from '../../lib/competition-config';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import { MizanPictogram } from '../design-system/MizanPictogram';

type VerificationState='AUTHENTIC'|'REVOKED'|'NOT_FOUND'|'INVALID_PROOF';

export const CertificateVerification: React.FC = () => {
  const store = useAppStore();
  const { language, certificates, competition } = store;
  const ar = language === 'ar';
  const policy = getCompetitionPolicy(competition);
  const [searchCode, setSearchCode] = useState('');
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationState | null>(null);
  const activeCert = submittedCode
    ? certificates.find(c => c.certificateNumber.toLowerCase() === submittedCode.trim().toLowerCase())
    : undefined;

  const [chain,setChain]=useState<{id:string;labelArabic:string;labelEnglish:string;hash?:string;present:boolean}[]>([]);

  const [publicView,setPublicView]=useState<PublicCertificateView|null>(null);
  /* الغريب الماسح لرمز مطبوع لا يملك مخزن المسابقة: يُسأل السجل العام أولًا، ويبقى المخزن
     المحلي مرجعًا لمن هو داخل المسابقة أصلًا أو حين لا يكون السجل مهيأً. */
  const verifyCode = async (code:string) => {
    setSubmittedCode(code);setPublicView(null);
    const remote=await fetchPublicCertificateVerdict(code);
    if(remote){setVerification(remote.state);setPublicView(remote.certificate||null);setChain([]);
      if(remote.state!=='NOT_FOUND')return;}
    const cert=certificates.find(c=>c.certificateNumber.toLowerCase()===code.toLowerCase());
    if(!cert){setVerification('NOT_FOUND');setChain([]);return;}
    const result=await store.verifyCertificateEvidence(cert.id);
    setVerification(result.state);
    setChain(store.certificateEvidenceChain(cert.id));
  };
  const verify = () => void verifyCode(searchCode.trim());

  /* مسح رمز الشهادة يفتح هذا العنوان ومعه الرقم، فيتحقّق فورًا بلا طباعة يدوية.
     يعمل مرة واحدة عند الفتح، ولا يعيد الكتابة فوق بحث المستخدم بعدها. */
  const autoRan=useRef(false);
  useEffect(()=>{
    if(autoRan.current)return;autoRan.current=true;
    if(typeof window==='undefined')return;
    const code=certificateCodeFromLocation(window.location.search,window.location.hash);
    if(!code||!policy.certificates.publicVerification)return;
    setSearchCode(code);void verifyCode(code);
  },[]);

  /* الرابط المطبوع يجب أن يفتح صفحة التحقق نفسها: المسار وحده يفتح الجذر، فيُثبَّت جزء التوجيه. */
  const verifyUrl=(code:string)=>typeof window==='undefined'?code:certificateVerifyUrl(window.location.origin,code);

  const label:Record<VerificationState,{ar:string;en:string;variant:'emerald'|'rose'|'amber'|'neutral'}>={
    AUTHENTIC:{ar:'أصيلة',en:'AUTHENTIC',variant:'emerald'},
    REVOKED:{ar:'ملغاة',en:'REVOKED',variant:'rose'},
    NOT_FOUND:{ar:'غير موجودة',en:'NOT FOUND',variant:'neutral'},
    INVALID_PROOF:{ar:'إثبات غير صالح',en:'INVALID PROOF',variant:'rose'}
  };

  return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-5">
    <section className="mizan-surface p-6 sm:p-8 text-center">
      <div className="mx-auto w-fit"><MizanPictogram kind="certificate" size="lg" tone="emerald"/></div>
      <div className="mizan-kicker mt-5">{ar?'تحقق ميزان':'MIZAN VERIFY'}</div>
      <h1 className="text-2xl sm:text-3xl font-black mt-1">{ar?'تحقق مستقل من الشهادة':'Certificate verification'}</h1>
      <p className="text-xs text-[#636864] mt-2">{policy.certificates.publicVerification?(ar?'رقم واحد. إثبات واحد. بلا كشف بيانات غير لازمة.':'One number. One proof. No unnecessary data exposure.'):(ar?'التحقق العام غير مفعل لهذه المسابقة.':'Public verification is disabled for this competition.')}</p>
      {policy.certificates.publicVerification&&<div className="max-w-md mx-auto flex gap-2 mt-6">
        <div className="relative flex-1"><Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#696f6b]"/><input value={searchCode} onChange={e=>setSearchCode(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void verify()} placeholder="MZN-…" className="w-full rounded-xl border border-[#dcdad2] bg-white ps-10 pe-3 py-3 text-sm font-mono"/></div>
        <Button disabled={!searchCode.trim()} onClick={()=>void verify()}>{ar?'تحقق':'Verify'}</Button>
      </div>}
    </section>

    {submittedCode && verification==='NOT_FOUND' && <section className="mizan-surface p-8 text-center"><div className="mx-auto w-fit"><MizanPictogram kind="certificate"/></div><h2 className="font-black mt-3">{ar?'غير موجودة':'NOT FOUND'}</h2><p className="text-xs text-[#646965] mt-1">{ar?'لا يوجد سجل شهادة بهذا الرقم في هذه المسابقة.':'No certificate record with this number exists in this competition.'}</p></section>}

    {!activeCert && publicView && verification && verification!=='NOT_FOUND' && <section className="bg-[#fffefb] border border-[#dcdad2] rounded-[28px] p-7 sm:p-10 text-center relative overflow-hidden">
      <ShieldCheck className="absolute -end-10 -bottom-10 w-44 h-44 text-[#214C40]/[.035]"/>
      <div className="relative">
        <Badge variant={label[verification].variant} dot={false}>{ar?label[verification].ar:label[verification].en}</Badge>
        <div className="mizan-kicker mt-5">{publicView.certificateNumber}</div>
        <h2 className="text-2xl sm:text-3xl font-black mt-3">{publicView.disclosed.participantName||publicView.disclosed.participantCode}</h2>
        <p className="text-sm text-[#616762] mt-2">{publicView.competitionName}</p>
        {publicView.organizationName&&<p className="text-xs font-bold text-[#214C40] mt-2">{publicView.organizationName}</p>}
        <div className="max-w-lg mx-auto mt-6 border-y border-[#e5e3dc] divide-y divide-[#e5e3dc] text-sm">
          {publicView.disclosed.categoryName&&<Row label={ar?'الفئة':'Category'} value={publicView.disclosed.categoryName}/>}
          {publicView.disclosed.finalScore!==undefined&&<Row label={ar?'الدرجة':'Score'} value={publicView.disclosed.finalScore.toFixed(2)}/>}
          {publicView.disclosed.rank!==undefined&&<Row label={ar?'الترتيب':'Rank'} value={`#${publicView.disclosed.rank}`}/>}
          <Row label={ar?'تاريخ الإصدار':'Issued'} value={publicView.issuedAt.slice(0,10)}/>
        </div>
        <p className="mt-6 text-[10px] leading-5 text-[#6b706c]">{ar?'صدر الحكم من سجل الشهادات العام على الخادم، لا من هذا المتصفح: أُعيد حساب بصمة الحزمة وبرهان الاشتمال عند كل طلب. ولا يُعرض هنا إلا ما هو مطبوع على الشهادة نفسها.':'The verdict comes from the public certificate registry on the server, not from this browser: the package hash and inclusion proof are recomputed on every request. Only what is printed on the certificate itself is shown here.'}</p>
        <div className="mt-6 inline-block bg-white p-2 rounded-2xl border border-[#e0ded6]"><RealQRCode value={verifyUrl(publicView.certificateNumber)} size={116} label={ar?'رمز التحقق من الشهادة':'Certificate verification code'}/></div>
      </div>
    </section>}

    {activeCert && verification && verification!=='NOT_FOUND' && <section className="bg-[#fffefb] border border-[#dcdad2] rounded-[28px] p-7 sm:p-10 text-center relative overflow-hidden">
      <ShieldCheck className="absolute -end-10 -bottom-10 w-44 h-44 text-[#214C40]/[.035]"/>
      <div className="relative">
        <Badge variant={label[verification].variant} dot={false}>{ar?label[verification].ar:label[verification].en}</Badge>
        <div className="mizan-kicker mt-5">{activeCert.certificateNumber}</div>
        {verification==='AUTHENTIC'?<>
          <h2 className="text-2xl sm:text-3xl font-black mt-3">{ar?activeCert.participantNameArabic:activeCert.participantName}</h2>
          <p className="text-sm text-[#616762] mt-2">{ar?activeCert.competitionNameArabic:activeCert.competitionName}</p>
          <p className="text-xs font-bold text-[#214C40] mt-4">{ar?activeCert.categoryNameArabic:activeCert.categoryName}</p>
          <div className="max-w-lg mx-auto mt-6 border-y border-[#e5e3dc] divide-y divide-[#e5e3dc] text-sm">
            {policy.certificates.showScore&&activeCert.score>0&&<Row label={ar?'الدرجة':'Score'} value={activeCert.score.toFixed(2)}/>} 
            {policy.certificates.showRank&&activeCert.rank&&<Row label={ar?'الترتيب':'Rank'} value={`#${activeCert.rank}`}/>} 
            <Row label={ar?'تاريخ الإصدار':'Issued'} value={activeCert.issueDate}/>
          </div>
          <EvidenceChain chain={chain} ar={ar}/>
          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-5">
            <div className="bg-white p-2 rounded-2xl border border-[#e0ded6]"><RealQRCode value={verifyUrl(activeCert.certificateNumber)} size={116} label={ar?'رمز التحقق من الشهادة':'Certificate verification code'}/></div>
            <div className="text-center sm:text-start max-w-xs">
              <div className="text-[10px] font-black text-[#3f4744]">{ar?'امسح الرمز للتحقق مباشرة':'Scan to verify directly'}</div>
              <p className="text-[9px] leading-4 text-[#6b706c] mt-1.5">{ar?'يفتح الرمز صفحة التحقق هذه ومعه رقم الشهادة، فيُعاد الفحص من المصدر لا من الورقة.':'The code opens this verification page with the certificate number, so the check runs against the record — not the paper.'}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={()=>window.print()} icon={<Printer className="w-4 h-4"/>}>{ar?'طباعة':'Print'}</Button>
            </div>
          </div>
        </>:<div className="mt-6"><p className="text-sm font-bold">{verification==='REVOKED'?(ar?'هذه الشهادة أُلغيت من الجهة المصدرة.':'This certificate has been revoked by its issuer.'):(ar?'فشل التحقق من الدليل المشفّر المرتبط بالشهادة.':'The cryptographic evidence linked to this certificate did not verify.')}</p><p className="text-xs text-[#646965] mt-2">{ar?'لا تُعرض أي تفاصيل إضافية حفاظًا على الخصوصية.':'No additional private details are exposed.'}</p></div>}
      </div>
    </section>}
  </div>;
};

/*
 * الحلقات التي تقوم عليها الأصالة، معروضة لا موصوفة: من المصحف المعتمد إلى الشهادة.
 * الحلقة الغائبة تُعرض غائبةً — إخفاؤها يجعل السلسلة تبدو أقوى مما هي.
 */
const EvidenceChain=({chain,ar}:{chain:{id:string;labelArabic:string;labelEnglish:string;hash?:string;present:boolean}[];ar:boolean})=>{
  if(!chain.length)return null;
  return <div className="mt-7 text-start max-w-lg mx-auto">
    <div className="flex items-center gap-2 text-[9px] font-black tracking-[.14em] text-[#6b706c]"><Link2 className="w-3.5 h-3.5"/>{ar?'سلسلة الأدلة':'EVIDENCE CHAIN'}</div>
    <ol className="mt-3 relative ps-5">
      <span aria-hidden className="absolute start-[5px] top-2 bottom-2 w-px bg-[#dedcd4]"/>
      {chain.map(l=><li key={l.id} className="relative py-2">
        <span aria-hidden className={`absolute start-[-15px] top-3.5 w-[11px] h-[11px] rounded-full border-2 border-[#fffefb] ${l.present?'bg-[#2F6555]':'bg-[#c9c6bd]'}`}/>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] font-bold text-[#2c3330]">{ar?l.labelArabic:l.labelEnglish}</span>
          {!l.present&&<span className="text-[9px] text-[#646965]">{ar?'غير مرتبطة':'not linked'}</span>}
        </div>
        {l.hash&&<div className="font-mono text-[9px] text-[#646965] mt-0.5 break-all">{l.hash.slice(0,32)}…</div>}
      </li>)}
    </ol>
    <p className="text-[9px] leading-4 text-[#6b706c] mt-2">{ar?'كل حلقة بصمة مستقلة؛ تغيّر أي منها يكسر التحقق أعلاه.':'Each link is an independent digest; changing any one of them breaks the verification above.'}</p>
  </div>;
};

const Row=({label,value}:{label:string;value:string})=><div className="py-3 flex items-center justify-between gap-4"><span className="text-xs text-[#646965]">{label}</span><span className="font-bold tabular-nums">{value}</span></div>;
