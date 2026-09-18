import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { HALL_PAGE_CAPACITY, paginatePanels } from '../src/lib/display-board';

const read = (file: string) => fs.readFileSync(file, 'utf8');

/*
 * شاشتا القاعة واللجنة أمام عشرين لجنة.
 *
 * ثلاثة أعطالٍ رآها المشرف على شاشة اللجنة — اسم فرعٍ مقصوص، وساعةٌ يغطّيها زرّ، ولا
 * سبيل للرجوع إلى اختيار لجنةٍ أخرى — ومسألةٌ رابعة أكبر منها: شبكة القاعة تتّسع لعشرين
 * لجنةً بأن تُصغّر كودها حتى لا يُقرأ من آخر القاعة.
 */

test('the hall grid pages instead of shrinking, and splits its pages evenly', () => {
  const n = (k: number) => Array.from({ length: k }, (_, i) => i);

  /* ما دون السعة يُعرض دفعةً واحدة: لا تناوب حيث لا ازدحام. */
  assert.deepEqual(paginatePanels(n(0)), [], 'no panels ⇒ no pages');
  assert.equal(paginatePanels(n(HALL_PAGE_CAPACITY)).length, 1, 'a full single page does not split');

  /* وعشرون تصير صفحتين متوازنتين، لا صفحةً مكتظّة وأخرى بقيّة. */
  const twenty = paginatePanels(n(20));
  assert.equal(twenty.length, 2);
  assert.deepEqual(twenty.map(p => p.length), [10, 10], 'twenty panels split 10 + 10');
  assert.deepEqual(paginatePanels(n(21)).map(p => p.length), [11, 10], 'and twenty-one split 11 + 10, never 12 + 9');

  /* ولا تسقط لجنةٌ في القسمة: كل لجنةٍ تُعرض مرّةً واحدة. */
  for (const count of [13, 20, 21, 37, 60]) {
    const flat = paginatePanels(n(count)).flat();
    assert.equal(flat.length, count, `every one of ${count} panels appears`);
    assert.equal(new Set(flat).size, count, 'and none appears twice');
    assert.ok(paginatePanels(n(count)).every(p => p.length <= HALL_PAGE_CAPACITY), 'no page exceeds capacity');
  }
});

test('the hall screen says the grid is rotating, so a missing panel is not read as a missing panel', () => {
  const board = read('src/components/public/WaitingBoard.tsx');
  assert.match(board, /pages\.length > 1 &&/, 'the indicator appears only when there are pages');
  assert.match(board, /تُعرض بالتناوب كل/, 'and it states plainly that panels rotate');
});

test('the committee screen reads its branch name whole, and its clock is not covered', () => {
  const screen = read('src/components/public/CommitteeDisplay.tsx');
  const css = read('src/index.css');

  /* اسم الفرع كاملًا على شاشةٍ كلّها للجنة واحدة. */
  assert.match(screen, /mizan-board-tag is-full/, 'the committee screen uses the full, wrapping tag');
  assert.match(css, /\.mizan-board-tag\.is-full\{[^}]*white-space:normal/, 'and that tag does not truncate');
  assert.match(css, /\.mizan-board-tag\{[^}]*white-space:nowrap/, 'while the crowded hall cell still clips');

  /*
   * وزرّ الإغلاق كان مثبّتًا في ركن الشاشة، والساعة تُرسم في الركن نفسه — فيقع فوق
   * الأرقام. فصار في صفّ الرأس بجوارها.
   */
  assert.doesNotMatch(screen, /\{onClose && <div className="absolute top-4 end-4 z-10">/, 'the close button no longer floats over the header unconditionally');
  assert.match(screen, /\{onClose && floatingClose && <div className="absolute top-4 end-4 z-10">/, 'it floats only on the chooser, where nothing sits under it');
  assert.match(screen, /<div className="flex items-start gap-2 sm:gap-3 shrink-0">/, 'clock and buttons share one row');
});

test('a committee screen can be pointed at another panel without clearing its storage', () => {
  const screen = read('src/components/public/CommitteeDisplay.tsx');
  assert.match(screen, /onClick=\{\(\) => pick\(\[\]\)\}/, 'the screen can return to the panel chooser');
  assert.match(screen, /تغيير اللجنة/, 'and the action is named in Arabic');
  assert.match(screen, /ArrowLeftRight/, 'with an icon distinct from close');
});
