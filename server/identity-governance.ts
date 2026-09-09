import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/** Active identity roles. Legacy persisted authority is handled only by the migration guard below. */
export type GovernanceRole=
  | 'super_admin'|'org_admin'|'comp_admin'|'head_judge'|'judge'
  | 'ops_manager'|'exception_host'|'delegation_manager'|'participant'
  | 'broadcast_operator'|'auditor'|'guardian'|'support_agent';
export type ServerIdentity={uid:string;email?:string;role:GovernanceRole;organizationId:string;competitionId?:string};

type Invitation={id:string;organizationId:string;competitionId?:string;committeeId?:string;email:string;displayName:string;requestedRole:GovernanceRole;reason:string;status:'PENDING_APPROVAL'|'READY'|'ACTIVATED'|'EXPIRED'|'REVOKED';createdAt:string;createdBy:string;approvedAt?:string;approvedBy?:string;expiresAt:string;activationTokenHash?:string};
type Account={id:string;uid:string;organizationId:string;email:string;displayName:string;status:'ACTIVE'|'SUSPENDED'|'REVOKED';createdAt:string;activatedFromInvitationId:string;suspendedAt?:string;suspendedBy?:string;suspensionReason?:string};
type Grant={id:string;accountId:string;organizationId:string;competitionId?:string;committeeId?:string;role:GovernanceRole;status:'ACTIVE'|'SUSPENDED'|'REVOKED';createdAt:string;createdBy:string;approvedBy?:string};
type AuthSession={id:string;uid:string;accountId:string;organizationId:string;competitionId?:string;role:GovernanceRole;deviceId:string;deviceName?:string;authenticationAssurance:'MFA'|'SINGLE_FACTOR';openedAt:string;lastSeenAt:string;expiresAt:string;status:'ACTIVE'|'REVOKED'|'EXPIRED'|'CONFLICT_BLOCKED';revokedAt?:string;revokedBy?:string;revocationReason?:string};
type State={version:1;invitations:Invitation[];accounts:Account[];grants:Grant[];sessions:AuthSession[]};
export type AuditRow={sequence:number;timestamp:string;organizationId:string;actorId:string;actorRole:string;action:string;entityType:string;entityId:string;reason?:string;previousHash:string;hash:string};

const RETIRED_IDENTITY_ROLE='scientific_admin' as const;
const isRetiredIdentityRole=(role:unknown)=>String(role||'')===RETIRED_IDENTITY_ROLE;
const PRIVILEGED_SESSION=new Set<GovernanceRole>(['super_admin','org_admin','comp_admin','head_judge','judge','auditor']);
const SESSION_REVOKERS=new Set<GovernanceRole>(['super_admin','org_admin','comp_admin','head_judge']);

/**
 * Delegated trust chain:
 * owner -> organization admin -> competition staff.
 * Creating a named account is routine provisioning, not a two-person integrity decision.
 */
const GRANT_MATRIX:Record<string,GovernanceRole[]>={
  super_admin:['org_admin','support_agent'],
  org_admin:['comp_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator','auditor','support_agent'],
  comp_admin:['head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator'],
};

