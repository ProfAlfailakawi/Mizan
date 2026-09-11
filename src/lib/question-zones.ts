/*
 * مناطق توزيع الأسئلة (Question Zones).
 *
 * المنطقة ليست جزءًا ولا قسمةً متساوية بالضرورة: هي نطاق قرآني مستقل — شرط أن يكون جزءًا من
 * نطاق المتسابق — يُطلب منه عددٌ من الأسئلة بمواصفات صعوبةٍ وتنوّع.
 *
 * مثال «١–٣٠ وخمسة أسئلة ⇒ ١–٦، ٧–١٢، ١٣–١٨، ١٩–٢٤، ٢٥–٣٠» صار هنا تهيئةً لا كودًا:
 * اللجنة تقبل الاقتراح أو تكتب مناطق غير متساوية أو ثلاثًا أو سبعًا، ولا يتغير سطرٌ واحد.
 *
 * والقسمة التلقائية لا تقسم عدد الأجزاء على عدد الأسئلة: تَزِن المحتوى الفعلي (عدد الآيات،
 * وعند توفره عدد المواضع الصالحة في البنك) لأن الأجزاء ليست متساوية كمخزون أسئلة.
 */

import {
  describeScope, emptyScope, isScopeSubsetOf, normalizeScope, scopeAyahCount, scopeIntersect,
  scopeMetrics, splitScopeBalanced, type QuranScope,
} from './quran-scope';

export type QuestionDistributionMode = 'free' | 'auto_balanced' | 'custom_zones' | 'rule_driven' | 'hybrid';
export type ZoneFallback = 'relax_to_scope' | 'skip' | 'fail';

export interface QuestionZone {
  id: string;
  name: string;
  nameArabic?: string;
  order: number;
  scope: QuranScope;
  requiredQuestionCount: number;
  targetDifficulty?: number;
  minDifficulty?: number;
  maxDifficulty?: number;
  /** منع تكرار السورة داخل المنطقة الواحدة. تفضيل لا شرط. */
  preferDistinctSurah?: boolean;
  mandatory: boolean;
  fallback: ZoneFallback;
}

export interface QuestionDistributionPlan {
  version: number;
  mode: QuestionDistributionMode;
  zones: QuestionZone[];
  /** في الوضع المختلط: كم سؤالًا يُترك حرًّا داخل كامل نطاق المتسابق. */
  freeQuestionCount?: number;
  /** في القسمة التلقائية: عدد المناطق حين يُراد غير عدد الأسئلة. */
  autoZoneCount?: number;
  updatedAt?: string;
}

export interface ZoneSlot {
  index: number;
  zoneId: string | null;
  zoneName: string;
  zoneNameArabic: string;
  scope: QuranScope;
  targetDifficulty?: number;
  minDifficulty?: number;
  maxDifficulty?: number;
  preferDistinctSurah?: boolean;
  /** صار النطاق أوسع من المنطقة الأصلية لأن المنطقة لا تتقاطع مع نطاق هذا المتسابق. */
  relaxed?: boolean;
}

export interface ZoneIssue { code: string; ar: string; en: string; severity: 'error' | 'warning' | 'recommendation'; zoneId?: string }

export const freeDistributionPlan = (): QuestionDistributionPlan => ({ version: 1, mode: 'free', zones: [] });

export function autoBalancedZones(scope: QuranScope, count: number, options?: { weightOfOrdinal?: (ordinal: number) => number; arabic?: boolean }): QuestionZone[] {
  const parts = Math.max(1, Math.round(count));
  const slices = splitScopeBalanced(scope, parts, options?.weightOfOrdinal);
  return slices.map((slice, index) => ({
    id: `zone-${index + 1}`,
    name: `Zone ${index + 1}`,
    nameArabic: `المنطقة ${index + 1}`,
    order: index + 1,
    scope: slice,
    requiredQuestionCount: 1,
    mandatory: true,
    fallback: 'relax_to_scope' as ZoneFallback,
    preferDistinctSurah: true,
  }));
}

export function autoBalancedPlan(scope: QuranScope, questionCount: number, options?: { weightOfOrdinal?: (ordinal: number) => number }): QuestionDistributionPlan {
  return { version: 1, mode: 'auto_balanced', zones: autoBalancedZones(scope, questionCount, options), autoZoneCount: questionCount, updatedAt: new Date().toISOString() };
}

