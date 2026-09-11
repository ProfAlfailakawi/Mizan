import type { Committee, Participant } from '../types';
import { hashCanonical } from './trust-protocol';

/*
 * توزيع الموجات.
 *
 * البوابة تُسند كل واصلٍ وحده: أقلّ اللجان حِملًا لحظةَ مسحه. وهذا يكفي عند لجنتين،
 * ويخطئ كلما زادت اللجان والقيود — لأن القرار الفردي **لا يملك ترف التبديل**. ما إن
 * يُسنَد المتسابق حتى يصير تصحيحه نقلًا يمسّ الأسبقية ويحتاج سببًا مكتوبًا وسجلّ تدقيق.
 *
 * والموجة توزّع دفعةً واحدة، فتملك أن تبدّل **قبل** أن يصير الإسناد قرارًا. مثالٌ يوضّح
 * الفرق: وفدٌ من ثلاثين يصل في خمس دقائق. الجشع يوزّعهم بالتساوي عدديًا ولا يرى أن
 * وفدًا كاملًا وقع تحت لجنةٍ واحدة؛ والدفعة ترى التركيبة كلّها وتوازنها.
 *
 * وأربع طبقات تحكم كل إسناد:
 *
 *   ١) **أهلية صلبة** — فئةً ورواية وتعارضًا وحالةَ لجنة. لا تُخفَّف أبدًا. لا مرشّح ⇒
 *      لا إسناد وحادثة، لا لجنةٌ خطأ.
 *   ٢) **توازنٌ بالدقائق** — لا بالرؤوس. لجنةٌ بستٍّ وأخرى بأربع عشرة ليستا سواءً.
 *   ٣) **قيود عدالة تفضيلية** — سقفُ حصّة الوفد وعمقُ الطابور. تُخفَّف بالترتيب حين لا
 *      يبقى بديل، و**يُسجَّل أيُّ قيدٍ خُفِّف ولماذا** فلا يُخفَّف قيدٌ بصمت.
 *   ٤) **قرعةٌ ملتزمة عند التعادل الحقيقي** — لا «أوّل ما يقع في الحلقة». فيصير لسؤال
 *      «لِمَ لجنتي هذه؟» جوابٌ يُتحقَّق منه، بدل أن يكون صدفةَ ترتيبٍ في مصفوفة.
 *
 * وهذه الوحدة تقترح ولا تنفّذ: الخطة تُعرض ويوقّعها إنسان، كما تفعل مرونة اللجان.
 */

export const DISTRIBUTION_PLAN_VERSION = 'MIZAN-DISTRIBUTION-PLAN-1';

const MIN_SESSION_MINUTES = 1;

export interface DistributionConstraints {
  /** أقصى حصّةٍ لوفدٍ واحد من طابور لجنة (٠–١). صفرٌ أو غياب = بلا سقف. */
  delegationShareCap?: number;
  /** أقصى عدد منتظرين في لجنة. صفرٌ أو غياب = بلا سقف. */
  maxQueueDepth?: number;
  /** دورات التبديل بعد التوزيع الجشع. اثنتان تكفيان عمليًا؛ صفرٌ يُعطّل التحسين. */
  improvementPasses?: number;
  /**
   * السماح بلجنةٍ لا تحكم فئته حين لا تبقى لجنةٌ مؤهَّلة.
   *
   * مغلقٌ افتراضًا. وبدونه كان مَن لا لجنة لفئته يسقط في `unassigned` دائمًا — وهو حالٌ
   * لا تصل إليه «عدالة الطابور» أصلًا لأنها تحتاج لجنةَ مصدر وهو بلا لجنة. فكانت حالةٌ
   * تُعلَن على الشاشة ولا تملك المنصّة أداةً تعالجها.
   */
  allowCategoryException?: boolean;
}

/**
 * `CATEGORY_ELIGIBILITY` ليس كأخويه.
 *
 * الأوّلان قيدا عدالةٍ تفضيليّان يُخفَّفان تلقائيًا حين لا يبقى بديل. وهذا **أهليةٌ صلبة**
 * لا تُخفَّف إلا بطلبٍ صريح من مسؤول: لجنةٌ لا تحكم فئته تستقبله استثناءً حين تتعطّل
 * لجان فئته كلها. وأسئلته تبقى أسئلة فئته هو، وتُوسَم حالته فتعلم اللجنة.
 */
export type RelaxedConstraint = 'DELEGATION_SHARE_CAP' | 'MAX_QUEUE_DEPTH' | 'CATEGORY_ELIGIBILITY';

