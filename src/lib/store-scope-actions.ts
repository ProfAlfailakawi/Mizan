/*
 * إجراءات محرك النطاق — مفصولةً عن قشرة الخطّاف.
 *
 * كانت هذه الإجراءات تعيش داخل `useAppStore`، وهو خطّاف React لا يعمل في Node. فكان أدقّ
 * ما يقال عنها: «مغطّاةٌ بفحص المتصفح» — وفحصُ المتصفح يرى الشاشة لا الحالة، فلا يقول لك
 * ما صار في السجل بعد الرفض، ولا كم نموذجًا بطل بعد الحجر.
 *
 * فصارت مصنعًا يأخذ مضيفه: من أين يقرأ الحالة، وكيف يكتب في السجل، ومن يولّد المعرّفات،
 * ومتى يُعلم المشتركين. والمخزن أحدُ مضيفيه، والاختبار مضيفٌ آخر — والسلوك واحد، فما يُختبر
 * هنا هو ما يعمل هناك لا نسخةٌ منه.
 *
 * ولا منطق جديد هنا: هو النقل نفسه حرفًا بحرف، وتبديلُ ما كان يمسّ المخزن مباشرةً بنداءٍ
 * إلى المضيف.
 */

import type {
  Category, QuestionModelBatchRecord, QuestionQuarantineRecord, QuestionReservationRecord,
  ScopeEngineSealRecord, ScopeSimulationRecord,
} from '../types';
import type { AppStoreState } from './store-state';
import { getCompetitionPolicy } from './competition-config';
import { isLaunchDeployment } from './launch-state';
import { hashCanonical } from './trust-protocol';
import { buildExposureProfiles } from './exposure-risk';
import { applyQuarantine, claimReserveModel, generateModelBatch, recoverFromQuarantine } from './model-batch';
import { aggregateFairness, invalidateStaleModels } from './model-fairness';
import {
  buildParticipantScopeRecord, nextScopeVersion, selectionIsValid, validateParticipantSelection,
  type ParticipantScopeRecord, type ParticipantScopeSelectionRule,
} from './participant-scope';
import type { QuestionCandidate } from './question-engine';
import { blockedLocusKeys, expireReservations, reserveQuestions, transitionReservations } from './question-reservation';
import type { QuestionDistributionPlan } from './question-zones';
import {
  derivedLegacyJuzCount, describeScope, fullQuranScope, normalizeScope, scopeAyahCount,
  scopeSignature, validateScope, type QuranScope,
} from './quran-scope';
import { describeRepeatPolicy, type RepeatPolicy } from './repeat-policy';
import {
  buildCandidatePool, categoryDistribution, categoryRepeatPolicy, categoryScopeOf, categorySelectionRule,
  readingContextOf, resolveEffectiveScope, resolveQuestionCount, staleModels,
} from './scope-engine';
import { planCategoryMigration } from './scope-migration';
import { buildScopeReadiness } from './scope-readiness';

/** ما يحتاجه المحرك من مضيفه — ولا شيء غيره. */
export interface ScopeEngineHost {
  /** قراءة الحالة لحظةَ الاستعمال، لا لقطةً محفوظة: إجراءٌ يغيّر الحالة يراها التالي محدَّثة. */
  getState: () => AppStoreState;
  newId: (prefix: string) => string;
  notify: () => void;
  audit: (action: string, entityType: string, entityId: string, ar: string, en: string) => void;
  createIncident: (kind: string, title: string, description: string, severity: string) => void;
  markConfigChanged: () => void;
  queueScopeUpload: (record: ParticipantScopeRecord) => void;
}

