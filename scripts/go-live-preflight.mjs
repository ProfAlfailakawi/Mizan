#!/usr/bin/env node
/**
 * فحص ما قبل الإطلاق.
 *
 * كل بند هنا كان سطرًا في وثيقة يُقال للناشر «تذكّر أن تضبطه». والنسيان لا يُكتشف وقت البناء
 * بل يوم المسابقة: أول عميل يفتح النظام فيجد ثمانية عشر متسابقًا بأسماء مخترعة، أو تُفتح
 * شاشة تبديل الأدوار لمن لا يملكها. فصار الفحص أمرًا يُشغَّل ويرفض، لا سطرًا يُقرأ.
 *
 * يفحص البيئة الحاضرة وقت التشغيل. مرّره بمتغيّرات البناء نفسها:
 *   VITE_REQUIRE_AUTH=true VITE_FIREBASE_API_KEY=… npm run preflight
 *
 * بلا اعتماديات عمدًا: يجب ألّا يكون هو سبب تعثّر إطلاق.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const blockers = [];
const warnings = [];
const passed = [];

const has = (name) => String(env[name] ?? '').trim().length > 0;
const value = (name) => String(env[name] ?? '').trim();

/* ── ما يمنع الإطلاق ───────────────────────────────────────────────── */

/*
 * هذا المتغيّر يفرّق بين نشرٍ حقيقي وعرضٍ للمنتج: عليه تُفرَّغ بيانات العرض
 * (`isLaunchDeployment` في `src/lib/launch-state.ts`)، وبه يُشترط مفتاح Firebase أدناه.
 *
 * ولا يُقال إنه «يفرض المصادقة»: المصادقة مفروضةٌ في التطبيق بلا شرط
 * (`const requireAuth=true` في `src/App.tsx`)، فشاشة الدخول تظهر بالمتغيّر وبلا المتغيّر.
 * وقد كان النصّ هنا يقولها، فيُوهم الناشرَ أن غيابه يفتح النظام بلا دخول — فيبحث عن ثغرةٍ
 * ليست موجودة، ويغفل عن الخطر الحقيقي: بياناتُ عرضٍ تُزرع في نشرٍ حقيقي.
 */
if (value('VITE_REQUIRE_AUTH') !== 'true') {
  blockers.push([
    'VITE_REQUIRE_AUTH ليست "true"',
    'بدونها لا يُعَدّ النشر حقيقيًا فتُزرع بيانات العرض: مسابقة مليئة بمتسابقين لا وجود لهم ونتائج وشهادة صادرة. (المصادقة نفسها مفروضة في كل الأحوال.)',
  ]);
} else passed.push('النشر مُعلَنٌ حقيقيًا، وبيانات العرض مُفرَّغة');

// المفتاح مطلوب متى فُرضت المصادقة؛ وغيابه يرمي خطأً وقت الإقلاع لا وقت البناء.
if (value('VITE_REQUIRE_AUTH') === 'true' && !has('VITE_FIREBASE_API_KEY')) {
  blockers.push([
    'VITE_FIREBASE_API_KEY غائب مع فرض المصادقة',
    'التطبيق سيرمي خطأً عند الإقلاع. ضع المفتاح المُدوَّر — لا مفتاحًا سبق أن ظهر علنًا.',
  ]);
} else if (has('VITE_FIREBASE_API_KEY')) passed.push('مفتاح Firebase مضبوط');

if (value('VITE_REQUIRE_AUTH') === 'true' && !has('VITE_FIREBASE_PROJECT_ID')) {
  blockers.push(['VITE_FIREBASE_PROJECT_ID غائب', 'بدونه لا يعرف التطبيق أي مشروع Firebase يخاطب.']);
} else if (has('VITE_FIREBASE_PROJECT_ID')) passed.push('معرّف مشروع Firebase مضبوط');

/*
 * الموافقةُ على وثيقةٍ غير منشورة.
 *
 * صفحةُ التسجيل تجمع موافقةً صريحةً مستقلة على الشروط والخصوصية. فإن لم تُنشر الوثيقتان
 * فالمتسابقُ وقّع على ما لم يره، والأثرُ يشهد بموافقةٍ لا مرجع لها.
 */
