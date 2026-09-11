import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_COMPETITION } from '../src/lib/seed-data';
import { PublicRegistrationService, type PublicRegistrationInput, type PublicRegistrationStore } from '../server/public-registration';
import type { Competition } from '../src/types';
import { fullQuranScope, scopeAyahCount, scopeFromJuz, scopeSignature } from '../src/lib/quran-scope';

/*
 * التسجيل العامّ مفتوح لمن لا حساب له.
 *
 * فما تتحقق منه الواجهة تحسينٌ للتجربة وحده، وما يتحقق منه الخادم هو القانون. وقد قلتُ من
 * قبل إن هذا المسار «مسدودٌ بالبيئة» لأنه يحتاج اعتمادًا سحابيًا — وكان قولًا خاطئًا:
 * الخدمة تأخذ مخزنها حقنًا، والمسدود هو مُهايئ Firestore وحده. فما يلي مُختبَرٌ كاملًا.
 */

const QUARTER = SEED_COMPETITION.categories.find(c => c.scopeMode === 'participant_selected')!;
const FIXED = SEED_COMPETITION.categories.find(c => c.scopeMode !== 'participant_selected')!;

const openCompetition = (): Competition => ({
  ...structuredClone(SEED_COMPETITION), status: 'registration_open',
  registrationStartDate: '2026-01-01', registrationEndDate: '2027-12-31',
});

class MemoryStore implements PublicRegistrationStore {
  documents = new Map<string, Record<string, unknown>>();
  constructor(public competition: Competition | null = openCompetition()) {}
  async getCompetition(id: string) { return this.competition?.id === id ? this.competition : null; }
  async create(documents: { path: string; data: Record<string, unknown> }[]) {
    for (const d of documents) if (this.documents.has(d.path)) throw new Error('FIRESTORE_CONFLICT');
    for (const d of documents) this.documents.set(d.path, structuredClone(d.data));
  }
  async getJourney(hash: string) { return this.documents.get(`public_journeys/${hash}`) || null; }
}

const baseInput = (categoryId: string): PublicRegistrationInput => ({
  fullNameArabic: 'أحمد محمد', fullName: 'Ahmad Mohammed', email: 'ahmad@example.com',
  phone: '+96555555555', country: 'Kuwait (الكويت)', nationality: 'كويتي',
  nationalIdOrPassport: 'P123456', dateOfBirth: '2005-01-01', gender: 'male',
  /* الرواية تُؤخذ من الفئة المقصودة نفسها؛ روايةٌ من فئة أخرى تُرفض قبل أن يُنظر في النطاق. */
  categoryId, riwaya: SEED_COMPETITION.categories.find(c => c.id === categoryId)!.riwaya, guardianName: 'محمد أحمد',
  consents: { terms: true, privacy: true, guardian: true, audioRecording: true, aiProcessing: true },
});

const service = (store = new MemoryStore()) => ({ store, api: new PublicRegistrationService(store, () => new Date('2026-09-09T08:00:00Z')) });
const scopeDocs = (store: MemoryStore) => [...store.documents.entries()].filter(([path]) => path.includes('/participant_scopes/'));

test('a participant-selected category refuses a registration that carries no range at all', async () => {
  const { api } = service();
  await assert.rejects(() => api.register(SEED_COMPETITION.id, baseInput(QUARTER.id), 'https://mizan.example'), /REGISTRATION_SCOPE_REQUIRED/);
});

test('a malformed or empty range is refused before it can enter the system', async () => {
  const { api } = service();
  await assert.rejects(
    () => api.register(SEED_COMPETITION.id, { ...baseInput(QUARTER.id), memorizationScope: { version: 1, segments: [], assurance: 'CANONICAL_TABLE' } } as PublicRegistrationInput, 'https://mizan.example'),
    /REGISTRATION_SCOPE_REQUIRED/);
  await assert.rejects(
    () => api.register(SEED_COMPETITION.id, { ...baseInput(QUARTER.id), memorizationScope: { version: 1, assurance: 'CANONICAL_TABLE', segments: [{ start: { surah: 999, ayah: 1 }, end: { surah: 999, ayah: 2 } }] } } as unknown as PublicRegistrationInput, 'https://mizan.example'),
    /REGISTRATION_SCOPE_INVALID/);
});

