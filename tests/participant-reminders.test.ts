import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { localNow, planParticipantReminders, runParticipantReminders, type ReminderParticipant, type ReminderPlan } from '../server/participant-reminders';
import { CommunicationsService } from '../server/communications';

const competition = { id: 'C1', organizationId: 'O1', name: 'Quran Award', nameArabic: 'جائزة القرآن', timezone: 'Asia/Kuwait', venueName: 'Main Hall', status: 'judging' };
const plan: ReminderPlan = {
  id: 'S1', status: 'published', halls: [{ id: 'H1', name: 'Hall A' }],
  slots: [
    { participantId: 'P1', committeeId: 'K1', hallId: 'H1', date: '2026-10-02', start: '09:00' },
    { participantId: 'P2', committeeId: 'K1', hallId: 'H1', date: '2026-10-05', start: '10:00' },
    { participantId: 'P3', committeeId: 'K1', hallId: 'H1', date: '2026-10-01', start: '08:00' },
    { participantId: 'P4', committeeId: 'K1', hallId: 'H1', date: '2026-10-02', start: '11:00' },
  ],
};
const people = new Map<string, ReminderParticipant>([
  ['P1', { id: 'P1', status: 'approved', email: 'p1@example.com', phone: '+96550000001', fullNameArabic: 'أحمد' }],
  ['P2', { id: 'P2', status: 'approved', email: 'p2@example.com', preferredLanguage: 'en', fullName: 'Sara' }],
  ['P3', { id: 'P3', status: 'approved', email: 'p3@example.com' }],
  ['P4', { id: 'P4', status: 'withdrawn', email: 'p4@example.com' }],
]);
/* 2026-10-01 10:00 in Kuwait (UTC+3). */
const at = Date.parse('2026-10-01T07:00:00Z');

test('local time follows the competition time zone, not the server', () => {
  assert.deepEqual(localNow(at, 'Asia/Kuwait'), ['2026-10-01', '10:00']);
  assert.deepEqual(localNow(Date.parse('2026-10-01T22:30:00Z'), 'Asia/Kuwait'), ['2026-10-02', '01:30'], 'after local midnight it is already the next day');
  assert.deepEqual(localNow(at, 'Not/AZone'), ['2026-10-01', '10:00'], 'an invalid zone falls back safely');
});

test('slot notice for every upcoming slot; check-in reminder only the day before; nothing for past or withdrawn', () => {
  const out = planParticipantReminders({ competition, plan, participants: people, at });
  const keys = out.map(r => `${r.trigger}:${r.participantId}`).sort();
  assert.deepEqual(keys, ['checkin_reminder:P1', 'schedule_assigned:P1', 'schedule_assigned:P2']);
  const p1 = out.find(r => r.trigger === 'checkin_reminder')!;
  assert.equal(p1.vars.place, 'Main Hall — Hall A');
  assert.equal(p1.vars.competition, 'جائزة القرآن');
  assert.deepEqual(p1.recipients.map(r => r.channel), ['email'], 'SMS is not used unless a provider is configured');
  assert.equal(out.find(r => r.participantId === 'P2')!.recipients[0].locale, 'en');
  const withSms = planParticipantReminders({ competition, plan, participants: people, at, channels: { sms: true } });
  assert.ok(withSms.find(r => r.participantId === 'P1')!.recipients.some(r => r.channel === 'sms' && r.address === '+96550000001'));
  assert.deepEqual(planParticipantReminders({ competition, plan: { ...plan, status: 'draft' }, participants: people, at }), [], 'a draft schedule is never announced');
  assert.deepEqual(planParticipantReminders({ competition: { ...competition, status: 'completed' }, plan, participants: people, at }), []);
});

test('re-running the cycle sends nothing twice; a changed slot is announced again', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-rem-'));
  try {
    const comms = new CommunicationsService(path.join(dir, 'outbox.json'), [], () => at);
    let current = plan;
    const source = { competitions: async () => [competition], publishedPlan: async () => current, participant: async (_c: unknown, id: string) => people.get(id) || null };
    const enqueue = (r: any) => comms.enqueue(r.trigger, r.subjectKey, r.recipients, r.vars);
    await runParticipantReminders(source, enqueue, at);
    const first = comms.list().length;
    assert.equal(first, 3);
    await runParticipantReminders(source, enqueue, at);
    assert.equal(comms.list().length, first, 'the same slot is never re-sent');
    current = { ...plan, slots: plan.slots.map(s => s.participantId === 'P2' ? { ...s, start: '12:00' } : s) };
    await runParticipantReminders(source, enqueue, at);
    assert.equal(comms.list().length, first + 1, 'a moved slot is announced once more');
    const msg = comms.list().find(m => m.to.startsWith('p1') && m.trigger === 'checkin_reminder')!;
    assert.match(msg.body, /2026-10-02/);
    assert.match(msg.body, /09:00/);
    assert.equal(msg.status, 'provider_not_configured', 'without an email provider the outbox says so honestly');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
