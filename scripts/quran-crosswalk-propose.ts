/*
 * مقترح جسر المواضع — ظلّيٌّ لا يُفعَّل، ويُعرض على اللجنة.
 *
 * ستّ روايات عدُّ آياتها يخالف العدّ القانوني في سورٍ معلومة، ولا يُسحب لها سؤال حتى يصل
 * دليلُ حدودٍ لكل موضع. ودليلُ الحدود بيانٌ علميّ (عدّ الآي) لا يُخترع.
 *
 * لكن حدود الرواية مكتوبةٌ فعلًا في حزمتها المعتمدة: كل آيةٍ فيها صفٌّ مستقل. فيمكن
 * قراءتُها ومقابلتُها بالنصّ الكوفي (وعدُّه هو الإحداثي القانوني) لاستخراج **اقتراح**
 * بالمقابلة. وهذا اشتقاقٌ آليّ، فيبقى في الظلّ:
 *
 *   - لا يُكتب في `quran-crosswalk-evidence.ts` ولا يُحمَّل في الجدول العامل.
 *   - يُكتب في `artifacts/` (غير مُلتزَمة) ومعه خوارزميّته وبصمات مدخلاته.
 *   - `automaticApproval: false` — اللجنة تراجع وتقرّر، ثم تُنقل الصفوف بمرجعها.
 *
 * والمعيار صارم: السورة تدخل المقترح فقط إذا وقع **كل** حدّ آيةٍ قانوني على مقابلٍ
 * مُحاذًى في نصّ الرواية. وما لم يقع فحدُّه غير معلوم، فيخرج من المقترح لا يُخمَّن.
 *
 * التشغيل:  npm run quran:crosswalk-propose
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { loadIslamwebReadingPackage } from '../server/islamweb-reading-packages';
import { candidateSourceForRawi } from '../src/lib/quran-candidate-sources';
import { surahNameArabic } from '../src/lib/quran-canon';

export const CROSSWALK_PROPOSAL_ALGORITHM = 'MIZAN-CROSSWALK-PROPOSAL-1/myers-word-skeleton';

/** المرجع الكوفي: عدُّه هو الإحداثي القانوني، ونصُّه من حزمةٍ مثبَّتة مُتحقَّقة البصمة. */
const KUFIC_REFERENCE = 'khalaf-hamzah';
const TARGETS = ['hisham', 'ibn-dhakwan', 'ibn-wardan', 'ibn-jammaz', 'ruways', 'rawh'] as const;

/*
 * علامات الضبط التي تُجرَّد للمقارنة وحدها.
 *
 * تُكتب بترميز الوحدات لا بالمحارف نفسها: المحرف هنا غير مرئي في المحرِّر، فمديان
 * متداخلان يمرّان بلا أن يراهما مراجع. وكان الصنف يحوي 06DF-06E8 و06EA-06ED وهما
 * داخل 06D6-06ED أصلًا — زيادةٌ لا أثر لها في النتيجة (المجموعة 68 محرفًا قبل وبعد)
 * لكنها تُوهم بقصدٍ ليس هناك. حُذفت، والمجموعة هي هي.
 */
const MARKS = /[\u0616-\u061A\u064B-\u065F\u0670\u0640\u06D6-\u06ED\u08F0-\u08FF]/g;
/** طبقة مقارنة فقط — لا تمسّ نصّ العرض ولا تُخزَّن. */
const skeleton = (value: string) => value.replace(MARKS, '')
  .replace(/[آأإاٱٲٳٵ]/g, 'ا')
  .replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/[ؤئ]/g, 'ء')
  .replace(/[^ء-ي\s]/g, '').trim();
const wordsOf = (value: string) => skeleton(value).split(/\s+/).filter(Boolean);

/** محاذاة Myers على الكلمات: تعيد أزواج الكلمات المتطابقة مرتّبةً تصاعديًا. */
function alignedPairs(a: string[], b: string[]): Map<number, number> | null {
  const n = a.length, m = b.length, max = n + m;
  const v = new Map<number, number>([[1, 0]]);
  const trace: Map<number, number>[] = [];
  for (let d = 0; d <= max; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0))) ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v.set(k, x);
      if (x >= n && y >= m) {
        const pairs = new Map<number, number>();
        let px = n, py = m;
        for (let dd = d; dd > 0; dd--) {
          const vv = trace[dd], kk = px - py;
          const prevK = (kk === -dd || (kk !== dd && (vv.get(kk - 1) ?? 0) < (vv.get(kk + 1) ?? 0))) ? kk + 1 : kk - 1;
          const prevX = vv.get(prevK) ?? 0, prevY = prevX - prevK;
          while (px > prevX && py > prevY) { px--; py--; pairs.set(px, py); }
          if (px === prevX) py--; else px--;
        }
        while (px > 0 && py > 0) { px--; py--; pairs.set(px, py); }
        return pairs;
      }
    }
  }
  return null;
}

export interface ProposedSurah {
  surah: number;
  surahName: string;
  canonicalAyahs: number;
  nativeAyahs: number;
  /** كل حدّ آيةٍ قانوني وقع على مقابلٍ مُحاذًى — وإلا فالسورة خارج المقترح. */
  boundariesResolved: boolean;
  /** المقابل المقترح: رقم الآية القانونية ← رقم الآية الأصلية التي انتهت عندها. */
  rows?: { canonicalAyah: number; nativeAyah: number; relation: 'EXACT' | 'MERGED' | 'SPLIT' | 'BOUNDARY_SHIFT' }[];
  reason?: string;
}