for (const [kind, label] of [['TERMS', 'شروط المشاركة'], ['PRIVACY', 'سياسة الخصوصية']]) {
  const parts = [`MIZAN_LEGAL_${kind}_URL`, `MIZAN_LEGAL_${kind}_VERSION`, `MIZAN_LEGAL_${kind}_EFFECTIVE`, 'MIZAN_LEGAL_ENTITY_NAME'];
  const absent = parts.filter(name => !has(name));
  if (absent.length) {
    blockers.push([
      `${label} غير منشورة (${absent.join('، ')})`,
      'التسجيل يجمع موافقةً على هذه الوثيقة، فإن لم تُنشر وقّع المتسابق على ما لم يره وسُجّل الأثر بلا مرجع.',
    ]);
  } else passed.push(`${label} منشورة بنسختها وتاريخ سريانها وناشرها`);
}

/*
 * هذان السرّان لا يمنع غيابهما عملية Node من الإقلاع، لكنه يمنع إطلاقًا تجاريًا أمينًا:
 * الأول شرطٌ لبطاقات الحضور ولـQuestion Escrow، والثاني شرط التحقق الموقّع من الشهادات.
 * فرقٌ مقصود بين availability وrelease readiness: قد تكون الخدمة حيّة وهي غير صالحة للإطلاق.
 */
for (const [name, effect] of [
  ['MIZAN_PASS_SIGNING_SECRET', 'بطاقات الدخول وQuestion Escrow غير متاحين؛ كشف الأسئلة الآمن يردّ 503.'],
  ['MIZAN_CERT_SIGNING_SECRET', 'التحقق الموقّع من الشهادات غير متاح ويردّ 503.'],
]) {
  if (has(name)) passed.push(`${name} مضبوط`);
  else blockers.push([`${name} غير مضبوط`, effect]);
}

// تبديل الأدوار أداة تطوير: تفتح أدوارًا لمن لا يملكها.
if (value('VITE_ENABLE_ROLE_PREVIEW') === 'true') {
  blockers.push(['VITE_ENABLE_ROLE_PREVIEW مفعّلة', 'تتيح تبديل الأدوار داخل الواجهة. لا تُفعَّل في نشر حقيقي أبدًا.']);
} else passed.push('تبديل الأدوار للتجربة مُطفأ');

// معرّف مشروع محفور في الشجرة يعني أن المستودع يحمل هوية نشرٍ بعينه.
const appletPath = join(ROOT, 'firebase-applet-config.json');
if (existsSync(appletPath)) {
  let applet = {};
  try { applet = JSON.parse(readFileSync(appletPath, 'utf8') || '{}'); } catch { applet = {}; }
  const leaked = Object.entries(applet).filter(([, v]) => String(v ?? '').trim().length > 0);
  if (leaked.length) {
    blockers.push([
      'firebase-applet-config.json لم يعد فارغًا',
      `يحمل: ${leaked.map(([k]) => k).join('، ')}. القيم تأتي من متغيّرات البيئة، ولا تُلتزم في المستودع.`,
    ]);
  } else passed.push('ملف إعداد Firebase ملتزَم فارغًا كما يجب');
}

/* ── ما يُضعف الإطلاق دون أن يمنعه ─────────────────────────────────── */

/*
 * صار البناء ينشر القواعد بنفسه. والتحذير القديم — «البناء لا ينشرها، شغّلها بيدك» — صار
 * كذبًا يدفع المشغّل إلى نشرها خارج الخط، فيتجاوز الترتيب الذي وُضع ليحميه. فالفحص الآن
 * على أن الخط ما زال ينشرها فعلًا، لا على وجود الملف وحده.
 */
if (!existsSync(join(ROOT, 'firestore.rules'))) {
  blockers.push(['firestore.rules غير موجود', 'قاعدة بيانات بلا قواعد أمان مفتوحة لمن يعرف عنوانها.']);
} else {
  const pipeline = existsSync(join(ROOT, 'cloudbuild.yaml')) ? readFileSync(join(ROOT, 'cloudbuild.yaml'), 'utf8') : '';
  if (!/--only firestore:rules/.test(pipeline)) {
    blockers.push([
      'خط النشر لم يعد ينشر قواعد Firestore',
      'كانت الخطوة موجودة ثم أُزيلت. أعِدها إلى cloudbuild.yaml، أو انشر القواعد بيدك قبل كل إطلاق — والأول أسلم.',
    ]);
  }
}

