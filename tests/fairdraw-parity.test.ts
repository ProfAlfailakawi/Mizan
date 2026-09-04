import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFairDrawParity, questionEnergy, FAIRDRAW_PARITY_VERSION } from '../src/lib/fairdraw-parity';
import type { QuestionPoolItem } from '../src/types';

function q(over: Partial<QuestionPoolItem>): QuestionPoolItem {
  return {
    id: over.id || 'q', surahNumber: 1, surahNameArabic: '', surahNameEnglish: '', startAyah: 1, endAyah: 2,
    juzNumber: 1, riwaya: 'hafs', expectedTextArabic: '', difficultyRating: 3,
    mutashabihatDensity: 'none', tajweedComplexity: 'basic', timesUsed: 0, ...over,
  };
}

test('question energy adds mutashabihat and tajweed load on top of raw difficulty', () => {
  assert.equal(questionEnergy({ difficultyRating: 3, mutashabihatDensity: 'none', tajweedComplexity: 'basic' }), 3);
  assert.equal(questionEnergy({ difficultyRating: 3, mutashabihatDensity: 'high', tajweedComplexity: 'advanced' }), 3 + 1.75 + 1.5);
  // a "harder-feeling" dense passage outweighs a higher raw rating that is otherwise smooth
  assert.ok(
    questionEnergy({ difficultyRating: 3, mutashabihatDensity: 'high', tajweedComplexity: 'advanced' }) >
      questionEnergy({ difficultyRating: 4, mutashabihatDensity: 'none', tajweedComplexity: 'basic' }),
  );
});

test('a cohort with equal-energy sets is BALANCED', () => {
  const r = analyzeFairDrawParity([
    { participantId: 'a', questions: [q({ difficultyRating: 3 }), q({ difficultyRating: 3 })] },
    { participantId: 'b', questions: [q({ difficultyRating: 3 }), q({ difficultyRating: 3 })] },
  ]);
  assert.equal(r.version, FAIRDRAW_PARITY_VERSION);
  assert.equal(r.status, 'BALANCED');
  assert.equal(r.totalEnergySpread, 0);
  assert.equal(r.maxRelativeDelta, 0);
});

test('a lopsided cohort is flagged REVIEW with the worst pair identified', () => {
  const easy = [q({ difficultyRating: 1, mutashabihatDensity: 'none', tajweedComplexity: 'basic' }), q({ difficultyRating: 1 })];
  const brutal = [q({ difficultyRating: 5, mutashabihatDensity: 'high', tajweedComplexity: 'advanced' }), q({ difficultyRating: 5, mutashabihatDensity: 'high', tajweedComplexity: 'advanced' })];
  const r = analyzeFairDrawParity([
    { participantId: 'lucky', questions: easy },
    { participantId: 'unlucky', questions: brutal },
  ], 0.15);
  assert.equal(r.status, 'REVIEW');
  assert.ok(r.maxRelativeDelta > 0.15);
  assert.ok(r.worstPair);
  assert.equal(r.worstPair!.a.participantId, 'lucky');
  assert.equal(r.worstPair!.b.participantId, 'unlucky');
});

test('a single participant is trivially BALANCED (nothing to compare against)', () => {
  const r = analyzeFairDrawParity([{ participantId: 'solo', questions: [q({})] }]);
  assert.equal(r.status, 'BALANCED');
  assert.equal(r.participantCount, 1);
});
