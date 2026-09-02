import React, { useMemo, useState } from 'react';
import { BadgeCheck, ChevronLeft, ChevronRight, Crown, KeyRound, LockKeyhole, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import { Pictogram } from '../design-system/Pictogram';

export const CeremonyView: React.FC<{onClose?:()=>void}> = ({onClose}) => {
 const s=useAppStore(); const {language,results,competition,currentUser}=s; const ar=language==='ar'; const [stage,setStage]=useState(0); const [busy,setBusy]=useState(false);
 const winners=useMemo(()=>[3,2,1].map(rank=>results.find(r=>r.rank===rank&&['sealed','published'].includes(r.status))).filter(Boolean),[results]);
 const current=stage>0?winners[stage-1]:null;
 const vault=s.ceremonyVaults.find(v=>v.competitionId===competition.id&&!['REVOKED'].includes(v.status));
 const reveal=s.quorumActions.find(q=>q.action==='ceremony_reveal'&&q.entityId===competition.id&&!['cancelled'].includes(q.status));
 const authorized=s.ceremonyRevealAuthorized();
 const approved=reveal?.approvals.some(a=>a.actorId===currentUser.id);
 const allowedRoles=reveal?.authorizedRoles||reveal?.requiredRoleGroups.flat()||[];
 const canApprove=allowedRoles.includes(currentUser.role)&&currentUser.role!=='super_admin'&&!approved&&reveal?.status!=='executed';
 const canExecute=reveal?.status==='ready'&&['broadcast_operator','comp_admin','org_admin','scientific_admin'].includes(currentUser.role)&&currentUser.role!=='super_admin';
 const request=async()=>{setBusy(true);try{await s.sealCeremonyVault()}finally{setBusy(false)}};
 const PrevIcon=ar?ChevronRight:ChevronLeft; const NextIcon=ar?ChevronLeft:ChevronRight;

 return <div className="fixed inset-0 z-50 bg-[#101a16] text-white overflow-hidden flex flex-col p-5 sm:p-8">
   <header className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="w-10 h-10 rounded-xl border border-white/10 bg-white/[.04] grid place-items-center font-black text-[#d9e6df]">م</span><div><div className="text-[10px] font-black tracking-[.18em] text-white/40">MIZAN CEREMONY</div><div className="text-sm font-bold mt-1">{ar?competition.nameArabic:competition.name}</div></div></div>{onClose&&<button onClick={onClose} className="w-11 h-11 rounded-xl grid place-items-center hover:bg-white/10 text-white/55" aria-label={ar?'إغلاق':'Close'}><X className="w-5 h-5"/></button>}</header>

   <main className="flex-1 grid place-items-center px-3"><div className="w-full max-w-5xl text-center">
    {!authorized?<div className="max-w-xl mx-auto">
      <Pictogram icon={LockKeyhole} size="lg" tone="ink" className="mx-auto [&>*]:!bg-white/[.06] [&>*]:!text-[#d8e4dd]"/>
      <div className="text-[10px] font-black tracking-[.22em] text-[#b9cfc4] mt-6">CEREMONY VAULT</div>
      <h1 className="text-3xl sm:text-5xl font-black mt-4 tracking-tight">{ar?'مختومة':'SEALED'}</h1>
      <div className="text-5xl font-black tabular-nums mt-6">{reveal?.approvals.length||0} / {reveal?.authorizedRoles?.length||3}</div>
      <div className="text-[10px] text-white/40 mt-1">{ar?`${reveal?.minimumApprovals||2} موافقات مستقلة مطلوبة`:`${reveal?.minimumApprovals||2} independent approvals required`}</div>
      <div className="mt-6 grid grid-cols-3 gap-2 text-start">
        <Approval ok={!!reveal?.approvals.some(a=>a.actorRole==='scientific_admin')} label={ar?'علمي':'Scientific'}/>
        <Approval ok={!!reveal?.approvals.some(a=>a.actorRole==='comp_admin')} label={ar?'المسابقة':'Competition'}/>
        <Approval ok={!!reveal?.approvals.some(a=>a.actorRole==='org_admin')} label={ar?'الجهة':'Organization'}/>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {!vault&&<Button loading={busy} onClick={request} icon={<LockKeyhole className="w-4 h-4"/>}>{ar?'ختم الحزمة':'Seal package'}</Button>}
        {canApprove&&<Button onClick={()=>reveal&&s.approveQuorumAction(reveal.id)} icon={<BadgeCheck className="w-4 h-4"/>}>{ar?'اعتماد':'Approve'}</Button>}
        {canExecute&&<Button onClick={()=>reveal&&s.executeQuorumAction(reveal.id)} icon={<ShieldCheck className="w-4 h-4"/>}>REVEAL</Button>}
      </div>
      {vault&&<div className="mt-5 text-[9px] text-white/30 font-mono">{vault.encryptionAlgorithm||'SEALED'} · {vault.keyManagement==='development_adapter'?'DEVELOPMENT CRYPTO ADAPTER':'EXTERNAL KMS'} · {vault.publicCommitmentHash.slice(0,18)}…</div>}
    </div>
    :stage===0?<div className="max-w-3xl mx-auto"><div className="text-[11px] font-black tracking-[.2em] text-[#b9cfc4]">{ar?'إعلان النتائج الرسمية':'OFFICIAL RESULT REVEAL'}</div><h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight mt-5 leading-[1.12]">{ar?'لحظة التتويج':'The moment of recognition'}</h1><div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-black text-white/55"><ShieldCheck className="w-3.5 h-3.5"/>{ar?'كشف معتمد بالنصاب':'Quorum-authorized reveal'}</div><div><Button className="mt-8 !bg-[#d8c39b] !text-[#1d2a24] hover:!bg-[#e2cfaa]" size="lg" disabled={!winners.length} onClick={()=>setStage(1)} icon={<NextIcon className="w-4 h-4"/>}>{ar?'ابدأ':'Begin'}</Button></div></div>
    :current?<div className="max-w-4xl mx-auto animate-in fade-in zoom-in-95 duration-500"><div className={`mx-auto grid place-items-center rounded-full ${current.rank===1?'w-20 h-20 bg-[#d8c39b] text-[#1d2a24]':'w-14 h-14 border border-white/15 text-[#b9cfc4]'}`}>{current.rank===1?<Crown className="w-9 h-9"/>:<span className="text-2xl font-black">{current.rank}</span>}</div><div className="text-[11px] font-black tracking-[.2em] text-[#b9cfc4] mt-7">{current.rank===1?(ar?'المركز الأول':'FIRST PLACE'):current.rank===2?(ar?'المركز الثاني':'SECOND PLACE'):(ar?'المركز الثالث':'THIRD PLACE')}</div><h2 className="text-4xl sm:text-6xl font-black mt-5 tracking-tight">{ar?current.participantNameArabic:current.participantName}</h2><div className="text-lg text-white/45 mt-3">{current.country}</div><div className="mt-7 inline-flex items-baseline gap-1 rounded-2xl border border-white/10 bg-white/[.04] px-6 py-3"><span className="text-3xl font-black">{current.finalScore.toFixed(2)}</span><span className="text-sm text-white/40">%</span></div></div>:<div className="text-white/50">{ar?'لا توجد نتيجة مختومة لهذا المركز':'No sealed result for this rank'}</div>}
   </div></main>
   <footer className="flex items-center justify-between gap-3"><div className="text-[10px] text-white/25">MIZAN · {authorized?'Quorum authorized':'Sealed'}</div>{authorized&&<div className="flex gap-2">{stage>0&&<button onClick={()=>setStage(Math.max(0,stage-1))} className="w-11 h-11 rounded-xl border border-white/10 grid place-items-center hover:bg-white/10 text-white/60" aria-label={ar?'السابق':'Previous'}><PrevIcon className="w-4 h-4"/></button>}{stage>0&&stage<winners.length&&<button onClick={()=>setStage(stage+1)} className="w-11 h-11 rounded-xl bg-[#d8c39b] text-[#1d2a24] grid place-items-center hover:bg-[#e2cfaa]" aria-label={ar?'التالي':'Next'}><NextIcon className="w-4 h-4"/></button>}{stage===winners.length&&stage>0&&<button onClick={()=>setStage(0)} className="w-11 h-11 rounded-xl border border-white/10 grid place-items-center hover:bg-white/10 text-white/60" aria-label={ar?'إعادة':'Reset'}><RotateCcw className="w-4 h-4"/></button>}</div>}</footer>
 </div>
}

const Approval=({ok,label}:{ok:boolean;label:string})=><div className={`rounded-2xl border p-4 flex items-center gap-3 ${ok?'border-[#365a4d] bg-white/[.05]':'border-white/10 bg-white/[.02]'}`}><span className={`w-9 h-9 rounded-xl grid place-items-center ${ok?'bg-[#d8c39b] text-[#1d2a24]':'bg-white/[.06] text-white/35'}`}>{ok?<BadgeCheck className="w-4 h-4"/>:<KeyRound className="w-4 h-4"/>}</span><div><div className="text-xs font-black">{label}</div><div className="text-[9px] text-white/35 mt-1">{ok?'APPROVED':'PENDING'}</div></div></div>;
