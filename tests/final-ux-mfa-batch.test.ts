import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const s=(p:string)=>fs.readFileSync(p,'utf8');

test('MFA re-setup is generic, local, and enrolls new TOTP before old-factor cleanup',()=>{
 const x=s('src/components/auth/TotpSecurity.tsx');
 assert.match(x,/إعادة إعداد تطبيق المصادقة/);
 assert.match(x,/مفتاح الإعداد اليدوي \(Setup Key\)/);
 assert.match(x,/Apple Passwords/);
 assert.match(x,/RealQRCode value=\{uri\}/);
 assert.match(x,/multiFactor\(active\)\.enroll/);
 assert.match(x,/multiFactor\(active\)\.unenroll/);
 assert.ok(x.indexOf('multiFactor(active).enroll')<x.indexOf('multiFactor(active).unenroll'));
 assert.doesNotMatch(x,/localStorage|sessionStorage|api\.qrserver|quickchart|chart\.google/i);
});

test('MFA sign-in exposes factor choice if replacement temporarily leaves more than one TOTP',()=>{
 const x=s('src/components/auth/AuthPortal.tsx');
 assert.match(x,/mfaHintUid/);
 assert.match(x,/hints\.length>1/);
 assert.match(x,/تطبيق المصادقة/);
 assert.doesNotMatch(x,/افتح Google Authenticator/);
});

test('activated staff never get a reissue activation QR and technical enforcement copy is hidden',()=>{
 const x=s('src/components/admin/IdentityGovernance.tsx');
 assert.doesNotMatch(x,/reissue-qr/);
 assert.doesNotMatch(x,/العزل والتجميد والحذف تفرض من الخادم/);
});

test('competition access lives under its card, not duplicated inside competition navigation',()=>{
 const x=s('src/components/admin/CompetitionOverview.tsx');
 assert.doesNotMatch(x,/id:'access'/);
 assert.doesNotMatch(x,/IdentityGovernance competitionId/);
});

test('category creation is explicit and has no fake default category values',()=>{
 const overview=s('src/components/admin/CompetitionOverview.tsx');
 const store=s('src/lib/store.ts');
 assert.match(overview,/حفظ الفئة/);
 assert.match(overview,/لا توجد فئة افتراضية/);
 assert.doesNotMatch(store,/name:'New category'.*nameArabic:'فئة جديدة'/s);
 assert.doesNotMatch(store,/memorizationScope:'Custom'.*juzCount:30/s);
});

test('registration admin exposes only controls that the public flow actually consumes',()=>{
 const x=s('src/components/admin/CompetitionOverview.tsx');
 const a=x.indexOf('const RegistrationSection=');const b=x.indexOf('const WorkflowSection=',a);const section=x.slice(a,b);
 assert.doesNotMatch(section,/نوع التسجيل|Registration mode|طريقة الدخول|accountMode/);
 assert.match(section,/autoApproveEligible/);
 assert.match(section,/requireGuardianForMinors/);
});

test('participant never initiates the random draw from admin settings',()=>{
 const x=s('src/components/admin/CompetitionOverview.tsx');
 assert.doesNotMatch(x,/المتسابق يبدأ سحب سؤاله/);
 const cfg=s('src/lib/competition-config.ts');
 assert.match(cfg,/participantInitiatedDraw: false/);
});

test('venue and travel screens do not fabricate hardware or flights',()=>{
 const d=s('src/components/admin/DeploymentStudio.tsx');
 const e=s('src/components/admin/EnterpriseWorkspace.tsx');
 assert.match(d,/laptops:0,desktops:0,tablets:0,tvs:0,printers:0/);
 assert.doesNotMatch(e,/MZ 417/);
 assert.match(e,/تحميل نموذج Excel/);
});

test('super admin header is reduced to platform-owner controls and tenant brand stays tenant-owned',()=>{
 const h=s('src/components/layout/Header.tsx');const t=s('src/components/admin/TenantConsole.tsx');
 assert.match(h,/superAdmin=currentUser\.role==='super_admin'/);
 assert.match(h,/!superAdmin&&<EmergencyControl/);
 assert.match(h,/!superAdmin&&<RoleSwitcher/);
 assert.doesNotMatch(t,/TenantBrandStudio/);
 assert.match(t,/مستخدمو هذه الجهة|المستخدمون/);
});

test('open registration reports blockers instead of swallowing a disabled click',()=>{
 const x=s('src/components/admin/CompetitionOverview.tsx');
 assert.match(x,/publishIssues/);
 assert.doesNotMatch(x,/disabled=\{readiness\.length>0\}.*فتح التسجيل/s);
 const store=s('src/lib/store.ts');
 const a=store.indexOf('const publishCompetition =');const b=store.indexOf('const sourceResolvedQuestionPool',a);const block=store.slice(a,b);
 assert.match(block,/getReadinessIssues/);
 assert.doesNotMatch(block,/scientificSourcesForCompetition/);
});
