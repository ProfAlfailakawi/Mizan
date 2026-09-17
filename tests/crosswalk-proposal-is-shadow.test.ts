import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CROSSWALK_PROPOSAL_ALGORITHM, proposeForReading } from '../scripts/quran-crosswalk-propose';
import { committeeCrosswalkRows } from '../src/lib/quran-crosswalk-evidence';

const COMMITTEE_CROSSWALK_ROWS = committeeCrosswalkRows();
import { MIZAN_IDENTITY_CROSSWALK, crosswalkCoverage, isReadingQuestionSafe, readingQuestionBlockers } from '../src/lib/quran-locus-crosswalk';
import { CANONICAL_RAWI_IDS } from '../src/lib/canonical-readings';
import { PINNED_DELIVERED_RAWI_IDS } from '../src/lib/delivered-readings';

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
  const before = crosswalkCoverage('rawh');
  proposeForReading('rawh');
  const after = crosswalkCoverage('rawh');
  assert.deepEqual(after, before, 'the working coverage is untouched by deriving a proposal');
  // روحٌ محجوبٌ قبل الاشتقاق وبعده — والمقترحُ لا يفتح له بابًا.
  assert.equal(isReadingQuestionSafe('rawh'), false);
  assert.equal(MIZAN_IDENTITY_CROSSWALK.rowsFor('rawh').length, 0);
  assert.equal(COMMITTEE_CROSSWALK_ROWS.some(r => r.rawiId === 'rawh'), false);
});

/*
 * الجدول العامل لم يعد فارغًا، فلم يعد «الفراغ» هو ما يحرس بابَ المقترح. الحارسُ الآن
 * أدقّ وأصدق: كلُّ صفٍّ فيه يحمل مرجعَ الأثر المثبَّت، ولا صفَّ واحدٌ يحمل توقيع خوارزمية
 * الاقتراح. فلو تسرّب صفٌّ مشتقٌّ آليًّا يومًا، سقط هذا الاختبار باسمه.
 */
test('no row in the working table was ever authored by the proposal algorithm', () => {
  for (const row of COMMITTEE_CROSSWALK_ROWS) {
    const joined = row.evidence.join('\n');
    assert.equal(joined.includes(CROSSWALK_PROPOSAL_ALGORITHM), false,
      `${row.rawiId} ${row.canonical.surah}:${row.canonical.ayah} carries a proposal signature`);
    assert.ok(joined.includes('quran-ws/qiraat-ayah-map@'), 'every row names the pinned boundary artifact instead');
  }
});

test('the proposal is written to artifacts, which are never committed', () => {
  const ignore = fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf8');
  assert.match(ignore, /^artifacts\/$/m, 'proposals stay out of the repository');
});

test('every reading still blocked today is covered by the proposal targets', () => {
  const script = fs.readFileSync(path.join(process.cwd(), 'scripts', 'quran-crosswalk-propose.ts'), 'utf8');
  const targets = script.match(/const TARGETS = \[([^\]]*)\]/)![1]
    .split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
  assert.deepEqual(targets.sort(), ['hisham', 'ibn-dhakwan', 'ibn-jammaz', 'ibn-wardan', 'rawh', 'ruways']);

  /*
   * خمسٌ من هذه الستّ حُسمت بأثرٍ مثبَّت لا بالمقترح، فبقاؤها في قائمة الأهداف لا يضرّ —
   * المقترحُ ظِلٌّ لا يفعّل شيئًا.
   *
   * والمقترح لا يعمل إلا على روايةٍ نصُّها أثرٌ مثبَّتٌ داخل الشجرة، لأنه يحاذي نصَّين.
   * فالروايات المخدومة من المرآة خارج مداه بنيويًّا، ولا يُدَّعى غير ذلك: المطلوب أن
   * تكون **كلُّ** روايةٍ محجوبة إمّا مشمولةً بالمقترح وإمّا مسمّاةً بسببها في المصفوفة.
   */
  const blockedToday = CANONICAL_RAWI_IDS.filter(rawiId => !isReadingQuestionSafe(rawiId));
  assert.deepEqual(blockedToday.sort(),
    ['al-bazzi', 'al-duri-abu-amr', 'al-susi', 'qunbul', 'rawh'].sort());
  for (const rawiId of blockedToday) {
    const covered = targets.includes(rawiId) || !PINNED_DELIVERED_RAWI_IDS.includes(rawiId);
    assert.ok(covered, `${rawiId} is blocked, has a pinned artifact, and yet no proposal is produced for it`);
    // ومهما كان سببُ الحجب فهو مسمًّى بسورته، لا «غير جاهز».
    assert.match(readingQuestionBlockers(rawiId)[0], /^CROSSWALK_UNRESOLVED_SURAHS:\d+:/);
  }
});
