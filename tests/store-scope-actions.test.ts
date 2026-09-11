import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopeEngineActions, type ScopeEngineHost } from '../src/lib/store-scope-actions';
import type { AppStoreState } from '../src/lib/store-state';
import type { Category, Participant } from '../src/types';
import { DEFAULT_SELECTION_RULE, buildParticipantScopeRecord } from '../src/lib/participant-scope';
import { fullQuranScope, scopeAyahCount, scopeFromJuz, scopeSignature } from '../src/lib/quran-scope';
import { SEED_COMPETITION, SEED_PARTICIPANTS } from '../src/lib/seed-data';

/*
 * السلوك يُختبر هنا لا في المتصفح.
 *
 * كانت هذه الإجراءات داخل خطّاف React، فأصدقُ ما يقال عنها «مغطّاةٌ بفحص المتصفح» — وفحصُ
 * المتصفح يرى الشاشة لا الحالة: لا يقول ما صار في السجل بعد الرفض، ولا كم نموذجًا بطل بعد
 * الحجر، ولا هل بقيت النسخة السابقة أم حُذفت. والمضيف هنا مزيّف والإجراءات هي هي.
 */

let ids = 0;
interface Harness { state: AppStoreState; audits: { action: string; ar: string }[]; incidents: { title: string; description: string }[]; uploads: string[]; notifies: number; actions: ReturnType<typeof createScopeEngineActions> }

const selectableCategory = (): Category => ({
  id: 'cat-q', competitionId: SEED_COMPETITION.id, code: 'Q', name: 'Quarter', nameArabic: 'الربع',
  description: '', riwaya: 'حفص عن عاصم', memorizationScope: '', juzCount: 0,
  targetParticipants: 20, targetDurationMinutes: 8, questionsCount: 3,
  scope: fullQuranScope(), scopeMode: 'participant_selected', scopeVersion: 1,
  selectionRule: { ...DEFAULT_SELECTION_RULE, version: 1, enabled: true, decidedBy: 'participant', selectionUnit: 'juz', exactUnits: 8, parentScope: fullQuranScope(), approval: 'committee' },
});

const participant = (id: string, categoryId: string): Participant =>
  ({ ...SEED_PARTICIPANTS[0], id, code: id.toUpperCase(), categoryId, riwaya: 'Hafs', status: 'in_queue', assignedCommitteeId: 'comm-1' });

function harness(overrides: Partial<AppStoreState> = {}): Harness {
  const category = selectableCategory();
  const audits: Harness['audits'] = [];
  const incidents: Harness['incidents'] = [];
  const uploads: string[] = [];
  let notifies = 0;
  const state = {
    currentUser: { id: 'usr-admin', name: 'Admin', nameArabic: 'مدير', email: 'a@b.c', role: 'comp_admin', organizationId: SEED_COMPETITION.organizationId },
    competition: { ...SEED_COMPETITION, categories: [category] },
    participants: [participant('p1', category.id), participant('p2', category.id)],
    participantScopes: [], questionModels: [], questionModelBatches: [], questionQuarantines: [],
    questionReservations: [], fairnessReports: [], scopeSimulations: [], scopeEngineSeals: [],
    committees: [], variantLoci: [], mutashabihatTrapMaps: [], quranSourceManifests: [], quranSourceContents: [],
    activeSession: { secureQuestionMode: 'CLIENT' },
    ...overrides,
  } as unknown as AppStoreState;

  const host: ScopeEngineHost = {
    getState: () => state,
    newId: (prefix) => `${prefix}-${++ids}`,
    notify: () => { notifies += 1; },
    audit: (action, _entity, _id, ar) => { audits.push({ action, ar }); },
    createIncident: (_kind, title, description) => { incidents.push({ title, description }); },
    markConfigChanged: () => {},
    queueScopeUpload: (record) => { uploads.push(record.id); },
  };
  return { state, audits, incidents, uploads, get notifies() { return notifies; }, actions: createScopeEngineActions(host) } as Harness;
}

const approvedScope = (h: Harness, participantId: string, juz: number[], version = 1) => {
  const category = h.state.competition.categories[0];
  const record = buildParticipantScopeRecord({
    id: `psc-${participantId}-${version}`, organizationId: h.state.competition.organizationId,
    competitionId: h.state.competition.id, categoryId: category.id, participantId,
    rule: category.selectionRule!, selection: scopeFromJuz(juz), version,
  });
  h.state.participantScopes = [{ ...record, status: 'approved', approvedAt: new Date().toISOString(), approvedBy: 'head' }, ...h.state.participantScopes];
};

