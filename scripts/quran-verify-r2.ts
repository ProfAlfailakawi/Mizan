#!/usr/bin/env node
import 'dotenv/config';
import { R2PrivateClient, r2ConfigFromEnv } from '../server/r2-private';
import { quranPackageKey, sha256Hex, verifyIntegrity, readPackageManifestFiles, type ObjectIntegrity, type PackageManifestFile } from '../server/r2-object-layout';
import { CANONICAL_RAWI_IDS } from '../src/lib/canonical-readings';
import { errorMessageArabic } from '../src/lib/error-catalog';

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
    console.error(errorMessageArabic('R2_NOT_CONFIGURED'));
    process.exit(1);
  }

  const client = new R2PrivateClient(cfg);
  let failures = 0;
  let checked = 0;
  /*
   * «غائبٌ كلُّه» ليس «فاسدٌ بعضُه».
   *
   * كان الحكمُ واحدًا للحالتين: `R2_OBJECT_INTEGRITY_FAILED` — «الحزمة غير صالحة
   * للاستعمال العلمي». وهو وصفٌ صحيحٌ لحزمةٍ موجودةٍ ببايتاتٍ تخالف المثبَّت، وخاطئٌ
   * تمامًا لشجرةٍ لم تُرفع قطّ: ليس ثمّ ما هو غيرُ صالح، ليس ثمّ شيء.
   *
   * والفرقُ يقرّر مَن يُستدعى: الأولى تُحقَّق فيها كتابةٌ لم تُؤذن، والثانية يُشغَّل
   * لها رفع. وخلطُهما يُرسل المسؤولَ إلى غير العطل.
   */
  let missingManifests = 0;

  for (const rawiId of readings) {
    const manifestKey = quranPackageKey(rawiId, version);
    const res = await client.getObject(manifestKey);
    if (!res) {
      console.error(`MISSING_MANIFEST ${rawiId}: ${manifestKey}`);
      failures++; missingManifests++;
      continue;
    }

    let files: PackageManifestFile[];
    try {
      files = readPackageManifestFiles(await res.json());
    } catch (err) {
      const code = err instanceof Error ? err.message : String(err);
      console.error(`MANIFEST_UNREADABLE ${rawiId}: ${code}`);
      console.error(`  ${errorMessageArabic(code)}`);
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
        console.error(`  ${errorMessageArabic(verdict.code!)}`);
        failures++;
      }
    }
    console.log(`${rawiId}@${version}: ${files.length} file(s) in manifest`);
  }

  console.log(`\nمُتحقَّق: ${checked} كائنًا · فاشل: ${failures}${deep ? ' · وضع البصمة العميقة' : ' · وسم البصمة'}`);
  if (missingManifests === readings.length) {
    /*
     * لا رواية واحدة موجودة. وهذا بابان لا باب، والفرقُ بينهما يقرّر عملين مختلفين
     * تمامًا — فلا يُخمَّن، بل يُسأل التخزينُ نفسه بطلبين محدودين:
     *
     *   · الدلو **فارغ** ⇒ الرفعُ لم يجرِ بعد. يُشغَّل رفع.
     *   · الدلو **عامرٌ تحت بادئةٍ أخرى** ⇒ ليست المسألةَ رفعًا تأخّر. التخطيطُ الذي
     *     تتحقّق منه هذه البوّابة لا يكتب فيه شيء، والشجرةُ الحيّة في مكانٍ آخر.
     *
     * وخلطُهما يُرسل المسؤولَ إلى غير العطل: يُقال له «شغّل الرفع» وأمامه مئاتُ
     * الميجابايتات مرفوعةً بالفعل تحت مفتاحٍ آخر، فيُعيد رفعَ ما هو مرفوع.
     */
    const underQuran = await client.listObjects('quran/', undefined, 1);
    const sample = await client.listObjects('', undefined, 1000);
    const topLevel = [...new Set(sample.objects.map(o => o.key.split('/')[0]).filter(Boolean))].sort();

    if (!sample.objects.length) {
      console.error(`R2_QURAN_PACKAGES_NOT_PUBLISHED: لا حزمة واحدة من ${readings.length} موجودة على R2.`);
      console.error(`  التخزين وصلته الأوامرُ واعتمادُه صحيح — الشجرةُ فارغة، لا فاسدة.`);
      /*
       * والمفتاحُ يُعرض بروايةٍ حقيقية لا بقالبٍ فيه `<>`: بانِي المفاتيح يرفض المحارف
       * غير الآمنة فيرمي، فيُطبع `R2_KEY_UNSAFE_SEGMENT` مكانَ السطر الذي يُفترض أن
       * يُرشد القارئ — وهو ما وقع في أوّل تشغيل.
       */
      console.error(`  المفتاح المتوقَّع لكل رواية، مثالًا: ${quranPackageKey(readings[0], version)}`);
      process.exit(1);
    }

    if (!underQuran.objects.length) {
      console.error(`R2_QURAN_PACKAGES_PREFIX_UNUSED: لا كائنَ واحدًا تحت «quran/» — والدلو ليس فارغًا.`);
      console.error(`  البوادئ الموجودة فعلًا: ${topLevel.join('، ')}`);
      console.error(`  فليست المسألة رفعًا تأخّر. التخطيطُ الذي تتحقّق منه هذه البوّابة`);
      console.error(`  (${quranPackageKey(readings[0], version)} — من \`server/r2-object-layout.ts\`)`);
      console.error(`  لا يكتب فيه شيءٌ في هذا المستودع: \`scripts/kfgqpc-r2-upload.ts\` يرفع «delivery/**».`);
      console.error(`  وهذا قرارُ مالكٍ لا إصلاحُ سكربت: إمّا يُبنى ناشرُ الحزم لهذا التخطيط،`);
      console.error(`  وإمّا يُعتمد الموجودُ تخطيطًا واحدًا ويُصوَّب كلُّ ما يَعِد بغيره.`);
      console.error(`  ولا تُسدّ الفجوة بمطابقةٍ مخترعة بين معرّفات الرواة: معرّفُ رواية في`);
      console.error(`  شجرة التسليم ليس بالضرورة معرّفَها القانونيّ، ولا مطابقةَ منصوصةً في الشجرة.`);
      process.exit(1);
    }

    console.error(`R2_QURAN_PACKAGES_NOT_PUBLISHED: لا حزمة واحدة من ${readings.length} موجودة على R2.`);
    console.error(`  وتحت «quran/» كائناتٌ أخرى — فالبادئة مستعمَلة والحزمُ ليست فيها.`);
    console.error(`  المفتاح المتوقَّع لكل رواية، مثالًا: ${quranPackageKey(readings[0], version)}`);
    process.exit(1);
  }
  if (failures) {
    console.error('R2_OBJECT_INTEGRITY_FAILED: الحزمة غير صالحة للاستعمال العلمي حتى تُصلَح.');
    if (missingManifests) console.error(`  ومنها ${missingManifests} روايةً لا بيانَ لها أصلًا — تلك تُرفع، ولا تُصلَح.`);
    process.exit(1);
  }
}

main().catch(err => { console.error(err instanceof Error ? err.message : String(err)); process.exit(1); });
