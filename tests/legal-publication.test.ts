/*
 * الوثيقةُ التي يراها الموقِّع، والنسخةُ التي يُسجَّلها أثرُه — من ملفٍّ واحد أو لا معنى
 * للأثر.
 *
 * كان العنوانُ يُنتظر من خارج المستودع، فتصير الحقيقةُ نسختين: نصٌّ هنا ونصٌّ هناك، ولا
 * شيءَ يربطهما. فيوقّع المتسابق على أحدهما ويُقيَّد له رقمُ الآخر، ولا يُكتشف ذلك إلا
 * حين يُسأل عن الأثر بعد سنة — وحينها لا يُصلَح.
 *
 * فتُقاس هنا الوصلة: ما يُعرض، وما يُقرأ من الرأس، وما يُؤمر المالكُ أن يضبطه — ثلاثتُها
 * من الملفّ نفسِه.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  LEGAL_PUBLICATION_PATHS,
  LegalPublicationError,
  assertRenderable,
  parseLegalHeader,
  publishedLegalPage,
  renderLegalBody,
  renderLegalPage,
} from '../server/legal-publication';
import { CONSENT_BACKED_DOCUMENTS } from '../src/lib/legal-documents';

const ROOT = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('both published documents render, and carry the version their own header declares', () => {
  for (const kind of CONSENT_BACKED_DOCUMENTS) {
    const rendered = publishedLegalPage(kind, ROOT);
    assert.match(rendered.version, /^\d+\.\d+$/, `${kind} must serve a version`);
    assert.match(rendered.effectiveDate, /^\d{4}-\d{2}-\d{2}$/, `${kind} must serve an ISO effective date`);
    assert.ok(rendered.html.includes('<!doctype html>'), `${kind} must be a document, not a fragment`);
    assert.ok(rendered.html.includes(rendered.publisher), `${kind} must name its publisher on the page`);
  }
});

test('the page never leaks raw markdown at the reader', () => {
  /*
   * العطبُ الذي يُخشى ليس السقوط بل النجاحُ القبيح: صفحةٌ تُخدَم 200 وفيها `**` و`|`
   * و`##` خامًا. يقرؤها المتسابق فيظنّها من الوثيقة، ولا يشتكي أحد.
   */
  for (const kind of CONSENT_BACKED_DOCUMENTS) {
    const {html} = publishedLegalPage(kind, ROOT);
    const body = html.slice(html.indexOf('<main>'));
    for (const [what, pattern] of [
      ['bold markers', /\*\*/],
      ['heading markers', /^#{1,6} /m],
      ['table pipes', /^\| /m],
      ['unfilled blanks', /⟦/],
    ] as const) {
      assert.equal(pattern.test(body), false, `${kind}: ${what} reached the reader unrendered`);
    }
  }
});

test('the renderer refuses markdown it does not understand, instead of printing it', () => {
  /*
   * وهذا ما يجعل الشرطَ السابق يبقى صادقًا: لو أُضيف غدًا إلى الوثيقة بناءٌ لا يعرفه
   * العارض، **يفشل** ولا يعرضه خامًا. فالخيارُ بين لا صفحةٍ وصفحةٍ كاذبة، والأولى أهون.
   */
  assert.doesNotThrow(() => assertRenderable(read('docs/legal/TERMS-AR.md')));
  assert.doesNotThrow(() => assertRenderable(read('docs/legal/PRIVACY-AR.md')));

  // وكلُّ بندٍ هنا يصل القارئَ خامًا لو لم يُرفض.
  for (const [what, markdown] of [
    ['h4', '#### عنوانٌ من أربعة'],
    ['fenced code', '```js\ncode\n```'],
    ['link', 'انظر [الشروط](https://example.test/terms) هنا'],
    ['image', '![شعار](logo.png)'],
    ['raw HTML', '<div>نصّ</div>'],
    ['nested list', '- بند\n    - بندٌ داخله'],
    ['strikethrough', 'نصٌّ ~~محذوف~~'],
    ['single-asterisk emphasis', 'كلمةٌ *مائلة* هنا'],
    ['task list', '- [ ] بندٌ غير منجز'],
  ] as const) {
    assert.throws(() => assertRenderable(markdown),
      (error: unknown) => error instanceof LegalPublicationError && error.code === 'LEGAL_DOCUMENT_UNRENDERABLE',
      `${what} must be refused, not printed at the reader`);
  }
});

test('a document with no readable header is refused, not served headerless', () => {
  assert.throws(() => parseLegalHeader('# عنوان\n\nنصٌّ بلا رأس.'),
    (error: unknown) => error instanceof LegalPublicationError && error.code === 'LEGAL_DOCUMENT_HEADER_UNREADABLE');
  const code = (expected: string) => (error: unknown) =>
    error instanceof LegalPublicationError && error.code === expected;
  assert.throws(() => parseLegalHeader('# عنوان\n\n**الناشر:** جهة\n**نسخة الوثيقة:** 1.0\n\n---\n'),
    code('LEGAL_DOCUMENT_HEADER_UNREADABLE'), 'a version without an effective date is not a published document');
  assert.throws(() => parseLegalHeader('# عنوان\n\n**الناشر:** جهة\n**نسخة الوثيقة:** 1.0\n**تاريخ السريان:** قريبًا\n\n---\n'),
    code('LEGAL_DOCUMENT_HEADER_UNREADABLE'), 'an effective date must be a date');
});

