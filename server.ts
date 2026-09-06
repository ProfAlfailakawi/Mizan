import 'dotenv/config';
import express, { type RequestHandler } from 'express';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { QuestionEscrowRepository } from './server/question-escrow';
import { firebaseSecondFactorPresent, verifyFirebaseBaseIdToken, verifyFirebaseIdToken } from './server/firebase-auth';
import { IdentityGovernanceRepository, type GovernanceRole, type ServerIdentity } from './server/identity-governance';
import { ServerAuditLedgerRepository } from './server/audit-ledger';
import { ServerQuranSourceRepository } from './server/quran-source-repository';
import { KFGQPC_OFFICIAL_PACKAGES } from './server/kfgqpc-official-sources';
import { KFGQPC_OFFICIAL_AUDIO } from './server/kfgqpc-official-audio';
import { KFGQPC_DEVELOPER_ASSETS } from './server/kfgqpc-developer-assets';
import { buildKfgqpcOfficialLibrary, kfgqpcLibrarySummary } from './server/kfgqpc-official-library';
import { SecureQuestionRuntimeRepository, ServerQuestionPoolRepository } from './server/secure-question-runtime';
import { buildQuestionPoolFromCertifiedSource } from './server/question-pool-builder';
import { WitnessModeRepository } from './server/witness-mode';
import { ColdVaultRepository } from './server/cold-vault';
import { KfgqpcDeliveryRepository } from './server/kfgqpc-delivery';
import { balancedFairDraw, generativeFairDraw } from './server/kfgqpc-fairdraw-generative';
import { attestResult } from './server/result-attestation';
import { MutashabihatEngine } from './server/quran-mutashabihat';
import { DifficultyEngine } from './server/quran-difficulty';
import { calibrateJudges, normalizedRankScenario, type JudgeScoreObservation } from './server/judge-calibration';
import { deriveAyahTajweed, TAJWEED_SCOPE_NOTE } from './server/quran-tajweed';
import { AlignmentSessionManager } from './server/alignment/session';
import { createAlignmentRouter } from './server/alignment/api';
import { devHafsPassage } from './server/alignment/canonical';
import { ReferenceTemplateBackend } from './server/alignment/acoustic/reference-template';
import { synthReference } from './server/alignment/benchmark/synth';
import { DEFAULT_CONFIG as ALIGN_CONFIG } from './server/alignment/types';
import { QuranIntelligenceService } from './server/quran-intelligence-service';

