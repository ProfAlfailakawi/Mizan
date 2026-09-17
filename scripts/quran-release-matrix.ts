/*
 * مولّد مصفوفة إصدار القراءات العشرين — تقريرٌ صادق يُحسب من الحالة لا يُدّعى.
 *
 * كل عمودٍ هنا مقروءٌ من دليلٍ فعلي: بايتاتُ الحزمة تُقرأ وتُهشَّم، وعدّ آياتها يُقابَل
 * بالعدّ القانوني، وقرارُ اللجنة يُقابَل بالبصمة. فلا يُطبع 20/20 إلا إن كانت عشرين فعلًا،
 * وما نقص يُسمّى باسمه وسببه — «هشام: خمسون سورة بلا دليل جسر» لا «غير جاهز».
 *
 * يكتب النتيجة إلى artifacts/mizan-quran-20-release-matrix.json (غير مُلتزَمة في Git)
 * ويطبع ملخّصًا. لا أسرار، لا شبكة.
 *
 * التشغيل:  npm run quran:release-matrix              (كتابة + طباعة)
 *           npm run quran:release-matrix -- --print   (طباعة فقط)
 *           npm run quran:release-matrix -- --markdown (جدول Markdown للمصفوفة)
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  CANONICAL_READINGS,
  readingCapabilityMatrix,
  readingProductionReady,
  readingReleaseSummary,
} from '../src/lib/canonical-readings';
import { audioProfileForReading, LISTEN_BUTTON_LABEL_AR } from '../src/lib/global-hafs-audio';
import { crosswalkCoverage, isReadingQuestionSafe, readingQuestionBlockers } from '../src/lib/quran-locus-crosswalk';
import { countSystemForReading } from '../src/lib/reading-count-systems';
import { candidateSourceForRawi, resolveCandidateReviewState } from '../src/lib/quran-candidate-sources';
import { KFGQPC_DELIVERED_RAWI_IDS } from '../src/lib/delivered-readings';
import { islamwebArtifactPresent, loadIslamwebReadingPackage } from '../server/islamweb-reading-packages';

type Capability = 'RELEASE_READY' | 'TESTED' | 'IMPLEMENTED' | 'NOT_STARTED' | 'BLOCKED';

interface ReadingRow {
  rawiId: string;
  qiraahId: string;
  labelArabic: string;
  textSource: string;
  sourceDigest?: string;
  sourceDigestVerified: boolean;
  committeeDecision: string;
  countSystem?: string;
  countAssurance: string;
  crosswalkResolved: number;
  crosswalkUnresolved: number;
  crosswalkAssumed: number;
  surahsRequiringEvidence: number[];
  runtimeTextLoadable: boolean | 'REQUIRES_NETWORK';
  questionReady: boolean;
  fairDrawReady: boolean;
  audioAction: string;
  productionReady: Capability;
  blockers: string[];
}

function rowFor(rawiId: string): ReadingRow {
  const reading = CANONICAL_READINGS.find(r => r.rawiId === rawiId)!;
  const coverage = crosswalkCoverage(rawiId);
  const countSystem = countSystemForReading(rawiId);
  const candidate = candidateSourceForRawi(rawiId);
  const blockers: string[] = [];

  let textSource = 'KFGQPC delivery mirror';
  let sourceDigest: string | undefined;
  let sourceDigestVerified = false;
  let committeeDecision = 'KFGQPC_OFFICIAL_SOURCE';
  let runtimeTextLoadable: boolean | 'REQUIRES_NETWORK' = 'REQUIRES_NETWORK';

  if (candidate) {
    textSource = `ISLAMWEB_DERIVED @ ${candidate.upstreamRepository}@${candidate.upstreamCommit.slice(0, 12)}`;
    sourceDigest = candidate.expectedCompressedSha256;
    committeeDecision = `${candidate.committeeDecision.state} (${candidate.committeeDecision.reference})`;
    if (!islamwebArtifactPresent(rawiId)) {
      runtimeTextLoadable = false;
      blockers.push('PINNED_ARTIFACT_ABSENT');
    } else {
      try {
        const pkg = loadIslamwebReadingPackage(rawiId);
        sourceDigestVerified = pkg.compressedSha256 === candidate.expectedCompressedSha256;
        const approval = resolveCandidateReviewState(rawiId, { upstreamCommit: pkg.upstreamCommit, compressedSha256: pkg.compressedSha256 });
        if (approval.state !== 'APPROVED') blockers.push(`COMMITTEE_DECISION_NOT_BOUND:${approval.blockers.join(',')}`);
        runtimeTextLoadable = true;
      } catch (error) {
        runtimeTextLoadable = false;
        blockers.push(error instanceof Error ? error.message : 'PINNED_ARTIFACT_UNREADABLE');
      }
    }
  } else if (!KFGQPC_DELIVERED_RAWI_IDS.includes(rawiId)) {
    blockers.push('NO_TEXT_SOURCE');
  }

  if (coverage.unresolvedLoci > 0) blockers.push(...readingQuestionBlockers(rawiId));
  if (coverage.assumedLoci > 0) blockers.push(`NATIVE_NUMBERING_UNVERIFIED:${coverage.assumedLoci}`);

  const questionReady = isReadingQuestionSafe(rawiId);
  /*
   * «جاهزٌ للإصدار» هنا يعني: نصٌّ حُمِّل فعلًا من بايتات مُتحقَّقة، وجسرُ مواضعه لا يحمل
   * موضعًا مجهولًا، والسحب متاحٌ له. وما عداه يُوصف بما هو، لا بما نتمنّى.
   */
  const evidence = { deliveryAvailableAtRuntime: runtimeTextLoadable === true, locusMappingQuestionSafe: questionReady };
  const composed = readingProductionReady(rawiId, evidence);
  const productionReady: Capability = composed.productionReady
    ? 'RELEASE_READY'
    : runtimeTextLoadable === 'REQUIRES_NETWORK' && questionReady
      ? 'TESTED'
      : questionReady ? 'IMPLEMENTED' : 'BLOCKED';

  return {
    rawiId,
    qiraahId: reading.qiraahId,
    labelArabic: reading.labelArabic,
    textSource,
    sourceDigest,
    sourceDigestVerified,
    committeeDecision,
    countSystem: countSystem?.system,
    countAssurance: countSystem?.assurance || 'UNVERIFIED',
    crosswalkResolved: coverage.resolvedLoci,
    crosswalkUnresolved: coverage.unresolvedLoci,
    crosswalkAssumed: coverage.assumedLoci,
    surahsRequiringEvidence: coverage.surahsRequiringEvidence,
    runtimeTextLoadable,
    questionReady,
    fairDrawReady: questionReady,
    audioAction: `${LISTEN_BUTTON_LABEL_AR} — ${audioProfileForReading(rawiId)?.reading || 'NONE'}`,
    productionReady,
    blockers,
  };
}

