/*
 * هويةٌ مقيّدةٌ بمسابقة لا تختم ولا تنشر ولا تصحّح في مسابقةٍ أخرى.
 *
 * كانت هذه المسارات تأخذ `competitionId` من الجسم ولا تقارنه بمطالبة الهوية؛ والمقارنةُ
 * الوحيدة في سجلّ التدقيق، بعد الأثر، وفي الإنتاج يُبتلع رفضُها. فيُثبت هنا: القاعدةُ نفسها،
 * والحارسُ في كلّ مسار، وأنه قبل أوّل أثر (سجلّ الأختام، سجلّ النشر، القرار، التدقيق).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { competitionScopeMismatch } from '../server/competition-scope';

test('a competition-bound identity is refused another competition; org-wide and unnamed are not', () => {
  assert.equal(competitionScopeMismatch({ competitionId: 'comp-a' }, 'comp-b'), true);
  assert.equal(competitionScopeMismatch({ competitionId: 'comp-a' }, 'comp-a'), false);
  assert.equal(competitionScopeMismatch({}, 'comp-b'), false, 'organisation-wide identity keeps its reach');
  assert.equal(competitionScopeMismatch({ competitionId: 'comp-a' }, ''), false, 'no id in the body falls back to the claim');
});

const SERVER = fs
  .readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

const routeBody = (route: string) => {
  const start = SERVER.indexOf(`app.post('${route}'`);
  assert.ok(start >= 0, `${route} must exist`);
  const next = SERVER.indexOf('app.post(', start + 1);
  return SERVER.slice(start, next > start ? next : undefined);
};

for (const [route, firstEffect] of [
  ['/api/results/seal', 'sealResult('],
  ['/api/results/publish', 'resultSealRegistry.sealersOf('],
  ['/api/results/score-correction', 'resultSealRegistry.latestFor('],
  ['/api/participants/reading-change', 'readingChangeDecision('],
  ['/api/governance/policy-change', 'policyChangeDecision('],
] as const) {
  test(`${route} checks the competition scope before it acts`, () => {
    const body = routeBody(route);
    const guardAt = body.indexOf('competitionScopeMismatch(actor,');
    assert.ok(guardAt >= 0, `${route}: competition scope is checked`);
    assert.ok(body.includes("code:'COMPETITION_SCOPE_MISMATCH'"), `${route}: refused with 403 COMPETITION_SCOPE_MISMATCH`);
    const effectAt = body.indexOf(firstEffect);
    assert.ok(effectAt > guardAt, `${route}: the guard precedes ${firstEffect}`);
    assert.ok(body.indexOf('auditAppend(') > guardAt, `${route}: the guard precedes the audit row`);
  });
}
