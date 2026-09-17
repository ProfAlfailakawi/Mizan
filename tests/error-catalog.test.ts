import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ERROR_CATALOG,
  REGISTERED_ERROR_CODES,
  describeError,
  errorMessageArabic,
  apiErrorEnvelope,
} from '../src/lib/error-catalog';

const HAS_ARABIC = /[؀-ۿ]/;

test('every registered code is unique and carries a real Arabic sentence', () => {
  assert.equal(new Set(REGISTERED_ERROR_CODES).size, REGISTERED_ERROR_CODES.length, 'no duplicate codes');
  for (const entry of ERROR_CATALOG) {
    assert.match(entry.code, /^[A-Z][A-Z0-9_]*$/, `${entry.code} is a stable machine code`);
    assert.ok(HAS_ARABIC.test(entry.messageArabic), `${entry.code} has an Arabic message`);
    // جملةٌ لا رمزٌ مُعاد: الرسالة لا تكون نسخةً من الرمز.
    assert.ok(!entry.messageArabic.includes(entry.code), `${entry.code} message is not the code itself`);
    assert.ok(entry.messageArabic.trim().length >= 20, `${entry.code} message actually explains something`);
  }
});

test('a variable suffix still resolves to its base description', () => {
  assert.equal(describeError('MANIFEST_FILE_SHA256_INVALID:surahs/001.json')?.code, 'MANIFEST_FILE_SHA256_INVALID');
  assert.equal(describeError('MANIFEST_FILE_NAME_MISSING_AT_0')?.code, 'MANIFEST_FILE_NAME_MISSING_AT');
  assert.equal(describeError('READING_CONTEXT_UNRESOLVED')?.domain, 'READING');
});

test('an unregistered code is never dressed up as if it were understood', () => {
  assert.equal(describeError('NOT_A_REAL_CODE'), undefined);
  assert.equal(describeError(''), undefined);
  const fallback = errorMessageArabic('NOT_A_REAL_CODE');
  assert.ok(HAS_ARABIC.test(fallback));
  // ولا يُعرض الرمز العاري كأنه رسالة للمسؤول.
  assert.ok(!fallback.includes('NOT_A_REAL_CODE'));
});

test('the API envelope has a fixed shape and leaks nothing internal', () => {
  const env = apiErrorEnvelope('READING_CONTEXT_FROZEN_MISMATCH', 'req-123');
  assert.deepEqual(Object.keys(env), ['error']);
  assert.deepEqual(Object.keys(env.error).sort(), ['code', 'message', 'requestId']);
  assert.equal(env.error.code, 'READING_CONTEXT_FROZEN_MISMATCH');
  assert.equal(env.error.requestId, 'req-123');
  assert.ok(HAS_ARABIC.test(env.error.message));
  // لا مكدّس ولا تفاصيل داخلية
  assert.ok(!/stack|at \w+ \(/i.test(JSON.stringify(env)));
  // رمزٌ فارغ لا يُنتج مغلّفًا مكسورًا
  assert.equal(apiErrorEnvelope('', '').error.code, 'UNKNOWN_ERROR');
});

/*
 * حرسُ الانحراف: رمزٌ يُرمى في وحداتنا ولا يُسجَّل في الفهرس يُسقِط هذا الاختبار.
 * فلا يظهر للمسؤول رمزٌ عارٍ بلا تفسير، ولا يُضاف رمزٌ وتُنسى جملته.
 */
const OWNED_SOURCES = [
  'src/lib/reading-context.ts',
  'src/lib/quran-locus-crosswalk.ts',
  'src/lib/quran-text-integrity.ts',
  'server/r2-object-layout.ts',
  'server/production-config-guard.ts',
];

test('every error code thrown by our own modules is registered', () => {
  // المرجع هو describeError، ومجموعةُ الرموز تُستعمل في إثبات عمل الحرس أدناه.
  const seen: string[] = [];

  for (const rel of OWNED_SOURCES) {
    const text = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
    // رموزٌ تُرمى أو تُسنَد: throw new X('CODE') · code = 'CODE' · code: 'CODE'
    const patterns = [
      /throw new [A-Za-z]*Error\(\s*'([A-Z][A-Z0-9_]{3,})'/g,
      /\bcode\s*[:=]\s*'([A-Z][A-Z0-9_]{3,})'/g,
      /new [A-Za-z]*Error\(\s*`([A-Z][A-Z0-9_]{3,})/g,
    ];
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        // قالبٌ نصّي مثل `CODE_AT_${i}` يُلتقط بشرطةٍ سفلية معلّقة، فتُقصّ قبل المطابقة.
        const code = m[1].replace(/_+$/, '');
        seen.push(code);
        // describeError يقبل اللاحقة المتغيّرة، فهو المرجع لا عضويةُ المجموعة الحرفية.
        assert.ok(describeError(code), `${rel} throws ${code} but it is not in ERROR_CATALOG`);
      }
    }
  }

  // الحرسُ ليس صوريًّا: لا بدّ أن يكون قد وجد رموزًا فعلًا.
  assert.ok(seen.length >= 10, `the drift scan must actually find codes (found ${seen.length})`);
});

test('the drift scan would catch an unregistered code', () => {
  // إثباتُ أن الحرس يعمل: نمطُ الفحص نفسه على نصٍّ يحمل رمزًا غير مسجَّل.
  const sample = `throw new CrosswalkError('TOTALLY_UNREGISTERED_CODE');`;
  const found = [...sample.matchAll(/throw new [A-Za-z]*Error\(\s*'([A-Z][A-Z0-9_]{3,})'/g)].map(m => m[1]);
  assert.deepEqual(found, ['TOTALLY_UNREGISTERED_CODE']);
  assert.ok(!new Set(REGISTERED_ERROR_CODES).has(found[0]), 'and it is indeed unregistered');
});
