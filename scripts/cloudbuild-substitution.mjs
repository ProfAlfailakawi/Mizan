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
 */

import fs from 'node:fs';
import path from 'node:path';

const name = process.argv[2];
if (!name || !/^_[A-Z][A-Z0-9_]*$/.test(name)) {
  console.error('USAGE: cloudbuild-substitution.mjs _SUBSTITUTION_NAME');
  process.exit(2);
}

const file = path.join(process.cwd(), 'cloudbuild.yaml');
if (!fs.existsSync(file)) {
  console.error(`CLOUDBUILD_MISSING: ${file}`);
  process.exit(1);
}

const source = fs.readFileSync(file, 'utf8');
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
