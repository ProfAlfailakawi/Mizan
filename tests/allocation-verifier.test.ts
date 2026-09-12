import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scopeFromJuz, scopeFromJuzRange } from '../src/lib/quran-scope';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { runCompetitionTwin, syntheticParticipants } from '../src/lib/competition-twin';
import { DEFAULT_REPEAT_POLICY } from '../src/lib/repeat-policy';
import { autoBalancedPlan } from '../src/lib/question-zones';
import { buildAllocationSnapshot } from '../src/lib/allocation-snapshot';
import { verifyAllocationSnapshot, type AllocationSnapshot } from '../src/lib/allocation-verifier';

/*
 * تدقيقٌ يُصدَّق لأنه يرفض.
 *
 * مدقّقٌ يقول «سليم» دائمًا ليس مدقّقًا. فلا يُقبل هنا أن يمرّ التخصيص الصحيح وحده؛ يجب
 * أن يُفسَد التخصيص عمدًا — الموضع، والرواية، ونسخة النطاق، والمنطقة، ولقطة البنك، وتاريخ
 * المتسابق، وحالة السقف، وبصمة اللائحة — وأن تُرفض كلُّ واحدةٍ منها باسمها.
 */

const reading = { qiraahId: 'asim', rawiId: 'hafs' };
const juz30 = scopeFromJuz([30]);

async function freshSnapshot() {
  const candidates = projectCandidatesFromScope(juz30, { passageAyahCount: 3, reading });
  const participants = syntheticParticipants({
    count: 220, categoryId: 'cat-a', questionCount: 3,
    scopes: [{ scope: juz30, share: 1 }], reading, halls: 2, prefix: 'v',
  });
  const plan = autoBalancedPlan(juz30, 3);
  const twin = runCompetitionTwin({
    competitionId: 'verifier-fixture', participants, candidates,
    defaultPlan: plan,
    repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', maxUsesPerQuestion: 3 },
    targetDifficulty: 3, seed: 'verifier-fixture', collectAssignments: true,
  });
  assert.ok((twin.assignments || []).length > 0, 'التوأم لم يُخرج تخصيصات');
  const snapshot = await buildAllocationSnapshot({
    competitionId: 'verifier-fixture',
    policyVersion: 'POLICY-TEST-1',
    repeatPolicy: { ...DEFAULT_REPEAT_POLICY, mode: 'balanced_reuse', maxUsesPerQuestion: 3 },
    participants: participants.map(p => ({
      participantId: p.participantId, categoryId: p.categoryId, scope: p.scope,
      questionCount: p.questionCount, reading: p.reading, hallId: p.hallId,
    })),
    candidates,
    defaultPlan: plan,
    allocations: (twin.assignments || []).map(row => ({
      participantId: row.participantId, zoneId: row.zoneId, slotIndex: row.slotIndex,
      questionId: row.questionId, locusKey: row.locusKey,
    })),
  });
  return snapshot;
}

const clone = (snapshot: AllocationSnapshot): AllocationSnapshot => JSON.parse(JSON.stringify(snapshot));

test('المدقّق لا يستورد محرّك السحب — استقلاله مفحوصٌ نصًّا لا موعودٌ به', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, '..', 'src', 'lib', 'allocation-verifier.ts'), 'utf8');
  /* التعليقات تُنزع أولًا: ذكرُ المحرّك شرحًا مباح، واستدعاؤه هو الممنوع. */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map(match => match[1]);
  assert.ok(!imports.includes('./question-engine'), 'المدقّق يستورد المحرّك — فقد استقلاله');
  assert.ok(!imports.some(name => name.includes('competition-twin') || name.includes('fairdraw') || name.includes('allocation-snapshot')), 'المدقّق يستورد من جهة البناء');
  assert.ok(!code.includes('QuestionAllocationEngine'), 'المدقّق يذكر المحرّك في شيفرته');
  assert.ok(!code.includes('selectForParticipant'), 'المدقّق يستدعي دالة الاختيار');
});

test('تخصيصٌ سليم يمرّ بلا مخالفة واحدة', async () => {
  const snapshot = await freshSnapshot();
  const report = await verifyAllocationSnapshot(snapshot);
  assert.deepEqual(report.findings.filter(f => f.severity === 'violation'), [], 'التخصيص السليم لا يُرفض');
  assert.equal(report.passed, true);
  assert.equal(report.policyHashMatches, true);
  assert.ok(report.allocationsChecked >= 600);
});

