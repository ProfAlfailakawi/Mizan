/*
 * مسارٌ مطلقٌ من آلةِ كاتبِه يعمل عنده وحده، ويسقط عند كلّ أحدٍ سواه.
 *
 * وقع هذا بعينه: كُتب في `tools/face-harness/drive.ts`
 * `import pw from '/home/user/Mizan/node_modules/playwright/index.js'` — حلًّا عاجلًا
 * لتعذّر استدعاءٍ على هذه الآلة — فمرّ البناءُ والاختباراتُ كلُّها هنا، وسقط
 * `tsc --noEmit` على العدّاء بـ`TS2307: Cannot find module`. وكذلك
 * `executablePath: '/opt/pw-browsers/chromium'`: مسارٌ لا وجودَ له على `ubuntu-latest`
 * بعد `npx playwright install`، فالمتصفّحُ لا يُفتح أصلًا.
 *
 * والدرسُ أنّ البيئةَ التي يُكتب فيها ليست البيئةَ التي يُحكم فيها. فيُحرَس البابُ
 * نفسُه: لا مسارَ منزلٍ مطلقٌ في شيفرةٍ، ولا مسارُ متصفّحٍ ثابتٌ في نصّ.
 *
 * والقائمةُ تُشتقّ من `git ls-files` لا تُكتب هنا: ملفٌّ يُضاف غدًا يشمله الشرطُ بلا
 * أن يتذكّره أحد.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const CODE_DIRS = ['src', 'server', 'tools', 'scripts', 'tests', '.github'];

const tracked = execFileSync('git', ['ls-files', '-z', ...CODE_DIRS, 'package.json'], { cwd: ROOT, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter(f => /\.(ts|tsx|mjs|cjs|js|jsx|ya?ml|json)$/.test(f));

const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('the scan actually sees the repository source', () => {
  // ولو عمي عن الملفّات لمرّ الاختبارُ فارغًا وهو يبدو حارسًا.
  assert.ok(tracked.length > 100, `expected the tracked source files, found ${tracked.length}`);
  assert.ok(tracked.includes('tools/face-harness/drive.ts'), 'the scan must see the file that caused this guard');
});

const HOME_PATH = /(['"`])(\/(?:home|Users)\/[A-Za-z0-9._-]+\/[^'"`\n]*)\1/g;
const COMMENT = /^\s*(?:[*#]|\/\/)/;
const isTest = (file: string) => file.startsWith('tests/');

/** أسطرُ ملفٍّ بلا شرحٍ يروي القصّة — فالشرحُ لا يُعاد به الخطأ. */
function codeLines(file: string): { line: string; at: number }[] {
  return read(file).split('\n').map((line, index) => ({ line, at: index + 1 })).filter(l => !COMMENT.test(l.line));
}

test('nothing is imported from an absolute path on one machine', () => {
  /*
   * وهذه هي العلّةُ بعينها: `import pw from '/home/user/Mizan/node_modules/playwright/index.js'`.
   * وتشمل الاختباراتِ أيضًا — فاستيرادٌ كهذا يسقط على العدّاء أينما كان.
   */
  const offenders: string[] = [];
  for (const file of tracked) {
    for (const { line, at } of codeLines(file)) {
      if (!/\b(?:from|import|require)\b/.test(line)) continue;
      for (const match of line.matchAll(HOME_PATH)) {
        if (/^\/home\/runner\//.test(match[2])) continue;
        offenders.push(`${file}:${at} → ${match[2]}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'a module resolved from one machine\u2019s home directory does not resolve on the runner');
});

test('no shipped source carries an absolute path from an author machine', () => {
  /*
   * ويُستثنى `tests/` من هذا الشرط وحدَه — لا تسامحًا، بل لأنّ الاختبارَ قد **يسمّي**
   * مسارًا مطلقًا بوصفه مُدخلًا يُرفض: `round38-authority-durability` يمرّر
   * `/home/node/state` ليثبت أنّ المسارَ العابرَ في حاوية يُرفض. وذلك نقيضُ استعماله.
   * أمّا الاستيرادُ فمحظورٌ في الاختبارات أيضًا، وهو الشرطُ قبله.
   */
  const offenders: string[] = [];
  for (const file of tracked.filter(f => !isTest(f))) {
    for (const { line, at } of codeLines(file)) {
      for (const match of line.matchAll(HOME_PATH)) {
        if (/^\/home\/runner\//.test(match[2])) continue;
        offenders.push(`${file}:${at} → ${match[2]}`);
      }
    }
  }
  assert.deepEqual(offenders, [],
    'these paths exist on one machine only — they pass here and fail on the runner');
});

test('a browser path is taken from the environment, never written into the source', () => {
  /*
   * فنسخةُ بلايرايت على هذه الآلة تطلب مراجعةً غيرَ المثبَّتة في مخزنها، فيُغرى المرءُ
   * بتثبيت المسار. والصوابُ ما تفعله بقيّةُ الفحوص: `process.env.PLAYWRIGHT_CHROMIUM`
   * وإلّا `undefined` — فيختار بلايرايت مخزنَه على العدّاء.
   */
  const offenders: string[] = [];
  for (const file of tracked.filter(f => /^(scripts|tools)\//.test(f))) {
    read(file).split('\n').forEach((line, index) => {
      const literal = /executablePath\s*:\s*(['"`])(\/[^'"`\n]*)\1/.exec(line);
      if (literal) offenders.push(`${file}:${index + 1} → ${literal[2]}`);
    });
  }
  assert.deepEqual(offenders, [],
    'a hard-coded browser binary does not exist on the runner — the gate dies before a page opens');
});

test('the browser gates do launch a browser — the guard above is not vacuous', () => {
  const launchers = tracked.filter(f => /^(scripts|tools)\//.test(f)).filter(f => /chromium\.launch\(/.test(read(f)));
  assert.ok(launchers.length >= 5, `expected the browser gates, found ${launchers.length}`);
  assert.ok(launchers.some(f => f.startsWith('tools/face-harness/')), 'including the face harness');
});
