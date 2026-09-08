from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding='utf-8')


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding='utf-8')


def replace_once(path: str, old: str, new: str, label: str) -> None:
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: {label}: expected 1 anchor, found {count}')
    write(path, text.replace(old, new, 1))


def replace_all(path: str, old: str, new: str, label: str, minimum: int = 1) -> int:
    text = read(path)
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f'{path}: {label}: expected at least {minimum}, found {count}')
    write(path, text.replace(old, new))
    return count


# -----------------------------------------------------------------------------
# 1. The retired role is not an active application role or appeal authority.
# -----------------------------------------------------------------------------
replace_once(
    'src/types/index.ts',
    "  | 'scientific_admin'\n",
    '',
    'remove retired Role union member',
)
replace_once(
    'src/types/index.ts',
    "  reviewerRole: 'head_judge' | 'scientific_admin' | 'committee';",
    "  reviewerRole: 'head_judge' | 'committee';",
    'remove retired appeal reviewer',
)

permissions = read('src/lib/permissions.ts')
permissions = permissions.replace('/** scientific_admin is a retired legacy role and intentionally receives no active permissions. */\n', '')
write('src/lib/permissions.ts', permissions)

# Auth already admits only active roles; remove obsolete explanatory references.
auth = read('src/lib/useMizanAuth.ts')
auth = auth.replace('/** Roles MIZAN will admit. `scientific_admin` is intentionally retired. */', '/** Roles MIZAN will admit. Unknown or retired claims fail closed. */')
auth = auth.replace("          // Includes retired scientific_admin claims: they must be reassigned, never silently remapped.\n", "          // Unknown or retired claims must be reassigned; they are never silently remapped.\n")
write('src/lib/useMizanAuth.ts', auth)

# User-facing surfaces no longer carry compatibility branches for a role that cannot exist.
replace_once(
    'src/components/admin/CompetitionOverview.tsx',
    "value={policy.appeals.reviewerRole==='scientific_admin'?'head_judge':policy.appeals.reviewerRole}",
    "value={policy.appeals.reviewerRole}",
    'remove appeal compatibility branch',
)
identity_ui = read('src/components/admin/IdentityGovernance.tsx')
identity_ui = identity_ui.replace("&&g.role!=='scientific_admin'", '')
identity_ui = identity_ui.replace("&&i.requestedRole!=='scientific_admin'", '')
write('src/components/admin/IdentityGovernance.tsx', identity_ui)

# Header identity should show the whole person name on desktop instead of a forced ellipsis.
roles_ui = read('src/components/design-system/RoleSwitcher.tsx')
roles_ui = roles_ui.replace('/** User-facing roles only. scientific_admin is retired and therefore intentionally absent. */\n', '')
if roles_ui.count('max-w-32 truncate') != 2:
    raise SystemExit(f'RoleSwitcher: expected two aggressive truncation anchors, found {roles_ui.count("max-w-32 truncate")}')
roles_ui = roles_ui.replace('max-w-32 truncate', 'whitespace-nowrap')
write('src/components/design-system/RoleSwitcher.tsx', roles_ui)

# Historical token should not advertise a selectable application role.
ui_lang = read('src/lib/ui-language.ts')
ui_lang = ui_lang.replace(" scientific_admin:'دور قديم ملغى',", '')
write('src/lib/ui-language.ts', ui_lang)


# -----------------------------------------------------------------------------
# 2. Server identity governance: active type is clean; legacy disk records are
#    explicitly revoked on read, never remapped to another authority.
# -----------------------------------------------------------------------------
server_identity = read('server/identity-governance.ts')
old_header = """/**
 * `scientific_admin` stays parseable only so an old on-disk record can be read safely.
 * It is retired: no new grant may be issued and a retired grant is never admitted as an identity.
 */
export type GovernanceRole=
  | 'super_admin'|'org_admin'|'comp_admin'|'scientific_admin'|'head_judge'|'judge'
  | 'ops_manager'|'exception_host'|'delegation_manager'|'participant'
  | 'broadcast_operator'|'auditor'|'guardian'|'support_agent';"""
