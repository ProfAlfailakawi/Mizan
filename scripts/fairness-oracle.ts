/*
 * مقايسة المِرصد — Mizan Fairness Oracle Benchmark.
 *
 * يُشغَّل بالأمر `npm run oracle:benchmark`. بياناتٌ اصطناعية بالكامل، ولا يمسّ حالة تشغيل،
 * ولا يكتب في مخزنٍ حيّ. يطبع الأرقام ويخرج بصفرٍ أو بواحد.
 *
 * وما يُطبع هنا يلتزم لغةً دقيقة: «أمثل مُثبَت» لا تُقال إلا إذا أثبته الحلّال، و«مستحيل»
 * لا تُقال إلا بشاهد، وما دون ذلك «أفضل حلّ معروف» أو «حدّ أدنى مُثبَت» أو «تقدير».
 */

import { fullQuranScope, scopeFromJuz, scopeFromJuzRange, scopeUnion, scopeFromSurahs } from '../src/lib/quran-scope';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { syntheticParticipants, type TwinInput } from '../src/lib/competition-twin';
import { DEFAULT_REPEAT_POLICY, STRICT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { autoBalancedPlan, freeDistributionPlan } from '../src/lib/question-zones';
import { describeOracleStatus, runOracleBenchmark } from '../src/lib/oracle-benchmark';
import { buildOracleInstance } from '../src/lib/fairness-oracle-instance';
import { proveFeasibility, strongReuseLowerBound } from '../src/lib/fairness-oracle';
import { locusMarginalCriticality, minimalRepair, paretoFairnessFrontier } from '../src/lib/optimality-analysis';

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const arg = (name: string, fallback: number) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) || fallback : fallback;
};
const line = (label: string, value: unknown) => console.log(`  ${label.padEnd(42, '.')} ${value}`);

const budget = { maxEdges: 4_000_000, maxIterations: 600_000, timeBudgetMs: arg('budget', 120_000) };

interface Scenario { id: string; ar: string; input: TwinInput }

function scenarios(): Scenario[] {
  const juz30 = scopeFromJuz([30]);
  const juz30Pool = projectCandidatesFromScope(juz30, { passageAyahCount: 3, reading });
  const juz1 = scopeFromJuz([1]);
  const juz1Pool = projectCandidatesFromScope(juz1, { passageAyahCount: 3, reading });
  const mixed = scopeFromJuzRange(28, 30);
  const mixedPool = projectCandidatesFromScope(mixed, { passageAyahCount: 3, reading });

  return [
    {
      id: 'comfortable',
      ar: 'بنكٌ واسع: مئة متسابق على جزءٍ كامل — التكرار ليس حتميًا',
      input: {
        competitionId: 'oracle-comfortable',
        participants: syntheticParticipants({ count: arg('small', 100), categoryId: 'c', questionCount: 3, scopes: [{ scope: juz30, share: 1 }], reading, halls: 4, prefix: 'a' }),
        candidates: juz30Pool,
        defaultPlan: freeDistributionPlan(),
        repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', maxUsesPerQuestion: 4 },
        targetDifficulty: 3, seed: 'oracle-comfortable',
      },
    },
    {
      id: 'forced-repetition',
      ar: 'ضغطٌ حقيقي: أربعمئة متسابق على جزءٍ واحد — التكرار حتميّ رياضيًا',
      input: {
        competitionId: 'oracle-forced',
        participants: syntheticParticipants({ count: arg('forced', 400), categoryId: 'c', questionCount: 3, scopes: [{ scope: juz30, share: 1 }], reading, halls: 6, prefix: 'b' }),
        candidates: juz30Pool,
        defaultPlan: freeDistributionPlan(),
        repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', maxUsesPerQuestion: 6 },
        targetDifficulty: 3, seed: 'oracle-forced',
      },
    },
    {
      id: 'zoned',
      ar: 'مناطق توزيع: ثلاثة أجزاء مقسومة إلى مناطق، وثلاثة أسئلة لكلٍّ',
      input: {
        competitionId: 'oracle-zoned',
        participants: syntheticParticipants({ count: arg('zoned', 150), categoryId: 'c', questionCount: 3, scopes: [{ scope: mixed, share: 1 }], reading, halls: 5, prefix: 'c' }),
        candidates: mixedPool,
        defaultPlan: autoBalancedPlan(mixed, 3),
        repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', maxUsesPerQuestion: 4 },
        targetDifficulty: 3, seed: 'oracle-zoned',
      },
    },
    {
      id: 'infeasible-strict',
      ar: 'لا تكرار إطلاقًا مع بنكٍ لا يكفي — الاستحالة يجب أن تُثبَت بشاهد',
      input: {
        competitionId: 'oracle-strict',
        participants: syntheticParticipants({ count: arg('strict', 200), categoryId: 'c', questionCount: 3, scopes: [{ scope: juz1, share: 1 }], reading, prefix: 'd' }),
        candidates: juz1Pool,
        defaultPlan: freeDistributionPlan(),
        repeatPolicy: STRICT_REPEAT_POLICY,
        targetDifficulty: 3, seed: 'oracle-strict',
      },
    },
  ];
}

