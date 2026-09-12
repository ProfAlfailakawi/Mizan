import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALANCED_OBJECTIVE, analyticLowerBound, measureAssignments, minimizeCost, proveFeasibility,
  proveMinimumMaxReuse, type OracleInstance, type OracleObjective,
} from '../src/lib/fairness-oracle';
import { bruteForceOptimum } from '../src/lib/brute-force-oracle';
import { FlowNetwork } from '../src/lib/optimization/flow';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/*
 * محاكمة المِرصد.
 *
 * حلّالٌ يُصدَّق لأنه حلّال هو أخطر ما في هذا الباب كله: يعلن مثاليةً ليست مثالية، فتُقاس
 * الفجوة على مرجعٍ خاطئ، فيُظنّ المحرّك بالغًا حدَّه وهو دونه. فلا يُقبل قول المِرصد هنا
 * إلا مقابلًا بالعدّ الشامل على مسائل صغيرة — والعدّ الشامل لا يُجادَل.
 */

/* مولّد حتمي: كل حالةٍ يكشفها هذا الملف قابلة لإعادة الإنتاج ببذرتها. */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
}

function randomInstance(seed: number): OracleInstance {
  const next = rng(seed);
  const locusCount = 3 + Math.floor(next() * 6);
  const participantCount = 2 + Math.floor(next() * 4);
  const policyMaxUses = 1 + Math.floor(next() * 3);
  const loci = Array.from({ length: locusCount }, (_, i) => ({
    locusKey: `L${i}`,
    capacity: policyMaxUses,
    difficulty: Number((1 + next() * 4).toFixed(2)),
    difficultyUncertainty: Number((next() * 0.5).toFixed(2)),
    exposure: Number(next().toFixed(2)),
    scarcity: Number(next().toFixed(2)),
  }));
  const groups = [];
  let totalDemand = 0;
  for (let p = 0; p < participantCount; p++) {
    const zoneCount = 1 + Math.floor(next() * 2);
    const hallId = `hall-${1 + Math.floor(next() * 2)}`;
    for (let z = 0; z < zoneCount; z++) {
      const eligible = loci.map((_, i) => i).filter(() => next() > 0.25);
      if (!eligible.length) continue;
      const demand = 1 + Math.floor(next() * Math.min(2, eligible.length));
      groups.push({
        groupId: `p${p}#z${z}`,
        participantId: `p${p}`,
        zoneId: `z${z}`,
        hallId,
        demand,
        eligible,
        targetDifficulty: Number((1 + next() * 4).toFixed(2)),
      });
      totalDemand += demand;
    }
  }
  return { loci, groups, totalDemand, policyMaxUses, label: `random-${seed}` };
}

test('شبكة التدفّق: أكبر تدفّق وأدنى حاجز متساويان على شبكة يدوية معروفة', () => {
  // المنبع ٠، المصبّ ٥. الحاجز الأدنى في هذه الشبكة معروف بالحساب اليدوي: ٥.
  const network = new FlowNetwork(6, 12);
  network.addEdge(0, 1, 3);
  network.addEdge(0, 2, 2);
  network.addEdge(1, 3, 2);
  network.addEdge(1, 4, 1);
  network.addEdge(2, 4, 3);
  network.addEdge(3, 5, 2);
  network.addEdge(4, 5, 3);
  assert.equal(network.maxFlow(0, 5), 5);
  const side = network.minCutSourceSide(0);
  assert.equal(side[0], 1, 'المنبع دائمًا في جانبه');
  assert.equal(side[5], 0, 'المصبّ لا يُبلَغ بعد التشبّع');
});

