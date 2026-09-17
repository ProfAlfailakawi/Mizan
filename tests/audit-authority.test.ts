/*
 * P18 / §30 — الأحداثُ الحاسمة يؤلّفها الخادم، والعميلُ يطلب فعلًا لا يُملي أثرًا.
 *
 * مسارُ `/api/audit/events` موجودٌ لسببٍ صحيح: أحداثٌ يراها العميل ولا يراها الخادم.
 * لكنّ قبولَ **كلّ** حدثٍ منه يجعل السجلَّ الذي يُحتجّ به عند النزاع مؤلَّفًا ممّن
 * يُحتجّ عليه: عميلٌ مُعدَّل يرسل `RESULT_PUBLISHED` لنتيجةٍ لم تُنشَر فيبدو أنها نُشرت.
 *
 * وهذه الاختبارات تثبت شيئين: أن القائمة تغطّي ما نصّ عليه الطلب، وأن المسارَ يردّها
 * فعلًا — ويكتبها هو من حيث تقع.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  SERVER_AUTHORED_AUDIT_ACTIONS,
  isServerAuthoredAuditAction,
} from '../server/audit-authority';

const SERVER = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');

test('every critical event named in the release requirements is server-authored only', () => {
  /*
   * القائمةُ ليست اجتهادًا: هي بنودُ الطلب نفسها — ختمُ درجة، نشرُ نتيجة، إعادةُ فتحها،
   * تصحيحُ درجة، إبطالُ سؤال، إعادةُ سحب، تغييرُ رواية مشارك، تغييرُ سياسة، تجاوزٌ
   * بصلاحية، تغييرُ دور، إجراءُ ترخيص، فتحُ ظرف.
   */
  for (const required of [
    'RESULT_SEALED', 'RESULT_PUBLISHED', 'RESULT_REOPENED', 'SCORE_CORRECTED',
    'QUESTION_INVALIDATED', 'QUESTION_REDRAWN', 'PARTICIPANT_READING_CHANGED',
    'COMPETITION_POLICY_CHANGED', 'PRIVILEGED_OVERRIDE', 'ROLE_CHANGED',
    'LICENSE_ACTION', 'ENVELOPE_OPENED',
  ]) {
    assert.ok(isServerAuthoredAuditAction(required), `${required} must be server-authored only`);
  }
});

test('the guard cannot be walked around by casing or padding', () => {
  for (const spelling of ['result_published', ' RESULT_PUBLISHED ', 'Result_Published', 'rEsUlT_pUbLiShEd']) {
    assert.equal(isServerAuthoredAuditAction(spelling), true, spelling);
  }
  // وما ليس منها يمرّ — القائمةُ تمنع ما نصّت عليه، لا كلَّ شيء.
  for (const ordinary of ['SCREEN_OPENED', 'DEVICE_SWITCHED', 'OPERATOR_ACKNOWLEDGED', '', null, undefined, 42]) {
    assert.equal(isServerAuthoredAuditAction(ordinary), false, String(ordinary));
  }
});

test('the client audit route refuses a server-authored action before it touches the ledger', () => {
  const route = SERVER.split('\n').find(line => line.includes("app.post('/api/audit/events'"));
  assert.ok(route, 'the client audit route must exist');
  const start = SERVER.indexOf("app.post('/api/audit/events'");
  const body = SERVER.slice(start, SERVER.indexOf("app.get('/api/audit/ledger'"));
  assert.ok(body.includes('isServerAuthoredAuditAction(b.action)'), 'the route must consult the authority list');
  assert.ok(body.includes('AUDIT_EVENT_SERVER_AUTHORED_ONLY'), 'and refuse by a named code');
  assert.ok(
    body.indexOf('isServerAuthoredAuditAction(b.action)') < body.indexOf('serverAuditLedger.append('),
    'the refusal must come before the append, or a forged event is already written',
  );
});

test('each server-authored action is actually written by the server somewhere', () => {
  /*
   * قائمةٌ تمنع حدثًا لا يكتبه أحدٌ ليست حمايةً، هي بابٌ مسدودٌ على غرفةٍ فارغة. فما
   * مُنع من العميل يجب أن يكتبه الخادم من حيث يقع — وإلا فالحدثُ ضائعٌ لا محميّ.
   *
   * ويُستثنى صراحةً ما لم يصل بعدُ إلى مسارٍ خادميّ: يُذكر هنا بالاسم لا يُسكت عنه.
   */
  const notYetEmittedByTheServer = new Set([
    // هذه تقع اليوم في حالة العميل (`store.ts`) ولم تُنقل بعد إلى مسارٍ خادميّ.
    'RESULT_PUBLISHED', 'RESULT_REOPENED', 'SCORE_CORRECTED', 'QUESTION_INVALIDATED',
    'QUESTION_REDRAWN', 'PARTICIPANT_READING_CHANGED', 'COMPETITION_POLICY_CHANGED',
    'PRIVILEGED_OVERRIDE', 'ROLE_CHANGED', 'LICENSE_ACTION', 'ENVELOPE_OPENED',
  ]);

  const emitted = SERVER_AUTHORED_AUDIT_ACTIONS.filter(action => SERVER.includes(`action:'${action}'`));
  const missing = SERVER_AUTHORED_AUDIT_ACTIONS.filter(
    action => !emitted.includes(action) && !notYetEmittedByTheServer.has(action),
  );
  assert.deepEqual(missing, [], 'these actions are blocked from the client but no server route writes them — the event would simply be lost');
  assert.ok(emitted.length >= 5, `expected real server-written events, found ${emitted.length}`);
});

test('the durable ledger is preferred when shared storage is configured', () => {
  assert.ok(SERVER.includes('const durableAuditLedger=firestoreRepository?new DurableAuditLedger('),
    'the server must build the durable ledger when Firestore is configured');
  assert.ok(SERVER.includes("if(!durableAuditLedger)return serverAuditLedger?.append(actor,input);"),
    'and prefer it over the local file adapter');
  // وإخفاقُ الكتابة الدائمة لا يُبتلع: يُعدّ ويُعرض ويُكتب محلّيًّا كي لا يضيع الحدث.
  assert.ok(SERVER.includes('auditAppendFailures+=1'), 'a failed durable append must be counted, not swallowed');
  assert.ok(SERVER.includes('auditLedgerDurability:auditLedgerDurability()'), 'and the durability class must be visible in /api/health');
});

test('no route appends to the ledger behind the helper back', () => {
  /*
   * الحارسُ لا ينفع إن بقي بابٌ جانبيّ. فكلُّ نداءٍ عابرٍ للسجلّ في المسارات يمرّ من
   * `auditAppend`، ويبقى النداءُ المباشر في موضعين معلومين فقط: مسار العميل المحروس
   * أعلاه، ومسارُ القراءة.
   */
  const direct = SERVER.split('\n')
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(({ line }) => /serverAuditLedger\??\.append\(/.test(line))
    // مسارُ العميل يُسند الناتج ليردّه، وهو المحروس أعلاه بـ`AUDIT_EVENT_SERVER_AUTHORED_ONLY`.
    .filter(({ line }) => !line.includes('const out=serverAuditLedger.append('))
    .filter(({ line }) => !line.includes('if(!durableAuditLedger)return serverAuditLedger?.append'))
    .filter(({ line }) => !line.includes('try{serverAuditLedger?.append(actor,input)}'));
  assert.deepEqual(direct.map(d => `server.ts:${d.index}`), [],
    'these lines append straight to the local ledger instead of going through auditAppend');
});
