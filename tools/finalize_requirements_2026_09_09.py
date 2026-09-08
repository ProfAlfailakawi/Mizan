from pathlib import Path
import re


def read(path:str)->str:
    return Path(path).read_text(encoding='utf-8')

def write(path:str,text:str):
    Path(path).write_text(text,encoding='utf-8')

def replace_once(path:str,old:str,new:str,label:str):
    text=read(path)
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'{path}: missing anchor for {label}')
    write(path,text.replace(old,new,1))

def regex_once(path:str,pattern:str,repl:str,label:str,flags=re.S):
    text=read(path)
    out,n=re.subn(pattern,repl,text,count=1,flags=flags)
    if n!=1:
        raise SystemExit(f'{path}: expected 1 replacement for {label}, got {n}')
    write(path,out)

# R2 gains actual object deletion so removing a logo is not a cosmetic state change.
replace_once(
    'server/r2-private.ts',
    "  async listObjects(prefix='',continuationToken?:string,maxKeys=1000):Promise<R2ListResult>{",
    "  async deleteObject(key:string){\n    const r=await this.request('DELETE',key);\n    if(r.status===404)return {deleted:false};\n    if(!r.ok)throw new R2RequestError(r.status,'DELETE');\n    return {deleted:true};\n  }\n\n  async listObjects(prefix='',continuationToken?:string,maxKeys=1000):Promise<R2ListResult>{",
    'R2 deleteObject',
)

