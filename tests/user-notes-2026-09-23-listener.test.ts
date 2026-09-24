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
  assert.match(practice, /const warming = \['LOADING', 'RETRYING', 'CHECKING', 'WAKING'\]\.includes\(state\);\n\s*if \(warming && tries < 24\)/);
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
  assert.match(practice, /disabled=\{listenerWarming \|\| listenerDown\}/, 'never unlocked onto a listener that is not ready');
  assert.match(practice, /else if \(warming\) \{ setListenerState\('TIMEOUT'\); timer = window\.setTimeout\(poll, 30_000\); \}/);
  assert.match(practice, /data-listener-down/);
  assert.match(practice, /useState<string>\('CHECKING'\)/, 'closed until the first answer');
  assert.match(practice, /if \(state === 'UNREACHABLE' \|\| \/\^HTTP_\/\.test\(state\)\) timer = window\.setTimeout\(poll, 30_000\);/);
  assert.match(practice, /catch \{ if \(live\) \{ setListenerState\('UNREACHABLE'\); timer = window\.setTimeout\(poll, 30_000\); \} \}/);
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

test('the listener image declares requests and proves the model library imports at build time', () => {
  /* رُصد في نشر 8b771c9 بسجلّه: «No module named 'requests'» — في التنزيل المسبق وعند الإقلاع. */
  assert.match(read('services/quran-practice-listener/requirements.txt'), /^requests==/m);
  assert.match(read('services/quran-practice-listener/Dockerfile'), /RUN python -c "from faster_whisper import WhisperModel; import requests"/);
  const app = read('services/quran-practice-listener/app.py');
  assert.match(app, /except Exception as exc:\n\s+# لا يموت الخيطُ صامتًا/);
  /* ومحمِّلٌ انتهى بلا نموذج يُقال «failed» (فيراه الخادمُ HTTP_503 ويُغلق الزرَّ فورًا)، لا «retrying». */
  assert.match(app, /state\['failed'\]=True/);
  assert.match(app, /'failed' if state\.get\('failed'\) else 'retrying'/);
});

test('«اختبر حفظك» reveals only what was heard — never by a timer, never a word ahead', () => {
  /* شكوى المالك: «قاعد يحسب على الوقت ويفتح له… والمفروض يسمع حسب الكلمة». */
  const practice = read('src/components/participant/MushafListens.tsx');
  assert.doesNotMatch(practice, /\+ 2\)\);/, 'no reveal of the next, unsaid word');
  assert.match(practice, /setReached\(r => Math\.max\(r, penTarget \+ 1\)\);\n\s+if \(veiled \|\| pen === null/, 'reached follows the heard position only; in the veil the pen jumps, no timed walk');
  assert.match(practice, /Math\.min\(penTarget, p \+ 1\)/, 'the smooth walk never passes the heard word');
  assert.match(practice, /if \(out\.alignmentState !== 'LOST'\) \{/, 'an untrusted LOST candidate reveals nothing');
  // تحت الحجاب: الموضعُ التقريبيّ لا يكشف إلا حين لا تُسمع الكلمات، ولا يسبق آخرَ ما سُمع بأكثر من VEIL_STEP.
  assert.match(practice, /export const VEIL_STEP = 4;/);
  assert.match(practice, /if \(!veiledRef\.current\) advance\(target\);/);
  assert.match(practice, /!attemptJudging\.current && !wordFollow\.current && out\.alignmentState === 'LOCKED'/);
  assert.match(practice, /reachedRef\.current - 1 \+ VEIL_STEP/);
  // تكرارُ الموضع نفسِه لا يكشف مزيدًا (لا تسلّق).
  assert.match(practice, /target > lastRough\.current\) \{\n\s+\/\/[^\n]*\n\s+lastRough\.current = target;/);
  // الموضعُ يرسو على آخر ما ثبت، فلا تسحبه عبارةٌ مكرّرةٌ بعيدة.
  assert.match(practice, /after: lastGlobal\.current >= 0/);
  const listener = read('services/quran-practice-listener/app.py');
  assert.match(listener, /LOCAL_BEHIND, LOCAL_AHEAD = 8, 12/);
  assert.match(listener, /FAR_MIN_RATIO = 0\.5, 0\.65|LOCAL_MIN_RATIO, FAR_MIN_RATIO = 0\.5, 0\.65/);
  assert.equal((listener.match(/vad_filter=True/g) || []).length, 2, 'silence is not transcribed into phantom words');
});

test('word-by-word following survives a closed gate and a dropped chunk, and the limits carry the faster rhythm', async () => {
  const practice = read('src/components/participant/MushafListens.tsx');
  // التتبّعُ بالكلمات لا يُشترط بإذن الحكم، ولا يسقط بمقطعٍ واحد.
  assert.match(practice, /if \(attemptJudging\.current \|\| wordFollow\.current\) \{/);
  assert.match(practice, /export const FOLLOW_FAILURE_LIMIT = 3;/);
  assert.match(practice, /followFailures\.current >= FOLLOW_FAILURE_LIMIT/);
  // وسقوطُ إذن الحكم في أثناء التلاوة يترك التتبّعَ قائمًا: المقاطعُ التالية تمرّ بفرع التتبّع.
  assert.doesNotMatch(practice, /wordFollow\.current = false;[^\n]*\n[^\n]*setMistakes\(undefined\)/);
  // والكلمةُ الأخيرةُ المسموعةُ تنكشف هي نفسُها — لا تتأخّر كلمة.
  assert.match(practice, /if \(judged\.frontier >= 0\) advance\(judged\.frontier\);/);
  assert.match(practice, /if \(frontier >= 0\) advance\(frontier\);/);

  // والحدودُ تتّسع لإيقاع المقطع: فسحةُ النصف فوق ما يُرسله قارئٌ في النافذة.
  const { CHUNK_MS } = await import('../src/lib/recognition-window');
  const server = read('server.ts');
  const perWindow = 120_000 / CHUNK_MS;
  const limit = (name: string) => Number(new RegExp(`${name}\\|\\|(\\d+)`).exec(server)?.[1]);
  assert.ok(limit('MIZAN_PRACTICE_ALIGNMENT_RATE_LIMIT_MAX') >= perWindow * 1.5);
  assert.ok(limit('MIZAN_PRACTICE_RECOGNITION_RATE_LIMIT_MAX') >= perWindow * 1.5);
  assert.ok(limit('MIZAN_JOURNEY_PRACTICE_RATE_LIMIT_MAX') >= perWindow * 2 * 1.5, 'journey card sends every chunk to both routes');
});

test('a closed ASR gate still lets words through the practice listener, and the report waits for them', () => {
  const server = read('server.ts');
  assert.match(server, /const recogniseViaPracticeListener=\(reading:string\)=>dedicatedPracticeListenerReady\(reading\)\s*\n\s*&&\(!recitationRecogniser\.configured\(\)\|\|recitationRecogniser\.gate\(reading\)\.word!=='OPEN'\);/);
  assert.equal((server.match(/if\(recogniseViaPracticeListener\(reading\)\)\{/g) || []).length, 2, 'both recognition routes');
  // والبوّابةُ المعادةُ من هناك بوّابةُ المحرّك (مغلقة) — فلا يُحكم بما سُمع.
  assert.match(server, /return \{gate:practiceJudgingGate\(input\.reading\),words,modelVersion:PRACTICE_LISTENER_MODEL\};/);
  const practice = read('src/components/participant/MushafListens.tsx');
  assert.match(practice, /if \(\(attemptJudging\.current \|\| wordFollow\.current\) && !\(await recognition\.current\.drain\(\)\)\) \{/);
});
