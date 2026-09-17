/*
 * ملاحظات المستخدم — الدفعة الثانية، ١٥ سبتمبر ٢٠٢٦.
 *
 * كل اختبار هنا يقابل ملاحظةً قيلت بلسان صاحب المسابقة أمام شاشةٍ عطّلته، ويثبت أن ما
 * قيل صار سلوكًا لا وعدًا.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { incidentTitle, INCIDENT_TYPE_ARABIC } from '../src/lib/incident-language';
import { readingUnavailableReason } from '../src/lib/quran-reading-sources';

const read = (p: string) => fs.readFileSync(p, 'utf8');
const exists = (p: string) => fs.existsSync(p);

/* ── ١ — لا إدارة علمية ────────────────────────────────────────────────── */

test('the scientific administration is gone, screen and requirement together', () => {
  assert.equal(exists('src/components/admin/ScientificGovernance.tsx'), false);

  /* والاشتراط الذي كانت تحرسه: بوابةٌ لا يملك صاحب المسابقة ما يفتحها به. */
  const ops = read('docs/OPERATIONS.md');
  assert.doesNotMatch(ops, /عبر «الإدارة العلمية»/);
  assert.match(ops, /مجمع الملك فهد/, 'the approved source is named instead');

  for (const file of ['src/components/judge/JudgeOS.tsx', 'src/components/head-judge/MutashabihatHint.tsx']) {
    assert.doesNotMatch(read(file), /المجلس العلمي|اللجنة العلمية/, `${file} no longer invokes a body that does not exist`);
  }
});

/* ── ٢ + ١١ — الجلسة تبدأ فعلًا ─────────────────────────────────────────── */

