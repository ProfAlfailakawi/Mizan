import test from 'node:test';
import assert from 'node:assert/strict';

import { SEED_CATEGORIES, SEED_COMPETITION } from '../src/data/seed-data';
import type { Participant } from '../src/types';
import {
  PARTICIPANT_IMPORT_REQUIRED_COLUMNS,
  nextParticipantCodes,
  parseCsvLine,
  planParticipantImport,
} from '../src/lib/participant-import';

/*
 * خمسمئة صفٍّ في ملفٍ واحد هي المسابقة كلّها. وما لا يُكشف هنا يُكشف يوم المسابقة،
 * متسابقًا متسابقًا أمام لجنته — وهذا أسوأ موضعٍ لاكتشافه.
 */

const competition = { id: SEED_COMPETITION.id, categories: SEED_CATEGORIES };
const HEAD = 'fullName,email,dateOfBirth,categoryId,riwaya,gender,identity';
const row = (over: Partial<Record<string, string>> = {}) => {
  const r = { fullName: 'يوسف', email: 'y@example.com', dateOfBirth: '2005-04-11', categoryId: 'cat-full-quran', riwaya: 'حفص عن عاصم', gender: 'male', identity: '', ...over };
  return `${r.fullName},${r.email},${r.dateOfBirth},${r.categoryId},${r.riwaya},${r.gender},${r.identity}`;
};
const plan = (body: string[], existing: Participant[] = []) =>
  planParticipantImport({ csv: [HEAD, ...body].join('\n'), competition, existingParticipants: existing as never });

const codesOf = (p: ReturnType<typeof plan>) => p.errors.map(e => e.code);

test('a clean file imports, and a single-reading category is inherited when the row is silent', () => {
  // الفئة الثانية روايةٌ واحدة (حفص عن عاصم)، فالصفّ الصامت يرثها.
  const single = SEED_CATEGORIES[1].id;
  const out = plan([row({ categoryId: single }), row({ email: 'b@example.com', categoryId: single, riwaya: '' })]);
  assert.deepEqual(out.errors, []);
  assert.equal(out.importable, true);
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[1].riwaya, SEED_CATEGORIES[1].riwaya, 'a silent row inherits its category reading');
});

/*
 * فئةٌ تتيح ثلاث روايات («حفص عن عاصم / ورش / قالون») ليست عطلًا: المتسابق يعلن روايته
 * منها. لكنّ صفًّا صامتًا فيها لا يرث شيئًا، فيُطلب التصريح بدل أن يُختار له راوٍ.
 */
test('a multi-reading category requires the row to declare which reading', () => {
  const multi = SEED_CATEGORIES[0].id;
  assert.ok(String(SEED_CATEGORIES[0].riwaya).includes('/'), 'the fixture really offers more than one reading');
  assert.deepEqual(codesOf(plan([row({ categoryId: multi, riwaya: '' })])), ['PARTICIPANT_IMPORT_READING_REQUIRED_FOR_CATEGORY']);
  assert.deepEqual(plan([row({ categoryId: multi, riwaya: 'ورش عن نافع' })]).errors, [], 'a declared reading is accepted');
});

test('a missing required column stops the whole file before any row is read', () => {
  const out = planParticipantImport({ csv: 'fullName,email\nيوسف,y@example.com', competition, existingParticipants: [] });
  assert.deepEqual(codesOf(out), ['PARTICIPANT_IMPORT_MISSING_COLUMNS']);
  assert.match(out.errors[0].message, /dateOfBirth/);
  assert.equal(out.importable, false);
  assert.deepEqual(out.rows, []);
  assert.deepEqual([...PARTICIPANT_IMPORT_REQUIRED_COLUMNS], ['fullName', 'email', 'dateOfBirth', 'categoryId']);
});

test('an unusable email is named with its row and its column', () => {
  const out = plan([row({ email: 'not-an-email' })]);
  assert.equal(out.errors.length, 1);
  assert.equal(out.errors[0].code, 'PARTICIPANT_IMPORT_EMAIL_INVALID');
  assert.equal(out.errors[0].row, 2, 'the row number matches what Excel shows');
  assert.equal(out.errors[0].column, 'email');
});

test('a duplicate inside the file and a duplicate against the roster are told apart', () => {
  const inFile = plan([row({ email: 'same@example.com' }), row({ email: 'SAME@example.com' })]);
  assert.deepEqual(codesOf(inFile), ['PARTICIPANT_IMPORT_EMAIL_DUPLICATE_IN_FILE']);

  const existing = [{ competitionId: SEED_COMPETITION.id, email: 'taken@example.com', nationalIdOrPassport: 'ID-9' }];
  const against = plan([row({ email: 'taken@example.com' })], existing as never);
  assert.deepEqual(codesOf(against), ['PARTICIPANT_IMPORT_EMAIL_ALREADY_REGISTERED']);

  const identity = plan([row({ identity: 'ID-9' })], existing as never);
  assert.deepEqual(codesOf(identity), ['PARTICIPANT_IMPORT_IDENTITY_ALREADY_REGISTERED']);

  const identityTwice = plan([row({ identity: 'ID-7' }), row({ email: 'b@example.com', identity: 'id-7' })]);
  assert.deepEqual(codesOf(identityTwice), ['PARTICIPANT_IMPORT_IDENTITY_DUPLICATE_IN_FILE']);

  // متسابقٌ بالبريد نفسه في مسابقةٍ أخرى ليس تكرارًا.
  const otherCompetition = [{ competitionId: 'comp-other', email: 'y@example.com', nationalIdOrPassport: '' }];
  assert.deepEqual(plan([row()], otherCompetition as never).errors, []);
});

