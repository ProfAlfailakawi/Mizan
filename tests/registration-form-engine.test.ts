/*
 * §63–§65 — منشئ نموذج التسجيل: أنواع الحقول، الشروط التصريحية، التحقق الخادمي، التعديل قبل الإغلاق.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_COMPETITION } from '../src/data/seed-data';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import { PublicRegistrationService, type PublicRegistrationInput, type PublicRegistrationStore } from '../server/public-registration';
import { isFieldVisible, isFieldRequired, persistableCustomAnswers, validateAnswers, validateFormSchema } from '../src/lib/registration-form';
import type { Competition, RegistrationFieldDefinition } from '../src/types';

const now = new Date('2026-09-09T08:00:00Z');
const guardianPhone: RegistrationFieldDefinition = { id: 'guardianPhone', labelArabic: 'هاتف ولي الأمر', labelEnglish: 'Guardian phone', type: 'phone', required: true, visible: true, custom: true, visibleWhen: [{ field: 'age', operator: 'lt', value: 12 }] };
const localId: RegistrationFieldDefinition = { id: 'civilId', labelArabic: 'الرقم المدني', labelEnglish: 'Civil ID', type: 'text', required: false, visible: true, custom: true, pattern: '[0-9]{12}', visibleWhen: [{ field: 'mode', operator: 'eq', value: 'in_person' }], requiredWhen: [{ field: 'mode', operator: 'eq', value: 'in_person' }] };
const mode: RegistrationFieldDefinition = { id: 'mode', labelArabic: 'نوع المشاركة', labelEnglish: 'Participation', type: 'select', required: true, visible: true, custom: true, options: [{ value: 'online', labelArabic: 'عن بعد', labelEnglish: 'Online' }, { value: 'in_person', labelArabic: 'حضوري', labelEnglish: 'In person' }] };
const arrival: RegistrationFieldDefinition = { id: 'arrivalCity', labelArabic: 'مدينة الوصول', labelEnglish: 'Arrival city', type: 'text', required: true, visible: true, custom: true, visibleWhen: [{ field: 'mode', operator: 'neq', value: 'online' }] };
const juz: RegistrationFieldDefinition = { id: 'juz', labelArabic: 'عدد الأجزاء', labelEnglish: 'Juz memorized', type: 'number', required: true, visible: true, custom: true, min: 1, max: 30 };
const langs: RegistrationFieldDefinition = { id: 'langs', labelArabic: 'اللغات', labelEnglish: 'Languages', type: 'multi_select', required: false, visible: true, custom: true, options: [{ value: 'ar', labelArabic: 'عربية', labelEnglish: 'Arabic' }, { value: 'en', labelArabic: 'إنجليزية', labelEnglish: 'English' }] };
const fields = [mode, guardianPhone, localId, arrival, juz, langs];

test('§64 age < 12 reveals guardian fields; online hides arrival fields', () => {
  const child = { dateOfBirth: '2018-05-01', mode: 'online' };
  const adult = { dateOfBirth: '2000-05-01', mode: 'online' };
  assert.equal(isFieldVisible(guardianPhone, child, now), true);
  assert.equal(isFieldVisible(guardianPhone, adult, now), false);
  assert.equal(isFieldVisible(arrival, child, now), false);
  assert.equal(isFieldVisible(arrival, { ...child, mode: 'in_person' }, now), true);
  assert.equal(isFieldRequired(localId, { mode: 'in_person' }, now), true);
  assert.equal(isFieldRequired(localId, { mode: 'online' }, now), false);
});

test('validation covers types, ranges, options and patterns — and ignores hidden fields', () => {
  const errors = validateAnswers(fields, { dateOfBirth: '2000-05-01', mode: 'in_person', civilId: '12', juz: 40, langs: ['ar', 'fr'] }, now);
  const byField = Object.fromEntries(errors.map(e => [e.fieldId, e.code]));
  assert.deepEqual(byField, { civilId: 'PATTERN', arrivalCity: 'REQUIRED', juz: 'OUT_OF_RANGE', langs: 'INVALID_OPTION' });
  assert.deepEqual(validateAnswers(fields, { dateOfBirth: '2000-05-01', mode: 'online', juz: 30 }, now), []);
});

test('answers from a hidden branch are never persisted', () => {
  const kept = persistableCustomAnswers(fields, { dateOfBirth: '2000-05-01', mode: 'online', guardianPhone: '+96555555555', arrivalCity: 'Kuwait', juz: 5, injected: 'x' }, now);
  assert.deepEqual(kept, { mode: 'online', juz: 5 });
});

test('the builder rejects broken schemas', () => {
  assert.deepEqual(validateFormSchema(fields), []);
  const broken = validateFormSchema([{ ...mode, options: [] }, { ...juz, id: 'juz', visibleWhen: [{ field: 'ghost', operator: 'exists' }] }, { ...langs, id: 'juz' }]);
  assert.ok(broken.includes('FIELD_OPTIONS_REQUIRED:mode'));
  assert.ok(broken.includes('CONDITION_UNKNOWN_FIELD:juz->ghost'));
  assert.ok(broken.includes('FIELD_ID_DUPLICATE:juz'));
});

/* ——— server ——— */
const LEGAL_ENV: Record<string, string> = { MIZAN_LEGAL_ENTITY_NAME: 'Mizan', MIZAN_LEGAL_TERMS_URL: 'https://example.invalid/t', MIZAN_LEGAL_TERMS_VERSION: '1', MIZAN_LEGAL_TERMS_EFFECTIVE: '2026-09-01', MIZAN_LEGAL_PRIVACY_URL: 'https://example.invalid/p', MIZAN_LEGAL_PRIVACY_VERSION: '1', MIZAN_LEGAL_PRIVACY_EFFECTIVE: '2026-09-01' };
const competitionWith = (extra: RegistrationFieldDefinition[], over: Partial<Competition> = {}): Competition => {
  const c: Competition = { ...structuredClone(SEED_COMPETITION), status: 'registration_open', registrationStartDate: '2026-01-01', registrationEndDate: '2026-12-31', ...over };
  const policy = getCompetitionPolicy(c);
  policy.registration.fields = [...policy.registration.fields, ...extra];
  policy.registration.requireIdentityVerification = false;
  policy.registration.fee = { amountMinor: 1500, currency: 'KWD', refundable: false };
  c.policy = policy;
  return c;
};
class Store implements PublicRegistrationStore {
  docs = new Map<string, Record<string, unknown>>();
  constructor(public competition: Competition) {}
  async getCompetition(id: string) { return this.competition.id === id ? this.competition : null; }
  async create(d: { path: string; data: Record<string, unknown> }[]) { for (const x of d) this.docs.set(x.path, structuredClone(x.data)); }
  async getJourney(h: string) { return this.docs.get(`public_journeys/${h}`) || null; }
  async getDocument(p: string) { return this.docs.get(p) || null; }
  async upsert(d: { path: string; data: Record<string, unknown> }[]) { for (const x of d) this.docs.set(x.path, structuredClone(x.data)); }
}
const base = (): PublicRegistrationInput => ({ fullNameArabic: 'أحمد', fullName: 'Ahmad', email: 'a@example.com', phone: '+96555555555', country: 'Kuwait', nationality: 'Kuwaiti', nationalIdOrPassport: 'P1', dateOfBirth: '2000-01-01', gender: 'male', categoryId: SEED_COMPETITION.categories[0].id, riwaya: SEED_COMPETITION.categories[0].riwaya, consents: { terms: true, privacy: true, audioRecording: true, guardian: true, aiProcessing: false } });
const adultCategory = (c: Competition) => { c.categories[0] = { ...c.categories[0], minAge: undefined, maxAge: undefined, genderConstraint: 'all' }; return c; };