interface Tally {
  exact: number; provenOptimal: number; matched: number; gaps: number[];
  feasible: number; provenInfeasible: number; falseFeasibility: number;
  regrets: number[];
}

const tally: Tally = { exact: 0, provenOptimal: 0, matched: 0, gaps: [], feasible: 0, provenInfeasible: 0, falseFeasibility: 0, regrets: [] };

console.log('MIZAN Fairness Oracle Benchmark — بيانات اصطناعية بالكامل، ولا تُمسّ حالة تشغيل.\n');

for (const scenario of scenarios()) {
  console.log(`══ ${scenario.id} — ${scenario.ar}`);
  const result = runOracleBenchmark({ ...scenario.input, budget, withRegret: true });
  tally.exact++;

  line('متسابقون · مواضع · طلب', `${result.twin.metrics.participants} · ${result.build.instance.loci.length} · ${result.build.instance.totalDemand}`);
  line('حال المِرصد', describeOracleStatus(result.minMaxReuse));
  line('الحدّ الأدنى السريع (الموجود)', result.fastLowerBound);
  line('الحدّ الأدنى القويّ (بالإرخاء)', result.strongLowerBound.infeasible
    ? 'لا حدَّ أدنى: مستحيلٌ حتى عند السقف الأعلى'
    : `${result.strongLowerBound.bound}${result.strongLowerBound.proven ? ' (مُثبَت)' : ' (غير مُثبَت)'}`);

  if (result.minMaxReuse.status === 'proven_optimal') {
    tally.provenOptimal++;
    tally.feasible++;
    const maxReuse = result.gap.dimensions.find(d => d.dimension === 'max_reuse');
    if (maxReuse && maxReuse.gap !== null) {
      tally.gaps.push(maxReuse.gap);
      if (maxReuse.gap <= 0) tally.matched++;
    }
  } else if (result.minMaxReuse.status === 'proven_infeasible') {
    tally.provenInfeasible++;
    const certificates = result.minMaxReuse.feasibility.certificates;
    line('أقلّ مواضع إضافية (مُثبَت)', result.minMaxReuse.feasibility.minimumAdditionalLoci);
    for (const certificate of certificates.slice(0, 2)) line(`شاهد · ${certificate.kind}`, certificate.ar);
    const repair = minimalRepair({ instance: result.build.instance, budget });
    for (const option of repair.options) line(`إصلاح · ${option.id}${option.proven ? ' (أقلّ مُثبَت)' : ''}`, option.ar);
    /*
     * الفحص العكسي: إن أعلن المِرصد استحالةً فيجب ألّا يكون المحرّك قد خدم الطلب كاملًا.
     * ولو وقع ذلك لكان أحدهما كاذبًا، والكذب هنا أخطر من العجز.
     */
    if (result.twin.metrics.failedDraws === 0) {
      tally.falseFeasibility++;
      console.log('  ✗ تناقض: المِرصد يقول مستحيل والمحرّك خدم الطلب كاملًا.');
    }
  }

  console.log('  — الفجوة عن الأمثل المُثبَت، بُعدًا بُعدًا:');
  for (const dimension of result.gap.dimensions) {
    const optimum = dimension.optimum === null ? '—' : dimension.optimum;
    const gap = dimension.gap === null ? 'غير محسوم'
      : dimension.gap === 0 ? `صفر — بلغ الحدّ${dimension.toleranceFromRounding ? ` (سماحية تدوير ${dimension.toleranceFromRounding})` : ''}`
      : `${dimension.gap > 0 ? '+' : ''}${dimension.gap}`;
    console.log(`      ${dimension.ar.padEnd(36, '.')} الأمثل ${String(optimum).padStart(8)} · ميزان ${String(dimension.achieved).padStart(8)} · الفجوة ${gap}`);
  }
  if (result.regret?.totalRegret !== null && result.regret?.totalRegret !== undefined) {
    tally.regrets.push(result.regret.totalRegret);
    line('ندم العدالة الكلي', `${result.regret.totalRegret} — ${result.regret.ar}`);
  }

  if (result.minMaxReuse.status === 'proven_optimal' && scenario.id === 'forced-repetition') {
    const criticality = locusMarginalCriticality({ instance: result.build.instance, limit: arg('critical', 6), budget });
    console.log('  — حرج الموضع الحدّي (أثر منعه على أفضل حلٍّ ممكن):');
    for (const row of criticality.loci.slice(0, 4)) {
      console.log(`      ${row.locusKey.padEnd(12)} أفضل «أكثر استعمال» ${row.baselineMaxReuse} ← ${row.withoutMaxReuse ?? '—'} (فرق ${row.maxReuseDelta ?? '—'})`);
    }
    const pareto = paretoFairnessFrontier({ instance: result.build.instance, budget });
    console.log('  — جبهة باريتو (خياراتٌ لا يهيمن أحدها على آخر):');
    for (const point of pareto.frontier) {
      console.log(`      ${point.label.padEnd(34)} تكرار ${point.metrics.totalRepeats} · صعوبة ${point.metrics.difficultyDeviation} · ندرة ${point.metrics.scarcityCost} · قاعات ${point.metrics.sameHallReuses}`);
    }
    line('حلولٌ مهيمنٌ عليها فحُذفت', pareto.dominated);
  }
  console.log('');
}

