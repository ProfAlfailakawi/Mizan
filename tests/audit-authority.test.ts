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
  canonicalAuditAction,
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
    // و`RESULT_PUBLISHED` خرجت من هنا: صار `/api/results/publish` يكتبها.
    'RESULT_REOPENED', 'SCORE_CORRECTED', 'QUESTION_INVALIDATED',
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

/*
 * الهجاءُ الذي كان يفتح البابَ المُغلق.
 *
 * القائمةُ كُتبت بمفردات الطلب — `RESULT_SEALED` بالإفراد — والعميلُ يكتب
 * `RESULTS_SEALED` و`RESULTS_PUBLISHED` بالجمع. فالمطابقةُ حرفًا بحرف كانت تمرّر
 * **أخطرَ حدثين** من الباب الذي بُني ليمنعهما، والحارسُ قائمٌ يبدو عاملًا.
 */
const CLIENT_STORE = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'store.ts'), 'utf8');

/** مفرداتُ أحداث التدقيق كما يُصدرها العميل فعلًا — تُقرأ من الشيفرة لا من الذاكرة. */
function clientAuditActions(): string[] {
  const found = new Set<string>();
  for (const m of CLIENT_STORE.matchAll(/action:\s*'([A-Z][A-Z0-9_]+)'/g)) found.add(m[1]);
  for (const m of CLIENT_STORE.matchAll(/action:\s*[^,{}]*?\?\s*'([A-Z][A-Z0-9_]+)'\s*:\s*'([A-Z][A-Z0-9_]+)'/g)) { found.add(m[1]); found.add(m[2]); }
  for (const m of CLIENT_STORE.matchAll(/auditTrustAction\(\s*'([A-Z][A-Z0-9_]+)'/g)) found.add(m[1]);
  return [...found].sort();
}

test('the spellings the client actually emits for a guarded act are refused', () => {
  for (const spelling of ['RESULTS_SEALED', 'RESULTS_PUBLISHED', 'RESULTS_REOPENED', 'SCORES_CORRECTED']) {
    assert.ok(isServerAuthoredAuditAction(spelling), `${spelling} is the guarded act under another spelling`);
  }
  // والتطبيعُ يردّ الهجاءَ إلى فعله ولا يخترع فعلًا لما لا يعرفه.
  assert.equal(canonicalAuditAction(' results_published '), 'RESULT_PUBLISHED');
  assert.equal(canonicalAuditAction('PARTICIPANT_CHECKIN'), 'PARTICIPANT_CHECKIN');
  assert.equal(canonicalAuditAction(undefined), '');
});

test('no client spelling of a guarded act can slip past the guard', () => {
  /*
   * هذا هو صنفُ العطل، لا حالتُه الواحدة: فعلٌ محروس يُكتب بهجاءٍ آخر فيمرّ. فكلُّ حدثٍ
   * يُصدره العميل ويشترك مع فعلٍ محروس في صدره ونهايته يجب أن يُردّ — وإلا فالقائمةُ
   * تحرس اسمًا لا يرسله أحد.
   */
  const emitted = clientAuditActions();
  const escaped: string[] = [];
  for (const guarded of SERVER_AUTHORED_AUDIT_ACTIONS) {
    const [head, ...rest] = guarded.split('_');
    const family = new RegExp(`^${head}S?_${rest.join('_')}$`);
    for (const action of emitted) {
      if (family.test(action) && !isServerAuthoredAuditAction(action)) escaped.push(`${action} (≡ ${guarded})`);
    }
  }
  assert.deepEqual(escaped, [], 'these client events name a server-authored act but are not refused');
});

test('the client vocabulary is real, so this drift test is actually reading something', () => {
  const emitted = clientAuditActions();
  assert.ok(emitted.length > 100, `expected the full client vocabulary, found ${emitted.length}`);
  assert.ok(emitted.includes('RESULTS_SEALED') && emitted.includes('RESULTS_PUBLISHED'),
    'the two acts this guard exists for must be in the vocabulary it is checked against');
});

test('a role grant is a role change, and today no server route writes it — said plainly, not hidden', () => {
  /*
   * الحارسُ يمنع `ROLE_CHANGED`، والعميلُ لا يرسله قطّ: يرسل `ROLE_GRANT_UPDATED`
   * و`ROLE_GRANT_REMOVED` و`ROLE_GRANT_STATUS_CHANGED`. وهي تغييرُ دورٍ بلا شكّ.
   *
   * ولم تُضَف إلى الحارس هنا، لأن منعَها اليوم يعني ضياعَها: لا مسار خادميّ يمنح الأدوار
   * فيكتبها. فمنعُها يُخفي عن المدقّق **كلَّ** تغييرات الصلاحيات بدل أن يحميها. فتُقيَّد
   * صراحةً بأنها مُقرَّة من العميل حتى يوجد مسارُها، ويفشل هذا الاختبار إن وُجد المسار
   * ولم يُنقل المنع — فلا يُنسى.
   */
  const awaitingServerRoute = ['ROLE_GRANT_UPDATED', 'ROLE_GRANT_REMOVED', 'ROLE_GRANT_STATUS_CHANGED'];
  const emitted = clientAuditActions();
  for (const action of awaitingServerRoute) {
    assert.ok(emitted.includes(action), `${action} must still be part of the client vocabulary`);
    assert.equal(isServerAuthoredAuditAction(action), false,
      `${action} is client-attested today; refusing it before a server route exists would lose it`);
  }
  const serverWritesRoleChange = SERVER.includes("action:'ROLE_CHANGED'") || /app\.(post|patch|put)\('\/api\/identity\/role-grants/.test(SERVER);
  assert.equal(serverWritesRoleChange, false,
    'a server route now writes role changes — move ROLE_GRANT_* onto the guard and delete this exemption');
});