export function proposeForReading(rawiId: string) {
  const reference = loadIslamwebReadingPackage(KUFIC_REFERENCE);
  const target = loadIslamwebReadingPackage(rawiId);
  const source = candidateSourceForRawi(rawiId);
  const surahs: ProposedSurah[] = [];

  for (let surah = 1; surah <= 114; surah++) {
    const canonical = reference.verses.filter(v => v.sura_no === surah);
    const native = target.verses.filter(v => v.sura_no === surah);
    if (canonical.length === native.length) continue;

    const canonicalWords = canonical.map(v => wordsOf(v.aya_text));
    const nativeWords = native.map(v => wordsOf(v.aya_text));
    const pairs = alignedPairs(canonicalWords.flat(), nativeWords.flat());
    const row: ProposedSurah = {
      surah, surahName: surahNameArabic(surah),
      canonicalAyahs: canonical.length, nativeAyahs: native.length,
      boundariesResolved: false,
    };
    if (!pairs) { row.reason = 'ALIGNMENT_FAILED'; surahs.push(row); continue; }

    let acc = 0; const canonicalEnds: number[] = [];
    for (const w of canonicalWords) { acc += w.length; canonicalEnds.push(acc - 1); }
    let acc2 = 0; const nativeEnds: number[] = [];
    for (const w of nativeWords) { acc2 += w.length; nativeEnds.push(acc2 - 1); }
    const nativeEndIndex = new Map(nativeEnds.map((e, i) => [e, i + 1]));

    const rows: NonNullable<ProposedSurah['rows']> = [];
    let unresolved = 0;
    for (let i = 0; i < canonicalEnds.length; i++) {
      const mapped = pairs.get(canonicalEnds[i]);
      if (mapped === undefined) { unresolved++; continue; }
      const nativeAyah = nativeEndIndex.get(mapped);
      if (nativeAyah === undefined) { unresolved++; continue; }
      const previous = rows[rows.length - 1];
      const relation = previous && previous.nativeAyah === nativeAyah ? 'MERGED'
        : nativeAyah === i + 1 ? 'EXACT' : 'BOUNDARY_SHIFT';
      rows.push({ canonicalAyah: i + 1, nativeAyah, relation });
    }
    if (unresolved === 0) { row.boundariesResolved = true; row.rows = rows; }
    else row.reason = `UNRESOLVED_BOUNDARIES:${unresolved}`;
    surahs.push(row);
  }

  const resolved = surahs.filter(s => s.boundariesResolved);
  return {
    protocol: 'MIZAN-CROSSWALK-PROPOSAL-1',
    /* ظلّيٌّ صراحةً: لا يدخل الجدول العامل ولا يُقرأ منه سؤال. */
    active: false as const,
    automaticApproval: false as const,
    committeeDecisionRequired: true as const,
    algorithm: CROSSWALK_PROPOSAL_ALGORITHM,
    rawiId,
    referenceRawiId: KUFIC_REFERENCE,
    inputs: {
      referenceSha256: reference.compressedSha256,
      targetSha256: target.compressedSha256,
      upstreamCommit: source?.upstreamCommit,
    },
    summary: {
      divergingSurahs: surahs.length,
      proposedSurahs: resolved.length,
      unresolvedSurahs: surahs.length - resolved.length,
      proposedRows: resolved.reduce((n, s) => n + (s.rows?.length || 0), 0),
    },
    surahs,
    caveat: 'اشتقاقٌ آليّ من محاذاة النصّ. لا يُعدّ دليلًا حتى تراجعه اللجنة وتنقله بمرجعها إلى quran-crosswalk-evidence.ts.',
  };
}

function main() {
  const outDir = path.join(process.cwd(), 'artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  console.log('مقترح جسر المواضع — ظلّيّ، لا يُفعَّل بذاته\n');
  let totalProposed = 0, totalUnresolved = 0;
  for (const rawiId of TARGETS) {
    const proposal = proposeForReading(rawiId);
    const file = path.join(outDir, `crosswalk-proposal-${rawiId}.json`);
    fs.writeFileSync(file, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
    const s = proposal.summary;
    console.log(`${rawiId.padEnd(14)} سور مختلفة ${String(s.divergingSurahs).padStart(3)} · مقترحة ${String(s.proposedSurahs).padStart(3)} · معلّقة ${String(s.unresolvedSurahs).padStart(3)} · صفوف ${s.proposedRows}`);
    totalProposed += s.proposedSurahs; totalUnresolved += s.unresolvedSurahs;
    const digest = crypto.createHash('sha256').update(JSON.stringify(proposal)).digest('hex').slice(0, 16);
    console.log(`${' '.repeat(14)} ${path.relative(process.cwd(), file)}  sha256:${digest}…`);
  }
  console.log(`\nالمجموع: ${totalProposed} سورة مقترحة، ${totalUnresolved} سورة تبقى بلا حدٍّ معلوم.`);
  console.log('لا شيء من هذا يدخل الجدول العامل. اللجنة تراجع، ثم تُنقل الصفوف بمرجعها إلى src/lib/quran-crosswalk-evidence.ts.');
}

if (process.argv[1] && process.argv[1].endsWith('quran-crosswalk-propose.ts')) main();
