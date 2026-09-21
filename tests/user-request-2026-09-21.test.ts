import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

test('publishing a journey pass cannot make the public competition revision stale', () => {
  const store = read('src/lib/store.ts');
  const publisher = store.slice(store.indexOf('async function publishPublicJourneyRecord'), store.indexOf('async function syncPublicJourneys'));
  assert.doesNotMatch(publisher, /public_competitions/);
  assert.match(store, /globalState\.competitionConfigUpdatedAt=globalState\.competition\.updatedAt/);
});

test('server reissue reads the canonical participant path and emits a participant pass', () => {
  const server = read('server.ts');
  assert.match(server, /const participantPath = `organizations\/\$\{organizationId\}\/competitions\/\$\{competitionId\}\/participants\/\$\{participantId\}`/);
  assert.doesNotMatch(server, /settings\/active\/organizations\/\$\{organizationId\}\/competitions\/\$\{competitionId\}\/participants/);
  assert.match(server, /journeyAccessTokenHash[^\n]+audience: 'participant'/);
});

test('approved public journeys expose the complete private preparation surface', () => {
  const journey = read('src/components/public/JourneyAccess.tsx');
  const store = read('src/lib/store.ts');
  const registration = read('server/public-registration.ts');
  assert.match(journey, /\['approved', 'checked_in', 'in_queue'\]/);
  assert.match(journey, /<WarmupSanctuary/);
  assert.match(journey, /التحضير للاختبار/);
  assert.match(store, /preparation:\{/);
  assert.match(registration, /preparation:\{/);
});

test('card export first repairs and verifies the public competition projection', () => {
  const store = read('src/lib/store.ts');
  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.match(store, /const publicCompetition=await publishPublicCompetitionRecord\(\)/);
  assert.match(store, /publicationFailure:publicCompetition\.reason/);
  assert.match(overview, /batch\.publicationFailure/);
});
