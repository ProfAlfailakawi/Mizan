#!/usr/bin/env tsx
/*
 * إدخالُ أرشيفٍ رسميٍّ نُزّل من مرآة — بلا لمسِ موقع المجمّع.
 *
 * `kfgqpc-acquire.ts` يُنزّل من موقع المجمّع ويرفض أيَّ مضيفٍ سواه. وذلك صوابٌ ما دام
 * الموقعُ يعمل؛ فإن تعطّل صار المسارُ كلُّه معطَّلًا، والبياناتُ الرسميّة موجودةٌ على
 * مرايا.
 *
 * **والمرآةُ لا تُضعف شيئًا هنا.** بصماتُ المجمّع الرسميّة (MD5+SHA-1) مثبَّتةٌ في
 * `kfgqpc-ingest.ts`، فأرشيفٌ تطابق بصمتاه **هو** أرشيفُ المجمّع بايتًا ببايت مهما
 * كان الموضعُ الذي نُزّل منه. وذلك إثباتٌ رياضيّ أقوى من ثقةٍ بمضيف.
 *
 *   npx tsx scripts/kfgqpc-stage-archives.ts ~/Downloads
 *
 * ويُدخل ما طابق إلى `.mizan-ingest/<id>/` بالشكل الذي يتوقّعه `kfgqpc-ingest.ts`،
 * فيمضي بعده المسارُ القائم كما هو:
 *
 *   npx tsx scripts/kfgqpc-ingest.ts --verify --upload --report
 *
 * **ولا يُصدّق اسمَ ملفّ.** التعيينُ بالبصمة وحدها: ملفٌّ اسمُه `hafs.zip` وبصمتُه
 * بصمةُ ورش يُدخَل ورشًا — والعكسُ يُرفض. فالاسمُ زينةٌ والبصمةُ هويّة.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, copyFileSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { hasZipMagic } from '../server/kfgqpc-acquisition-policy';

/** المواصفاتُ تُقرأ من `kfgqpc-ingest.ts` نفسِه — فلا تُكتب البصماتُ في موضعين. */
export interface ArchiveSpec { id: string; md5: string; sha1: string }

export function specsFromIngest(source: string): ArchiveSpec[] {
  const specs: ArchiveSpec[] = [];
  const pattern = /^\s*'?([a-z-]+)'?:\{id:'([a-z-]+)'[^}]*?officialChecksum:\{md5:'([0-9A-F]{32})',sha1:'([0-9A-F]{40})'\}/gm;
  for (const [, , id, md5, sha1] of source.matchAll(pattern)) specs.push({id, md5, sha1});
  return specs;
}

export interface Digest { md5: string; sha1: string }

export function digestBytes(bytes: Buffer): Digest {
  return {
    md5: createHash('md5').update(bytes).digest('hex').toUpperCase(),
    sha1: createHash('sha1').update(bytes).digest('hex').toUpperCase(),
  };
}

/*
 * البصمةُ تُحسب بالتدفّق لا بتحميل الملفّ. فالمجلّدُ الذي يُمرَّر — `~/Downloads` كما
 * في المثال أعلاه — قد يحوي ملفًّا بعدّة جيجابايت، وقراءتُه كاملًا إلى الذاكرة تقتل
 * العمليّة **قبل** أن تبلغ الأرشيفَ الصحيح. فالحزمةُ الصالحة تضيع بسبب جارٍ لا شأن له.
 */
export function digestFileStream(path: string): Promise<Digest> {
  return new Promise((ok, fail) => {
    const md5 = createHash('md5'), sha1 = createHash('sha1');
    createReadStream(path)
      .on('data', chunk => { md5.update(chunk); sha1.update(chunk); })
      .on('error', fail)
      .on('end', () => ok({
        md5: md5.digest('hex').toUpperCase(),
        sha1: sha1.digest('hex').toUpperCase(),
      }));
  });
}