new_header = """/** Active identity roles. Legacy records are handled only by the migration guard below. */
export type GovernanceRole=
  | 'super_admin'|'org_admin'|'comp_admin'|'head_judge'|'judge'
  | 'ops_manager'|'exception_host'|'delegation_manager'|'participant'
  | 'broadcast_operator'|'auditor'|'guardian'|'support_agent';"""
if server_identity.count(old_header) != 1:
    raise SystemExit('identity-governance: active-role header anchor missing')
server_identity = server_identity.replace(old_header, new_header, 1)
server_identity = server_identity.replace(
    "const RETIRED_ROLES=new Set<GovernanceRole>(['scientific_admin']);",
    "const RETIRED_IDENTITY_ROLE='scientific_admin' as const;\nconst isRetiredIdentityRole=(role:unknown)=>String(role||'')===RETIRED_IDENTITY_ROLE;",
    1,
)
old_read = "  private read():State{try{return JSON.parse(fs.readFileSync(this.file,'utf8')) as State}catch{throw new Error('IDENTITY_REPOSITORY_CORRUPT')}}"
new_read = """  private read():State{try{
    const s=JSON.parse(fs.readFileSync(this.file,'utf8')) as State;let changed=false;
    // Explicit compatibility migration: old authority is revoked in place so history remains,
    // but it can never authenticate, appear in tenant lists, or be silently mapped to a new role.
    for(const x of s.invitations)if(isRetiredIdentityRole((x as unknown as {requestedRole?:unknown}).requestedRole)&&x.status!=='REVOKED'){x.status='REVOKED';delete x.activationTokenHash;changed=true}
    for(const x of s.grants)if(isRetiredIdentityRole((x as unknown as {role?:unknown}).role)&&x.status!=='REVOKED'){x.status='REVOKED';changed=true}
    for(const x of s.sessions)if(isRetiredIdentityRole((x as unknown as {role?:unknown}).role)&&x.status!=='REVOKED'){x.status='REVOKED';x.revokedAt=x.revokedAt||new Date().toISOString();x.revocationReason=x.revocationReason||'Retired identity authority';changed=true}
    if(changed)this.write(s);return s;
  }catch{throw new Error('IDENTITY_REPOSITORY_CORRUPT')}}"""
if server_identity.count(old_read) != 1:
    raise SystemExit('identity-governance: read migration anchor missing')
server_identity = server_identity.replace(old_read, new_read, 1)
server_identity = server_identity.replace('!RETIRED_ROLES.has(target)&&', '!isRetiredIdentityRole(target)&&')
server_identity = server_identity.replace('!RETIRED_ROLES.has(g.role)', '!isRetiredIdentityRole(g.role)')
server_identity = server_identity.replace('!RETIRED_ROLES.has(inv.requestedRole)', '!isRetiredIdentityRole(inv.requestedRole)')
server_identity = server_identity.replace('RETIRED_ROLES.has(input.requestedRole)', 'isRetiredIdentityRole(input.requestedRole)')
server_identity = server_identity.replace('RETIRED_ROLES.has(inv.requestedRole)', 'isRetiredIdentityRole(inv.requestedRole)')
server_identity = server_identity.replace('RETIRED_ROLES.has(identity.role)', 'isRetiredIdentityRole(identity.role)')
server_identity = server_identity.replace("'support_agent','guardian','participant','scientific_admin'", "'support_agent','guardian','participant'")
if 'RETIRED_ROLES' in server_identity:
    raise SystemExit('identity-governance: retired-role set reference remains')
if server_identity.count("'scientific_admin'") != 1:
    raise SystemExit(f'identity-governance: expected one migration literal, found {server_identity.count(chr(39)+"scientific_admin"+chr(39))}')
write('server/identity-governance.ts', server_identity)

