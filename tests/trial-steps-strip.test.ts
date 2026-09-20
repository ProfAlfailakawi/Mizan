import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { TrialSteps } from '../src/components/participant/TrialSteps';

/*
 * أربعُ أيقوناتٍ لا أربعُ فقرات — والاختصارُ في البصر لا في المعنى.
 *
 * يُصيَّر الشريطُ فعلًا ويُقرأ ما خرج منه: أربعُ خطواتٍ بترتيبها، ولكلٍّ شرحُها كاملًا
 * في `title` وفي نصٍّ لقارئ الشاشة — فما اختصرته العينُ لم يُفقد. وحالُ التتبّع تبقى
 * صادقة: حين لا يكون مهيّأً لا يُعرض على أنه عامل.
 */

const html = (listening: boolean) =>
  renderToStaticMarkup(React.createElement(TrialSteps, { ar: true, listening }));

const steps = (markup: string) => [...markup.matchAll(/data-step="([a-z]+)"/g)].map(m => m[1]);

test('أربعُ خطواتٍ بترتيبها، لا أكثر', () => {
  assert.deepEqual(steps(html(true)), ['mic', 'locus', 'track', 'report']);
  assert.deepEqual(steps(html(false)), ['mic', 'locus', 'track', 'report']);
});

test('الفقراتُ الأربع لم تعد تُعرض نصًّا في الشاشة', () => {
  const markup = html(true);
  /* العناوينُ الطويلة السابقة لا تظهر ككتلةِ نصٍّ مرئية — بل قصُرت إلى وسمٍ واحد. */
  for (const label of ['ميكروفون', 'موضع', 'تتبّع', 'أثرك']) {
    assert.ok(markup.includes(`>${label}</span>`), `الوسم «${label}» لم يظهر`);
  }
});

test('الشرحُ انتقل ولم يُحذف: يبلغ اللمسَ وقارئَ الشاشة', () => {
  const markup = html(true);
  assert.ok(markup.includes('title="تفتح ميكروفونك مرة واحدة'), 'شرحُ الميكروفون لم يبلغ اللمس');
  assert.ok(markup.includes('المطلع مخفيّ حتى تطلبه'), 'شرحُ المؤقّت ضاع');
  assert.ok(markup.includes('أين تعثّرت وكم استغرقت'), 'شرحُ التقرير ضاع');
  const srOnly = [...markup.matchAll(/class="sr-only">([^<]+)</g)].map(m => m[1]);
  assert.equal(srOnly.length, 4, `نصوصُ قارئ الشاشة ${srOnly.length} لا ٤`);
});

test('التتبّعُ غيرُ المهيّأ لا يُعرض على أنه عامل', () => {
  const off = html(false);
  assert.match(off, /data-step="track"[^>]*data-muted="true"/, 'خطوةُ التتبّع لم تُخفَّت حين لا تعمل');
  assert.ok(off.includes('>بلا تتبّع</span>'), 'لم يُقل إنه بلا تتبّع');
  assert.ok(off.includes('ولا يُدَّعى استماعٌ لا يقع'), 'التصريحُ الصادق ضاع');

  const on = html(true);
  assert.doesNotMatch(on, /data-step="track"[^>]*data-muted/, 'خُفّتت خطوةُ تتبّعٍ عاملة');
  assert.ok(on.includes('>تتبّع</span>'));
  assert.equal(on.includes('بلا تتبّع'), false);
});
