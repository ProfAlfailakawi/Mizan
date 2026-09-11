/*
 * يوم مسابقة حيّ — لا مختبرَ خوارزمية.
 *
 * كل ما فُحص إلى الآن أحد اثنين: **المحرك الخالص** بآلاف السحوب، أو **المخزن** بحفنة
 * متسابقين. ولم يُشغَّل المخزن قطّ بألف. والفرق ليس في الحجم وحده:
 *
 *   • المحرك الخالص لا يعرف الحجوز، ولا الحجر، ولا الانكشاف، ولا إبطال النماذج.
 *   • والمخزن بعشرة متسابقين لا يُظهر ما يفعله التذكير (memo) حين تتغيّر الحالة ألف مرة،
 *     ولا ما يكلّفه إعادة بناء البنك بعد كل حجر، ولا ما يحدث حين تتزاحم قاعات على موضع.
 *
 * فهذا السكربت يمشي **يومًا كاملًا** بإجراءات المخزن نفسها — لا نسخةٍ منها — على ألفٍ فأكثر،
 * وفيه ما يقع في يومٍ حقيقي لا في تجربةٍ مرتّبة:
 *
 *   الساعة ٠  تسجيلٌ جماعي: كلٌّ يختار نطاقه، واللجنة تعتمد وترفض.
 *   الساعة ١  توليد دفعة، واعتمادها، وختمها.
 *   الساعة ٢  القاعات تفتح: جلساتٌ متزامنة، وحجوزٌ تتزاحم.
 *   الساعة ٣  **يُكتشف عيبٌ في موضع** — حجرٌ واسترداد والمسابقة قائمة.
 *   الساعة ٤  متأخرون يصلون، ومتغيّبون تنقضي حجوزهم.
 *   الساعة ٥  متسابقٌ يغيّر نطاقه بعد أن بدأ اليوم — ماذا يبطل؟
 *   الساعة ٦  تقرير العدالة، وقفلُ المحرك.
 *
 * وكل خطوة تُقاس: الزمن، والذاكرة، وما خرج عن نطاقه (يجب أن يكون صفرًا دائمًا)، وما تصادم
 * على موضعٍ واحد (صفر)، ومن بقي بلا نموذج (يُسمّى، لا يُبتلع).
 *
 * التشغيل:
 *   npx tsx scripts/live-day.ts [--participants=1000] [--halls=12] [--seed=...]
 */

import { createScopeEngineActions, type ScopeEngineHost } from '../src/lib/store-scope-actions';
import type { AppStoreState } from '../src/lib/store-state';
import type { Category, Participant } from '../src/types';
import { DEFAULT_SELECTION_RULE } from '../src/lib/participant-scope';
import { fullQuranScope, scopeFromJuz, scopeSignature } from '../src/lib/quran-scope';
import { SEED_COMPETITION, SEED_PARTICIPANTS } from '../src/lib/seed-data';

const arg = (name: string, fallback: number) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) || fallback : fallback;
};
const PARTICIPANTS = arg('participants', 1000);
const HALLS = arg('halls', 12);
const SEED = (process.argv.find(a => a.startsWith('--seed=')) || '--seed=live-day').split('=')[1];

/* عشوائيةٌ حتمية: اليوم نفسه يُعاد بالبذرة نفسها، فالعطب يُعاد إنتاجه لا يُطارد. */
let rngState = [...SEED].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5);
const rnd = () => { rngState = Math.imul(rngState ^ (rngState >>> 15), 0x2545f491) >>> 0; return rngState / 0x100000000; };
const pick = <T>(list: T[]) => list[Math.floor(rnd() * list.length)];

const ms = () => Number(process.hrtime.bigint() / 1_000_000n);
const heapMb = () => Math.round(process.memoryUsage().heapUsed / 1048576);
const fmt = (n: number) => n.toLocaleString('en-US');

// ---- بناء يومٍ ----------------------------------------------------------------------------

const QUARTER: Category = {
  id: 'cat-quarter', competitionId: SEED_COMPETITION.id, code: 'Q', name: 'Quarter', nameArabic: 'ربع القرآن',
  description: '', riwaya: 'حفص عن عاصم', memorizationScope: '', juzCount: 0, targetParticipants: PARTICIPANTS,
  targetDurationMinutes: 8, questionsCount: 3, scope: fullQuranScope(), scopeMode: 'participant_selected', scopeVersion: 1,
  selectionRule: { ...DEFAULT_SELECTION_RULE, version: 1, enabled: true, decidedBy: 'participant', selectionUnit: 'juz', exactUnits: 8, parentScope: fullQuranScope(), approval: 'committee' },
};

