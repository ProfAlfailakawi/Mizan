import React, { useState } from 'react';
import { Printer, Search, ShieldCheck } from 'lucide-react';
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

  const verify = async () => {
    const code=searchCode.trim();
    setSubmittedCode(code);
    const cert=certificates.find(c=>c.certificateNumber.toLowerCase()===code.toLowerCase());
    if(!cert){setVerification('NOT_FOUND');return;}
    const result=await store.verifyCertificateEvidence(cert.id);
    setVerification(result.state);
  };

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
          <p className="mt-5 text-[10px] text-[#666a67]">{ar?'تم التحقق من حزمة الشهادة وختم النتيجة وإثبات الإدراج المشفّر.':'Certificate package, result-seal reference, and Merkle inclusion proof verified.'}</p>
          <Button className="mt-7" variant="outline" onClick={()=>window.print()} icon={<Printer className="w-4 h-4"/>}>{ar?'طباعة':'Print'}</Button>
        </>:<div className="mt-6"><p className="text-sm font-bold">{verification==='REVOKED'?(ar?'هذه الشهادة أُلغيت من الجهة المصدرة.':'This certificate has been revoked by its issuer.'):(ar?'فشل التحقق من الدليل المشفّر المرتبط بالشهادة.':'The cryptographic evidence linked to this certificate did not verify.')}</p><p className="text-xs text-[#646965] mt-2">{ar?'لا تُعرض أي تفاصيل إضافية حفاظًا على الخصوصية.':'No additional private details are exposed.'}</p></div>}
      </div>
    </section>}
  </div>;
};

const Row=({label,value}:{label:string;value:string})=><div className="py-3 flex items-center justify-between gap-4"><span className="text-xs text-[#646965]">{label}</span><span className="font-bold tabular-nums">{value}</span></div>;
