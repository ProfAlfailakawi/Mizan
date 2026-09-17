/*
 * Emits the derived native-numbering evidence module from the frozen delivery counts.
 * Generated so the numbers in `src/lib/` can never drift from the measured bytes.
 *
 *   npm run quran:delivery-counts-generate
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { loadDeliveryCountManifest, loadFrozenDeliveryCounts } from './quran-delivery-count-intake';

export const GENERATED_DELIVERY_COUNTS_PATH = 'src/lib/quran-delivery-count-evidence.generated.ts';

/**
 * Readings whose measured per-surah counts are identical share one counting-system id.
 * The grouping is *derived* from the numbers, never asserted: two readings are grouped only
 * when all 114 counts agree, and each keeps its own identity in every runtime lookup.
 */
const SYSTEM_NAMES: Array<{ rawis: string[]; system: string; note: string }> = [
  { rawis: ['hafs'], system: 'KUFIC', note: 'العدّ الكوفي — إحداثي ميزان القانوني نفسه.' },
  { rawis: ['shubah'], system: 'KUFIC', note: 'العدّ الكوفي — مقيسٌ من بايتات الحزمة لا مفترَضًا.' },
  { rawis: ['warsh', 'qalun'], system: 'MADANI_AKHIR', note: 'العدّ المدني الأخير — مقيسٌ من بايتات الحزمتين، وهما متطابقتان في السور الـ١١٤.' },
  { rawis: ['al-bazzi', 'qunbul'], system: 'MAKKI_IBN_KATHIR_DELIVERY', note: 'عدٌّ مكّيٌّ مشتقٌّ من بايتات الحزمة — يفارق العدّ المكّي المنشور في سورة النبأ، فلا يُسمّى به.' },
  { rawis: ['al-duri-abu-amr', 'al-susi'], system: 'BASRI_ABU_AMR_DELIVERY', note: 'عدٌّ مشتقٌّ من بايتات الحزمة — لا يطابق أيَّ نظامٍ منشورٍ في المصدر المثبَّت، فيُسمّى بمصدره.' },
];

function main() {
  const repoRoot = process.cwd();
  const frozen = loadFrozenDeliveryCounts(repoRoot);
  const manifest = loadDeliveryCountManifest(repoRoot);

  const systems = new Map<string, { system: string; rawis: string[]; counts: number[]; note: string }>();
  for (const group of SYSTEM_NAMES) {
    for (const rawiId of group.rawis) {
      const entry = frozen[rawiId];
      if (!entry) throw new Error(`DELIVERY_COUNT_EVIDENCE_MISSING:${rawiId}`);
      const existing = systems.get(group.system);
      if (!existing) {
        systems.set(group.system, { system: group.system, rawis: [rawiId], counts: entry.perSurahAyahCounts, note: group.note });
        continue;
      }
      // Grouping is a measured fact, so it is re-proved here rather than trusted.
      const identical = existing.counts.every((value, index) => value === entry.perSurahAyahCounts[index]);
      if (!identical) throw new Error(`DELIVERY_COUNT_SYSTEM_GROUPING_UNPROVEN:${group.system}:${rawiId}`);
      existing.rawis.push(rawiId);
    }
  }

  const payload = [...systems.values()].map(entry => ({
    system: entry.system,
    rawis: entry.rawis,
    note: entry.note,
    perSurahAyahCounts: entry.counts,
    packages: entry.rawis.map(rawiId => ({
      rawiId,
      upstreamPath: frozen[rawiId].upstreamPath,
      sha256: frozen[rawiId].sha256,
      byteLength: frozen[rawiId].byteLength,
      totalAyahs: frozen[rawiId].totalAyahs,
    })),
  }));
  const artifactSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  const source = `/*
 * GENERATED — do not edit by hand.  Regenerate with: npm run quran:delivery-counts-generate
 *
 * Native ayah numbering for the readings served from the KFGQPC delivery mirror, measured from
 * the pinned mirror bytes rather than assumed.  The tree previously assumed all eight used the
 * Kufic count; six of them do not.  Every number below is reproducible from the pinned commit,
 * and each reading keeps its own package digest even where two readings share a counting system.
 */

export const DELIVERY_COUNT_EVIDENCE_BUILD = {
  protocol: 'MIZAN-DELIVERY-COUNT-EVIDENCE-1',
  generator: 'scripts/quran-delivery-count-generate.ts',
  upstreamRepository: ${JSON.stringify(manifest.upstreamRepository)},
  upstreamCommit: ${JSON.stringify(manifest.upstreamCommit)},
  frozenCountsPath: 'quran-sources/delivery-counts/kfgqpc-mirror/counts.json',
  generatedArtifactSha256: ${JSON.stringify(artifactSha256)},
  /** What this proves, stated narrowly: the mirror artifact's numbering, not a private R2 package's. */
  scope: 'KFGQPC_OPEN_DELIVERY_MIRROR_ARTIFACT',
} as const;

export interface DeliveryCountSystem {
  system: string;
  rawis: readonly string[];
  note: string;
  perSurahAyahCounts: readonly number[];
  packages: readonly { rawiId: string; upstreamPath: string; sha256: string; byteLength: number; totalAyahs: number }[];
}

export const DELIVERY_COUNT_SYSTEMS: readonly DeliveryCountSystem[] = ${JSON.stringify(payload, null, 2)};
`;

  fs.writeFileSync(path.resolve(repoRoot, GENERATED_DELIVERY_COUNTS_PATH), source);
  for (const entry of payload) {
    console.log(`${entry.system}: ${entry.rawis.join(', ')} total=${entry.perSurahAyahCounts.reduce((a, b) => a + b, 0)}`);
  }
  console.log(`generated artifact sha256: ${artifactSha256}`);
  console.log(`wrote ${GENERATED_DELIVERY_COUNTS_PATH}`);
}

main();