const participantAt = (i: number): Participant => ({
  ...SEED_PARTICIPANTS[0], id: `p${i}`, code: `A-${String(i).padStart(5, '0')}`,
  fullName: `Reciter ${i}`, fullNameArabic: `متسابق ${i}`, email: `r${i}@example.org`,
  categoryId: QUARTER.id, riwaya: 'Hafs', status: 'in_queue',
  assignedCommitteeId: `comm-${i % HALLS}`,
});

/* نطاقاتٌ واقعية: أغلبهم يختار الأجزاء الأولى، وقلّةٌ تختار المتفرّق — وهذا مصدر الازدحام. */
const chooseScope = () => {
  const roll = rnd();
  if (roll < 0.45) return scopeFromJuz([1, 2, 3, 4, 5, 6, 7, 8]);
  if (roll < 0.70) return scopeFromJuz([23, 24, 25, 26, 27, 28, 29, 30]);
  if (roll < 0.88) return scopeFromJuz([1, 2, 3, 4, 27, 28, 29, 30]);
  const start = 1 + Math.floor(rnd() * 22);
  return scopeFromJuz(Array.from({ length: 8 }, (_, k) => start + k));
};

const problems: string[] = [];
const note = (m: string) => { problems.push(m); console.log(`  ✗ ${m}`); };
const ok = (m: string) => console.log(`  ✓ ${m}`);
const step = (title: string) => console.log(`\n── ${title}`);

let ids = 0;
const audits: string[] = [];
const incidents: { title: string; description: string }[] = [];

const state = {
  currentUser: { id: 'usr-admin', name: 'Admin', nameArabic: 'مدير', email: 'a@b.c', role: 'comp_admin', organizationId: SEED_COMPETITION.organizationId },
  competition: { ...SEED_COMPETITION, categories: [QUARTER] },
  participants: Array.from({ length: PARTICIPANTS }, (_, i) => participantAt(i)),
  committees: Array.from({ length: HALLS }, (_, i) => ({ id: `comm-${i}`, judgeIds: [`j-${i}-1`, `j-${i}-2`] })),
  participantScopes: [], questionModels: [], questionModelBatches: [], questionQuarantines: [],
  questionReservations: [], fairnessReports: [], scopeSimulations: [], scopeEngineSeals: [],
  variantLoci: [], mutashabihatTrapMaps: [], quranSourceManifests: [], quranSourceContents: [],
  activeSession: { secureQuestionMode: 'CLIENT' },
} as unknown as AppStoreState;

const host: ScopeEngineHost = {
  getState: () => state,
  newId: (prefix) => `${prefix}-${++ids}`,
  notify: () => {},
  audit: (action) => { audits.push(action); },
  createIncident: (_k, title, description) => { incidents.push({ title, description }); },
  markConfigChanged: () => {},
  queueScopeUpload: () => {},
};
const engine = createScopeEngineActions(host);

const locusOf = (q: { surahNumber: number; startAyah: number }) => `${q.surahNumber}:${q.startAyah}`;

/** كل موضعٍ في كل نموذج سليم داخل نطاق صاحبه؟ هذا هو الوعد الذي لا يُساوَم عليه. */
function auditScopes(label: string) {
  let violations = 0, checked = 0;
  for (const model of state.questionModels) {
    if (model.status === 'invalidated' || !model.participantId) continue;
    const resolution = engine.participantEffectiveScope(model.participantId);
    if (!resolution || resolution.blocked) continue;
    const signature = resolution.signature || scopeSignature(resolution.scope);
    for (const q of model.questions) { checked++; if (model.scopeSignature !== signature) violations++; }
  }
  if (violations) note(`${label}: ${violations} موضعًا من ${checked} على نطاقٍ لم يعد نطاق صاحبه`);
  return { checked, violations };
}

/*
 * هل خرج موضعٌ واحد لاثنين **في اللحظة نفسها**؟
 *
 * والمكشوف ليس تزاحمًا: جلستُه انتهت. أن يُسأل متسابقٌ عن موضعٍ سُئل عنه غيرُه أمس أمرٌ
 * تحكمه سياسة التكرار ونموذج الانكشاف، لا دفترُ الحجز. والخلطُ بينهما هو ما جعل المقياس
 * يصرخ حيث لا شيء — وهو نفسه الخلط الذي كان في المنتج قبل إصلاحه.
 */
