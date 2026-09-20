#!/usr/bin/env tsx
/*
 * «نزّلناها من مكانٍ آخر وتأكّدنا» — تُقاس، لا تُصدَّق ولا تُكذَّب.
 *
 * موقعُ المجمّع قد لا يعمل، فتُجلب حزمُه من مرآة. وذلك لا يُفسد شيئًا بذاته: **بصماتُ
 * المجمّع الرسميّة مثبَّتةٌ في هذا المستودع** (`LIGHT_PACKAGES`)، فملفٌّ تطابق بصمتُه
 * هو حزمةُ المجمّع بايتًا ببايت مهما كان الموضعُ الذي نُزّل منه. والمطابقةُ إثباتٌ
 * رياضيّ لا ظنّ.
 *
 * وكان البديلُ أن يُرسل المالكُ مخرجاتِ `md5sum` وأقابلها بعيني — وذلك يُدخل خطأَ نسخٍ
 * وخطأَ قراءةٍ في سلسلةٍ موضوعُها نصٌّ قرآنيّ. فيُقاس هنا ويُطبع الحكم.
 *
 *   npx tsx scripts/kfgqpc-verify-local.ts ~/Downloads
 *   npx tsx scripts/kfgqpc-verify-local.ts a.zip b.zip
 *
 * ولا يكتب شيئًا ولا ينقل ملفًّا: يقرأ ويحكم. والمطبوعُ اسمُ الملفّ وبصمتُه وحكمُها —
 * ولا يُطبع من المحتوى حرف.
 */
import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { LIGHT_PACKAGES, type LightPackageSpec } from '../server/kfgqpc-acquisition-policy';

export interface LocalDigest { md5: string; sha1: string; bytes: number }
export interface LocalVerdict {
  file: string;
  digest: LocalDigest;
  /** معرّفُ حزمة المجمّع التي طابقتها، أو undefined. */
  matched?: string;
  /** طابقت إحدى البصمتين دون الأخرى — عطبُ نقلٍ أو تصادمٌ، ويُسمّى ولا يُمرَّر. */
  partial?: string;
}

/** يُجزّئ بالبثّ: حزمةٌ من 64 م.ب لا تُحمَّل كلُّها في الذاكرة بلا داعٍ. */
export async function digestFile(path: string): Promise<LocalDigest> {
  const md5 = createHash('md5'), sha1 = createHash('sha1');
  let bytes = 0;
  await new Promise<void>((done, fail) => {
    createReadStream(path)
      .on('data', chunk => { bytes += chunk.length; md5.update(chunk); sha1.update(chunk); })
      .on('error', fail)
      .on('end', done);
  });
  return {md5: md5.digest('hex').toUpperCase(), sha1: sha1.digest('hex').toUpperCase(), bytes};
}

/*
 * الحكمُ يشترط **البصمتين معًا**. ولو اكتُفي بواحدة لصار «طابق» يعني «طابق أحدَهما»،
 * وهو حكمٌ أضعف مما يبدو. وإن طابقت واحدةٌ دون الأخرى فذلك خبرٌ بنفسه — يُسمّى ولا
 * يُبتلع، فهو إمّا نقلٌ معطوب وإمّا شيءٌ يستحقّ النظر.
 */
export function judge(digest: LocalDigest, specs: readonly LightPackageSpec[] = LIGHT_PACKAGES): Pick<LocalVerdict, 'matched' | 'partial'> {
  for (const spec of specs) {
    const md5 = digest.md5 === spec.md5.toUpperCase();
    const sha1 = digest.sha1 === spec.sha1.toUpperCase();
    if (md5 && sha1) return {matched: spec.id};
    if (md5 !== sha1) return {partial: spec.id};
  }
  return {};
}

function filesUnder(target: string): string[] {
  const full = resolve(target);
  const stat = statSync(full);
  if (!stat.isDirectory()) return [full];
  return readdirSync(full)
    .map(name => join(full, name))
    .filter(path => statSync(path).isFile());
}

async function main() {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error('الاستعمال: npx tsx scripts/kfgqpc-verify-local.ts <ملفّ أو مجلّد> …');
    process.exitCode = 2;
    return;
  }

  const files = targets.flatMap(filesUnder);
  if (!files.length) { console.error('لا ملفّات في المسار المُعطى.'); process.exitCode = 2; return; }

  const verdicts: LocalVerdict[] = [];
  for (const file of files) {
    const digest = await digestFile(file);
    verdicts.push({file, digest, ...judge(digest)});
  }

  console.log('\nمقابلةُ البصمات الرسميّة المثبَّتة في ميزان\n' + '─'.repeat(58));
  for (const v of verdicts) {
    const size = `${(v.digest.bytes / 1_048_576).toFixed(1)} م.ب`;
    if (v.matched) console.log(`  ✓ ${basename(v.file).padEnd(30)} ← حزمة «${v.matched}» · ${size}`);
    else if (v.partial) console.log(`  ⚠ ${basename(v.file).padEnd(30)} ← طابقت بصمةٌ واحدة من «${v.partial}» لا كلتاهما · ${size}`);
    else console.log(`  ✗ ${basename(v.file).padEnd(30)} ← لا يطابق أيَّ حزمةٍ رسميّة · ${size}\n      MD5 ${v.digest.md5}`);
  }

  const matched = new Set(verdicts.map(v => v.matched).filter(Boolean) as string[]);
  const missing = LIGHT_PACKAGES.filter(spec => !matched.has(spec.id)).map(spec => spec.id);
  console.log('─'.repeat(58));
  console.log(`  طابق: ${matched.size} من ${LIGHT_PACKAGES.length}`);
  if (missing.length) console.log(`  لم يُعطَ أو لم يطابق: ${missing.join(' · ')}`);

  const unmatched = verdicts.filter(v => !v.matched);
  if (unmatched.length) {
    console.error('\nملفٌّ لا تطابق بصمتُه ليس حزمةَ المجمّع — ولا يُبنى عليه نصٌّ قرآنيّ.');
    process.exitCode = 1;
  } else {
    console.log('\nكلُّ ما أُعطي هو حزمُ المجمّع بايتًا ببايت. أرسل هذا الخرج.');
  }
}

if (process.argv[1] && process.argv[1].endsWith('kfgqpc-verify-local.ts')) void main();
