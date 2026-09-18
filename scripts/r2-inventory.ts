#!/usr/bin/env node
import 'dotenv/config';
import { R2PrivateClient, r2ConfigFromEnv } from '../server/r2-private';

/*
 * جردُ شجرة R2 — قراءةٌ محضة، لا يكتب بايتًا واحدًا ولا يحذف كائنًا.
 *
 * سببُ وجوده: بوّابةُ `quran:verify-r2` تفشل، وفشلُها لا يميّز بين ثلاثة احتمالات:
 * أن الرفع لم يجرِ بعدُ، أو أن مُرفِّعَ الحزم لم يُبنَ أصلًا، أو أن `quran/packages/`
 * تخطيطٌ مهجورٌ والشجرةُ الحيّة تحت مفتاحٍ آخر. الظنُّ لا يُغني هنا: فهذا السكربت
 * يسأل التخزينَ نفسه ويطبع ما وجد، فيصير الاختيارُ بين الثلاثة على بيّنة.
 *
 * ولا يطبع سرًّا: لا نقطةَ النهاية ولا اسمَ الدلو ولا المفاتيح — بل عددَ الكائنات
 * وحجمَها تحت كل بادئة. فالسجلّ عامٌّ، واسمُ الدلو سرٌّ مُعلن في `R2_BUCKET`.
 *
 * الاستعمال:
 *   npm run r2:inventory
 *   npm run r2:inventory -- --prefix=quran/ --depth=3
 */

const args = process.argv.slice(2);
const val = (k: string) => {
  const inline = args.find(a => a.startsWith(`--${k}=`));
  if (inline) return inline.slice(k.length + 3);
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const prefix = val('prefix') ?? '';
const depth = Math.max(1, Math.min(6, Number(val('depth') ?? 2) || 2));

/** البوادئ التي يعنينا وجودُها أو خلوُّها صراحةً، فتُذكر ولو كانت صفرًا. */
const EXPECTED_PREFIXES = ['quran/packages/', 'quran/sources/', 'delivery/', 'audio/hafs/', 'exports/', 'tenants/'] as const;

/** يختزل مفتاحًا إلى أوّل `depth` مقاطع، فلا يُطبع مفتاحٌ كاملٌ بذاته. */
function group(key: string, levels: number): string {
  const parts = key.split('/');
  if (parts.length <= levels) return parts.slice(0, -1).concat('*').join('/');
  return parts.slice(0, levels).join('/') + '/*';
}

const human = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
  : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB`
  : bytes >= 1024 ? `${(bytes / 1024).toFixed(0)} KB`
  : `${bytes} B`;

async function main() {
  const cfg = r2ConfigFromEnv();
  if (!cfg) {
    console.error('R2_NOT_CONFIGURED: يحتاج R2_ENDPOINT و R2_BUCKET و R2_ACCESS_KEY_ID و R2_SECRET_ACCESS_KEY.');
    console.error('  الجردُ تشخيصٌ لا بوّابة، فلا يُفشل البناءَ لغياب الاعتماد.');
    return;
  }

  const r2 = new R2PrivateClient(cfg);
  const objects = await r2.listAllObjects(prefix);

  const buckets = new Map<string, { count: number; bytes: number }>();
  for (const o of objects) {
    const g = group(o.key, depth);
    const cur = buckets.get(g) ?? { count: 0, bytes: 0 };
    cur.count += 1; cur.bytes += o.size || 0;
    buckets.set(g, cur);
  }

  const rows = [...buckets.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
  const totalBytes = objects.reduce((s, o) => s + (o.size || 0), 0);

  console.log(`جردُ R2 — البادئة «${prefix || '(الجذر)'}» بعمق ${depth}:`);
  if (!rows.length) console.log('  (لا كائن واحد تحت هذه البادئة)');
  for (const [g, v] of rows) console.log(`  ${g}  —  ${v.count} كائنًا · ${human(v.bytes)}`);
  console.log(`المجموع: ${objects.length} كائنًا · ${human(totalBytes)}`);

  console.log('\nالبوادئ المتوقَّعة في التخطيط:');
  for (const p of EXPECTED_PREFIXES) {
    const matching = objects.filter(o => o.key.startsWith(p));
    const bytes = matching.reduce((s, o) => s + (o.size || 0), 0);
    const verdict = matching.length ? `${matching.length} كائنًا · ${human(bytes)}` : 'خالية';
    console.log(`  ${p.padEnd(18)} ${verdict}`);
  }
}

main().catch(err => {
  console.error(`R2_INVENTORY_FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
