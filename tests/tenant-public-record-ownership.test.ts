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
  assert.match(server, /dropComp=await ownedPublic\(`public_competitions\/\$\{competitionId\}`\)/);
  assert.match(server, /if\(dropComp\)dropPublic/);
  assert.match(server, /dropBoard=await ownedPublic\(`public_boards\/\$\{competitionId\}`\)/);
  assert.match(server, /if\(dropBoard\)dropPublic/);
  assert.doesNotMatch(server, /await Promise\.all\(\[firestoreRepository\.delete\(`public_competitions\/\$\{competitionId\}`\),firestoreRepository\.delete\(`public_boards/);
});

test('malformed or oversized request bodies answer in JSON, not in an HTML error page', () => {
  assert.match(server, /err\?\.type==='entity\.parse\.failed'\?'INVALID_JSON'/);
  assert.match(server, /err\?\.type==='entity\.too\.large'\?'PAYLOAD_TOO_LARGE'/);
  const handler = server.indexOf("app.use((err:any,req:any,res:any,next:any)=>{");
  const listen = server.indexOf("app.listen(PORT,'0.0.0.0'");
  assert.ok(handler > 0 && listen > handler, 'the error handler is registered after every route and before listen');
});

test('review fix: an unreadable ownership record fails closed (publish and delete), and nothing is deleted before ownership is known', () => {
  assert.ok(server.includes("PUBLIC_OWNERSHIP_CHECK_UNAVAILABLE"), 'a failed ownership read must abort with 503');
  assert.equal(/firestoreRepository\.get\(p\)\.catch\(\(\)=>null\)/.test(server), false, 'a failed read must never be treated as "unowned"');
  const check = server.indexOf('dropComp=await ownedPublic(');
  const wipe = server.indexOf('await deleteFirestoreTree(root);', check);
  assert.ok(check > 0 && wipe > check, 'ownership is resolved before the tree is deleted');
});

test('review fix: score-correction bounds come from stored state, never from the request body', () => {
  const at = server.indexOf("app.post('/api/results/score-correction'");
  const route = server.slice(at, at + 2400);
  assert.ok(route.includes('scoreCorrectionBasis('), 'bounds are loaded server-side');
  assert.equal(/b\.currentScore|b\.maxScore/.test(route), false, 'the client cannot supply the bounds');
  assert.ok(route.includes('SCORE_CORRECTION_BASIS_UNAVAILABLE'), 'no basis means refuse');
});
