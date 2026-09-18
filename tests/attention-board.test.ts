import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file: string) => fs.readFileSync(file, 'utf8');

/*
 * «ما يحتاج تدخّلك» — لوحةٌ تقرّر الترتيب عن المشغّل، لا قائمةٌ يقرّره عنها.
 *
 * وما يحرسه هذا الملف ليس الشكل بل ألّا يُخترع رقم: كل ما تعرضه اللوحة (الخطورة والتكرار
 * والوقت) يأتي من السجلّ نفسه، وما لا سجلَّ له لا يُعرض.
 */

test('the board reads severity, repetition and age from the records — it invents none of them', () => {
  const overview = read('src/components/admin/CompetitionOverview.tsx');

  /* الخطورة من السجلّ: `severity` في حالة المراجعة وفي العطل. */
  assert.match(overview, /tone:reviewTone\(r\.severity\)/, 'review severity comes from the review case');
  assert.match(overview, /tone:incidentTone\(i\.severity\)/, 'incident severity comes from the incident');

  /* والتكرار والوقت من العطل نفسه، لا من تقدير. */
  assert.match(overview, /count:i\.occurrences\|\|1/, 'repetition is the recorded occurrence count');
  assert.match(overview, /at:i\.lastOccurredAt\|\|i\.reportedAt/, 'and the age is the recorded time');
});

test('an item with no known time shows no time, and a single occurrence shows no counter', () => {
  const board = read('src/components/admin/AttentionBoard.tsx');

  assert.match(board, /if \(!at\) return '';/, 'no timestamp ⇒ no age is printed');
  assert.match(board, /\{\(item\.count \|\| 1\) > 1 &&/, 'a lone occurrence carries no ×1 chip');

  /* والترتيب بالخطورة أوّلًا: هذا هو الفرق بين لوحةٍ وقائمة. */
  assert.match(board, /const RANK: Record<AttentionTone, number> = \{ critical: 0, warning: 1, info: 2 \}/, 'critical sorts first');
  assert.match(board, /RANK\[a\.tone \|\| 'info'\] - RANK\[b\.tone \|\| 'info'\]/, 'and the sort actually uses it');
});

test('the composition bar is a share of the whole, and the overflow is stated not swallowed', () => {
  const board = read('src/components/admin/AttentionBoard.tsx');

  assert.match(board, /width: `\$\{\(n \/ items\.length\) \* 100\}%`/, 'each band is its share of the total');
  assert.match(board, /aria-label=\{mix\.map/, 'and a screen reader hears the same composition');
  assert.match(board, /sorted\.length > max &&/, 'what does not fit is counted aloud');

  /* والفراغ جوابٌ نافع لا شاشةٌ بيضاء. */
  assert.match(board, /لا شيء مفتوح/, 'an empty board says so plainly');
});

test('the earlier flat list is gone from both places it was rendered', () => {
  const overview = read('src/components/admin/CompetitionOverview.tsx');

  assert.doesNotMatch(overview, /attention\.slice\(0,5\)\.map\(x=><div/, 'the overview no longer renders bare rows');
  assert.doesNotMatch(overview, /attention\.filter\(x=>x\.kind!=='setup'\)\.map\(x=><div/, 'nor does the operations card');
  assert.equal(overview.match(/<AttentionBoard /g)?.length, 2, 'both places render the board instead');
});
