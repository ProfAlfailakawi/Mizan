import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * آخر ما يراه المستخدم قبل فعلٍ لا يُستردّ كان بلغةٍ لا يقرؤها: نصّ السؤال عربي، والصندوق
 * الذي يرسمه المتصفح ليس لنا — زرّاه `OK` و`Cancel`، واتجاهه من اليسار. هذه الاختبارات
 * تمنع عودته.
 */

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
};

const sourceFiles = walk('src');
const confirmDialog = 'src/components/design-system/ConfirmDialog.tsx';

test('no screen asks a question through the browser', () => {
  const offenders = sourceFiles.filter((f) => {
    if (f.replace(/\\/g, '/') === confirmDialog) return false; // يشرح ما استُبدل
    const code = fs.readFileSync(f, 'utf8');
    // التعليقات تُستثنى: المقصود النداء الحيّ لا ذكره.
    const live = code.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n');
    return /window\.(confirm|alert|prompt)\s*\(/.test(live);
  });
  assert.deepEqual(offenders, [], 'these still use a browser dialog, whose buttons are English and left-to-right');
});

test('the confirm dialog reads as a decision, not a shrug', () => {
  const src = fs.readFileSync(confirmDialog, 'utf8');
  // إغلاقٌ بالمفتاح أو بالخلفية إلغاء: الصمت لا يُقرأ نعم على فعلٍ لا يُستردّ.
  assert.match(src, /onClose=\{\(\) => settle\(false\)\}/);
  // الفعل المدمّر يُميَّز بصريًا لا بالنصّ وحده.
  assert.match(src, /tone\?: 'neutral' \| 'destructive'/);
  assert.match(src, /variant=\{destructive \? 'danger' : 'primary'\}/);
  // نداءٌ ثانٍ قبل حسم الأول كان سيترك وعدًا معلّقًا إلى الأبد.
  assert.match(src, /pendingRef\.current\?\.resolve\(false\)/);
  // العربية هي الافتراض في كل تسمية.
  for (const label of ['إلغاء', 'تأكيد']) assert.ok(src.includes(label), `missing Arabic default: ${label}`);
});

test('every destructive confirmation says what is lost and names the thing', () => {
  /*
   * «حذف الفئة؟» وحدها لا تكفي: السؤال الجيد يقول ما الذي يزول وما البديل. كل نداء
   * مدمّر هنا يحمل جسمًا، لا عنوانًا فقط.
   */
  const callers = sourceFiles.filter((f) => /useConfirm\(/.test(fs.readFileSync(f, 'utf8')) && !f.includes('ConfirmDialog'));
  let sites = 0;
  for (const file of callers) {
    const code = fs.readFileSync(file, 'utf8');
    const calls = [...code.matchAll(/confirm\(\{([\s\S]{0,900}?)\}\)\)/g)].map((m) => m[1]);
    assert.ok(calls.length > 0, `${file} imports the hook but never calls it`);
    sites += calls.length;
    for (const call of calls) {
      assert.match(call, /title:/, `${file}: a confirmation without a title`);
      assert.match(call, /body:/, `${file}: a confirmation that never says what will happen`);
    }
  }
  // سبعة نداءات كانت تمرّ عبر المتصفح؛ لا يجوز أن ينقص العدد بعودة أحدها إليه.
  assert.ok(sites >= 7, `expected every replaced dialog to still be a real confirmation, found ${sites}`);
});

test('the dialog is rendered wherever it is requested', () => {
  // خطاف بلا عنصر يعني وعدًا لا يُحسم أبدًا: تُنتظر إجابة نافذةٍ لا تُرسم.
  for (const file of sourceFiles) {
    const code = fs.readFileSync(file, 'utf8');
    if (!/const \{confirm,confirmDialog\}=useConfirm\(/.test(code)) continue;
    assert.match(code, /\{confirmDialog\}/, `${file} takes the dialog but never renders it`);
  }
});
