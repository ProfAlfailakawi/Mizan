/*
 * وحدةٌ تَعِد بتخطيطٍ لا يستعمله المنتج ليست تجريدًا مبكّرًا، هي وعدٌ كاذب.
 *
 * `server/r2-object-layout.ts` يفتتح بأن «العميل لا يرسل مفتاحَ كائنٍ حرًّا أبدًا؛ الخادم
 * يبنيه من معرّفاتٍ موثوقة… فأيّ محاولةِ اجتيازٍ للمسار تُرفض هنا قبل أن تلمس الشبكة».
 * وهو وصفٌ لضمانةٍ أمنيّة — يقرؤه من يراجع الشيفرة فيَبني عليه.
 *
 * والجردُ القرائيّ للدلو في 18 سبتمبر 2026 كشف أن `quran/packages/` و`audio/hafs/`
 * خاليتان تمامًا، بينما `delivery/` فيها ٧٤٧٢ كائنًا. ثم تبيّن الأعمق: **لا ملفَّ واحدًا
 * تحت `server/` أو `src/` يستورد من هذه الوحدة شيئًا**. مستهلكوها: سكربتُ التحقّق
 * واختباراتُها وحدها.
 *
 * فالضمانةُ المذكورة في رأسها لا تسري على المنتج — المنتج يبني مفاتيحه في
 * `server/kfgqpc-delivery.ts` من خريطةٍ ثابتة وبحارسٍ خاصٍّ به (`safe(readingId)`)،
 * فلا ثغرةَ اجتياز؛ لكنّ الوحدةَ تبقى وعدًا معلّقًا في الهواء.
 *
 * وهذا نفسُ صنف العطل الذي أُغلق في سطح الإدارة (P25): ملفٌّ كامل، يُترجم، ويمرّ عليه
 * كلُّ مدقّق، ولا يستورده أحد — فيُظنّ عاملًا وهو ليس كذلك.
 *
 * فهذا الاختبار يمنع تكرارَه: أيُّ صادرٍ جديدٍ من الوحدة لا يستعمله المنتج يُسقط الفحص.
 * والصادرات القائمةُ غيرُ المستعملة مُسجَّلةٌ أدناه بالاسم وبالسبب وبالقرار المعلَّق —
 * لا تُحتمل صامتةً، وتُحذف من السجلّ متى اتُّخذ القرار.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const LAYOUT = path.join(process.cwd(), 'server', 'r2-object-layout.ts');
const source = fs.readFileSync(LAYOUT, 'utf8');

/** أسماءُ الدوالّ والصادرات من الوحدة — تُستخرج من المصدر لا تُكتب يدًا. */
const exported = [...source.matchAll(/^export (?:function|const|class) ([A-Za-z][A-Za-z0-9_]*)/gm)].map(m => m[1]);

/**
 * **الوحدةُ كلُّها غيرُ موصولةٍ بالمنتج، وهذا قيدٌ واحدٌ لا خمسة.** فالمساعداتُ
 * (`buildKey`، `assertSafeSegments`، `integrityFor`…) غيرُ مستعملةٍ لأنّ بانِيَ المفاتيح
 * الذي تخدمه غيرُ مستعمل — لا لسببٍ يخصّ كلًّا منها.
 *
 * فالمُسجَّل هنا هو الوحدةُ بموضعها وبسببها وبقرارها المعلَّق. وليست هذه قائمةَ تسامح:
 * وجودُ السطر يعني أن الحاجز مفتوحٌ ومكتوب، وأن `quran:verify-r2` حمراءُ بسببه. ومتى
 * اتُّخذ القرار حُذف السطر — إمّا لأن التخطيط صار مستعمَلًا، وإمّا لأن الوحدة صُوِّبت.
 */
const UNWIRED_MODULES: Record<string, string> = {
  'server/r2-object-layout.ts':
    'يَعِد بتخطيط `quran/packages/…` و`quran/sources/…` و`audio/hafs/…` — وثلاثتُها خاليةٌ ' +
    'على R2 بشهادة `npm run r2:inventory`، والمنتجُ يقرأ ويكتب `delivery/**` وحدها عبر ' +
    '`server/kfgqpc-delivery.ts`. قرارٌ معلَّق على المالك: يُبنى ناشرُ الحزم لهذا التخطيط، ' +
    'أو يُعتمد الموجودُ تخطيطًا واحدًا ويُصوَّب كلُّ ما يَعِد بغيره، أو يُنَصُّ على أنه ' +
    'تخطيطُ مستقبلٍ لم يحن فتُوقَف البوّابةُ عنه بسببٍ مكتوب. مفصَّلٌ في docs/REMAINING-WORK.md §2.2.',
};

