import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopeEngineActions, type ScopeEngineHost } from '../src/lib/store-scope-actions';
import type { AppStoreState } from '../src/lib/store-state';
import type { Category, Participant } from '../src/types';
import { DEFAULT_SELECTION_RULE } from '../src/lib/participant-scope';
import { fullQuranScope, scopeFromJuz, scopeSignature } from '../src/lib/quran-scope';
import { RESERVATION_TRANSITIONS } from '../src/lib/question-reservation';
import { SEED_COMPETITION, SEED_PARTICIPANTS } from '../src/lib/seed-data';

/*
 * فحصٌ بالثوابت لا بالأمثلة.
 *
 * كلُّ ما فُحص إلى الآن يسأل: «إذا فعلتُ كذا، أيخرج كذا؟» — وذلك يمسك الأعطاب التي
 * **خطرت لي**. والعطب الذي كلّفنا أغلى (الدفتر يحجب المكشوف إلى الأبد فينقض سياسة
 * التكرار) لم يُمسك هكذا: أمسكه مسارٌ طويل كُشف فيه **ثابتٌ** لا قيمةٌ متوقَّعة.
 *
 * فهذا الملف يعمّم ذلك: تواليَ عملياتٍ عشوائيةٍ صحيحة على إجراءات المخزن نفسها، وبعد
 * **كل عملية** تُفحص ثوابتُ لا يجوز أن تنكسر مهما كان الترتيب. لا يُتوقَّع خرجٌ بعينه —
 * يُطلب ألّا يكذب النظام على نفسه.
 *
 * والعشوائية محتومة بالبذرة: إذا سقط ثابتٌ طُبعت البذرة ورقمُ العملية، فيُعاد العطب
 * بالأمر نفسه بدل أن يُطارَد.
 *
 * وهذه الثوابت ليست تفصيلات تقنية؛ كلٌّ منها وعدٌ لإنسان:
 *   ١) لا يُسأل متسابقان عن موضعٍ واحد في اللحظة نفسها.
 *   ٢) ولا يُسأل أحدٌ عن موضعٍ خارج ما حفظه.
 *   ٣) ولا يُسأل أحدٌ عن موضعٍ عُلم أنه معيب.
 *   ٤) ولا يُمحى من السجلّ شيء.
 *   ٥) ولا يُبدَّل نطاقٌ في الخفاء: نسخةٌ واحدة سارية، والتاريخ يصعد ولا ينزل.
 */

const P = 24, HALLS = 4, OPS = 260, SEEDS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];

const CATEGORY: Category = {
  id: 'cat-fuzz', competitionId: SEED_COMPETITION.id, code: 'F', name: 'Fuzz', nameArabic: 'فحص',
  description: '', riwaya: 'حفص عن عاصم', memorizationScope: '', juzCount: 0, targetParticipants: P,
  targetDurationMinutes: 8, questionsCount: 3, scope: fullQuranScope(), scopeMode: 'participant_selected', scopeVersion: 1,
  selectionRule: { ...DEFAULT_SELECTION_RULE, version: 1, enabled: true, decidedBy: 'participant', selectionUnit: 'juz', exactUnits: 8, parentScope: fullQuranScope(), approval: 'committee' },
};

function build(seed: string) {
  let s = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5);
  const rnd = () => { s = Math.imul(s ^ (s >>> 15), 0x2545f491) >>> 0; return s / 0x100000000; };
  const pick = <T>(list: T[]): T => list[Math.floor(rnd() * list.length)];

  let ids = 0;
  let auditCount = 0;
  const state = {
    currentUser: { id: 'usr-admin', name: 'Admin', nameArabic: 'مدير', email: 'a@b.c', role: 'comp_admin', organizationId: SEED_COMPETITION.organizationId },
    competition: { ...SEED_COMPETITION, categories: [CATEGORY] },
    participants: Array.from({ length: P }, (_, i): Participant => ({
      ...SEED_PARTICIPANTS[0], id: `p${i}`, code: `A-${String(i).padStart(3, '0')}`,
      fullName: `R${i}`, fullNameArabic: `متسابق ${i}`, email: `r${i}@example.org`,
      categoryId: CATEGORY.id, riwaya: 'Hafs', status: 'in_queue', assignedCommitteeId: `comm-${i % HALLS}`,
    })),
    committees: Array.from({ length: HALLS }, (_, i) => ({ id: `comm-${i}`, judgeIds: [`j-${i}`] })),
    participantScopes: [], questionModels: [], questionModelBatches: [], questionQuarantines: [],
    questionReservations: [], fairnessReports: [], scopeSimulations: [], scopeEngineSeals: [],
    variantLoci: [], mutashabihatTrapMaps: [], quranSourceManifests: [], quranSourceContents: [],
    activeSession: { secureQuestionMode: 'CLIENT' },
  } as unknown as AppStoreState;

  const host: ScopeEngineHost = {
    getState: () => state, newId: (p) => `${p}-${++ids}`, notify: () => {},
    audit: () => { auditCount++; }, createIncident: () => {}, markConfigChanged: () => {}, queueScopeUpload: () => {},
  };
  return { state, engine: createScopeEngineActions(host), rnd, pick, auditCount: () => auditCount };
}

