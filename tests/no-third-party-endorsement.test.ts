import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * حدُّ الادّعاء، مفروضًا على المستودع كلِّه لا على صفحة البيع وحدها.
 *
 * `docs/SOURCE-PROVENANCE.md` يفصل أمرين يُخلط بينهما فيصير الإدراجُ شهادةً لم يمنحها
 * أحد: **الإسناد** (مَن نشر البايتات) و**الاعتماد** (مَن أقرّ استعمالها في ميزان).
 * والاعتمادُ الوحيد المُدَّعى هو «اعتمدت اللجنة العلمية لمشروع ميزان» — قرارُ نطاقٍ من
 * مالك المشروع. وأمّا «معتمد من مجمع الملك فهد» فشهادةٌ لم يمنحها المجمع.
 *
 * وكان المستودع يناقض قاعدتَه: تعليقٌ في `production-publish-hardening.test.ts` يقول
 * «والنصّ معتمد من مجمع الملك فهد» — فيبرّر حذفَ سطح «الإدارة العلمية» باعتمادٍ خارجيّ
 * لم يقع. وتعليقٌ ليس نصًّا يراه مستخدم، لكنه ما يقرأه المهندسُ ليعرف ما هو صحيح، فمنه
 * تنتقل الصيغةُ إلى واجهةٍ أو عقدٍ أو صفحةِ بيع.
 *
 * وحارسُ `marketing-claims` كان يحرس `MarketingSite.tsx` وحده. فيُعمَّم الحدُّ هنا:
 * لا موضعَ في الشيفرة يقول إن جهةً خارجية اعتمدت ميزان — إلا ملفَّ القاعدة نفسه، حيث
 * تُذكر العبارةُ بوصفها ممنوعة.
 */

/*
 * موضعان تُذكر فيهما العبارةُ بوصفها ممنوعة، فلا تُحتسب عليهما: ملفُّ القاعدة، وهذا
 * الملفُّ نفسه. وما عداهما فادّعاءٌ يجب أن يسقط.
 */
const RULE_FILES = new Set([
  'docs/SOURCE-PROVENANCE.md',
  'tests/no-third-party-endorsement.test.ts',
]);

/* «معتمد/معتمدة من <جهة خارجية>» في العربية، و«certified/endorsed by» في الإنجليزية. */
const FORBIDDEN: [RegExp, string][] = [
  [/معتمد(?:ة)?\s+من\s+(?:مجمع|موقع|Quranpedia|جهة)/u, 'claims an external body approved Mizan'],
  [/(?:certified|endorsed|accredited)\s+by\s+(?:King Fahd|KFGQPC|Quranpedia|Tanzil)/iu, 'claims external certification of Mizan'],
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'artifacts', 'coverage', '.mizan-data']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.md', '.json', '.html', '.yml', '.yaml']);

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(name))) out.push(full);
  }
  return out;
};

test('no file claims a third party endorsed Mizan', () => {
  const offenders: string[] = [];
  for (const file of walk(process.cwd())) {
    const relative = path.relative(process.cwd(), file);
    if (RULE_FILES.has(relative)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const [pattern, why] of FORBIDDEN) {
        if (pattern.test(line)) offenders.push(`${relative}:${index + 1} — ${why}: ${line.trim().slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(offenders, [],
    `source provenance is not endorsement; see docs/SOURCE-PROVENANCE.md:\n${offenders.join('\n')}`);
});

test('the rule file still states the separation it is trusted for', () => {
  /* لو أُفرغ ملفُّ القاعدة يومًا، لصار الاستثناءُ أعلاه ثقبًا بلا قاعدةٍ تسدّه. */
  const rule = fs.readFileSync(path.join(process.cwd(), 'docs/SOURCE-PROVENANCE.md'), 'utf8');
  assert.match(rule, /الممنوع كتابته/, 'the forbidden-phrase list must remain');
  assert.match(rule, /معتمد من مجمع الملك فهد/, 'the exact forbidden phrase is listed there');
  assert.match(rule, /اعتمدت اللجنة العلمية لمشروع ميزان/, 'the one permitted approval statement is stated');
  assert.match(rule, /ليس شهادةً من ذلك المصدر/, 'the separation itself is spelled out');
});
