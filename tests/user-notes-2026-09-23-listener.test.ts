import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file: string) => fs.readFileSync(file, 'utf8');

test('the optional listener can never fail the Mizan release', () => {
  const build = read('cloudbuild.yaml');
  const images = build.slice(build.indexOf('\nimages:'));
  assert.doesNotMatch(images.split('\ntimeout')[0], /mizan-quran-listener/, 'images[] requires every listed image to exist');
  const listenerSteps = build.split('\n  - name:').filter(step => /mizan-quran-listener/.test(step) && !/services update mizan /.test(step));
  assert.ok(listenerSteps.length >= 3);
  for (const step of listenerSteps) assert.match(step, /allowFailure: true/);
  assert.match(build, /if \[ ! -s \/workspace\/mizan-quran-listener-url \]; then .*exit 0; fi/);
});

test('the listener loads its model at runtime, retries, and reports health honestly', () => {
  const app = read('services/quran-practice-listener/app.py');
  const docker = read('services/quran-practice-listener/Dockerfile');
  assert.doesNotMatch(docker, /download_model|verify_model/);
  assert.match(app, /while state\['model'\] is None:/);
  assert.match(app, /status_code=200 if state\['model'\] else 503/);
  assert.match(app, /@app.post\('\/recognise'\)/);
});

test('chunks after the first are sent with the container header so they can be decoded', () => {
  const judge = read('src/components/judge/JudgeOS.tsx');
  const practice = read('src/components/participant/MushafListens.tsx');
  assert.match(judge, /if\(!headBlobRef\.current\)headBlobRef\.current=e\.data;/);
  assert.match(practice, /new Blob\(\[head, chunk\]/);
  assert.match(practice, /const windowParts = index === 0 \? \[chunk\] : \[all\[0\], \.\.\.all\.slice\(first, index \+ 1\)\]/);
  assert.match(practice, /startMs < committedUntil\.current - 80/, 'overlapping windows commit each word once');
});

test('live mistake detection opens for practice through the deployed listener only', () => {
  const server = read('server.ts');
  assert.match(server, /word:'OPEN',tashkeel:'CLOSED',modelVersion:PRACTICE_LISTENER_MODEL,reasons:\['PRACTICE_LISTENER'\]/);
  assert.match(server, /app\.get\('\/api\/quran\/judge\/follow\/status',alignmentAudioIpRateLimit,requireGovernanceRoles/);
  assert.match(server, /scoreAuthority:'HUMAN_ONLY'/);
});

test('every delivered riwayah is listened to against its own text, never judged on its own wording', () => {
  const server = read('server.ts');
  const app = read('services/quran-practice-listener/app.py');
  const practice = read('src/components/participant/MushafListens.tsx');
  assert.doesNotMatch(server, /dedicatedPracticeListenerReady=\(reading:string\):boolean=>reading==='hafs'/);
  assert.doesNotMatch(app, /x_mizan_reading!='hafs'/);
  assert.match(practice, /fetchDeliveryPassage\('hafs', surah/);
  assert.match(practice, /planAlert\(settledHere,/, 'the alert tone never fires on a riwayah-specific word');
  assert.match(practice, /setMistakes\(verdict \? judgeable\(verdict\.mistakes\)/);
});