export interface AssignmentRow {
  participantId: string;
  participantCode: string;
  committeeId?: string;
  committeeCode?: string;
  /** ما خُفِّف من القيود التفضيلية ليُسنَد — فارغةٌ تعني إسنادًا بلا تنازل. */
  relaxed: RelaxedConstraint[];
  reasonArabic: string;
  reasonEnglish: string;
  /** حُسم بقرعةٍ ملتزمة لتعادلٍ حقيقي. */
  drawn: boolean;
}

export interface PanelLoadSnapshot {
  committeeId: string;
  code: string;
  waiting: number;
  loadMinutes: number;
}

export interface DistributionPlan {
  version: string;
  competitionId: string;
  createdAt: string;
  /** بذرة القرعة. تُحفظ فتُعاد الخطة نفسها حرفًا بحرف. */
  seed: string;
  assignments: AssignmentRow[];
  unassigned: AssignmentRow[];
  before: PanelLoadSnapshot[];
  after: PanelLoadSnapshot[];
  /** أطول انتظارٍ متوقّع في أثقل لجنة، قبل وبعد. الهدف خفضه لا خفض المتوسّط. */
  maxLoadMinutesBefore: number;
  maxLoadMinutesAfter: number;
  swapsApplied: number;
  drawsUsed: number;
  /** بصمة الخطة ومدخلاتها — تُلتزم قبل التنفيذ فلا تُبدَّل بعده بصمت. */
  planHash: string;
}

/* ── أدوات ──────────────────────────────────────────────────────────────── */

const sessionMinutes = (c: Committee) => Math.max(MIN_SESSION_MINUTES, Number(c.averageSessionMinutes) || 0);

/**
 * رقمٌ حتميّ من البذرة والمتسابق واللجنة، لفضّ التعادل الحقيقي.
 *
 * FNV-1a: بسيطة ومتاحة بلا انتظار، وكافيةٌ لترتيبٍ لا يُخمَّن مسبقًا — والالتزام
 * التشفيري على الخطة كلها هو ما يمنع تبديلها بعد إعلانها، لا هذه الدالة.
 */