export function createScopeEngineActions(host: ScopeEngineHost) {
  const S = host.getState;
  const newId = host.newId;

  const activeParticipantScope = (participantId: string) =>
    S().participantScopes.find(x => x.participantId === participantId && x.status !== 'superseded');

  /*
   * سجل نسخ نطاق المتسابق.
   *
   * النسخة السابقة كانت تُحفظ ولا تُعرض — وهذا حفظٌ بلا شهادة: «لا تغيير صامت بعد الاعتماد»
   * لا تتحقق بأن يكون التغيير مكتوبًا في التخزين، بل بأن يراه صاحبه واللجنة. فيُفتح السجل
   * كاملًا بنسخه وحالاتها وأسباب تغييرها ومن قرّرها.
   */
  const participantScopeHistory = (participantId: string) => S().participantScopes
    .filter(x => x.participantId === participantId
      && x.competitionId === S().competition.id
      && x.organizationId === S().competition.organizationId)
    .sort((a, b) => b.version - a.version);

  /* إبطال ما بُني على نسخة نطاق لم تعد سارية. لا تغيير صامت بعد الاعتماد. */
  const invalidateAffectedModels = (reason: string) => {
    const stale = staleModels(S().questionModels, S().participantScopes, S().competition.categories);
    if (!stale.length) return 0;
    const outcome = invalidateStaleModels({
      models: S().questionModels,
      currentScopeVersionOf: id => activeParticipantScope(id)?.version,
      currentCategoryScopeVersionOf: id => S().competition.categories.find(c => c.id === id)?.scopeVersion || 1,
    });
    S().questionModels = outcome.models;
    for (const model of outcome.invalidated) {
      host.audit('QUESTION_MODEL_INVALIDATED', 'QuestionModel', model.id,
        `إبطال نموذج أسئلة لأن نطاقه تغيّر (${reason}) — ${model.invalidationReason}`,
        `Invalidated a question model after a scope change (${reason}) — ${model.invalidationReason}`);
    }
    return outcome.invalidated.length;
  };

  const bumpCategory = (categoryId: string, patch: Partial<Category>, action: string, ar: string, en: string) => {
    const category = S().competition.categories.find(c => c.id === categoryId);
    if (!category) return { ok: false as const, reason: 'CATEGORY_NOT_FOUND' };
    S().competition = {
      ...S().competition,
      categories: S().competition.categories.map(c => c.id === categoryId ? { ...c, ...patch } : c),
    };
    host.audit(action, 'Category', categoryId, ar, en);
    const invalidated = invalidateAffectedModels(action);
    host.markConfigChanged(); host.notify();
    return { ok: true as const, invalidatedModels: invalidated };
  };

  /** تحديد نطاق الفئة. يرفع نسخة النطاق ويبطل ما بُني على النسخة السابقة. */
  const setCategoryScope = (categoryId: string, scope: QuranScope, options?: { mode?: Category['scopeMode']; reason?: string }) => {
    const category = S().competition.categories.find(c => c.id === categoryId);
    if (!category) return { ok: false as const, reason: 'CATEGORY_NOT_FOUND' };
    const issues = validateScope(scope);
    if (issues.length) return { ok: false as const, reason: 'SCOPE_INVALID', issues };
    const normalized = normalizeScope(scope);
    const version = (category.scopeVersion || 0) + 1;
    return bumpCategory(categoryId, {
      scope: normalized, scopeVersion: version, scopeMigration: 'none',
      ...(options?.mode ? { scopeMode: options.mode } : {}),
      // الحقول الموروثة تبقى مشتقةً للعرض، ولا يُسحب منها شيء.
      juzCount: derivedLegacyJuzCount(normalized),
      memorizationScope: describeScope(normalized, true),
    }, 'CATEGORY_SCOPE_SET',
      `تحديد نطاق الفئة: ${describeScope(normalized, true)} (النسخة ${version})${options?.reason ? ` — ${options.reason}` : ''}`,
      `Set category scope to ${describeScope(normalized, false)} (version ${version})`);
  };

  const setCategorySelectionRule = (categoryId: string, rule: ParticipantScopeSelectionRule) => {
    const current = S().competition.categories.find(c => c.id === categoryId);
    const next: ParticipantScopeSelectionRule = { ...rule, version: (current?.selectionRule?.version || 0) + 1 };
    return bumpCategory(categoryId, { selectionRule: next, scopeMode: next.enabled ? 'participant_selected' : 'fixed' },
      'CATEGORY_SELECTION_RULE_SET',
      next.enabled ? `تفعيل اختيار المتسابق لنطاقه بقواعد النسخة ${next.version}` : 'إلغاء اختيار المتسابق: نطاق الفئة ثابت للجميع',
      next.enabled ? `Enabled participant scope selection (rules v${next.version})` : 'Disabled participant scope selection; the category scope is fixed');
  };

  const setCategoryDistribution = (categoryId: string, plan: QuestionDistributionPlan) => {
    const current = S().competition.categories.find(c => c.id === categoryId);
    const next: QuestionDistributionPlan = { ...plan, version: (current?.distribution?.version || 0) + 1, updatedAt: new Date().toISOString() };
    return bumpCategory(categoryId, { distribution: next }, 'CATEGORY_DISTRIBUTION_SET',
      `ضبط توزيع الأسئلة (${next.mode}) بـ${next.zones.length} منطقة`,
      `Set question distribution (${next.mode}) with ${next.zones.length} zones`);
  };

  const setCategoryRepeatPolicy = (categoryId: string, policy: RepeatPolicy) => {
    const current = S().competition.categories.find(c => c.id === categoryId);
    const next: RepeatPolicy = { ...policy, version: (current?.repeatPolicy?.version || 0) + 1 };
    return bumpCategory(categoryId, { repeatPolicy: next }, 'CATEGORY_REPEAT_POLICY_SET',
      `ضبط سياسة التكرار: ${describeRepeatPolicy(next, true)}`,
      `Set repeat policy: ${describeRepeatPolicy(next, false)}`);
  };

  const setCategoryQuestionCount = (categoryId: string, count: number) =>
    bumpCategory(categoryId, { questionsCount: Math.max(1, Math.min(40, Math.round(count))) }, 'CATEGORY_QUESTION_COUNT_SET',
      `عدد أسئلة المتسابق في هذه الفئة: ${Math.max(1, Math.round(count))}`,
      `Questions per participant for this category: ${Math.max(1, Math.round(count))}`);

  /** خطة ترحيل الفئات القديمة. لا تُطبَّق شيئًا؛ تعرض ما يمكن اشتقاقه وما يحتاج قرار المنظم. */
  const categoryScopeMigrationPlan = () => planCategoryMigration(S().competition.categories);

  /*
   * لا مسار ثانٍ للترحيل.
   *
   * كان هنا `applyCategoryScopeMigration` يطبّق الاقتراح مباشرة — مسارٌ ثانٍ لما تفعله
   * الشاشة أصلًا وأحسن منه: تحمّل الاقتراح في المسودّة، فيراه المنظم ويعدّله ثم يحفظه عبر
   * `setCategoryScope` الذي يرفع النسخة ويبطل ما بُني على السابقة. وهو مسارٌ لم تستدعه
   * شاشةٌ ولا اختبار. ونظامان لعملٍ واحد يفترقان يومًا، فيُبقى على الذي يمرّ به الناس.
   */

  /** حفظ اختيار المتسابق لنطاقه. كل حفظ نسخة جديدة؛ السابقة تُعلَّم superseded ولا تُحذف. */
  const saveParticipantScope = (participantId: string, selection: QuranScope, options?: { submit?: boolean; reason?: string }) => {
    const participant = S().participants.find(p => p.id === participantId);
    if (!participant) return { ok: false as const, reason: 'PARTICIPANT_NOT_FOUND', issues: [] };
    const category = S().competition.categories.find(c => c.id === participant.categoryId);
    const rule = categorySelectionRule(category);
    /* الخام قبل التطبيع: موضعٌ مستحيل يُرفض مستحيلًا، ولا يُقصّ إلى آخر المصحف فيصير نطاقًا لم يُختَر. */
    const structural = validateScope(selection);
    if (structural.length) return { ok: false as const, reason: 'SCOPE_INVALID', issues: structural.map(x => ({ code: x.code, ar: x.ar, en: x.en, severity: 'error' as const })) };
    const issues = validateParticipantSelection(rule, selection);
    if (!selectionIsValid(issues)) return { ok: false as const, reason: 'SELECTION_INVALID', issues };
    const previous = activeParticipantScope(participantId);
    if (previous?.status === 'locked') return { ok: false as const, reason: 'SCOPE_LOCKED', issues };
    const now = new Date().toISOString();
    const record = buildParticipantScopeRecord({
      id: newId('pscope'), organizationId: S().competition.organizationId, competitionId: S().competition.id,
      categoryId: participant.categoryId, participantId, rule, selection, version: nextScopeVersion(previous),
      status: options?.submit ? (rule.approval === 'auto' ? 'approved' : 'submitted') : 'draft',
      now, changeReason: options?.reason,
    });
    if (record.status === 'approved') { record.approvedAt = now; record.approvedBy = 'auto_policy'; }
    if (options?.submit) record.submittedAt = now;
    S().participantScopes = [
      record,
      ...S().participantScopes.map(x => x.participantId === participantId && x.status !== 'superseded'
        ? { ...x, status: 'superseded' as const, supersededAt: now, supersededByVersion: record.version } : x),
    ];
    host.queueScopeUpload(record);
    host.audit('PARTICIPANT_SCOPE_SAVED', 'ParticipantScope', record.id,
      `حفظ نطاق المتسابق ${participant.code}: ${describeScope(record.scope, true)} (النسخة ${record.version}، الحالة ${record.status})`,
      `Saved participant ${participant.code} scope: ${describeScope(record.scope, false)} (v${record.version}, ${record.status})`);
    invalidateAffectedModels('PARTICIPANT_SCOPE_SAVED');
    host.notify();
    return { ok: true as const, record, issues };
  };

  const decideParticipantScope = (participantId: string, decision: 'approved' | 'rejected' | 'locked', reason?: string) => {
    const index = S().participantScopes.findIndex(x => x.participantId === participantId && x.status !== 'superseded');
    if (index < 0) return { ok: false as const, reason: 'SCOPE_NOT_FOUND' };
    const current = S().participantScopes[index];
    if (decision === 'rejected' && !reason?.trim()) return { ok: false as const, reason: 'REJECTION_REASON_REQUIRED' };
    const now = new Date().toISOString();
    const next: ParticipantScopeRecord = {
      ...current, status: decision, updatedAt: now,
      ...(decision === 'approved' ? { approvedAt: now, approvedBy: S().currentUser.id } : {}),
      ...(decision === 'rejected' ? { rejectedAt: now, rejectionReason: reason?.trim() } : {}),
      ...(decision === 'locked' ? { lockedAt: now } : {}),
    };
    S().participantScopes = S().participantScopes.map((x, i) => i === index ? next : x);
    host.queueScopeUpload(next);
    const participant = S().participants.find(p => p.id === participantId);
    host.audit('PARTICIPANT_SCOPE_DECIDED', 'ParticipantScope', next.id,
      `${decision === 'approved' ? 'اعتماد' : decision === 'rejected' ? 'رفض' : 'قفل'} نطاق المتسابق ${participant?.code || participantId}${reason ? ` — ${reason}` : ''}`,
      `${decision} participant scope for ${participant?.code || participantId}${reason ? ` — ${reason}` : ''}`);
    invalidateAffectedModels('PARTICIPANT_SCOPE_DECIDED');
    host.notify();
    return { ok: true as const, record: next };
  };

  const participantEffectiveScope = (participantId: string) => {
    const participant = S().participants.find(p => p.id === participantId);
    if (!participant) return null;
    return resolveEffectiveScope({
      participant,
      category: S().competition.categories.find(c => c.id === participant.categoryId),
      scopes: S().participantScopes,
      tenant: { organizationId: S().competition.organizationId, competitionId: S().competition.id },
    });
  };

  /*
   * مرشحو النطاق: البنك المعتمد متى وُجد، وإلا المواضع البنيوية لقياس السعة والمحاكاة.
   *
   * سياق القراءة يأتي من **المتسابق** لا من الفئة. فئةٌ مكتوب في روايتها «حفص / ورش / قالون»
   * لا تُحلّ إلى رواية واحدة — وهذا صحيح علميًا — فلو بُني بنكها على روايتها لخرج بلا سياق
   * قراءة، ثم رفضه المحرك لكل متسابق له رواية محددة، فيعود صفرًا بلا سبب ظاهر.
   */
  const scopeCandidatePool = (scope: QuranScope, categoryId?: string, reading?: ReturnType<typeof readingContextOf>) => {
    const category = S().competition.categories.find(c => c.id === categoryId);
    const pool = buildCandidatePool({ scope, category, reading: reading || readingContextOf({ riwaya: category?.riwaya }) });
    /* الموضع المحجور يخرج من البنك عند منبعه، فلا يصل إلى سحبٍ ولا إلى إحصاء سعة. */
    const quarantined = activeQuarantinedLoci();
    const clean = quarantined.size ? pool.filter(c => !quarantined.has(`${c.surahNumber}:${c.startAyah}`)) : pool;
    return enrichCandidates(clean);
  };

  /*
   * إثراء بيانات السؤال بما هو معروف فعلًا، لا بما يمكن تخمينه.
   *
   * ثلاثة حقول تُملأ من مصادر قائمة: عدد مرات الكشف (من سجل الانكشاف)، والأوجه المسموحة
   * (من مواضع الخلاف المعتمدة علميًا وحدها)، وكثافة المتشابه (من خريطة المتشابهات المعتمدة).
   * وما لا مصدر له يبقى فارغًا: الفراغ يقول «لم يُقرأ من مصدر»، والتخمين يقول «هذا هو» وهو
   * كذب. ولا يُبنى على أيٍّ من الثلاثة قرارُ أهلية — الأهلية بالآية وحدها.
   */
  const enrichCandidates = (candidates: QuestionCandidate[]): QuestionCandidate[] => {
    const exposure = exposureProfiles();
    const variants = S().variantLoci.filter(v => v.approvalState === 'CERTIFIED' && v.allowedWajh);
    const traps = S().mutashabihatTrapMaps.filter(t => t.status === 'APPROVED');
    if (!exposure.size && !variants.length && !traps.length) return candidates;
    const wujuhAt = new Map<string, string[]>();
    for (const variant of variants) {
      const key = `${variant.surah}:${variant.ayah}`;
      const list = wujuhAt.get(key) || [];
      if (variant.allowedWajh && !list.includes(variant.allowedWajh)) list.push(variant.allowedWajh);
      wujuhAt.set(key, list);
    }
    const trapAt = new Set(traps.map(t => `${t.expected.surah}:${t.expected.ayah}`));
    return candidates.map(candidate => {
      const key = `${candidate.surahNumber}:${candidate.startAyah}`;
      const revealed = exposure.get(key)?.reveals;
      const wujuh = wujuhAt.get(key);
      const trapped = trapAt.has(key);
      if (revealed === undefined && !wujuh && !trapped) return candidate;
      return {
        ...candidate,
        ...(revealed === undefined ? {} : { exposureCount: revealed }),
        ...(wujuh ? { allowedWujuh: wujuh } : {}),
        ...(trapped ? { mutashabihatScore: Math.max(candidate.mutashabihatScore || 0, 0.8) } : {}),
      };
    });
  };

  /** مفاتيح المواضع المحجورة حجرًا ساريًا في هذه المسابقة. */
  const activeQuarantinedLoci = () => new Set(
    S().questionQuarantines
      .filter(q => q.status === 'active' && q.competitionId === S().competition.id)
      .flatMap(q => q.locusKeys),
  );

  /* تجميع البنك بحسب (النطاق × سياق القراءة): لا يُبنى مرتين لعنقود واحد، ولا يُخلط بين روايتين. */
  const poolsForRows = (rows: { scope: QuranScope; categoryId: string; reading: ReturnType<typeof readingContextOf> }[]) => {
    const byKey = new Map<string, QuestionCandidate[]>();
    for (const row of rows) {
      const key = `${scopeSignature(row.scope)}|${row.reading.qiraahId || ''}|${row.reading.rawiId || ''}`;
      if (!byKey.has(key)) byKey.set(key, scopeCandidatePool(row.scope, row.categoryId, row.reading));
    }
    return [...new Map([...byKey.values()].flat().map(c => [c.id, c] as const)).values()];
  };

  /*
   * تحليل الازدحام والمحاكاة يُحمَّلان عند الطلب.
   *
   * لجنةُ تحكيمٍ في القاعة لا تحتاج محرّك المحاكاة في حزمتها الأولى، وميزان يَعِد بالعمل
   * عند انقطاع الشبكة — فكل كيلوبايت في الحزمة الأولى ثمنٌ يدفعه من لا ينتفع به.
   */
  const scopeDemandAnalysis = async () => {
    const { analyzeDemand } = await import('./scope-demand');
    const policy = getCompetitionPolicy(S().competition);
    const rows = S().participants
      .filter(p => !['rejected', 'draft'].includes(p.status))
      .map(p => {
        const resolution = participantEffectiveScope(p.id);
        const category = S().competition.categories.find(c => c.id === p.categoryId);
        return resolution && !resolution.blocked
          ? { participantId: p.id, categoryId: p.categoryId, scope: resolution.scope, questionCount: resolveQuestionCount(category, policy), reading: readingContextOf({ riwaya: p.riwaya }) }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    const unique = poolsForRows(rows.map(r => ({ scope: r.scope, categoryId: r.categoryId, reading: r.reading })));
    return analyzeDemand({ participants: rows.map(({ reading, ...rest }) => { void reading; return rest; }), candidates: unique });
  };

  const getScopeReadiness = () => {
    const policy = getCompetitionPolicy(S().competition);
    return buildScopeReadiness({
      categories: S().competition.categories,
      scopeOf: categoryScopeOf,
      participants: S().participants.map(p => ({ id: p.id, code: p.code, categoryId: p.categoryId, status: p.status })),
      participantScopes: S().participantScopes,
      candidatesFor: scope => scopeCandidatePool(scope),
      questionsPerParticipant: category => resolveQuestionCount(category, policy),
      repeatPolicyFor: category => categoryRepeatPolicy(category, policy),
      staleModelCount: staleModels(S().questionModels, S().participantScopes, S().competition.categories).length,
      activeQuarantines: S().questionQuarantines
        .filter(q => q.status === 'active' && q.competitionId === S().competition.id)
        .map(q => ({ locusCount: q.locusKeys.length, canContinue: q.canContinue, summaryAr: q.summaryArabic, summaryEn: q.summaryEnglish })),
      reserveModelCount: S().questionModels.filter(m => !m.participantId && m.status === 'draft' && m.competitionId === S().competition.id).length,
      escrowRequired: policy.questions.secureReveal?.requireParticipantPresence !== false,
      escrowReady: S().activeSession.secureQuestionMode === 'SERVER' || !isLaunchDeployment(),
      strictDifficultyRequired: S().competition.categories.some(c => c.requireReviewedDifficulty),
    });
  };

  /** محاكاة بالمحرك نفسه الذي يعمل يوم المسابقة. لا تمسّ بيانات التشغيل. */
  const runScopeSimulation = async (options?: { label?: string; participantCount?: number; questionCount?: number; poolMultiplier?: number; repeatMode?: RepeatPolicy['mode']; minimumParticipantGap?: number; seed?: string; syntheticOnly?: boolean }) => {
    const [{ runCompetitionTwin, syntheticParticipants }, { recommendPolicy }] = await Promise.all([import('./competition-twin'), import('./scope-demand')]);
    const policy = getCompetitionPolicy(S().competition);
    const seed = options?.seed || `${S().competition.id}:${Date.now()}`;
    const real = S().participants
      .filter(p => !['rejected', 'draft'].includes(p.status))
      .map(p => {
        const resolution = participantEffectiveScope(p.id);
        const category = S().competition.categories.find(c => c.id === p.categoryId);
        if (!resolution || resolution.blocked) return null;
        return {
          participantId: p.id, categoryId: p.categoryId, scope: resolution.scope,
          questionCount: options?.questionCount || resolveQuestionCount(category, policy),
          reading: readingContextOf({ riwaya: p.riwaya }),
          hallId: p.assignedCommitteeId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const target = options?.participantCount || real.length;
    const participants = real.length
      ? Array.from({ length: target }, (_, i) => ({ ...real[i % real.length], participantId: `${real[i % real.length].participantId}#${Math.floor(i / real.length)}` }))
      : syntheticParticipants({
          count: Math.max(1, target),
          categoryId: S().competition.categories[0]?.id || 'cat',
          questionCount: options?.questionCount || resolveQuestionCount(S().competition.categories[0], policy),
          scopes: S().competition.categories.length
            ? S().competition.categories.map(c => ({ scope: categoryScopeOf(c), share: 1 })).filter(x => scopeAyahCount(x.scope) > 0)
            : [{ scope: fullQuranScope(), share: 1 }],
          reading: readingContextOf({ riwaya: S().competition.categories[0]?.riwaya }),
        });
    /* محاكاة بلا سؤال واحد ناجح ليست محاكاة: يُقال ذلك صراحةً بدل تقرير أصفارٍ يبدو نظيفًا. */

    if (!participants.length) return { ok: false as const, reason: 'NO_PARTICIPANTS_TO_SIMULATE' };
    let candidates = poolsForRows(participants.map(p => ({ scope: p.scope, categoryId: p.categoryId, reading: p.reading || {} })));
    const multiplier = options?.poolMultiplier ?? 1;
    if (multiplier < 1) candidates = candidates.filter((_, i) => i % Math.max(1, Math.round(1 / multiplier)) === 0);

    const baseRepeat = categoryRepeatPolicy(S().competition.categories[0], policy);
    const result = runCompetitionTwin({
      competitionId: S().competition.id,
      participants, candidates,
      distributionPlanByCategory: Object.fromEntries(S().competition.categories.map(c => [c.id, categoryDistribution(c, resolveQuestionCount(c, policy))])),
      defaultPlan: categoryDistribution(S().competition.categories[0], options?.questionCount || policy.questions.questionsPerParticipant),
      repeatPolicy: { ...baseRepeat, ...(options?.repeatMode ? { mode: options.repeatMode } : {}), ...(options?.minimumParticipantGap !== undefined ? { minimumParticipantGap: options.minimumParticipantGap } : {}) },
      targetDifficulty: policy.questions.targetDifficulty,
      seed,
    });
    const record: ScopeSimulationRecord = {
      id: newId('sim'), organizationId: S().competition.organizationId, competitionId: S().competition.id,
      label: options?.label || `محاكاة ${participants.length} متسابقًا`,
      seed, participantCount: result.metrics.participants, draws: result.metrics.draws,
      metrics: result.metrics as unknown as Record<string, unknown>,
      clusters: result.perCluster,
      recommendations: recommendPolicy(result.demand, baseRepeat).map(x => ({ id: x.id, ar: x.ar, en: x.en, severity: x.severity })),
      createdBy: S().currentUser.id, createdAt: new Date().toISOString(), runtimeMs: result.runtimeMs,
      syntheticData: !real.length || target !== real.length,
    };
    S().scopeSimulations = [record, ...S().scopeSimulations].slice(0, 20);
    host.audit('SCOPE_SIMULATION_RUN', 'ScopeSimulation', record.id,
      `تشغيل محاكاة لـ${record.participantCount} متسابقًا و${record.draws} سحبة — خروقات النطاق ${result.metrics.scopeViolations}`,
      `Ran a simulation over ${record.participantCount} participants and ${record.draws} draws — scope violations ${result.metrics.scopeViolations}`);
    host.notify();
    return { ok: true as const, record, result };
  };

  /*
   * سؤال المِرصد الرياضي — خارج مسار السحب الحيّ قطعًا.
   *
   * ثلاثة أشياء تحفظ ذلك ولا يجوز التساهل في واحدٍ منها:
   *
   *   ١) الاستيراد ديناميكي، فلا يدخل الحلّال حزمةَ الشاشات التي تعمل يوم المسابقة.
   *   ٢) لا يُنادى إلا من زرٍّ يضغطه المنظّم في شاشة المختبر، ولا ينادى من محرّك ولا من سحبة.
   *   ٣) ميزانيةٌ معلنة للزمن والحجم؛ فإن كبرت المسألة رُدَّت باسمها ولم تُقرَّب.
   *
   * والمخرَج يُسمّى بأسمائه: أمثلٌ مُثبَت، أو أفضلُ معروف، أو استحالةٌ مُثبَتة بشاهد.
   */
  const runFairnessOracle = async (options?: { participantCount?: number; questionCount?: number; timeBudgetMs?: number; maxLoci?: number }) => {
    const [{ runOracleBenchmark, describeOracleStatus }, { syntheticParticipants }] = await Promise.all([
      import('./oracle-benchmark'), import('./competition-twin'),
    ]);
    const policy = getCompetitionPolicy(S().competition);
    const real = S().participants
      .filter(p => !['rejected', 'draft'].includes(p.status))
      .map(p => {
        const resolution = participantEffectiveScope(p.id);
        const category = S().competition.categories.find(c => c.id === p.categoryId);
        if (!resolution || resolution.blocked) return null;
        return {
          participantId: p.id, categoryId: p.categoryId, scope: resolution.scope,
          questionCount: options?.questionCount || resolveQuestionCount(category, policy),
          reading: readingContextOf({ riwaya: p.riwaya }),
          hallId: p.assignedCommitteeId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const target = options?.participantCount || real.length;
    const participants = real.length
      ? Array.from({ length: Math.max(1, target) }, (_, i) => ({ ...real[i % real.length], participantId: `${real[i % real.length].participantId}#${Math.floor(i / real.length)}` }))
      : syntheticParticipants({
          count: Math.max(1, target),
          categoryId: S().competition.categories[0]?.id || 'cat',
          questionCount: options?.questionCount || resolveQuestionCount(S().competition.categories[0], policy),
          scopes: S().competition.categories.length
            ? S().competition.categories.map(c => ({ scope: categoryScopeOf(c), share: 1 })).filter(x => scopeAyahCount(x.scope) > 0)
            : [{ scope: fullQuranScope(), share: 1 }],
          reading: readingContextOf({ riwaya: S().competition.categories[0]?.riwaya }),
        });
    if (!participants.length) return { ok: false as const, reason: 'NO_PARTICIPANTS_TO_ANALYSE' };

    const candidates = poolsForRows(participants.map(p => ({ scope: p.scope, categoryId: p.categoryId, reading: p.reading || {} })));
    if (!candidates.length) return { ok: false as const, reason: 'NO_ELIGIBLE_POOL' };
    /* حدُّ الحجم معلن: مسألةٌ أكبر منه تُردّ صراحةً، ولا يُدّعى لها أمثلٌ مقرَّب. */
    const maxLoci = options?.maxLoci ?? 4000;
    if (candidates.length > maxLoci) return { ok: false as const, reason: 'INSTANCE_TOO_LARGE', loci: candidates.length, maxLoci };

    const baseRepeat = categoryRepeatPolicy(S().competition.categories[0], policy);
    const result = runOracleBenchmark({
      competitionId: S().competition.id,
      participants, candidates,
      distributionPlanByCategory: Object.fromEntries(S().competition.categories.map(c => [c.id, categoryDistribution(c, resolveQuestionCount(c, policy))])),
      defaultPlan: categoryDistribution(S().competition.categories[0], options?.questionCount || policy.questions.questionsPerParticipant),
      repeatPolicy: baseRepeat,
      targetDifficulty: policy.questions.targetDifficulty,
      seed: `${S().competition.id}:oracle`,
      withRegret: true,
      budget: { timeBudgetMs: options?.timeBudgetMs ?? 20_000, maxEdges: 3_000_000 },
    });
    host.audit('FAIRNESS_ORACLE_RUN', 'ScopeSimulation', S().competition.id,
      `سؤال المِرصد الرياضي على ${participants.length} متسابقًا: ${describeOracleStatus(result.minMaxReuse)}`,
      `Asked the mathematical oracle over ${participants.length} participants: ${result.minMaxReuse.status}`);
    return { ok: true as const, result, headline: describeOracleStatus(result.minMaxReuse), syntheticData: !real.length };
  };

  /** أثر تغيير الإعداد بعد التجميد: من تأثر، وكم نموذجًا بطل، وهل تلزم إعادة المحاكاة. */
  const scopeSealImpact = () => {
    const seal = S().scopeEngineSeals.find(x => x.status === 'active');
    if (!seal) return { sealed: false as const, affectedParticipants: 0, invalidModels: 0, changedCategories: [] as string[], requiresResimulation: false };
    const changedCategories = S().competition.categories
      .filter(category => {
        const row = seal.categories.find(x => x.categoryId === category.id);
        return !row || row.scopeSignature !== scopeSignature(categoryScopeOf(category)) || (category.scopeVersion || 1) !== row.scopeVersion;
      })
      .map(c => c.nameArabic || c.name);
    const changedScopes = S().participantScopes.filter(record => {
      if (record.status === 'superseded') return false;
      const row = seal.participantScopeVersions.find(x => x.participantId === record.participantId);
      return !row || row.version !== record.version;
    });
    const invalid = staleModels(S().questionModels, S().participantScopes, S().competition.categories).length;
    return {
      sealed: true as const,
      sealedAt: seal.sealedAt,
      affectedParticipants: changedScopes.length,
      invalidModels: invalid,
      changedCategories,
      requiresResimulation: changedCategories.length > 0 || changedScopes.length > 0,
    };
  };

  const sealScopeEngine = async (reason?: string) => {
    const readiness = getScopeReadiness();
    if (!readiness.ready) return { ok: false as const, reason: 'READINESS_BLOCKED', checks: readiness.checks.filter(x => x.severity === 'critical') };
    const policy = getCompetitionPolicy(S().competition);
    const now = new Date().toISOString();
    const categories = S().competition.categories.map(category => ({
      categoryId: category.id,
      scopeSignature: scopeSignature(categoryScopeOf(category)),
      scopeVersion: category.scopeVersion || 1,
      selectionRuleVersion: category.selectionRule?.version || 0,
      distributionVersion: category.distribution?.version || 0,
      repeatPolicyVersion: category.repeatPolicy?.version || 0,
      questionsPerParticipant: resolveQuestionCount(category, policy),
    }));
    const participantScopeVersions = S().participantScopes
      .filter(x => x.status !== 'superseded')
      .map(x => ({ participantId: x.participantId, version: x.version, scopeSignature: x.scopeSignature }));
    const poolVersion = `STRUCTURAL:${categories.map(c => c.scopeSignature).join('|')}`;
    const sealHash = await hashCanonical({ categories, participantScopeVersions, poolVersion, policyVersion: policy.version });
    const seal: ScopeEngineSealRecord = {
      id: newId('scopeseal'), organizationId: S().competition.organizationId, competitionId: S().competition.id,
      sealedAt: now, sealedBy: S().currentUser.id, sealHash, categories, participantScopeVersions, poolVersion, status: 'active',
    };
    S().scopeEngineSeals = [seal, ...S().scopeEngineSeals.map(x => x.status === 'active'
      ? { ...x, status: 'superseded' as const, supersededAt: now, supersededReason: reason || 'تجميد جديد' } : x)];
    S().participantScopes = S().participantScopes.map(x => x.status === 'approved' ? { ...x, status: 'locked' as const, lockedAt: now } : x);
    host.audit('SCOPE_ENGINE_SEALED', 'ScopeEngineSeal', seal.id,
      `تجميد إعداد محرك النطاق: ${categories.length} فئة و${participantScopeVersions.length} نطاق متسابق${reason ? ` — ${reason}` : ''}`,
      `Sealed the scope engine configuration: ${categories.length} categories and ${participantScopeVersions.length} participant scopes`);
    host.notify();
    return { ok: true as const, seal };
  };

  /*
   * ---- الدفعات والاحتياط والحجر والتقرير -------------------------------------------------
   *
   * حتى الآن كان كل نموذج يُولَّد في لحظته (just_in_time). هذا يصلح لمسابقةٍ صغيرة، ولا
   * يصلح لمسابقةٍ تريد أن تراجع نماذجها قبل يومها، ولا لمسابقةٍ تريد احتياطًا جاهزًا إن
   * سقط سؤال. فهنا وضعان آخران: التوليد المسبق، والمختلط.
   */

  /*
   * مِرصد الانكشاف.
   *
   * الموضع الذي أُلقي في قاعةٍ فيها ثلاثون منتظرًا لم يعد مجهولًا لهم. فيُقاس نصف قطر
   * انكشافه — عدد من سمعه، ومدى البثّ، وكم مضى — ثم يدخل المحرك من بوابة الندرة نفسها،
   * لا من باب ثانٍ موازٍ، فيُفاضل به بدل أن يُمنع به منعًا أعمى.
   */
  const exposureEvents = () => {
    const committeeSize = (committeeId?: string) => {
      const committee = S().committees.find(c => c.id === committeeId);
      return committee ? Math.max(6, committee.judgeIds.length + 8) : 12;
    };
    return S().questionModels
      .filter(m => m.competitionId === S().competition.id && (m.status === 'consumed' || m.status === 'sealed') && !!m.participantId)
      .flatMap((model, order) => {
        const participant = S().participants.find(p => p.id === model.participantId);
        const hallId = participant?.assignedCommitteeId;
        return model.questions.map(q => ({
          locusKey: `${q.surahNumber}:${q.startAyah}`,
          hallId,
          audienceSize: committeeSize(hallId),
          broadcast: 'hall_only' as const,
          sequence: order,
          day: model.createdAt.slice(0, 10),
        }));
      });
  };

  /*
   * ملفات الانكشاف الحالية — تُعرض للمنظم وتُستهلك في المفاضلة.
   *
   * تُحسب مرة لكل حالة: بناء بنك عشرة آلاف متسابق يستدعيها لكل عنقود، وإعادة الحساب لكل
   * عنقود تضاعف زمن السحب بلا فائدة ما دام السجل لم يتغيّر.
   */
  let exposureMemo: { key: string; profiles: ReturnType<typeof buildExposureProfiles> } | null = null;
  const exposureProfiles = () => {
    const key = `${S().competition.id}:${S().questionModels.length}:${S().participants.length}`;
    if (exposureMemo?.key === key) return exposureMemo.profiles;
    const profiles = buildExposureProfiles(exposureEvents());
    exposureMemo = { key, profiles };
    return profiles;
  };

  /** المتسابقون الصالحون للتوليد في فئة، مع نطاق كلٍّ منهم وعدد أسئلته. */
  const batchRowsFor = (categoryId?: string) => {
    const policy = getCompetitionPolicy(S().competition);
    return S().participants
      .filter(p => !['rejected', 'draft'].includes(p.status))
      .filter(p => !categoryId || p.categoryId === categoryId)
      .map(p => {
        const resolution = participantEffectiveScope(p.id);
        const category = S().competition.categories.find(c => c.id === p.categoryId);
        if (!resolution || resolution.blocked) return null;
        return {
          participantId: p.id, categoryId: p.categoryId, scope: resolution.scope, scopeVersion: resolution.version,
          questionCount: resolveQuestionCount(category, policy),
          reading: readingContextOf({ riwaya: p.riwaya }),
          hallId: p.assignedCommitteeId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  };

  /**
   * توليد دفعة نماذج مسبقًا.
   *
   * بالمحرك نفسه وبالقيود نفسها التي تعمل يوم المسابقة — لا بمسار ثانٍ «للتجهيز». ولو
   * اختلف المساران لكان التجهيز كذبًا مهذّبًا.
   */
  const generateQuestionModelBatch = (options?: { categoryId?: string; reserveCount?: number; generationMode?: 'pre_generated' | 'hybrid'; seed?: string }) => {
    const rows = batchRowsFor(options?.categoryId);
    if (!rows.length) return { ok: false as const, reason: 'NO_ELIGIBLE_PARTICIPANTS' };
    const categoryId = options?.categoryId || rows[0].categoryId;
    const category = S().competition.categories.find(c => c.id === categoryId);
    const policy = getCompetitionPolicy(S().competition);
    const questionCount = resolveQuestionCount(category, policy);
    const candidates = poolsForRows(rows.map(r => ({ scope: r.scope, categoryId: r.categoryId, reading: r.reading })));
    if (!candidates.length) return { ok: false as const, reason: 'EMPTY_CANDIDATE_POOL' };
    const batchId = newId('qbatch');
    const outcome = generateModelBatch({
      batchId,
      organizationId: S().competition.organizationId,
      competitionId: S().competition.id,
      categoryId,
      categoryScopeVersion: category?.scopeVersion || 1,
      policyVersion: policy.version,
      poolVersion: `STRUCTURAL:${scopeSignature(categoryScopeOf(category))}`,
      participants: rows.map(r => ({ participantId: r.participantId, scope: r.scope, scopeVersion: r.scopeVersion, questionCount: r.questionCount, reading: r.reading, hallId: r.hallId })),
      candidates,
      distribution: categoryDistribution(category, questionCount),
      repeatPolicy: categoryRepeatPolicy(category, policy),
      targetDifficulty: policy.questions.targetDifficulty,
      difficultyTolerance: policy.questions.difficultyTolerance,
      seed: options?.seed || `${S().competition.id}:${categoryId}:${batchId}`,
      reserveCount: options?.reserveCount ?? 2,
      generationMode: options?.generationMode || 'pre_generated',
      requireReviewedDifficulty: !!category?.requireReviewedDifficulty,
      newId,
    });
    /* النماذج السابقة المسوّدة لهذه الفئة تُبطَل لا تُحذف: لا تاريخ يُمحى. */
    const now = new Date().toISOString();
    S().questionModels = [
      ...outcome.models, ...outcome.reserves,
      ...S().questionModels.map(m => m.categoryId === categoryId && m.batchId && m.batchId !== batchId && m.status !== 'consumed'
        ? { ...m, status: 'invalidated' as const, invalidatedAt: now, invalidationReason: `SUPERSEDED_BY_BATCH:${batchId}` } : m),
    ];
    S().questionModelBatches = [outcome.batch, ...S().questionModelBatches];
    host.audit('QUESTION_MODEL_BATCH_GENERATED', 'QuestionModelBatch', batchId,
      `توليد دفعة: ${outcome.models.length} نموذجًا و${outcome.reserves.length} احتياطيًا لفئة ${category?.nameArabic || categoryId}${outcome.failures.length ? ` — تعذّر ${outcome.failures.length}` : ''}`,
      `Generated a batch of ${outcome.models.length} models and ${outcome.reserves.length} reserves for category ${categoryId}${outcome.failures.length ? ` — ${outcome.failures.length} failures` : ''}`);
    host.notify();
    return { ok: true as const, ...outcome };
  };

  const decideModelBatch = (batchId: string, decision: 'approved' | 'sealed' | 'invalidated', reason?: string) => {
    const batch = S().questionModelBatches.find(b => b.id === batchId);
    if (!batch) return { ok: false as const, reason: 'BATCH_NOT_FOUND' };
    if (decision === 'approved' && batch.approvalState !== 'draft') return { ok: false as const, reason: 'BATCH_NOT_DRAFT' };
    if (decision === 'sealed' && batch.approvalState !== 'approved') return { ok: false as const, reason: 'BATCH_NOT_APPROVED' };
    const now = new Date().toISOString();
    const next: QuestionModelBatchRecord = {
      ...batch, approvalState: decision,
      ...(decision === 'approved' ? { approvedBy: S().currentUser.id, approvedAt: now } : {}),
      ...(decision === 'sealed' ? { sealedAt: now } : {}),
    };
    S().questionModelBatches = S().questionModelBatches.map(b => b.id === batchId ? next : b);
    if (decision === 'invalidated') {
      S().questionModels = S().questionModels.map(m => m.batchId === batchId && m.status !== 'consumed'
        ? { ...m, status: 'invalidated' as const, invalidatedAt: now, invalidationReason: `BATCH_INVALIDATED:${reason || 'قرار المنظم'}` } : m);
    }
    host.audit('QUESTION_MODEL_BATCH_DECIDED', 'QuestionModelBatch', batchId,
      `${decision === 'approved' ? 'اعتماد' : decision === 'sealed' ? 'ختم' : 'إبطال'} دفعة النماذج${reason ? ` — ${reason}` : ''}`,
      `${decision} question model batch${reason ? ` — ${reason}` : ''}`);
    host.notify();
    return { ok: true as const, batch: next };
  };

  /** النموذج المولَّد مسبقًا لمتسابق، إن وُجد صالحًا لنطاقه الساري. */
  const preGeneratedModelFor = (participantId: string) => {
    const resolution = participantEffectiveScope(participantId);
    if (!resolution || resolution.blocked) return null;
    const signature = resolution.signature || scopeSignature(resolution.scope);
    return S().questionModels.find(m =>
      m.participantId === participantId && m.competitionId === S().competition.id && m.status === 'sealed' && m.batchId
      && m.scopeSignature === signature && m.participantScopeVersion === resolution.version
      && S().questionModelBatches.find(b => b.id === m.batchId)?.approvalState === 'sealed') || null;
  };

  /** استدعاء نموذج احتياطي — بمطابقة بصمة النطاق، لا بالتقريب. */
  const claimReserveForParticipant = (participantId: string, reason: string) => {
    const resolution = participantEffectiveScope(participantId);
    if (!resolution || resolution.blocked) return { ok: false as const, reason: 'PARTICIPANT_SCOPE_UNAVAILABLE' };
    if (!reason?.trim()) return { ok: false as const, reason: 'REASON_REQUIRED' };
    /* الاحتياط من هذه المسابقة وهذه الجهة وحدها: نموذجٌ من مسابقةٍ أخرى ليس احتياطًا لهذه. */
    const reserves = S().questionModels.filter(m => !m.participantId && m.status === 'draft'
      && m.competitionId === S().competition.id && m.organizationId === S().competition.organizationId);
    const outcome = claimReserveModel({ reserves, participantId, scope: resolution.scope, scopeVersion: resolution.version, reason: reason.trim() });
    const claimed = outcome.model;
    if (!outcome.ok || !claimed) return { ok: false as const, reason: outcome.reason || 'NO_RESERVE_FOR_THIS_SCOPE' };
    S().questionModels = S().questionModels.map(m => m.id === claimed.id ? claimed : m);
    const participant = S().participants.find(p => p.id === participantId);
    host.audit('QUESTION_MODEL_RESERVE_CLAIMED', 'QuestionModel', claimed.id,
      `استدعاء نموذج احتياطي للمتسابق ${participant?.code || participantId} — ${reason.trim()}`,
      `Claimed a reserve question model for ${participant?.code || participantId} — ${reason.trim()}`);
    host.notify();
    return { ok: true as const, model: claimed, remaining: outcome.remaining.length };
  };

  /**
   * حجر مواضع.
   *
   * لا يُحذف سؤال ولا تاريخ. يُعلَّم الموضع محجورًا فيخرج من البنك عند منبعه، ويُبطل كل
   * نموذج يحمله، ويُقاس الأثر: كم متسابقًا، وكم بقي، وهل تستطيع المسابقة الاستمرار.
   */
  const quarantineQuestionLoci = (input: { locusKeys: string[]; reason: string; severity?: QuestionQuarantineRecord['severity']; questionIds?: string[] }) => {
    const keys = [...new Set(input.locusKeys.map(k => k.trim()).filter(Boolean))];
    if (!keys.length) return { ok: false as const, reason: 'NO_LOCI' };
    if (!input.reason?.trim()) return { ok: false as const, reason: 'REASON_REQUIRED' };
    const policy = getCompetitionPolicy(S().competition);
    const rows = batchRowsFor();
    const candidates = rows.length ? poolsForRows(rows.map(r => ({ scope: r.scope, categoryId: r.categoryId, reading: r.reading }))) : [];
    const requiredDraws = rows.reduce((sum, r) => sum + r.questionCount, 0) || policy.questions.questionsPerParticipant;
    const now = new Date().toISOString();
    const impact = applyQuarantine({
      locusKeys: keys, reason: input.reason.trim(),
      models: S().questionModels.filter(m => m.competitionId === S().competition.id),
      candidates, requiredDraws, now,
    });
    const invalidatedIds = new Set(impact.invalidatedModels.map(m => m.id));
    S().questionModels = S().questionModels.map(m => invalidatedIds.has(m.id) ? impact.invalidatedModels.find(x => x.id === m.id)! : m);
    /* الحجوزات القائمة على موضع محجور تُنقل إلى «محجور» فلا يصل الموضع إلى قاعة. */
    const heldOnQuarantined = S().questionReservations.filter(r => keys.includes(r.locusKey) && r.state !== 'quarantined').map(r => r.id);
    if (heldOnQuarantined.length) {
      S().questionReservations = transitionReservations({
        records: S().questionReservations, ids: heldOnQuarantined, to: 'quarantined',
        actorId: S().currentUser.id, reason: input.reason.trim(), now,
      }).records;
    }
    const record: QuestionQuarantineRecord = {
      id: newId('qquar'), organizationId: S().competition.organizationId, competitionId: S().competition.id,
      locusKeys: keys, questionIds: input.questionIds || [], reason: input.reason.trim(),
      raisedBy: S().currentUser.id, raisedAt: now, severity: input.severity || 'defect',
      invalidatedModelIds: [...invalidatedIds], affectedParticipantCount: impact.affectedParticipantIds.length,
      remainingUniqueLoci: impact.remainingUniqueLoci, averageReuseAfter: impact.averageReuseAfter,
      canContinue: impact.canContinue, summaryArabic: impact.summaryArabic, summaryEnglish: impact.summaryEnglish,
      status: 'active',
    };
    S().questionQuarantines = [record, ...S().questionQuarantines];
    host.audit('QUESTION_LOCI_QUARANTINED', 'QuestionQuarantine', record.id, record.summaryArabic, record.summaryEnglish);
    if (!impact.canContinue) host.createIncident('quran_source_discrepancy', 'الحجر أفرغ البنك', record.summaryArabic, 'critical');
    host.notify();
    return { ok: true as const, record, impact };
  };

  /**
   * الاسترداد الطارئ: خطوةٌ واحدة بدل أربع.
   *
   * الحجر وحده يترك المتأثرين بلا نماذج، والمنظم في القاعة لا يملك ترف تنفيذ أربع خطواتٍ
   * بيده. فهذا يحجر، ويبطل، ويعطي كل متأثرٍ احتياطَه إن وُجد لبصمة نطاقه، وإلا يولّد له من
   * البنك **بعد** الحجر. ومن لم يُسترد يُقال باسمه وبسببه: «عولج الأثر» ليست «عولج الجميع».
   */
  const recoverQuarantinedLoci = (input: { locusKeys: string[]; reason: string; severity?: QuestionQuarantineRecord['severity']; categoryId?: string }) => {
    const keys = [...new Set(input.locusKeys.map(k => k.trim()).filter(Boolean))];
    if (!keys.length) return { ok: false as const, reason: 'NO_LOCI' };
    if (!input.reason?.trim()) return { ok: false as const, reason: 'REASON_REQUIRED' };
    const policy = getCompetitionPolicy(S().competition);
    const rows = batchRowsFor(input.categoryId);
    if (!rows.length) return { ok: false as const, reason: 'NO_ELIGIBLE_PARTICIPANTS' };
    const categoryId = input.categoryId || rows[0].categoryId;
    const category = S().competition.categories.find(c => c.id === categoryId);
    const candidates = poolsForRows(rows.map(r => ({ scope: r.scope, categoryId: r.categoryId, reading: r.reading })));
    const now = new Date().toISOString();
    const outcome = recoverFromQuarantine({
      locusKeys: keys, reason: input.reason.trim(),
      models: S().questionModels.filter(m => m.competitionId === S().competition.id),
      candidates,
      participants: rows.map(r => ({ participantId: r.participantId, scope: r.scope, scopeVersion: r.scopeVersion, questionCount: r.questionCount, reading: r.reading, hallId: r.hallId })),
      distribution: categoryDistribution(category, resolveQuestionCount(category, policy)),
      repeatPolicy: categoryRepeatPolicy(category, policy),
      targetDifficulty: policy.questions.targetDifficulty,
      difficultyTolerance: policy.questions.difficultyTolerance,
      seed: `${S().competition.id}:${categoryId}:${now}`,
      organizationId: S().competition.organizationId,
      competitionId: S().competition.id,
      categoryId, categoryScopeVersion: category?.scopeVersion || 1,
      policyVersion: policy.version,
      poolVersion: `STRUCTURAL:${scopeSignature(categoryScopeOf(category))}`,
      requireReviewedDifficulty: !!category?.requireReviewedDifficulty,
      requiredDraws: rows.reduce((sum, r) => sum + r.questionCount, 0),
      now, newId,
    });
    /* نماذج المسابقات الأخرى تبقى كما هي: الاسترداد لا يمسّ ما ليس له. */
    const foreign = S().questionModels.filter(m => m.competitionId !== S().competition.id);
    S().questionModels = [...outcome.models, ...foreign];

    const heldOnQuarantined = S().questionReservations.filter(r => keys.includes(r.locusKey) && r.state !== 'quarantined').map(r => r.id);
    if (heldOnQuarantined.length) {
      S().questionReservations = transitionReservations({
        records: S().questionReservations, ids: heldOnQuarantined, to: 'quarantined',
        actorId: S().currentUser.id, reason: input.reason.trim(), now,
      }).records;
    }

    const record: QuestionQuarantineRecord = {
      id: newId('qquar'), organizationId: S().competition.organizationId, competitionId: S().competition.id,
      locusKeys: keys, questionIds: [], reason: input.reason.trim(),
      raisedBy: S().currentUser.id, raisedAt: now, severity: input.severity || 'defect',
      invalidatedModelIds: outcome.quarantine.invalidatedModels.map(m => m.id),
      affectedParticipantCount: outcome.quarantine.affectedParticipantIds.length,
      remainingUniqueLoci: outcome.quarantine.remainingUniqueLoci,
      averageReuseAfter: outcome.quarantine.averageReuseAfter,
      canContinue: outcome.quarantine.canContinue,
      summaryArabic: outcome.summaryArabic, summaryEnglish: outcome.summaryEnglish,
      status: 'active',
    };
    S().questionQuarantines = [record, ...S().questionQuarantines];
    host.audit('QUESTION_QUARANTINE_RECOVERED', 'QuestionQuarantine', record.id, outcome.summaryArabic, outcome.summaryEnglish);
    for (const row of outcome.unrecovered) {
      const participant = S().participants.find(p => p.id === row.participantId);
      host.createIncident('conflict_routing', 'متسابق بلا نموذج بعد الحجر',
        `${participant?.code || row.participantId}: ${row.ar}`, 'critical');
    }
    host.notify();
    return { ok: true as const, record, outcome };
  };

  const liftQuestionQuarantine = (quarantineId: string, reason: string) => {
    const record = S().questionQuarantines.find(q => q.id === quarantineId);
    if (!record) return { ok: false as const, reason: 'QUARANTINE_NOT_FOUND' };
    if (record.status === 'lifted') return { ok: false as const, reason: 'ALREADY_LIFTED' };
    if (!reason?.trim()) return { ok: false as const, reason: 'REASON_REQUIRED' };
    const now = new Date().toISOString();
    S().questionQuarantines = S().questionQuarantines.map(q => q.id === quarantineId
      ? { ...q, status: 'lifted' as const, liftedAt: now, liftedBy: S().currentUser.id, liftReason: reason.trim() } : q);
    /* رفع الحجر يعيد الموضع إلى البنك، ولا يعيد إحياء نموذج أُبطل: ذاك يُعاد توليده. */
    host.audit('QUESTION_QUARANTINE_LIFTED', 'QuestionQuarantine', quarantineId,
      `رفع حجر ${record.locusKeys.length} موضعًا — ${reason.trim()}؛ النماذج المبطلة لا تُحيا، تُعاد توليدًا.`,
      `Lifted quarantine on ${record.locusKeys.length} loci — ${reason.trim()}; invalidated models are regenerated, not revived.`);
    host.notify();
    return { ok: true as const };
  };

  /* ---- دورة حياة الحجز ---- */

  const reserveQuestionsForParticipant = (input: { participantId: string; items: { locusKey: string; questionId: string }[]; sessionId?: string; modelId?: string; ttlSeconds?: number; idempotencyKey?: string }) => {
    const expired = expireReservations(S().questionReservations, new Date().toISOString(), 'system');
    S().questionReservations = expired.records;
    const outcome = reserveQuestions({
      records: S().questionReservations,
      organizationId: S().competition.organizationId,
      competitionId: S().competition.id,
      items: input.items, participantId: input.participantId, sessionId: input.sessionId, modelId: input.modelId,
      idempotencyKey: input.idempotencyKey || `${S().competition.id}:${input.participantId}:${input.modelId || input.sessionId || 'draw'}`,
      actorId: S().currentUser.id, ttlSeconds: input.ttlSeconds, newId,
    });
    S().questionReservations = outcome.records;
    if (!outcome.replayed && outcome.created.length) {
      host.audit('QUESTION_RESERVATIONS_CREATED', 'QuestionReservation', outcome.created[0].id,
        `حجز ${outcome.created.length} موضعًا مؤقتًا${outcome.conflicts.length ? ` وتعذّر ${outcome.conflicts.length} لأن غيرهم يحجزها` : ''}`,
        `Reserved ${outcome.created.length} loci${outcome.conflicts.length ? `; ${outcome.conflicts.length} were held by others` : ''}`);
    }
    host.notify();
    return outcome;
  };

  const advanceReservations = (ids: string[], to: QuestionReservationRecord['state'], reason?: string) => {
    const outcome = transitionReservations({ records: S().questionReservations, ids, to, actorId: S().currentUser.id, reason });
    S().questionReservations = outcome.records;
    if (outcome.changed.length) {
      host.audit('QUESTION_RESERVATION_ADVANCED', 'QuestionReservation', outcome.changed[0].id,
        `نقل ${outcome.changed.length} حجزًا إلى «${to}»${reason ? ` — ${reason}` : ''}`,
        `Advanced ${outcome.changed.length} reservations to ${to}${reason ? ` — ${reason}` : ''}`);
    }
    host.notify();
    return outcome;
  };

  const sweepExpiredReservations = () => {
    const outcome = expireReservations(S().questionReservations, new Date().toISOString(), 'system');
    S().questionReservations = outcome.records;
    if (outcome.changed.length) {
      host.audit('QUESTION_RESERVATIONS_EXPIRED', 'QuestionReservation', outcome.changed[0].id,
        `انقضت مدة ${outcome.changed.length} حجزًا فعادت مواضعها إلى المخزون`,
        `${outcome.changed.length} reservations expired and their loci returned to the pool`);
      host.notify();
    }
    return outcome.changed.length;
  };

  const reservationBlockedLoci = (exceptParticipantId?: string) => blockedLocusKeys(S().questionReservations, new Date().toISOString(), exceptParticipantId);

  /**
   * تقرير عدالة وتوزيع الأسئلة.
   *
   * يُبنى من النماذج المعتمدة ومن تحليل الازدحام، ويُختم ببصمة تُعيد إنتاجه. وقبل أن يُحفظ
   * يُفحص فحصًا صريحًا: لا اسم متسابق ولا كوده فيه. التقرير عن الأسئلة لا عن الناس.
   */
  const buildCompetitionFairnessReport = async (options?: { categoryId?: string; batchId?: string; label?: string }) => {
    const [{ buildFairnessReport, fairnessReportPrivacyViolations }, { zoneAwareReuseLowerBound }] = await Promise.all([import('./fairness-report'), import('./scope-demand')]);
    const policy = getCompetitionPolicy(S().competition);
    const models = S().questionModels.filter(m =>
      m.competitionId === S().competition.id && m.status !== 'invalidated' && !!m.participantId
      && (!options?.categoryId || m.categoryId === options.categoryId)
      && (!options?.batchId || m.batchId === options.batchId));
    if (!models.length) return { ok: false as const, reason: 'NO_MODELS' };
    const demand = await scopeDemandAnalysis();
    const rows = batchRowsFor(options?.categoryId);
    const candidates = rows.length ? poolsForRows(rows.map(r => ({ scope: r.scope, categoryId: r.categoryId, reading: r.reading }))) : [];
    const lowerBound = demand.clusters.length && candidates.length ? zoneAwareReuseLowerBound({
      clusters: demand.clusters, candidates,
      planFor: categoryId => categoryDistribution(S().competition.categories.find(c => c.id === categoryId), resolveQuestionCount(S().competition.categories.find(c => c.id === categoryId), policy)),
      questionCountFor: cluster => resolveQuestionCount(S().competition.categories.find(c => c.id === cluster.categoryIds[0]), policy),
    }) : null;
    const category = S().competition.categories.find(c => c.id === options?.categoryId);
    const report = await buildFairnessReport({
      id: newId('fairrep'),
      organizationId: S().competition.organizationId,
      competitionId: S().competition.id,
      scope: options?.batchId ? 'batch' : options?.categoryId ? 'category' : 'competition',
      scopeRef: options?.batchId || options?.categoryId,
      titleSuffixArabic: options?.label || category?.nameArabic,
      models, aggregate: aggregateFairness(models), demand, lowerBound,
      /* الفشل المعلَن يدخل التقرير: نماذجُ ناجحةٌ وحدها تُخرج ورقةً نظيفة تُضلّل. */
      declaredFailures: S().questionModelBatches
        .filter(b => b.competitionId === S().competition.id
          && (!options?.batchId || b.id === options.batchId)
          && (!options?.categoryId || b.categoryId === options.categoryId)
          && b.approvalState !== 'invalidated')
        .flatMap(b => (b.declaredFailures || []).flatMap(f => Array.from({ length: f.count }, () => ({ code: f.code, ar: f.ar, en: f.en })))),
      repeatPolicy: categoryRepeatPolicy(category, policy),
      policyVersion: policy.version,
      generatedBy: S().currentUser.id,
    });
    /* حاجز الخصوصية: لو تسرّب اسم أو كود إلى نصّ التقرير لم يُحفظ ولم يُصدَّر. */
    const forbidden = S().participants.flatMap(p => [p.code, p.fullName, p.fullNameArabic].filter((x): x is string => !!x));
    const leaks = fairnessReportPrivacyViolations(report, forbidden);
    if (leaks.length) return { ok: false as const, reason: 'PRIVACY_VIOLATION', leaks };
    S().fairnessReports = [report, ...S().fairnessReports].slice(0, 20);
    host.audit('FAIRNESS_REPORT_BUILT', 'FairnessReport', report.id,
      `إصدار تقرير عدالة وتوزيع الأسئلة عن ${models.length} نموذجًا — بصمته ${report.reportHash.slice(0, 12)}`,
      `Issued a question fairness and distribution report over ${models.length} models — hash ${report.reportHash.slice(0, 12)}`);
    host.notify();
    return { ok: true as const, report };
  };

  return {
    activeParticipantScope, participantScopeHistory,
    setCategoryScope, setCategorySelectionRule, setCategoryDistribution, setCategoryRepeatPolicy,
    setCategoryQuestionCount, categoryScopeMigrationPlan,
    saveParticipantScope, decideParticipantScope, participantEffectiveScope,
    scopeCandidatePool, poolsForRows, scopeDemandAnalysis, getScopeReadiness, runScopeSimulation, runFairnessOracle,
    scopeSealImpact, sealScopeEngine,
    exposureProfiles, batchRowsFor,
    generateQuestionModelBatch, decideModelBatch, preGeneratedModelFor, claimReserveForParticipant,
    quarantineQuestionLoci, liftQuestionQuarantine, recoverQuarantinedLoci,
    reserveQuestionsForParticipant, advanceReservations, sweepExpiredReservations, reservationBlockedLoci,
    buildCompetitionFairnessReport,
    invalidateAffectedModels, activeQuarantinedLoci,
  };
}

export type ScopeEngineActions = ReturnType<typeof createScopeEngineActions>;
