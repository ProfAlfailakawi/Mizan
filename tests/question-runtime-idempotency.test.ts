/*
 * P19 — تهيئةُ الجلسة تُعاد بلا ضرر.
 *
 * نداءُ التهيئة يتكرّر بلا خطأٍ من أحد: انقطاعُ شبكةٍ بعد نجاح الخادم، أو إعادةُ محاولةٍ
 * تلقائية، أو ضغطةٌ مزدوجة في قاعةٍ مفتوحة. وكان الردّ دائمًا `SESSION_EXISTS`، فيقف
 * المنظّم أمام خطأٍ والجلسةُ في الحقيقة جاهزة — فيُعيد المحاولة بمعرّفٍ جديد، فتصير
 * للمتسابق جلستان وسؤالان.
 *
 * فالمطلوب دلالتان لا واحدة:
 *   · نفسُ الطلب ⇒ نفسُ الجلسة، بلا سؤالٍ ثانٍ ولا ظرفٍ ثانٍ ولا بذرةٍ ثانية.
 *   · طلبٌ مختلفٌ بنفس المعرّف ⇒ تعارضٌ يُردّ باسمه، لا دمجٌ صامت.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  SecureQuestionRuntimeRepository,
  ServerQuestionPoolRepository,
  type RuntimeProvisionInput,
  type ServerQuestionBlueprint,
} from '../server/secure-question-runtime';
import { QuestionEscrowRepository } from '../server/question-escrow';
import { scopeFromJuzRange } from '../src/lib/quran-scope';

const key = Buffer.alloc(32, 7).toString('base64url');
const blueprint = (surah: number, startAyah: number, juz: number): ServerQuestionBlueprint =>
  ({ id: `bp-${surah}-${startAyah}`, poolId: 'pool', qiraah: 'Asim', rawi: 'Hafs', surahNumber: surah, startAyah, endAyah: startAyah + 2, juzNumber: juz, difficultyRating: 3, enabled: true });

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-idem-'));
  const pools = new ServerQuestionPoolRepository(path.join(dir, 'pools'));
  pools.save('comp', 'pool', Array.from({ length: 12 }, (_, i) => blueprint(2, i + 1, 1)));
  const escrow = new QuestionEscrowRepository(path.join(dir, 'escrow'), key);
  const quran = {
    manifest: () => ({ scientificApproval: { state: 'CERTIFIED' }, packageHash: 'hash', qiraah: 'Asim', rawi: 'Hafs', tariq: undefined }),
    questionStartMetadata: (_p: string, loci: { id: string }[]) => loci.map(l => ({ id: l.id, startClass: 'MID_PAGE', startAssurance: 'QURAN_AYAH_BOUNDARY', lineStart: 5, pageNumber: 3 })),
    resolvePassage: () => ({ verses: [{ aya_text: 'نص', sura_name_ar: 'سورة', page: 3, line_start: 5, line_end: 6 }], text: 'نص' }),
    resolvePassageLoci: () => [{ page: 3, lineStart: 5, lineEnd: 6, lineCount: 15 }],
  } as never;
  const runtimeRoot = path.join(dir, 'runtime');
  const runtime = new SecureQuestionRuntimeRepository(runtimeRoot, quran, pools, escrow);
  const input = (over: Partial<RuntimeProvisionInput> = {}): RuntimeProvisionInput => ({
    organizationId: 'org', competitionId: 'comp', sessionId: 's1', participantId: 'p1', committeeId: 'c1',
    requiredJudgeIds: ['j1'], approvalMode: 'all_assigned',
    // وقتٌ جديد في كل نداء — هكذا تبدو إعادةُ المحاولة الحقيقية.
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    sourcePackageId: 'p', poolId: 'pool', questionCount: 2, qiraah: 'Asim', rawi: 'Hafs',
    participantScope: scopeFromJuzRange(1, 1), participantScopeVersion: 3,
    ...over,
  });
  const sessionFiles = () => fs.readdirSync(runtimeRoot).filter(n => n.startsWith('question-runtime-') && n.endsWith('.json'));
  return { dir, runtime, escrow, input, runtimeRoot, sessionFiles };
}

const wire = (value: unknown) => JSON.parse(JSON.stringify(value));

test('a sequential retry of the same request returns the same session and draws nothing new', () => {
  const f = fixture();
  try {
    const first = f.runtime.provision(f.input());
    const seed = f.runtime.revealFairDrawSeed('s1');

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const retry = f.runtime.provision(f.input());
      assert.deepEqual(wire(retry), wire(first), `retry ${attempt} must return the identical model`);
    }

    assert.equal(f.sessionFiles().length, 1, 'exactly one session record exists');
    const after = f.runtime.revealFairDrawSeed('s1');
    assert.deepEqual(after.selectionIds, seed.selectionIds, 'the drawn question set is untouched');
    assert.equal(after.seedCommitmentHash, seed.seedCommitmentHash, 'no second seed was committed');
    assert.equal(first.questionCount, 2);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('a concurrent retry from a second repository instance returns the same session', () => {
  const f = fixture();
  try {
    /*
     * نسختان من المستودع على المسار نفسه — كحالة نسختين من الخادم خلف موازِن حِمل.
     * القفلُ الحصري يمنع أن تكتب كلٌّ منهما ظرفًا وأسئلةً لمعرّفٍ واحد.
     */
    const first = f.runtime.provision(f.input());
    const second = new SecureQuestionRuntimeRepository(
      f.runtimeRoot,
      { manifest: () => ({ scientificApproval: { state: 'CERTIFIED' }, packageHash: 'hash', qiraah: 'Asim', rawi: 'Hafs' }) } as never,
      new ServerQuestionPoolRepository(path.join(f.dir, 'pools')),
      new QuestionEscrowRepository(path.join(f.dir, 'escrow'), key),
    );
    assert.deepEqual(wire(second.provision(f.input())), wire(first));
    assert.equal(f.sessionFiles().length, 1);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('a genuinely different request under the same session id is a named conflict, never a silent merge', () => {
  const f = fixture();
  try {
    f.runtime.provision(f.input());
    const conflicts: Array<Partial<RuntimeProvisionInput>> = [
      { participantId: 'p2' },
      { questionCount: 3 },
      { committeeId: 'c2' },
      { requiredJudgeIds: ['j1', 'j2'] },
      { participantScope: scopeFromJuzRange(1, 2) },
      { sourcePackageId: 'other-package' },
    ];
    for (const over of conflicts) {
      assert.throws(() => f.runtime.provision(f.input(over)), /QUESTION_RUNTIME_SESSION_EXISTS/, JSON.stringify(over));
    }
    assert.equal(f.sessionFiles().length, 1, 'a refused conflict leaves no partial second session behind');
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('only the expiry may differ between a request and its retry', () => {
  const f = fixture();
  try {
    const first = f.runtime.provision(f.input({ expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    const later = f.runtime.provision(f.input({ expiresAt: new Date(Date.now() + 3_600_000).toISOString() }));
    assert.deepEqual(wire(later), wire(first), 'a fresher expiry is still the same logical request');
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('a stale lock left by a crashed process does not silently create a second session', () => {
  const f = fixture();
  try {
    // قفلٌ بلا سجلّ: نداءٌ سابق مات في منتصفه. لا يُخترع سجلٌّ ولا يُدَّعى نجاح.
    fs.mkdirSync(f.runtimeRoot, { recursive: true });
    fs.writeFileSync(path.join(f.runtimeRoot, 'question-runtime-s1.json.lock'), '');
    assert.throws(() => f.runtime.provision(f.input()), /QUESTION_RUNTIME_SESSION_IN_PROGRESS/);
    assert.equal(f.sessionFiles().length, 0);
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});

test('the lock is released after a successful provision and after a failed one', () => {
  const f = fixture();
  try {
    f.runtime.provision(f.input());
    assert.equal(fs.existsSync(path.join(f.runtimeRoot, 'question-runtime-s1.json.lock')), false);

    // نداءٌ يفشل داخل القفل (عدد أسئلةٍ غير صالح) يجب ألّا يترك القفل خلفه.
    assert.throws(() => f.runtime.provision(f.input({ sessionId: 's2', questionCount: 0 })), /QUESTION_RUNTIME_INVALID_COUNT/);
    assert.equal(fs.existsSync(path.join(f.runtimeRoot, 'question-runtime-s2.json.lock')), false);
    // والمحاولة الصحيحة بعده تنجح، فالقفل لم يُبقِ البابَ مغلقًا.
    assert.ok(f.runtime.provision(f.input({ sessionId: 's2' })));
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
});
