import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * سلّم المقاسات أعدادٌ صحيحة (8..15). وكان واحدٌ وعشرون موضعًا يكتب مقاسًا كسريًّا —
 * ‎10.5px‎ و‎12.5px‎ و‎9.5px‎ — في صفحة التعريف ومنصّة البثّ ومختبر التحكيم. الكسر لا يقع
 * قصدًا بل من محاولةِ حشرِ نصٍّ في مساحةٍ ضيّقة، فيترك سلّمًا موازيًا لا يعرفه أحد.
 *
 * التقريب كان إلى أعلى دائمًا: لا يُصغَّر نصٌّ يقرؤه أحد من أجل التناسق.
 */
const root = process.cwd();
const walk = (dir: string): string[] => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
  const full = path.join(dir, e.name);
  return e.isDirectory() ? walk(full) : full.endsWith('.tsx') ? [full] : [];
});

test('every text size sits on the integer scale', () => {
  const offenders: string[] = [];
  for (const file of walk(path.join(root, 'src/components'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/text-\[(\d+\.\d+)px\]/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      offenders.push(`${path.relative(root, file)}:${line} — text-[${m[1]}px]`);
    }
  }
  assert.deepEqual(offenders, [], 'round to a whole pixel on the scale — upward, so no one loses legibility');
});
