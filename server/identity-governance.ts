import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/** Active identity roles. Legacy persisted authority is handled only by the migration guard below. */
export type GovernanceRole=
  | 'super_admin'|'operator_owner'|'operator_admin'|'org_admin'|'storage_admin'|'billing_admin'|'branch_admin'|'comp_admin'|'head_judge'|'judge'
  | 'ops_manager'|'exception_host'|'delegation_manager'|'participant'
  | 'broadcast_operator'|'auditor'|'guardian'|'support_agent';
export type ServerIdentity={uid:string;email?:string;role:GovernanceRole;organizationId:string;operatorId?:string;competitionId?:string;operatorOrganizationIds?:string[]};

type Invitation={id:string;organizationId:string;operatorId?:string;competitionId?:string;committeeId?:string;email:string;displayName:string;requestedRole:GovernanceRole;reason:string;status:'PENDING_APPROVAL'|'READY'|'ACTIVATED'|'EXPIRED'|'REVOKED';createdAt:string;createdBy:string;approvedAt?:string;approvedBy?:string;expiresAt:string;activationTokenHash?:string};
type Account={id:string;uid:string;organizationId:string;operatorId?:string;email:string;displayName:string;status:'ACTIVE'|'SUSPENDED'|'REVOKED';createdAt:string;activatedFromInvitationId:string;suspendedAt?:string;suspendedBy?:string;suspensionReason?:string};
type Grant={id:string;accountId:string;organizationId:string;operatorId?:string;competitionId?:string;committeeId?:string;role:GovernanceRole;status:'ACTIVE'|'SUSPENDED'|'REVOKED';createdAt:string;createdBy:string;approvedBy?:string};
type AuthSession={id:string;uid:string;accountId:string;organizationId:string;operatorId?:string;competitionId?:string;role:GovernanceRole;deviceId:string;deviceName?:string;authenticationAssurance:'MFA'|'SINGLE_FACTOR';openedAt:string;lastSeenAt:string;expiresAt:string;status:'ACTIVE'|'REVOKED'|'EXPIRED'|'CONFLICT_BLOCKED';revokedAt?:string;revokedBy?:string;revocationReason?:string};
type CompetitionClosure={organizationId:string;competitionId:string;status:'completed'|'archived';closedAt:string;closedBy:string;reason:string};
export type PasswordResetRequest={id:string;organizationId:string;operatorId?:string;accountId:string;uid:string;email:string;displayName:string;reviewerRole:'org_admin'|'operator_owner'|'super_admin';status:'PENDING'|'ISSUED'|'USED'|'EXPIRED'|'REVOKED';requestedAt:string;requestExpiresAt:string;issuedAt?:string;issuedBy?:string;linkExpiresAt?:string;shareTokenHash?:string;usedAt?:string};
type State={version:1;invitations:Invitation[];accounts:Account[];grants:Grant[];sessions:AuthSession[];competitionClosures?:CompetitionClosure[];passwordResetRequests?:PasswordResetRequest[]};
export type AuditRow={sequence:number;timestamp:string;organizationId:string;actorId:string;actorRole:string;action:string;entityType:string;entityId:string;reason?:string;previousHash:string;hash:string};

const RETIRED_IDENTITY_ROLE='scientific_admin' as const;
const NON_PROVISIONABLE_SELF_SERVICE_ROLES=new Set<string>(['participant','guardian']);
const isRetiredIdentityRole=(role:unknown)=>String(role||'')===RETIRED_IDENTITY_ROLE;
const isProvisionableGovernanceRole=(role:unknown):role is GovernanceRole=>!isRetiredIdentityRole(role)&&!NON_PROVISIONABLE_SELF_SERVICE_ROLES.has(String(role||''));
const PRIVILEGED_SESSION=new Set<GovernanceRole>(['super_admin','operator_owner','operator_admin','org_admin','storage_admin','billing_admin','branch_admin','comp_admin','head_judge','judge','auditor']);
const SESSION_REVOKERS=new Set<GovernanceRole>(['super_admin','operator_owner','org_admin','comp_admin','head_judge']);
const OPERATOR_ROLES=new Set<GovernanceRole>(['operator_owner','operator_admin']);
const ARCHIVE_VISIBILITY_ROLES=new Set<GovernanceRole>(['super_admin','operator_owner','operator_admin','org_admin','auditor']);

/**
 * Delegated trust chain:
 * owner -> organization admin -> competition staff.
 * Creating a named account is routine provisioning, not a two-person integrity decision.
 */
const GRANT_MATRIX:Record<string,GovernanceRole[]>={
  super_admin:['org_admin','support_agent'],
  operator_owner:['operator_admin'],
  org_admin:['comp_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator','auditor','storage_admin','billing_admin','branch_admin'],
  comp_admin:['head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator'],
};