function build() {
  const rows = CANONICAL_READINGS.map(r => rowFor(r.rawiId));
  const capability = readingCapabilityMatrix();
  return {
    protocol: 'MIZAN-QURAN-20-RELEASE-MATRIX-2',
    generatedAt: new Date().toISOString(),
    honesty: 'Every column is read from real state: bytes are hashed, native counts are compared, committee decisions are matched to digests. Nothing here is asserted.',
    summary: {
      ...readingReleaseSummary(),
      textLoadableFromPinnedBytes: rows.filter(r => r.runtimeTextLoadable === true).length,
      textRequiresNetwork: rows.filter(r => r.runtimeTextLoadable === 'REQUIRES_NETWORK').length,
      questionReady: rows.filter(r => r.questionReady).length,
      releaseReady: rows.filter(r => r.productionReady === 'RELEASE_READY').length,
      blocked: rows.filter(r => r.productionReady === 'BLOCKED').map(r => r.rawiId),
    },
    capability,
    readings: rows,
  };
}

function markdown(rows: ReadingRow[]): string {
  const head = '| الرواية | مصدر النص | بصمة مُتحقَّقة | نظام العدّ | جسر المواضع | نصّ وقت التشغيل | جاهزة للسؤال | القرعة | الصوت | الحالة |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|';
  const yes = (v: boolean) => (v ? '✅' : '❌');
  const body = rows.map(r => {
    const bridge = r.crosswalkUnresolved > 0
      ? `❌ ${r.crosswalkUnresolved} موضعًا في ${r.surahsRequiringEvidence.length} سورة`
      : r.crosswalkAssumed > 0 ? '⚠️ ترقيم غير مفحوص' : `✅ ${r.crosswalkResolved}/${r.crosswalkResolved}`;
    const runtime = r.runtimeTextLoadable === true ? '✅ أثر مثبَّت' : r.runtimeTextLoadable === false ? '❌ غير متاح' : '⚠️ يحتاج طبقة التسليم';
    return `| ${r.labelArabic} | ${r.textSource.split(' @ ')[0]} | ${yes(r.sourceDigestVerified)} | ${r.countSystem || '—'} | ${bridge} | ${runtime} | ${yes(r.questionReady)} | ${yes(r.fairDrawReady)} | حفص | ${r.productionReady} |`;
  });
  return [head, sep, ...body].join('\n');
}

function main() {
  const report = build();
  const s = report.summary;
  if (process.argv.includes('--markdown')) { console.log(markdown(report.readings)); return; }

  console.log('MIZAN Quran Release — القراءات العشرون');
  console.log(`  canonical identities        : ${s.canonicalIdentities}/${s.total}`);
  console.log(`  committee scope approved    : ${s.committeeScopeApproved}/${s.total}`);
  console.log(`  delivery mappings           : ${s.deliveryMappings}/${s.total}`);
  console.log(`  text loadable from pinned   : ${s.textLoadableFromPinnedBytes}/${s.total}`);
  console.log(`  text via delivery mirror    : ${s.textRequiresNetwork}/${s.total}`);
  console.log(`  question-ready (crosswalk)  : ${s.questionReady}/${s.total}`);
  console.log(`  release-ready (all evidence): ${s.releaseReady}/${s.total}`);
  console.log(`  global Hafs audio           : ${s.globalHafsAudio}/${s.total}`);
  console.log('  cross-reading fallback      : FORBIDDEN');
  console.log('\nما لم يكتمل — بالاسم والسبب:');
  for (const row of report.readings) {
    if (!row.blockers.length) continue;
    console.log(`  ${row.labelArabic} (${row.rawiId}):`);
    for (const blocker of row.blockers) console.log(`      - ${blocker}`);
  }
  if (!report.readings.some(r => r.blockers.length)) console.log('  — لا شيء.');

  if (!process.argv.includes('--print')) {
    const outDir = path.join(process.cwd(), 'artifacts');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'mizan-quran-20-release-matrix.json');
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`\nwrote ${path.relative(process.cwd(), outFile)}`);
  }
}

main();