/* ---- دورة حياة النطاق: ما لا يراه فحص المتصفح ---- */

test('saving a scope supersedes the previous version without deleting it, and records the change reason', () => {
  const h = harness();
  const first = h.actions.saveParticipantScope('p1', scopeFromJuz([1, 2, 3, 4, 5, 6, 7, 8]), { submit: true, reason: 'اختياري الأول' });
  assert.equal(first.ok, true);
  const second = h.actions.saveParticipantScope('p1', scopeFromJuz([9, 10, 11, 12, 13, 14, 15, 16]), { submit: true, reason: 'أتقنت هذه أكثر' });
  assert.equal(second.ok, true);

  const history = h.actions.participantScopeHistory('p1');
  assert.equal(history.length, 2, 'nothing is deleted — the older version stays');
  assert.equal(history[0].version, 2, 'newest first');
  assert.equal(history[1].status, 'superseded');
  assert.equal(history[1].supersededByVersion, 2);
  assert.ok(history[1].supersededAt, 'when it was replaced is recorded');
  assert.equal(history[1].changeReason, 'اختياري الأول');
  assert.equal(history[0].changeReason, 'أتقنت هذه أكثر');
  assert.equal(h.actions.activeParticipantScope('p1')!.version, 2, 'the active one is the newest, not the first');
});

test('a rejection with no reason is refused by the store, whatever the screen allows', () => {
  const h = harness();
  h.actions.saveParticipantScope('p1', scopeFromJuz([1, 2, 3, 4, 5, 6, 7, 8]), { submit: true });
  const blank = h.actions.decideParticipantScope('p1', 'rejected', '   ');
  assert.equal(blank.ok, false);
  assert.equal(blank.ok === false && blank.reason, 'REJECTION_REASON_REQUIRED');
  assert.equal(h.actions.activeParticipantScope('p1')!.status, 'submitted', 'the record is untouched by a refused decision');

  const given = h.actions.decideParticipantScope('p1', 'rejected', 'أقل من المطلوب');
  assert.equal(given.ok, true);
  const record = h.actions.activeParticipantScope('p1')!;
  assert.equal(record.status, 'rejected');
  assert.equal(record.rejectionReason, 'أقل من المطلوب');
  assert.ok(record.rejectedAt);
});

test('a selection breaking the category rule never reaches storage', () => {
  const h = harness();
  const short = h.actions.saveParticipantScope('p1', scopeFromJuz([1, 2, 3]), { submit: true, reason: 'ثلاثة فقط' });
  assert.equal(short.ok, false);
  assert.equal(short.ok === false && short.reason, 'SELECTION_INVALID');
  assert.equal(h.state.participantScopes.length, 0, 'an invalid selection writes nothing at all');
});

test('a locked scope refuses further edits; an approved one still accepts them', () => {
  const h = harness();
  h.actions.saveParticipantScope('p1', scopeFromJuz([1, 2, 3, 4, 5, 6, 7, 8]), { submit: true });
  h.actions.decideParticipantScope('p1', 'approved');
  const afterApproval = h.actions.saveParticipantScope('p1', scopeFromJuz([2, 3, 4, 5, 6, 7, 8, 9]), { submit: true, reason: 'تعديل' });
  assert.equal(afterApproval.ok, true, 'approved is reviewable');

  h.actions.decideParticipantScope('p1', 'locked');
  const afterLock = h.actions.saveParticipantScope('p1', scopeFromJuz([3, 4, 5, 6, 7, 8, 9, 10]), { submit: true, reason: 'بعد القفل' });
  assert.equal(afterLock.ok, false);
  assert.equal(afterLock.ok === false && afterLock.reason, 'SCOPE_LOCKED');
});

test('the history never leaks across competitions, even for the same participant id', () => {
  const h = harness();
  approvedScope(h, 'p1', [1, 2, 3, 4, 5, 6, 7, 8]);
  const foreign = { ...h.state.participantScopes[0], id: 'foreign', competitionId: 'other-comp', version: 9 };
  h.state.participantScopes = [foreign, ...h.state.participantScopes];
  const history = h.actions.participantScopeHistory('p1');
  assert.equal(history.length, 1);
  assert.equal(history[0].competitionId, h.state.competition.id);
  assert.equal(h.actions.participantEffectiveScope('p1')!.blocked, false);
});

