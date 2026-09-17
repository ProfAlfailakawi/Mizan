import test from 'node:test';
import assert from 'node:assert/strict';

import { SEED_COMPETITION } from '../src/data/seed-data';
import type { ResultRecord } from '../src/types';
import {
  REPORTABLE_RESULT_STATUSES,
  buildCategoryResultsReport,
  buildParticipantResultsReport,
  categoryResultsCsv,
  participantResultsCsv,
  resultsFileName,
} from '../src/lib/results-report';

const result = (over: Partial<ResultRecord>): ResultRecord => ({
  id: over.id || 'res-1',
  competitionId: SEED_COMPETITION.id,
  participantId: over.participantId || 'p-1',
  participantCode: over.participantCode || 'A-101',
  participantName: over.participantName || 'Yusuf',
  participantNameArabic: over.participantNameArabic || 'يوسف',
  country: over.country ?? 'الكويت',
  categoryId: over.categoryId || 'cat-full-quran',
  categoryName: over.categoryName || 'Full Quran',
  categoryNameArabic: over.categoryNameArabic || 'القرآن كاملًا',
  finalScore: over.finalScore ?? 90,
  rank: over.rank ?? 1,
  status: over.status || 'sealed',
  ...over,
} as ResultRecord);

const competition = SEED_COMPETITION;

test('only approved, sealed or published results reach an official report', () => {
  assert.deepEqual([...REPORTABLE_RESULT_STATUSES], ['approved', 'sealed', 'published']);
  const results = [
    result({ id: 'r1', participantCode: 'A-101', status: 'calculated' }),
    result({ id: 'r2', participantCode: 'A-102', status: 'quality_checked' }),
    result({ id: 'r3', participantCode: 'A-103', status: 'approved' }),
    result({ id: 'r4', participantCode: 'A-104', status: 'sealed', rank: 2 }),
    result({ id: 'r5', participantCode: 'A-105', status: 'published', rank: 3 }),
  ];
  const rows = buildParticipantResultsReport({ competition, results });
  assert.deepEqual(rows.map(r => r.participantCode), ['A-103', 'A-104', 'A-105']);
});

test('a result from another competition is never in this competition report', () => {
  const rows = buildParticipantResultsReport({
    competition,
    results: [result({ id: 'r1' }), result({ id: 'r2', competitionId: 'comp-other', participantCode: 'X-900' })],
  });
  assert.deepEqual(rows.map(r => r.participantCode), ['A-101']);
});

test('the order is deterministic, so two printings of one sheet read the same', () => {
  const tied = [
    result({ id: 'r1', participantCode: 'A-300', rank: 2, finalScore: 88 }),
    result({ id: 'r2', participantCode: 'A-100', rank: 2, finalScore: 88 }),
    result({ id: 'r3', participantCode: 'A-200', rank: 1, finalScore: 95 }),
  ];
  const once = buildParticipantResultsReport({ competition, results: tied }).map(r => r.participantCode);
  const again = buildParticipantResultsReport({ competition, results: [...tied].reverse() }).map(r => r.participantCode);
  assert.deepEqual(once, ['A-200', 'A-100', 'A-300']);
  assert.deepEqual(again, once, 'input order must not change the printed order');
});

test('the category sheet aggregates from the same rows and names its first place', () => {
  const results = [
    result({ id: 'r1', categoryId: 'cat-full-quran', participantCode: 'A-101', rank: 1, finalScore: 95 }),
    result({ id: 'r2', categoryId: 'cat-full-quran', participantCode: 'A-102', rank: 2, finalScore: 85, status: 'published' }),
    result({ id: 'r3', categoryId: 'cat-20-juz', categoryNameArabic: 'عشرون جزءًا', participantCode: 'B-201', rank: 1, finalScore: 70 }),
  ];
  const rows = buildCategoryResultsReport({ competition, results });
  assert.equal(rows.length, 2);
  const full = rows.find(r => r.categoryName === 'القرآن كاملًا')!;
  assert.equal(full.participants, 2);
  assert.equal(full.highestScore, 95);
  assert.equal(full.lowestScore, 85);
  assert.equal(full.averageScore, 90);
  assert.match(full.firstPlace, /^A-101 — /);
  assert.equal(full.sealed, 1);
  assert.equal(full.published, 1);
});

