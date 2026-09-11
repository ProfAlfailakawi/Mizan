import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * حارس الواجهة العربية يستبدل الكلمات اللاتينية بمقابلها العربي داخل الجملة. فإن كتب أحدنا
 * الترجمة في المصدر **و** ترك الكلمة اللاتينية بجوارها، ظهرت الكلمة مرّتين على الشاشة:
 *
 *   «DNA المسابقة»  ← يُعرض: «هوية المسابقة المسابقة»
 *   «رمز QR»        ← يُعرض: «رمز رمز الاستجابة السريعة»
 *
 * وهذا يقع في شريط تنقّل لوحة الإدارة وفي شاشة الكشك وفي تفعيل التحقق بخطوتين. العلاج أن
 * تُكتب العربية صحيحةً في المصدر ولا يبقى للحارس ما يستبدله.
 */
const root = process.cwd();
const guard = fs.readFileSync(path.join(root, 'src/components/design-system/ArabicInterfaceGuard.tsx'), 'utf8');

const substitutions = new Map<string, string>();
for (const m of guard.matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) {
  const [, latin, arabic] = m;
  if (/[A-Za-z]/.test(latin) && /[؀-ۿ]/.test(arabic)) substitutions.set(latin, arabic);
}
for (const m of guard.matchAll(/\[\/\\b([A-Za-z]+)\\b\/g[i]*,'([^']+)'\]/g)) substitutions.set(m[1], m[2]);

const walk = (dir: string): string[] => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
  const full = path.join(dir, e.name);
  return e.isDirectory() ? walk(full) : full.endsWith('.tsx') && e.name !== 'ArabicInterfaceGuard.tsx' ? [full] : [];
});

test('the guard has substitutions to police', () => {
  assert.ok(substitutions.size > 20, `expected the substitution table to be found, got ${substitutions.size}`);
});

test('no Arabic label makes the guard render a word twice', () => {
  const offenders: string[] = [];
  for (const file of walk(path.join(root, 'src/components'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/'([^'\n]{2,90})'/g)) {
      const text = m[1];
      if (!/[؀-ۿ]/.test(text) || !/[A-Za-z]/.test(text)) continue;
      for (const [latin, arabic] of substitutions) {
        const token = new RegExp(`\\b${latin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (!token.test(text)) continue;
        const rendered = text.replace(new RegExp(token.source, 'g'), arabic);
        const words = rendered.split(/\s+/);
        const stutters = words.some((w, i) => i > 0 && w === words[i - 1]);
        const alreadyTranslated = arabic.split(/\s+/).every(w => text.includes(w));
        if (stutters || alreadyTranslated) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${path.relative(root, file)}:${line} — «${text}» renders as «${rendered}»`);
        }
        break;
      }
    }
  }
  assert.deepEqual(offenders, [], 'write the Arabic in the source and drop the Latin word beside it');
});
