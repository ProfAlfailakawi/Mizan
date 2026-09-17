import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { QURAN_FULL_TEXT_CANDIDATES } from '../src/lib/quran-candidate-sources';

/*
 * صورةُ الإنتاج تنسخ `dist` وحدها. ونصّ الروايات الاثنتي عشرة أثرٌ يُقرأ من القرص خارج
 * `dist`، فنسيانُ سطر النسخ يعني خادمًا يقلع سليمًا ثم يفشل مغلقًا عند أول جلسة لتلك
 * الروايات — وهو عطلٌ لا يظهر في أي اختبارٍ يعمل على شجرة المصدر.
 */
test('the runtime image copies the pinned Quran artifacts, not only dist', () => {
  const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');
  const runtimeStage = dockerfile.slice(dockerfile.lastIndexOf('FROM '));
  assert.match(runtimeStage, /COPY --from=build \/app\/quran-sources \.\/quran-sources/,
    'the runtime stage must copy quran-sources or the twelve readings are absent in production');
});

test('every registered pinned artifact actually exists in the tree with its approved size', () => {
  const root = path.join(process.cwd(), 'quran-sources', 'islamweb-derived');
  assert.ok(fs.existsSync(root), 'the pinned source root exists');
  for (const source of QURAN_FULL_TEXT_CANDIDATES) {
    const name = source.upstreamPath.split('/').pop() as string;
    const file = path.join(root, name);
    assert.ok(fs.existsSync(file), `${source.rawiId}: ${name} is committed`);
    assert.ok(fs.statSync(file).size > 1000, `${source.rawiId}: ${name} is not a placeholder`);
  }
  // ولا ملفّ زائد في الجذر: كل ما فيه مسجَّلٌ في السجلّ.
  const registered = new Set(QURAN_FULL_TEXT_CANDIDATES.map(s => s.upstreamPath.split('/').pop()));
  for (const name of fs.readdirSync(root)) {
    assert.ok(registered.has(name), `${name} is present but not registered in the source register`);
  }
});
