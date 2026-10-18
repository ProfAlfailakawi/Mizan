import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COLLECTION_READERS, CONFIG_WRITER_ROLES, WATCHED_COLLECTIONS, watchPlanFor } from '../src/lib/cloud-sync';
import type { Role } from '../src/types';

/*
 * المستمعون السحابيون يجب أن يطابقوا قواعد القراءة حرفًا بحرف.
 *
 * كان المخزن يفتح اثني عشر مستمعًا لكل دور، فيمتلئ سجلّ المتصفح بـ«permission-denied» عند كل دخول،
 * والمحكّم يطلب كل الإرساليات وقاعدته تسمح له بإرسالاته وحدها فيُرفض الطلب كله. هذا الاختبار يقرأ
 * `firestore.rules` نفسها فلا يبقى الجدول في الشيفرة رأيًا يتباعد عن القواعد.
 */
const rules = fs.readFileSync('firestore.rules', 'utf8');

function readRoles(collection: string): { all: Set<string>; own: Set<string> } {
  const start = rules.indexOf(`match /${collection}/{`);
  assert.ok(start > 0, `rules must define ${collection}`);
  const read = rules.slice(start).match(/allow read:([\s\S]*?);/);
  assert.ok(read, `${collection} must have a read rule`);
  const all = new Set<string>(), own = new Set<string>();
  for (const alternative of read![1].split('||')) {
    const roles = [...alternative.matchAll(/roleIs\(\[([^\]]*)\]\)/g)].flatMap(m => [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]));
    for (const r of roles) (alternative.includes('uploaderUid') ? own : all).add(r);
  }
  return { all, own };
}

test('every watched collection lists exactly the roles the rules let read it', () => {
  for (const collection of WATCHED_COLLECTIONS) {
    const fromRules = readRoles(collection);
    const mapped = COLLECTION_READERS[collection];
    assert.deepEqual([...new Set(mapped.all)].sort(), [...fromRules.all].sort(), `${collection}: roles that read everything`);
    assert.deepEqual([...new Set(mapped.own || [])].sort(), [...fromRules.own].sort(), `${collection}: roles that read only their own rows`);
  }
});

test('a judge listens to its own submissions only, a contestant to its own appeals only', () => {
  const judge = watchPlanFor('judge');
  assert.deepEqual(judge.find(p => p.collection === 'judge_submissions'), { collection: 'judge_submissions', ownOnly: true });
  assert.ok(!judge.some(p => ['reviews', 'certificates', 'qualifications'].includes(p.collection)), 'a judge cannot read those, so it must not ask');
  const participant = watchPlanFor('participant');
  assert.deepEqual(participant, [{ collection: 'appeals', ownOnly: true }]);
});

test('roles with no cloud read access open no listeners at all', () => {
  for (const role of ['billing_admin', 'storage_admin', 'broadcast_operator'] as Role[]) assert.deepEqual(watchPlanFor(role), [], role);
});

test('the branch manager can configure competitions and run their operations, but never seal or publish', () => {
  assert.ok(CONFIG_WRITER_ROLES.includes('branch_admin'));
  const plan = watchPlanFor('branch_admin').map(p => p.collection);
  for (const c of ['participants', 'committees', 'schedule_plans']) assert.ok(plan.includes(c as never), c);
  for (const c of ['results', 'certificates', 'reviews', 'judge_submissions', 'appeals']) assert.ok(!plan.includes(c as never), c);
  assert.match(rules, /function branchAdmin\(orgId, competitionId\)/);
  assert.doesNotMatch(rules.slice(rules.indexOf('match /results/'), rules.indexOf('match /certificates/')), /branch_admin/);
});
