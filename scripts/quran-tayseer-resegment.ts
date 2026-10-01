/*
 * يبني حزم الروايات الخمس على عدّ مصاحف التيسير — `npm run quran:tayseer-resegment`.
 *
 * السلسلة بلا حلقةٍ مظنونة:
 *   بايتاتُ الحزمة الأصل (بصمتها مثبَّتة)
 *     + حدودُ quran-ws المجمَّدة (بصمتها مثبَّتة)
 *     + نصُّ حفص المثبَّت (دليل الموضع الثاني للقسمة)
 *       ← تحويلٌ حتميّ (`src/lib/quran-tayseer-resegment-core.ts`)
 *         ← يُقبل فقط إن طابق فهرسَ مصحف التيسير المطبوع ١١٤/١١٤
 *           ← أثرٌ جديد ببصمته، وتقريرٌ بكل دمجٍ وقسمة، ووحدةُ أعدادٍ مولَّدة.
 *
 *   --check   لا يكتب شيئًا؛ يفشل إن خالف الناتجُ الآثارَ والبصماتِ الملتزَمة.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

import { candidateSourceForRawi } from '../src/lib/quran-candidate-sources';
import {
  TAYSEER_RESEGMENTATIONS,
  type TayseerNativeCountSystemId,
  type TayseerResegmentation,
} from '../src/lib/quran-tayseer-resegmentation';
import { resegmentPackage, type PackageTable, type ResegmentLog } from '../src/lib/quran-tayseer-resegment-core';
import { loadFrozenBoundaryBytes, parseBoundaryDocument } from './quran-crosswalk-activate';

const ROOT = resolve(process.cwd());
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const HAFS_FILE = 'quran-sources/kfgqpc-mirror-derived/hafs.kfgqpc-mirror.json.deflate';
const EXTRACTED = 'quran-sources/crosswalk/alwa7y/extracted-counts.json';
export const RESEGMENT_REPORT = 'quran-sources/crosswalk/alwa7y/resegmentation-report.json';
export const GENERATED_COUNTS = 'src/lib/quran-tayseer-count-evidence.generated.ts';

const dirFor = (r: TayseerResegmentation) =>
  r.baseArtifactFileName.startsWith('Qiraah') ? 'quran-sources/islamweb-derived' : 'quran-sources/kfgqpc-mirror-derived';

function readTable(file: string, expectedSha: string): PackageTable {
  const bytes = readFileSync(join(ROOT, file));
  const got = sha256(bytes);
  if (got !== expectedSha) throw new Error(`BASE_ARTIFACT_DIGEST_MISMATCH:${file}:${got}`);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(inflateRawSync(bytes))) as PackageTable;
}

export interface ResegmentBuild {
  rawiId: string;
  artifact: Buffer;
  artifactSha256: string;
  perSurah: number[];
  log: ResegmentLog;
}

export function buildTayseerResegmentation(root = ROOT): ResegmentBuild[] {
  const doc = parseBoundaryDocument(loadFrozenBoundaryBytes(root));
  const hafsSource = candidateSourceForRawi('hafs');
  if (!hafsSource) throw new Error('HAFS_CANDIDATE_MISSING');
  const hafs = readTable(HAFS_FILE, hafsSource.expectedCompressedSha256);
  const extracted = JSON.parse(readFileSync(join(root, EXTRACTED), 'utf8'));

  return TAYSEER_RESEGMENTATIONS.map((r) => {
    const table = readTable(join(dirFor(r), r.baseArtifactFileName), r.baseArtifactSha256);
    const { table: out, log } = resegmentPackage({
      table, hafs, doc, packageModel: r.packageModel, targetModel: r.targetModel, repairs: r.repairs,
    });
    const perSurah = Array.from({ length: 114 }, (_, i) => out[String(i + 1)].length);
    // بوّابة اللجنة: فهرس مصحف التيسير المطبوع، سورةً سورة.
    const index: number[] = extracted.mushafs[r.tayseerMushaf].publisherIndex;
    const off = perSurah.flatMap((n, i) => (n === index[i] ? [] : [`${i + 1}:${n}!=${index[i]}`]));
    if (off.length) throw new Error(`TAYSEER_INDEX_MISMATCH:${r.rawiId}:${off.join(',')}`);
    const total = perSurah.reduce((a, b) => a + b, 0);
    if (total !== r.verseCount) throw new Error(`VERSE_COUNT:${r.rawiId}:${total}:${r.verseCount}`);
    const artifact = deflateRawSync(Buffer.from(JSON.stringify(out), 'utf8'), { level: 9 });
    return { rawiId: r.rawiId, artifact, artifactSha256: sha256(artifact), perSurah, log };
  });
}

function reportOf(builds: ResegmentBuild[]) {
  return {
    _description: 'كل دمجٍ وقسمةٍ وإصلاحٍ أُجري لإعادة تقسيم الحزم الخمس على عدّ مصاحف التيسير. يولّده `npm run quran:tayseer-resegment`.',
    rawis: builds.map((b) => {
      const r = TAYSEER_RESEGMENTATIONS.find(x => x.rawiId === b.rawiId) as TayseerResegmentation;
      return {
        rawiId: b.rawiId,
        base: { file: r.baseArtifactFileName, sha256: r.baseArtifactSha256, verses: r.baseVerseCount },
        artifact: { file: r.artifactFileName, sha256: b.artifactSha256, verses: r.verseCount },
        packageModel: r.packageModel.evidence,
        targetModel: r.targetModel.evidence,
        tayseerMushaf: r.tayseerMushaf,
        disputedEndsVerified: b.log.disputedEndsVerified,
        merges: b.log.merges,
        splits: b.log.splits,
        repairs: b.log.repairs.map((x, i) => ({ ...x, evidence: r.repairs[i].evidence })),
      };
    }),
  };
}

function generatedModule(builds: ResegmentBuild[]): string {
  const bySystem = new Map<TayseerNativeCountSystemId, { counts: number[]; rawis: string[] }>();
  for (const b of builds) {
    const r = TAYSEER_RESEGMENTATIONS.find(x => x.rawiId === b.rawiId) as TayseerResegmentation;
    const prev = bySystem.get(r.nativeCountSystem);
    if (prev && prev.counts.join() !== b.perSurah.join()) throw new Error(`SYSTEM_COUNTS_DISAGREE:${r.nativeCountSystem}`);
    bySystem.set(r.nativeCountSystem, { counts: b.perSurah, rawis: [...(prev?.rawis ?? []), b.rawiId] });
  }
  const rows = [...bySystem.entries()].map(([system, v]) =>
    `  ${system}: {\n    rawis: ${JSON.stringify(v.rawis)},\n    perSurahAyahCounts: [${v.counts.join(', ')}],\n  },`);
  return `/*
 * مولَّدٌ — لا يُحرَّر يدويًّا. يكتبه \`npm run quran:tayseer-resegment\`.
 *
 * أعدادُ آي كل سورة في الحزم المعاد تقسيمها على عدّ مصاحف التيسير، مقيسةً من الآثار الناتجة
 * نفسها، وقد طابق كلٌّ منها فهرسَ مصحفه المطبوع ١١٤/١١٤ قبل أن يُكتب هنا.
 */

