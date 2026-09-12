import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import type { Competition } from '../src/types';

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const editor = read('src/components/admin/CompetitionOverview.tsx');
const store = read('src/lib/store.ts');

/*
 * سياسةٌ يقرؤها المحرّك ولا تكتبها واجهة.
 *
 * خمسةُ حقول كانت معرَّفة في الأنواع، مقروءةً في التوزيع والبوابة، **مجمَّدةً على
 * الافتراضات** — لأن `OperationsPolicySection` لم يعرض واحدًا منها. فبابُ «قرارات تحتاج
 * توقيع الجهة» في وثيقة التصميم لم يكن فيه ما يُوقَّع، والجهة تُحاسَب على قرارٍ لم تتّخذه.
 *
 * وهذه ثغرةٌ لا يكشفها اختبار وحدة ولا فحصُ أنواع: الحقل موجود، والقارئ موجود، والكاتب
 * وحده غائب. فالحراسة على **وجود المحرّر** نفسه.
 */

const SETTABLE = [
  'distributionMode',
  'unmatchedArrivalPolicy',
  'requireReadingQualifiedPanel',
  'delegationShareCap',
  'maxQueueDepth',
] as const;

test('every routing policy the engine reads can be written from the policy editor', () => {
  const missing = SETTABLE.filter(k => !editor.includes(`p.operations.${k}=`));
  assert.deepEqual(missing, [], 'a policy the organization cannot set is a decision made on their behalf');
});

test('each control is reachable from the operations section, not stranded in the file', () => {
  assert.match(editor, /<DistributionPolicyBlock ar=\{ar\} policy=\{policy\} patch=\{patch\}\/>/);
  assert.match(editor, /const DistributionPolicyBlock=/);
});

test('the engine still reads each one, so the editor is not writing into a void', () => {
  assert.match(store, /operations\.distributionMode/, 'the gate branches on the mode');
  assert.match(store, /operations\.unmatchedArrivalPolicy/);
  assert.match(store, /ops\.requireReadingQualifiedPanel/);
  assert.match(store, /delegationShareCap: ops\.delegationShareCap/);
  assert.match(store, /maxQueueDepth: ops\.maxQueueDepth/);
});

test('the share cap is edited as a percentage and stored as a fraction, clamped both ways', () => {
  /* مسؤولُ مسابقةٍ يكتب ٤٠ لا ٠٫٤؛ وسقفٌ صفرٌ أو فوق المئة يُفرغ لجنةً أو يُلغي القيد بصمت. */
  assert.match(editor, /delegationShareCap=Math\.min\(1,Math\.max\(0\.1,v\/100\)\)/);
  assert.match(editor, /min=\{10\} max=\{100\}/);
});

test('the defaults are unchanged, so an organization that signs nothing keeps today’s behaviour', () => {
  const ops = getCompetitionPolicy({ } as Competition).operations;
  assert.equal(ops.distributionMode, 'ON_ARRIVAL');
  assert.equal(ops.unmatchedArrivalPolicy, 'INCIDENT');
  assert.equal(ops.requireReadingQualifiedPanel, false);
  assert.equal(ops.delegationShareCap, 0.4);
  assert.equal(ops.maxQueueDepth, 0);
});

test('each control states its consequence in words, not only its field name', () => {
  /* من يضبط هذه مسؤولُ مسابقة لا مبرمج: «سقف حصة الوفد» يُفهم، و`delegationShareCap` لا. */
  for (const phrase of ['متى تُسنَد اللجنة', 'حين لا تؤهّله أيُّ لجنة', 'سقف حصة الوفد', 'أقصى عمق للطابور', 'اشترط لجنة مؤهَّلة في الرواية'])
    assert.ok(editor.includes(phrase), `the editor must name the decision: ${phrase}`);
});