function auditCollisions(label: string) {
  const holder = new Map<string, string>();
  let collisions = 0;
  for (const record of state.questionReservations) {
    if (!['temporarily_reserved', 'assigned'].includes(record.state)) continue;
    const previous = holder.get(record.locusKey);
    if (previous && previous !== record.participantId) collisions++;
    else holder.set(record.locusKey, record.participantId || '');
  }
  if (collisions) note(`${label}: ${collisions} موضعًا بيد متسابقين في آنٍ واحد`);
  return collisions;
}

// ---- اليوم -------------------------------------------------------------------------------

console.log(`\n═══ يوم مسابقة حيّ · ${fmt(PARTICIPANTS)} متسابقًا · ${HALLS} قاعة · بذرة ${SEED} ═══`);
const dayStart = ms();

step('الساعة ٠ — التسجيل: كلٌّ يختار نطاقه');
let t = ms();
let rejected = 0, invalid = 0;
for (let i = 0; i < PARTICIPANTS; i++) {
  const outcome = engine.saveParticipantScope(`p${i}`, chooseScope(), { submit: true, reason: 'اختياري عند التسجيل' });
  if (!outcome.ok) invalid++;
}
if (invalid) note(`${invalid} اختيارًا رُفض عند الحفظ — والقاعدة تسمح بثمانية أجزاء لكلٍّ`);
else ok(`${fmt(PARTICIPANTS)} نطاقًا حُفظ في ${ms() - t}ms`);

t = ms();
for (let i = 0; i < PARTICIPANTS; i++) {
  /* اللجنة ترفض واحدًا من كل ثلاثين بسبب، فيُعيد صاحبه الاختيار — كما يقع فعلًا. */
  if (rnd() < 0.033) { engine.decideParticipantScope(`p${i}`, 'rejected', 'اختيارك أقل مما تشترطه اللائحة'); rejected++; }
  else engine.decideParticipantScope(`p${i}`, 'approved');
}
ok(`اللجنة قرّرت في ${ms() - t}ms — اعتُمد ${fmt(PARTICIPANTS - rejected)}، ورُفض ${rejected} بسببٍ مكتوب`);

t = ms();
let recovered = 0;
for (let i = 0; i < PARTICIPANTS; i++) {
  const record = engine.activeParticipantScope(`p${i}`);
  if (record?.status !== 'rejected') continue;
  engine.saveParticipantScope(`p${i}`, chooseScope(), { submit: true, reason: 'أعدتُ الاختيار بعد الرفض' });
  engine.decideParticipantScope(`p${i}`, 'approved');
  recovered++;
}
ok(`${recovered} مرفوضًا أعاد اختياره واعتُمد — في ${ms() - t}ms`);
const withHistory = state.participants.filter(p => engine.participantScopeHistory(p.id).length > 1).length;
if (withHistory !== recovered) note(`سجل النسخ لا يطابق من أعاد الاختيار: ${withHistory} مقابل ${recovered}`);
else ok(`سجل النسخ يحمل نسختين لكل من أعاد اختياره (${withHistory})`);

step('الساعة ١ — الدفعة: تُولَّد وتُعتمد وتُختم');
t = ms();
const batch = engine.generateQuestionModelBatch({ categoryId: QUARTER.id, reserveCount: 8, generationMode: 'pre_generated' });
const genMs = ms() - t;
if (!batch.ok) { note(`تعذّر توليد الدفعة: ${batch.reason}`); }
else {
  ok(`${fmt(batch.models.length)} نموذجًا و${batch.reserves.length} احتياطيًا في ${fmt(genMs)}ms (${(genMs / Math.max(1, batch.models.length)).toFixed(1)}ms للنموذج) · الذاكرة ${heapMb()}MB`);
  if (batch.failures.length) ok(`${batch.failures.length} حالةً أُعلن تعذّرها بسببها — لا صمت`);
  const batchId = batch.batch.id;
  engine.decideModelBatch(batchId, 'approved');
  engine.decideModelBatch(batchId, 'sealed');
  const executable = state.participants.filter(p => engine.preGeneratedModelFor(p.id)).length;
  ok(`الدفعة مختومة، و${fmt(executable)} متسابقًا لهم نموذجٌ يُنفَّذ في القاعة بلا إعادة سحب`);
}
auditScopes('بعد التوليد');