import type { TayseerNativeCountSystemId } from './quran-tayseer-resegmentation';

export const TAYSEER_COUNT_SYSTEMS: Record<TayseerNativeCountSystemId, { rawis: readonly string[]; perSurahAyahCounts: readonly number[] }> = {
${rows.join('\n')}
};
`;
}

function main() {
  const check = process.argv.includes('--check');
  const builds = buildTayseerResegmentation();
  const report = `${JSON.stringify(reportOf(builds), null, 1)}\n`;
  const mod = generatedModule(builds);
  let drift = 0;
  for (const b of builds) {
    const r = TAYSEER_RESEGMENTATIONS.find(x => x.rawiId === b.rawiId) as TayseerResegmentation;
    const file = join(ROOT, dirFor(r), r.artifactFileName);
    const pinned = r.artifactSha256 === b.artifactSha256;
    console.log(`${pinned ? '✓' : '✗'} ${b.rawiId.padEnd(16)} ${r.verseCount} آية · دمج ${b.log.merges.length} · قسمة ${b.log.splits.length} · إصلاح ${b.log.repairs.length} · ${b.artifactSha256}`);
    if (check) {
      if (!pinned || !existsSync(file) || sha256(readFileSync(file)) !== b.artifactSha256) drift++;
    } else {
      writeFileSync(file, b.artifact);
      if (!pinned) drift++;
    }
  }
  if (check) {
    if (readFileSync(join(ROOT, RESEGMENT_REPORT), 'utf8') !== report) drift++;
    if (readFileSync(join(ROOT, GENERATED_COUNTS), 'utf8') !== mod) drift++;
    if (drift) { console.error(`\n${drift} انحراف عن الملتزَم.`); process.exit(1); }
    console.log('\nالآثار والتقرير والأعداد مطابقة للملتزَم.');
    return;
  }
  writeFileSync(join(ROOT, RESEGMENT_REPORT), report);
  writeFileSync(join(ROOT, GENERATED_COUNTS), mod);
  if (drift) console.log('\nبصماتٌ جديدة — ألصقها في artifactSha256 في src/lib/quran-tayseer-resegmentation.ts.');
}

if (process.argv[1] && process.argv[1].endsWith('quran-tayseer-resegment.ts')) main();