/** أوّلُ `n` بايتًا وحدها — لفحص التوقيع بلا تحميل الملفّ. */
export function leadingBytes(path: string, n: number): Buffer {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(n);
    return buf.subarray(0, readSync(fd, buf, 0, n, 0));
  } finally { closeSync(fd); }
}

/** التعيينُ بالبصمتين معًا. واحدةٌ دون الأخرى ليست تعيينًا — وتُسمّى ولا تُبتلع. */
export function identifyDigest(digest: Digest, specs: readonly ArchiveSpec[]) {
  for (const spec of specs) {
    const md5 = digest.md5 === spec.md5, sha1 = digest.sha1 === spec.sha1;
    if (md5 && sha1) return {digest, spec};
    if (md5 !== sha1) return {digest, partial: spec.id};
  }
  return {digest};
}

export function identify(bytes: Buffer, specs: readonly ArchiveSpec[]) {
  return identifyDigest(digestBytes(bytes), specs);
}

/* فكٌّ آمن: نفسُ حارس `kfgqpc-acquire.ts` — لا مسارَ مطلقٌ ولا `..` في أيّ مُدخَل. */
function safeExtract(archive: string, payload: string) {
  const list = spawnSync('unzip', ['-Z1', archive], {encoding: 'utf8'});
  if (list.status !== 0) throw new Error(`ZIP_LIST_FAILED:${list.stderr || list.stdout}`);
  const entries = String(list.stdout || '').split(/\r?\n/).filter(Boolean);
  if (!entries.length) throw new Error('ZIP_EMPTY');
  for (const name of entries) {
    const clean = name.replace(/\\/g, '/');
    if (clean.startsWith('/') || clean.split('/').includes('..')) throw new Error(`ZIP_UNSAFE_PATH:${name}`);
  }
  rmSync(payload, {recursive: true, force: true});
  mkdirSync(payload, {recursive: true});
  const out = spawnSync('unzip', ['-q', archive, '-d', payload], {encoding: 'utf8'});
  if (out.status !== 0) throw new Error(`ZIP_EXTRACT_FAILED:${out.stderr || out.stdout}`);
}