test('أقلّ تكلفة: الحلّال يختار المسار الأرخص لا الأقصر', () => {
  const network = new FlowNetwork(4, 8);
  network.addEdge(0, 1, 2, 1);
  network.addEdge(0, 2, 2, 5);
  network.addEdge(1, 3, 1, 1);
  network.addEdge(2, 3, 2, 1);
  const result = network.minCostMaxFlow(0, 3);
  assert.equal(result.flow, 3);
  /* الشبكة تحسب بتكاليف صحيحة كما تُسلَّم، بلا مضاعف — المضاعف شأن المِرصد وحده.
     وحدة عبر (١): ١+١=٢. ووحدتان عبر (٢): ٥+١=٦ لكلٍّ. المجموع ١٤. */
  assert.equal(result.cost, 2 + 6 + 6);
  assert.equal(result.proven, true);
});

test('المِرصد يطابق العدّ الشامل في أقلّ «أكثرِ استعمال» على مئة مسألة عشوائية', () => {
  let compared = 0, infeasible = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const instance = randomInstance(seed);
    if (!instance.groups.length) continue;
    const brute = bruteForceOptimum(instance, { maxNodes: 400_000 });
    if (brute.status === 'search_space_too_large') continue;
    const oracle = proveMinimumMaxReuse(instance);
    if (brute.status === 'proven_infeasible') {
      assert.equal(oracle.status, 'proven_infeasible', `البذرة ${seed}: العدّ الشامل يقول مستحيل والمِرصد يقول ${oracle.status}`);
      infeasible++;
      continue;
    }
    assert.equal(oracle.status, 'proven_optimal', `البذرة ${seed}: المسألة ممكنة والمِرصد لم يثبت الأمثل`);
    assert.equal(oracle.provenOptimum, brute.minimumMaxReuse, `البذرة ${seed}: الأمثل المُثبَت خالف الحقيقة`);
    compared++;
  }
  assert.ok(compared >= 40, `عدد المسائل الممكنة المقارَنة قليل جدًا (${compared})`);
  assert.ok(infeasible >= 1, 'لم تُختبر حالة استحالة واحدة');
});

test('الحدّ الأدنى التحليلي لا يعلو قط على الأمثل الحقيقي', () => {
  let checked = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const instance = randomInstance(seed);
    if (!instance.groups.length) continue;
    const brute = bruteForceOptimum(instance, { maxNodes: 400_000 });
    if (brute.status !== 'exhausted' || brute.minimumMaxReuse === null) continue;
    const bound = analyticLowerBound(instance);
    assert.ok(bound <= brute.minimumMaxReuse, `البذرة ${seed}: الحدّ الأدنى ${bound} فوق الأمثل ${brute.minimumMaxReuse} — قاعدةٌ لا تُكسر`);
    checked++;
  }
  assert.ok(checked >= 40, `عدد الحالات المفحوصة قليل (${checked})`);
});

test('أقلّ تكرار: تدفّق التكلفة المحدّبة يطابق العدّ الشامل', () => {
  const objective: OracleObjective = { repeat: 1, difficulty: 0, exposure: 0, scarcity: 0, hallSeparation: 0 };
  let compared = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const instance = randomInstance(seed);
    if (!instance.groups.length) continue;
    const brute = bruteForceOptimum(instance, { maxNodes: 400_000, objective });
    if (brute.status !== 'exhausted') continue;
    const solved = minimizeCost(instance, { maxUses: instance.policyMaxUses, objective });
    assert.equal(solved.status, 'proven_optimal', `البذرة ${seed}`);
    assert.equal(solved.metrics!.totalRepeats, brute.minimumTotalRepeats, `البذرة ${seed}: أقلّ تكرار`);
    compared++;
  }
  assert.ok(compared >= 30, `عدد المسائل المقارَنة قليل (${compared})`);
});

test('الهدف المركّب: تكلفة الحلّال تساوي أقلّ تكلفةٍ في العدّ الشامل', () => {
  let compared = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const instance = randomInstance(seed);
    if (!instance.groups.length) continue;
    const brute = bruteForceOptimum(instance, { maxNodes: 300_000, objective: BALANCED_OBJECTIVE });
    if (brute.status !== 'exhausted' || brute.minimumCost === null) continue;
    const solved = minimizeCost(instance, { maxUses: instance.policyMaxUses, objective: BALANCED_OBJECTIVE });
    assert.equal(solved.status, 'proven_optimal', `البذرة ${seed}`);
    assert.ok(Math.abs(solved.cost! - brute.minimumCost) < 0.02, `البذرة ${seed}: تكلفة الحلّال ${solved.cost} مقابل الحقيقة ${brute.minimumCost}`);
    compared++;
  }
  assert.ok(compared >= 25, `عدد المسائل المقارَنة قليل (${compared})`);
});

