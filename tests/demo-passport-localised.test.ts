import test from 'node:test';
import assert from 'node:assert/strict';
import { demoPassports } from '../src/data/demo-extras';

test('demo participant passport rows carry Arabic competition and category names', () => {
  const participants = [{ id: 'p1', code: 'A-1', status: 'certified' }] as never;
  const results = [{ id: 'r1', participantId: 'p1', rank: 1, finalScore: 97, categoryName: 'Full Quran', categoryNameArabic: 'حفظ القرآن كاملًا' }] as never;
  const certificates = [{ participantId: 'p1', certificateNumber: 'MZN-TEST-1' }] as never;
  const { participantPassport } = demoPassports('comp-x', participants, results, certificates, [], []);
  assert.ok(participantPassport.length >= 2);
  for (const row of participantPassport) {
    assert.match(row.competitionNameArabic || '', /[؀-ۿ]/);
    assert.match(row.categoryNameArabic || '', /[؀-ۿ]/);
  }
});
