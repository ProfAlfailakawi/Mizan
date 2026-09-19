/*
 * تخطٍّ صامتٌ داخل بوّابةٍ مخصّصةٍ للمحاكي نجاحٌ زائف.
 *
 * الاختباراتُ التي تفحص قواعدَ Firestore تتخطّى نفسها حين لا يكون
 * `FIRESTORE_EMULATOR_HOST` مضبوطًا، وذلك صوابٌ في `npm test` العاديّ: لا محاكي،
 * فلا يُدّعى فحصُ ما لم يُفحص.
 *
 * لكنّ `npm run qa:firestore-rules` وُجد ليُشغّلها بالمحاكي. ولو سقط ضبطُ المتغيّر
 * هناك — تغييرٌ في `firebase-tools`، أو منفذٌ مشغول، أو علمٌ في الأمر — لتخطّت
 * **الأربعةُ والثلاثون ومئة** أنفسَها، ولخرج الأمرُ صفرًا، ولمرّت البوّابةُ خضراء
 * وهي لم تفحص قاعدةَ وصولٍ واحدة. والأخطرُ أن ذلك يقع في أكثر ما يُحرس: مَن يقرأ
 * درجةَ متسابقٍ، ومَن يكتب في سجلّ التدقيق، ومَن يصل إلى مسابقةٍ ليست له.
 *
 * فيُعلَن القصدُ بمتغيّرٍ صريح: `MIZAN_REQUIRE_EMULATOR=1` يقوله السكربتُ عن نفسه.
 * وحينها لا يُقبل التخطّي — يُقلب أحمرَ باسمه.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('when the emulator gate runs, a missing emulator is a failure — never a skip', () => {
  const demanded = process.env.MIZAN_REQUIRE_EMULATOR;
  if (!demanded) {
    // خارج البوّابة: لا دعوى، فلا شيء يُثبَت.
    return;
  }
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST,
    'MIZAN_REQUIRE_EMULATOR is set, so this run claims to exercise the Firestore rules — ' +
    'but FIRESTORE_EMULATOR_HOST is absent, which would silently skip every rule test ' +
    'and report the gate green without checking a single access rule');
});

test('the gate script declares that it demands the emulator, so the demand cannot be dropped', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const script = String(pkg.scripts?.['qa:firestore-rules'] || '');
  assert.ok(script, 'the emulator gate script must exist');
  assert.match(script, /MIZAN_REQUIRE_EMULATOR=1/,
    'the script must announce its demand, otherwise the guard above never fires');
  assert.match(script, /emulators:exec/, 'and it must still be the emulator runner');
  assert.match(script, /firestore-rules-\*\.test\.ts/,
    'this guard file must be inside the glob the gate runs, or it guards nothing');
});