test('إفسادٌ متعمَّد: تبديل الموضع إلى خارج نطاق المتسابق يُرفض', async () => {
  const snapshot = clone(await freshSnapshot());
  // موضعٌ من الجزء الأول يُدسّ في بنكٍ كله من الجزء الثلاثين.
  snapshot.pool.push({
    questionId: 'forged-1', locusKey: '2:10', surahNumber: 2, startAyah: 10, endAyah: 12,
    approvalStatus: 'approved', difficultyAssurance: 'human_reviewed', qiraahId: 'asim', rawiId: 'hafs',
  });
  snapshot.allocations[0] = { ...snapshot.allocations[0], questionId: 'forged-1', locusKey: '2:10' };
  const report = await verifyAllocationSnapshot(snapshot);
  assert.ok(report.findings.some(f => f.code === 'OUT_OF_PARTICIPANT_SCOPE'), 'خروج الموضع عن النطاق لم يُكشف');
  assert.equal(report.passed, false);
});

test('إفسادٌ متعمَّد: تبديل الرواية يُرفض', async () => {
  const snapshot = clone(await freshSnapshot());
  const used = snapshot.allocations[0].questionId;
  const item = snapshot.pool.find(row => row.questionId === used)!;
  item.rawiId = 'warsh';
  const report = await verifyAllocationSnapshot(snapshot);
  assert.ok(report.findings.some(f => f.code === 'READING_MISMATCH'), 'اختلاف الرواية لم يُكشف');
});

test('إفسادٌ متعمَّد: تضييق نسخة النطاق بعد السحب يُكشف', async () => {
  const snapshot = clone(await freshSnapshot());
  // النطاق المعتمد يُبدَّل إلى جزءٍ آخر: كل سحبات هذا المتسابق تصير خارج نطاقه.
  const victim = snapshot.participants[0];
  victim.scope = scopeFromJuzRange(1, 2);
  victim.scopeVersion = (victim.scopeVersion || 1) + 1;
  const report = await verifyAllocationSnapshot(snapshot);
  const hits = report.findings.filter(f => f.code === 'OUT_OF_PARTICIPANT_SCOPE' && f.participantId === victim.participantId);
  assert.equal(hits.length, victim.questionCount, 'تبديل النطاق لم يُكشف على كل سحبات صاحبه');
});

test('إفسادٌ متعمَّد: نسبة السحبة إلى منطقة لا تحويها يُرفض', async () => {
  const snapshot = clone(await freshSnapshot());
  const target = snapshot.allocations.find(row => row.zoneId);
  assert.ok(target, 'الخطة بلا مناطق — لا معنى للفحص');
  const participant = snapshot.participants.find(p => p.participantId === target!.participantId)!;
  const otherZone = participant.zones.find(z => z.zoneId !== target!.zoneId);
  assert.ok(otherZone, 'لا توجد منطقة ثانية');
  target!.zoneId = otherZone!.zoneId;
  const report = await verifyAllocationSnapshot(snapshot);
  assert.ok(report.findings.some(f => f.code === 'OUT_OF_ZONE'), 'نسبة السحبة إلى منطقة أخرى لم تُكشف');
});

test('إفسادٌ متعمَّد: حذف السؤال من لقطة البنك يُرفض', async () => {
  const snapshot = clone(await freshSnapshot());
  const used = snapshot.allocations[0].questionId;
  snapshot.pool = snapshot.pool.filter(row => row.questionId !== used);
  const report = await verifyAllocationSnapshot(snapshot);
  assert.ok(report.findings.some(f => f.code === 'QUESTION_NOT_IN_POOL'), 'سؤالٌ ليس في البنك مرّ');
});

test('إفسادٌ متعمَّد: موضعٌ سبق أن رآه المتسابق يُرفض', async () => {
  const snapshot = clone(await freshSnapshot());
  const first = snapshot.allocations[0];
  const participant = snapshot.participants.find(p => p.participantId === first.participantId)!;
  participant.priorHistory = [first.locusKey];
  const report = await verifyAllocationSnapshot(snapshot);
  assert.ok(report.findings.some(f => f.code === 'REPEAT_FOR_PARTICIPANT'), 'إعادة موضعٍ على صاحبه لم تُكشف');
});

test('إفسادٌ متعمَّد: خفض سقف الاستعمال يكشف كل تجاوز', async () => {
  const snapshot = clone(await freshSnapshot());
  snapshot.policy.maxUsesPerQuestion = 1;
  snapshot.policyHash = undefined;
  const report = await verifyAllocationSnapshot(snapshot);
  assert.ok(report.findings.some(f => f.code === 'MAX_USES_EXCEEDED'), 'تجاوز السقف لم يُكشف');
});

