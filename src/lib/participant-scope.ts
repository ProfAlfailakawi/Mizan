/*
 * Participant Effective Scope — نطاق المتسابق بعينه.
 *
 * Participant Effective Scope is the authoritative source for question eligibility whenever
 * participant-specific selection applies.
 * متى كان للمتسابق نطاقٌ معتمد، فهو وحده مرجع أهلية السؤال — لا اسم الفئة ولا عدد أجزائها.
 *
 * الفصل هنا صريح وثلاثي:
 *   Category Scope            — نطاق الفئة العام (ثابت، أو مظلّة يُختار من داخلها).
 *   Category Selection Rules  — ما الذي يجوز للمتسابق أن يختاره، وبأي وحدة، وبأي قيد.
 *   Participant Scope         — النطاق النهائي لهذا المتسابق، بدورة حياة ونسخة ومراجعة.
 */

import {
  emptyScope, isScopeSubsetOf, makeScope, normalizeScope, scopeAyahCount, scopeIntersect,
  scopeKey, scopeMetrics, scopeRanges, scopeSignature, scopeUnion, validateScope,
  type QuranScope, type QuranScopeSegment, type QuranScopeUnit,
} from './quran-scope';
import { ayahOrdinal, unitBounds, unitTotal } from './quran-canon';

export type ScopeSelectionUnit = Extract<QuranScopeUnit, 'juz' | 'hizb' | 'rub' | 'surah' | 'page'> | 'ayah_range';
export type ScopeDecisionAuthority = 'organizer' | 'participant' | 'committee';
export type ParticipantScopeStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'locked' | 'superseded';

export interface ScopeSelectionPartition {
  id: string;
  label: string;
  labelArabic?: string;
  scope: QuranScope;
  minUnits?: number;
  maxUnits?: number;
}

/**
 * محرك قواعد الاختيار — عام بقصد، لا عشرات الأعلام لكل حالة.
 * كل لائحة جديدة تُعبَّر عنها بتهيئة هذه الحقول، لا بتعديل الكود.
 */
export interface ParticipantScopeSelectionRule {
  version: number;
  /** هل للمتسابق اختيار أصلًا؟ إن لا، فنطاق الفئة هو نطاقه ولا تُعرض عليه شاشة اختيار. */
  enabled: boolean;
  decidedBy: ScopeDecisionAuthority;
  selectionUnit: ScopeSelectionUnit;
  minUnits?: number;
  maxUnits?: number;
  exactUnits?: number;
  mustBeConsecutive?: boolean;
  maxSegments?: number;
  /** المظلّة المسموح الاختيار من داخلها. غالبًا نطاق الفئة نفسه. */
  parentScope?: QuranScope;
  /** جزء ثابت يدخل نطاق كل متسابق سواء اختاره أم لا. */
  requiredSegments?: QuranScopeSegment[];
  coverage?: { minAyah?: number; maxAyah?: number; minJuzEquivalent?: number; maxJuzEquivalent?: number };
  /** «X من النصف الأول + Y من النصف الثاني» وما شابهها. */
  partitions?: ScopeSelectionPartition[];
  approval: 'auto' | 'committee';
  noteArabic?: string;
  noteEnglish?: string;
}

export const DEFAULT_SELECTION_RULE: ParticipantScopeSelectionRule = {
  version: 1, enabled: false, decidedBy: 'organizer', selectionUnit: 'juz', approval: 'auto',
};

export interface ParticipantScopeRecord {
  id: string;
  organizationId: string;
  competitionId: string;
  categoryId: string;
  participantId: string;
  /** نسخة النطاق. أي تعديل بعد الاعتماد يرفعها، وكل نموذج أسئلة يسجّل النسخة التي بُني عليها. */
  version: number;
  status: ParticipantScopeStatus;
  /** ما اختاره المتسابق فعلًا (قبل إضافة المقاطع الإلزامية وقصّه على المظلّة). */
  selection: QuranScope;
  /** النطاق النهائي المطبَّع — هذا وحده مرجع السحب. */
  scope: QuranScope;
  scopeSignature: string;
  selectionRuleVersion: number;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  lockedAt?: string;
  supersededAt?: string;
  supersededByVersion?: number;
  changeReason?: string;
  /** حالة ترحيل البيانات القديمة: نطاقٌ مشتق بأمان، أو ينتظر تأكيد المنظم. */
  migrationStatus?: 'none' | 'derived_from_legacy' | 'needs_scope_confirmation';
}

