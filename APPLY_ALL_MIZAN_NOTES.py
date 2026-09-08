#!/usr/bin/env python3
"""Apply the complete MIZAN 2026-09-08 notes patch safely.

Supported starting points:
- baseline b8e4e1918202a7bc73ac7a5b4690a27c50a0af83
- the incomplete follow-up b2f5ed09d59058fe834dfac93f61abb2e603a80a where the
  replacement files were committed but this large-file patcher had not been executed.

Run from the repository root *after* extracting this ZIP there. The script plans every
large-file change in memory, verifies postconditions, and only then writes the set.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path.cwd()
CHANGED: list[str] = []


def load(rel: str) -> str:
    p = ROOT / rel
    if not p.is_file():
        raise RuntimeError(f"Missing required file: {rel}. Run this from the MIZAN repository root.")
    return p.read_text(encoding="utf-8")


def exact(text: str, old: str, new: str, rel: str, label: str, *, allow_done: str | None = None) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if allow_done and allow_done in text:
        return text
    raise RuntimeError(f"{rel}: baseline anchor not found for {label}. Refusing a partial patch.")


def remove_between(text: str, start: str, end: str, rel: str, label: str, *, keep_end: bool = True) -> str:
    i = text.find(start)
    if i < 0:
        raise RuntimeError(f"{rel}: start anchor not found for {label}.")
    j = text.find(end, i + len(start))
    if j < 0:
        raise RuntimeError(f"{rel}: end anchor not found for {label}.")
    return text[:i] + (text[j:] if keep_end else text[j + len(end):])



def patch_identity_governance_ui(text: str) -> str:
    rel='src/components/admin/IdentityGovernance.tsx'
    # Accessibility baseline: every interactive icon target is at least 44x44px.
    text=text.replace('w-10 h-10','w-11 h-11')
    if 'w-10 h-10' in text:
        raise RuntimeError(f'{rel}: undersized 40px interactive target remains.')
    return text

def patch_competition_overview(text: str) -> str:
    rel = 'src/components/admin/CompetitionOverview.tsx'
    text = exact(text,
        "import { COMPETITION_TEMPLATES, getCompetitionPolicy } from '../../lib/competition-config';",
        "import { getCompetitionPolicy } from '../../lib/competition-config';", rel, 'remove built-in template import', allow_done="import { getCompetitionPolicy } from '../../lib/competition-config';")
    text = text.replace('  Search, Settings2, ShieldCheck, Sparkles, Trash2, UsersRound, WandSparkles\n', '  Search, Settings2, ShieldCheck, Sparkles, Trash2, UsersRound\n', 1)

    if 'COMPETITION_TEMPLATES.map' in text:
        marker = '  <div className="mizan-surface p-4"><div className="flex items-center gap-3 overflow-x-auto"><WandSparkles'
        i = text.find(marker)
        if i < 0: raise RuntimeError(f'{rel}: template strip marker not found.')
        line_end = text.find('\n', i)
        if line_end < 0: raise RuntimeError(f'{rel}: malformed template strip.')
        text = text[:i] + text[line_end+1:]

    old_start = '<div className="flex gap-1.5 overflow-x-auto mt-5">'
    if old_start in text:
        i = text.find(old_start)
        tail = '</div><div className="mt-4 text-xs text-[#626864]">'
        j = text.find(tail, i)
        if j < 0: raise RuntimeError(f'{rel}: live-flow end anchor not found.')
        new_flow = '''<div className="flex items-start gap-2 overflow-x-auto mt-5 pb-1">{getCompetitionPolicy(store.competition).workflow.filter(w=>w.enabled).map((w,i,all)=><React.Fragment key={w.id}><div className="shrink-0 w-14 text-center"><div title={workflowLabel(w.id,ar)} className={`mx-auto w-9 h-9 rounded-xl grid place-items-center text-xs font-black ${w.automated?'bg-[#E7EEE9] text-[#214C40]':'bg-[#F2EADC] text-[#7d5e34]'}`}>{i+1}</div><div className="mt-1.5 text-[9px] sm:text-[10px] font-bold text-[#59615c] leading-4 whitespace-nowrap">{workflowLabel(w.id,ar)}</div></div>{i<all.length-1&&<div className="shrink-0 w-4 h-px bg-[#d9d7d0] mt-[18px]"/>}</React.Fragment>)}</div>'''
        text = text[:i] + new_flow + text[j+len('</div>'):]
    elif 'w-14 text-center' not in text:
        raise RuntimeError(f'{rel}: live-flow baseline anchor not found.')

    text = text.replace("value={policy.appeals.reviewerRole}", "value={policy.appeals.reviewerRole==='scientific_admin'?'head_judge':policy.appeals.reviewerRole}", 1)
    text = text.replace("<option value=\"scientific_admin\">{ar?'الإدارة العلمية':'Scientific Admin'}</option>", '', 1)
    return text


def patch_tenant_brand(text: str) -> str:
    rel='src/components/admin/TenantBrandStudio.tsx'
    preset_start='// شعارات متجهة آمنة عالية الجودة مسبقة التجهيز تتيح للجهة التجربة الفورية'
    if preset_start in text:
        text=remove_between(text,preset_start,'export const TenantBrandStudio',rel,'preset logo data',keep_end=True)
    if 'PRESET_LOGOS.map' in text:
        start='            {/* شعارات تجريبية سريعة بنقرة واحدة */}'
        end='            {/* معاينة تباين الشعار وخلفياته */}'
        text=remove_between(text,start,end,rel,'preset logo UI',keep_end=True)
    old="""      ...(effectiveBrand || {
        name: nameEnglish || 'Organization',
        nameArabic: nameArabic || 'الجهة المنظمة',
        primaryColor: '#0d1e18',
        accentColor: '#10b981',
      }),
      name: nameEnglish || effectiveBrand?.name || 'Organization',
      nameArabic: nameArabic || effectiveBrand?.nameArabic || 'الجهة المنظمة',"""
    new="""      ...(effectiveBrand || {
        name: '',
        nameArabic: '',
        primaryColor: '#0d1e18',
        accentColor: '#10b981',
      }),
      name: nameEnglish.trim() || effectiveBrand?.name || '',
      nameArabic: nameArabic.trim() || effectiveBrand?.nameArabic || '',"""
    text=exact(text,old,new,rel,'remove fake organization fallback names',allow_done="name: nameEnglish.trim() || effectiveBrand?.name || ''")
    return text


def patch_tenant_console(text: str) -> str:
    rel='src/components/admin/TenantConsole.tsx'
    old='''                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#656b66]">\n                    <Globe2 className="w-3.5 h-3.5" />{hostOf(t)}\n                  </div>'''
    new='''                  <div className="mt-1 flex min-w-0 items-start gap-1.5 text-[11px] text-[#656b66]">\n                    <Globe2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span dir="ltr" className="min-w-0 break-all [overflow-wrap:anywhere] text-start">{hostOf(t)}</span>\n                  </div>'''
    text=exact(text,old,new,rel,'show full tenant domain',allow_done='[overflow-wrap:anywhere] text-start">{hostOf(t)}')
    text=text.replace('className="text-[10px] text-[#656b66]">\n            {baseDomain && form.subdomain ?', 'className="min-w-0 text-[10px] text-[#656b66] break-all [overflow-wrap:anywhere]">\n            {baseDomain && form.subdomain ?',1)
    return text


def patch_role_portals(text: str) -> str:
    rel='src/components/admin/RolePortals.tsx'
    text=text.replace(', Microscope, Plane', ', Plane',1)
    text=text.replace(' font-mono truncate" dir="ltr" data-no-localize="true">{[o.subdomain,...(o.customDomains||[])].filter(Boolean).join(\' · \')}</div>', ' font-mono break-all [overflow-wrap:anywhere]" dir="ltr" data-no-localize="true">{[o.subdomain,...(o.customDomains||[])].filter(Boolean).join(\' · \')}</div>',1)
    text=text.replace(" createCompetition(name,name,'international-hifz');", " createCompetition(name,name);",1)
    text=text.replace("export const ScientificStudio: React.FC = () => <ScientificGovernance/>;\n\n", '',1)
    text=text.replace("<Guard text={ar?'السلطة العلمية مستقلة':'Scientific authority stays independent'}/>", "<Guard text={ar?'اعتماد المصدر موثق':'Source approval is auditable'}/>",1)
    text=text.replace("value=\"1\" label={ar?'مسابقة حية':'Live competition'}", "value={store.competitions.filter(c=>c.status==='live').length} label={ar?'مسابقات حية':'Live competitions'}",1)
    text=text.replace("value=\"12\" label={ar?'مستخدمًا مفوضًا':'Authorized users'}", "value={store.identityAccounts.filter(a=>a.organizationId===organization.id&&a.status==='ACTIVE').length} label={ar?'مستخدمون مفوضون':'Authorized users'}",1)
    text=text.replace("value=\"2\" label={ar?'لغتان نشطتان':'Languages'}", "value=\"2\" label={ar?'لغات الواجهة':'Interface languages'}",1)
    return text


def patch_app(text: str) -> str:
    rel='src/App.tsx'
    text=text.replace("const ScientificStudio = pick(VIEWS.rolePortals, 'ScientificStudio');\n",'',1)
    old="const {signedIn,authReady,accessError,activationToken,setActivationToken,activationMessage,activateAccount,takeoverSession}=useMizanAuth(requireAuth);"
    new="const {signedIn,authReady,accessError,activationToken,setActivationToken,activationFromQr,activationMessage,activateAccount,takeoverSession}=useMizanAuth(requireAuth);"
    text=exact(text,old,new,rel,'QR activation state',allow_done='activationFromQr,activationMessage')

    start=' if(requireAuth&&accessError) return '
    end=' if(requireAuth&&!signedIn) return <AuthPortal/>;'
    i=text.find(start)
    if i>=0:
        j=text.find(end,i)
        if j<0: raise RuntimeError(f'{rel}: access-screen end anchor not found.')
        replacement=''' if(requireAuth&&accessError) return <div className="min-h-screen grid place-items-center bg-[#f7f5ef] p-5"><div className="mizan-surface p-7 max-w-md text-center"><div className="flex justify-center mb-4"><MizanLogo language="ar" compact/></div><div className="mizan-kicker">حوكمة الوصول</div><h1 className="text-xl font-black mt-2">{accessError==='MFA_REQUIRED'?'يلزم تحقق إضافي لهذا الحساب':accessError==='PRIVILEGED_SESSION_CONFLICT'?'الحساب مفتوح على جهاز حساس آخر':'الحساب غير مفوض'}</h1><p className="text-xs text-[#636864] mt-3 leading-6">{accessError==='MFA_REQUIRED'?'هذه الحماية مطلوبة لحساب مالك المنصة، أو لأن الجهة فعّلت التحقق بخطوتين لفريقها. أكمل العامل الثاني ثم أعد تسجيل الدخول.':accessError==='PRIVILEGED_SESSION_CONFLICT'?'منع ميزان جلسة متزامنة لهذا الدور. يمكن لصاحب الصلاحية إغلاق الجلسة القديمة ثم المتابعة بأمان.':'الهوية صحيحة، لكن الحساب يحتاج دعوة وصلاحية محددة داخل الجهة قبل الدخول.'}</p>{accessError==='ACCOUNT_NOT_PROVISIONED'&&<div className="mt-5 text-start">{activationFromQr?<div className="rounded-2xl bg-[#E7EEE9] text-[#214C40] p-4 text-xs font-bold leading-6 text-center">{activationMessage==='ACTIVATING'?'تمت قراءة QR — جارٍ ربط الحساب بالدعوة…':'تمت قراءة QR التفعيل. سيُربط الحساب تلقائيًا بالبريد المدعو.'}</div>:<><label className="text-[10px] font-black text-[#616763]">رمز التفعيل الاحتياطي</label><input value={activationToken} onChange={e=>setActivationToken(e.target.value)} className="mizan-input mt-2" placeholder="ألصق الرمز فقط إذا تعذر مسح QR"/><button onClick={()=>void activateAccount()} className="mt-3 w-full rounded-xl bg-[#214C40] text-white py-2.5 text-xs font-black">تفعيل الحساب</button></>}{activationMessage&&activationMessage!=='ACTIVATING'&&<div className="mt-2 text-[10px] text-center text-[#656b66]">{activationMessage==='ACTIVATED'?'تم تفعيل الحساب':activationMessage==='ACTIVATION_FAILED'?'تعذر تفعيل الحساب':activationMessage}</div>}</div>}<div className="text-[10px] text-[#696f6b] mt-3">{accessError==='MFA_REQUIRED'?'تحقق إضافي مطلوب':accessError==='PRIVILEGED_SESSION_CONFLICT'?'تعارض جلسة حساسة':accessError==='ACCOUNT_NOT_PROVISIONED'?'الحساب بانتظار التفعيل':'تعذر التحقق من صلاحية الحساب'}</div>{accessError==='PRIVILEGED_SESSION_CONFLICT'&&<button onClick={()=>{void takeoverSession()}} className="mt-6 w-full rounded-2xl bg-[#214C40] text-white text-sm font-black py-3">متابعة هنا وإغلاق الجلسة الأخرى</button>}<button onClick={()=>{void signOut(auth).catch(()=>{}).finally(()=>window.location.reload())}} className="mt-5 text-xs font-bold text-[#214C40]">تسجيل الخروج</button></div></div>;\n'''
        text=text[:i]+replacement+text[j:]
    elif 'activationFromQr?<div' not in text:
        raise RuntimeError(f'{rel}: access-screen baseline anchor not found.')
    text=text.replace("   case 'scientific_admin': return <ScientificStudio/>;\n",'',1)
    return text


def patch_server(text: str) -> str:
    rel='server.ts'
    old_start='  const identityFromBase=(base:{uid:string;email?:string;raw:Record<string,unknown>}):ServerIdentity|null=>'
    req_marker='  const requireFirebaseBase:RequestHandler='
    i=text.find(old_start)
    if i>=0:
        j=text.find(req_marker,i)
        if j<0: raise RuntimeError(f'{rel}: Firebase base auth marker not found.')
        new_block="""  const identityFromBase=(base:{uid:string;email?:string;raw:Record<string,unknown>}):ServerIdentity|null=>{const managed=identityGovernance?.identityForUid(base.uid);if(managed){if(managed.grant.role==='scientific_admin')return null;return {uid:base.uid,email:base.email,role:managed.grant.role,organizationId:managed.grant.organizationId,competitionId:managed.grant.competitionId}}const role=String(base.raw.role||'') as GovernanceRole;const organizationId=String(base.raw.org_id||'');if(!role||!organizationId||role==='scientific_admin')return null;return {uid:base.uid,email:base.email,role,organizationId,competitionId:base.raw.competition_id?String(base.raw.competition_id):undefined}};\n  // Owner MFA remains on by default. Tenant staff MFA is an explicit organization policy.\n  const optionalStaffMfaRoles=new Set<string>(['org_admin','comp_admin','head_judge','judge','auditor']);\n  const ownerMfaRequired=process.env.MIZAN_REQUIRE_MFA_FOR_SUPER_ADMIN!=='false';\n  const staffMfaRequired=process.env.MIZAN_REQUIRE_MFA_FOR_SENSITIVE==='true';\n  const mfaSatisfied=(base:{raw:Record<string,unknown>},role:string)=>{const required=(role==='super_admin'&&ownerMfaRequired)||(staffMfaRequired&&optionalStaffMfaRoles.has(role));return !required||firebaseSecondFactorPresent(base.raw)};\n"""
        text=text[:i]+new_block+text[j:]
    elif 'const optionalStaffMfaRoles=' not in text:
        raise RuntimeError(f'{rel}: identity/MFA baseline block not found.')

    # Transfer the only scientific-role-exclusive server authority before retiring the role everywhere else.
    text=text.replace("requireGovernanceRoles(['scientific_admin','super_admin'])", "requireGovernanceRoles(['head_judge','org_admin','super_admin'])")
    # Remove the retired role from executable allowlists while preserving the two explicit
    # legacy-rejection comparisons in identityFromBase.
    protected_a="managed.grant.role===__MIZAN_RETIRED_ROLE__"
    protected_b="role===__MIZAN_RETIRED_ROLE__"
    text=text.replace("managed.grant.role==='scientific_admin'",protected_a).replace("role==='scientific_admin'",protected_b)
    text=re.sub(r"'scientific_admin',?",'',text)
    text=text.replace(protected_a,"managed.grant.role==='scientific_admin'").replace(protected_b,"role==='scientific_admin'")

    # Super Admin provisions the selected tenant; tenant admins remain hard-scoped to themselves.
    text=text.replace("identityGovernance.list((req as any).mizanIdentity)", "identityGovernance.list((req as any).mizanIdentity,req.query.organizationId?String(req.query.organizationId):undefined)",1)
    text=text.replace("{email:String(req.body?.email||''),displayName:String(req.body?.displayName||''),requestedRole:String(req.body?.requestedRole||'') as GovernanceRole,competitionId:", "{email:String(req.body?.email||''),displayName:String(req.body?.displayName||''),requestedRole:String(req.body?.requestedRole||'') as GovernanceRole,organizationId:req.body?.organizationId?String(req.body.organizationId):undefined,competitionId:",1)

    suspend="  app.post('/api/identity/accounts/:id/suspend',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.suspend((req as any).mizanIdentity,String(req.params.id),String(req.body?.reason||'')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'SUSPEND_FAILED'})}});\n"
    delete_route="  app.delete('/api/identity/accounts/:id',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.remove((req as any).mizanIdentity,String(req.params.id),String(req.body?.reason||'User removed by authorized administrator')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'REMOVE_FAILED'})}});\n"
    if delete_route not in text:
        if suspend not in text: raise RuntimeError(f'{rel}: identity suspend route anchor not found for delete route.')
        text=text.replace(suspend,suspend+delete_route,1)
    return text


