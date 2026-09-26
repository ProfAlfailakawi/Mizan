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

/*
 * قرار المالك (٢٦‑٩): تبويب «التشغيل» في هوية المسابقة حُذف، فصارت قرارات التوزيع افتراضاتٍ
 * ثابتة. لم يعد المطلوب «محرّرًا لكل حقل» بل ألّا يبقى محرّرٌ يتيم، وأن تبقى الافتراضات آمنة.
 */
test('the operations sub-tab and its routing editor are gone from competition DNA', () => {
  assert.doesNotMatch(editor, /const DistributionPolicyBlock=/);
  assert.doesNotMatch(editor, /const OperationsPolicySection=/);
  assert.doesNotMatch(editor, /\['operations',QrCode/);
});

test('the engine still reads each one, so the editor is not writing into a void', () => {
  assert.match(store, /operations\.distributionMode/, 'the gate branches on the mode');
  assert.match(store, /operations\.unmatchedArrivalPolicy/);
  assert.match(store, /delegationShareCap: ops\.delegationShareCap/);
  assert.match(store, /maxQueueDepth: ops\.maxQueueDepth/);
});

test('the defaults are unchanged, so an organization that signs nothing keeps today’s behaviour', () => {
  const ops = getCompetitionPolicy({ } as Competition).operations;
  assert.equal(ops.distributionMode, 'ON_ARRIVAL');
  assert.equal(ops.unmatchedArrivalPolicy, 'INCIDENT');
  assert.equal(ops.requireReadingQualifiedPanel, false);
  assert.equal(ops.delegationShareCap, 0.4);
  assert.equal(ops.maxQueueDepth, 0);
});

