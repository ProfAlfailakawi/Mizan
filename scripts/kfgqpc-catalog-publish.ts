#!/usr/bin/env node
import 'dotenv/config';
import { R2PrivateClient, r2ConfigFromEnv } from '../server/r2-private';
import { kfgqpcActualStorageReport } from '../server/kfgqpc-delivery';

/**
 * MIZAN — نشر كتالوج جاهزية التسليم delivery/_mizan/catalog.json
 *
 * يفحص R2 الفعلي ويكتب **جردًا** لما هو مرفوع: البوادئُ وأعدادُ ملفّاتها وأحجامُها.
 *
 * **وهو جردٌ لا شهادةَ جاهزية.** كان يكتب `schemaVersion:'MIZAN-R2-CATALOG-1'` و
 * `state:'READY'` — وهما هويّةُ الكتالوج الذي يصدره مسارُ الاستيعاب بعد التحقّق من
 * البصمات (`buildReadyDeliveryCatalog`)، والذي يرفض أن يُصدر أصلًا ما لم تكن الحزمُ
 * الأربعَ عشرةَ المطلوبة `VERIFIED`.
 *
 * فكان مستندان مختلفان تمامًا يتقاسمان مفتاحًا واحدًا وهويّةً واحدة: أحدهما يكسب
 * «READY» بالتحقّق، والآخر **يعلنها بمجرّد سرد ما صادفه في الدلو**. و`health()` في
 * `r2-private.ts` كانت تقرأ الحقلين فتقول «جاهز» — فتُعرض لوحةُ جاهزية التسليم خضراءَ
 * بناءً على مستندٍ لم يتحقّق من شيء. وهذا اعتمادٌ زائف، ولو كان كلُّ حقلٍ فيه صادقًا.
 *
 * فصار للجرد هويّتُه: `MIZAN-R2-INVENTORY-1` و`state:'INVENTORY'`. ويبقى شفّافًا كما كان
 * في مصدره (`sourceMode:'OPEN_MIRROR'`): أصولٌ من مجمع الملك فهد مُعادةُ النشر عبر مرايا
 * مفتوحة، لا حزمُ المجمع الموقّعة مباشرة.
 */

const cfg = r2ConfigFromEnv();
if (!cfg) { console.error('R2_NOT_CONFIGURED'); process.exit(1); }
const r2 = new R2PrivateClient(cfg);

function summarize(objects: { key: string; size: number }[]) {
  const groups: Record<string, { files: number; bytes: number }> = {};
  for (const o of objects) {
    const parts = o.key.split('/');
    // مثال: delivery/mushaf-pages/madinah/v1/001.png → مجموعة delivery/mushaf-pages/madinah/v1
    const g = parts.slice(0, Math.min(parts.length - 1, 4)).join('/');
    (groups[g] ||= { files: 0, bytes: 0 });
    groups[g].files++; groups[g].bytes += o.size;
  }
  return Object.entries(groups).map(([prefix, v]) => ({ prefix, files: v.files, bytes: v.bytes })).sort((a, b) => a.prefix.localeCompare(b.prefix));
}

(async () => {
  const objects = await r2.listAllObjects('delivery/');
  const storage = kfgqpcActualStorageReport(objects);
  const groups = summarize(objects);
  const catalog = {
    schemaVersion: 'MIZAN-R2-INVENTORY-1' as const,
    state: 'INVENTORY' as const,
    authority: 'King Fahd Glorious Quran Printing Complex',
    sourceMode: 'OPEN_MIRROR',
    provenanceNote: 'أصول مصدرها مجمع الملك فهد مُعادة النشر عبر مرايا مفتوحة (MIT) قابلة للوصول؛ ليست حزم المجمع الموقّعة مباشرة. التحقق العلمي/الاعتماد الرسمي مسار منفصل.',
    mirrors: [
      'github.com/thetruetruth/quran-data-kfgqpc',
      'files.quran.app (madani pages)',
      'github.com/spa5k/tafsir_api (ar-tafsir-muyassar)',
      'everyayah.com (Maher Al-Muaiqly, Hafs)',
      'github.com/zonetecde/mushaf-layout (word/line layout)'
    ],
    generatedAt: new Date().toISOString(),
    groups,
    storage
  };
  const body = Buffer.from(JSON.stringify(catalog, null, 2), 'utf8');
  await r2.putObject('delivery/_mizan/catalog.json', body, 'application/json');
  process.stdout.write(JSON.stringify({ ok: true, published: 'delivery/_mizan/catalog.json', objectCount: objects.length, totalMB: +(storage.totalBytes / 1048576).toFixed(2), withinFreeTier: storage.withinFreeTier, groups: groups.length }) + '\n');
})().catch((e) => { console.error(e); process.exit(1); });