def patch_store(text: str) -> str:
    rel='src/lib/store.ts'
    # Do not silently assign a built-in template to a newly created tenant competition.
    text=text.replace("const createCompetition = (nameArabic: string, nameEnglish: string, templateId = 'international-hifz') => {", "const createCompetition = (nameArabic: string, nameEnglish: string) => {",1)
    text=text.replace("edition:'New Edition'", "edition:''",1)
    text=text.replace("categories: globalState.competition.categories.map(c => ({...c,id:newId('cat'),competitionId:''})),", "categories: [],",1)
    text=text.replace("readinessChecklist:{datesConfigured:false,categoriesConfigured:true,ruleSetFrozen:false,judgesAssigned:false,quranSourceLocked:false,devicesRegistered:false,certificatesReady:false}", "readinessChecklist:{datesConfigured:false,categoriesConfigured:false,ruleSetFrozen:false,judgesAssigned:false,quranSourceLocked:false,devicesRegistered:false,certificatesReady:false}",1)
    old="""    base.categories = base.categories.map(c => ({...c,competitionId:base.id}));
    const configured = applyCompetitionTemplate(base, templateId);
    globalState.competitions = [configured, ...globalState.competitions];
    globalState.competition = configured;
    notify(); return configured;"""
    new="""    // New competitions start as the buyer's empty configuration, not one of MIZAN's demo templates.
    base.displayName=undefined;base.displayNameArabic=undefined;base.logoUrl=undefined;
    base.country='';base.timezone='';base.venueName='';base.venuesCount=0;base.totalDays=0;
    base.ruleSet={...base.ruleSet,id:newId('ruleset'),name:'',criteria:[],frozenAt:undefined};base.ruleSets=[base.ruleSet];
    delete (base as any).policy;
    globalState.competitions = [base, ...globalState.competitions];
    globalState.competition = base;
    notify(); return base;"""
    text=exact(text,old,new,rel,'remove implicit competition template',allow_done="New competitions start as the buyer's empty configuration")
    return text


