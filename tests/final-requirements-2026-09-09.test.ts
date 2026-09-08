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

test('support is universal and Arabic dynamic text is normalized to Western digits',()=>{
 const header=s('src/components/layout/Header.tsx');const guard=s('src/components/design-system/ArabicInterfaceGuard.tsx');
 assert.match(header,/LiveSupportControl/);assert.doesNotMatch(header,/!superAdmin\s*&&\s*\([\s\S]{0,500}<LiveSupportControl/);
 assert.match(guard,/toAsciiDigits/);assert.match(guard,/toAsciiDigits\(raw\)/);
});

test('committee state is persisted and organization manager starts with competitions',()=>{
 const overview=s('src/components/admin/CompetitionOverview.tsx');const portals=s('src/components/admin/RolePortals.tsx');
 for(const value of ["'ready'","'testing'","'paused'","'offline'"])assert.match(overview,new RegExp(value));
 assert.match(overview,/updateCommittee/);for(const label of ['جاهزة','تحت الاختبار','متوقفة مؤقتًا','غير متصلة'])assert.match(overview,new RegExp(label));
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
