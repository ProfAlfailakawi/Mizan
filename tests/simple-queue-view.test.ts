import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deriveSimpleQueueState } from '../src/lib/simple-queue-view';
import type { DisplayBoard } from '../src/lib/display-board';

const board = (over: Partial<DisplayBoard['committees'][number]> = {}): DisplayBoard => ({
  version: 'MIZAN-DISPLAY-BOARD-1', competitionId: 'c1', competitionName: 'C', competitionNameArabic: 'م',
  generatedAt: new Date().toISOString(), privacyMode: 'CODES_ONLY',
  committees: [{
    committeeId: 'k1', code: 'C2', name: 'Panel 2', nameArabic: 'اللجنة 2', venueHall: 'القاعة ب', status: 'testing',
    categories: [], nowCalling: { code: 'A-100', position: 0 },
    next: [{ code: 'A-101', position: 1 }, { code: 'A-102', position: 2 }, { code: 'A-103', position: 3 }],
    waitingCount: 5, completedCount: 2, stalled: false, averageSessionMinutes: 10, estimatedWaitMinutes: 55, ...over,
  }],
  totalWaiting: 5, unassignedWaiting: 0, activePanels: 1, totalCompleted: 2, stalledPanels: 0,
});
const journey = (status: string, code = 'A-102') => ({ status, participantCode: code, committee: { code: 'C2', hall: 'القاعة ب' } });

test('simple view: queued participant within the published depth gets position and an estimate', () => {
  const s = deriveSimpleQueueState(journey('in_queue'), board());
  assert.equal(s.stage, 'waiting');
  assert.equal(s.position, 2);
  /* remaining of current session = 55 − 5×10 = 5, plus one ahead × 10 */
  assert.equal(s.estimatedWaitMinutes, 15);
  assert.equal(s.estimateIsUpperBound, false);
});

test('simple view: position beyond the published depth is an upper bound, never an invented number', () => {
  const s = deriveSimpleQueueState(journey('in_queue', 'A-199'), board());
  assert.equal(s.position, null);
  assert.equal(s.estimatedWaitMinutes, 55);
  assert.equal(s.estimateIsUpperBound, true);
  assert.equal(s.waitingCount, 5);
});

test('simple view: being called (board or session status) shows the panel', () => {
  assert.equal(deriveSimpleQueueState(journey('in_queue', 'A-100'), board()).stage, 'called');
  const s = deriveSimpleQueueState(journey('in_session'), null);
  assert.equal(s.stage, 'called');
  assert.equal(s.committeeCode, 'C2');
  assert.equal(s.hall, 'القاعة ب');
});

test('simple view: before queue, done, and missing board states are calm and safe', () => {
  assert.equal(deriveSimpleQueueState(journey('approved'), board()).stage, 'before');
  assert.equal(deriveSimpleQueueState(journey('tested'), board()).stage, 'done');
  const s = deriveSimpleQueueState(journey('in_queue'), null);
  assert.equal(s.stage, 'waiting');
  assert.equal(s.estimatedWaitMinutes, null);
});

test('simple view is reachable from the journey page and reads only capability-link + public board data', () => {
  const journeyPage = fs.readFileSync('src/components/public/JourneyAccess.tsx', 'utf8');
  const view = fs.readFileSync('src/components/public/SimpleQueueView.tsx', 'utf8');
  assert.match(journeyPage, /openSimple\(true\)/);
  assert.match(journeyPage, /view', 'simple'/);
  assert.match(view, /loadPublicDisplayBoard/);
  assert.doesNotMatch(view, /store\.participants|\bparticipants\s*[,}]|fullName\b|\.email|\.phone|nationalId|dateOfBirth/);
  assert.match(fs.readFileSync('src/index.css', 'utf8'), /prefers-reduced-motion: reduce\)\{ \.mizan-simple-queue__pulse\{ animation:none \}/);
});
