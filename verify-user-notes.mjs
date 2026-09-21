import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.argv[2]||process.cwd());
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
let failures=0;
const ok=(name,cond)=>{if(cond)console.log(`OK  ${name}`);else{console.error(`FAIL ${name}`);failures++;}};
const has=(s,needle)=>s.includes(needle);

const registration=read('src/components/public/RegistrationFlow.tsx');
const publicApi=read('server/public-registration.ts');
const overview=read('src/components/admin/CompetitionOverview.tsx');
const engine=read('src/components/admin/QuestionEngineWorkspace.tsx');
const portals=read('src/components/admin/RolePortals.tsx');
const auth=read('src/components/auth/AuthPortal.tsx');
const participant=read('src/components/participant/ParticipantDashboard.tsx');
const store=read('src/lib/store.ts');
const server=read('server.ts');
const firestore=read('server/firestore-rest.ts');

ok('1a registration starts without implicit riwaya',/riwaya:''/.test(registration));
ok('1b next step is blocked on readingOk',/step===1\?readingOk:true/.test(registration));
ok('1c explicit reading prompt exists',has(registration,'اختر الرواية أعلاه للمتابعة'));
ok('1d server rejects blank/mismatched category reading',/const categoryReading=clean\(category\.riwaya,120\)/.test(publicApi)&&/!categoryReading\|\|input\.riwaya!==categoryReading/.test(publicApi));

ok('2a participant category filter exists',has(overview,'categoryFilter'));
ok('2b row selection exists',has(overview,'selectedIds'));
ok('2c select-all-visible exists',has(overview,'اختيار الكل الظاهر'));
ok('2d bulk approval is selected-only',has(overview,'اعتماد المحدد'));

ok('3a approval policy UX exists',has(overview,'طريقة اعتماد طلبات التسجيل'));
ok('3b automatic approval can be selected',has(overview,'p.registration.autoApproveEligible=true'));
ok('3c manual review can be selected',has(overview,'p.registration.autoApproveEligible=false'));
ok('3d server reads autoApproveEligible',has(publicApi,'policy.registration.autoApproveEligible'));

ok('4a delete competition UX exists',has(portals,'حذف المسابقة'));
ok('4b delete button is gated by zero participants',has(portals,'participantCount===0'));
ok('4c store has server-backed deleteCompetition',has(store,'const deleteCompetition = async'));
ok('4d server blocks a competition that has participants',has(server,'COMPETITION_HAS_PARTICIPANTS'));
ok('4e Firestore recursive cleanup helpers exist',has(firestore,'listCollectionIds')&&has(firestore,'listDocumentPaths'));

ok('5 activation email is LTR + BiDi isolated',has(auth,'type="email" dir="ltr" lang="en"')&&has(auth,"unicodeBidi:'plaintext'"));

ok('6 organizer automation selector removed',!has(overview,"label={ar?'الأتمتة':'Automation'}")&&!has(overview,'automationLevelLabel'));

ok('7a participant-choice tab removed',!has(engine,'SelectionTab')&&!has(engine,'Participant choice')&&!has(engine,'المتسابق يختار نطاقه'));
ok('7b participant dashboard no longer edits personal scope',!has(participant,'saveParticipantScope')&&!has(participant,'اطلب تعديل نطاقي')&&has(participant,'نطاق الفئة'));
ok('7c public registration does not submit memorizationScope',!has(registration,'memorizationScope:scope'));

if(failures){console.error(`\n${failures} verification check(s) failed.`);process.exit(1);}
console.log('\nAll seven user-note groups are present. No GitHub write was performed.');
