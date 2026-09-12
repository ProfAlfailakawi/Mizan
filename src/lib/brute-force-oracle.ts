/*
 * مِرصد الحقيقة بالقوة الغاشمة.
 *
 * ليس للإنتاج ولا للمختبر الكبير. وظيفته واحدة: **اختبار المِرصد الرياضي نفسه.**
 *
 * الخطر الذي يدفعه هذا الملف واقعيّ: أن نبني حلّالًا فيه خطأ، ثم نصدّق مخرجاته لأنه
 * «حلّال»، فنعلن مثاليةً ليست مثالية، ونقيس فجوةً على مرجعٍ خاطئ. فالحلّال يجب أن يُحاكَم
 * بمرجعٍ لا يُجادَل: العدّ الشامل على مسائل صغيرة.
 *
 * يُعدّ هذا الملف كلَّ توزيعٍ صحيح ممكن (٢–٨ متسابقين، بضعة مواضع، نطاقات ومناطق وقيود
 * تكرار مختلفة)، ويستخرج الأمثل الحقيقي بالتعريف — لا بالخوارزمية — ثم يُقارن به.
 *
 * وله سقفٌ صريح: إن تجاوز فضاء البحث الميزانية رُفضت المسألة ولم تُقرَّب. مرجعٌ يقرّب ليس
 * مرجعًا.
 */

import type { OracleInstance, OracleMetrics, OracleObjective } from './fairness-oracle';
import { measureAssignments } from './fairness-oracle';

export interface BruteForceResult {
  status: 'exhausted' | 'proven_infeasible' | 'search_space_too_large';
  /** عدد التوزيعات الصحيحة التي عُدَّت. */
  solutionsEnumerated: number;
  /** أقلّ «أكثرِ استعمال» على كل التوزيعات الصحيحة — الحقيقة بالتعريف. */
  minimumMaxReuse: number | null;
  /** أقلّ عدد تكرارات ممكن. */
  minimumTotalRepeats: number | null;
  /** أقلّ تكلفةٍ للهدف المعلن، وقياسات التوزيع الذي بلغها. */
  minimumCost: number | null;
  bestMetrics: OracleMetrics | null;
  elapsedMs: number;
}

export interface BruteForceOptions {
  objective?: OracleObjective;
  /** أقصى عدد عقد بحثٍ تُزار قبل رفض المسألة. */
  maxNodes?: number;
}

const DEFAULT_MAX_NODES = 5_000_000;

