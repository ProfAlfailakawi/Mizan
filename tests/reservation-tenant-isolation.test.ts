import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockedLocusKeys, expireReservations, reservationSummary, reserveQuestions,
} from '../src/lib/question-reservation';
import type { QuestionReservationRecord } from '../src/types';

/*
 * لمن هذا الحجز؟
 *
 * مواضع المصحف واحدةٌ عند كل الجهات: `2:255` هو `2:255` في كل مسابقة على وجه الأرض.
 * فدفترٌ يُقرأ بلا تمييزٍ يجعل حجز جهةٍ يمنع جهةً أخرى من موضعٍ لا شأن لها به — ويُسمّي
 * في رسالة التزاحم **متسابقًا من جهةٍ أخرى**، فهو منعٌ وتسريبٌ معًا.
 *
 * ولا يحتاج وقوعه بيع الموقع لجهةٍ ثانية: `selectCompetition` يبدّل المسابقة ولا يمسح
 * الدفتر، فيكفي أن ينتقل المنظّم بين مسابقتَي جهته.
 */

let counter = 0;
const newId = (prefix: string) => `${prefix}-${++counter}`;
const T0 = '2026-05-01T08:00:00.000Z';

const KW = { organizationId: 'org-kuwait', competitionId: 'comp-kw' };
const MA = { organizationId: 'org-morocco', competitionId: 'comp-ma' };

const reserve = (records: QuestionReservationRecord[], tenant: typeof KW, participantId: string, keys: string[], ttlSeconds?: number) =>
  reserveQuestions({
    records, ...tenant, items: keys.map(k => ({ locusKey: k, questionId: `q-${k}` })),
    participantId, idempotencyKey: `key-${tenant.competitionId}-${participantId}`,
    actorId: 'admin', now: T0, ttlSeconds, newId,
  });

test('حجزُ جهةٍ لا يمنع جهةً أخرى من الموضع نفسه', () => {
  const kuwait = reserve([], KW, 'p-kw-1', ['2:255']);
  assert.equal(kuwait.created.length, 1);

  const morocco = reserve(kuwait.records, MA, 'p-ma-1', ['2:255']);
  assert.equal(morocco.created.length, 1, 'مُنعت جهةٌ من موضعٍ لا شأن لغيرها به');
  assert.equal(morocco.conflicts.length, 0);

  /* ودفترُ الجهتين محفوظ كاملًا: العزل في القراءة لا في الحفظ. */
  assert.equal(morocco.records.length, 2);
});

test('ولا يتسرّب كودُ متسابقٍ من جهةٍ إلى رسالة تزاحمٍ في جهةٍ أخرى', () => {
  const kuwait = reserve([], KW, 'p-kw-secret', ['36:1']);
  const morocco = reserve(kuwait.records, MA, 'p-ma-1', ['36:1']);
  for (const conflict of morocco.conflicts) {
    assert.notEqual(conflict.heldBy, 'p-kw-secret', 'كودُ متسابقٍ من جهةٍ أخرى ظهر في بلاغ التزاحم');
  }
});

test('ومجموعةُ المحجوب تُقرأ بجهتها', () => {
  const kuwait = reserve([], KW, 'p-kw-1', ['2:255']);
  assert.equal(blockedLocusKeys(kuwait.records, T0, undefined, KW).has('2:255'), true);
  assert.equal(blockedLocusKeys(kuwait.records, T0, undefined, MA).has('2:255'), false);
  /* وبلا نطاقٍ تُقرأ كما كانت — الفحوص والمحاكاة لا تعرف جهة. */
  assert.equal(blockedLocusKeys(kuwait.records, T0).has('2:255'), true);
});

test('والكنسُ لا يمسّ حجوز جهةٍ أخرى', () => {
  const kuwait = reserve([], KW, 'p-kw-1', ['2:255'], 60);
  const both = reserve(kuwait.records, MA, 'p-ma-1', ['36:1'], 60);
  const later = new Date(new Date(T0).getTime() + 61_000).toISOString();

  const sweptKuwait = expireReservations(both.records, later, 'system', KW);
  assert.equal(sweptKuwait.changed.length, 1, 'كُنس أكثر من حجز الجهة نفسها');
  assert.equal(sweptKuwait.changed[0].competitionId, 'comp-kw');
  /* وسجلّ الجهة الأخرى باقٍ كما هو، لم يُمسّ. */
  assert.equal(sweptKuwait.records.length, 2);
  assert.equal(sweptKuwait.records.find(r => r.competitionId === 'comp-ma')!.state, 'temporarily_reserved');
});

test('والخلاصة تَعُدّ جهتها وحدها', () => {
  const kuwait = reserve([], KW, 'p-kw-1', ['2:255']);
  const both = reserve(kuwait.records, MA, 'p-ma-1', ['36:1']);
  assert.equal(reservationSummary(both.records, T0, KW).total, 1);
  assert.equal(reservationSummary(both.records, T0, MA).total, 1);
  assert.equal(reservationSummary(both.records, T0).total, 2);
});

test('ومسابقتان لجهةٍ واحدة معزولتان كذلك — وهذا ما يقع عند تبديل المسابقة', () => {
  const first = { organizationId: 'org-kuwait', competitionId: 'comp-kw-2026' };
  const second = { organizationId: 'org-kuwait', competitionId: 'comp-kw-2027' };
  const a = reserve([], first, 'p-1', ['2:255']);
  const b = reserve(a.records, second, 'p-2', ['2:255']);
  assert.equal(b.created.length, 1, 'مسابقةٌ منعت أختها في الجهة نفسها');
});