/* ---- الحجر والاسترداد: الأثر يُقاس في الحالة لا في نصّ الشاشة ---- */

test('quarantining invalidates the models that carry the locus and files an incident when nothing remains', () => {
  const h = harness();
  approvedScope(h, 'p1', [30]);
  approvedScope(h, 'p2', [30]);
  const batch = h.actions.generateQuestionModelBatch({ categoryId: 'cat-q', reserveCount: 0 });
  assert.equal(batch.ok, true);
  const victim = h.state.questionModels.find(m => m.participantId === 'p1')!;
  const locusKey = `${victim.questions[0].surahNumber}:${victim.questions[0].startAyah}`;

  const outcome = h.actions.quarantineQuestionLoci({ locusKeys: [locusKey], reason: 'خطأ ضبط' });
  assert.equal(outcome.ok, true);
  const invalidated = h.state.questionModels.filter(m => m.status === 'invalidated');
  assert.ok(invalidated.length >= 1);
  for (const model of invalidated) assert.match(model.invalidationReason || '', /QUARANTINED_LOCUS/);
  assert.equal(h.state.questionQuarantines[0].status, 'active');
  assert.ok(h.audits.some(a => a.action === 'QUESTION_LOCI_QUARANTINED'));

  /* والموضع المحجور يخرج من البنك عند منبعه، لا عند السحب وحده. */
  const pool = h.actions.scopeCandidatePool(scopeFromJuz([30]), 'cat-q');
  assert.equal(pool.some(c => `${c.surahNumber}:${c.startAyah}` === locusKey), false);
});

test('recovery gives every affected participant a model again, and names anyone it could not', () => {
  const h = harness();
  approvedScope(h, 'p1', [30]);
  approvedScope(h, 'p2', [30]);
  h.actions.generateQuestionModelBatch({ categoryId: 'cat-q', reserveCount: 2 });
  const victim = h.state.questionModels.find(m => m.participantId === 'p1')!;
  const locusKey = `${victim.questions[0].surahNumber}:${victim.questions[0].startAyah}`;

  const outcome = h.actions.recoverQuarantinedLoci({ locusKeys: [locusKey], reason: 'عيب' , categoryId: 'cat-q' });
  assert.equal(outcome.ok, true);
  const affected = outcome.ok ? outcome.outcome.quarantine.affectedParticipantIds : [];
  const recovered = outcome.ok ? outcome.outcome.recovered.map(r => r.participantId) : [];
  const unrecovered = outcome.ok ? outcome.outcome.unrecovered.map(r => r.participantId) : [];
  assert.deepEqual([...affected].sort(), [...recovered, ...unrecovered].sort(), 'every affected participant is accounted for, one way or the other');
  for (const id of recovered) {
    const model = h.state.questionModels.find(m => m.participantId === id && m.status === 'sealed')!;
    assert.ok(model, `${id} must hold a sealed model after recovery`);
    assert.equal(model.questions.some(q => `${q.surahNumber}:${q.startAyah}` === locusKey), false);
  }
  for (const id of unrecovered) {
    assert.ok(h.incidents.some(i => i.description.includes(id) || i.description.includes(id.toUpperCase())), `${id} must be raised as an incident, not dropped`);
  }
});

test('lifting a quarantine returns the locus to the pool but never revives an invalidated model', () => {
  const h = harness();
  approvedScope(h, 'p1', [30]);
  h.actions.generateQuestionModelBatch({ categoryId: 'cat-q', reserveCount: 0 });
  const victim = h.state.questionModels.find(m => m.participantId === 'p1')!;
  const locusKey = `${victim.questions[0].surahNumber}:${victim.questions[0].startAyah}`;
  const quarantine = h.actions.quarantineQuestionLoci({ locusKeys: [locusKey], reason: 'عيب' });
  assert.equal(quarantine.ok, true);
  const invalidatedIds = h.state.questionModels.filter(m => m.status === 'invalidated').map(m => m.id);

  const blank = h.actions.liftQuestionQuarantine(quarantine.ok ? quarantine.record.id : '', '  ');
  assert.equal(blank.ok, false, 'lifting also needs a reason');

  const lifted = h.actions.liftQuestionQuarantine(quarantine.ok ? quarantine.record.id : '', 'روجع المصدر');
  assert.equal(lifted.ok, true);
  assert.equal(h.state.questionQuarantines[0].status, 'lifted');
  const pool = h.actions.scopeCandidatePool(scopeFromJuz([30]), 'cat-q');
  assert.equal(pool.some(c => `${c.surahNumber}:${c.startAyah}` === locusKey), true, 'the locus is back in the pool');
  for (const id of invalidatedIds) {
    assert.equal(h.state.questionModels.find(m => m.id === id)!.status, 'invalidated', 'an invalidated model is regenerated, never revived');
  }
});

