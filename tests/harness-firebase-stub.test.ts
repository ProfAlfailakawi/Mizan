/*
 * بديلُ الهويّة في المِشْحَن يحلّ محلّ `src/lib/firebase.ts` كلِّه، فإن نقص اسمٌ
 * تستورده شيفرةُ `src/` سقطت الحزمةُ عند الاستيراد قبل أن يُرسم شيء.
 *
 * وقع هذا بعينه: دفعةٌ أضافت إلى `OfficialMushafSurface` استيرادَ `IS_DEMO_SESSION` من
 * `store.ts` — وهو حرفٌ واحد في ملفٍّ لا علاقة له بالمِشْحَن — فدخل `store.ts` في سلسلة
 * استيراد شاشة «المصحفُ يسمعك»، و`store.ts` يطلب `getFirestoreClient` من `./firebase`،
 * والبديلُ لا يصدّره. فسقط `qa:face-listens` على `main` بمهلةٍ عشرين ثانيةً على
 * `[data-face-words]` لا تدلّ على شيء؛ والسببُ الحقيقيُّ سطرٌ في سجلّ vite لا يقرؤه أحد:
 * `No matching export … for import "getFirestoreClient"`.
 *
 * ولم يُكتشف قبل الدمج لأنّ الفحصَ يعمل بعد الدمج لا قبله (متصفّحٌ ودقيقتان، فلا يدخل
 * مسارَ الدفعات). وهذا الاختبارُ يسدّ الفجوةَ بما يكلّف ميلّي ثانية: لا يُشغَّل
 * متصفّحٌ ولا حزمة، بل يقرأ الاستيراداتِ ويقابلها بصادرات البديل.
 *
 * والمطلوبُ يُشتقّ من استيرادات `src/` نفسِها لا من قائمةٍ تُكتب هنا: قائمةٌ في اختبارٍ
 * تفارق قائمةَ المنتج بصمتٍ عند أوّل إضافة، وهي العلّةُ التي يحرس منها.
 */

import assert from 'node:assert/strict';
import fs, { type Dirent } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const ROOT = process.cwd();
const REAL = path.join(ROOT, 'src', 'lib', 'firebase.ts');
const STUB = path.join(ROOT, 'tools', 'face-harness', 'firebase-stub.ts');

function walk(dir: string, out: string[] = []): string[] {
  let entries: Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(full, out); continue }
    if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const parse = (file: string) =>
  ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** هل هذا المحدِّدُ هو `src/lib/firebase` الحقيقيُّ، أيًّا كان شكلُ كتابته؟ */
const pointsAtReal = (importer: string, spec: string) =>
  spec.startsWith('.') && path.resolve(path.dirname(importer), spec).replace(/\.tsx?$/, '') === REAL.replace(/\.ts$/, '');

/**
 * الأسماءُ التي تستوردها شيفرةُ `src/` من الوحدة الحقيقيّة، ومَن يستوردها.
 * وما كان `type` يُمحى عند الترجمة فلا يطلبه وقتَ التشغيل، فلا يُعدّ.
 */
function requiredNames(): Map<string, string[]> {
  const needed = new Map<string, string[]>();
  const need = (name: string, importer: string) =>
    needed.set(name, [...(needed.get(name) ?? []), path.relative(ROOT, importer)]);

  for (const file of walk(path.join(ROOT, 'src'))) {
    for (const stmt of parse(file).statements) {
      if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
      if (!pointsAtReal(file, stmt.moduleSpecifier.text)) continue;
      const clause = stmt.importClause;
      if (!clause || clause.isTypeOnly) continue;
      if (clause.name) need('default', file);
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) if (!el.isTypeOnly) need((el.propertyName ?? el.name).text, file);
      }
    }
  }
  return needed;
}

/** ما يصدّره البديلُ فعلًا. */
function providedNames(): Set<string> {
  const provided = new Set<string>();
  for (const stmt of parse(STUB).statements) {
    const exported = ts.canHaveModifiers(stmt) && ts.getModifiers(stmt)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = ts.canHaveModifiers(stmt) && ts.getModifiers(stmt)?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (ts.isVariableStatement(stmt) && exported) {
      for (const d of stmt.declarationList.declarations) if (ts.isIdentifier(d.name)) provided.add(d.name.text);
    } else if ((ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) && exported) {
      provided.add(isDefault ? 'default' : stmt.name?.text ?? 'default');
    } else if (ts.isExportAssignment(stmt)) {
      provided.add('default');
    } else if (ts.isExportDeclaration(stmt) && !stmt.isTypeOnly && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) if (!el.isTypeOnly) provided.add(el.name.text);
    }
  }
  return provided;
}

test('the scan sees the real importers and the stub — an empty list proves nothing', () => {
  const needed = requiredNames();
  assert.ok(fs.existsSync(REAL), 'src/lib/firebase.ts moved: update this guard, do not delete it');
  assert.ok(fs.existsSync(STUB), 'the harness stub moved: update this guard, do not delete it');
  assert.ok(needed.has('auth'), 'the scan must see the long-standing `auth` import');
  assert.ok(needed.has('getFirestoreClient'), 'the scan must see the import that broke the harness');
  assert.ok([...needed.values()].some(files => files.includes(path.join('src', 'lib', 'store.ts'))), 'including store.ts, the file that pulled it into the harness');
  assert.ok(providedNames().has('auth'), 'the stub parser must see the stub exports');
});

test('the harness stub exports every name src/ imports from the real firebase module', () => {
  const provided = providedNames();
  const missing = [...requiredNames()]
    .filter(([name]) => !provided.has(name))
    .map(([name, files]) => `${name}  ← ${[...new Set(files)].join(', ')}`);
  assert.deepEqual(missing, [],
    'tools/face-harness/firebase-stub.ts replaces src/lib/firebase.ts in the listening harness; '
    + 'a name missing there makes the bundle fail at import time and `qa:face-listens` time out on a screen that never renders');
});