# Server claim parsing uses an active-role allow-list instead of naming a retired claim.
replace_once(
    'server.ts',
    """  const platformOwnerOrganizationId='__platform__';
  const identityFromBase=(base:{uid:string;email?:string;raw:Record<string,unknown>}):ServerIdentity|null=>{const managed=identityGovernance?.identityForUid(base.uid,base.raw.competition_id?String(base.raw.competition_id):undefined);if(managed){if(managed.grant.role==='scientific_admin')return null;return {uid:base.uid,email:base.email,role:managed.grant.role,organizationId:managed.grant.organizationId|| (managed.grant.role==='super_admin'?platformOwnerOrganizationId:''),competitionId:managed.grant.competitionId}}const role=String(base.raw.role||'') as GovernanceRole;const claimedOrganizationId=String(base.raw.org_id||'');const organizationId=claimedOrganizationId||(role==='super_admin'?platformOwnerOrganizationId:'');if(!role||!organizationId||role==='scientific_admin')return null;return {uid:base.uid,email:base.email,role,organizationId,competitionId:base.raw.competition_id?String(base.raw.competition_id):undefined}};""",
    """  const platformOwnerOrganizationId='__platform__';
  const governanceRoles=new Set<GovernanceRole>(['super_admin','org_admin','comp_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','participant','broadcast_operator','auditor','guardian','support_agent']);
  const isGovernanceRole=(role:string):role is GovernanceRole=>governanceRoles.has(role as GovernanceRole);
  const identityFromBase=(base:{uid:string;email?:string;raw:Record<string,unknown>}):ServerIdentity|null=>{const managed=identityGovernance?.identityForUid(base.uid,base.raw.competition_id?String(base.raw.competition_id):undefined);if(managed)return {uid:base.uid,email:base.email,role:managed.grant.role,organizationId:managed.grant.organizationId||(managed.grant.role==='super_admin'?platformOwnerOrganizationId:''),competitionId:managed.grant.competitionId};const rawRole=String(base.raw.role||'');if(!isGovernanceRole(rawRole))return null;const role=rawRole;const claimedOrganizationId=String(base.raw.org_id||'');const organizationId=claimedOrganizationId||(role==='super_admin'?platformOwnerOrganizationId:'');if(!organizationId)return null;return {uid:base.uid,email:base.email,role,organizationId,competitionId:base.raw.competition_id?String(base.raw.competition_id):undefined}};""",
    'replace legacy claim branch with active-role allow-list',
)


# -----------------------------------------------------------------------------
# 3. Local runtime: migrate old snapshots, preserve scientific governance under
#    the platform owner, and keep critical quorum independent of Super Admin.
# -----------------------------------------------------------------------------
store = read('src/lib/store.ts')
anchor = "/*\n * ترقية حالة محفوظة إلى الشكل الحالي:"
if store.count(anchor) != 1:
    raise SystemExit('store: hydrate comment anchor missing')
store = store.replace(anchor, "const RETIRED_IDENTITY_ROLE='scientific_admin' as const;\nconst isRetiredIdentityRole=(role:unknown)=>String(role||'')===RETIRED_IDENTITY_ROLE;\n\n" + anchor, 1)
store = store.replace("'super_admin','org_admin','comp_admin','scientific_admin','head_judge','judge','auditor'", "'super_admin','org_admin','comp_admin','head_judge','judge','auditor'")
# All scholarly source/AI certification tools remain available to the platform owner.
store = store.replace("if(!(globalState.currentUser.role==='scientific_admin'||globalState.currentUser.role==='super_admin'))", "if(globalState.currentUser.role!=='super_admin')")
store = store.replace("if(!['scientific_admin','org_admin'].includes(globalState.currentUser.role))", "if(globalState.currentUser.role!=='org_admin')")
store = store.replace("if(!['comp_admin','org_admin','scientific_admin'].includes(globalState.currentUser.role)||!text.trim())", "if(!['comp_admin','org_admin'].includes(globalState.currentUser.role)||!text.trim())")
store = store.replace("const allowed=q.action==='ceremony_reveal'?['broadcast_operator','comp_admin','org_admin','scientific_admin']:['head_judge','comp_admin','org_admin'];", "const allowed=q.action==='ceremony_reveal'?['broadcast_operator','head_judge','comp_admin','org_admin']:['head_judge','comp_admin','org_admin'];")
store = store.replace("return ensureQuorumAction('ceremony_reveal',globalState.competition.id,[['scientific_admin'],['comp_admin'],['org_admin']],2,['scientific_admin','comp_admin','org_admin']);", "return ensureQuorumAction('ceremony_reveal',globalState.competition.id,[['head_judge'],['comp_admin'],['org_admin']],2,['head_judge','comp_admin','org_admin']);")
# Remove legacy authority from persisted browser snapshots without mapping it to someone else.
hydrate_return = "  return parsed;\n}"
if store.count(hydrate_return) < 1:
    raise SystemExit('store: hydrate return anchor missing')
