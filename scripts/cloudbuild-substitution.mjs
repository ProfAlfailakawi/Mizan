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
const match = new RegExp(`^\\s+${name}:\\s*(.+?)\\s*$`, 'm').exec(body);
if (!match) {
  console.error(`CLOUDBUILD_SUBSTITUTION_NOT_FOUND: ${name}`);
  process.exit(1);
}

process.stdout.write(match[1].replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1'));
