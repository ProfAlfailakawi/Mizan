import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FinalReportBody } from '../src/components/admin/FinalReportBody';
import { buildFinalReport } from '../src/lib/final-report';

const competition = { id: 'c1', name: 'Test', nameArabic: 'اختبار', categories: [{ id: 'k1', name: 'Juz 30', nameArabic: 'جزء عمّ' }] } as any;
const organization = { id: 'o1', name: 'Org', nameArabic: 'جهة' } as any;
const result = { id: 'r1', competitionId: 'c1', participantId: 'p1', participantCode: 'A-1', participantName: 'P', participantNameArabic: 'سارة', categoryId: 'k1', categoryName: 'Juz 30', categoryNameArabic: 'جزء عمّ', finalScore: 95, rank: 1, status: 'published', country: 'KW' } as any;

const input = (ar: boolean) => {
  const finalReport = buildFinalReport({ competition, participants: [{ id: 'p1', competitionId: 'c1', status: 'certified' } as any], results: [result], appeals: [], incidents: [], committees: [{ competitionId: 'c1', code: 'C1', name: 'A', nameArabic: 'أ', completedCount: 1, averageSessionMinutes: 6 } as any], certificates: [], arabic: ar });
  return { competition, organization, results: [result], ar, generatedBy: 'tester', finalReport };
};

test('the final report renders in Arabic with the real numbers and no private text', () => {
  const html = renderToStaticMarkup(React.createElement(FinalReportBody, { ar: true, report: input(true).finalReport }));
  assert.match(html, /الحضور/);
  assert.match(html, /الفئات/);
  assert.match(html, /المنصّة/);
  assert.match(html, /سارة/);
  assert.match(html, /95/);
  assert.ok(!html.includes('NaN') && !html.includes('undefined'));
});

test('English render works and an absent report degrades to a message, not a crash', () => {
  const en = renderToStaticMarkup(React.createElement(FinalReportBody, { ar: false, report: input(false).finalReport }));
  assert.match(en, /Attendance/);
  assert.match(en, /Podium/);
  const none = renderToStaticMarkup(React.createElement(FinalReportBody, { ar: true, report: undefined }));
  assert.match(none, /لا بيانات/);
});
