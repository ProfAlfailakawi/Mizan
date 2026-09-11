import React, { useMemo } from 'react';
import { UsersRound } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { analyzeCommitteeIntegrity, type ScoreEvent } from '../../lib/committee-integrity';

/*
 * نزاهة اللجان — تشريح بعد الجلسة، في يد المدقّق.
 *
 * إشارتان فقط، وكلتاهما على مستوى اللجنة لا الشخص:
 *  · تزامن الرصد — أن يُسلّم محكّمو لجنةٍ درجاتهم في نفس اللحظة مرارًا يستحق سؤالًا عن
 *    استقلال الرصد. سؤالًا لا تهمة.
 *  · تكافؤ الوفود — أن يختلف متوسط الخصم داخل اللجنة الواحدة باختلاف وفد المتسابق يستحق
 *    مراجعة. مراجعةً لا حكمًا.
 *
 * وما لا يفعله مقصود مثل ما يفعله: لا يُصنّف محكّمًا، ولا يسمّيه، ولا يرتّبه. ترتيب
 * المحكّمين بعدد درجاتٍ قليل في الجلسة ضجيجٌ يُلبِس لباس القياس، ويُسوّي بين اختلافٍ
 * اجتهادي مشروع وبين خلل. المقارنة الفردية تبقى حيث تصحّ: المحكّم مع نفسه (judge-drift).
 *
 * يصمت ما لم تكفِ العيّنة، ويبقى سطرًا واحدًا ما دامت الإشارات سليمة.
 */

export const CommitteeIntegrityNote: React.FC<{ ar: boolean }> = ({ ar }) => {
  const { judgeSubmissions, participants, committees, competition } = useAppStore();

  const report = useMemo(() => {
    const criteriaMax = new Map((competition.ruleSet?.criteria || []).map(c => [c.id, c.maxScore]));
    // «أول تسليم في الجلسة» هو الأصل الذي تُقاس عليه الإزاحات، فالفارق بين المحكّمين هو المعنى لا الساعة.
    const firstAt = new Map<string, number>();
    for (const s of judgeSubmissions) {
      const at = Date.parse(s.submittedAt || '');
      if (!Number.isFinite(at)) continue;
      const seen = firstAt.get(s.sessionId);
      if (seen === undefined || at < seen) firstAt.set(s.sessionId, at);
    }

    const events: ScoreEvent[] = [];
    for (const s of judgeSubmissions) {
      const participant = participants.find(p => p.id === s.participantId);
      const committeeId = participant?.assignedCommitteeId;
      if (!committeeId) continue;
      // الخصم = ما نقص عن الحدّ الأعلى في المعايير التي رصدها هذا المحكّم وحده،
      // فلجنةٌ متخصّصة لا تبدو أشدّ لمجرّد أن كل محكّم يرصد معايير أقل.
      let penalty = 0; let scored = 0;
      for (const [criterionId, score] of Object.entries(s.criterionScores || {})) {
        const max = criteriaMax.get(criterionId);
        if (max === undefined || !Number.isFinite(Number(score))) continue;
        penalty += Math.max(0, max - Number(score));
        scored += 1;
      }
      if (!scored) continue;
      const at = Date.parse(s.submittedAt || '');
      const base = firstAt.get(s.sessionId);
      events.push({
        committeeId,
        // الوفد يُمثَّل ببلد المتسابق: هو ما تحمله السجلات فعلًا، ولا يُشتق انتماء لم يُسجَّل.
        region: participant?.delegationId || participant?.country || undefined,
        penalty: Number(penalty.toFixed(3)),
        submitOffsetMs: Number.isFinite(at) && base !== undefined ? at - base : undefined,
      });
    }
    return events.length ? analyzeCommitteeIntegrity(events) : null;
  }, [judgeSubmissions, participants, competition.ruleSet]);

  const measured = report?.committees.filter(c => c.synchrony !== 'INSUFFICIENT' || c.regionalEvenness !== 'INSUFFICIENT') || [];
  // قبل أن تكفي العيّنة لا توجد إشارة، والصمت أصدق من لوحةٍ فارغة.
  if (!measured.length) return null;

  const flagged = measured.filter(c => c.status === 'REVIEW');
  const nameOf = (id: string) => {
    const c = committees.find(x => x.id === id);
    return c ? `${c.code} · ${(ar ? c.nameArabic : c.name) || c.code}` : id;
  };

  if (!flagged.length) {
    return (
      <div className="flex items-center gap-2 px-1 text-[10px] font-bold text-[#656b66]">
        <span className="mizan-status-orb" aria-hidden="true"/>
        {ar
          ? `إشارات نزاهة اللجان سليمة عبر ${measured.length} لجنة — رصد مستقل وخصم متكافئ بين الوفود.`
          : `Committee integrity signals are clear across ${measured.length} committees — independent submission and even regional deduction.`}
      </div>
    );
  }

  return (
    <details className="mizan-collapse rounded-2xl border border-[#e2c9a8] bg-[#fbf6ec]">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 px-4 py-3 text-[11px] font-black text-[#7a5a2f]">
        <span className="flex items-center gap-2"><UsersRound className="h-3.5 w-3.5"/>{ar ? 'إشارة نزاهة تستحق المراجعة' : 'A committee signal is worth reviewing'}</span>
        <span className="text-[10px] font-bold">{flagged.length}</span>
      </summary>
      <div className="px-4 pb-4">
        <p className="text-[10px] leading-5 text-[#6e5936]">
          {ar
            ? 'غير رسمي · على مستوى اللجنة فقط. لا يُصنَّف أي محكّم ولا يُسمَّى: هذه مؤشرات مراجعة للأمانة العامة، لا أحكام.'
            : 'Non-official · committee granularity only. No individual judge is scored, named or ranked — these are review prompts for the secretariat, not findings.'}
        </p>
        <div className="mt-3 space-y-2">
          {flagged.map(c => (
            <div key={c.committeeId} className="rounded-xl border border-[#e8dcc5] bg-white/70 p-3">
              <div className="text-[10px] font-black text-[#3a423d]">{nameOf(c.committeeId)}</div>
              <div className="mt-2 space-y-1 text-[10px] text-[#6e5936]">
                {c.synchrony === 'REVIEW_SYNC' && (
                  <div>{ar
                    ? `تسليم الدرجات متقارب جدًّا (${c.submissionSpreadMs} م.ث) — تأكّد أن الرصد بقي مستقلًّا.`
                    : `Submissions cluster very tightly (${c.submissionSpreadMs} ms) — confirm judging stayed independent.`}</div>
                )}
                {c.regionalEvenness === 'REVIEW_REGIONAL' && (
                  <div>{ar
                    ? `فارق متوسط الخصم بين الوفود داخل هذه اللجنة ${c.regionalPenaltyGap} درجة.`
                    : `Mean deduction differs by ${c.regionalPenaltyGap} points across delegations in this committee.`}</div>
                )}
                <div className="text-[9px] text-[#8a7857]">{ar ? `عيّنة ${c.sampleCount} تسليمًا` : `${c.sampleCount} submissions sampled`}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
};

export default CommitteeIntegrityNote;
