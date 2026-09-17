import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CROSSWALK_PROPOSAL_ALGORITHM, proposeForReading } from '../scripts/quran-crosswalk-propose';
import { COMMITTEE_CROSSWALK_ROWS } from '../src/lib/quran-crosswalk-evidence';
import { MIZAN_IDENTITY_CROSSWALK, crosswalkCoverage, isReadingQuestionSafe } from '../src/lib/quran-locus-crosswalk';

/*
 * المقترح الآليّ أخطر ما في هذه الطبقة، لأنه يبدو جاهزًا. فيُحرَس بابُه من الجهتين:
 * لا يدخل الجدول العامل بذاته، ولا يرفع روايةً إلى «جاهزة للسؤال» بلا قرار لجنة.
 */

test('a proposal is explicitly shadow, and says so in its own payload', () => {
  const proposal = proposeForReading('hisham');
  assert.equal(proposal.active, false);
  assert.equal(proposal.automaticApproval, false);
  assert.equal(proposal.committeeDecisionRequired, true);
  assert.equal(proposal.algorithm, CROSSWALK_PROPOSAL_ALGORITHM);
  assert.match(proposal.caveat, /لا يُعدّ دليلًا/);
});

test('a proposal carries the digests of the exact bytes it was derived from', () => {
  const proposal = proposeForReading('ruways');
  assert.match(proposal.inputs.referenceSha256, /^[0-9a-f]{64}$/);
  assert.match(proposal.inputs.targetSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(proposal.inputs.referenceSha256, proposal.inputs.targetSha256);
  assert.match(String(proposal.inputs.upstreamCommit), /^[0-9a-f]{40}$/);
});

test('a surah enters the proposal only when every canonical boundary landed', () => {
  const proposal = proposeForReading('ibn-wardan');
  for (const surah of proposal.surahs) {
    if (surah.boundariesResolved) {
      assert.ok(Array.isArray(surah.rows) && surah.rows.length > 0, `surah ${surah.surah} carries its rows`);
      assert.equal(surah.rows!.length, surah.canonicalAyahs, 'every canonical ayah of the surah is mapped, not some of them');
      assert.equal(surah.reason, undefined);
    } else {
      assert.equal(surah.rows, undefined, `surah ${surah.surah} proposes nothing when a boundary is unknown`);
      assert.match(String(surah.reason), /UNRESOLVED_BOUNDARIES|ALIGNMENT_FAILED/);
    }
  }
  // والمقترح لا يغطّي كل السور — وهذا مُصرَّح به في العدّ لا مخفيّ.
  assert.ok(proposal.summary.unresolvedSurahs > 0, 'the proposal does not pretend to cover everything');
  assert.equal(proposal.summary.proposedSurahs + proposal.summary.unresolvedSurahs, proposal.summary.divergingSurahs);
});

test('generating a proposal changes nothing about what may be asked', () => {
  const before = crosswalkCoverage('hisham');
  proposeForReading('hisham');
  const after = crosswalkCoverage('hisham');
  assert.deepEqual(after, before, 'the working coverage is untouched by deriving a proposal');
  assert.equal(isReadingQuestionSafe('hisham'), false);
  assert.equal(MIZAN_IDENTITY_CROSSWALK.size, 0);
  assert.deepEqual([...COMMITTEE_CROSSWALK_ROWS], [], 'nothing was written into the committee evidence file');
});

test('the proposal is written to artifacts, which are never committed', () => {
  const ignore = fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf8');
  assert.match(ignore, /^artifacts\/$/m, 'proposals stay out of the repository');
});

test('the six blocked readings are exactly the ones a proposal is generated for', () => {
  const script = fs.readFileSync(path.join(process.cwd(), 'scripts', 'quran-crosswalk-propose.ts'), 'utf8');
  const targets = script.match(/const TARGETS = \[([^\]]*)\]/)![1]
    .split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
  assert.deepEqual(targets.sort(), ['hisham', 'ibn-dhakwan', 'ibn-jammaz', 'ibn-wardan', 'rawh', 'ruways']);
  for (const rawiId of targets) assert.equal(isReadingQuestionSafe(rawiId), false, `${rawiId} is blocked today`);
});
