import type { Committee, IncidentRecord, Participant, QueueTransferRecord } from '../types';
import { committeeTempo, etaAccuracy, type EtaAccuracy, type QueueWaitSample, type SessionTempoSample } from './session-tempo';

/*
 * ماذا حدث اليوم فعلًا.
 *
 * المنصّة كلّها مبنيّة لليوم نفسه: من يُنادى الآن، ومن التالي، وأين تعثّر الطابور. ولا شيء
 * فيها ينظر إلى الوراء. فتُختَم المسابقة وتُغلق، ويُعاد إعدادها في السنة القادمة **بالأرقام
 * نفسها التي ثبت خطؤها** — لأن أحدًا لم يقارن ما قُدّر بما وقع.
 *
 * وهذا أضعف ما في كل مسابقةٍ سنويّة: التجربة تُكتسب ولا تُحفظ.
 *
 * ثلاثة أشياء يحفظها هذا التقرير، وكلّها مقيسة لا مقدَّرة:
 *
 *   ١) **إيقاع كل لجنة** مقابل ما قُدّر لها — فيُعرف أين كان الإعداد بعيدًا، بكم دقيقة.
 *   ٢) **صدق التقدير** — ما وُعد به الناس مقابل ما انتظروه.
 *   ٣) **ما اضطُرّت إليه القاعة**: نقلٌ، واستثناءٌ عبر الفئات، ومنتظرٌ بلا لجنة. وكلٌّ منها
 *      يشير إلى ثغرةٍ في الإعداد لا إلى خطأٍ في التشغيل.
 *
 * وقاعدةٌ واحدة تحكم الصياغة: **وصفيّ لا حافز.** لا يُرتَّب به أحد، ولا يدخل تقييمًا —
 * وإلا صار ضغطًا على التحكيم، وهو ما يحظره النظام في كل موضع.
 */

export const DAY_RETROSPECTIVE_VERSION = 'MIZAN-DAY-RETROSPECTIVE-1';

export interface PanelRetrospective {
  committeeId: string;
  code: string;
  name: string;
  completed: number;
  /** ما قُدّر لها عند الإعداد. */
  configuredMinutes: number;
  /** ما فعلته فعلًا — أو `null` حين لا تكفي العيّنة للحكم. */
  measuredMinutes: number | null;
  /** الفارق بالدقائق: موجبٌ يعني أن الإعداد كان متفائلًا. */
  driftMinutes: number | null;
  sampleCount: number;
}

export interface DayRetrospective {
  version: string;
  competitionId: string;
  createdAt: string;
  /** وصفيّ بحت — يُذكر في الوثيقة نفسها فلا يُقتطع منها ويُستعمل حكمًا. */
  nonRanking: true;
  participantsTested: number;
  participantsStillWaiting: number;
  panels: PanelRetrospective[];
  eta: EtaAccuracy;
  /** ما اضطُرّت إليه القاعة — كلٌّ منها ثغرةُ إعداد. */
  strain: {
    queueTransfers: number;
    crossCategoryExceptions: number;
    equityCompensations: number;
    unroutedArrivals: number;
    routingIncidents: number;
  };
  /** ما يُقترح تغييره في إعداد السنة القادمة، مشتقًّا من الأرقام أعلاه وحدها. */
  lessons: { titleArabic: string; titleEnglish: string; detailArabic: string; detailEnglish: string }[];
}

export interface DayRetrospectiveInput {
  competitionId: string;
  participants: Participant[];
  committees: Committee[];
  transfers: QueueTransferRecord[];
  incidents: IncidentRecord[];
  tempoSamples: SessionTempoSample[];
  waitSamples: QueueWaitSample[];
  now?: Date;
}

/** أدنى انحرافٍ يستحقّ أن يُقال للمُعِدّ — ما دونه ضجيجٌ لا درس. */
const DRIFT_WORTH_SAYING = 2;