/** هل يذكر المنتجُ (خادمًا وواجهةً) هذا الاسم؟ السكربتاتُ والاختباراتُ ليست منتجًا. */
function usedByProduct(name: string): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (full === LAYOUT) continue;
      if (new RegExp(`\\b${name}\\b`).test(fs.readFileSync(full, 'utf8'))) {
        hits.push(path.relative(process.cwd(), full));
      }
    }
  };
  walk(path.join(process.cwd(), 'server'));
  walk(path.join(process.cwd(), 'src'));
  return hits;
}

test('the scan sees the layout module — an empty list proves nothing', () => {
  assert.ok(exported.length >= 8, `expected the key builders, found ${exported.length}`);
  assert.ok(exported.includes('quranPackageKey'), 'the scan must see an export we know exists');
  assert.ok(exported.includes('buildKey'), 'and the builder the others are built on');
});

test('every key builder is either used by the product or covered by a registered module', () => {
  /*
   * «مذكورٌ في المنتج» أضعفُ من «مُستدعًى في مسارٍ حيّ»، لكنّه يمسك الحالةَ التي وقعت
   * فعلًا: وحدةٌ كاملةٌ لا يستوردها خادمٌ ولا واجهة.
   *
   * والقيدُ على بُناةِ المفاتيح تحديدًا: هم الذين يَعِدون بموضعٍ على التخزين، فبانٍ
   * جديدٌ بلا مستهلكٍ في المنتج تخطيطٌ آخرُ يُولد مهجورًا.
   */
  const builders = exported.filter(name => /Key$/.test(name));
  assert.ok(builders.length >= 4, `expected the key builders, found ${builders.join(', ')}`);
  const covered = 'server/r2-object-layout.ts' in UNWIRED_MODULES;
  const orphans = builders.filter(name => !usedByProduct(name).length && !covered);
  assert.deepEqual(orphans, [],
    'these promise a location on the storage that nothing in the product ever writes or reads');
});

test('the module itself is imported by the product, or its absence is written down', () => {
  const importers = usedByProduct('r2-object-layout');
  if (importers.length) return; // وُصلت — فلا شيء يُسجَّل.
  assert.ok('server/r2-object-layout.ts' in UNWIRED_MODULES,
    'a module the product never imports must carry a written reason, not silence');
});

test('the registry is not a graveyard — an entry that became used must leave it', () => {
  /*
   * سجلٌّ لا يُنظَّف يصير غطاءً: يُوصَل الصادرُ بالمنتج ويبقى اسمُه هنا «معلَّقًا»، فيُقرأ
   * الحاجزُ قائمًا وقد أُغلق.
   */
  const stale = Object.keys(UNWIRED_MODULES).filter(module => usedByProduct(path.basename(module, '.ts')).length);
  assert.deepEqual(stale, [],
    'this module is imported by the product now — remove it from the registry and say so in the docs');
});

test('each registered entry states why, not merely that', () => {
  for (const [module, reason] of Object.entries(UNWIRED_MODULES)) {
    assert.ok(reason.length >= 120, `${module}: a registry entry without a reason is a silent exception`);
    assert.ok(/قرارٌ معلَّق|REMAINING-WORK/.test(reason),
      `${module}: the reason must name the decision that closes it, or the entry never leaves`);
  }
});

test('the module still enforces what it claims, wherever it is used', () => {
  // لم يُليَّن شيء: الحارسُ نفسُه باقٍ، ورفضُ الاجتياز باقٍ — المسألةُ في الوصل لا في الضمانة.
  assert.ok(source.includes('R2_KEY_TRAVERSAL'), 'traversal must still be refused');
  assert.ok(source.includes('R2_KEY_UNSAFE_SEGMENT'), 'unsafe segments must still be refused');
  assert.ok(source.includes('assertSafeSegments'), 'and every key must still go through the check');
});

test('the product builds its live keys through a guard of its own', () => {
  /*
   * ولئلّا يُقرأ ما سبق «إذن لا حارسَ على المفاتيح الحيّة»: المنتج يبني مفاتيحه في
   * `server/kfgqpc-delivery.ts` من خريطةٍ ثابتة وبعد حارسٍ خاصّ — فلا مفتاحَ يصوغه
   * العميل يصل إلى R2. الوحدةُ المهجورة نقصُ وصلٍ لا ثغرةُ اجتياز.
   */
  const delivery = fs.readFileSync(path.join(process.cwd(), 'server', 'kfgqpc-delivery.ts'), 'utf8');
  assert.ok(/function kfgqpcQuranDataKey\(readingId:string\)\{if\(!safe\(readingId\)\)return null/.test(delivery),
    'the live key builder must reject an unsafe reading id before it resolves a prefix');
  assert.ok(/QURAN_DATA_PREFIX\[readingId\]/.test(delivery),
    'and resolve through a fixed map, never from a client-supplied path');
});