/*
 * نطاقات الجهات الخاصة ومفتاح Firebase.
 *
 * تقييد المفتاح بمُحيلات HTTP يمنع كل نطاق ليس في القائمة. وميزان يتيح لكل جهة نطاقها
 * الخاص، فجهةٌ ربطت نطاقها ولم يُضَف إلى القائمة يتعطّل نظامها كليًا بلا سبب ظاهر —
 * ولا يظهر ذلك في أي اختبار عندنا، لأن العطل عند Google لا في الكود.
 */
const tenantHosts = () => {
  const raw = has('MIZAN_TENANTS')
    ? value('MIZAN_TENANTS')
    : (has('MIZAN_TENANTS_FILE') && existsSync(value('MIZAN_TENANTS_FILE')) ? readFileSync(value('MIZAN_TENANTS_FILE'), 'utf8') : '');
  if (!raw.trim()) return [];
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tenants) ? parsed.tenants : null;
  if (!rows) return [];
  const base = value('MIZAN_BASE_DOMAIN');
  const hosts = new Set();
  for (const row of rows) {
    for (const domain of row?.customDomains ?? []) if (String(domain || '').trim()) hosts.add(String(domain).trim());
    if (base && String(row?.subdomain || '').trim()) hosts.add(`${String(row.subdomain).trim()}.${base}`);
  }
  return [...hosts].sort();
};

const hosts = tenantHosts();
if (hosts.length) {
  warnings.push([
    `${hosts.length} نطاقًا لجهات مسجّلة — تأكد أن كلًّا منها في قائمة مُحيلات مفتاح Firebase`,
    `${hosts.join('، ')}\n   نطاق غير مُدرَج يعني تعطّل النظام كليًا عند تلك الجهة، والعطل عند Google لا في الكود فلا يكشفه اختبار.`,
  ]);
}

const optional = [
  ['MIZAN_CERTIFICATE_REGISTRY_DIR', 'سجل الشهادات غير مهيّأ.'],
  ['MIZAN_SAAS_DATA_DIR', 'مسارات التراخيص والحصص والفوترة معطّلة.'],
];
for (const [name, effect] of optional) {
  if (has(name)) passed.push(`${name} مضبوط`);
  else warnings.push([`${name} غير مضبوط`, effect]);
}

// مفتاح قصير يعطي إحساسًا بالحماية بلا حماية.
if (has('MIZAN_STORAGE_SECRET_MASTER_KEY') && value('MIZAN_STORAGE_SECRET_MASTER_KEY').length < 24) {
  blockers.push(['MIZAN_STORAGE_SECRET_MASTER_KEY أقصر من ٢٤ محرفًا', 'خزنة أسرار التخزين تحتاج مفتاحًا بطول كافٍ.']);
}

/* ── التقرير ───────────────────────────────────────────────────────── */

const line = (mark, [title, detail]) => `${mark} ${title}\n   ${detail}`;
console.log('\nفحص ما قبل الإطلاق — ميزان\n' + '─'.repeat(60));
if (passed.length) console.log('\nسليم:\n' + passed.map((p) => `  • ${p}`).join('\n'));
if (warnings.length) console.log('\nتنبيهات (لا تمنع الإطلاق):\n' + warnings.map((w) => line('  ⚠', w)).join('\n'));
if (blockers.length) console.log('\nموانع:\n' + blockers.map((b) => line('  ✗', b)).join('\n'));

console.log('\n' + '─'.repeat(60));
if (blockers.length) {
  console.log(`النتيجة: ${blockers.length} مانعًا. لا تُطلق قبل معالجتها.\n`);
  process.exit(1);
}
console.log('النتيجة: لا موانع.');
console.log('يبقى خارج نطاق هذا الفحص، ولا يمكن لأي أداة أن تتحقق منه نيابةً عنك:');
console.log('  • تدوير مفاتيح Google API التي ظهرت في تاريخ git (البند ٣ في SECURITY-*.md بجذر المستودع).');
console.log('  • نشر قواعد Firestore فعليًا على المشروع.\n');