export interface ScopeRuleIssue { code: string; ar: string; en: string; severity: 'error' | 'warning' | 'recommendation' }

/** عدد الوحدات المغطاة تغطيةً كاملة داخل النطاق. */
export function countScopeUnits(scope: QuranScope, unit: QuranScopeUnit): number {
  return coveredUnitIndexes(scope, unit).length;
}

export function coveredUnitIndexes(scope: QuranScope, unit: QuranScopeUnit): number[] {
  const ranges = scopeRanges(scope);
  if (!ranges.length) return [];
  const out: number[] = [];
  for (let index = 1; index <= unitTotal(unit); index++) {
    const bounds = unitBounds(unit, index);
    const from = ayahOrdinal(bounds.start), to = ayahOrdinal(bounds.end);
    if (ranges.some(([a, b]) => from >= a && to <= b)) out.push(index);
  }
  return out;
}

/** الوحدات التي يلمسها النطاق ولو جزئيًا — تكشف الاختيار الذي وقف في منتصف جزء. */
export function touchedUnitIndexes(scope: QuranScope, unit: QuranScopeUnit): number[] {
  const ranges = scopeRanges(scope);
  if (!ranges.length) return [];
  const out: number[] = [];
  for (let index = 1; index <= unitTotal(unit); index++) {
    const bounds = unitBounds(unit, index);
    const from = ayahOrdinal(bounds.start), to = ayahOrdinal(bounds.end);
    if (ranges.some(([a, b]) => from <= b && to >= a)) out.push(index);
  }
  return out;
}

function unitOfRule(rule: ParticipantScopeSelectionRule): QuranScopeUnit | null {
  return rule.selectionUnit === 'ayah_range' ? null : rule.selectionUnit;
}

/** كم «وحدة» يعدّها النظام في هذا الاختيار بحسب وحدة القاعدة. */
export function selectionUnitCount(rule: ParticipantScopeSelectionRule, scope: QuranScope): number {
  const unit = unitOfRule(rule);
  return unit ? countScopeUnits(scope, unit) : normalizeScope(scope).segments.length;
}

/**
 * النطاق النهائي = (اختيار المتسابق ∪ المقاطع الإلزامية) ∩ المظلّة المسموحة.
 * القصّ على المظلّة ليس تجميلًا: هو الحاجز الذي يمنع اختيارًا خاطئًا من توسيع النطاق.
 */
export function buildEffectiveScope(rule: ParticipantScopeSelectionRule, selection: QuranScope): QuranScope {
  const required = rule.requiredSegments?.length ? makeScope(rule.requiredSegments) : emptyScope();
  const combined = scopeUnion(normalizeScope(selection), required);
  const parent = rule.parentScope;
  return parent && scopeAyahCount(parent) > 0 ? scopeIntersect(combined, parent) : combined;
}