export function drawValue(seed: string, participantId: string, committeeId: string): number {
  let h = 0x811c9dc5;
  const material = `${seed}|${participantId}|${committeeId}`;
  for (let i = 0; i < material.length; i++) {
    h ^= material.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

interface PanelState {
  committee: Committee;
  waiting: number;
  loadMinutes: number;
  byDelegation: Map<string, number>;
}

const delegationOf = (p: Participant) => String(p.delegationId || p.institution || '').trim().toLowerCase();

/**
 * تجاوزُ سقفِ الوفد لو أُضيف هذا المتسابق.
 *
 * والحصّة تُقاس بمقعدٍ مسموح لا بنسبةٍ خام، **ولوفدٍ مقعدٌ واحد دائمًا**. النسبة الخام
 * تنقلب على نفسها: على لجنةٍ فارغة تكون حصّة أوّل واصلٍ مئةً بالمئة مهما كان وفده، فيُمنع
 * من كل لجنةٍ خفيفة ولا يُقبل إلا حيث الطابور طويلٌ أصلًا — فيسوق القيدُ الناسَ إلى أثقل
 * اللجان، وهو نقيض ما وُضع له. قِيست فوجدت الفارق يقفز من ٩ دقائق إلى ٦٧٨.
 */
function breaksDelegationCap(state: PanelState, p: Participant, cap: number): boolean {
  if (!(cap > 0 && cap < 1)) return false;
  const key = delegationOf(p);
  if (!key) return false;
  const seatsAfter = state.waiting + 1;
  const allowance = Math.max(1, Math.floor(cap * seatsAfter));
  return ((state.byDelegation.get(key) || 0) + 1) > allowance;
}

const breaksDepth = (state: PanelState, maxDepth: number) => maxDepth > 0 && state.waiting >= maxDepth;

/* ── التخطيط ────────────────────────────────────────────────────────────── */

export interface DistributionPlanInput {
  competitionId: string;
  /** متسابقو الموجة، بالترتيب الذي وصلوا به. */
  participants: Participant[];
  committees: Committee[];
  /** اللجان المؤهَّلة لكل متسابق — الأهلية الصلبة تُقرَّر خارج هذه الوحدة. */
  eligibleFor: (participant: Participant) => Committee[];
  /**
   * اللجان التي تستقبله استثناءً حين لا تؤهّله واحدة: لا تحكم فئته، لكنها ليست
   * متعارضةً معه ولا متوقّفة. تُقرَّر خارج الوحدة كالأهلية، ولا تُستعمل إلا بإذنٍ صريح.
   */
  exceptionFor?: (participant: Participant) => Committee[];
  /** طابورٌ قائمٌ قبل الموجة، فالموجة تُضاف إلى واقعٍ لا إلى فراغ. */
  standingQueue?: Participant[];
  constraints?: DistributionConstraints;
  seed?: string;
  now?: Date;
}

export async function planDistribution(input: DistributionPlanInput): Promise<DistributionPlan> {
  const {
    competitionId, participants, committees, eligibleFor, exceptionFor,
    standingQueue = [], constraints = {}, seed = 'mizan', now = new Date(),
  } = input;
  const cap = Number(constraints.delegationShareCap) || 0;
  const maxDepth = Number(constraints.maxQueueDepth) || 0;
  const passes = constraints.improvementPasses ?? 2;
  const allowException = constraints.allowCategoryException === true;

  const panels = committees.filter(c => c.competitionId === competitionId && c.status !== 'offline');

  /* الحالة تبدأ من الطابور القائم: موجةٌ تتجاهل ما قبلها تُعيد بناء الازدحام نفسه. */
  const state = new Map<string, PanelState>();
  for (const c of panels) {
    const standing = standingQueue.filter(p => p.assignedCommitteeId === c.id && p.status === 'in_queue');
    const byDelegation = new Map<string, number>();
    for (const p of standing) { const k = delegationOf(p); if (k) byDelegation.set(k, (byDelegation.get(k) || 0) + 1); }
    state.set(c.id, { committee: c, waiting: standing.length, loadMinutes: standing.length * sessionMinutes(c), byDelegation });
  }

  const snapshot = (): PanelLoadSnapshot[] => panels
    .map(c => { const st = state.get(c.id)!; return { committeeId: c.id, code: c.code, waiting: st.waiting, loadMinutes: st.loadMinutes }; })
    .sort((a, b) => a.code.localeCompare(b.code));
  const before = snapshot();
  const maxLoadMinutesBefore = before.reduce((m, x) => Math.max(m, x.loadMinutes), 0);

  const assignments: AssignmentRow[] = [];
  const unassigned: AssignmentRow[] = [];
  let drawsUsed = 0;

  const place = (panelId: string, p: Participant) => {
    const st = state.get(panelId)!;
    st.waiting += 1;
    st.loadMinutes += sessionMinutes(st.committee);
    const k = delegationOf(p);
    if (k) st.byDelegation.set(k, (st.byDelegation.get(k) || 0) + 1);
  };
  const unplace = (panelId: string, p: Participant) => {
    const st = state.get(panelId)!;
    st.waiting -= 1;
    st.loadMinutes -= sessionMinutes(st.committee);
    const k = delegationOf(p);
    if (k) st.byDelegation.set(k, Math.max(0, (st.byDelegation.get(k) || 0) - 1));
  };

  /* ── الطبقة الأولى والثانية والثالثة: توزيعٌ جشع بأقل تكلفة ───────────── */
  for (const p of participants) {
    const qualified = eligibleFor(p).filter(c => state.has(c.id));
    /*
     * لا لجنة مؤهَّلة. الاستثناء لا يُؤخذ إلا بإذنٍ صريح — وبدونه يبقى في `unassigned`
     * ويُقال سببه، فالمنصّة تعترف بعجزها بدل أن تُسنِد إسنادًا خاطئًا بصمت.
     */
    const exceptional = !qualified.length && allowException
      ? (exceptionFor?.(p) || []).filter(c => state.has(c.id))
      : [];
    const eligible = qualified.length ? qualified : exceptional;
    if (!eligible.length) {
      unassigned.push({
        participantId: p.id, participantCode: p.code, relaxed: [], drawn: false,
        reasonArabic: allowException
          ? 'لا توجد لجنة مؤهَّلة لفئته، ولا لجنة تصلح استثناءً — يحتاج لجنةً تغطي فئته.'
          : 'لا توجد لجنة مؤهَّلة لفئته وروايته. يمكن السماح بالاستثناء عبر الفئات إن تعطّلت لجان فئته.',
        reasonEnglish: allowException
          ? 'No qualifying panel, and none usable as an exception — a panel covering the category is needed.'
          : 'No panel qualifies for this category and reading. A cross-category exception can be allowed if his own panels are down.',
      });
      continue;
    }
    const viaException = !qualified.length;

    /* القيود التفضيلية تُخفَّف بالترتيب، ويُسجَّل ما خُفِّف. */
    const base: RelaxedConstraint[] = viaException ? ['CATEGORY_ELIGIBILITY'] : [];
    const tiers: { relaxed: RelaxedConstraint[]; pool: Committee[] }[] = [
      { relaxed: base, pool: eligible.filter(c => !breaksDelegationCap(state.get(c.id)!, p, cap) && !breaksDepth(state.get(c.id)!, maxDepth)) },
      { relaxed: [...base, 'DELEGATION_SHARE_CAP'], pool: eligible.filter(c => !breaksDepth(state.get(c.id)!, maxDepth)) },
      { relaxed: [...base, 'DELEGATION_SHARE_CAP', 'MAX_QUEUE_DEPTH'], pool: eligible },
    ];
    const tier = tiers.find(t => t.pool.length)!;

    /* أقلّ حِملًا بالدقائق، ثم الأسرع، ثم الأقلّ طابورًا — وما بقي متعادلًا تحسمه القرعة. */
    const ranked = [...tier.pool].sort((a, b) => {
      const sa = state.get(a.id)!, sb = state.get(b.id)!;
      return sa.loadMinutes - sb.loadMinutes
        || sessionMinutes(a) - sessionMinutes(b)
        || sa.waiting - sb.waiting
        || drawValue(seed, p.id, a.id) - drawValue(seed, p.id, b.id);
    });
    const best = ranked[0];
    const bs = state.get(best.id)!;
    /* تعادلٌ حقيقي: تساوٍ في كل ما يُرتَّب به قبل القرعة. */
    const tiedCount = ranked.filter(c => {
      const st = state.get(c.id)!;
      return st.loadMinutes === bs.loadMinutes && sessionMinutes(c) === sessionMinutes(best) && st.waiting === bs.waiting;
    }).length;
    const drawn = tiedCount > 1;
    if (drawn) drawsUsed += 1;

    place(best.id, p);
    assignments.push({
      participantId: p.id, participantCode: p.code,
      committeeId: best.id, committeeCode: best.code,
      relaxed: tier.relaxed, drawn,
      /* لجنةُ الاستثناء ليست «مؤهَّلة» — وتسميتُها كذلك في سطر السبب تُخفي بالضبط ما
         وُقِّع عليه. فالصياغة تُفرَّق: تخفيفُ قيدٍ تفضيليّ شيء، وتجاوزُ الفئة شيءٌ آخر. */
      reasonArabic: viaException
        ? `لا لجنة تغطّي فئته، فأُسند استثناءً موقَّعًا إلى أقلّ اللجان المتاحة حِملًا${tier.relaxed.length > 1 ? ` (مع تخفيف: ${tier.relaxed.filter(r => r !== 'CATEGORY_ELIGIBILITY').map(relaxedArabic).join('، ')})` : ''}. ويبقى يُسأل في نطاق فئته هو.`
        : tier.relaxed.length
          ? `أقلّ اللجان المؤهَّلة حِملًا بعد تخفيف: ${tier.relaxed.map(relaxedArabic).join('، ')}.`
          : drawn ? 'تعادلٌ حقيقي بين لجانٍ مؤهَّلة، حُسم بقرعةٍ ملتزمة ببصمة الخطة.'
            : 'أقلّ اللجان المؤهَّلة حِملًا بالدقائق.',
      reasonEnglish: viaException
        ? `No panel covers this category; routed by signed exception to the lightest available panel${tier.relaxed.length > 1 ? ` (relaxing: ${tier.relaxed.filter(r => r !== 'CATEGORY_ELIGIBILITY').join(', ')})` : ''}. Questions stay within their own scope.`
        : tier.relaxed.length
          ? `Lightest qualified panel after relaxing: ${tier.relaxed.join(', ')}.`
          : drawn ? 'A genuine tie between qualified panels, settled by a committed draw.'
            : 'Lightest qualified panel measured in minutes.',
    });
  }

  /* ── التبديل: يخفض أثقل لجنة، وهو ما يشعر به المنتظر فعلًا ───────────── */
  let swapsApplied = 0;
  const rowById = new Map(assignments.map(r => [r.participantId, r]));
  const participantById = new Map(participants.map(p => [p.id, p]));

  const peak = () => Math.max(0, ...panels.map(c => state.get(c.id)!.loadMinutes));

  for (let pass = 0; pass < passes; pass++) {
    let improvedThisPass = false;
    for (const row of assignments) {
      if (!row.committeeId) continue;
      const p = participantById.get(row.participantId);
      if (!p) continue;
      const from = row.committeeId;
      /* من أُسند استثناءً تُبدَّل لجنته بين لجان الاستثناء نفسها، لا بين المؤهَّلة — وإلا
         بدّل التحسينُ استثناءً موقَّعًا بإسنادٍ لم يوقّعه أحد. */
      const movable = row.relaxed.includes('CATEGORY_ELIGIBILITY') ? (exceptionFor?.(p) || []) : eligibleFor(p);
      const alternatives = movable.filter(c => state.has(c.id) && c.id !== from);
      if (!alternatives.length) continue;

      const peakBefore = peak();
      let bestMove: { to: string; peak: number } | null = null;
      for (const alt of alternatives) {
        const st = state.get(alt.id)!;
        /* نقلٌ يكسر قيدًا لم يُخفَّف لهذا المتسابق ليس تحسينًا. */
        if (!row.relaxed.includes('DELEGATION_SHARE_CAP') && breaksDelegationCap(st, p, cap)) continue;
        if (!row.relaxed.includes('MAX_QUEUE_DEPTH') && breaksDepth(st, maxDepth)) continue;
        unplace(from, p); place(alt.id, p);
        const after = peak();
        unplace(alt.id, p); place(from, p);
        if (after < peakBefore && (!bestMove || after < bestMove.peak)) bestMove = { to: alt.id, peak: after };
      }
      if (bestMove) {
        unplace(from, p); place(bestMove.to, p);
        const target = panels.find(c => c.id === bestMove!.to)!;
        row.committeeId = target.id;
        row.committeeCode = target.code;
        row.reasonArabic = `${row.reasonArabic} ثم نُقل ضمن الموجة لخفض أطول انتظارٍ متوقّع.`;
        row.reasonEnglish = `${row.reasonEnglish} Then moved within the wave to lower the worst expected wait.`;
        rowById.set(row.participantId, row);
        swapsApplied += 1;
        improvedThisPass = true;
      }
    }
    if (!improvedThisPass) break;
  }

  const after = snapshot();
  const maxLoadMinutesAfter = after.reduce((m, x) => Math.max(m, x.loadMinutes), 0);
  const createdAt = now.toISOString();

  /*
   * الالتزام. يضم المدخلات والبذرة والناتج معًا: خطةٌ تُعلن بصمتها ثم تُبدَّل قبل التنفيذ
   * لا تُكتشف إلا بها.
   */
  const planHash = await hashCanonical({
    version: DISTRIBUTION_PLAN_VERSION,
    competitionId,
    createdAt,
    seed,
    constraints: { delegationShareCap: cap, maxQueueDepth: maxDepth, improvementPasses: passes, allowCategoryException: allowException },
    inputs: participants.map(p => ({ id: p.id, code: p.code, categoryId: p.categoryId, delegation: delegationOf(p) })),
    assignments: assignments.map(r => ({ participantId: r.participantId, committeeId: r.committeeId, relaxed: r.relaxed })),
    unassigned: unassigned.map(r => r.participantId),
  });

  return {
    version: DISTRIBUTION_PLAN_VERSION,
    competitionId,
    createdAt,
    seed,
    assignments,
    unassigned,
    before,
    after,
    maxLoadMinutesBefore,
    maxLoadMinutesAfter,
    swapsApplied,
    drawsUsed,
    planHash,
  };
}

function relaxedArabic(c: RelaxedConstraint): string {
  if (c === 'DELEGATION_SHARE_CAP') return 'سقف حصّة الوفد';
  if (c === 'MAX_QUEUE_DEPTH') return 'سقف عمق الطابور';
  return 'شرط الفئة (استثناء موقَّع)';
}

/**
 * إعادة التحقق من خطةٍ معروضة قبل تنفيذها.
 *
 * الخطة تُقترح ثم يوقّعها إنسان، وبين اللحظتين قد يتغيّر كل شيء: تُقفل لجنة، أو يصل من
 * ليس فيها. فالتنفيذ لا يثق ببصمةٍ وحدها — يعيد البناء بالمدخلات نفسها ويقارن.
 */
export async function verifyDistributionPlan(plan: DistributionPlan, rebuild: () => Promise<DistributionPlan>): Promise<{ ok: boolean; reason: string }> {
  try {
    const fresh = await rebuild();
    if (fresh.planHash === plan.planHash) return { ok: true, reason: '' };
    return { ok: false, reason: 'PLAN_STALE' };
  } catch { return { ok: false, reason: 'PLAN_REBUILD_FAILED' } }
}