export function buildDayRetrospective(input: DayRetrospectiveInput): DayRetrospective {
  const { competitionId, participants, committees, transfers, incidents, tempoSamples, waitSamples, now = new Date() } = input;

  const scoped = participants.filter(p => p.competitionId === competitionId);
  const panelsIn = committees.filter(c => c.competitionId === competitionId);

  const panels: PanelRetrospective[] = panelsIn.map(c => {
    const reading = committeeTempo(c, tempoSamples);
    const measured = reading.source === 'measured';
    return {
      committeeId: c.id,
      code: c.code,
      name: c.nameArabic || c.name,
      completed: Math.max(0, Number(c.completedCount) || 0),
      configuredMinutes: reading.configuredMinutes,
      measuredMinutes: measured ? reading.minutes : null,
      driftMinutes: measured ? reading.driftMinutes : null,
      sampleCount: reading.sampleCount,
    };
  }).sort((a, b) => a.code.localeCompare(b.code));

  const scopedTransfers = transfers.filter(t => t.competitionId === competitionId);
  const strain = {
    queueTransfers: scopedTransfers.length,
    crossCategoryExceptions: scoped.filter(p => p.crossCategoryException).length,
    equityCompensations: scopedTransfers.reduce((n, t) => n + (t.equity?.filter(e => e.fairPosition < e.positionIfAppended).length || 0), 0),
    unroutedArrivals: scoped.filter(p => p.status === 'in_queue' && !p.assignedCommitteeId).length,
    routingIncidents: incidents.filter(i => i.competitionId === competitionId && i.type === 'conflict_routing').length,
  };

  const eta = etaAccuracy(waitSamples);

  /* ── الدروس: مشتقّة من الأرقام وحدها، ولا تُقال إلا حين تُحتمل ─────────── */
  const lessons: DayRetrospective['lessons'] = [];

  const optimistic = panels.filter(p => (p.driftMinutes ?? 0) >= DRIFT_WORTH_SAYING);
  if (optimistic.length) {
    lessons.push({
      titleArabic: 'زمن الجلسة المُعدّ كان أقصر من الواقع',
      titleEnglish: 'The configured session length was shorter than reality',
      detailArabic: `${optimistic.length} لجنة أخذت وقتًا أطول مما قُدّر لها (أكبر فارق ${Math.max(...optimistic.map(p => p.driftMinutes || 0))} دقيقة). ابدأ إعداد السنة القادمة من المقيس لا من التقدير.`,
      detailEnglish: `${optimistic.length} panel(s) ran longer than configured (largest gap ${Math.max(...optimistic.map(p => p.driftMinutes || 0))} min). Start next year from what was measured, not from the estimate.`,
    });
  }

  const generous = panels.filter(p => (p.driftMinutes ?? 0) <= -DRIFT_WORTH_SAYING);
  if (generous.length) {
    lessons.push({
      titleArabic: 'زمن الجلسة المُعدّ كان أطول من الواقع',
      titleEnglish: 'The configured session length was longer than reality',
      detailArabic: `${generous.length} لجنة أنهت أسرع مما قُدّر لها، فحُجزت لها طاقةٌ لم تُستعمل وطالت التقديرات المعروضة على المنتظرين بلا سبب.`,
      detailEnglish: `${generous.length} panel(s) finished faster than configured, so capacity was reserved unused and the waits shown to people were longer than needed.`,
    });
  }

  if (strain.unroutedArrivals > 0 || strain.routingIncidents > 0) {
    lessons.push({
      titleArabic: 'فئاتٌ وصلت ولا لجنة تغطّيها',
      titleEnglish: 'Categories arrived with no panel covering them',
      detailArabic: `${strain.routingIncidents} حادثة توجيه، و${strain.unroutedArrivals} ما زالوا بلا لجنة. راجع إسناد الفئات للجان قبل يوم المسابقة — هذه ثغرة إعداد لا عطب تشغيل.`,
      detailEnglish: `${strain.routingIncidents} routing incident(s) and ${strain.unroutedArrivals} still unrouted. Review category-to-panel assignment before the day — this is a setup gap, not an operations fault.`,
    });
  }

  if (strain.crossCategoryExceptions > 0) {
    lessons.push({
      titleArabic: 'متسابقون حُكِّموا في لجانٍ ليست لفئتهم',
      titleEnglish: 'Participants were judged by panels outside their category',
      detailArabic: `${strain.crossCategoryExceptions} استثناءً عبر الفئات. كلٌّ منها كان الحلّ الصحيح لحظتَه، ومجموعُها يقول إن تغطية الفئات كانت هشّة.`,
      detailEnglish: `${strain.crossCategoryExceptions} cross-category exception(s). Each was right at the time; together they say category coverage was thin.`,
    });
  }

  if (eta.trustworthy && Math.abs(eta.biasMinutes) >= DRIFT_WORTH_SAYING) {
    lessons.push({
      titleArabic: eta.biasMinutes > 0 ? 'الأرقام المعروضة كانت تَعِد بأقصر مما وقع' : 'الأرقام المعروضة كانت تَعِد بأطول مما وقع',
      titleEnglish: eta.biasMinutes > 0 ? 'Displayed waits promised shorter than reality' : 'Displayed waits promised longer than reality',
      detailArabic: `ميلُ التقدير ${Math.abs(eta.biasMinutes)} دقيقة، و${Math.round(eta.withinFiveMinutesRate * 100)}٪ فقط وقعوا داخل خمس دقائق من الوعد. ورقمٌ يُخلف يُفقد الثقة في كل رقمٍ بعده.`,
      detailEnglish: `Estimate bias ${Math.abs(eta.biasMinutes)} min; only ${Math.round(eta.withinFiveMinutesRate * 100)}% landed within five minutes. A number that misses costs every number after it.`,
    });
  }

  if (!lessons.length) {
    lessons.push({
      titleArabic: 'لا درس يستحقّ التغيير',
      titleEnglish: 'Nothing here asks to be changed',
      detailArabic: 'الإعداد طابق الواقع في حدود ما يُقاس. أبقِ أرقام هذه السنة كما هي.',
      detailEnglish: 'Configuration matched reality within what can be measured. Carry this year’s numbers forward.',
    });
  }

  return {
    version: DAY_RETROSPECTIVE_VERSION,
    competitionId,
    createdAt: now.toISOString(),
    nonRanking: true,
    participantsTested: scoped.filter(p => ['tested', 'certified', 'appealed'].includes(p.status)).length,
    participantsStillWaiting: scoped.filter(p => p.status === 'in_queue').length,
    panels,
    eta,
    strain,
    lessons,
  };
}
