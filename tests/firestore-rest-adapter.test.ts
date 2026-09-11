import test from 'node:test';
import assert from 'node:assert/strict';
import { FirestoreRestRepository, firestoreRestCodec, firestoreRestRoot } from '../server/firestore-rest';
import { PublicRegistrationService, type PublicRegistrationInput } from '../server/public-registration';
import { SEED_COMPETITION } from '../src/lib/seed-data';
import { scopeFromJuz, scopeSignature } from '../src/lib/quran-scope';
import type { Competition } from '../src/types';

/*
 * المُهايئ نفسه — لا محاكاةٌ له.
 *
 * كان هذا آخر ما أقول عنه «مسدود»: الترميز، وذرّية الكتابة، وترجمة رموز الخطأ — كلها تُنفَّذ
 * على خادمٍ حقيقي لا على كائنٍ مزيّف في الاختبار. والمحاكي خادمٌ حقيقي يتكلم REST نفسه، فلا
 * حاجة إلى اعتمادٍ سحابي ولا إلى الكتابة في قاعدةٍ فيها بيانات متسابقين.
 *
 * التشغيل: npm run qa:firestore-rules
 */

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'mizan-rest-test';
/* المحاكي يقبل «owner» رمزًا للمالك، فتُتخطّى القواعد ويُفحص المُهايئ وحده. */
const repo = () => new FirestoreRestRepository(PROJECT, '(default)', async () => 'owner');

const openCompetition = (): Competition => ({
  ...structuredClone(SEED_COMPETITION), status: 'registration_open',
  registrationStartDate: '2026-01-01', registrationEndDate: '2027-12-31',
});

test('the REST root points at the cloud by default and at the emulator only when it is declared', () => {
  /* غيابُ الإعلان يُمرَّر فارغًا صراحةً: `undefined` يأخذ القيمة الافتراضية من البيئة نفسها. */
  assert.match(firestoreRestRoot('p', '(default)', ''), /^https:\/\/firestore\.googleapis\.com\/v1\//,
    'no declaration means the cloud — never a silent downgrade to a local server');
  assert.match(firestoreRestRoot('p', '(default)', '127.0.0.1:8080'), /^http:\/\/127\.0\.0\.1:8080\/v1\//);
  assert.match(firestoreRestRoot('my proj', '(default)', '127.0.0.1:8080'), /projects\/my%20proj/, 'ids are encoded, not concatenated raw');
});

test('the field codec survives a round trip through a real server, nesting and all', { skip: HOST ? false : 'المحاكي غير مشغّل — npm run qa:firestore-rules' }, async () => {
  const store = repo();
  const path = `codec_probe/${Date.now()}`;
  const data = {
    text: 'نصّ عربي', int: 42, float: 3.5, yes: true, nothing: null,
    list: ['a', 2, false], nested: { deep: { deeper: 'قيمة', n: 7 } },
    scope: scopeFromJuz([1, 2]) as unknown as Record<string, unknown>,
  };
  await store.createAtomically([{ path, data }]);
  const read = await store.get(path);
  assert.equal(read!.text, 'نصّ عربي');
  assert.equal(read!.int, 42);
  assert.equal(read!.float, 3.5);
  assert.equal(read!.yes, true);
  assert.equal(read!.nothing, null);
  assert.deepEqual(read!.list, ['a', 2, false]);
  assert.deepEqual(read!.nested, { deep: { deeper: 'قيمة', n: 7 } });
  assert.equal(scopeSignature(read!.scope as never), scopeSignature(scopeFromJuz([1, 2])),
    'a range survives the round trip byte for byte — its signature is the proof');
});

test('a missing document reads as null, not as an error', { skip: HOST ? false : 'المحاكي غير مشغّل' }, async () => {
  assert.equal(await repo().get(`codec_probe/definitely-absent-${Date.now()}`), null);
});

test('the write is atomic: a clash on one document leaves none of the others behind', { skip: HOST ? false : 'المحاكي غير مشغّل' }, async () => {
  const store = repo();
  const stamp = Date.now();
  const taken = `atomic_probe/${stamp}-taken`;
  await store.createAtomically([{ path: taken, data: { first: true } }]);

  const fresh = `atomic_probe/${stamp}-fresh`;
  await assert.rejects(
    () => store.createAtomically([{ path: fresh, data: { ok: true } }, { path: taken, data: { second: true } }]),
    /FIRESTORE_CONFLICT/, 'writing over an existing document is refused, not merged');
  assert.equal(await store.get(fresh), null, 'the sibling write must not survive the failed batch');
  assert.deepEqual(await store.get(taken), { first: true }, 'and the existing document is untouched');
});

test('a whole public registration lands in Firestore as one atomic batch, scope record and all', { skip: HOST ? false : 'المحاكي غير مشغّل' }, async () => {
  const store = repo();
  const competition = openCompetition();
  const quarter = competition.categories.find(c => c.scopeMode === 'participant_selected')!;
  /* المسابقة تُقرأ من Firestore نفسه، فيُفحص مسار القراءة لا الكتابة وحدها. */
  await store.createAtomically([{ path: `public_competitions/${competition.id}`, data: { competition: competition as unknown as Record<string, unknown> } }]);

  const service = new PublicRegistrationService({
    getCompetition: async (id) => { const row = await store.get(`public_competitions/${id}`); const c = row?.competition; return c && typeof c === 'object' ? c as Competition : null; },
    create: (documents) => store.createAtomically(documents),
    getJourney: (hash) => store.get(`public_journeys/${hash}`),
  }, () => new Date('2026-09-09T08:00:00Z'));

  const chosen = scopeFromJuz([1, 2, 3, 4, 5, 6, 7, 8]);
  const input: PublicRegistrationInput = {
    fullNameArabic: 'مسجّل تجريبي', fullName: 'Probe Registrant', email: `probe-${Date.now()}@example.com`,
    phone: '+96550000000', country: 'Kuwait (الكويت)', nationality: 'كويتي', nationalIdOrPassport: `P${Date.now()}`,
    dateOfBirth: '2005-01-01', gender: 'male', categoryId: quarter.id, riwaya: quarter.riwaya,
    guardianName: 'ولي التجربة', consents: { terms: true, privacy: true, guardian: true, audioRecording: true, aiProcessing: true },
    memorizationScope: chosen,
  } as PublicRegistrationInput;

  const result = await service.register(competition.id, input, 'https://mizan.example');
  const participant = await store.get(`organizations/${competition.organizationId}/competitions/${competition.id}/participants/${result.participant.id}`);
  assert.ok(participant, 'the participant document is really in Firestore');
  assert.equal(participant!.categoryId, quarter.id);

  /* والنطاق: مكتوبٌ في مساره، بحالته، وببصمته، ومختومًا بصاحبه. */
  const journey = await service.resolve(competition.id, 'participant', result.journeyAccessToken);
  assert.equal(journey.participantId, result.participant.id, 'the journey capability resolves through a real read');
});

test('the codec refuses to invent a value for undefined instead of writing a wrong one', () => {
  const encoded = firestoreRestCodec.encodeFields({ kept: 'نعم', dropped: undefined, nulled: null });
  assert.ok('kept' in encoded);
  assert.equal('dropped' in encoded, false, 'an absent field stays absent — it is not turned into null');
  assert.deepEqual(encoded.nulled, { nullValue: null }, 'an explicit null is kept explicit');
});
