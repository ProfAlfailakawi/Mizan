#!/usr/bin/env node
/*
 * يقرأ قيمةَ بديلٍ واحد من `cloudbuild.yaml`.
 *
 * سببُ وجوده: بوّابةُ `preflight` كانت تبحث عن `VITE_REQUIRE_AUTH` و`VITE_FIREBASE_*`
 * في أسرار المستودع، ولا وجودَ لها هناك — فتُتخطّى في كلّ تشغيل، إلى الأبد، وهي تبدو
 * مضبوطة. وإعدادُ الإنتاج الحقيقيّ ليس غائبًا: هو في `substitutions` من `cloudbuild.yaml`،
 * ومنه يُبنى ما يُنشر فعلًا (Vite يُدمج `VITE_*` وقتَ البناء).
 *
 * فالبوّابة تُوصَل بمصدرها الحقيقيّ بدل أن تنتظر نسخةً ثانيةً لا أحد يضبطها. وهذه
 * معرّفاتُ عميلٍ علنية بنصّ الملفّ نفسه — تحميها قيودُ النطاق لا الإخفاء — فلا سرَّ يُنقل.
 *
 * ولا يُطبع إلا المطلوبُ بعينه: طبعُ الكتلة كلّها يُغري بنسخها إلى حيث لا تُراجع.
 *
 * الاستعمال: node scripts/cloudbuild-substitution.mjs _VITE_FIREBASE_PROJECT_ID
 * ويعود بحالةٍ غير صفرية إن لم يوجد الاسم — فلا يُقرأ الفراغُ قيمةً.
 *
 * ── ومتغيّراتُ التشغيل كذلك ──────────────────────────────────────────────────
 *
 * والعطلُ نفسُه ظهر في موضعٍ ثالث: `preflight` يقرأ `MIZAN_*` من بيئة العدّاء، وهي
 * ليست بيئةَ الإنتاج. فكان يحذّر «`MIZAN_SAAS_DATA_DIR` غير مضبوط» وهو مضبوطٌ في
 * `--update-env-vars` من `cloudbuild.yaml`، ثم «`MIZAN_CERTIFICATE_REGISTRY_DIR` غير
 * مضبوط» بعد ضبطه هناك بدقائق.
 *
 * وتحذيرٌ كاذب أسوأ من لا تحذير: يُقرأ التقريرُ فيُشكّ في صحّته كلِّه، فيُتخطّى ما فيه
 * من صدق. فصار يُقرأ من حيث يُضبط فعلًا:
 *
 *   node scripts/cloudbuild-substitution.mjs --env MIZAN_SAAS_DATA_DIR
 */

import fs from 'node:fs';
import path from 'node:path';

const runtimeMode = process.argv[2] === '--env';
const secretMode = process.argv[2] === '--secret';
const name = (runtimeMode || secretMode) ? process.argv[3] : process.argv[2];
const NAME_SHAPE = (runtimeMode || secretMode) ? /^[A-Z][A-Z0-9_]*$/ : /^_[A-Z][A-Z0-9_]*$/;
if (!name || !NAME_SHAPE.test(name)) {
  console.error('USAGE: cloudbuild-substitution.mjs _SUBSTITUTION_NAME | --env RUNTIME_NAME | --secret SECRET_ENV_NAME');
  process.exit(2);
}

const file = path.join(process.cwd(), 'cloudbuild.yaml');
if (!fs.existsSync(file)) {
  console.error(`CLOUDBUILD_MISSING: ${file}`);
  process.exit(1);
}

const source = fs.readFileSync(file, 'utf8');

/*
 * متغيّرُ تشغيلٍ يُقرأ من سطر `--update-env-vars` — وهو السطرُ الذي يحمل فعلًا ما
 * تُقلع به الخدمة. والمقارنةُ حرفيّةٌ كما في الكتلة أدناه: لا تعبيرَ نمطيًّا يُبنى من
 * وسيطٍ خارجيّ.
 *
 * والأسرارُ ليست هنا ولا تُقرأ منه: سطرُ `--update-secrets` منفصل، ولا يحمل قيمةً
 * أصلًا بل اسمَ سرٍّ في Secret Manager. فلا يطبع هذا السكربت سرًّا ولو أُريد به ذلك.
 */