/* ---- الدفعات والاحتياط ---- */

test('a batch is only executed in the hall once it is sealed, not when it is merely approved', () => {
  const h = harness();
  approvedScope(h, 'p1', [1, 2, 3, 4, 5, 6, 7, 8]);
  const batch = h.actions.generateQuestionModelBatch({ categoryId: 'cat-q', reserveCount: 1 });
  assert.equal(batch.ok, true);
  const batchId = batch.ok ? batch.batch.id : '';
  assert.equal(h.actions.preGeneratedModelFor('p1'), null, 'a draft batch is not executed');

  assert.equal(h.actions.decideModelBatch(batchId, 'sealed').ok, false, 'sealing before approval is refused');
  assert.equal(h.actions.decideModelBatch(batchId, 'approved').ok, true);
  assert.equal(h.actions.preGeneratedModelFor('p1'), null, 'approved is still not sealed');
  assert.equal(h.actions.decideModelBatch(batchId, 'sealed').ok, true);
  const model = h.actions.preGeneratedModelFor('p1');
  assert.ok(model, 'a sealed batch is executed');
  assert.equal(model!.participantId, 'p1');
  assert.equal(model!.generationMode, 'pre_generated');
});

test('a reserve is claimed only on an exact scope-signature match, and the claim is audited with its reason', () => {
  const h = harness();
  approvedScope(h, 'p1', [1, 2, 3, 4, 5, 6, 7, 8]);
  approvedScope(h, 'p2', [9, 10, 11, 12, 13, 14, 15, 16]);
  h.actions.generateQuestionModelBatch({ categoryId: 'cat-q', reserveCount: 1 });

  const reserves = h.state.questionModels.filter(m => !m.participantId && m.status === 'draft');
  assert.ok(reserves.length >= 2, 'one reserve per distinct signature');
  const blank = h.actions.claimReserveForParticipant('p1', '  ');
  assert.equal(blank.ok, false, 'a claim needs its reason');

  const claim = h.actions.claimReserveForParticipant('p1', 'سقط سؤال');
  assert.equal(claim.ok, true);
  const claimed = claim.ok ? claim.model : null;
  assert.equal(claimed!.scopeSignature, scopeSignature(scopeFromJuz([1, 2, 3, 4, 5, 6, 7, 8])));
  assert.ok(claimed!.relaxations.some(r => r.includes('سقط سؤال')));
  assert.ok(h.audits.some(a => a.action === 'QUESTION_MODEL_RESERVE_CLAIMED'));
});

/* ---- الحجز ---- */

test('a held locus blocks another participant and is released when its term lapses', () => {
  const h = harness();
  approvedScope(h, 'p1', [30]);
  const outcome = h.actions.reserveQuestionsForParticipant({ participantId: 'p1', items: [{ locusKey: '78:1', questionId: 'q1' }], ttlSeconds: 60 });
  assert.equal(outcome.created.length, 1);
  assert.equal(h.actions.reservationBlockedLoci('p2').has('78:1'), true);
  assert.equal(h.actions.reservationBlockedLoci('p1').has('78:1'), false, 'never blocked from your own hold');

  h.state.questionReservations = h.state.questionReservations.map(r => ({ ...r, expiresAt: '2020-01-01T00:00:00.000Z' }));
  assert.equal(h.actions.sweepExpiredReservations(), 1);
  assert.equal(h.state.questionReservations[0].state, 'released');
  assert.equal(h.actions.reservationBlockedLoci('p2').has('78:1'), false);
});

test('the same reservation request twice reserves once', () => {
  const h = harness();
  const key = 'idem-1';
  const first = h.actions.reserveQuestionsForParticipant({ participantId: 'p1', items: [{ locusKey: '78:1', questionId: 'q1' }], idempotencyKey: key });
  const second = h.actions.reserveQuestionsForParticipant({ participantId: 'p1', items: [{ locusKey: '78:1', questionId: 'q1' }], idempotencyKey: key });
  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.equal(h.state.questionReservations.length, 1);
});

/* ---- التقرير والتجميد ---- */

