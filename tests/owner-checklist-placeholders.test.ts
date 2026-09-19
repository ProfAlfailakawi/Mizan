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
    assert.ok(actual.length > 0, `${document} is expected to still hold owner blanks at this stage`);

    const cited = [...checklist.matchAll(new RegExp(`${basename.replace('.', '\\.')}:(\\d+)`, 'g'))]
      .map(match => Number(match[1]));

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
