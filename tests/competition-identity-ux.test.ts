import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bilingualName } from '../src/lib/ui-language';

/*
 * اسمٌ مكتوبٌ في الخانة الخطأ، وحفظٌ لا يُرى.
 */

test('an Arabic name is never stored as the English one', () => {
  const store = fs.readFileSync('src/lib/store.ts', 'utf8');
  // الحقل الإنجليزي اختياري ويُخزَّن كما أُدخل — لا يُملأ من العربي.
  assert.match(store, /const createCompetition = \(nameArabic: string, nameEnglish = ''\)/);
  assert.match(store, /name:nameEnglish\.trim\(\), nameArabic:nameArabic\.trim\(\)/);

  const portals = fs.readFileSync('src/components/admin/RolePortals.tsx', 'utf8');
  assert.doesNotMatch(portals, /createCompetition\(name,name\)/, 'one field cannot fill two languages');
  assert.match(portals, /createCompetition\(name\.trim\(\),nameEnglish\.trim\(\)\)/);
  // والحقل الاختياري يُقال إنه اختياري، لا يُترك للمستخدم يخمّن.
  assert.match(portals, /الاسم بالإنجليزية — اختياري/);
});

test('a missing name in one language never leaves a blank screen', () => {
  assert.equal(bilingualName({ nameArabic: 'مسابقة الكويت', name: '' }, false), 'مسابقة الكويت');
  assert.equal(bilingualName({ nameArabic: 'مسابقة الكويت', name: 'Kuwait Contest' }, false), 'Kuwait Contest');
  assert.equal(bilingualName({ nameArabic: '', name: 'Kuwait Contest' }, true), 'Kuwait Contest');
  assert.equal(bilingualName({ nameArabic: 'مسابقة الكويت', name: 'Kuwait Contest' }, true), 'مسابقة الكويت');
  // فراغٌ من الطرفين يبقى فراغًا؛ لا يُخترع نصّ.
  assert.equal(bilingualName({}, true), '');
  assert.equal(bilingualName(null, true), '');
  // ومسافاتٌ وحدها ليست اسمًا.
  assert.equal(bilingualName({ nameArabic: '  ', name: 'Kuwait' }, true), 'Kuwait');
});

test('no screen still picks a competition name by language alone', () => {
  /* الاختيار المباشر يترك الشاشة فارغة متى غاب أحد الاسمين، وهو ما صار ممكنًا الآن. */
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of fs.readdirSync(dir)) {
      const p = `${dir}/${name}`;
      if (fs.statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(p)) out.push(p);
    }
    return out;
  };
  const offenders = walk('src').filter((f) => {
    const code = fs.readFileSync(f, 'utf8');
    return /(ar|language\s*===\s*'ar')\s*\?\s*(store\.)?(competition|c)\.nameArabic\s*:\s*(store\.)?(competition|c)\.name\b/.test(code);
  });
  assert.deepEqual(offenders, [], 'these read a competition name without a fallback');
});

test('the identity form tells the user whether the work was saved', () => {
  const view = fs.readFileSync('src/components/admin/CompetitionOverview.tsx', 'utf8');
  assert.match(view, /const SaveState=/, 'a form that saves on every keystroke must say so');
  assert.match(view, /<SaveState store=\{store\} ar=\{ar\}\/>/, 'and the indicator must actually be rendered');

  const indicator = /const SaveState=[\s\S]*?\n\};/.exec(view)?.[0] || '';
  // لا يطمئن من تلقاء نفسه: يقرأ حالة الحفظ الحقيقية لا مؤقّتًا.
  assert.match(indicator, /store\.persistenceError/, 'a failed write must show as failed');
  assert.match(indicator, /store\.isOffline/, 'venue mode is saved locally, not uploaded — say which');
  assert.match(indicator, /QUOTA_EXCEEDED/, 'a full browser store is a distinct, actionable cause');
  // وترتيب الفروع يمنع قول «حُفظ» فوق عطل قائم.
  assert.ok(indicator.indexOf('persistenceError') < indicator.indexOf('isOffline'),
    'the error branch must come before the offline branch, and both before success');
});
