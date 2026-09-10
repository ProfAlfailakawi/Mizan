import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * الرابط العميق نيّةٌ تُنفَّذ مرة، لا حالةٌ دائمة.
 *
 * المؤثّر الذي يقرأ العنوان كان يُعاد تنفيذه كلما تغيّرت بياناته — وهي تتغيّر بعد كل حفظ —
 * والعنوان يبقى حاملًا نيّته. فتُفتح نافذة النطاق من جديد كلما أغلقها المستخدم، وتُبدَّل
 * المسابقة المختارة تحت يده. الإغلاق كان يمسح الحالة ولا يمسح النيّة.
 */

const surfaces = [
  ['src/components/admin/SaaSWorkspace.tsx', /\[data\]\);/],
  ['src/components/admin/RolePortals.tsx', /\[competitions,organization\.id,selectCompetition\]\);/],
];

for (const [file] of surfaces) {
  test(`${file.split('/').pop()} consumes a deep link once, not on every refresh`, () => {
    const code = fs.readFileSync(file as string, 'utf8');
    assert.match(code, /const handledDeepLink=useRef\(''\)/,
      'the surface must remember which link it already acted on');
    assert.match(code, /handledDeepLink\.current===/,
      'and skip it when the address has not changed');
    assert.match(code, /handledDeepLink\.current=/,
      'and record it before acting');
  });
}

test('the guard sits before the side effects, not after them', () => {
  /* حارسٌ بعد الفعل لا يمنع شيئًا: النافذة تكون قد فُتحت. */
  for (const [file] of surfaces) {
    const code = fs.readFileSync(file as string, 'utf8');
    const effect = /const openIdentityTarget=\(\)=>\{[\s\S]*?\n/.exec(code)?.[0] || '';
    const guardAt = code.indexOf('handledDeepLink.current===');
    const firstSetter = Math.min(
      ...[code.indexOf('setDomainOrgId('), code.indexOf('setAccessCompetitionId('), code.indexOf('selectCompetition(')]
        .filter((i) => i > 0),
    );
    assert.ok(effect, `${file}: the deep-link handler must exist`);
    assert.ok(guardAt > 0 && guardAt < firstSetter,
      `${file}: the guard must precede any state change the link triggers`);
  }
});

test('a genuinely new address still gets acted on', () => {
  // الحارس يقارن العنوان نفسه؛ فتغيّره — نيّة جديدة من المستخدم — يمرّ.
  for (const [file] of surfaces) {
    const code = fs.readFileSync(file as string, 'utf8');
    assert.match(code, /window\.location\.hash/,
      `${file}: the signature must be the address itself, so a new intent is not swallowed`);
    assert.match(code, /addEventListener\('hashchange'/,
      `${file}: navigation to a new deep link must still be observed`);
  }
});
