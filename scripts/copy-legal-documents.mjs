#!/usr/bin/env node
/*
 * صورةُ التشغيل تنسخ `dist` وحدها (انظر `Dockerfile`)، و`docs/` ليست فيها. وخادمُ
 * الوثيقتين يقرأ الملفَّ الملتزَم نفسَه — فلو لم يُنقل إلى `dist` لردّ الطريقُ 503 في
 * الإنتاج وحده، وهو أسوأ أصناف العطب: أخضرُ محلّيًّا وأحمرُ حيث لا أحد ينظر.
 *
 * فتُنسخ هنا، **ويفشل البناءُ إن لم توجد**. ولا يُكتب اسمُ ملفٍّ في موضعين: الأسماءُ
 * تُقرأ من `server/legal-publication.ts` نفسِه.
 */
import { mkdirSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = join(root, 'docs', 'legal');
const target = join(root, 'dist', 'legal');

const module_ = readFileSync(join(root, 'server', 'legal-publication.ts'), 'utf8');
const names = [...module_.matchAll(/^\s+(?:terms|privacy): '([^']+\.md)',$/gm)].map(m => m[1]);
if (names.length !== 2) {
  console.error(`[legal] could not read the document filenames from server/legal-publication.ts (found ${names.length})`);
  process.exit(1);
}

mkdirSync(target, {recursive: true});
for (const name of names) {
  const from = join(source, name);
  if (!existsSync(from)) { console.error(`[legal] missing ${from}`); process.exit(1); }
  copyFileSync(from, join(target, name));
  console.log(`  · ${name} → dist/legal/`);
}
