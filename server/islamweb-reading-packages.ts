/*
 * تسليم نصّ الروايات الاثنتي عشرة من الأثر المثبَّت داخل المستودع.
 *
 * ثلاثة قيود تحكم هذا الملف:
 *
 *   1. لا اعتماد على الإنترنت يوم المسابقة. البايتات ملتزَمة في `quran-sources/` وتُقرأ من
 *      القرص، فلا يُعطِّل انقطاعُ موقعٍ خارجي جلسةَ تحكيم.
 *   2. لا حزمة تُقرأ قبل أن تُطابق بصمتَها المثبَّتة وقرارَ اللجنة المربوط بها. البصمة
 *      تُحسب في كل تحميل لا مرةً واحدة عند البناء.
 *   3. لا رجوع إلى روايةٍ أخرى بحال. غيابُ حزمة هشام يعني فشلًا صريحًا باسمه، لا نصَّ حفص
 *      معروضًا على أنه هشام. وهذا هو الفرق بين خطأٍ يُرى وخطأٍ يُصدَّق.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  QURAN_FULL_TEXT_CANDIDATES,
  candidateSourceForRawi,
  resolveCandidateReviewState,
  type QuranCandidateSource,
} from '../src/lib/quran-candidate-sources';
import { parseCandidateRawDeflate, type CandidateQuranVerse } from './quran-candidate-source-vault';

export class IslamwebPackageError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'IslamwebPackageError'; this.code = code; }
}

/** جذر الأثر المثبَّت. يُضبط بالبيئة للنشر، وإلا فمجلّد المستودع. */
export function islamwebSourceRoot(env: NodeJS.ProcessEnv = process.env): string {
  return env.MIZAN_ISLAMWEB_SOURCE_ROOT || path.join(process.cwd(), 'quran-sources', 'islamweb-derived');
}

export interface IslamwebReadingPackage {
  rawiId: string;
  deliveryKey: string;
  packageId: string;
  authority: 'ISLAMWEB_DERIVED';
  publisherAuthority: string;
  upstreamRepository: string;
  upstreamCommit: string;
  upstreamPath: string;
  compressedSha256: string;
  nativeCountSystem: string;
  nativeVerseCount: number;
  verses: readonly CandidateQuranVerse[];
  caveat?: string;
}

const digest = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex').toLowerCase();
const cache = new Map<string, IslamwebReadingPackage>();

function artifactFile(source: QuranCandidateSource, env: NodeJS.ProcessEnv): string {
  const name = source.upstreamPath.split('/').pop() as string;
  const root = path.resolve(islamwebSourceRoot(env));
  const file = path.resolve(root, name);
  // مسارٌ مشتقٌّ من السجلّ لا من مُدخَل مستخدم، والتثبّت هنا حارسُ عمقٍ لا أكثر.
  if (file !== path.join(root, name)) throw new IslamwebPackageError('ISLAMWEB_PACKAGE_PATH_INVALID');
  return file;
}

/** هل لهذه الرواية أثرٌ ملتزَم على القرص؟ سؤالُ توفّر، لا سؤال صلاحية. */
export function islamwebArtifactPresent(rawiId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const source = candidateSourceForRawi(rawiId);
  if (!source) return false;
  try { return fs.existsSync(artifactFile(source, env)); } catch { return false; }
}

/**
 * يحمّل حزمة رواية واحدة. يفشل مغلقًا عند أي انحراف، ولا يعود إلى روايةٍ أخرى أبدًا.
 *
 * رموز الفشل مقصودة التسمية حتى يقرأها الدعم بلا تخمين:
 *   ISLAMWEB_PACKAGE_UNKNOWN_READING     — الرواية ليست من الاثنتي عشرة.
 *   ISLAMWEB_PACKAGE_ARTIFACT_MISSING    — الأثر غير موجود على القرص.
 *   ISLAMWEB_PACKAGE_DIGEST_MISMATCH     — البايتات ليست البايتات المعتمدة.
 *   ISLAMWEB_PACKAGE_NOT_APPROVED        — البصمة طابقت لكن القرار لا يعتمدها.
 */
