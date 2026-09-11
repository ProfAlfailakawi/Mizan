/*
 * تحليل الطلب والعرض على مواضع الأسئلة، وحساب الندرة، والتنبؤ قبل بدء المسابقة.
 *
 * السؤال الذي تجيب عنه هذه الوحدة: بعد إغلاق التسجيل، أي نطاق مزدحم؟ وكم موضعًا صالحًا
 * نملك فيه؟ وكم سؤالًا سيُطلب منه؟ وهل التكرار حتمي؟ ومتى يبدأ؟ وأين عنق الزجاجة؟
 *
 * والتفريق هنا مقصود: التكرار الحتمي رياضيًا (draws > loci) ليس عيبًا في الخوارزمية؛
 * والتكرار الزائد عنه هو العيب. الفصل بينهما مقيس لا مُدّعى.
 */

import { QURAN_JUZ_TOTAL, ayahOrdinal, juzBounds } from './quran-canon';
import { describeScope, scopeAyahCount, scopeIntersect, scopeKey, scopeMetrics, scopeSignature, type QuranScope } from './quran-scope';
import { candidatesInScope, uniqueLocusCount, locusKeyOf, type QuestionCandidate, type ScarcityOracle } from './question-engine';
import { resolveZoneSlots, type QuestionDistributionPlan } from './question-zones';
import { isScopeSubsetOf, scopeUnion } from './quran-scope';
import { theoreticalRepeatFloor, type RepeatPolicy } from './repeat-policy';

export interface DemandParticipant {
  participantId: string;
  categoryId: string;
  scope: QuranScope;
  questionCount: number;
}

export interface ScopeCluster {
  signature: string;
  scopeKey: string;
  scope: QuranScope;
  label: string;
  participantCount: number;
  participantIds: string[];
  categoryIds: string[];
  demand: number;
  supply: number;
  pressure: number;
  unavoidableRepeats: number;
  averageReuse: number;
  minimumMaxUses: number;
  sufficientForStrictNoRepeat: boolean;
}

export interface JuzHeatCell {
  juz: number;
  participantCount: number;
  demand: number;
  supply: number;
  pressure: number;
  approvedSupply: number;
  exhaustionRisk: 'none' | 'low' | 'medium' | 'high' | 'critical';
}

export interface DemandAnalysis {
  participantCount: number;
  totalDraws: number;
  totalUniqueLoci: number;
  clusters: ScopeCluster[];
  juzHeat: JuzHeatCell[];
  bottlenecks: ScopeCluster[];
  rarestClusters: ScopeCluster[];
  overallFloor: ReturnType<typeof theoreticalRepeatFloor>;
  generatedAt: string;
}

const riskOf = (pressure: number): JuzHeatCell['exhaustionRisk'] =>
  pressure <= 0 ? 'none' : pressure < 0.5 ? 'low' : pressure < 1 ? 'medium' : pressure < 2 ? 'high' : 'critical';

/**
 * تحليل كامل: يجمع المتسابقين بحسب بصمة النطاق أولًا — سبعمئة متسابق بنطاق واحد عنقودٌ
 * واحد لا سبعمئة حساب — ثم يقيس لكل عنقود طلبَه وعرضَه.
 */