test('an impossible date of birth is refused, with the reason it is impossible', () => {
  assert.deepEqual(codesOf(plan([row({ dateOfBirth: '11/04/2005' })])), ['PARTICIPANT_IMPORT_DATE_FORMAT']);
  assert.deepEqual(codesOf(plan([row({ dateOfBirth: '2005-02-30' })])), ['PARTICIPANT_IMPORT_DATE_INVALID']);
  assert.deepEqual(codesOf(plan([row({ dateOfBirth: '2999-01-01' })])), ['PARTICIPANT_IMPORT_DATE_IN_FUTURE']);
  assert.deepEqual(codesOf(plan([row({ dateOfBirth: '1700-01-01' })])), ['PARTICIPANT_IMPORT_DATE_IMPLAUSIBLE']);
});

test('gender is an enum, not a silent fallback to male', () => {
  assert.deepEqual(codesOf(plan([row({ gender: 'M' })])), ['PARTICIPANT_IMPORT_GENDER_INVALID']);
  assert.deepEqual(plan([row({ gender: '' })]).errors, [], 'an empty value is allowed and defaults');
  assert.deepEqual(plan([row({ gender: 'female' })]).errors, []);
});

/*
 * أخطر صفٍّ في الملف ليس الناقص — بل الكامل الذي روايتُه لا تُحلّ، أو تُحلّ إلى رواية لا
 * يكتمل جسر مواضعها. يمرّ في كل شاشة، ثم لا تبدأ له جلسة.
 */
test('an ambiguous reading is refused instead of guessed', () => {
  const out = plan([row({ riwaya: 'الدوري' })]);
  assert.deepEqual(codesOf(out), ['PARTICIPANT_IMPORT_READING_UNRESOLVED']);
  assert.equal(out.errors[0].column, 'riwaya');
  // والاسم الكامل يمرّ ويفرّق بين الدوريَّين.
  assert.deepEqual(plan([row({ riwaya: 'الدوري عن أبي عمرو' })]).errors, []);
});

test('a reading whose locus crosswalk is incomplete is refused at import, not on the day', () => {
  // روحٌ هو الباقي بلا جسرٍ مكتمل، فهو الذي يُردّ عند الاستيراد.
  const out = plan([row({ riwaya: 'روح عن يعقوب' })]);
  assert.deepEqual(codesOf(out), ['PARTICIPANT_IMPORT_READING_NOT_QUESTION_READY']);
  assert.match(out.errors[0].message, /جسر مواضع/);
});

test('a reading whose crosswalk was proved from the pinned artifact is accepted at import', () => {
  // وهشامٌ كان مردودًا قبل وصول الدليل؛ يمرّ اليوم لأن جسره اكتمل، لا لأن الشرط لان.
  assert.deepEqual(plan([row({ riwaya: 'هشام عن ابن عامر' })]).errors, []);
});

test('an unknown category is refused, and by code as well as by id', () => {
  assert.deepEqual(codesOf(plan([row({ categoryId: 'cat-does-not-exist' })])), ['PARTICIPANT_IMPORT_CATEGORY_UNKNOWN']);
  assert.deepEqual(plan([row({ categoryId: SEED_CATEGORIES[0].code })]).errors, [], 'the category code works too');
});

test('one bad row stops the whole file — no half import', () => {
  const out = plan([row(), row({ email: 'broken' }), row({ email: 'c@example.com' })]);
  assert.equal(out.importable, false, 'all or nothing');
  assert.equal(out.rows.length, 2, 'the good rows are still reported, so the operator sees the shape of the file');
  assert.equal(out.totalRows, 3);
  assert.equal(out.errors.length, 1);
});

test('an empty file says so rather than reporting a successful import of nothing', () => {
  assert.equal(planParticipantImport({ csv: '', competition, existingParticipants: [] }).importable, false);
  assert.deepEqual(codesOf(planParticipantImport({ csv: '', competition, existingParticipants: [] })), ['PARTICIPANT_IMPORT_EMPTY_FILE']);
  assert.deepEqual(codesOf(planParticipantImport({ csv: HEAD, competition, existingParticipants: [] })), ['PARTICIPANT_IMPORT_EMPTY_FILE']);
});

test('a quoted name containing a comma stays one field', () => {
  assert.deepEqual(parseCsvLine('"المطيري، يوسف",y@example.com'), ['المطيري، يوسف', 'y@example.com']);
  assert.deepEqual(parseCsvLine('a,"say ""hi""",c'), ['a', 'say "hi"', 'c']);
  const out = plan([`"المطيري، يوسف",y@example.com,2005-04-11,cat-full-quran,حفص عن عاصم,male,`]);
  assert.deepEqual(out.errors, []);
  assert.equal(out.rows[0].fullName, 'المطيري، يوسف');
});

test('participant codes never collide with codes already taken', () => {
  assert.deepEqual(nextParticipantCodes(['A-101', 'A-103'], 3), ['A-102', 'A-104', 'A-105']);
  assert.deepEqual(nextParticipantCodes([], 2), ['A-101', 'A-102']);
  assert.deepEqual(nextParticipantCodes(['a-101'], 1), ['A-102'], 'case does not create a duplicate');
  assert.equal(new Set(nextParticipantCodes(['A-101'], 50)).size, 50);
});
