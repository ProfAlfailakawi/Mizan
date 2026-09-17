import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildPreflight } from '../src/lib/readiness';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import { SEED_COMPETITION } from '../src/data/seed-data';

/*
 * نموذجُ التراخيص كان كاملًا ومُختبَرًا على الخادم — ولا ينادي أحدٌ نقاط القياس. فحدُّ
 * المتسابقين السنوي وحدُّ المسابقات النشطة لا يُبلغان أبدًا مهما جرى، وهو ترخيصٌ على ورق.
 *
 * وقاعدتان تُحرسان هنا: أن القياس يقع فعلًا في مسارات إنشاء المتسابق وفتح التسجيل،
 * وأنه لا يوقف أيًّا منها — المنعُ في بوابته لا في منتصف نموذج تسجيل.
 */

const STORE = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'store.ts'), 'utf8');
const CLIENT = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'entitlements-client.ts'), 'utf8');
const base = {
  competition: SEED_COMPETITION, policy: getCompetitionPolicy(SEED_COMPETITION),
  integrations: [], devices: [], judges: [], committees: [], quranSources: [], backups: [], isOffline: false,
} as never;

test('usage is actually recorded where participants and competitions come from', () => {
  assert.match(STORE, /void recordParticipantUsage\(\{ competitionId: globalState\.competition\.id, participantId: participant\.id \}\)\.then\(noteEntitlement\)/,
    'a single registration reports usage');
  assert.match(STORE, /void recordParticipantBatchUsage\(globalState\.competition\.id,staged\.map\(p=>p\.id\)\)\.then\(noteEntitlement\)/,
    'a bulk import reports usage for the rows it actually inserted');
  assert.match(STORE, /void recordCompetitionState\(\{ competitionId: globalState\.competition\.id, state: 'registration_open' \}\)\.then\(noteEntitlement\)/,
    'opening registration reports the competition state that the active-competition limit counts');
});

test('a meter never blocks the operation it is measuring', () => {
  // كل نداءٍ مُطلَق بلا انتظار، فلا يتأخّر تسجيلٌ على عدّاد.
  for (const call of ['recordParticipantUsage(', 'recordParticipantBatchUsage(', 'recordCompetitionState(']) {
    const at = STORE.indexOf(call);
    assert.ok(at > 0, `${call} is wired`);
    assert.equal(STORE.slice(Math.max(0, at - 5), at).includes('void'), true, `${call} is fire-and-forget`);
  }
  // والوحدة نفسها لا ترمي: كل مسار يعيد نتيجة.
  assert.ok(!/throw new Error/.test(CLIENT), 'the metering client never throws into a registration path');
  assert.match(CLIENT, /catch \{\s*\/\*[^]*?\*\/\s*return failed\('COMMERCIAL_BACKEND_UNAVAILABLE'\)/,
    'a dead network is reported as unavailable, not as a licence refusal');
});

test('a technical failure is not shown as a licence refusal, but a real limit is kept', () => {
  const note = STORE.slice(STORE.indexOf('const noteEntitlement'), STORE.indexOf('const registerParticipant'));
  assert.ok(note.includes('if (!result.limitReached) return;'), 'only a commercial limit is surfaced');
  assert.ok(note.includes("globalState.lastEntitlementIssue = result.issue || '';"), 'and it is kept for preflight to read');
  assert.ok(note.includes("if (globalState.lastEntitlementIssue) { globalState.lastEntitlementIssue = ''; notify(); }"),
    'a later success clears it rather than leaving a stale warning');
});

test('preflight tells the organiser before the day, and stays quiet when there is nothing to tell', () => {
  const clean = buildPreflight(base);
  const quiet = clean.checks.find(c => c.id === 'entitlements')!;
  assert.equal(quiet.status, 'ready');

  const limited = buildPreflight({ ...(base as object), entitlementIssue: 'ANNUAL_PARTICIPANT_LIMIT_REACHED' } as never);
  const raised = limited.checks.find(c => c.id === 'entitlements')!;
  assert.equal(raised.status, 'blocker');
  assert.match(raised.consequenceAr, /ANNUAL_PARTICIPANT_LIMIT_REACHED/);
});

test('the limit codes the server can return all have a sentence an organiser can act on', () => {
  const catalog = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'error-catalog.ts'), 'utf8');
  for (const code of ['ANNUAL_PARTICIPANT_LIMIT_REACHED', 'ACTIVE_COMPETITION_LIMIT_REACHED', 'TENANT_SUSPENDED']) {
    assert.ok(catalog.includes(`'${code}'`), `${code} is registered`);
  }
});
