import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * Interaction accessibility floor.
 *
 * A live sweep of all 14 role screens and 4 public routes surfaced a set of defects that
 * static analysis alone could not confirm or refute: icon-only buttons named only by a
 * `title` (not reliably announced, and invisible on touch), 36–40px targets, full-screen
 * venue modes with no Escape and no dialog semantics, and a clickable Card built on a
 * <div> that no keyboard could reach.
 *
 * These lock the fixes. They are deliberately structural — the runtime sweep is the real
 * check, but these catch the reintroduction of the same shapes in review.
 */
const root = path.resolve(process.cwd());
const componentsDir = path.join(root, 'src/components');

function walk(dir: string, out: string[] = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/* Scan an opening tag while honouring {…} nesting, so attributes containing JSX
   expressions with '>' inside them do not terminate the tag early. */
function openingTags(source: string, tagName = '<button') {
  const out: string[] = [];
  let i = 0;
  while ((i = source.indexOf(tagName, i)) >= 0) {
    let j = i + tagName.length, depth = 0;
    while (j < source.length) {
      const c = source[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
      j++;
    }
    out.push(source.slice(i, j));
    i = j + 1;
  }
  return out;
}

const files = walk(componentsDir);

test('no button is named only by a title attribute', () => {
  const offenders: string[] = [];
  for (const file of files) {
    for (const tag of openingTags(fs.readFileSync(file, 'utf8'))) {
      if (/\btitle=/.test(tag) && !/aria-label/.test(tag)) {
        offenders.push(`${path.basename(file)}: ${tag.slice(0, 60).replace(/\s+/g, ' ')}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'title is not a reliable accessible name and never shows on touch');
});

test('no interactive target is smaller than 44px', () => {
  /*
   * كان يفحص ترتيبًا واحدًا فقط (w- ثم h-)، فمرّ منه كل زرٍّ كُتب `h-9 w-9` أو `h-8 w-8` —
   * ومنها زرّ التفاصيل في رصيف المصحف وأزرار البثّ، وقياسها الحقيقي في المتصفح 32×44 و36×36.
   * الترتيبان يُفحصان الآن، والفحص محصور في الوسم التفاعلي نفسه لا في أيقونةٍ بداخله.
   */
  const offenders: string[] = [];
  for (const file of files) {
    for (const tag of openingTags(fs.readFileSync(file, 'utf8'))) {
      if (!/^<(?:button|a)\b/.test(tag)) continue;
      if (/min-h|min-w/.test(tag)) continue;
      const m = tag.match(/\bw-(\d+)\s+h-(\d+)\b/) || tag.match(/\bh-(\d+)\s+w-(\d+)\b/);
      if (m && (+m[1] < 11 || +m[2] < 11)) offenders.push(`${path.basename(file)}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], 'an icon button must be at least 44x44 (w-11 h-11)');
});

test('full-screen venue modes are dismissible and announce themselves', () => {
  // These open over the app. Without Escape and a dialog role there is no way back out
  // for a keyboard or screen-reader user.
  for (const rel of [
    'src/components/gate/KioskMode.tsx',
    'src/components/public/WaitingBoard.tsx',
    'src/components/public/CommitteeDisplay.tsx',
    'src/components/public/HallRecitationMap.tsx',
    'src/components/public/CeremonyView.tsx',
  ]) {
    const s = fs.readFileSync(path.join(root, rel), 'utf8');
    const name = path.basename(rel);
    assert.match(s, /useDialogBehavior\(/, `${name} must use the shared dialog behaviour`);
    assert.match(s, /role=\{onClose\?"dialog":undefined\}/, `${name} must be a dialog only when it overlays`);
    assert.match(s, /aria-label=\{ar\?/, `${name} needs an accessible name`);
  }
});

test('the shared dialog hook restores focus and traps Tab', () => {
  const s = fs.readFileSync(path.join(root, 'src/lib/useDialogBehavior.ts'), 'utf8');
  assert.match(s, /restoreTo\.current\?\.focus/, 'focus returns to the opener');
  assert.match(s, /e\.key !== 'Tab'/, 'Tab is trapped');
  assert.match(s, /Escape/, 'Escape closes');
  assert.match(s, /openDialogCount/, 'nested dialogs must not unlock scroll early');
});

test('a clickable Card is a button, not a div', () => {
  const s = fs.readFileSync(path.join(root, 'src/components/design-system/Card.tsx'), 'utf8');
  assert.match(s, /if \(onClick\) return <button/, 'a card with onClick must be keyboard reachable');
});

test('no Button is hidden by a display class it cannot win against', () => {
  /*
   * `hidden` و`inline-flex` كلاهما أداةُ display، وترتيبُ ورقة الأنماط يحسم بينهما لا ترتيبُ
   * الأصناف على العنصر. وقاعدةُ الزرّ المشترك تحمل `inline-flex`، فزرٌّ يُمرَّر إليه
   * `className="hidden sm:..."` يظهر على الجوال رغم أمرنا بإخفائه — وقد دفع ترويسةَ التطبيق
   * أربعة بكسلات خارج الشاشة عند عرض ٤٠٠. الإخفاء يكون بغلافٍ حوله، أو بعدم رسمه أصلًا.
   */
  const offenders: string[] = [];
  for (const file of files) {
    for (const tag of openingTags(fs.readFileSync(file, 'utf8'))) {
      if (!/^<Button\b/.test(tag)) continue;
      const m = tag.match(/className=(?:"([^"]*)"|\{`([^`]*)`\})/);
      const cls = m ? (m[1] ?? m[2] ?? '') : '';
      if (/\bhidden\b|\bblock\b|\bgrid\b|\bflex\b/.test(cls)) {
        offenders.push(`${path.basename(file)}: ${cls.slice(0, 60)}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'wrap the Button in a span to hide it, do not pass a display class to it');
});