step('الساعة ٢ — القاعات تفتح: طوابيرُ تجري بالتوازي');
/*
 * القاعات اثنتا عشرة، لا ألف.
 *
 * فتحُ ألف جلسة في آنٍ واحد يقيس ما لا يقع: أكثر ما يكون مفتوحًا في لحظةٍ واحدة هو عدد
 * القاعات. فالطابور يجري هنا كما يجري فعلًا: كل قاعة تنادي واحدًا، فيُحجز موضعه، ثم يُكشف،
 * ثم ينتهي فيُخلي مكانه للتالي. والتزاحمُ الحقيقي هو ما يقع بين اثني عشر مفتوحًا لا بين ألف.
 */
t = ms();
let held = 0, refusedByHold = 0, sessions = 0, peakOpen = 0;
const queues: string[][] = Array.from({ length: HALLS }, () => []);
for (const p of state.participants) queues[Number(p.assignedCommitteeId!.split('-')[1])].push(p.id);
const open = new Map<string, string[]>();   // متسابق ← معرّفات حجوزه المفتوحة
const cursor = new Array(HALLS).fill(0);
let remaining = state.participants.length;
while (remaining > 0) {
  for (let hall = 0; hall < HALLS; hall++) {
    /* من كان في هذه القاعة ينهي جلسته: يُكشف سؤاله ثم يخرج. */
    const finishing = [...open.entries()].find(([id]) => state.participants.find(p => p.id === id)?.assignedCommitteeId === `comm-${hall}`);
    if (finishing) {
      engine.advanceReservations(finishing[1], 'revealed', 'كُشف السؤال في القاعة');
      open.delete(finishing[0]);
    }
    const next = queues[hall][cursor[hall]];
    if (next === undefined) continue;
    cursor[hall]++; remaining--;
    const model = engine.preGeneratedModelFor(next);
    if (!model) continue;
    const items = model.questions.map(q => ({ locusKey: locusOf(q), questionId: q.questionId }));
    const outcome = engine.reserveQuestionsForParticipant({ participantId: next, items, modelId: model.id, ttlSeconds: 900 });
    held += outcome.created.length;
    refusedByHold += outcome.conflicts.length;
    if (outcome.conflicts.length) {
      /* تزاحمٌ حقيقي: نموذجٌ مختوم يحمل موضعًا بيد جلسةٍ مفتوحة الآن. يُقال، لا يُبتلع. */
      note(`تزاحم في القاعة ${hall}: ${next} يحمل ${outcome.conflicts.length} موضعًا بيد جلسةٍ مفتوحة (${outcome.conflicts.map(c => c.locusKey).join('، ')})`);
    }
    if (outcome.created.length) {
      engine.advanceReservations(outcome.created.map(r => r.id), 'assigned', 'بدأت الجلسة');
      open.set(next, outcome.created.map(r => r.id));
    }
    sessions++;
    peakOpen = Math.max(peakOpen, open.size);
  }
  if (auditCollisions('أثناء الطابور')) break;
}
ok(`${fmt(sessions)} جلسة عبر ${HALLS} قاعة في ${fmt(ms() - t)}ms · ذروة المفتوح معًا ${peakOpen}`);
ok(`${fmt(held)} حجزًا${refusedByHold ? ` · و${fmt(refusedByHold)} تزاحمًا حقيقيًا` : ' · بلا تزاحم واحد'}`);
const collisions = auditCollisions('بعد انتهاء الطابور');
if (!collisions) ok('ولا موضع واحد بيد متسابقين في آنٍ واحد، طوال اليوم');

/*
 * الموضع نفسه في القاعة نفسها في اليوم نفسه.
 *
 * هذا ليس تزاحمًا — الأول انتهى قبل أن يُنادى الثاني. لكنه انكشاف: من سمع السؤال
 * يسمعه مرةً أخرى بعد قليل، وقد يكون في الصف نفسه. و«مباعدة القاعة» في المحرك
 * **عقوبةُ ترجيح** لا منعًا باتًّا (‎+0.6‎ في ميزان المباعدة، ويُقيَّد في `relaxed`
 * أي أن المحرك يعلن أنه رخّص)، فتُغلَب عند الشحّ. فيُقاس أثرها بدل أن يُفترض.
 */