test('التخصيص الخارج من الحلّال يحترم القيود القاطعة: تمايزٌ على المتسابق وسقفُ استعمال', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const instance = randomInstance(seed);
    if (!instance.groups.length) continue;
    const solved = minimizeCost(instance, { maxUses: instance.policyMaxUses, objective: BALANCED_OBJECTIVE });
    if (solved.status !== 'proven_optimal') continue;
    const byParticipant = new Map<string, string[]>();
    const byGroup = new Map<string, number>();
    for (const item of solved.assignments) {
      byParticipant.set(item.participantId, [...(byParticipant.get(item.participantId) || []), item.locusKey]);
      byGroup.set(item.groupId, (byGroup.get(item.groupId) || 0) + 1);
    }
    for (const [participantId, keys] of byParticipant) {
      assert.equal(new Set(keys).size, keys.length, `البذرة ${seed}: تكرّر موضعٌ على المتسابق ${participantId}`);
    }
    for (const group of instance.groups) {
      assert.equal(byGroup.get(group.groupId) || 0, group.demand, `البذرة ${seed}: طلب المجموعة ${group.groupId} لم يُخدم بالضبط`);
    }
    const metrics = measureAssignments(instance, solved.assignments);
    assert.ok(metrics.maxReuse <= instance.policyMaxUses, `البذرة ${seed}: تجاوز سقف الاستعمال`);
  }
});

test('الاستحالة تُثبَت بشاهد: مجموعةٌ من المتسابقين تطلب أكثر مما تصل إليه', () => {
  const instance: OracleInstance = {
    loci: [0, 1, 2].map(i => ({ locusKey: `L${i}`, capacity: 1, difficulty: 3, difficultyUncertainty: 0, exposure: 0, scarcity: 0 })),
    groups: [0, 1, 2, 3].map(p => ({
      groupId: `p${p}`, participantId: `p${p}`, zoneId: null, demand: 1, eligible: [0, 1, 2], targetDifficulty: 3,
    })),
    totalDemand: 4,
    policyMaxUses: 1,
  };
  const result = proveFeasibility(instance);
  assert.equal(result.status, 'proven_infeasible');
  assert.equal(result.maxServed, 3);
  assert.equal(result.minimumAdditionalLoci, 1, 'أقلّ إصلاح: موضعٌ واحد إضافي');
  const witness = result.certificates.find(c => c.kind === 'supply_deficit');
  assert.ok(witness, 'لا بدّ من شاهد عجز عرض');
  assert.equal(witness!.demand, 4);
  assert.equal(witness!.supply, 3);
  assert.equal(witness!.deficit, 1);
  assert.equal(witness!.participantIds.length, 4);
});

test('الاستحالة بعجز التمايز تُسمّى باسمها لا باسم العرض', () => {
  const instance: OracleInstance = {
    loci: [0, 1].map(i => ({ locusKey: `L${i}`, capacity: 5, difficulty: 3, difficultyUncertainty: 0, exposure: 0, scarcity: 0 })),
    groups: [{ groupId: 'p0#z', participantId: 'p0', zoneId: 'z', demand: 3, eligible: [0, 1], targetDifficulty: 3 }],
    totalDemand: 3,
    policyMaxUses: 5,
  };
  const result = proveFeasibility(instance);
  assert.equal(result.status, 'proven_infeasible');
  const witness = result.certificates.find(c => c.kind === 'distinctness_deficit');
  assert.ok(witness, 'العجز هنا عجز تمايز لا عجز عرض: البنك واسع والمجموعة ضيّقة');
  assert.equal(witness!.deficit, 1);
});

