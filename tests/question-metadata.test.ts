import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QURAN_HIZB_TOTAL, QURAN_RUB_TOTAL, hizbBounds, hizbOfLocus, juzBounds, juzOfLocus, rubBounds, rubOfLocus,
} from '../src/lib/quran-canon';
import { projectCandidatesFromScope } from '../src/lib/question-corpus';
import { scopeFromJuz, fullQuranScope } from '../src/lib/quran-scope';

/*
 * الحزب والربع يُقالان بلغة الحفّاظ، ويُعلَن أنهما مشتقان. الفرق بين «مشتق معلن» و«جدول
 * قانوني» هو الفرق بين تقريبٍ صادق ورقمٍ يُدَّعى.
 */

test('every locus resolves to a hizb inside its own juz, and to a rub inside that hizb', () => {
  for (let juz = 1; juz <= 30; juz++) {
    const bounds = juzBounds(juz);
    for (const locus of [bounds.start, bounds.end]) {
      const hizb = hizbOfLocus(locus);
      const rub = rubOfLocus(locus);
      assert.equal(juzOfLocus(locus), juz);
      assert.ok(hizb === juz * 2 - 1 || hizb === juz * 2, `hizb ${hizb} does not belong to juz ${juz}`);
      assert.ok(rub > (juz - 1) * 8 && rub <= juz * 8, `rub ${rub} does not belong to juz ${juz}`);
      assert.ok(hizb >= 1 && hizb <= QURAN_HIZB_TOTAL);
      assert.ok(rub >= 1 && rub <= QURAN_RUB_TOTAL);
    }
  }
});

test('the first locus of a juz is its first hizb and its first rub', () => {
  const start = juzBounds(7).start;
  assert.equal(hizbOfLocus(start), 13);
  assert.equal(rubOfLocus(start), 49);
  assert.deepEqual(hizbBounds(13).start, start);
  assert.deepEqual(rubBounds(49).start, start);
});

test('the last locus of a juz is its second hizb and its eighth rub', () => {
  const end = juzBounds(7).end;
  assert.equal(hizbOfLocus(end), 14);
  assert.equal(rubOfLocus(end), 56);
});

test('projected candidates carry hizb and rub alongside juz and page, without claiming certification', () => {
  const candidates = projectCandidatesFromScope(scopeFromJuz([5]), { passageAyahCount: 3, limit: 50 });
  assert.ok(candidates.length > 0);
  for (const candidate of candidates) {
    assert.equal(candidate.juzNumber, 5);
    assert.ok(candidate.hizbNumber === 9 || candidate.hizbNumber === 10);
    assert.ok(candidate.rubNumber! > 32 && candidate.rubNumber! <= 40);
    assert.ok(candidate.pageNumber! >= 1);
    assert.equal(candidate.difficultyAssurance, 'automatically_estimated', 'a structural estimate never poses as reviewed');
    assert.equal(candidate.exposureCount, undefined, 'exposure is read from the ledger, never guessed at projection time');
    assert.equal(candidate.allowedWujuh, undefined, 'wujuh come from a certified source only; absence means unread, not none');
  }
});

test('hizb and rub stay consistent across the whole Mushaf, never drifting outside their juz', () => {
  const candidates = projectCandidatesFromScope(fullQuranScope(), { passageAyahCount: 1, stride: 97 });
  assert.ok(candidates.length > 50);
  for (const candidate of candidates) {
    const juz = candidate.juzNumber!;
    assert.ok(candidate.hizbNumber! === juz * 2 - 1 || candidate.hizbNumber! === juz * 2);
    assert.ok(candidate.rubNumber! > (juz - 1) * 8 && candidate.rubNumber! <= juz * 8);
  }
});