# Server-side, authenticated brand asset transport. Assets are public display material, but writes are scoped.
replace_once(
    'server.ts',
    "import { decodePemFromEnv } from './server/pem';",
    "import { decodePemFromEnv } from './server/pem';\nimport { R2PrivateClient, r2ConfigFromEnv } from './server/r2-private';",
    'R2 import',
)
replace_once(
    'server.ts',
    "  const escrowDir=process.env.MIZAN_QUESTION_ESCROW_DIR||'';",
    "  const brandR2Config=r2ConfigFromEnv();let brandAssetsR2:R2PrivateClient|null=null;try{if(brandR2Config)brandAssetsR2=new R2PrivateClient(brandR2Config)}catch(err){console.error('Brand asset R2 disabled:',err)}\n  const escrowDir=process.env.MIZAN_QUESTION_ESCROW_DIR||'';",
    'brand R2 initialization',
)
brand_routes = r'''  // Organization/competition logos use the already-configured private R2 bucket. Only the bytes are public; writes remain Firebase-authorized and tenant-scoped.
  const brandAssetRaw=express.raw({type:()=>true,limit:'2mb'});
  const brandMime=new Set(['image/png','image/jpeg','image/webp','image/svg+xml']);
  const brandIdOk=(v:string)=>/^[A-Za-z0-9._-]{1,120}$/.test(v);
  const brandKey=(organizationId:string,competitionId?:string)=>competitionId?`brand-assets/${organizationId}/competitions/${competitionId}/logo`:`brand-assets/${organizationId}/organization/logo`;
  const brandUrl=(organizationId:string,competitionId?:string)=>competitionId?`/api/public/brand-assets/organizations/${encodeURIComponent(organizationId)}/competitions/${encodeURIComponent(competitionId)}/logo?v=${Date.now()}`:`/api/public/brand-assets/organizations/${encodeURIComponent(organizationId)}/logo?v=${Date.now()}`;
  const brandWriteAllowed=(actor:ServerIdentity,organizationId:string,competitionId?:string)=>actor.role==='super_admin'||(actor.organizationId===organizationId&&(actor.role==='org_admin'||(actor.role==='comp_admin'&&!!competitionId&&actor.competitionId===competitionId)));
  const brandBytesValid=(body:Buffer,type:string)=>{
    if(!body.length||body.length>2*1024*1024||!brandMime.has(type))return false;
    if(type==='image/png')return body.length>=8&&body.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
    if(type==='image/jpeg')return body.length>=3&&body[0]===0xff&&body[1]===0xd8&&body[2]===0xff;
    if(type==='image/webp')return body.length>=12&&body.subarray(0,4).toString('ascii')==='RIFF'&&body.subarray(8,12).toString('ascii')==='WEBP';
    const svg=body.toString('utf8').trim();
    return /<svg(?:\s|>)/i.test(svg)&&!/<\s*(?:script|foreignObject|iframe|object|embed)\b/i.test(svg)&&!/(?:\son[a-z]+\s*=|javascript\s*:)/i.test(svg);
  };
  const putBrandLogo=async(req:any,res:any,competitionId?:string)=>{if(!brandAssetsR2)return res.status(503).json({code:'BRAND_STORAGE_NOT_CONFIGURED'});const organizationId=String(req.params.organizationId||'');if(!brandIdOk(organizationId)||(competitionId&&!brandIdOk(competitionId)))return res.status(400).json({code:'BRAND_SCOPE_INVALID'});const actor=req.mizanIdentity as ServerIdentity;if(!brandWriteAllowed(actor,organizationId,competitionId))return res.status(403).json({code:'BRAND_SCOPE_NOT_ALLOWED'});const type=String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase();const body=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);if(!brandBytesValid(body,type))return res.status(415).json({code:body.length>2*1024*1024?'LOGO_TOO_LARGE':'LOGO_TYPE_OR_CONTENT_INVALID'});try{await brandAssetsR2.putObject(brandKey(organizationId,competitionId),body,type,{sha256:crypto.createHash('sha256').update(body).digest('hex')});res.setHeader('Cache-Control','no-store');return res.status(201).json({url:brandUrl(organizationId,competitionId)})}catch{return res.status(502).json({code:'BRAND_STORAGE_WRITE_FAILED'})}};
  const deleteBrandLogo=async(req:any,res:any,competitionId?:string)=>{if(!brandAssetsR2)return res.status(503).json({code:'BRAND_STORAGE_NOT_CONFIGURED'});const organizationId=String(req.params.organizationId||'');if(!brandIdOk(organizationId)||(competitionId&&!brandIdOk(competitionId)))return res.status(400).json({code:'BRAND_SCOPE_INVALID'});const actor=req.mizanIdentity as ServerIdentity;if(!brandWriteAllowed(actor,organizationId,competitionId))return res.status(403).json({code:'BRAND_SCOPE_NOT_ALLOWED'});try{await brandAssetsR2.deleteObject(brandKey(organizationId,competitionId));return res.status(204).end()}catch{return res.status(502).json({code:'BRAND_STORAGE_DELETE_FAILED'})}};
  const getBrandLogo=async(req:any,res:any,competitionId?:string)=>{if(!brandAssetsR2)return res.status(503).end();const organizationId=String(req.params.organizationId||'');if(!brandIdOk(organizationId)||(competitionId&&!brandIdOk(competitionId)))return res.status(400).end();try{const object=await brandAssetsR2.getObject(brandKey(organizationId,competitionId));if(!object)return res.status(404).end();const type=String(object.headers.get('content-type')||'application/octet-stream');res.setHeader('Content-Type',type);res.setHeader('Cache-Control','public, max-age=300, stale-while-revalidate=3600');res.setHeader('X-Content-Type-Options','nosniff');if(type==='image/svg+xml')res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; sandbox");return res.send(Buffer.from(await object.arrayBuffer()))}catch{return res.status(502).end()}};
  app.get('/api/public/brand-assets/organizations/:organizationId/logo',(req,res)=>void getBrandLogo(req,res));
  app.get('/api/public/brand-assets/organizations/:organizationId/competitions/:competitionId/logo',(req,res)=>void getBrandLogo(req,res,String(req.params.competitionId||'')));
  app.put('/api/brand-assets/organizations/:organizationId/logo',requireGovernanceRoles(['super_admin','org_admin']),brandAssetRaw,(req,res)=>void putBrandLogo(req,res));
  app.delete('/api/brand-assets/organizations/:organizationId/logo',requireGovernanceRoles(['super_admin','org_admin']),(req,res)=>void deleteBrandLogo(req,res));
  app.put('/api/brand-assets/organizations/:organizationId/competitions/:competitionId/logo',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),brandAssetRaw,(req,res)=>void putBrandLogo(req,res,String(req.params.competitionId||'')));
  app.delete('/api/brand-assets/organizations/:organizationId/competitions/:competitionId/logo',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>void deleteBrandLogo(req,res,String(req.params.competitionId||'')));

'''
replace_once(
    'server.ts',
    "  // Named-account identity governance. MIZAN stores no passwords; a verified Firebase identity is bound once to a scoped MIZAN invitation.\n",
    brand_routes + "  // Named-account identity governance. MIZAN stores no passwords; a verified Firebase identity is bound once to a scoped MIZAN invitation.\n",
    'brand routes',
)