export function validateParticipantSelection(rule: ParticipantScopeSelectionRule, selection: QuranScope): ScopeRuleIssue[] {
  const issues: ScopeRuleIssue[] = [];
  const scope = normalizeScope(selection);
  for (const issue of validateScope(scope)) issues.push({ code: issue.code, ar: issue.ar, en: issue.en, severity: 'error' });
  if (!scope.segments.length) return issues;

  if (rule.parentScope && scopeAyahCount(rule.parentScope) > 0 && !isScopeSubsetOf(scope, rule.parentScope)) {
    issues.push({ code: 'SCOPE_OUTSIDE_PARENT', ar: 'الاختيار يخرج عن النطاق المسموح لهذه الفئة.', en: 'The selection falls outside the range this category allows.', severity: 'error' });
  }

  const unit = unitOfRule(rule);
  const count = selectionUnitCount(rule, scope);
  const unitLabel = unitLabelArabic(rule.selectionUnit, count);
  if (rule.exactUnits !== undefined && count !== rule.exactUnits) {
    issues.push({ code: 'SCOPE_UNIT_COUNT_EXACT', ar: `المطلوب ${rule.exactUnits} ${unitLabelArabic(rule.selectionUnit, rule.exactUnits)} بالضبط، والمختار ${count}.`, en: `Exactly ${rule.exactUnits} required; ${count} selected.`, severity: 'error' });
  }
  if (rule.minUnits !== undefined && count < rule.minUnits) {
    issues.push({ code: 'SCOPE_UNIT_COUNT_MIN', ar: `الحد الأدنى ${rule.minUnits} ${unitLabelArabic(rule.selectionUnit, rule.minUnits)}، والمختار ${count}.`, en: `At least ${rule.minUnits} required; ${count} selected.`, severity: 'error' });
  }
  if (rule.maxUnits !== undefined && count > rule.maxUnits) {
    issues.push({ code: 'SCOPE_UNIT_COUNT_MAX', ar: `الحد الأعلى ${rule.maxUnits} ${unitLabelArabic(rule.selectionUnit, rule.maxUnits)}، والمختار ${count}.`, en: `At most ${rule.maxUnits} allowed; ${count} selected.`, severity: 'error' });
  }
  if (unit && count < touchedUnitIndexes(scope, unit).length && rule.selectionUnit !== 'ayah_range') {
    issues.push({ code: 'SCOPE_PARTIAL_UNIT', ar: `الاختيار يغطي ${unitLabel} جزئيًا. راجع الحدود إن كانت اللائحة تشترط وحدات كاملة.`, en: 'The selection covers a unit only partially. Review the bounds if whole units are required.', severity: 'warning' });
  }

  const segments = scope.segments.length;
  if (rule.mustBeConsecutive && segments > 1) {
    issues.push({ code: 'SCOPE_NOT_CONSECUTIVE', ar: 'اللائحة تشترط نطاقًا متصلًا، والاختيار مقسوم إلى مقاطع منفصلة.', en: 'This category requires one continuous range; the selection is split.', severity: 'error' });
  }
  if (rule.maxSegments !== undefined && segments > rule.maxSegments) {
    issues.push({ code: 'SCOPE_TOO_MANY_SEGMENTS', ar: `الحد الأعلى ${rule.maxSegments} مقاطع، والمختار ${segments}.`, en: `At most ${rule.maxSegments} segments allowed; ${segments} selected.`, severity: 'error' });
  }

  const metrics = scopeMetrics(scope);
  const coverage = rule.coverage;
  if (coverage?.minAyah !== undefined && metrics.ayahCount < coverage.minAyah) issues.push({ code: 'SCOPE_COVERAGE_MIN_AYAH', ar: `النطاق ${metrics.ayahCount} آية والمطلوب ${coverage.minAyah} على الأقل.`, en: `Scope has ${metrics.ayahCount} ayat; at least ${coverage.minAyah} are required.`, severity: 'error' });
  if (coverage?.maxAyah !== undefined && metrics.ayahCount > coverage.maxAyah) issues.push({ code: 'SCOPE_COVERAGE_MAX_AYAH', ar: `النطاق ${metrics.ayahCount} آية والحد الأعلى ${coverage.maxAyah}.`, en: `Scope has ${metrics.ayahCount} ayat; the maximum is ${coverage.maxAyah}.`, severity: 'error' });
  if (coverage?.minJuzEquivalent !== undefined && metrics.juzEquivalent < coverage.minJuzEquivalent) issues.push({ code: 'SCOPE_COVERAGE_MIN_JUZ', ar: `حجم النطاق يعادل ${metrics.juzEquivalent} جزءًا والمطلوب ${coverage.minJuzEquivalent}.`, en: `Scope is ${metrics.juzEquivalent} juz-equivalent; ${coverage.minJuzEquivalent} required.`, severity: 'error' });
  if (coverage?.maxJuzEquivalent !== undefined && metrics.juzEquivalent > coverage.maxJuzEquivalent) issues.push({ code: 'SCOPE_COVERAGE_MAX_JUZ', ar: `حجم النطاق يعادل ${metrics.juzEquivalent} جزءًا والحد الأعلى ${coverage.maxJuzEquivalent}.`, en: `Scope is ${metrics.juzEquivalent} juz-equivalent; the maximum is ${coverage.maxJuzEquivalent}.`, severity: 'error' });

  for (const partition of rule.partitions || []) {
    const inside = scopeIntersect(scope, partition.scope);
    const partitionCount = unit ? countScopeUnits(inside, unit) : normalizeScope(inside).segments.length;
    if (partition.minUnits !== undefined && partitionCount < partition.minUnits) {
      issues.push({ code: 'SCOPE_PARTITION_MIN', ar: `${partition.labelArabic || partition.label}: المطلوب ${partition.minUnits} على الأقل، والمختار ${partitionCount}.`, en: `${partition.label}: at least ${partition.minUnits} required; ${partitionCount} selected.`, severity: 'error' });
    }
    if (partition.maxUnits !== undefined && partitionCount > partition.maxUnits) {
      issues.push({ code: 'SCOPE_PARTITION_MAX', ar: `${partition.labelArabic || partition.label}: الحد الأعلى ${partition.maxUnits}، والمختار ${partitionCount}.`, en: `${partition.label}: at most ${partition.maxUnits} allowed; ${partitionCount} selected.`, severity: 'error' });
    }
  }
  return issues;
}

