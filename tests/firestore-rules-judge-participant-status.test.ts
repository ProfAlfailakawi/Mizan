import test from 'node:test';
import fs from 'node:fs';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, type Firestore } from 'firebase/firestore';

/*
 * الحَكَم الذي يُنهي الجلسة يُقدِّم حالة المتسابق إلى الأمام فقط (in_session / tested)،
 * ولا يمسّ إلا status و statusHistory و updatedAt، والسجلّ إلحاقيٌّ بمدخلٍ واحد.
 * التشغيل: npm run qa:firestore-rules
 */

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
// مسار خاص بهذا الملف: ملفات القواعد تعمل متزامنة على المشروع نفسه، وهذا الملف يُغلق مسابقته.
const ORG = 'org-judge-status', COMP = 'comp-judge-status';
const COMP_PATH = `organizations/${ORG}/competitions/${COMP}`;
const P = `${COMP_PATH}/participants/part-1`;
const T0 = '2026-05-01T08:00:00.000Z', T1 = '2026-05-01T09:00:00.000Z';
const h = (status: string, at = T0) => ({ status, at, by: 'usr-ops' });

let env: RulesTestEnvironment | null = null;
const ctx = (role: string, comp = COMP) =>
  env!.authenticatedContext(`uid-${role}-${comp}`, { role, org_id: ORG, competition_id: comp }).firestore() as unknown as Firestore;

async function raw(path: string, data: Record<string, unknown>) {
  await env!.withSecurityRulesDisabled(async c => {
    await setDoc(doc(c.firestore() as unknown as Firestore, path), data);
  });
}
const seed = (status: string, history?: unknown[]) => raw(P, {
  id: 'part-1', name: 'متسابق', uploaderUid: 'uid-p', organizationId: ORG, competitionId: COMP,
  status, updatedAt: T0, ...(history ? { statusHistory: history } : {}),
});
// Mirrors src/lib/store.ts persistParticipantStatusOnly: setDoc(..., { merge: true }).
const write = (db: Firestore, fields: Record<string, unknown>) => setDoc(doc(db, P), fields, { merge: true });
const advance = (db: Firestore, prev: unknown[], status: string, extra: Record<string, unknown> = {}) =>
  write(db, { status, statusHistory: [...prev, h(status, T1)], updatedAt: T1, ...extra });

test('firestore rules: judge advances participant status', { skip: HOST ? false : 'FIRESTORE_EMULATOR_HOST غير مضبوط — شغّل: npm run qa:firestore-rules' }, async (t) => {
  env = await initializeTestEnvironment({
    projectId: 'mizan-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: HOST!.split(':')[0], port: Number(HOST!.split(':')[1]) },
  });
  t.after(async () => { await env?.cleanup(); });
  await raw(COMP_PATH, { competition: { id: COMP, status: 'active' } });

  await t.test('forward in_queue → tested with one appended entry is allowed', async () => {
    const prev = [h('registered'), h('in_queue')];
    await seed('in_queue', prev);
    await assertSucceeds(advance(ctx('judge'), prev, 'tested'));
  });

  await t.test('forward checked_in → in_session → tested is allowed', async () => {
    const prev = [h('checked_in')];
    await seed('checked_in', prev);
    await assertSucceeds(advance(ctx('judge'), prev, 'in_session'));
    await assertSucceeds(advance(ctx('judge'), [...prev, h('in_session', T1)], 'tested'));
  });

  await t.test('backward and sideways transitions are denied', async () => {
    const done = [h('tested')];
    await seed('tested', done);
    await assertFails(advance(ctx('judge'), done, 'in_session'));
    await assertFails(advance(ctx('judge'), done, 'in_queue'));
    const inSession = [h('in_session')];
    await seed('in_session', inSession);
    await assertFails(advance(ctx('judge'), inSession, 'in_session'));
    const q = [h('in_queue')];
    await seed('in_queue', q);
    for (const s of ['checked_in', 'registered', 'withdrawn', 'approved', 'in_queue', 'disqualified']) {
      await assertFails(advance(ctx('judge'), q, s));
    }
    const r = [h('registered')];
    await seed('registered', r);
    await assertFails(advance(ctx('judge'), r, 'tested'));
    await assertFails(advance(ctx('judge'), r, 'in_session'));
  });

  await t.test('touching other fields is denied', async () => {
    const prev = [h('in_queue')];
    await seed('in_queue', prev);
    await assertFails(advance(ctx('judge'), prev, 'tested', { uploaderUid: 'uid-judge' }));
    await assertFails(advance(ctx('judge'), prev, 'tested', { name: 'آخر' }));
    await assertFails(advance(ctx('judge'), prev, 'tested', { score: 100 }));
  });

  await t.test('rewriting, erasing or double-appending history is denied', async () => {
    const prev = [h('registered'), h('in_queue')];
    await seed('in_queue', prev);
    const db = ctx('judge');
    await assertFails(write(db, { status: 'tested', statusHistory: [h('tested', T1)], updatedAt: T1 }));
    await assertFails(write(db, { status: 'tested', statusHistory: [], updatedAt: T1 }));
    await assertFails(write(db, { status: 'tested', statusHistory: [h('registered', T1), h('in_queue'), h('tested', T1)], updatedAt: T1 }));
    await assertFails(write(db, { status: 'tested', statusHistory: [...prev, h('in_session', T1), h('tested', T1)], updatedAt: T1 }));
    await assertFails(write(db, { status: 'tested', statusHistory: [...prev, h('in_session', T1)], updatedAt: T1 }));
    await assertFails(updateDoc(doc(db, P), { status: 'tested', updatedAt: T1 }));
  });

  await t.test('participant with no statusHistory field accepts exactly one new entry', async () => {
    await seed('in_queue');
    await assertFails(write(ctx('judge'), { status: 'tested', statusHistory: [h('in_queue'), h('tested', T1)], updatedAt: T1 }));
    await assertFails(write(ctx('judge'), { status: 'tested', updatedAt: T1 }));
    await assertSucceeds(advance(ctx('judge'), [], 'tested'));
  });

  await t.test('judge of another competition, missing doc, or closed competition is denied', async () => {
    const prev = [h('in_queue')];
    await seed('in_queue', prev);
    await assertFails(advance(ctx('judge', 'comp-z'), prev, 'tested'));
    await assertFails(setDoc(doc(ctx('judge'), `${COMP_PATH}/participants/ghost`), { status: 'tested', statusHistory: [h('tested')], updatedAt: T1 }, { merge: true }));
    await raw(COMP_PATH, { competition: { id: COMP, status: 'completed' } });
    await assertFails(advance(ctx('judge'), prev, 'tested'));
    await raw(COMP_PATH, { competition: { id: COMP, status: 'active' } });
  });

  await t.test('non-judge roles are unaffected', async () => {
    await seed('tested', [h('tested')]);
    await assertSucceeds(write(ctx('comp_admin'), { status: 'in_queue', name: 'تعديل' }));
    for (const role of ['head_judge', 'ops_manager', 'participant', 'auditor', 'broadcast_operator']) {
      await seed('in_queue', [h('in_queue')]);
      await assertFails(advance(ctx(role), [h('in_queue')], 'tested'));
    }
  });
});
