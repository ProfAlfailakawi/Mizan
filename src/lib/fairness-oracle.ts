/*
 * مِرصد المثالية الرياضية — FairnessOptimalityOracle.
 *
 * هذا ليس محرّك السحب. محرّك السحب (`QuestionAllocationEngine`) يعمل **على الخط**: يرى
 * متسابقًا واحدًا في كل مرة، ولا يعرف من سيأتي بعده، ويجب أن يجيب في أجزاء من الثانية.
 * والمِرصد يعمل **خارج الخط**: يرى المسألة كاملة، ويأخذ وقته، ويجيب عن سؤالٍ واحد لا
 * يستطيع المحرّك أن يجيب عنه:
 *
 *     ما أفضل توزيع ممكن رياضيًا لهذه المسألة؟ وكم بَعُد ميزان عنه؟
 *
 * لا يُستدعى في مسار السحب الحيّ أبدًا (انظر tests/fairness-oracle.test.ts). موضعه:
 * ما قبل المسابقة، والمختبر، والمحاكاة، وما بعد المسابقة، والمقايسة، واختبار الانحدار.
 *
 * الصياغة: مسألة تدفّق بأقلّ تكلفة على شبكة طبقات —
 *
 *     المنبع ← مجموعة الطلب (متسابق × منطقة) ← [عقدة منع التكرار] ← الموضع ← المصبّ
 *
 * والقيود القاطعة في ميزان تبقى قاطعة هنا حرفًا بحرف: النطاق، والمنطقة، وسياق القراءة،
 * واعتماد المصدر، وحالة السؤال، وتاريخ المتسابق، والحجر والحجز، وسقف الاستعمال، وعدم
 * التكرار داخل النموذج وعلى المتسابق نفسه. ما لا يمرّ في المحرّك لا يمرّ هنا.
 *
 * وحدّ الصدق — وهو أهمّ ما في هذا الملف: لا يقال «مثالي» إلا إذا أثبته الحلّال.
 * فإن ضاق الوقت أو كبرت المسألة عن الميزانية المعلنة، قيل: أفضل حلّ معروف، وحدّ أدنى
 * مُثبَت، والفجوة بينهما. ولا يُخفى أن الفجوة غير مُثبَتة الإغلاق.
 */

import { COST_SCALE, FlowNetwork, toIntegerCost } from './optimization/flow';

export const FAIRNESS_ORACLE_VERSION = 'MIZAN-FAIRNESS-ORACLE-1';

/** حالة إجابة المِرصد. لا مرادفات ولا تجميل: كل حالة تعني شيئًا مختلفًا. */
export type OracleStatus =
  | 'proven_optimal'
  | 'proven_infeasible'
  | 'best_known'
  | 'instance_too_large'
  | 'not_attempted';

export interface OracleLocus {
  locusKey: string;
  /** ما يحتمله الموضع في هذه المسابقة بعد خصم استعماله السابق. صفر = مستهلك. */
  capacity: number;
  /** الصعوبة المتوقّعة كما يقولها المصدر. */
  difficulty: number;
  /*
   * نصف نطاق عدم اليقين حول الصعوبة.
   *
   * سؤالان صعوبتهما ٣٫٠ ليسا حقيقتين متساويتين إذا كانت ثقة أحدهما ٠٫٩٨ وثقة الآخر ٠٫٥٥.
   * فتُحمل هنا سعة الشك لا تُطوى: التحصين يحسب |صعوبة − هدف| + هذا النصف، أي أسوأ انحراف
   * معقول داخل الصندوق، فيكون الحلّ عادلًا حتى لو كانت التقديرات على أسوأ ما يُحتمل.
   */
  difficultyUncertainty: number;
  /** انكشاف سابق ٠..١. */
  exposure: number;
  /** ندرة ٠..١. */
  scarcity: number;
}

export interface OracleGroup {
  groupId: string;
  participantId: string;
  zoneId: string | null;
  /** القاعة — تُستعمل وحدها في قياس تباعد القاعات، ولا تدخل في الأهلية. */
  hallId?: string;
  demand: number;
  /** فهارس المواضع الصالحة داخل `loci`. */
  eligible: number[];
  /*
   * صعوبة المرشّح الذي تختاره هذه المجموعة في كل موضع، بترتيب `eligible`.
   *
   * الموضع الواحد قد يحمل أكثر من مرشّح (باختلاف طول المقطع أو الرواية)، فتُختار لكل
   * مجموعةٍ أقربُ مرشّحيها إلى هدفها — وهو ما تفعله المجموعة فعلًا لو خُيِّرت. وغياب
   * المصفوفة يعني الاكتفاء بصعوبة الموضع نفسه.
   */
  eligibleDifficulty?: number[];
  eligibleUncertainty?: number[];
  targetDifficulty: number;
}

