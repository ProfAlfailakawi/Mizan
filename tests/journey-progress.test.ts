import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deriveJourneyStage, displayParticipantName, formatParticipantCode, journeyStepIndex } from '../src/lib/journey-progress';

test('journey: a finished contestant is never stuck at waiting', () => {
  assert.equal(deriveJourneyStage({ status: 'in_queue' }), 'in_queue');
  assert.equal(deriveJourneyStage({ status: 'in_queue', hasLockedScores: true }), 'tested');
  assert.equal(deriveJourneyStage({ status: 'in_queue', hasResult: true }), 'tested');
  assert.equal(deriveJourneyStage({ status: 'checked_in', hasCertificate: true }), 'certified');
  assert.equal(deriveJourneyStage({ status: 'completed' }), 'tested');
  assert.equal(deriveJourneyStage({ status: 'in_queue', inSession: true }), 'in_session');
  // شاهدٌ أضعف لا يُنزل حالةً أقوى.
  assert.equal(deriveJourneyStage({ status: 'certified', inSession: true }), 'certified');
  assert.equal(journeyStepIndex({ status: 'bogus' }), 0);
});

test('participant code and name are shown formatted, never as a raw number', () => {
  assert.equal(formatParticipantCode('A-3869311'), 'A-3 869 311');
  assert.equal(formatParticipantCode('3869311'), '3 869 311');
  assert.equal(formatParticipantCode('A-104'), 'A-104');
  assert.equal(displayParticipantName('سارة', 'A-1', true), 'سارة');
  assert.equal(displayParticipantName('3869311', 'A-3869311', true), 'المتسابق A-3 869 311');
  assert.equal(displayParticipantName('', 'A-3869311', false), 'Participant A-3 869 311');
});

test('journey page drops the separate large-type view', () => {
  const page = fs.readFileSync('src/components/public/JourneyAccess.tsx', 'utf8');
  assert.doesNotMatch(page, /SimpleQueueView|openSimple|view', 'simple'|عرض مبسّط/);
  assert.match(page, /journeyStepIndex\(/);
  assert.equal(fs.existsSync('src/components/public/SimpleQueueView.tsx'), false);
});
