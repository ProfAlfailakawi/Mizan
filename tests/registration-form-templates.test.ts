import test from 'node:test';
import assert from 'node:assert/strict';
import { preferredDayField, PREFERRED_DAY_FIELD_ID, PREFERRED_DAY_MAX_DAYS } from '../src/lib/registration-form-templates';
import { validateFormSchema } from '../src/lib/registration-form';

test('options are exactly the competition days, inclusive, as ISO values', () => {
  const f = preferredDayField('2026-12-10', '2026-12-12')!;
  assert.equal(f.id, PREFERRED_DAY_FIELD_ID);
  assert.deepEqual(f.options!.map(o => o.value), ['2026-12-10', '2026-12-11', '2026-12-12']);
  assert.equal(f.type, 'select');
  assert.equal(f.custom, true);
  assert.equal(f.required, false, 'a request must never block registration');
});

test('labels are real weekday names in both languages (no timezone drift)', () => {
  const f = preferredDayField('2026-12-10', '2026-12-11')!;
  assert.match(f.options![0].labelEnglish, /Thursday/);
  assert.match(f.options![0].labelEnglish, /10/);
  assert.match(f.options![0].labelArabic, /الخميس/);
});

test('no field when there is nothing to choose or the dates cannot be trusted', () => {
  assert.equal(preferredDayField('2026-12-10', '2026-12-10'), null, 'one day: no choice');
  assert.equal(preferredDayField('2026-12-12', '2026-12-10'), null, 'end before start');
  assert.equal(preferredDayField('', '2026-12-10'), null);
  assert.equal(preferredDayField('2026-02-30', '2026-03-05'), null, 'an impossible date is not coerced');
  assert.equal(preferredDayField('2026-01-01', '2026-03-01'), null, 'a two-month span is not a day picker');
});

test('the cap is exact: fourteen days yes, fifteen no', () => {
  assert.equal(preferredDayField('2026-12-01', '2026-12-14')!.options!.length, PREFERRED_DAY_MAX_DAYS);
  assert.equal(preferredDayField('2026-12-01', '2026-12-15'), null);
});

test('the generated field passes the same schema validation as hand-built ones', () => {
  assert.deepEqual(validateFormSchema([preferredDayField('2026-12-10', '2026-12-12')!]), []);
});
