/*
 * مولّد مصفوفة إصدار القراءات العشرين — تقريرٌ صادق يُحسب من الحالة لا يُدّعى.
 *
 * يقرأ السجلّ القانوني الواحد وحالته الفعلية، فلا يطبع 20/20 إلا إن كانت 20 فعلًا.
 * الجاهزية للإنتاج تبقى مركّبةً من أدلّة (توفّرٌ وقت التشغيل + اعتماد مصدر) لا من وجود
 * مفتاح؛ ولذلك يُبلَّغ عنها هنا وصفًا لا رقمًا نهائيًا ما لم تُحقن الأدلّة.
 *
 * يكتب النتيجة إلى artifacts/mizan-quran-20-release-matrix.json (غير مُلتزَمة في Git)
 * ويطبع ملخّصًا. لا أسرار، لا شبكة.
 *
 * التشغيل:  npm run quran:release-matrix        (كتابة + طباعة)
 *           npm run quran:release-matrix -- --print   (طباعة فقط)
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  CANONICAL_READINGS,
  readingCapabilityMatrix,
  readingReleaseSummary,
} from '../src/lib/canonical-readings';
import { audioProfileForReading } from '../src/lib/global-hafs-audio';

function build() {
  const summary = readingReleaseSummary();
  const rows = readingCapabilityMatrix().map(cap => {
    const reading = CANONICAL_READINGS.find(r => r.rawiId === cap.rawiId)!;
    return {
      rawiId: cap.rawiId,
      qiraahId: cap.qiraahId,
      labelArabic: reading.labelArabic,
      canonicalIdentity: cap.canonicalIdentity,
      committeeScopeApproved: cap.committeeScopeApproved,
      deliveryMappingPresent: cap.deliveryMappingPresent,
      deliveryState: cap.deliveryState,
      globalHafsAudio: !!audioProfileForReading(cap.rawiId),
      // الجاهزية للإنتاج ليست ثابتة هنا — تُحسب بحقن أدلّة التوفّر والاعتماد.
      productionReady: 'REQUIRES_RUNTIME_EVIDENCE' as const,
    };
  });
  return {
    protocol: 'MIZAN-QURAN-20-RELEASE-MATRIX-1',
    generatedAt: new Date().toISOString(),
    honesty: 'Counts are computed from state; productionReady requires injected runtime + certified-source evidence.',
    summary,
    readings: rows,
  };
}

function main() {
  const printOnly = process.argv.includes('--print');
  const report = build();
  const s = report.summary;
  // eslint-disable-next-line no-console
  console.log('MIZAN Quran Release — القراءات العشرون');
  console.log(`  canonical identities   : ${s.canonicalIdentities}/${s.total}`);
  console.log(`  committee scope approved: ${s.committeeScopeApproved}/${s.total}`);
  console.log(`  delivery mappings       : ${s.deliveryMappings}/${s.total}`);
  console.log(`  global Hafs audio       : ${s.globalHafsAudio}/${s.total}`);
  console.log(`  production ready        : REQUIRES_RUNTIME_EVIDENCE (composed via readingProductionReady)`);
  console.log(`  pending source          : ${s.pendingSource.length ? s.pendingSource.join(', ') : '—'}`);
  console.log('  cross-reading fallback  : FORBIDDEN');

  if (!printOnly) {
    const outDir = path.join(process.cwd(), 'artifacts');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, 'mizan-quran-20-release-matrix.json');
    fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`\nwrote ${path.relative(process.cwd(), outFile)}`);
  }
}

main();