// Secret bindings carry no secret value: only ENV_NAME=SECRET_MANAGER_NAME:version.
// This mode returns the Secret Manager reference so release CI can verify the deployment
// contract without copying secret material into GitHub.
if (secretMode) {
  const lines = source.split('\n');
  const flag = lines.findIndex(line => line.trim() === "- '--update-secrets'");
  if (flag < 0) {
    console.error('CLOUDBUILD_SECRETS_LINE_MISSING');
    process.exit(1);
  }
  const payload = (lines[flag + 1] || '').trim().replace(/^-\s*/, '').replace(/^'(.*)'$/, '$1');
  const wantedSecret = `${name}=`;
  const entry = payload.split(',').find(part => part.startsWith(wantedSecret));
  if (entry === undefined) {
    console.error(`CLOUDBUILD_SECRET_NOT_FOUND: ${name}`);
    process.exit(1);
  }
  process.stdout.write(entry.slice(wantedSecret.length));
  process.exit(0);
}

if (runtimeMode) {
  const lines = source.split('\n');
  const flag = lines.findIndex(line => line.trim() === "- '--update-env-vars'");
  if (flag < 0) {
    console.error('CLOUDBUILD_RUNTIME_ENV_LINE_MISSING');
    process.exit(1);
  }
  const payload = (lines[flag + 1] || '').trim().replace(/^-\s*/, '').replace(/^'(.*)'$/, '$1');
  const wantedRuntime = `${name}=`;
  const entry = payload.split(',').find(part => part.startsWith(wantedRuntime));
  if (entry === undefined) {
    console.error(`CLOUDBUILD_RUNTIME_ENV_NOT_FOUND: ${name}`);
    process.exit(1);
  }
  process.stdout.write(entry.slice(wantedRuntime.length));
  process.exit(0);
}

/*
 * يُقرأ من كتلة `substitutions:` وحدها — لا من أيّ سطرٍ في الملفّ يصادف الاسمَ نفسه،
 * كسطرِ `--build-arg` الذي يذكر `${_VITE_...}` ولا يحمل قيمتَه.
 */
const block = source.split(/^substitutions:\s*$/m)[1];
if (!block) {
  console.error('CLOUDBUILD_SUBSTITUTIONS_BLOCK_MISSING');
  process.exit(1);
}
const body = block.split(/^[A-Za-z]/m)[0];

/*
 * المطابقةُ نصّيّةٌ حرفيّة، ولا يُبنى تعبيرٌ نمطيٌّ من وسيطٍ يأتي من سطر الأوامر.
 *
 * كانت هنا `new RegExp(\`^\\s+${name}:…\`)` — ورصدتها CodeQL حقنَ تعبيرٍ نمطيّ
 * (خطورة عالية). والحارسُ أعلاه يقصر الاسمَ على `^_[A-Z][A-Z0-9_]*$` فيمنع الحقنَ
 * فعلًا، لكنّ الأمانَ المشروطَ بحارسٍ في موضعٍ آخر يسقط بأوّل تحريرٍ يوسّع الحارس —
 * ولا يراه من يحرّره. والقراءةُ سطرًا سطرًا لا تحتاج حارسًا أصلًا: المدخلُ يُقارَن
 * ولا يُفسَّر.
 */
const wanted = `${name}:`;
let raw = null;
for (const line of body.split('\n')) {
  if (!/^\s/.test(line)) continue;            // مفتاحٌ داخل الكتلة، لا سطرٌ في مستواها
  const trimmed = line.trim();
  if (!trimmed.startsWith(wanted)) continue;
  raw = trimmed.slice(wanted.length).trim();
  break;
}
if (raw === null) {
  console.error(`CLOUDBUILD_SUBSTITUTION_NOT_FOUND: ${name}`);
  process.exit(1);
}

process.stdout.write(raw.replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1'));
