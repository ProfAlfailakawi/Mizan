import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/*
 * معرّف المسابقة يُنشئه المتصفح وهو ظاهر في كل رابط عام، والمستندات العامة (`public_competitions`،
 * `public_boards`، ومرآة القرص) مفتاحها المعرّف وحده. فمدير جهةٍ «ب» كان يستطيع:
 *  - نشر مسابقته على معرّف مسابقة جهةٍ «أ» فيستبدل ملفها العام على القرص،
 *  - أو حذف «مسابقته» ذات المعرّف نفسه فيُمسح معها صفحة التسجيل والشاشة العامة عند «أ».
 * لا يُكتب ولا يُحذف عامٌّ إلا لمالكه.
 */
const server = fs.readFileSync('server.ts', 'utf8');

test('publishing refuses an id that already belongs to another organisation', () => {
  assert.match(server, /COMPETITION_ID_OWNED_BY_ANOTHER_ORGANIZATION/);
  assert.match(server, /owner&&owner!==bodyOrgId&&actor\.role!=='super_admin'/);
  const check = server.indexOf('COMPETITION_ID_OWNED_BY_ANOTHER_ORGANIZATION');
  const write = server.indexOf("fs.writeFileSync(file,JSON.stringify({organizationId:bodyOrgId,competition:comp,updatedAt}", check);
  assert.ok(check > 0 && write > check, 'the ownership check precedes the disk write');
});

test('deleting a competition only removes public records its organisation owns', () => {
  assert.match(server, /const ownedPublic=async\(p:string\)=>/);
  assert.match(server, /if\(await ownedPublic\(`public_competitions\/\$\{competitionId\}`\)\)/);
  assert.match(server, /if\(await ownedPublic\(`public_boards\/\$\{competitionId\}`\)\)/);
  assert.doesNotMatch(server, /await Promise\.all\(\[firestoreRepository\.delete\(`public_competitions\/\$\{competitionId\}`\),firestoreRepository\.delete\(`public_boards/);
});

test('malformed or oversized request bodies answer in JSON, not in an HTML error page', () => {
  assert.match(server, /err\?\.type==='entity\.parse\.failed'\?'INVALID_JSON'/);
  assert.match(server, /err\?\.type==='entity\.too\.large'\?'PAYLOAD_TOO_LARGE'/);
  const handler = server.indexOf("app.use((err:any,req:any,res:any,next:any)=>{");
  const listen = server.indexOf("app.listen(PORT,'0.0.0.0'");
  assert.ok(handler > 0 && listen > handler, 'the error handler is registered after every route and before listen');
});
