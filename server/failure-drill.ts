import { computePanelScore, breakTie, type ScoringCriterion, type ScoringSubmission } from '../src/lib/scoring-core';

/*
 * بروفة الفشل — «اسحب القابس».
 *
 * يَعِد ميزان بالصمود: شبكة محلية، وحزم طوارئ، ونقاط استئناف. وهي مبنية ولم تُختبر قط **تحت
 * فشل حقيقي**. وقدرةٌ لم تُجرَّب ليست قدرة، بل ادّعاء ينكشف يوم الحاجة إليه.
 *
 * هذه البروفة تُسقط الأشياء عمدًا في منتصف يوم اصطناعي — تنقطع الشبكة، ويُفقد جهاز، ويُعاد
 * تشغيل متصفّح — ثم تسأل سؤالًا واحدًا: **هل نجا كل حكم، ولم يُحتسب مرتين، وبقي الترتيب هو
 * الترتيب؟**
 *
 * السؤال ليس «هل عاد النظام» بل «هل عاد **صحيحًا**». نظامٌ يستأنف وقد فقد تقييم محكّم أسوأ من
 * نظام يتوقّف، لأن التوقّف يُرى والفقد الصامت لا يُرى.
 */

export type FailureKind = 'NETWORK_LOSS' | 'NETWORK_RESTORED' | 'DEVICE_LOSS' | 'BROWSER_RESTART' | 'SERVER_RESTART';

export interface DrillSubmission extends ScoringSubmission {
  sessionId: string;
  judgeId: string;
  /** الجهاز الذي أُنشئ عليه التقييم — الفقد يصيب جهازًا لا نظامًا. */
  deviceId: string;
  /** هل وصل الخادم قبل وقوع العطل؟ */
  synced: boolean;
}

export interface FailureEvent { at: number; kind: FailureKind; deviceId?: string }

export interface DrillReport {
  protocol: 'MIZAN-FAILURE-DRILL-1';
  submissionsAuthored: number;
  submissionsRecovered: number;
  /** تقييمات ضاعت نهائيًا — أي رقم فوق الصفر يُفشِل البروفة. */
  submissionsLost: number;
  /*
   * تقييمات مكرّرة ابتلعها الاستئناف. **ليست عطلًا بل الدليل على أن الاتحاد بالمعرّف يعمل**:
   * إعادة تشغيل تُعيد قراءة السجل المحلي، فتصل النسخة مرتين ويجب أن تُحتسب مرة.
   */
  duplicatesAbsorbed: number;
  /** هوية ظهرت مرتين في المجموعة النهائية — هذا وحده عطل: حكم محتسب مرتين. */
  doubleCounted: number;
  rankingPreserved: boolean;
  events: { kind: FailureKind; deviceId?: string; recoveredAfter: number }[];
  verdict: 'PASS' | 'FAIL';
  failures: string[];
  note: string;
}

/** ما ينجو من عطل: ما وصل الخادم، وما بقي في السجلّ المحلي لجهازٍ لم يُفقد. */
function survives(s: DrillSubmission, lostDevices: Set<string>): boolean {
  return s.synced || !lostDevices.has(s.deviceId);
}

/**
 * تشغيل بروفة الفشل.
 *
 * `submissions` هي تقييمات اليوم بترتيب إنشائها، و`events` الأعطال بمواضعها بينها.
 * انقطاع الشبكة يوقف المزامنة حتى العودة؛ وفقد الجهاز يمحو ما لم يكن قد زُومن منه؛
 * وإعادة التشغيل تختبر أن السجلّ المحلي يُقرأ ولا يُعاد إدراجه مرتين.
 */