# Western digits are normalized centrally, including dynamically inserted text nodes.
replace_once(
    'src/components/design-system/ArabicInterfaceGuard.tsx',
    "import { isTechnicalToken, localizeTechnicalToken } from '../../lib/ui-language';",
    "import { isTechnicalToken, localizeTechnicalToken } from '../../lib/ui-language';\nimport { toAsciiDigits } from '../../lib/input-validation';",
    'ascii digit import',
)
replace_once(
    'src/components/design-system/ArabicInterfaceGuard.tsx',
    "const localizeText = (raw: string) => {\n  let out = raw;",
    "const localizeText = (raw: string) => {\n  let out = toAsciiDigits(raw);",
    'ascii digit conversion',
)

# Live support is a universal authenticated control, including the platform owner.
header=read('src/components/layout/Header.tsx')
header,n=re.subn(r"\{!superAdmin\s*&&\s*\(\s*(<LiveSupportControl[\s\S]*?/>)\s*\)\}",r"\1",header,count=1)
if n!=1: raise SystemExit('Header: live support wrapper not found')
write('src/components/layout/Header.tsx',header)

# System owns FairDraw initiation even if stale persisted policy once enabled the old participant switch.
replace_once(
    'src/lib/competition-config.ts',
    "export function getCompetitionPolicy(competition: Competition): CompetitionPolicy {\n  return mergePolicy(BASE_POLICY, competition.policy);\n}",
    "export function getCompetitionPolicy(competition: Competition): CompetitionPolicy {\n  const policy=mergePolicy(BASE_POLICY, competition.policy);\n  policy.questions.participantInitiatedDraw=false;\n  return policy;\n}",
    'system FairDraw normalization',
)
overview=read('src/components/admin/CompetitionOverview.tsx')
overview=overview.replace("import { TRANSITION_PHRASES_AR, TRANSITION_PHRASES_EN } from '../../lib/judging-integrity';","import { TRANSITION_PHRASES_AR, TRANSITION_PHRASES_EN } from '../../lib/judging-integrity';\nimport { deleteCompetitionLogo, isManagedBrandLogoUrl, uploadCompetitionLogo } from '../../lib/brand-assets';")
overview,n=re.subn(r" const uploadLogo=\(file\?:File\)=>\{[\s\S]*?reader\.readAsDataURL\(file\)\};", """ const [logoBusy,setLogoBusy]=useState(false); const visibleLogo=c.logoUrl&&!c.logoUrl.startsWith('data:')?c.logoUrl:undefined;
 const uploadLogo=async(file?:File)=>{if(!file||logoBusy)return;setLogoBusy(true);try{const url=await uploadCompetitionLogo(c.organizationId,c.id,file);patch({logoUrl:url})}catch(err){const code=err instanceof Error?err.message:'';window.alert(code==='LOGO_TOO_LARGE'?(ar?'حجم الشعار يجب ألا يتجاوز 2MB.':'Logo must be 2MB or smaller.'):(ar?'اختر PNG أو JPG/JPEG أو WebP أو SVG صالحًا.':'Choose a valid PNG, JPG/JPEG, WebP or SVG.'))}finally{setLogoBusy(false)}};
 const removeLogo=async()=>{if(logoBusy)return;setLogoBusy(true);try{if(isManagedBrandLogoUrl(c.logoUrl))await deleteCompetitionLogo(c.organizationId,c.id);patch({logoUrl:undefined})}catch{window.alert(ar?'تعذر حذف ملف الشعار من التخزين.':'Could not remove the stored logo.')}finally{setLogoBusy(false)}};""",overview,count=1)
