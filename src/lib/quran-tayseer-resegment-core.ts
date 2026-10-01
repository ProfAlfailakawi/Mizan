/*
 * نواةُ إعادة تقسيم حزمةٍ على عدٍّ آخر — دالّةٌ نقيّة، يستعملها سكربتُ البناء والاختبار.
 *
 * الحزمةُ أسطرٌ متتالية لكل سورة. وكلُّ سطرٍ ينتهي عند «نقطة حدٍّ» يعدّها عدُّ الحزمة.
 * ونقاطُ الحدّ كلُّها معروفةٌ مرتّبةً من quran-ws: لكل آيةٍ كوفية نقاطُها الداخلية المختلَف
 * فيها ثم نهايتُها. فالتحويلُ:
 *
 *   نقطةٌ يعدّها العدّان        ← الحدّ باقٍ كما هو.
 *   يعدّها الأصلُ لا الهدف      ← يُرفع الحدّ: يُضمّ السطر إلى تاليه («دمج»).
 *   يعدّها الهدفُ لا الأصل      ← يُشقّ السطر عند كلمتها («قسمة»).
 *
 * ولا تُقبل قسمةٌ إلا بدليلين يتّفقان: الكلمةُ المسمّاة في quran-ws بهيكلها، وموضعُها بعدد
 * الكلمات بحسب نصّ حفص. ولا يُقبل دمجٌ ولا يُترك حدٌّ إلا بعد التحقّق من أن السطرَ ينتهي
 * فعلًا بكلمة النقطة المختلف فيها. وأيُّ التباسٍ يُفشل البناء — لا تخمين.
 *
 * والضمانُ الأخير: كلماتُ الناتج هي كلماتُ الأصل بترتيبها، كلمةً كلمة.
 */

import type { BoundaryPrimitiveDocument } from './quran-count-boundary-mapping';
import type { BoundaryPointRef, BoundaryRepair, CountModel } from './quran-tayseer-resegmentation';

export interface PackageRow {
  id: number;
  text: string;
  page?: number;
  lineStart?: number;
  lineEnd?: number;
}
export type PackageTable = Record<string, PackageRow[]>;

export interface OrderedPoint {
  surah: number;
  kufiAyah: number;
  kind: 'end' | 'internal';
  /** null لنهايةٍ كوفيةٍ لا خلاف فيها (يعدّها الجميع). */
  word: string | null;
  countedBy: readonly string[] | null;
}

export interface ResegmentLog {
  merges: Array<{ surah: number; packageAyah: number; word: string | null }>;
  splits: Array<{ surah: number; packageAyah: number; word: string; offset: number }>;
  repairs: Array<{ surah: number; packageAyah: number; moved: string }>;
  disputedEndsVerified: number;
}

export class ResegmentError extends Error {
  constructor(code: string) { super(code); this.name = 'ResegmentError'; }
}

/**
 * هيكلُ الكلمة للمقارنة: تُحذف الحركاتُ والعلاماتُ وكلُّ صور الألف والهمزة، لأن الرسم
 * العثماني في الحزم («خَلَٰق»، «إِسۡرَٰٓءِيل») يخالف الإملائيّ في quran-ws («خلاق»، «إسرائيل»).
 */
export function skeleton(text: string): string {
  return text
    .replace(/[ً-ٰٟۖ-ۭـࣰ-ࣿ]/g, '')
    .replace(/[أإآٱاءئ]/g, '')
    .replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و');
}

const words = (text: string) => text.split(/\s+/).filter(Boolean);

/** نقاطُ الحدّ في سورةٍ مرتّبةً بترتيب المصحف. */
export function orderedPoints(doc: BoundaryPrimitiveDocument, surah: number, kufiAyahCount: number): OrderedPoint[] {
  const prim = doc.surahs[String(surah)] ?? {};
  const out: OrderedPoint[] = [];
  for (let a = 1; a <= kufiAyahCount; a++) {
    const p = prim[String(a)] ?? {};
    for (const x of p.internal ?? []) out.push({ surah, kufiAyah: a, kind: 'internal', word: x.word ?? null, countedBy: x.counted_by });
    if (p.end) out.push({ surah, kufiAyah: a, kind: 'end', word: p.end.word ?? null, countedBy: p.end.counted_by });
    else out.push({ surah, kufiAyah: a, kind: 'end', word: null, countedBy: null });
  }
  return out;
}

const sameRef = (p: OrderedPoint, r: BoundaryPointRef) => p.surah === r.surah && p.kufiAyah === r.kufiAyah && p.kind === r.kind;

