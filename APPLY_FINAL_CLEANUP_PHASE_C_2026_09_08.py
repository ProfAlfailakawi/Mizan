from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def must_replace(path: str, text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{path}: missing expected source structure for {label}')
    return text.replace(old, new)


# 1) Active product role and appeal authority.
p = 'src/types/index.ts'; s = read(p)
s = must_replace(p, s, "  | 'scientific_admin'\n", '', 'Role union')
s = must_replace(p, s, "reviewerRole: 'head_judge' | 'scientific_admin' | 'committee';", "reviewerRole: 'head_judge' | 'committee';", 'appeal reviewer')
write(p, s)

p = 'src/lib/permissions.ts'; s = read(p)
s = s.replace('/** scientific_admin is a retired legacy role and intentionally receives no active permissions. */\n', '')
write(p, s)

p = 'src/lib/useMizanAuth.ts'; s = read(p)
s = s.replace('/** Roles MIZAN will admit. `scientific_admin` is intentionally retired. */', '/** Roles MIZAN will admit. Unknown or retired claims fail closed. */')
s = s.replace('// Includes retired scientific_admin claims: they must be reassigned, never silently remapped.', '// Unknown or retired claims must be reassigned; they are never silently remapped.')
write(p, s)

p = 'src/lib/ui-language.ts'; s = read(p)
s = s.replace(" scientific_admin:'دور قديم ملغى',", '')
write(p, s)

p = 'src/components/admin/CompetitionOverview.tsx'; s = read(p)
s = must_replace(p, s, "value={policy.appeals.reviewerRole==='scientific_admin'?'head_judge':policy.appeals.reviewerRole}", "value={policy.appeals.reviewerRole}", 'appeal legacy branch')
s = s.replace("{ar?'العودة إلى إعدادات الجهة':'Back to organization settings'}", "{ar?'العودة إلى مسابقات الجهة':'Back to organization competitions'}")
write(p, s)

p = 'src/components/design-system/RoleSwitcher.tsx'; s = read(p)
s = s.replace('/** User-facing roles only. scientific_admin is retired and therefore intentionally absent. */\n', '')
s = s.replace('max-w-32 truncate', 'whitespace-nowrap')
s = s.replace('hidden sm:block text-xs font-bold text-[#303733] whitespace-nowrap', 'hidden lg:block text-xs font-bold text-[#303733] whitespace-nowrap')
s = s.replace('hidden sm:block text-start leading-tight', 'hidden lg:block text-start leading-tight')
write(p, s)


# 2) Server identity governance. Active role type is clean; the legacy literal is isolated
# to persistence migration where old access is revoked in place and never remapped.
p = 'server/identity-governance.ts'; s = read(p)
old_header = """/**
 * `scientific_admin` stays parseable only so an old on-disk record can be read safely.
 * It is retired: no new grant may be issued and a retired grant is never admitted as an identity.
 */
export type GovernanceRole=
  | 'super_admin'|'org_admin'|'comp_admin'|'scientific_admin'|'head_judge'|'judge'
  | 'ops_manager'|'exception_host'|'delegation_manager'|'participant'
  | 'broadcast_operator'|'auditor'|'guardian'|'support_agent';"""
new_header = """/** Active identity roles. Legacy persisted authority is handled only by the migration guard below. */
export type GovernanceRole=
  | 'super_admin'|'org_admin'|'comp_admin'|'head_judge'|'judge'
  | 'ops_manager'|'exception_host'|'delegation_manager'|'participant'
  | 'broadcast_operator'|'auditor'|'guardian'|'support_agent';"""
s = must_replace(p, s, old_header, new_header, 'active GovernanceRole')
s = must_replace(p, s, "const RETIRED_ROLES=new Set<GovernanceRole>(['scientific_admin']);", "const RETIRED_IDENTITY_ROLE='scientific_admin' as const;\nconst isRetiredIdentityRole=(role:unknown)=>String(role||'')===RETIRED_IDENTITY_ROLE;", 'retired migration constant')
old_read = "  private read():State{try{return JSON.parse(fs.readFileSync(this.file,'utf8')) as State}catch{throw new Error('IDENTITY_REPOSITORY_CORRUPT')}}"
new_read = """  private read():State{try{
    const state=JSON.parse(fs.readFileSync(this.file,'utf8')) as State;let changed=false;const revokedAt=new Date().toISOString();
    // Compatibility only: preserve old rows and audit history while removing all live authority.
    for(const invitation of state.invitations)if(isRetiredIdentityRole((invitation as unknown as {requestedRole?:unknown}).requestedRole)){if(invitation.status!=='REVOKED'){invitation.status='REVOKED';changed=true}if(invitation.activationTokenHash){delete invitation.activationTokenHash;changed=true}}
    for(const grant of state.grants)if(isRetiredIdentityRole((grant as unknown as {role?:unknown}).role)&&grant.status!=='REVOKED'){grant.status='REVOKED';changed=true}
    for(const session of state.sessions)if(isRetiredIdentityRole((session as unknown as {role?:unknown}).role)){if(session.status!=='REVOKED'){session.status='REVOKED';changed=true}if(!session.revokedAt){session.revokedAt=revokedAt;changed=true}if(!session.revokedBy){session.revokedBy='MIZAN_IDENTITY_MIGRATION';changed=true}if(!session.revocationReason){session.revocationReason='Retired identity authority';changed=true}}
    if(changed)this.write(state);return state;
  }catch{throw new Error('IDENTITY_REPOSITORY_CORRUPT')}}"""
s = must_replace(p, s, old_read, new_read, 'legacy read migration')
s = s.replace('!RETIRED_ROLES.has(target)&&', '!isRetiredIdentityRole(target)&&')
s = s.replace('!RETIRED_ROLES.has(g.role)', '!isRetiredIdentityRole(g.role)')
s = s.replace('!RETIRED_ROLES.has(inv.requestedRole)', '!isRetiredIdentityRole(inv.requestedRole)')
s = s.replace('RETIRED_ROLES.has(input.requestedRole)', 'isRetiredIdentityRole(input.requestedRole)')
s = s.replace('RETIRED_ROLES.has(inv.requestedRole)', 'isRetiredIdentityRole(inv.requestedRole)')
s = s.replace('RETIRED_ROLES.has(identity.role)', 'isRetiredIdentityRole(identity.role)')
s = s.replace("'support_agent','guardian','participant','scientific_admin'", "'support_agent','guardian','participant'")
if 'RETIRED_ROLES' in s: raise SystemExit(f'{p}: obsolete retired-role set remains')
if s.count("'scientific_admin'") != 1: raise SystemExit(f'{p}: legacy literal must exist exactly once')
write(p, s)


# 3) Server claims use an active-role allow-list and fail closed for anything else.
p = 'server.ts'; s = read(p)
old = "  const platformOwnerOrganizationId='__platform__';\n  const identityFromBase=(base:{uid:string;email?:string;raw:Record<string,unknown>}):ServerIdentity|null=>{const managed=identityGovernance?.identityForUid(base.uid,base.raw.competition_id?String(base.raw.competition_id):undefined);if(managed){if(managed.grant.role==='scientific_admin')return null;return {uid:base.uid,email:base.email,role:managed.grant.role,organizationId:managed.grant.organizationId|| (managed.grant.role==='super_admin'?platformOwnerOrganizationId:''),competitionId:managed.grant.competitionId}}const role=String(base.raw.role||'') as GovernanceRole;const claimedOrganizationId=String(base.raw.org_id||'');const organizationId=claimedOrganizationId||(role==='super_admin'?platformOwnerOrganizationId:'');if(!role||!organizationId||role==='scientific_admin')return null;return {uid:base.uid,email:base.email,role,organizationId,competitionId:base.raw.competition_id?String(base.raw.competition_id):undefined}};"
new = "  const platformOwnerOrganizationId='__platform__';\n  const governanceRoles=new Set<string>(['super_admin','org_admin','comp_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','participant','broadcast_operator','auditor','guardian','support_agent']);\n  const isGovernanceRole=(role:string):role is GovernanceRole=>governanceRoles.has(role);\n  const identityFromBase=(base:{uid:string;email?:string;raw:Record<string,unknown>}):ServerIdentity|null=>{const managed=identityGovernance?.identityForUid(base.uid,base.raw.competition_id?String(base.raw.competition_id):undefined);if(managed)return {uid:base.uid,email:base.email,role:managed.grant.role,organizationId:managed.grant.organizationId||(managed.grant.role==='super_admin'?platformOwnerOrganizationId:''),competitionId:managed.grant.competitionId};const rawRole=String(base.raw.role||'');if(!isGovernanceRole(rawRole))return null;const role=rawRole;const claimedOrganizationId=String(base.raw.org_id||'');const organizationId=claimedOrganizationId||(role==='super_admin'?platformOwnerOrganizationId:'');if(!organizationId)return null;return {uid:base.uid,email:base.email,role,organizationId,competitionId:base.raw.competition_id?String(base.raw.competition_id):undefined}};"
s = must_replace(p, s, old, new, 'server claim parser')
write(p, s)


# 4) Browser/local runtime. Historical old rows survive but become revoked. Scientific
# functionality remains, with platform science under Super Admin and competition policy under actual roles.
p = 'src/lib/store.ts'; s = read(p)
marker = "/*\n * ترقية حالة محفوظة إلى الشكل الحالي:"
if marker not in s: raise SystemExit(f'{p}: hydrate marker missing')
s = s.replace(marker, "const RETIRED_IDENTITY_ROLE='scientific_admin' as const;\nconst isRetiredIdentityRole=(role:unknown)=>String(role||'')===RETIRED_IDENTITY_ROLE;\n\n" + marker, 1)
s = s.replace("['super_admin','org_admin','comp_admin','scientific_admin','head_judge','judge','auditor']", "['super_admin','org_admin','comp_admin','head_judge','judge','auditor']")
s = s.replace("globalState.currentUser.role==='scientific_admin'||globalState.currentUser.role==='super_admin'", "globalState.currentUser.role==='super_admin'")
s = s.replace("['scientific_admin','org_admin'].includes(globalState.currentUser.role)", "globalState.currentUser.role==='org_admin'")
s = s.replace("['comp_admin','org_admin','scientific_admin'].includes(globalState.currentUser.role)", "['comp_admin','org_admin'].includes(globalState.currentUser.role)")
s = s.replace("const allowed=q.action==='ceremony_reveal'?['broadcast_operator','comp_admin','org_admin','scientific_admin']:['head_judge','comp_admin','org_admin'];", "const allowed=['head_judge','comp_admin','org_admin'];")
s = s.replace("return ensureQuorumAction('ceremony_reveal',globalState.competition.id,[['scientific_admin'],['comp_admin'],['org_admin']],2,['scientific_admin','comp_admin','org_admin']);", "return ensureQuorumAction('ceremony_reveal',globalState.competition.id,[['head_judge'],['comp_admin'],['org_admin']],2,['head_judge','comp_admin','org_admin']);")
hydrate_tail = "  return parsed;\n}\n\n/*\n * بوابة كشف مزروعة للجلسة التجريبية النشطة."
migration = """  // Preserve history, revoke authority: no legacy role is remapped to an active role.
  parsed.roleGrants=(parsed.roleGrants||[]).map(grant=>isRetiredIdentityRole((grant as unknown as {role?:unknown}).role)?{...grant,status:'REVOKED' as const,reason:[grant.reason,'Retired identity authority'].filter(Boolean).join(' · ')}:grant);
  parsed.identityInvitations=(parsed.identityInvitations||[]).map(invitation=>isRetiredIdentityRole((invitation as unknown as {requestedRole?:unknown}).requestedRole)?{...invitation,status:'REVOKED' as const,activationTokenHash:undefined}:invitation);
  parsed.authSessions=(parsed.authSessions||[]).map(session=>isRetiredIdentityRole((session as unknown as {role?:unknown}).role)?{...session,status:'REVOKED' as const}:session);
  return parsed;
}

/*
 * بوابة كشف مزروعة للجلسة التجريبية النشطة."""
s = must_replace(p, s, hydrate_tail, migration, 'browser snapshot migration')
if s.count("'scientific_admin'") != 1: raise SystemExit(f'{p}: legacy literal must exist exactly once')
write(p, s)


# 5) Identity management surface has no legacy label/choice and hides revoked history from live access UI.
p = 'src/components/admin/IdentityGovernance.tsx'; s = read(p)
s = s.replace("g=>g.organizationId===scopeOrgId&&g.role!=='scientific_admin'&&(!competitionId||g.competitionId===competitionId)", "g=>g.organizationId===scopeOrgId&&['ACTIVE','SUSPENDED'].includes(g.status)&&(!competitionId||g.competitionId===competitionId)")
s = s.replace("i=>i.organizationId===scopeOrgId&&i.requestedRole!=='scientific_admin'&&(!competitionId||i.competitionId===competitionId)", "i=>i.organizationId===scopeOrgId&&i.status!=='REVOKED'&&(!competitionId||i.competitionId===competitionId)")
s = s.replace("&&g.role!=='scientific_admin'", "&&['ACTIVE','SUSPENDED'].includes(g.status)")
s = s.replace("&&i.requestedRole!=='scientific_admin'", "&&i.status!=='REVOKED'")
write(p, s)


# 6) Seed data: every actor resolves to a real SEED_USERS identity.
p = 'src/lib/seed-data.ts'; s = read(p)
users_start = s.find('export const SEED_USERS: User[] = ['); users_close = s.find('\n];', users_start)
if users_start < 0 or users_close < 0: raise SystemExit(f'{p}: SEED_USERS boundary missing')
if 'usr-org-admin-1' not in s[users_start:users_close]:
    org_user = ",\n  {\n    id: 'usr-org-admin-1',\n    name: 'MIZAN Demo Organization Admin',\n    nameArabic: 'أمين عام الجائزة',\n    email: 'organization.admin@award.gov',\n    role: 'org_admin',\n    organizationId: 'org-gqa-global'\n  }"
    s = s[:users_close] + org_user + s[users_close:]
s = s.replace("actorId: 'sys-fairdraw',\n    actorName: 'FairDraw Cryptographic Engine',\n    actorRole: 'scientific_admin',", "actorId: 'usr-head-judge-1',\n    actorName: 'رئيس التحكيم التجريبي',\n    actorRole: 'head_judge',")
s = s.replace("requiredRoleGroups: [['scientific_admin'], ['comp_admin'], ['org_admin']]", "requiredRoleGroups: [['head_judge'], ['comp_admin'], ['org_admin']]")
s = s.replace("authorizedRoles: ['scientific_admin', 'comp_admin', 'org_admin']", "authorizedRoles: ['head_judge', 'comp_admin', 'org_admin']")
s = s.replace("{ actorId: 'usr-scientific-1', actorName: 'أ.د. عبدالله العلمي', actorRole: 'scientific_admin', approvedAt: '2027-02-14T18:00:00Z' }", "{ actorId: 'usr-head-judge-1', actorName: 'رئيس التحكيم التجريبي', actorRole: 'head_judge', approvedAt: '2027-02-14T18:00:00Z' }")
if 'scientific_admin' in s or 'usr-scientific-1' in s: raise SystemExit(f'{p}: retired seed authority remains')
write(p, s)


# 7) Organization Admin information architecture: competitions first; organization/access second.
p = 'src/components/admin/RolePortals.tsx'; s = read(p)
if "import { IdentityGovernance } from './IdentityGovernance';" not in s:
    s = s.replace("import { TenantBrandStudio } from './TenantBrandStudio';", "import { TenantBrandStudio } from './TenantBrandStudio';\nimport { IdentityGovernance } from './IdentityGovernance';")
start = s.find('export const OrganizationHome: React.FC = () => {'); end = s.find('\nexport const DelegationPortal: React.FC = () => {', start)
if start < 0 or end < 0: raise SystemExit(f'{p}: OrganizationHome boundary missing')
home = r"""export const OrganizationHome: React.FC = () => {
 const store=useAppStore(); const {language,competition,competitions,organization,selectCompetition,createCompetition}=store; const ar=isAr(language);
 const [page,setPage]=useState<'competitions'|'organization'>('competitions'); const [creating,setCreating]=useState(false); const [name,setName]=useState('');
 const create=()=>{if(!name.trim())return;createCompetition(name,name);setCreating(false);setName('');window.location.hash='#manage-competition'};
 return <PortalFrame kicker={ar?'الجهة':'ORGANIZATION'} title={page==='competitions'?(ar?'مسابقات الجهة':'Organization competitions'):(ar?'إدارة الجهة':'Organization administration')} subtitle={page==='competitions'?(ar?'ابدأ من مسابقاتك. كل مسابقة مستقلة بشروطها وتحكيمها وسياساتها ومسارها.':'Start with your competitions. Each one owns its rules, judging policy, workflow and public experience.'):(ar?'هوية الجهة وصلاحيات فريق المسابقة في صفحة إدارية مستقلة عن عملك اليومي.':'Organization identity and competition-team access live on a separate administrative page.')}>
  <div className="inline-flex rounded-2xl border border-[#dedcd5] bg-white p-1 gap-1"><button type="button" onClick={()=>setPage('competitions')} className={`min-h-11 px-4 rounded-xl text-xs font-black transition ${page==='competitions'?'bg-[#214C40] text-white':'text-[#5f6862] hover:bg-[#f2f0ea]'}`}>{ar?'المسابقات':'Competitions'}</button><button type="button" onClick={()=>setPage('organization')} className={`min-h-11 px-4 rounded-xl text-xs font-black transition ${page==='organization'?'bg-[#214C40] text-white':'text-[#5f6862] hover:bg-[#f2f0ea]'}`}>{ar?'إدارة الجهة والصلاحيات':'Organization & access'}</button></div>
  {page==='competitions'?<>
   {(store.continuityIncidents.some(x=>x.status!=='RESOLVED')||store.sessionRecoveries.some(x=>x.status==='PROPOSED'&&x.decision==='FULL_RETEST_LAST_RESORT'))&&<ContinuityRecovery/>}
   <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"><div className="grid grid-cols-3 gap-3 flex-1 max-w-xl"><Metric icon={Building2} value={competitions.length} label={ar?'مسابقات':'Competitions'}/><Metric icon={UsersRound} value={store.identityAccounts.filter(a=>a.organizationId===organization.id&&a.status==='ACTIVE').length} label={ar?'مستخدمون مفوضون':'Authorized users'}/><Metric icon={Globe2} value="2" label={ar?'لغات الواجهة':'Interface languages'}/></div><Button onClick={()=>setCreating(v=>!v)} icon={<Plus className="w-4 h-4"/>}>{ar?'مسابقة':'Competition'}</Button></div>
   {creating&&<div className="mizan-surface p-5"><div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end"><label><span className="text-xs font-bold text-[#606662]">{ar?'اسم المسابقة':'Competition name'}</span><input autoFocus value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&create()} className="mt-2 w-full rounded-xl border border-[#ddd] px-3 py-2.5 text-sm"/></label><Button disabled={!name.trim()} onClick={create}>{ar?'إنشاء':'Create'}</Button></div></div>}
   <div className="space-y-2">{competitions.map(c=><button key={c.id} onClick={()=>{selectCompetition(c.id);window.location.hash='#manage-competition'}} className={`w-full mizan-surface p-5 text-start transition hover:border-[#bfc9c3] ${competition.id===c.id?'ring-2 ring-[#214C40]/10':''}`}><div className="flex items-center justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><Badge variant={c.status==='live'?'emerald':'neutral'}>{uiToken(c.status,ar)}</Badge><span className="text-[10px] text-[#666a67]">{c.edition}</span></div><h2 className="text-lg font-black mt-3 break-words">{ar?c.nameArabic:c.name}</h2><p className="text-xs text-[#646965] mt-1">{c.timezone} · {c.categories.length} {ar?'فئات':'categories'}</p></div><Layers3 className="w-5 h-5 text-[#2F6555] shrink-0"/></div></button>)}</div>
   {!competitions.length&&<EmptyState icon={Layers3} title={ar?'لا توجد مسابقات بعد':'No competitions yet'} hint={ar?'أنشئ أول مسابقة لتبدأ إعدادها.':'Create the first competition to begin configuring it.'}/>} 
  </>:<>
   <TenantBrandStudio/>
   <div className="mizan-surface p-4 sm:p-5"><div className="mizan-kicker">{ar?'صلاحيات حسب المسابقة':'COMPETITION-SCOPED ACCESS'}</div><div className="mt-3 flex gap-2 overflow-x-auto">{competitions.map(c=><button key={c.id} type="button" onClick={()=>selectCompetition(c.id)} className={`shrink-0 min-h-11 px-3 rounded-xl border text-xs font-black ${competition.id===c.id?'bg-[#E7EEE9] border-[#cddbd3] text-[#214C40]':'bg-white border-[#dedcd5] text-[#5f6862]'}`}>{ar?c.nameArabic:c.name}</button>)}</div></div>
   <IdentityGovernance competitionId={competition.id}/>
  </>}
 </PortalFrame>
}
"""
s = s[:start] + home + s[end:]; write(p, s)


# 8) Direct support is visible to every role. Shared header on desktop; fixed CTA on
# mobile and on the intentionally headerless broadcast role.
p = 'src/components/layout/Header.tsx'; s = read(p)
s = s.replace("import { Award, Radio, Wifi, WifiOff, Search, LayoutDashboard, CircleHelp, LogOut, Headphones } from 'lucide-react';", "import { Award, Radio, Wifi, WifiOff, Search, LayoutDashboard, CircleHelp, LogOut, Headphones, LifeBuoy } from 'lucide-react';")
if "import { Modal } from '../design-system/Modal';" not in s:
    s = s.replace("import { ClarityGuide } from '../design-system/ClarityGuide';", "import { ClarityGuide } from '../design-system/ClarityGuide';\nimport { Modal } from '../design-system/Modal';")
props = "interface HeaderProps { onOpenKiosk?:()=>void; onOpenCeremony?:()=>void; onOpenExperienceHome?:()=>void; }\n\n"
support = r"""interface HeaderProps { onOpenKiosk?:()=>void; onOpenCeremony?:()=>void; onOpenExperienceHome?:()=>void; }

export const LiveSupportControl:React.FC<{floating?:boolean}>=({floating=false})=>{
 const {language,currentUser,supportSessions,requestSupportSession}=useAppStore();const ar=language==='ar';const [open,setOpen]=useState(false);const [reason,setReason]=useState('');
 const active=supportSessions.find(session=>session.requestedBy===currentUser.id&&!['ended','rejected'].includes(session.status)&&Date.parse(session.expiresAt)>Date.now());
 const submit=()=>{const clean=reason.trim();if(clean.length<3)return;requestSupportSession(clean);setReason('');setOpen(false)};
 const cls=floating?'fixed start-4 bottom-4 z-[120] h-11 px-4 inline-flex items-center gap-2 rounded-xl border border-[#cddbd3] bg-[#F7FAF8] text-[#214C40] shadow-md font-black text-xs':'hidden lg:inline-flex h-11 px-3 items-center gap-1.5 rounded-xl border border-[#cddbd3] bg-[#EBF2EE] hover:bg-[#DCEAE2] text-[#214C40] font-black text-xs shrink-0 transition';
 return <><button type="button" onClick={()=>setOpen(true)} className={cls} aria-label={ar?'الدعم المباشر':'Live support'}><LifeBuoy className="w-4 h-4 shrink-0"/><span>{ar?'الدعم المباشر':'Live support'}</span>{active&&<span className="w-1.5 h-1.5 rounded-full bg-[#2F6555]" aria-hidden="true"/>}</button><Modal isOpen={open} onClose={()=>setOpen(false)} title={ar?'الدعم المباشر':'Live support'} subtitle={ar?'طلب دعم مراقب ومؤقت دون منح باب خلفي للنظام.':'Request a temporary, audited support session without granting a backdoor.'} maxWidth="md">{active?<div className="rounded-2xl border border-[#cddbd3] bg-[#F7FAF8] p-4"><div className="text-sm font-black text-[#214C40]">{ar?'طلب الدعم قائم':'Support request is active'}</div><p className="text-xs text-[#636864] leading-6 mt-2">{ar?'تم إرسال طلبك، وسيبقى مرتبطًا بسبب واضح وينتهي تلقائيًا وفق مدة الجلسة.':'Your request was sent with a recorded reason and will expire automatically with the session window.'}</p></div>:<div><label className="block text-xs font-black text-[#4f5752]">{ar?'ما الذي تحتاج مساعدة فيه؟':'What do you need help with?'}</label><textarea autoFocus value={reason} onChange={e=>setReason(e.target.value)} rows={4} className="mizan-input mt-2 resize-none" placeholder={ar?'اكتب المشكلة باختصار ووضوح':'Describe the issue briefly and clearly'}/><div className="mt-4 flex justify-end"><button type="button" disabled={reason.trim().length<3} onClick={submit} className="min-h-11 px-4 rounded-xl bg-[#214C40] text-white text-xs font-black disabled:opacity-40">{ar?'إرسال طلب الدعم':'Send support request'}</button></div></div>}</Modal></>;
};

"""
s = must_replace(p, s, props, support, 'live support component')
cluster = '    <div className="flex items-center gap-1">\n'
if cluster not in s: raise SystemExit(f'{p}: header action cluster missing')
s = s.replace(cluster, cluster + '      <LiveSupportControl/>\n', 1); write(p, s)

p = 'src/App.tsx'; s = read(p)
s = s.replace("import { Header } from './components/layout/Header';", "import { Header, LiveSupportControl } from './components/layout/Header';")
header = "  {!isBroadcast&&<Header onOpenKiosk={()=>setKiosk(true)} onOpenCeremony={()=>setCeremony(true)} onOpenExperienceHome={demoMode?()=>setExperienceHome(true):undefined}/>}\n"
if header not in s: raise SystemExit(f'{p}: header render missing')
s = s.replace(header, header + "  {!isBroadcast&&<div className=\"lg:hidden\"><LiveSupportControl floating/></div>}\n  {isBroadcast&&<LiveSupportControl floating/>}\n", 1); write(p, s)


# 9) Focused tests. Casting is limited to the explicit legacy/forged payload boundary.
p = 'tests/user-notes-2026-09-08.test.ts'; s = read(p)
s = s.replace("import { IdentityGovernanceRepository } from '../server/identity-governance';", "import { IdentityGovernanceRepository, type GovernanceRole } from '../server/identity-governance';")
old = "assert.throws(()=>repo.createInvitation(orgAdmin('admin'),{email:'legacy@example.org',displayName:'Legacy role',requestedRole:'scientific_admin',competitionId:'comp-1',reason:'Legacy role attempt'}),/ROLE_RETIRED/);"
new = "const retiredRole='scientific_admin' as unknown as GovernanceRole; // intentional pre-upgrade/forged legacy input\n assert.throws(()=>repo.createInvitation(orgAdmin('admin'),{email:'legacy@example.org',displayName:'Legacy role',requestedRole:retiredRole,competitionId:'comp-1',reason:'Legacy role attempt'}),/ROLE_RETIRED/);"
s = must_replace(p, s, old, new, 'legacy invitation rejection test'); write(p, s)

final_test = r"""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IdentityGovernanceRepository, type GovernanceRole } from '../server/identity-governance';
import { SEED_QUORUM_ACTIONS, SEED_USERS } from '../src/lib/seed-data';
const source=(p:string)=>fs.readFileSync(p,'utf8');
const orgAdmin=(uid='org-admin')=>({uid,email:`${uid}@example.org`,role:'org_admin' as const,organizationId:'org-1',competitionId:'comp-1'});
const retiredRole='scientific_admin' as unknown as GovernanceRole; // intentional legacy input boundary
function withRepo(fn:(repo:IdentityGovernanceRepository,dir:string)=>void){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-final-'));try{fn(new IdentityGovernanceRepository(dir),dir)}finally{fs.rmSync(dir,{recursive:true,force:true})}}

test('retired authority is absent from active role and UI surfaces',()=>{for(const p of ['src/types/index.ts','src/lib/permissions.ts','src/lib/useMizanAuth.ts','server.ts','src/components/admin/IdentityGovernance.tsx','src/components/admin/CompetitionOverview.tsx','src/components/design-system/RoleSwitcher.tsx','src/lib/ui-language.ts','src/lib/seed-data.ts'])assert.doesNotMatch(source(p),/scientific_admin/,p);assert.doesNotMatch(source('src/types/index.ts'),/reviewerRole:[^;]*scientific_admin/)});

test('legacy invitation grant and session are revoked in place without remapping',()=>withRepo((repo,dir)=>{const file=path.join(dir,'identity-governance.json');const now=new Date();const later=new Date(now.getTime()+3600_000).toISOString();fs.writeFileSync(file,JSON.stringify({version:1,invitations:[{id:'legacy-inv',organizationId:'org-1',competitionId:'comp-1',email:'legacy@example.org',displayName:'Legacy',requestedRole:'scientific_admin',reason:'pre-upgrade row',status:'READY',createdAt:now.toISOString(),createdBy:'old',expiresAt:later,activationTokenHash:'must-disappear'}],accounts:[{id:'legacy-acct',uid:'legacy-uid',organizationId:'org-1',email:'legacy@example.org',displayName:'Legacy',status:'ACTIVE',createdAt:now.toISOString(),activatedFromInvitationId:'legacy-inv'}],grants:[{id:'legacy-grant',accountId:'legacy-acct',organizationId:'org-1',competitionId:'comp-1',role:'scientific_admin',status:'ACTIVE',createdAt:now.toISOString(),createdBy:'old'}],sessions:[{id:'legacy-session',uid:'legacy-uid',accountId:'legacy-acct',organizationId:'org-1',competitionId:'comp-1',role:'scientific_admin',deviceId:'old-device',authenticationAssurance:'MFA',openedAt:now.toISOString(),lastSeenAt:now.toISOString(),expiresAt:later,status:'ACTIVE'}]},null,2));assert.equal(repo.identityForUid('legacy-uid','comp-1'),null);const migrated=JSON.parse(fs.readFileSync(file,'utf8'));assert.equal(migrated.invitations[0].status,'REVOKED');assert.equal('activationTokenHash' in migrated.invitations[0],false);assert.equal(migrated.grants[0].status,'REVOKED');assert.equal(migrated.grants[0].role,'scientific_admin');assert.equal(migrated.sessions[0].status,'REVOKED');assert.match(migrated.sessions[0].revocationReason,/Retired identity authority/);assert.equal(migrated.sessions[0].role,'scientific_admin')}));

test('retired role cannot be newly invited and activation QR is one-time',()=>withRepo(repo=>{assert.throws(()=>repo.createInvitation(orgAdmin(),{email:'legacy@example.org',displayName:'Legacy',requestedRole:retiredRole,competitionId:'comp-1',reason:'Legacy role attempt'}),/ROLE_RETIRED/);const inv=repo.createInvitation(orgAdmin(),{email:'judge@example.org',displayName:'Judge',requestedRole:'judge',competitionId:'comp-1',reason:'Official judging assignment'});repo.activate({uid:'judge-uid',email:'judge@example.org'},inv.activationToken!);assert.throws(()=>repo.activate({uid:'judge-uid',email:'judge@example.org'},inv.activationToken!),/ACTIVATION_TOKEN_INVALID/)}));

test('ceremony quorum contains only actual seeded competition authorities',()=>{const ids=new Set(SEED_USERS.map(u=>u.id));const q=SEED_QUORUM_ACTIONS.find(x=>x.action==='ceremony_reveal');assert.ok(q);assert.deepEqual(q!.requiredRoleGroups,[['head_judge'],['comp_admin'],['org_admin']]);assert.deepEqual(q!.authorizedRoles,['head_judge','comp_admin','org_admin']);assert.equal(q!.distinctActorsRequired,true);for(const a of q!.approvals)assert.equal(ids.has(a.actorId),true,`dangling actor ${a.actorId}`);assert.doesNotMatch(source('src/lib/seed-data.ts'),/usr-scientific-1/)});

test('role header shows the full desktop name and appeals have no compatibility branch',()=>{const roles=source('src/components/design-system/RoleSwitcher.tsx');const appeals=source('src/components/admin/CompetitionOverview.tsx');assert.doesNotMatch(roles,/max-w-32 truncate/);assert.match(roles,/whitespace-nowrap/);assert.match(appeals,/value=\{policy\.appeals\.reviewerRole\}/);assert.doesNotMatch(appeals,/reviewerRole===/)});

test('scientific governance functionality remains under actual authorities',()=>{const store=source('src/lib/store.ts');for(const name of ['registerQuranSourceManifest','reviewQuranSource','certifyQuranSource','runQuranSourceCrossCheck','registerVariantLocus','registerQuranReferenceAudio','registerAiValidation','registerScientificDataset','registerBenchmarkRun','openScientificAdjudication'])assert.match(store,new RegExp(name),name);assert.match(store,/\['comp_admin','org_admin'\]\.includes\(globalState\.currentUser\.role\)/);assert.match(store,/\[\['head_judge'\],\['comp_admin'\],\['org_admin'\]\]/)});

test('organization admin lands on competitions before organization details and access',()=>{const portals=source('src/components/admin/RolePortals.tsx');const start=portals.indexOf('export const OrganizationHome');const end=portals.indexOf('export const DelegationPortal',start);const home=portals.slice(start,end);assert.match(home,/useState<'competitions'\|'organization'>\('competitions'\)/);assert.match(home,/page==='competitions'/);assert.match(home,/page==='organization'/);assert.ok(home.indexOf("page==='competitions'")<home.indexOf('<TenantBrandStudio'));assert.match(home,/<IdentityGovernance competitionId=\{competition\.id\}\/>/)});

test('live support is prominent for every role including broadcast',()=>{const header=source('src/components/layout/Header.tsx');const app=source('src/App.tsx');assert.match(header,/export const LiveSupportControl/);assert.match(header,/الدعم المباشر/);assert.match(header,/requestSupportSession/);assert.match(header,/<LiveSupportControl\/>/);assert.match(app,/isBroadcast&&<LiveSupportControl floating\/>/)});
"""
write('tests/final-cleanup-phase-c.test.ts', final_test)


# Final source invariants. Only the two explicit legacy migration constants may retain
# the retired literal in runtime source; tests may write it to prove rejection/migration.
active_paths = ['src/types/index.ts','src/lib/permissions.ts','src/lib/useMizanAuth.ts','server.ts','src/components/admin/IdentityGovernance.tsx','src/components/admin/CompetitionOverview.tsx','src/components/design-system/RoleSwitcher.tsx','src/lib/ui-language.ts','src/lib/seed-data.ts']
for item in active_paths:
    if 'scientific_admin' in read(item): raise SystemExit(f'{item}: retired role remains in an active surface')
if read('server/identity-governance.ts').count("'scientific_admin'") != 1: raise SystemExit('server identity legacy literal is not narrowly isolated')
if read('src/lib/store.ts').count("'scientific_admin'") != 1: raise SystemExit('browser snapshot legacy literal is not narrowly isolated')
if 'max-w-32 truncate' in read('src/components/design-system/RoleSwitcher.tsx'): raise SystemExit('RoleSwitcher still truncates the desktop user name')
if 'usr-scientific-1' in read('src/lib/seed-data.ts'): raise SystemExit('dangling retired seed user remains')
print('MIZAN final direct-source cleanup prepared successfully.')
