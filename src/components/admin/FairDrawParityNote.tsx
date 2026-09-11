import React, { useMemo } from 'react';
import { Gauge } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { analyzeFairDrawParity } from '../../lib/fairdraw-parity';
import type { FairDrawProofRecord } from '../../types';

type PoolSnapshotItem = NonNullable<FairDrawProofRecord['eligiblePoolSnapshot']>[number];

/*
 * تكافؤ القرعة — بجانب إعدادات السحب نفسها، حيث يُتَّخذ قرار إعادة القرعة.
 *
 * السحب العادل يُثبت أن الطقم قابل لإعادة الإنتاج من البذرة والقيود. وهذا شيء، وتكافؤ
 * الحِمل شيء آخر: قرعتان سليمتان تمامًا قد تُعطي إحداهما ثلاثة مقاطع سلسة والأخرى ثلاثة
 * مكتظّة بالمتشابهات، وكلتاهما داخل الهامش المعلن. هذا القياس يقول الفرق.
 *
 * ولا يُعيد القرعة ولا يلمس بذرة: إعادة صامتة تكسر إثبات commit–reveal العلني. يقيس
 * ويُنبّه، والقرار — وإعادة السحب إن وقعت — يبقى صريحًا في السجل.
 *
 * يبقى سطرًا واحدًا هادئًا ما دام التكافؤ داخل الهامش، ولا يتوسّع إلا حين يصير هناك ما يُفعَل.
 */

/** الهامش الافتراضي للوحدة نفسها: أوسع فارق مقبول بين طقمين كنسبة من المتوسط. */
const TOLERANCE = 0.15;

export const FairDrawParityNote: React.FC<{ ar: boolean }> = ({ ar }) => {
  const { fairDrawProofs, competition } = useAppStore();

  const report = useMemo(() => {
    const cohort: Array<{ participantId: string; questions: PoolSnapshotItem[] }> = [];
    for (const proof of fairDrawProofs) {
      if (proof.competitionId !== competition.id) continue;
      const snapshot = proof.eligiblePoolSnapshot;
      if (!snapshot?.length || !proof.selectionIds.length) continue;
      const byId = new Map(snapshot.map(q => [q.id, q]));
      const questions = proof.selectionIds.map(id => byId.get(id)).filter((q): q is PoolSnapshotItem => !!q);
      // طقمٌ لم تُحلّ كل أسئلته من لقطة البنك لا يدخل المقارنة: مجموعٌ ناقص يبدو أخفّ مما هو.
      if (questions.length !== proof.selectionIds.length) continue;
      cohort.push({ participantId: proof.questionSetId, questions });
    }
    return cohort.length >= 2 ? analyzeFairDrawParity(cohort, TOLERANCE) : null;
  }, [fairDrawProofs, competition.id]);

  // قبل وجود قرعتين مسجّلتين لا يوجد تكافؤ يُقاس، فلا يُعرض شيء.
  if (!report) return null;
  const review = report.status === 'REVIEW';
  const gap = (report.maxRelativeDelta * 100).toFixed(1);

  if (!review) {
    return (
      <div className="flex items-center gap-2 px-1 text-[10px] font-bold text-[#656b66]">
        <span className="mizan-status-orb" aria-hidden="true"/>
        {ar
          ? `تكافؤ الحِمل الذهني بين ${report.participantCount} أطقم مسحوبة ضمن الهامش — أوسع فارق ${gap}٪.`
          : `Cognitive load across ${report.participantCount} drawn sets is within tolerance — widest gap ${gap}%.`}
      </div>
    );
  }

  const widest = Math.max(1, ...report.participants.map(p => p.totalEnergy));
  return (
    <details className="mizan-collapse rounded-2xl border border-[#e2c9a8] bg-[#fbf6ec]">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 px-4 py-3 text-[11px] font-black text-[#7a5a2f]">
        <span className="flex items-center gap-2"><Gauge className="h-3.5 w-3.5"/>{ar ? 'أطقم القرعة متفاوتة في الحِمل الذهني' : 'Drawn sets differ in cognitive load'}</span>
        <span className="text-[10px] font-bold">{ar ? `فارق ${gap}٪` : `${gap}% gap`}</span>
      </summary>
      <div className="px-4 pb-4">
        <p className="text-[10px] leading-5 text-[#6e5936]">
          {ar
            ? `الحِمل = صعوبة المقطع + كثافة المتشابهات + تعقيد التجويد. الهامش المعتمد ${TOLERANCE * 100}٪. هذا قياس لا إجراء: إعادة القرعة قرار صريح يُسجَّل، ولا تُعاد بذرة في الخفاء.`
            : `Load = passage difficulty + mutashabihat density + tajweed complexity. Tolerance is ${TOLERANCE * 100}%. This measures only: a re-draw stays an explicit, recorded decision — no seed is quietly replaced.`}
        </p>
        <div className="mt-3 space-y-1.5">
          {report.participants.map(p => (
            <div key={p.participantId} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate font-mono text-[9px] text-[#6e5936]" dir="ltr">{p.participantId}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#eee6d7]">
                <span className="block h-full rounded-full bg-[#b98b4e]" style={{ width: `${Math.round((p.totalEnergy / widest) * 100)}%` }}/>
              </span>
              <span className="w-10 shrink-0 text-end text-[9px] font-black text-[#7a5a2f]">{p.totalEnergy}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
};

export default FairDrawParityNote;