export function zoneQuestionTotal(plan: QuestionDistributionPlan): number {
  return plan.zones.reduce((sum, zone) => sum + Math.max(0, Math.round(zone.requiredQuestionCount || 0)), 0) + Math.max(0, Math.round(plan.freeQuestionCount || 0));
}

export function validateDistributionPlan(plan: QuestionDistributionPlan, parentScope: QuranScope, questionsPerParticipant: number): ZoneIssue[] {
  const issues: ZoneIssue[] = [];
  if (plan.mode === 'free') return issues;
  if (!plan.zones.length && plan.mode !== 'hybrid') {
    issues.push({ code: 'ZONES_EMPTY', ar: 'لم تُحدَّد أي منطقة توزيع.', en: 'No distribution zone has been defined.', severity: 'error' });
    return issues;
  }
  for (const zone of plan.zones) {
    if (scopeAyahCount(zone.scope) === 0) issues.push({ code: 'ZONE_EMPTY', ar: `المنطقة «${zone.nameArabic || zone.name}» بلا نطاق.`, en: `Zone "${zone.name}" has an empty scope.`, severity: 'error', zoneId: zone.id });
    else if (scopeAyahCount(parentScope) > 0 && !isScopeSubsetOf(zone.scope, parentScope)) {
      issues.push({ code: 'ZONE_OUTSIDE_SCOPE', ar: `المنطقة «${zone.nameArabic || zone.name}» تخرج عن نطاق الفئة.`, en: `Zone "${zone.name}" falls outside the category scope.`, severity: 'error', zoneId: zone.id });
    }
    if (!Number.isInteger(zone.requiredQuestionCount) || zone.requiredQuestionCount < 0) {
      issues.push({ code: 'ZONE_COUNT_INVALID', ar: `عدد أسئلة المنطقة «${zone.nameArabic || zone.name}» غير صالح.`, en: `Zone "${zone.name}" has an invalid question count.`, severity: 'error', zoneId: zone.id });
    }
  }
  const total = zoneQuestionTotal(plan);
  if (total !== questionsPerParticipant) {
    issues.push({
      code: 'ZONE_TOTAL_MISMATCH',
      ar: `مجموع أسئلة المناطق ${total} وعدد أسئلة المتسابق ${questionsPerParticipant}.`,
      en: `Zones request ${total} questions while the participant receives ${questionsPerParticipant}.`,
      severity: 'error',
    });
  }
  // تداخل المناطق ليس خطأً بالضرورة — قد تقصده اللجنة — لكنه يستحق تنبيهًا.
  for (let i = 0; i < plan.zones.length; i++) for (let j = i + 1; j < plan.zones.length; j++) {
    if (scopeAyahCount(scopeIntersect(plan.zones[i].scope, plan.zones[j].scope)) > 0) {
      issues.push({ code: 'ZONE_OVERLAP', ar: `المنطقتان «${plan.zones[i].nameArabic || plan.zones[i].name}» و«${plan.zones[j].nameArabic || plan.zones[j].name}» متداخلتان.`, en: `Zones "${plan.zones[i].name}" and "${plan.zones[j].name}" overlap.`, severity: 'warning', zoneId: plan.zones[i].id });
    }
  }
  const covered = plan.zones.reduce((acc, zone) => scopeAyahCount(zone.scope) + acc, 0);
  if (plan.mode !== 'hybrid' && covered < scopeAyahCount(parentScope)) {
    issues.push({ code: 'ZONE_COVERAGE_PARTIAL', ar: 'المناطق لا تغطي كامل نطاق الفئة — مواضع خارجها لن يُسأل منها.', en: 'Zones do not cover the whole category scope; loci outside them will never be drawn.', severity: 'recommendation' });
  }
  return issues;
}

/**
 * خانات الأسئلة لهذا المتسابق بعينه.
 *
 * نطاق المتسابق قد يكون أضيق من نطاق الفئة، فمنطقةٌ صالحة على مستوى الفئة قد لا تتقاطع معه.
 * السلوك عند ذلك معلن في fallback: توسيعٌ إلى كامل نطاق المتسابق، أو تخطٍّ، أو إفشال صريح.
 * ولا تُسحب خانةٌ خارج نطاق المتسابق مهما كان الإعداد.
 */
