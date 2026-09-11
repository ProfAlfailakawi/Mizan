/*
 * تقرير عدالة وتوزيع الأسئلة.
 *
 * اسمه هكذا عمدًا: ليس «شهادة علمية». الشهادة العلمية تصدر عن جهة علمية تتحمّل مسؤوليتها،
 * وميزان ليس جهةً علمية. هذا بيانُ ما فعله المحرك بالأرقام: كم سؤالًا سُحب، وكم موضعًا
 * تكرر، وكم كان الحدّ الأدنى الرياضي للتكرار في هذا الإعداد بعينه، وكم زاد المحرك عليه،
 * وأين وقع الضغط، وبأي قواعد كان السحب.
 *
 * وثلاثة أشياء لا يحملها هذا التقرير أبدًا:
 *   • اسم متسابق أو كوده — التقرير عن توزيع الأسئلة لا عن الأشخاص.
 *   • درجات المحكمين.
 *   • نص سؤال لم يُكشف بعد.
 *
 * والصدق فيه أهم من حسن مظهره: إن كان التكرار مضطرًّا قيل مضطرًّا وقيل سببه، وإن زاد
 * المحرك على الحدّ الأدنى قيل بكم زاد. عدالةٌ لا تُقاس دعوى، ومقياسٌ يُخفي زيادته تزوير.
 */

import type { FairnessBreakdown, FairnessReportRecord, QuestionModelRecord } from '../types';
import type { DemandAnalysis, ReuseLowerBound } from './scope-demand';
import type { RepeatPolicy } from './repeat-policy';
import { describeRepeatPolicy, repeatConstraints, theoreticalRepeatFloor } from './repeat-policy';
import { hashCanonical } from './trust-protocol';
import { QUESTION_ENGINE_VERSION } from './question-engine';

type Row = { labelArabic: string; labelEnglish: string; value: string; note?: string };
type Section = FairnessReportRecord['sections'][number];
type Finding = FairnessReportRecord['findings'][number];

const num = (value: number, digits = 0) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const pctText = (value: number) => `${num(value, 1)}%`;

export interface FairnessReportInput {
  id: string;
  organizationId: string;
  competitionId: string;
  scope: FairnessReportRecord['scope'];
  scopeRef?: string;
  titleSuffixArabic?: string;
  models: QuestionModelRecord[];
  aggregate: FairnessBreakdown;
  demand?: DemandAnalysis | null;
  lowerBound?: ReuseLowerBound | null;
  repeatPolicy: RepeatPolicy;
  policyVersion: string;
  generatedBy: string;
  now?: string;
  /** توزيع الاستعمال المرصود فعليًا: مفتاح الموضع ← عدد مرات استعماله. */
  usage?: Map<string, number> | Record<string, number>;
  /*
   * السحوب المعلَن فشلها.
   *
   * في وضع «لا تكرار إطلاقًا» مع بنكٍ لا يكفي، لا يكرر المحرك في الخفاء: يعلن الفشل ويقف.
   * فلو بُني التقرير على النماذج الناجحة وحدها لخرج نظيفًا يقول «لا تكرار» — وهو صدقٌ في
   * ظاهره كذبٌ في دلالته. المعرّفات تُسقَط هنا؛ يبقى العدد والسبب.
   */
  declaredFailures?: { code: string; ar?: string; en?: string }[];
}

/** توزيع الاستعمال من النماذج نفسها حين لا يُمرَّر دفتر جاهز. */
export function usageFromModels(models: QuestionModelRecord[]): Map<string, number> {
  const usage = new Map<string, number>();
  for (const model of models) {
    if (model.status === 'invalidated') continue;
    for (const question of model.questions) {
      const key = `${question.surahNumber}:${question.startAyah}`;
      usage.set(key, (usage.get(key) || 0) + 1);
    }
  }
  return usage;
}