def patch_experience_hub(text: str) -> str:
    rel='src/components/public/ExperienceHub.tsx'
    old="  {role:'scientific_admin',ar:'الإدارة العلمية',en:'Scientific Governance',noteAr:'المصادر والقواعد واعتماد الذكاء',noteEn:'Sources, rules and AI certification',icon:Microscope,group:'governance'},\n"
    text=text.replace(old,'',1)
    text=text.replace("ar?'السياسات، العلم، التدقيق والمنصة':'Policy, science, audit and platform'", "ar?'السياسات، التدقيق والمنصة':'Policy, audit and platform'",1)
    return text

def patch_ui_language(text: str) -> str:
    return text.replace("scientific_admin:'الإدارة العلمية'", "scientific_admin:'دور قديم ملغى'",1)


PATCHERS={
    'src/components/admin/IdentityGovernance.tsx':patch_identity_governance_ui,
    'src/components/admin/CompetitionOverview.tsx':patch_competition_overview,
    'src/components/admin/TenantBrandStudio.tsx':patch_tenant_brand,
    'src/components/admin/TenantConsole.tsx':patch_tenant_console,
    'src/components/admin/RolePortals.tsx':patch_role_portals,
    'src/App.tsx':patch_app,
    'server.ts':patch_server,
    'src/lib/store.ts':patch_store,
    'src/components/public/ExperienceHub.tsx':patch_experience_hub,
    'src/lib/ui-language.ts':patch_ui_language,
}