if n!=1: raise SystemExit('CompetitionOverview: uploadLogo block not found')
pattern=r"<Control label=\{ar\?'شعار هذه المسابقة':'Competition logo'\}>[\s\S]*?</Control>"
logo_jsx="""<Control label={ar?'شعار هذه المسابقة':'Competition logo'}><div className=\"rounded-xl border border-[#dcdad2] bg-white p-3\"><div className=\"flex flex-col sm:flex-row sm:items-center gap-3\">{visibleLogo?<img src={visibleLogo} alt={ar?'شعار المسابقة':'Competition logo'} className=\"w-16 h-16 rounded-xl object-contain border bg-white\"/>:<div className=\"w-16 h-16 rounded-xl border border-dashed grid place-items-center text-[10px] text-[#777]\">{ar?'لا شعار':'No logo'}</div>}<label aria-disabled={logoBusy} className={`min-h-11 px-4 rounded-xl bg-[#214C40] text-white text-xs font-black inline-flex items-center justify-center gap-2 cursor-pointer ${logoBusy?'opacity-60 pointer-events-none':''}`}><FileUp className=\"w-4 h-4\"/>{logoBusy?(ar?'جارٍ الحفظ…':'Saving…'):(visibleLogo?(ar?'استبدال الشعار':'Replace logo'):(ar?'رفع الشعار':'Upload logo'))}<input type=\"file\" accept=\".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml\" className=\"sr-only\" onChange={e=>{void uploadLogo(e.target.files?.[0]);e.currentTarget.value=''}}/></label>{c.logoUrl&&<button type=\"button\" disabled={logoBusy} onClick={()=>void removeLogo()} className=\"min-h-11 px-4 rounded-xl border text-xs font-black disabled:opacity-50\">{ar?'حذف':'Remove'}</button>}</div><p className=\"mt-2 text-[10px] text-[#656b66]\">{ar?'PNG أو JPG/JPEG أو WebP أو SVG — بحد أقصى 2MB. يُحفظ الملف في التخزين الفعلي ولا يُخزن داخل بيانات المسابقة.':'PNG, JPG/JPEG, WebP or SVG — max 2MB. The file is stored in object storage, never inside competition state.'}</p></div></Control>"""
overview,n=re.subn(pattern,logo_jsx,overview,count=1)
if n!=1: raise SystemExit('CompetitionOverview: logo JSX not found')
overview,n=re.subn(r"<p className=\"text-\[10px\] leading-5 text-\[#656b66\] mb-2\">\{ar\?'«يبدأ السحب»[\s\S]*?</p><Toggle value=\{policy\.questions\.participantInitiatedDraw\}[\s\S]*?/>","<div className=\"mb-3 rounded-xl border border-[#d9e4de] bg-[#F7FAF8] p-3 text-[11px] font-bold leading-5 text-[#214C40]\">{ar?'يبدأ ميزان السحب العادل تلقائيًا عند بدء جلسة المتسابق؛ لا يحتاج المتسابق إلى زر سحب ولا يمكن تحويل هذه المسؤولية إليه.':'MIZAN starts FairDraw automatically when the participant session begins; there is no participant draw button and this responsibility cannot be delegated.'}</div>",overview,count=1)
if n!=1: raise SystemExit('CompetitionOverview: participant draw toggle not found')
write('src/components/admin/CompetitionOverview.tsx',overview)

