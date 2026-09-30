import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PassportStore, type CertificateCheck } from '../server/passport';

const withStore = (run: (s: PassportStore, file: string) => void) => () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mizan-pp-'));
  try { const file = path.join(dir, 'p.json'); run(new PassportStore(file), file); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};
let registry: Record<string, ReturnType<CertificateCheck>> = {};
const check: CertificateCheck = n => registry[n] || { state: 'NOT_FOUND' };
const entry = (over: Record<string, unknown> = {}) => ({ participationPath: 'organizations/O1/competitions/C1/participants/P1', participantCode: 'Q-001', competitionId: 'C1', competitionName: 'Award', year: 2026, riwaya: 'Hafs', ...over });

test('a passport is private by default, its token is never stored in clear, and nobody else can read it', withStore((s, file) => {
  registry = {};
  const { passport, token } = s.create('Ali');
  assert.equal(passport.visibility, 'private');
  assert.equal(fs.readFileSync(file, 'utf8').includes(token), false);
  assert.equal(s.publicView(passport.id, check), null, 'private passports are invisible');
  assert.throws(() => s.owner('mz_passport_' + 'x'.repeat(43)), /PASSPORT_NOT_FOUND/);
  assert.throws(() => s.owner('guess'), /PASSPORT_TOKEN_INVALID/);
}));

test('a certificate is attached only when authentic and issued to this participant in this competition', withStore(s => {
  registry = {
    GOOD: { state: 'AUTHENTIC', competitionId: 'C1', participantCode: 'Q-001', rank: 2, finalScore: 97 },
    OTHER: { state: 'AUTHENTIC', competitionId: 'C1', participantCode: 'Q-999', rank: 1 },
    GONE: { state: 'REVOKED', competitionId: 'C1', participantCode: 'Q-001' },
  };
  const { token } = s.create('Ali');
  const a = s.addEntry(token, entry({ certificateNumber: 'OTHER' }), check);
  assert.equal(a.entry.kind, 'participation', 'someone else\'s certificate is never attached');
  assert.equal(a.entry.rank, undefined);
  assert.throws(() => s.addEntry(token, entry({ certificateNumber: 'GONE' }), check), /PASSPORT_CERTIFICATE_REVOKED/);
  const b = s.addEntry(token, entry({ certificateNumber: 'GOOD' }), check);
  assert.equal(b.entry.kind, 'certificate');
  assert.equal(b.entry.rank, 2);
  assert.equal(b.passport.entries.length, 1, 're-adding upgrades the entry instead of duplicating it');
  assert.equal(JSON.stringify(b.passport).includes('participants/P1'), false, 'the participant path is never exposed');
}));

test('one participation belongs to one passport; publishing needs a name; public view re-verifies live', withStore(s => {
  registry = { GOOD: { state: 'AUTHENTIC', competitionId: 'C1', participantCode: 'Q-001', rank: 1 } };
  const one = s.create('');
  const two = s.create('Other');
  s.addEntry(one.token, entry({ certificateNumber: 'GOOD' }), check);
  assert.throws(() => s.addEntry(two.token, entry(), check), /PASSPORT_ENTRY_CLAIMED_ELSEWHERE/);
  assert.throws(() => s.update(one.token, { visibility: 'public' }), /PASSPORT_DISPLAY_NAME_REQUIRED/);
  s.update(one.token, { displayName: 'Ali', languages: ['ar', 'en', 'bad lang!', 'ar'], visibility: 'public' });
  const view = s.publicView(one.passport.id, check)!;
  assert.deepEqual(view.languages, ['ar', 'en']);
  assert.equal(view.entries[0].verification, 'AUTHENTIC');
  registry.GOOD = { state: 'REVOKED', competitionId: 'C1', participantCode: 'Q-001' };
  assert.equal(s.publicView(one.passport.id, check)!.entries[0].verification, 'REVOKED', 'a later revocation shows immediately');
}));

test('the holder can remove entries and erase everything', withStore((s, file) => {
  registry = {};
  const { passport, token } = s.create('Ali');
  const { entry: e } = s.addEntry(token, entry(), check);
  assert.equal(s.removeEntry(token, e.id).entries.length, 0);
  assert.throws(() => s.removeEntry(token, e.id), /PASSPORT_ENTRY_NOT_FOUND/);
  s.erase(token);
  assert.equal(fs.readFileSync(file, 'utf8').includes(passport.id), false);
  assert.throws(() => s.owner(token), /PASSPORT_NOT_FOUND/);
}));