export interface OracleInstance {
  loci: OracleLocus[];
  groups: OracleGroup[];
  totalDemand: number;
  /** سقف السياسة للموضع الواحد. `Infinity` = بلا سقف صريح. */
  policyMaxUses: number;
  /** وصف المسألة للتقرير — لا يدخل في الحساب. */
  label?: string;
}

export interface OracleObjective {
  /** كلفة كل استعمال بعد الأول للموضع نفسه. */
  repeat: number;
  /** كلفة انحراف صعوبة السؤال عن هدف المجموعة. */
  difficulty: number;
  exposure: number;
  scarcity: number;
  /** كلفة إعادة الموضع في القاعة نفسها — تباعدٌ مُنمذَج بدقّة لا تفضيلٌ مُقدَّر. */
  hallSeparation: number;
  /** يحتسب الصعوبة بأسوأ تقدير معقول بدل المتوقّع. */
  robustDifficulty?: boolean;
}

export const BALANCED_OBJECTIVE: OracleObjective = { repeat: 4, difficulty: 3, exposure: 1, scarcity: 1.5, hallSeparation: 2 };

export interface OracleBudget {
  /** أقصى عدد أقواس تُبنى قبل رفض المسألة لكِبَرها. */
  maxEdges?: number;
  /** أقصى عدد دورات لحلّال أقلّ تكلفة. */
  maxIterations?: number;
  /** أقصى زمن بالميلي ثانية لكامل الاستدعاء. */
  timeBudgetMs?: number;
}

const DEFAULT_BUDGET: Required<OracleBudget> = { maxEdges: 2_000_000, maxIterations: 400_000, timeBudgetMs: 120_000 };

export interface OracleAssignment { groupId: string; participantId: string; locusKey: string }

export interface OracleMetrics {
  assignments: number;
  distinctLociUsed: number;
  maxReuse: number;
  /** مجموع الاستعمالات بعد الأول لكل موضع — «التكرار» بالتعريف المعلن. */
  totalRepeats: number;
  /** مجموع |صعوبة السؤال − هدف مجموعته|. */
  difficultyDeviation: number;
  exposureCost: number;
  scarcityCost: number;
  /** عدد المرات التي أُعيد فيها موضعٌ في قاعةٍ سبق أن سُمع فيها. */
  sameHallReuses: number;
}

export interface FeasibilityCertificate {
  kind: 'supply_deficit' | 'distinctness_deficit';
  /** المجموعات المحبوسة. */
  groupIds: string[];
  participantIds: string[];
  demand: number;
  supply: number;
  deficit: number;
  /** القيود التي حبست هذه المجموعة. */
  bindingConstraints: string[];
  ar: string;
  en: string;
}

export interface FeasibilityResult {
  status: 'proven_feasible' | 'proven_infeasible' | 'instance_too_large';
  totalDemand: number;
  maxServed: number;
  /** أقلّ عددٍ من المواضع الإضافية يجعل التوزيع ممكنًا. مُثبَت بمبرهنة أكبر تدفّق/أدنى حاجز. */
  minimumAdditionalLoci: number;
  certificates: FeasibilityCertificate[];
  atMaxUses: number;
}

export interface MinMaxReuseResult {
  status: OracleStatus;
  /** أقلّ قيمة ممكنة لأكثر موضع استعمالًا — مُثبَتة حين تكون الحالة `proven_optimal`. */
  provenOptimum: number | null;
  /** حدّ أدنى مُثبَت دائمًا، ولو لم يُثبَت الأمثل. */
  provenLowerBound: number;
  bestKnown: number | null;
  /** الفجوة بين أفضل حلّ معروف والحدّ الأدنى المُثبَت. صفر = مثالية مُثبَتة. */
  solverGap: number | null;
  feasibility: FeasibilityResult;
  probes: number;
  elapsedMs: number;
}

export interface MinCostResultDetail {
  status: OracleStatus;
  /** التكلفة بالوزن الأصلي (لا بوحدات `COST_SCALE`). */
  cost: number | null;
  metrics: OracleMetrics | null;
  assignments: OracleAssignment[];
  objective: OracleObjective;
  atMaxUses: number;
  elapsedMs: number;
}

/* ───────────────────────── بناء المسألة ───────────────────────── */

export function instanceEdgeCount(instance: OracleInstance): number {
  let edges = instance.groups.length + instance.loci.length;
  for (const group of instance.groups) edges += group.eligible.length;
  return edges;
}

/** المواضع الصالحة فعلًا: ما له سعةٌ باقية. الموضع المستهلك ليس بديلًا. */
function usableEligible(instance: OracleInstance, group: OracleGroup, cap: number): number[] {
  return group.eligible.filter(index => Math.min(instance.loci[index].capacity, cap, instance.policyMaxUses) > 0);
}

