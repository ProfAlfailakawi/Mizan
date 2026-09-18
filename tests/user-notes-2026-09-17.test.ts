import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bandsFromInkProfile, bandSpan } from '../src/lib/mushaf-line-bands';
import { journeyTokenHeldByHolderOnly, journeyTokenWithheldLocally } from '../src/lib/local-snapshot-privacy';
import type { Participant } from '../src/types';

const read = (p: string) => fs.readFileSync(p, 'utf8');

/* ── ١ — القمرة: بارتفاع الشاشة، بلا شريطٍ علويّ، وأزرارٌ متناسقة ─────── */

/*
 * هذا الاختبار كان يحرس تخطيطًا سابقًا: شريطٌ لاصق فوق، ولوحةٌ لاصقة تحت، وأزرارٌ ارتفاعها
 * ١٥٢px «لأن المحكّم يعمل واقفًا ويصيبها بالإبهام». وقد رُفض ذلك التخطيط بعد رؤيته في
 * القاعة: المصحف — وهو الشيء الوحيد الذي يُنظر إليه أثناء التلاوة — كان محصورًا بين
 * شريطين ولا يُرى كاملًا إلا بتمرير، والمحكّم لا يملك يدًا فارغة للتمرير.
 *
 * فبقي الاختبار وتبدّل ما يحرسه: لا شكلٌ بعينه، بل ثلاثة شروطٍ قابلة للكسر — أن تملأ
 * القمرة الشاشة مرّةً ولا تُمرَّر، وألّا يعود شريطٌ علويّ يقتطع من فوق المصحف، وأن يكون
 * للأزرار مقاسٌ واحد. والإبهام يصيب ٥٨px بلا تصويب؛ وما زاد كان يُؤخذ من المصحف.
 */

