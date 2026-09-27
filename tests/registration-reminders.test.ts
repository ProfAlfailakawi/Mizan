import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { RegistrationReminderStore, runRegistrationReminders, REMINDER_DELAY_MS, REMINDER_RETENTION_MS } from '../server/registration-reminders';

const withStore = (run: (s: RegistrationReminderStore, clock: { t: number }, file: string) => Promise<void> | void) => async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-rr-'));
  const clock = { t: Date.parse('2026-10-01T00:00:00Z') };
  const file = path.join(dir, 'r.json');
  try { await run(new RegistrationReminderStore(file, () => clock.t), clock, file); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
const open = async () => ({ id: 'C1', name: 'Award', status: 'registration_open', registrationEndDate: '2026-12-01' });

test('only email and competition are stored, once per pair, and invalid emails are refused', withStore((s, _c, file) => {
  const first = s.request({ competitionId: 'C1', email: 'Ali@Example.com' });
  assert.equal(first.created, true);
  assert.equal(s.request({ competitionId: 'C1', email: 'ali@example.com' }).created, false, 'a second request never doubles the reminder');
  assert.throws(() => s.request({ competitionId: 'C1', email: 'not-an-email' }), /REGISTRATION_EMAIL_INVALID/);
  const row = JSON.parse(fs.readFileSync(file, 'utf8'))[0];
  assert.deepEqual(Object.keys(row).sort(), ['cancelToken', 'competitionId', 'createdAt', 'email', 'emailHash', 'id', 'locale', 'remindAt']);
}));

test('one reminder after the delay while registration is open; completing registration cancels it', withStore(async (s, clock) => {
  s.request({ competitionId: 'C1', email: 'a@example.com' });
  s.request({ competitionId: 'C1', email: 'b@example.com' });
  const sent: string[] = [];
  const send = (r: any) => { sent.push(r.email); };
  await runRegistrationReminders(s, open, send, clock.t);
  assert.deepEqual(sent, [], 'nothing before the delay');
  assert.equal(s.completed('C1', 'B@example.com'), 1);
  clock.t += REMINDER_DELAY_MS;
  await runRegistrationReminders(s, open, send, clock.t);
  assert.deepEqual(sent, ['a@example.com']);
  await runRegistrationReminders(s, open, send, clock.t + 3_600_000);
  assert.deepEqual(sent, ['a@example.com'], 'the record is deleted after sending: never a second message');
}));

test('closed registration sends nothing and deletes the record; cancel link works once', withStore(async (s, clock) => {
  const { cancelToken } = s.request({ competitionId: 'C1', email: 'a@example.com' }) as { cancelToken: string };
  s.request({ competitionId: 'C1', email: 'z@example.com' });
  assert.equal(s.cancel('mz_remind_wrong'), false);
  assert.equal(s.cancel(cancelToken), true);
  assert.equal(s.cancel(cancelToken), false);
  clock.t += REMINDER_DELAY_MS;
  const sent: string[] = [];
  const out = await runRegistrationReminders(s, async () => ({ id: 'C1', name: 'Award', status: 'registration_closed' }), r => { sent.push(r.email); }, clock.t);
  assert.deepEqual(sent, []);
  assert.equal(out.closed, 1);
  assert.equal(s.due().length, 0);
}));

test('an unreadable competition is retried, and stale records expire', withStore(async (s, clock) => {
  s.request({ competitionId: 'C1', email: 'a@example.com' });
  clock.t += REMINDER_DELAY_MS;
  await runRegistrationReminders(s, async () => { throw new Error('FIRESTORE_UNAVAILABLE'); }, () => {}, clock.t);
  assert.equal(s.due().length, 1, 'kept for the next cycle');
  clock.t += REMINDER_RETENTION_MS + 1;
  assert.equal(s.purgeExpired(), 1);
}));
