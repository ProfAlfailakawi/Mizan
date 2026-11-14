import test from 'node:test';
import assert from 'node:assert/strict';
import { readFamily, upsertFamily, removeFromFamily, GUARDIAN_FAMILY_MAX, type FamilyMember } from '../src/lib/guardian-family';

const tok = (n: string) => `mz_guardian_${n.padEnd(24, 'x')}`;
const m = (id: string, name = 'ابن'): FamilyMember => ({ token: tok(id), participantId: id, name, code: `A-${id}` });

test('two children from two links appear together', () => {
  const a = upsertFamily([], m('p1', 'أحمد'));
  const b = upsertFamily(a, m('p2', 'سارة'));
  assert.deepEqual(b.map(x => x.name), ['أحمد', 'سارة']);
});

test('reopening the same child updates it instead of duplicating', () => {
  const a = upsertFamily(upsertFamily([], m('p1', 'أحمد')), m('p1', 'أحمد محمد'));
  assert.equal(a.length, 1);
  assert.equal(a[0].name, 'أحمد محمد');
});

test('a reissued link replaces the old key for the same child', () => {
  const fresh = { ...m('p1'), token: tok('NEWKEY') };
  const a = upsertFamily([m('p1')], fresh);
  assert.equal(a.length, 1);
  assert.equal(a[0].token, fresh.token);
});

test('only guardian tokens are kept: a journey/participant key, junk, or empty id is refused', () => {
  const bad = { ...m('p1'), token: 'mz_journey_' + 'x'.repeat(30) };
  assert.deepEqual(upsertFamily([], bad), []);
  assert.deepEqual(upsertFamily([], { ...m('p1'), token: 'nope' }), []);
  assert.deepEqual(upsertFamily([], { ...m('p1'), participantId: '' }), []);
});

test('storage is read defensively', () => {
  assert.deepEqual(readFamily(null), []);
  assert.deepEqual(readFamily('not json'), []);
  assert.deepEqual(readFamily('{"a":1}'), []);
  const raw = JSON.stringify([m('p1'), m('p1'), { token: 'x', participantId: 'q' }, null, 5, m('p2')]);
  assert.deepEqual(readFamily(raw).map(x => x.participantId), ['p1', 'p2'], 'duplicates and bad rows are dropped');
});

test('the list is capped, dropping the oldest', () => {
  let list: FamilyMember[] = [];
  for (let i = 0; i < GUARDIAN_FAMILY_MAX + 3; i++) list = upsertFamily(list, m(`p${i}`));
  assert.equal(list.length, GUARDIAN_FAMILY_MAX);
  assert.equal(list[0].participantId, 'p3');
  assert.equal(list[list.length - 1].participantId, `p${GUARDIAN_FAMILY_MAX + 2}`);
});

test('control characters never reach the page through a name', () => {
  const a = upsertFamily([], { ...m('p1'), name: 'أحمد\n\u0007<b>' });
  assert.ok(!/[\u0000-\u001f]/.test(a[0].name));
});

test('removing a child leaves the others', () => {
  const l = removeFromFamily([m('p1'), m('p2')], 'p1');
  assert.deepEqual(l.map(x => x.participantId), ['p2']);
});

import fs from 'node:fs';
import path from 'node:path';
test('wiring: the guardian page saves each opened link, shows the switcher, and forgetting clears all', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'src/components/public/JourneyAccess.tsx'), 'utf8');
  assert.match(src, /upsertFamily\(readFamily\(localStorage\.getItem\(familyKey\)\)/, 'a successful load records the child');
  assert.match(src, /audience === 'guardian' && family\.length > 0 && <nav/, 'the switcher is guardian-only');
  assert.match(src, /localStorage\.removeItem\(familyKey\); setFamily\(\[\]\)/, 'forgetting this device clears every saved child');
  assert.match(src, /family\.length > 1 && family\.map/, 'chips appear only when there is more than one child');
});
