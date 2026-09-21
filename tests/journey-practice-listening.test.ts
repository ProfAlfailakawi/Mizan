/*
 * «يسمعك» في بطاقة الرحلة العامة.
 *
 * بطاقة الرحلة ليست جلسة Firebase، لكنّها اعتمادٌ خاص للمتسابق. لذلك يجب أن يعمل
 * التدريب من البطاقة نفسها من غير أن نُضعف أبواب `/api/quran/practice/*` الأصلية، ومن
 * غير أن يثق الخادم بنطاقٍ أو رواية يختارهما المتصفح.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file: string) => fs.readFileSync(file, 'utf8');

const journey = read('src/components/public/JourneyAccess.tsx');
const warmup = read('src/components/participant/WarmupSanctuary.tsx');
const listens = read('src/components/participant/MushafListens.tsx');
const intelligence = read('src/lib/quran-intelligence.ts');
const faces = read('src/lib/practice-faces.ts');
const server = read('server.ts');
const store = read('src/lib/store.ts');
const registration = read('server/public-registration.ts');

test('the participant journey opens the full Mushaf-listens experience with its private pass', () => {
  assert.match(journey, /journeyPracticeAuth=\{\{competitionId:journey\.competitionId,key:token\}\}/);
  assert.match(warmup, /<JourneyListenDoor ar=\{ar\} access=\{journeyPracticeAuth\}/);
  assert.match(warmup, /<MushafListens[\s\S]*journeyAuth=\{access\}/);
  assert.match(warmup, /إعادة المحاولة/);
});

test('the journey secret is carried in headers, never added to a practice URL', () => {
  assert.match(intelligence, /'x-mizan-journey-key':access\.key/);
  assert.match(faces, /'x-mizan-journey-key':access\.key/);
  assert.doesNotMatch(intelligence, /[?&](key|token)=\$\{?access\.key/);
  assert.doesNotMatch(faces, /[?&](key|token)=\$\{?access\.key/);
});

test('public journey practice has a separate authenticated, rate-limited corridor', () => {
  for (const route of [
    '/api/public/journeys/practice/context',
    '/api/public/journeys/practice/faces',
    '/api/public/journeys/practice/face',
    '/api/public/journeys/practice/judging-gate',
    '/api/public/journeys/practice/align',
    '/api/public/journeys/practice/recognise',
  ]) {
    const at = server.indexOf(`'${route}'`);
    assert.ok(at >= 0, `${route} must exist`);
    const head = server.slice(Math.max(0, at - 80), Math.min(server.length, at + 380));
    assert.match(head, /practiceAlignmentIpRateLimit/);
    assert.match(head, /journeyPracticeRateLimit/);
  }
  assert.match(server, /publicRegistration\.resolve\(competitionId,'participant',key\)/);
  assert.match(server, /crypto\.createHash\('sha256'\)\.update\(value\)/);
  assert.match(server, /journeyPracticeRateLimit:RequestHandler=rateLimit\(\{/);
  const ipLimiter = server.slice(server.indexOf('const practiceAlignmentIpRateLimit'), server.indexOf('const practiceAlignmentRateLimit'));
  const journeyLimiter = server.slice(server.indexOf('const journeyPracticeRateLimit'), server.indexOf('const publicRegistrationRateLimit'));
  assert.match(ipLimiter, /skip:\(\)=>rateLimiterIsGlobal/);
  assert.match(journeyLimiter, /skip:\(\)=>rateLimiterIsGlobal/);
  assert.match(server, /const value=\(Array\.isArray\(raw\)\?raw\[0\]:String\(raw\?\?''\)\)\.trim\(\)/);
  for (const limiter of [
    'sensitiveIdentityRateLimit',
    'alignmentAudioIpRateLimit',
    'questionRuntimeRateLimit',
    'auditRateLimit',
    'practiceAlignmentIpRateLimit',
    'journeyPracticeRateLimit',
    'publicRegistrationRateLimit',
    'journeyResolveRateLimit',
    'competitionPublishRateLimit',
    'paymentWebhookRateLimit',
    'enterpriseAuditRateLimit',
    'ownerRateLimit',
  ]) {
    const start = server.indexOf(`const ${limiter}`);
    assert.ok(start >= 0, `${limiter} must exist`);
    const block = server.slice(start, start + 900);
    assert.match(block, /skip:\(\)=>rateLimiterIsGlobal/, `${limiter} must bypass its local store in global mode`);
  }
  assert.doesNotMatch(server, /RequestHandler=rateLimiterIsGlobal\s*\?/, 'global mode must use express-rate-limit skip, not conditional middleware wrapping');
});

test('the browser cannot choose another competitor scope, reading, face, or passage', () => {
  assert.match(server, /const prepared=journey\?\.preparation/);
  assert.match(server, /resolveEffectiveScope\(\{participant:\{id:participantId\}/);
  assert.match(server, /if\(requested!==access\.deliveryReading\)throw new Error\('PRACTICE_REQUEST_MISMATCH'\)/);
  assert.match(server, /catalogue\.faces\.some\(x=>x\.page===page\)/);
  assert.match(server, /scopeContainsRange\(access\.scope,\{surah,ayah:startAyah\},\{surah,ayah:endAyah\}\)/);
  assert.match(faces, /body: JSON\.stringify\(\{ scope: access \? null : \(scope \?\? null\) \}\)/);
});

test('reading identity is explicit and has no cross-riwayah fallback', () => {
  assert.match(server, /qaloun:'qalun'/);
  assert.match(server, /'douri-abu-amr':'duri-abi-amr'/);
  assert.match(server, /'sousi-abu-amr':'susi-abi-amr'/);
  assert.match(server, /if\(!definition\)throw new Error\('PRACTICE_READING_NOT_SUPPORTED'\)/);
  assert.match(server, /if\(!deliveryReading\)throw new Error\('PRACTICE_READING_NOT_SUPPORTED'\)/);
});

test('participant-selected scope is never mistaken for the category parent scope', () => {
  assert.match(registration, /journeyPracticeScope=category\.scopeMode==='participant_selected'&&category\.selectionRule\?\.enabled\?null:scope/);
  assert.match(store, /scope:scopeResolution&&!scopeResolution\.blocked\?scopeResolution\.scope:null/);
  assert.match(store, /riwaya:participant\.riwaya/);
});

test('microphone state becomes live only after permission succeeds and failures are retryable', () => {
  const begin = listens.slice(listens.indexOf('const begin = useCallback'), listens.indexOf("useEffect(() => {\n    if (stage !== 'reciting')"));
  const asking = begin.indexOf("setStage('asking')");
  const permission = begin.indexOf('await navigator.mediaDevices.getUserMedia');
  const live = begin.indexOf("setStage('reciting')", permission);
  assert.ok(asking >= 0 && permission > asking, 'permission prompt must have a single explicit waiting state');
  assert.ok(live > permission, 'live state must follow successful microphone permission');
  assert.match(begin, /setStage\('ready'\);\n\s*setNote\(microphoneFailureNote/);
  assert.match(listens, /NotAllowedError\|SecurityError/);
});

test('the original Firebase participant practice doors remain protected', () => {
  for (const route of [
    '/api/quran/practice/align',
    '/api/quran/practice/faces',
    '/api/quran/practice/face',
    '/api/quran/practice/judging-gate',
    '/api/quran/practice/recognise',
  ]) {
    const line = server.split('\n').find(value => value.includes(`'${route}'`));
    assert.ok(line, `${route} must remain present`);
    assert.match(line, /requireFirebaseRoles\(\['participant'\]\)/, `${route} must remain Firebase-protected`);
  }
});