test('بنكٌ ضخم لا يعني إمكانًا: التداخل وحده يحبس الطلب', () => {
  /*
   * مئة متسابق، لكلٍّ نطاقه، وخمسة أسئلة لكلٍّ = ٥٠٠ تخصيص. والبنك ٥٠٠٠ موضع.
   * ومع ذلك التوزيع مستحيل، لأن ثمانين متسابقًا محبوسون في ٣٠٠ موضع لا يخرجون عنها.
   * وشرط «مجموع الأسئلة ≤ حجم البنك» يمرّ هنا مرورًا تامًّا — وهو مع ذلك لا يعني شيئًا.
   */
  const loci = Array.from({ length: 5000 }, (_, i) => ({ locusKey: `L${i}`, capacity: 1, difficulty: 3, difficultyUncertainty: 0, exposure: 0, scarcity: 0 }));
  const narrow = Array.from({ length: 300 }, (_, i) => i);
  const wide = Array.from({ length: 5000 }, (_, i) => i);
  const groups = Array.from({ length: 100 }, (_, p) => ({
    groupId: `p${p}`, participantId: `p${p}`, zoneId: null, demand: 5,
    eligible: p < 80 ? narrow : wide, targetDifficulty: 3,
  }));
  const instance: OracleInstance = { loci, groups, totalDemand: 500, policyMaxUses: 1 };
  assert.ok(instance.totalDemand <= loci.length, 'الشرط الساذج يمرّ');
  const result = proveFeasibility(instance);
  assert.equal(result.status, 'proven_infeasible');
  assert.equal(result.minimumAdditionalLoci, 100, '٨٠ متسابقًا يطلبون ٤٠٠ ولا يملكون إلا ٣٠٠');
  const witness = result.certificates.find(c => c.kind === 'supply_deficit');
  assert.equal(witness?.participantIds.length, 80);
  assert.equal(witness?.demand, 400);
  assert.equal(witness?.supply, 300);
});


test('عزل الأداء: لا يدخل الحلّال مسار السحب الحيّ بحال', () => {
  /*
   * الحلّال ثقيل بطبعه — ثوانٍ لا أجزاء من ثانية. ومسار السحب الحيّ يجب أن يبقى سريعًا.
   *
   * والقاعدة سهلة القول صعبة الحفظ: يكفي استيرادٌ واحد في ملفٍ يستورده المحرّك ليصير
   * الحلّال في حزمة يوم المسابقة، ثم لا يُكتشف ذلك إلا في قاعةٍ فيها ثلاثة آلاف متسابق.
   * فتُحرس القاعدة بفحصٍ نصّي لا بالانتباه.
   */
  const here = dirname(fileURLToPath(import.meta.url));
  const forbidden = ['fairness-oracle', 'optimality-analysis', 'oracle-benchmark', 'brute-force-oracle', 'optimization/flow', 'counterfactual-inspector'];
  const liveFiles = ['question-engine.ts', 'fairdraw.ts', 'question-reservation.ts', 'question-zones.ts', 'repeat-policy.ts', 'scope-demand.ts', 'competition-twin.ts'];
  for (const file of liveFiles) {
    const source = readFileSync(join(here, '..', 'src', 'lib', file), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map(match => match[1]);
    for (const name of forbidden) {
      assert.ok(!imports.some(path => path.includes(name)), `${file} يستورد ${name} — دخل الحلّال مسار السحب`);
    }
  }
});

test('المِرصد يُستدعى من المختبر وحده: الاستيراد في المخزن ديناميكيّ لا ساكن', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, '..', 'src', 'lib', 'store-scope-actions.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const staticImports = [...code.matchAll(/^import[\s\S]*?from\s+'([^']+)';/gm)].map(match => match[1]);
  assert.ok(!staticImports.some(path => path.includes('oracle-benchmark')), 'المِرصد مستورَد استيرادًا ساكنًا في المخزن');
  assert.ok(code.includes("import('./oracle-benchmark')"), 'المِرصد يجب أن يُحمَّل عند الطلب لا عند تحميل الشاشة');
});