interface BuiltNetwork {
  network: FlowNetwork;
  source: number;
  sink: number;
  groupNode: number[];
  locusNode: number[];
  /** فهارس أقواس (مجموعة ← موضع) مرتبة كما في `group.eligible`؛ سالب = قوس لم يُبنَ. */
  groupEdges: number[][];
  edgeCount: number;
}

/*
 * بناء الشبكة.
 *
 * عقدة منع التكرار (متسابق × موضع) لا تُنشأ إلا حين يحتاجها الأمر فعلًا: أي حين يقع
 * الموضع نفسه في أكثر من منطقة لمتسابق واحد (مناطق متداخلة). وفي الحالة الغالبة —
 * مناطق متباينة — يكفي أن يكون قوس (مجموعة ← موضع) وحدويًا، فلا تُدفع كلفة عقدٍ لا تلزم.
 *
 * وعقدة (موضع × قاعة) لا تُنشأ إلا حين يُطلب قياس تباعد القاعات، فتُحمَّل إعادةُ الموضع
 * في القاعة نفسها كلفةً محدّبة. وهذا يجعل «التباعد» هدفًا مُنمذَجًا بدقّة لا تقديرًا.
 */
function buildNetwork(instance: OracleInstance, options: { maxUses: number; objective?: OracleObjective; budget: Required<OracleBudget> }): BuiltNetwork | null {
  const { maxUses, objective } = options;
  const groups = instance.groups, loci = instance.loci;
  const capOf = (index: number) => Math.max(0, Math.min(loci[index].capacity, maxUses, instance.policyMaxUses));

  // المواضع المشتركة بين مجموعتين لمتسابق واحد — هي وحدها ما يحتاج عقدة منع تكرار.
  const byParticipant = new Map<string, Map<number, number[]>>();
  for (let g = 0; g < groups.length; g++) {
    const map = byParticipant.get(groups[g].participantId) || new Map<number, number[]>();
    for (const locusIndex of groups[g].eligible) {
      const list = map.get(locusIndex);
      if (list) list.push(g); else map.set(locusIndex, [g]);
    }
    byParticipant.set(groups[g].participantId, map);
  }
  const shared: { participantId: string; locusIndex: number }[] = [];
  for (const [participantId, map] of byParticipant) for (const [locusIndex, list] of map) if (list.length > 1) shared.push({ participantId, locusIndex });
  const sharedKey = (participantId: string, locusIndex: number) => `${participantId} ${locusIndex}`;
  const sharedNode = new Map<string, number>();

  const splitLocusArcs = !!objective && objective.repeat > 0;
  const hallArcs = !!objective && objective.hallSeparation > 0;

  /*
   * عقدة القاعة لا تُنشأ إلا حين يكون للموضع أكثر من مجموعةٍ واحدة في تلك القاعة: قاعةٌ
   * فيها طالبٌ واحد لهذا الموضع لا يمكن أن تسمعه مرتين، فلا معنى لعقدة تقيس ما لا يقع.
   */
  const hallPairs = new Map<string, { locusIndex: number; count: number }>();
  if (hallArcs) {
    for (let g = 0; g < groups.length; g++) {
      const hallId = groups[g].hallId;
      if (!hallId) continue;
      for (const locusIndex of groups[g].eligible) {
        const key = `${locusIndex} ${hallId}`;
        const hit = hallPairs.get(key);
        if (hit) hit.count += 1; else hallPairs.set(key, { locusIndex, count: 1 });
      }
    }
    for (const [key, pair] of [...hallPairs]) if (pair.count < 2) hallPairs.delete(key);
  }

  /*
   * التكلفة المحدّبة بقوسين لا بأقواسٍ وحدوية: الأول بسعة واحدة وبلا كلفة، والثاني بما
   * بقي من السعة وبكلفة التكرار. والدالة الناتجة هي هي — مجموع (الاستعمالات − ١) — بينما
   * عدد الأقواس يصير ثابتًا لا يتبع السقف. سقفٌ بمئةٍ لا يكلّف مئة قوس لكل موضع.
   */
  let estimate = groups.length + loci.length * (splitLocusArcs ? 2 : 1);
  for (const group of groups) estimate += group.eligible.length;
  estimate += shared.length + hallPairs.size * 2;
  if (estimate > options.budget.maxEdges) return null;

  let next = 2;
  const source = 0, sink = 1;
  const groupNode = groups.map(() => next++);
  const locusNode = loci.map(() => next++);
  for (const entry of shared) sharedNode.set(sharedKey(entry.participantId, entry.locusIndex), next++);
  const hallNode = new Map<string, number>();
  if (hallArcs) for (const key of hallPairs.keys()) hallNode.set(key, next++);

  const network = new FlowNetwork(next, estimate);
  groups.forEach((group, g) => network.addEdge(source, groupNode[g], group.demand, 0));

  /*
   * ترتيب العقد على المسار: المجموعة ← [منع التكرار] ← [القاعة] ← الموضع ← المصبّ.
   * المنع أولًا لأنه قيدٌ قاطع، والقاعة بعده لأنها كلفةٌ لا منع.
   */
  const hallEntry = (locusIndex: number, hallId?: string) => (hallArcs && hallId ? hallNode.get(`${locusIndex} ${hallId}`) : undefined);
  for (const entry of shared) {
    const node = sharedNode.get(sharedKey(entry.participantId, entry.locusIndex))!;
    // القاعة واحدة للمتسابق الواحد، فمدخل القاعة يُؤخذ من أول مجموعةٍ له تصل إلى الموضع.
    const owner = groups.find(group => group.participantId === entry.participantId && group.eligible.includes(entry.locusIndex));
    const target = hallEntry(entry.locusIndex, owner?.hallId) ?? locusNode[entry.locusIndex];
    network.addEdge(node, target, 1, 0);
  }
  if (hallArcs) {
    for (const [key, pair] of hallPairs) {
      const node = hallNode.get(key)!;
      const cap = capOf(pair.locusIndex);
      network.addEdge(node, locusNode[pair.locusIndex], Math.min(1, cap), 0);
      if (cap > 1) network.addEdge(node, locusNode[pair.locusIndex], cap - 1, toIntegerCost(objective!.hallSeparation));
    }
  }

  const groupEdges: number[][] = [];
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const edges: number[] = [];
    for (let position = 0; position < group.eligible.length; position++) {
      const locusIndex = group.eligible[position];
      const cap = capOf(locusIndex);
      if (cap <= 0) { edges.push(-1); continue; }
      const locus = loci[locusIndex];
      const difficulty = group.eligibleDifficulty?.[position] ?? locus.difficulty;
      const uncertainty = group.eligibleUncertainty?.[position] ?? locus.difficultyUncertainty;
      const deviation = Math.abs(difficulty - group.targetDifficulty) + (objective?.robustDifficulty ? uncertainty : 0);
      const cost = objective
        ? toIntegerCost(objective.difficulty * deviation + objective.exposure * locus.exposure + objective.scarcity * locus.scarcity)
        : 0;
      const target = sharedNode.get(sharedKey(group.participantId, locusIndex)) ?? hallEntry(locusIndex, group.hallId) ?? locusNode[locusIndex];
      edges.push(network.addEdge(groupNode[g], target, 1, cost));
    }
    groupEdges.push(edges);
  }

  for (let l = 0; l < loci.length; l++) {
    const cap = capOf(l);
    if (cap <= 0) continue;
    if (splitLocusArcs) {
      network.addEdge(locusNode[l], sink, 1, 0);
      if (cap > 1) network.addEdge(locusNode[l], sink, cap - 1, toIntegerCost(objective!.repeat));
    } else {
      network.addEdge(locusNode[l], sink, cap, 0);
    }
  }

  return { network, source, sink, groupNode, locusNode, groupEdges, edgeCount: estimate };
}