try:
    planned: dict[str,str] = {}
    for rel,fn in PATCHERS.items():
        old=load(rel)
        new=fn(old)
        planned[rel]=new
    # Postconditions before writing anything.
    checks={
      'src/components/admin/CompetitionOverview.tsx': ['w-14 text-center','workflowLabel(w.id,ar)','COMPETITION_TEMPLATES.map'],
      'src/components/admin/TenantBrandStudio.tsx': ['PRESET_LOGOS.map'],
      'src/components/admin/TenantConsole.tsx': ['[overflow-wrap:anywhere] text-start">{hostOf(t)}'],
      'src/components/admin/RolePortals.tsx': ['font-mono break-all [overflow-wrap:anywhere]','ScientificStudio'],
      'src/App.tsx': ['activationFromQr?<div',"case 'scientific_admin'"],
      'server.ts': ['const optionalStaffMfaRoles=',"MIZAN_REQUIRE_MFA_FOR_SENSITIVE==='true'","app.delete('/api/identity/accounts/:id'"],
      'src/lib/store.ts': ["const createCompetition = (nameArabic: string, nameEnglish: string) =>",'applyCompetitionTemplate(base, templateId)'],
    }
    # First entries in each list are positive except explicit banned tokens handled below.
    positives=[
      ('src/components/admin/IdentityGovernance.tsx','w-11 h-11'),
      ('src/components/admin/CompetitionOverview.tsx','w-14 text-center'),
      ('src/components/admin/TenantConsole.tsx','[overflow-wrap:anywhere] text-start">{hostOf(t)}'),
      ('src/components/admin/RolePortals.tsx','font-mono break-all [overflow-wrap:anywhere]'),
      ('src/App.tsx','activationFromQr?<div'),
      ('server.ts','const optionalStaffMfaRoles='),
      ('server.ts',"MIZAN_REQUIRE_MFA_FOR_SENSITIVE==='true'"),
      ('server.ts',"app.delete('/api/identity/accounts/:id'"),
      ('server.ts','req.query.organizationId?String(req.query.organizationId):undefined'),
      ('src/lib/store.ts',"const createCompetition = (nameArabic: string, nameEnglish: string) =>"),
    ]
    for rel,needle in positives:
        if needle not in planned[rel]: raise RuntimeError(f'{rel}: postcondition missing: {needle}')
    banned=[
      ('src/components/admin/IdentityGovernance.tsx','w-10 h-10'),
      ('src/components/admin/CompetitionOverview.tsx','COMPETITION_TEMPLATES.map'),
      ('src/components/admin/TenantBrandStudio.tsx','PRESET_LOGOS.map'),
      ('src/components/admin/RolePortals.tsx','ScientificStudio'),
      ('src/App.tsx',"case 'scientific_admin'"),
      ('src/components/public/ExperienceHub.tsx',"role:'scientific_admin'"),
      ('src/lib/store.ts','applyCompetitionTemplate(base, templateId)'),
    ]
    for rel,needle in banned:
        if needle in planned[rel]: raise RuntimeError(f'{rel}: retired/default behavior still present: {needle}')

    for rel,new in planned.items():
        p=ROOT/rel
        old=p.read_text(encoding='utf-8')
        if new!=old:
            p.write_text(new,encoding='utf-8')
            CHANGED.append(rel)
    print('MIZAN notes patch applied successfully.')
    if CHANGED:
        print('Changed large files:')
        for rel in CHANGED: print(f'  - {rel}')
    else:
        print('Large-file patch was already applied; nothing rewritten.')
    print('Next: npm run check')
except Exception as exc:
    print(f'ERROR: {exc}',file=sys.stderr)
    sys.exit(1)
