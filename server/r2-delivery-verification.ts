/*
 * تحقّقُ نزاهةِ شجرة التسليم — الشجرةُ التي يعتمد عليها المنتج فعلًا.
 *
 * كانت بوّابةُ `quran:verify-r2` تتحقّق من `quran/packages/<rawiId>/<v>/manifest.json`.
 * والجردُ القرائيُّ للدلو في 18 سبتمبر 2026 أثبت أن تلك البادئة **خاليةٌ تمامًا**، وأن
 * `delivery/` فيها ٧٤٧٢ كائنًا و٦٨٠ ميجابايت، وأن **لا ملفَّ واحدًا تحت `server/` أو
 * `src/` يستورد وحدةَ التخطيط تلك أصلًا**. فكانت البوّابةُ تتحقّق من موضعٍ لا يكتب فيه
 * المنتجُ ولا يقرأ منه — حارسًا على بابٍ ليس في الجدار.
 *
 * وحارسٌ كهذا أسوأ من لا حارس: يبقى أحمرَ أبدًا فيُعتاد تجاهلُه، وتمرّ من تحته الشجرةُ
 * الحقيقيّة بلا تحقّقٍ من أحد.
 *
 * فهذه الوحدة تتحقّق ممّا يعتمد عليه المنتج: `delivery/_mizan/catalog.json` وما تذكره
 * حزمُه الأربعَ عشرةَ المطلوبة. والتحقّقُ بالبصمة لا بالوجود: تُعاد بصمةُ المجلَّد من
 * بايتات R2 نفسِها بالخوارزميّة التي كتبها بها `hashDirectory`، فحزمةٌ موجودةٌ ببايتاتٍ
 * أخرى لا تمرّ.
 *
 * وهي قراراتٌ صِرفة بلا شبكة: يستعملها السكربتُ والاختبارُ معًا، فلا يفترق ما يُختبر
 * عمّا يُشغَّل.
 *
 * وما لم يسقط من الحساب: اكتمالُ العشرين رواية ليس شأنَ هذه البوّابة ولم يكن — هو شأنُ
 * `npm run quran:release-matrix`، وهو يقول ١١/٢٠ ويحجب الإصدار. وخلطُ النزاهة بالاكتمال
 * هو الذي صنع بوّابةً لا تخضرّ أبدًا.
 */

import crypto from 'node:crypto';
import { KFGQPC_REQUIRED_DELIVERY_DATASETS, type KfgqpcDeliveryCatalogDataset } from './kfgqpc-ingest-core';

export const DELIVERY_CATALOG_KEY = 'delivery/_mizan/catalog.json';

export class DeliveryVerificationError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.name = 'DeliveryVerificationError'; this.code = code; }
}

export interface DeliveryCatalog {
  schemaVersion: string;
  state: string;
  generatedAt?: string;
  datasets: KfgqpcDeliveryCatalogDataset[];
  unavailableAudio: string[];
  unverifiedAudio: string[];
}

/**
 * يقرأ الكتالوج ويفشل مغلقًا. كتالوجٌ بمخطّطٍ آخر ليس كتالوجًا «قديمًا» يُتسامح معه:
 * الحقولُ التي يُبنى عليها الحكمُ قد تكون غائبةً أو تعني غير ما تعنيه، فالتحقّقُ منه
 * تحقّقٌ وهميّ.
 */
export function readDeliveryCatalog(raw: unknown): DeliveryCatalog {
  const c = raw as Record<string, unknown> | null | undefined;
  if (!c || typeof c !== 'object') throw new DeliveryVerificationError('DELIVERY_CATALOG_UNREADABLE');
  if (c.schemaVersion !== 'MIZAN-R2-CATALOG-1') {
    throw new DeliveryVerificationError(`DELIVERY_CATALOG_SCHEMA_UNSUPPORTED:${String(c.schemaVersion ?? 'missing')}`);
  }
  if (c.state !== 'READY') throw new DeliveryVerificationError(`DELIVERY_CATALOG_NOT_READY:${String(c.state ?? 'missing')}`);
  if (!Array.isArray(c.datasets)) throw new DeliveryVerificationError('DELIVERY_CATALOG_DATASETS_MISSING');
  return {
    schemaVersion: c.schemaVersion,
    state: c.state,
    generatedAt: typeof c.generatedAt === 'string' ? c.generatedAt : undefined,
    datasets: c.datasets as KfgqpcDeliveryCatalogDataset[],
    unavailableAudio: Array.isArray(c.unavailableAudio) ? (c.unavailableAudio as string[]) : [],
    unverifiedAudio: Array.isArray(c.unverifiedAudio) ? (c.unverifiedAudio as string[]) : [],
  };
}

export interface DatasetRequirement {
  id: string;
  dataset?: KfgqpcDeliveryCatalogDataset;
  ok: boolean;
  code?: string;
}

/**
 * الحزمُ المطلوبة هي ما يعلنه المنتجُ نفسُه في `KFGQPC_REQUIRED_DELIVERY_DATASETS` —
 * لا قائمةٌ تُكتب هنا فتفارقه بصمت.
 *
 * وحالتان مذكورتان في الشجرة صراحةً ليستا فشلًا: صوتُ ورشٍ الرسميُّ غيرُ متاح
 * (`OFFICIAL_AUDIO_UNAVAILABLE`)، وصوتُ الدوريِّ غيرُ مُتحقَّقٍ بعد (`UNVERIFIED`) —
 * وكلتاهما معلنةٌ في الكتالوج بحقلٍ خاصّ، فلا تمرّ صامتةً.
 */