/** هل يعدّ هذا النظامُ هذه النقطة؟ — ويُتحقّق أن كلَّ إضافةٍ وحذفٍ يشير إلى نقطةٍ موجودةٍ بكلمتها. */
export function modelCounts(model: CountModel, doc: BoundaryPrimitiveDocument): (p: OrderedPoint) => boolean {
  for (const ref of [...model.add, ...model.drop]) {
    const prim = doc.surahs[String(ref.surah)]?.[String(ref.kufiAyah)];
    const point = ref.kind === 'end' ? prim?.end : prim?.internal?.find(x => skeleton(x.word ?? '').endsWith(skeleton(ref.word)));
    if (!point || !skeleton(point.word ?? '').endsWith(skeleton(ref.word))) {
      throw new ResegmentError(`MODEL_POINT_NOT_IN_SOURCE:${ref.surah}:${ref.kufiAyah}:${ref.kind}:${ref.word}`);
    }
  }
  return (p) => {
    if (model.add.some(r => sameRef(p, r) && (p.kind === 'end' || skeleton(p.word ?? '').endsWith(skeleton(r.word))))) return true;
    if (model.drop.some(r => sameRef(p, r) && (p.kind === 'end' || skeleton(p.word ?? '').endsWith(skeleton(r.word))))) return false;
    return p.countedBy === null || p.countedBy.includes(model.base);
  };
}

/** موضعُ كلِّ نقطة بعدد كلمات نصّ حفص من أول السورة — دليلُ الموضع الثاني للقسمة. */
export function hafsWordIndex(points: readonly OrderedPoint[], hafsRows: readonly PackageRow[]): number[] {
  const out: number[] = [];
  let cum = 0;
  let a = 0;
  let pos = 0;
  let ht: string[] = [];
  for (const p of points) {
    if (p.kufiAyah !== a) {
      if (a) cum += ht.length;
      a = p.kufiAyah;
      ht = words(hafsRows[a - 1].text).map(skeleton);
      pos = 0;
    }
    if (p.kind === 'end') { out.push(cum + ht.length); continue; }
    const w = skeleton(p.word ?? '');
    const at = ht.findIndex((t, i) => i >= pos && t.endsWith(w));
    if (at < 0) throw new ResegmentError(`HAFS_INTERNAL_WORD_NOT_FOUND:${p.surah}:${p.kufiAyah}:${p.word}`);
    pos = at + 1;
    out.push(cum + pos);
  }
  return out;
}

function applyRepairs(table: PackageTable, repairs: readonly BoundaryRepair[], log: ResegmentLog): PackageTable {
  if (!repairs.length) return table;
  const out: PackageTable = { ...table };
  for (const r of repairs) {
    const rows = out[String(r.surah)].map(x => ({ ...x }));
    const cur = rows[r.packageAyah - 1];
    if (!cur) throw new ResegmentError(`REPAIR_ROW_MISSING:${r.surah}:${r.packageAyah}`);
    if ('replaceWord' in r) {
      const tokens = words(cur.text);
      const hits = tokens.filter(t => t === r.replaceWord.from).length;
      if (hits !== 1) throw new ResegmentError(`REPAIR_WORD_NOT_UNIQUE:${r.surah}:${r.packageAyah}:${hits}`);
      cur.text = tokens.map(t => (t === r.replaceWord.from ? r.replaceWord.to : t)).join(' ');
      out[String(r.surah)] = rows;
      log.repairs.push({ surah: r.surah, packageAyah: r.packageAyah, moved: `${r.replaceWord.from} → ${r.replaceWord.to}` });
      continue;
    }
    const next = rows[r.packageAyah];
    if (!next) throw new ResegmentError(`REPAIR_ROW_MISSING:${r.surah}:${r.packageAyah + 1}`);
    const nextWords = words(next.text);
    const moving = nextWords.slice(0, r.moveWords.length);
    if (moving.join(' ') !== r.moveWords.join(' ')) {
      throw new ResegmentError(`REPAIR_WORDS_NOT_FOUND:${r.surah}:${r.packageAyah}:${moving.join(' ')}`);
    }
    cur.text = `${cur.text} ${moving.join(' ')}`;
    next.text = nextWords.slice(r.moveWords.length).join(' ');
    if (!next.text) throw new ResegmentError(`REPAIR_EMPTIES_ROW:${r.surah}:${r.packageAyah + 1}`);
    out[String(r.surah)] = rows;
    log.repairs.push({ surah: r.surah, packageAyah: r.packageAyah, moved: moving.join(' ') });
  }
  return out;
}

export interface ResegmentInput {
  table: PackageTable;
  hafs: PackageTable;
  doc: BoundaryPrimitiveDocument;
  packageModel: CountModel;
  targetModel: CountModel;
  repairs: readonly BoundaryRepair[];
  /** أقصى فرقٍ مقبول (بالكلمات) بين موضع القسمة وموضعها بحسب حفص. */
  tolerance?: number;
}