test('the fairness report is refused rather than saved when it would name a participant', () => {
  const h = harness();
  approvedScope(h, 'p1', [1, 2, 3, 4, 5, 6, 7, 8]);
  h.actions.generateQuestionModelBatch({ categoryId: 'cat-q', reserveCount: 0 });
  /* كودٌ يطابق كلمةً في عنوان التقرير نفسه: لو مرّ فالحاجز لا يعمل. */
  h.state.participants = h.state.participants.map(p => p.id === 'p1' ? { ...p, code: 'الأسئلة' } : p);
  return h.actions.buildCompetitionFairnessReport({ categoryId: 'cat-q' }).then(outcome => {
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.reason, 'PRIVACY_VIOLATION');
    assert.equal(h.state.fairnessReports.length, 0, 'a leaking report is never stored');
  });
});

test('a clean fairness report is stored, hashed, and carries no participant identity', async () => {
  const h = harness();
  approvedScope(h, 'p1', [1, 2, 3, 4, 5, 6, 7, 8]);
  approvedScope(h, 'p2', [1, 2, 3, 4, 5, 6, 7, 8]);
  h.actions.generateQuestionModelBatch({ categoryId: 'cat-q', reserveCount: 0 });
  const outcome = await h.actions.buildCompetitionFairnessReport({ categoryId: 'cat-q' });
  assert.equal(outcome.ok, true);
  const report = outcome.ok ? outcome.report : null;
  assert.ok(report!.reportHash.length > 16);
  assert.equal(report!.privacy.participantIdentities, false);
  const text = JSON.stringify(report!.sections);
  for (const p of h.state.participants) assert.doesNotMatch(text, new RegExp(p.code));
  assert.equal(h.state.fairnessReports.length, 1);
});

test('sealing refuses while a critical readiness check is open, and locks approved scopes once it passes', async () => {
  const h = harness();
  const blocked = await h.actions.sealScopeEngine('قبل الاعتماد');
  assert.equal(blocked.ok, false, 'participants without an approved scope block the seal');
  assert.equal(blocked.ok === false && blocked.reason, 'READINESS_BLOCKED');

  approvedScope(h, 'p1', [1, 2, 3, 4, 5, 6, 7, 8]);
  approvedScope(h, 'p2', [1, 2, 3, 4, 5, 6, 7, 8]);
  const readiness = h.actions.getScopeReadiness();
  if (!readiness.ready) {
    assert.ok(readiness.checks.some(c => c.severity === 'critical'), 'a refused seal must name a critical check');
    return;
  }
  const sealed = await h.actions.sealScopeEngine('جاهز');
  assert.equal(sealed.ok, true);
  assert.equal(h.state.scopeEngineSeals[0].status, 'active');
  for (const record of h.state.participantScopes.filter(x => x.status !== 'superseded')) {
    assert.equal(record.status, 'locked', 'sealing locks what was approved');
  }
});

test('an impossible locus is refused as impossible, not clamped into a range nobody chose', () => {
  const h = harness();
  /* سورة ٩٩٩ يقصرها التطبيع إلى «الناس» — وذلك اختراعُ نطاق لا إصلاحُ خطأ. */
  const impossible = { version: 1 as const, assurance: 'CANONICAL_TABLE' as const, segments: [{ start: { surah: 999, ayah: 1 }, end: { surah: 999, ayah: 2 } }] };
  const outcome = h.actions.saveParticipantScope('p1', impossible, { submit: true, reason: 'خطأ' });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok === false && outcome.reason, 'SCOPE_INVALID');
  assert.ok(outcome.ok === false && outcome.issues.some(i => i.code === 'SCOPE_SURAH_INVALID'));
  assert.equal(h.state.participantScopes.length, 0, 'nothing is stored for an impossible choice');
});

/* ---- إثراء بيانات السؤال: ما يُقرأ من مصدر، وما يبقى فارغًا ---- */