export function resolveZoneSlots(input: {
  plan: QuestionDistributionPlan;
  effectiveScope: QuranScope;
  questionCount: number;
  arabic?: boolean;
  weightOfOrdinal?: (ordinal: number) => number;
}): { slots: ZoneSlot[]; issues: ZoneIssue[] } {
  const { plan, questionCount } = input;
  const effectiveScope = normalizeScope(input.effectiveScope);
  const issues: ZoneIssue[] = [];
  const slots: ZoneSlot[] = [];
  const freeSlot = (index: number): ZoneSlot => ({ index, zoneId: null, zoneName: 'Open range', zoneNameArabic: 'النطاق كاملًا', scope: effectiveScope });

  if (scopeAyahCount(effectiveScope) === 0) {
    return { slots: [], issues: [{ code: 'SCOPE_EMPTY_FOR_PARTICIPANT', ar: 'لا نطاق معتمدًا لهذا المتسابق.', en: 'This participant has no approved scope.', severity: 'error' }] };
  }
  if (plan.mode === 'free') {
    for (let i = 0; i < questionCount; i++) slots.push(freeSlot(i));
    return { slots, issues };
  }
  if (plan.mode === 'auto_balanced') {
    const zones = autoBalancedZones(effectiveScope, plan.autoZoneCount || questionCount, { weightOfOrdinal: input.weightOfOrdinal });
    for (let i = 0; i < questionCount; i++) {
      const zone = zones[i % zones.length];
      slots.push({ index: i, zoneId: zone.id, zoneName: zone.name, zoneNameArabic: zone.nameArabic || zone.name, scope: zone.scope, preferDistinctSurah: true });
    }
    return { slots, issues };
  }

  const ordered = [...plan.zones].sort((a, b) => a.order - b.order);
  let index = 0;
  for (const zone of ordered) {
    const clipped = scopeIntersect(zone.scope, effectiveScope);
    const empty = scopeAyahCount(clipped) === 0;
    if (empty && zone.fallback === 'fail' && zone.mandatory) {
      issues.push({ code: 'ZONE_UNREACHABLE', ar: `المنطقة «${zone.nameArabic || zone.name}» خارج نطاق هذا المتسابق ولا تسمح إعداداتها بالتوسّع.`, en: `Zone "${zone.name}" lies outside this participant's scope and its fallback forbids relaxation.`, severity: 'error', zoneId: zone.id });
      continue;
    }
    if (empty && zone.fallback === 'skip') {
      issues.push({ code: 'ZONE_SKIPPED', ar: `تُخطَّت المنطقة «${zone.nameArabic || zone.name}» لأنها خارج نطاق هذا المتسابق.`, en: `Zone "${zone.name}" was skipped: outside this participant's scope.`, severity: 'warning', zoneId: zone.id });
      continue;
    }
    const scope = empty ? effectiveScope : clipped;
    if (empty) issues.push({ code: 'ZONE_RELAXED', ar: `وُسِّعت المنطقة «${zone.nameArabic || zone.name}» إلى كامل نطاق المتسابق.`, en: `Zone "${zone.name}" was relaxed to the participant's full scope.`, severity: 'warning', zoneId: zone.id });
    for (let n = 0; n < Math.max(0, Math.round(zone.requiredQuestionCount)); n++) {
      if (index >= questionCount) break;
      slots.push({
        index, zoneId: zone.id, zoneName: zone.name, zoneNameArabic: zone.nameArabic || zone.name, scope,
        targetDifficulty: zone.targetDifficulty, minDifficulty: zone.minDifficulty, maxDifficulty: zone.maxDifficulty,
        preferDistinctSurah: zone.preferDistinctSurah, ...(empty ? { relaxed: true } : {}),
      });
      index++;
    }
  }
  while (index < questionCount) { slots.push(freeSlot(index)); index++; }
  return { slots: slots.slice(0, questionCount), issues };
}

export function describeZone(zone: QuestionZone, arabic: boolean): string {
  const metrics = scopeMetrics(zone.scope);
  const range = describeScope(zone.scope, arabic);
  return arabic ? `${range} · ${metrics.ayahCount} آية` : `${range} · ${metrics.ayahCount} ayat`;
}

export const emptyZone = (order: number): QuestionZone => ({
  id: `zone-${order}-${Math.random().toString(36).slice(2, 8)}`,
  name: `Zone ${order}`, nameArabic: `المنطقة ${order}`, order,
  scope: emptyScope(), requiredQuestionCount: 1, mandatory: true, fallback: 'relax_to_scope', preferDistinctSurah: true,
});