const hallRepeats = (() => {
  const perHallLocus = new Map<string, number>();
  for (const m of state.questionModels) {
    if (m.status === 'invalidated' || !m.participantId) continue;
    const hall = state.participants.find(p => p.id === m.participantId)?.assignedCommitteeId;
    if (!hall) continue;
    for (const q of m.questions) {
      const key = `${hall}|${locusOf(q)}`;
      perHallLocus.set(key, (perHallLocus.get(key) || 0) + 1);
    }
  }
  const repeated = [...perHallLocus.entries()].filter(([, n]) => n > 1);
  const worst = repeated.sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { pairs: perHallLocus.size, repeated: repeated.length, worst };
})();
if (!hallRepeats.repeated) ok('ولا موضع تكرّر في قاعةٍ واحدة في اليوم نفسه');
else note(`${fmt(hallRepeats.repeated)} من ${fmt(hallRepeats.pairs)} زوج (قاعة، موضع) تكرّر في القاعة نفسها — أكثرها ${hallRepeats.worst.map(([k, n]) => `${k.split('|')[1]}×${n}`).join('، ')}`);

step('الساعة ٣ — يُكتشف عيبٌ في موضع: حجرٌ واسترداد');
const busiest = (() => {
  const counts = new Map<string, number>();
  for (const m of state.questionModels) if (m.status !== 'invalidated' && m.participantId) for (const q of m.questions) counts.set(locusOf(q), (counts.get(locusOf(q)) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
})();
console.log(`  · أكثر المواضع استعمالًا: ${busiest.map(([k, n]) => `${k}×${n}`).join(' · ')}`);
t = ms();
const before = state.questionModels.filter(m => m.status === 'sealed' && m.participantId).length;
const recovery = engine.recoverQuarantinedLoci({ locusKeys: busiest.map(([k]) => k), reason: 'خطأ في ضبط النص اكتُشف في القاعة', categoryId: QUARTER.id });
const recMs = ms() - t;
if (!recovery.ok) note(`تعذّر الاسترداد: ${recovery.reason}`);
else {
  const o = recovery.outcome;
  ok(`حُجر ${busiest.length} مواضع فبطل ${o.quarantine.invalidatedModels.length} نموذجًا · استُرد ${o.recovered.length} (${o.recovered.filter(r => r.via === 'reserve').length} باحتياط، ${o.recovered.filter(r => r.via === 'regenerated').length} بتوليد) في ${fmt(recMs)}ms`);
  if (o.unrecovered.length) ok(`${o.unrecovered.length} لم يُسترد — وكلٌّ مذكورٌ باسمه وسببه وله بلاغ`);
  const after = state.questionModels.filter(m => m.status === 'sealed' && m.participantId).length;
  if (after + o.unrecovered.length < before) note(`اختفى ${before - after - o.unrecovered.length} نموذجًا بلا تفسير`);
  else ok(`لا نموذج اختفى بلا حساب (${before} ← ${after} + ${o.unrecovered.length} معلنًا)`);
  const quarantined = new Set(busiest.map(([k]) => k));
  const leaked = state.questionModels.filter(m => m.status === 'sealed' && m.participantId && m.questions.some(q => quarantined.has(locusOf(q)))).length;
  if (leaked) note(`${leaked} نموذجًا سليمًا ما زال يحمل موضعًا محجورًا`);
  else ok('لا نموذج سليم يحمل موضعًا محجورًا');
}
auditScopes('بعد الحجر');
auditCollisions('بعد الحجر');

step('الساعة ٤ — متغيّبون: الحجوز تنقضي وتعود إلى المخزون');
const lapse = state.questionReservations.filter(() => rnd() < 0.06);
for (const r of lapse) { r.state = 'temporarily_reserved'; r.expiresAt = '2020-01-01T00:00:00.000Z'; }
t = ms();
const freed = engine.sweepExpiredReservations();
ok(`${fmt(freed)} حجزًا انقضى فعاد موضعه إلى المخزون في ${ms() - t}ms`);
const stillBlocked = [...engine.reservationBlockedLoci()].length;
ok(`${fmt(stillBlocked)} موضعًا ما زال محجوزًا فعلًا`);

step('الساعة ٥ — متسابقٌ يغيّر نطاقه بعد أن بدأ اليوم');
const changer = state.participants.find(p => engine.activeParticipantScope(p.id)?.status === 'locked' || engine.activeParticipantScope(p.id)?.status === 'approved')!;
const modelsBefore = state.questionModels.filter(m => m.participantId === changer.id && m.status !== 'invalidated').length;
engine.saveParticipantScope(changer.id, scopeFromJuz([11, 12, 13, 14, 15, 16, 17, 18]), { submit: true, reason: 'اكتشفتُ خطأً في اختياري' });
const modelsAfter = state.questionModels.filter(m => m.participantId === changer.id && m.status !== 'invalidated').length;
if (modelsBefore > 0 && modelsAfter >= modelsBefore) note(`تغيّر النطاق ولم يُبطل نموذجًا (${modelsBefore} ← ${modelsAfter}) — تغييرٌ صامت بعد الاعتماد`);
else ok(`تغيّر نطاق ${changer.code} فبطل ما بُني على نسخته السابقة (${modelsBefore} ← ${modelsAfter})`);
const resolution = engine.participantEffectiveScope(changer.id);
if (!resolution?.blocked) note('نطاقٌ أُرسل للمراجعة ولم يُعتمد بعد، ومع ذلك يُعدّ صالحًا للسحب');
else ok('ولا يُسحب له سؤال حتى تراجعه اللجنة');

step('الساعة ٦ — الجاهزية، والتقرير، والتجميد');
t = ms();
const readiness = engine.getScopeReadiness();
ok(`الجاهزية في ${ms() - t}ms: ${readiness.critical} مانعًا · ${readiness.warning} تنبيهًا · ${readiness.passed} سليمًا`);
for (const check of readiness.checks.filter(c => c.severity === 'critical')) console.log(`  · مانع: ${check.titleAr} — ${check.detailAr.slice(0, 110)}`);

t = ms();
const report = await engine.buildCompetitionFairnessReport({ categoryId: QUARTER.id });
if (!report.ok) note(`تعذّر التقرير: ${report.reason}${report.reason === 'PRIVACY_VIOLATION' ? ` (${report.leaks?.join('، ')})` : ''}`);
else {
  const floor = report.report.sections.find(s => s.id === 'floor')!;
  const bound = floor.rows.find(r => r.labelArabic.includes('أقل تكرار'))!.value;
  const reached = floor.rows.find(r => r.labelArabic.includes('ما بلغه'))!.value;
  const excess = floor.rows.find(r => r.labelArabic.includes('الزيادة'))!.value;
  ok(`التقرير في ${fmt(ms() - t)}ms · الحدّ الرياضي ${bound} · بلغ المحرك ${reached} · الزيادة ${excess}`);
  const names = state.participants.slice(0, 200).map(p => p.code);
  const text = JSON.stringify(report.report.sections);
  const leak = names.filter(n => text.includes(n));
  if (leak.length) note(`التقرير يحمل ${leak.length} كودَ متسابق`);
  else ok('ولا كود متسابقٍ واحد فيه');
}

// ---- الخلاصة ----------------------------------------------------------------------------

const totalMs = ms() - dayStart;
const models = state.questionModels.filter(m => m.participantId && m.status !== 'invalidated');
const draws = models.reduce((s, m) => s + m.questions.length, 0);
const uses = new Map<string, number>();
for (const m of models) for (const q of m.questions) uses.set(locusOf(q), (uses.get(locusOf(q)) || 0) + 1);
const counts = [...uses.values()];

console.log(`\n═══ الخلاصة ═══`);
console.log(`  متسابقون................. ${fmt(PARTICIPANTS)}`);
console.log(`  نماذج سارية.............. ${fmt(models.length)}`);
console.log(`  أسئلة مسحوبة............. ${fmt(draws)}`);
console.log(`  مواضع مستعملة............ ${fmt(uses.size)}`);
console.log(`  أكثر موضع استعمالًا....... ${counts.length ? Math.max(...counts) : 0}`);
console.log(`  حجوز قائمة............... ${fmt([...engine.reservationBlockedLoci()].length)}`);
console.log(`  نماذج مُبطلة.............. ${fmt(state.questionModels.filter(m => m.status === 'invalidated').length)}`);
console.log(`  بلاغات مفتوحة............ ${fmt(incidents.length)}`);
console.log(`  أحداث سجلّ................ ${fmt(audits.length)}`);
console.log(`  الذاكرة.................. ${heapMb()}MB`);
console.log(`  زمن اليوم كاملًا.......... ${fmt(totalMs)}ms`);

console.log(problems.length ? `\n${problems.length} ملاحظة تحتاج معالجة` : `\nاليوم مرّ سليمًا: لا موضع خرج عن نطاق صاحبه، ولا موضع خرج لاثنين، ولا نموذج اختفى بلا حساب.`);
process.exitCode = problems.length ? 1 : 0;
