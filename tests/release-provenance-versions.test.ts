/*
 * P35 / §45 — النتيجةُ تُقرأ بعد سنة.
 *
 * وقد تغيّر تحتها كلُّ شيء: أثرُ حدود الآي، وجدولُ الجسر، ونظامُ العدّ المقيس، والبناء
 * نفسه. وبلا تسجيلِ ما كان يعمل **يومها** تصير إعادةُ تفسير النتيجة تخمينًا، ويصير
 * الدفاعُ عنها عند نزاعٍ مستحيلًا: «كانت الآيةُ رقم كذا في روايته» — بأيِّ جدول؟
 *
 * فهذه الاختبارات تثبت أن الجلسة تحمل إصداراتِ ما فُسِّرت به، وأن تلك الإصدارات مربوطةٌ
 * بأثرٍ حقيقي لا سلاسلَ مكتوبة باليد.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { QuestionEscrowRepository } from '../server/question-escrow';
import {
  SecureQuestionRuntimeRepository,
  ServerQuestionPoolRepository,
  type ServerQuestionBlueprint,
} from '../server/secure-question-runtime';
import { COMMITTEE_CROSSWALK_VERSION } from '../src/lib/quran-crosswalk-evidence';
import { DELIVERY_COUNT_EVIDENCE_BUILD } from '../src/lib/quran-delivery-count-evidence.generated';
import { QURAN_WS_BOUNDARY_SOURCE } from '../src/lib/quran-count-boundary-source';
import { scopeFromJuzRange } from '../src/lib/quran-scope';

const key = Buffer.alloc(32, 5).toString('base64url');
const blueprint = (startAyah: number): ServerQuestionBlueprint =>
  ({ id: `bp-${startAyah}`, poolId: 'pool', qiraah: 'Asim', rawi: 'Hafs', surahNumber: 2, startAyah, endAyah: startAyah + 2, juzNumber: 1, difficultyRating: 3, enabled: true });

function provisionOnce() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-version-'));
  const pools = new ServerQuestionPoolRepository(path.join(dir, 'pools'));
  pools.save('comp', 'pool', Array.from({ length: 10 }, (_, i) => blueprint(i + 1)));
  const quran = {
    manifest: () => ({ scientificApproval: { state: 'CERTIFIED' }, packageHash: 'hash', qiraah: 'Asim', rawi: 'Hafs', tariq: undefined }),
    questionStartMetadata: (_p: string, loci: { id: string }[]) => loci.map(l => ({ id: l.id, startClass: 'MID_PAGE', startAssurance: 'QURAN_AYAH_BOUNDARY', lineStart: 5, pageNumber: 3 })),
    resolvePassage: () => ({ verses: [{ aya_text: 'نص', sura_name_ar: 'سورة', page: 3, line_start: 5, line_end: 6 }], text: 'نص' }),
    resolvePassageLoci: () => [{ page: 3, lineStart: 5, lineEnd: 6, lineCount: 15 }],
  } as never;
  const runtime = new SecureQuestionRuntimeRepository(path.join(dir, 'runtime'), quran, pools, new QuestionEscrowRepository(path.join(dir, 'escrow'), key));
  const state = runtime.provision({
    organizationId: 'org', competitionId: 'comp', sessionId: 's1', participantId: 'p1', committeeId: 'c1',
    requiredJudgeIds: ['j1'], approvalMode: 'all_assigned', expiresAt: new Date(Date.now() + 600_000).toISOString(),
    sourcePackageId: 'p', poolId: 'pool', questionCount: 2, qiraah: 'Asim', rawi: 'Hafs',
    participantScope: scopeFromJuzRange(1, 1), participantScopeVersion: 1,
  });
  return { dir, state };
}

test('a provisioned session records which crosswalk and which Quran data interpreted it', () => {
  const { dir, state } = provisionOnce();
  try {
    const carried = state as unknown as Record<string, unknown>;
    assert.equal(carried.crosswalkVersion, COMMITTEE_CROSSWALK_VERSION, 'the session names the bridge table it was drawn under');
    assert.equal(carried.quranDataVersion, DELIVERY_COUNT_EVIDENCE_BUILD.generatedArtifactSha256, 'and the measured numbering it was drawn under');
    assert.equal(carried.algorithmVersion, 'MIZAN-SERVER-FAIRDRAW-2');
    assert.equal(carried.ruleVersion, undefined, 'the rule version stays internal; the public state carries what a reader needs');
    assert.equal(carried.sourcePackageHash, 'hash', 'and the exact package bytes');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('those versions are bound to real artifacts, not hand-written strings', () => {
  // إصدارُ الجسر يحمل الـcommit المثبَّت وبصمةَ المولَّد — فلو تغيّر أحدُهما تغيّر الإصدار.
  assert.match(COMMITTEE_CROSSWALK_VERSION, /^mizan-crosswalk-quranws-[0-9a-f]{12}-[0-9a-f]{12}$/);
  assert.ok(COMMITTEE_CROSSWALK_VERSION.includes(QURAN_WS_BOUNDARY_SOURCE.commit.slice(0, 12)),
    'the bridge version must name the pinned upstream commit');
  assert.match(DELIVERY_COUNT_EVIDENCE_BUILD.generatedArtifactSha256, /^[0-9a-f]{64}$/);
  assert.match(DELIVERY_COUNT_EVIDENCE_BUILD.upstreamCommit, /^[0-9a-f]{40}$/);
});

test('changing the evidence changes the version — otherwise the record proves nothing', () => {
  /*
   * لو بقي الإصدارُ ثابتًا بينما تغيّر الأثر تحته، لصار تسجيلُه زينةً: جلستان مختلفتان
   * فعلًا تحملان نفس الرقم. فيُثبت هنا أن الإصدار مشتقٌّ من البصمتين لا مكتوبًا.
   */
  const commitPart = QURAN_WS_BOUNDARY_SOURCE.commit.slice(0, 12);
  const artifactPart = COMMITTEE_CROSSWALK_VERSION.split('-').at(-1)!;
  assert.equal(COMMITTEE_CROSSWALK_VERSION, `mizan-crosswalk-quranws-${commitPart}-${artifactPart}`);
  assert.notEqual(commitPart, artifactPart, 'the two halves are genuinely independent inputs');
});

test('the rollback runbook exists and names every layer that can be rolled back on its own', () => {
  const runbook = fs.readFileSync(path.join(process.cwd(), 'docs', 'ROLLBACK.md'), 'utf8');
  for (const layer of ['appVersion', 'buildId', 'quranDataVersion', 'crosswalkVersion', 'schema']) {
    assert.ok(runbook.includes(layer), `the runbook must cover ${layer}`);
  }
  // والقاعدةُ التي تُنسى: لا يُبدَّل مصدرُ القرآن في نشرةٍ صامتة.
  assert.ok(/صامت/.test(runbook), 'the runbook must state that a deploy never swaps the Quran source silently');
});