export function loadIslamwebReadingPackage(rawiId: string, env: NodeJS.ProcessEnv = process.env): IslamwebReadingPackage {
  const cached = cache.get(rawiId);
  if (cached) return cached;

  const source = candidateSourceForRawi(rawiId);
  if (!source) throw new IslamwebPackageError('ISLAMWEB_PACKAGE_UNKNOWN_READING');

  const file = artifactFile(source, env);
  let bytes: Buffer;
  try { bytes = fs.readFileSync(file); } catch { throw new IslamwebPackageError('ISLAMWEB_PACKAGE_ARTIFACT_MISSING'); }

  const compressedSha256 = digest(bytes);
  if (compressedSha256 !== source.expectedCompressedSha256) throw new IslamwebPackageError('ISLAMWEB_PACKAGE_DIGEST_MISMATCH');

  const approval = resolveCandidateReviewState(rawiId, { upstreamCommit: source.upstreamCommit, compressedSha256 });
  if (approval.state !== 'APPROVED') throw new IslamwebPackageError(`ISLAMWEB_PACKAGE_NOT_APPROVED:${approval.blockers.join(',') || 'NO_DECISION'}`);

  // التحقّق البنيوي الكامل يعيد التثبّت من ١١٤ سورة والعدّ الأصلي وتسلسل الآيات ونظافة النص.
  const verses = parseCandidateRawDeflate(bytes, source);

  const pkg: IslamwebReadingPackage = {
    rawiId: source.rawiId,
    deliveryKey: source.deliveryKey,
    packageId: `islamweb-derived-${source.deliveryKey}-${source.upstreamCommit.slice(0, 12)}`,
    authority: source.authority,
    publisherAuthority: source.publisherAuthority,
    upstreamRepository: source.upstreamRepository,
    upstreamCommit: source.upstreamCommit,
    upstreamPath: source.upstreamPath,
    compressedSha256,
    nativeCountSystem: source.nativeCountSystem,
    nativeVerseCount: verses.length,
    verses,
    ...(source.caveat ? { caveat: source.caveat } : {}),
  };
  cache.set(rawiId, pkg);
  return pkg;
}

/** يفرّغ الذاكرة المؤقتة — للاختبار ولإعادة التحميل بعد تحديث أثر. */
export function clearIslamwebPackageCache() { cache.clear(); }

/**
 * آيةٌ واحدة بترقيم الرواية الأصلي. لا تُستدعى بإحداثيٍّ قانوني مباشرةً: الانتقال يمرّ
 * من جسر المواضع، وهذا الملف لا يعرف إلا ترقيم روايته.
 */
export function islamwebNativeAyah(rawiId: string, surah: number, ayah: number, env: NodeJS.ProcessEnv = process.env): CandidateQuranVerse | undefined {
  const pkg = loadIslamwebReadingPackage(rawiId, env);
  return pkg.verses.find(v => v.sura_no === surah && v.aya_no === ayah);
}

/** مقطعٌ متّصل بترقيم الرواية الأصلي. يعود فارغًا — لا مختلقًا — إن لم يكتمل المقطع. */
export function islamwebNativePassage(rawiId: string, surah: number, startAyah: number, endAyah: number, env: NodeJS.ProcessEnv = process.env): CandidateQuranVerse[] {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return [];
  if (!Number.isInteger(startAyah) || !Number.isInteger(endAyah) || startAyah < 1 || endAyah < startAyah) return [];
  const pkg = loadIslamwebReadingPackage(rawiId, env);
  const rows = pkg.verses.filter(v => v.sura_no === surah && v.aya_no >= startAyah && v.aya_no <= endAyah)
    .sort((a, b) => a.aya_no - b.aya_no);
  if (rows.length !== endAyah - startAyah + 1) return [];
  return rows;
}

export interface IslamwebPackageStatus {
  rawiId: string;
  present: boolean;
  loadable: boolean;
  error?: string;
  compressedSha256?: string;
  nativeVerseCount?: number;
}

/** حالة الاثنتي عشرة جميعًا — تُقرأ في تقرير الجاهزية ونقطة الصحّة ولوحة الإدارة. */
export function islamwebPackageStatus(env: NodeJS.ProcessEnv = process.env): IslamwebPackageStatus[] {
  return QURAN_FULL_TEXT_CANDIDATES.map(source => {
    const present = islamwebArtifactPresent(source.rawiId, env);
    if (!present) return { rawiId: source.rawiId, present, loadable: false, error: 'ISLAMWEB_PACKAGE_ARTIFACT_MISSING' };
    try {
      const pkg = loadIslamwebReadingPackage(source.rawiId, env);
      return { rawiId: source.rawiId, present, loadable: true, compressedSha256: pkg.compressedSha256, nativeVerseCount: pkg.nativeVerseCount };
    } catch (error) {
      return { rawiId: source.rawiId, present, loadable: false, error: error instanceof Error ? error.message : 'ISLAMWEB_PACKAGE_UNKNOWN_ERROR' };
    }
  });
}