const canonical=(v:unknown):string=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;const o=v as Record<string,unknown>;return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`};
const hash=(x:string)=>crypto.createHash('sha256').update(x).digest('hex');
const normalizeEmail=(x:string)=>x.trim().toLowerCase();
const safeSegment=(v:string)=>v.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);
export const operatorIdentityOrganizationId=(operatorId:string)=>`__operator__:${safeSegment(operatorId)}`;
const isOperatorRole=(role:GovernanceRole)=>OPERATOR_ROLES.has(role);

export class IdentityGovernanceRepository{
  private file:string;
  constructor(private dir:string){
    if(!dir)throw new Error('IDENTITY_GOVERNANCE_DIR_REQUIRED');
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    this.file=path.join(dir,'identity-governance.json');
    if(!fs.existsSync(this.file))this.write({version:1,invitations:[],accounts:[],grants:[],sessions:[],competitionClosures:[],passwordResetRequests:[]});
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
  private canGrant(actor:ServerIdentity,target:GovernanceRole){return isProvisionableGovernanceRole(target)&&((actor.role==='super_admin'&&['operator_owner','operator_admin'].includes(target))||(GRANT_MATRIX[actor.role]||[]).includes(target))}
  private operatorCanReachOrganization(actor:ServerIdentity,organizationId:string){
    return Boolean(isOperatorRole(actor.role)&&actor.operatorId&&organizationId&&actor.operatorOrganizationIds?.includes(organizationId));
  }
  private isSuperAdminAccount(s:State,accountId:string){return s.grants.some(g=>g.accountId===accountId&&g.role==='super_admin'&&g.status==='ACTIVE')}
  private isOrgAdminAccount(s:State,accountId:string){return s.grants.some(g=>g.accountId===accountId&&g.role==='org_admin'&&g.status==='ACTIVE')}
  private assertOrgAdminContinuity(s:State,grant:Grant){
    if(grant.role!=='org_admin')return;
    const another=s.grants.some(g=>g.id!==grant.id&&g.organizationId===grant.organizationId&&g.role==='org_admin'&&g.status==='ACTIVE');
    if(!another)throw new Error('LAST_ORG_ADMIN_PROTECTED');
  }
  private activeGrantFor(s:State,accountId:string,competitionId?:string){return s.grants.find(g=>g.accountId===accountId&&g.status==='ACTIVE'&&!isRetiredIdentityRole(g.role)&&(!competitionId||g.competitionId===competitionId))}
  private visibleGrantFor(s:State,accountId:string,competitionId?:string){return s.grants.find(g=>g.accountId===accountId&&['ACTIVE','SUSPENDED'].includes(g.status)&&!isRetiredIdentityRole(g.role)&&(!competitionId||g.competitionId===competitionId))}
  private passwordResets(s:State){return s.passwordResetRequests||(s.passwordResetRequests=[]);}
  private cleanup(s:State){const now=Date.now();for(const x of s.invitations)if(['READY','PENDING_APPROVAL'].includes(x.status)&&new Date(x.expiresAt).getTime()<=now)x.status='EXPIRED';for(const x of s.sessions)if(x.status==='ACTIVE'&&new Date(x.expiresAt).getTime()<=now)x.status='EXPIRED';for(const x of this.passwordResets(s)){if(x.status==='PENDING'&&new Date(x.requestExpiresAt).getTime()<=now)x.status='EXPIRED';if(x.status==='ISSUED'&&(!x.linkExpiresAt||new Date(x.linkExpiresAt).getTime()<=now)){x.status='EXPIRED';delete x.shareTokenHash;}}}
  private closures(s:State){return s.competitionClosures||(s.competitionClosures=[]);}
  private isCompetitionClosed(s:State,organizationId:string,competitionId?:string){return Boolean(competitionId&&this.closures(s).some(x=>x.organizationId===organizationId&&x.competitionId===competitionId&&['completed','archived'].includes(x.status)));}
  private assertCompetitionOpen(s:State,organizationId:string,competitionId: string|undefined,role?:GovernanceRole){if(this.isCompetitionClosed(s,organizationId,competitionId)&&(!role||!ARCHIVE_VISIBILITY_ROLES.has(role)))throw new Error('COMPETITION_ACCESS_CLOSED');}
  private accountVisibleTo(actor:ServerIdentity,s:State,a:Account,requestedOrganizationId?:string,requestedCompetitionId?:string,requestedOperatorId?:string){
    if(requestedOperatorId||isOperatorRole(actor.role)){
      const operatorId=actor.role==='super_admin'?requestedOperatorId:actor.operatorId;
      if(!operatorId||a.operatorId!==operatorId)return false;
      if(actor.role==='operator_owner'){const grant=this.visibleGrantFor(s,a.id);if(!grant||grant.role!=='operator_admin')return false;}
      return true;
    }
    const scope=actor.role==='super_admin'&&requestedOrganizationId?requestedOrganizationId:actor.organizationId;
    if(a.organizationId!==scope)return false;
    if(actor.role!=='super_admin'&&this.isSuperAdminAccount(s,a.id))return false;
    const competitionScope=actor.role==='comp_admin'&&actor.competitionId?actor.competitionId:requestedCompetitionId;
    const grant=competitionScope?s.grants.find(g=>g.accountId===a.id&&['ACTIVE','SUSPENDED'].includes(g.status)&&!isRetiredIdentityRole(g.role)&&(!g.competitionId||g.competitionId===competitionScope)):this.visibleGrantFor(s,a.id);
    if(!grant)return false;
    return true;
  }
  private assertManageableAccount(actor:ServerIdentity,s:State,account:Account){
    if(account.uid===actor.uid)throw new Error('SELF_ACCOUNT_CHANGE_NOT_ALLOWED');
    const target=this.activeGrantFor(s,account.id);if(!target)throw new Error('ACCOUNT_NOT_FOUND');
    if(actor.role==='operator_owner'){
      if(!actor.operatorId||account.operatorId!==actor.operatorId||target.operatorId!==actor.operatorId||target.role!=='operator_admin')throw new Error('ACCOUNT_NOT_FOUND');
      return target;
    }
    if(actor.role!=='super_admin'&&account.organizationId!==actor.organizationId)throw new Error('ACCOUNT_NOT_FOUND');
    if(actor.role!=='super_admin'&&this.isSuperAdminAccount(s,account.id))throw new Error('SUPER_ADMIN_PROTECTED');
    if(this.isOrgAdminAccount(s,account.id)&&actor.role!=='super_admin')throw new Error('ORG_ADMIN_PROTECTED');
    if(actor.role!=='super_admin'&&!this.canGrant(actor,target.role))throw new Error('ACCOUNT_MANAGEMENT_NOT_ALLOWED');
    if(actor.role==='comp_admin'&&actor.competitionId&&target.competitionId&&target.competitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    return target;
  }

  list(actor:ServerIdentity,requestedOrganizationId?:string,requestedCompetitionId?:string,requestedOperatorId?:string){
    const s=this.read();this.cleanup(s);this.write(s);
    if(isOperatorRole(actor.role)&&requestedOrganizationId&&!requestedOperatorId){
      if(!this.operatorCanReachOrganization(actor,requestedOrganizationId))throw new Error('CROSS_OPERATOR_ORGANIZATION_BLOCKED');
      const scopedGrants=s.grants.filter(g=>g.organizationId===requestedOrganizationId&&!g.operatorId&&g.role==='org_admin'&&g.status!=='REVOKED');
      const ids=new Set(scopedGrants.map(g=>g.accountId));
      const accounts=s.accounts.filter(a=>a.organizationId===requestedOrganizationId&&a.status!=='REVOKED'&&ids.has(a.id));
      const visibleIds=new Set(accounts.map(a=>a.id));
      const invitations=s.invitations.filter(inv=>inv.organizationId===requestedOrganizationId&&!inv.operatorId&&inv.requestedRole==='org_admin'&&inv.status!=='REVOKED').map(inv=>({...inv,activationTokenHash:undefined}));
      const passwordResetRequests=this.passwordResets(s).filter(x=>x.organizationId===requestedOrganizationId&&x.reviewerRole==='super_admin').map(x=>({...x,shareTokenHash:undefined}));
      return {accounts,grants:scopedGrants.filter(g=>visibleIds.has(g.accountId)),invitations,sessions:s.sessions.filter(x=>x.organizationId===requestedOrganizationId&&visibleIds.has(x.accountId)).sort((a,b)=>String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))).slice(0,500),passwordResetRequests};
    }
    if(isOperatorRole(actor.role)&&requestedOperatorId&&requestedOperatorId!==actor.operatorId)throw new Error('CROSS_OPERATOR_ACCESS_BLOCKED');
    if(requestedOperatorId||isOperatorRole(actor.role)){
      const operatorId=actor.role==='super_admin'?requestedOperatorId:actor.operatorId;if(!operatorId)throw new Error('OPERATOR_SCOPE_REQUIRED');
      let scopedGrants=s.grants.filter(g=>g.operatorId===operatorId&&!isRetiredIdentityRole(g.role)&&g.status!=='REVOKED');
      if(actor.role==='operator_owner')scopedGrants=scopedGrants.filter(g=>g.role==='operator_admin');
      const ids=new Set(scopedGrants.map(g=>g.accountId));
      const accounts=s.accounts.filter(a=>a.status!=='REVOKED'&&ids.has(a.id)&&this.accountVisibleTo(actor,s,a,undefined,undefined,operatorId));
      const visibleIds=new Set(accounts.map(a=>a.id));
      const invitations=s.invitations.filter(inv=>inv.operatorId===operatorId&&!isRetiredIdentityRole(inv.requestedRole)&&(actor.role!=='operator_owner'||inv.requestedRole==='operator_admin')).map(inv=>({...inv,activationTokenHash:undefined}));
      const passwordResetRequests=this.passwordResets(s).filter(x=>x.operatorId===operatorId&&(actor.role==='super_admin'||(actor.role==='operator_owner'&&x.reviewerRole==='operator_owner'))).map(x=>({...x,shareTokenHash:undefined}));
      return {accounts,grants:scopedGrants.filter(g=>visibleIds.has(g.accountId)),invitations,sessions:s.sessions.filter(x=>x.operatorId===operatorId&&visibleIds.has(x.accountId)).sort((a,b)=>String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))).slice(0,500),passwordResetRequests};
    }
    const scope=actor.role==='super_admin'&&requestedOrganizationId?requestedOrganizationId:actor.organizationId;
    const competitionScope=actor.role==='comp_admin'&&actor.competitionId?actor.competitionId:requestedCompetitionId;
    if(actor.role==='comp_admin'&&requestedCompetitionId&&actor.competitionId&&requestedCompetitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    // Organization-wide grants (for example a head judge or judge assigned before a specific competition
    // is selected) remain visible in a competition-scoped view. This is what lets committee setup see
    // every currently authorized judge instead of falsely reporting an empty team.
    const scopedGrants=s.grants.filter(g=>g.organizationId===scope&&!g.operatorId&&!isRetiredIdentityRole(g.role)&&g.status!=='REVOKED'&&(!competitionScope||!g.competitionId||g.competitionId===competitionScope));
    const ids=new Set(scopedGrants.map(g=>g.accountId));
    const accounts=s.accounts.filter(a=>a.status!=='REVOKED'&&ids.has(a.id)&&this.accountVisibleTo(actor,s,a,scope,competitionScope));
    const visibleIds=new Set(accounts.map(a=>a.id));
    const invitations=s.invitations.filter(inv=>inv.organizationId===scope&&!inv.operatorId&&!isRetiredIdentityRole(inv.requestedRole)&&(!competitionScope||!inv.competitionId||inv.competitionId===competitionScope)&&(actor.role!=='comp_admin'||!actor.competitionId||!inv.competitionId||inv.competitionId===actor.competitionId)).map(inv=>({...inv,activationTokenHash:undefined}));
    const passwordResetRequests=this.passwordResets(s).filter(x=>x.organizationId===scope&&!x.operatorId&&(actor.role==='super_admin'||(actor.role==='org_admin'&&x.reviewerRole==='org_admin'))).map(x=>({...x,shareTokenHash:undefined}));
    return {accounts,grants:scopedGrants.filter(g=>visibleIds.has(g.accountId)),invitations,sessions:s.sessions.filter(x=>visibleIds.has(x.accountId)&&(!competitionScope||!x.competitionId||x.competitionId===competitionScope)).sort((a,b)=>String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))).slice(0,500),passwordResetRequests};
  }

  createInvitation(actor:ServerIdentity,input:{email:string;displayName:string;requestedRole:GovernanceRole;organizationId?:string;operatorId?:string;competitionId?:string;committeeId?:string;reason:string}){
    if(isRetiredIdentityRole(input.requestedRole))throw new Error('ROLE_RETIRED');
    if(NON_PROVISIONABLE_SELF_SERVICE_ROLES.has(String(input.requestedRole)))throw new Error('SELF_SERVICE_ROLE_NOT_PROVISIONABLE');
    const operatorInvitesOrganizationAdmin=isOperatorRole(actor.role)&&input.requestedRole==='org_admin';
    if(!operatorInvitesOrganizationAdmin&&!this.canGrant(actor,input.requestedRole))throw new Error('ROLE_GRANT_NOT_ALLOWED');
    const operatorRole=isOperatorRole(input.requestedRole);
    let operatorId:string|undefined,targetOrganizationId:string;
    if(operatorRole){
      operatorId=(input.operatorId||actor.operatorId||'').trim();if(!operatorId)throw new Error('OPERATOR_SCOPE_REQUIRED');
      if(actor.role==='operator_owner'&&(actor.operatorId!==operatorId||input.requestedRole!=='operator_admin'))throw new Error('CROSS_OPERATOR_GRANT_BLOCKED');
      if(!['super_admin','operator_owner'].includes(actor.role))throw new Error('ROLE_GRANT_NOT_ALLOWED');
      targetOrganizationId=operatorIdentityOrganizationId(operatorId);
      if(input.organizationId&&input.organizationId!==targetOrganizationId)throw new Error('OPERATOR_NOT_ORGANIZATION');
      input.competitionId=undefined;input.committeeId=undefined;
    }else{
      if(operatorInvitesOrganizationAdmin){
        targetOrganizationId=String(input.organizationId||'').trim();
        if(!this.operatorCanReachOrganization(actor,targetOrganizationId))throw new Error('CROSS_OPERATOR_ORGANIZATION_BLOCKED');
        input.operatorId=undefined;input.competitionId=undefined;input.committeeId=undefined;
      }else{
        targetOrganizationId=actor.role==='super_admin'&&input.organizationId?input.organizationId:actor.organizationId;
      }
      if(!operatorInvitesOrganizationAdmin&&actor.role!=='super_admin'&&input.organizationId&&input.organizationId!==actor.organizationId)throw new Error('CROSS_TENANT_GRANT_BLOCKED');
      const competitionScopedActor=actor.role==='org_admin'||actor.role==='comp_admin';
      if(competitionScopedActor&&!input.competitionId)throw new Error('COMPETITION_SCOPE_REQUIRED');
      if(actor.role==='comp_admin'&&actor.competitionId&&input.competitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    }
    const email=normalizeEmail(input.email);if(!email||!input.displayName.trim()||input.reason.trim().length<5)throw new Error('INVITATION_FIELDS_REQUIRED');
    const s=this.read();this.cleanup(s);if(!operatorRole)this.assertCompetitionOpen(s,targetOrganizationId,input.competitionId||actor.competitionId,input.requestedRole);
    const existing=s.accounts.find(a=>a.organizationId===targetOrganizationId&&normalizeEmail(a.email)===email&&a.status==='ACTIVE');
    if(existing&&s.grants.some(g=>g.accountId===existing.id&&g.status==='ACTIVE'&&g.operatorId===operatorId&&g.competitionId===input.competitionId&&g.role===input.requestedRole))throw new Error(operatorRole?'ACCOUNT_ALREADY_ACTIVE_FOR_OPERATOR':'ACCOUNT_ALREADY_ACTIVE_IN_COMPETITION');
    if(s.invitations.some(inv=>inv.organizationId===targetOrganizationId&&inv.operatorId===operatorId&&inv.email===email&&inv.competitionId===input.competitionId&&inv.requestedRole===input.requestedRole&&inv.status==='READY'))throw new Error('INVITATION_ALREADY_PENDING');
    for(const old of s.invitations)if(old.organizationId===targetOrganizationId&&old.operatorId===operatorId&&old.email===email&&old.competitionId===input.competitionId&&old.status==='PENDING_APPROVAL')old.status='REVOKED';
    const rawToken=crypto.randomBytes(24).toString('base64url');
    const invitation:Invitation={id:crypto.randomUUID(),organizationId:targetOrganizationId,operatorId,competitionId:operatorRole?undefined:(input.competitionId||actor.competitionId),committeeId:input.committeeId,email,displayName:input.displayName.trim(),requestedRole:input.requestedRole,reason:input.reason.trim(),status:'READY',createdAt:new Date().toISOString(),createdBy:actor.uid,expiresAt:new Date(Date.now()+48*3600_000).toISOString(),activationTokenHash:hash(rawToken)};
    s.invitations.unshift(invitation);this.write(s);this.appendAudit({...actor,organizationId:targetOrganizationId},'IDENTITY_INVITATION_CREATED','Invitation',invitation.id,input.reason);return {invitation:{...invitation,activationTokenHash:undefined},activationToken:rawToken};
  }

  previewInvitation(token:string){
    const s=this.read();this.cleanup(s);this.write(s);const tokenHash=hash(String(token||''));const inv=s.invitations.find(x=>x.status==='READY'&&x.activationTokenHash===tokenHash);
    if(!inv)throw new Error('ACTIVATION_TOKEN_INVALID');
    if(this.isCompetitionClosed(s,inv.organizationId,inv.competitionId)&&!ARCHIVE_VISIBILITY_ROLES.has(inv.requestedRole))throw new Error('COMPETITION_ACCESS_CLOSED');
    if(NON_PROVISIONABLE_SELF_SERVICE_ROLES.has(String(inv.requestedRole)))throw new Error('SELF_SERVICE_ROLE_NOT_PROVISIONABLE');
    const account=s.accounts.find(a=>a.organizationId===inv.organizationId&&normalizeEmail(a.email)===inv.email&&a.status==='ACTIVE');
    const existingAccount=!!account&&s.grants.some(g=>g.accountId===account.id&&g.organizationId===inv.organizationId&&g.competitionId===inv.competitionId&&g.role===inv.requestedRole&&g.status==='ACTIVE');
    return {email:inv.email,displayName:inv.displayName,requestedRole:inv.requestedRole,organizationId:inv.organizationId,operatorId:inv.operatorId,competitionId:inv.competitionId,expiresAt:inv.expiresAt,existingAccount};
  }

  /** Compatibility only: turns a pre-upgrade PENDING_APPROVAL invitation into a normal READY invitation. */
  approveInvitation(actor:ServerIdentity,id:string){
    const s=this.read();this.cleanup(s);const inv=s.invitations.find(i=>i.id===id&&(actor.role==='super_admin'||(actor.role==='operator_owner'?Boolean(actor.operatorId&&i.operatorId===actor.operatorId&&i.requestedRole==='operator_admin'):i.organizationId===actor.organizationId)));
    if(!inv)throw new Error('INVITATION_NOT_FOUND');if(inv.status!=='PENDING_APPROVAL')throw new Error('INVITATION_NOT_PENDING');
    if(isRetiredIdentityRole(inv.requestedRole))throw new Error('ROLE_RETIRED');if(!this.canGrant(actor,inv.requestedRole))throw new Error('ROLE_GRANT_NOT_ALLOWED');
    const rawToken=crypto.randomBytes(24).toString('base64url');inv.status='READY';inv.approvedAt=new Date().toISOString();inv.approvedBy=actor.uid;inv.activationTokenHash=hash(rawToken);this.write(s);
    this.appendAudit({...actor,organizationId:inv.organizationId},'LEGACY_IDENTITY_INVITATION_UPGRADED','Invitation',inv.id,'Legacy invitation migrated to delegated-trust activation');
    return {invitation:{...inv,activationTokenHash:undefined},activationToken:rawToken};
  }

  activate(base:{uid:string;email?:string},token:string){
    if(!base.uid||!base.email)throw new Error('VERIFIED_EMAIL_REQUIRED');
    const s=this.read();this.cleanup(s);const tokenHash=hash(String(token||''));const inv=s.invitations.find(x=>x.status==='READY'&&x.activationTokenHash===tokenHash);
    if(!inv)throw new Error('ACTIVATION_TOKEN_INVALID');
    if(this.isCompetitionClosed(s,inv.organizationId,inv.competitionId)&&!ARCHIVE_VISIBILITY_ROLES.has(inv.requestedRole)){inv.status='REVOKED';delete inv.activationTokenHash;this.write(s);throw new Error('COMPETITION_ACCESS_CLOSED');}
    if(NON_PROVISIONABLE_SELF_SERVICE_ROLES.has(String(inv.requestedRole))){inv.status='REVOKED';delete inv.activationTokenHash;this.write(s);throw new Error('SELF_SERVICE_ROLE_NOT_PROVISIONABLE');}
    if(isRetiredIdentityRole(inv.requestedRole))throw new Error('ROLE_RETIRED');if(normalizeEmail(base.email)!==inv.email)throw new Error('ACTIVATION_EMAIL_MISMATCH');
    const existingByUid=s.accounts.find(a=>a.uid===base.uid&&a.status==='ACTIVE');
    const existingByEmail=s.accounts.find(a=>a.organizationId===inv.organizationId&&normalizeEmail(a.email)===inv.email&&a.status==='ACTIVE');
    if(existingByUid&&existingByEmail&&existingByUid.id!==existingByEmail.id)throw new Error('IDENTITY_BINDING_CONFLICT');
    if(existingByUid&&existingByUid.organizationId!==inv.organizationId)throw new Error('CROSS_TENANT_IDENTITY_BLOCKED');
    const account=existingByUid||existingByEmail;
    const existingGrant=account&&s.grants.find(g=>g.accountId===account.id&&g.status==='ACTIVE'&&g.competitionId===inv.competitionId&&g.role===inv.requestedRole);
    if(existingGrant){inv.status='ACTIVATED';delete inv.activationTokenHash;this.write(s);this.appendAudit({uid:base.uid,role:existingGrant.role,organizationId:existingGrant.organizationId},'IDENTITY_QR_REISSUE_ACTIVATED','Grant',existingGrant.id,'Reissued one-time QR confirmed the existing competition grant');return {account,grant:existingGrant,reissued:true};}
    const now=new Date().toISOString();
    const resolvedAccount:Account=account||{id:crypto.randomUUID(),uid:base.uid,organizationId:inv.organizationId,operatorId:inv.operatorId,email:inv.email,displayName:inv.displayName,status:'ACTIVE',createdAt:now,activatedFromInvitationId:inv.id};
    if(!account)s.accounts.unshift(resolvedAccount);
    else {if(!resolvedAccount.uid)resolvedAccount.uid=base.uid;if(inv.operatorId&&!resolvedAccount.operatorId)resolvedAccount.operatorId=inv.operatorId;}
    const grant:Grant={id:crypto.randomUUID(),accountId:resolvedAccount.id,organizationId:inv.organizationId,operatorId:inv.operatorId,competitionId:inv.competitionId,committeeId:inv.committeeId,role:inv.requestedRole,status:'ACTIVE',createdAt:now,createdBy:inv.createdBy,approvedBy:inv.approvedBy};
    inv.status='ACTIVATED';delete inv.activationTokenHash;s.grants.unshift(grant);this.write(s);
    this.appendAudit({uid:base.uid,role:grant.role,organizationId:grant.organizationId},'IDENTITY_ACTIVATED','Account',resolvedAccount.id,`One-time invitation bound to ${grant.competitionId||'organization'}`);
    return {account:resolvedAccount,grant};
  }

  identityForUid(uid:string,competitionId?:string){
    const s=this.read();this.cleanup(s);this.write(s);const account=s.accounts.find(a=>a.uid===uid&&a.status==='ACTIVE');if(!account)return null;
    let grants=s.grants.filter(g=>g.accountId===account.id&&g.status==='ACTIVE'&&!isRetiredIdentityRole(g.role)&&(!this.isCompetitionClosed(s,g.organizationId,g.competitionId)||ARCHIVE_VISIBILITY_ROLES.has(g.role)));if(competitionId){const exact=grants.filter(g=>g.competitionId===competitionId);if(exact.length)grants=exact;else grants=grants.filter(g=>!g.competitionId);}
    if(!grants.length)return null;
    const rank:GovernanceRole[]=['super_admin','operator_owner','operator_admin','org_admin','comp_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator','auditor','support_agent','guardian','participant'];
    grants.sort((a,b)=>rank.indexOf(a.role)-rank.indexOf(b.role));return {account,grant:grants[0],grants};
  }
  private scopedGrant(actor:ServerIdentity,s:State,grantId:string){
    const grant=s.grants.find(g=>g.id===grantId&&!isRetiredIdentityRole(g.role));if(!grant)throw new Error('GRANT_NOT_FOUND');
    if(actor.role==='operator_owner'){
      if(actor.operatorId&&grant.operatorId===actor.operatorId&&grant.role==='operator_admin'){}
      else if(!(grant.role==='org_admin'&&this.operatorCanReachOrganization(actor,grant.organizationId)))throw new Error('GRANT_NOT_FOUND');
    }else if(actor.role==='operator_admin'){
      if(!(grant.role==='org_admin'&&this.operatorCanReachOrganization(actor,grant.organizationId)))throw new Error('GRANT_NOT_FOUND');
    }else{
      if(actor.role!=='super_admin'&&grant.organizationId!==actor.organizationId)throw new Error('GRANT_NOT_FOUND');
      if(actor.role==='comp_admin'&&actor.competitionId&&grant.competitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
      if(grant.role==='org_admin'&&actor.role!=='super_admin')throw new Error('ORG_ADMIN_PROTECTED');
      if(actor.role!=='super_admin'&&!this.canGrant(actor,grant.role))throw new Error('ACCOUNT_MANAGEMENT_NOT_ALLOWED');
    }
    const account=s.accounts.find(a=>a.id===grant.accountId&&a.status==='ACTIVE');if(!account)throw new Error('ACCOUNT_NOT_FOUND');
    if(account.uid===actor.uid)throw new Error('SELF_ACCOUNT_CHANGE_NOT_ALLOWED');
    if(actor.role!=='super_admin'&&this.isSuperAdminAccount(s,account.id))throw new Error('SUPER_ADMIN_PROTECTED');
    return {grant,account};
  }

  resumeGrant(actor:ServerIdentity,grantId:string,reason:string){
    if(!['super_admin','operator_owner','org_admin','comp_admin'].includes(actor.role))throw new Error('RESUME_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('RESUME_REASON_REQUIRED');
    const s=this.read();const {grant}=this.scopedGrant(actor,s,grantId);this.assertCompetitionOpen(s,grant.organizationId,grant.competitionId,grant.role);if(grant.status!=='SUSPENDED')throw new Error('GRANT_NOT_SUSPENDED');grant.status='ACTIVE';this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'IDENTITY_GRANT_RESUMED','Grant',grant.id,reason);return {grant};
  }

  reissueQr(actor:ServerIdentity,grantId:string){
    if(!['super_admin','operator_owner','org_admin','comp_admin'].includes(actor.role))throw new Error('QR_REISSUE_NOT_ALLOWED');
    const s=this.read();this.cleanup(s);const {grant,account}=this.scopedGrant(actor,s,grantId);this.assertCompetitionOpen(s,grant.organizationId,grant.competitionId,grant.role);if(grant.status!=='ACTIVE')throw new Error('GRANT_NOT_ACTIVE');
    for(const inv of s.invitations)if(inv.organizationId===grant.organizationId&&inv.competitionId===grant.competitionId&&inv.email===normalizeEmail(account.email)&&inv.status==='READY'){inv.status='REVOKED';delete inv.activationTokenHash;}
    const rawToken=crypto.randomBytes(24).toString('base64url');const now=new Date();
    const invitation:Invitation={id:crypto.randomUUID(),organizationId:grant.organizationId,operatorId:grant.operatorId,competitionId:grant.competitionId,committeeId:grant.committeeId,email:normalizeEmail(account.email),displayName:account.displayName,requestedRole:grant.role,reason:'Reissued activation QR for existing authorized user',status:'READY',createdAt:now.toISOString(),createdBy:actor.uid,expiresAt:new Date(now.getTime()+48*3600_000).toISOString(),activationTokenHash:hash(rawToken)};
    s.invitations.unshift(invitation);this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'IDENTITY_QR_REISSUED','Grant',grant.id,'Previous pending activation QR invalidated; new one-time QR issued');return {invitation:{...invitation,activationTokenHash:undefined},activationToken:rawToken};
  }

  suspendGrant(actor:ServerIdentity,grantId:string,reason:string){
    if(!['super_admin','operator_owner','org_admin','comp_admin'].includes(actor.role))throw new Error('SUSPEND_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('SUSPEND_REASON_REQUIRED');
    const s=this.read();const {grant,account}=this.scopedGrant(actor,s,grantId);this.assertOrgAdminContinuity(s,grant);grant.status='SUSPENDED';let count=0;
    for(const x of s.sessions)if(x.accountId===account.id&&x.competitionId===grant.competitionId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason='Competition grant suspended';count++}
    this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'IDENTITY_GRANT_SUSPENDED','Grant',grant.id,reason);return {grant,revokedSessions:count};
  }

  removeGrant(actor:ServerIdentity,grantId:string,reason:string){
    if(!['super_admin','operator_owner','org_admin','comp_admin'].includes(actor.role))throw new Error('DELETE_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('DELETE_REASON_REQUIRED');
    const s=this.read();const {grant,account}=this.scopedGrant(actor,s,grantId);this.assertOrgAdminContinuity(s,grant);grant.status='REVOKED';let count=0;
    for(const x of s.sessions)if(x.accountId===account.id&&x.competitionId===grant.competitionId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason='Competition grant removed';count++}
    this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'IDENTITY_GRANT_REMOVED','Grant',grant.id,reason);return {removed:true,grantId:grant.id,revokedSessions:count};
  }

  revokeGrantSessions(actor:ServerIdentity,grantId:string,reason:string){
    if(!['super_admin','operator_owner','org_admin','comp_admin','head_judge'].includes(actor.role))throw new Error('SESSION_REVOCATION_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('REVOCATION_REASON_REQUIRED');
    const s=this.read();const grant=s.grants.find(g=>g.id===grantId&&g.status==='ACTIVE');if(!grant)throw new Error('GRANT_NOT_FOUND');
    if(actor.role==='operator_owner'){
      if(actor.operatorId&&grant.operatorId===actor.operatorId&&grant.role==='operator_admin'){}
      else if(!(grant.role==='org_admin'&&this.operatorCanReachOrganization(actor,grant.organizationId)))throw new Error('GRANT_NOT_FOUND')
    }else if(actor.role==='operator_admin'){
      if(!(grant.role==='org_admin'&&this.operatorCanReachOrganization(actor,grant.organizationId)))throw new Error('GRANT_NOT_FOUND')
    }else if(actor.role!=='super_admin'&&grant.organizationId!==actor.organizationId)throw new Error('GRANT_NOT_FOUND');if(actor.role==='comp_admin'&&actor.competitionId&&grant.competitionId!==actor.competitionId)throw new Error('COMPETITION_SCOPE_MISMATCH');
    let count=0;for(const x of s.sessions)if(x.accountId===grant.accountId&&x.competitionId===grant.competitionId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason=reason.trim();count++}
    this.write(s);this.appendAudit({...actor,organizationId:grant.organizationId},'AUTH_GRANT_SESSIONS_REVOKED','Grant',grant.id,reason);return {count};
  }

  suspend(actor:ServerIdentity,accountId:string,reason:string){
    if(!['super_admin','operator_owner','org_admin','comp_admin'].includes(actor.role))throw new Error('SUSPEND_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('SUSPEND_REASON_REQUIRED');
    const s=this.read();const account=s.accounts.find(a=>a.id===accountId);if(!account)throw new Error('ACCOUNT_NOT_FOUND');this.assertManageableAccount(actor,s,account);
    for(const grant of s.grants.filter(g=>g.accountId===account.id&&g.role==='org_admin'&&g.status==='ACTIVE'))this.assertOrgAdminContinuity(s,grant);
    account.status='SUSPENDED';account.suspendedAt=new Date().toISOString();account.suspendedBy=actor.uid;account.suspensionReason=reason.trim();
    for(const g of s.grants)if(g.accountId===account.id&&g.status==='ACTIVE')g.status='SUSPENDED';
    for(const x of s.sessions)if(x.accountId===account.id&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason='Account suspended'}
    this.write(s);this.appendAudit({...actor,organizationId:account.organizationId},'IDENTITY_ACCOUNT_SUSPENDED','Account',account.id,reason);return account;
  }

  /** Audit-preserving delete: removes access immediately without erasing historical evidence. */
  remove(actor:ServerIdentity,accountId:string,reason:string){
    if(!['super_admin','operator_owner','org_admin','comp_admin'].includes(actor.role))throw new Error('DELETE_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('DELETE_REASON_REQUIRED');
    const s=this.read();const account=s.accounts.find(a=>a.id===accountId);if(!account)throw new Error('ACCOUNT_NOT_FOUND');this.assertManageableAccount(actor,s,account);
    for(const grant of s.grants.filter(g=>g.accountId===account.id&&g.role==='org_admin'&&g.status==='ACTIVE'))this.assertOrgAdminContinuity(s,grant);
    account.status='REVOKED';account.suspendedAt=new Date().toISOString();account.suspendedBy=actor.uid;account.suspensionReason=reason.trim();
    for(const g of s.grants)if(g.accountId===account.id&&['ACTIVE','SUSPENDED'].includes(g.status))g.status='REVOKED';
    for(const x of s.sessions)if(x.accountId===account.id&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason='Account removed from tenant'}
    this.write(s);this.appendAudit({...actor,organizationId:account.organizationId},'IDENTITY_ACCOUNT_REMOVED','Account',account.id,reason);return {removed:true,accountId:account.id};
  }

  openSession(identity:ServerIdentity,deviceId:string,deviceName='',authenticationAssurance:'MFA'|'SINGLE_FACTOR'='MFA'){
    if(!deviceId)throw new Error('DEVICE_ID_REQUIRED');if(isRetiredIdentityRole(identity.role))throw new Error('ROLE_RETIRED');
    const s=this.read();this.cleanup(s);this.assertCompetitionOpen(s,identity.organizationId,identity.competitionId,identity.role);const resolved=this.identityForUid(identity.uid,identity.competitionId);if(!resolved)throw new Error('ACCOUNT_NOT_PROVISIONED');
    const now=Date.now();const conflict=s.sessions.find(x=>x.uid===identity.uid&&x.status==='ACTIVE'&&x.deviceId!==deviceId&&new Date(x.expiresAt).getTime()>now);
    if(conflict&&PRIVILEGED_SESSION.has(identity.role)){
      const blocked:AuthSession={id:crypto.randomUUID(),uid:identity.uid,accountId:resolved.account.id,organizationId:identity.organizationId,operatorId:identity.operatorId,competitionId:identity.competitionId,role:identity.role,deviceId,deviceName,authenticationAssurance,openedAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),expiresAt:new Date(now+8*3600_000).toISOString(),status:'CONFLICT_BLOCKED'};
      s.sessions.unshift(blocked);this.write(s);this.appendAudit(identity,'PRIVILEGED_SESSION_CONFLICT_BLOCKED','AuthSession',blocked.id,`${authenticationAssurance} · active session already exists on ${conflict.deviceId}`);throw new Error('PRIVILEGED_SESSION_CONFLICT');
    }
    const existing=s.sessions.find(x=>x.uid===identity.uid&&x.deviceId===deviceId&&x.status==='ACTIVE');if(existing){existing.lastSeenAt=new Date().toISOString();existing.expiresAt=new Date(now+8*3600_000).toISOString();existing.authenticationAssurance=authenticationAssurance;this.write(s);return existing}
    const session:AuthSession={id:crypto.randomUUID(),uid:identity.uid,accountId:resolved.account.id,organizationId:identity.organizationId,operatorId:identity.operatorId,competitionId:identity.competitionId,role:identity.role,deviceId,deviceName,authenticationAssurance,openedAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),expiresAt:new Date(now+8*3600_000).toISOString(),status:'ACTIVE'};
    s.sessions.unshift(session);this.write(s);this.appendAudit(identity,'AUTH_SESSION_OPENED','AuthSession',session.id,`${authenticationAssurance} · ${deviceName||deviceId}`);return session;
  }

  takeoverSession(identity:ServerIdentity,deviceId:string,deviceName='',authenticationAssurance:'MFA'|'SINGLE_FACTOR'='MFA'){
    if(!deviceId)throw new Error('DEVICE_ID_REQUIRED');if(!SESSION_REVOKERS.has(identity.role))throw new Error('SESSION_TAKEOVER_NOT_ALLOWED');
    const s=this.read();this.cleanup(s);for(const x of s.sessions)if(x.uid===identity.uid&&x.deviceId!==deviceId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revocationReason='session_takeover';x.revokedBy=identity.uid;}
    this.write(s);this.appendAudit(identity,'AUTH_SESSION_TAKEOVER','AuthSession',deviceId,`استيلاء على الجلسة من ${deviceName||deviceId}`);return this.openSession(identity,deviceId,deviceName,authenticationAssurance);
  }

  revokeSessions(actor:ServerIdentity,accountId:string,reason:string){
    if(!['super_admin','operator_owner','org_admin','comp_admin','head_judge'].includes(actor.role))throw new Error('SESSION_REVOCATION_NOT_ALLOWED');if(reason.trim().length<5)throw new Error('REVOCATION_REASON_REQUIRED');
    const s=this.read();const account=s.accounts.find(a=>a.id===accountId);if(!account)throw new Error('ACCOUNT_NOT_FOUND');
    if(actor.role!=='head_judge')this.assertManageableAccount(actor,s,account);else if(account.organizationId!==actor.organizationId||this.isSuperAdminAccount(s,account.id))throw new Error('ACCOUNT_NOT_FOUND');
    let count=0;for(const x of s.sessions)if(x.accountId===accountId&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=new Date().toISOString();x.revokedBy=actor.uid;x.revocationReason=reason.trim();count++}
    this.write(s);this.appendAudit({...actor,organizationId:account.organizationId},'AUTH_SESSIONS_REVOKED','Account',accountId,reason);return {count};
  }

  closeCompetitionAccess(actor:ServerIdentity,competitionId:string,reason:string,requestedOrganizationId?:string){
    if(!['super_admin','org_admin'].includes(actor.role))throw new Error('COMPETITION_CLOSE_NOT_ALLOWED');
    if(!competitionId.trim())throw new Error('COMPETITION_REQUIRED');
    if(reason.trim().length<5)throw new Error('CLOSE_REASON_REQUIRED');
    if(actor.role!=='super_admin'&&requestedOrganizationId&&requestedOrganizationId!==actor.organizationId)throw new Error('CROSS_TENANT_CLOSE_BLOCKED');
    const targetOrganizationId=actor.role==='super_admin'&&requestedOrganizationId?requestedOrganizationId:actor.organizationId;
    const s=this.read();this.cleanup(s);const now=new Date().toISOString();
    let grants=0,sessions=0,invitations=0;
    for(const g of s.grants){if(g.organizationId===targetOrganizationId&&g.competitionId===competitionId&&!ARCHIVE_VISIBILITY_ROLES.has(g.role)&&['ACTIVE','SUSPENDED'].includes(g.status)){g.status='REVOKED';grants++;}}
    for(const x of s.sessions){if(x.organizationId===targetOrganizationId&&x.competitionId===competitionId&&!ARCHIVE_VISIBILITY_ROLES.has(x.role)&&x.status==='ACTIVE'){x.status='REVOKED';x.revokedAt=now;x.revokedBy=actor.uid;x.revocationReason='Competition permanently closed';sessions++;}}
    for(const inv of s.invitations){if(inv.organizationId===targetOrganizationId&&inv.competitionId===competitionId&&!ARCHIVE_VISIBILITY_ROLES.has(inv.requestedRole)&&['READY','PENDING_APPROVAL'].includes(inv.status)){inv.status='REVOKED';delete inv.activationTokenHash;invitations++;}}
    const closures=this.closures(s);const existingClosure=closures.find(x=>x.organizationId===targetOrganizationId&&x.competitionId===competitionId);
    if(existingClosure){existingClosure.status='completed';existingClosure.closedAt=now;existingClosure.closedBy=actor.uid;existingClosure.reason=reason.trim();}
    else closures.unshift({organizationId:targetOrganizationId,competitionId,status:'completed',closedAt:now,closedBy:actor.uid,reason:reason.trim()});
    this.write(s);this.appendAudit({...actor,organizationId:targetOrganizationId},'COMPETITION_ACCESS_CLOSED','Competition',competitionId,reason.trim());
    return {closed:true,organizationId:targetOrganizationId,competitionId,revokedGrants:grants,revokedSessions:sessions,revokedInvitations:invitations,closedAt:now};
  }


  /** استقبال طلب عام دون كشف إن كان البريد مسجلاً؛ نقطة النهاية تُرجع إقرارًا عامًا دائمًا. */
  requestPasswordReset(emailInput:string){
    const email=normalizeEmail(emailInput);if(!email||!email.includes('@'))return null;
    const s=this.read();this.cleanup(s);const account=s.accounts.find(a=>a.status==='ACTIVE'&&normalizeEmail(a.email)===email);if(!account)return null;
    const activeGrants=s.grants.filter(g=>g.accountId===account.id&&g.status==='ACTIVE'&&!isRetiredIdentityRole(g.role));if(!activeGrants.length)return null;
    const operatorOwner=activeGrants.some(g=>g.role==='operator_owner'),operatorAdmin=activeGrants.some(g=>g.role==='operator_admin');
    const reviewerRole:PasswordResetRequest['reviewerRole']=operatorOwner?'super_admin':operatorAdmin?'operator_owner':activeGrants.some(g=>g.role==='org_admin'||g.role==='super_admin')?'super_admin':'org_admin';
    const operatorId=activeGrants.find(g=>g.operatorId)?.operatorId||account.operatorId;
    const now=new Date();for(const old of this.passwordResets(s))if(old.accountId===account.id&&['PENDING','ISSUED'].includes(old.status)){old.status='REVOKED';delete old.shareTokenHash;}
    const request:PasswordResetRequest={id:crypto.randomUUID(),organizationId:account.organizationId,operatorId,accountId:account.id,uid:account.uid,email:account.email,displayName:account.displayName,reviewerRole,status:'PENDING',requestedAt:now.toISOString(),requestExpiresAt:new Date(now.getTime()+24*3600_000).toISOString()};
    this.passwordResets(s).unshift(request);this.write(s);this.appendAudit({uid:account.uid,role:'password_reset_request',organizationId:account.organizationId},'PASSWORD_RESET_REQUESTED','PasswordResetRequest',request.id,reviewerRole==='super_admin'?'Request routed to platform owner':reviewerRole==='operator_owner'?'Request routed to operator owner':'Request routed to organization administrator');return request;
  }

  authorizePasswordResetIssue(actor:ServerIdentity,id:string){
    const s=this.read();this.cleanup(s);const request=this.passwordResets(s).find(x=>x.id===id);if(!request)throw new Error('PASSWORD_RESET_REQUEST_NOT_FOUND');
    if(!['PENDING','ISSUED'].includes(request.status))throw new Error(request.status==='EXPIRED'?'PASSWORD_RESET_REQUEST_EXPIRED':'PASSWORD_RESET_REQUEST_NOT_PENDING');
    if(request.reviewerRole==='super_admin'&&actor.role!=='super_admin')throw new Error('PASSWORD_RESET_NOT_ALLOWED');
    if(request.reviewerRole==='operator_owner'&&actor.role!=='operator_owner'&&actor.role!=='super_admin')throw new Error('PASSWORD_RESET_NOT_ALLOWED');
    if(request.reviewerRole==='org_admin'&&!['org_admin','super_admin'].includes(actor.role))throw new Error('PASSWORD_RESET_NOT_ALLOWED');
    if(actor.role==='operator_owner'&&(!actor.operatorId||actor.operatorId!==request.operatorId))throw new Error('PASSWORD_RESET_NOT_ALLOWED');
    if(!['super_admin','operator_owner'].includes(actor.role)&&actor.organizationId!==request.organizationId)throw new Error('PASSWORD_RESET_NOT_ALLOWED');
    return {...request,shareTokenHash:undefined};
  }

  markPasswordResetIssued(actor:ServerIdentity,id:string,shareToken:string,linkExpiresAt:string){
    if(!shareToken||shareToken.length<20)throw new Error('PASSWORD_RESET_TOKEN_INVALID');this.authorizePasswordResetIssue(actor,id);
    const s=this.read();this.cleanup(s);const request=this.passwordResets(s).find(x=>x.id===id);if(!request)throw new Error('PASSWORD_RESET_REQUEST_NOT_FOUND');
    request.status='ISSUED';request.issuedAt=new Date().toISOString();request.issuedBy=actor.uid;request.linkExpiresAt=linkExpiresAt;request.shareTokenHash=hash(shareToken);this.write(s);this.appendAudit({...actor,organizationId:request.organizationId},'PASSWORD_RESET_LINK_ISSUED','PasswordResetRequest',request.id,'One-time reset link issued to administrator for secure handoff');return {...request,shareTokenHash:undefined};
  }

  validatePasswordResetShare(id:string,shareToken:string){
    const s=this.read();this.cleanup(s);this.write(s);const request=this.passwordResets(s).find(x=>x.id===id&&x.status==='ISSUED');if(!request||!request.shareTokenHash||!request.linkExpiresAt||new Date(request.linkExpiresAt).getTime()<=Date.now())throw new Error('PASSWORD_RESET_TOKEN_INVALID');
    const candidate=hash(String(shareToken||''));const a=Buffer.from(candidate);const b=Buffer.from(request.shareTokenHash);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw new Error('PASSWORD_RESET_TOKEN_INVALID');
    return {valid:true,requestId:request.id,displayName:request.displayName,expiresAt:request.linkExpiresAt};
  }

  consumePasswordResetShare(id:string,shareToken:string){
    this.validatePasswordResetShare(id,shareToken);const s=this.read();this.cleanup(s);const request=this.passwordResets(s).find(x=>x.id===id&&x.status==='ISSUED');if(!request)throw new Error('PASSWORD_RESET_TOKEN_INVALID');
    request.status='USED';request.usedAt=new Date().toISOString();delete request.shareTokenHash;this.write(s);this.appendAudit({uid:request.uid,role:'password_reset_user',organizationId:request.organizationId},'PASSWORD_RESET_COMPLETED','PasswordResetRequest',request.id,'User set a new password through one-time administrator-issued link');return {used:true,requestId:request.id};
  }

  audit(actor:ServerIdentity,limit=500){if(!['super_admin','operator_owner','operator_admin','org_admin','comp_admin','auditor'].includes(actor.role))throw new Error('AUDIT_NOT_ALLOWED');const auditFile=this.auditFile(actor.organizationId);if(!fs.existsSync(auditFile))return [] as AuditRow[];const rows=fs.readFileSync(auditFile,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x) as AuditRow);return rows.slice(-Math.max(1,Math.min(5000,limit))).reverse()}
  verifyAudit(organizationId:string){const auditFile=this.auditFile(organizationId);if(!fs.existsSync(auditFile))return {valid:true,count:0,lastHash:'GENESIS'};const rows=fs.readFileSync(auditFile,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x) as AuditRow);let prev='GENESIS';for(let i=0;i<rows.length;i++){const r=rows[i];const base={sequence:r.sequence,timestamp:r.timestamp,organizationId:r.organizationId,actorId:r.actorId,actorRole:r.actorRole,action:r.action,entityType:r.entityType,entityId:r.entityId,reason:r.reason,previousHash:r.previousHash};if(r.organizationId!==organizationId||r.sequence!==i+1||r.previousHash!==prev||r.hash!==hash(`${prev}|${canonical(base)}`))return {valid:false,count:rows.length,failedSequence:r.sequence,lastHash:prev};prev=r.hash}return {valid:true,count:rows.length,lastHash:prev}}
}
