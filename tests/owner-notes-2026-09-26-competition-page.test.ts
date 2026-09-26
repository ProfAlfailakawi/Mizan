import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getCompetitionPolicy } from '../src/lib/competition-config';

const overview = fs.readFileSync('src/components/admin/CompetitionOverview.tsx', 'utf8');
const engine = fs.readFileSync('src/components/admin/QuestionEngineWorkspace.tsx', 'utf8');

/* قرارات المالك (٢٦‑٩): إعداداتٌ حُذفت من الواجهة صارت ثابتة في السياسة، ولا تُطفئها قيمةٌ قديمة محفوظة. */
test('removed settings are fixed defaults that stored values cannot turn off', () => {
  const stale: any = { policy: { questions: { avoidRepeatWithinRound: false, diversity: { acrossJuz: false, acrossSurah: false, mutashabihatBalance: false }, transitionCue: { enabled: false, phraseArabic: 'بارك الله فيك', phraseEnglish: 'Stop', selectedPhraseIndexes: [2, 3], autoAdvanceDelayMs: 900 } }, judging: { mode: 'specialized_judges', scoreEntryMode: 'direct_score', requireAudioRecording: false }, privacy: { audioRetentionDays: 5, documentRetentionDays: 5, allowAiProcessing: false, displayParticipantNameOnPublicScreens: true } } };
  const p = getCompetitionPolicy(stale);
  assert.equal(p.questions.avoidRepeatWithinRound, true);
  assert.deepEqual(p.questions.diversity, { acrossJuz: true, acrossSurah: true, mutashabihatBalance: true });
  assert.equal(p.questions.transitionCue?.phraseArabic, 'حسبك');
  assert.equal(p.questions.transitionCue?.phraseEnglish, 'حسبك');
  assert.equal(p.questions.transitionCue?.enabled, false, 'the audio-cue switch is the one thing the organizer keeps');
  assert.equal(p.questions.transitionCue?.selectedPhraseIndexes, undefined);
  assert.equal(p.judging.mode, 'hybrid');
  assert.equal(p.judging.scoreEntryMode, 'event_based');
  assert.equal(p.judging.requireAudioRecording, true);
  assert.deepEqual([p.privacy.audioRetentionDays, p.privacy.documentRetentionDays, p.privacy.allowAiProcessing, p.privacy.displayParticipantNameOnPublicScreens], [90, 365, true, false]);
  assert.ok(p.workflow.every(w => w.enabled));
});

test('removed blocks are gone from the competition page', () => {
  for (const gone of ['إعدادات السحب المتقدمة', 'عبارات الإنهاء', 'إعدادات تحكيم متقدمة', 'النزاهة والسلوك', 'الخصوصية والاحتفاظ', "ar?'المسار':'Workflow'", "['operations',QrCode", 'الأخضر مؤتمت', 'أعد الفحص', 'إعادة النشر'])
    assert.ok(!overview.includes(gone), `still present: ${gone}`);
});

test('scope and questions share one sidebar entry with two inner tabs; passage length lives with the scope', () => {
  assert.match(overview, /const ScopeAndQuestions=/);
  assert.match(overview, /\['scope',BookMarked,ar\?'النطاق':'Scope'\],\['questions',Sparkles,ar\?'الأسئلة':'Questions'\]/);
  assert.doesNotMatch(overview, /\['questions',Sparkles,ar\?'الأسئلة':'Questions'\],\['judging'/);
  assert.doesNotMatch(overview, /طول مقطع السؤال/);
  assert.match(engine, /طول مقطع السؤال/);
  // مدة السؤال في مكان واحد: الأسئلة، لا معايير التحكيم.
  assert.equal(overview.split("'مدة السؤال بالدقائق'").length - 1, 1);
});

test('the overview speaks Arabic status and never prints the raw code or dash placeholders', () => {
  assert.match(overview, /registration_open:\{ar:'التسجيل مفتوح'/);
  assert.doesNotMatch(overview, /\{competition\.venueName\|\|'—'\}/);
  assert.match(overview, /أضف التاريخ والمكان/);
  assert.match(overview, /نسخ الرابط/);
  assert.match(overview, /أنت هنا/);
});

test('an English category name is never cross-wired from the Arabic one', () => {
  assert.doesNotMatch(overview, /name:draft\.name\.trim\(\)\|\|draft\.nameArabic\.trim\(\)/);
  assert.match(overview, /const englishCategoryName=/);
});

test('the official Quran library tab is for the platform owner only', () => {
  assert.match(engine, /const isPlatformOwner = store\.currentUser\.role === 'super_admin'/);
  assert.match(engine, /\.\.\.\(isPlatformOwner \? \[\['library'/);
  assert.match(engine, /tab === 'library' && isPlatformOwner &&/);
});

test('dual seal approval follows the policy alone, so the 1/2 → 2/2 flow shows in demo too', () => {
  for (const f of ['src/lib/store.ts', 'src/components/admin/ResultsDialogs.tsx']) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /requireDualApprovalToSeal\s*&&\s*\([^)]*judgesCountPerPanel/, f);
  }
});