test('إفسادٌ متعمَّد: تغيير اللائحة مع إبقاء بصمتها القديمة يُرفض', async () => {
  const snapshot = clone(await freshSnapshot());
  snapshot.policy.noRepeatWithinParticipant = false;
  const report = await verifyAllocationSnapshot(snapshot);
  assert.ok(report.findings.some(f => f.code === 'POLICY_HASH_MISMATCH'), 'اللائحة بُدّلت والبصمة أُبقيت ولم يُكشف');
  assert.equal(report.policyHashMatches, false);
});

test('إفسادٌ متعمَّد: حجزٌ لغير صاحبه، وحجرٌ على موضعٍ مخصَّص — كلاهما يُرفض', async () => {
  const snapshot = clone(await freshSnapshot());
  const first = snapshot.allocations[0];
  const second = snapshot.allocations.find(row => row.participantId !== first.participantId && row.locusKey !== first.locusKey)!;
  snapshot.reservations = [{ locusKey: first.locusKey, state: 'assigned', participantId: 'someone-else' }];
  snapshot.quarantinedLocusKeys = [second.locusKey];
  const report = await verifyAllocationSnapshot(snapshot);
  assert.ok(report.findings.some(f => f.code === 'RESERVED_FOR_ANOTHER'), 'الحجز لغير صاحبه لم يُكشف');
  assert.ok(report.findings.some(f => f.code === 'QUARANTINED_LOCUS'), 'الحجر لم يُكشف');
});

test('إفسادٌ متعمَّد: مفتاح موضعٍ لا يوافق مقطع السؤال يُرفض', async () => {
  const snapshot = clone(await freshSnapshot());
  snapshot.allocations[0].locusKey = '78:1';
  const report = await verifyAllocationSnapshot(snapshot);
  assert.ok(report.findings.some(f => f.code === 'LOCUS_KEY_MISMATCH'), 'مفتاح موضعٍ مزوّر مرّ');
});

test('كلُّ إفسادٍ يُرفض: لا قبولٌ كاذب واحد في اثنتي عشرة محاولة', async () => {
  const base = await freshSnapshot();
  const corruptions: { name: string; apply: (snapshot: AllocationSnapshot) => void }[] = [
    { name: 'locus', apply: s => { s.allocations[0].locusKey = '1:1'; } },
    { name: 'reading', apply: s => { s.pool.find(row => row.questionId === s.allocations[1].questionId)!.rawiId = 'qalun'; } },
    { name: 'scope', apply: s => { s.participants[1].scope = scopeFromJuzRange(3, 4); } },
    { name: 'zone', apply: s => { const hit = s.allocations.find(a => a.zoneId); if (hit) hit.zoneId = 'zone-does-not-exist'; } },
    { name: 'pool', apply: s => { s.pool = s.pool.filter(row => row.questionId !== s.allocations[2].questionId); } },
    { name: 'history', apply: s => { s.participants[2].priorHistory = [s.allocations.find(a => a.participantId === s.participants[2].participantId)!.locusKey]; } },
    { name: 'max-use', apply: s => { s.policy.maxUsesPerQuestion = 1; s.policyHash = undefined; } },
    { name: 'policy-hash', apply: s => { s.policy.mode = 'strict_no_repeat'; } },
    { name: 'approval', apply: s => { s.pool.find(row => row.questionId === s.allocations[3].questionId)!.approvalStatus = 'quarantined'; } },
    { name: 'reservation', apply: s => { s.reservations = [{ locusKey: s.allocations[4].locusKey, state: 'temporarily_reserved', participantId: 'intruder' }]; } },
    { name: 'quarantine', apply: s => { s.quarantinedLocusKeys = [s.allocations[5].locusKey]; } },
    { name: 'model-size', apply: s => { s.allocations.push({ ...s.allocations[6], slotIndex: 9 }); } },
  ];
  const accepted: string[] = [];
  for (const corruption of corruptions) {
    const snapshot = clone(base);
    corruption.apply(snapshot);
    const report = await verifyAllocationSnapshot(snapshot);
    if (report.passed) accepted.push(corruption.name);
  }
  assert.deepEqual(accepted, [], `إفسادٌ مرّ بلا رفض: ${accepted.join('، ')}`);
});
