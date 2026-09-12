import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

/*
 * الشاشة بلا امتياز.
 *
 * قبل هذا كانت كل شاشة قاعة تحتاج جهازًا مسجَّلًا بدورٍ تشغيليّ ليقرأ الطابور — أي أن
 * عشر شاشات تعني عشرة أجهزة تملك قراءة سجلّ المتسابقين كاملًا، معلَّقة في ممرّات بلا
 * حارس. فصار جهاز الإدارة ينشر إسقاطًا بالأكواد وحدها تقرؤه الشاشات بلا تسجيل دخول.
 *
 * هذه الاختبارات تحرس العقد الذي يقوم عليه ذلك، لأن كسره لا يظهر في الواجهة: تبقى
 * الشاشة تعمل، ويبقى الباب مفتوحًا.
 */

/* ── قاعدة الوثيقة العامة ────────────────────────────────────────────────── */

const rules = read('firestore.rules');
const publicBoards = /match \/public_boards\/\{competitionId\} \{[\s\S]*?\n    \}/.exec(rules)?.[0] || '';

test('the public board document exists in the rules and is world-readable by design', () => {
  assert.ok(publicBoards, 'public_boards must be declared, or no unauthenticated screen can read it');
  assert.match(publicBoards, /allow read: if true;/, 'a hall screen has no account — the read must be open');
});

test('only competition management may publish a board', () => {
  const writes = publicBoards.match(/allow (create|update):[\s\S]*?;/g) || [];
  assert.equal(writes.length, 2, 'create and update are stated separately');
  for (const clause of writes) {
    assert.match(clause, /signedIn\(\)/, 'anonymous writes are never allowed');
    assert.match(clause, /roleIs\(\[[^\]]*'ops_manager'[^\]]*\]\)/, 'operations publishes the board');
    assert.doesNotMatch(clause, /'judge'|'participant'|'guardian'/, 'no judging or public role may publish');
    assert.match(clause, /scoped\(/, 'the writer must be inside the tenant and competition');
  }
});

test('a published board cannot be moved to another competition or widen its own privacy', () => {
  const writes = publicBoards.match(/allow (create|update):[\s\S]*?;/g) || [];
  for (const clause of writes) {
    assert.match(clause, /board\.competitionId == competitionId/, 'the document must belong to its own path');
    assert.match(clause, /board\.privacyMode == 'CODES_ONLY'/, 'a board that claims wider privacy is refused at the rule');
  }
  const update = writes.find((c) => c.startsWith('allow update')) || '';
  assert.match(update, /organizationId == resource\.data\.organizationId/, 'an update may not hand the board to another tenant');
});

test('the board can be switched off everywhere at once', () => {
  assert.match(publicBoards, /allow delete: if signedIn\(\)/, 'deleting the document darkens every screen in one action');
});

/* ── إيقاع النشر ─────────────────────────────────────────────────────────── */

const publisher = read('src/lib/use-board-publisher.ts');
const board = read('src/lib/display-board.ts');
const lease = read('src/lib/board-lease.ts');

test('a quiet hall does not make every screen claim it stopped', () => {
  /*
   * الشاشة تُعلن توقّفها بعد BOARD_LAGGING_MS. فلو نُشر عند التغيّر وحده لأعلنت قاعةٌ
   * هادئة — وهي حالة طبيعية — توقّفًا لا وجود له. النبضة الهادئة تمنع هذه الكذبة.
   */
  const heartbeat = Number(/const RENEW_MS = ([\d_]+)/.exec(lease)?.[1]?.replace(/_/g, ''));
  const lagging = Number(/BOARD_LAGGING_MS = ([\d_]+)/.exec(board)?.[1]?.replace(/_/g, ''));
  assert.ok(Number.isFinite(heartbeat) && Number.isFinite(lagging), 'both cadences must be declared');
  assert.ok(heartbeat < lagging, `a heartbeat of ${heartbeat}ms must stay under the ${lagging}ms lag threshold`);
});

