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
  // لا مستمعَ منشورًا في الدفعة؟ يبقى الربطُ السابق، ولا يسقط النشر.
  assert.match(build, /if \[ -s \/workspace\/mizan-quran-listener-url \]; then vars=/);
  assert.match(build, /if \[ -z "\$vars" \]; then echo 'no engine deployed in this build; keeping previous bindings'; exit 0; fi/);
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
  /*
   * والترويسةُ تسبق كلَّ نافذةٍ لا تبلغ المقطعَ الأوّل؛ وما بلغته يُرسل صوتُه محتوًى لا
   * ترويسةً — وإلا طُرح صوتُ أوّل التلاوة ولم يُثبَّت (تغطيتُه في recognition-window.test).
   */
  assert.match(practice, /const windowParts = win\.headed \? \[all\[0\], \.\.\.all\.slice\(win\.first, index \+ 1\)\] : all\.slice\(0, index \+ 1\)/);
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

test('the listener image prefetches its model when it can, and never fails the build when it cannot', () => {
  const docker = read('services/quran-practice-listener/Dockerfile');
  assert.match(docker, /RUN timeout 600 python prefetch\.py \|\| echo/);
  const prefetch = read('services/quran-practice-listener/prefetch.py');
  assert.match(prefetch, /sys\.exit\(0\)/);
  assert.doesNotMatch(prefetch, /raise\b/);
});

test('the student waits for a waking listener instead of losing the first chunks — at most two minutes', () => {
  const practice = read('src/components/participant/MushafListens.tsx');
  assert.match(practice, /fetch\('\/api\/health\?listener=1'/);
  assert.match(practice, /disabled=\{listenerWarming\}/);
  assert.match(practice, /tries < 24/);
  const server = read('server.ts');
  assert.match(server, /quranPracticeListener:_req\.query\?\.listener==='1'\?await practiceListenerHealth\(\):practiceListenerHealthCached\(\)/);
});

test('the baked model loads during startup, with the CPU Cloud Run gives a starting container', () => {
  /*
   * بلا `--no-cpu-throttling` لا يُعطى خيطٌ خلفيٌّ معالجًا بين الطلبات، فكان المستمعُ «يستعدّ»
   * دقائقَ بعد كلّ نشرٍ ونوم. فالنموذجُ المخبوز يُحمَّل في طور الإقلاع (lifespan) من القرص وحده،
   * ولا يُفتح المنفذ قبله؛ والتنزيلُ الخلفيّ بقي للصورة التي لا نموذجَ فيها.
   */
  const app = read('services/quran-practice-listener/app.py');
  assert.match(app, /local_files_only=True/);
  assert.match(app, /app=FastAPI\(docs_url=None,redoc_url=None,openapi_url=None,lifespan=lifespan\)/);
  assert.match(app, /if not await asyncio\.to_thread\(load_prefetched\):\n\s+loader=threading\.Thread\(target=load_model,daemon=True\)/);
  /* وإن غاب عن الصورة نُزِّل في طور الإقلاع نفسه (مهلةٌ دون مهلة فحص الإقلاع ٢٤٠ ثانية). */
  assert.match(app, /await asyncio\.to_thread\(loader\.join,float\(os\.getenv\('MIZAN_STARTUP_LOAD_SECONDS','180'\)\)\)/);
  assert.doesNotMatch(app, /^threading\.Thread\(target=load_model,daemon=True\)\.start\(\)$/m, 'no load thread started at import time');
  const build = read('cloudbuild.yaml');
  assert.match(build, /--cpu-boost/);
});
