/*
 * جاهزية محرك النطاق.
 *
 * الفحص هنا يسأل الأسئلة التي تُسقِط مسابقةً يوم تشغيلها: هل لكل فئة نطاق صالح؟ هل كل
 * متسابق يحتاج نطاقًا معتمدًا يملكه فعلًا؟ هل منطقةٌ خارج نطاقها؟ هل البنك يكفي لكل نطاق
 * على حدة — لا في مجموعه؟ هل نموذجٌ مبني على نسخة نطاق قديمة ما زال صالحًا؟
 *
 * والكفاية لا تُقاس بالمجموع: «البنك ألف سؤال إذًا كافٍ» جملةٌ خاطئة حين يكون سبعمئة منها
 * في نطاقٍ لا يختاره أحد.
 */

import { describeScope, isScopeSubsetOf, scopeAyahCount, type QuranScope } from './quran-scope';
import { validateScope } from './quran-scope';
import { validateDistributionPlan, zoneQuestionTotal, type QuestionDistributionPlan } from './question-zones';
import { scopeRecordIsUsable, type ParticipantScopeRecord } from './participant-scope';
import { theoreticalRepeatFloor, type RepeatPolicy } from './repeat-policy';
import { candidatesInScope, uniqueLocusCount, type QuestionCandidate } from './question-engine';
import type { Category } from '../types';

export type ScopeCheckSeverity = 'critical' | 'warning' | 'recommendation' | 'passed';
export type ScopeCheckFix = 'category_scope' | 'selection_rules' | 'zones' | 'question_policy' | 'participant_scopes' | 'pool' | 'models' | 'seal' | 'none';

export interface ScopeReadinessCheck {
  id: string;
  severity: ScopeCheckSeverity;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  fix: ScopeCheckFix;
  categoryId?: string;
}

export interface ScopeReadinessInput {
  categories: Category[];
  /**
   * كيف يُقرأ نطاق الفئة. يمرّر المخزن الدالة نفسها التي يستعملها السحب، فلا تختلف شاشة
   * الجاهزية عن الواقع: ما يراه المحرك نطاقًا صالحًا يراه الفحص كذلك.
   */
  scopeOf?: (category: Category) => QuranScope;
  participants: { id: string; code: string; categoryId: string; status: string }[];
  participantScopes: ParticipantScopeRecord[];
  candidatesFor: (scope: QuranScope) => QuestionCandidate[];
  questionsPerParticipant: (category: Category) => number;
  repeatPolicyFor: (category: Category) => RepeatPolicy;
  staleModelCount?: number;
  /*
   * حالة الحجر والاحتياط.
   *
   * حجرٌ أفرغ البنك يمنع المسابقة، وغيابُ احتياطٍ لا يمنعها لكنه يجعل سقوط سؤالٍ واحدٍ
   * توقفًا في القاعة. فيُقال الأول حاسمًا والثاني توصيةً، ولا يُخلط بينهما.
   */
  activeQuarantines?: { locusCount: number; canContinue: boolean; summaryAr: string; summaryEn: string }[];
  reserveModelCount?: number;
  sealed?: boolean;
  escrowRequired?: boolean;
  escrowReady?: boolean;
  sourceCertified?: boolean;
  strictDifficultyRequired?: boolean;
}

const pass = (id: string, titleAr: string, titleEn: string, detailAr: string, detailEn: string): ScopeReadinessCheck =>
  ({ id, severity: 'passed', titleAr, titleEn, detailAr, detailEn, fix: 'none' });

