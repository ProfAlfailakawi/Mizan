import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const s=(p:string)=>fs.readFileSync(p,'utf8');

test('competition and organization logos use authenticated R2 object storage, never Data URLs',()=>{
 const overview=s('src/components/admin/CompetitionOverview.tsx');const tenant=s('src/components/admin/TenantBrandStudio.tsx');const client=s('src/lib/brand-assets.ts');const server=s('server.ts');const r2=s('server/r2-private.ts');
 assert.match(overview,/uploadCompetitionLogo/);assert.match(overview,/deleteCompetitionLogo/);assert.doesNotMatch(overview,/FileReader|readAsDataURL/);
 assert.match(tenant,/uploadOrganizationLogo/);assert.doesNotMatch(tenant,/FileReader|readAsDataURL/);
 assert.match(client,/MAX_BRAND_LOGO_BYTES = 2 \* 1024 \* 1024/);assert.match(client,/image\/svg\+xml/);assert.match(client,/getIdToken/);
 assert.match(server,/\/api\/brand-assets\/organizations\/:organizationId\/competitions\/:competitionId\/logo/);assert.match(server,/brandBytesValid/);assert.match(server,/BRAND_SCOPE_NOT_ALLOWED/);assert.match(server,/r2ConfigFromEnv/);assert.match(r2,/async deleteObject/);
});

test('FairDraw is system initiated and public registration auto-approval remains policy driven',()=>{
 const overview=s('src/components/admin/CompetitionOverview.tsx');const cfg=s('src/lib/competition-config.ts');const store=s('src/lib/store.ts');const registration=s('src/components/public/RegistrationFlow.tsx');
 assert.doesNotMatch(overview,/المتسابق يبدأ سحب سؤاله|Participant initiates the question draw/);assert.match(overview,/يبدأ ميزان السحب العادل تلقائيًا/);
 assert.match(cfg,/policy\.questions\.participantInitiatedDraw=false/);assert.match(store,/generateFairDraw/);assert.match(store,/startSessionForParticipant/);assert.match(registration,/autoApproveEligible/);
});

test('super admin stays a clean control tower without direct support/help clutter',()=>{
 const header=s('src/components/layout/Header.tsx');const app=s('src/App.tsx');const guard=s('src/components/design-system/ArabicInterfaceGuard.tsx');
 assert.doesNotMatch(header,/LiveSupportControl/);
 assert.doesNotMatch(app,/LiveSupportControl/);
 assert.match(header,/!superAdmin&&<button onClick=\{\(\)=>setHelpOpen\(true\)\}/);
 assert.match(guard,/toAsciiDigits/);assert.match(guard,/toAsciiDigits\(raw\)/);
});

test('committee state is automatic and organization manager starts with competitions',()=>{
 const overview=s('src/components/admin/CompetitionOverview.tsx');const portals=s('src/components/admin/RolePortals.tsx');
 assert.match(overview,/committeeAutoStatus/);
 assert.match(overview,/حالة اللجنة — تلقائية/);
 assert.doesNotMatch(overview,/TinySelect value=\{committee\.status\}/);
 const competitions=portals.indexOf('مسابقات الجهة'),permissions=portals.indexOf('فريق وصلاحيات المسابقة');assert.ok(competitions>=0&&permissions>competitions);
});

test('six requested feature-flag names are not seeded as pretend runtime controls',()=>{
 const seed=s('src/lib/seed-data.ts');const block=seed.slice(seed.indexOf('SEED_FEATURE_FLAGS'),seed.indexOf('SEED_FEATURE_FLAGS')+500);
 for(const key of ['ai_integrity','shadow_mode','hospitality','remote_rounds','broadcast','benchmark'])assert.doesNotMatch(block,new RegExp(key));
 assert.match(seed,/SEED_FEATURE_FLAGS\s*:\s*FeatureFlagRecord\[\]\s*=\s*\[\s*\]/);
});

test('real MFA and QR rendering remain wired',()=>{
 const totp=s('src/components/auth/TotpSecurity.tsx');const identity=s('src/components/admin/IdentityGovernance.tsx');const store=s('src/lib/store.ts');
 assert.match(totp,/multiFactor\(active\)\.enroll/);assert.match(identity,/RealQRCode/);assert.match(store,/reissueQrBundle/);
});