test('an official session is never blocked by a package the organiser cannot create', () => {
  const store = read('src/lib/store.ts');

  /*
   * الحزمة الخادمية لا تُنشأ إلا بمفتاح مؤسسي من بنكٍ مبنيٍّ على «مصدر معتمد»، وليس في
   * الشاشات ما يفعل ذلك. فاشتراطها كان يعني أن كل جلسة رسمية تنتهي إلى «تعذّر بدء الجلسة».
   */
  assert.doesNotMatch(store, /createIncident\('quran_source_discrepancy','Secure question runtime blocker'/);
  assert.doesNotMatch(store, /createIncident\('quran_source_discrepancy','Secure question provisioning missing'/);
  assert.doesNotMatch(store, /Scientific Quran source blocker/);

  /* تُجرَّب أولًا — ثم يُرتدّ إلى مصحف التسليم ويُقيَّد ذلك في التدقيق. */
  assert.match(store, /if\(!capabilities\.ready\)throw new Error\('SERVER_QUESTION_RUNTIME_UNAVAILABLE'\)/);
  assert.match(store, /auditTrustAction\('SESSION_QUESTIONS_RESOLVED_ON_DEVICE'/);

  /* ومصحف التسليم مصدرٌ باسمه، لا «نسخة تطوير». */
  assert.match(store, /'CERTIFIED_SOURCE'\|'DELIVERY_MUSHAF'/);
  assert.doesNotMatch(store, /DEVELOPMENT_FIXTURE/);
});

/* ── ١١ — كل من ينتظر يظهر باسمه ───────────────────────────────────────── */

test('nobody awaiting a turn can vanish from the judging screen', () => {
  const judge = read('src/components/judge/JudgeOS.tsx');
  /* ما قبل التقييم وحده: «اعتراض» له مسار إعادةٍ محكوم، ونداؤه من هنا يتخطّاه. */
  assert.match(judge, /const CALLABLE:RegistrationStatus\[\]=\['approved','checked_in','in_session'\]/);
  assert.doesNotMatch(judge, /'in_session','appealed'/, 'an appeal is never turned into an unauthorized retest');
  assert.match(judge, /PARTICIPANT_WAIT_LABEL/);
  assert.match(judge, /store\.releaseStrandedSession\(id\)/);

  const store = read('src/lib/store.ts');
  assert.match(store, /const releaseStrandedSession = \(participantId: string\)/);
  assert.match(store, /if \(current\.status !== 'in_session'\) return false;/, 'only a stranded row is released');
  assert.match(store, /if \(globalState\.activeSession\.participant\?\.id === participantId\) return false;/,
    'a live session is never torn down by the recovery path');
  assert.match(store, /auditTrustAction\('STRANDED_SESSION_RELEASED'/);
});

/* ── ٤ — البطاقة لا تناقض نفسها ────────────────────────────────────────── */

test('a panel counts the judges it can actually name', () => {
  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.match(overview, /const danglingJudgeIds=c\.judgeIds\.filter\(id=>!store\.judges\.some\(j=>j\.id===id\|\|j\.userId===id\)\)/);
  assert.match(overview, /\$\{members\.length\} من \$\{required\} محكمًا/,
    'the counter reads resolved members, not raw identity strings');
  assert.doesNotMatch(overview, /\$\{c\.judgeIds\.length\} من \$\{required\}/);
});

/* ── ٧ — آلة النماذج حُذفت ─────────────────────────────────────────────── */

test('the model machinery no longer asks the organiser for decisions it cannot ground', () => {
  const studio = read('src/components/scope/ModelFairnessStudio.tsx').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const gone of ['دفعة النماذج', 'الاحتياط', 'دورة حياة الحجز', 'أعلى المواضع انكشافًا', 'حجر المواضع']) {
    assert.ok(!studio.includes(gone), `${gone} is gone from the screen`);
  }
  assert.ok(studio.includes('تقرير عدالة وتوزيع الأسئلة'), 'the one thing that answers a real question stays');
});

/* ── ٨ — لا طائرة على «الجهات» ─────────────────────────────────────────── */

test('the entities tab does not claim to be international', () => {
  const enterprise = read('src/components/admin/EnterpriseWorkspace.tsx');
  assert.match(enterprise, /\['international',Building2,ar\?'الجهات':'Entities'\]/);
  assert.doesNotMatch(enterprise, /Plane/, 'the plane is gone, import and all');
});

/* ── ٩ — البزي وقنبل يعملان ────────────────────────────────────────────── */

test('al-Bazzi and Qunbul resolve to real delivery packages', () => {
  /* الوحدة تجرّ تهيئة المتصفح عند الاستيراد، فيُقرأ نصُّها كما تفعل بقية هذه المجموعة. */
  const table = read('src/lib/delivered-readings.ts');
  assert.match(table, /'al-bazzi': 'bazzi'/);
  assert.match(table, /qunbul: 'qunbul'/);
  assert.match(table, /export const DELIVERED_RAWI_IDS: readonly string\[\] = Object\.keys\(DELIVERY_READING_BY_RAWI\)/,
    'the delivered list is derived from the table, so the two cannot disagree');

  /* والخادم يعرف أين يجدهما، في التسليم الخاص وفي المستودع المفتوح. */
  const delivery = read('server/kfgqpc-delivery.ts');
  assert.match(delivery, /'bazzi':'delivery\/quran-data\/bazzi\/v7'/);
  assert.match(delivery, /'qunbul':'delivery\/quran-data\/qunbul\/v7'/);
  assert.match(delivery, /'bazzi':'bazzi'/);
  assert.match(delivery, /'qunbul':'qumbul'/, 'the open repository spells it Qumbul');
});

test('the delivered-narration table has exactly one definition', () => {
  /*
   * كانت نسختان: واحدة في سطح المصحف وأخرى في بنك المواضع. وإضافةُ رواية في إحداهما
   * تترك الأخرى خلفها، فيُسحب الموضع ولا يجد السطحُ نصًّا له.
   */
  const surface = read('src/components/judge/OfficialMushafSurface.tsx');
  assert.doesNotMatch(surface, /const DELIVERY_READING_BY_RAWI:Record<string,string>=\{/);
  assert.match(surface, /import \{DELIVERY_READING_BY_RAWI as DELIVERY_READING_BY_RAWI_MAP\}/);
});

/* ── ١٠ — لا تُعرض مصادرنا ─────────────────────────────────────────────── */

test('the organiser is never shown where we buy our text', () => {
  const reason = readingUnavailableReason({ rawiId: 'hisham', authority: 'ALWAHY' } as never, true);
  assert.doesNotMatch(reason, /alwa7y|الوحي|http/);
  assert.match(reason, /لم يصل بعد/);

  for (const file of ['src/components/admin/CompetitionOverview.tsx', 'src/lib/quran-reading-sources.ts']) {
    const text = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    if (file.endsWith('quran-reading-sources.ts')) continue; // the constant is our record, not a screen
    assert.doesNotMatch(text, /alwa7y/, `${file} must not render our supplier`);
  }
});

/* ── ١٣ — وليّ الأمر يعرف ما يحتاجه ────────────────────────────────────── */

test('a participant number typed into guardian access is named, not answered with a server error', () => {
  const access = read('src/components/public/JourneyAccess.tsx');
  assert.match(access, /export const looksLikeParticipantCode/);
  assert.match(access, /export const looksLikeJourneyToken/);
  assert.match(access, /PARTICIPANT_CODE_NOT_A_JOURNEY_CODE/);

  /* ويُقال من أين يأتي الرمز، ولماذا لا يصلح رقم المتسابق. */
  assert.match(access, /من أين آتي بالرمز؟/);
  assert.match(access, /معلن في الكشوف/, 'and why the public number cannot be the key');
});

/* ── ٣ + ١٢ — سبب تعذّر البطاقة يُقال ──────────────────────────────────── */

test('a pass that cannot reach the cloud still opens, and says exactly what is wrong', () => {
  const store = read('src/lib/store.ts');
  assert.match(store, /type JourneyPublishOutcome='PUBLISHED'\|'OFFLINE'\|'NOT_SIGNED_IN'\|'ROLE_CANNOT_PUBLISH'\|'LAUNCH_PLACEHOLDER'\|'NO_TOKENS'\|'CLOUD_REJECTED'/);
  assert.match(store, /const lastJourneyAccessFailure=\(\)=>journeyAccessFailure/);

  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.match(overview, /const journeyIssueNote=/);
  assert.match(overview, /أعد كتابة مطالباتي/, 'the operator is pointed at the one action that fixes it');
  assert.doesNotMatch(overview, /تعذر إصدار البطاقة\. تحقق من الاتصال والصلاحيات/,
    'the sentence that fitted five different faults is gone');
});

/* ── ٦ — تقييم إلكتروني للتدريب ────────────────────────────────────────── */

test('a waiting participant can be listened to, without any of it touching the record', () => {
  const warmup = read('src/components/participant/WarmupSanctuary.tsx');
  assert.match(warmup, /submitPracticeAlignmentChunk/);
  assert.match(warmup, /لا يُسجَّل صوتك، ولا يصل اللجنة منه شيء، ولا يُحتسب في درجتك/);

  /* المقطع المعروض هو نفسه المُقيَّم عليه. */
  const dashboard = read('src/components/participant/ParticipantDashboard.tsx');
  assert.match(dashboard, /practicePassage=\{practicePassage\}/);
  assert.match(dashboard, /const practiceEngine=practiceReadingFor\(practiceReading\)/);

  /* والمسار على الخادم مستقلّ عن مسار المحكّم، ولا يكتب في دفتر الأدلّة. */
  const server = read('server.ts');
  assert.match(server, /'\/api\/quran\/practice\/align',practiceAlignmentIpRateLimit,requireFirebaseRoles\(\['participant'\]\),practiceAlignmentRateLimit/,
    'the address limit runs before identity is verified, so a flood of bad tokens costs nothing');

  /*
   * وحدٌّ غير مشروط عليه: كل نداء يرفع صوتًا ويستدعي المحرّك، فالكلفة لكل نداء لا لكل
   * جلسة. والتخويل يقول «من أنت» لا «كم مرة» — فحسابٌ واحد مخوَّل يستنزفه وحده.
   */
  assert.match(server, /const practiceAlignmentRateLimit:RequestHandler=rateLimit\(\{/,
    'the limit is declared outright, not behind the global-limiter escape hatch');
  assert.match(server, /const practiceAlignmentIpRateLimit:RequestHandler=rateLimit\(\{/);
  assert.doesNotMatch(server, /const practiceAlignmentRateLimit:RequestHandler=rateLimiterIsGlobal/);
  assert.match(server, /keyGenerator:\(req\)=>String\(\(req as any\)\.mizanIdentity\?\.uid/,
    'counted per account, so one participant cannot spend everyone else\u2019s budget');
  const service = read('server/quran-intelligence-service.ts');
  assert.match(service, /if\(input\.practice\)return \{\.\.\.base,practice:true as const\}/,
    'practice returns before the evidence ledger is appended');
});

test('the practice reading bridge is written out, never derived by guesswork', () => {
  /*
   * الطبقتان تكتبان الأسماء بهجاءين (qalun مقابل qaloun، وduri-abi-amr مقابل
   * douri-abu-amr)، واشتقاق أحدهما من الآخر يُرسل تلاوةً إلى رواية أخرى. ولا يُستورد
   * هذا الملف هنا لأنه يجرّ تهيئة المتصفح؛ فيُقرأ نصُّه كما تفعل بقية هذه المجموعة.
   */
  const intelligence = read('src/lib/quran-intelligence.ts');
  assert.match(intelligence, /qalun:\{reading:'qaloun',sourcePackageId:'kfgqpc-qaloun-uthmanic-v5'\}/);
  assert.match(intelligence, /'duri-abi-amr':\{reading:'douri-abu-amr',sourcePackageId:'kfgqpc-douri-abu-amr-uthmanic-v3'\}/);
  assert.match(intelligence, /export function practiceReadingFor\(deliveryKey\?:string\)\{return deliveryKey\?DELIVERY_TO_INTELLIGENCE\[deliveryKey\]:undefined\}/,
    'an unknown key returns nothing rather than falling back to another narration');
  assert.doesNotMatch(intelligence, /DELIVERY_TO_INTELLIGENCE\[[^\]]*\]\|\|/, 'and never falls through to a default reading');
});

/* ── ١٤ — لا إنجليزية في وجه الجهة ─────────────────────────────────────── */

test('an incident stored with an English title is still read in Arabic', () => {
  assert.equal(incidentTitle({ title: 'Secure question provisioning missing', type: 'quran_source_discrepancy' }, true),
    'تعذّر تجهيز الأسئلة');
  assert.equal(incidentTitle({ title: 'تعذّر بدء الجلسة', type: 'conflict_routing' }, true), 'تعذّر بدء الجلسة',
    'an Arabic title is kept as written');
  assert.equal(incidentTitle({ title: 'Anything', type: 'power' }, false), 'Anything', 'English UI keeps the raw title');

  /* وكل نوع له اسم — فلا يسقط نوعٌ جديد إلى الإنجليزية صامتًا. */
  const types = read('src/types/index.ts').match(/type: '(power[^;]*)'/)?.[1].split(`' | '`) || [];
  assert.ok(types.length >= 19, 'the incident type union was found');
  for (const t of types) assert.ok(INCIDENT_TYPE_ARABIC[t as keyof typeof INCIDENT_TYPE_ARABIC], `${t} needs an Arabic name`);
});

test('the exceptions panel says what it is, in one screen and one table', () => {
  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.match(overview, /ما يحتاج تدخّلك/);
  assert.match(overview, /أعطالٌ وحالات مراجعة وقعت أثناء التشغيل ولم تُغلق بعد/);

  /* وجدول الأسماء واحد: شاشتان تعرضان الأعطال، ونسختان تفترقان عند أول نوعٍ يُضاف. */
  for (const file of ['src/components/admin/CompetitionOverview.tsx', 'src/components/operations/CommandCenter.tsx']) {
    assert.match(read(file), /import \{ incidentTitle \} from/, `${file} reads the shared table`);
  }
});

/* ── مراجعة Codex على #155 — كل ملاحظة تحرسها حالة ───────────────────────── */

test('a stranded session is judged by shared state, never by this tab alone', () => {
  /*
   * `activeSession` محليٌّ لهذا المتصفّح، وصفوف المتسابقين واللجان مزامَنة. فمتسابقٌ
   * يُحكَّم الآن على جهازٍ آخر كان يبدو «عالقًا» من هنا، وفكُّه يفتح له جلسةً ثانية
   * بينما الأولى جارية — وهذا أسوأ مما جاء الإصلاح ليعالجه.
   */
  const store = read('src/lib/store.ts');
  assert.match(store, /if \(globalState\.committees\.some\(c => c\.competitionId === current\.competitionId && c\.currentParticipantId === participantId\)\) return false;/,
    'a committee that claims the participant is authoritative across devices');
  assert.match(store, /const enteredAt = \[\.\.\.\(current\.statusHistory \|\| \[\]\)\]\.reverse\(\)\.find\(h => h\.status === 'in_session'\)\?\.timestamp;/);
  assert.match(store, /if \(enteredAt && Date\.now\(\) - new Date\(enteredAt\)\.getTime\(\) < graceMs\) return false;/,
    'a session that began a minute ago is not stranded, whatever the sync lag');
});

test('a server runtime that belongs to another panel or reading stops the session', () => {
  /*
   * الغياب يُرتدّ عنه، والتضارب يُوقف: حزمةٌ موجودة لكنها للجنةٍ أخرى ليست غيابًا،
   * والارتداد عنها يتخطّى ضماناتها ويقرأ أسئلة لجنةٍ في لجنةٍ سواها.
   */
  const store = read('src/lib/store.ts');
  assert.match(store, /const mismatch=reason==='SERVER_QUESTION_RUNTIME_COMMITTEE_MISMATCH'\|\|reason==='SERVER_QUESTION_RUNTIME_READING_MISMATCH';/);
  /* يُقرأ ما بين بداية الفرع ونهايته المعلَّمة بتعليق الارتداد، لا حتى أول قوسٍ مغلق —
     فأوّل قوسٍ هنا يقع داخل قالب نصّي. */
  const start = store.indexOf('if(mismatch){');
  const end = store.indexOf('لا حزمة خادمية لهذا المتسابق', start);
  assert.ok(start >= 0 && end > start, 'the mismatch branch precedes the fallback');
  assert.ok(store.slice(start, end).includes('return false;'),
    'a mismatch returns false rather than falling through to the on-device draw');
  assert.match(store, /حزمة الأسئلة الخادمية لا تطابق هذه الجلسة/, 'and is raised as an incident by name');
});

test('a bulk export never hands out a card the server cannot resolve', () => {
  const store = read('src/lib/store.ts');
  assert.match(store, /const out=await ensureParticipantJourneyAccess\(participant\.id\);if\(out&&!journeyAccessFailure\)ready\.push\(out\);else failed\.push\(participant\.id\)/,
    'only a published record is exportable, even though the single card still opens locally');
});

test('an offline pass keeps its warning instead of looking healthy', () => {
  const store = read('src/lib/store.ts');
  assert.doesNotMatch(store, /\{journeyAccessFailure='';return next;\}/, 'the branch that erased the reason is gone');
  assert.match(store, /journeyAccessFailure=published==='OFFLINE'\|\|published==='NOT_SIGNED_IN'\?published/,
    'and offline is named as offline, not as a permission refusal — both fail the local write too');
});

test('the readiness gate knows every narration the delivery layer knows', () => {
  /* ثلاث نسخ من جدول واحد كانت تفترق عند أول إضافة؛ صار في وحدة طرفية بلا استيراد. */
  const core = read('src/lib/scientific-core.ts');
  /* الاسم صار يقول ما يقيسه: تسليمُ النصّ لا سلطةُ الناشر. والاشتقاق من الوحدة الطرفية كما هو. */
  assert.match(core, /const DELIVERED_TEXT_RAWI_IDS=new Set<string>\(DELIVERED_RAWI_IDS\);/);
  assert.match(core, /import \{ DELIVERED_RAWI_IDS \} from '\.\/delivered-readings';/,
    'read from the leaf module, not from the pool it already imports — that would be a cycle');

  const table = read('src/lib/delivered-readings.ts');
  assert.doesNotMatch(table, /^import /m, 'the shared table imports nothing, so no load order can empty it');
});

test('no readiness fix points at the deleted scientific screen', () => {
  assert.doesNotMatch(read('src/components/admin/ReadinessLab.tsx'), /mizan:open-scientific/);
  assert.doesNotMatch(read('src/types/index.ts'), /fixTarget:'competition_dna'\|'scientific'/);
  assert.doesNotMatch(read('src/lib/policy-compiler.ts'), /fixTarget:'scientific'/);
});

test('a delivery-Mushaf draw is recorded as what it is', () => {
  /* وصفُ نصٍّ رسمي بأنه «حزمة تطوير» يكذب على المدقّق في أثرٍ يُحتجّ به. */
  const store = read('src/lib/store.ts');
  assert.doesNotMatch(store, /Development-only question fixture/);
  assert.doesNotMatch(store, /حزمة تطوير \$\{participant\.code\}/);
  assert.match(store, /حزمة أسئلة \$\{participant\.code\} من مصحف التسليم الرسمي/);
  assert.match(store, /difficultyMetadataVersion:sourceMode==='CERTIFIED_SOURCE'\?`QG:\$\{source!\.packageHash\}`:'DELIVERY_MUSHAF'/);
});

test('a repeated query parameter is refused, not quietly reinterpreted', () => {
  /*
   * `?surah=1&surah=2` يجعل Express يسلّم مصفوفةً حيث يتوقّع القارئ نصًّا. أكثر المواضع
   * تنجو بالمصادفة — `Number(['1','2'])` يعطي NaN فيُرفض — والنجاة بالمصادفة ليست حراسة.
   */
  const server = read('server.ts');
  assert.match(server, /const soleParam=\(value:unknown,name:string\):string=>\{/);
  assert.match(server, /if\(Array\.isArray\(value\)\)throw new Error\(`QUERY_PARAM_REPEATED:\$\{name\}`\);/,
    'a repeated parameter is refused outright — taking the first silently hides which one was used');

  /* والمسارَان اللذان يغذّيان محرّك التتبّع يمرّان به، لا الجديد وحده. */
  for (const param of ['reading', 'surah', 'startAyah', 'endAyah', 'sourcePackageId']) {
    const uses = server.split(`soleParam(req.query.${param},'${param}')`).length - 1;
    assert.equal(uses, 2, `${param} is normalised on both the practice and the judging route`);
  }
  assert.doesNotMatch(server, /surah:req\.query\.surah/, 'no raw query value reaches the service any more');
  assert.match(server, /const bytes:Buffer=Buffer\.isBuffer\(req\.body\)\?req\.body:Buffer\.alloc\(0\);/,
    'and the audio body is a definite Buffer before it is measured');
});

test('both routes into the alignment engine are rate-limited, not just the new one', () => {
  /*
   * مسار المحكّم يحمل نفس الحمولة وينادي المحرّك نفسه، وكان بلا حدّ منذ كُتب. لم يظهر
   * حتى لمس هذا التغيير سطره — ومعالجةُ الجديد وتركُ القديم تُبقي الباب نفسه مفتوحًا.
   */
  const server = read('server.ts');
  assert.match(server, /'\/api\/quran\/alignment\/shadow\/audio',alignmentAudioIpRateLimit,requireGovernanceRoles\(\['judge','head_judge',\]\),alignmentAudioRateLimit/);
  assert.match(server, /const alignmentAudioIpRateLimit:RequestHandler=rateLimit\(\{/);
  assert.match(server, /const alignmentAudioRateLimit:RequestHandler=rateLimit\(\{/);
});

test('the alignment service checks its own payload rather than trusting its callers', () => {
  /* التوقيع يزول عند التشغيل، فقياس `length` على نصٍّ أو مصفوفة يبدو فحصًا ناجحًا وهو ليس. */
  const service = read('server/quran-intelligence-service.ts');
  /*
   * النصّ والمصفوفة يُستبعدان بالاسم: كلاهما يملك `length`، فيمرّ فحصُ الحجم ناجحًا وهو
   * يقيس محارف أو عناصر لا بايتات. ثم يُشترط `Uint8Array` — بنيةُ بايتاتٍ حقيقية.
   */
  assert.match(service, /if\(Array\.isArray\(input\.bytes\)\|\|typeof input\.bytes==='string'\|\|!\(input\.bytes instanceof Uint8Array\)\)/);
  assert.match(service, /const chunkSize=input\.bytes\.length;/);
  assert.doesNotMatch(service, /if\(!input\.bytes\.length\|\|input\.bytes\.length>2_000_000\)/,
    'the unguarded double read of .length is gone');
});