async function main() {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error('الاستعمال: npx tsx scripts/kfgqpc-stage-archives.ts <ملفّ أو مجلّد> …');
    process.exitCode = 2;
    return;
  }
  const repo = process.cwd();
  const specs = specsFromIngest(readFileSync(join(repo, 'scripts', 'kfgqpc-ingest.ts'), 'utf8'));
  if (specs.length < 6) {
    console.error(`لم تُقرأ مواصفاتُ الحزم من kfgqpc-ingest.ts (وُجد ${specs.length}). لا يُخمَّن شيء.`);
    process.exitCode = 2;
    return;
  }

  const root = join(repo, '.mizan-ingest');
  const files = targets.flatMap(target => {
    const full = resolve(target);
    return statSync(full).isDirectory()
      ? readdirSync(full).map(name => join(full, name)).filter(path => statSync(path).isFile())
      : [full];
  });

  console.log(`\nمقابلةُ ${files.length} ملفًّا ببصمات المجمّع الرسميّة (${specs.length} حزمة)\n` + '─'.repeat(60));
  const staged: string[] = [];
  let refused = 0;

  for (const file of files) {
    const {digest, spec, partial} = identifyDigest(await digestFileStream(file), specs);
    const name = basename(file).padEnd(28);

    if (partial) { console.log(`  ⚠ ${name} طابقت بصمةٌ واحدة من «${partial}» لا كلتاهما`); refused += 1; continue; }
    if (!spec) { console.log(`  ✗ ${name} لا يطابق أيَّ حزمةٍ رسميّة\n      MD5 ${digest.md5}`); refused += 1; continue; }
    if (!hasZipMagic(leadingBytes(file, 4))) { console.log(`  ⚠ ${name} بصمتُه تطابق «${spec.id}» لكنه ليس أرشيف ZIP`); refused += 1; continue; }

    /*
     * الإدخالُ يتمّ في مجلّدٍ مؤقّتٍ ثمّ يُبدَّل دفعةً واحدة، ولا يُكتب في موضعه شيءٌ
     * ناقص. وهذا ليس تجميلًا: `kfgqpc-ingest.ts` يتحقّق من بصمة `source.zip` ويعدّ
     * الحمولةَ موجودةً بمجرّد وجود المجلّد (سطر ٤٧)، ولا يتحقّق من اكتمالها لحزم
     * DATA. فلو فشل الفكُّ في منتصفه — امتلأ القرصُ مثلًا — بقي أرشيفٌ صحيحُ البصمة
     * إلى جانب حمولةٍ منقوصة، فيُقرأ الإدخالُ `VERIFIED` ويُرفع إلى R2 ناقصًا.
     *
     * والمجلّدُ السابقُ الصالح يبقى كما هو حتّى ينجح بديلُه، فلا يُفسد الفشلُ ما كان
     * سليمًا قبله.
     *
     * و`sourceUrl` هويّةُ الناشر لا مسارُ النقل — والناشرُ هو المجمّع، أثبتته البصمة.
     * وطريقُ الوصول يُسجَّل منفصلًا كي لا يُقرأ الأثرُ يومًا على أنه تنزيلٌ مباشر.
     */
    const dir = join(root, spec.id);
    const pending = join(root, `.pending-${spec.id}`);
    const previous = existsSync(join(dir, 'source.json')) ? JSON.parse(readFileSync(join(dir, 'source.json'), 'utf8')) : {};
    try {
      rmSync(pending, {recursive: true, force: true});
      mkdirSync(pending, {recursive: true});
      copyFileSync(file, join(pending, 'source.zip'));
      safeExtract(join(pending, 'source.zip'), join(pending, 'payload'));
      writeFileSync(join(pending, 'source.json'), JSON.stringify({
        ...previous,
        sourceUrl: 'https://qurancomplex.gov.sa/en/techquran/dev/',
        sourceArchive: 'source.zip',
        downloadedAt: new Date().toISOString(),
        officialChecksumVerified: true,
        acquisitionMode: 'LOCAL_ARCHIVE_STAGED',
        acquisitionNote: 'بايتاتٌ قُدِّمت محلّيًّا وطابقت بصمةَ المجمّع الرسميّة (MD5+SHA-1). لم يُتّصل بموقع المجمّع.',
        stagedFromBasename: basename(file),
      }, null, 2) + '\n');
      rmSync(dir, {recursive: true, force: true});
      renameSync(pending, dir);
    } catch (error) {
      rmSync(pending, {recursive: true, force: true});
      console.log(`  ✗ ${name} تطابق «${spec.id}» لكن الإدخال فشل: ${error instanceof Error ? error.message : error}`);
      refused += 1;
      continue;
    }

    console.log(`  ✓ ${name} ← «${spec.id}» · أُدخل إلى .mizan-ingest/${spec.id}/`);
    staged.push(spec.id);
  }

  const missing = specs.filter(spec => !staged.includes(spec.id)).map(spec => spec.id);
  console.log('─'.repeat(60));
  console.log(`  أُدخل: ${staged.length} من ${specs.length}`);
  if (missing.length) console.log(`  لم يُعطَ: ${missing.join(' · ')}`);

  if (refused) {
    console.error('\nملفٌّ لا تطابق بصمتُه ليس حزمةَ المجمّع — ولم يُدخَل.');
    process.exitCode = 1;
  } else if (staged.length) {
    console.log('\nالخطوةُ التالية:\n  npx tsx scripts/kfgqpc-ingest.ts --verify --report');
  }
}

if (process.argv[1] && process.argv[1].endsWith('kfgqpc-stage-archives.ts')) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