/** كل مجموعات الحجم k من مصفوفة — بالترتيب، فالنتيجة حتمية. */
function combinations(items: number[], k: number): number[][] {
  if (k === 0) return [[]];
  if (k > items.length) return [];
  const out: number[][] = [];
  const current: number[] = [];
  const walk = (start: number) => {
    if (current.length === k) { out.push([...current]); return; }
    for (let i = start; i <= items.length - (k - current.length); i++) {
      current.push(items[i]);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return out;
}

/**
 * العدّ الشامل.
 *
 * القيود المحفوظة أثناء العدّ هي عين القيود القاطعة: التمايز داخل المجموعة (باختيار
 * مجموعةٍ من المواضع لا قائمة)، والتمايز على المتسابق عبر مجموعاته، وسعة كل موضع.
 */
export function bruteForceOptimum(instance: OracleInstance, options?: BruteForceOptions): BruteForceResult {
  const startedAt = Date.now();
  const maxNodes = options?.maxNodes ?? DEFAULT_MAX_NODES;
  const objective = options?.objective;

  const choicesPerGroup: number[][][] = [];
  let estimate = 1;
  for (const group of instance.groups) {
    const usable = group.eligible.filter(index => Math.min(instance.loci[index].capacity, instance.policyMaxUses) > 0);
    const choices = combinations(usable, group.demand);
    if (!choices.length) return { status: 'proven_infeasible', solutionsEnumerated: 0, minimumMaxReuse: null, minimumTotalRepeats: null, minimumCost: null, bestMetrics: null, elapsedMs: Date.now() - startedAt };
    choicesPerGroup.push(choices);
    estimate *= choices.length;
    if (estimate > maxNodes) return { status: 'search_space_too_large', solutionsEnumerated: 0, minimumMaxReuse: null, minimumTotalRepeats: null, minimumCost: null, bestMetrics: null, elapsedMs: Date.now() - startedAt };
  }

  const uses = new Map<number, number>();
  const participantUsed = new Map<string, Set<number>>();
  const chosen: number[][] = [];
  let solutions = 0, nodes = 0;
  let minMaxReuse: number | null = null;
  let minRepeats: number | null = null;
  let minCost: number | null = null;
  let bestMetrics: OracleMetrics | null = null;
  let aborted = false;

  const costOf = (): { cost: number; metrics: OracleMetrics } => {
    const assignments = instance.groups.flatMap((group, g) => chosen[g].map(index => ({ groupId: group.groupId, participantId: group.participantId, locusKey: instance.loci[index].locusKey })));
    const metrics = measureAssignments(instance, assignments);
    if (!objective) return { cost: 0, metrics };
    let cost = objective.repeat * metrics.totalRepeats
      + objective.exposure * metrics.exposureCost
      + objective.scarcity * metrics.scarcityCost
      + objective.hallSeparation * metrics.sameHallReuses;
    // انحراف الصعوبة يُحسب من التخصيص نفسه، محصَّنًا أو متوقَّعًا بحسب الهدف.
    for (let g = 0; g < instance.groups.length; g++) {
      const group = instance.groups[g];
      for (const index of chosen[g]) {
        const position = group.eligible.indexOf(index);
        const difficulty = group.eligibleDifficulty?.[position] ?? instance.loci[index].difficulty;
        const uncertainty = group.eligibleUncertainty?.[position] ?? instance.loci[index].difficultyUncertainty;
        cost += objective.difficulty * (Math.abs(difficulty - group.targetDifficulty) + (objective.robustDifficulty ? uncertainty : 0));
      }
    }
    return { cost: Number(cost.toFixed(6)), metrics };
  };

  const walk = (g: number) => {
    if (aborted) return;
    if (++nodes > maxNodes) { aborted = true; return; }
    if (g === instance.groups.length) {
      solutions++;
      const counts = [...uses.values()];
      const maxReuse = counts.length ? Math.max(...counts) : 0;
      const repeats = counts.reduce((sum, n) => sum + Math.max(0, n - 1), 0);
      if (minMaxReuse === null || maxReuse < minMaxReuse) minMaxReuse = maxReuse;
      if (minRepeats === null || repeats < minRepeats) minRepeats = repeats;
      if (objective) {
        const scored = costOf();
        if (minCost === null || scored.cost < minCost) { minCost = scored.cost; bestMetrics = scored.metrics; }
      } else if (!bestMetrics || maxReuse === minMaxReuse) {
        bestMetrics = costOf().metrics;
      }
      return;
    }
    const group = instance.groups[g];
    const used = participantUsed.get(group.participantId) || new Set<number>();
    participantUsed.set(group.participantId, used);
    for (const choice of choicesPerGroup[g]) {
      if (choice.some(index => used.has(index))) continue;
      // يُطبَّق الاستعمال موضعًا موضعًا، ويُسترجع بعدد ما طُبِّق وحده لا بعدد الاختيار كلّه.
      let applied = 0;
      for (const index of choice) {
        const count = (uses.get(index) || 0) + 1;
        if (count > Math.min(instance.loci[index].capacity, instance.policyMaxUses)) break;
        uses.set(index, count);
        applied++;
      }
      if (applied < choice.length) {
        for (let i = 0; i < applied; i++) { const index = choice[i]; const count = uses.get(index)!; if (count <= 1) uses.delete(index); else uses.set(index, count - 1); }
        continue;
      }
      for (const index of choice) used.add(index);
      chosen[g] = choice;
      walk(g + 1);
      for (const index of choice) used.delete(index);
      for (const index of choice) { const count = uses.get(index)!; if (count <= 1) uses.delete(index); else uses.set(index, count - 1); }
      if (aborted) return;
    }
  };

  walk(0);
  if (aborted) return { status: 'search_space_too_large', solutionsEnumerated: solutions, minimumMaxReuse: null, minimumTotalRepeats: null, minimumCost: null, bestMetrics: null, elapsedMs: Date.now() - startedAt };
  if (!solutions) return { status: 'proven_infeasible', solutionsEnumerated: 0, minimumMaxReuse: null, minimumTotalRepeats: null, minimumCost: null, bestMetrics: null, elapsedMs: Date.now() - startedAt };
  return {
    status: 'exhausted',
    solutionsEnumerated: solutions,
    minimumMaxReuse: minMaxReuse,
    minimumTotalRepeats: minRepeats,
    minimumCost: objective ? minCost : null,
    bestMetrics,
    elapsedMs: Date.now() - startedAt,
  };
}
