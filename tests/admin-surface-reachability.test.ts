/*
 * P25 — شاشةٌ إداريةٌ مبنيّةٌ لا تُفتح ليست ميزةً ناقصة، هي ميزةٌ غائبة.
 *
 * ثلاثُ لوحاتٍ كانت مبنيّةً كاملةً وتعرض حالةً خادميّةً لا يعرضها غيرُها — أصولُ المجمَّع
 * وحالةُ تسليمها، وجاهزيةُ طبقات الذكاء لكلّ رواية، وسجلُّ المستأجرين ومرآةُ التشغيل —
 * ولم يكن شيءٌ في المنتج يستوردها.
 *
 * ولا يظهر ذلك في أيّ فحص: الملفّ موجود، ويُترجم، ويمرّ عليه المدقّقُ اللغويّ والأمنيّ،
 * ولا يُفتح. فيُسأل المالكُ «أين شاشة المستأجرين؟» فيُقال «مبنيّة» — وهي كذلك، ولا تُفتح.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ADMIN_DIR = path.join(process.cwd(), 'src', 'components', 'admin');
const screens = fs.readdirSync(ADMIN_DIR).filter(f => f.endsWith('.tsx')).map(f => f.replace(/\.tsx$/, ''));

/** كلُّ ما في المصدر عدا الشاشة نفسها — فيه يُبحث عمّن يستوردها. */
function referencesTo(name: string): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (full === path.join(ADMIN_DIR, `${name}.tsx`)) continue;
      const source = fs.readFileSync(full, 'utf8');
      if (new RegExp(`\\b${name}\\b`).test(source)) hits.push(path.relative(process.cwd(), full));
    }
  };
  walk(path.join(process.cwd(), 'src'));
  return hits;
}

test('the scan sees the admin screens — an empty list proves nothing', () => {
  assert.ok(screens.length >= 20, `expected the admin surface, found ${screens.length}`);
  assert.ok(screens.includes('CompetitionOverview'), 'the scan must see a screen we know exists');
});

test('every admin screen is reachable from somewhere in the product', () => {
  /*
   * «مُشارٌ إليها» أضعفُ من «قابلةٍ للفتح»، لكنّها تمسك الحالةَ التي وقعت فعلًا: ملفٌّ
   * كامل لا يستورده أحد. ولا استثناءَ هنا: لوحةٌ لا تُفتح تُوصَل أو تُحذف.
   */
  const orphans = screens.filter(name => referencesTo(name).length === 0);
  assert.deepEqual(orphans, [],
    'these admin screens are built but nothing imports them — wire them into a surface or delete them');
});

test('the three that were dark are wired where an operator would look for them', () => {
  const engine = fs.readFileSync(path.join(ADMIN_DIR, 'QuestionEngineWorkspace.tsx'), 'utf8');
  // من يسأل «على أيّ مصحفٍ تُبنى الأسئلة؟» يسألها وهو في ورشة المحرّك، لا في طبقة المؤسسات.
  assert.ok(engine.includes('<OfficialQuranLibrary />'), 'the official library belongs with the question engine');
  assert.ok(engine.includes('<QuranIntelligenceHealthConsole ar={ar} />'), 'so does intelligence health');
  assert.ok(/'library'.*'المكتبة الرسمية'/.test(engine), 'and each needs a tab an operator can see');
  assert.ok(/'intelligence'.*'صحّة الذكاء'/.test(engine));

  const enterprise = fs.readFileSync(path.join(ADMIN_DIR, 'EnterpriseWorkspace.tsx'), 'utf8');
  assert.ok(enterprise.includes("activeSection==='tenants'"), 'the tenant console needs a section');
  assert.ok(enterprise.includes("tenantConsole: () => import('./TenantConsole')"), 'loaded lazily like its neighbours');
});

test('the tenant console stays owner-only, like the other platform surfaces', () => {
  /*
   * سجلُّ المستأجرين ومرآةُ التشغيل لغةُ من يشغّل المنصّة. وعرضُها لجهةٍ عميلة يُظهر لها
   * بنيةً ليست شأنها، ويُقلقها بما لا تملك إصلاحه.
   */
  const enterprise = fs.readFileSync(path.join(ADMIN_DIR, 'EnterpriseWorkspace.tsx'), 'utf8');
  assert.ok(/const ownerOnly:Section\[\]=\[[^\]]*'tenants'[^\]]*\]/.test(enterprise),
    'tenants must be in the owner-only list');
  // والقائمةُ تُصفّى فعلًا، لا تُعلَن وتُتجاهَل.
  assert.ok(enterprise.includes('sections=allSections.filter(([id])=>platformOwner||!ownerOnly.includes(id))'));
  assert.ok(enterprise.includes("const activeSection=(!platformOwner&&ownerOnly.includes(section))?'integrations':section"),
    'and a non-owner landing on the section must be moved off it, not just denied the tab');
});

test('every wired panel name matches a real exported component', () => {
  // اسمٌ مكتوبٌ خطأً في مُحمِّلٍ كسول لا يظهر إلا حين يُضغط التبويب، في العرض غالبًا.
  const enterprise = fs.readFileSync(path.join(ADMIN_DIR, 'EnterpriseWorkspace.tsx'), 'utf8');
  for (const [, file, name] of enterprise.matchAll(/(\w+): \(\) => import\('\.\/(\w+)'\),/g)
    ? [...enterprise.matchAll(/\w+: \(\) => import\('\.\/(\w+)'\)/g)].map(m => [m[0], m[1], m[1]])
    : []) {
    const source = fs.readFileSync(path.join(ADMIN_DIR, `${file}.tsx`), 'utf8');
    assert.ok(new RegExp(`export const ${name}\\b`).test(source), `${file} must export ${name}`);
  }
});