test('a missing source file names where it looked, rather than serving an empty page', () => {
  assert.throws(() => publishedLegalPage('terms', path.join(ROOT, 'tests')),
    (error: unknown) => error instanceof LegalPublicationError
      && error.code === 'LEGAL_DOCUMENT_SOURCE_MISSING'
      && /docs\/legal/.test(error.message));
});

test('the header is shown field by field, and not repeated in the body', () => {
  /*
   * أسطرُ الرأس في Markdown فقرةٌ واحدة، فيلصقها أيُّ عارضٍ سطرًا متّصلًا: «المتحكّم…
   * السجل التجاري… نسخة الوثيقة… تاريخ السريان…». رأيتُ ذلك في أوّل لقطةٍ لهذه الصفحة،
   * فصار الرأسُ يُقتطع ويُعرض حقلًا حقلًا.
   */
  const {html, fields} = {...renderLegalPage('privacy', read('docs/legal/PRIVACY-AR.md')),
    fields: parseLegalHeader(read('docs/legal/PRIVACY-AR.md')).fields};
  assert.ok(fields.length >= 4, 'the header declares publisher, registration, version and date');
  for (const {label} of fields) assert.ok(html.includes(`<dt>${label}</dt>`), `${label} must be its own field`);
  assert.equal((html.match(/تاريخ السريان/g) || []).length, 1,
    'the effective date must appear once — twice means the body still carries the header');
});

test('the version and date the deployment publishes are the ones the documents carry', () => {
  /*
   * هذه هي الوصلةُ كلُّها. `cloudbuild.yaml` يضبط ما يُكتب في أثر الموافقة، والملفُّ هو
   * ما يراه الموقِّع. فاختلافُهما يعني أثرًا يشهد على نصٍّ لم يُعرض.
   */
  const deployment = read('cloudbuild.yaml');
  const expected: Record<string, string> = {terms: 'MIZAN_LEGAL_TERMS', privacy: 'MIZAN_LEGAL_PRIVACY'};
  for (const kind of CONSENT_BACKED_DOCUMENTS) {
    const page = publishedLegalPage(kind, ROOT);
    const prefix = expected[kind];
    const url = new RegExp(`${prefix}_URL=([^,']+)`).exec(deployment);
    assert.ok(url, `${prefix}_URL must be set by the deployment`);
    assert.ok(url[1].endsWith(LEGAL_PUBLICATION_PATHS[kind]),
      `${prefix}_URL must point at ${LEGAL_PUBLICATION_PATHS[kind]}, the path this server serves — got ${url[1]}`);
    assert.ok(deployment.includes(`${prefix}_VERSION=${page.version}`),
      `${prefix}_VERSION must be ${page.version}, the version the document itself declares`);
    assert.ok(deployment.includes(`${prefix}_EFFECTIVE=${page.effectiveDate}`),
      `${prefix}_EFFECTIVE must be ${page.effectiveDate}, the date the document itself declares`);
  }
  const entity = /MIZAN_LEGAL_ENTITY_NAME=([^,']+)/.exec(deployment);
  assert.ok(entity, 'the deployment must name the publishing entity');
  for (const kind of CONSENT_BACKED_DOCUMENTS) {
    assert.ok(publishedLegalPage(kind, ROOT).html.includes(entity[1]),
      `${kind} must name ${entity[1]} — the entity the consent record cites`);
  }
});

test('the build carries the documents into the image that actually runs', () => {
  /*
   * `Dockerfile` ينسخ `dist` وحدها. فلو لم تُنقل الوثيقتان إليها لردّ الطريقُ 503 في
   * الإنتاج وحده — أخضرُ هنا وأحمرُ حيث لا أحد ينظر.
   */
  const build = JSON.parse(read('package.json')).scripts.build as string;
  assert.ok(build.includes('copy-legal-documents'),
    'the build must place the documents where the runtime image can read them');
  assert.ok(build.indexOf('copy-legal-documents') < build.indexOf('esbuild server.ts'),
    'and it must happen before the server bundle is written, so a failure stops the build');
  assert.match(read('Dockerfile'), /COPY --from=build \/app\/dist \.\/dist/,
    'this test assumes the runtime image ships dist alone — re-read it if that changes');
});

test('the markdown renderer produces the structure the source declares', () => {
  const source = read('docs/legal/PRIVACY-AR.md');
  const body = renderLegalBody(parseLegalHeader(source).body);
  const count = (pattern: RegExp, text: string) => (text.match(pattern) || []).length;
  assert.equal(count(/<h2>/g, body), count(/^## /gm, source), 'every section heading must survive');
  assert.equal(count(/<h3>/g, body), count(/^### /gm, source), 'and every sub-heading');
  assert.equal(count(/<li>/g, body), count(/^(?:\d+\.|-) /gm, source), 'and every list item');
  assert.equal(count(/<tr>/g, body), count(/^\| /gm, source), 'and every table row');
});