test('the judge cockpit fills the screen exactly once and never scrolls as a page', () => {
  const css = read('src/index.css');

  assert.match(css, /\.mizan-judge-os\{\s*\n\s*height:calc\(100dvh - 64px - var\(--mizan-shell-pb, 0px\)\);/, 'the cockpit is exactly one screen tall');

  /*
   * وحشوةُ الهيكل تُطرح لأنها معلَنة، لا مخمَّنة.
   *
   * بيئة العرض تضيف `pb-28` لتُبعد المحتوى عن شريطها المثبَّت. وهي صحيحةٌ لصفحةٍ تُمرَّر،
   * وخاطئةٌ لسطحٍ يقيس ارتفاعه بنفسه: قِيس فخرج ١١٢px تُمرَّر تحت قمرةٍ تظنّ أنها ملأت
   * الشاشة. فيُنشر المقدار في متغيّر بدل أن يُنسخ رقمه في كل سطح.
   */
  const app = read('src/App.tsx');
  assert.match(app, /'--mizan-shell-pb':IS_DEMO_SESSION\?'7rem':'0px'/, 'the shell publishes its own reserve');
  assert.match(css, /\.mizan-judge-os\{[\s\S]{0,300}?overflow:hidden;/, 'and the page itself does not scroll');

  /* `dvh` لا `vh`: شريط متصفّح الجوال يتمدّد، و`vh` يقيس الحالة الكبرى فتُقصّ اللوحة. */
  assert.doesNotMatch(css, /\.mizan-judge-os\{\s*\n\s*height:calc\(100vh/, 'a mobile browser bar would crop a vh-sized cockpit');

  /* ويُمرَّر ما بداخلها إن طال — وهذا ما يجعل الخارج ثابتًا. */
  assert.match(css, /\.mizan-judge-page\{[^}]*min-height:0;[^}]*overflow:auto/, 'the Mushaf scrolls inside its own box');
  assert.match(css, /\.mizan-judge-deck\{[^}]*min-height:0;[^}]*overflow:auto/, 'and so does the deck');
});

test('the top strip is gone, and nothing it carried was lost', () => {
  const css = read('src/index.css');
  const judge = read('src/components/judge/JudgeOS.tsx');

  /* الشريط نفسه: لا صنفَ له ولا استعمال. */
  assert.doesNotMatch(css, /\.mizan-judge-strip/, 'the sticky top strip is removed from the stylesheet');
  assert.doesNotMatch(judge, /mizan-judge-strip/, 'and from the screen');

  /* وما كان فيه انتقل إلى رأس اللوحة: الاسم، والحالة، والمؤقّت، وموضع السؤال. */
  assert.match(judge, /mizan-judge-brief/, 'the deck carries a brief instead');
  assert.match(judge, /\{formatTime\(elapsed\)\}/, 'the session clock survived');
  assert.match(judge, /<Ratio value=\{activeSession\.currentQuestionIndex\+1\} of=\{totalQuestions\}\/>/, 'so did the passage counter');
  assert.match(judge, /\{displayName\|\|'—'\}/, 'and who is in front of the judge');
});

test('every scoring button is the same size, and it is a thumb’s size — not a card', () => {
  const css = read('src/index.css');

  const action = css.match(/\.mizan-judge-action\{[\s\S]*?\}/)?.[0] || '';
  const height = Number(action.match(/min-height:(\d+)px/)?.[1] || 0);
  assert.ok(height >= 44, `a touch target must stay reachable (got ${height}px)`);
  assert.ok(height <= 72, `a scoring button is not a card (got ${height}px)`);

  /* مقاسٌ واحد لكل زرّ: الخصم يغيّر لون العمود وحجم رقمه، لا ارتفاع الزرّ. */
  assert.doesNotMatch(css, /\.mizan-judge-action\[data-weight="high"\]\{[^}]*min-height/, 'severity must not change the button height');
  assert.doesNotMatch(css, /\.mizan-judge-deck \.mizan-judge-action\{[^}]*min-height/, 'and neither does where it is rendered');

  /* والعمود اللوني باقٍ: هو ما يقول أيَّ معيارٍ تسجّل وكم يكلّف، بلا تضخيم الزرّ. */
  assert.match(css, /\.mizan-judge-action\[data-weight="high"\]\{ --ja-weight:\d+px/, 'the weight spine still encodes the penalty');
});

test('the Mushaf page is sized from what is left on screen, not a fixed share of it', () => {
  const css = read('src/index.css');
  assert.match(css, /\.mizan-mushaf-page\{ max-height:80vh; \}/);
  assert.match(css, /@media \(min-width:640px\)\{ \.mizan-mushaf-page\{ max-height:min\(80vh, calc\(100dvh - 64px - 26rem\)\) \} \}/);
  assert.match(css, /@media \(min-width:1024px\)\{ \.mizan-mushaf-page\{ max-height:calc\(100dvh - 64px - 9\.5rem\) \} \}/);
  /*
   * وداخل القمرة يحكم الوعاء لا رقمٌ محسوب: الطرح الثابت أعلاه قِيس على تخطيطٍ فيه شريطٌ
   * علويّ ولوحةٌ سفلية، وقد زالا — فصار يقتطع من المصحف ما لم يعد مشغولًا.
   */
  assert.match(css, /\.mizan-judge-os \.mizan-mushaf-page\{ max-height:100%; \}/, 'inside the cockpit the container decides');
  const surface = read('src/components/judge/OfficialMushafSurface.tsx');
  assert.match(surface, /className="mizan-mushaf-page block w-auto/);
  assert.doesNotMatch(surface, /max-h-\[72vh\] sm:max-h-\[80vh\]/, 'the fixed viewport share is what cropped the page');
});

/* ── ٢ — التظليل على السطر بالضبط ─────────────────────────────────────── */

/** صفحة مصطنعة: أسطر حبر يفصلها بياض، بهوامش غير متساوية كصفحةٍ فيها عنوان سورة. */
const page = (bandsSpec: [number, number][], height: number) => {
  const ink = new Array(height).fill(0);
  for (const [start, end] of bandsSpec) for (let y = start; y <= end; y += 1) ink[y] = 100;
  return ink;
};

test('line bands are measured from the page, so an uneven top margin does not shift the lens', () => {
  /* هامش علوي ٢٠٪ لا ٨٫٥٪، وهو ما يقع في صفحةٍ تبدأ بعنوان سورة. */
  const ink = page([[200, 240], [300, 340], [400, 440]], 1000);
  const bands = bandsFromInkProfile(ink, { expectedLines: 3 });
  assert.equal(bands.length, 3);
  assert.ok(Math.abs(bands[0].top - 0.2) < 0.001, 'the first line is where the ink is, not where a constant says');
  const span = bandSpan(bands, 2, 3)!;
  assert.ok(Math.abs(span.top - 0.3) < 0.001);
  assert.ok(Math.abs(span.top + span.height - 0.441) < 0.002);
});

test('a thin gap inside one line is merged, because a diacritic does not end a line', () => {
  const ink = page([[100, 118], [121, 140]], 1000);
  assert.equal(bandsFromInkProfile(ink).length, 1);
});

test('speckles and page borders are not counted as lines', () => {
  const ink = page([[5, 6], [100, 140], [300, 340]], 1000);
  assert.equal(bandsFromInkProfile(ink).length, 2);
});

test('an uncertain measurement returns nothing rather than a guess', () => {
  const ink = page([[100, 140], [300, 340]], 1000);
  assert.deepEqual(bandsFromInkProfile(ink, { expectedLines: 15 }), [], 'a count that disagrees with the page is not trusted');
  assert.deepEqual(bandsFromInkProfile([], {}), []);
  assert.deepEqual(bandsFromInkProfile(new Array(1000).fill(0)), [], 'a blank page has no lines');
});

test('a line outside the page is refused, so the lens never lands on the wrong line', () => {
  const bands = bandsFromInkProfile(page([[100, 140], [300, 340]], 1000));
  assert.equal(bandSpan(bands, 0, 1), null);
  assert.equal(bandSpan(bands, 1, 3), null);
  assert.equal(bandSpan([], 1, 1), null);
});

test('the lens prefers the measured band and keeps the estimate only as a fallback', () => {
  const surface = read('src/components/judge/OfficialMushafSurface.tsx');
  assert.match(surface, /const measured=bands&&bands\.length\?bandSpan\(bands,start,end\):null/);
  assert.match(surface, /const top=measured\?measured\.top\*100:textTop\+/);
});

test('the page actually measures its bands and hands them to every lens', () => {
  /*
   * القياس بلا توصيل تقديرٌ باسمٍ جديد: كانت `useLineBands` مبنيّة ولا يستدعيها أحد،
   * فبقيت كل العدسات على الحساب الثابت والتظليل يقع قرب السطر لا عليه.
   */
  const surface = read('src/components/judge/OfficialMushafSurface.tsx');
  assert.match(surface, /const bands=useLineBands\(url,audioSpot\?\.lineCount\|\|focus\.lineCount\|\|15\)/);
  const lenses = surface.match(/<FocusLens /g) || [];
  const wired = surface.match(/<FocusLens [^>]*bands=\{bands\}/g) || [];
  assert.ok(lenses.length >= 3);
  assert.equal(wired.length, lenses.length, 'a lens without bands falls back to the constant estimate silently');
});

/* ── ٣ — شاشة المحكّم بلا أدوات مراجعة ────────────────────────────────── */

test('review and tracking tools are gone from the judge screen', () => {
  const judge = read('src/components/judge/JudgeOS.tsx');
  assert.doesNotMatch(judge, /أدوات المراجعة والتتبّع/);
  assert.doesNotMatch(judge, /<SurfaceBoundary/);
});

/* ── ٤ — زمن الجلسة يمشي ──────────────────────────────────────────────── */

test('session time is derived from a start stamp, not a counter nothing increments', () => {
  const state = read('src/lib/store-state.ts');
  const store = read('src/lib/store.ts');
  assert.match(state, /startedAt\?: string;/);
  assert.match(state, /carriedSeconds\?: number;/);
  assert.match(store, /const sessionElapsedSeconds = \(\) => \{/);
  assert.match(store, /carried \+ Math\.max\(0, Math\.floor\(\(Date\.now\(\) - started\) \/ 1000\)\)/);
  /* كل قارئ يقرأ المشتقّ: الشاشة والسجلّ ومتوسط اللجنة ونقطة الاستمرارية. */
  assert.match(store, /relativeSeconds: sessionElapsedSeconds\(\)/);
  assert.match(store, /timestampSec:sessionElapsedSeconds\(\)/);
  assert.match(store, /const sessionMinutes=Math\.round\(sessionElapsedSeconds\(\)\/60\*10\)\/10;/);
  assert.match(store, /durationSeconds:sessionElapsedSeconds\(\),eventIds:/);
  const judge = read('src/components/judge/JudgeOS.tsx');
  assert.match(judge, /formatTime\(elapsed\)/);
  assert.doesNotMatch(judge, /formatTime\(activeSession\.durationSeconds\)/);
});

test('a restored session keeps the time it had already spent', () => {
  const store = read('src/lib/store.ts');
  assert.match(store, /globalState\.activeSession\.carriedSeconds=cp\.durationSeconds;globalState\.activeSession\.startedAt=new Date\(\)\.toISOString\(\);/);
});

/* ── ٥ — صوت النداء رجل ───────────────────────────────────────────────── */

test('the spoken cue is a male voice everywhere it is produced', () => {
  /*
   * الصوت اختيارُ أذنٍ لا اجتهادُ مبرمج.
   *
   * كان الافتراض `Charon` على ترجيحٍ بأنه ذكوريّ، فسمعه صاحب المسابقة أنثويًّا. و`Algenib`
   * هو ما سُمع فعلًا وأُقرّ، فهو المثبَّت — ولا يُبدَّل إلا بأذنٍ تسمع بديله أولًا.
   */
  assert.match(read('server/cue-tts.ts'), /MIZAN_CUE_TTS_VOICE \|\| 'Algenib'/);
  assert.match(read('scripts/generate-cue-audio.mjs'), /MIZAN_CUE_TTS_VOICE \|\| 'Algenib'/);
  const judge = read('src/components/judge/JudgeOS.tsx');
  assert.match(judge, /const men=pool\.filter\(male\)/, 'the device fallback prefers a male voice before quality');
  assert.match(judge, /const best=men\.find\(fine\)\|\|men\[0\]\|\|pool\.find\(fine\)\|\|pool\[0\]/);
});

/* ── ٦ — البوابة للموضع الأول وحده ────────────────────────────────────── */

test('the reveal gate is asked once per session, not once per passage', () => {
  const store = read('src/lib/store.ts');
  assert.match(store, /g\.questionIndex<questionIndex&&g\.status==='REVEALED'&&g\.participantPresence\.verified/);
  assert.match(store, /status:inheritedReady\?'REVEALED':'SEALED'/);
  /* اللجنة قد تتبدّل، فالنصاب يُعاد حسابه على أعضائها الآن. */
  assert.match(store, /approvals:opened\.approvals\.filter\(a=>required\.includes\(a\.judgeId\)\)/);
  /* وطور الجلسة يتبع الكشف، وإلا لما عمل «إنهاء الموضع» وهو يشترط طور التلاوة. */
  assert.match(store, /globalState\.activeSession\.questionPhase='RECITING';\s*\n\s*const item=globalState\.activeSession\.questionSelection/);
});

/* ── ٧ — QR وتصدير البطاقات ───────────────────────────────────────────── */

const participant = (extra: Partial<Participant>): Participant => ({
  id: 'p1', code: 'A-1', competitionId: 'c1', organizationId: 'o1',
  fullName: 'A', fullNameArabic: 'أ', email: 'a@b.c', phone: '+965', country: 'Kuwait',
  nationality: 'كويتي', nationalIdOrPassport: 'X', dateOfBirth: '2005-01-01', gender: 'male',
  categoryId: 'cat', riwaya: 'حفص', institution: '', specialNeeds: false, documents: [],
  status: 'approved', statusHistory: [], createdAt: '2026-01-01', ...extra,
} as Participant);

test('a pass the organizer never held is not treated as one awaiting sync', () => {
  const publicReg = participant({ journeyAccessTokenHash: 'h', journeyTokenCustody: 'holder_only' });
  assert.equal(journeyTokenHeldByHolderOnly(publicReg), true);
  assert.equal(journeyTokenWithheldLocally(publicReg), false, 'nothing is coming, so nothing is waited for');

  const organizerIssued = participant({ journeyAccessTokenHash: 'h', journeyTokenCustody: 'organizer' });
  assert.equal(journeyTokenWithheldLocally(organizerIssued), true, 'this one really is on another device');
});

test('records written before the custody marker are read from their own history', () => {
  const legacy = participant({
    journeyAccessTokenHash: 'h',
    statusHistory: [{ status: 'submitted', timestamp: '2026-01-01', actor: 'Public registration API' }],
  });
  assert.equal(journeyTokenHeldByHolderOnly(legacy), true);
  assert.equal(journeyTokenWithheldLocally(legacy), false, 'existing participants are not left permanently blocked');
});

test('a participant holding a live token is never considered withheld', () => {
  const held = participant({ journeyAccessToken: 'mz_journey_x', journeyAccessTokenHash: 'h' });
  assert.equal(journeyTokenWithheldLocally(held), false);
  assert.equal(journeyTokenWithheldLocally(participant({})), false, 'no hash means no pass was ever issued');
});

test('the public registration API stamps custody so the organizer can issue later', () => {
  assert.match(read('server/public-registration.ts'), /journeyTokenCustody:'holder_only'/);
});

test('issuing for a holder-only pass goes through the server and reports success, not failure', () => {
  const store = read('src/lib/store.ts');
  assert.match(store, /if\(journeyTokenHeldByHolderOnly\(current\)&&!current\.journeyAccessToken\)\{/);
  assert.match(store, /const issued=await reissueParticipantJourneyAccess\(participantId\);/);
  /* خبرٌ لا فشل: لو عُدّ فشلًا لأسقطته دفعة التصدير، فعاد العطب من باب آخر. */
  assert.match(store, /journeyAccessNotice='HOLDER_TOKEN_REPLACED';journeyAccessFailure='';/);
  assert.match(store, /const lastJourneyAccessNotice=\(\)=>journeyAccessNotice;/);
  const overview = read('src/components/admin/CompetitionOverview.tsx');
  assert.match(overview, /case 'HOLDER_TOKEN_REPLACED':/);
  assert.match(overview, /store\.lastJourneyAccessNotice\(\)/);
});
