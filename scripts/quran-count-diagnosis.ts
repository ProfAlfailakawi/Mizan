#!/usr/bin/env node
/**
 * تشخيصُ العدّ: أينَ بالضبط تفارقُ كلُّ حزمةٍ موقوفةٍ الأعدادَ الستّة المعروفة.
 *
 * كان السؤالُ الموجَّه إلى اللجنة عن أبي عمرو «خريطةُ حدودٍ لإحدى وأربعين سورة»، وهو
 * سؤالٌ يُعجز مَن يُسأل. وسببُه أننا قابلنا حزمتَه بالعدّ **البصريّ** لأنه بصريّ، ولم
 * نقابلها بالستّة كلِّها. فلمّا قوبلت بها تبيّن أن أقربها إليها المدنيُّ الأول بفارق
 * **ثلاث** سور. والسؤالُ عن ثلاثٍ يُجاب، والسؤالُ عن إحدى وأربعين يُؤجَّل.
 *
 * فهذا الأمرُ يطبع المسافةَ إلى كلّ عدٍّ، لا إلى المتوقَّع وحده. يُقرأ ولا يكتب شيئًا.
 *
 *   npx tsx scripts/quran-count-diagnosis.ts
 */
import fs from 'node:fs';
import path from 'node:path';

import { QURAN_FULL_TEXT_CANDIDATE_BY_RAWI } from '../src/lib/quran-candidate-sources';
import { parseCandidateRawDeflate } from '../server/quran-candidate-source-vault';
import {
  buildForwardBoundaryMapping,
  compareForwardCounts,
  type BoundaryPrimitiveDocument,
} from '../src/lib/quran-count-boundary-mapping';
import { NATIVE_SURAH_AYAH_COUNTS, type QuranNativeCountSystemId } from '../src/lib/quran-native-count-systems';
import { QURAN_WS_BOUNDARY_SOURCE } from '../src/lib/quran-count-boundary-source';

export const UPSTREAM_SYSTEMS = ['madani-first', 'madani-last', 'makki', 'basri', 'dimashqi', 'kufi'] as const;
export type UpstreamSystem = (typeof UPSTREAM_SYSTEMS)[number];

export interface SystemDistance {
  readonly system: UpstreamSystem;
  readonly mismatches: readonly { readonly surah: number; readonly upstream: number; readonly packaged: number }[];
}

export function boundaryDocument(repoRoot = process.cwd()): BoundaryPrimitiveDocument {
  const file = path.resolve(repoRoot, QURAN_WS_BOUNDARY_SOURCE.localPath);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as BoundaryPrimitiveDocument;
}

/** المسافةُ من أعدادِ حزمةٍ إلى كلِّ عدٍّ مرجعيّ، مرتّبةً من الأقرب. */
export function distancesToUpstream(packaged: readonly number[], repoRoot = process.cwd()): SystemDistance[] {
  const document = boundaryDocument(repoRoot);
  const kufi = NATIVE_SURAH_AYAH_COUNTS.KUFIC;
  const canonicalAyahCountOf = (surah: number) => kufi[surah - 1];
  const rows = UPSTREAM_SYSTEMS.map(system => {
    const mapping = buildForwardBoundaryMapping(document, system, canonicalAyahCountOf);
    const comparison = compareForwardCounts(mapping, packaged);
    return {
      system,
      mismatches: comparison.mismatches.map(m => ({ surah: m.surah, upstream: m.generated, packaged: m.expected })),
    };
  });
  return rows.sort((a, b) => a.mismatches.length - b.mismatches.length);
}

/*
 * أعدادُ سورِ روايةٍ من حزم `islamweb-derived`، مقروءةً من بايتاتها لا من جدول.
 *
 * ويُستعمل فاكُّ الحزمة نفسه الذي يستعمله الخادم (`parseCandidateRawDeflate`) لا فاكٌّ
 * ثانٍ يُكتب هنا: فاكّان اثنان يفترقان يومًا، فيقول التشخيصُ غيرَ ما يقرؤه النظام.
 * وهو يحمل معه حدَّ حجم الانتفاخ وفكَّ ترميزٍ صارمًا — وكلاهما مطلوبٌ على بايتاتٍ
 * تأتي من خارج الشجرة.
 */
export function measureRawi(rawiId: string, repoRoot = process.cwd()): number[] {
  const source = QURAN_FULL_TEXT_CANDIDATE_BY_RAWI.get(rawiId);
  if (!source) throw new Error(`QURAN_CANDIDATE_SOURCE_UNKNOWN:${rawiId}`);
  const file = path.resolve(repoRoot, 'quran-sources/islamweb-derived', `${source.upstreamPath.split('/').pop()}`);
  const verses = parseCandidateRawDeflate(fs.readFileSync(file), source);
  const counts = new Array<number>(114).fill(0);
  for (const verse of verses) counts[verse.sura_no - 1] += 1;
  return counts;
}

const BLOCKED: readonly { readonly label: string; readonly system: QuranNativeCountSystemId }[] = [
  { label: 'البزّي وقنبل عن ابن كثير', system: 'MAKKI_IBN_KATHIR_DELIVERY' },
  { label: 'روح عن يعقوب', system: 'BASRI_YAQUB_RAWH' },
  { label: 'الدوري والسوسي عن أبي عمرو', system: 'BASRI_ABU_AMR_DELIVERY' },
];

function main(): void {
  for (const entry of BLOCKED) {
    const packaged = NATIVE_SURAH_AYAH_COUNTS[entry.system];
    const total = packaged.reduce((a, b) => a + b, 0);
    console.log(`\n${entry.label} — ${entry.system} (مجموع الآي ${total})`);
    for (const row of distancesToUpstream(packaged)) {
      console.log(`  ${row.system.padEnd(13)} ${String(row.mismatches.length).padStart(3)} سورة مختلفة`);
    }
    const nearest = distancesToUpstream(packaged)[0];
    console.log(`  الأقربُ: ${nearest.system}`);
    for (const m of nearest.mismatches) {
      console.log(`    سورة ${String(m.surah).padStart(3)}: المرجع ${m.upstream} · الحزمة ${m.packaged}`);
    }
  }

  // روحٌ ورويسٌ عن شيخٍ واحد: الفرقُ بينهما شاهدٌ من داخل البيت، فيُطبع صريحًا.
  const rawh = measureRawi('rawh');
  const ruways = measureRawi('ruways');
  const differing = rawh.map((v, i) => (v === ruways[i] ? null : { surah: i + 1, rawh: v, ruways: ruways[i] })).filter(Boolean);
  console.log(`\nروح ورويس عن يعقوب — مقيسان من البايتات (${rawh.reduce((a, b) => a + b, 0)} و${ruways.reduce((a, b) => a + b, 0)})`);
  if (!differing.length) console.log('  لا فرق بينهما في أيّ سورة.');
  for (const row of differing as { surah: number; rawh: number; ruways: number }[]) {
    console.log(`  سورة ${row.surah}: روح ${row.rawh} · رويس ${row.ruways}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('quran-count-diagnosis.ts')) main();
