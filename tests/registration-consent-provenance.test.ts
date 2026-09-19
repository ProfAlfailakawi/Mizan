/*
 * على وثيقةِ مَن وقّع؟
 *
 * ميزان يُباع على ثلاث طبقات، وقد قرّر المالك في 19 سبتمبر 2026 أن تنزل الوثيقةُ في
 * السلسلة حين لا تنشر الطبقةُ الأدنى وثيقتَها — بشرط أن يُعرف الناشرُ الحقيقيّ.
 *
 * وشرطٌ لا يُكتب في الأثر ليس شرطًا: `version` وحدها كانت تقول «terms:1.0»، وجهتان
 * كلتاهما «١.٠» لا تُفرَّقان، فيوم النزاع لا يُعرف نصُّ أيِّ وثيقةٍ وقّع عليه المتسابق.
 * فتُكتب معها: الناشرُ وطبقتُه ورابطُ الوثيقة وتاريخ سريانها.
 *
 * وهذه الحرّاس تمشي المسار كاملًا — من السلسلة إلى الصفّ المكتوب في Firestore.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { SEED_COMPETITION } from '../src/data/seed-data';
import { PublicRegistrationService, type PublicRegistrationInput, type PublicRegistrationStore } from '../server/public-registration';
import type { LegalChainLink } from '../src/lib/legal-documents';
import type { Competition } from '../src/types';

const openCompetition = (): Competition => ({
  ...structuredClone(SEED_COMPETITION), status: 'registration_open',
  registrationStartDate: '2026-01-01', registrationEndDate: '2027-12-31',
});

const input: PublicRegistrationInput = {
  fullNameArabic: 'أحمد محمد', fullName: 'Ahmad Mohammed', email: 'ahmad@example.com', phone: '+96555555555',
  country: 'Kuwait (الكويت)', nationality: 'كويتي', nationalIdOrPassport: 'P123456', dateOfBirth: '2010-01-01',
  gender: 'male', categoryId: SEED_COMPETITION.categories[0].id, riwaya: SEED_COMPETITION.categories[0].riwaya,
  guardianName: 'محمد أحمد', consents: { terms: true, privacy: true, guardian: true, audioRecording: true, aiProcessing: true },
};

const documentsOf = (entityName: string, version: string) => ({
  entityName,
  documents: {
    terms: { version, effectiveDate: '2026-10-01', url: `https://example.invalid/${version}/terms` },
    privacy: { version, effectiveDate: '2026-10-01', url: `https://example.invalid/${version}/privacy` },
  },
});

class MemoryStore implements PublicRegistrationStore {
  documents = new Map<string, Record<string, unknown>>();
  constructor(public competition: Competition | null = openCompetition()) {}
  async getCompetition(id: string) { return this.competition?.id === id ? this.competition : null; }
  async create(rows: { path: string; data: Record<string, unknown> }[]) {
    for (const row of rows) if (this.documents.has(row.path)) throw new Error('FIRESTORE_CONFLICT');
    for (const row of rows) this.documents.set(row.path, structuredClone(row.data));
  }
  async getJourney(hash: string) { return this.documents.get(`public_journeys/${hash}`) || null; }
}

const registerWith = async (chain: LegalChainLink[]) => {
  const store = new MemoryStore();
  const service = new PublicRegistrationService(store, () => new Date('2026-09-09T08:00:00Z'), {}, () => chain);
  await service.register(SEED_COMPETITION.id, input, 'https://mizan.example');
  const consents = [...store.documents.entries()].filter(([path]) => path.includes('/consents/')).map(([, row]) => row);
  return (kind: string) => consents.find(row => row.kind === kind)!;
};

test('an organization that published its own documents is recorded as their publisher', async () => {
  const consent = await registerWith([
    { level: 'organization', config: documentsOf('جمعية أ', '2.0') },
    { level: 'operator', config: documentsOf('مشغّل', '1.0') },
    { level: 'platform', config: documentsOf('ميزان', '1.0') },
  ]);
  const terms = consent('terms');
  assert.equal(terms.publisher, 'جمعية أ');
  assert.equal(terms.publisherLevel, 'organization');
  assert.equal(terms.version, 'terms:2.0');
  assert.equal(terms.documentUrl, 'https://example.invalid/2.0/terms');
  assert.equal(terms.documentEffectiveDate, '2026-10-01');
});

test('a document inherited from the operator is recorded under the operator name, never the organization', async () => {
  const consent = await registerWith([
    { level: 'organization', config: {} },
    { level: 'operator', config: documentsOf('مشغّل', '1.0') },
    { level: 'platform', config: documentsOf('ميزان', '9.9') },
  ]);
  const privacy = consent('privacy');
  assert.equal(privacy.publisher, 'مشغّل', 'the record must name who actually published it');
  assert.equal(privacy.publisherLevel, 'operator');
  assert.equal(privacy.version, 'privacy:1.0', 'and carry that publisher version, not a lower or higher one');
});

test('consents that are not documents stay attributed to the competition policy, not to a publisher', async () => {
  const consent = await registerWith([{ level: 'platform', config: documentsOf('ميزان', '1.0') }]);
  const guardian = consent('guardian');
  assert.match(String(guardian.version), /^policy:/, 'guardian consent is a policy term, not a published document');
  assert.equal(guardian.publisher, undefined, 'and must not borrow a publisher it never had');
});

test('registration still fails closed when no level in the chain published anything', async () => {
  await assert.rejects(
    registerWith([{ level: 'organization', config: {} }, { level: 'operator', config: {} }, { level: 'platform', config: {} }]),
    /LEGAL_DOCUMENT_NOT_PUBLISHED:terms/,
  );
});