const canonical=(v:unknown):string=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;const o=v as Record<string,unknown>;return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`};
const hash=(x:string)=>crypto.createHash('sha256').update(x).digest('hex');
const normalizeEmail=(x:string)=>x.trim().toLowerCase();
const safeSegment=(v:string)=>v.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);

export class IdentityGovernanceRepository{
  private file:string;
  constructor(private dir:string){
    if(!dir)throw new Error('IDENTITY_GOVERNANCE_DIR_REQUIRED');
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    this.file=path.join(dir,'identity-governance.json');
    if(!fs.existsSync(this.file))this.write({version:1,invitations:[],accounts:[],grants:[],sessions:[]});
  }

  private auditFile(organizationId:string){return path.join(this.dir,`identity-audit-${safeSegment(organizationId)}.jsonl`)}
  private read():State{try{
    const state=JSON.parse(fs.readFileSync(this.file,'utf8')) as State;let changed=false;const revokedAt=new Date().toISOString();
    // Compatibility only: preserve old rows and audit history while removing all live authority.
    for(const invitation of state.invitations)if(isRetiredIdentityRole((invitation as unknown as {requestedRole?:unknown}).requestedRole)){if(invitation.status!=='REVOKED'){invitation.status='REVOKED';changed=true}if(invitation.activationTokenHash){delete invitation.activationTokenHash;changed=true}}
    for(const grant of state.grants)if(isRetiredIdentityRole((grant as unknown as {role?:unknown}).role)&&grant.status!=='REVOKED'){grant.status='REVOKED';changed=true}
    for(const session of state.sessions)if(isRetiredIdentityRole((session as unknown as {role?:unknown}).role)){if(session.status!=='REVOKED'){session.status='REVOKED';changed=true}if(!session.revokedAt){session.revokedAt=revokedAt;changed=true}if(!session.revokedBy){session.revokedBy='MIZAN_IDENTITY_MIGRATION';changed=true}if(!session.revocationReason){session.revocationReason='Retired identity authority';changed=true}}
    if(changed)this.write(state);return state;
  }catch{throw new Error('IDENTITY_REPOSITORY_CORRUPT')}}
  private write(s:State){const tmp=`${this.file}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(s,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,this.file)}
  private appendAudit(actor:{uid:string;role:string;organizationId:string},action:string,entityType:string,entityId:string,reason?:string){
    const auditFile=this.auditFile(actor.organizationId);let previousHash='GENESIS',sequence=1;
    try{const lines=fs.existsSync(auditFile)?fs.readFileSync(auditFile,'utf8').trim().split('\n').filter(Boolean):[];if(lines.length){const last=JSON.parse(lines[lines.length-1]) as AuditRow;previousHash=last.hash;sequence=last.sequence+1}}catch{throw new Error('IDENTITY_AUDIT_CORRUPT')}
    const base={sequence,timestamp:new Date().toISOString(),organizationId:actor.organizationId,actorId:actor.uid,actorRole:actor.role,action,entityType,entityId,reason,previousHash};
    const row:AuditRow={...base,hash:hash(`${previousHash}|${canonical(base)}`)};
    fs.appendFileSync(auditFile,JSON.stringify(row)+'\n',{encoding:'utf8',mode:0o600});return row;
  }
  private canGrant(actor:ServerIdentity,target:GovernanceRole){return !isRetiredIdentityRole(target)&&(GRANT_MATRIX[actor.role]||[]).includes(target)}
  private isSuperAdminAccount(s:State,accountId:string){return s.grants.some(g=>g.accountId===accountId&&g.role==='super_admin'&&g.status==='ACTIVE')}
  private isOrgAdminAccount(s:State,accountId:string){return s.grants.some(g=>g.accountId===accountId&&g.role==='org_admin'&&g.status==='ACTIVE')}
  private assertOrgAdminContinuity(s:State,grant:Grant){
    if(grant.role!=='org_admin')return;
    const another=s.grants.some(g=>g.id!==grant.id&&g.organizationId===grant.organizationId&&g.role==='org_admin'&&g.status==='ACTIVE');
    if(!another)throw new Error('LAST_ORG_ADMIN_PROTECTED');
  }
  private activeGrantFor(s:State,accountId:string,competitionId?:string){return s.grants.find(g=>g.accountId===accountId&&g.status==='ACTIVE'&&!isRetiredIdentityRole(g.role)&&(!competitionId||g.competitionId===competitionId))}
  private cleanup(s:State){const now=Date.now();for(const x of s.invitations)if(['READY','PENDING_APPROVAL'].includes(x.status)&&new Date(x.expiresAt).getTime()<=now)x.status='EXPIRED';for(const x of s.sessions)if(x.status==='ACTIVE'&&new Date(x.expiresAt).getTime()<=now)x.status='EXPIRED';}
  private accountVisibleTo(actor:ServerIdentity,s:State,a:Account,requestedOrganizationId?:string,requestedCompetitionId?:string){
    const scope=actor.role==='super_admin'&&requestedOrganizationId?requestedOrganizationId:actor.organizationId;
    if(a.organizationId!==scope)return false;
    if(actor.role!=='super_admin'&&this.isSuperAdminAccount(s,a.id))return false;
    const competitionScope=actor.role==='comp_admin'&&actor.competitionId?actor.competitionId:requestedCompetitionId;
    const grant=this.activeGrantFor(s,a.id,competitionScope);
    if(!grant)return false;
    return true;
  }
  private assertManageableAccount(actor:ServerIdentity,s:State,account:Account){
    if(actor.role!=='super_admin'&&account.organizationId!==actor.organizationId)throw new Error('ACCOUNT_NOT_FOUND');
    if(account.uid===actor.uid)throw new Error('SELF_ACCOUNT_CHANGE_NOT_ALLOWED');
    if(actor.role!=='super_admin'&&this.isSuperAdminAccount(s,account.id))throw new Error('SUPER_ADMIN_PROTECTED');
    if(this.isOrgAdminAccount(s,account.id)&&actor.role!=='super_admin')throw new Error('ORG_ADMIN_PROTECTED');
    const target=this.activeGrantFor(s,account.id);
    if(!target)throw new Error('ACCOUNT_NOT_FOUND');
    if(actor.role!=='super_admin'&&!this.canGrant(actor,target.role))throw new Error('ACCOUNT_MANAGEMENT_NOT_ALLOWED');
    if(actor.role==='comp_admin'&&actor.competitionId&&target.competitionId&&target.competitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    return target;
  }

  list(actor:ServerIdentity,requestedOrganizationId?:string,requestedCompetitionId?:string){
    const s=this.read();this.cleanup(s);this.write(s);
    const scope=actor.role==='super_admin'&&requestedOrganizationId?requestedOrganizationId:actor.organizationId;
    const competitionScope=actor.role==='comp_admin'&&actor.competitionId?actor.competitionId:requestedCompetitionId;
    if(actor.role==='comp_admin'&&requestedCompetitionId&&actor.competitionId&&requestedCompetitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    const scopedGrants=s.grants.filter(g=>g.organizationId===scope&&!isRetiredIdentityRole(g.role)&&(!competitionScope||g.competitionId===competitionScope));
    const ids=new Set(scopedGrants.map(g=>g.accountId));
    const accounts=s.accounts.filter(a=>ids.has(a.id)&&this.accountVisibleTo(actor,s,a,scope,competitionScope));
    const visibleIds=new Set(accounts.map(a=>a.id));
    return {
      accounts,
      grants:scopedGrants.filter(g=>visibleIds.has(g.accountId)),
      invitations:s.invitations.filter(inv=>inv.organizationId===scope&&!isRetiredIdentityRole(inv.requestedRole)&&(!competitionScope||inv.competitionId===competitionScope)&&(actor.role!=='comp_admin'||!actor.competitionId||!inv.competitionId||inv.competitionId===actor.competitionId)).map(inv=>({...inv,activationTokenHash:undefined})),
      sessions:s.sessions.filter(x=>visibleIds.has(x.accountId)&&x.status==='ACTIVE'&&(!competitionScope||x.competitionId===competitionScope)),
    };
  }

  createInvitation(actor:ServerIdentity,input:{email:string;displayName:string;requestedRole:GovernanceRole;organizationId?:string;competitionId?:string;committeeId?:string;reason:string}){
    if(isRetiredIdentityRole(input.requestedRole))throw new Error('ROLE_RETIRED');
    if(!this.canGrant(actor,input.requestedRole))throw new Error('ROLE_GRANT_NOT_ALLOWED');
    const targetOrganizationId=actor.role==='super_admin'&&input.organizationId?input.organizationId:actor.organizationId;
    if(actor.role!=='super_admin'&&input.organizationId&&input.organizationId!==actor.organizationId)throw new Error('CROSS_TENANT_GRANT_BLOCKED');
    const competitionScopedActor=actor.role==='org_admin'||actor.role==='comp_admin';
    if(competitionScopedActor&&!input.competitionId)throw new Error('COMPETITION_SCOPE_REQUIRED');
    if(actor.role==='comp_admin'&&actor.competitionId&&input.competitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    const email=normalizeEmail(input.email);
    if(!email||!input.displayName.trim()||input.reason.trim().length<5)throw new Error('INVITATION_FIELDS_REQUIRED');
    const s=this.read();this.cleanup(s);
    const existing=s.accounts.find(a=>a.organizationId===targetOrganizationId&&normalizeEmail(a.email)===email&&a.status==='ACTIVE');
    if(existing&&s.grants.some(g=>g.accountId===existing.id&&g.status==='ACTIVE'&&g.competitionId===input.competitionId))throw new Error('ACCOUNT_ALREADY_ACTIVE_IN_COMPETITION');
    if(s.invitations.some(inv=>inv.organizationId===targetOrganizationId&&inv.email===email&&inv.competitionId===input.competitionId&&inv.status==='READY'))throw new Error('INVITATION_ALREADY_PENDING');
    for(const old of s.invitations)if(old.organizationId===targetOrganizationId&&old.email===email&&old.competitionId===input.competitionId&&old.status==='PENDING_APPROVAL')old.status='REVOKED';
    const rawToken=crypto.randomBytes(24).toString('base64url');
    const invitation:Invitation={id:crypto.randomUUID(),organizationId:targetOrganizationId,competitionId:input.competitionId||actor.competitionId,committeeId:input.committeeId,email,displayName:input.displayName.trim(),requestedRole:input.requestedRole,reason:input.reason.trim(),status:'READY',createdAt:new Date().toISOString(),createdBy:actor.uid,expiresAt:new Date(Date.now()+48*3600_000).toISOString(),activationTokenHash:hash(rawToken)};
    s.invitations.unshift(invitation);this.write(s);
    this.appendAudit({...actor,organizationId:targetOrganizationId},'IDENTITY_INVITATION_CREATED','Invitation',invitation.id,input.reason);
    return {invitation:{...invitation,activationTokenHash:undefined},activationToken:rawToken};
  }

  previewInvitation(token:string){
    const s=this.read();this.cleanup(s);this.write(s);const tokenHash=hash(String(token||''));const inv=s.invitations.find(x=>x.status==='READY'&&x.activationTokenHash===tokenHash);
    if(!inv)throw new Error('ACTIVATION_TOKEN_INVALID');
    const account=s.accounts.find(a=>a.organizationId===inv.organizationId&&normalizeEmail(a.email)===inv.email&&a.status==='ACTIVE');
    const existingAccount=!!account&&s.grants.some(g=>g.accountId===account.id&&g.organizationId===inv.organizationId&&g.competitionId===inv.competitionId&&g.role===inv.requestedRole&&g.status==='ACTIVE');
    return {email:inv.email,displayName:inv.displayName,requestedRole:inv.requestedRole,organizationId:inv.organizationId,competitionId:inv.competitionId,expiresAt:inv.expiresAt,existingAccount};
  }

  /** Compatibility only: turns a pre-upgrade PENDING_APPROVAL invitation into a normal READY invitation. */
  approveInvitation(actor:ServerIdentity,id:string){
    const s=this.read();this.cleanup(s);const inv=s.invitations.find(i=>i.id===id&&(actor.role==='super_admin'||i.organizationId===actor.organizationId));
    if(!inv)throw new Error('INVITATION_NOT_FOUND');if(inv.status!=='PENDING_APPROVAL')throw new Error('INVITATION_NOT_PENDING');
    if(isRetiredIdentityRole(inv.requestedRole))throw new Error('ROLE_RETIRED');if(!this.canGrant(actor,inv.requestedRole))throw new Error('ROLE_GRANT_NOT_ALLOWED');
    const rawToken=crypto.randomBytes(24).toString('base64url');inv.status='READY';inv.approvedAt=new Date().toISOString();inv.approvedBy=actor.uid;inv.activationTokenHash=hash(rawToken);this.write(s);
    this.appendAudit({...actor,organizationId:inv.organizationId},'LEGACY_IDENTITY_INVITATION_UPGRADED','Invitation',inv.id,'Legacy invitation migrated to delegated-trust activation');
    return {invitation:{...inv,activationTokenHash:undefined},activationToken:rawToken};
  }

  activate(base:{uid:string;email?:string},token:string){
    if(!base.uid||!base.email)throw new Error('VERIFIED_EMAIL_REQUIRED');
    const s=this.read();this.cleanup(s);const tokenHash=hash(String(token||''));const inv=s.invitations.find(x=>x.status==='READY'&&x.activationTokenHash===tokenHash);
    if(!inv)throw new Error('ACTIVATION_TOKEN_INVALID');if(isRetiredIdentityRole(inv.requestedRole))throw new Error('ROLE_RETIRED');if(normalizeEmail(base.email)!==inv.email)throw new Error('ACTIVATION_EMAIL_MISMATCH');
    const existingByUid=s.accounts.find(a=>a.uid===base.uid&&a.status==='ACTIVE');
    const existingByEmail=s.accounts.find(a=>a.organizationId===inv.organizationId&&normalizeEmail(a.email)===inv.email&&a.status==='ACTIVE');
    if(existingByUid&&existingByEmail&&existingByUid.id!==existingByEmail.id)throw new Error('IDENTITY_BINDING_CONFLICT');
    if(existingByUid&&existingByUid.organizationId!==inv.organizationId)throw new Error('CROSS_TENANT_IDENTITY_BLOCKED');
    const account=existingByUid||existingByEmail;
    const existingGrant=account&&s.grants.find(g=>g.accountId===account.id&&g.status==='ACTIVE'&&g.competitionId===inv.competitionId&&g.role===inv.requestedRole);
    if(existingGrant){inv.status='ACTIVATED';delete inv.activationTokenHash;this.write(s);this.appendAudit({uid:base.uid,role:existingGrant.role,organizationId:existingGrant.organizationId},'IDENTITY_QR_REISSUE_ACTIVATED','Grant',existingGrant.id,'Reissued one-time QR confirmed the existing competition grant');return {account,grant:existingGrant,reissued:true};}
    const now=new Date().toISOString();
    const resolvedAccount:Account=account||{id:crypto.randomUUID(),uid:base.uid,organizationId:inv.organizationId,email:inv.email,displayName:inv.displayName,status:'ACTIVE',createdAt:now,activatedFromInvitationId:inv.id};
    if(!account)s.accounts.unshift(resolvedAccount);
    else if(!resolvedAccount.uid)resolvedAccount.uid=base.uid;
    const grant:Grant={id:crypto.randomUUID(),accountId:resolvedAccount.id,organizationId:inv.organizationId,competitionId:inv.competitionId,committeeId:inv.committeeId,role:inv.requestedRole,status:'ACTIVE',createdAt:now,createdBy:inv.createdBy,approvedBy:inv.approvedBy};
    inv.status='ACTIVATED';delete inv.activationTokenHash;s.grants.unshift(grant);this.write(s);
    this.appendAudit({uid:base.uid,role:grant.role,organizationId:grant.organizationId},'IDENTITY_ACTIVATED','Account',resolvedAccount.id,`One-time invitation bound to ${grant.competitionId||'organization'}`);
    return {account:resolvedAccount,grant};
  }

  identityForUid(uid:string,competitionId?:string){
    const s=this.read();this.cleanup(s);this.write(s);const account=s.accounts.find(a=>a.uid===uid&&a.status==='ACTIVE');if(!account)return null;
    let grants=s.grants.filter(g=>g.accountId===account.id&&g.status==='ACTIVE'&&!isRetiredIdentityRole(g.role));if(competitionId){const exact=grants.filter(g=>g.competitionId===competitionId);if(exact.length)grants=exact;else grants=grants.filter(g=>!g.competitionId);}
    if(!grants.length)return null;
    const rank:GovernanceRole[]=['super_admin','org_admin','comp_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator','auditor','support_agent','guardian','participant'];
    grants.sort((a,b)=>rank.indexOf(a.role)-rank.indexOf(b.role));return {account,grant:grants[0],grants};
  }
  private scopedGrant(actor:ServerIdentity,s:State,grantId:string){
    const grant=s.grants.find(g=>g.id===grantId&&!isRetiredIdentityRole(g.role));if(!grant)throw new Error('GRANT_NOT_FOUND');
    if(actor.role!=='super_admin'&&grant.organizationId!==actor.organizationId)throw new Error('GRANT_NOT_FOUND');
    if(actor.role==='comp_admin'&&actor.competitionId&&grant.competitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    if(grant.role==='org_admin'&&actor.role!=='super_admin')throw new Error('ORG_ADMIN_PROTECTED');
    if(actor.role!=='super_admin'&&!this.canGrant(actor,grant.role))throw new Error('ACCOUNT_MANAGEMENT_NOT_ALLOWED');
    const account=s.accounts.find(a=>a.id===grant.accountId&&a.status==='ACTIVE');if(!account)throw new Error('ACCOUNT_NOT_FOUND');
    if(account.uid===actor.uid)throw new Error('SELF_ACCOUNT_CHANGE_NOT_ALLOWED');
    if(actor.role!=='super_admin'&&this.isSuperAdminAccount(s,account.id))throw new Error('SUPER_ADMIN_PROTECTED');
    return {grant,account};
  }

  resumeGrant(actor:ServerIdentity,grantId:string,reason:string){
    if(!['super_admin','org_admin','comp_admin'].includes(actor.role))throw new Error('RESUME_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('RESUME_REASON_REQUIRED');
    const s=this.read();const {grant}=this.scopedGrant(actor,s,grantId);if(grant.status!=='SUSPENDED')throw new Error('GRANT_NOT_SUSPENDED');grant.status='ACTIVE';this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'IDENTITY_GRANT_RESUMED','Grant',grant.id,reason);return {grant};
  }

  reissueQr(actor:ServerIdentity,grantId:string){
    if(!['super_admin','org_admin','comp_admin'].includes(actor.role))throw new Error('QR_REISSUE_NOT_ALLOWED');
    const s=this.read();this.cleanup(s);const {grant,account}=this.scopedGrant(actor,s,grantId);if(grant.status!=='ACTIVE')throw new Error('GRANT_NOT_ACTIVE');
    for(const inv of s.invitations)if(inv.organizationId===grant.organizationId&&inv.competitionId===grant.competitionId&&inv.email===normalizeEmail(account.email)&&inv.status==='READY'){inv.status='REVOKED';delete inv.activationTokenHash;}
    const rawToken=crypto.randomBytes(24).toString('base64url');const now=new Date();
    const invitation:Invitation={id:crypto.randomUUID(),organizationId:grant.organizationId,competitionId:grant.competitionId,committeeId:grant.committeeId,email:normalizeEmail(account.email),displayName:account.displayName,requestedRole:grant.role,reason:'Reissued activation QR for existing authorized user',status:'READY',createdAt:now.toISOString(),createdBy:actor.uid,expiresAt:new Date(now.getTime()+48*3600_000).toISOString(),activationTokenHash:hash(rawToken)};
    s.invitations.unshift(invitation);this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'IDENTITY_QR_REISSUED','Grant',grant.id,'Previous pending activation QR invalidated; new one-time QR issued');return {invitation:{...invitation,activationTokenHash:undefined},activationToken:rawToken};
  }

  suspendGrant(actor:ServerIdentity,grantId:string,reason:string){
    if(!['super_admin','org_admin','comp_admin'].includes(actor.role))throw new Error('SUSPEND_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('SUSPEND_REASON_REQUIRED');
    const s=this.read();const {grant,account}=this.scopedGrant(actor,s,grantId);this.assertOrgAdminContinuity(s,grant);grant.status='SUSPENDED';let count=0;
    for(const x of s.sessions)if(x.accountId===account.id&&x.competitionId===grant.competitionId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason='Competition grant suspended';count++}
    this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'IDENTITY_GRANT_SUSPENDED','Grant',grant.id,reason);return {grant,revokedSessions:count};
  }

  removeGrant(actor:ServerIdentity,grantId:string,reason:string){
    if(!['super_admin','org_admin','comp_admin'].includes(actor.role))throw new Error('DELETE_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('DELETE_REASON_REQUIRED');
    const s=this.read();const {grant,account}=this.scopedGrant(actor,s,grantId);this.assertOrgAdminContinuity(s,grant);grant.status='REVOKED';let count=0;
    for(const x of s.sessions)if(x.accountId===account.id&&x.competitionId===grant.competitionId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason='Competition grant removed';count++}
    this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'IDENTITY_GRANT_REMOVED','Grant',grant.id,reason);return {removed:true,grantId:grant.id,revokedSessions:count};
  }

  revokeGrantSessions(actor:ServerIdentity,grantId:string,reason:string){
    if(!['super_admin','org_admin','comp_admin','head_judge'].includes(actor.role))throw new Error('SESSION_REVOCATION_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('REVOCATION_REASON_REQUIRED');
    const s=this.read();const grant=s.grants.find(g=>g.id===grantId&&g.status==='ACTIVE');if(!grant)throw new Error('GRANT_NOT_FOUND');
    if(actor.role!=='super_admin'&&grant.organizationId!==actor.organizationId)throw new Error('GRANT_NOT_FOUND');if(actor.role==='comp_admin'&&actor.competitionId&&grant.competitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    let count=0;for(const x of s.sessions)if(x.accountId===grant.accountId&&x.competitionId===grant.competitionId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason=reason.trim();count++}
    this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'AUTH_GRANT_SESSIONS_REVOKED','Grant',grant.id,reason);return {count};
  }

  suspend(actor:ServerIdentity,accountId:string,reason:string){
    if(!['super_admin','org_admin','comp_admin'].includes(actor.role))throw new Error('SUSPEND_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('SUSPEND_REASON_REQUIRED');
    const s=this.read();const account=s.accounts.find(a=>a.id===accountId);if(!account)throw new Error('ACCOUNT_NOT_FOUND');this.assertManageableAccount(actor,s,account);
    for(const grant of s.grants.filter(g=>g.accountId===account.id&&g.role==='org_admin'&&g.status==='ACTIVE'))this.assertOrgAdminContinuity(s,grant);
    account.status='SUSPENDED';account.suspendedAt=new Date().toISOString();account.suspendedBy=actor.uid;account.suspensionReason=reason.trim();
    for(const g of s.grants)if(g.accountId===account.id&&g.status==='ACTIVE')g.status='SUSPENDED';
    for(const x of s.sessions)if(x.accountId===account.id&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason='Account suspended'}
    this.write(s);this.appendAudit({...actor,organizationId:account.organizationId},'IDENTITY_ACCOUNT_SUSPENDED','Account',account.id,reason);return account;
  }

  /** Audit-preserving delete: removes access immediately without erasing historical evidence. */
  remove(actor:ServerIdentity,accountId:string,reason:string){
    if(!['super_admin','org_admin','comp_admin'].includes(actor.role))throw new Error('DELETE_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('DELETE_REASON_REQUIRED');
    const s=this.read();const account=s.accounts.find(a=>a.id===accountId);if(!account)throw new Error('ACCOUNT_NOT_FOUND');this.assertManageableAccount(actor,s,account);
    for(const grant of s.grants.filter(g=>g.accountId===account.id&&g.role==='org_admin'&&g.status==='ACTIVE'))this.assertOrgAdminContinuity(s,grant);
    account.status='REVOKED';account.suspendedAt=new Date().toISOString();account.suspendedBy=actor.uid;account.suspensionReason=reason.trim();
    for(const g of s.grants)if(g.accountId===account.id&&['ACTIVE','SUSPENDED'].includes(g.status))g.status='REVOKED';
    for(const x of s.sessions)if(x.accountId===account.id&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason='Account removed from tenant'}
    this.write(s);this.appendAudit({...actor,organizationId:account.organizationId},'IDENTITY_ACCOUNT_REMOVED','Account',account.id,reason);return {removed:true,accountId:account.id};
  }

  openSession(identity:ServerIdentity,deviceId:string,deviceName='',authenticationAssurance:'MFA'|'SINGLE_FACTOR'='MFA'){
    if(!deviceId)throw new Error('DEVICE_ID_REQUIRED');if(isRetiredIdentityRole(identity.role))throw new Error('ROLE_RETIRED');
    const s=this.read();this.cleanup(s);const resolved=this.identityForUid(identity.uid,identity.competitionId);if(!resolved)throw new Error('ACCOUNT_NOT_PROVISIONED');
    const now=Date.now();const conflict=s.sessions.find(x=>x.uid===identity.uid&&x.status==='ACTIVE'&&x.deviceId!==deviceId&&new Date(x.expiresAt).getTime()>now);
    if(conflict&&PRIVILEGED_SESSION.has(identity.role)){
      const blocked:AuthSession={id:crypto.randomUUID(),uid:identity.uid,accountId:resolved.account.id,organizationId:identity.organizationId,competitionId:identity.competitionId,role:identity.role,deviceId,deviceName,authenticationAssurance,openedAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),expiresAt:new Date(now+8*3600_000).toISOString(),status:'CONFLICT_BLOCKED'};
      s.sessions.unshift(blocked);this.write(s);this.appendAudit(identity,'PRIVILEGED_SESSION_CONFLICT_BLOCKED','AuthSession',blocked.id,`${authenticationAssurance} · active session already exists on ${conflict.deviceId}`);throw new Error('PRIVILEGED_SESSION_CONFLICT');
    }
    const existing=s.sessions.find(x=>x.uid===identity.uid&&x.deviceId===deviceId&&x.status==='ACTIVE');if(existing){existing.lastSeenAt=new Date().toISOString();existing.expiresAt=new Date(now+8*3600_000).toISOString();existing.authenticationAssurance=authenticationAssurance;this.write(s);return existing}
    const session:AuthSession={id:crypto.randomUUID(),uid:identity.uid,accountId:resolved.account.id,organizationId:identity.organizationId,competitionId:identity.competitionId,role:identity.role,deviceId,deviceName,authenticationAssurance,openedAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),expiresAt:new Date(now+8*3600_000).toISOString(),status:'ACTIVE'};
    s.sessions.unshift(session);this.write(s);this.appendAudit(identity,'AUTH_SESSION_OPENED','AuthSession',session.id,`${authenticationAssurance} · ${deviceName||deviceId}`);return session;
  }

  takeoverSession(identity:ServerIdentity,deviceId:string,deviceName='',authenticationAssurance:'MFA'|'SINGLE_FACTOR'='MFA'){
    if(!deviceId)throw new Error('DEVICE_ID_REQUIRED');if(!SESSION_REVOKERS.has(identity.role))throw new Error('SESSION_TAKEOVER_NOT_ALLOWED');
    const s=this.read();this.cleanup(s);for(const x of s.sessions)if(x.uid===identity.uid&&x.deviceId!==deviceId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revocationReason='session_takeover';x.revokedBy=identity.uid;}
    this.write(s);this.appendAudit(identity,'AUTH_SESSION_TAKEOVER','AuthSession',deviceId,`استيلاء على الجلسة من ${deviceName||deviceId}`);return this.openSession(identity,deviceId,deviceName,authenticationAssurance);
  }

  revokeSessions(actor:ServerIdentity,accountId:string,reason:string){
    if(!['super_admin','org_admin','comp_admin','head_judge'].includes(actor.role))throw new Error('SESSION_REVOCATION_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('REVOCATION_REASON_REQUIRED');
    const s=this.read();const account=s.accounts.find(a=>a.id===accountId);if(!account)throw new Error('ACCOUNT_NOT_FOUND');
    if(actor.role!=='head_judge')this.assertManageableAccount(actor,s,account);else if(account.organizationId!==actor.organizationId||this.isSuperAdminAccount(s,account.id))throw new Error('ACCOUNT_NOT_FOUND');
    let count=0;for(const x of s.sessions)if(x.accountId===accountId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason=reason.trim();count++}
    this.write(s);this.appendAudit({...actor,organizationId:account.organizationId},'AUTH_SESSIONS_REVOKED','Account',accountId,reason);return {count};
  }

  closeCompetitionAccess(actor:ServerIdentity,competitionId:string,reason:string){
    if(!['super_admin','org_admin'].includes(actor.role))throw new Error('COMPETITION_CLOSE_NOT_ALLOWED');
    if(!competitionId.trim())throw new Error('COMPETITION_REQUIRED');
    if(reason.trim().length<5)throw new Error('CLOSE_REASON_REQUIRED');
    const s=this.read();this.cleanup(s);const now=new Date().toISOString();
    let grants=0,sessions=0,invitations=0;
    for(const g of s.grants){if(g.organizationId===actor.organizationId&&g.competitionId===competitionId&&['ACTIVE','SUSPENDED'].includes(g.status)){g.status='REVOKED';grants++;}}
    for(const x of s.sessions){if(x.organizationId===actor.organizationId&&x.competitionId===competitionId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=now;x.revokedBy=actor.uid;x.revocationReason='Competition permanently closed';sessions++;}}
    for(const inv of s.invitations){if(inv.organizationId===actor.organizationId&&inv.competitionId===competitionId&&['READY','PENDING_APPROVAL'].includes(inv.status)){inv.status='REVOKED';delete inv.activationTokenHash;invitations++;}}
    this.write(s);this.appendAudit(actor,'COMPETITION_ACCESS_CLOSED','Competition',competitionId,reason.trim());
    return {closed:true,competitionId,revokedGrants:grants,revokedSessions:sessions,revokedInvitations:invitations,closedAt:now};
  }

  audit(actor:ServerIdentity,limit=500){if(!['super_admin','org_admin','comp_admin','auditor'].includes(actor.role))throw new Error('AUDIT_NOT_ALLOWED');const auditFile=this.auditFile(actor.organizationId);if(!fs.existsSync(auditFile))return [] as AuditRow[];const rows=fs.readFileSync(auditFile,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x) as AuditRow);return rows.slice(-Math.max(1,Math.min(5000,limit))).reverse()}
  verifyAudit(organizationId:string){const auditFile=this.auditFile(organizationId);if(!fs.existsSync(auditFile))return {valid:true,count:0,lastHash:'GENESIS'};const rows=fs.readFileSync(auditFile,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x) as AuditRow);let prev='GENESIS';for(let i=0;i<rows.length;i++){const r=rows[i];const base={sequence:r.sequence,timestamp:r.timestamp,organizationId:r.organizationId,actorId:r.actorId,actorRole:r.actorRole,action:r.action,entityType:r.entityType,entityId:r.entityId,reason:r.reason,previousHash:r.previousHash};if(r.organizationId!==organizationId||r.sequence!==i+1||r.previousHash!==prev||r.hash!==hash(`${prev}|${canonical(base)}`))return {valid:false,count:rows.length,failedSequence:r.sequence,lastHash:prev};prev=r.hash}return {valid:true,count:rows.length,lastHash:prev}}
}
