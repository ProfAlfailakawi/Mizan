#!/usr/bin/env node
import 'dotenv/config';
import { R2PrivateClient, r2ConfigFromEnv } from '../server/r2-private';
import { quranPackageKey, sha256Hex, verifyIntegrity, readPackageManifestFiles, type ObjectIntegrity, type PackageManifestFile } from '../server/r2-object-layout';
import { CANONICAL_RAWI_IDS } from '../src/lib/canonical-readings';

/*
 * تحقّقُ نزاهةِ حزم القرآن المرفوعة إلى R2.
 *
 * الرفعُ الناجح ليس دليلَ سلامة: قد يُقطع النقل، أو يُكتب فوق المفتاح، أو يُرفع ملفٌّ
 * مكانَ ملفّ. فهذا السكربت يقرأ بيان الحزمة من R2 نفسه، ثم يطابق كل ملفٍّ مذكورٍ فيه
 * بالحجم والبصمة. والبصمة تُحسب هنا ولا تُؤخذ من ETag: فـETag ليس SHA-256، وقد يكون
 * مركّبًا في الرفع المتعدّد الأجزاء.
 *
 * ويفشل مغلقًا: أي فرقٍ يعني أن الحزمة غير صالحة للاستعمال العلمي، فتُبلَّغ ويعود
 * السكربت بحالةٍ غير صفرية بدل أن يمرّ.
 *
 * الاستعمال:
 *   npm run quran:verify-r2 -- --reading=hafs --version=v1
 *   npm run quran:verify-r2 -- --all --version=v1
 *   npm run quran:verify-r2 -- --all --version=v1 --deep     (ينزّل ويحسب البصمة)
 *   npm run quran:verify-r2 -- --all --version=v1 --dry-run  (يطبع المفاتيح بلا شبكة)
 */

const args = process.argv.slice(2);
const flag = (k: string) => args.includes(`--${k}`);
const val = (k: string) => {
  const inline = args.find(a => a.startsWith(`--${k}=`));
  if (inline) return inline.slice(k.length + 3);
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const dryRun = flag('dry-run');
const deep = flag('deep');
const version = val('version') || 'v1';
const reading = val('reading');
const all = flag('all');

if (!reading && !all) {
  console.error('USAGE: --reading=<rawiId> | --all   [--version=v1] [--deep] [--dry-run]');
  process.exit(2);
}

const readings = all ? [...CANONICAL_RAWI_IDS] : [reading!];
for (const r of readings) {
  if (!CANONICAL_RAWI_IDS.includes(r)) {
    console.error(`UNKNOWN_READING: ${r} — ليس راويًا قانونيًا في السجلّ.`);
    process.exit(2);
  }
}

async function main() {
  if (dryRun) {
    for (const rawiId of readings) {
      console.log(`[dry-run] ${quranPackageKey(rawiId, version)}`);
    }
    console.log(`\n[dry-run] ${readings.length} manifest(s) would be read; no network call was made.`);
    return;
  }

  const cfg = r2ConfigFromEnv();
  if (!cfg) {
    console.error('R2_NOT_CONFIGURED: set R2_ENDPOINT/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY');
    console.error('التحقّق يحتاج اعتمادًا حقيقيًا؛ ولا يُعتبر الرفع مُتحقَّقًا بلا ذلك.');
    process.exit(1);
  }

  const client = new R2PrivateClient(cfg);
  let failures = 0;
  let checked = 0;

  for (const rawiId of readings) {
    const manifestKey = quranPackageKey(rawiId, version);
    const res = await client.getObject(manifestKey);
    if (!res) {
      console.error(`MISSING_MANIFEST ${rawiId}: ${manifestKey}`);
      failures++;
      continue;
    }

    let files: PackageManifestFile[];
    try {
      files = readPackageManifestFiles(await res.json());
    } catch (err) {
      console.error(`MANIFEST_UNREADABLE ${rawiId}: ${err instanceof Error ? err.message : String(err)}`);
      failures++;
      continue;
    }

    for (const file of files) {
      const key = quranPackageKey(rawiId, version, file.name);
      const expected: ObjectIntegrity = { key, sha256: file.sha256, sizeBytes: file.sizeBytes, contentType: file.contentType || 'application/octet-stream' };

      const head = await client.headObject(key);
      if (!head) {
        console.error(`MISSING_OBJECT ${rawiId}: ${key}`);
        failures++;
        continue;
      }

      // البصمة تُحسب من البايتات عند --deep؛ وإلا تُقرأ من وسم الرفع.
      let actualSha = head.sha256;
      if (deep) {
        const body = await client.getObject(key);
        if (!body) { console.error(`MISSING_OBJECT ${rawiId}: ${key}`); failures++; continue; }
        actualSha = sha256Hex(new Uint8Array(await body.arrayBuffer()));
      }

      const verdict = verifyIntegrity(expected, { sizeBytes: head.size, sha256: actualSha });
      checked++;
      if (!verdict.ok) {
        console.error(`${verdict.code} ${rawiId}: ${key}`);
        failures++;
      }
    }
    console.log(`${rawiId}@${version}: ${files.length} file(s) in manifest`);
  }

  console.log(`\nمُتحقَّق: ${checked} كائنًا · فاشل: ${failures}${deep ? ' · وضع البصمة العميقة' : ' · وسم البصمة'}`);
  if (failures) {
    console.error('R2_OBJECT_INTEGRITY_FAILED: الحزمة غير صالحة للاستعمال العلمي حتى تُصلَح.');
    process.exit(1);
  }
}

main().catch(err => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
