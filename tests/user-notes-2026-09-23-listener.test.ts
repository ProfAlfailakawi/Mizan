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
  assert.match(docker, /RUN timeout 900 python prefetch\.py \|\| echo/);
  const prefetch = read('services/quran-practice-listener/prefetch.py');
  assert.match(prefetch, /sys\.exit\(0\)/);
  assert.doesNotMatch(prefetch, /raise\b/);
  /* يُنزَّل إلى مجلّدٍ صريح ويُحمَّل في البناء نفسه، ولا يُكتب اسمُه إلا بعد أن يُحمَّل. */
  assert.match(prefetch, /download_model\(model_id, output_dir=BAKED\)\n\s*WhisperModel\(BAKED[^\n]*\)\n\s*with open\(os\.path\.join\(BAKED, 'MODEL_ID'\)/);
  const app = read('services/quran-practice-listener/app.py');
  assert.match(app, /state\['model'\]=WhisperModel\(BAKED,/);
});

test('the listener says where its model came from and which build runs — so an undeployed fix is never taken for deployed', () => {
  const app = read('services/quran-practice-listener/app.py');
  assert.match(app, /'source':state\['source'\]/);
  assert.match(app, /'build':os\.getenv\('MIZAN_BUILD_SHA'\) or None/);
  assert.match(read('cloudbuild.yaml'), /--update-env-vars "MIZAN_BUILD_SHA=\$COMMIT_SHA"/);
  assert.match(read('server.ts'), /source:\['image','download'\]\.includes\(body\?\.source\)\?body\.source:null/);
  const deploy = read('.github/workflows/deploy-cloud-run.yml');
  assert.match(deploy, /quranPracticeListener\.source/);
  assert.match(deploy, /quranPracticeListener\.build/);
});

test('a health probe that times out on a booting listener is WAKING, not UNREACHABLE — the page keeps waiting', () => {
  const server = read('server.ts');
  assert.match(server, /name==='TimeoutError'\|\|\(error as any\)\?\.name==='AbortError'\)return \{state:'WAKING',model:null\}/, 'and it is returned before the cache is written');
  const practice = read('src/components/participant/MushafListens.tsx');
  assert.match(practice, /\['LOADING', 'RETRYING', 'CHECKING', 'WAKING'\]\.includes\(state\) && tries < 24/);
  assert.match(practice, /const listenerWarming = \['LOADING', 'RETRYING', 'CHECKING', 'WAKING'\]\.includes\(listenerState\);/);
});

test('a waking listener shows seconds and says the microphone is fine — never a silent grey button', () => {
  const practice = read('src/components/participant/MushafListens.tsx');
  assert.match(practice, /المستمع يستيقظ… \$\{warmSeconds\.toLocaleString\('ar-EG'\)\} ث/);
  assert.match(practice, /data-listener-waking/);
  assert.match(practice, /الميكروفونُ سليم/);
});

test('the student waits for a waking listener instead of losing the first chunks — at most two minutes', () => {
  const practice = read('src/components/participant/MushafListens.tsx');
  assert.match(practice, /fetch\('\/api\/health\?listener=1'/);
  assert.match(practice, /disabled=\{listenerWarming\}/);
  assert.match(practice, /tries < 24/);
  const server = read('server.ts');
  assert.match(server, /quranPracticeListener:_req\.query\?\.listener==='1'\?await practiceListenerHealth\(\):practiceListenerHealthCached\(\)/);
});

test('the listener opens its port at once and Cloud Run waits on /ready — full CPU while loading, no traffic before the model', () => {
  /*
   * رُصد في نشر 08e22fe: كلُّ نسخةٍ جديدةٍ سقطت بـ`HealthCheckContainerError` (التحميلُ قبل فتح
   * المنفذ تجاوز مجسَّ TCP الافتراضيّ)، فبقيت الحركةُ على نسخةٍ قديمةٍ «تُحمّل» إلى الأبد.
   * فالمنفذُ يُفتح فورًا، والتحميلُ في خيطٍ يبدأ عند الإقلاع، ومجسُّ HTTP على `/ready` يُبقي
   * النسخةَ «تُقلع» (بالمعالج كاملًا) حتى يجهز النموذج — عشر دقائق على الأكثر.
   */
  const app = read('services/quran-practice-listener/app.py');
  assert.match(app, /app=FastAPI\(docs_url=None,redoc_url=None,openapi_url=None,lifespan=lifespan\)/);
  assert.match(app, /threading\.Thread\(target=startup_load,daemon=True\)\.start\(\)\n\s+yield/);
  assert.doesNotMatch(app, /loader\.join/, 'nothing blocks the port from opening');
  assert.match(app, /@app\.get\('\/ready'\)[\s\S]{0,400}status_code=200 if state\['model'\] else 503/);
  assert.match(app, /local_files_only=True/);
  const build = read('cloudbuild.yaml');
  assert.match(build, /--startup-probe=httpGet\.path=\/ready,httpGet\.port=8080,initialDelaySeconds=0,periodSeconds=10,timeoutSeconds=5,failureThreshold=60/);
  assert.match(build, /--cpu-boost/);
});

test('the deploy log itself says why the listener is not ready — build step statuses, running image, prefetch lines — and never fails the release', () => {
  const deploy = read('.github/workflows/deploy-cloud-run.yml');
  const step = deploy.slice(deploy.indexOf('- name: تشخيص المستمع والمعلّم'), deploy.indexOf('- name: حالُ مستمع التدريب والمعلّم'));
  assert.match(step, /gcloud builds describe "\$build_id"/);
  assert.match(step, /for svc in mizan-quran-listener mizan-quran-muaalem/);
  assert.match(step, /MIZAN_LISTENER_MODEL/);
  assert.match(step, /exit 0\n/);
  assert.match(deploy, /listener attempt \$attempt\/8: state=\$state model=\$model source=\$listener_source build=\$listener_build/);
});
