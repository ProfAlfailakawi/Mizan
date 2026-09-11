import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ServerQuestionPoolRepository, SecureQuestionRuntimeRepository, type ServerQuestionBlueprint } from '../server/secure-question-runtime';
import { QuestionEscrowRepository } from '../server/question-escrow';
import { scopeFromAyahRange } from '../src/lib/quran-scope';
import { blockedLocusKeys, expireReservations, reserveQuestions } from '../src/lib/question-reservation';
import type { QuestionReservationRecord } from '../src/types';

/*
 * التزامن الحقيقي ليس عشر جلسات: هو قاعةٌ تفتح خمسين جهازًا في دقيقة واحدة، ثم مئة.
 * والسؤال الوحيد هنا: هل يخرج الموضع الواحد إلى متسابقين في آنٍ واحد؟ الجواب يجب أن يكون
 * «لا» دائمًا، وأن يكون الرفض صريحًا لا صمتًا.
 */

const key = Buffer.alloc(32, 9).toString('base64url');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-conc-'));

const blueprint = (surah: number, startAyah: number, endAyah: number, juz: number): ServerQuestionBlueprint =>
  ({ id: `bp-${surah}-${startAyah}`, poolId: 'pool', qiraah: 'Asim', rawi: 'Hafs', surahNumber: surah, startAyah, endAyah, juzNumber: juz, difficultyRating: 3, enabled: true });

function fixture(pool: ServerQuestionBlueprint[]) {
  const dir = tmp();
  const pools = new ServerQuestionPoolRepository(path.join(dir, 'pools'));
  pools.save('comp', 'pool', pool);
  const escrow = new QuestionEscrowRepository(path.join(dir, 'escrow'), key);
  const quran = {
    manifest: () => ({ scientificApproval: { state: 'CERTIFIED' }, packageHash: 'hash', qiraah: 'Asim', rawi: 'Hafs', tariq: undefined }),
    questionStartMetadata: (_p: string, loci: { id: string }[]) => loci.map(l => ({ id: l.id, startClass: 'MID_PAGE', startAssurance: 'QURAN_AYAH_BOUNDARY', lineStart: 5, pageNumber: 3 })),
    resolvePassage: () => ({ verses: [{ aya_text: 'نص', sura_name_ar: 'سورة', page: 3, line_start: 5, line_end: 6 }], text: 'نص' }),
    resolvePassageLoci: () => [{ page: 3, lineStart: 5, lineEnd: 6, lineCount: 15 }],
  } as never;
  const runtime = new SecureQuestionRuntimeRepository(path.join(dir, 'runtime'), quran, pools, escrow);
  const provision = (sessionId: string, participantId: string, participantScope: ReturnType<typeof scopeFromAyahRange>) => runtime.provision({
    organizationId: 'org', competitionId: 'comp', sessionId, participantId, committeeId: 'c1',
    requiredJudgeIds: ['j1'], approvalMode: 'all_assigned', expiresAt: new Date(Date.now() + 600_000).toISOString(),
    sourcePackageId: 'p', poolId: 'pool', questionCount: 2, qiraah: 'Asim', rawi: 'Hafs',
    participantScope, participantScopeVersion: 3,
  });
  return { dir, runtime, provision };
}

const concurrentProvisionRun = async (sessions: number, poolSize: number) => {
  const pool = Array.from({ length: poolSize }, (_, i) => blueprint(2, i + 1, i + 2, 1));
  const f = fixture(pool);
  try {
    const scope = scopeFromAyahRange({ surah: 2, ayah: 1 }, { surah: 2, ayah: poolSize + 2 });
    const ids = Array.from({ length: sessions }, (_, i) => `s-${sessions}-${i}`);
    const outcomes = await Promise.allSettled(ids.map(async (id, i) => f.provision(id, `p-${sessions}-${i}`, scope)));
    const succeeded = ids.filter((_, i) => outcomes[i].status === 'fulfilled');
    const owner = new Map<string, string>();
    let collisions = 0;
    for (const id of succeeded) {
      for (const blueprintId of f.runtime.revealFairDrawSeed(id).selectionIds) {
        if (owner.has(blueprintId)) collisions++;
        else owner.set(blueprintId, id);
      }
      assert.deepEqual(f.runtime.verifyAllocationScope(id).violations, [], `session ${id} allocated outside its scope`);
    }
    return { succeeded: succeeded.length, requested: sessions, collisions, distinctLoci: owner.size };
  } finally { fs.rmSync(f.dir, { recursive: true, force: true }); }
};