export const selectionIsValid = (issues: ScopeRuleIssue[]) => !issues.some(x => x.severity === 'error');

export function unitLabelArabic(unit: ScopeSelectionUnit, count = 2): string {
  const two = count === 2, few = count >= 3 && count <= 10;
  switch (unit) {
    case 'juz': return two ? 'جزأين' : few ? 'أجزاء' : 'جزءًا';
    case 'hizb': return two ? 'حزبين' : few ? 'أحزاب' : 'حزبًا';
    case 'rub': return two ? 'ربعين' : few ? 'أرباع' : 'ربعًا';
    case 'surah': return two ? 'سورتين' : few ? 'سور' : 'سورة';
    case 'page': return two ? 'وجهين' : few ? 'أوجه' : 'وجهًا';
    case 'ayah_range': return two ? 'مقطعين' : few ? 'مقاطع' : 'مقطعًا';
  }
}

export function unitLabelEnglish(unit: ScopeSelectionUnit): string {
  return unit === 'ayah_range' ? 'range' : unit;
}

/** إنشاء سجل نطاق جديد أو نسخة تالية له. النسخة السابقة لا تُحذف — تُعلَّم superseded. */
export function nextScopeVersion(previous: ParticipantScopeRecord | undefined): number {
  return (previous?.version || 0) + 1;
}

export function buildParticipantScopeRecord(input: {
  id: string; organizationId: string; competitionId: string; categoryId: string; participantId: string;
  rule: ParticipantScopeSelectionRule; selection: QuranScope; version: number; status?: ParticipantScopeStatus;
  now?: string; changeReason?: string; migrationStatus?: ParticipantScopeRecord['migrationStatus'];
}): ParticipantScopeRecord {
  const now = input.now || new Date().toISOString();
  const scope = buildEffectiveScope(input.rule, input.selection);
  return {
    id: input.id,
    organizationId: input.organizationId,
    competitionId: input.competitionId,
    categoryId: input.categoryId,
    participantId: input.participantId,
    version: input.version,
    status: input.status || 'draft',
    selection: normalizeScope(input.selection),
    scope,
    scopeSignature: scopeSignature(scope),
    selectionRuleVersion: input.rule.version,
    createdAt: now,
    updatedAt: now,
    ...(input.changeReason ? { changeReason: input.changeReason } : {}),
    ...(input.migrationStatus ? { migrationStatus: input.migrationStatus } : {}),
  };
}

export const scopeRecordIsUsable = (record: ParticipantScopeRecord | undefined): record is ParticipantScopeRecord =>
  !!record && (record.status === 'approved' || record.status === 'locked') && scopeAyahCount(record.scope) > 0;

/** تجميع المتسابقين بحسب بصمة النطاق — أساس الأداء وتحليل الازدحام معًا. */
export function clusterByScope<T extends { scope: QuranScope }>(rows: T[]): Map<string, { signature: string; scope: QuranScope; members: T[] }> {
  const clusters = new Map<string, { signature: string; scope: QuranScope; members: T[] }>();
  for (const row of rows) {
    const key = scopeKey(row.scope);
    const existing = clusters.get(key);
    if (existing) existing.members.push(row);
    else clusters.set(key, { signature: scopeSignature(row.scope), scope: row.scope, members: [row] });
  }
  return clusters;
}