/* ───────────────────────── الجدوى والشهادة ───────────────────────── */

/**
 * هل يوجد أصلًا توزيعٌ يحقق هذه القيود؟
 *
 * ليست محاكاةً تُجرّب الخوارزمية الحالية: هذه مسألة تدفّق. فإن لم يبلغ التدفّق الطلبَ
 * كاملًا فالتوزيع مستحيل — لا «تعذّر على المحرّك»، بل مستحيل على كل محرّك.
 *
 * وشرطُ «مجموع الأسئلة ≤ حجم البنك» لا يكفي ولا يقترب: بنكٌ ضخم قد يكون عاجزًا لأن
 * التداخل بين النطاقات يحبس الطلب في زوايا ضيّقة. الفحص هنا يمشي على بيان الأهلية الحقيقي.
 */
export function proveFeasibility(instance: OracleInstance, options?: { maxUses?: number; budget?: OracleBudget }): FeasibilityResult {
  const budget = { ...DEFAULT_BUDGET, ...(options?.budget || {}) };
  const maxUses = options?.maxUses ?? instance.policyMaxUses;
  const built = buildNetwork(instance, { maxUses, budget });
  if (!built) return { status: 'instance_too_large', totalDemand: instance.totalDemand, maxServed: 0, minimumAdditionalLoci: 0, certificates: [], atMaxUses: maxUses };

  const served = built.network.maxFlow(built.source, built.sink);
  if (served >= instance.totalDemand) {
    return { status: 'proven_feasible', totalDemand: instance.totalDemand, maxServed: served, minimumAdditionalLoci: 0, certificates: [], atMaxUses: maxUses };
  }
  return {
    status: 'proven_infeasible',
    totalDemand: instance.totalDemand,
    maxServed: served,
    /* أدنى حاجز = أكبر تدفّق: أي وحدة سعةٍ إضافية ترفع التدفّق بواحدٍ على الأكثر، فالعجز
       هو بعينه أقلّ عددٍ من المواضع الإضافية المطلوبة. مُثبَت لا مقدَّر. */
    minimumAdditionalLoci: instance.totalDemand - served,
    certificates: buildCertificates(instance, maxUses, budget),
    atMaxUses: maxUses,
  };
}