test('wujuh come from a certified variant locus only — a development one leaves the field unread', () => {
  const h = harness();
  const probe = h.actions.scopeCandidatePool(scopeFromJuz([30]), 'cat-q')[0];
  const key = { surah: probe.surahNumber, ayah: probe.startAyah };

  /* سجلٌّ تطويري: موجودٌ ولا يُقرأ. الفراغ هنا يقول «لم يُعتمد» لا «لا وجه فيه». */
  h.state.variantLoci = [{
    id: 'vl-dev', surah: key.surah, ayah: key.ayah, qiraah: 'Asim', rawi: 'Hafs',
    allowedWajh: 'وجه تطويري', version: '1', approvalState: 'DEVELOPMENT',
  }] as AppStoreState['variantLoci'];
  const withDraft = h.actions.scopeCandidatePool(scopeFromJuz([30]), 'cat-q')
    .find(c => c.surahNumber === key.surah && c.startAyah === key.ayah)!;
  assert.equal(withDraft.allowedWujuh, undefined, 'an unapproved variant must not reach a question');

  h.state.variantLoci = [
    { id: 'vl-1', surah: key.surah, ayah: key.ayah, qiraah: 'Asim', rawi: 'Hafs', allowedWajh: 'الإظهار', version: '1', approvalState: 'CERTIFIED' },
    { id: 'vl-2', surah: key.surah, ayah: key.ayah, qiraah: 'Asim', rawi: 'Hafs', allowedWajh: 'الإدغام', version: '1', approvalState: 'CERTIFIED' },
    { id: 'vl-3', surah: key.surah, ayah: key.ayah, qiraah: 'Asim', rawi: 'Hafs', allowedWajh: 'الإظهار', version: '1', approvalState: 'CERTIFIED' },
  ] as AppStoreState['variantLoci'];
  const certified = h.actions.scopeCandidatePool(scopeFromJuz([30]), 'cat-q')
    .find(c => c.surahNumber === key.surah && c.startAyah === key.ayah)!;
  assert.deepEqual(certified.allowedWujuh, ['الإظهار', 'الإدغام'], 'certified wujuh reach the question, deduplicated, in source order');

  const untouched = h.actions.scopeCandidatePool(scopeFromJuz([30]), 'cat-q')
    .find(c => !(c.surahNumber === key.surah && c.startAyah === key.ayah))!;
  assert.equal(untouched.allowedWujuh, undefined, 'a locus with no certified variant stays unread, not "no wujuh"');
});

test('an approved mutashabihat trap raises the similarity score of its locus, and a review-stage one does not', () => {
  const h = harness();
  const probe = h.actions.scopeCandidatePool(scopeFromJuz([30]), 'cat-q')[0];
  const trap = (status: 'REVIEW_MAP' | 'APPROVED') => ([{
    id: `trap-${status}`, competitionId: h.state.competition.id, sourceManifestId: 's', qiraah: 'Asim', rawi: 'Hafs',
    expected: { surah: probe.surahNumber, ayah: probe.startAyah }, possible: { surah: 2, ayah: 1 },
    similarityEvidence: { kind: 'EXPERT' as const }, status, createdAt: new Date().toISOString(),
  }] as AppStoreState['mutashabihatTrapMaps']);

  h.state.mutashabihatTrapMaps = trap('REVIEW_MAP');
  const underReview = h.actions.scopeCandidatePool(scopeFromJuz([30]), 'cat-q')
    .find(c => c.surahNumber === probe.surahNumber && c.startAyah === probe.startAyah)!;
  assert.ok(!underReview.mutashabihatScore || underReview.mutashabihatScore < 0.8, 'a map still under review does not steer the draw');

  h.state.mutashabihatTrapMaps = trap('APPROVED');
  const approved = h.actions.scopeCandidatePool(scopeFromJuz([30]), 'cat-q')
    .find(c => c.surahNumber === probe.surahNumber && c.startAyah === probe.startAyah)!;
  assert.ok((approved.mutashabihatScore || 0) >= 0.8, 'an approved trap is known to the engine');
});

test('exposure counts come from the ledger of what was actually revealed, never guessed', () => {
  const h = harness();
  approvedScope(h, 'p1', [30]);
  const before = h.actions.scopeCandidatePool(scopeFromJuz([30]), 'cat-q');
  assert.equal(before.every(c => c.exposureCount === undefined), true, 'nothing revealed yet means no exposure figure at all');

  h.actions.generateQuestionModelBatch({ categoryId: 'cat-q', reserveCount: 0 });
  const model = h.state.questionModels.find(m => m.participantId === 'p1')!;
  const used = new Set(model.questions.map(q => `${q.surahNumber}:${q.startAyah}`));
  const after = h.actions.scopeCandidatePool(scopeFromJuz([30]), 'cat-q');
  for (const candidate of after) {
    const key = `${candidate.surahNumber}:${candidate.startAyah}`;
    if (used.has(key)) assert.equal(candidate.exposureCount, 1, `${key} was sealed into a model, so it carries a count`);
    else assert.equal(candidate.exposureCount, undefined, `${key} was never revealed, so it carries no count`);
  }
});
