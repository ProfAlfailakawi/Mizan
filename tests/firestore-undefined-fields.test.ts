import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * مسابقةٌ جديدة لا تُحفظ في السحابة.
 *
 * Firestore يرفض المستند **كلَّه** إذا حمل حقلًا واحدًا قيمته undefined، ورسالته
 * «Unsupported field value: undefined» لا تحوي كلمة صلاحية ولا حجم — فتُصنَّف عطلًا عامًّا
 * ويظهر للمشغّل «تعذّرت المزامنة» بلا سبب مفهوم.
 *
 * والحالة تقع في أكثر مسار استعمالًا: إنشاء مسابقة جديدة يضع displayName وdisplayNameArabic
 * وlogoUrl وfrozenAt = undefined عمدًا — وهو صحيح دلاليًّا (مسابقة نظيفة بلا علامة ولا قفل)
 * لكنه يُسقط الرفع، فتبقى إعدادات المسابقة على الجهاز وحده.
 *
 * ولم يكن أحد يرى ذلك أصلًا: الكتابة المحلية الناجحة كانت تمحو عطل السحابة قبل أن يُرسم.
 */

const firebase = fs.readFileSync('src/lib/firebase.ts', 'utf8');
const store = fs.readFileSync('src/lib/store.ts', 'utf8');

test('the Firestore client tolerates undefined fields instead of dropping the document', () => {
  assert.match(firebase, /initializeFirestore\(/,
    'getFirestore() cannot carry settings; the client must be initialized with them');
  assert.match(firebase, /ignoreUndefinedProperties:\s*true/,
    'without this flag one undefined field rejects the entire write');
  assert.doesNotMatch(firebase, /getFirestore\(app/,
    'a second, unconfigured client would reintroduce the bug on whichever path used it');
});

test('the named-database deployment keeps the same setting', () => {
  /* الإعداد يمرّ للحالتين: قاعدة افتراضية أو مسمّاة. راية تسري على واحدة دون الأخرى
     تعني عطلًا يظهر في نشرٍ ويختفي في آخر — وهو أسوأ من عطل ثابت. */
  const init = /initializeFirestore\([\s\S]*?\),\n/.exec(firebase)?.[0] || '';
  assert.match(init, /firestoreDatabaseId/, 'the database id must still be honoured');
  assert.match(init, /ignoreUndefinedProperties/, 'and the setting must apply to it too');
});

test('creating a competition still writes undefined fields, which is why the flag matters', () => {
  /*
   * هذا الاختبار لا يطلب إزالة undefined من إنشاء المسابقة: وضعُها مقصود ويعبّر عن «لا قيمة».
   * وإنما يثبّت أن الحالة قائمة فعلًا، فلا تُزال الراية يومًا بحجّة أنها بلا داعٍ.
   */
  const create = /const createCompetition[\s\S]*?return base;/.exec(store)?.[0] || '';
  assert.ok(create, 'createCompetition must exist');
  const undefinedFields = [...create.matchAll(/(\w+(?:\.\w+)*)\s*[:=]\s*undefined/g)].map((m) => m[1]);
  assert.ok(undefinedFields.length > 0,
    'if this ever becomes empty, re-read whether the flag is still the right fix');
});

test('an intentional field deletion has a real tool, so the flag hides nothing', () => {
  // الراية تُسقط undefined بصمت؛ فالحذف المقصود يجب أن يكون صريحًا لا ضمنيًّا.
  const stubs = fs.readFileSync('stubs.d.ts', 'utf8');
  assert.match(stubs, /export const deleteField:any/,
    'deleteField must be available so deletion is explicit rather than a silently dropped undefined');
});