/*
 * شهادة الاستحالة.
 *
 * «مستحيل» وحدها كلمةٌ لا يُبنى عليها قرار. المطلوب: أي مجموعةٍ من الطلب حُبست؟ وكم
 * تطلب؟ وكم يملك ما تصل إليه من مواضع؟ وكم العجز؟ وما القيد الذي حبسها؟
 *
 * شاهدان مختلفان:
 *
 *   ١) عجز التمايز — مجموعةٌ تحتاج n موضعًا متمايزًا ولا يبلغ ما تصل إليه n. لا يلزمها
 *      حلّال: تُرى بالعدّ، وهي قاطعة.
 *
 *   ٢) عجز العرض — شاهد هول/أدنى حاجز على شبكةٍ مُرخّاة يُرفع فيها قيد التمايز. والإرخاء
 *      مقصود: أكبر تدفّق في المُرخّاة ≥ أكبر تدفّق في الأصل، فالعجز الذي تُظهره حدٌّ أدنى
 *      مُثبَت للعجز الحقيقي. فحين يقال «تحتاج هذه المجموعة ٤٣ موضعًا على الأقل» فهي «على
 *      الأقل» بالمعنى الرياضي لا بالتحفّظ اللفظي. وفائدة الإرخاء أن جوار المجموعة يصير
 *      محصورًا في جانب الحاجز، فيصحّ أن يقال: هذه المجموعة لا تصل إلى غير هذه المواضع.
 */
function buildCertificates(instance: OracleInstance, maxUses: number, budget: Required<OracleBudget>): FeasibilityCertificate[] {
  const out: FeasibilityCertificate[] = [];
  const capOf = (index: number) => Math.max(0, Math.min(instance.loci[index].capacity, maxUses, instance.policyMaxUses));

  for (const group of instance.groups) {
    const usable = usableEligible(instance, group, maxUses).length;
    if (group.demand > usable) {
      out.push({
        kind: 'distinctness_deficit',
        groupIds: [group.groupId],
        participantIds: [group.participantId],
        demand: group.demand,
        supply: usable,
        deficit: group.demand - usable,
        bindingConstraints: ['no_repeat_in_model', 'participant_scope', 'zone', 'reading_context', 'approval_status', 'max_uses'],
        ar: `المجموعة «${group.groupId}» تطلب ${group.demand} موضعًا متمايزًا ولا تصل إلا إلى ${usable} موضعًا صالحًا.`,
        en: `Group "${group.groupId}" needs ${group.demand} distinct loci but can reach only ${usable} eligible loci.`,
      });
    }
  }

  // الشبكة المُرخّاة: قوس (مجموعة ← موضع) بسعة الطلب لا بواحد، فلا يعبر الحاجزَ قوسُ أهلية.
  const groupCount = instance.groups.length, locusCount = instance.loci.length;
  let estimate = groupCount + locusCount;
  for (const group of instance.groups) estimate += group.eligible.length;
  if (estimate > budget.maxEdges) return out;

  const source = 0, sink = 1;
  const groupNode = instance.groups.map((_, i) => 2 + i);
  const locusNode = instance.loci.map((_, i) => 2 + groupCount + i);
  const relaxed = new FlowNetwork(2 + groupCount + locusCount, estimate);
  instance.groups.forEach((group, g) => relaxed.addEdge(source, groupNode[g], group.demand, 0));
  instance.groups.forEach((group, g) => { for (const locusIndex of group.eligible) if (capOf(locusIndex) > 0) relaxed.addEdge(groupNode[g], locusNode[locusIndex], group.demand, 0); });
  instance.loci.forEach((_, l) => { const cap = capOf(l); if (cap > 0) relaxed.addEdge(locusNode[l], sink, cap, 0); });

  const served = relaxed.maxFlow(source, sink);
  if (served >= instance.totalDemand) return out;

  const reachable = relaxed.minCutSourceSide(source);
  const witnessGroups = instance.groups.filter((_, g) => reachable[groupNode[g]]);
  const witnessLoci = instance.loci.map((_, l) => l).filter(l => reachable[locusNode[l]]);
  const demand = witnessGroups.reduce((sum, group) => sum + group.demand, 0);
  const supply = witnessLoci.reduce((sum, l) => sum + capOf(l), 0);
  if (witnessGroups.length && demand > supply) {
    const participantIds = [...new Set(witnessGroups.map(g => g.participantId))];
    out.push({
      kind: 'supply_deficit',
      groupIds: witnessGroups.map(g => g.groupId),
      participantIds,
      demand,
      supply,
      deficit: demand - supply,
      bindingConstraints: ['participant_scope', 'zone', 'reading_context', 'approval_status', 'quarantine', 'max_uses'],
      ar: `هذه المجموعة من ${participantIds.length} متسابقًا تحتاج ${demand} تخصيصًا، ولا تملك مجتمعةً إلا ${supply} موضعًا صالحًا. العجز ${demand - supply} على الأقل.`,
      en: `This set of ${participantIds.length} participants needs ${demand} allocations but reaches only ${supply} eligible loci in total — a deficit of at least ${demand - supply}.`,
    });
  }
  return out;
}

