import React, { useState } from 'react';
import { Eye, Gavel, Lock, ShieldCheck } from 'lucide-react';
import type { buildParticipantFairnessEvidence } from '../../lib/judging-integrity';

/*
 * «رحلة سؤالك» — مسارٌ يُرسم بين أربع محطات: التزام السؤال ← الكشف ← اللجنة ← الختم.
 *
 * كل محطةٍ تفتح دليلها الموجود في الإيصال نفسه، لا غير: بصمات التزام الأسئلة في بوابة
 * الكشف، وحالة كل بوابة، والتزامات استقلال المحكّمين، وبصمة ختم النتيجة. لا يدّعي إثبات
 * سحب FairDraw (الإيصال لا يحمله)، ولا يعرض نصّ سؤال ولا درجة. الحركة CSS، وتقليلها يُظهر
 * المسار مرسومًا كاملًا.
 */
type Receipt = ReturnType<typeof buildParticipantFairnessEvidence>;
type Station = 'commit' | 'reveal' | 'committee' | 'seal';

const Hash: React.FC<{ v?: string }> = ({ v }) => v ? <bdi dir="ltr" className="block break-all font-mono text-[11px] text-[#3f4642]">{v}</bdi> : <span className="text-[11px] text-[color:var(--muted)]">—</span>;

export const ReceiptJourney: React.FC<{ receipt: Receipt; ar: boolean }> = ({ receipt, ar }) => {
  const gates = receipt.questionIntegrity.gates;
  const j = receipt.judging;
  const stations: { id: Station; Icon: React.ComponentType<{ className?: string }>; title: string; done: boolean }[] = [
    { id: 'commit', Icon: Lock, title: ar ? 'التزام السؤال' : 'Commitment', done: gates.length > 0 && gates.every(g => !!g.questionCommitmentHash) },
    { id: 'reveal', Icon: Eye, title: ar ? 'الكشف' : 'Reveal', done: gates.length > 0 && receipt.questionIntegrity.allRevealedAfterPresence },
    { id: 'committee', Icon: Gavel, title: ar ? 'اللجنة' : 'Committee', done: j.independentLockedSubmissions > 0 },
    { id: 'seal', Icon: ShieldCheck, title: ar ? 'الختم' : 'Seal', done: !!receipt.resultSealHash },
  ];
  const [open, setOpen] = useState<Station | null>(null);
  const reached = stations.reduce((n, s, i) => (s.done && n === i ? i + 1 : n), 0);

  return (
    <section className="mizan-receipt-explain mz-vw-journey mt-5 rounded-2xl border border-[#e3dfd3] bg-[#FBFAF6] p-4" aria-label={ar ? 'رحلة سؤالك' : "Your question's journey"}>
      <h3 className="text-base font-black text-[color:var(--emerald)]">{ar ? 'رحلة سؤالك' : "Your question's journey"}</h3>
      <div className="relative mt-3">
        <svg className="mz-vw-journey__path" viewBox="0 0 400 20" preserveAspectRatio="none" aria-hidden="true">
          <line x1="50" y1="10" x2="350" y2="10" className="is-track" />
          <line x1={ar ? 350 : 50} y1="10" x2={ar ? 350 - 100 * Math.max(0, reached - 1) : 50 + 100 * Math.max(0, reached - 1)} y2="10" pathLength={100} className="is-drawn" />
        </svg>
        <ol className="relative grid grid-cols-4 gap-1">
          {stations.map((s, i) => (
            <li key={s.id} className="flex flex-col items-center text-center">
              <button type="button" aria-expanded={open === s.id} aria-controls={`mz-vw-journey-${s.id}`} onClick={() => setOpen(o => (o === s.id ? null : s.id))}
                className={`mz-vw-journey__stop${s.done ? ' is-done' : ''}${open === s.id ? ' is-open' : ''}`} style={{ '--mz-vw-i': i } as React.CSSProperties}>
                <s.Icon className="h-5 w-5" />
                <span className="sr-only">{s.done ? (ar ? 'مكتملة' : 'complete') : (ar ? 'لم تكتمل' : 'not yet')}</span>
              </button>
              <span className="mt-1.5 text-[11px] font-black text-[#17352D]">{s.title}</span>
            </li>
          ))}
        </ol>
      </div>
      {open && <div id={`mz-vw-journey-${open}`} className="dna-panelfade mt-3 rounded-xl border border-[#e3dfd3] bg-white p-3 text-sm">
        {open === 'commit' && (gates.length ? <dl className="space-y-2">{gates.map(g => <div key={g.questionNumber}><dt className="text-xs text-[color:var(--muted)]">{ar ? `بصمة التزام السؤال ${g.questionNumber}` : `Question ${g.questionNumber} commitment`}</dt><dd><Hash v={g.questionCommitmentHash} /></dd></div>)}</dl> : <p className="text-xs text-[color:var(--muted)]">{ar ? 'لا أسئلة مسجّلة بعد.' : 'No questions recorded yet.'}</p>)}
        {open === 'reveal' && (gates.length ? <ul className="space-y-1.5">{gates.map(g => <li key={g.questionNumber} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-black">{ar ? `السؤال ${g.questionNumber}` : `Question ${g.questionNumber}`}</span><span className="text-[#4f5752]">{g.presenceVerified ? (ar ? 'تحقق الحضور' : 'presence verified') : (ar ? 'لم يتحقق الحضور' : 'presence not verified')} · <bdi dir="ltr">{g.judgeApprovals}/{g.requiredJudgeApprovals}</bdi> {ar ? 'موافقة' : 'approvals'} · {g.revealed ? (ar ? 'كُشف' : 'revealed') : (ar ? 'لم يُكشف' : 'not revealed')}</span></li>)}</ul> : <p className="text-xs text-[color:var(--muted)]">{ar ? 'لا أسئلة مسجّلة بعد.' : 'No questions recorded yet.'}</p>)}
        {open === 'committee' && <div className="space-y-2"><p className="text-xs text-[#4f5752]">{ar ? `محكّمون قيّموك باستقلال: ${j.independentLockedSubmissions}` : `Judges who scored independently: ${j.independentLockedSubmissions}`}</p>{j.independenceCommitments.map((c, i) => <div key={c.commitmentHash}><div className="text-xs text-[color:var(--muted)]">{ar ? `التزام المحكّم ${i + 1}` : `Judge commitment ${i + 1}`}</div><Hash v={c.commitmentHash} /></div>)}</div>}
        {open === 'seal' && <div><div className="text-xs text-[color:var(--muted)]">{ar ? 'بصمة ختم النتيجة' : 'Result seal fingerprint'}</div><Hash v={receipt.resultSealHash} />{!receipt.resultSealHash && <p className="mt-1 text-xs text-[color:var(--muted)]">{ar ? 'لم تُختم النتيجة بعد.' : 'The result is not sealed yet.'}</p>}</div>}
      </div>}
    </section>
  );
};
