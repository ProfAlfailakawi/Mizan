import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path:string)=>fs.readFileSync(path,'utf8');

test('registration cannot advance with an implicit or stale riwaya',()=>{
  const flow=read('src/components/public/RegistrationFlow.tsx');
  const api=read('server/public-registration.ts');
  assert.match(flow,/riwaya:''/);
  assert.match(flow,/step===1\?readingOk:true/);
  assert.match(flow,/اختر الرواية أعلاه للمتابعة/);
  assert.match(flow,/setForm\(\{\.\.\.form,categoryId:c\.id,riwaya:''\}\)/);
  /*
   * الفئة قد تُفتح على عدّة روايات، والاختيار يبقى صريحًا: الفراغ مرفوض، وما ليس في
   * قائمة الفئة مرفوض. فالتعدّد وسّع المسموح ولم يُلغِ الاشتراط.
   */
  assert.match(api,/const allowedReadings=\[defaultReading,\.\.\.\(category\.allowedRiwayat\|\|\[\]\)\.map\(x=>clean\(x,120\)\)\]\.filter\(Boolean\)/);
  assert.match(api,/const categoryReading=allowedReadings\.find\(x=>x===input\.riwaya\)/);
  assert.match(api,/if\(!categoryReading\)throw new Error\('REGISTRATION_READING_INVALID'\)/);
});

test('participant review supports category filtering, row selection and safe bulk approval',()=>{
  const overview=read('src/components/admin/CompetitionOverview.tsx');
  assert.match(overview,/categoryFilter/);
  assert.match(overview,/selectedIds/);
  assert.match(overview,/اختيار الكل الظاهر/);
  assert.match(overview,/اعتماد المحدد/);
  assert.doesNotMatch(overview,/approveAllPending/);
});

test('registration approval is a competition policy, including auto approval',()=>{
  const overview=read('src/components/admin/CompetitionOverview.tsx');
  const api=read('server/public-registration.ts');
  assert.match(overview,/طريقة اعتماد طلبات التسجيل/);
  assert.match(overview,/p\.registration\.autoApproveEligible=true/);
  assert.match(overview,/p\.registration\.autoApproveEligible=false/);
  assert.match(api,/policy\.registration\.autoApproveEligible&&!needsReview\?'approved':'under_review'/);
});

test('participant scope selection and duplicate panel distribution are removed from active UI',()=>{
  const engine=read('src/components/admin/QuestionEngineWorkspace.tsx');
  const participant=read('src/components/participant/ParticipantDashboard.tsx');
  const overview=read('src/components/admin/CompetitionOverview.tsx');
  assert.doesNotMatch(engine,/SelectionTab|Participant choice|المتسابق يختار نطاقه/);
  assert.doesNotMatch(participant,/saveParticipantScope|Request a range change|اطلب تعديل نطاقي/);
  assert.match(participant,/نطاق الفئة/);
  assert.match(overview,/mode==='judging'&&<section className="mizan-surface p-5 sm:p-6"/);
  assert.match(overview,/هذا هو المكان الوحيد لتوزيع اللجان/);
});

test('activation email is explicitly left-to-right inside the Arabic page',()=>{
  const auth=read('src/components/auth/AuthPortal.tsx');
  assert.match(auth,/type="email" dir="ltr" lang="en"/);
  assert.match(auth,/unicodeBidi:'plaintext'/);
});

test('empty competitions can be deleted, but server-side participant existence blocks deletion',()=>{
  const portals=read('src/components/admin/RolePortals.tsx');
  const store=read('src/lib/store.ts');
  const server=read('server.ts');
  const firestore=read('server/firestore-rest.ts');
  assert.match(portals,/حذف المسابقة/);
  assert.match(portals,/participantCount===0/);
  assert.match(store,/deleteCompetition/);
  assert.match(server,/app\.delete\('\/api\/competitions\/:competitionId'/);
  assert.match(server,/COMPETITION_HAS_PARTICIPANTS/);
  assert.match(firestore,/listCollectionIds/);
  assert.match(firestore,/listDocumentPaths/);
});

test('kiosk works without BarcodeDetector and accepts the printed current-roster MZ1 code',()=>{
  const kiosk=read('src/components/gate/KioskMode.tsx');
  const pkg=JSON.parse(read('package.json')) as {dependencies?:Record<string,string>};
  assert.equal(pkg.dependencies?.jsqr,'^1.4.0');
  assert.match(kiosk,/import jsQR from 'jsqr'/);
  assert.match(kiosk,/parseMizanPassPayload/);
  assert.match(kiosk,/participants\.filter\(p=>p\.competitionId===competition\.id\)/);
  assert.match(kiosk,/if\(direct\)\{finishCheckIn\(checkInParticipant\(direct\.id,'kiosk_qr'\)\);return;\}/);
  assert.match(kiosk,/if\(!decoded&&videoRef\.current\.readyState>=2/);
  assert.match(kiosk,/jsQR\(frame\.data,frame\.width,frame\.height/);
  assert.match(kiosk,/camera==='active'\|\|camera==='starting'/);
});