/*
 * الملف يُفتح في Excel على ويندوز أمام موظفين عرب. بلا BOM تُقرأ العربية رموزًا، وباسمٍ
 * يحمل فاصلةً أو اقتباسًا ينكسر الصفّ — وكلاهما يحدث في أسماء حقيقية.
 */
test('the CSV survives Excel, Arabic, and a name with a comma or a quote in it', () => {
  const csv = participantResultsCsv({
    competition,
    results: [result({ participantNameArabic: 'يوسف "أبو محمد"، المطيري', country: 'الكويت' })],
  });
  assert.ok(csv.startsWith('﻿'), 'a BOM so Excel reads Arabic');
  assert.ok(csv.includes('"المرتبة"') && csv.includes('"اسم المتسابق"'), 'Arabic headers for an Arabic sheet');
  assert.ok(csv.includes('"يوسف ""أبو محمد""، المطيري"'), 'quotes doubled, comma kept inside the cell');
  // عددُ الأسطر = عنوانٌ + صفّ، فلا يكسر الاسمُ الصفَّ إلى سطرين.
  assert.equal(csv.trimEnd().split('\r\n').length, 2);
});

test('the English sheet uses machine headers and the Latin name', () => {
  const csv = participantResultsCsv({ competition, results: [result({})] }, { arabic: false });
  assert.ok(csv.includes('"participant_code"'));
  assert.ok(csv.includes('"Yusuf"'));
  assert.ok(!csv.includes('"المرتبة"'));
});

test('a category filter narrows both sheets to that category alone', () => {
  const results = [
    result({ id: 'r1', categoryId: 'cat-full-quran', participantCode: 'A-101' }),
    result({ id: 'r2', categoryId: 'cat-20-juz', participantCode: 'B-201' }),
  ];
  assert.deepEqual(
    buildParticipantResultsReport({ competition, results }, { categoryId: 'cat-20-juz' }).map(r => r.participantCode),
    ['B-201'],
  );
  assert.equal(buildCategoryResultsReport({ competition, results }, { categoryId: 'cat-20-juz' }).length, 1);
});

test('an empty report is a header row, not a crash and not a fake zero', () => {
  const csv = participantResultsCsv({ competition, results: [] });
  assert.equal(csv.trimEnd().split('\r\n').length, 1);
  assert.deepEqual(buildCategoryResultsReport({ competition, results: [] }), []);
  assert.deepEqual(categoryResultsCsv({ competition, results: [] }).trimEnd().split('\r\n').length, 1);
});

test('the file name is filesystem-safe and still says what it holds', () => {
  const name = resultsFileName({ ...competition, id: 'comp/dubai 2027' }, 'participants');
  assert.match(name, /^نتائج-المتسابقين-comp-dubai-2027-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.match(resultsFileName(competition, 'categories', false), /^mizan-categories-results-/);
});

test('the seal assurance is carried through rather than flattened to "sealed"', () => {
  const rows = buildParticipantResultsReport({
    competition,
    results: [
      result({ id: 'r1', participantCode: 'A-101', sealMetadata: { sealedBy: 'x', sealedAt: '', cryptographicChecksum: '', assurance: 'SERVER_SIGNED' } as never }),
      result({ id: 'r2', participantCode: 'A-102', rank: 2, sealMetadata: { sealedBy: 'x', sealedAt: '', cryptographicChecksum: '', assurance: 'SERVER_DIGEST' } as never }),
      result({ id: 'r3', participantCode: 'A-103', rank: 3 }),
    ],
  });
  assert.deepEqual(rows.map(r => r.sealAssurance), ['SERVER_SIGNED', 'SERVER_DIGEST', '']);
});