export function resegmentPackage(input: ResegmentInput): { table: PackageTable; log: ResegmentLog } {
  const tol = input.tolerance ?? 3;
  const log: ResegmentLog = { merges: [], splits: [], repairs: [], disputedEndsVerified: 0 };
  const isPkg = modelCounts(input.packageModel, input.doc);
  const isTgt = modelCounts(input.targetModel, input.doc);
  const source = applyRepairs(input.table, input.repairs, log);
  const out: PackageTable = {};

  for (let surah = 1; surah <= 114; surah++) {
    const rows = source[String(surah)];
    const hafsRows = input.hafs[String(surah)];
    if (!rows || !hafsRows) throw new ResegmentError(`SURAH_MISSING:${surah}`);
    const points = orderedPoints(input.doc, surah, hafsRows.length);
    const hidx = hafsWordIndex(points, hafsRows);

    // كلُّ سطرٍ في الحزمة = النقاطُ من بعد حدّه السابق إلى نقطةٍ يعدّها عدُّ الحزمة.
    const segs: Array<{ points: OrderedPoint[]; h: number[]; h0: number }> = [];
    let cur: OrderedPoint[] = [];
    let curH: number[] = [];
    let h0 = 0;
    points.forEach((p, i) => {
      cur.push(p); curH.push(hidx[i]);
      if (isPkg(p)) { segs.push({ points: cur, h: curH, h0 }); h0 = hidx[i]; cur = []; curH = []; }
    });
    if (cur.length) throw new ResegmentError(`TRAILING_POINTS:${surah}`);
    if (segs.length !== rows.length) throw new ResegmentError(`PACKAGE_MODEL_COUNT:${surah}:${segs.length}:${rows.length}`);

    const next: PackageRow[] = [];
    let bufWords: string[] = [];
    let bufMeta: Omit<PackageRow, 'id' | 'text'> | null = null;
    let bufCrossesPage = false;
    const flush = () => {
      const meta = bufMeta && !bufCrossesPage ? bufMeta : {};
      next.push({ id: next.length + 1, text: bufWords.join(' '), ...meta });
      bufWords = []; bufMeta = null; bufCrossesPage = false;
    };

    segs.forEach((seg, ri) => {
      const row = rows[ri];
      const tokens = words(row.text);
      const sk = tokens.map(skeleton);
      const last = seg.points[seg.points.length - 1];
      // حدُّ السطر في الحزمة يجب أن يقع فعلًا عند كلمة النقطة المختلف فيها.
      if (last.word !== null) {
        if (!sk[sk.length - 1].endsWith(skeleton(last.word))) {
          throw new ResegmentError(`PACKAGE_END_WORD_MISMATCH:${surah}:${row.id}:${last.word}:${tokens.slice(-2).join(' ')}`);
        }
        log.disputedEndsVerified++;
      }
      // القسمة عند كل نقطةٍ داخل السطر يعدّها الهدف.
      const pieces: string[][] = [];
      let start = 0;
      seg.points.slice(0, -1).forEach((p, k) => {
        if (!isTgt(p)) return;
        if (p.word === null) throw new ResegmentError(`SPLIT_WITHOUT_WORD:${surah}:${p.kufiAyah}`);
        const w = skeleton(p.word);
        const expect = seg.h[k] - seg.h0 - 1;
        const near = sk
          .map((t, i) => ({ i, d: Math.abs(i - expect), ok: i >= start && i < sk.length - 1 && t.endsWith(w) }))
          .filter(c => c.ok && c.d <= tol)
          .sort((x, y) => x.d - y.d);
        if (!near.length || (near.length > 1 && near[0].d === near[1].d)) {
          throw new ResegmentError(`SPLIT_AMBIGUOUS:${surah}:${row.id}:${p.word}:${expect}`);
        }
        const at = near[0].i;
        pieces.push(tokens.slice(start, at + 1));
        start = at + 1;
        log.splits.push({ surah, packageAyah: row.id, word: p.word, offset: at - expect });
      });
      pieces.push(tokens.slice(start));

      pieces.forEach((piece, j) => {
        bufWords.push(...piece);
        if (bufMeta === null) {
          bufMeta = row.page !== undefined ? { page: row.page, lineStart: row.lineStart, lineEnd: row.lineEnd } : {};
        } else if (row.page !== undefined && bufMeta.page !== undefined) {
          if (bufMeta.page !== row.page) bufCrossesPage = true;
          else bufMeta = { ...bufMeta, lineEnd: row.lineEnd };
        }
        const isLastPiece = j === pieces.length - 1;
        if (!isLastPiece || isTgt(last)) flush();
        else log.merges.push({ surah, packageAyah: row.id, word: last.word });
      });
    });
    if (bufWords.length) throw new ResegmentError(`DANGLING_TEXT_AT_SURAH_END:${surah}`);
    out[String(surah)] = next;
  }

  // الضمان الأخير: الكلماتُ هي هي بترتيبها — إلا الكلمةَ التالفة المسمّاة في إصلاحٍ بعينه.
  const flat = (t: PackageTable) => Object.keys(t).sort((a, b) => Number(a) - Number(b)).flatMap(s => t[s].flatMap(r => words(r.text)));
  const replacements = new Map(input.repairs.flatMap(r => ('replaceWord' in r ? [[r.replaceWord.from, r.replaceWord.to] as const] : [])));
  const before = flat(input.table).map(w => replacements.get(w) ?? w);
  const after = flat(out);
  if (before.length !== after.length || before.some((w, i) => w !== after[i])) throw new ResegmentError('WORDS_CHANGED');
  return { table: out, log };
}
