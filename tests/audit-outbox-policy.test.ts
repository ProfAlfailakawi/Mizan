/*
 * §30 — الحارسُ الذي بُني ليحمي السجلَّ كان يُفرغه.
 *
 * طابورُ مرآة التدقيق كان يعامل كلَّ ردٍّ غير ناجح معاملةً واحدة: أبقِ الصفَّ وما بعده،
 * وتراجَعْ، وأعِد المحاولة. وهذا صحيحٌ لعطلٍ عابر.
 *
 * لكنّ `AUDIT_EVENT_SERVER_AUTHORED_ONLY` رفضٌ **دائم**: صفٌّ يحمل حدثًا يؤلّفه الخادمُ
 * وحده لن يُقبل أبدًا مهما أُعيد. وهو في رأس الطابور، فيسدّه — فلا يصل الخادمَ أيُّ حدثٍ
 * بعده ما بقيت الجلسة. فالنتيجةُ أن حارسًا أُضيف ليمنع حدثًا واحدًا مزوَّرًا صار يمنع
 * كلَّ الأحداث الصادقة، بصمتٍ، وفي البيئة التي يُحتجّ فيها بالسجلّ.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  auditRetryDecision,
  AUDIT_BACKOFF_SERVER_BUSY_MS,
  AUDIT_BACKOFF_TRANSIENT_MS,
} from '../src/lib/audit-outbox-policy';

test('a delivered row is simply done', () => {
  for (const status of [200, 201, 204]) {
    assert.deepEqual(auditRetryDecision(status), { kind: 'DELIVERED' }, String(status));
  }
});

test('a permanent refusal is dropped and named — never retried forever', () => {
  const decision = auditRetryDecision(403, 'AUDIT_EVENT_SERVER_AUTHORED_ONLY');
  assert.deepEqual(decision, { kind: 'REFUSED_PERMANENTLY', code: 'AUDIT_EVENT_SERVER_AUTHORED_ONLY' });
});

test('every status that cannot succeed on retry is treated as permanent', () => {
  for (const status of [400, 403, 409, 413, 422]) {
    assert.equal(auditRetryDecision(status).kind, 'REFUSED_PERMANENTLY', String(status));
  }
  // وبلا رمزٍ مُسمّى يبقى السببُ مذكورًا بالحالة، فلا يُقيَّد رفضٌ بلا سبب.
  assert.deepEqual(auditRetryDecision(422), { kind: 'REFUSED_PERMANENTLY', code: 'HTTP_422' });
});

test('a transient failure keeps the row and backs off', () => {
  assert.deepEqual(auditRetryDecision(503), { kind: 'RETRY_LATER', backoffMs: AUDIT_BACKOFF_SERVER_BUSY_MS });
  assert.deepEqual(auditRetryDecision(500), { kind: 'RETRY_LATER', backoffMs: AUDIT_BACKOFF_TRANSIENT_MS });
  assert.deepEqual(auditRetryDecision(429), { kind: 'RETRY_LATER', backoffMs: AUDIT_BACKOFF_TRANSIENT_MS });
});

test('an expired token is transient — the row waits for a refresh, it is not thrown away', () => {
  /*
   * 401 ليست رفضًا للصفّ، هي انتهاءُ رمز. وإسقاطُ حدثِ تدقيقٍ لأن الرمزَ انتهى ضياعٌ
   * لا مبرّر له، فالمحاولةُ التالية تحمل رمزًا جديدًا.
   */
  assert.equal(auditRetryDecision(401).kind, 'RETRY_LATER');
});

test('MFA_REQUIRED is liftable by the user, so the row waits rather than being discarded', () => {
  // 403 عمومًا دائم، لكنّ هذا الرفضَ يرفعه المستخدمُ بخطوةٍ يفعلها — فلا يُسقَط الصفّ.
  assert.deepEqual(auditRetryDecision(403, 'MFA_REQUIRED'), { kind: 'RETRY_LATER', backoffMs: AUDIT_BACKOFF_SERVER_BUSY_MS });
  assert.deepEqual(auditRetryDecision(403, ' mfa_required '), { kind: 'RETRY_LATER', backoffMs: AUDIT_BACKOFF_SERVER_BUSY_MS });
});

