import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * تدقيق جاهزية الإطلاق عبر كل الشاشات والأدوار.
 *
 * ليس بديلًا عن تشغيل حقيقي، لكنه يمنع صنفًا كاملًا من أعطال يوم الإطلاق: دورٌ بلا شاشة،
 * أيقونةٌ غير موجودة، شاشةٌ مفقودة، وبيانات عرض تتسرّب إلى نشرٍ حقيقي.
 */

const app = fs.readFileSync('src/App.tsx', 'utf8');
const authHook = fs.readFileSync('src/lib/useMizanAuth.ts', 'utf8');
const walk = (d: string, out: string[] = []): string[] => {
  for (const n of fs.readdirSync(d)) { const p = path.join(d, n); fs.statSync(p).isDirectory() ? walk(p, out) : p.endsWith('.tsx') && out.push(p) }
  return out;
};
const screens = walk('src/components');

/** الأدوار التي يقبلها ميزان في جلسة موثّقة — مصدرها الوحيد هو خطاف المصادقة. */
const allowedRoles = (() => {
  const block = authHook.slice(authHook.indexOf('const ALLOWED_ROLES'), authHook.indexOf('];', authHook.indexOf('const ALLOWED_ROLES')));
  return [...block.matchAll(/'([a-z_]+)'/g)].map(m => m[1]);
})();

test('every role admitted into a session has a screen of its own',()=>{
  assert.ok(allowedRoles.length >= 14, `expected the full role set, found ${allowedRoles.length}`);
  const missing = allowedRoles.filter(r => !app.includes(`case '${r}':`));
  assert.deepEqual(missing, [], 'a provisioned account for these roles would fall through to the default view');
});

test('an unrecognised role is not handed the administration console',()=>{
  const def = app.slice(app.indexOf('default: return'), app.indexOf('default: return') + 80);
  assert.doesNotMatch(def, /CompetitionOverview|SuperAdminConsole|OrganizationHome/, 'the default must not grant an administrative surface');
  assert.match(app, /const NoRoleConsole/, 'an explicit no-authority view exists');
});

test('every lazily loaded screen resolves to a file that exists',()=>{
  const refs = [...app.matchAll(/import\('\.\/(components\/[^']+)'\)/g)].map(m => m[1]);
  assert.ok(refs.length >= 15, `expected the screen registry, found ${refs.length}`);
  for (const r of refs) assert.ok(fs.existsSync(path.join('src', `${r}.tsx`)), `missing screen file: src/${r}.tsx`);
});

test('no screen imports an icon name that does not exist',async()=>{
  const lucide = await import('lucide-react');
  const exported = new Set(Object.keys(lucide));
  const missing: string[] = [];
  for (const f of [...screens, 'src/App.tsx']) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*'lucide-react'/g))
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (name && !exported.has(name)) missing.push(`${f}: ${name}`);
      }
  }
  assert.deepEqual(missing, [], 'an icon that does not exist renders as nothing at runtime');
});

test('a saving failure has a surface, and it is mounted on every page',()=>{
  assert.ok(fs.existsSync('src/components/design-system/PersistenceAlert.tsx'), 'the alert component exists');
  assert.match(app, /<PersistenceAlert\/>/, 'the alert is mounted in the page shell');
  const alert = fs.readFileSync('src/components/design-system/PersistenceAlert.tsx', 'utf8');
  assert.match(alert, /role="alert"/);
  assert.match(alert, /aria-live="assertive"/, 'a saving fault must be announced, not just drawn');
});

test('demo seed data is never imported by a screen',()=>{
  // الشاشات تعرض حالة المتجر؛ استيراد بيانات العرض مباشرةً يتجاوز حارس الإطلاق.
  const offenders = screens.filter(f => /from ['"][^'"]*seed-data['"]/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, [], 'these screens would show invented people even in a real deployment');
});

test('the launch guard is wired into the initial state',()=>{
  const store = fs.readFileSync('src/lib/store.ts', 'utf8');
  assert.match(store, /isLaunchDeployment\(\)/, 'the deployment mode is consulted');
  assert.match(store, /toLaunchState\(seeded\)/, 'a real deployment starts from the emptied state');
  assert.match(store, /isDemoResidue/, 'demo residue in a browser is discarded, not revived');
});
