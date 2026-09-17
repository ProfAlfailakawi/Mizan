/*
 * تخطيط كائنات R2 — مفاتيح ثابتة مبنيّة من معرّفاتٍ موثوقة لا من العميل.
 *
 * العميل لا يرسل مفتاح كائنٍ حرًّا أبدًا؛ الخادم يبنيه من معرّفاتٍ موثوقة (tenant، رواية،
 * إصدار). فأيّ محاولةِ اجتيازٍ للمسار (`..`، شرطة مائلة بادئة، فراغ) تُرفض هنا قبل أن تلمس
 * الشبكة. والحزم العلمية المُصدّقة مساراتها ثابتة: الإصدار الجديد `v2` لا تعديلُ `v1`.
 *
 * يبني هذا الملف المفاتيح والبيانات الوصفية للنزاهة فقط؛ التوقيع والرفع في `r2-private.ts`.
 */

import crypto from 'node:crypto';

export class R2KeyError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'R2KeyError'; this.code = code; }
}

/** مقطعٌ آمن في المفتاح: أحرف/أرقام/نقطة/شرطة/سفليّة فقط، بلا `..` ولا فراغ. */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** يتحقّق أن كل مقطعٍ موثوق وآمن، ويرفض الاجتياز. يُستعمل داخليًا وقابلٌ للاختبار. */
export function assertSafeSegments(segments: string[]): void {
  if (!segments.length) throw new R2KeyError('R2_KEY_EMPTY');
  for (const seg of segments) {
    if (typeof seg !== 'string' || !seg) throw new R2KeyError('R2_KEY_SEGMENT_EMPTY');
    if (seg === '.' || seg === '..') throw new R2KeyError('R2_KEY_TRAVERSAL');
    if (seg.includes('/') || seg.includes('\\')) throw new R2KeyError('R2_KEY_SEPARATOR');
    if (!SAFE_SEGMENT.test(seg)) throw new R2KeyError('R2_KEY_UNSAFE_SEGMENT');
  }
}

/** يبني مفتاحًا من مقاطع موثوقة بعد التحقّق. */
export function buildKey(...segments: string[]): string {
  assertSafeSegments(segments);
  return segments.join('/');
}

/** مسار الحزمة القرآنية المُصدّقة — ثابتٌ حسب الرواية والإصدار. */
export function quranPackageKey(rawiId: string, packageVersion: string, file = 'manifest.json'): string {
  return buildKey('quran', 'packages', rawiId, packageVersion, file);
}

/** مسار مصدرٍ خام غير قابلٍ للتغيير حسب السلطة والإصدار. */
export function quranSourceKey(authority: string, sourceVersion: string, file: string): string {
  return buildKey('quran', 'sources', authority.toLowerCase(), sourceVersion, file);
}

/** مسار أصول علامة الجهة — معزولٌ ضمن نطاق الجهة. */
export function tenantBrandingKey(tenantId: string, version: string, file: string): string {
  return buildKey('tenants', tenantId, 'branding', version, file);
}

/** مسار تقريرٍ خاص — معزولٌ ضمن نطاق الجهة والمسابقة. */
export function tenantExportKey(tenantId: string, competitionId: string, file: string): string {
  return buildKey('exports', tenantId, competitionId, file);
}

/** مسار صوت حفص العالمي حسب القارئ والإصدار. */
export function globalHafsAudioKey(reciterId: string, version: string, file: string): string {
  return buildKey('audio', 'hafs', reciterId, version, file);
}

export interface ObjectIntegrity {
  key: string;
  sha256: string;
  sizeBytes: number;
  contentType: string;
}

/** يحسب SHA-256 للبايتات — لا يُعتمد على ETag كبديلٍ عن النزاهة. */
export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** يبني سجلّ نزاهةٍ لكائنٍ قبل الرفع، ليُخزَّن في البيان ويُقارَن بعد HEAD/GET. */
export function integrityFor(key: string, bytes: Uint8Array | Buffer, contentType: string): ObjectIntegrity {
  return { key, sha256: sha256Hex(bytes), sizeBytes: bytes.byteLength, contentType };
}

/**
 * يتحقّق من مطابقة النزاهة بعد الرفع: الحجم والبصمة معًا. يفشل مغلقًا عند أي فرق —
 * R2_OBJECT_INTEGRITY_FAILED — فلا يُعتبر كائنٌ سليمًا لمجرّد نجاح الرفع.
 */
export function verifyIntegrity(expected: ObjectIntegrity, actual: { sizeBytes: number; sha256?: string }): { ok: boolean; code?: string } {
  if (actual.sizeBytes !== expected.sizeBytes) return { ok: false, code: 'R2_OBJECT_SIZE_MISMATCH' };
  if (expected.sha256 && actual.sha256 && actual.sha256 !== expected.sha256) return { ok: false, code: 'R2_OBJECT_INTEGRITY_FAILED' };
  if (expected.sha256 && !actual.sha256) return { ok: false, code: 'R2_OBJECT_SHA256_UNVERIFIED' };
  return { ok: true };
}

/** ملفٌّ مذكورٌ في بيان الحزمة. */
export interface PackageManifestFile { name: string; sha256: string; sizeBytes: number; contentType?: string }

/**
 * يقرأ قائمة ملفّات بيانِ حزمةٍ ويتحقّق منها. يُقبل أكثر من هجاءٍ للحقول (sourceFiles/files،
 * sha256/contentSha256، sizeBytes/size) لأن البيانات تأتي من مولّداتٍ مختلفة.
 *
 * ويفشل مغلقًا: ملفٌّ بلا بصمةٍ صحيحة من ٦٤ خانة سِتّ عشرية، أو بلا حجمٍ صالح، أو بلا
 * اسم — لا يُتحقَّق منه بحال، فلا يُقبل بيانٌ يذكره. إذ بيانٌ ناقصٌ يعني تحقُّقًا وهميًّا.
 */
export function readPackageManifestFiles(manifest: unknown): PackageManifestFile[] {
  const m = manifest as Record<string, unknown> | null | undefined;
  const raw = (m?.sourceFiles ?? m?.files) as unknown;
  if (!Array.isArray(raw)) throw new R2KeyError('MANIFEST_FILES_MISSING');
  return raw.map((entry, i) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    const name = String(e.name ?? e.path ?? '').trim();
    const sha256 = String(e.sha256 ?? e.contentSha256 ?? '').trim().toLowerCase();
    const sizeBytes = Number(e.sizeBytes ?? e.size ?? NaN);
    if (!name) throw new R2KeyError(`MANIFEST_FILE_NAME_MISSING_AT_${i}`);
    if (!/^[0-9a-f]{64}$/.test(sha256)) throw new R2KeyError(`MANIFEST_FILE_SHA256_INVALID:${name}`);
    if (!Number.isFinite(sizeBytes) || sizeBytes < 0) throw new R2KeyError(`MANIFEST_FILE_SIZE_INVALID:${name}`);
    return { name, sha256, sizeBytes, ...(e.contentType ? { contentType: String(e.contentType) } : {}) };
  });
}