export function analyzeDemand(input: {
  participants: DemandParticipant[];
  candidates: QuestionCandidate[];
  approvedOnly?: boolean;
}): DemandAnalysis {
  const candidates = input.approvedOnly === false ? input.candidates : input.candidates.filter(c => !c.approvalStatus || c.approvalStatus === 'approved');
  const byScope = new Map<string, DemandParticipant[]>();
  for (const participant of input.participants) {
    const key = scopeKey(participant.scope);
    const list = byScope.get(key);
    if (list) list.push(participant); else byScope.set(key, [participant]);
  }
  const clusters: ScopeCluster[] = [];
  for (const [key, members] of byScope) {
    const scope = members[0].scope;
    const supply = uniqueLocusCount(candidatesInScope(candidates, scope));
    const demand = members.reduce((sum, m) => sum + Math.max(0, m.questionCount), 0);
    const floor = theoreticalRepeatFloor({ draws: demand, uniqueLoci: supply });
    clusters.push({
      signature: scopeSignature(scope),
      scopeKey: key,
      scope,
      label: describeScope(scope, true),
      participantCount: members.length,
      participantIds: members.map(m => m.participantId),
      categoryIds: [...new Set(members.map(m => m.categoryId))],
      demand,
      supply,
      pressure: supply ? Number((demand / supply).toFixed(3)) : demand ? Infinity : 0,
      unavoidableRepeats: floor.unavoidableRepeats,
      averageReuse: floor.averageReuse,
      minimumMaxUses: floor.minimumMaxUses,
      sufficientForStrictNoRepeat: floor.feasibleWithoutRepeat,
    });
  }
  clusters.sort((a, b) => b.pressure - a.pressure || b.demand - a.demand);

  const juzHeat: JuzHeatCell[] = [];
  for (let juz = 1; juz <= QURAN_JUZ_TOTAL; juz++) {
    const bounds = juzBounds(juz);
    const juzScope: QuranScope = { version: 1, segments: [{ start: bounds.start, end: bounds.end }], assurance: bounds.assurance };
    let participantCount = 0, demand = 0;
    for (const cluster of clusters) {
      const overlap = scopeAyahCount(scopeIntersect(cluster.scope, juzScope));
      if (!overlap) continue;
      participantCount += cluster.participantCount;
      // الطلب يُوزَّع على الأجزاء بنسبة ما يغطيه كل جزء من النطاق، لا يُحسب كاملًا لكل جزء.
      demand += cluster.demand * (overlap / Math.max(1, scopeAyahCount(cluster.scope)));
    }
    const inside = candidatesInScope(candidates, juzScope);
    const supply = uniqueLocusCount(inside);
    const approvedSupply = uniqueLocusCount(inside.filter(c => c.difficultyAssurance === 'human_reviewed' || c.difficultyAssurance === 'scientifically_approved'));
    const pressure = supply ? demand / supply : demand ? Infinity : 0;
    juzHeat.push({
      juz, participantCount, demand: Math.round(demand), supply, approvedSupply,
      pressure: Number.isFinite(pressure) ? Number(pressure.toFixed(3)) : Number.MAX_SAFE_INTEGER,
      exhaustionRisk: riskOf(pressure),
    });
  }

  const totalDraws = input.participants.reduce((sum, p) => sum + Math.max(0, p.questionCount), 0);
  const totalUniqueLoci = uniqueLocusCount(candidates);
  return {
    participantCount: input.participants.length,
    totalDraws,
    totalUniqueLoci,
    clusters,
    juzHeat,
    bottlenecks: clusters.filter(c => !c.sufficientForStrictNoRepeat).slice(0, 8),
    rarestClusters: [...clusters].sort((a, b) => a.supply - b.supply).slice(0, 5),
    overallFloor: theoreticalRepeatFloor({ draws: totalDraws, uniqueLoci: totalUniqueLoci }),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * مِرصد الندرة على مستوى العنقود.
 *
 * ضغط الموضع = **مجموع** كثافات الطلب (طلب ÷ عرض) لكل عنقود يحتاجه، لا أعلاها.
 * والجمع هو الصواب: موضعٌ في الجزء الثلاثين يحتاجه أصحابُ المصحف كله وأصحابُ الجزء الثلاثين
 * معًا، فعبؤه مجموع العبئين. ولو أُخذ الأعلى وحده لتساوى مع موضعٍ لا يحتاجه إلا فريق واحد،
 * فضاع المعنى كله.
 */
export function buildScarcityOracle(analysis: DemandAnalysis, candidates: QuestionCandidate[]): ScarcityOracle {
  const pressure = new Map<string, number>();
  for (const cluster of analysis.clusters) {
    if (!Number.isFinite(cluster.pressure) || cluster.pressure <= 0) continue;
    for (const candidate of candidatesInScope(candidates, cluster.scope)) {
      const key = locusKeyOf(candidate);
      pressure.set(key, (pressure.get(key) || 0) + cluster.pressure);
    }
  }
  // التطبيع إلى ٠..١ يمنع أن يبتلع ضغط الندرة بقية معايير المفاضلة.
  const max = Math.max(1, ...pressure.values());
  return { pressureOfLocus: (key: string) => (pressure.get(key) || 0) / max };
}

export interface PolicyRecommendation {
  id: string;
  ar: string;
  en: string;
  severity: 'critical' | 'warning' | 'recommendation';
  action?: { kind: 'repeat_mode'; value: RepeatPolicy['mode'] } | { kind: 'minimum_gap'; value: number } | { kind: 'add_loci'; value: number } | { kind: 'reserve'; value: number };
}

/** توصيات مبنية على الأرقام لا على الحدس. اللجنة هي التي تعتمد، والنظام يشرح السبب. */
export function recommendPolicy(analysis: DemandAnalysis, policy: RepeatPolicy): PolicyRecommendation[] {
  const out: PolicyRecommendation[] = [];
  const impossible = analysis.clusters.filter(c => !c.sufficientForStrictNoRepeat);
  if (policy.mode === 'strict_no_repeat' && impossible.length) {
    const worst = impossible[0];
    out.push({
      id: 'strict_impossible',
      severity: 'critical',
      ar: `عدم التكرار الكامل غير ممكن: النطاق «${worst.label}» يطلب ${worst.demand} سؤالًا ولا يملك إلا ${worst.supply} موضعًا صالحًا.`,
      en: `Strict no-repeat is impossible: scope "${worst.label}" needs ${worst.demand} questions but has only ${worst.supply} eligible loci.`,
      action: { kind: 'repeat_mode', value: 'balanced_reuse' },
    });
  }
  for (const cluster of impossible.slice(0, 3)) {
    out.push({
      id: `shortfall-${cluster.signature}`,
      severity: 'warning',
      ar: `«${cluster.label}»: ${cluster.participantCount} متسابقًا، و${cluster.supply} موضعًا، فسيتكرر كل موضع ${cluster.averageReuse} مرة في المتوسط. إضافة ${Math.max(0, cluster.demand - cluster.supply)} موضعًا تُنهي التكرار الحتمي.`,
      en: `"${cluster.label}": ${cluster.participantCount} participants against ${cluster.supply} loci — average reuse ${cluster.averageReuse}. Adding ${Math.max(0, cluster.demand - cluster.supply)} loci removes unavoidable repetition.`,
      action: { kind: 'add_loci', value: Math.max(0, cluster.demand - cluster.supply) },
    });
  }
  const denseCluster = analysis.clusters[0];
  if (denseCluster && Number.isFinite(denseCluster.pressure) && denseCluster.pressure > 1) {
    const suggestedGap = Math.max(5, Math.min(120, Math.floor(denseCluster.supply / Math.max(1, denseCluster.minimumMaxUses))));
    if ((policy.minimumParticipantGap || 0) < suggestedGap) {
      out.push({
        id: 'gap_suggestion',
        severity: 'recommendation',
        ar: `لتباعد أفضل بين استعمالات الموضع نفسه، اجعل الحد الأدنى ${suggestedGap} متسابقًا بين الاستعمالين.`,
        en: `For better separation between reuses, set the minimum participant gap to ${suggestedGap}.`,
        action: { kind: 'minimum_gap', value: suggestedGap },
      });
    }
  }
  const reserve = Math.max(3, Math.ceil(analysis.participantCount * 0.02));
  out.push({
    id: 'reserve_suggestion',
    severity: 'recommendation',
    ar: `احتفظ بـ${reserve} نموذجًا احتياطيًا لتغطية الاستبدال الطارئ دون كسر العدالة.`,
    en: `Keep ${reserve} reserve models so emergency replacement never breaks fairness.`,
    action: { kind: 'reserve', value: reserve },
  });
  const unrated = analysis.juzHeat.filter(x => x.supply > 0 && x.approvedSupply === 0);
  if (unrated.length) {
    out.push({
      id: 'difficulty_review',
      severity: 'warning',
      ar: `${unrated.length} جزءًا فيه مواضع بلا مراجعة علمية للصعوبة. البطولات الرسمية قد تشترط المراجعة.`,
      en: `${unrated.length} juz have loci with no reviewed difficulty. Official tournaments may require review.`,
    });
  }
  return out;
}

/** متى يبدأ التكرار؟ عدد السحوبات التي يستوعبها البنك قبل أول إعادة حتمية. */
export function forecastFirstRepeat(analysis: DemandAnalysis): { drawsBeforeFirstRepeat: number; cluster: ScopeCluster | null } {
  const constrained = analysis.clusters.filter(c => !c.sufficientForStrictNoRepeat);
  if (!constrained.length) return { drawsBeforeFirstRepeat: analysis.totalDraws, cluster: null };
  const worst = constrained.reduce((a, b) => (a.supply <= b.supply ? a : b));
  return { drawsBeforeFirstRepeat: worst.supply, cluster: worst };
}



/*
 * الحدّ الأدنى الحقيقي لإعادة الاستعمال — مقياس جودة الخوارزمية.
 *
 * القسمة الساذجة (سحوبات ÷ مواضع) تُجمّل الصورة: هي تفترض أن كل موضع يصلح لكل سحبة،
 * وهذا غير صحيح. متسابق نطاقه الجزء الأول لا ينتفع بموضع في الجزء العشرين، وخانةٌ مقيّدة
 * بمنطقة لا تُسحب من خارجها.
 *
 * فالحساب هنا يبني «مجموعات طلب»: (عنقود نطاق × منطقة). لكل مجموعة طلبٌ محدد ومجموعة
 * مواضع محددة. ثم يُؤخذ أكبر (طلبٌ محبوس ÷ مواضع متاحة) على المجموعات واتحاداتها الثنائية.
 * وهذا حدٌّ أدنى صحيح رياضيًا: أي خوارزمية — مهما بلغت — لا تنزل تحته.
 *
 * الفرق بين المحقَّق وهذا الحد هو التكرار الذي سببته الخوارزمية، لا الذي فرضته الرياضيات.
 */
export interface ReuseLowerBound {
  minimumMaxUses: number;
  bindingGroupLabel: string;
  bindingDemand: number;
  bindingSupply: number;
  groupCount: number;
}

export interface DemandGroup { scope: QuranScope; demand: number; supply: number; label: string }

/** مجموعات الطلب: (عنقود نطاق × منطقة). هي وحدة القياس الحقيقية للضغط، لا العنقود وحده. */
export function buildDemandGroups(input: {
  clusters: ScopeCluster[];
  candidates: QuestionCandidate[];
  planFor: (categoryId: string) => QuestionDistributionPlan;
  questionCountFor: (cluster: ScopeCluster) => number;
}): DemandGroup[] {
  const groups = new Map<string, DemandGroup>();
  for (const cluster of input.clusters) {
    const questionCount = Math.max(1, input.questionCountFor(cluster));
    const plan = input.planFor(cluster.categoryIds[0] || '');
    const { slots } = resolveZoneSlots({ plan, effectiveScope: cluster.scope, questionCount });
    for (const slot of slots) {
      const key = scopeKey(slot.scope);
      const existing = groups.get(key);
      if (existing) existing.demand += cluster.participantCount;
      else groups.set(key, {
        scope: slot.scope,
        demand: cluster.participantCount,
        supply: uniqueLocusCount(candidatesInScope(input.candidates, slot.scope)),
        label: `${cluster.label} · ${slot.zoneNameArabic}`,
      });
    }
  }
  return [...groups.values()];
}

/**
 * مِرصد ندرة على مستوى مجموعة الطلب لا العنقود.
 *
 * موضعٌ يقع في منطقة مزدحمة لمجموعتين مختلفتين ضغطه أعلى من موضعٍ في منطقة واحدة، ولو
 * تساوى العنقودان. هذا الفرق هو ما يمنع أن يحمل الموضع المشترك عبء مجموعتين معًا.
 */
export function buildGroupScarcityOracle(groups: DemandGroup[], candidates: QuestionCandidate[]): ScarcityOracle {
  const pressure = new Map<string, number>();
  for (const group of groups) {
    if (!group.supply) continue;
    const value = group.demand / group.supply;
    for (const candidate of candidatesInScope(candidates, group.scope)) {
      const key = locusKeyOf(candidate);
      pressure.set(key, (pressure.get(key) || 0) + value);
    }
  }
  const max = Math.max(1, ...pressure.values());
  return { pressureOfLocus: (key: string) => (pressure.get(key) || 0) / max };
}

export function zoneAwareReuseLowerBound(input: {
  clusters: ScopeCluster[];
  candidates: QuestionCandidate[];
  planFor: (categoryId: string) => QuestionDistributionPlan;
  questionCountFor: (cluster: ScopeCluster) => number;
  maxGroups?: number;
}): ReuseLowerBound {
  const groups = buildDemandGroups(input);
  const rows = groups.filter(g => g.supply > 0).sort((a, b) => b.demand / b.supply - a.demand / a.supply).slice(0, input.maxGroups ?? 40);
  let best = { minimumMaxUses: 0, bindingGroupLabel: '', bindingDemand: 0, bindingSupply: 0 };
  const consider = (scope: QuranScope, supply: number, label: string) => {
    if (supply <= 0) return;
    // الطلب المحبوس: كل مجموعة مواضعُها داخل هذا النطاق لا تجد مخرجًا منه.
    let demand = 0;
    for (const row of rows) if (isScopeSubsetOf(row.scope, scope)) demand += row.demand;
    const bound = Math.ceil(demand / supply);
    if (bound > best.minimumMaxUses) best = { minimumMaxUses: bound, bindingGroupLabel: label, bindingDemand: demand, bindingSupply: supply };
  };
  for (const row of rows) consider(row.scope, row.supply, row.label);
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const union = scopeUnion(rows[i].scope, rows[j].scope);
    consider(union, uniqueLocusCount(candidatesInScope(input.candidates, union)), `${rows[i].label} ∪ ${rows[j].label}`);
  }
  return { ...best, groupCount: groups.length };
}