export function requiredDatasetVerdicts(catalog: DeliveryCatalog): DatasetRequirement[] {
  const byId = new Map(catalog.datasets.map(d => [d.id, d]));
  return KFGQPC_REQUIRED_DELIVERY_DATASETS.map(id => {
    const dataset = byId.get(id);
    if (!dataset) return { id, ok: false, code: 'DATASET_MISSING_FROM_CATALOG' };
    if (dataset.status !== 'VERIFIED') return { id, dataset, ok: false, code: `DATASET_NOT_VERIFIED:${dataset.status}` };
    if (!dataset.r2Prefix) return { id, dataset, ok: false, code: 'DATASET_PREFIX_MISSING' };
    return { id, dataset, ok: true };
  });
}

export interface ObservedDataset { fileCount: number; totalBytes: number; sha256?: string }

/**
 * يقارن المرصودَ على R2 بالمعلن في الكتالوج. والعددُ والحجمُ يُقارنان دائمًا؛ والبصمةُ
 * حين تُحسب (`--deep`).
 *
 * ويفشل مغلقًا عند غياب البصمة المعلنة: حزمةٌ بلا بصمةٍ في الكتالوج لا يُتحقَّق منها
 * بحال، فلا تُعدّ سليمةً لمجرّد أن عددَ ملفّاتها يطابق.
 */
export function datasetIntegrityVerdict(
  declared: KfgqpcDeliveryCatalogDataset,
  observed: ObservedDataset,
): { ok: boolean; code?: string } {
  if (observed.fileCount === 0) return { ok: false, code: 'DATASET_EMPTY_ON_STORAGE' };
  if (typeof declared.fileCount === 'number' && declared.fileCount !== observed.fileCount) {
    return { ok: false, code: `DATASET_FILE_COUNT_MISMATCH:${declared.fileCount}≠${observed.fileCount}` };
  }
  if (typeof declared.totalBytes === 'number' && declared.totalBytes !== observed.totalBytes) {
    return { ok: false, code: `DATASET_SIZE_MISMATCH:${declared.totalBytes}≠${observed.totalBytes}` };
  }
  if (observed.sha256) {
    if (!declared.sha256) return { ok: false, code: 'DATASET_DIGEST_NOT_DECLARED' };
    if (declared.sha256 !== observed.sha256) return { ok: false, code: 'DATASET_DIGEST_MISMATCH' };
  }
  return { ok: true };
}

/**
 * يعيد بناء بصمة المجلَّد من بايتات R2 بالخوارزميّة نفسها التي كتبها بها `hashDirectory`:
 * الملفّات مرتَّبةً بمسارها، ولكلٍّ `المسارُ النسبيّ` ثم `\0` ثم **بصمتُه بايتاتٍ لا نصًّا**
 * ثم `\0`.
 *
 * والمطابقةُ حرفٌ بحرف مقصودة: أيُّ فرقٍ في الترتيب أو في صيغة البصمة يعطي رقمًا آخرَ
 * فيُقرأ فسادًا حيث لا فساد — وهو أخطرُ من ألّا نتحقّق، لأنه يُرسل المسؤولَ إلى عطلٍ
 * ليس موجودًا.
 */
export function deliveryDirectoryDigest(entries: { relativePath: string; bytes: Uint8Array }[]): {
  sha256: string; fileCount: number; totalBytes: number;
} {
  const sorted = [...entries].sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
  const h = crypto.createHash('sha256');
  let totalBytes = 0;
  for (const entry of sorted) {
    totalBytes += entry.bytes.byteLength;
    h.update(entry.relativePath);
    h.update('\0');
    h.update(crypto.createHash('sha256').update(entry.bytes).digest());
    h.update('\0');
  }
  return { sha256: h.digest('hex'), fileCount: sorted.length, totalBytes };
}

/** المسارُ النسبيُّ لكائنٍ تحت بادئة الحزمة — وبادئةٌ لا تنطبق تُرفض لا تُقصّ عشوائيًّا. */
export function relativeKey(prefix: string, key: string): string {
  const root = prefix.endsWith('/') ? prefix : `${prefix}/`;
  if (!key.startsWith(root)) throw new DeliveryVerificationError(`OBJECT_OUTSIDE_PREFIX:${key}`);
  return key.slice(root.length);
}

export type PackageLayoutMode = 'enabled' | 'not-in-use';

/**
 * تخطيطُ `quran/packages/` لم يُنشر قطُّ ولا يكتب فيه شيءٌ في هذا المستودع. وحذفُ
 * التحقّقِ منه إخفاءٌ، وإبقاؤه بوّابةً إحمرارٌ أبديٌّ يُعلَّم تجاهلُه. فصار **إعدادًا
 * معلنًا**: مُطفأٌ افتراضًا مع سطرٍ يُطبع في كلّ تشغيلٍ يذكر أنه ليس قيدَ الاستعمال
 * ويذكر القرار المعلَّق — ويُشغَّل بمتغيّرٍ واحدٍ متى اتُّخذ القرار.
 *
 * وهذا هو النمطُ نفسُه الذي فُرض على سياسة التعادل: قرارٌ لا يُخترع، بل يُصرَّح بغيابه.
 */
export function packageLayoutMode(env: Record<string, string | undefined>): PackageLayoutMode {
  return String(env.MIZAN_QURAN_PACKAGE_LAYOUT || '').trim().toLowerCase() === 'enabled' ? 'enabled' : 'not-in-use';
}