test('fifty concurrent provisions never hand the same locus to two participants', async () => {
  const result = await concurrentProvisionRun(50, 200);
  assert.ok(result.succeeded > 0, 'at least one provision completes under fifty-way concurrency');
  assert.equal(result.collisions, 0);
  assert.equal(result.distinctLoci, result.succeeded * 2, 'every successful session holds two loci of its own');
});

test('one hundred concurrent provisions behave the same, with no silent doubling', async () => {
  const result = await concurrentProvisionRun(100, 400);
  assert.ok(result.succeeded > 0);
  assert.equal(result.collisions, 0);
  assert.equal(result.distinctLoci, result.succeeded * 2);
});

test('a hundred simultaneous reservation requests on one locus produce exactly one holder', () => {
  let counter = 0;
  const newId = (prefix: string) => `${prefix}-${++counter}`;
  const now = '2026-05-01T08:00:00.000Z';
  let records: QuestionReservationRecord[] = [];
  let granted = 0;
  let refused = 0;
  for (let i = 0; i < 100; i++) {
    const outcome = reserveQuestions({
      records, organizationId: 'org', competitionId: 'comp',
      items: [{ locusKey: '2:255', questionId: 'q-2:255' }],
      participantId: `p${i}`, idempotencyKey: `key-${i}`, actorId: 'server', now, newId,
    });
    records = outcome.records;
    granted += outcome.created.length;
    refused += outcome.conflicts.length;
  }
  assert.equal(granted, 1, 'one holder, not a hundred');
  assert.equal(refused, 99, 'the ninety-nine are refused explicitly, never silently');
  assert.equal(blockedLocusKeys(records, now).size, 1);
});

test('a retried request under load does not double-book, no matter how often it repeats', () => {
  let counter = 0;
  const newId = (prefix: string) => `${prefix}-${++counter}`;
  const now = '2026-05-01T08:00:00.000Z';
  let records: QuestionReservationRecord[] = [];
  for (let i = 0; i < 50; i++) {
    records = reserveQuestions({
      records, organizationId: 'org', competitionId: 'comp',
      items: [{ locusKey: '18:10', questionId: 'q-18:10' }],
      participantId: 'p1', idempotencyKey: 'one-and-only', actorId: 'server', now, newId,
    }).records;
  }
  assert.equal(records.length, 1);
});

test('a hundred lapsed holds are swept in one pass and every locus returns to the pool', () => {
  let counter = 0;
  const newId = (prefix: string) => `${prefix}-${++counter}`;
  const now = '2026-05-01T08:00:00.000Z';
  let records: QuestionReservationRecord[] = [];
  for (let i = 0; i < 100; i++) {
    records = reserveQuestions({
      records, organizationId: 'org', competitionId: 'comp',
      items: [{ locusKey: `2:${i + 1}`, questionId: `q${i}` }],
      participantId: `p${i}`, idempotencyKey: `k${i}`, actorId: 'server', now, ttlSeconds: 60, newId,
    }).records;
  }
  const later = new Date(new Date(now).getTime() + 61_000).toISOString();
  const swept = expireReservations(records, later);
  assert.equal(swept.changed.length, 100);
  assert.equal(blockedLocusKeys(swept.records, later).size, 0);
});