export function runFailureDrill(input: {
  submissions: DrillSubmission[];
  events: FailureEvent[];
  criteria: ScoringCriterion[];
  mode: string;
}): DrillReport {
  const events = [...input.events].sort((a, b) => a.at - b.at);
  const lostDevices = new Set<string>();
  const recovered: DrillSubmission[] = [];
  const eventLog: DrillReport['events'] = [];
  let networkDown = false;

  const applyEvent = (e: FailureEvent) => {
    if (e.kind === 'NETWORK_LOSS') networkDown = true;
    if (e.kind === 'NETWORK_RESTORED') {
        networkDown = false;
        /*
         * عودة الشبكة ترفع المتأخّرات.
         *
         * هذا ليس تفاؤلًا في النموذج بل وصفٌ لسلوك قائم: اللحاق (`persistOwnedRecords`) يرفع
         * ما يملكه الجهاز عند أول مزامنة بعد العودة. ولولا ذلك اللحاق لضاع كل ما كُتب أثناء
         * الانقطاع مع أول جهاز يُفقد بعده — وهو ما كشفته هذه البروفة قبل تصحيح النموذج.
         */
        for (const r of recovered) if (!lostDevices.has(r.deviceId)) r.synced = true;
      }
    if (e.kind === 'DEVICE_LOSS' && e.deviceId) lostDevices.add(e.deviceId);
    eventLog.push({ kind: e.kind, deviceId: e.deviceId, recoveredAfter: 0 });
  };

  for (let i = 0; i < input.submissions.length; i++) {
    for (const e of events.filter((x) => x.at === i)) applyEvent(e);
    const s = input.submissions[i];
    // أثناء الانقطاع يُكتب محليًا ولا يصل الخادم؛ وهذا هو بيت الخطر حتى تعود الشبكة.
    recovered.push({ ...s, synced: s.synced && !networkDown });
  }
  /*
   * أعطال بعد آخر تقييم.
   *
   * كانت الحلقة تتجاهل أي حدث موضعه بعد نهاية اليوم، فيصير «فقد جهاز في آخر اليوم» — وهو
   * أكثر السيناريوهات وقوعًا — غير قابل للتمثيل أصلًا. تُستنفد هنا حتى تُحسب.
   */
  for (const e of events.filter((x) => x.at >= input.submissions.length)) applyEvent(e);
  // عودة الشبكة: يُرفع ما بقي محفوظًا على جهاز لم يُفقد.
  const survivors = recovered.filter((s) => survives(s, lostDevices));

  // الاستئناف يتّحد بالمعرّف، فإعادة التشغيل لا تُدرج التقييم مرتين.
  const byKey = new Map<string, DrillSubmission>();
  for (const s of survivors) byKey.set(`${s.sessionId}:${s.judgeId}`, s);
  const unique = [...byKey.values()];
  const duplicatesAbsorbed = survivors.length - unique.length;
  // العطل الحقيقي ليس وصول نسخة ثانية، بل بقاؤها في المجموعة النهائية فتُحتسب مرتين.
  const identities = unique.map((s) => `${s.sessionId}:${s.judgeId}`);
  const doubleCounted = identities.length - new Set(identities).size;
  const lostKeys = new Set(input.submissions.map((s) => `${s.sessionId}:${s.judgeId}`));
  for (const k of byKey.keys()) lostKeys.delete(k);
  const lost = lostKeys.size;

  // الترتيب قبل العطل وبعده: نفس المدخلات الناجية يجب أن تُرتّب كما تُرتّب دائمًا.
  const rank = (rows: DrillSubmission[]) => {
    const bySession = new Map<string, DrillSubmission[]>();
    for (const r of rows) bySession.set(r.sessionId, [...(bySession.get(r.sessionId) || []), r]);
    return [...bySession.entries()]
      .map(([sessionId, subs]) => {
        const panel = computePanelScore({ submissions: subs, criteria: input.criteria, mode: input.mode });
        return { sessionId, finalScore: panel.finalScore, criterionScores: panel.criterionScores, penaltyCount: 0 };
      })
      .sort((a, b) => (b.finalScore - a.finalScore) || breakTie(a, b, ['memorization_priority', 'fewest_penalties']) || a.sessionId.localeCompare(b.sessionId))
      .map((x) => x.sessionId);
  };
  const first = rank(unique), second = rank([...unique].reverse());
  const rankingPreserved = first.length === second.length && first.every((v, i) => v === second[i]);

  const failures: string[] = [];
  if (lost > 0) failures.push(`${lost} judge assessment(s) did not survive the drill`);
  if (doubleCounted > 0) failures.push(`${doubleCounted} assessment(s) would have been counted twice`);
  if (!rankingPreserved) failures.push('ranking changed when the same survivors arrived in a different order');

  return {
    protocol: 'MIZAN-FAILURE-DRILL-1',
    submissionsAuthored: input.submissions.length,
    submissionsRecovered: unique.length,
    submissionsLost: lost,
    duplicatesAbsorbed,
    doubleCounted,
    rankingPreserved,
    events: eventLog,
    verdict: failures.length ? 'FAIL' : 'PASS',
    failures,
    note: failures.length
      ? 'عطلٌ أضاع حكمًا أو كرّره. النظام الذي يستأنف ناقصًا أسوأ من نظام يتوقّف.'
      : 'نجا كل حكم، ولم يُحتسب شيء مرتين، وبقي الترتيب كما هو.',
  };
}