const someScope = (rnd: () => number) => {
  const start = 1 + Math.floor(rnd() * 22);
  return scopeFromJuz(Array.from({ length: 8 }, (_, k) => start + k));
};

/* ---- الثوابت ------------------------------------------------------------------------ */

type World = ReturnType<typeof build>;

function checkInvariants(w: World, prevAudit: number, prevHistory: Map<string, number>) {
  const { state, engine } = w;
  const problems: string[] = [];

  /* ١) موضعٌ واحد لا يكون بيد اثنين في آنٍ واحد. */
  const holder = new Map<string, string>();
  for (const r of state.questionReservations) {
    if (r.state !== 'temporarily_reserved' && r.state !== 'assigned') continue;
    const who = r.participantId || '';
    const prev = holder.get(r.locusKey);
    if (prev !== undefined && prev !== who) problems.push(`الموضع ${r.locusKey} بيد ${prev} و${who} معًا`);
    else holder.set(r.locusKey, who);
  }

  /* ٢) كل انتقالٍ في تاريخ الحجز مسموحٌ في الجدول، والتاريخ لا ينقص أبدًا. */
  for (const r of state.questionReservations) {
    const seen = prevHistory.get(r.id);
    if (seen !== undefined && r.history.length < seen) problems.push(`تاريخ الحجز ${r.id} نقص من ${seen} إلى ${r.history.length}`);
    for (let i = 1; i < r.history.length; i++) {
      const from = r.history[i - 1].state, to = r.history[i].state;
      if (from === to) continue;
      if (!RESERVATION_TRANSITIONS[from].includes(to)) problems.push(`انتقالٌ ممنوع في ${r.id}: ${from} ← ${to}`);
    }
    if (r.history.length && r.history[r.history.length - 1].state !== r.state) {
      problems.push(`حالة الحجز ${r.id} (${r.state}) تخالف آخر ما في تاريخه (${r.history[r.history.length - 1].state})`);
    }
  }

  /* ٣) نسخةٌ واحدة سارية لكل متسابق، والأرقام تصعد ولا تنزل. */
  const live = new Map<string, number>();
  const versions = new Map<string, number[]>();
  for (const record of state.participantScopes) {
    versions.set(record.participantId, [...(versions.get(record.participantId) || []), record.version]);
    if (record.status === 'superseded') continue;
    const already = live.get(record.participantId);
    if (already !== undefined) problems.push(`للمتسابق ${record.participantId} نسختان ساريتان (${already} و${record.version})`);
    live.set(record.participantId, record.version);
  }
  for (const [pid, list] of versions) {
    if (new Set(list).size !== list.length) problems.push(`نسخ نطاق ${pid} فيها تكرار: ${list.join('،')}`);
    const active = live.get(pid);
    if (active !== undefined && active !== Math.max(...list)) problems.push(`النسخة السارية لـ${pid} (${active}) ليست الأحدث (${Math.max(...list)})`);
  }

  /* ٤) لا نموذجَ سليم يحمل موضعًا محجورًا، ولا موضعًا خارج نطاق صاحبه. */
  const quarantined = new Set(engine.activeQuarantinedLoci());
  for (const model of state.questionModels) {
    if (model.status === 'invalidated' || !model.participantId) continue;
    for (const q of model.questions) {
      const key = `${q.surahNumber}:${q.startAyah}`;
      if (quarantined.has(key)) problems.push(`النموذج ${model.id} سليمٌ ويحمل موضعًا محجورًا ${key}`);
    }
    const resolution = engine.participantEffectiveScope(model.participantId);
    if (!resolution || resolution.blocked) continue;
    const signature = resolution.signature || scopeSignature(resolution.scope);
    if (model.scopeSignature !== signature && model.status === 'sealed') {
      problems.push(`النموذج ${model.id} مختومٌ على نطاقٍ لم يعد نطاق صاحبه`);
    }
  }

  /* ٥) السجلّ لا ينقص. */
  if (w.auditCount() < prevAudit) problems.push(`عدد أحداث السجلّ نقص من ${prevAudit} إلى ${w.auditCount()}`);

  return problems;
}

/* ---- العمليات ---------------------------------------------------------------------- */

