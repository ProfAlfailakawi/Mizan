/*
 * قائمةٌ تقول «هذا كلُّ الناقص» ثم تُغفل بندًا أسوأُ من قائمةٍ لا تدّعي التمام.
 *
 * كُتبت `docs/OWNER-CHECKLIST.md` في 19 سبتمبر 2026 بخمسة بنودٍ تحت عنوان «ما بقي»،
 * وفي `docs/legal/PRIVACY-AR.md` **سبعة** فراغات: سقط منها مدّةُ الردّ النظاميّة وقرارُ
 * مسؤول حماية البيانات. فالمالكُ يجمع الأجوبةَ الخمسة، ويذهب لينشر، فيجد قوسين لم
 * يُذكرا — وقد استُشير المحامي ومضى.
 *
 * فتُقاس هنا الدعوى لا تُصدَّق: كلُّ سطرٍ فيه فراغٌ حقيقيّ في الوثيقتين لا بدّ أن يُذكر
 * في القائمة بملفّه ورقم سطره، ولا يُذكر فيها رقمٌ لا فراغَ فيه.
 *
 * و«الفراغ الحقيقيّ» ما بين قوسيه نصٌّ يُملأ. أمّا `⟦قوسين⟧` في المقدّمة فشرحُ منهجٍ
 * لا فراغ — وتمييزُه بالنصّ لا بالسطر، كي لا يُفلت فراغٌ بتغيير ترتيب.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

/** أسطرُ الفراغات الحقيقية في وثيقةٍ قانونية، بأرقامها كما يطبعها `grep -n`. */
function placeholderLines(relativePath: string): number[] {
  return read(relativePath)
    .split('\n')
    .map((line, index) => ({line, number: index + 1}))
    .filter(({line}) => line.includes('⟦'))
    // شرحُ المنهج يذكر `⟦قوسين⟧` نفسَها؛ وما عداها فراغٌ يُملأ.
    .filter(({line}) => line.replace(/`?⟦قوسين⟧`?/g, '').includes('⟦'))
    .map(({number}) => number);
}

const LEGAL_DOCUMENTS = ['docs/legal/TERMS-AR.md', 'docs/legal/PRIVACY-AR.md'] as const;

test('the owner checklist names every unresolved placeholder, and no phantom ones', () => {
  const checklist = read('docs/OWNER-CHECKLIST.md');

  for (const document of LEGAL_DOCUMENTS) {
    const basename = path.basename(document);
    const actual = placeholderLines(document);
    const cited = [...checklist.matchAll(new RegExp(`${basename.replace('.', '\\.')}:(\\d+)`, 'g'))]
      .map(match => Number(match[1]));

    /*
     * ومُلئت الأقواسُ كلُّها في 20 سبتمبر 2026. فلا تصير الدعوى بذلك بلا معنًى بل
     * تنقلب: قائمةٌ جدولُها فارغٌ لا بدّ أن **تقول** إنه فارغ. فالصمتُ عند التمام
     * يُقرأ كصمتٍ عن نقص، ويعود المالكُ يفتّش عن قوسٍ لا وجود له — وهو العطبُ الذي
     * كُتب هذا الملفُّ لأجله أوّلَ مرّة، مقلوبًا.
     */
    if (actual.length === 0) {
      assert.deepEqual(cited, [],
        `${document} holds no blank any more, yet the checklist still points the owner at one`);
      assert.match(checklist, /لم يبقَ في الوثيقتين قوسٌ واحد/,
        'a checklist whose table has emptied must say so out loud, not fall silent');
      continue;
    }

    for (const line of actual) {
      assert.ok(cited.includes(line),
        `${document}:${line} holds a blank the owner must fill, and the checklist never names it — ` +
        `cited: ${cited.join(', ') || 'none'}`);
    }
    for (const line of cited) {
      assert.ok(actual.includes(line),
        `the checklist points the owner at ${document}:${line}, which holds no blank — a stale line number`);
    }
  }
});

test('the checklist tells the owner how to re-derive the list himself', () => {
  const checklist = read('docs/OWNER-CHECKLIST.md');
  assert.match(checklist, /grep -n "⟦" docs\/legal/,
    'a list that can go stale must ship the command that regenerates it');
});