/* ───────────────────────── أقلّ أكثرِ استعمال ───────────────────────── */

/**
 * أقلّ قيمة ممكنة لأكثر موضع استعمالًا — بحثٌ بارامتري على السقف.
 *
 * الخاصية التي يقوم عليها البرهان: التوزيع بسقف U موجودٌ إذا وفقط إذا أشبعت شبكةُ السقف U
 * الطلبَ كاملًا. والإشباع رتيب في U، فالبحث الثنائي يجد أصغر U ممكن — وهو الأمثل
 * المُثبَت، لا أفضل ما وُجد.
 */
export function proveMinimumMaxReuse(instance: OracleInstance, options?: { budget?: OracleBudget }): MinMaxReuseResult {
  const budget = { ...DEFAULT_BUDGET, ...(options?.budget || {}) };
  const startedAt = Date.now();
  const ceiling = Number.isFinite(instance.policyMaxUses) ? instance.policyMaxUses : Math.max(1, instance.totalDemand);
  const feasibility = proveFeasibility(instance, { maxUses: ceiling, budget });
  const lowerBound = analyticLowerBound(instance);

  if (feasibility.status === 'instance_too_large') {
    return { status: 'instance_too_large', provenOptimum: null, provenLowerBound: lowerBound, bestKnown: null, solverGap: null, feasibility, probes: 0, elapsedMs: Date.now() - startedAt };
  }
  if (feasibility.status === 'proven_infeasible') {
    return { status: 'proven_infeasible', provenOptimum: null, provenLowerBound: lowerBound, bestKnown: null, solverGap: null, feasibility, probes: 1, elapsedMs: Date.now() - startedAt };
  }

  let low = Math.max(1, lowerBound), high = ceiling, probes = 1;
  let bestKnown = ceiling;
  while (low < high) {
    if (Date.now() - startedAt > budget.timeBudgetMs) {
      return { status: 'best_known', provenOptimum: null, provenLowerBound: low, bestKnown, solverGap: bestKnown - low, feasibility, probes, elapsedMs: Date.now() - startedAt };
    }
    const mid = Math.floor((low + high) / 2);
    probes++;
    const built = buildNetwork(instance, { maxUses: mid, budget });
    if (!built) return { status: 'instance_too_large', provenOptimum: null, provenLowerBound: low, bestKnown, solverGap: bestKnown - low, feasibility, probes, elapsedMs: Date.now() - startedAt };
    const served = built.network.maxFlow(built.source, built.sink, instance.totalDemand);
    if (served >= instance.totalDemand) { high = mid; bestKnown = Math.min(bestKnown, mid); } else low = mid + 1;
  }
  return { status: 'proven_optimal', provenOptimum: low, provenLowerBound: low, bestKnown: low, solverGap: 0, feasibility, probes, elapsedMs: Date.now() - startedAt };
}

/*
 * حدّ أدنى تحليلي يُحسب بلا حلّال — يُستعمل بدايةً للبحث الثنائي، ويصلح وحده حين تكبر
 * المسألة عن الميزانية.
 *
 * لكل طائفةٍ من المجموعات تتطابق في المواضع التي تصل إليها: ⌈طلبٌ محبوس ÷ سعةٍ متاحة⌉.
 * وهو صحيح قطعًا: أيّ توزيعٍ مهما بلغ لا ينزل تحته — لأن الطلب المحبوس لا يجد مخرجًا.
 */