/*
 * فحصٌ مستقلّ للجدوى: بنكٌ ضخم وتداخلٌ يحبس الطلب.
 *
 * الغرض إثبات أن الفحص لا يكتفي بالشرط الساذج «مجموع الأسئلة ≤ حجم البنك»: هنا يمرّ ذلك
 * الشرط مرورًا تامًّا والتوزيع مستحيل.
 */
console.log('══ فحص الجدوى على تداخلٍ يحبس الطلب');
{
  const narrow = scopeFromJuz([30]);
  const wide = fullQuranScope();
  const pool = projectCandidatesFromScope(wide, { passageAyahCount: 3, reading, limit: 6000 });
  const participants = [
    ...syntheticParticipants({ count: 120, categoryId: 'narrow', questionCount: 5, scopes: [{ scope: narrow, share: 1 }], reading, prefix: 'n' }),
    ...syntheticParticipants({ count: 40, categoryId: 'wide', questionCount: 5, scopes: [{ scope: scopeUnion(wide, scopeFromSurahs([1])), share: 1 }], reading, prefix: 'w' }),
  ];
  const build = buildOracleInstance({
    participants: participants.map(p => ({ participantId: p.participantId, categoryId: p.categoryId, scope: p.scope, questionCount: p.questionCount, reading: p.reading })),
    candidates: pool,
    defaultPlan: freeDistributionPlan(),
    repeatPolicy: STRICT_REPEAT_POLICY,
    targetDifficulty: 3,
    label: 'feasibility-probe',
  });
  const totalDraws = participants.reduce((sum, p) => sum + p.questionCount, 0);
  line('الشرط الساذج (طلب ≤ بنك)', `${totalDraws} ≤ ${build.instance.loci.length} → ${totalDraws <= build.instance.loci.length ? 'يمرّ' : 'يسقط'}`);
  const feasibility = proveFeasibility(build.instance, { budget });
  line('الحكم القاطع', feasibility.status);
  line('أقلّ مواضع إضافية (مُثبَت)', feasibility.minimumAdditionalLoci);
  for (const certificate of feasibility.certificates.slice(0, 1)) line('شاهد', certificate.ar);
  const strong = strongReuseLowerBound(build.instance, { budget });
  line('الحدّ الأدنى القويّ', strong.infeasible ? 'لا حدَّ أدنى: مستحيلٌ حتى عند السقف الأعلى' : `${strong.bound} (${strong.probes} فحصًا)`);
  tally.exact++;
  if (feasibility.status === 'proven_infeasible') tally.provenInfeasible++; else tally.feasible++;
}

const average = (values: number[]) => (values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : 0);
console.log('\n══ الخلاصة');
line('مسائل فُحصت بدقّة', tally.exact);
line('مسائل أُثبت لها الأمثل', tally.provenOptimal);
line('بلغ فيها ميزان الأمثل المُثبَت', tally.matched);
line('متوسط الفجوة (أكثر استعمال)', average(tally.gaps));
line('أسوأ فجوة', tally.gaps.length ? Math.max(...tally.gaps) : 0);
line('حالات ممكنة', tally.feasible);
line('حالات استحالة مُثبَتة', tally.provenInfeasible);
line('قرارات جدوى كاذبة', tally.falseFeasibility);
line('متوسط ندم العدالة', average(tally.regrets));
line('أسوأ ندم مرصود', tally.regrets.length ? Math.max(...tally.regrets) : 0);

const ok = tally.falseFeasibility === 0 && tally.provenOptimal > 0;
console.log(`\n${ok ? 'المقايسة تمّت بلا تناقض.' : 'المقايسة كشفت تناقضًا — راجع أعلاه.'}`);
process.exitCode = ok ? 0 : 1;