/*
 * والعطبُ الثاني من المراجعة نفسها: `npm run preflight` يقرأ `process.env` وحدها، فلا
 * يرى Cloud Run ولا Secret Manager. فنسخةٌ طازجةٌ في Cloud Shell تطبع الموانعَ كلَّها
 * ولو أُتمّ كلُّ شيء — والقائمةُ كانت تقدّمه كأنه حكمٌ على الإنتاج.
 */
test('the checklist does not present the local preflight as a verdict on production', () => {
  const preflight = read('scripts/go-live-preflight.mjs');
  assert.match(preflight, /const env = process\.env/,
    'this guard exists because preflight reads the shell it runs in — if that changes, re-read the checklist');

  const checklist = read('docs/OWNER-CHECKLIST.md');
  assert.match(checklist, /process\.env/,
    'the checklist must say what preflight actually reads');
  assert.match(checklist, /بوّابات الإطلاق/,
    'and must point the owner at the deployment-aware gate for the production verdict');
});

/*
 * والعطبُ الثالث: عددٌ مكتوبٌ في النثر لا يتحرّك حين تتحرّك الحقيقة.
 *
 * كانت القائمة تقول للمالك «تُملأ الخمسة» في موضعين بعد أن صار الباقي فراغين، وتقول
 * إنّ حمرةَ بوّابة الإطلاق «بالموانع الأربعة» والبوّابةُ تطبع مانعين. ولا يكشف ذلك
 * فحصُ الأقواس أعلاه: أرقامُ الأسطر كانت صحيحةً والعددُ في الجملة كاذبًا.
 *
 * فالأعدادُ التي تُقاس لا تُكتب من الذاكرة، وهذه تُقاس: يُشغَّل `preflight` نفسُه
 * بالبيئتين اللتين تصفُهما القائمة، ويُقارَن ما يطبعه بما تدّعيه.
 */
function preflightBlockerCount(extraEnv: Record<string, string>): number {
  const result = spawnSync('node', [path.join(root, 'scripts', 'go-live-preflight.mjs')], {
    encoding: 'utf8',
    // بيئةٌ نظيفة عمدًا: إرثُ بيئة العدّاء يجعل العددَ يختلف بين جهازٍ وجهاز.
    env: {PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...extraEnv},
  });
  const printed = /النتيجة: (\d+) مانعًا/.exec(result.stdout);
  assert.ok(printed, `preflight must print its verdict — got: ${result.stdout}\n${result.stderr}`);
  return Number(printed[1]);
}

/** ٥ لا 5: القائمةُ عربيّةُ الأرقام، والمقارنةُ تُجرى بصيغتها لا بصيغةٍ أخرى. */
const arabicIndic = (n: number) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

test('the shell-count the checklist warns about is the count preflight actually prints', () => {
  const bare = preflightBlockerCount({});
  assert.match(read('docs/OWNER-CHECKLIST.md'), new RegExp(`«${arabicIndic(bare)} موانع»`),
    `a fresh shell reports ${bare} blockers; the checklist must warn with that number, not another`);
});

test('the gate-count the checklist reports is the count the gate itself reaches', () => {
  /*
   * بوّابةُ الإطلاق تقرأ ما عدا الوثائق من `cloudbuild.yaml` وSecret Manager، فلا يبقى
   * أمامها إلا الوثيقتان. وهذه هي الحالُ التي يصفها قسمُ «كيف تتحقّق بنفسك».
   */
  const deployed = preflightBlockerCount({
    VITE_REQUIRE_AUTH: 'true',
    VITE_FIREBASE_API_KEY: 'read-from-cloudbuild',
    VITE_FIREBASE_PROJECT_ID: 'read-from-cloudbuild',
    MIZAN_PASS_SIGNING_SECRET: 'configured-via-secret-manager',
    MIZAN_CERT_SIGNING_SECRET: 'configured-via-secret-manager',
  });
  assert.equal(deployed, 2, 'the two legal documents are expected to be all that is left for the gate');
  assert.match(read('docs/OWNER-CHECKLIST.md'), new RegExp(`«النتيجة: ${deployed} مانعًا»`),
    `the gate reaches ${deployed} blockers; the checklist must quote that number`);
});