test('all September 9 UX fixes are wired to real state rather than cosmetic placeholders',()=>{
 const app=s('src/App.tsx');const overview=s('src/components/admin/CompetitionOverview.tsx');const enterprise=s('src/components/admin/EnterpriseWorkspace.tsx');const deployment=s('src/components/admin/DeploymentStudio.tsx');const readiness=s('src/components/admin/ReadinessLab.tsx');const identity=s('src/components/admin/IdentityGovernance.tsx');const store=s('src/lib/store.ts');const types=s('src/types/index.ts');const seed=s('src/lib/seed-data.ts');const rules=s('firestore.rules');const official=s('server/kfgqpc-official-library.ts');
 // Public registration always refreshes the published copy so newly-created categories appear.
 assert.match(app,/const publicRoute=hash\.startsWith\('#register'\)\|\|hash\.startsWith\('#competition'\)/);
 assert.match(app,/loadPublicCompetition\(requestedComp\)/);assert.match(store,/public_competitions/);assert.match(rules,/match \/public_competitions\/\{competitionId\}/);
 // Opening registration is an in-place publish action, not a broken hash redirect.
 assert.match(overview,/store\.publishCompetition\(\)/);assert.doesNotMatch(overview,/window\.location\.hash=['"]#manage-competition['"]/);
 // Category passage uses ayah or quarter-page steppers; internal question/time fields are not shown in the category editor.
 assert.match(types,/passageMode\?: 'ayat' \| 'page_quarters'/);assert.match(types,/pageQuarterUnits\?: number/);assert.match(overview,/PassageLengthControl/);assert.match(overview,/الزيادة كل مرة: ربع وجه/);const draft=overview.slice(overview.indexOf('const emptyDraft'),overview.indexOf('const saveCategory'));assert.doesNotMatch(draft,/question|Duration|أسئلة|زمن/i);assert.match(overview,/targetDurationMinutes:c\.ruleSet\.questionDurationMinutes/);
 // Save is durable locally on every mutation and competition configuration carries conflict-safe freshness.
 assert.match(store,/function persistLocalSnapshot\(\): boolean/);assert.match(store,/function notify\(\)[\s\S]{0,700}persistLocalSnapshot\(\)/);assert.match(store,/competitionConfigUpdatedAt/);assert.match(store,/markCompetitionConfigChanged\(\); notify\(\)/);
 // Manager permission surface is tabbed and includes the organization's actual licensed modules.
 assert.match(identity,/role="tablist"/);assert.match(identity,/إضافة مستخدم/);assert.match(identity,/صلاحيات المنصة الممنوحة للجهة/);assert.match(identity,/moduleGrants/);
 // Connect jumps to the actual editor/focus target.
 assert.match(enterprise,/scrollIntoView\(\{behavior:'smooth'/);assert.match(enterprise,/mizan-integration-provider/);
 // Deployment has no artificial economic/balanced/expanded choice.
 assert.doesNotMatch(deployment,/اقتصادي|متوازن|موسّع|economic|balanced|expanded/i);
 // No fake flight is shown/seeded, and CSV has a downloadable template.
 assert.doesNotMatch(seed,/MZ 417/);assert.match(enterprise,/لن يُنشئ ميزان أي رحلة تلقائيًا/);assert.match(enterprise,/تحميل النموذج/);assert.match(enterprise,/downloadTemplate/);
 // Recovery/export/support utilities are centralized once; regulation-to-policy import card is removed from readiness UI.
 assert.match(enterprise,/أدوات الإدارة/);assert.equal((enterprise.match(/<Governance /g)||[]).length,1);assert.doesNotMatch(readiness,/استيراد لائحة|حوّل اللائحة إلى سياسة مسابقة/);
 // The official Madinah Mushaf visual master is already accepted, not shown as missing.
 assert.match(official,/id:'official-mushaf-vector'[\s\S]{0,650}operationalState:'OFFICIALLY_ACCEPTED'/);
});

test('public competition write rules preserve tenant isolation while allowing the platform owner',()=>{
 const rules=s('firestore.rules');
 assert.match(rules,/request\.auth\.token\.role == 'super_admin' \|\| request\.resource\.data\.organizationId == request\.auth\.token\.org_id/);
 assert.match(rules,/resource\.data\.organizationId == request\.auth\.token\.org_id/);
});


test('remaining requested clarity and responsive fixes are present',()=>{
 const portals=s('src/components/admin/RolePortals.tsx');const overview=s('src/components/admin/CompetitionOverview.tsx');const readiness=s('src/lib/readiness.ts');const compiler=s('src/lib/policy-compiler.ts');
 assert.match(portals,/ما الذي تفعله الوحدات؟/);assert.match(portals,/الحالة هنا تعكس الربط الحقيقي/);assert.match(portals,/descAr:/);assert.match(portals,/readyAr:/);
 assert.doesNotMatch(portals,/ScientificGovernance/);
 assert.match(overview,/grid grid-cols-1 xl:grid-cols-2 gap-4 \[&>\*\]:min-w-0/);assert.match(overview,/grid grid-cols-1 xl:grid-cols-2 gap-3 \[&>\*\]:min-w-0/);
 assert.match(readiness,/isKfgqpcOfficialReading/);assert.match(readiness,/مصدر قرآني رسمي أو مصدر داخلي معتمد/);
 assert.match(compiler,/isKfgqpcOfficialReading/);
});
