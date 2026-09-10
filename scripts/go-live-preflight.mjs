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

// هذا المتغيّر وحده يفرّق بين نشرٍ حقيقي وعرضٍ للمنتج: يفرض المصادقة، ويفرّغ بيانات العرض.
if (value('VITE_REQUIRE_AUTH') !== 'true') {
  blockers.push([
    'VITE_REQUIRE_AUTH ليست "true"',
    'بدونها يعمل النظام بوضع العرض: المصادقة غير مفروضة، وأول من يفتحه يجد مسابقة مليئة بمتسابقين لا وجود لهم ونتائج وشهادة صادرة.',
  ]);
} else passed.push('المصادقة مفروضة، وبيانات العرض مُفرَّغة');

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

// القواعد مكتوبة في الشجرة، لكن البناء لا ينشرها. وهذا أخطر ما يُنسى.
if (existsSync(join(ROOT, 'firestore.rules'))) {
  warnings.push([
    'قواعد أمان Firestore موجودة — لكن هل نُشرت؟',
    'البناء لا ينشرها. شغّل: firebase deploy --only firestore:rules. بدونها قد تكون قاعدة البيانات مفتوحة مهما كان الكود سليمًا.',
  ]);
} else {
  blockers.push(['firestore.rules غير موجود', 'قاعدة بيانات بلا قواعد أمان مفتوحة لمن يعرف عنوانها.']);
}

/*
 * نطاقات الجهات الخاصة ومفتاح Firebase.
 *
 * تقييد المفتاح بمُحيلات HTTP يمنع كل نطاق ليس في القائمة. وميزان يتيح لكل جهة نطاقها
 * الخاص، فجهةٌ ربطت نطاقها ولم يُضَف إلى القائمة يتعطّل نظامها كليًا بلا سبب ظاهر —
 * ولا يظهر ذلك في أي اختبار عندنا، لأن العطل عند Google لا في الكود.
 *
 * فتُقرأ النطاقات المسجّلة هنا وتُعرض ليطابقها الناشر بقائمة المُحيلات.
 */
const tenantHosts = () => {
  const raw = has('MIZAN_TENANTS')
    ? value('MIZAN_TENANTS')
    : (has('MIZAN_TENANTS_FILE') && existsSync(value('MIZAN_TENANTS_FILE')) ? readFileSync(value('MIZAN_TENANTS_FILE'), 'utf8') : '');
  if (!raw.trim()) return [];
  let rows = [];
  try { rows = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(rows)) return [];
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
  ['MIZAN_CERTIFICATE_REGISTRY_DIR', 'التحقق العام من الشهادات لن يعمل: من يمسك شهادة مطبوعة لن يجد لها سجلًا.'],
  ['MIZAN_SAAS_DATA_DIR', 'مسارات التراخيص والحصص والفوترة معطّلة.'],
  ['MIZAN_PASS_SIGNING_SECRET', 'التحقق من بطاقات الدخول سيردّ 503.'],
  ['MIZAN_CERT_SIGNING_SECRET', 'التحقق الموقّع من الشهادات سيردّ 503.'],
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
console.log('  • تدوير مفاتيح Google API التي ظهرت في تاريخ git (انظر SECURITY-TODO.md).');
console.log('  • نشر قواعد Firestore فعليًا على المشروع.\n');