export async function buildFairnessReport(input: FairnessReportInput): Promise<FairnessReportRecord> {
  const now = input.now || new Date().toISOString();
  const models = input.models.filter(m => m.status !== 'invalidated');
  const usage = input.usage instanceof Map ? input.usage : new Map(Object.entries(input.usage || {}));
  const observed = usage.size ? usage : usageFromModels(models);
  const counts = [...observed.values()];
  const draws = counts.reduce((sum, n) => sum + n, 0);
  const uniqueLoci = observed.size;
  const maxUses = counts.length ? Math.max(...counts) : 0;
  const reusedLoci = counts.filter(n => n > 1).length;
  const floor = theoreticalRepeatFloor({ draws, uniqueLoci });
  const bound = input.lowerBound?.minimumMaxUses ?? floor.minimumMaxUses;
  const excess = Math.max(0, maxUses - bound);

  const difficulties = models.map(m => m.aggregateDifficulty).filter(Number.isFinite);
  const meanDifficulty = difficulties.length ? difficulties.reduce((a, b) => a + b, 0) / difficulties.length : 0;
  const spread = difficulties.length ? Math.max(...difficulties) - Math.min(...difficulties) : 0;
  const relaxations = new Map<string, number>();
  for (const model of models) for (const item of model.relaxations) relaxations.set(item, (relaxations.get(item) || 0) + 1);

  const failureByCode = new Map<string, number>();
  for (const failure of input.declaredFailures || []) failureByCode.set(failure.code, (failureByCode.get(failure.code) || 0) + 1);
  const declaredFailures = [...failureByCode.values()].reduce((sum, n) => sum + n, 0);

  const sections: Section[] = [];
  const findings: Finding[] = [];

  sections.push({
    id: 'coverage', titleArabic: 'ما جرى فعلًا', titleEnglish: 'What actually happened',
    rows: [
      { labelArabic: 'عدد النماذج المعتمدة', labelEnglish: 'Valid models', value: num(models.length) },
      { labelArabic: 'عدد الأسئلة المسحوبة', labelEnglish: 'Questions drawn', value: num(draws) },
      { labelArabic: 'عدد المواضع المستعملة', labelEnglish: 'Distinct loci used', value: num(uniqueLoci) },
      { labelArabic: 'مواضع تكررت أكثر من مرة', labelEnglish: 'Loci used more than once', value: num(reusedLoci), note: draws && uniqueLoci ? `${pctText((reusedLoci / uniqueLoci) * 100)} من المستعمَل` : undefined },
      { labelArabic: 'أكثر موضع استعمالًا', labelEnglish: 'Most-used locus', value: `${num(maxUses)} مرة` },
      { labelArabic: 'سحوب أُعلن فشلها', labelEnglish: 'Draws declared failed', value: num(declaredFailures), note: declaredFailures ? 'أُعلن الفشل ولم يُكرَّر سؤال في الخفاء.' : undefined },
    ] satisfies Row[],
  });

  if (declaredFailures) {
    sections.push({
      id: 'failures', titleArabic: 'ما لم يستطعه المحرك، وقاله', titleEnglish: 'What the engine could not do, and said so',
      rows: [...failureByCode.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({
        labelArabic: code, labelEnglish: code, value: `${count}`,
        note: (input.declaredFailures || []).find(f => f.code === code)?.ar,
      })),
    });
  }

  sections.push({
    id: 'floor', titleArabic: 'الحدّ الأدنى الرياضي، وكم زدنا عليه', titleEnglish: 'The mathematical floor, and our excess over it',
    rows: [
      { labelArabic: 'أقل تكرار ممكن رياضيًا لأكثر موضع', labelEnglish: 'Lower bound on max uses', value: num(bound), note: input.lowerBound?.bindingGroupLabel ? `المجموعة الحاكمة: ${input.lowerBound.bindingGroupLabel}` : undefined },
      { labelArabic: 'ما بلغه المحرك فعلًا', labelEnglish: 'Reached by the engine', value: num(maxUses) },
      { labelArabic: 'الزيادة على الحدّ الأدنى', labelEnglish: 'Excess over the bound', value: num(excess), note: excess === 0 ? 'بلغ المحرك الحدّ الأدنى الرياضي؛ لا يمكن أفضل منه بهذا البنك.' : 'كل زيادة هنا نقصٌ في جودة التوزيع لا في البنك.' },
      { labelArabic: 'متوسط إعادة الاستعمال', labelEnglish: 'Average reuse', value: num(floor.averageReuse, 3) },
      { labelArabic: 'تكرار لا مفرّ منه', labelEnglish: 'Unavoidable repeats', value: num(floor.unavoidableRepeats), note: floor.feasibleWithoutRepeat ? 'البنك يكفي لعدم التكرار إطلاقًا.' : 'البنك لا يكفي لعدم التكرار؛ التكرار هنا رياضي لا خيار سياسة.' },
    ] satisfies Row[],
  });

  sections.push({
    id: 'rules', titleArabic: 'بأي قواعد كان السحب', titleEnglish: 'Under which rules',
    rows: [
      { labelArabic: 'سياسة التكرار', labelEnglish: 'Repeat policy', value: describeRepeatPolicy(input.repeatPolicy, true) },
      ...repeatConstraints(input.repeatPolicy).map(constraint => ({
        labelArabic: `${constraint.rank === 'MUST' ? 'شرط' : 'تفضيل'} · ${constraint.ar}`,
        labelEnglish: `${constraint.rank} · ${constraint.en}`,
        value: constraint.rank,
      })),
      { labelArabic: 'نسخة المحرك', labelEnglish: 'Engine version', value: QUESTION_ENGINE_VERSION },
      { labelArabic: 'نسخة اللائحة', labelEnglish: 'Policy version', value: input.policyVersion },
    ] satisfies Row[],
  });

  sections.push({
    id: 'fairness', titleArabic: 'عدالة النماذج ومكوّناتها', titleEnglish: 'Model fairness and its components',
    rows: [
      { labelArabic: 'الدرجة الكلية', labelEnglish: 'Overall score', value: pctText(input.aggregate.score) },
      { labelArabic: 'مطابقة الصعوبة للهدف', labelEnglish: 'Difficulty parity', value: pctText(input.aggregate.difficultyParity) },
      { labelArabic: 'تغطية مناطق التوزيع', labelEnglish: 'Zone coverage', value: pctText(input.aggregate.scopeCoverage) },
      { labelArabic: 'انخفاض ضغط التكرار', labelEnglish: 'Repeat-pressure headroom', value: pctText(input.aggregate.repeatPressure) },
      { labelArabic: 'التنوّع بين السور', labelEnglish: 'Surah diversity', value: pctText(input.aggregate.diversity) },
      { labelArabic: 'تباعد المواضع داخل النموذج', labelEnglish: 'Within-model separation', value: pctText(input.aggregate.similarity) },
      { labelArabic: 'انخفاض ضغط الانكشاف', labelEnglish: 'Exposure headroom', value: pctText(input.aggregate.exposure) },
      { labelArabic: 'الالتزام بمناطق التوزيع', labelEnglish: 'Zone compliance', value: pctText(input.aggregate.zoneCompliance) },
      { labelArabic: 'متوسط صعوبة النماذج', labelEnglish: 'Mean model difficulty', value: num(meanDifficulty, 2) },
      { labelArabic: 'الفرق بين أصعب نموذج وأسهله', labelEnglish: 'Hardest-to-easiest spread', value: num(spread, 2), note: spread > 1.5 ? 'فرقٌ ملموس بين النماذج؛ يُراجع هدف الصعوبة أو سماحيته.' : undefined },
    ] satisfies Row[],
  });

  if (relaxations.size) {
    sections.push({
      id: 'relaxations', titleArabic: 'ما اضطر المحرك إلى التنازل عنه', titleEnglish: 'Preferences the engine had to relax',
      rows: [...relaxations.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({
        labelArabic: key, labelEnglish: key, value: `${count} نموذجًا`,
      })),
    });
  }

  if (input.demand) {
    const hot = input.demand.juzHeat.filter(cell => cell.exhaustionRisk === 'high' || cell.exhaustionRisk === 'critical');
    sections.push({
      id: 'pressure', titleArabic: 'أين وقع الضغط', titleEnglish: 'Where the pressure fell',
      rows: [
        { labelArabic: 'عدد عناقيد النطاق', labelEnglish: 'Scope clusters', value: num(input.demand.clusters.length) },
        { labelArabic: 'أجزاء تحت ضغط عالٍ أو حرج', labelEnglish: 'Juz under high/critical pressure', value: hot.length ? hot.map(c => c.juz).join('، ') : 'لا شيء' },
        ...input.demand.bottlenecks.slice(0, 5).map(cluster => ({
          labelArabic: `عنق زجاجة · ${cluster.label}`,
          labelEnglish: `Bottleneck · ${cluster.label}`,
          value: `طلب ${cluster.demand} · عرض ${cluster.supply}`,
          note: `${cluster.participantCount} متسابقًا في هذا العنقود`,
        })),
      ] satisfies Row[],
    });
  }

  if (!models.length) findings.push({ id: 'no_models', severity: 'critical', ar: 'لا نماذج معتمدة في هذا النطاق؛ التقرير بلا مادة.', en: 'No valid models in scope; the report has no material.' });
  if (excess > 0) findings.push({ id: 'excess_over_bound', severity: excess > 2 ? 'warning' : 'recommendation', ar: `المحرك زاد ${excess} على الحدّ الأدنى الرياضي للتكرار؛ هذا نقص توزيع لا نقص بنك.`, en: `The engine exceeded the mathematical reuse bound by ${excess}; this is distribution quality, not pool size.` });
  else if (models.length) findings.push({ id: 'at_bound', severity: 'passed', ar: 'بلغ التوزيع الحدّ الأدنى الرياضي للتكرار؛ لا توزيع أفضل منه بهذا البنك.', en: 'The distribution reached the mathematical reuse bound; no better distribution exists for this pool.' });
  if (input.repeatPolicy.mode === 'strict_no_repeat' && (!floor.feasibleWithoutRepeat || declaredFailures > 0)) findings.push({ id: 'strict_impossible', severity: 'critical', ar: `السياسة تمنع التكرار والبنك لا يكفي؛ ${declaredFailures ? `أُعلن فشل ${declaredFailures} سحبة` : 'ستُعلَن سحوبٌ فاشلة'} بدل أن يتكرر سؤال في الخفاء.`, en: `The policy forbids repetition while the pool is insufficient; ${declaredFailures ? `${declaredFailures} draws were declared failed` : 'draws will be declared failed'} rather than silently repeated.` });
  else if (declaredFailures > 0) findings.push({ id: 'declared_failures', severity: 'warning', ar: `أُعلن فشل ${declaredFailures} سحبة؛ راجع أسبابها قبل يوم المسابقة.`, en: `${declaredFailures} draws were declared failed; review their reasons before competition day.` });
  if (spread > 1.5) findings.push({ id: 'difficulty_spread', severity: 'warning', ar: `الفرق بين أصعب نموذج وأسهله ${num(spread, 2)}؛ راجع سماحية الصعوبة.`, en: `Hardest-to-easiest model spread is ${num(spread, 2)}; review the difficulty tolerance.` });
  if (input.aggregate.zoneCompliance < 100 && models.length) findings.push({ id: 'zone_relaxed', severity: 'recommendation', ar: 'بعض المناطق لم تُخدم من داخلها فوُسِّعت إلى النطاق؛ راجع تعريف المناطق أو سعة البنك فيها.', en: 'Some zones were relaxed to the full scope; review zone definitions or their pool depth.' });

  const honestyNoteArabic = 'هذا تقرير عدالة وتوزيع أسئلة صادر عن محرك ميزان، وليس شهادة علمية ولا اعتمادًا من جهة علمية. أرقامه قابلة لإعادة الإنتاج من البذرة والإعداد المذكورين. ولا يحتوي أسماء متسابقين ولا أكوادهم ولا درجات المحكمين.';
  const honestyNoteEnglish = 'This is a question fairness and distribution report produced by the Mizan engine. It is not a scientific certificate and carries no scientific body’s endorsement. Its figures are reproducible from the stated seed and configuration, and it contains no participant identities and no judge scores.';

  const core = {
    organizationId: input.organizationId, competitionId: input.competitionId, scope: input.scope, scopeRef: input.scopeRef,
    generatedAt: now, engineVersion: QUESTION_ENGINE_VERSION, policyVersion: input.policyVersion,
    sections, findings, models: models.length, draws, uniqueLoci, maxUses, bound, declaredFailures,
  };
  const reportHash = await hashCanonical(core);

  return {
    id: input.id,
    organizationId: input.organizationId,
    competitionId: input.competitionId,
    titleArabic: `تقرير عدالة وتوزيع الأسئلة${input.titleSuffixArabic ? ` — ${input.titleSuffixArabic}` : ''}`,
    titleEnglish: 'Question Fairness and Distribution Report',
    scope: input.scope,
    scopeRef: input.scopeRef,
    generatedAt: now,
    generatedBy: input.generatedBy,
    engineVersion: QUESTION_ENGINE_VERSION,
    policyVersion: input.policyVersion,
    reportHash,
    privacy: { participantIdentities: false, judgeScores: false },
    sections,
    findings,
    honestyNoteArabic,
    honestyNoteEnglish,
  };
}

