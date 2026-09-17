import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_COMPETITION } from '../src/data/seed-data';
import { PublicRegistrationService, type PublicRegistrationInput, type PublicRegistrationStore } from '../server/public-registration';
import type { Competition } from '../src/types';
import { scopeFromJuz } from '../src/lib/quran-scope';

/*
 * النطاق قرار الفئة، لا قرار المتسابق.
 *
 * بقيت في بيانات التطوير فئات تاريخية تحمل scopeMode=participant_selected لاختبار التوافق
 * مع السجلات القديمة، لكن التسجيل العام الجديد لا يقبل memorizationScope من العميل أصلًا.
 * هذا الملف يثبت حدّ الخادم: حتى عميل قديم أو معدل لا يستطيع إنشاء نطاق ثانٍ ينافس الفئة.
 */

const LEGACY_SELECTABLE = SEED_COMPETITION.categories.find(c => c.scopeMode === 'participant_selected')!;
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
  categoryId, riwaya: SEED_COMPETITION.categories.find(c => c.id === categoryId)!.riwaya, guardianName: 'محمد أحمد',
  consents: { terms: true, privacy: true, guardian: true, audioRecording: true, aiProcessing: true },
});

const service = (store = new MemoryStore()) => ({ store, api: new PublicRegistrationService(store, () => new Date('2026-09-09T08:00:00Z')) });
const scopeDocs = (store: MemoryStore) => [...store.documents.keys()].filter(path => path.includes('/participant_scopes/'));
const participantDocs = (store: MemoryStore) => [...store.documents.entries()].filter(([path]) => path.includes('/participants/'));

test('registration needs no participant-selected range because the category is the only scope source', async () => {
  const { store, api } = service();
  const result = await api.register(SEED_COMPETITION.id, baseInput(LEGACY_SELECTABLE.id), 'https://mizan.example');
  assert.ok(result.participant.id);
  assert.equal(scopeDocs(store).length, 0, 'registration never creates a second participant scope');
});

test('a modified old client cannot inject memorizationScope into registration', async () => {
  const { store, api } = service();
  const injected = { ...baseInput(LEGACY_SELECTABLE.id), memorizationScope: scopeFromJuz([1, 2, 3]) } as PublicRegistrationInput & { memorizationScope: unknown };
  await api.register(SEED_COMPETITION.id, injected, 'https://mizan.example');
  assert.equal(scopeDocs(store).length, 0, 'unrecognized client scope is ignored rather than persisted');
  const [, participant] = participantDocs(store)[0];
  assert.equal('memorizationScope' in participant, false, 'the injected field never reaches the participant record');
});

test('the approved reading must be chosen explicitly and must match the selected category', async () => {
  const { store, api } = service();
  await assert.rejects(
    () => api.register(SEED_COMPETITION.id, { ...baseInput(FIXED.id), riwaya: '' }, 'https://mizan.example'),
    /REGISTRATION_READING_INVALID/,
  );
  await assert.rejects(
    () => api.register(SEED_COMPETITION.id, { ...baseInput(FIXED.id), riwaya: 'رواية غير معتمدة' }, 'https://mizan.example'),
    /REGISTRATION_READING_INVALID/,
  );
  assert.equal(store.documents.size, 0, 'a refused reading leaves no half-written registration');
});

test('a valid fixed-category registration stores the category reading and no participant scope', async () => {
  const { store, api } = service();
  const result = await api.register(SEED_COMPETITION.id, baseInput(FIXED.id), 'https://mizan.example');
  const participant = store.documents.get(`organizations/${SEED_COMPETITION.organizationId}/competitions/${SEED_COMPETITION.id}/participants/${result.participant.id}`)!;
  assert.equal(participant.categoryId, FIXED.id);
  assert.equal(participant.riwaya, FIXED.riwaya);
  assert.equal(scopeDocs(store).length, 0);
});

test('registration remains atomic when category validation fails', async () => {
  const { store, api } = service();
  await assert.rejects(
    () => api.register(SEED_COMPETITION.id, { ...baseInput(FIXED.id), categoryId: 'missing-category' }, 'https://mizan.example'),
    /REGISTRATION_CATEGORY_INVALID/,
  );
  assert.equal(store.documents.size, 0, 'participant, journey and consent documents are all absent after rejection');
});