# Organization brand upload uses the same R2 pipeline; manual HTTPS URLs remain supported.
tenant=read('src/components/admin/TenantBrandStudio.tsx')
tenant=tenant.replace("import { auth } from '../../lib/firebase';","import { auth } from '../../lib/firebase';\nimport { uploadOrganizationLogo } from '../../lib/brand-assets';")
tenant=tenant.replace("    const isDataUri = /^data:image\\//i.test(trimmed);","    const isManagedAsset = /^\\/api\\/public\\/brand-assets\\//i.test(trimmed);")
tenant=tenant.replace("    if (!isHttps && !isDataUri) {","    if (!isHttps && !isManagedAsset) {")
tenant=tenant.replace("'تنبيه أمان: يجب أن يبدأ الرابط بـ https:// أو يكون بصيغة data:image لتفادي حجب المتصفح.'","'تنبيه أمان: استخدم رابط https:// أو شعارًا مرفوعًا إلى تخزين ميزان.'")
tenant=tenant.replace("'Security warning: URL must start with https:// or be a data:image URI.'","'Security warning: use an https:// URL or a logo uploaded to MIZAN storage.'")
tenant,n=re.subn(r"  // رفع ملف شعار محلي وتحويله إلى Data URI آمن[\s\S]*?  // قياس مؤشر جاهزية وجودة الهوية المؤسسية", """  // رفع ملف الشعار إلى التخزين الفعلي؛ لا تدخل bytes الشعار في سجل الجهة.
  const [uploadingLogo,setUploadingLogo]=useState(false);
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file=e.target.files?.[0];e.currentTarget.value='';if(!file||uploadingLogo)return;
    const targetOrgId=orgId||store.organization?.id;if(!targetOrgId){setServerError(ar?'تعذر تحديد الجهة.':'Organization scope is unavailable.');return}
    setUploadingLogo(true);setServerError('');
    try{setLogoUrl(await uploadOrganizationLogo(targetOrgId,file))}
    catch(err){const code=err instanceof Error?err.message:'';setServerError(code==='LOGO_TOO_LARGE'?(ar?'حجم الشعار يجب ألا يتجاوز 2MB.':'Logo must be 2MB or smaller.'):(ar?'اختر PNG أو JPG/JPEG أو WebP أو SVG صالحًا.':'Choose a valid PNG, JPG/JPEG, WebP or SVG.'))}
    finally{setUploadingLogo(false)}
  };

  // قياس مؤشر جاهزية وجودة الهوية المؤسسية""",tenant,count=1)
if n!=1: raise SystemExit('TenantBrandStudio: FileReader upload block not found')
write('src/components/admin/TenantBrandStudio.tsx',tenant)

# No-op feature flag seed records were misleading: real capabilities stay governed by their actual subsystems.
seed=read('src/lib/seed-data.ts')
seed,n=re.subn(r"// أعلام ميزات مُفعّلة[^\n]*\nexport const SEED_FEATURE_FLAGS: FeatureFlagRecord\[\] = \[[\s\S]*?\n\];", "// لا نزرع Feature Flags شكلية. القدرات الفعلية تُدار من أنظمتها التشغيلية وصلاحياتها الحقيقية.\nexport const SEED_FEATURE_FLAGS: FeatureFlagRecord[] = [];",seed,count=1)
if n!=1: raise SystemExit('seed-data: feature flag seed block not found')
write('src/lib/seed-data.ts',seed)

# Resolve legacy tests whose assertions contradict the now-adopted competition-card access hierarchy and QR lifecycle UI.
replace_once('tests/competition-scoped-identity-onboarding.test.ts'," assert.match(comp,/IdentityGovernance competitionId=\\{competition\\.id\\}/);"," assert.doesNotMatch(comp,/IdentityGovernance competitionId=\\{competition\\.id\\}/);",'legacy competition access assertion')
replace_once('tests/product-hardening-phase-a.test.ts',"assert.match(id,/Pause/);assert.match(id,/reissue-qr/)","assert.match(id,/Pause/);assert.doesNotMatch(id,/reissue-qr/)",'activated-staff QR assertion')

# Final regression contract for the user's requirements.
Path('tests/final-requirements-2026-09-09.test.ts').write_text(r'''import test from 'node:test';
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
 assert.match(guard,/toAsciiDigits/);assert.match(guard,/let out = toAsciiDigits\(raw\)/);
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
 assert.match(seed,/SEED_FEATURE_FLAGS: FeatureFlagRecord\[\] = \[\]/);
});

test('real MFA and QR rendering remain wired',()=>{
 const totp=s('src/components/auth/TotpSecurity.tsx');const identity=s('src/components/admin/IdentityGovernance.tsx');const store=s('src/lib/store.ts');
 assert.match(totp,/multiFactor\(active\)\.enroll/);assert.match(identity,/RealQRCode/);assert.match(store,/reissueQrBundle/);
});
''',encoding='utf-8')

print('final source patch applied')
