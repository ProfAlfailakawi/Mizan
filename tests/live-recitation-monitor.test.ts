import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { liveRecitationRows, sessionStartedAt } from '../src/lib/live-recitation';
import { LiveRecitationMonitor } from '../src/components/operations/LiveRecitationMonitor';
import type { Committee, Participant } from '../src/types';

/*
 * «التلاوة الجارية» تعرض ما تعرفه الحالةُ، ولا تخترع نبضًا.
 *
 * اللوحةُ التي طلبها المالك كانت في موقع التعريف بأرقامٍ مكتوبةٍ في الشيفرة. وهذا
 * الملفّ يحرس أن بديلها مقيس: لا صفَّ بلا جلسةٍ حقيقية، ولا اسمَ متسابقٍ على وجه
 * الشاشة، ولا رقمًا لم يُعلن.
 */

const now = Date.parse('2026-09-20T14:00:00Z');

const participant = (id: string, code: string, over: Partial<Participant> = {}): Participant => ({
  id, code, competitionId: 'c1', organizationId: 'o1', fullName: 'Full Name', fullNameArabic: 'الاسم الكامل',
  email: '', phone: '', country: '', nationality: '', nationalIdOrPassport: '', dateOfBirth: '2005-01-01',
  gender: 'male', categoryId: 'cat', riwaya: 'Hafs', institution: '', specialNeeds: false, documents: [],
  status: 'in_session',
  statusHistory: [{ status: 'in_session', timestamp: '2026-09-20T13:55:30Z', actor: 'Judging session' }],
  ...over,
} as Participant);

const committee = (id: string, over: Partial<Committee> = {}): Committee => ({
  id, competitionId: 'c1', name: `Panel ${id}`, nameArabic: `لجنة ${id}`,
  status: 'testing', judgeIds: [], audioInputOk: true, currentParticipantId: `p-${id}`,
  ...over,
} as Committee);

test('لا يظهر إلا ما تختبره لجنةٌ فعلًا — والأطولُ جلسةً أوّلًا', () => {
  const rows = liveRecitationRows(
    [
      committee('a'),
      committee('b', { currentParticipantId: 'p-b' }),
      committee('c', { status: 'ready', currentParticipantId: 'p-c' }),
      /* حالةٌ عالقة: «تختبر» بلا متسابق — لا تُزيَّن بصفٍّ فارغ. */
      committee('d', { currentParticipantId: undefined }),
    ],
    [
      participant('p-a', 'A-1001'),
      participant('p-b', 'A-1002', { statusHistory: [{ status: 'in_session', timestamp: '2026-09-20T13:59:00Z', actor: 'x' }] }),
      participant('p-c', 'A-1003'),
    ],
    now,
  );
  assert.deepEqual(rows.map(r => r.participantCode), ['A-1001', 'A-1002']);
  assert.equal(rows[0].elapsedSeconds, 270);
  assert.equal(rows[1].elapsedSeconds, 60);
});

test('متسابقٌ خرج من الجلسة لا يبقى معروضًا ولو بقيت اللجنة موسومة', () => {
  const rows = liveRecitationRows([committee('a')], [participant('p-a', 'A-1001', { status: 'tested' })], now);
  assert.deepEqual(rows, []);
});

test('وقتُ دخولٍ مجهولٌ أو ساعةٌ غيرُ متّسقة لا يُنتجان رقمًا', () => {
  const noHistory = liveRecitationRows([committee('a')], [participant('p-a', 'A-1001', { statusHistory: [] })], now);
  assert.equal(noHistory[0].elapsedSeconds, undefined);
  const future = liveRecitationRows([committee('a')], [participant('p-a', 'A-1001', { statusHistory: [{ status: 'in_session', timestamp: '2026-09-20T15:00:00Z', actor: 'x' }] })], now);
  assert.equal(future[0].elapsedSeconds, undefined);
  /* وآخرُ دخولٍ هو المعتمد، لا أوّلُه: من عاد إلى جلسته يُحسب من عودته. */
  const resumed = participant('p-a', 'A-1001', { statusHistory: [
    { status: 'in_session', timestamp: '2026-09-20T10:00:00Z', actor: 'x' },
    { status: 'in_queue', timestamp: '2026-09-20T10:05:00Z', actor: 'x' },
    { status: 'in_session', timestamp: '2026-09-20T13:58:00Z', actor: 'x' },
  ] } as Partial<Participant>);
  assert.equal(sessionStartedAt(resumed), '2026-09-20T13:58:00Z');
});

/*
 * النصُّ المرئيّ وحده يُفحص، لا الوسمُ الخام.
 *
 * أوّلُ صياغةٍ لهذا الاختبار بحثت عن «٩٨» في الوسم كلِّه فسقطت — والرقمُ كان داخل
 * إحداثيّات مسار أيقونة (`<path d="…">`)، لا درجةً معروضة. فالفحصُ على ما تقرؤه العين:
 * تُنزع الأيقوناتُ ثم الوسوم، ويُقرأ ما بقي.
 */
const visibleText = (markup: string) =>
  markup.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('الوجهُ يعرض الكودَ ولا يعرض اسمًا ولا درجة', () => {
  const html = renderToStaticMarkup(React.createElement(LiveRecitationMonitor, {
    ar: true,
    committees: [committee('a')],
    participants: [participant('p-a', 'A-1001')],
    now,
  }));
  const text = visibleText(html);
  assert.ok(text.includes('A-1001'), 'الكود لم يظهر');
  assert.ok(text.includes('لجنة a'), 'اسمُ اللجنة لم يظهر');
  assert.equal(text.includes('الاسم الكامل'), false, 'ظهر اسمُ المتسابق على وجه التشغيل');
  assert.equal(text.includes('Full Name'), false, 'ظهر اسمُ المتسابق بالإنجليزية');
  for (const word of ['درجة', 'وفاق', '%', '٪']) {
    assert.equal(text.includes(word), false, `ظهر «${word}» ولم يُعلن`);
  }
  /* ولا رقمَ عائمًا سوى الزمن والكود والعدّ: ٤:٣٠ (٢٧٠ ثانية) و١ لجنة. */
  assert.match(html, /data-live-count="1"/);
  assert.match(html, /data-elapsed="270"/);
  assert.ok(text.includes('4:30'), `الزمن لم يُعرض — ${text}`);
});

test('بلا جلسةٍ جارية تُقال الحقيقة، ولا يُعرض نبضٌ لا وجود له', () => {
  const html = renderToStaticMarkup(React.createElement(LiveRecitationMonitor, {
    ar: true, committees: [committee('a', { status: 'ready' })], participants: [participant('p-a', 'A-1001')], now,
  }));
  assert.match(html, /data-live-count="0"/);
  assert.ok(html.includes('لا لجنةَ تختبر الآن'));
  assert.equal(/animate-ping/.test(html), false, 'نبضٌ يُعرض بلا جلسة');
});
