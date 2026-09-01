import React, { useState } from 'react';
import { Award, CheckCircle2, Printer, Search, ShieldCheck, XCircle } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { getCompetitionPolicy } from '../../lib/competition-config';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';

export const CertificateVerification: React.FC = () => {
  const { language, certificates, competition } = useAppStore();
  const ar = language === 'ar';
  const policy = getCompetitionPolicy(competition);
  const [searchCode, setSearchCode] = useState('');
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const activeCert = submittedCode
    ? certificates.find(c => c.certificateNumber.toLowerCase() === submittedCode.trim().toLowerCase())
    : undefined;
  const verify = () => setSubmittedCode(searchCode.trim());

  return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-5">
    <section className="mizan-surface p-6 sm:p-8 text-center">
      <span className="w-12 h-12 rounded-2xl bg-[#E7EEE9] text-[#214C40] grid place-items-center mx-auto"><ShieldCheck className="w-6 h-6"/></span>
      <div className="mizan-kicker mt-5">MIZAN VERIFY</div>
      <h1 className="text-2xl sm:text-3xl font-black mt-1">{ar?'التحقق من الشهادة':'Certificate verification'}</h1>
      <p className="text-xs text-[#747b76] mt-2">{policy.certificates.publicVerification?(ar?'أدخل رقم الشهادة كما يظهر على الوثيقة.':'Enter the certificate number shown on the document.'):(ar?'التحقق العام غير مفعل لهذه المسابقة.':'Public verification is disabled for this competition.')}</p>
      {policy.certificates.publicVerification&&<div className="max-w-md mx-auto flex gap-2 mt-6">
        <div className="relative flex-1"><Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[#89908b]"/><input value={searchCode} onChange={e=>setSearchCode(e.target.value)} onKeyDown={e=>e.key==='Enter'&&verify()} placeholder="MZN-…" className="w-full rounded-xl border border-[#dcdad2] bg-white ps-10 pe-3 py-3 text-sm font-mono"/></div>
        <Button disabled={!searchCode.trim()} onClick={verify}>{ar?'تحقق':'Verify'}</Button>
      </div>}
    </section>

    {submittedCode && !activeCert && <section className="mizan-surface p-8 text-center"><XCircle className="w-7 h-7 text-[#9a665d] mx-auto"/><h2 className="font-black mt-3">{ar?'لم نجد شهادة مطابقة':'No matching certificate'}</h2><p className="text-xs text-[#777e79] mt-1">{ar?'تحقق من الرقم أو تواصل مع الجهة المصدرة.':'Check the number or contact the issuing organization.'}</p></section>}

    {activeCert && <section className="bg-[#fffefb] border border-[#dcdad2] rounded-[28px] p-7 sm:p-10 text-center relative overflow-hidden">
      <Award className="absolute -end-10 -bottom-10 w-44 h-44 text-[#214C40]/[.035]"/>
      <div className="relative">
        <Badge variant={activeCert.isAuthentic?'emerald':'rose'} dot={false}>{activeCert.isAuthentic?(ar?'مطابقة للسجل':'Record matched'):(ar?'ملغاة / غير صالحة':'Revoked / invalid')}</Badge>
        <div className="mizan-kicker mt-5">{activeCert.certificateNumber}</div>
        <h2 className="text-2xl sm:text-3xl font-black mt-3">{ar?activeCert.participantNameArabic:activeCert.participantName}</h2>
        <p className="text-sm text-[#6f7671] mt-2">{ar?activeCert.competitionNameArabic:activeCert.competitionName}</p>
        <p className="text-xs font-bold text-[#214C40] mt-4">{ar?activeCert.categoryNameArabic:activeCert.categoryName}</p>
        <div className="max-w-lg mx-auto mt-6 border-y border-[#e5e3dc] divide-y divide-[#e5e3dc] text-sm">
          {policy.certificates.showScore&&activeCert.score>0&&<Row label={ar?'الدرجة':'Score'} value={activeCert.score.toFixed(2)}/>} 
          {policy.certificates.showRank&&activeCert.rank&&<Row label={ar?'الترتيب':'Rank'} value={`#${activeCert.rank}`}/>} 
          <Row label={ar?'تاريخ الإصدار':'Issued'} value={activeCert.issueDate}/>
        </div>
        {activeCert.signatories.length>0&&<div className="mt-6 flex flex-wrap justify-center gap-3">{activeCert.signatories.map((s,i)=><span key={i} className="text-[11px] text-[#6f7671]">{s.name} · {s.title}</span>)}</div>}
        <Button className="mt-7" variant="outline" onClick={()=>window.print()} icon={<Printer className="w-4 h-4"/>}>{ar?'طباعة':'Print'}</Button>
      </div>
    </section>}
  </div>;
};

const Row=({label,value}:{label:string;value:string})=><div className="py-3 flex items-center justify-between gap-4"><span className="text-xs text-[#777e79]">{label}</span><span className="font-bold tabular-nums">{value}</span></div>;
