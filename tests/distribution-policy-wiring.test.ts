import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BASE_POLICY } from '../src/lib/competition-config';

const store = fs.readFileSync('src/lib/store.ts', 'utf8');

/*
 * التوزيع صار سياسةً معلنة بعد أن كان قرارًا مخبوءًا في الشيفرة.
 *
 * وهذه الاختبارات تحرس الوصلات التي لا يُظهر انقطاعُها عطبًا في الواجهة: تبقى البوابة
 * تعمل، ويبقى المتسابق يأخذ رقمًا — ويُسنَد للجنةٍ لا تحكم فئته فلا يُكتشف ذلك إلا في
 * القاعة، أو تبقى الرواية غير مفحوصة فيقف أمام محكّمين لا يقرؤون روايته.
 */

test('the default refuses to route a participant to a panel that does not judge him', () => {
  /*
   * الاحتياطي القديم لا يفلتر الفئة. وبدء الجلسة يرفض ذلك الإسناد على أي حال
   * (`chooseSessionCommittee` يفتح حادثة توجيه) — فالرفض عند البوابة يقع حيث يُصلَح،
   * لا في القاعة والمتسابق جالس.
   */
  assert.equal(BASE_POLICY.operations.unmatchedArrivalPolicy, 'INCIDENT');
});

test('every distribution knob has a stated default, so nothing is decided by accident', () => {
  const ops = BASE_POLICY.operations;
  assert.equal(ops.distributionMode, 'ON_ARRIVAL');
  assert.equal(typeof ops.requireReadingQualifiedPanel, 'boolean');
  assert.ok(typeof ops.delegationShareCap === 'number' && ops.delegationShareCap > 0 && ops.delegationShareCap < 1,
    'a share cap outside (0,1) silently disables the constraint');
  assert.equal(typeof ops.maxQueueDepth, 'number');
});

test('the gate reads the policy instead of hard-coding the old behaviour', () => {
  assert.match(store, /unmatchedPolicy: getCompetitionPolicy\(globalState\.competition\)\.operations\.unmatchedArrivalPolicy/,
    'the arrival decision must be told which policy applies');
});

test('reading qualification is checked at the gate, not only in a lab', () => {
  /* `multiRiwayahSmartRoute` فحص الرواية منذ زمن ولم يُستدعَ من البوابة قطّ. */
  assert.match(store, /const panelQualifiedForReading/, 'the gate needs its own reading check');
  assert.match(store, /ops\.requireReadingQualifiedPanel \|\| panelQualifiedForReading/,
    'and eligibility must consult it when the policy asks');
});

test('a panel with no judges yet is not mistaken for a reading conflict', () => {
  const fn = store.slice(store.indexOf('const panelQualifiedForReading'), store.indexOf('const compatibleCommitteesFor'));
  assert.match(fn, /if \(!panel\.length\) return true;/, 'incomplete setup is not a conflict');
  assert.match(fn, /if \(!needle\) return true;/, 'a participant with no stated reading is not narrowed');
});

test('an arrival with no eligible panel keeps its number and raises an incident', () => {
  const checkIn = store.slice(store.indexOf('const checkInParticipant'), store.indexOf('const startSessionForParticipant'));
  assert.match(checkIn, /decision\.kind !== 'admit' && decision\.kind !== 'admit-unrouted'/,
    'an unrouted arrival must still be admitted');
  assert.match(checkIn, /assignedCommitteeId: unrouted \? undefined :/,
    'and must not be given a panel it does not qualify for');
  assert.match(checkIn, /createIncident\(\s*'conflict_routing'/,
    'the gap must be raised where someone can fix it');
});

test('a wave plan is proposed, re-verified, and only then applied', () => {
  const apply = store.slice(store.indexOf('const applyDistributionPlan'), store.indexOf('const recommendCommitteeElasticity'));
  assert.match(apply, /verifyDistributionPlan/, 'a plan built minutes ago may no longer describe the hall');
  assert.match(apply, /if\(!check\.ok\)return \{ok:false,reason:check\.reason\}/, 'a stale plan is refused, not applied');
  assert.match(apply, /'super_admin','org_admin','comp_admin','ops_manager'/, 'and only operations may apply it');
  assert.match(apply, /auditTrustAction\(\s*\n?\s*'DISTRIBUTION_PLAN_APPLIED'/, 'every applied plan is auditable');
});

test('applying a plan moves the door, never the turn', () => {
  const apply = store.slice(store.indexOf('const applyDistributionPlan'), store.indexOf('const recommendCommitteeElasticity'));
  assert.doesNotMatch(apply, /queueOrderKey:/, 'arrival priority is not rewritten by routing');
  assert.doesNotMatch(apply, /originalQueueNumber:/, 'nor is the original arrival number');
});

test('the wave only touches people who are still waiting', () => {
  const apply = store.slice(store.indexOf('const applyDistributionPlan'), store.indexOf('const recommendCommitteeElasticity'));
  assert.match(apply, /p\.status!=='in_queue'\)return p/, 'somebody already reciting is never re-routed underneath them');
});
