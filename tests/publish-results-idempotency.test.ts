import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * نشرُ النتائج حدثٌ يقع مرّة، وقد يُنقَر عليه مرّتين.
 *
 * زرٌّ يُضغط مرتين، أو إعادةُ محاولةٍ بعد انقطاعٍ لحظي، أو تبويبان مفتوحان — كلُّها تنادي
 * الدالة نفسها مرّتين. وبلا حارسٍ يعني ذلك ختمَ وقتِ نشرٍ جديد، وحدثًا ثانيًا في سجلّ
 * التدقيق، وإشعارَ «صدرت نتيجتك» يصل كلَّ متسابقٍ مرّةً أخرى — ويقرؤه صاحبُه نتيجةً جديدة.
 *
 * الدالة تعيش داخل خطّاف المخزن ولا تُحمَّل في اختبار عقدة (تستورد firebase)، فيُقرأ
 * جسمُها من المصدر ويُتحقَّق من الحارس وموضعه: قبل أي أثرٍ جانبي لا بعده.
 */

const STORE = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'store.ts'), 'utf8');

function publishBody(): string {
  const start = STORE.indexOf('const publishResults = () => {');
  assert.ok(start > -1, 'publishResults is present');
  const end = STORE.indexOf('const completeCompetition', start);
  assert.ok(end > start, 'the function body is bounded');
  return STORE.slice(start, end);
}

test('a repeated publish returns success without doing anything a second time', () => {
  const body = publishBody();
  const guard = "if(competitionResults.every(r=>r.status==='published')) return true;";
  assert.ok(body.includes(guard), 'an already-published competition short-circuits to success');

  // والحارس قبل كل أثرٍ جانبي: الختم، والكتابة، والسجلّ، والإشعارات.
  const guardAt = body.indexOf(guard);
  for (const sideEffect of [
    'const publishedAt=new Date().toISOString();',
    "persistScopedDocument('results'",
    "action:'RESULTS_PUBLISHED'",
    "appendParticipantNotifications(p,'result.published')",
    'markCompetitionConfigChanged();',
  ]) {
    const at = body.indexOf(sideEffect);
    assert.ok(at > -1, `the side effect is still there: ${sideEffect}`);
    assert.ok(guardAt < at, `the guard runs before: ${sideEffect}`);
  }
});

test('publication still refuses the cases it refused before', () => {
  const body = publishBody();
  // لا صلاحية → لا نشر.
  assert.ok(body.includes("!can(globalState.currentUser.role,'result.publish')"));
  // نتائج غير مختومة → لا نشر.
  assert.ok(body.includes("competitionResults.some(r=>r.status!=='sealed' && r.status!=='published')"));
  // ولا يجمع شخصٌ واحد بين الختم والنشر.
  assert.ok(body.includes("r.sealMetadata?.sealedById===globalState.currentUser.id"));
  assert.ok(body.includes("'RESULT_PUBLICATION_SOD_BLOCKED'"));
  // وفصلُ المهامّ يُفحص قبل الحارس الجديد، فلا يصير التكرار بابًا يلتفّ عليه.
  assert.ok(body.indexOf("r.sealMetadata?.sealedById===globalState.currentUser.id")
    < body.indexOf("if(competitionResults.every(r=>r.status==='published')) return true;"),
    'separation of duties is checked before the idempotency short-circuit');
});

/*
 * قفلُ تقييم المحكّم محميٌّ بحارسه الخاص منذ قبل، ويُثبَّت هنا حتى لا يسقط في تعديلٍ لاحق:
 * جلسةٌ مقفلة لا تُقفل مرّتين، والإرسال يُكتب بمفتاحٍ طبيعي (الجلسة + المحكّم) فلا يتضاعف
 * صفٌّ لو وصل من جهازين.
 */
test('a judge assessment cannot be locked or written twice', () => {
  const start = STORE.indexOf('const lockAndSubmitAssessment');
  assert.ok(start > -1);
  const body = STORE.slice(start, start + 6000);
  assert.ok(body.includes('if (globalState.activeSession.isLocked) return;'), 'a locked session refuses a second submit');
  assert.match(STORE, /globalState\.judgeSubmissions = \[\.\.\.globalState\.judgeSubmissions\.filter\(s => !\(s\.sessionId === submission\.sessionId && s\.judgeId === submission\.judgeId\)\), submission\]/,
    'the submission is keyed by (session, judge) so a retry replaces rather than duplicates');
  assert.match(STORE, /persistScopedDocument\('judge_submissions',`\$\{submission\.sessionId\}_\$\{submission\.judgeId\}`/,
    'and it persists to that same natural key, never to a fresh id');
});