export function analyticLowerBound(instance: OracleInstance): number {
  if (!instance.totalDemand) return 0;
  let best = 1;
  // (أ) الحدّ العام: كل الطلب على كل المواضع.
  const totalLoci = instance.loci.filter(l => l.capacity > 0).length;
  if (totalLoci > 0) best = Math.max(best, Math.ceil(instance.totalDemand / totalLoci));
  // (ب) الحدّ لكل طائفة أهلية متطابقة: الطلب المحبوس داخل مواضعها وحدها.
  const byEligibility = new Map<string, { demand: number; loci: number[] }>();
  for (const group of instance.groups) {
    const key = group.eligible.join(',');
    const hit = byEligibility.get(key);
    if (hit) hit.demand += group.demand;
    else byEligibility.set(key, { demand: group.demand, loci: group.eligible });
  }
  for (const entry of byEligibility.values()) {
    let capacity = 0;
    for (const index of entry.loci) if (instance.loci[index].capacity > 0) capacity++;
    if (capacity > 0) best = Math.max(best, Math.ceil(entry.demand / capacity));
  }
  return best;
}

/*
 * حدٌّ أدنى قويّ بإرخاء التدفّق.
 *
 * في ميزان اليوم حدٌّ أدنى سريع (`zoneAwareReuseLowerBound`) يُحسب بالقسمة على مجموعات
 * الطلب واتحاداتها الثنائية. وهو صحيح ويبقى — سرعته هي فائدته، ويصلح للعرض الفوري.
 *
 * وهذا حدٌّ ثانٍ أقوى: يُبنى على إرخاءٍ يُسقط قيد التمايز داخل المجموعة ويُبقي كل ما عداه
 * (النطاق، والمنطقة، والسعة، والحجر). والإرخاء يوسّع فضاء الحلول، فما استحال فيه استحال
 * في الأصل قطعًا — فأصغرُ سقفٍ يُشبع الشبكة المُرخّاة حدٌّ أدنى مُثبَت للأصل.
 *
 * وهو أقوى من التحليلي لأنه يرى تداخل النطاقات كله لا اتحاداتٍ مختارة، وأرخص من الحلّ
 * الدقيق لأن شبكته أصغر بكثير: قوسٌ واحد لكل (مجموعة، موضع) بلا عقد منع تكرار.
 *
 * ويبقى الأمر الذي لا يُكسر: حدٌّ أدنى يعلو على الأمثل الحقيقي ليس حدًّا أدنى بل خطأ
 * (انظر tests/fairness-oracle.test.ts).
 */
export function strongReuseLowerBound(instance: OracleInstance, options?: { budget?: OracleBudget }): { bound: number; proven: boolean; probes: number; infeasible: boolean } {
  const budget = { ...DEFAULT_BUDGET, ...(options?.budget || {}) };
  const analytic = analyticLowerBound(instance);
  if (!instance.totalDemand) return { bound: 0, proven: true, probes: 0, infeasible: false };
  const ceiling = Number.isFinite(instance.policyMaxUses) ? instance.policyMaxUses : Math.max(1, instance.totalDemand);

  const groupCount = instance.groups.length, locusCount = instance.loci.length;
  let estimate = groupCount + locusCount;
  for (const group of instance.groups) estimate += group.eligible.length;
  if (estimate > budget.maxEdges) return { bound: analytic, proven: false, probes: 0, infeasible: false };

  const source = 0, sink = 1;
  const feasibleAt = (maxUses: number) => {
    const network = new FlowNetwork(2 + groupCount + locusCount, estimate);
    instance.groups.forEach((group, g) => network.addEdge(source, 2 + g, group.demand, 0));
    instance.groups.forEach((group, g) => {
      for (const locusIndex of group.eligible) {
        const cap = Math.max(0, Math.min(instance.loci[locusIndex].capacity, maxUses, instance.policyMaxUses));
        if (cap > 0) network.addEdge(2 + g, 2 + groupCount + locusIndex, Math.min(group.demand, cap), 0);
      }
    });
    instance.loci.forEach((locus, l) => {
      const cap = Math.max(0, Math.min(locus.capacity, maxUses, instance.policyMaxUses));
      if (cap > 0) network.addEdge(2 + groupCount + l, sink, cap, 0);
    });
    return network.maxFlow(source, sink, instance.totalDemand) >= instance.totalDemand;
  };

  let low = Math.max(1, analytic), high = ceiling, probes = 0;
  /*
   * مستحيلٌ حتى عند السقف الأعلى: لا معنى لحدٍّ أدنى هنا، فلا يوجد حلٌّ يُحدّ. ويُقال ذلك
   * صراحةً بدل أن يُعاد السقفُ رقمًا يُظنّ حدًّا أدنى وهو ليس كذلك.
   */
  if (!feasibleAt(high)) return { bound: high, proven: true, probes: 1, infeasible: true };
  probes = 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    probes++;
    if (feasibleAt(mid)) high = mid; else low = mid + 1;
  }
  return { bound: low, proven: true, probes, infeasible: false };
}