const b64=(x:string|Uint8Array)=>Buffer.from(x).toString('base64url');
const fromB64=(x:string)=>Buffer.from(x,'base64url').toString('utf8');
const safeEqual=(a:string,b:string)=>{const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const signToken=(payload:Record<string,unknown>,secret:string)=>{const body=b64(JSON.stringify(payload));const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');return `${body}.${sig}`};
const verifyToken=(token:string,secret:string)=>{const [body,sig]=token.split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');if(!safeEqual(sig,expected))return null;try{return JSON.parse(fromB64(body)) as Record<string,unknown>}catch{return null}};

const canonicalStringify=(value:unknown):string=>{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonicalStringify).join(',')}]`;const obj=value as Record<string,unknown>;return `{${Object.keys(obj).sort().map(k=>`${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`;};
const trustSigner=()=>{const pem=process.env.MIZAN_TRUST_SIGNING_PRIVATE_KEY_PEM?.replace(/\n/g,'\n');if(!pem)return null;try{const privateKey=crypto.createPrivateKey(pem);const publicKey=crypto.createPublicKey(privateKey);const spki=publicKey.export({format:'der',type:'spki'}).toString('base64url');const keyId=process.env.MIZAN_TRUST_KEY_ID||`ed25519:${crypto.createHash('sha256').update(spki).digest('hex').slice(0,16)}`;return {privateKey,publicKey,spki,keyId}}catch{return null}};
const safeSegment=(v:string)=>v.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';
  app.disable('x-powered-by'); app.set('trust proxy', 1);
  app.use((req,res,next)=>{
    const requestId=String(req.headers['x-request-id']||crypto.randomUUID()); res.setHeader('x-request-id',requestId);
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy','camera=(self), geolocation=(), microphone=(self)'); res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    if(isProd) res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
    if(isProd) res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  // Per-instance fixed-window rate limiter.
  // HONEST SCOPE: this counter lives in this process's memory. On a horizontally scaled
  // deployment (e.g. Cloud Run with N instances) each instance keeps its own window, so the
  // effective ceiling is N * RATE_LIMIT_MAX and the limiter is a fair-use guard, not a hard
  // global quota. A true global quota requires a shared store (Redis/Memorystore) or the
  // platform's own edge rate limiting. To make that explicit and swappable, the window state
  // goes through a single hook: set MIZAN_RATE_LIMIT_BACKEND=external and front MIZAN with the
  // platform limiter, or replace `hitRateWindow` with a shared-store implementation.
  const rateWindowMs=Number(process.env.RATE_LIMIT_WINDOW_MS||60_000);
  const rateMax=Number(process.env.RATE_LIMIT_MAX||180);
  const rateLimiterIsGlobal=process.env.MIZAN_RATE_LIMIT_BACKEND==='external';
  const buckets=new Map<string,{count:number;resetAt:number}>();
  const hitRateWindow=(key:string,now:number)=>{const current=buckets.get(key);if(!current||current.resetAt<now){const fresh={count:1,resetAt:now+rateWindowMs};buckets.set(key,fresh);return fresh}current.count++;return current};
  // Opportunistic sweep so the map cannot grow unbounded across long-lived instances.
  let lastRateSweep=Date.now();
  app.use('/api',(req,res,next)=>{
    if(rateLimiterIsGlobal)return next();
    const key=String(req.ip||'unknown');const now=Date.now();
    if(now-lastRateSweep>rateWindowMs){for(const [k,v] of buckets)if(v.resetAt<now)buckets.delete(k);lastRateSweep=now}
    const window=hitRateWindow(key,now);
    const remaining=Math.max(0,rateMax-window.count);
    res.setHeader('X-RateLimit-Limit',String(rateMax));
    res.setHeader('X-RateLimit-Remaining',String(remaining));
    res.setHeader('X-RateLimit-Reset',String(Math.ceil(window.resetAt/1000)));
    res.setHeader('X-RateLimit-Scope','per-instance');
    if(window.count>rateMax){res.setHeader('Retry-After',String(Math.max(1,Math.ceil((window.resetAt-now)/1000))));return res.status(429).json({code:'RATE_LIMITED'})}
    next();
  });

  const requireEnterpriseKey:RequestHandler=(req,res,next)=>{const configured=process.env.MIZAN_ENTERPRISE_API_KEY;if(!configured)return res.status(503).json({code:'ENTERPRISE_API_NOT_CONFIGURED'});const supplied=String(req.headers['x-mizan-api-key']||'');if(!safeEqual(supplied,configured))return res.status(401).json({code:'UNAUTHORIZED'});next()};

  const firebaseProjectId=process.env.FIREBASE_PROJECT_ID||'';
  const identityDir=process.env.MIZAN_IDENTITY_GOVERNANCE_DIR||'';let identityGovernance:IdentityGovernanceRepository|null=null;try{if(identityDir)identityGovernance=new IdentityGovernanceRepository(identityDir)}catch(err){console.error('Identity governance disabled:',err)}
  const auditLedgerDir=process.env.MIZAN_AUDIT_LEDGER_DIR||'';let serverAuditLedger:ServerAuditLedgerRepository|null=null;try{if(auditLedgerDir)serverAuditLedger=new ServerAuditLedgerRepository(auditLedgerDir)}catch(err){console.error('Server audit ledger disabled:',err)}
  const identityFromBase=(base:{uid:string;email?:string;raw:Record<string,unknown>}):ServerIdentity|null=>{const managed=identityGovernance?.identityForUid(base.uid);if(managed)return {uid:base.uid,email:base.email,role:managed.grant.role,organizationId:managed.grant.organizationId,competitionId:managed.grant.competitionId};const role=String(base.raw.role||'') as GovernanceRole;const organizationId=String(base.raw.org_id||'');if(!role||!organizationId)return null;return {uid:base.uid,email:base.email,role,organizationId,competitionId:base.raw.competition_id?String(base.raw.competition_id):undefined}};
  const sensitiveIdentityRoles=new Set<string>(['super_admin','org_admin','comp_admin','scientific_admin','head_judge','judge','auditor']);
  const serverMfaRequired=process.env.MIZAN_REQUIRE_MFA_FOR_SENSITIVE!=='false';
  const mfaSatisfied=(base:{raw:Record<string,unknown>},role:string)=>!serverMfaRequired||!sensitiveIdentityRoles.has(role)||firebaseSecondFactorPresent(base.raw);
  const requireFirebaseBase:RequestHandler=async(req,res,next)=>{const raw=String(req.headers.authorization||'');if(!raw.startsWith('Bearer ')||!firebaseProjectId)return res.status(401).json({code:'IDENTITY_REQUIRED'});try{(req as any).firebaseBase=await verifyFirebaseBaseIdToken(raw.slice(7),firebaseProjectId);next()}catch(err){return res.status(401).json({code:'IDENTITY_INVALID',detail:err instanceof Error?err.message:'VERIFY_FAILED'})}};
  const requireGovernanceRoles=(roles:string[]):RequestHandler=>async(req,res,next)=>{const raw=String(req.headers.authorization||'');if(!raw.startsWith('Bearer ')||!firebaseProjectId)return res.status(401).json({code:'IDENTITY_REQUIRED'});try{const base=await verifyFirebaseBaseIdToken(raw.slice(7),firebaseProjectId);const identity=identityFromBase(base);if(!identity)return res.status(403).json({code:'ACCOUNT_NOT_PROVISIONED'});if(!roles.includes(identity.role))return res.status(403).json({code:'ROLE_NOT_ALLOWED'});if(!mfaSatisfied(base,identity.role))return res.status(403).json({code:'MFA_REQUIRED'});(req as any).firebaseBase=base;(req as any).mizanIdentity=identity;next()}catch(err){return res.status(401).json({code:'IDENTITY_INVALID',detail:err instanceof Error?err.message:'VERIFY_FAILED'})}};
  const requireFirebaseRoles=(roles:string[]):RequestHandler=>async(req,res,next)=>{const raw=String(req.headers.authorization||'');if(!raw.startsWith('Bearer ')||!firebaseProjectId)return res.status(401).json({code:'IDENTITY_REQUIRED'});try{const base=await verifyFirebaseBaseIdToken(raw.slice(7),firebaseProjectId);const identity=identityFromBase(base);if(!identity)return res.status(403).json({code:'ACCOUNT_NOT_PROVISIONED'});if(!roles.includes(identity.role))return res.status(403).json({code:'ROLE_NOT_ALLOWED'});if(!mfaSatisfied(base,identity.role))return res.status(403).json({code:'MFA_REQUIRED'});(req as any).firebaseBase=base;(req as any).mizanIdentity=identity;next()}catch(err){return res.status(401).json({code:'IDENTITY_INVALID',detail:err instanceof Error?err.message:'VERIFY_FAILED'})}};
  const escrowDir=process.env.MIZAN_QUESTION_ESCROW_DIR||'';const escrowMasterKey=process.env.MIZAN_QUESTION_ESCROW_MASTER_KEY||'';let questionEscrow:QuestionEscrowRepository|null=null;try{if(escrowDir&&escrowMasterKey)questionEscrow=new QuestionEscrowRepository(escrowDir,escrowMasterKey)}catch(err){console.error('Question escrow disabled:',err)}
  const quranSourceDir=process.env.MIZAN_QURAN_SOURCE_DIR||'';let serverQuranSources:ServerQuranSourceRepository|null=null;try{if(quranSourceDir)serverQuranSources=new ServerQuranSourceRepository(quranSourceDir)}catch(err){console.error('Server Quran source vault disabled:',err)}
  const quranIntelligenceDir=process.env.MIZAN_QURAN_INTELLIGENCE_DIR||(quranSourceDir?path.join(path.dirname(quranSourceDir),'quran-intelligence'):'');let quranIntelligence:QuranIntelligenceService|null=null;try{if(quranIntelligenceDir&&serverQuranSources)quranIntelligence=new QuranIntelligenceService(quranIntelligenceDir,serverQuranSources,{url:process.env.MIZAN_QURAN_ALIGNMENT_URL||'',bearerToken:process.env.MIZAN_QURAN_ALIGNMENT_BEARER_TOKEN||''})}catch(err){console.error('Quran intelligence disabled:',err)}
  const kfgqpcPageImageRoot=process.env.MIZAN_KFGQPC_PAGE_IMAGE_ROOT||'';
  const kfgqpcFontRoot=process.env.MIZAN_KFGQPC_FONT_ROOT||'';
  const kfgqpcAudioRoot=process.env.MIZAN_KFGQPC_AUDIO_ROOT||'';
  const kfgqpcDelivery=new KfgqpcDeliveryRepository({pageRoot:kfgqpcPageImageRoot,fontRoot:kfgqpcFontRoot,audioRoot:kfgqpcAudioRoot,r2BaseUrl:process.env.MIZAN_KFGQPC_R2_DELIVERY_BASE_URL||'',r2BearerToken:process.env.MIZAN_KFGQPC_R2_BEARER_TOKEN||''});
  const questionPoolDir=process.env.MIZAN_SERVER_QUESTION_POOL_DIR||'';let serverQuestionPools:ServerQuestionPoolRepository|null=null;try{if(questionPoolDir)serverQuestionPools=new ServerQuestionPoolRepository(questionPoolDir)}catch(err){console.error('Server question pool disabled:',err)}
  const questionRuntimeDir=process.env.MIZAN_SECURE_QUESTION_RUNTIME_DIR||'';let secureQuestionRuntime:SecureQuestionRuntimeRepository|null=null;try{if(questionRuntimeDir&&serverQuranSources&&serverQuestionPools&&questionEscrow)secureQuestionRuntime=new SecureQuestionRuntimeRepository(questionRuntimeDir,serverQuranSources,serverQuestionPools,questionEscrow)}catch(err){console.error('Secure question runtime disabled:',err)}
  const witnessDir=process.env.MIZAN_WITNESS_MODE_DIR||'';let witnessMode:WitnessModeRepository|null=null;try{if(witnessDir)witnessMode=new WitnessModeRepository(witnessDir)}catch(err){console.error('Witness mode disabled:',err)}
  const coldVaultDir=process.env.MIZAN_COLD_VAULT_DIR||'';let coldVault:ColdVaultRepository|null=null;try{if(coldVaultDir)coldVault=new ColdVaultRepository(coldVaultDir)}catch(err){console.error('Cold vault disabled:',err)}
  const questionEscrowConfigured=!!questionEscrow&&!!process.env.MIZAN_PASS_SIGNING_SECRET&&!!firebaseProjectId;
  const secureQuestionRuntimeConfigured=!!secureQuestionRuntime&&questionEscrowConfigured;
  const escrowFailure=(res:any,err:unknown)=>{const message=err instanceof Error?err.message:'ESCROW_FAILED';const forbidden=/MISMATCH|ASSIGNED_JUDGE|NOT_ALLOWED/.test(message);const missing=/NOT_FOUND/.test(message);const conflict=/NOT_RELEASED|PARTICIPANT_NOT_PRESENT|EXISTS|REVOKED|EXPIRED/.test(message);return res.status(forbidden?403:missing?404:conflict?409:400).json({code:message.split(':')[0]})};

  app.get('/api/health',(_req,res)=>res.json({status:'ok',system:'MIZAN',version:'5.0.0',aiCriticalPath:false,quranSourcePolicy:'approved-vault-only',enterpriseApiConfigured:!!process.env.MIZAN_ENTERPRISE_API_KEY,passSigningConfigured:!!process.env.MIZAN_PASS_SIGNING_SECRET,certificateSigningConfigured:!!process.env.MIZAN_CERT_SIGNING_SECRET,trustSigningConfigured:!!trustSigner(),edgeRelayConfigured:!!process.env.MIZAN_EDGE_DATA_DIR,questionEscrowConfigured,identityGovernanceConfigured:!!identityGovernance,serverAuditLedgerConfigured:!!serverAuditLedger,serverQuranSourceVaultConfigured:!!serverQuranSources,quranIntelligenceConfigured:!!quranIntelligence,quranAlignmentShadowConfigured:!!process.env.MIZAN_QURAN_ALIGNMENT_URL,secureQuestionRuntimeConfigured,time:new Date().toISOString()}));
  app.get('/api/capabilities',(_req,res)=>res.json({judging:{humanAuthority:true,aiCanAffectScore:false},quran:{sourceOfTruth:'approved-vault-only',intelligenceMode:quranIntelligence?'KFGQPC_FAIL_CLOSED':'NOT_CONFIGURED',alignmentMode:'SHADOW_ONLY'},deployment:['cloud','private-cloud','sovereign-on-premise'],externalDependencies:{identity:!!process.env.FIREBASE_PROJECT_ID,enterpriseApi:!!process.env.MIZAN_ENTERPRISE_API_KEY,copilot:!!process.env.MIZAN_COPILOT_URL,integrityAI:!!process.env.MIZAN_AI_INTEGRITY_URL,trustSigning:!!trustSigner(),edgeRelay:!!process.env.MIZAN_EDGE_DATA_DIR,questionEscrow:questionEscrowConfigured,identityGovernance:!!identityGovernance,serverAuditLedger:!!serverAuditLedger,serverQuranSourceVault:!!serverQuranSources,quranIntelligence:!!quranIntelligence,quranAlignmentShadowBackend:!!process.env.MIZAN_QURAN_ALIGNMENT_URL,serverFairDraw:secureQuestionRuntimeConfigured,serverQuranResolution:secureQuestionRuntimeConfigured,silentQuestionCapsule:secureQuestionRuntimeConfigured,officialMushafPageAssets:!!kfgqpcPageImageRoot,officialQuranFonts:!!kfgqpcFontRoot,witnessMode:!!witnessMode,coldVault:!!coldVault,exposureRadius:secureQuestionRuntimeConfigured,questionLeakageCanary:questionEscrowConfigured}}));

  // Named-account identity governance. MIZAN stores no passwords; a verified Firebase identity is bound once to a scoped MIZAN invitation.
  app.get('/api/identity/me',requireFirebaseBase,(req,res)=>{const base=(req as any).firebaseBase as {uid:string;email?:string;raw:Record<string,unknown>};const managed=identityGovernance?.identityForUid(base.uid)||null;const identity=identityFromBase(base);if(!identity)return res.status(404).json({code:'ACCOUNT_NOT_PROVISIONED'});if(!mfaSatisfied(base,identity.role))return res.status(403).json({code:'MFA_REQUIRED'});let session:any=undefined;if(identityGovernance&&managed){const deviceId=String(req.headers['x-mizan-device-id']||'');if(deviceId){try{session=identityGovernance.openSession(identity,deviceId,String(req.headers['x-mizan-device-name']||''),firebaseSecondFactorPresent(base.raw)?'MFA':'SINGLE_FACTOR')}catch(err){const code=err instanceof Error?err.message:'SESSION_FAILED';if(code==='PRIVILEGED_SESSION_CONFLICT')return res.status(409).json({code});return res.status(400).json({code})}}}res.json({identity,session,managed:!!managed});});
  app.post('/api/identity/activate',requireFirebaseBase,(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});const base=(req as any).firebaseBase as {uid:string;email?:string};try{const result=identityGovernance.activate(base,String(req.body?.activationToken||''));res.status(201).json(result)}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'ACTIVATION_FAILED'})}});
  app.get('/api/identity/governance',requireGovernanceRoles(['super_admin','org_admin','comp_admin','auditor']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.list((req as any).mizanIdentity))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'IDENTITY_LIST_FAILED'})}});
  app.post('/api/identity/invitations',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.status(201).json(identityGovernance.createInvitation((req as any).mizanIdentity,{email:String(req.body?.email||''),displayName:String(req.body?.displayName||''),requestedRole:String(req.body?.requestedRole||'') as GovernanceRole,competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,committeeId:req.body?.committeeId?String(req.body.committeeId):undefined,reason:String(req.body?.reason||'')}))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'INVITATION_FAILED'})}});
  app.post('/api/identity/invitations/:id/approve',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.approveInvitation((req as any).mizanIdentity,String(req.params.id)))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'APPROVAL_FAILED'})}});
  app.post('/api/identity/accounts/:id/suspend',requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.suspend((req as any).mizanIdentity,String(req.params.id),String(req.body?.reason||'')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'SUSPEND_FAILED'})}});
  app.post('/api/identity/accounts/:id/revoke-sessions',requireGovernanceRoles(['super_admin','org_admin','comp_admin','head_judge']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.revokeSessions((req as any).mizanIdentity,String(req.params.id),String(req.body?.reason||'')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'SESSION_REVOKE_FAILED'})}});
  app.get('/api/identity/audit',requireGovernanceRoles(['super_admin','org_admin','comp_admin','auditor']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json({rows:identityGovernance.audit((req as any).mizanIdentity,Number(req.query.limit||500)),verification:identityGovernance.verifyAudit((req as any).mizanIdentity.organizationId)})}catch(err){res.status(400).json({code:err instanceof Error?err.message:'AUDIT_FAILED'})}});

  // High-value competition evidence ledger. Actor identity/role and server time come from the verified server context, never from the browser payload.
  const auditWriterRoles=['super_admin','org_admin','comp_admin','scientific_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator','auditor','support_agent'];
  app.post('/api/audit/events',requireGovernanceRoles(auditWriterRoles),(req,res)=>{if(!serverAuditLedger)return res.status(503).json({code:'AUDIT_LEDGER_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;const b=req.body||{};try{const out=serverAuditLedger.append(actor,{eventId:String(b.eventId||''),organizationId:String(b.organizationId||''),competitionId:String(b.competitionId||''),action:String(b.action||''),entityType:String(b.entityType||''),entityId:String(b.entityId||''),reason:b.reason?String(b.reason).slice(0,2000):undefined,humanSummaryEnglish:b.humanSummaryEnglish?String(b.humanSummaryEnglish).slice(0,2000):undefined,clientTimestamp:b.clientTimestamp?String(b.clientTimestamp):undefined,sessionId:b.sessionId?String(b.sessionId):undefined,authenticationAssurance:b.authenticationAssurance?String(b.authenticationAssurance):undefined,deviceId:String(req.headers['x-mizan-device-id']||b.deviceId||'').slice(0,200),requestId:String(req.headers['x-request-id']||b.requestId||'').slice(0,200)});res.status(out.idempotent?200:201).json({accepted:true,idempotent:out.idempotent,sequence:out.row.sequence,serverTimestamp:out.row.serverTimestamp,hash:out.row.hash})}catch(err){res.status(400).json({code:err instanceof Error?err.message:'AUDIT_APPEND_FAILED'})}});
  app.get('/api/audit/ledger',requireGovernanceRoles(['super_admin','org_admin','comp_admin','auditor']),(req,res)=>{if(!serverAuditLedger)return res.status(503).json({code:'AUDIT_LEDGER_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;const competitionId=String(req.query.competitionId||actor.competitionId||'');if(!competitionId)return res.status(400).json({code:'COMPETITION_REQUIRED'});try{res.json({rows:serverAuditLedger.list(actor,competitionId,Number(req.query.limit||500)),verification:serverAuditLedger.verify(actor.organizationId,competitionId)})}catch(err){res.status(400).json({code:err instanceof Error?err.message:'AUDIT_READ_FAILED'})}});


  // Server-held Question Escrow. Question plaintext never needs to exist on a JudgeOS device before presence + quorum.
  // KFGQPC is a primary official authority. Concrete package bytes remain hash-bound and dual-reviewed.
  app.get('/api/science/quran/kfgqpc/catalog',requireGovernanceRoles(['scientific_admin','org_admin','comp_admin','auditor']),(req,res)=>{const catalog=serverQuranSources?serverQuranSources.catalog():KFGQPC_OFFICIAL_PACKAGES.map(x=>({...x,localState:'VAULT_NOT_CONFIGURED'}));res.json({authority:'مجمع الملك فهد لطباعة المصحف الشريف',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',officialCertification:'CERTIFIED',localUsePolicy:'DIRECT_AFTER_OFFICIAL_CHECKSUM_AND_STRUCTURE',catalog})});
  app.get('/api/science/quran/kfgqpc/audio-catalog',requireGovernanceRoles(['scientific_admin','org_admin','comp_admin','auditor']),(req,res)=>res.json({authority:'مجمع الملك فهد لطباعة المصحف الشريف',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',catalog:KFGQPC_OFFICIAL_AUDIO,note:'KFGQPC published recordings are accepted as official reference sources. Operational playback remains bound to the exact ingested asset, hash and reading scope.'}));
  app.get('/api/science/quran/kfgqpc/developer-assets',requireGovernanceRoles(['scientific_admin','org_admin','comp_admin','auditor']),(req,res)=>res.json({authority:'مجمع الملك فهد لطباعة المصحف الشريف',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',officialCertification:'CERTIFIED',quranPackages:KFGQPC_OFFICIAL_PACKAGES,additionalAssets:KFGQPC_DEVELOPER_ASSETS}));
  app.get('/api/science/quran/kfgqpc/library',requireGovernanceRoles(['scientific_admin','org_admin','comp_admin','head_judge','auditor']),(req,res)=>{const state=serverQuranSources?(id:string)=>serverQuranSources!.localState(id):undefined;res.json({summary:kfgqpcLibrarySummary(state),items:buildKfgqpcOfficialLibrary(state)});});
  const sendKfgqpcAsset=async(res:any,asset:any,cacheControl:string)=>{if(!asset)return false;res.setHeader('Cache-Control',cacheControl);res.setHeader('X-MIZAN-Source-Authority','KFGQPC');res.setHeader('X-MIZAN-Delivery-Source',asset.source);res.type(asset.type||'application/octet-stream');if(asset.file){res.sendFile(asset.file);return true}if(asset.response){const bytes=Buffer.from(await asset.response.arrayBuffer());res.send(bytes);return true}return false};
  app.get('/api/science/quran/kfgqpc/delivery-status',requireGovernanceRoles(['scientific_admin','org_admin','comp_admin','head_judge','auditor']),(req,res)=>res.json(kfgqpcDelivery.status()));
  app.get('/api/science/quran/kfgqpc/page/:packageId/:page',requireGovernanceRoles(['scientific_admin','org_admin','comp_admin','head_judge','judge','auditor']),async(req,res)=>{const packageId=safeSegment(String(req.params.packageId||'')),page=Number(req.params.page);if(!Number.isInteger(page)||page<1||page>700)return res.status(400).json({code:'MUSHAF_PAGE_INVALID'});try{const asset=await kfgqpcDelivery.page(packageId,page);if(await sendKfgqpcAsset(res,asset,'private, max-age=3600'))return;return res.status(404).json({code:'OFFICIAL_MUSHAF_PAGE_ASSET_NOT_INGESTED'})}catch{return res.status(502).json({code:'OFFICIAL_MUSHAF_PAGE_DELIVERY_FAILED'})}});
  // Public Mushaf page surface. Consistent with the existing public font and public ayah-audio
  // routes: the printed Madinah page is publicly published Quran content, not competition data.
  // Question secrecy is enforced by the FairDraw/escrow reveal flow, not by hiding the Mushaf.
  app.get('/api/public/kfgqpc/page/:packageId/:page',async(req,res)=>{const packageId=safeSegment(String(req.params.packageId||'')),page=Number(req.params.page);
    if(!Number.isInteger(page)||page<1||page>604)return res.status(400).json({code:'MUSHAF_PAGE_INVALID'});
    try{const asset=await kfgqpcDelivery.page(packageId,page);if(await sendKfgqpcAsset(res,asset,'public, max-age=86400, immutable'))return;
      return res.status(404).json({code:'OFFICIAL_MUSHAF_PAGE_ASSET_NOT_INGESTED'})}catch{return res.status(502).json({code:'OFFICIAL_MUSHAF_PAGE_DELIVERY_FAILED'})}});

  app.get('/api/public/kfgqpc/font/:fontId',async(req,res)=>{try{const asset=await kfgqpcDelivery.font(safeSegment(String(req.params.fontId||'primary')));if(await sendKfgqpcAsset(res,asset,'public, max-age=86400, immutable'))return;return res.status(404).end()}catch{return res.status(502).end()}});
  app.get('/api/public/kfgqpc/audio/:readingId/:surah/:ayah',async(req,res)=>{const readingId=safeSegment(String(req.params.readingId||'')),surah=Number(req.params.surah),ayah=Number(req.params.ayah);try{const asset=await kfgqpcDelivery.ayahAudio(readingId,surah,ayah);if(await sendKfgqpcAsset(res,asset,'public, max-age=86400, immutable'))return;return res.status(404).json({code:'OFFICIAL_AUDIO_AYAH_NOT_INGESTED'})}catch{return res.status(502).json({code:'OFFICIAL_AUDIO_DELIVERY_FAILED'})}});
  /* طبقة تخطيط الكلمة: إثراء بصري لعدسة الكلمة فوق الصفحة الرسمية. غيابها لا يعطّل شيئًا،
     فتُعاد 204 بدل خطأ، وتبقى عدسة السطر عاملة عند العميل. */
  app.get('/api/public/kfgqpc/mushaf-layout/:page',async(req,res)=>{const page=Number(req.params.page);
    if(!Number.isInteger(page)||page<1||page>604)return res.status(400).json({code:'MUSHAF_PAGE_INVALID'});
    try{const layout=await kfgqpcDelivery.mushafLayout(page);
      if(!layout)return res.status(204).end();
      res.setHeader('Cache-Control','public, max-age=86400, immutable');res.setHeader('X-MIZAN-Source-Authority','KFGQPC');
      return res.json(layout)}catch{return res.status(502).json({code:'MUSHAF_LAYOUT_DELIVERY_FAILED'})}});

  // Delivery-layer Quran text + generative FairDraw.
  // These read ONLY the requested reading's delivery package (no cross-riwayah fallback) and are
  // explicitly labelled DELIVERY_OPEN_MIRROR: they support display and drawing, and never replace
  // the certified Source Vault for official scoring provenance.
  app.get('/api/public/kfgqpc/passage/:readingId/:surah/:startAyah/:endAyah',async(req,res)=>{
    const readingId=safeSegment(String(req.params.readingId||''));
    const surah=Number(req.params.surah),startAyah=Number(req.params.startAyah),endAyah=Number(req.params.endAyah);
    try{const passage=await kfgqpcDelivery.passage(readingId,surah,startAyah,endAyah);
      if(!passage)return res.status(404).json({code:'OFFICIAL_PASSAGE_NOT_DELIVERED'});
      // Tajweed is derived from each ayah's own text, so the marks land on the very letters in
      // front of the reciter rather than on offsets computed against a different text.
      const withTajweed={...passage,ayat:passage.ayat.map(a=>({...a,tajweed:deriveAyahTajweed(a.text)})),tajweedScopeNote:TAJWEED_SCOPE_NOTE};
      /* The Quran text never changes, but the shape of this payload can — tajweed was added to it
         after clients had already cached an hour-long copy, so the new layer stayed invisible to
         anyone who had opened the passage before. A short window with revalidation keeps the
         bandwidth saving while letting a schema change reach a judge on their next request. */
      res.setHeader('Cache-Control','public, max-age=300, must-revalidate');res.setHeader('X-MIZAN-Source-Authority','KFGQPC');
      return res.json(withTajweed)}catch{return res.status(502).json({code:'OFFICIAL_PASSAGE_DELIVERY_FAILED'})}});

  app.get('/api/public/kfgqpc/fairdraw/:readingId',async(req,res)=>{
    const readingId=safeSegment(String(req.params.readingId||'hafs'));
    const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>0?Math.floor(n):undefined};
    try{const out=await generativeFairDraw(kfgqpcDelivery,{reading:readingId,seed:req.query.seed?String(req.query.seed):undefined,
        anchor:req.query.anchor?String(req.query.anchor) as any:undefined,ayahCount:num(req.query.ayahCount),
        juz:num(req.query.juz),surah:num(req.query.surah),minAyahCount:num(req.query.min),maxAyahCount:num(req.query.max)});
      if(!out)return res.status(404).json({code:'FAIRDRAW_SOURCE_NOT_DELIVERED'});
      // Attach the measured cognitive load of the drawn passage so panels can see — and later
      // equalise — how heavy a draw actually is, instead of assuming randomness means fairness.
      let difficulty:unknown=undefined;
      try{const a=await analysisFor(readingId);if(a)difficulty=a.difficulty.vector(out.passage.surah,out.passage.startAyah,out.passage.endAyah)}catch{}
      res.setHeader('Cache-Control','no-store');return res.json({...out,difficulty})}
    catch{return res.status(502).json({code:'FAIRDRAW_FAILED'})}});

  /* السحب المتوازن لدفعة متسابقين: مقطع مختلف لكل واحد بصعوبة متكافئة مقيسة.
     الإسناد ذاته سرٌّ تشغيلي (يكشف مقطع كل متسابق)، فهو خلف أدوار السحب لا عام. */
  app.post('/api/quran/fairdraw/balanced',requireGovernanceRoles(['comp_admin','org_admin','head_judge','scientific_admin']),async(req,res)=>{
    const readingId=safeSegment(String(req.body?.reading||'hafs'));
    const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>0?Math.floor(n):undefined};
    try{const a=await analysisFor(readingId);if(!a)return res.status(404).json({code:'READING_NOT_DELIVERED'});
      const out=await balancedFairDraw(kfgqpcDelivery,a.difficulty,{reading:readingId,
        contestants:Number(req.body?.contestants),seed:req.body?.seed?String(req.body.seed):undefined,
        anchor:req.body?.anchor?String(req.body.anchor) as any:undefined,ayahCount:num(req.body?.ayahCount),
        juz:num(req.body?.juz),surah:num(req.body?.surah),minAyahCount:num(req.body?.min),maxAyahCount:num(req.body?.max),
        oversample:num(req.body?.oversample),toleranceRatio:Number.isFinite(Number(req.body?.tolerance))?Number(req.body.tolerance):undefined});
      if(!out)return res.status(422).json({code:'FAIRDRAW_BALANCED_POOL_INSUFFICIENT'});
      res.setHeader('Cache-Control','no-store');return res.json(out)}
    catch{return res.status(502).json({code:'FAIRDRAW_BALANCED_FAILED'})}});

  /*
   * Mutashabihat radar + difficulty vector.
   *
   * Both are derived from the delivery text of the requested reading and are cached per reading
   * (the index build is O(words) and would otherwise repeat on every request). They are analysis
   * surfaces for the head judge and the draw: they never mark an error and never touch a score.
   */
  const analysisCache=new Map<string,{mutashabihat:MutashabihatEngine;difficulty:DifficultyEngine;names:Map<number,string>}>();
  const analysisFor=async(readingId:string)=>{
    const cached=analysisCache.get(readingId);if(cached)return cached;
    const rows=await kfgqpcDelivery.quranData(readingId);if(!rows)return null;
    const mutashabihat=new MutashabihatEngine(rows);
    const difficulty=new DifficultyEngine(rows,mutashabihat);
    const names=new Map<number,string>();for(const r of rows){const s=Number(r.sora);if(!names.has(s)&&r.sora_name_ar)names.set(s,String(r.sora_name_ar))}
    const entry={mutashabihat,difficulty,names};analysisCache.set(readingId,entry);return entry;
  };

  app.get('/api/public/kfgqpc/mutashabihat/:readingId/:surah/:ayah',async(req,res)=>{
    const readingId=safeSegment(String(req.params.readingId||'')),surah=Number(req.params.surah),ayah=Number(req.params.ayah);
    try{const a=await analysisFor(readingId);if(!a)return res.status(404).json({code:'READING_NOT_DELIVERED'});
      const matches=a.mutashabihat.similarPhrasesForAyah(surah,ayah).map(m=>({...m,occurrences:m.occurrences.map(o=>({...o,surahNameArabic:a.names.get(o.surah)}))}));
      res.setHeader('Cache-Control','public, max-age=300, must-revalidate');
      return res.json({reading:readingId,surah,ayah,matches,note:'وقائع نصية معدودة من حزمة الرواية نفسها؛ لا نِسَب احتمالية ولا حكم على المتسابق.'})}
    catch{return res.status(502).json({code:'MUTASHABIHAT_FAILED'})}});

  app.get('/api/public/kfgqpc/divergence/:readingId/:surah/:startAyah/:endAyah',async(req,res)=>{
    const readingId=safeSegment(String(req.params.readingId||''));
    const surah=Number(req.params.surah),startAyah=Number(req.params.startAyah),endAyah=Number(req.params.endAyah);
    try{const a=await analysisFor(readingId);if(!a)return res.status(404).json({code:'READING_NOT_DELIVERED'});
      const points=a.mutashabihat.divergencePoints(surah,startAyah,endAyah,{nameOf:(s)=>a.names.get(s)});
      res.setHeader('Cache-Control','public, max-age=300, must-revalidate');
      return res.json({reading:readingId,surah,startAyah,endAyah,points,note:'مفترقات نصية حقيقية تُعرض قبل بلوغها؛ تنبيه لرئيس التحكيم لا رصد خطأ.'})}
    catch{return res.status(502).json({code:'DIVERGENCE_FAILED'})}});

  app.get('/api/public/kfgqpc/difficulty/:readingId/:surah/:startAyah/:endAyah',async(req,res)=>{
    const readingId=safeSegment(String(req.params.readingId||''));
    const surah=Number(req.params.surah),startAyah=Number(req.params.startAyah),endAyah=Number(req.params.endAyah);
    try{const a=await analysisFor(readingId);if(!a)return res.status(404).json({code:'READING_NOT_DELIVERED'});
      res.setHeader('Cache-Control','public, max-age=300, must-revalidate');
      return res.json({reading:readingId,surah,startAyah,endAyah,vector:a.difficulty.vector(surah,startAyah,endAyah)})}
    catch{return res.status(502).json({code:'DIFFICULTY_FAILED'})}});

  /*
   * Judge calibration — advisory only.
   *
   * Head-judge scoped: it reports how far each judge sits from their peers on the same
   * participants, shrunk toward "balanced" so a judge with few sessions is never labelled from a
   * thin sample. It returns a comparison scenario alongside the real ranking; it never rewrites a
   * human score and never re-ranks results on its own.
   */
  /*
   * شهادة الخادم على نتيجة: يعيد الاحتساب من إرسالات المحكمين الخام ويقارنه بالمُدّعى.
   * لا يكتب نتيجة ولا يغيّرها — يشهد فقط، ويُسجَّل حكمه في سجلّ التدقيق الخادمي ليُراجَع لاحقًا.
   */
  app.post('/api/results/attest',requireGovernanceRoles(['comp_admin','org_admin','head_judge','auditor','scientific_admin']),(req,res)=>{
    const actor=(req as any).mizanIdentity as ServerIdentity;const body=req.body||{};
    const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:undefined};
    try{
      const attestation=attestResult({
        competitionId:String(body.competitionId||actor.competitionId||''),
        participantId:String(body.participantId||''),
        resultId:body.resultId?String(body.resultId):undefined,
        claim:{finalScore:Number(body.claim?.finalScore),criterionScores:body.claim?.criterionScores&&typeof body.claim.criterionScores==='object'?body.claim.criterionScores:undefined,penaltyCount:num(body.claim?.penaltyCount)},
        submissions:Array.isArray(body.submissions)?body.submissions.slice(0,64):[],
        criteria:Array.isArray(body.criteria)?body.criteria.slice(0,64):[],
        mode:String(body.mode||'all_judges_all_criteria'),
        dropExtremes:!!body.dropExtremes,
        sessionEventCount:num(body.sessionEventCount)||0,
      });
      serverAuditLedger?.append(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId:attestation.competitionId,action:'RESULT_ATTESTED',entityType:'Result',entityId:attestation.resultId||attestation.participantId,reason:`Server recomputation ${attestation.verdict}${attestation.reason?` (${attestation.reason})`:''}`,requestId:String(req.headers['x-request-id']||'')});
      res.setHeader('Cache-Control','no-store');
      return res.status(attestation.verdict==='DISAGREES'?409:200).json(attestation);
    }catch{return res.status(400).json({code:'RESULT_ATTESTATION_FAILED'})}});

  app.post('/api/judging/calibration',requireGovernanceRoles(['head_judge','comp_admin','org_admin','auditor','scientific_admin']),(req,res)=>{
    const raw=Array.isArray(req.body?.observations)?req.body.observations:[];
    if(!raw.length)return res.status(400).json({code:'OBSERVATIONS_REQUIRED'});
    const observations:JudgeScoreObservation[]=raw.slice(0,20000).map((o:any)=>({judgeId:String(o.judgeId||''),judgeName:o.judgeName?String(o.judgeName):undefined,
      sessionId:String(o.sessionId||''),participantId:String(o.participantId||''),criterionId:o.criterionId?String(o.criterionId):undefined,
      score:Number(o.score),submittedAtMs:o.submittedAtMs?Number(o.submittedAtMs):undefined,participantCountry:o.participantCountry?String(o.participantCountry):undefined}))
      .filter((o:JudgeScoreObservation)=>o.judgeId&&o.participantId&&Number.isFinite(o.score));
    if(!observations.length)return res.status(400).json({code:'OBSERVATIONS_INVALID'});
    const calibration=calibrateJudges(observations);
    res.setHeader('Cache-Control','no-store');
    return res.json({calibration,rankScenario:normalizedRankScenario(observations,calibration)});
  });

  app.post('/api/enterprise/science/quran/kfgqpc/ingest',requireEnterpriseKey,(req,res)=>{if(!serverQuranSources)return res.status(503).json({code:'SERVER_QURAN_SOURCE_VAULT_NOT_CONFIGURED'});try{const manifest=serverQuranSources.ingestOfficial({packageId:String(req.body?.packageId||''),bundlePath:String(req.body?.bundlePath||''),dataPath:String(req.body?.dataPath||''),ingestedBy:String(req.body?.ingestedBy||'enterprise-import')});let waqf:unknown=null;try{waqf=quranIntelligence?.deriveOfficialWaqfForPackage(manifest.packageId)||null}catch(waqfErr){waqf={status:'DERIVATION_FAILED',code:waqfErr instanceof Error?waqfErr.message:'WAQF_DERIVATION_FAILED'}}res.status(201).json({ingested:true,manifest,waqf})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'QURAN_SOURCE_INGEST_FAILED'})}});
  app.post('/api/science/quran/kfgqpc/:packageId/approve',requireGovernanceRoles(['scientific_admin']),(req,res)=>{if(!serverQuranSources)return res.status(503).json({code:'SERVER_QURAN_SOURCE_VAULT_NOT_CONFIGURED'});try{return res.json({manifest:serverQuranSources.approve(String(req.params.packageId),(req as any).mizanIdentity.uid)})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QURAN_SOURCE_APPROVAL_FAILED'})}});
  app.post('/api/science/quran/kfgqpc/:packageId/revoke',requireGovernanceRoles(['scientific_admin']),(req,res)=>{if(!serverQuranSources)return res.status(503).json({code:'SERVER_QURAN_SOURCE_VAULT_NOT_CONFIGURED'});try{return res.json({manifest:serverQuranSources.revoke(String(req.params.packageId),String(req.body?.reason||'Scientific revocation'))})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QURAN_SOURCE_REVOCATION_FAILED'})}});

  // Quran Intelligence is fail-closed and reading-isolated. These endpoints never substitute one
  // riwayah for another, never expose private R2 URLs, and never write a judge score.
  const quranIntelligenceFailure=(res:any,err:unknown)=>{const code=err instanceof Error?err.message:'QURAN_INTELLIGENCE_FAILED';const status=code.includes('NOT_FOUND')?404:code.includes('NOT_CONFIGURED')||code.includes('NOT_INGESTED')||code.includes('NOT_CERTIFIED')?503:code.includes('QUARANTINED')||code.includes('MISMATCH')||code.includes('NOT_APPROVED')?409:400;return res.status(status).json({code})};
  const quranReaderRoles=['scientific_admin','org_admin','comp_admin','head_judge','judge','auditor'];
  app.get('/api/quran/intelligence/capabilities',requireGovernanceRoles(quranReaderRoles),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});return res.json(quranIntelligence.capabilities())});
  app.get('/api/quran/intelligence/status',requireGovernanceRoles(['scientific_admin','org_admin','comp_admin','head_judge','auditor']),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});return res.json({readings:quranIntelligence.status()})});
  app.get('/api/quran/intelligence/readiness',requireGovernanceRoles(['scientific_admin','org_admin','comp_admin','head_judge','auditor']),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});return res.json({protocol:'MIZAN-QURAN-READINESS-1',authority:'KFGQPC',readings:quranIntelligence.readiness()})});
  app.get('/api/quran/intelligence/health',requireGovernanceRoles(['scientific_admin','org_admin','comp_admin','head_judge','auditor']),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});res.setHeader('Cache-Control','no-store');return res.json(quranIntelligence.health())});
  app.get('/api/quran/intelligence/reading-guard/:reading/:sourcePackageId',requireGovernanceRoles(quranReaderRoles),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});try{return res.json(quranIntelligence.readingGuard({reading:String(req.params.reading),sourcePackageId:String(req.params.sourcePackageId)}))}catch(err){return quranIntelligenceFailure(res,err)}});
  app.get('/api/quran/location/:reading/:surah/:ayah',requireGovernanceRoles(quranReaderRoles),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});try{const x=quranIntelligence.location(String(req.params.reading),req.params.surah,req.params.ayah);return res.json({reading:x.reading,surah:x.surah,ayah:x.ayah,page:x.page,lineStart:x.lineStart,lineEnd:x.lineEnd,loci:x.loci,sourcePackage:x.sourcePackage,sourceVersion:x.sourceVersion,sourceAuthority:x.sourceAuthority,checksum:x.checksum,verifiedAt:x.verifiedAt,assurance:x.assurance})}catch(err){return quranIntelligenceFailure(res,err)}});
  app.get('/api/quran/passage/:reading/:surah/:startAyah/:endAyah',requireGovernanceRoles(quranReaderRoles),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});try{return res.json(quranIntelligence.passage({reading:String(req.params.reading),surah:req.params.surah,startAyah:req.params.startAyah,endAyah:req.params.endAyah}))}catch(err){return quranIntelligenceFailure(res,err)}});
  app.get('/api/quran/waqf/:reading/:surah/:ayah',requireGovernanceRoles(quranReaderRoles),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});try{const p=quranIntelligence.passage({reading:String(req.params.reading),surah:req.params.surah,startAyah:req.params.ayah,endAyah:req.params.ayah});return res.json({reading:p.reading,surah:p.surah,ayah:p.startAyah,status:p.knowledge.waqf,occurrences:p.ayahs[0]?.waqf||[]})}catch(err){return quranIntelligenceFailure(res,err)}});
  app.get('/api/quran/tajweed/:reading/:surah/:ayah',requireGovernanceRoles(quranReaderRoles),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});try{const p=quranIntelligence.passage({reading:String(req.params.reading),surah:req.params.surah,startAyah:req.params.ayah,endAyah:req.params.ayah});return res.json({reading:p.reading,surah:p.surah,ayah:p.startAyah,status:p.knowledge.tajweed,...(p.ayahs[0]?.tajweed||{rules:[],occurrences:[]})})}catch(err){return quranIntelligenceFailure(res,err)}});
  app.post('/api/enterprise/quran/intelligence/vector',requireEnterpriseKey,(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});try{return res.status(201).json({registered:true,summary:quranIntelligence.registerVector(req.body)})}catch(err){return quranIntelligenceFailure(res,err)}});
  app.post('/api/enterprise/quran/intelligence/waqf',requireEnterpriseKey,(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});try{return res.status(201).json({registered:true,summary:quranIntelligence.registerWaqf(req.body)})}catch(err){return quranIntelligenceFailure(res,err)}});
  app.post('/api/enterprise/quran/intelligence/waqf-science',requireEnterpriseKey,(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});try{return res.status(201).json({registered:true,summary:quranIntelligence.registerWaqfScience(req.body)})}catch(err){return quranIntelligenceFailure(res,err)}});
  app.post('/api/enterprise/quran/intelligence/waqf/derive/:reading',requireEnterpriseKey,(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});try{return res.status(201).json({derived:true,...quranIntelligence.deriveOfficialWaqf(String(req.params.reading))})}catch(err){return quranIntelligenceFailure(res,err)}});
  app.post('/api/enterprise/quran/intelligence/tajweed',requireEnterpriseKey,(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});try{return res.status(201).json({registered:true,summary:quranIntelligence.registerTajweed(req.body)})}catch(err){return quranIntelligenceFailure(res,err)}});
  app.post('/api/enterprise/quran/alignment/benchmark',requireEnterpriseKey,(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});try{return res.status(201).json({registered:true,result:quranIntelligence.registerBenchmark(req.body)})}catch(err){return quranIntelligenceFailure(res,err)}});
  app.post('/api/quran/alignment/shadow/audio',requireGovernanceRoles(['judge','head_judge','scientific_admin']),express.raw({type:['audio/*','application/octet-stream'],limit:'2mb'}),async(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;try{const out=await quranIntelligence.processAlignmentChunk({actorId:actor.uid,sessionId:String(req.query.sessionId||''),reading:String(req.query.reading||''),surah:req.query.surah,startAyah:req.query.startAyah,endAyah:req.query.endAyah,sourcePackageId:String(req.query.sourcePackageId||''),contentType:String(req.headers['content-type']||'application/octet-stream'),bytes:Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0)});res.setHeader('Cache-Control','no-store');return res.json(out)}catch(err){return quranIntelligenceFailure(res,err)}});
  app.get('/api/quran/alignment/shadow/session/:sessionId',requireGovernanceRoles(['judge','head_judge','scientific_admin','auditor']),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;try{res.setHeader('Cache-Control','no-store');return res.json(quranIntelligence.sessionEvidence(actor.uid,String(req.params.sessionId||'')))}catch(err){return quranIntelligenceFailure(res,err)}});
  app.post('/api/quran/alignment/shadow/session/:sessionId/human-marker',requireGovernanceRoles(['judge','head_judge']),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;try{return res.json(quranIntelligence.markHumanEvent(actor.uid,String(req.params.sessionId||''),String(req.body?.eventType||'')))}catch(err){return quranIntelligenceFailure(res,err)}});
  app.post('/api/quran/alignment/shadow/reset',requireGovernanceRoles(['judge','head_judge','scientific_admin']),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;quranIntelligence.resetAlignment(actor.uid,String(req.body?.sessionId||''));return res.json({reset:true,mode:'SHADOW_ONLY',scoreAuthority:'HUMAN_ONLY'})});

  // Production question pools are server-held. The browser never submits question plaintext.
  app.post('/api/enterprise/question-runtime/pools/:competitionId/:poolId/generate-from-certified-source',requireEnterpriseKey,(req,res)=>{if(!serverQuranSources||!serverQuestionPools)return res.status(503).json({code:'SERVER_QUESTION_POOL_SOURCE_NOT_CONFIGURED'});try{const body=req.body||{},poolId=String(req.params.poolId),report=buildQuestionPoolFromCertifiedSource({quran:serverQuranSources,packageId:String(body.sourcePackageId||''),poolId,allowedJuz:Array.isArray(body.allowedJuz)?body.allowedJuz.map(Number):[],passageAyahCount:Number(body.passageAyahCount||3),expectedParticipantCount:body.expectedParticipantCount===undefined?undefined:Number(body.expectedParticipantCount),questionsPerParticipant:body.questionsPerParticipant===undefined?undefined:Number(body.questionsPerParticipant),difficultyByLocus:body.difficultyByLocus&&typeof body.difficultyByLocus==='object'?body.difficultyByLocus:undefined,scientificallyApprovedStartLoci:Array.isArray(body.scientificallyApprovedStartLoci)?body.scientificallyApprovedStartLoci.map(String):undefined});if(body.requireFullFieldUniqueCoverage===true&&!report.fullFieldUniqueCoverage)return res.status(409).json({code:'QUESTION_POOL_UNIQUE_CAPACITY_INSUFFICIENT',uniqueStartLoci:report.uniqueStartLoci,requiredUniqueLoci:report.requiredUniqueLoci});const saved=serverQuestionPools.save(String(req.params.competitionId),poolId,report.items);const {items,...summary}=report;return res.status(201).json({saved,report:summary})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_POOL_GENERATION_FAILED'})}});
  app.post('/api/enterprise/question-runtime/pools/:competitionId/:poolId',requireEnterpriseKey,(req,res)=>{if(!serverQuestionPools)return res.status(503).json({code:'SERVER_QUESTION_POOL_NOT_CONFIGURED'});try{return res.status(201).json(serverQuestionPools.save(String(req.params.competitionId),String(req.params.poolId),Array.isArray(req.body?.items)?req.body.items:[]))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'SERVER_QUESTION_POOL_SAVE_FAILED'})}});
  app.post('/api/enterprise/question-runtime/provision',requireEnterpriseKey,(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const body=req.body||{};const runtime=secureQuestionRuntime.provision({organizationId:String(body.organizationId||''),competitionId:String(body.competitionId||''),sessionId:String(body.sessionId||''),participantId:String(body.participantId||''),committeeId:String(body.committeeId||''),requiredJudgeIds:Array.isArray(body.requiredJudgeIds)?body.requiredJudgeIds.map(String):[],approvalMode:body.approvalMode==='minimum'?'minimum':'all_assigned',minimumApprovals:body.minimumApprovals?Number(body.minimumApprovals):undefined,expiresAt:String(body.expiresAt||''),sourcePackageId:String(body.sourcePackageId||''),poolId:String(body.poolId||''),questionCount:Number(body.questionCount||0),maxJuz:body.maxJuz===undefined?undefined:Number(body.maxJuz),targetDifficulty:body.targetDifficulty===undefined?undefined:Number(body.targetDifficulty),difficultyTolerance:body.difficultyTolerance===undefined?undefined:Number(body.difficultyTolerance),qiraah:String(body.qiraah||''),rawi:String(body.rawi||''),tariq:body.tariq?String(body.tariq):undefined,expectedParticipantCount:body.expectedParticipantCount===undefined?undefined:Number(body.expectedParticipantCount),acrossSurah:body.acrossSurah===undefined?undefined:!!body.acrossSurah,acrossJuz:body.acrossJuz===undefined?undefined:!!body.acrossJuz,requiredStartAssurance:body.requiredStartAssurance==='SCIENTIFICALLY_APPROVED'?'SCIENTIFICALLY_APPROVED':'QURAN_AYAH_BOUNDARY'});res.status(201).json({runtime,assurance:'SERVER_FAIRDRAW_QURAN_RESOLUTION_ESCROW'})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_PROVISION_FAILED'})}});
  app.get('/api/question-runtime/participant/:participantId/active',requireFirebaseRoles(['judge','head_judge','comp_admin','org_admin']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;const competitionId=String(req.query.competitionId||actor.competitionId||'');if(!competitionId)return res.status(400).json({code:'COMPETITION_REQUIRED'});return res.json({runtime:secureQuestionRuntime.findActiveForParticipant(competitionId,String(req.params.participantId),actor)})}catch(err){return res.status(404).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_ACTIVE_SESSION_NOT_FOUND'})}});
  app.get('/api/question-runtime/:sessionId/status',requireFirebaseRoles(['judge','head_judge','comp_admin','org_admin']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;return res.json({runtime:secureQuestionRuntime.status(String(req.params.sessionId),actor)})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_STATUS_FAILED'})}});
  app.post('/api/question-runtime/:sessionId/presence',requireFirebaseRoles(['judge']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;const method=String(req.body?.method||'manual_visual_confirmation');const runtime=secureQuestionRuntime.confirmPresence(String(req.params.sessionId),actor,method);serverAuditLedger?.append(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId:actor.competitionId||runtime.competitionId,action:'QUESTION_PARTICIPANT_PRESENCE_CONFIRMED',entityType:'QuestionRuntime',entityId:String(req.params.sessionId),reason:`Presence confirmed via ${method}`,sessionId:String(req.params.sessionId),requestId:String(req.headers['x-request-id']||'')});return res.json({runtime})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_PRESENCE_FAILED'})}});
  app.post('/api/question-runtime/:sessionId/questions/:questionIndex/approve',requireFirebaseRoles(['judge']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;const runtime=secureQuestionRuntime.approveQuestion(String(req.params.sessionId),Number(req.params.questionIndex),actor);return res.json({runtime})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_APPROVAL_FAILED'})}});
  app.get('/api/question-runtime/:sessionId/questions/:questionIndex/reveal',requireFirebaseRoles(['judge']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;const revealed=secureQuestionRuntime.revealQuestion(String(req.params.sessionId),Number(req.params.questionIndex),actor) as any;if(revealed?.exposureReceipt?.canaryToken)res.setHeader('X-Mizan-Exposure-Canary',revealed.exposureReceipt.canaryToken);serverAuditLedger?.append(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId:actor.competitionId||'',action:'QUESTION_PLAINTEXT_EXPOSED_TO_ASSIGNED_JUDGE',entityType:'QuestionRuntime',entityId:String(req.params.sessionId),reason:'Question released after participant presence and configured judge quorum',sessionId:String(req.params.sessionId),requestId:String(req.headers['x-request-id']||'')});return res.json(revealed)}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_REVEAL_FAILED'})}});
  app.post('/api/question-runtime/:sessionId/emergency-replacement/authorize',requireGovernanceRoles(['head_judge','comp_admin','org_admin']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity,sessionId=String(req.params.sessionId);if(process.env.MIZAN_WITNESS_REQUIRED_FOR_QUESTION_REPLACEMENT==='true'){if(!witnessMode)throw new Error('WITNESS_MODE_NOT_CONFIGURED');witnessMode.verifyReady(String(req.body?.witnessActionId||''),{organizationId:actor.organizationId,competitionId:String(actor.competitionId||''),actionType:'QUESTION_REPLACEMENT',targetRef:`question-replacement:${sessionId}`})}const runtime=secureQuestionRuntime.authorizeEmergencyReplacement({sessionId,actor,reason:String(req.body?.reason||''),expiresAt:String(req.body?.expiresAt||'')});serverAuditLedger?.append(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId:actor.competitionId||runtime.competitionId,action:'QUESTION_REPLACEMENT_AUTHORIZED',entityType:'QuestionRuntime',entityId:sessionId,reason:String(req.body?.reason||''),sessionId,requestId:String(req.headers['x-request-id']||'')});return res.json({runtime})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_REPLACEMENT_AUTHORIZATION_FAILED'})}});
  app.post('/api/question-runtime/:sessionId/emergency-replacement/revoke',requireGovernanceRoles(['head_judge','comp_admin','org_admin']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;return res.json({runtime:secureQuestionRuntime.revokeEmergencyReplacement(String(req.params.sessionId),actor)})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_REPLACEMENT_REVOKE_FAILED'})}});
  app.post('/api/question-runtime/:sessionId/questions/:questionIndex/emergency-replacement/approve',requireFirebaseRoles(['judge']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;const result=secureQuestionRuntime.approveEmergencyReplacement({sessionId:String(req.params.sessionId),questionIndex:Number(req.params.questionIndex),actor});if(result.replacementReady)serverAuditLedger?.append(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId:actor.competitionId||result.competitionId,action:'QUESTION_REPLACED_EMERGENCY',entityType:'QuestionRuntime',entityId:String(req.params.sessionId),reason:'Authorized one-question emergency replacement',sessionId:String(req.params.sessionId),requestId:String(req.headers['x-request-id']||'')});return res.json(result)}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_REPLACEMENT_APPROVAL_FAILED'})}});
  app.get('/api/enterprise/question-runtime/:sessionId/public-proof',requireEnterpriseKey,(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{return res.json(secureQuestionRuntime.publicProof(String(req.params.sessionId)))}catch(err){return res.status(404).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_NOT_FOUND'})}});
  app.post('/api/enterprise/question-runtime/:sessionId/reveal-seed',requireEnterpriseKey,(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{return res.json(secureQuestionRuntime.revealFairDrawSeed(String(req.params.sessionId)))}catch(err){return res.status(404).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_NOT_FOUND'})}});
  app.get('/api/question-runtime/:sessionId/custody-corridor',requireGovernanceRoles(['head_judge','comp_admin','org_admin','auditor','operations']),(req,res)=>{if(!secureQuestionRuntime||!questionEscrow)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;secureQuestionRuntime.status(String(req.params.sessionId),actor);return res.json(questionEscrow.custodyCorridor(String(req.params.sessionId)))}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_CORRIDOR_FAILED'})}});
  app.get('/api/question-runtime/:sessionId/exposure-radius',requireGovernanceRoles(['head_judge','comp_admin','org_admin','auditor']),(req,res)=>{if(!secureQuestionRuntime||!questionEscrow)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;secureQuestionRuntime.status(String(req.params.sessionId),actor);return res.json(questionEscrow.exposureRadius(String(req.params.sessionId)))}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'EXPOSURE_RADIUS_FAILED'})}});
  app.post('/api/question-runtime/canary/trace',requireGovernanceRoles(['head_judge','comp_admin','org_admin','auditor']),(req,res)=>{if(!questionEscrow)return res.status(503).json({code:'QUESTION_ESCROW_NOT_CONFIGURED'});try{const traced=questionEscrow.traceCanary(String(req.body?.token||''));const actor=(req as any).mizanIdentity;if(traced.competitionId!==actor.competitionId||actor.organizationId!==questionEscrow.internalRecord(traced.sessionId).organizationId)return res.status(403).json({code:'CANARY_SCOPE_MISMATCH'});return res.json(traced)}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'CANARY_TRACE_FAILED'})}});
  app.post('/api/integrity/witness-actions',requireGovernanceRoles(['head_judge','comp_admin','org_admin']),(req,res)=>{if(!witnessMode)return res.status(503).json({code:'WITNESS_MODE_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;return res.status(201).json(witnessMode.create({actor,actionType:String(req.body?.actionType||'QUESTION_REPLACEMENT') as any,targetRef:String(req.body?.targetRef||''),reason:String(req.body?.reason||''),expiresAt:String(req.body?.expiresAt||''),requiredWitnesses:req.body?.requiredWitnesses?Number(req.body.requiredWitnesses):2}))}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'WITNESS_ACTION_CREATE_FAILED'})}});
  app.post('/api/integrity/witness-actions/:id/attest',requireGovernanceRoles(['operations','auditor','head_judge','comp_admin','org_admin']),(req,res)=>{if(!witnessMode)return res.status(503).json({code:'WITNESS_MODE_NOT_CONFIGURED'});try{return res.json(witnessMode.attest(String(req.params.id),(req as any).mizanIdentity,String(req.body?.evidenceRef||'')))}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'WITNESS_ATTEST_FAILED'})}});
  app.get('/api/integrity/witness-actions/:id',requireGovernanceRoles(['operations','auditor','head_judge','comp_admin','org_admin']),(req,res)=>{if(!witnessMode)return res.status(503).json({code:'WITNESS_MODE_NOT_CONFIGURED'});try{return res.json(witnessMode.status(String(req.params.id),(req as any).mizanIdentity))}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'WITNESS_STATUS_FAILED'})}});
  app.post('/api/enterprise/cold-vault/export',requireEnterpriseKey,(req,res)=>{if(!coldVault)return res.status(503).json({code:'COLD_VAULT_NOT_CONFIGURED'});try{const key=Buffer.from(String(req.body?.transferKey||''),'base64url');const out=coldVault.export({competitionId:String(req.body?.competitionId||''),createdBy:String(req.body?.createdBy||'enterprise'),payload:req.body?.payload&&typeof req.body.payload==='object'?req.body.payload:{},transferKey:key});return res.status(201).json({package:out.package,fileStored:true})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'COLD_VAULT_EXPORT_FAILED'})}});
  app.post('/api/enterprise/cold-vault/verify',requireEnterpriseKey,(req,res)=>{if(!coldVault)return res.status(503).json({code:'COLD_VAULT_NOT_CONFIGURED'});try{return res.json(coldVault.verify(req.body?.package))}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'COLD_VAULT_VERIFY_FAILED'})}});
  app.post('/api/enterprise/cold-vault/test-restore',requireEnterpriseKey,(req,res)=>{if(!coldVault)return res.status(503).json({code:'COLD_VAULT_NOT_CONFIGURED'});try{const key=Buffer.from(String(req.body?.transferKey||''),'base64url');const out=coldVault.testRestore(req.body?.package,key,String(req.body?.testedBy||'enterprise'));return res.status(201).json({receipt:out.receipt,fileStored:true})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'COLD_VAULT_TEST_RESTORE_FAILED'})}});

  app.post('/api/enterprise/question-escrow/sessions',requireEnterpriseKey,(req,res)=>{if(!questionEscrowConfigured||!questionEscrow)return res.status(503).json({code:'QUESTION_ESCROW_NOT_CONFIGURED'});try{const body=req.body||{};const created=questionEscrow.create({organizationId:String(body.organizationId||''),competitionId:String(body.competitionId||''),sessionId:String(body.sessionId||''),participantId:String(body.participantId||''),committeeId:String(body.committeeId||''),requiredJudgeIds:Array.isArray(body.requiredJudgeIds)?body.requiredJudgeIds.map(String):[],approvalMode:body.approvalMode==='minimum'?'minimum':'all_assigned',minimumApprovals:body.minimumApprovals?Number(body.minimumApprovals):undefined,expiresAt:String(body.expiresAt||''),questions:Array.isArray(body.questions)?body.questions.map((q:any)=>({index:Number(q.index),questionId:String(q.questionId||''),payload:q.payload&&typeof q.payload==='object'?q.payload:{}})):[]});res.status(201).json({created:true,escrow:created,assurance:'production_server_escrow'})}catch(err){return escrowFailure(res,err)}});
  app.post('/api/enterprise/question-escrow/:sessionId/revoke',requireEnterpriseKey,(req,res)=>{if(!questionEscrow)return res.status(503).json({code:'QUESTION_ESCROW_NOT_CONFIGURED'});try{return res.json({escrow:questionEscrow.revoke(String(req.params.sessionId),String(req.body?.reason||'Administrative revocation'))})}catch(err){return escrowFailure(res,err)}});
  app.get('/api/question-escrow/:sessionId/status',requireFirebaseRoles(['judge']),(req,res)=>{if(!questionEscrowConfigured||!questionEscrow)return res.status(503).json({code:'QUESTION_ESCROW_NOT_CONFIGURED'});try{return res.json({escrow:questionEscrow.status(String(req.params.sessionId),(req as any).mizanIdentity)})}catch(err){return escrowFailure(res,err)}});
  app.post('/api/question-escrow/:sessionId/presence',requireFirebaseRoles(['judge']),(req,res)=>{if(!questionEscrowConfigured||!questionEscrow)return res.status(503).json({code:'QUESTION_ESCROW_NOT_CONFIGURED'});const passSecret=process.env.MIZAN_PASS_SIGNING_SECRET!;const pass=verifyToken(String(req.body?.participantPassToken||''),passSecret);if(!pass||pass.typ!=='participant_pass'||Number(pass.exp||0)<Date.now())return res.status(403).json({code:'PARTICIPANT_PASS_INVALID'});const actor=(req as any).mizanIdentity;const sessionId=String(req.params.sessionId);if(String(pass.organizationId)!==actor.organizationId||String(pass.competitionId)!==actor.competitionId)return res.status(403).json({code:'PARTICIPANT_PASS_SCOPE_MISMATCH'});try{return res.json({escrow:questionEscrow.confirmPresence(sessionId,actor,String(pass.participantId),String(pass.nonce||''))})}catch(err){return escrowFailure(res,err)}});
  app.post('/api/question-escrow/:sessionId/questions/:questionIndex/approve',requireFirebaseRoles(['judge']),(req,res)=>{if(!questionEscrowConfigured||!questionEscrow)return res.status(503).json({code:'QUESTION_ESCROW_NOT_CONFIGURED'});try{return res.json(questionEscrow.approve(String(req.params.sessionId),Number(req.params.questionIndex),(req as any).mizanIdentity))}catch(err){return escrowFailure(res,err)}});
  app.get('/api/question-escrow/:sessionId/questions/:questionIndex/reveal',requireFirebaseRoles(['judge']),(req,res)=>{if(!questionEscrowConfigured||!questionEscrow)return res.status(503).json({code:'QUESTION_ESCROW_NOT_CONFIGURED'});try{return res.json(questionEscrow.reveal(String(req.params.sessionId),Number(req.params.questionIndex),(req as any).mizanIdentity))}catch(err){return escrowFailure(res,err)}});

  // Opaque signed participant passes. Issue is server-to-server; verification can be public/minimal.
  app.post('/api/enterprise/passes/issue',requireEnterpriseKey,(req,res)=>{const secret=process.env.MIZAN_PASS_SIGNING_SECRET;if(!secret)return res.status(503).json({code:'PASS_SIGNING_NOT_CONFIGURED'});const {participantId,competitionId,organizationId,expiresAt}=req.body||{};if(!participantId||!competitionId||!organizationId)return res.status(400).json({code:'INVALID_PASS_REQUEST'});const exp=expiresAt?new Date(expiresAt).getTime():Date.now()+7*24*3600_000;const token=signToken({v:1,typ:'participant_pass',participantId,competitionId,organizationId,exp,nonce:crypto.randomUUID()},secret);res.json({token,expiresAt:new Date(exp).toISOString()})});
  app.get('/api/passes/verify/:token',(req,res)=>{const secret=process.env.MIZAN_PASS_SIGNING_SECRET;if(!secret)return res.status(503).json({code:'PASS_SIGNING_NOT_CONFIGURED'});const data=verifyToken(req.params.token,secret);if(!data||data.typ!=='participant_pass'||Number(data.exp||0)<Date.now())return res.status(404).json({valid:false});res.json({valid:true,competitionId:data.competitionId,organizationId:data.organizationId,participantId:data.participantId})});

  // Certificate signing/verification exposes only the fields intentionally signed by the issuer.
  app.post('/api/enterprise/certificates/sign',requireEnterpriseKey,(req,res)=>{const secret=process.env.MIZAN_CERT_SIGNING_SECRET;if(!secret)return res.status(503).json({code:'CERT_SIGNING_NOT_CONFIGURED'});const {certificateNumber,participantDisplayName,competitionDisplayName,issuedAt,status='valid'}=req.body||{};if(!certificateNumber||!participantDisplayName||!competitionDisplayName)return res.status(400).json({code:'INVALID_CERTIFICATE'});const token=signToken({v:1,typ:'certificate',certificateNumber,participantDisplayName,competitionDisplayName,issuedAt:issuedAt||new Date().toISOString(),status},secret);res.json({token})});
  app.get('/api/certificates/verify/:token',(req,res)=>{const secret=process.env.MIZAN_CERT_SIGNING_SECRET;if(!secret)return res.status(503).json({code:'CERTIFICATE_REPOSITORY_NOT_CONNECTED'});const data=verifyToken(req.params.token,secret);if(!data||data.typ!=='certificate')return res.status(404).json({valid:false});res.json({valid:data.status==='valid',certificateNumber:data.certificateNumber,participantDisplayName:data.participantDisplayName,competitionDisplayName:data.competitionDisplayName,issuedAt:data.issuedAt,status:data.status})});

  // Trust signatures are real Ed25519 when an institutional key is configured. No development key is invented in production.
  app.post('/api/enterprise/trust/sign',requireEnterpriseKey,(req,res)=>{const signer=trustSigner();if(!signer)return res.status(503).json({code:'TRUST_SIGNING_NOT_CONFIGURED'});const purpose=String(req.body?.purpose||'');if(!['federation_attestation','mizan_protocol','integrity_envelope'].includes(purpose))return res.status(400).json({code:'UNSUPPORTED_TRUST_PURPOSE'});const payload=req.body?.payload;if(!payload||typeof payload!=='object')return res.status(400).json({code:'INVALID_TRUST_PAYLOAD'});const material=canonicalStringify({purpose,payload});const signature=crypto.sign(null,Buffer.from(material),signer.privateKey).toString('base64url');res.json({algorithm:'Ed25519',keyId:signer.keyId,publicKeySpki:signer.spki,signature,purpose})});
  app.post('/api/trust/verify',(req,res)=>{const signer=trustSigner();if(!signer)return res.status(503).json({code:'TRUST_VERIFIER_NOT_CONFIGURED'});const {purpose,payload,signature,keyId}=req.body||{};if(!purpose||!payload||!signature)return res.status(400).json({valid:false,code:'INVALID_TRUST_PROOF'});if(keyId&&keyId!==signer.keyId)return res.status(400).json({valid:false,code:'UNKNOWN_TRUST_KEY'});try{const material=canonicalStringify({purpose:String(purpose),payload});const valid=crypto.verify(null,Buffer.from(material),signer.publicKey,Buffer.from(String(signature),'base64url'));res.json({valid,algorithm:'Ed25519',keyId:signer.keyId})}catch{return res.status(400).json({valid:false,code:'VERIFY_FAILED'})}});

  // Durable local Edge relay. It is intentionally disabled until a data directory is configured.
  app.post('/api/enterprise/edge/mesh/:competitionId/events',requireEnterpriseKey,(req,res)=>{const dir=process.env.MIZAN_EDGE_DATA_DIR;if(!dir)return res.status(503).json({code:'EDGE_RELAY_NOT_CONFIGURED'});const organizationId=String(req.headers['x-mizan-org-id']||'');const competitionId=String(req.params.competitionId||'');const event=req.body?.event;if(!organizationId||!competitionId||!event?.id||!event?.originDeviceId||!Number.isInteger(event?.sequence))return res.status(400).json({code:'INVALID_MESH_EVENT'});fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,`mesh-${safeSegment(organizationId)}-${safeSegment(competitionId)}.jsonl`);let existing='';try{existing=fs.existsSync(file)?fs.readFileSync(file,'utf8'):''}catch{return res.status(500).json({code:'EDGE_STORAGE_READ_FAILED'})}const rows=existing.split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line)}catch{return null}}).filter(Boolean);if(rows.some((r:any)=>r.event?.id===event.id))return res.status(200).json({accepted:true,idempotent:true});const sequenceConflict=rows.find((r:any)=>r.event?.originDeviceId===event.originDeviceId&&r.event?.sequence===event.sequence&&r.event?.id!==event.id);const envelope={organizationId,competitionId,receivedAt:new Date().toISOString(),event};try{fs.appendFileSync(file,JSON.stringify(envelope)+'\n',{encoding:'utf8',mode:0o600})}catch{return res.status(500).json({code:'EDGE_STORAGE_WRITE_FAILED'})}res.status(202).json({accepted:true,idempotent:false,conflict:sequenceConflict?{type:'sequence_collision',existingEventId:sequenceConflict.event.id}:null})});
  app.get('/api/enterprise/edge/mesh/:competitionId/events',requireEnterpriseKey,(req,res)=>{const dir=process.env.MIZAN_EDGE_DATA_DIR;if(!dir)return res.status(503).json({code:'EDGE_RELAY_NOT_CONFIGURED'});const organizationId=String(req.headers['x-mizan-org-id']||'');const competitionId=String(req.params.competitionId||'');if(!organizationId||!competitionId)return res.status(400).json({code:'EDGE_SCOPE_REQUIRED'});const file=path.join(dir,`mesh-${safeSegment(organizationId)}-${safeSegment(competitionId)}.jsonl`);if(!fs.existsSync(file))return res.json({events:[],durable:true});try{const rows=fs.readFileSync(file,'utf8').split('\n').filter(Boolean).slice(-5000).map(line=>JSON.parse(line));res.json({events:rows.map((r:any)=>r.event),durable:true,count:rows.length})}catch{return res.status(500).json({code:'EDGE_STORAGE_READ_FAILED'})}});

  // Server-side AI adapters. They never receive authorization to mutate results.
  // These proxy to paid upstream providers using server-held credentials, so they must never be
  // callable anonymously — an open relay would let anyone spend the provider quota. Require an
  // authenticated provisioned identity when Firebase is configured, else the enterprise API key.
  const aiAdvisoryRoles=['judge','head_judge','comp_admin','org_admin','scientific_admin','ops_manager','auditor'];
  const aiAdvisoryAuth:RequestHandler=firebaseProjectId?requireFirebaseRoles(aiAdvisoryRoles):requireEnterpriseKey;
  app.post('/api/copilot/query',aiAdvisoryAuth,async(req,res)=>{const endpoint=process.env.MIZAN_COPILOT_URL;const token=process.env.MIZAN_COPILOT_TOKEN;if(!endpoint)return res.status(503).json({code:'COPILOT_PROVIDER_NOT_CONNECTED'});try{const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({question:String(req.body?.question||'').slice(0,1000),context:req.body?.context||{}})});const body=await r.text();res.status(r.status).type(r.headers.get('content-type')||'application/json').send(body)}catch{return res.status(502).json({code:'COPILOT_UPSTREAM_UNAVAILABLE'})}});
  app.post('/api/ai/integrity/analyze',aiAdvisoryAuth,async(req,res)=>{const endpoint=process.env.MIZAN_AI_INTEGRITY_URL;const token=process.env.MIZAN_AI_INTEGRITY_TOKEN;if(!endpoint)return res.status(503).json({code:'AI_INTEGRITY_PROVIDER_NOT_CONNECTED'});try{const payload={sessionId:String(req.body?.sessionId||''),audioRef:String(req.body?.audioRef||''),expectedQuestionIds:Array.isArray(req.body?.expectedQuestionIds)?req.body.expectedQuestionIds.slice(0,20):[],riwaya:String(req.body?.riwaya||'')};const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(payload)});const body=await r.text();res.status(r.status).type(r.headers.get('content-type')||'application/json').send(body)}catch{return res.status(502).json({code:'AI_INTEGRITY_UPSTREAM_UNAVAILABLE'})}});

  const providerUrl=(channel:string)=>process.env[`MIZAN_${channel.toUpperCase()}_PROVIDER_URL`];
  const providerToken=(channel:string)=>process.env[`MIZAN_${channel.toUpperCase()}_PROVIDER_TOKEN`];
  app.post('/api/enterprise/notifications/dispatch',requireEnterpriseKey,async(req,res)=>{const channel=String(req.body?.channel||'');if(!['email','sms','whatsapp','push'].includes(channel))return res.status(400).json({code:'UNSUPPORTED_CHANNEL'});const endpoint=providerUrl(channel);if(!endpoint)return res.status(503).json({code:'PROVIDER_NOT_CONNECTED',channel});try{const token=providerToken(channel);const upstream=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({recipient:req.body?.recipient,templateKey:req.body?.templateKey,locale:req.body?.locale,payload:req.body?.payload||{},idempotencyKey:req.body?.idempotencyKey})});if(!upstream.ok)return res.status(502).json({code:'PROVIDER_REJECTED',channel,status:upstream.status});res.status(202).json({accepted:true,channel})}catch{return res.status(502).json({code:'PROVIDER_UNAVAILABLE',channel})}});

  app.post('/api/enterprise/webhooks/test',requireEnterpriseKey,async(req,res)=>{const endpoint=String(req.body?.endpoint||'');if(!/^https:\/\//i.test(endpoint))return res.status(400).json({code:'HTTPS_ENDPOINT_REQUIRED'});const allow=(process.env.MIZAN_WEBHOOK_ALLOW_HOSTS||'').split(',').map(x=>x.trim()).filter(Boolean);let url:URL;try{url=new URL(endpoint)}catch{return res.status(400).json({code:'INVALID_ENDPOINT'})}if(!allow.includes(url.hostname))return res.status(403).json({code:'WEBHOOK_HOST_NOT_ALLOWLISTED'});const secret=process.env.MIZAN_WEBHOOK_SIGNING_SECRET;if(!secret)return res.status(503).json({code:'WEBHOOK_SIGNING_NOT_CONFIGURED'});const event={id:crypto.randomUUID(),type:'mizan.test',createdAt:new Date().toISOString()};const raw=JSON.stringify(event);const signature=crypto.createHmac('sha256',secret).update(raw).digest('hex');try{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-mizan-signature':signature},body:raw});res.status(r.ok?202:502).json({accepted:r.ok,status:r.status})}catch{return res.status(502).json({code:'WEBHOOK_UNAVAILABLE'})}});

  // Streaming Quran forced-alignment engine (HTTP chunked transport). Advisory / SHADOW_ONLY.
  // Canonical text is resolved from the certified vault in production; here the dev provider serves
  // the labelled development passage. The acoustic reference is FAIL-CLOSED by default: it aligns
  // only when a reference is genuinely available. Set MIZAN_ALIGNMENT_DEV_SYNTH=true to enable a
  // clearly-synthetic dev reference for local end-to-end trials (never in production).
  const alignmentDevSynth=process.env.MIZAN_ALIGNMENT_DEV_SYNTH==='true';
  const alignmentManager=new AlignmentSessionManager(
    {getPassage:(spec)=>{try{return spec.readingId==='hafs'?devHafsPassage(spec.startAyah,spec.endAyah):null}catch{return null}}},
    {getBackend:(spec,passage,cfg)=>{
      if(!alignmentDevSynth)return null; // fail-closed: no real reference ingested
      const ref=synthReference(passage,280,0.01);
      const frameLen=Math.round((cfg.frameMs*16000)/1000),hopLen=Math.round((cfg.hopMs*16000)/1000);
      return ReferenceTemplateBackend.build({reading:spec.readingId,pcm:ref.pcm,sampleRate:16000,wordBoundariesMs:ref.wordBoundariesMs,frameLen,hopLen,melBands:cfg.melBands,mfccCount:cfg.mfccCount,useDeltas:cfg.useDeltas});
    }},
    ALIGN_CONFIG,
  );
  const alignmentAuth=firebaseProjectId?requireFirebaseRoles(['judge','head_judge','comp_admin','org_admin']):undefined;
  app.use('/api/align',createAlignmentRouter({manager:alignmentManager,auth:alignmentAuth,mode:'SHADOW_ONLY',devCanonicalHash:alignmentDevSynth?((spec)=>{try{return devHafsPassage(spec.startAyah,spec.endAyah).canonicalTextHash}catch{return undefined}}):undefined}));
  setInterval(()=>alignmentManager.reap(10*60_000),60_000).unref?.();

  if(!isProd){const vite=await createViteServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares)}else{const distPath=path.join(process.cwd(),'dist');
    /*
     * Caching contract for a hashed build.
     *
     * Serving index.html with a one-hour max-age let the CDN in front of MIZAN keep an old app
     * shell alive after a deploy. That shell names chunks by content hash, and those hashes are
     * gone from the new revision — so visitors were handed a stale page pointing at files that no
     * longer exist. That, not the browser, is what left the site blank after a release.
     *
     * The shell must therefore always be revalidated, while the hashed assets it names can be
     * cached indefinitely: their names change whenever their bytes change, so a stale copy is
     * impossible by construction.
     */
    const isHashedAsset=(p:string)=>/[.-][A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|ttf|png|jpe?g|webp|avif|svg)$/.test(p);
    app.use(express.static(distPath,{etag:true,setHeaders(res,filePath){
      if(filePath.endsWith('.html')||filePath.endsWith('sw.js')) res.setHeader('Cache-Control','no-cache, must-revalidate');
      else if(isHashedAsset(filePath)) res.setHeader('Cache-Control','public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control','public, max-age=3600');
    }}));
    /*
     * SPA fallback — but never for a build asset.
     *
     * Serving index.html for a missing /assets/*.js is what turns a routine deploy into a white
     * screen: a client still holding the previous app shell (browser cache or service worker) asks
     * for a hashed chunk that no longer exists, receives HTML with status 200, and the module
     * loader rejects it on MIME type with no way to recover. A 404 keeps that honest — the fetch
     * fails as a missing file, the service worker refuses to cache it, and the shell can reload
     * itself onto the current build.
     */
    const ASSET_LIKE=/^\/assets\/|\.(?:js|mjs|css|map|json|png|jpe?g|webp|avif|svg|ico|woff2?|ttf|mp3|m4a|txt|webmanifest)$/i;
    app.get('*',(req,res)=>{
      if(ASSET_LIKE.test(req.path))return res.status(404).type('text/plain').send('Not Found');
      // The shell is never cached: a stale one names chunks that a later deploy has removed.
      res.setHeader('Cache-Control','no-cache, must-revalidate');
      res.sendFile(path.join(distPath,'index.html'));
    })}
  app.listen(PORT,'0.0.0.0',()=>console.log(`MIZAN running on :${PORT}`));
}
startServer().catch(err=>{console.error(err);process.exit(1)});