test('the publish cadence is driven by content, not by a blind timer', () => {
  assert.match(publisher, /contentSignature/, 'unchanged content must not be republished every tick');
  assert.match(publisher, /generatedAt, \.\.\.rest/, 'the timestamp is excluded, or every tick looks like a change');
});

test('a failed publish is retried, and a slow network does not stack requests', () => {
  assert.match(publisher, /if \(out\.ok\) publishedSignature = signature/, 'only a successful publish records what was sent');
  assert.match(publisher, /inFlight/, 'one publish at a time');
});

/* ── لا شاشةَ معلّقةٍ بتبويبٍ واحد ───────────────────────────────────────── */

test('the hall does not go dark because one admin closed a tab', () => {
  /*
   * هذا كان أخطر ما في التصميم: عشرُ شاشاتٍ تتوقّف معًا لأن تبويبًا أُغلق، والشاشات تقول
   * الصدق ولا أحد يعرف أن السبب عنده. فصار كل جهازٍ مؤهَّل مرشَّحًا، ويتولّى أحدهم إن صمت
   * الناشر — والقرار كلّه في وحدةٍ نقيّة تُختبر بالأرقام، لا في خطّاف لا يُشغَّل في فحص.
   */
  assert.match(lease, /export function decidePublish/, 'the takeover rule must be a pure, testable decision');
  assert.match(publisher, /decidePublish\(/, 'and the hook must actually route through it');
  assert.match(publisher, /readBoardLease/, 'a standby learns the publisher is alive by reading, not by guessing');
});

test('the lease is measured on one clock, so a skewed device cannot start a stampede', () => {
  /*
   * لو قيس عمرُ العقد بطرح ختمٍ كتبه جهازٌ من ساعة جهازٍ آخر، لكفى تأخُّرُ ساعةٍ دقيقةً
   * ليرى الجميع عقدًا منتهيًا أبدًا فيتخاطفوه بلا توقّف — وهو عطبٌ لا يظهر إلا في قاعة.
   */
  assert.match(lease, /previous\.stamp === lease\.stamp/, 'the stamp is compared as text, never parsed as a time');
  assert.doesNotMatch(lease, /Date\.parse|new Date\(/, 'nothing in the lease may interpret another device’s clock');
});

test('an ineligible device neither writes nor claims to be the publisher', () => {
  /* وإلّا قال لمن أمامه إن الشاشات معلّقة بجهازه — وهي ليست، فيُطمئنه إلى خطأ. */
  assert.match(publisher, /if \(!portRef\.current\.canPublishDisplayBoard\(\)\)/, 'eligibility is asked every tick, not once');
  assert.match(lease, /if \(!eligible\) return \{ publish: false, role: 'INELIGIBLE'/, 'and the decision says so plainly');
});

test('the operator is told the screens hang on their device', () => {
  const surface = read('src/components/operations/HallScreenPublisher.tsx');
  assert.match(surface, /describePublisherRole/, 'the publishing device must show its own role');
  assert.match(surface, /useBoardPublisherStatus/, 'read from the one publisher, not a second one');
});

/* ── ما يصل الشاشة ──────────────────────────────────────────────────────── */

test('the reader rebuilds the projection instead of trusting the document', () => {
  /* الوثيقة مكشوفة وكاتبها مُصرَّح لا معصوم؛ المنع بالبنية لا بالثقة. */
  assert.match(board, /export function parseDisplayBoard/, 'a validating reader must exist');
  assert.match(board, /privacyMode: 'CODES_ONLY',/, 'privacy is stamped by the reader, never copied in');
  const store = read('src/lib/store.ts');
  assert.match(store, /parseDisplayBoard\(\(snap\.data\(\)/, 'the store must read through the parser, not straight from the snapshot');
});

test('the screen route is reachable without an account', () => {
  const app = read('src/App.tsx');
  const boardAt = app.indexOf("hash.startsWith('#board')");
  const authGateAt = app.indexOf('if(requireAuth&&!signedIn) return <AuthPortal/>');
  assert.ok(boardAt > 0 && authGateAt > 0, 'both the route and the gate must exist');
  assert.ok(boardAt < authGateAt, 'a TV in a corridor must not be asked to sign in');
});