/* ───────────────────────── أقلّ تكلفة ───────────────────────── */

/**
 * أقلّ تكلفة لهدفٍ معلن، عند سقف استعمالٍ معطى.
 *
 * التكلفة محدّبة على الموضع: أوّل استعمال بلا كلفة، وما بعده يحمل كلفة التكرار. وهذه
 * الحيلة تجعل «أقلّ تكرار» هدفًا خطيًا يثبته حلّال التدفّق، لا تقديرًا.
 */
export function minimizeCost(instance: OracleInstance, options: { maxUses: number; objective: OracleObjective; budget?: OracleBudget }): MinCostResultDetail {
  const budget = { ...DEFAULT_BUDGET, ...(options.budget || {}) };
  const startedAt = Date.now();
  const built = buildNetwork(instance, { maxUses: options.maxUses, objective: options.objective, budget });
  if (!built) return { status: 'instance_too_large', cost: null, metrics: null, assignments: [], objective: options.objective, atMaxUses: options.maxUses, elapsedMs: Date.now() - startedAt };

  const result = built.network.minCostMaxFlow(built.source, built.sink, { maxIterations: budget.maxIterations, flowLimit: instance.totalDemand });
  if (result.flow < instance.totalDemand) {
    return { status: 'proven_infeasible', cost: null, metrics: null, assignments: [], objective: options.objective, atMaxUses: options.maxUses, elapsedMs: Date.now() - startedAt };
  }

  const assignments: OracleAssignment[] = [];
  for (let g = 0; g < instance.groups.length; g++) {
    const group = instance.groups[g];
    group.eligible.forEach((locusIndex, position) => {
      const edge = built.groupEdges[g][position];
      if (edge < 0) return;
      if (built.network.flowOf(edge) > 0) assignments.push({ groupId: group.groupId, participantId: group.participantId, locusKey: instance.loci[locusIndex].locusKey });
    });
  }
  return {
    status: result.proven ? 'proven_optimal' : 'best_known',
    cost: result.cost / COST_SCALE,
    metrics: measureAssignments(instance, assignments),
    assignments,
    objective: options.objective,
    atMaxUses: options.maxUses,
    elapsedMs: Date.now() - startedAt,
  };
}

/** قياس توزيعٍ ما بالمقاييس المعلنة — يُستعمل للمِرصد ولمخرجات المحرّك على السواء. */
export function measureAssignments(instance: OracleInstance, assignments: OracleAssignment[]): OracleMetrics {
  const locusByKey = new Map(instance.loci.map((locus, index) => [locus.locusKey, index]));
  const groupById = new Map(instance.groups.map(group => [group.groupId, group]));
  /* موضع المرشّح داخل `eligible` يُفهرس مرة لكل مجموعة، لا يُبحث عنه لكل تخصيص. */
  const positionByGroup = new Map<string, Map<number, number>>();
  for (const group of instance.groups) {
    if (!group.eligibleDifficulty) continue;
    const map = new Map<number, number>();
    group.eligible.forEach((locusIndex, position) => map.set(locusIndex, position));
    positionByGroup.set(group.groupId, map);
  }
  const uses = new Map<string, number>();
  const hallUses = new Map<string, number>();
  let difficultyDeviation = 0, exposureCost = 0, scarcityCost = 0, sameHallReuses = 0;
  for (const item of assignments) {
    const index = locusByKey.get(item.locusKey);
    const count = (uses.get(item.locusKey) || 0) + 1;
    uses.set(item.locusKey, count);
    const group = groupById.get(item.groupId);
    if (index !== undefined) {
      const locus = instance.loci[index];
      if (group) {
        const position = positionByGroup.get(group.groupId)?.get(index) ?? -1;
        const difficulty = (position >= 0 ? group.eligibleDifficulty?.[position] : undefined) ?? locus.difficulty;
        difficultyDeviation += Math.abs(difficulty - group.targetDifficulty);
      }
      exposureCost += locus.exposure;
      scarcityCost += locus.scarcity;
    }
    if (group?.hallId) {
      const key = `${item.locusKey} ${group.hallId}`;
      const hallCount = (hallUses.get(key) || 0) + 1;
      hallUses.set(key, hallCount);
      if (hallCount > 1) sameHallReuses++;
    }
  }
  const counts = [...uses.values()];
  return {
    assignments: assignments.length,
    distinctLociUsed: uses.size,
    maxReuse: counts.length ? Math.max(...counts) : 0,
    totalRepeats: counts.reduce((sum, n) => sum + Math.max(0, n - 1), 0),
    difficultyDeviation: Number(difficultyDeviation.toFixed(4)),
    exposureCost: Number(exposureCost.toFixed(4)),
    scarcityCost: Number(scarcityCost.toFixed(4)),
    sameHallReuses,
  };
}