migration = """  parsed.roleGrants=(parsed.roleGrants||[]).filter(g=>!isRetiredIdentityRole((g as unknown as {role?:unknown}).role));
  parsed.identityInvitations=(parsed.identityInvitations||[]).filter(i=>!isRetiredIdentityRole((i as unknown as {requestedRole?:unknown}).requestedRole));
  parsed.authSessions=(parsed.authSessions||[]).filter(s=>!isRetiredIdentityRole((s as unknown as {role?:unknown}).role));
  return parsed;
}"""
store = store.replace(hydrate_return, migration, 1)
if store.count("'scientific_admin'") != 1:
    raise SystemExit(f'store: expected one snapshot-migration literal, found {store.count(chr(39)+"scientific_admin"+chr(39))}')
write('src/lib/store.ts', store)

# Demo data uses only real roles; scientific governance data itself remains intact.
seed = read('src/lib/seed-data.ts')
seed = seed.replace("actorRole: 'scientific_admin'", "actorRole: 'head_judge'")
seed = seed.replace("requiredRoleGroups: [['scientific_admin'], ['comp_admin'], ['org_admin']]", "requiredRoleGroups: [['head_judge'], ['comp_admin'], ['org_admin']]")
seed = seed.replace("authorizedRoles: ['scientific_admin', 'comp_admin', 'org_admin']", "authorizedRoles: ['head_judge', 'comp_admin', 'org_admin']")
seed = seed.replace("{ actorId: 'usr-scientific-1', actorName: 'أ.د. عبدالله العلمي', actorRole: 'scientific_admin', approvedAt: '2027-02-14T18:00:00Z' }", "{ actorId: 'usr-head-judge-1', actorName: 'رئيس التحكيم التجريبي', actorRole: 'head_judge', approvedAt: '2027-02-14T18:00:00Z' }")
if 'scientific_admin' in seed:
    raise SystemExit('seed-data: retired role remains')
write('src/lib/seed-data.ts', seed)

# Runtime rejection test remains valuable even though TypeScript no longer offers that role.
notes = read('tests/user-notes-2026-09-08.test.ts')
notes = notes.replace("requestedRole:'scientific_admin',competitionId:'comp-1'", "requestedRole:'scientific_admin' as any,competitionId:'comp-1'")
write('tests/user-notes-2026-09-08.test.ts', notes)