export function buildScopeReadiness(input: ScopeReadinessInput): { checks: ScopeReadinessCheck[]; critical: number; warning: number; passed: number; ready: boolean } {
  const checks: ScopeReadinessCheck[] = [];
  const activeParticipants = input.participants.filter(p => !['rejected', 'draft'].includes(p.status));
  const scopeOf = input.scopeOf || ((category: Category) => category.scope || { version: 1 as const, segments: [], assurance: 'CANONICAL_TABLE' as const });

  // ١ — نطاق كل فئة
  const withoutScope = input.categories.filter(c => { const scope = scopeOf(c); return scopeAyahCount(scope) === 0 || validateScope(scope).length > 0; });
  /* نطاقٌ مشتق من بيانات قديمة اشتقاقًا قاطعًا صالحٌ للتشغيل، لكنه يستحق اعتمادًا صريحًا. */
  const unconfirmed = input.categories.filter(c => (!c.scope || scopeAyahCount(c.scope) === 0) && scopeAyahCount(scopeOf(c)) > 0);
  checks.push(withoutScope.length
    ? { id: 'category_scope', severity: 'critical', titleAr: 'نطاق الفئات', titleEn: 'Category scopes', fix: 'category_scope',
        detailAr: `${withoutScope.length} فئة بلا نطاق صالح: ${withoutScope.map(c => c.nameArabic || c.name).join('، ')}. لا يمكن سحب سؤال لفئة لا يعرف النظام حدودها.`,
        detailEn: `${withoutScope.length} categories have no valid scope: ${withoutScope.map(c => c.name).join(', ')}. A question cannot be drawn for a category with undefined bounds.`,
        categoryId: withoutScope[0]?.id }
    : unconfirmed.length
      ? { id: 'category_scope', severity: 'warning', titleAr: 'نطاق الفئات', titleEn: 'Category scopes', fix: 'category_scope',
          detailAr: `${unconfirmed.length} فئة نطاقها مشتق من بياناتها القديمة اشتقاقًا واضحًا (${unconfirmed.map(c => c.nameArabic || c.name).join('، ')}). التشغيل ممكن، ويُنصح باعتماد النطاق صراحة حتى يُثبَّت في التجميد.`,
          detailEn: `${unconfirmed.length} categories run on a scope derived from their legacy fields. This works, but confirming it explicitly pins it into the freeze.`,
          categoryId: unconfirmed[0]?.id }
      : pass('category_scope', 'نطاق الفئات', 'Category scopes', 'كل فئة تملك نطاقًا قرآنيًا صالحًا ومطبَّعًا.', 'Every category has a valid, normalized Quran scope.'));

  // ٢ — نطاق المتسابق حين تشترطه الفئة
  const selectable = input.categories.filter(c => c.scopeMode === 'participant_selected' && c.selectionRule?.enabled);
  const missingScope: string[] = [], invalidScope: string[] = [];
  for (const category of selectable) {
    const members = activeParticipants.filter(p => p.categoryId === category.id);
    for (const participant of members) {
      const record = input.participantScopes.find(r => r.participantId === participant.id && r.status !== 'superseded');
      if (!scopeRecordIsUsable(record)) { missingScope.push(participant.code); continue; }
      const parent = category.selectionRule?.parentScope || scopeOf(category);
      if (parent && scopeAyahCount(parent) > 0 && !isScopeSubsetOf(record.scope, parent)) invalidScope.push(participant.code);
    }
  }
  checks.push(missingScope.length
    ? { id: 'participant_scope', severity: 'critical', titleAr: 'نطاق المتسابقين', titleEn: 'Participant scopes', fix: 'participant_scopes',
        detailAr: `${missingScope.length} متسابقًا في فئة اختيارية بلا نطاق معتمد (${missingScope.slice(0, 5).join('، ')}${missingScope.length > 5 ? '…' : ''}). نطاق الحفظ المعتمد لهؤلاء يحتاج مراجعة قبل التشغيل.`,
        detailEn: `${missingScope.length} participants in selectable categories have no approved scope (${missingScope.slice(0, 5).join(', ')}${missingScope.length > 5 ? '…' : ''}).` }
    : pass('participant_scope', 'نطاق المتسابقين', 'Participant scopes', 'كل متسابق في فئة اختيارية يملك نطاقًا معتمدًا.', 'Every participant in a selectable category has an approved scope.'));
  if (invalidScope.length) {
    checks.push({ id: 'participant_scope_bounds', severity: 'critical', titleAr: 'نطاقات خارج المسموح', titleEn: 'Scopes outside the allowed range', fix: 'participant_scopes',
      detailAr: `${invalidScope.length} نطاقًا معتمدًا يخرج عن نطاق فئته: ${invalidScope.slice(0, 5).join('، ')}.`,
      detailEn: `${invalidScope.length} approved scopes fall outside their category range: ${invalidScope.slice(0, 5).join(', ')}.` });
  }

  // ٣ — المناطق داخل النطاق ومجموعها مطابق لعدد الأسئلة
  const zoneIssues: string[] = [];
  for (const category of input.categories) {
    const plan = category.distribution;
    if (!plan || plan.mode === 'free' || plan.mode === 'auto_balanced') continue;
    const issues = validateDistributionPlan(plan, scopeOf(category), input.questionsPerParticipant(category));
    for (const issue of issues.filter(x => x.severity === 'error')) zoneIssues.push(`${category.nameArabic || category.name}: ${issue.ar}`);
  }
  checks.push(zoneIssues.length
    ? { id: 'zones', severity: 'critical', titleAr: 'مناطق التوزيع', titleEn: 'Distribution zones', fix: 'zones', detailAr: zoneIssues.slice(0, 4).join(' · '), detailEn: `${zoneIssues.length} zone configuration errors.` }
    : pass('zones', 'مناطق التوزيع', 'Distribution zones', 'كل منطقة داخل نطاق فئتها، ومجموع أسئلتها مطابق لعدد أسئلة المتسابق.', 'Every zone sits inside its category scope and the counts match.'));

  // ٤ — عدد الأسئلة
  const zeroQuestions = input.categories.filter(c => input.questionsPerParticipant(c) < 1);
  checks.push(zeroQuestions.length
    ? { id: 'question_count', severity: 'critical', titleAr: 'عدد الأسئلة', titleEn: 'Question count', fix: 'question_policy',
        detailAr: `${zeroQuestions.length} فئة بلا أسئلة. لا تُشغَّل جلسة بلا سؤال واحد على الأقل.`, detailEn: `${zeroQuestions.length} categories have no questions configured.` }
    : pass('question_count', 'عدد الأسئلة', 'Question count', 'كل فئة تحدد عدد أسئلة المتسابق بوضوح.', 'Every category defines its question count.'));

  // ٥ — كفاية البنك لكل نطاق على حدة
  const shortfalls: { label: string; required: number; available: number; strict: boolean }[] = [];
  for (const category of input.categories) {
    const categoryScope = scopeOf(category);
    if (scopeAyahCount(categoryScope) === 0) continue;
    const policy = input.repeatPolicyFor(category);
    const questionCount = input.questionsPerParticipant(category);
    const scopes = new Map<string, { scope: QuranScope; participants: number }>();
    const members = activeParticipants.filter(p => p.categoryId === category.id);
    for (const participant of members) {
      const record = input.participantScopes.find(r => r.participantId === participant.id && r.status !== 'superseded');
      const scope = scopeRecordIsUsable(record) ? record.scope : categoryScope;
      const key = describeScope(scope, false);
      const existing = scopes.get(key);
      if (existing) existing.participants++; else scopes.set(key, { scope, participants: 1 });
    }
    if (!scopes.size) scopes.set('category', { scope: categoryScope, participants: Math.max(1, category.targetParticipants || 1) });
    for (const [, entry] of scopes) {
      const supply = uniqueLocusCount(candidatesInScope(input.candidatesFor(entry.scope), entry.scope));
      const required = entry.participants * questionCount;
      const floor = theoreticalRepeatFloor({ draws: required, uniqueLoci: supply });
      if (!supply) shortfalls.push({ label: `${category.nameArabic || category.name} · ${describeScope(entry.scope, true)}`, required, available: 0, strict: true });
      else if (policy.mode === 'strict_no_repeat' && !floor.feasibleWithoutRepeat) shortfalls.push({ label: `${category.nameArabic || category.name} · ${describeScope(entry.scope, true)}`, required, available: supply, strict: true });
      else if (floor.averageReuse > 12) shortfalls.push({ label: `${category.nameArabic || category.name} · ${describeScope(entry.scope, true)}`, required, available: supply, strict: false });
    }
  }
  const hardShortfalls = shortfalls.filter(x => x.strict);
  checks.push(hardShortfalls.length
    ? { id: 'pool_sufficiency', severity: 'critical', titleAr: 'كفاية بنك الأسئلة', titleEn: 'Question pool sufficiency', fix: 'pool',
        detailAr: hardShortfalls.slice(0, 3).map(x => `${x.label}: مطلوب ${x.required} ومتوفر ${x.available}`).join(' · ') + '. سياسة عدم التكرار الصارمة لا يمكن تحقيقها بهذا البنك.',
        detailEn: hardShortfalls.slice(0, 3).map(x => `${x.label}: ${x.required} required, ${x.available} available`).join(' · ') }
    : shortfalls.length
      ? { id: 'pool_sufficiency', severity: 'warning', titleAr: 'كفاية بنك الأسئلة', titleEn: 'Question pool sufficiency', fix: 'pool',
          detailAr: shortfalls.slice(0, 3).map(x => `${x.label}: ${x.required} سحبة على ${x.available} موضعًا`).join(' · ') + '. التكرار حتمي وسيوزَّع بأقل قدر ممكن.',
          detailEn: shortfalls.slice(0, 3).map(x => `${x.label}: ${x.required} draws over ${x.available} loci`).join(' · ') }
      : pass('pool_sufficiency', 'كفاية بنك الأسئلة', 'Question pool sufficiency', 'البنك يكفي كل نطاق على حدة، لا في مجموعه فقط.', 'The pool is sufficient per scope, not only in aggregate.'));

  // ٦ — النماذج المبنية على نسخة نطاق قديمة
  checks.push(input.staleModelCount
    ? { id: 'stale_models', severity: 'critical', titleAr: 'نماذج على نطاق قديم', titleEn: 'Models on a stale scope', fix: 'models',
        detailAr: `${input.staleModelCount} نموذجًا بُني على نسخة نطاق لم تعد سارية. يجب إبطاله وإعادة توليده.`,
        detailEn: `${input.staleModelCount} models were built on a scope version that no longer applies.` }
    : pass('stale_models', 'نماذج على نطاق قديم', 'Models on a stale scope', 'لا يوجد نموذج مبني على نسخة نطاق منتهية.', 'No model references a superseded scope version.'));

  // ٧ — القراءة والمصدر
  if (input.sourceCertified === false) {
    checks.push({ id: 'source_certified', severity: 'critical', titleAr: 'اعتماد المصدر القرآني', titleEn: 'Quran source certification', fix: 'pool',
      detailAr: 'لا يوجد مصدر قرآني معتمد مطابق لرواية هذه المسابقة.', detailEn: 'No certified Quran source matches this competition reading.' });
  } else if (input.sourceCertified) {
    checks.push(pass('source_certified', 'اعتماد المصدر القرآني', 'Quran source certification', 'المصدر القرآني معتمد ومطابق للرواية.', 'The Quran source is certified and matches the reading.'));
  }

  if (input.strictDifficultyRequired) {
    const unreviewed = input.categories.filter(category => {
      const scope = scopeOf(category);
      if (scopeAyahCount(scope) === 0) return false;
      const pool = input.candidatesFor(scope);
      return pool.length > 0 && !pool.some(c => c.difficultyAssurance === 'human_reviewed' || c.difficultyAssurance === 'scientifically_approved');
    });
    checks.push(unreviewed.length
      ? { id: 'difficulty_review', severity: 'critical', titleAr: 'مراجعة الصعوبة', titleEn: 'Difficulty review', fix: 'pool',
          detailAr: `${unreviewed.length} فئة تعمل بوضع صارم ولا تملك مواضع مراجَعة علميًا.`, detailEn: `${unreviewed.length} categories run in strict mode with no scientifically reviewed loci.` }
      : pass('difficulty_review', 'مراجعة الصعوبة', 'Difficulty review', 'المواضع المستعملة تحمل تقييم صعوبة مراجَعًا.', 'Used loci carry reviewed difficulty ratings.'));
  }

  /* ١٠ — الحجر: هل أبقى ما يكفي؟ */
  const quarantines = input.activeQuarantines || [];
  const blocking = quarantines.filter(q => !q.canContinue);
  if (quarantines.length) {
    checks.push(blocking.length
      ? { id: 'quarantine', severity: 'critical', titleAr: 'أثر الحجر', titleEn: 'Quarantine impact', fix: 'pool',
          detailAr: blocking[0].summaryAr, detailEn: blocking[0].summaryEn }
      : { id: 'quarantine', severity: 'warning', titleAr: 'أثر الحجر', titleEn: 'Quarantine impact', fix: 'pool',
          detailAr: `${quarantines.length} حجرًا ساريًا يُخرج ${quarantines.reduce((sum, q) => sum + q.locusCount, 0)} موضعًا من البنك. البنك ما زال كافيًا، والنماذج المبطلة تُعاد توليدًا.`,
          detailEn: `${quarantines.length} active quarantines remove ${quarantines.reduce((sum, q) => sum + q.locusCount, 0)} loci. The pool still suffices; invalidated models are regenerated.` });
  }

  /* ١١ — الاحتياط: ماذا لو سقط سؤال؟ */
  if (input.reserveModelCount !== undefined) {
    checks.push(input.reserveModelCount > 0
      ? pass('reserve_models', 'النماذج الاحتياطية', 'Reserve models', `${input.reserveModelCount} نموذجًا احتياطيًا جاهزًا، مولَّدًا بالمحرك نفسه ومربوطًا ببصمة نطاقه.`, `${input.reserveModelCount} reserve models are ready, engine-generated and bound to their range signature.`)
      : { id: 'reserve_models', severity: 'recommendation', titleAr: 'النماذج الاحتياطية', titleEn: 'Reserve models', fix: 'models',
          detailAr: 'لا نموذج احتياطي جاهز. لو سقط سؤال يوم المسابقة فلا بديل مولَّدًا بالمحرك نفسه، ويصير الخيار انتظارًا أو اختيارًا بشريًا.',
          detailEn: 'No reserve model is ready. If a question drops on the day there is no engine-generated substitute, leaving a wait or a human pick.' });
  }

  if (input.escrowRequired) {
    checks.push(input.escrowReady
      ? pass('escrow', 'حجز السؤال على الخادم', 'Server-held question escrow', 'نص السؤال محجوز على الخادم حتى اكتمال النصاب.', 'Question plaintext stays server-held until quorum.')
      : { id: 'escrow', severity: 'critical', titleAr: 'حجز السؤال على الخادم', titleEn: 'Server-held question escrow', fix: 'seal',
          detailAr: 'اللائحة تشترط حجز السؤال خارج جهاز المحكم، والخزنة الخادمية غير مهيأة.', detailEn: 'Policy requires server-held escrow but it is not configured.' });
  }

  const critical = checks.filter(x => x.severity === 'critical').length;
  const warning = checks.filter(x => x.severity === 'warning').length;
  const passed = checks.filter(x => x.severity === 'passed').length;
  return { checks, critical, warning, passed, ready: critical === 0 };
}