test('§63 the server enforces conditional custom fields, stores only visible answers, and records the organization fee', async () => {
  const store = new Store(adultCategory(competitionWith([mode, arrival, juz])));
  const service = new PublicRegistrationService(store, () => now, LEGAL_ENV);
  await assert.rejects(() => service.register(store.competition.id, { ...base(), customAnswers: { mode: 'in_person', juz: 3 } }, 'https://x'), /REGISTRATION_FIELD_REQUIRED:arrivalCity/);
  await assert.rejects(() => service.register(store.competition.id, { ...base(), customAnswers: { mode: 'online', juz: 99 } }, 'https://x'), /REGISTRATION_FIELD_INVALID:juz:OUT_OF_RANGE/);
  const ok = await service.register(store.competition.id, { ...base(), customAnswers: { mode: 'online', juz: 3, arrivalCity: 'hidden-branch' } }, 'https://x');
  const participant = [...store.docs.entries()].find(([p]) => p.includes('/participants/'))![1] as any;
  assert.deepEqual(participant.customAnswers, { mode: 'online', juz: 3 });
  assert.deepEqual({ ...participant.registrationPayment, updatedAt: undefined }, { status: 'pending', amountMinor: 1500, currency: 'KWD', updatedAt: undefined });
  assert.ok(ok.journeyAccessToken);
});

test('§65 a participant edits before the deadline; edits are revalidated, logged by field, and locked afterwards', async () => {
  const store = new Store(adultCategory(competitionWith([mode, juz])));
  let clock = now;
  const service = new PublicRegistrationService(store, () => clock, LEGAL_ENV);
  const reg = await service.register(store.competition.id, { ...base(), customAnswers: { mode: 'online', juz: 3 } }, 'https://x');
  await assert.rejects(() => service.editRegistration(store.competition.id, reg.journeyAccessToken, { email: 'bad' }), /REGISTRATION_EMAIL_INVALID/);
  await assert.rejects(() => service.editRegistration(store.competition.id, reg.journeyAccessToken, { customAnswers: { mode: 'online', juz: 0 } }), /OUT_OF_RANGE/);
  const edited = await service.editRegistration(store.competition.id, reg.journeyAccessToken, { phone: '+96566666666', customAnswers: { mode: 'online', juz: 10 } });
  assert.deepEqual(edited.changed.sort(), ['custom:juz', 'phone']);
  const participant = [...store.docs.entries()].find(([p]) => p.includes('/participants/'))![1] as any;
  assert.equal(participant.phone, '+96566666666');
  assert.equal(participant.editHistory[0].fields.includes('phone'), true);
  assert.ok(!JSON.stringify(participant.editHistory).includes('96566666666'), 'the log records which fields, not their values');
  await assert.rejects(() => service.editRegistration(store.competition.id, reg.guardianAccessToken, { phone: '+96577777777' }), /JOURNEY_TOKEN_INVALID/);
  clock = new Date('2027-01-02T00:00:00Z');
  await assert.rejects(() => service.editRegistration(store.competition.id, reg.journeyAccessToken, { phone: '+96577777777' }), /REGISTRATION_LOCKED/);
  store.competition.policy!.registration.editPolicy = 'never';
  clock = now;
  await assert.rejects(() => service.editRegistration(store.competition.id, reg.journeyAccessToken, { phone: '+96577777777' }), /REGISTRATION_EDIT_NOT_ALLOWED/);
});