test('a range that breaks the category rule is refused by the server, and the broken rule is named', async () => {
  const { api } = service();
  /* اللائحة تشترط ثمانية أجزاء بالضبط؛ ثلاثةٌ لا تمرّ ولو قبلتها الواجهة. */
  await assert.rejects(
    () => api.register(SEED_COMPETITION.id, { ...baseInput(QUARTER.id), memorizationScope: scopeFromJuz([1, 2, 3]) } as PublicRegistrationInput, 'https://mizan.example'),
    /REGISTRATION_SCOPE_RULE_VIOLATION:/);
});

test('a valid range is written as a submitted scope record, awaiting the committee — never auto-approved', async () => {
  const { store, api } = service();
  const chosen = scopeFromJuz([1, 2, 3, 4, 5, 6, 7, 8]);
  const result = await api.register(SEED_COMPETITION.id, { ...baseInput(QUARTER.id), memorizationScope: chosen } as PublicRegistrationInput, 'https://mizan.example');

  const docs = scopeDocs(store);
  assert.equal(docs.length, 1, 'exactly one scope record is written');
  const [path, record] = docs[0];
  assert.match(path, new RegExp(`^organizations/${SEED_COMPETITION.organizationId}/competitions/${SEED_COMPETITION.id}/participant_scopes/`),
    'the record lives inside its own organization and competition path');
  assert.equal(record.participantId, result.participant.id);
  assert.equal(record.version, 1);
  assert.equal(record.status, 'submitted', 'a committee-approval rule must not be auto-approved at registration');
  assert.equal(record.approvedAt, undefined);
  assert.equal(record.scopeSignature, scopeSignature(chosen));
  assert.equal(record.uploaderUid, result.participant.id, 'the rules let a participant reach only their own record');
  assert.ok(record.submittedAt);
});

test('an auto-approval rule is honoured, and only then is the record approved at registration', async () => {
  const competition = openCompetition();
  competition.categories = competition.categories.map(c => c.id === QUARTER.id
    ? { ...c, selectionRule: { ...c.selectionRule!, approval: 'auto' as const } } : c);
  const { store, api } = service(new MemoryStore(competition));
  await api.register(SEED_COMPETITION.id, { ...baseInput(QUARTER.id), memorizationScope: scopeFromJuz([1, 2, 3, 4, 5, 6, 7, 8]) } as PublicRegistrationInput, 'https://mizan.example');
  const [, record] = scopeDocs(store)[0];
  assert.equal(record.status, 'approved');
  assert.equal(record.approvedBy, 'auto_policy');
  assert.ok(record.approvedAt);
});

test('a fixed-scope category writes no scope record at all, and ignores a range a client sends anyway', async () => {
  const { store, api } = service();
  await api.register(SEED_COMPETITION.id, { ...baseInput(FIXED.id), memorizationScope: fullQuranScope() } as PublicRegistrationInput, 'https://mizan.example');
  assert.equal(scopeDocs(store).length, 0, 'a category that does not let the participant choose stores no choice');
});

test('the stored range is the normalized one, so an overlapping or reversed choice is repaired before it is trusted', async () => {
  const { store, api } = service();
  /* مقاطع متداخلة ومقلوبة: تُطبَّع قبل أن تُحفظ، فلا يدخل النظام نطاقٌ غير مطبَّع. */
  const messy = {
    version: 1 as const, assurance: 'CANONICAL_TABLE' as const,
    segments: [
      ...scopeFromJuz([1, 2, 3, 4, 5, 6, 7, 8]).segments,
      ...scopeFromJuz([3, 4]).segments,
    ],
  };
  await api.register(SEED_COMPETITION.id, { ...baseInput(QUARTER.id), memorizationScope: messy } as PublicRegistrationInput, 'https://mizan.example');
  const [, record] = scopeDocs(store)[0];
  const stored = record.scope as ReturnType<typeof scopeFromJuz>;
  assert.equal(record.scopeSignature, scopeSignature(scopeFromJuz([1, 2, 3, 4, 5, 6, 7, 8])),
    'the duplicate segments collapse into the same range');
  assert.equal(scopeAyahCount(stored), scopeAyahCount(scopeFromJuz([1, 2, 3, 4, 5, 6, 7, 8])));
});

test('a failed registration writes nothing — not the participant, not the journey, not the scope', async () => {
  const { store, api } = service();
  await assert.rejects(
    () => api.register(SEED_COMPETITION.id, { ...baseInput(QUARTER.id), memorizationScope: scopeFromJuz([1, 2]) } as PublicRegistrationInput, 'https://mizan.example'),
    /REGISTRATION_SCOPE_RULE_VIOLATION/);
  assert.equal(store.documents.size, 0, 'a refused registration leaves no half-written trail');
});