function runSeed(seed: string) {
  const w = build(seed);
  const { state, engine, rnd, pick } = w;
  const log: string[] = [];
  let prevAudit = 0;
  const prevHistory = new Map<string, number>();

  const anyParticipant = () => `p${Math.floor(rnd() * P)}`;
  const liveLoci = () => {
    const out = new Set<string>();
    for (const m of state.questionModels) if (m.status !== 'invalidated') for (const q of m.questions) out.add(`${q.surahNumber}:${q.startAyah}`);
    return [...out];
  };

  const operations: { name: string; run: () => void }[] = [
    { name: 'حفظ نطاق', run: () => { engine.saveParticipantScope(anyParticipant(), someScope(rnd), { submit: rnd() < 0.8, reason: 'اختيار' }); } },
    { name: 'حفظ نطاق مستحيل', run: () => {
      const bad = { version: 1, assurance: 'CANONICAL_TABLE' as const, segments: [{ start: { surah: 999, ayah: 1 }, end: { surah: 999, ayah: 5 } }] };
      const out = engine.saveParticipantScope(anyParticipant(), bad as never, { submit: true, reason: 'خطأ' });
      assert.equal(out.ok, false, 'نطاقٌ مستحيل قُبل');
    } },
    { name: 'قرار اللجنة', run: () => { engine.decideParticipantScope(anyParticipant(), pick(['approved', 'rejected', 'locked'] as const), 'سبب مكتوب'); } },
    { name: 'رفض بلا سبب', run: () => {
      const out = engine.decideParticipantScope(anyParticipant(), 'rejected');
      if (out.ok) assert.fail('رُفض نطاقٌ بلا سبب مكتوب');
    } },
    { name: 'توليد دفعة', run: () => { engine.generateQuestionModelBatch({ categoryId: CATEGORY.id, reserveCount: 2, seed: `${seed}-${rnd()}` }); } },
    { name: 'قرار الدفعة', run: () => {
      const batch = state.questionModelBatches[Math.floor(rnd() * state.questionModelBatches.length)];
      if (batch) engine.decideModelBatch(batch.id, pick(['approved', 'sealed', 'invalidated'] as const), 'قرار');
    } },
    { name: 'حجز', run: () => {
      const loci = liveLoci();
      if (!loci.length) return;
      const items = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => { const k = pick(loci); return { locusKey: k, questionId: `q-${k}` }; });
      engine.reserveQuestionsForParticipant({ participantId: anyParticipant(), items, idempotencyKey: `idem-${Math.floor(rnd() * 40)}` });
    } },
    { name: 'تقديم الحجز', run: () => {
      const candidates = state.questionReservations.filter(r => r.state === 'temporarily_reserved' || r.state === 'assigned');
      if (!candidates.length) return;
      const r = pick(candidates);
      engine.advanceReservations([r.id], pick(['assigned', 'revealed', 'released'] as const), 'تقدّم');
    } },
    { name: 'كنس المنقضي', run: () => { engine.sweepExpiredReservations(); } },
    { name: 'حجر موضع', run: () => {
      const loci = liveLoci();
      if (!loci.length) return;
      engine.quarantineQuestionLoci({ locusKeys: [pick(loci)], reason: 'عيبٌ في الضبط' });
    } },
    { name: 'رفع الحجر', run: () => {
      const open = state.questionQuarantines.filter(q => q.status !== 'lifted');
      if (!open.length) return;
      engine.liftQuestionQuarantine(pick(open).id, 'صُحِّح');
    } },
    { name: 'استرداد', run: () => {
      const open = state.questionQuarantines.filter(q => q.status !== 'lifted');
      if (!open.length) return;
      engine.recoverQuarantinedLoci({ locusKeys: pick(open).locusKeys, reason: 'استرداد', categoryId: CATEGORY.id });
    } },
    { name: 'جاهزية', run: () => { engine.getScopeReadiness(); } },
  ];

  for (let i = 0; i < OPS; i++) {
    const op = pick(operations);
    log.push(`${i}: ${op.name}`);
    op.run();
    const problems = checkInvariants(w, prevAudit, prevHistory);
    if (problems.length) {
      assert.fail(
        `سقط ثابتٌ بعد العملية ${i} («${op.name}») بالبذرة «${seed}»:\n` +
        problems.map(p => `    · ${p}`).join('\n') +
        `\n  آخر عشر عمليات:\n${log.slice(-10).map(l => `    ${l}`).join('\n')}` +
        `\n  للإعادة: SEEDS='${seed}' npx tsx --test tests/store-invariants-fuzz.test.ts`,
      );
    }
    prevAudit = w.auditCount();
    for (const r of state.questionReservations) prevHistory.set(r.id, r.history.length);
  }
  return { reservations: state.questionReservations.length, models: state.questionModels.length, scopes: state.participantScopes.length };
}

const chosen = process.env.SEEDS ? process.env.SEEDS.split(',') : SEEDS;

for (const seed of chosen) {
  test(`ثوابت المخزن تصمد لـ${OPS} عملية عشوائية — بذرة «${seed}»`, () => {
    const summary = runSeed(seed);
    /* ولا يكفي ألّا تنكسر الثوابت: لو لم يقع شيء لمرّت بلا فحص. */
    assert.ok(summary.scopes > 0, 'لم يُحفظ نطاقٌ واحد — المسار لم يمرّ بشيء');
    assert.ok(summary.reservations > 0, 'لم يُنشأ حجزٌ واحد — المسار لم يمرّ بشيء');
  });
}
