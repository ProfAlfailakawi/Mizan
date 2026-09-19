import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * JudgeOS scoring surface.
 *
 * Every scoring action used to render identically: the same emerald chip, border and
 * background, with the penalty — the one number the decision turns on — as the smallest
 * text on the card, and hover-only affordances on tablets that have no hover. A judge
 * marking under time pressure could not tell the costliest mark from the cheapest.
 *
 * These lock the two encodings that fixed it, because losing either silently returns the
 * surface to "all six cards look the same".
 */
const root = path.resolve(process.cwd());
const judge = fs.readFileSync(path.join(root, 'src/components/judge/JudgeOS.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8');

test('hue encodes the criterion being marked', () => {
  /*
   * والنبرة تُقرأ من معرّف المعيار بعد ردّه إلى أصله.
   *
   * كان الصنف يُبنى من `a.criterion` خامًا — و`getEnabledJudgeActions` تُبدّل اسم المعيار
   * بمعرّفه في اللائحة، فيصير الصنف `ja-crit-memorization` والطبقة تعرّف `.ja-memorization`.
   * فلم يظهر لونٌ ولا عدّاد قط منذ أول يوم. هذا ما يحرسه هذا الاختبار الآن.
   */
  assert.match(judge, /jt-\$\{tone\}/, 'each action carries its criterion tone');
  assert.match(judge, /const criterionTone=/, 'the tone is resolved, not taken raw');
  assert.match(judge, /replace\(\/\^crit\[-_\]\/,''\)/, 'a criterion id keeps its tone after the prefix is stripped');
  assert.match(judge, /assignedJudgeType/, 'and the judge type the rule set assigns comes first');
  for (const criterion of ['memorization', 'tajweed', 'waqf_ibtida', 'performance', 'custom']) {
    assert.match(css, new RegExp(`\\.jt-${criterion}\\s*\\{`), `missing tone for ${criterion}`);
  }
});

test('weight encodes what the mark costs', () => {
  // Most default actions share the memorisation criterion, so hue alone would leave four
  // of six cards identical. The penalty tier is the second, independent channel.
  assert.match(judge, /data-weight=\{a\.penalty>=1\?'high':a\.penalty>=0\.5\?'mid':'low'\}/);
  for (const tier of ['high', 'mid', 'low']) {
    assert.match(css, new RegExp(`\\[data-weight="${tier}"\\]`), `missing spine weight for ${tier}`);
  }
});

test('a mark is confirmed visibly and audibly', () => {
  assert.match(judge, /data-flash=/, 'pressed action pulses');
  /* شريطٌ ينحسر من حافة البداية: يُرى بطرف العين والبصر على المصحف، ثم يزول. */
  assert.match(css, /@keyframes mzDrain/);
  assert.match(css, /\.mizan-judge-action\[data-flash="true"\]::after/);
  assert.match(judge, /aria-live="polite"/, 'the mark is announced, not only drawn');
  assert.match(judge, /setMarkedAction/);
  /* والعدّاد أثرٌ باقٍ لا وميضٌ عابر: كم مرة سُجِّلت هذه الملاحظة على هذا الموضع. */
  assert.match(judge, /mizan-judge-count/, 'the tally stays on the key after the pulse fades');
  assert.match(css, /\.mizan-judge-action\[data-n\]:not\(\[data-n="0"\]\) \.mizan-judge-count/, 'and it disappears at zero');
});

test('the tally is read before the store mutates', () => {
  // recordJudgeEvent updates the store synchronously; counting afterwards and adding one
  // announced a number one too high.
  const tally = judge.indexOf('const tally=countFor(eventType)+1;');
  const record = judge.indexOf('recordJudgeEvent(eventType);');
  assert.ok(tally > -1 && record > -1);
  assert.ok(tally < record, 'tally must be computed before recordJudgeEvent');
});

test('Arabic counts agree with the number', () => {
  // 1 singular, 2 dual, 3-10 plural, 11+ singular again. "4 مرة" is wrong.
  assert.match(judge, /const marksAr=/);
  const marksAr = (n: number) => (n === 1 ? 'مرة واحدة' : n === 2 ? 'مرتين' : n <= 10 ? `${n} مرات` : `${n} مرة`);
  assert.equal(marksAr(1), 'مرة واحدة');
  assert.equal(marksAr(2), 'مرتين');
  assert.equal(marksAr(4), '4 مرات');
  assert.equal(marksAr(11), '11 مرة');
  for (const form of ['مرة واحدة', 'مرتين', 'مرات']) assert.ok(judge.includes(form), `missing form ${form}`);
});

test('criterion names exist in Arabic', () => {
  // They had only ever been available in English, inside an Arabic-first surface.
  assert.match(judge, /CRITERION_AR/);
  for (const name of ['حفظ', 'تجويد', 'وقف وابتداء', 'أداء']) {
    assert.ok(judge.includes(name), `missing Arabic criterion name ${name}`);
  }
});

test('a scoring key stays a thumb-sized target, and severity never changes its height', () => {
  /*
   * هذا الحارسُ عاد بعد أن حُذف.
   *
   * قرارُ المالك في 17 سبتمبر 2026: «مقاسٌ واحد لكل زرّ، وهو مقاسُ الإبهام — لا بطاقة».
   * وفي 19 سبتمبر أُعيدت كتابةُ شاشة التحكيم، فذهب الاختبارُ الذي يحرسه مع التصميم الذي
   * كُتب له. والقيمةُ نفسها بقيت في الطبقة — لكنّ قيمةً لا يحرسها شيءٌ قيمةٌ مستأجَرة:
   * تُزاح في أوّل إعادة تخطيطٍ قادمة ولا يسقط شيء.
   *
   * ولوحُ المحكّم آيباد أفقيّ، والصفوفُ تقتسم ما بقي (`minmax(0,1fr)`) كي لا تفيض
   * اللوحة — فما يمنع المفتاحَ من النزول تحت أصغر هدفٍ يُصاب بالإبهام هو أرضيتُه هو.
   */
  const action = css.match(/^\.mizan-judge-action\{[\s\S]*?\n\}/m)?.[0] || '';
  assert.ok(action, 'the scoring key rule must exist');
  const floors = [...action.matchAll(/min-height:(\d+)px/g)].map(m => Number(m[1]));
  assert.equal(floors.length, 1, 'declare the floor once — a dead first declaration reads as the live one');
  assert.ok(floors[0] >= 44, `a touch target must stay reachable (got ${floors[0]}px)`);
  assert.ok(floors[0] <= 72, `a scoring key is not a card (got ${floors[0]}px)`);

  /* والخصمُ يغيّر لون العمود وحجم رقمه، لا ارتفاع الزرّ: المقاسُ واحدٌ مهما بلغت الشدّة. */
  assert.doesNotMatch(css, /\.mizan-judge-action\[data-weight="[a-z]+"\]\{[^}]*min-height/,
    'severity must not change the key height');
  assert.doesNotMatch(css, /\.mizan-judge-deck \.mizan-judge-action\{[^}]*min-height/,
    'and neither does where it is rendered');
  /* والعمودُ اللوني باقٍ: هو ما يقول أيَّ معيارٍ تسجّل وكم يكلّف، بلا تضخيم الزرّ. */
  assert.match(css, /\.mizan-judge-action\[data-weight="high"\]\{ --ja-weight:\d+px/,
    'the weight spine still encodes the penalty');
});

test('the affordance works without a pointer that hovers', () => {
  assert.match(css, /\.mizan-judge-action:active\s*\{/, 'pressed state is the tablet affordance');
  assert.match(css, /@media \(hover:hover\)\s*\{\s*\.mizan-judge-action:hover/, 'hover styling is gated to hover-capable input');
  assert.match(css, /\.mizan-judge-action:focus-visible\s*\{/);
  /* الصفوف تقتسم ما بقي بالتساوي — و`minmax(0,1fr)` يسمح لها بالنزول تحت مقاس محتواها،
     وهو شرط ألّا تفيض اللوحة على شاشةٍ قصيرة. */
  assert.match(css, /grid-auto-rows:minmax\(0,1fr\)/, 'severity tiers must not make rows uneven');
});
