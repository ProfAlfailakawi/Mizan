/*
 * P36 — كلُّ متغيّرِ بيئةٍ يقرؤه المنتج مذكورٌ للمشغّل، أو مُستثنًى بسببه.
 *
 * `.env.example` هو ما ينسخه المشغّلُ ليُهيّئ نشرةً. وما لم يُذكر فيه لا يُضبَط — ولا
 * يشكو المنتجُ من غيابه، إنما يعمل بافتراضٍ صامت.
 *
 * وهذا ليس ترتيبًا: بين المفقودات `VITE_REQUIRE_AUTH` — وغيابُها هو المانعُ الوحيد الذي
 * يرفعه `npm run preflight`؛ و`MIZAN_ENABLE_DEMO_SEED` التي تزرع بياناتِ عرضٍ في إنتاج؛
 * و`MIZAN_REQUIRE_MFA_FOR_SUPER_ADMIN` التي يظنّ من لم يرها أن المصادقةَ الثنائية مفروضة.
 *
 * فالجردُ هنا يُجبر كلَّ متغيّرٍ جديد على أن يُصنَّف: يُذكر للمشغّل، أو يُستثنى باسمه
 * وبسببه. ولا ثالثَ يمرّ صامتًا.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'artifacts', 'coverage']);
const PREFIXES = /^(MIZAN|VITE|R2|FIREBASE|FIRESTORE|GEMINI|GOOGLE)[A-Z0-9_]*$/;

function sourceFiles(dir = ROOT, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) sourceFiles(path.join(dir, entry.name), acc); continue; }
    if (/\.(ts|tsx|mjs)$/.test(entry.name)) acc.push(path.join(dir, entry.name));
  }
  return acc;
}

/** ما يقرؤه المنتجُ فعلًا — يُستخرج من الشيفرة لا من الذاكرة. */
function readByCode(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of sourceFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    const where = path.relative(ROOT, file);
    for (const m of source.matchAll(/(?:process\.env|import\.meta\.env|\benv)\.([A-Z][A-Z0-9_]*)/g)) {
      if (PREFIXES.test(m[1]) && !found.has(m[1])) found.set(m[1], where);
    }
    for (const m of source.matchAll(/(?:process\.env|import\.meta\.env|\benv)\[['"]([A-Z][A-Z0-9_]*)['"]\]/g)) {
      if (PREFIXES.test(m[1]) && !found.has(m[1])) found.set(m[1], where);
    }
  }
  return found;
}

/*
 * المُستثنى — ولكلٍّ سببُه. وهي كلُّها لا يضبطها مشغّلٌ ينشر: تضعها أدواتٌ أو تُقرأ في فحص.
 */
const NOT_FOR_OPERATORS: Record<string, string> = {
  FIRESTORE_EMULATOR_HOST: 'يضعه محاكي Firebase نفسه عند التشغيل، ولا يُضبط يدويًّا في نشرة.',
  MIZAN_CHROMIUM: 'مسارُ متصفّحٍ لبوّابات الفحص، لا للمنتج.',
  MIZAN_DISABLE_RUNTIME_MIRROR: 'يُطفئ مرآةَ التسليم في الاختبارات كي لا تعتمد على وجود شبكة.',
  MIZAN_ALIGNMENT_DEV_SYNTH: 'توليدُ صوتٍ صناعيّ في التطوير وحده.',
  MIZAN_RELEASE_VERSION: 'تضعه خطوةُ البناء من وسم الإصدار.',
  MIZAN_RELEASE_NOTE: 'مثلُه — يُكتب وقت البناء.',
  MIZAN_FIREBASE_PROJECT_ID: 'اسمٌ بديل لـ`FIREBASE_PROJECT_ID` المذكورة، يُقرأ للتوافق.',
  MIZAN_TENANTS: 'قائمةُ مستأجرين ثابتة للتطوير؛ الإنتاج يقرأ من سجلّ المستأجرين.',
  MIZAN_QA_COMPETITION_ID: 'معرّفُ المسابقة المزروعة لفحص التسجيل على المحاكي — لا يقرؤه المنتج في نشرة.',
  MIZAN_QA_ORGANIZATION_ID: 'مثلُه — جهةُ تلك المسابقة المزروعة.',
};

const EXAMPLE = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
const documented = new Set([...EXAMPLE.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(m => m[1]));

test('the scan actually reads the code — an empty inventory proves nothing', () => {
  const read = readByCode();
  assert.ok(read.size > 80, `expected the full environment surface, found ${read.size}`);
  assert.ok(read.has('MIZAN_AUDIT_LEDGER_DIR'), 'the scan must see a variable we know is read');
});

test('every variable the product reads is documented for operators, or exempt with a reason', () => {
  const read = readByCode();
  const undocumented = [...read.entries()]
    .filter(([name]) => !documented.has(name) && !(name in NOT_FOR_OPERATORS))
    .map(([name, where]) => `${name} (${where})`)
    .sort();
  assert.deepEqual(undocumented, [],
    'these are read by the product but an operator copying .env.example would never set them');
});

test('the release blockers preflight names are all in the example an operator copies', () => {
  /*
   * أسوأُ حالةٍ بعينها: `npm run preflight` يقول «لا تُطلق حتى تُضبط هذه»، والمشغّلُ
   * ينسخ `.env.example` فلا يجدها فيه أصلًا.
   */
  for (const named of ['VITE_REQUIRE_AUTH', 'VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_PROJECT_ID']) {
    assert.ok(documented.has(named), `preflight blocks on ${named}, so the example must carry it`);
  }
});

test('the switches that decide whether production is really production are documented', () => {
  // بذرةُ العرض ومصادقةُ المالك الثنائية: من لم يرَهما ظنَّهما مضبوطتين.
  for (const named of ['MIZAN_ENABLE_DEMO_SEED', 'VITE_DISABLE_DEMO_MODE', 'MIZAN_REQUIRE_MFA_FOR_SUPER_ADMIN', 'VITE_REQUIRE_MFA_FOR_SUPER_ADMIN']) {
    assert.ok(documented.has(named), `${named} changes what production means — it must be documented`);
  }
});

test('nothing is exempt that is not actually read any more', () => {
  // استثناءٌ لمتغيّرٍ اختفى يُخفي عن المراجعة أن القائمة تقادمت.
  const read = readByCode();
  const stale = Object.keys(NOT_FOR_OPERATORS).filter(name => !read.has(name));
  assert.deepEqual(stale, [], 'these exemptions name variables nothing reads — remove them');
});

test('no secret value is committed in the example — only empty placeholders', () => {
  /*
   * ملفُّ المثال يُلتزم في المستودع، فقيمةٌ حقيقية فيه سرٌّ منشور. والمسموحُ أرقامٌ
   * وقيمٌ منطقية ومسارات — لا مفاتيح.
   */
  const secrets = [...EXAMPLE.matchAll(/^([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|PEM)[A-Z0-9_]*)=(.*)$/gm)]
    .filter(([, , value]) => value.trim().replace(/^["']|["']$/g, '').length > 0)
    .map(([, name]) => name);
  assert.deepEqual(secrets, [], 'these carry a value in a committed file');
});