/** نصٌّ قابل للطباعة واللصق في محضر. بلا أسماء، وبالبصمة في آخره ليُتحقق منه. */
export function renderFairnessReportText(report: FairnessReportRecord): string {
  const lines: string[] = [report.titleArabic, '='.repeat(40), `التاريخ: ${report.generatedAt}`, `نسخة المحرك: ${report.engineVersion}`, ''];
  for (const section of report.sections) {
    lines.push(`— ${section.titleArabic} —`);
    for (const row of section.rows) lines.push(`  ${row.labelArabic}: ${row.value}${row.note ? ` (${row.note})` : ''}`);
    lines.push('');
  }
  if (report.findings.length) {
    lines.push('— الملاحظات —');
    for (const finding of report.findings) lines.push(`  [${finding.severity}] ${finding.ar}`);
    lines.push('');
  }
  lines.push(report.honestyNoteArabic, '', `بصمة التقرير: ${report.reportHash}`);
  return lines.join('\n');
}

/** فحص خصوصية التقرير قبل تصديره: لا اسم ولا كود متسابق يمرّ. */
export function fairnessReportPrivacyViolations(report: FairnessReportRecord, forbidden: string[]): string[] {
  const haystack = JSON.stringify({ sections: report.sections, findings: report.findings, titleArabic: report.titleArabic }).toLowerCase();
  return forbidden.filter(token => token.trim().length >= 3 && haystack.includes(token.trim().toLowerCase()));
}