# -----------------------------------------------------------------------------
# 4. Final executable contracts for the user's remaining notes.
# -----------------------------------------------------------------------------
final_test = r"""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IdentityGovernanceRepository } from '../server/identity-governance';

const source=(p:string)=>fs.readFileSync(p,'utf8');

test('retired authority is absent from every active role surface',()=>{
  for(const p of [
    'src/types/index.ts','src/lib/permissions.ts','src/lib/useMizanAuth.ts','server.ts',
    'src/components/admin/IdentityGovernance.tsx','src/components/admin/CompetitionOverview.tsx',
    'src/components/design-system/RoleSwitcher.tsx','src/lib/ui-language.ts','src/lib/seed-data.ts'
  ]) assert.doesNotMatch(source(p),/scientific_admin/,p);
});

test('legacy identity records are revoked, never remapped',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mizan-retired-role-'));
  try{
    const repo=new IdentityGovernanceRepository(dir);
    const file=path.join(dir,'identity-governance.json');
    const now=new Date();const future=new Date(now.getTime()+86400000).toISOString();
    fs.writeFileSync(file,JSON.stringify({version:1,invitations:[{id:'legacy-inv',organizationId:'org-1',competitionId:'comp-1',email:'legacy@example.org',displayName:'Legacy',requestedRole:'scientific_admin',reason:'Historical record',status:'READY',createdAt:now.toISOString(),createdBy:'old',expiresAt:future,activationTokenHash:'x'}],accounts:[{id:'legacy-account',uid:'legacy-uid',organizationId:'org-1',email:'legacy@example.org',displayName:'Legacy',status:'ACTIVE',createdAt:now.toISOString(),activatedFromInvitationId:'legacy-inv'}],grants:[{id:'legacy-grant',accountId:'legacy-account',organizationId:'org-1',competitionId:'comp-1',role:'scientific_admin',status:'ACTIVE',createdAt:now.toISOString(),createdBy:'old'}],sessions:[{id:'legacy-session',uid:'legacy-uid',accountId:'legacy-account',organizationId:'org-1',competitionId:'comp-1',role:'scientific_admin',deviceId:'old-device',authenticationAssurance:'MFA',openedAt:now.toISOString(),lastSeenAt:now.toISOString(),expiresAt:future,status:'ACTIVE'}]},null,2));
    assert.equal(repo.identityForUid('legacy-uid','comp-1'),null);
    const migrated=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(migrated.invitations[0].status,'REVOKED');
    assert.equal(migrated.grants[0].status,'REVOKED');
    assert.equal(migrated.sessions[0].status,'REVOKED');
    assert.equal(migrated.invitations[0].requestedRole,'scientific_admin');
    assert.equal(migrated.grants[0].role,'scientific_admin');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});

test('scientific governance remains with owner while critical ceremony quorum stays independent',()=>{
  const store=source('src/lib/store.ts');
  const portals=source('src/components/admin/RolePortals.tsx');
  assert.match(portals,/ScientificGovernance/);
  assert.match(store,/currentUser\.role!=='super_admin'/);
  assert.match(store,/\[\['head_judge'\],\['comp_admin'\],\['org_admin'\]\],2,\['head_judge','comp_admin','org_admin'\]/);
  assert.doesNotMatch(store,/ceremony_reveal[^\n]{0,250}super_admin/);
});

test('header identity no longer clips names to the old 8rem ellipsis',()=>{
  const roles=source('src/components/design-system/RoleSwitcher.tsx');
  assert.doesNotMatch(roles,/max-w-32 truncate/);
  assert.match(roles,/whitespace-nowrap/);
});
"""
write('tests/final-cleanup-phase-c.test.ts', final_test)

# Fail closed if any ACTIVE source still references the retired identifier. The two compatibility
# migrations are intentionally allowed; the contract test contains fixtures/assertions by design.
allowed = {
    'server/identity-governance.ts': 1,
    'src/lib/store.ts': 1,
    'tests/user-notes-2026-09-08.test.ts': None,
    'tests/final-cleanup-phase-c.test.ts': None,
}
unexpected=[]
for root in ('src','server','tests'):
    for p in Path(root).rglob('*'):
        if not p.is_file() or p.suffix not in {'.ts','.tsx','.js','.mjs'}: continue
        text=p.read_text(encoding='utf-8')
        if 'scientific_admin' not in text: continue
        key=str(p)
        if key not in allowed:
            unexpected.append(key)
        elif allowed[key] is not None and text.count('scientific_admin') != allowed[key]:
            unexpected.append(f'{key} (expected {allowed[key]}, got {text.count("scientific_admin")})')
if 'scientific_admin' in read('server.ts'):
    unexpected.append('server.ts')
if unexpected:
    raise SystemExit('Unexpected retired-role references:\n'+'\n'.join(unexpected))

print('MIZAN phase C final cleanup materialized successfully')
