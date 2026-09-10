import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

test('the server binds the port the platform gives it, not one fixed in the code', () => {
  const src = read('server.ts');
  /*
   * منصّات الحاويات تحقن PORT ولا تتفاوض عليه. ومنفذ مثبَّت يعني أن التطبيق يستمع في مكان
   * والمنصّة تطرق مكانًا آخر: لا تصل الطلبات ويسقط النشر في فحص الصحة بلا خطأ يدلّ على السبب.
   */
  assert.match(
    src,
    /const PORT = Number\(process\.env\.PORT\) > 0 \? Number\(process\.env\.PORT\) : 3000;/,
    'PORT must come from the environment with a local default',
  );
  assert.doesNotMatch(src, /const PORT = \d+;/, 'a hardcoded port must never come back');
});

test('the container port and the app agree, or traffic never arrives', () => {
  const exposed = /^EXPOSE\s+(\d+)/m.exec(read('Dockerfile'))?.[1];
  assert.ok(exposed, 'the container must declare the port it serves');
  // 8080 هو منفذ Cloud Run القياسي؛ ما دام مُعلنًا فلا بد أن يكون التطبيق قابلًا للاستماع عليه.
  assert.match(
    read('server.ts'),
    /process\.env\.PORT/,
    `the container exposes ${exposed}, so the app must honour the injected port`,
  );
});

test('the documented PORT is one the app actually reads', () => {
  // توثيق متغيّر لا يقرأه أحد أسوأ من عدم توثيقه: يضبطه الناشر ويظنّ أنه فعل شيئًا.
  assert.match(read('.env.example'), /^PORT=/m);
  assert.match(read('server.ts'), /process\.env\.PORT/);
});