test('the queue drains past a permanently refused row instead of stopping at it', () => {
  /*
   * هذا هو العطلُ نفسه: ثلاثةُ صفوف، أوسطُها مرفوضٌ رفضًا دائمًا. فالسلوكُ الصحيح أن
   * يصل الثالثُ إلى الخادم. والسلوكُ القديم كان يقف عند الثاني فلا يصل الثالثُ أبدًا.
   */
  const rows = [
    { id: 'a', status: 200, code: '' },
    { id: 'b', status: 403, code: 'AUDIT_EVENT_SERVER_AUTHORED_ONLY' },
    { id: 'c', status: 200, code: '' },
  ];
  const delivered: string[] = []; const refused: string[] = []; const kept: string[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const decision = auditRetryDecision(rows[i].status, rows[i].code);
    if (decision.kind === 'DELIVERED') { delivered.push(rows[i].id); continue; }
    if (decision.kind === 'REFUSED_PERMANENTLY') { refused.push(rows[i].id); continue; }
    kept.push(...rows.slice(i).map(r => r.id)); break;
  }
  assert.deepEqual(delivered, ['a', 'c'], 'the row after the refusal must still reach the server');
  assert.deepEqual(refused, ['b']);
  assert.deepEqual(kept, []);
});

test('a transient failure still stops the queue, so order is preserved', () => {
  // الترتيبُ معنى في سجلٍّ متسلسل: عطلٌ عابر يوقف الطابور ولا يقفز فوق صفٍّ لم يصل.
  const rows = [{ id: 'a', status: 200 }, { id: 'b', status: 503 }, { id: 'c', status: 200 }];
  const delivered: string[] = []; const kept: string[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const decision = auditRetryDecision(rows[i].status);
    if (decision.kind === 'DELIVERED') { delivered.push(rows[i].id); continue; }
    kept.push(...rows.slice(i).map(r => r.id)); break;
  }
  assert.deepEqual(delivered, ['a']);
  assert.deepEqual(kept, ['b', 'c'], 'b has not been delivered, so c must not overtake it');
});

test('the store reads this policy instead of keeping its own copy', () => {
  const store = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'store.ts'), 'utf8');
  assert.ok(store.includes("from './audit-outbox-policy'"), 'the queue must read the shared policy');
  assert.ok(store.includes('auditRetryDecision(response.status,body?.code)'), 'and decide through it');
  assert.ok(store.includes("decision.kind==='REFUSED_PERMANENTLY'"), 'a permanent refusal must be handled by name');
  assert.ok(/REFUSED_PERMANENTLY'\)\{recordServerAuditRefusal\([^)]*\);continue\}/.test(store),
    'a permanently refused row must be recorded and skipped — `continue`, never `break`');
  assert.equal(/AUDIT_PERMANENT_REFUSAL\s*=\s*new Set/.test(store), false,
    'no second copy of the status list may drift from the policy module');
});

test('a permanently refused event is recorded locally, not silently dropped', () => {
  /*
   * الإسقاطُ الصامت هو العطلُ الآخر: حدثٌ رُفض ولم يُسجَّل رفضُه لا يعرف به أحد. فما
   * يسقط من الطابور يبقى مقيَّدًا محلّيًّا بسببه ووقته، ويُقرأ.
   */
  const store = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'store.ts'), 'utf8');
  assert.ok(store.includes('SERVER_AUDIT_REFUSED_KEY'), 'refusals need their own durable key');
  assert.ok(store.includes('export function serverAuditRefusals()'), 'and must be readable');
  assert.ok(/refusedAt:new Date\(\)\.toISOString\(\)/.test(store), 'with the time it was refused');
});
