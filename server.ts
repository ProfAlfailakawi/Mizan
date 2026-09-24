import 'dotenv/config';
import express, { type RequestHandler } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response } from 'express-serve-static-core';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { QuestionEscrowRepository } from './server/question-escrow';
import { firebaseSecondFactorPresent, verifyFirebaseBaseIdToken, verifyFirebaseIdToken } from './server/firebase-auth';
import { claimsFromGrant, writeIdentityClaims, claimsWritable, claimsWritability } from './server/firebase-claims';
import { ALL_GOVERNANCE_ROLES, IdentityGovernanceRepository, operatorIdentityOrganizationId, type GovernanceRole, type ServerIdentity } from './server/identity-governance';
import { NotificationCenterRepository, type NotificationTarget } from './server/notification-center';
import { ServerAuditLedgerRepository, type ServerAuditActor, type ServerAuditInput } from './server/audit-ledger';
import { DurableAuditLedger } from './server/durable-audit-ledger';
import { FirestoreAuditStore } from './server/firestore-audit-store';
import { isServerAuthoredAuditAction } from './server/audit-authority';
import { FileSealRegistryStore, ResultSealRegistry } from './server/result-seal-registry';
import { FilePublicationStore, publicationDecision, type PublicationRecord } from './server/result-publication';
import { policyChangeDecision, scoreCorrectionDecision, readingChangeDecision } from './server/governance-attestation';
import { CONSENT_BACKED_DOCUMENTS, isPublished, isResolved, legalConfigFromEnv, legalDocumentState, resolveLegalDocument, type LegalChainLink, type LegalDocumentKind } from './src/lib/legal-documents';
import { LEGAL_PUBLICATION_PATHS, LegalPublicationError, legalPublicationHeaders, publishedLegalPage, type PublishedLegalPage } from './server/legal-publication';
import { ServerQuranSourceRepository } from './server/quran-source-repository';
import { KFGQPC_OFFICIAL_PACKAGES } from './server/kfgqpc-official-sources';
import { KFGQPC_OFFICIAL_AUDIO } from './server/kfgqpc-official-audio';
import { KFGQPC_DEVELOPER_ASSETS } from './server/kfgqpc-developer-assets';
import { buildKfgqpcOfficialLibrary, kfgqpcLibrarySummary } from './server/kfgqpc-official-library';
import { SecureQuestionRuntimeRepository, ServerQuestionPoolRepository } from './server/secure-question-runtime';
import { buildQuestionPoolFromCertifiedSource } from './server/question-pool-builder';
import { WitnessModeRepository } from './server/witness-mode';
import { GoogleDomainAuthorizer, googleDomainAuthorizerFromEnv, normalizeHost as normalizeAuthorizedHost } from './server/google-domain-authorizer';
import { PublicCertificateRegistry, certificateRegistryFromEnv } from './server/certificate-registry';
import { ColdVaultRepository } from './server/cold-vault';
import { KfgqpcDeliveryRepository } from './server/kfgqpc-delivery';
import { balancedFairDraw, generativeFairDraw } from './server/kfgqpc-fairdraw-generative';
import { MizanQuranDelivery, candidateRawiForDeliveryKey } from './server/quran-reading-delivery';
import { DELIVERY_READING_BY_RAWI } from './src/lib/delivered-readings';
import { practiceAyahWords, practiceFaceCatalogue, practiceFacePage, PracticeFaceError } from './server/practice-face-service';
import { muaalemGate } from './server/muaalem-gate';
import muaalemBenchmarkReport from './services/quran-muaalem/benchmark/reports/hafs.json';
import { normalizeScope, scopeAyahCount, scopeContainsRange, type QuranScope } from './src/lib/quran-scope';
import { resolveEffectiveScope } from './src/lib/scope-engine';
import { quranSkeleton, sameWord } from './src/lib/quran-orthography';
import type { ParticipantScopeRecord } from './src/lib/participant-scope';
import { quranReadingDefinition } from './server/quran-intelligence-policy';
import { resolveCanonicalRawiId } from './src/lib/canonical-readings';
import { attestResult } from './server/result-attestation';
import { sealResult, verifySeal, verifySealSignature } from './server/result-sealing';
import { IntegrityAuthorityRepository } from './server/integrity-authority';
import { assessAuthorityDurability } from './server/authority-durability';
import { WordTimingStore } from './server/word-timing-store';
import { measureAgreement, planBlindRescoring } from './server/blind-rescoring';
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
import { AsrBenchmarkRepository, RecitationRecogniser } from './server/recitation-recogniser';
import type { RecitationJudgingGate } from './server/recitation-asr-contract';
import { cueTextAllowed, cueTtsConfigured, synthesizeCue } from './server/cue-tts';
import { publicTenant, resolveTenantAny, resetTenantRegistry, tenantRegistry, tenantByOrganizationId } from './server/tenant-registry';
import { parseAllowedOrgIds, resolveEnterpriseOrganization } from './server/enterprise-scope';
import { TenantStore } from './server/tenant-store';
import type { TenantRecord } from './server/tenant-registry';
import { decodePemFromEnv } from './server/pem';
import { R2PrivateClient, r2ConfigFromEnv } from './server/r2-private';
import { ControlTowerRepository } from './server/control-tower';
import { paymentGatewayFromEnv } from './server/payments';
import { OpsTelemetryRepository, type CompetitionState, type JobStatus, type TelemetrySubject } from './server/ops-telemetry';
import { generateIdentityPlatformPasswordReset } from './server/google-oauth';
import { SaaSPlatformRepository, SecretVault, type CommercialActor } from './server/saas-platform';
import { FirestoreRestRepository } from './server/firestore-rest';
import { PublicRegistrationService, type PublicRegistrationInput } from './server/public-registration';
import type { Competition } from './src/types';

const b64=(x:string|Uint8Array)=>Buffer.from(x).toString('base64url');
const fromB64=(x:string)=>Buffer.from(x,'base64url').toString('utf8');
const safeEqual=(a:string,b:string)=>{const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const signToken=(payload:Record<string,unknown>,secret:string)=>{const body=b64(JSON.stringify(payload));const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');return `${body}.${sig}`};
const verifyToken=(token:string,secret:string)=>{const [body,sig]=token.split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');if(!safeEqual(sig,expected))return null;try{return JSON.parse(fromB64(body)) as Record<string,unknown>}catch{return null}};

const canonicalStringify=(value:unknown):string=>{if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonicalStringify).join(',')}]`;const obj=value as Record<string,unknown>;return `{${Object.keys(obj).sort().map(k=>`${JSON.stringify(k)}:${canonicalStringify(obj[k])}`).join(',')}}`;};
/* مفتاح PEM يصل من متغيّر بيئة: إمّا بأسطر حقيقية، أو — وهو الشائع في مديري الأسرار —
   سطرًا واحدًا فيه \\n حرفية. كان الاستبدال يحوّل سطرًا جديدًا إلى سطر جديد (لا شيء)، فيفشل
   بناء المفتاح في الحالة الثانية ويبقى توقيع الثقة معطّلًا بصمت. */
const trustSigner=()=>{const pem=decodePemFromEnv(process.env.MIZAN_TRUST_SIGNING_PRIVATE_KEY_PEM);if(!pem)return null;try{const privateKey=crypto.createPrivateKey(pem);const publicKey=crypto.createPublicKey(privateKey);const spki=publicKey.export({format:'der',type:'spki'}).toString('base64url');const keyId=process.env.MIZAN_TRUST_KEY_ID||`ed25519:${crypto.createHash('sha256').update(spki).digest('hex').slice(0,16)}`;return {privateKey,publicKey,spki,keyId}}catch{return null}};
const safeSegment=(v:string)=>v.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120);
const asCompetition=(value:unknown):Competition|null=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const candidate=value as Partial<Competition>;
  if(typeof candidate.id!=='string'||!candidate.id.trim())return null;
  if(typeof candidate.organizationId!=='string'||!candidate.organizationId.trim())return null;
  if(!Array.isArray(candidate.categories)||!candidate.ruleSet||typeof candidate.ruleSet!=='object')return null;
  return candidate as Competition;
};

/* إصدارات قديمة من التطوير كانت تزرع سجلاً ثابتًا على القرص. لا يجوز أن يصبح ذلك
   السجل مسابقة عامة حقيقية بعد الترقية، حتى لو بقي ملفه من تثبيت سابق. */
const RETIRED_SEED_COMPETITION_IDS=new Set(['comp-dubai-2027']);
const RETIRED_SEED_ORGANIZATION_IDS=new Set(['org-gqa-global']);
const isRetiredSeedCompetition=(competition:Competition)=>
  RETIRED_SEED_COMPETITION_IDS.has(competition.id)||RETIRED_SEED_ORGANIZATION_IDS.has(competition.organizationId);

async function startServer() {
  const app = express();
  /*
   * منصّات الحاويات تحقن المنفذ ولا تتفاوض عليه: Cloud Run وأمثالها تُمرّر PORT وتنتظر
   * الخدمة عنده، وملف الحاوية هنا يُعلن 8080. ومنفذٌ مثبَّت في الكود يعني أن التطبيق يستمع
   * في مكان والمنصّة تطرق مكانًا آخر — فلا تصل الطلبات ويسقط النشر في فحص الصحة، بلا خطأ
   * في السجل يدلّ على السبب. و.env.example يوثّق PORT كأنه مضبوط، فيظنّ الناشر أنه فعل.
   */
  const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3000;
  const isProd = process.env.NODE_ENV === 'production';
  app.disable('x-powered-by'); app.set('trust proxy', 1);
  app.use((req,res,next)=>{
    const requestId=String(req.headers['x-request-id']||crypto.randomUUID()); res.setHeader('x-request-id',requestId);
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy','camera=(self), geolocation=(), microphone=(self)'); res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    if(isProd) res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
    /* مصادقة Firebase تحمّل مساعدها من apis.google.com وتفتح إطارًا على نطاق المشروع،
       وتسجيل العامل الثاني يحمّل reCAPTCHA من google/gstatic. وسياسة تسمح بـ'self' وحدها
       تمنعها كلها بصمت: يرى المستخدم رفضًا بلا سبب، ويرى المطوّر رفض CSP بلا ربط. */
    if(isProd) res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' https://apis.google.com https://www.google.com https://www.gstatic.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://www.gstatic.com; media-src 'self' blob:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://cloudflareinsights.com; frame-src 'self' https://*.firebaseapp.com https://www.google.com https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  /* توقيع الـwebhook يُحسب على الجسم الخام كما وصل: أي إعادة ترميز تُبطل التحقق. */
  app.use(express.json({ limit: '1mb', verify:(req,_res,buf)=>{(req as any).rawBody=Buffer.from(buf)} }));

  // Per-instance fixed-window rate limiter.
  // HONEST SCOPE: this counter lives in this process's memory. On a horizontally scaled
  // deployment (e.g. Cloud Run with N instances) each instance keeps its own window, so the
  // effective ceiling is N * RATE_LIMIT_MAX and the limiter is a fair-use guard, not a hard
  // global quota. A true global quota requires a shared store (Redis/Memorystore) or the
  // platform's own edge rate limiting. To make that explicit and swappable, the window state
  // goes through a single hook: set MIZAN_RATE_LIMIT_BACKEND=external and front MIZAN with the
  // platform limiter, or replace `hitRateWindow` with a shared-store implementation.
  const rateWindowMs=Number(process.env.RATE_LIMIT_WINDOW_MS||60_000);
  const rateMax=Number(process.env.RATE_LIMIT_MAX||600);
  const rateLimiterIsGlobal=process.env.MIZAN_RATE_LIMIT_BACKEND==='external';
  const buckets=new Map<string,{count:number;resetAt:number}>();
  const hitRateWindow=(key:string,now:number)=>{const current=buckets.get(key);if(!current||current.resetAt<now){const fresh={count:1,resetAt:now+rateWindowMs};buckets.set(key,fresh);return fresh}current.count++;return current};
  // Opportunistic sweep so the map cannot grow unbounded across long-lived instances.
  let lastRateSweep=Date.now();
  app.use('/api',(req,res,next)=>{
    if(rateLimiterIsGlobal)return next();
    // Static asset delivery, fonts, layouts, and public caches must not consume transactional API quotas
    if(req.path.startsWith('/public/kfgqpc/')||req.path.startsWith('/public/brand-assets/')||req.path==='/health'||req.path==='/capabilities')return next();
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

  /*
   * `MIZAN_ENTERPRISE_API_KEY` مفتاحٌ **منصّيّ** لا مفتاح جهة.
   *
   * وهذا التصريحُ مقصود: كان المسار يقرأ `organizationId` من جسم الطلب خلف مفتاحٍ مشترك،
   * فيبدو كأن الجهة تُشتقّ من الاعتماد وهي لا تُشتقّ. والمفتاحُ واحدٌ للمنصّة كلِّها، فمن
   * يحمله يتصرّف باسم كل الجهات — وهذه ليست ثغرةً خفيّة، هي نموذجُ تهديدٍ يجب أن يُكتب
   * ويُحاط بحدود، لا أن يُترك ضمنيًّا.
   *
   * فالحدود ثلاثة، وكلُّها مطبَّقة على مسارات التهيئة:
   *   1. الجهةُ المطلوبة يجب أن تكون معروفةً في السجلّ (`enterpriseOrganization`).
   *   2. ويجوز حصرُ المفتاح بجهاتٍ بعينها عبر `MIZAN_ENTERPRISE_ALLOWED_ORG_IDS`.
   *   3. وكلُّ تهيئةٍ تُكتب في سجلّ التدقيق الخادمي باسم مشغّل المنصّة، لا مجهولةً.
   */
  const requireEnterpriseKey:RequestHandler=(req,res,next)=>{const configured=process.env.MIZAN_ENTERPRISE_API_KEY;if(!configured)return res.status(503).json({code:'ENTERPRISE_API_NOT_CONFIGURED'});const supplied=String(req.headers['x-mizan-api-key']||'');if(!safeEqual(supplied,configured))return res.status(401).json({code:'UNAUTHORIZED'});next()};

  /**
   * يحسم الجهةَ التي يتصرّف المفتاح المنصّي باسمها. القرارُ نفسه في `enterprise-scope`
   * ليُختبر وحده؛ وهنا وصلُه بالبيئة وسجلّ الجهات والردّ.
   */
  const enterpriseOrganization=(req:Request,res:Response):string|null=>{
    const known=(tenantStore&&!process.env.MIZAN_TENANTS)?tenantStore.list():tenantRegistry();
    const decision=resolveEnterpriseOrganization({
      requestedOrganizationId:(req.body||{}).organizationId,
      allowedOrgIds:parseAllowedOrgIds(process.env.MIZAN_ENTERPRISE_ALLOWED_ORG_IDS),
      knownOrgIds:known.map(t=>t.orgId),
    });
    /* فحصٌ بوجود الحقل لا بالراية: التضييق على راية منطقية لا يعمل خارج الوضع الصارم. */
    if('code' in decision){res.status(decision.status).json({code:decision.code});return null}
    return decision.organizationId;
  };

  /** الفاعلُ في سجلّ التدقيق حين يكون المتصرّف هو مشغّل المنصّة لا مستخدمًا في جهة. */
  const platformOperatorActor=(organizationId:string,competitionId?:string)=>
    ({uid:'MIZAN_PLATFORM_OPERATOR',role:'super_admin',organizationId,competitionId});

  /* سجل الجهات: ملف يُحرَّر من لوحة التحكم بدل متغيّر بيئة يلزمه إعادة نشر.
     غيابه يعني نشرًا بجهة واحدة، فتبقى الإدارة معطَّلة لا معطوبة. */
  const tenantsFile=process.env.MIZAN_TENANTS_FILE||'';
  let tenantStore:TenantStore|null=null;try{if(tenantsFile&&!process.env.MIZAN_TENANTS)tenantStore=new TenantStore(tenantsFile)}catch(err){console.error('Tenant store disabled:',err)}
  const saasDir=process.env.MIZAN_SAAS_DATA_DIR||(isProd?'':path.resolve('.mizan-data/saas'));
  let saasPlatform:SaaSPlatformRepository|null=null;
  try{if(saasDir){const vaultKey=process.env.MIZAN_STORAGE_SECRET_MASTER_KEY||'';const vault=vaultKey?new SecretVault(path.join(saasDir,'vault','storage-secrets.enc.json'),vaultKey):undefined;saasPlatform=new SaaSPlatformRepository(path.join(saasDir,'saas-platform.json'),vault)}}catch(err){console.error('SaaS platform disabled:',err)}
  /* الفوترة تُقفل دورتها بنفسها: تُصدَر فاتورة التجديد عند انتهاء الدورة بلا تدخّل.
     التشغيل متكرّر بأمان، فالتأخر أو التكرار لا يُصدر فاتورتين. */
  if(saasPlatform){
    const runCycle=()=>{try{const out=saasPlatform!.runBillingCycle();if(out.issued.length)console.log(`[billing] issued ${out.issued.length} renewal invoice(s)`)}catch(err){console.error('[billing] renewal cycle failed:',err)}};
    runCycle();
    const cycle=setInterval(runCycle,Number(process.env.MIZAN_BILLING_CYCLE_INTERVAL_MS||3600_000));
    cycle.unref?.();
  }
  const firebaseProjectId=process.env.FIREBASE_PROJECT_ID||'';
  const firestoreRepository=firebaseProjectId?new FirestoreRestRepository(firebaseProjectId):null;
  const publicCompDir=process.env.MIZAN_PUBLIC_COMPETITIONS_DIR||path.resolve('.mizan-data/public-competitions');
  const publicDataDir=process.env.MIZAN_PUBLIC_DATA_DIR||path.resolve('.mizan-data/public-data');
  const deleteFirestoreTree=async(documentPath:string):Promise<void>=>{
    if(!firestoreRepository)throw new Error('FIRESTORE_UNAVAILABLE');
    const childCollections=await firestoreRepository.listCollectionIds(documentPath);
    for(const collectionId of childCollections){
      const children=await firestoreRepository.listDocumentPaths(`${documentPath}/${collectionId}`);
      for(const child of children)await deleteFirestoreTree(child);
    }
    await firestoreRepository.delete(documentPath);
  };
  try{fs.mkdirSync(publicCompDir,{recursive:true,mode:0o700})}catch{/* ignore */}
  try{fs.mkdirSync(publicDataDir,{recursive:true,mode:0o700})}catch{/* ignore */}
  /* تنظيف أثر النسخة القديمة مرة واحدة. لا ينشئ الخادم أي مسابقة تلقائيًا. */
  for(const retiredId of RETIRED_SEED_COMPETITION_IDS){
    try{const stale=path.join(publicCompDir,`${retiredId}.json`);if(fs.existsSync(stale))fs.rmSync(stale,{force:true})}catch{/* ignore */}
  }

  const getLatestOrActiveCompetition=async():Promise<Competition|null>=>{
    try{
      if(fs.existsSync(publicCompDir)){
        const files=fs.readdirSync(publicCompDir).filter(f=>f.endsWith('.json')&&!f.startsWith('comp-pending-setup'));
        if(files.length>0){
          files.sort((a,b)=>{
            const statA=fs.statSync(path.join(publicCompDir,a));
            const statB=fs.statSync(path.join(publicCompDir,b));
            return statB.mtimeMs-statA.mtimeMs;
          });
          for(const f of files){
            try{
              const raw=fs.readFileSync(path.join(publicCompDir,f),'utf8');
              const parsed=JSON.parse(raw);
              const comp=asCompetition(parsed?.competition||parsed);
              if(comp&&!isRetiredSeedCompetition(comp)&&comp.categories.length>0&&!['draft','configured'].includes(comp.status)){
                return comp;
              }
            }catch{/* ignore */}
          }
        }
      }
    }catch(err){
      console.warn('[public-competitions] Failed to get latest from disk:',err);
    }
    return null;
  };

  const getPublicCompetitionRecord=async(id:string):Promise<Competition|null>=>{
    const cleanId=String(id||'').trim().replace(/[^a-zA-Z0-9_-]/g,'');
    if(!cleanId||cleanId==='latest'||cleanId==='current'||cleanId==='default'){
      return await getLatestOrActiveCompetition();
    }
    /* معرّف التهيئة ليس alias عامًا: إظهاره لمسابقـة أخرى يجعل رابطًا قديمًا يبدو صحيحًا
       وهو يشير إلى حدث مختلف. النشر يرقّي المسودة إلى معرّف حقيقي قبل أن تُشارك. */
    if(cleanId==='comp-pending-setup'||RETIRED_SEED_COMPETITION_IDS.has(cleanId))return null;
    if(firestoreRepository){
      try{
        const row=await firestoreRepository.get(`public_competitions/${cleanId}`);
        const comp=asCompetition(row?.competition);
        if(comp&&!isRetiredSeedCompetition(comp)) return comp;
      }catch(err){
        console.warn(`[public-competitions] Firestore read failed for ${cleanId}:`,err);
      }
    }
    try{
      const file=path.join(publicCompDir,`${cleanId}.json`);
      if(fs.existsSync(file)){
        const raw=fs.readFileSync(file,'utf8');
        const parsed=JSON.parse(raw);
        const comp=asCompetition(parsed?.competition||parsed);
        if(comp&&!isRetiredSeedCompetition(comp)) return comp;
      }
    }catch(err){
      console.warn(`[public-competitions] Disk read failed for ${cleanId}:`,err);
    }
    return null;
  };

  /*
   * سلسلةُ ناشري الوثائق: وثائقُ الجهة، فوثائقُ مشغّلها، فوثائقُ المنصّة. وتُبنى هنا
   * لأن مخزن SaaS هو من يعرف مَن يملك مَن — والخدمةُ نفسها لا تعرف شيئًا عن التراخيص.
   *
   * وغيابُ المخزن يترك المنصّةَ وحدها، وهو الحال الصحيح قبل بيع النظام لمشغّلين: لا
   * يُفترض ناشرٌ لا وجود له. ويشترك فيها مسارُ العرض ومسارُ التسجيل، فلا تفترق الوثيقةُ
   * التي رآها المتسابق عن التي كُتبت في أثره.
   */
  const publicLegalChain=(organizationId:string):LegalChainLink[]=>[
    ...(saasPlatform?saasPlatform.legalChainFor(organizationId):[]),
    {level:'platform',config:legalConfigFromEnv(process.env as Record<string,string|undefined>)},
  ];
  const publicRegistration=new PublicRegistrationService({
    /* التسجيل عملية كتابة رسمية، لذلك لا نقبل نسخة القرص كسلطة للفئات. شاشة الطالب
       تسجّل فقط مقابل الإسقاط المنشور فعليًا في Firestore؛ إذا كانت السحابة غير متاحة
       نرفض بوضوح بدل قبول فئة قديمة أو إنشاء تسجيل شبح لا يظهر في «المشاركون». */
    getCompetition:async(id):Promise<Competition|null>=>{
      const cleanId=String(id||'').trim().replace(/[^a-zA-Z0-9_-]/g,'');
      if(!cleanId||['latest','current','default','comp-pending-setup'].includes(cleanId))throw new Error('COMPETITION_ID_REQUIRED');
      if(!firestoreRepository)throw new Error('FIRESTORE_UNAVAILABLE');
      try{
        const row=await firestoreRepository.get(`public_competitions/${cleanId}`);
        const competition=asCompetition(row?.competition);
        return competition&&!isRetiredSeedCompetition(competition)?competition:null;
      }catch(err){
        console.error(`[public-registration] authoritative competition read failed for ${cleanId}:`,err);
        throw new Error('FIRESTORE_UNAVAILABLE');
      }
    },
    create:async(documents)=>{
      /* لا نجاح محلي وهمي: سجل الإدارة في Firestore شرط لإتمام التسجيل. */
      if(!firestoreRepository)throw new Error('FIRESTORE_UNAVAILABLE');
      await firestoreRepository.createAtomically(documents);
      try{
        for(const doc of documents){
          const safeKey=crypto.createHash('sha256').update(doc.path).digest('hex');
          const file=path.join(publicDataDir,`${safeKey}.json`);
          fs.writeFileSync(file,JSON.stringify({path:doc.path,data:doc.data,writtenAt:new Date().toISOString()}),'utf8');
        }
      }catch(e){
        console.warn('[public-registration] local write failed:',e);
      }
    },
    getJourney:async(tokenHash)=>{
      if(firestoreRepository){
        try{
          const row=await firestoreRepository.get(`public_journeys/${tokenHash}`);
          if(row) return row;
        }catch(e){
          console.warn('[public-registration] firestore getJourney failed:',e);
        }
      }
      try{
        const safeKey=crypto.createHash('sha256').update(`public_journeys/${tokenHash}`).digest('hex');
        const file=path.join(publicDataDir,`${safeKey}.json`);
        if(fs.existsSync(file)){
          const parsed=JSON.parse(fs.readFileSync(file,'utf8'));
          return parsed?.data||null;
        }
      }catch(e){
        console.warn('[public-registration] disk getJourney failed:',e);
      }
      return null;
    }
  },
  ()=>new Date(),
  process.env as Record<string,string|undefined>,
  /*
   * سلسلةُ ناشري الوثائق: وثائقُ الجهة، فوثائقُ مشغّلها، فوثائقُ المنصّة. وتُبنى هنا
   * لأن مخزن SaaS هو من يعرف مَن يملك مَن — والخدمةُ نفسها لا تعرف شيئًا عن التراخيص.
   *
   * وغيابُ المخزن يترك المنصّةَ وحدها، وهو الحال الصحيح قبل بيع النظام لمشغّلين: لا
   * يُفترض ناشرٌ لا وجود له.
   */
  (organizationId)=>publicLegalChain(organizationId),
);
  const identityDir=process.env.MIZAN_IDENTITY_GOVERNANCE_DIR||'';let identityGovernance:IdentityGovernanceRepository|null=null;try{if(identityDir)identityGovernance=new IdentityGovernanceRepository(identityDir)}catch(err){console.error('Identity governance disabled:',err)}
  const notificationDir=process.env.MIZAN_NOTIFICATION_CENTER_DIR||(identityDir?path.join(identityDir,'notifications'):(saasDir?path.join(saasDir,'notifications'):''));let notificationCenter:NotificationCenterRepository|null=null;try{if(notificationDir)notificationCenter=new NotificationCenterRepository(notificationDir)}catch(err){console.error('Notification center disabled:',err)}
  /*
   * السلطة لا تُفعَّل على مسار غير دائم: موافقة نصاب تختفي، أو بذرة التُزم بها ولم تُكشف تضيع،
   * وكلاهما يُنتج ختمًا يسنده دليل غير موجود. الامتناع يُقال في السجل بصراحة ليُعالَج.
   */
  const wordTimingsDir=process.env.MIZAN_WORD_TIMINGS_DIR||'';let wordTimings:WordTimingStore|null=null;try{if(wordTimingsDir)wordTimings=new WordTimingStore(wordTimingsDir)}catch(err){console.error('Word timings disabled:',err)}
  const integrityAuthorityDir=process.env.MIZAN_INTEGRITY_AUTHORITY_DIR||'';
  const authorityDurability=assessAuthorityDurability(integrityAuthorityDir);
  let integrityAuthority:IntegrityAuthorityRepository|null=null;
  if(authorityDurability.durable){
    try{integrityAuthority=new IntegrityAuthorityRepository(authorityDurability.path);console.log(`Integrity authority enabled at ${authorityDurability.path} (${authorityDurability.note}).`)}
    catch(err){console.error('Integrity authority disabled:',err)}
  }else if('code' in authorityDurability&&authorityDurability.code!=='NOT_CONFIGURED'){
    console.error(`Integrity authority refused: ${authorityDurability.message}`);
  }
  const auditLedgerDir=process.env.MIZAN_AUDIT_LEDGER_DIR||'';let serverAuditLedger:ServerAuditLedgerRepository|null=null;try{if(auditLedgerDir)serverAuditLedger=new ServerAuditLedgerRepository(auditLedgerDir)}catch(err){console.error('Server audit ledger disabled:',err)}
  /*
   * سجلُّ الأختام — يسكن مع سجلّ التدقيق لأن كليهما أثرُ حدثٍ لا يُكرَّر.
   *
   * بدونه يخرج نداءان بنفس المدخلات ببصمتَي ختمٍ مختلفتين (لأن `sealedAt` يدخل البصمة)
   * وبصفَّي تدقيقٍ لحدثٍ واحد، فيرى المدقّق ختمين لنفس المشارك بنفس الرقم ولا يعرف
   * أيّهما المعتمَد. وغيابُه لا يعطّل الختم؛ يُعلَن في `/api/health` ولا يُدَّعى.
   */
  /*
   * سجلُّ التدقيق الدائم — يُفضَّل على الملفّ المحلّي متى كان Firestore مهيّأً.
   *
   * الملفُّ بجوار العملية يعمل على خادمٍ واحد وينكسر بصمتٍ على أكثر: نسختان لا تريان
   * ملفَّ بعضهما، فتكتبان التسلسل ١ مرّتين، ويصير لمسابقةٍ واحدة سجلّان متوازيان لا
   * يُحتجّ بمجموعهما. فالمشتركُ أولى حين يوجد، والمحلّيُّ يبقى مهايئَ تطوير.
   */
  const durableAuditLedger=firestoreRepository?new DurableAuditLedger(new FirestoreAuditStore(firestoreRepository)):null;
  const auditLedgerDurability=()=>durableAuditLedger?durableAuditLedger.durability:serverAuditLedger?'LOCAL_DISK_DEVELOPMENT_ADAPTER':'NONE';
  /*
   * إخفاقُ كتابة الأثر لا يُبتلع.
   *
   * الكتابةُ الدائمة شبكية، فقد تفشل. وابتلاعُ الفشل يعني ثقبًا في السجلّ لا يعلم به
   * أحد — وهو أسوأ من غياب السجلّ، لأنه يوهم بالاكتمال. فيُعدّ الفشلُ ويُعرض في
   * `/api/health`، ويُكتب الحدثُ في الملفّ المحلّي أيضًا كي لا يضيع.
   */
  let auditAppendFailures=0;
  const auditAppend=(actor:ServerAuditActor,input:ServerAuditInput)=>{
    if(!durableAuditLedger)return serverAuditLedger?.append(actor,input);
    void durableAuditLedger.append(actor,input).catch(err=>{
      auditAppendFailures+=1;
      console.error('[audit] durable append failed, falling back to the local ledger:',err);
      try{serverAuditLedger?.append(actor,input)}catch(fallbackError){console.error('[audit] local fallback failed too:',fallbackError)}
    });
    return undefined;
  };
  const sealRegistryDir=process.env.MIZAN_SEAL_REGISTRY_DIR||(auditLedgerDir?path.join(auditLedgerDir,'seal-registry'):'');
  let resultSealRegistry:ResultSealRegistry|null=null;
  try{if(sealRegistryDir)resultSealRegistry=new ResultSealRegistry(new FileSealRegistryStore(sealRegistryDir))}catch(err){console.error('Result seal registry disabled:',err)}
  const publicationDir=process.env.MIZAN_PUBLICATION_STORE_DIR||(auditLedgerDir?path.join(auditLedgerDir,'publications'):'');
  let resultPublications:FilePublicationStore|null=null;
  try{if(publicationDir)resultPublications=new FilePublicationStore(publicationDir,fs,path)}catch(err){console.error('Result publication store disabled:',err)}
  /* مسارات الهوية الحسّاسة (الاستيلاء على الجلسة مثلًا) تُخنق كالحدّ الضيق للمالك:
     محاولة تخمين أو إغراق يجب أن تُوقف قبل حدّ /api الفسيح. تُترك للطبقة الخارجية متى أُسندت. */
  const sensitiveIdentityRateLimit:RequestHandler=rateLimit({
    windowMs:rateWindowMs,limit:Number(process.env.MIZAN_OWNER_RATE_LIMIT_MAX||30),
    standardHeaders:'draft-7',legacyHeaders:false,message:{code:'RATE_LIMITED'},
    skip:()=>rateLimiterIsGlobal,
  });
  /*
   * تدريب المتسابق: حدّان، أحدهما قبل التحقق من الهوية.
   *
   * كل طلبٍ هنا يرفع مقطعًا صوتيًّا ويستدعي محرّك التتبّع، فالكلفة حقيقية لكل نداء لا
   * لكل جلسة. ولا يُعلَّق الحدّ على غياب الحدّ العام كما تُعلَّق حدود القراءة، لأن الحدّ
   * العام على /api أوسع من أن يحمي حسابًا.
   *
   * وهما اثنان لأن كلًّا منهما يحمي من شيء يعجز عنه الآخر:
   *
   *   ١) حدّ العنوان يسبق `requireFirebaseRoles`، فإغراقٌ برموز فاشلة يُوقف قبل أن
   *      يُنفق الخادم تحقّقًا عند مزوّد المصادقة على كل طلب. وسقفه واسع عمدًا: قاعةٌ
   *      كاملة قد تخرج من عنوانٍ واحد، فلا يُخنق الحاضرون بذنب مشاركتهم الشبكة.
   *   ٢) وحدّ الحساب يليه، وهو الضيّق: التخويل يقول «من أنت» لا «كم مرة»، ومتسابقٌ
   *      مخوَّلٌ واحد — أو نصٌّ آلي معطوب بجلسته — يستنزف المحرّك وحده. والسقف من
   *      الاستعمال المشروع: مقطعٌ كل ثانيتين، فستّون في الدقيقتين تكفي قراءةً متصلة.
   */
  /*
   * ومسار المحكّم مثله: نفس الحمولة، ونفس نداء المحرّك، ونفس الكلفة لكل طلب.
   *
   * كان بلا حدّ منذ كُتب، ولم يظهر حتى لمس هذا التغيير سطره. وسقفه أوسع لأن قاعةً فيها
   * عدّة لجان تقرأ معًا، وكلُّ لجنة ترسل مقطعًا كل ثانية ونصف.
   */
  const alignmentAudioIpRateLimit:RequestHandler=rateLimit({
    windowMs:120_000,
    limit:Number(process.env.MIZAN_ALIGNMENT_AUDIO_IP_RATE_LIMIT_MAX||1200),
    standardHeaders:'draft-7',legacyHeaders:false,
    message:{code:'RATE_LIMITED'},
    skip:()=>rateLimiterIsGlobal,
  });
  /*
   * حدُّ معدّلٍ على مسارات يوم المسابقة وسجلّ التدقيق.
   *
   * حدُّ المعدّل ليس حارسَ هوية — الهويةُ محروسةٌ قبله — لكنه يمنع أن يُستنزف الخادمُ
   * أو يُغرق السجلُّ من حسابٍ واحد مُخترَق أو عميلٍ في حلقةٍ لا تنتهي. والغرقُ في سجلّ
   * التدقيق ليس إزعاجًا: صفوفٌ لا تنتهي تدفن ما يُحتجّ به وقت النزاع.
   *
   * والحدُّ سخيٌّ عمدًا: لجانٌ كثيرة تنادي حضورًا وموافقةً وكشفًا في الدقائق نفسها،
   * وحدٌّ ضيّق يوقف مسابقةً حقيقية — وهو أسوأ مما يمنعه. ويُفتَح بالبيئة حين يلزم.
   */
  const questionRuntimeRateLimit:RequestHandler=rateLimit({
    windowMs:60_000,
    limit:Number(process.env.MIZAN_QUESTION_RUNTIME_RATE_LIMIT_MAX||600),
    standardHeaders:'draft-7',legacyHeaders:false,
    keyGenerator:(req)=>String((req as any).mizanIdentity?.uid||ipKeyGenerator(req.ip||'')),
    message:{code:'RATE_LIMITED'},
    skip:()=>rateLimiterIsGlobal,
  });
  const auditRateLimit:RequestHandler=rateLimit({
    windowMs:60_000,
    limit:Number(process.env.MIZAN_AUDIT_RATE_LIMIT_MAX||600),
    standardHeaders:'draft-7',legacyHeaders:false,
    keyGenerator:(req)=>String((req as any).mizanIdentity?.uid||ipKeyGenerator(req.ip||'')),
    message:{code:'RATE_LIMITED'},
    skip:()=>rateLimiterIsGlobal,
  });
  const alignmentAudioRateLimit:RequestHandler=rateLimit({
    windowMs:120_000,
    limit:Number(process.env.MIZAN_ALIGNMENT_AUDIO_RATE_LIMIT_MAX||120),
    standardHeaders:'draft-7',legacyHeaders:false,
    keyGenerator:(req)=>String((req as any).mizanIdentity?.uid||ipKeyGenerator(req.ip||'')),
    message:{code:'RATE_LIMITED'},
  });
  const practiceAlignmentIpRateLimit:RequestHandler=rateLimit({
    windowMs:120_000,
    limit:Number(process.env.MIZAN_PRACTICE_ALIGNMENT_IP_RATE_LIMIT_MAX||600),
    standardHeaders:'draft-7',legacyHeaders:false,
    // A shared/edge limiter is authoritative in global mode; keep the middleware shape
    // stable and let express-rate-limit bypass its local store via the built-in hook.
    skip:()=>rateLimiterIsGlobal,
    message:{code:'RATE_LIMITED'},
  });
  /*
   * حدُّ المقاطع لكلّ متسابق — ويُقاس بالإيقاع لا يُقدَّر.
   *
   * فالمسجّلُ يُخرج مقطعًا كلَّ **ثانيتين**، والنافذةُ مئةٌ وعشرون ثانية. فحدُّ ٦٠
   * كان يساوي الإيقاعَ بالضبط: صفرُ فسحةٍ لإعادةِ محاولةٍ أو لطلبِ وجهٍ يمرّ في
   * أثناء التلاوة. ووجهُ المصحف زهاءَ ١٢٨ كلمة، وقارئٌ متأنٍّ يقرؤه في أكثر من
   * دقيقتين — أي أكثر من ٦٠ مقطعًا. فكان الحدُّ يقطع على المتأنّي تلاوتَه.
   *
   * فصار ٩٠: فسحةُ النصف فوق الإيقاع، وتكفي تلاوةً في ثلاث دقائق.
   */
  const practiceAlignmentRateLimit:RequestHandler=rateLimit({
    windowMs:120_000,
    limit:Number(process.env.MIZAN_PRACTICE_ALIGNMENT_RATE_LIMIT_MAX||90),
    standardHeaders:'draft-7',legacyHeaders:false,
    keyGenerator:(req)=>String((req as any).mizanIdentity?.uid||ipKeyGenerator(req.ip||'')),
    message:{code:'RATE_LIMITED'},
  });
  /*
   * ولمسار السماع حدُّه هو، لا يُقاسَم مسارَ المحاذاة.
   *
   * فالمقطعُ الواحدُ يذهب إلى المسارين معًا حين تُفتح بوّابةُ الحكم. وحدٌّ مشترك
   * يُستهلك في نصف الزمن، ثمّ يردّ الخادمُ 429 **للمسارين** — فينقطع وصفُ التلاوة
   * أيضًا، وهو يعمل اليوم ولا شأن له بكشف الخطأ. فيُفصل الحدّان: سقوطُ أحدهما لا
   * يُسقط الآخر.
   */
  const practiceRecognitionRateLimit:RequestHandler=rateLimit({
    windowMs:120_000,
    limit:Number(process.env.MIZAN_PRACTICE_RECOGNITION_RATE_LIMIT_MAX||90),
    standardHeaders:'draft-7',legacyHeaders:false,
    keyGenerator:(req)=>String((req as any).mizanIdentity?.uid||ipKeyGenerator(req.ip||'')),
    message:{code:'RATE_LIMITED'},
  });
  /* بطاقة الرحلة الخاصة تفتح التدريب بلا حساب. يظل لها حدّ مستقل لكل بطاقة حتى لا
     يستطيع رابطٌ واحد استهلاك محرّك الاستماع على بقية المتسابقين. ولا يدخل الرمز نفسه
     في مفاتيح السجل؛ تُستخدم بصمته فقط. */
  const journeyPracticeRateLimit:RequestHandler=rateLimit({
    windowMs:120_000,
    limit:Number(process.env.MIZAN_JOURNEY_PRACTICE_RATE_LIMIT_MAX||180),
    standardHeaders:'draft-7',legacyHeaders:false,
    // When a shared/edge limiter is configured, it is the single global authority. Keeping
    // this middleware installed but skipped avoids a second per-instance quota in Cloud Run.
    skip:()=>rateLimiterIsGlobal,
    keyGenerator:(req)=>{
      const raw=req.headers['x-mizan-journey-key'];
      const value=(Array.isArray(raw)?raw[0]:String(raw??'')).trim();
      return value?`journey:${crypto.createHash('sha256').update(value).digest('hex')}`:ipKeyGenerator(req.ip||'');
    },
    message:{code:'RATE_LIMITED'},
  });
  const publicRegistrationRateLimit:RequestHandler=rateLimit({windowMs:5*60_000,limit:Number(process.env.MIZAN_PUBLIC_REGISTRATION_RATE_LIMIT_MAX||120),standardHeaders:'draft-7',legacyHeaders:false,keyGenerator:(req)=>ipKeyGenerator(req.ip||''),message:{code:'RATE_LIMITED'},skip:()=>rateLimiterIsGlobal});
  const journeyResolveRateLimit:RequestHandler=rateLimit({windowMs:60_000,limit:Number(process.env.MIZAN_JOURNEY_RESOLVE_RATE_LIMIT_MAX||240),standardHeaders:'draft-7',legacyHeaders:false,keyGenerator:(req)=>ipKeyGenerator(req.ip||''),message:{code:'RATE_LIMITED'},skip:()=>rateLimiterIsGlobal});
  const competitionPublishRateLimit:RequestHandler=rateLimit({windowMs:60_000,limit:Number(process.env.MIZAN_COMPETITION_PUBLISH_RATE_LIMIT_MAX||60),standardHeaders:'draft-7',legacyHeaders:false,keyGenerator:(req)=>String((req as any).mizanIdentity?.uid||ipKeyGenerator(req.ip||'')),message:{code:'RATE_LIMITED'},skip:()=>rateLimiterIsGlobal});
  /* إشعار بوابة الدفع عام بلا هوية مستخدم، وثقته من توقيعه وحده. يُخنق بحدّ خاص يتّسع
     لدفعات التسوية المشروعة ويمنع إغراق نقطة عامة بمحاولات توقيع فاشلة. */
  const paymentWebhookRateLimit:RequestHandler=rateLimit({windowMs:60_000,limit:Number(process.env.MIZAN_PAYMENT_WEBHOOK_RATE_LIMIT_MAX||120),standardHeaders:'draft-7',legacyHeaders:false,message:{code:'RATE_LIMITED'},skip:()=>rateLimiterIsGlobal});
  /* التحقق من الشهادة عام بلا هوية: يُخنق لمنع تعداد أرقام الشهادات بالتخمين. */
  /* هذا الحدّ غير مشروط بغياب الحدّ العام: نقطة عامة تقرأ من القرص برقم يأتي من الطلب،
     فيبقى لها سقف خاص بها حتى مع وجود حدّ عام أوسع. */
  /*
   * تدقيق النطاق: قراءةٌ مصرَّح بها، ومع ذلك محدودة المعدّل.
   *
   * المفتاح المؤسسي يقول «من أنت» لا «كم مرة»: تسريبه أو مفتاحٌ صحيح في نصٍّ آلي معطوب
   * يستطيعان استنزاف الخادم بآلاف الطلبات، والحدّ العام على /api يُعطَّل حين تُدار الحدود
   * من طبقة خارجية. فيُعلَن الحدّ هنا صراحةً بمسار واحد، ويُخطّى — لا يُلغى — حين تملكه تلك
   * الطبقة، فيبقى الطريق مرئيًا للفحص الأمني وللقارئ معًا.
   */
  const enterpriseAuditRateLimit:RequestHandler=rateLimit({windowMs:60_000,limit:Number(process.env.MIZAN_ENTERPRISE_AUDIT_RATE_LIMIT_MAX||60),standardHeaders:'draft-7',legacyHeaders:false,message:{code:'RATE_LIMITED'},skip:()=>rateLimiterIsGlobal});
  const certificateVerifyRateLimit:RequestHandler=rateLimit({windowMs:60_000,limit:Number(process.env.MIZAN_CERTIFICATE_VERIFY_RATE_LIMIT_MAX||60),standardHeaders:'draft-7',legacyHeaders:false,message:{code:'RATE_LIMITED'}});
  /* نشر الشهادات يقع دفعة واحدة بعد ختم النتائج، فحدّه أوسع من حدّ المالك العام ومع ذلك محدود. */
  const certificatePublishRateLimit:RequestHandler=rateLimit({windowMs:60_000,limit:Number(process.env.MIZAN_CERTIFICATE_PUBLISH_RATE_LIMIT_MAX||300),standardHeaders:'draft-7',legacyHeaders:false,message:{code:'RATE_LIMITED'}});
  /*
   * النبضة أكثر كتابةٍ تكرارًا في المنتج: كل جلسة مفتوحة تطرقها مرة كل دقيقة. وبلا سقف تصير
   * أوسع باب للإغراق في الخادم كله. والسقف غير مشروط بوجود حدّ عام لأن هذه كتابةٌ على القرص
   * بمعدّل معلوم، ويبقى واسعًا عمدًا: قاعةٌ كاملة خلف عنوان واحد قد تحمل عشرات الأجهزة،
   * فالحدّ يمنع الإغراق ولا يمسّ تشغيلًا حقيقيًا.
   */
  const telemetryHeartbeatRateLimit:RequestHandler=rateLimit({windowMs:60_000,limit:Number(process.env.MIZAN_TELEMETRY_HEARTBEAT_RATE_LIMIT_MAX||600),standardHeaders:'draft-7',legacyHeaders:false,message:{code:'RATE_LIMITED'}});
  const platformOwnerOrganizationId='__platform__';
  /* نسخة ثانية من قائمة الأدوار كانت هنا. القائمة الواحدة أسلم: النسخ هو ما أسقط خمسة أدوار. */
  const governanceRoles=new Set<string>(ALL_GOVERNANCE_ROLES);
  const isGovernanceRole=(role:string):role is GovernanceRole=>governanceRoles.has(role);
  const identityFromBase=(base:{uid:string;email?:string;raw:Record<string,unknown>}):ServerIdentity|null=>{const managed=identityGovernance?.identityForUid(base.uid,base.raw.competition_id?String(base.raw.competition_id):undefined);if(managed){const operatorId=managed.grant.operatorId||saasPlatform?.operatorIdForOrganization(managed.grant.organizationId);return {uid:base.uid,email:base.email,role:managed.grant.role,organizationId:managed.grant.organizationId||(managed.grant.role==='super_admin'?platformOwnerOrganizationId:''),operatorId,competitionId:managed.grant.competitionId}}const rawRole=String(base.raw.role||'');if(!isGovernanceRole(rawRole))return null;const role=rawRole;const operatorId=base.raw.operator_id?String(base.raw.operator_id):undefined;const claimedOrganizationId=String(base.raw.org_id||'');const organizationId=claimedOrganizationId||(role==='super_admin'?platformOwnerOrganizationId:(['operator_owner','operator_admin'].includes(role)&&operatorId?operatorIdentityOrganizationId(operatorId):''));if(!organizationId)return null;return {uid:base.uid,email:base.email,role,organizationId,operatorId,competitionId:base.raw.competition_id?String(base.raw.competition_id):undefined}};
  // Owner MFA remains on by default. Tenant staff MFA is an explicit organization policy.
  const optionalStaffMfaRoles=new Set<string>(['org_admin','comp_admin','head_judge','judge','auditor']);
  const ownerMfaSetting=process.env.MIZAN_REQUIRE_MFA_FOR_SUPER_ADMIN;
  const ownerMfaRequired=ownerMfaSetting===undefined?process.env.MIZAN_REQUIRE_MFA_FOR_SENSITIVE==='true':ownerMfaSetting==='true';
  const staffMfaRequired=process.env.MIZAN_REQUIRE_MFA_FOR_SENSITIVE==='true';
  const mfaSatisfied=(base:{raw:Record<string,unknown>},role:string)=>{const required=(role==='super_admin'&&ownerMfaRequired)||(staffMfaRequired&&optionalStaffMfaRoles.has(role));return !required||firebaseSecondFactorPresent(base.raw)};
  const requireFirebaseBase:RequestHandler=async(req,res,next)=>{const raw=String(req.headers.authorization||'');if(!raw.startsWith('Bearer ')||!firebaseProjectId)return res.status(401).json({code:'IDENTITY_REQUIRED'});try{(req as any).firebaseBase=await verifyFirebaseBaseIdToken(raw.slice(7),firebaseProjectId);next()}catch(err){return res.status(401).json({code:'IDENTITY_INVALID',detail:err instanceof Error?err.message:'VERIFY_FAILED'})}};
  const tenantAccessBlocked=(identity:ServerIdentity)=>!['super_admin','operator_owner','operator_admin'].includes(identity.role)&&tenantByOrganizationId(identity.organizationId)?.status==='suspended';
  const requireGovernanceRoles=(roles:string[]):RequestHandler=>async(req,res,next)=>{const raw=String(req.headers.authorization||'');if(!raw.startsWith('Bearer ')||!firebaseProjectId)return res.status(401).json({code:'IDENTITY_REQUIRED'});try{const base=await verifyFirebaseBaseIdToken(raw.slice(7),firebaseProjectId);const identity=identityFromBase(base);if(!identity)return res.status(403).json({code:'ACCOUNT_NOT_PROVISIONED'});if(!roles.includes(identity.role))return res.status(403).json({code:'ROLE_NOT_ALLOWED'});if(tenantAccessBlocked(identity))return res.status(423).json({code:'TENANT_SUSPENDED'});if(!mfaSatisfied(base,identity.role))return res.status(403).json({code:'MFA_REQUIRED'});(req as any).firebaseBase=base;(req as any).mizanIdentity=identity;next()}catch(err){return res.status(401).json({code:'IDENTITY_INVALID',detail:err instanceof Error?err.message:'VERIFY_FAILED'})}};
  const requireFirebaseRoles=(roles:string[]):RequestHandler=>async(req,res,next)=>{const raw=String(req.headers.authorization||'');if(!raw.startsWith('Bearer ')||!firebaseProjectId)return res.status(401).json({code:'IDENTITY_REQUIRED'});try{const base=await verifyFirebaseBaseIdToken(raw.slice(7),firebaseProjectId);const identity=identityFromBase(base);if(!identity)return res.status(403).json({code:'ACCOUNT_NOT_PROVISIONED'});if(!roles.includes(identity.role))return res.status(403).json({code:'ROLE_NOT_ALLOWED'});if(tenantAccessBlocked(identity))return res.status(423).json({code:'TENANT_SUSPENDED'});if(!mfaSatisfied(base,identity.role))return res.status(403).json({code:'MFA_REQUIRED'});(req as any).firebaseBase=base;(req as any).mizanIdentity=identity;next()}catch(err){return res.status(401).json({code:'IDENTITY_INVALID',detail:err instanceof Error?err.message:'VERIFY_FAILED'})}};
  const brandR2Config=r2ConfigFromEnv();let brandAssetsR2:R2PrivateClient|null=null;try{if(brandR2Config)brandAssetsR2=new R2PrivateClient(brandR2Config)}catch(err){console.error('Brand asset R2 disabled:',err)}
  const escrowDir=process.env.MIZAN_QUESTION_ESCROW_DIR||'';const escrowMasterKey=process.env.MIZAN_QUESTION_ESCROW_MASTER_KEY||'';let questionEscrow:QuestionEscrowRepository|null=null;try{if(escrowDir&&escrowMasterKey)questionEscrow=new QuestionEscrowRepository(escrowDir,escrowMasterKey)}catch(err){console.error('Question escrow disabled:',err)}
  const quranSourceDir=process.env.MIZAN_QURAN_SOURCE_DIR||'';let serverQuranSources:ServerQuranSourceRepository|null=null;try{if(quranSourceDir)serverQuranSources=new ServerQuranSourceRepository(quranSourceDir)}catch(err){console.error('Server Quran source vault disabled:',err)}
  const quranIntelligenceDir=process.env.MIZAN_QURAN_INTELLIGENCE_DIR||(quranSourceDir?path.join(path.dirname(quranSourceDir),'quran-intelligence'):'');let quranIntelligence:QuranIntelligenceService|null=null;try{if(quranIntelligenceDir&&serverQuranSources)quranIntelligence=new QuranIntelligenceService(quranIntelligenceDir,serverQuranSources,{url:process.env.MIZAN_QURAN_ALIGNMENT_URL||'',bearerToken:process.env.MIZAN_QURAN_ALIGNMENT_BEARER_TOKEN||''})}catch(err){console.error('Quran intelligence disabled:',err)}

  /*
   * مَن يُؤذن له أن يقول للطالب «أخطأت».
   *
   * ومحرّكُ المحاذاة يعود بموضعٍ لا بنصّ، فلا يُعرف منه إسقاطُ كلمةٍ ولا إبدالُها.
   * وهذا محرّكٌ آخر يردّ كلماتٍ مسموعة، وله بوّابةٌ لكلّ رواية: تقريرُ قياسٍ لها
   * بعينها، ولا تنازلَ بينها. ومُقاسٌ لماذا: قارئُ ورشٍ يُقابَل بنصّ حفصٍ فيُخطَّأ
   * في ٥٨٪ من حركاته الصحيحة.
   *
   * وبلا مجلّد بياناتٍ لا خزانةَ تقارير، فتُغلق البوّابةُ باسم سببها بدل أن يُفترض إذن.
   */
  const asrBenchmarks=quranIntelligenceDir
    ?new AsrBenchmarkRepository(path.join(quranIntelligenceDir,'asr-benchmarks'))
    :{gate:(reading:string)=>({reading,word:'CLOSED',tashkeel:'CLOSED',modelVersion:null,reasons:['QURAN_INTELLIGENCE_NOT_CONFIGURED']} as unknown as RecitationJudgingGate)};
  const recitationRecogniser=new RecitationRecogniser({url:process.env.MIZAN_QURAN_ASR_URL||'',bearerToken:process.env.MIZAN_QURAN_ASR_BEARER_TOKEN||''},asrBenchmarks);
  const kfgqpcPageImageRoot=process.env.MIZAN_KFGQPC_PAGE_IMAGE_ROOT||'';
  const kfgqpcFontRoot=process.env.MIZAN_KFGQPC_FONT_ROOT||'';
  const kfgqpcAudioRoot=process.env.MIZAN_KFGQPC_AUDIO_ROOT||'';
  const kfgqpcDelivery=new KfgqpcDeliveryRepository({pageRoot:kfgqpcPageImageRoot,fontRoot:kfgqpcFontRoot,audioRoot:kfgqpcAudioRoot,r2BaseUrl:process.env.MIZAN_KFGQPC_R2_DELIVERY_BASE_URL||'',r2BearerToken:process.env.MIZAN_KFGQPC_R2_BEARER_TOKEN||''});
  /* نصّ العشرين يمرّ من واجهةٍ واحدة تعرف مصدر كل رواية وإسنادَها؛ الصفحات والخطوط والصوت
     تبقى على مستودع المجمع لأنها أصولُه فعلًا. */
  const quranDelivery=new MizanQuranDelivery(kfgqpcDelivery);
  const questionPoolDir=process.env.MIZAN_SERVER_QUESTION_POOL_DIR||'';let serverQuestionPools:ServerQuestionPoolRepository|null=null;try{if(questionPoolDir)serverQuestionPools=new ServerQuestionPoolRepository(questionPoolDir)}catch(err){console.error('Server question pool disabled:',err)}
  const questionRuntimeDir=process.env.MIZAN_SECURE_QUESTION_RUNTIME_DIR||'';let secureQuestionRuntime:SecureQuestionRuntimeRepository|null=null;try{if(questionRuntimeDir&&serverQuranSources&&serverQuestionPools&&questionEscrow)secureQuestionRuntime=new SecureQuestionRuntimeRepository(questionRuntimeDir,serverQuranSources,serverQuestionPools,questionEscrow)}catch(err){console.error('Secure question runtime disabled:',err)}
  let certificateRegistry:PublicCertificateRegistry|null=null;try{certificateRegistry=certificateRegistryFromEnv()}catch(err){console.error('Public certificate registry disabled:',err)}
  const witnessDir=process.env.MIZAN_WITNESS_MODE_DIR||'';let witnessMode:WitnessModeRepository|null=null;try{if(witnessDir)witnessMode=new WitnessModeRepository(witnessDir)}catch(err){console.error('Witness mode disabled:',err)}

  /* إبلاغ Google بنطاقات الجهات آليًا. بلا إعداد يبقى الربط يدويًا ولا يفشل شيء. */
  let googleDomainAuthorizer:GoogleDomainAuthorizer|null=null;
  try{googleDomainAuthorizer=googleDomainAuthorizerFromEnv()}catch(err){console.error('Google domain authorization disabled:',err)}
  /* النطاقات التي يحملها التعديل فقط: الفرعي يُبنى من النطاق الأساس، والمخصّصة كما هي. */
  const tenantDomainHosts=(patch:Record<string,unknown>):string[]=>{
    const base=String(process.env.MIZAN_BASE_DOMAIN||'').trim();
    const hosts=new Set<string>();
    const subdomain=String((patch as {subdomain?:unknown}).subdomain??'').trim();
    if(base&&subdomain)hosts.add(normalizeAuthorizedHost(`${subdomain}.${base}`));
    const custom=(patch as {customDomains?:unknown}).customDomains;
    if(Array.isArray(custom))for(const entry of custom){const host=normalizeAuthorizedHost(String(entry??''));if(host)hosts.add(host)}
    return [...hosts];
  };
  /*
   * الحفظ تمّ فعلًا ولا يُنقض بفشل الإبلاغ: تُعاد حالته ليعرف المالك أن عليه إتمامه بنفسه،
   * بدل أن يظنّ الربط تامًّا ويكتشف العطل من الجهة يوم مسابقتها. ومسارا المالك والمشغّل
   * يمرّان من هنا معًا فلا يفترقان في السلوك.
   */
  const authorizeTenantDomains=async(res:Response,outcome:{ok:true;tenant:TenantRecord}|{ok:false;errors:string[]},patch:Record<string,unknown>)=>{
    const hosts=tenantDomainHosts(patch);
    if(!hosts.length)return tenantResult(res,outcome);
    /* نطاقات الطلب تُبلَّغ دفعة واحدة: قراءةٌ واحدة وكتابةٌ واحدة، فلا يمحو نطاقٌ أخاه. */
    const domainAuthorization=googleDomainAuthorizer
      ? await googleDomainAuthorizer.authorize(hosts)
      : {state:'NOT_CONFIGURED' as const,hosts};
    return tenantResult(res,outcome,{domainAuthorization});
  };
  const coldVaultDir=process.env.MIZAN_COLD_VAULT_DIR||'';let coldVault:ColdVaultRepository|null=null;try{if(coldVaultDir)coldVault=new ColdVaultRepository(coldVaultDir)}catch(err){console.error('Cold vault disabled:',err)}
  const questionEscrowConfigured=!!questionEscrow&&!!process.env.MIZAN_PASS_SIGNING_SECRET&&!!firebaseProjectId;
  const secureQuestionRuntimeConfigured=!!secureQuestionRuntime&&questionEscrowConfigured;
  const controlTowerDir=process.env.MIZAN_CONTROL_TOWER_DIR||'';
  let controlTower:ControlTowerRepository|null=null;try{if(controlTowerDir)controlTower=new ControlTowerRepository(controlTowerDir)}catch(err){console.error('Control Tower disabled:',err)}
  const opsTelemetryDir=process.env.MIZAN_OPS_TELEMETRY_DIR||(controlTowerDir?path.join(controlTowerDir,'telemetry'):'');
  let opsTelemetry:OpsTelemetryRepository|null=null;try{if(opsTelemetryDir)opsTelemetry=new OpsTelemetryRepository(opsTelemetryDir)}catch(err){console.error('Ops telemetry disabled:',err)}
  const escrowFailure=(res:any,err:unknown)=>{const message=err instanceof Error?err.message:'ESCROW_FAILED';const forbidden=/MISMATCH|ASSIGNED_JUDGE|NOT_ALLOWED/.test(message);const missing=/NOT_FOUND/.test(message);const conflict=/NOT_RELEASED|PARTICIPANT_NOT_PRESENT|EXISTS|REVOKED|EXPIRED/.test(message);return res.status(forbidden?403:missing?404:conflict?409:400).json({code:message.split(':')[0]})};

  /*
   * نقطة خفيفة تعرض بصمة البناء الحالية على الخادم.
   * هي الحقيقة الوحيدة التي يقارنها العميل بثابت الحزمة (__BUILD_ID__)، وتُكتب في
   * dist/build-id.json عند البناء (scripts/build-stamp.mjs). في التطوير تسقط إلى 'dev'.
   */
  let cachedBuildId='';
  const currentBuildId=()=>{if(cachedBuildId)return cachedBuildId;try{cachedBuildId=String(JSON.parse(fs.readFileSync(path.join(process.cwd(),'dist','build-id.json'),'utf8')).build||'')}catch{cachedBuildId=''}if(!cachedBuildId)cachedBuildId=process.env.BUILD_ID||'dev';return cachedBuildId};
  app.get('/api/version',(_req,res)=>{res.setHeader('Cache-Control','no-store, no-cache, must-revalidate');res.json({build:currentBuildId()})});

  /*
   * مرجع الوقت.
   *
   * نقطةٌ واحدة، بلا حالة، وبلا مصادقة: كل جهاز قاعةٍ يسألها فيقيس فرق ساعته عنها بطريقة
   * الرحلة والعودة (انظر src/lib/trusted-time.ts). ومن غير مرجعٍ كهذا تبقى مدة الحجز
   * وعدًا صادقًا ما اتفقت الساعات، كاذبًا بقدر انحرافها.
   *
   * ولا تُخزَّن هنا ثقة: الجواب وقتُ هذا الخادم لحظةَ الردّ، والجهاز هو الذي يحسب شكّه.
   */
  app.get('/api/time',(_req,res)=>{const now=Date.now();res.set('Cache-Control','no-store');res.json({serverEpochMs:now,serverIso:new Date(now).toISOString(),authority:'MIZAN-TIME-AUTHORITY-1'})});
  /*
   * كتابة المطالبات هي الحلقة التي إن انقطعت لم يعمل الوضع السحابي لأي حساب، ولم يُصلحه
   * زرُّ إصلاحٍ في أي شاشة — والعلّة في النشر لا في الحساب. فلا تُترك مسكوتًا عنها في
   * تقرير الصحة: تُسأل هنا مرةً ويُقرأ جوابها في شاشة التشخيص.
   */
  app.get('/api/health',async(_req,res)=>{
    /* «غير معلوم» يُنقل كما هو (null) ولا يُسوّى بـ«لا يستطيع»: عطلٌ عارض ليس سوءَ تهيئة،
       واتهام نشرٍ سليم به يُرسل صاحبه إلى إصلاح ما ليس معطوبًا. */
    const claimsState=await claimsWritability().catch(()=>'UNKNOWN' as const);
    const identityClaimsWritable=claimsState==='UNKNOWN'?null:claimsState==='WRITABLE';const notificationProviderConfigured=['EMAIL','SMS','WHATSAPP','PUSH'].some(c=>!!process.env[`MIZAN_${c}_PROVIDER_URL`])||!!process.env.MIZAN_NOTIFICATION_PROVIDER;const telemetry=opsTelemetry?.summary({providerConfigured:notificationProviderConfigured});res.json({status:'ok',system:'MIZAN',version:'5.0.0',aiCriticalPath:false,quranSourcePolicy:'approved-vault-only',backendAvailable:true,buildIdKnown:!!currentBuildId(),firebaseProjectConfigured:!!firebaseProjectId,identityClaimsWritable,enterpriseApiConfigured:!!process.env.MIZAN_ENTERPRISE_API_KEY,passSigningConfigured:!!process.env.MIZAN_PASS_SIGNING_SECRET,certificateSigningConfigured:!!process.env.MIZAN_CERT_SIGNING_SECRET,trustSigningConfigured:!!trustSigner(),edgeRelayConfigured:!!process.env.MIZAN_EDGE_DATA_DIR,notificationProviderConfigured,backgroundJobsConfigured:!!opsTelemetry,liveCompetitionTelemetryConfigured:!!opsTelemetry,opsTelemetryConfigured:!!opsTelemetry,connectedUsers:telemetry?.connectedUsers??null,connectedDevices:telemetry?.connectedDevices??null,liveCompetitions:telemetry?.liveCompetitions??null,backgroundJobs:telemetry?.backgroundJobs??null,notificationTelemetry:telemetry?.notifications??null,questionEscrowConfigured,identityGovernanceConfigured:!!identityGovernance,integrityAuthorityConfigured:!!integrityAuthority,integrityAuthorityStatus:integrityAuthority?'ENABLED':'code' in authorityDurability?authorityDurability.code:'ERROR',serverAuditLedgerConfigured:!!serverAuditLedger||!!durableAuditLedger,auditLedgerDurability:auditLedgerDurability(),auditAppendFailures,serverQuranSourceVaultConfigured:!!serverQuranSources,quranIntelligenceConfigured:!!quranIntelligence,tenantSelfServiceConfigured:!!tenantStore&&!process.env.MIZAN_TENANTS,tenantCount:tenantRegistry().length,controlTowerConfigured:!!controlTower,quranAlignmentShadowConfigured:!!process.env.MIZAN_QURAN_ALIGNMENT_URL,quranPracticeListenerConfigured:journeyListeningReady('hafs'),quranPracticeListener:_req.query?.listener==='1'?await practiceListenerHealth():practiceListenerHealthCached(),quranMuaalem:_req.query?.listener==='1'?await muaalemHealth():muaalemHealthCached(),secureQuestionRuntimeConfigured,time:new Date().toISOString()})});
  app.get('/api/capabilities',(_req,res)=>res.json({judging:{humanAuthority:true,aiCanAffectScore:false},quran:{sourceOfTruth:'approved-vault-only',intelligenceMode:quranIntelligence?'KFGQPC_FAIL_CLOSED':'NOT_CONFIGURED',alignmentMode:'SHADOW_ONLY'},deployment:['cloud','private-cloud','sovereign-on-premise'],externalDependencies:{identity:!!process.env.FIREBASE_PROJECT_ID,enterpriseApi:!!process.env.MIZAN_ENTERPRISE_API_KEY,copilot:!!process.env.MIZAN_COPILOT_URL,integrityAI:!!process.env.MIZAN_AI_INTEGRITY_URL,trustSigning:!!trustSigner(),edgeRelay:!!process.env.MIZAN_EDGE_DATA_DIR,questionEscrow:questionEscrowConfigured,identityGovernance:!!identityGovernance,serverAuditLedger:!!serverAuditLedger,serverQuranSourceVault:!!serverQuranSources,quranIntelligence:!!quranIntelligence,quranAlignmentShadowBackend:!!process.env.MIZAN_QURAN_ALIGNMENT_URL,serverFairDraw:secureQuestionRuntimeConfigured,serverQuranResolution:secureQuestionRuntimeConfigured,silentQuestionCapsule:secureQuestionRuntimeConfigured,officialMushafPageAssets:!!kfgqpcPageImageRoot,officialQuranFonts:!!kfgqpcFontRoot,measuredWordTimingRecordings:wordTimings?wordTimings.recordings():[],witnessMode:!!witnessMode,serverQuorumAuthority:!!integrityAuthority,serverFairDrawCommitReveal:!!integrityAuthority,coldVault:!!coldVault,exposureRadius:secureQuestionRuntimeConfigured,questionLeakageCanary:questionEscrowConfigured}}));

  // Organization/competition logos use the already-configured private R2 bucket. Only the bytes are public; writes remain Firebase-authorized and tenant-scoped.
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
    return /<svg(?:\s|>)/i.test(svg)&&!/<\s*(?:script|foreignObject|iframe|object|embed)\b/i.test(svg)&&!/(?:\son[a-z]+\s*=|javascript\s*:)/i.test(svg)
      /* External references (href/xlink:href/src to a URL, or CSS @import/url(http…)) turn a
         stored logo into a tracking pixel or data-exfiltration channel wherever the SVG is
         rendered inline. Only fragment references (#id) and data: images stay allowed. */
      &&!/(?:xlink:href|href|src)\s*=\s*["'](?!#|data:image\/)[^"']/i.test(svg)
      &&!/@import|url\s*\(\s*["']?\s*(?:https?:)?\/\//i.test(svg);
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

  // Licensed modules are a tenant entitlement, not an identity grant. Organization administrators may
  // read only their own licensing projection; the platform owner may inspect a requested tenant.
  app.get('/api/identity/entitlements',requireGovernanceRoles(['super_admin','org_admin','comp_admin','auditor']),(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    const actor=(req as any).mizanIdentity as ServerIdentity;
    const requested=String(req.query.organizationId||'');
    const organizationId=actor.role==='super_admin'&&requested?requested:actor.organizationId;
    if(actor.role!=='super_admin'&&organizationId!==actor.organizationId)return res.status(403).json({code:'ENTITLEMENT_SCOPE_NOT_ALLOWED'});
    const commercial=repo.listCommercial().find(x=>x.tenantId===organizationId)||null;
    res.setHeader('Cache-Control','no-store');
    return res.json({organizationId,licensedModules:commercial?.licensedModules||[],plan:commercial?.plan||null,subscriptionStatus:commercial?.subscriptionStatus||null,updatedAt:commercial?.updatedAt||null});
  });

  // Named-account identity governance. MIZAN stores no passwords; a verified Firebase identity is bound once to a scoped MIZAN invitation.
  // Password recovery is deliberately administrator-mediated: no Firebase recovery email is sent.
  // The public request is enumeration-safe; unknown emails receive the same acknowledgement.
  app.post('/api/identity/password-reset/request',sensitiveIdentityRateLimit,(req,res)=>{
    if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});
    const email=String(req.body?.email||'').trim();
    try{const request=identityGovernance.requestPasswordReset(email);if(request&&notificationCenter){const target:NotificationTarget=request.reviewerRole==='super_admin'?{type:'role',role:'super_admin'}:request.reviewerRole==='operator_owner'?{type:'role',role:'operator_owner',operatorId:request.operatorId}:{type:'role',role:'org_admin',organizationId:request.organizationId};const q=new URLSearchParams({tab:'passwords',requestId:request.id,organizationId:request.organizationId});if(request.operatorId)q.set('operatorId',request.operatorId);if(request.competitionId)q.set('competitionId',request.competitionId);notificationCenter.system({title:'طلب تغيير كلمة مرور يحتاج إجراء',body:`${request.displayName} طلب تعيين كلمة مرور جديدة. افتح الهوية والصلاحيات لإنشاء رابط آمن لمرة واحدة.`,category:'identity',priority:'important',target,context:{operatorId:request.operatorId,organizationId:request.organizationId,competitionId:request.competitionId,entityType:'PasswordResetRequest',entityId:request.id},actionHref:`#identity?${q.toString()}`,actionLabel:'فتح الطلب',dedupeKey:`password-reset:${request.id}`})}}catch{/* Keep account existence private. */}
    return res.status(202).json({accepted:true,message:'تم إرسال الطلب إلى المسؤول إن كان الحساب مسجلاً ونشطًا.'});
  });
  app.post('/api/identity/password-reset/:id/issue',sensitiveIdentityRateLimit,requireGovernanceRoles(['super_admin','operator_owner','org_admin']),async(req,res)=>{
    if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});
    try{
      const actor=(req as any).mizanIdentity as ServerIdentity;const request=identityGovernance.authorizePasswordResetIssue(actor,String(req.params.id));
      const generated=await generateIdentityPlatformPasswordReset(firebaseProjectId,request.email,String(req.ip||''));
      const shareToken=crypto.randomBytes(32).toString('base64url');const expiresAt=new Date(Date.now()+30*60_000).toISOString();
      const configuredOrigin=String(process.env.MIZAN_PUBLIC_APP_ORIGIN||'').trim();let origin='';
      if(configuredOrigin){const u=new URL(configuredOrigin);if(!['http:','https:'].includes(u.protocol))throw new Error('PASSWORD_RESET_LINK_UNAVAILABLE');origin=u.origin;}
      else {const headerOrigin=String(req.headers.origin||'');if(headerOrigin){const u=new URL(headerOrigin);if(['http:','https:'].includes(u.protocol)&&u.hostname===req.hostname)origin=u.origin;}if(!origin)origin=`${req.protocol}://${req.get('host')}`;}
      const resetUrl=`${origin}/#reset-password?oobCode=${encodeURIComponent(generated.oobCode)}&rid=${encodeURIComponent(request.id)}&rt=${encodeURIComponent(shareToken)}`;
      const updated=identityGovernance.markPasswordResetIssued(actor,request.id,shareToken,expiresAt);
      return res.status(201).json({request:updated,resetUrl,expiresAt});
    }catch(err){return res.status(400).json({code:err instanceof Error?err.message:'PASSWORD_RESET_LINK_UNAVAILABLE'});}
  });
  app.delete('/api/identity/password-reset/:id',sensitiveIdentityRateLimit,requireGovernanceRoles(['super_admin','operator_owner','org_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{return res.json(identityGovernance.revokePasswordReset(scopedMizanIdentity(req),String(req.params.id),String(req.body?.reason||'Password reset request cancelled by authorized administrator')))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'PASSWORD_RESET_REVOKE_FAILED'})}});
  app.post('/api/identity/password-reset/validate',sensitiveIdentityRateLimit,(req,res)=>{
    if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});
    try{return res.json(identityGovernance.validatePasswordResetShare(String(req.body?.requestId||''),String(req.body?.token||'')));}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'PASSWORD_RESET_TOKEN_INVALID'});}
  });
  app.post('/api/identity/password-reset/used',sensitiveIdentityRateLimit,(req,res)=>{
    if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});
    try{return res.json(identityGovernance.consumePasswordResetShare(String(req.body?.requestId||''),String(req.body?.token||'')));}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'PASSWORD_RESET_TOKEN_INVALID'});}
  });

  app.post('/api/identity/invitation/preview',sensitiveIdentityRateLimit,(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{return res.json({invitation:identityGovernance.previewInvitation(String(req.body?.activationToken||''))})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'ACTIVATION_TOKEN_INVALID'})}});
  app.get('/api/identity/me',requireFirebaseBase,(req,res)=>{const base=(req as any).firebaseBase as {uid:string;email?:string;raw:Record<string,unknown>};const managed=identityGovernance?.identityForUid(base.uid)||null;const identity=identityFromBase(base);if(!identity)return res.status(404).json({code:'ACCOUNT_NOT_PROVISIONED'});if(!mfaSatisfied(base,identity.role))return res.status(403).json({code:'MFA_REQUIRED'});let session:any=undefined;if(identityGovernance&&managed){const deviceId=String(req.headers['x-mizan-device-id']||'');if(deviceId){try{session=identityGovernance.openSession(identity,deviceId,String(req.headers['x-mizan-device-name']||''),firebaseSecondFactorPresent(base.raw)?'MFA':'SINGLE_FACTOR')}catch(err){const code=err instanceof Error?err.message:'SESSION_FAILED';if(code==='PRIVILEGED_SESSION_CONFLICT')return res.status(409).json({code});return res.status(400).json({code})}}}res.json({identity,session,managed:!!managed});});
  /*
   * مزامنة مطالبات Firestore بعد كل تغيير في التخويل.
   *
   * قواعد Firestore لا ترى سجلّ ميزان؛ ترى مطالبات الرمز وحدها. فما لم تُكتب هنا، يبقى
   * الحساب مخوَّلًا في ميزان ومرفوضًا في قاعدة البيانات — وهو ما كان يقع فعلًا.
   *
   * ولا تُفشل النداء الذي استدعتها: حسابٌ فُعِّل ولم تُكتب مطالباته أفضل من حسابٍ لم
   * يُفعَّل؛ والإخفاق يُسجَّل ولا يُبتلع.
   */
  const syncIdentityClaims=async(uid:string)=>{
    if(!identityGovernance||!uid)return;
    try{
      const grant=identityGovernance.claimsForUid(uid);
      const outcome=await writeIdentityClaims(uid,grant?claimsFromGrant(grant):null);
      if(outcome.status==='FAILED')console.error('MIZAN claim sync failed',{uid,reason:outcome.reason});
    }catch(err){console.error('MIZAN claim sync error:',err instanceof Error?err.message:err)}
  };
  /** التعديل يقع على تخويل؛ وصاحبه هو من تُعاد كتابة مطالباته. */
  const syncClaimsForGrant=(grantId:string)=>{
    const uid=identityGovernance?.uidForGrant(grantId);
    if(uid)void syncIdentityClaims(uid);
  };

  /*
   * إصلاح ذاتي آمن لمطالبات الحساب الحالي. لا يمنح هذا المسار أي دور جديد: المصدر
   * الوحيد هو grant الموجود أصلًا في Identity Governance، والمستخدم لا يستطيع اختيار
   * الدور أو الجهة أو المسابقة. فائدته للحسابات القديمة التي فُعّلت قبل جسر Firestore.
   */
  app.post('/api/identity/refresh-claims',sensitiveIdentityRateLimit,requireFirebaseBase,async(req,res)=>{
    if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});
    const base=(req as any).firebaseBase as {uid:string};
    const grant=identityGovernance.claimsForUid(base.uid);
    if(!grant)return res.status(404).json({code:'ACCOUNT_NOT_PROVISIONED'});
    const outcome=await writeIdentityClaims(base.uid,claimsFromGrant(grant));
    if(outcome.status==='NOT_CONFIGURED')return res.status(503).json({code:'IDENTITY_CLAIMS_NOT_CONFIGURED'});
    if(outcome.status==='FAILED')return res.status(503).json({code:'IDENTITY_CLAIMS_SYNC_FAILED',reason:outcome.reason});
    return res.json({ok:true,status:outcome.status});
  });

  app.post('/api/identity/activate',sensitiveIdentityRateLimit,requireFirebaseBase,async(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});const base=(req as any).firebaseBase as {uid:string;email?:string};try{const result=identityGovernance.activate(base,String(req.body?.activationToken||''));
    /* تُنتظر كتابة المطالبات قبل الردّ: العميل يُجدّد رمزه فور نجاح التفعيل، فلو كُتبت بعده
       لعاد برمزٍ بلا مطالبات وظلّ مرفوضًا حتى انتهاء صلاحيته. */
    await syncIdentityClaims(base.uid);if(notificationCenter){notificationCenter.system({title:'تم تفعيل دخولك إلى ميزان',body:`تم تفعيل صلاحية ${result.grant.role} بنجاح. أصبحت مساحة عملك جاهزة.`,category:'identity',priority:'normal',target:{type:'user',userId:base.uid},context:{operatorId:result.grant.operatorId,organizationId:result.grant.organizationId,competitionId:result.grant.competitionId,entityType:'Grant',entityId:result.grant.id},actionHref:'#',actionLabel:'فتح مساحة العمل',dedupeKey:`identity-activated:${result.grant.id}`})}res.status(201).json(result)}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'ACTIVATION_FAILED'})}});
  app.post('/api/identity/session/takeover',sensitiveIdentityRateLimit,requireFirebaseBase,(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});const base=(req as any).firebaseBase as {uid:string;email?:string;raw:Record<string,unknown>};const identity=identityFromBase(base);if(!identity)return res.status(404).json({code:'ACCOUNT_NOT_PROVISIONED'});if(!mfaSatisfied(base,identity.role))return res.status(403).json({code:'MFA_REQUIRED'});const deviceId=String(req.headers['x-mizan-device-id']||'');if(!deviceId)return res.status(400).json({code:'DEVICE_ID_REQUIRED'});try{const session=identityGovernance.takeoverSession(identity,deviceId,String(req.headers['x-mizan-device-name']||''),firebaseSecondFactorPresent(base.raw)?'MFA':'SINGLE_FACTOR');return res.json({identity,session})}catch(err){return res.status(403).json({code:err instanceof Error?err.message:'SESSION_TAKEOVER_FAILED'})}});
  app.get('/api/identity/governance',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin','auditor']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.list(scopedMizanIdentity(req),req.query.organizationId?String(req.query.organizationId):undefined,req.query.competitionId?String(req.query.competitionId):undefined,req.query.operatorId?String(req.query.operatorId):undefined))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'IDENTITY_LIST_FAILED'})}});
  app.post('/api/identity/invitations',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{const actor=scopedMizanIdentity(req);const requestedRole=String(req.body?.requestedRole||'') as GovernanceRole;const operatorId=req.body?.operatorId?String(req.body.operatorId):undefined;const organizationId=req.body?.organizationId?String(req.body.organizationId):undefined;if(['operator_owner','operator_admin'].includes(requestedRole)&&(!operatorId||!saasPlatform?.operatorExists(operatorId)))throw new Error('OPERATOR_NOT_FOUND');if(requestedRole==='org_admin'&&['operator_owner','operator_admin'].includes(actor.role)&&(!organizationId||!actor.operatorId||!saasPlatform?.organizationBelongsToOperator(organizationId,actor.operatorId)))throw new Error('CROSS_OPERATOR_ORGANIZATION_BLOCKED');res.status(201).json(identityGovernance.createInvitation(actor,{email:String(req.body?.email||''),displayName:String(req.body?.displayName||''),requestedRole,operatorId,organizationId,competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,committeeId:req.body?.committeeId?String(req.body.committeeId):undefined,reason:String(req.body?.reason||'')}))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'INVITATION_FAILED'})}});
  app.patch('/api/identity/invitations/:id',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{const requestedRole=req.body?.requestedRole?String(req.body.requestedRole) as GovernanceRole:undefined;return res.json(identityGovernance.updateInvitation(scopedMizanIdentity(req),String(req.params.id),{displayName:req.body?.displayName===undefined?undefined:String(req.body.displayName),email:req.body?.email===undefined?undefined:String(req.body.email),requestedRole}))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'INVITATION_UPDATE_FAILED'})}});
  app.post('/api/identity/invitations/:id/reissue',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{return res.json(identityGovernance.reissueInvitation(scopedMizanIdentity(req),String(req.params.id)))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'INVITATION_REISSUE_FAILED'})}});
  app.delete('/api/identity/invitations/:id',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{return res.json(identityGovernance.revokeInvitation(scopedMizanIdentity(req),String(req.params.id),String(req.body?.reason||'Pending invitation cancelled by authorized administrator')))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'INVITATION_REMOVE_FAILED'})}});
  app.post('/api/identity/invitations/:id/approve',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.approveInvitation(scopedMizanIdentity(req),String(req.params.id)))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'APPROVAL_FAILED'})}});
  app.patch('/api/identity/accounts/:id',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{return res.json(identityGovernance.updateAccount(scopedMizanIdentity(req),String(req.params.id),{displayName:req.body?.displayName===undefined?undefined:String(req.body.displayName)}))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'ACCOUNT_UPDATE_FAILED'})}});
  app.post('/api/identity/accounts/:id/suspend',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.suspend(scopedMizanIdentity(req),String(req.params.id),String(req.body?.reason||'')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'SUSPEND_FAILED'})}});
  app.post('/api/identity/accounts/:id/resume',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{return res.json(identityGovernance.resumeAccount(scopedMizanIdentity(req),String(req.params.id),String(req.body?.reason||'')))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'RESUME_FAILED'})}});
  app.delete('/api/identity/accounts/:id',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.remove(scopedMizanIdentity(req),String(req.params.id),String(req.body?.reason||'User removed by authorized administrator')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'REMOVE_FAILED'})}});
  /*
   * تغييرُ الصلاحية يُكتب في السجلّ الذي يقرؤه المدقّق.
   *
   * `identity-governance` يفصل في التغيير ويكتب أثرَه — لكن في سجلّ حوكمة الهوية وحده.
   * فمن يفتح `/api/audit/ledger` عند النزاع لا يرى تغييرَ صلاحيةٍ قطّ، وهو أوّلُ ما
   * يُسأل عنه: من أعطى فلانًا هذا الدور، ومتى. فيُكتب هنا أيضًا، من حيث يقع.
   */
  const auditRoleChange=(req:any,grantId:string,summary:string,reason?:string)=>{
    const actor=(req as any).mizanIdentity as ServerIdentity;
    auditAppend(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId:String(actor.competitionId||actor.organizationId),action:'ROLE_CHANGED',entityType:'RoleGrant',entityId:grantId,reason:`${summary}${reason?` · ${String(reason).slice(0,400)}`:''}`,requestId:String(req.headers['x-request-id']||'')});
  };
  app.patch('/api/identity/grants/:id',sensitiveIdentityRateLimit,requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{const id=String(req.params.id),body=req.body||{},role=String(body.role||'') as GovernanceRole,reason=String(body.reason||'Authorized grant role update'),actor=scopedMizanIdentity(req);const out=res.json(identityGovernance.updateGrant(actor,id,{role,reason}));syncClaimsForGrant(id);auditRoleChange(req,String(req.params.id),'GRANT_ROLE_UPDATED',req.body?.reason);return out}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'GRANT_UPDATE_FAILED'})}});
  app.post('/api/identity/grants/:id/suspend',sensitiveIdentityRateLimit,requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.suspendGrant(scopedMizanIdentity(req),String(req.params.id),String(req.body?.reason||'')));syncClaimsForGrant(String(req.params.id));auditRoleChange(req,String(req.params.id),'GRANT_SUSPENDED',req.body?.reason)}catch(err){res.status(400).json({code:err instanceof Error?err.message:'GRANT_SUSPEND_FAILED'})}});
  app.post('/api/identity/grants/:id/resume',sensitiveIdentityRateLimit,requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.resumeGrant(scopedMizanIdentity(req),String(req.params.id),String(req.body?.reason||'')));syncClaimsForGrant(String(req.params.id));auditRoleChange(req,String(req.params.id),'GRANT_RESUMED',req.body?.reason)}catch(err){res.status(400).json({code:err instanceof Error?err.message:'GRANT_RESUME_FAILED'})}});
  app.post('/api/identity/grants/:id/reissue-qr',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.reissueQr(scopedMizanIdentity(req),String(req.params.id)))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'QR_REISSUE_FAILED'})}});
  app.delete('/api/identity/grants/:id',sensitiveIdentityRateLimit,requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.removeGrant(scopedMizanIdentity(req),String(req.params.id),String(req.body?.reason||'Competition access removed by authorized administrator')));syncClaimsForGrant(String(req.params.id));auditRoleChange(req,String(req.params.id),'GRANT_REMOVED',req.body?.reason)}catch(err){res.status(400).json({code:err instanceof Error?err.message:'GRANT_REMOVE_FAILED'})}});
  app.post('/api/identity/grants/:id/revoke-sessions',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin','head_judge']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.revokeGrantSessions(scopedMizanIdentity(req),String(req.params.id),String(req.body?.reason||'')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'SESSION_REVOKE_FAILED'})}});
  app.post('/api/identity/accounts/:id/revoke-sessions',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin','head_judge']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.revokeSessions(scopedMizanIdentity(req),String(req.params.id),String(req.body?.reason||'')))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'SESSION_REVOKE_FAILED'})}});
  app.get('/api/identity/audit',requireGovernanceRoles(['super_admin','operator_owner','operator_admin','org_admin','comp_admin','auditor']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json({rows:identityGovernance.audit((req as any).mizanIdentity,Number(req.query.limit||500)),verification:identityGovernance.verifyAudit((req as any).mizanIdentity.organizationId)})}catch(err){res.status(400).json({code:err instanceof Error?err.message:'AUDIT_FAILED'})}});
  app.post('/api/identity/competitions/:id/close',requireGovernanceRoles(['super_admin','org_admin']),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{res.json(identityGovernance.closeCompetitionAccess((req as any).mizanIdentity,String(req.params.id),String(req.body?.reason||'Competition completed and permanently closed'),req.body?.organizationId?String(req.body.organizationId):undefined))}catch(err){res.status(400).json({code:err instanceof Error?err.message:'COMPETITION_CLOSE_FAILED'})}});

  // Unified in-app notification center. Scope is checked against the same managed identity spine used by every other protected API.
  const notificationSenders=new Set<string>(['super_admin','support_agent','operator_owner','operator_admin','org_admin','comp_admin']);
  const notificationRecipientDirectory=(actor:ServerIdentity)=>identityGovernance?.notificationRecipients(actor)||[];
  const notificationRecipient=(actor:ServerIdentity,uid:string)=>notificationRecipientDirectory(actor).find(x=>x.userId===uid)||null;
  const assertNotificationTarget=(actor:ServerIdentity,target:NotificationTarget)=>{
    if(!notificationSenders.has(actor.role))throw new Error('NOTIFICATION_SEND_NOT_ALLOWED');
    const globalSender=actor.role==='super_admin'||actor.role==='support_agent';if(target.type==='all'){if(!globalSender)throw new Error('NOTIFICATION_SCOPE_NOT_ALLOWED');return}
    const assertOrg=(organizationId?:string)=>{if(!organizationId)throw new Error('NOTIFICATION_ORGANIZATION_REQUIRED');if(globalSender)return;if(['operator_owner','operator_admin'].includes(actor.role)){if(!actor.operatorId||!saasPlatform?.organizationBelongsToOperator(organizationId,actor.operatorId))throw new Error('CROSS_OPERATOR_ACCESS_BLOCKED');return}if(organizationId!==actor.organizationId)throw new Error('CROSS_TENANT_ACCESS_BLOCKED')};
    const assertOperator=(operatorId?:string)=>{if(!operatorId)throw new Error('NOTIFICATION_OPERATOR_REQUIRED');if(globalSender)return;if(!['operator_owner','operator_admin'].includes(actor.role)||actor.operatorId!==operatorId)throw new Error('CROSS_OPERATOR_ACCESS_BLOCKED')};
    const assertCompetition=()=>{if(target.organizationId)assertOrg(target.organizationId);else if(!globalSender&&['org_admin','comp_admin'].includes(actor.role))target.organizationId=actor.organizationId;else if(!globalSender&&['operator_owner','operator_admin'].includes(actor.role))throw new Error('NOTIFICATION_ORGANIZATION_REQUIRED');if(actor.role==='comp_admin'&&actor.competitionId&&target.competitionId!==actor.competitionId)throw new Error('CROSS_COMPETITION_ACCESS_BLOCKED')};
    const assertUser=(uid:string)=>{if(!notificationRecipient(actor,uid))throw new Error('NOTIFICATION_TARGET_USER_NOT_FOUND')};
    if(target.type==='operator')return assertOperator(target.operatorId);
    if(target.type==='organization')return assertOrg(target.organizationId);
    if(target.type==='competition'){if(!target.competitionId)throw new Error('NOTIFICATION_COMPETITION_REQUIRED');return assertCompetition()}
    if(target.type==='role'){if(!target.role)throw new Error('NOTIFICATION_ROLE_REQUIRED');if(target.operatorId)return assertOperator(target.operatorId);if(target.organizationId||['org_admin','comp_admin'].includes(actor.role))return assertOrg(target.organizationId||actor.organizationId);if(['operator_owner','operator_admin'].includes(actor.role)){target.operatorId=actor.operatorId;return assertOperator(target.operatorId)}if(!globalSender)throw new Error('NOTIFICATION_SCOPE_NOT_ALLOWED');return}
    if(target.type==='user'){if(!target.userId)throw new Error('NOTIFICATION_USER_REQUIRED');return assertUser(target.userId)}
    if(target.type==='users'){const ids=target.userIds||[];if(!ids.length)throw new Error('NOTIFICATION_USERS_REQUIRED');ids.forEach(assertUser);return}
    throw new Error('NOTIFICATION_TARGET_INVALID');
  };
  const notificationContextFromTarget=(actor:ServerIdentity,target:NotificationTarget)=>{
    if(target.type==='operator')return {operatorId:target.operatorId};
    if(target.type==='organization')return {organizationId:target.organizationId,operatorId:target.organizationId?saasPlatform?.operatorIdForOrganization(target.organizationId):undefined};
    if(target.type==='competition')return {competitionId:target.competitionId,organizationId:target.organizationId,operatorId:target.organizationId?saasPlatform?.operatorIdForOrganization(target.organizationId):undefined};
    if(target.type==='role')return {operatorId:target.operatorId,organizationId:target.organizationId,competitionId:target.competitionId};
    const contextForRecipient=(x:ReturnType<typeof notificationRecipient>)=>x?{operatorId:x.operatorId,organizationId:x.organizationId,competitionId:x.competitionIds.length===1?x.competitionIds[0]:undefined}:undefined;
    if(target.type==='user'&&target.userId)return contextForRecipient(notificationRecipient(actor,target.userId));
    if(target.type==='users'&&target.userIds?.length){const recipients=target.userIds.map(uid=>notificationRecipient(actor,uid)).filter(Boolean) as NonNullable<ReturnType<typeof notificationRecipient>>[];if(!recipients.length)return undefined;const same=(key:'operatorId'|'organizationId')=>recipients.every(x=>x[key]===recipients[0][key])?recipients[0][key]:undefined;const competitionIds=[...new Set(recipients.flatMap(x=>x.competitionIds))];return {operatorId:same('operatorId'),organizationId:same('organizationId'),competitionId:competitionIds.length===1?competitionIds[0]:undefined}}
    return undefined;
  };
  const notificationContextLabel=(n:any)=>{const context=n.context||{};if(context.label)return context.label;if(context.competitionId){const org=context.organizationId?saasPlatform?.organizationName(context.organizationId):undefined;return org?`${org} · ${context.competitionId}`:context.competitionId}if(context.organizationId)return saasPlatform?.organizationName(context.organizationId)||context.organizationId;if(context.operatorId)return saasPlatform?.operatorName(context.operatorId)||context.operatorId;return 'MIZAN'};
  app.get('/api/notifications',requireGovernanceRoles(Array.from(governanceRoles)),(req,res)=>{if(!notificationCenter)return res.status(503).json({code:'NOTIFICATION_CENTER_NOT_CONFIGURED'});try{const listed=notificationCenter.list((req as any).mizanIdentity);return res.json({...listed,notifications:listed.notifications.map(n=>({...n,contextLabel:notificationContextLabel(n)}))})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'NOTIFICATION_LIST_FAILED'})}});
  app.get('/api/notifications/recipients',requireGovernanceRoles(Array.from(notificationSenders)),(req,res)=>{if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});try{const actor=scopedMizanIdentity(req);const recipients=identityGovernance.notificationRecipients(actor).map(x=>({...x,operatorName:x.operatorId?saasPlatform?.operatorName(x.operatorId):undefined,organizationName:saasPlatform?.organizationName(x.organizationId)}));return res.json({recipients})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'NOTIFICATION_RECIPIENTS_FAILED'})}});
  app.post('/api/notifications',sensitiveIdentityRateLimit,requireGovernanceRoles(Array.from(notificationSenders)),(req,res)=>{if(!notificationCenter)return res.status(503).json({code:'NOTIFICATION_CENTER_NOT_CONFIGURED'});try{const actor=scopedMizanIdentity(req);let target={...(req.body?.target||{})} as NotificationTarget;let context:any;const replyToId=req.body?.replyToNotificationId?String(req.body.replyToNotificationId):'';if(replyToId){const original=notificationCenter.list(actor).notifications.find(x=>x.id===replyToId);if(!original||!original.createdBy||original.createdBy==='MIZAN_SYSTEM')throw new Error('NOTIFICATION_REPLY_NOT_ALLOWED');target={type:'user',userId:original.createdBy};context=original.context||notificationContextFromTarget(actor,original.target)}else{assertNotificationTarget(actor,target);context=notificationContextFromTarget(actor,target)}return res.status(201).json(notificationCenter.publish(actor,{title:String(req.body?.title||''),body:String(req.body?.body||''),category:req.body?.category,priority:req.body?.priority,target,senderName:String(req.body?.senderName||''),actionHref:req.body?.actionHref?String(req.body.actionHref):undefined,actionLabel:req.body?.actionLabel?String(req.body.actionLabel):undefined,context,dedupeKey:req.body?.dedupeKey?String(req.body.dedupeKey):undefined,expiresAt:req.body?.expiresAt?String(req.body.expiresAt):undefined}))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'NOTIFICATION_SEND_FAILED'})}});
  app.post('/api/notifications/read-all',requireGovernanceRoles(Array.from(governanceRoles)),(req,res)=>{if(!notificationCenter)return res.status(503).json({code:'NOTIFICATION_CENTER_NOT_CONFIGURED'});try{return res.json(notificationCenter.markAllRead((req as any).mizanIdentity,req.body?.contextKey?String(req.body.contextKey):undefined))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'NOTIFICATION_UPDATE_FAILED'})}});
  app.post('/api/notifications/:id/read',requireGovernanceRoles(Array.from(governanceRoles)),(req,res)=>{if(!notificationCenter)return res.status(503).json({code:'NOTIFICATION_CENTER_NOT_CONFIGURED'});try{const identity=(req as any).mizanIdentity as ServerIdentity;const visible=notificationCenter.list(identity).notifications.some(x=>x.id===String(req.params.id));if(!visible)return res.status(404).json({code:'NOTIFICATION_NOT_FOUND'});return res.json(notificationCenter.markRead(identity.uid,String(req.params.id)))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'NOTIFICATION_UPDATE_FAILED'})}});
  app.post('/api/notifications/:id/archive',requireGovernanceRoles(Array.from(governanceRoles)),(req,res)=>{if(!notificationCenter)return res.status(503).json({code:'NOTIFICATION_CENTER_NOT_CONFIGURED'});try{const identity=(req as any).mizanIdentity as ServerIdentity;const visible=notificationCenter.list(identity).notifications.some(x=>x.id===String(req.params.id));if(!visible)return res.status(404).json({code:'NOTIFICATION_NOT_FOUND'});return res.json(notificationCenter.archive(identity.uid,String(req.params.id)))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'NOTIFICATION_UPDATE_FAILED'})}});

  // High-value competition evidence ledger. Actor identity/role and server time come from the verified server context, never from the browser payload.
  const auditWriterRoles=['super_admin','org_admin','comp_admin','head_judge','judge','ops_manager','exception_host','delegation_manager','broadcast_operator','auditor','support_agent'];
  app.post('/api/audit/events',auditRateLimit,requireGovernanceRoles(auditWriterRoles),(req,res)=>{if(!serverAuditLedger)return res.status(503).json({code:'AUDIT_LEDGER_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;const b=req.body||{};
    /*
     * ما يشهد به الخادمُ بنفسه لا يُقبل من غيره.
     *
     * هذا المسار لأحداثٍ يراها العميل ولا يراها الخادم. أمّا ختمُ نتيجةٍ أو نشرُها أو
     * كشفُ سؤال فتقع على الخادم ويكتبها الخادم — وقبولُها هنا يجعل السجلَّ الذي يُحتجّ
     * به عند النزاع مؤلَّفًا ممّن يُحتجّ عليه.
     */
    if(isServerAuthoredAuditAction(b.action))return res.status(403).json({code:'AUDIT_EVENT_SERVER_AUTHORED_ONLY',action:String(b.action||'')});
    try{const out=serverAuditLedger.append(actor,{eventId:String(b.eventId||''),organizationId:String(b.organizationId||''),competitionId:String(b.competitionId||''),action:String(b.action||''),entityType:String(b.entityType||''),entityId:String(b.entityId||''),reason:b.reason?String(b.reason).slice(0,2000):undefined,humanSummaryEnglish:b.humanSummaryEnglish?String(b.humanSummaryEnglish).slice(0,2000):undefined,clientTimestamp:b.clientTimestamp?String(b.clientTimestamp):undefined,sessionId:b.sessionId?String(b.sessionId):undefined,authenticationAssurance:b.authenticationAssurance?String(b.authenticationAssurance):undefined,deviceId:String(req.headers['x-mizan-device-id']||b.deviceId||'').slice(0,200),requestId:String(req.headers['x-request-id']||b.requestId||'').slice(0,200)});res.status(out.idempotent?200:201).json({accepted:true,idempotent:out.idempotent,sequence:out.row.sequence,serverTimestamp:out.row.serverTimestamp,hash:out.row.hash})}catch(err){res.status(400).json({code:err instanceof Error?err.message:'AUDIT_APPEND_FAILED'})}});
  app.get('/api/audit/ledger',auditRateLimit,requireGovernanceRoles(['super_admin','org_admin','comp_admin','auditor']),(req,res)=>{if(!serverAuditLedger)return res.status(503).json({code:'AUDIT_LEDGER_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;const competitionId=String(req.query.competitionId||actor.competitionId||'');if(!competitionId)return res.status(400).json({code:'COMPETITION_REQUIRED'});try{
    if(durableAuditLedger)return void durableAuditLedger.list(actor,competitionId,Number(req.query.limit||500))
      .then(async rows=>res.json({rows,verification:await durableAuditLedger.verify(actor.organizationId,competitionId),durability:durableAuditLedger.durability}))
      .catch(err=>res.status(400).json({code:err instanceof Error?err.message:'AUDIT_READ_FAILED'}));
    res.json({rows:serverAuditLedger.list(actor,competitionId,Number(req.query.limit||500)),verification:serverAuditLedger.verify(actor.organizationId,competitionId),durability:'LOCAL_DISK_DEVELOPMENT_ADAPTER'});
  }catch(err){res.status(400).json({code:err instanceof Error?err.message:'AUDIT_READ_FAILED'})}});


  // Server-held Question Escrow. Question plaintext never needs to exist on a JudgeOS device before presence + quorum.
  // KFGQPC is a primary official authority. Concrete package bytes remain hash-bound and dual-reviewed.
  app.get('/api/science/quran/kfgqpc/catalog',sensitiveIdentityRateLimit,requireGovernanceRoles(['super_admin','org_admin','comp_admin','auditor']),(req,res)=>{const catalog=serverQuranSources?serverQuranSources.catalog():KFGQPC_OFFICIAL_PACKAGES.map(x=>({...x,localState:'VAULT_NOT_CONFIGURED'}));res.json({authority:'مجمع الملك فهد لطباعة المصحف الشريف',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',officialCertification:'CERTIFIED',localUsePolicy:'DIRECT_AFTER_OFFICIAL_CHECKSUM_AND_STRUCTURE',catalog})});
  app.get('/api/science/quran/kfgqpc/audio-catalog',sensitiveIdentityRateLimit,requireGovernanceRoles(['super_admin','org_admin','comp_admin','auditor']),(req,res)=>res.json({authority:'مجمع الملك فهد لطباعة المصحف الشريف',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',catalog:KFGQPC_OFFICIAL_AUDIO,note:'KFGQPC published recordings are accepted as official reference sources. Operational playback remains bound to the exact ingested asset, hash and reading scope.'}));
  app.get('/api/science/quran/kfgqpc/developer-assets',sensitiveIdentityRateLimit,requireGovernanceRoles(['super_admin','org_admin','comp_admin','auditor']),(req,res)=>res.json({authority:'مجمع الملك فهد لطباعة المصحف الشريف',authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',officialCertification:'CERTIFIED',quranPackages:KFGQPC_OFFICIAL_PACKAGES,additionalAssets:KFGQPC_DEVELOPER_ASSETS}));
  app.get('/api/science/quran/kfgqpc/library',sensitiveIdentityRateLimit,requireGovernanceRoles(['super_admin']),(req,res)=>{const state=serverQuranSources?(id:string)=>serverQuranSources!.localState(id):undefined;res.json({summary:kfgqpcLibrarySummary(state),items:buildKfgqpcOfficialLibrary(state)});});
  const sendKfgqpcAsset=async(res:any,asset:any,cacheControl:string)=>{if(!asset)return false;res.setHeader('Cache-Control',cacheControl);res.setHeader('X-MIZAN-Source-Authority','KFGQPC');res.setHeader('X-MIZAN-Delivery-Source',asset.source);res.type(asset.type||'application/octet-stream');if(asset.file){res.sendFile(asset.file);return true}if(asset.response){const bytes=Buffer.from(await asset.response.arrayBuffer());res.send(bytes);return true}return false};
  app.get('/api/science/quran/kfgqpc/delivery-status',sensitiveIdentityRateLimit,requireGovernanceRoles(['super_admin']),(req,res)=>res.json(kfgqpcDelivery.status()));
  app.get('/api/science/quran/kfgqpc/page/:packageId/:page',sensitiveIdentityRateLimit,requireGovernanceRoles(['super_admin','org_admin','comp_admin','head_judge','judge','auditor']),async(req,res)=>{const packageId=safeSegment(String(req.params.packageId||'')),page=Number(req.params.page);if(!Number.isInteger(page)||page<1||page>700)return res.status(400).json({code:'MUSHAF_PAGE_INVALID'});try{const asset=await kfgqpcDelivery.page(packageId,page);if(await sendKfgqpcAsset(res,asset,'private, max-age=3600'))return;return res.status(404).json({code:'OFFICIAL_MUSHAF_PAGE_ASSET_NOT_INGESTED'})}catch{return res.status(502).json({code:'OFFICIAL_MUSHAF_PAGE_DELIVERY_FAILED'})}});
  /*
   * الوثائقُ التي يوقّع عليها المتسابق — تُقرأ قبل التوقيع لا بعده.
   *
   * عامّةٌ بقصد: من يُطلب توقيعُه على شروطٍ يجب أن يقرأها بلا حساب. وما لم يُنشر يُردّ
   * باسمه ومعه ما ينقصه، فلا يُقرأ الفراغُ موافقةً ضمنية.
   */
  app.get('/api/public/legal/:kind',(req,res)=>{
    const kind=String(req.params.kind||'');
    if(!(CONSENT_BACKED_DOCUMENTS as readonly string[]).includes(kind))return res.status(404).json({code:'LEGAL_DOCUMENT_UNKNOWN_KIND'});
    const state=legalDocumentState(legalConfigFromEnv(process.env as Record<string,string|undefined>),kind as LegalDocumentKind);
    res.setHeader('Cache-Control','public, max-age=300');
    return res.status(isPublished(state)?200:503).json(state);
  });

  /*
   * وصفحتا الوثيقتين نفسُهما — لا وصفُهما.
   *
   * الطريقُ أعلاه يقول **أين** الوثيقة وبأيّ نسخة؛ وهذا يخدم **نصَّها**. وكان العنوانُ
   * يُنتظر من خارج النظام، فتصير الحقيقةُ نسختين: نصٌّ في المستودع ونصٌّ على رابطٍ لا
   * يراه المستودع. فيوقّع المتسابق على أحدهما ويُسجَّل له رقمُ الآخر.
   *
   * فصار ميزانُ نفسُه ناشرَهما: تُقرأ الصفحةُ من الملفّ الملتزَم، ويُقرأ منه رقمُ النسخة
   * وتاريخُ السريان. ولا تسجيلَ دخولٍ — من يُطلب توقيعُه على شروطٍ يقرأها أوّلًا.
   *
   * وتُحسب مرّةً عند الإقلاع: عطبٌ في وثيقةٍ يُعرف من سجلّ الإقلاع لا من زيارة متسابق.
   * **ولا تُسقط الخدمة**: الطريقُ وحده يردّ 503 برمزه، فالمسابقةُ الجارية لا تتوقّف
   * لأجل صفحة — والتسجيلُ الذي يحتاجها يفشل مغلقًا من تلقائه.
   */
  const legalPages=new Map<LegalDocumentKind,PublishedLegalPage>();
  const legalPageFailures=new Map<LegalDocumentKind,string>();
  for(const kind of CONSENT_BACKED_DOCUMENTS){
    try{legalPages.set(kind,publishedLegalPage(kind))}
    catch(err){
      const code=err instanceof LegalPublicationError?err.code:'LEGAL_DOCUMENT_RENDER_FAILED';
      legalPageFailures.set(kind,code);
      console.error(`[legal] ${kind}: ${code} — ${err instanceof Error?err.message:String(err)}`);
    }
  }
  for(const [kind,path] of Object.entries(LEGAL_PUBLICATION_PATHS) as [LegalDocumentKind,string][]){
    app.get(path,(_req,res)=>{
      const page=legalPages.get(kind);
      if(!page){
        res.setHeader('Cache-Control','no-store');
        return res.status(503).json({code:legalPageFailures.get(kind)||'LEGAL_DOCUMENT_SOURCE_MISSING',kind});
      }
      res.setHeader('Content-Type','text/html; charset=utf-8');
      /*
       * **لا تُخزَّن هذه الصفحةُ مدّةً.** كانت `public, max-age=300`، وذلك ينقض الغرضَ
       * كلَّه: حين تُعدَّل وثيقةٌ وتُرفع نسختُها، تُسجّل النشرةُ الجديدة النسخةَ الجديدة
       * فورًا بينما يُبقي متصفّحٌ أو وسيطٌ النصَّ القديم خمسَ دقائق على العنوان نفسِه.
       * فيقرأ المتسابق نصًّا ويُقيَّد له رقمُ نصٍّ آخر — وهو بعينه العطبُ الذي بُنيت
       * هذه الصفحةُ لإغلاقه.
       *
       * و`no-cache` لا يعني «لا تحفظ»: يحفظ المتصفّحُ النسخةَ ويسأل الخادمَ قبل كلّ
       * استعمال، فيردّ 304 على ETag الذي يضعه Express. فالكلفةُ طلبٌ فارغ، والمكسبُ
       * أن يُقرأ دائمًا ما هو منشورٌ الآن.
       */
      res.setHeader('Cache-Control','no-cache, must-revalidate');
      /* والنسخةُ والتاريخُ والناشرُ في ترويسات كي تُقاس بلا تحليل HTML — يقرؤها المتحقّق. */
      for(const [name,value] of Object.entries(legalPublicationHeaders(page))) res.setHeader(name,value);
      return res.status(200).send(page.html);
    });
  }

  // Public Mushaf page surface. Consistent with the existing public font and public ayah-audio
  // routes: the printed Madinah page is publicly published Quran content, not competition data.
  // Question secrecy is enforced by the FairDraw/escrow reveal flow, not by hiding the Mushaf.
  app.get('/api/public/kfgqpc/page/:packageId/:page',async(req,res)=>{const packageId=safeSegment(String(req.params.packageId||'')),page=Number(req.params.page);
    if(!Number.isInteger(page)||page<1||page>604)return res.status(400).json({code:'MUSHAF_PAGE_INVALID'});
    try{const asset=await kfgqpcDelivery.page(packageId,page);if(await sendKfgqpcAsset(res,asset,'public, max-age=86400, immutable'))return;
      return res.status(404).json({code:'OFFICIAL_MUSHAF_PAGE_ASSET_NOT_INGESTED'})}catch{return res.status(502).json({code:'OFFICIAL_MUSHAF_PAGE_DELIVERY_FAILED'})}});

  app.get('/api/public/kfgqpc/font/:fontId',async(req,res)=>{try{const asset=await kfgqpcDelivery.font(safeSegment(String(req.params.fontId||'primary')));if(await sendKfgqpcAsset(res,asset,'public, max-age=86400, immutable'))return;return res.status(404).end()}catch{return res.status(502).end()}});
  /*
   * مقاطع الكلمة المقيسة لتسجيل بعينه. تُفهرَس بمعرّف التسجيل لا باسم القارئ، و404 هنا ليست
   * عطلًا بل الحال الطبيعي: تعني أن هذا التسجيل لا توقيت مقيس له، فتبقى الواجهة على التقدير.
   */
  app.get('/api/public/kfgqpc/word-timings/:readingId/:surah/:ayah',(req,res)=>{
    if(!wordTimings)return res.status(404).json({code:'WORD_TIMINGS_NOT_CONFIGURED'});
    const readingId=safeSegment(String(req.params.readingId||'')),surah=Number(req.params.surah),ayah=Number(req.params.ayah);
    if(!Number.isInteger(surah)||!Number.isInteger(ayah))return res.status(400).json({code:'INVALID_AYAH_REFERENCE'});
    const hit=wordTimings.segments(readingId,surah,ayah);
    if(!hit)return res.status(404).json({code:'WORD_TIMINGS_NOT_AVAILABLE_FOR_RECORDING'});
    res.setHeader('Cache-Control','public, max-age=86400, immutable');
    return res.json({recordingId:readingId,surah,ayah,assurance:hit.meta.assurance,attribution:hit.meta.attribution,segments:hit.segments});
  });

  app.get('/api/public/kfgqpc/audio/:readingId/:surah/:ayah',async(req,res)=>{const readingId=safeSegment(String(req.params.readingId||'')),surah=Number(req.params.surah),ayah=Number(req.params.ayah);try{const asset=await kfgqpcDelivery.ayahAudio(readingId,surah,ayah);if(await sendKfgqpcAsset(res,asset,'public, max-age=86400, immutable'))return;return res.status(404).json({code:'OFFICIAL_AUDIO_AYAH_NOT_INGESTED'})}catch{return res.status(502).json({code:'OFFICIAL_AUDIO_DELIVERY_FAILED'})}});
  /* طبقة تخطيط الكلمة: إثراء بصري لعدسة الكلمة فوق الصفحة الرسمية. غيابها لا يعطّل شيئًا،
     فتُعاد 204 بدل خطأ، وتبقى عدسة السطر عاملة عند العميل. */
  /* الجهة صاحبة هذا النطاق. نشرٌ واحد يخدم الجميع، والمضيف هو ما يميّز الجهة، فتظهر هويتها
     (اسمها وشعارها) لزوّار نطاقها. 204 يعني نشرًا بجهة واحدة ⇒ يبقى العرض على «ميزان». */
  app.get('/api/public/tenant',(req,res)=>{
    const host=String(req.headers['x-forwarded-host']||req.headers.host||'');
    const tenant=resolveTenantAny(host);
    res.setHeader('cache-control','no-store');
    res.setHeader('vary','host, x-forwarded-host');
    if(!tenant)return res.status(204).end();
    return res.json(publicTenant(tenant));
  });

  const PUBLIC_API_STATUS:Record<string,number>={COMPETITION_NOT_FOUND:404,COMPETITION_REGISTRATION_CLOSED:409,COMPETITION_ACCESS_CLOSED:410,REGISTRATION_REJECTED:400,REGISTRATION_FIELD_REQUIRED:400,REGISTRATION_IDENTITY_REQUIRED:400,REGISTRATION_EMAIL_INVALID:400,REGISTRATION_PHONE_INVALID:400,REGISTRATION_DATE_OF_BIRTH_INVALID:400,REGISTRATION_CATEGORY_INVALID:400,REGISTRATION_READING_INVALID:400,REGISTRATION_AGE_NOT_ELIGIBLE:422,REGISTRATION_GENDER_NOT_ELIGIBLE:422,REGISTRATION_CONSENT_REQUIRED:400,REGISTRATION_AUDIO_CONSENT_REQUIRED:400,REGISTRATION_GUARDIAN_REQUIRED:400,REGISTRATION_NOT_ELIGIBLE:422,REGISTRATION_POLICY_REQUIRES_REVIEW:422,JOURNEY_TOKEN_INVALID:400,JOURNEY_NOT_FOUND:404,JOURNEY_REVOKED:410,FIRESTORE_PERMISSION_DENIED:503,FIRESTORE_UNAVAILABLE:503,GOOGLE_OAUTH_CREDENTIALS_UNAVAILABLE:503,GOOGLE_OAUTH_TOKEN_FAILED:503};
  const publicApiStatus=(err:unknown)=>PUBLIC_API_STATUS[(err instanceof Error?err.message:'PUBLIC_API_FAILED').split(':')[0]]||500;
  const publicApiError=(res:Response,err:unknown)=>{const code=err instanceof Error?err.message:'PUBLIC_API_FAILED';const base=code.split(':')[0];return res.status(PUBLIC_API_STATUS[base]||500).json({code,category:base.startsWith('REGISTRATION_')?'validation':base.startsWith('JOURNEY_')?'access':base.startsWith('COMPETITION_')?'competition':base.startsWith('FIRESTORE_')||base.startsWith('GOOGLE_')?'server':'server'})};
  /*
   * زائر التسجيل العام غير مسجَّل الدخول عمدًا، فلا نبضة تخرج من متصفحه. وكان ذلك يعني أن
   * أعطال المنصّة في أكثر مسار يمسّ الناس — رفضُ صلاحيات على Firestore، أو خطأ 500، أو
   * إعدادٌ ناقص — تبقى بين المتصفح وشاشة الأم، ولا يعلم بها المالك أبدًا. فالخادم يُبلّغ عن
   * نفسه هنا: أعطالُه هو فقط، لا أخطاء المستخدم (بريد غير صحيح ليس عطلًا يوقظ أحدًا)، وبلا
   * أي بيان شخصي — رمز العطل ونطاق المسابقة لا غير.
   */
  const reportPublicFailure=(competitionId:string,code:string,status:number)=>{
    if(!opsTelemetry||status<500)return;
    try{opsTelemetry.recordJob({id:`public_registration:${competitionId||'unknown'}:${code}`,competitionId:competitionId||undefined,jobType:'public_registration',status:'FAILED',errorCode:code})}catch{/* التتبّع لا يُفشل تسجيلًا ولا يُغيّر ردًّا */}
  };
  const requestOrigin=(req:Request)=>{const configured=String(process.env.APP_URL||'').trim();if(configured){try{return new URL(configured).origin}catch{/* fall through */}}return `${req.protocol}://${req.get('host')}`};
  /*
   * ثلاثةُ مسارات كانت تبني الردَّ نفسه بثلاث نسخ. فاجتمعت في واحدة — لا اختصارًا، بل
   * لأن الوثيقتين تُرسلان معه: ونسخةٌ تحملهما وأخرى لا تحملهما تجعل صفحةَ التسجيل
   * تعرض ناشرًا أو لا تعرضه بحسب أيّ مسارٍ نادت، وهو فرقٌ لا يراه أحد حتى يقع.
   *
   * ومع كلِّ وثيقةٍ ناشرُها: فالمتسابق يوقّع على شروطٍ لها اسمٌ ورابط، لا على جملةٍ في
   * الصفحة. و`inherited` تقول إن الوثيقة لطبقةٍ أعلى فتُعرَض باسم صاحبها لا باسم الجهة.
   */
  const publicCompetitionPayload=(comp:Competition)=>({
    ok:true,
    competition:comp,
    organizationId:comp.organizationId,
    legal:Object.fromEntries(CONSENT_BACKED_DOCUMENTS.map(kind=>{
      const resolved=resolveLegalDocument(publicLegalChain(comp.organizationId),kind);
      return [kind,isResolved(resolved)
        ?{published:true,publisher:resolved.publisher,publisherLevel:resolved.level,inherited:resolved.inherited,version:resolved.version,effectiveDate:resolved.effectiveDate,url:resolved.url}
        :{published:false,code:resolved.code}];
    })),
    updatedAt:comp.updatedAt||new Date().toISOString(),
  });
  app.get('/api/public/competition',async(req,res)=>{
    const comp=await getLatestOrActiveCompetition();
    if(!comp)return res.status(404).json({code:'COMPETITION_NOT_FOUND'});
    res.setHeader('Cache-Control','public, max-age=60');
    return res.json(publicCompetitionPayload(comp));
  });
  app.get('/api/public/competitions',async(req,res)=>{
    const comp=await getLatestOrActiveCompetition();
    if(!comp)return res.status(404).json({code:'COMPETITION_NOT_FOUND'});
    res.setHeader('Cache-Control','public, max-age=60');
    return res.json(publicCompetitionPayload(comp));
  });
  app.get('/api/public/competitions/:competitionId',async(req,res)=>{
    const competitionId=String(req.params.competitionId||'').trim().slice(0,120);
    const comp=await getPublicCompetitionRecord(competitionId);
    if(!comp){
      return res.status(404).json({code:'COMPETITION_NOT_FOUND',message:'لم نعثر على المسابقة في السجل العام'});
    }
    res.setHeader('Cache-Control','public, max-age=60');
    return res.json(publicCompetitionPayload(comp));
  });
  app.post('/api/public/competitions/:competitionId/publish',competitionPublishRateLimit,requireGovernanceRoles(['super_admin','org_admin','comp_admin']),async(req,res)=>{
    const competitionId=String(req.params.competitionId||'').trim().slice(0,120);
    const comp=req.body?.competition;
    if(!comp||typeof comp!=='object'||String(comp.id||'').trim().slice(0,120)!==competitionId){
      return res.status(400).json({code:'INVALID_COMPETITION_PAYLOAD'});
    }
    const cleanId=competitionId.replace(/[^a-zA-Z0-9_-]/g,'');
    if(!cleanId||cleanId!==competitionId||cleanId==='comp-pending-setup')return res.status(400).json({code:'INVALID_COMPETITION_ID'});
    const bodyOrgId=String(req.body?.organizationId||'').trim().slice(0,120);
    const compOrgId=String(comp.organizationId||'').trim().slice(0,120);
    if(!bodyOrgId||bodyOrgId==='org-pending-setup'||bodyOrgId!==compOrgId)return res.status(400).json({code:'INVALID_ORGANIZATION_SCOPE'});
    const actor=(req as any).mizanIdentity as {role?:string;organizationId?:string;competitionId?:string}|undefined;
    if(!actor)return res.status(401).json({code:'IDENTITY_REQUIRED'});
    if(actor.role!=='super_admin'&&actor.organizationId!==bodyOrgId)return res.status(403).json({code:'ORGANIZATION_SCOPE_MISMATCH'});
    if(actor.role==='comp_admin'&&actor.competitionId&&actor.competitionId!==cleanId)return res.status(403).json({code:'COMPETITION_SCOPE_MISMATCH'});
    const updatedAt=new Date().toISOString();
    try{
      const file=path.join(publicCompDir,`${cleanId}.json`);
      fs.writeFileSync(file,JSON.stringify({organizationId:bodyOrgId,competition:comp,updatedAt},null,2),'utf8');
    }catch(err){
      console.error('[public-competitions] disk write failed:',err);
      return res.status(500).json({code:'SERVER_STORAGE_ERROR'});
    }
    res.setHeader('Cache-Control','no-store');
    return res.json({ok:true,competitionId:cleanId,updatedAt});
  });
  /*
   * حذف مسابقة أُنشئت بالخطأ قرارٌ من الخادم، لا من المتصفح. الشرط الحاسم يُفحص من
   * Firestore نفسه: وجود متسابق واحد يقفل الحذف حتى لو كانت نسخة جهاز الإدارة قديمة.
   * وعند السماح يُحذف الجذر وكل مجموعاته الفرعية حتى لا تبقى سجلات يتيمة تعود لاحقًا.
   */
  app.post('/api/competitions/:competitionId/participants/:participantId/journey-access/reissue', requireGovernanceRoles(['super_admin', 'org_admin', 'comp_admin']), async (req, res) => {
  try {
    const actor = (req as any).mizanIdentity as ServerIdentity;
    const competitionId = String(req.params.competitionId || '');
    const participantId = String(req.params.participantId || '');
    const safe = /^[A-Za-z0-9_-]{1,160}$/;
    if (!safe.test(competitionId) || !safe.test(participantId)) return res.status(400).json({ error: 'invalid_id' });
    if (!firestoreRepository) return res.status(503).json({ error: 'firestore_unavailable' });

    const organizationId = String((actor as any).organizationId || (actor as any).orgId || '');
    if (!safe.test(organizationId)) return res.status(403).json({ error: 'organization_scope_required' });
    const actorCompetitionId = String((actor as any).competitionId || '');
    if ((actor as any).role === 'comp_admin' && actorCompetitionId && actorCompetitionId !== competitionId) return res.status(403).json({ error: 'competition_scope_mismatch' });

    const participantPath = `organizations/${organizationId}/competitions/${competitionId}/participants/${participantId}`;
    const participant = await firestoreRepository.get(participantPath);
    if (!participant) return res.status(404).json({ error: 'participant_not_found' });

    const makeToken = (audience: 'journey' | 'guardian') => `mz_${audience}_${crypto.randomBytes(32).toString('base64url')}`;
    const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
    const journeyAccessToken = makeToken('journey');
    const guardianAccessToken = makeToken('guardian');
    const journeyAccessTokenHash = digest(journeyAccessToken);
    const guardianAccessTokenHash = digest(guardianAccessToken);
    const oldJourneyHash = String((participant as any).journeyAccessTokenHash || '');
    const oldGuardianHash = String((participant as any).guardianAccessTokenHash || '');

    const cloneOrFallback = async (oldHash: string, audience: 'journey' | 'guardian') => {
      const old = oldHash ? await firestoreRepository.get(`public_journeys/${oldHash}`) : null;
      return old || { organizationId, competitionId, participantId, audience, active: true };
    };
    const [journeyPublic, guardianPublic] = await Promise.all([cloneOrFallback(oldJourneyHash, 'journey'), cloneOrFallback(oldGuardianHash, 'guardian')]);
    const updatedParticipant = {
      ...(participant as Record<string, unknown>),
      journeyAccessTokenHash, guardianAccessTokenHash,
      journeyAccessReissuedAt: new Date().toISOString(),
    };
    delete (updatedParticipant as any).journeyAccessToken;
    delete (updatedParticipant as any).guardianAccessToken;

    await firestoreRepository.commitAtomically({
      upserts: [
        { path: participantPath, data: updatedParticipant },
        { path: `public_journeys/${journeyAccessTokenHash}`, data: { ...(journeyPublic as any), organizationId, competitionId, participantId, audience: 'participant', active: true } },
        { path: `public_journeys/${guardianAccessTokenHash}`, data: { ...(guardianPublic as any), organizationId, competitionId, participantId, audience: 'guardian', active: true } },
      ],
      deletes: [oldJourneyHash, oldGuardianHash].filter(Boolean).filter((h) => h !== journeyAccessTokenHash && h !== guardianAccessTokenHash).map((h) => `public_journeys/${h}`),
    });

    return res.json({ journeyAccessToken, guardianAccessToken });
  } catch (error) {
    console.error('journey-access reissue failed', error);
    return res.status(500).json({ error: 'journey_access_reissue_failed' });
  }
});

app.delete('/api/competitions/:competitionId',requireGovernanceRoles(['super_admin','org_admin']),async(req,res)=>{
    const competitionId=String(req.params.competitionId||'').trim().slice(0,120);
    if(!competitionId||competitionId==='comp-pending-setup'||competitionId.replace(/[^a-zA-Z0-9_-]/g,'')!==competitionId)return res.status(400).json({code:'INVALID_COMPETITION_ID'});
    const actor=(req as any).mizanIdentity as ServerIdentity;
    const requestedOrganizationId=String(req.body?.organizationId||'').trim().slice(0,120);
    const organizationId=actor.role==='super_admin'?requestedOrganizationId:actor.organizationId;
    if(!organizationId||organizationId==='org-pending-setup'||!/^[a-zA-Z0-9_-]+$/.test(organizationId))return res.status(400).json({code:'INVALID_ORGANIZATION_SCOPE'});
    if(actor.role!=='super_admin'&&requestedOrganizationId&&requestedOrganizationId!==actor.organizationId)return res.status(403).json({code:'ORGANIZATION_SCOPE_MISMATCH'});
    if(!firestoreRepository)return res.status(503).json({code:'FIRESTORE_UNAVAILABLE'});
    const root=`organizations/${organizationId}/competitions/${competitionId}`;
    try{
      const participants=await firestoreRepository.listDocumentPaths(`${root}/participants`,1);
      if(participants.length)return res.status(409).json({code:'COMPETITION_HAS_PARTICIPANTS'});
      const existing=await firestoreRepository.get(root);
      if(existing){
        const stored=asCompetition(existing.competition);
        if(stored&&stored.organizationId!==organizationId)return res.status(403).json({code:'ORGANIZATION_SCOPE_MISMATCH'});
      }
      await deleteFirestoreTree(root);
      await Promise.all([firestoreRepository.delete(`public_competitions/${competitionId}`),firestoreRepository.delete(`public_boards/${competitionId}`)]);
      try{fs.rmSync(path.join(publicCompDir,`${competitionId}.json`),{force:true})}catch{/* Firestore remains authoritative. */}
      return res.json({ok:true,competitionId});
    }catch(err){
      const code=err instanceof Error?err.message:'COMPETITION_DELETE_FAILED';
      return res.status(code==='FIRESTORE_PERMISSION_DENIED'?403:503).json({code});
    }
  });

  app.post('/api/public/competitions/:competitionId/register',publicRegistrationRateLimit,async(req,res)=>{
    if(!publicRegistration){reportPublicFailure(String(req.params.competitionId||''),'PUBLIC_REGISTRATION_NOT_CONFIGURED',503);return res.status(503).json({code:'PUBLIC_REGISTRATION_NOT_CONFIGURED',category:'server'})}
    try{const result=await publicRegistration.register(String(req.params.competitionId||''),req.body as PublicRegistrationInput,requestOrigin(req));res.setHeader('Cache-Control','no-store');return res.status(201).json(result)}catch(err){reportPublicFailure(String(req.params.competitionId||''),err instanceof Error?String(err.message).split(':')[0]:'PUBLIC_API_FAILED',publicApiStatus(err));return publicApiError(res,err)}
  });
  app.post('/api/public/journeys/resolve',journeyResolveRateLimit,async(req,res)=>{
    if(!publicRegistration)return res.status(503).json({code:'PUBLIC_REGISTRATION_NOT_CONFIGURED',category:'server'});
    const audience=req.body?.audience==='guardian'?'guardian':'participant';
    try{const journey=await publicRegistration.resolve(String(req.body?.competitionId||''),audience,String(req.body?.key||''));res.setHeader('Cache-Control','private, no-store');return res.json({journey})}catch(err){return publicApiError(res,err)}
  });

  /* إدارة الجهات من لوحة التحكم. MIZAN_TENANTS المضمّن في البيئة يجمّد السجل عمدًا،
     فلا تُكتب تعديلات تضيع صامتةً عند إعادة النشر. */
  const tenantAdmin=(res:Response)=>{
    if(process.env.MIZAN_TENANTS){res.status(409).json({code:'TENANTS_PINNED_TO_ENV'});return null}
    if(!tenantStore){res.status(503).json({code:'TENANT_STORE_NOT_CONFIGURED'});return null}
    return tenantStore;
  };
  /* extra يُرسَل مع الردّ: حالة إبلاغ Google تُبنى خارج هذه الدالة، وكانت تُرمى هنا بصمت
     فيرى المالك نجاحًا بينما النطاق غير مُبلَّغ ونظام الجهة معطّل. */
  const tenantResult=(res:Response,outcome:{ok:true;tenant:TenantRecord}|{ok:false;errors:string[]},extra?:Record<string,unknown>)=>{
    if(outcome.ok===false)return res.status(400).json({code:'TENANT_REJECTED',errors:outcome.errors});
    resetTenantRegistry();
    return res.json({tenant:outcome.tenant,...(extra||{})});
  };
  /* نفس إدارة الجهات، لكن بهوية المالك لا بمفتاح المؤسسات: المفتاح سرّ خادمي لا يجوز
     أن يسكن متصفحًا. الدور super_admin وحده، ويُتحقق منه في الخادم لا في الواجهة. */
  /* حدّ أضيق من الحدّ العام لمسارات المالك: هي تعدّل نطاقات الجهات وتوقفها، فمحاولة
     تخمين هوية أو إغراق بالتعديلات يجب أن تُخنق قبل أن تصل حدّ /api الفسيح.
     ويُترك للطبقة الخارجية متى أُسند التحديد إليها، كما يفعل الحدّ العام. */
  const ownerRateLimit:RequestHandler=rateLimit({windowMs:rateWindowMs,limit:Number(process.env.MIZAN_OWNER_RATE_LIMIT_MAX||30),standardHeaders:'draft-7',legacyHeaders:false,message:{code:'RATE_LIMITED'},skip:()=>rateLimiterIsGlobal});
  const ownerOnly=requireFirebaseRoles(['super_admin']);
  const withOperatorOrganizations=(identity:ServerIdentity):ServerIdentity=>{
    if(!saasPlatform||!identity.operatorId||!['operator_owner','operator_admin'].includes(identity.role))return identity;
    return {...identity,operatorOrganizationIds:saasPlatform.operatorOrganizationIds(identity.operatorId)};
  };
  const scopedMizanIdentity=(req:any)=>withOperatorOrganizations((req as any).mizanIdentity as ServerIdentity);
  const saasActor=(req:any):CommercialActor=>{const identity=scopedMizanIdentity(req);const raw=((req as any).firebaseBase?.raw||{}) as Record<string,unknown>;return {uid:identity.uid,role:identity.role,organizationId:identity.organizationId,operatorId:identity.operatorId||(raw.operator_id?String(raw.operator_id):undefined)}}
  const saasAdmin=(res:Response)=>{if(!saasPlatform){res.status(503).json({code:'SAAS_PLATFORM_NOT_CONFIGURED'});return null}return saasPlatform};
  const ownerRuntime=()=>{const notificationProviderConfigured=['EMAIL','SMS','WHATSAPP','PUSH'].some(c=>!!process.env[`MIZAN_${c}_PROVIDER_URL`])||!!process.env.MIZAN_NOTIFICATION_PROVIDER;return {backendAvailable:true,buildIdKnown:!!currentBuildId(),firebaseProjectConfigured:!!firebaseProjectId,enterpriseApiConfigured:!!process.env.MIZAN_ENTERPRISE_API_KEY,serverAuditLedgerConfigured:!!serverAuditLedger,serverQuranSourceVaultConfigured:!!serverQuranSources,edgeRelayConfigured:!!process.env.MIZAN_EDGE_DATA_DIR,quranAlignmentShadowConfigured:!!process.env.MIZAN_QURAN_ALIGNMENT_URL,notificationProviderConfigured,backgroundJobsConfigured:!!opsTelemetry,liveCompetitionTelemetryConfigured:!!opsTelemetry,opsTelemetry:opsTelemetry?.summary({providerConfigured:notificationProviderConfigured})||null}};
  // Unified owner tenant list: the self-service/registry tenants PLUS every SaaS organization
  // (operator-owned or direct), deduped by orgId, so Tenant 360, the mirror and the owner list
  // see one complete set instead of two disconnected stores.
  const ownerTenantList=():TenantRecord[]=>{
    const base=(tenantStore&&!process.env.MIZAN_TENANTS)?tenantStore.list():tenantRegistry();
    const seen=new Set(base.map(t=>t.orgId));
    const saas=(saasPlatform?.listOwnerTenants()||[]).filter(t=>!seen.has(t.orgId)) as unknown as TenantRecord[];
    return [...base,...saas];
  };
  const controlTowerAdmin=(res:Response)=>{
    if(!controlTower){res.status(503).json({code:'CONTROL_TOWER_NOT_CONFIGURED'});return null}
    return controlTower;
  };

  const telemetryAdmin=(res:Response)=>{if(!opsTelemetry){res.status(503).json({code:'OPS_TELEMETRY_NOT_CONFIGURED'});return null}return opsTelemetry};
  /* النبضة تخص كل مَن دخل: قائمة مكتوبة بخط اليد هنا أسقطت خمسة أدوار حقيقية، فكانت جلساتها
     تُرفض 403 كل دقيقة ولا تصل لوحة المالك أبدًا. المصدر واحد لا نسخة. */
  app.post('/api/telemetry/heartbeat',telemetryHeartbeatRateLimit,requireGovernanceRoles(ALL_GOVERNANCE_ROLES),(req,res)=>{const repo=telemetryAdmin(res);if(!repo)return;const identity=(req as any).mizanIdentity as ServerIdentity;try{return res.status(202).json({heartbeat:repo.recordHeartbeat({tenantId:identity.organizationId,competitionId:identity.competitionId||String(req.body?.competitionId||'')||undefined,subjectType:'user',subjectId:identity.uid,role:identity.role,name:identity.email,version:req.body?.version?String(req.body.version):undefined,buildId:currentBuildId(),status:req.body?.status==='DEGRADED'?'DEGRADED':req.body?.status==='OFFLINE'?'OFFLINE':'ONLINE',meta:req.body?.meta&&typeof req.body.meta==='object'?req.body.meta:{}})})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'HEARTBEAT_FAILED'})}});
  app.post('/api/enterprise/telemetry/heartbeat',requireEnterpriseKey,(req,res)=>{const repo=telemetryAdmin(res);if(!repo)return;try{return res.status(202).json({heartbeat:repo.recordHeartbeat({tenantId:String(req.body?.tenantId||req.headers['x-mizan-org-id']||''),competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,subjectType:String(req.body?.subjectType||'device') as TelemetrySubject,subjectId:String(req.body?.subjectId||''),role:req.body?.role?String(req.body.role):undefined,name:req.body?.name?String(req.body.name):undefined,version:req.body?.version?String(req.body.version):undefined,buildId:req.body?.buildId?String(req.body.buildId):currentBuildId(),status:req.body?.status==='DEGRADED'?'DEGRADED':req.body?.status==='OFFLINE'?'OFFLINE':'ONLINE',sequence:req.body?.sequence===undefined?undefined:Number(req.body.sequence),meta:req.body?.meta&&typeof req.body.meta==='object'?req.body.meta:{}})})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'HEARTBEAT_FAILED'})}});
  app.post('/api/enterprise/telemetry/background-job',requireEnterpriseKey,(req,res)=>{const repo=telemetryAdmin(res);if(!repo)return;try{return res.status(202).json({job:repo.recordJob({id:req.body?.id?String(req.body.id):undefined,tenantId:req.body?.tenantId?String(req.body.tenantId):undefined,competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,jobType:String(req.body?.jobType||''),status:String(req.body?.status||'RUNNING') as JobStatus,queue:req.body?.queue?String(req.body.queue):undefined,workerId:req.body?.workerId?String(req.body.workerId):undefined,leaseExpiresAt:req.body?.leaseExpiresAt?String(req.body.leaseExpiresAt):undefined,attempts:req.body?.attempts===undefined?undefined:Number(req.body.attempts),idempotencyKey:req.body?.idempotencyKey?String(req.body.idempotencyKey):undefined,errorCode:req.body?.errorCode?String(req.body.errorCode):undefined,meta:req.body?.meta&&typeof req.body.meta==='object'?req.body.meta:{}})})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'BACKGROUND_JOB_TELEMETRY_FAILED'})}});
  app.post('/api/enterprise/telemetry/live-competition',requireEnterpriseKey,(req,res)=>{const repo=telemetryAdmin(res);if(!repo)return;try{return res.status(202).json({competition:repo.recordLive({tenantId:String(req.body?.tenantId||req.headers['x-mizan-org-id']||''),competitionId:String(req.body?.competitionId||''),state:String(req.body?.state||'UNKNOWN') as CompetitionState,phase:req.body?.phase?String(req.body.phase):undefined,participantsPresent:req.body?.participantsPresent===undefined?undefined:Number(req.body.participantsPresent),participantsTotal:req.body?.participantsTotal===undefined?undefined:Number(req.body.participantsTotal),activeJudgingSessions:req.body?.activeJudgingSessions===undefined?undefined:Number(req.body.activeJudgingSessions),queueDepth:req.body?.queueDepth===undefined?undefined:Number(req.body.queueDepth),committeesOnline:req.body?.committeesOnline===undefined?undefined:Number(req.body.committeesOnline),lastScoreReceivedAt:req.body?.lastScoreReceivedAt?String(req.body.lastScoreReceivedAt):undefined,meta:req.body?.meta&&typeof req.body.meta==='object'?req.body.meta:{}})})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'LIVE_COMPETITION_TELEMETRY_FAILED'})}});
  /*
   * تعبئة المطالبات لمرة واحدة على نشرٍ قائم.
   *
   * الحسابات التي أُنشئت قبل وجود هذا الجسر لا مطالبات لها، فتُرفض كتاباتها إلى Firestore
   * وإن كانت مخوَّلة في ميزان. وهي لا تُصلَح بتفعيلٍ جديد — فقد فُعِّلت فعلًا — فتلزم تعبئة
   * صريحة يُشغّلها المالك مرة.
   *
   * والنتيجة تُفصَّل لا تُختصر في «تمّ»: كم حسابًا كُتبت مطالباته، وكم أُخفق، ولماذا.
   */
  app.post('/api/owner/identity/sync-claims',ownerRateLimit,ownerOnly,async(_req,res)=>{
    if(!identityGovernance)return res.status(503).json({code:'IDENTITY_GOVERNANCE_NOT_CONFIGURED'});
    /* يُمنع القاطع وحده: فحصٌ لم يحسم لا يحبس المالك عن تعبئةٍ قد تنجح، والإخفاق يُفصَّل بعدها. */
    if(!await claimsWritable())return res.status(503).json({code:'IDENTITY_CLAIMS_NOT_CONFIGURED'});
    const uids=identityGovernance.activeAccountUids();
    const failures:{uid:string;reason:string}[]=[];
    let written=0,cleared=0;
    for(const uid of uids){
      const grant=identityGovernance.claimsForUid(uid);
      const outcome=await writeIdentityClaims(uid,grant?claimsFromGrant(grant):null);
      if(outcome.status==='FAILED')failures.push({uid,reason:outcome.reason});
      else if(grant)written+=1; else cleared+=1;
    }
    return res.json({accounts:uids.length,written,cleared,failures});
  });
  app.get('/api/owner/telemetry',ownerRateLimit,ownerOnly,(_req,res)=>{const repo=telemetryAdmin(res);if(!repo)return;return res.json(repo.summary({providerConfigured:['EMAIL','SMS','WHATSAPP','PUSH'].some(c=>!!process.env[`MIZAN_${c}_PROVIDER_URL`])||!!process.env.MIZAN_NOTIFICATION_PROVIDER}))});

  app.get('/api/owner/control-tower',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    const actor=(req as any).mizanIdentity as ServerIdentity;
    return res.json(repo.buildSnapshot({actor,tenants:ownerTenantList(),runtime:ownerRuntime(),identityGovernanceConfigured:!!identityGovernance,tenantStoreConfigured:!!tenantStore&&!process.env.MIZAN_TENANTS}));
  });
  app.post('/api/owner/support-sessions',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{return res.status(201).json({session:repo.createSupportSession((req as any).mizanIdentity,{tenantId:String(req.body?.tenantId||''),competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,reason:String(req.body?.reason||''),minutes:[15,30,60].includes(Number(req.body?.minutes))?Number(req.body.minutes) as 15|30|60:30,diagnosticBundle:req.body?.diagnosticBundle})})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'SUPPORT_SESSION_FAILED'})}
  });
  app.post('/api/owner/rescue-actions',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{return res.json(repo.rescue((req as any).mizanIdentity,{action:String(req.body?.action||''),tenantId:String(req.body?.tenantId||''),competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,reason:String(req.body?.reason||''),idempotencyKey:req.body?.idempotencyKey?String(req.body.idempotencyKey):undefined}))}catch(err){const code=err instanceof Error?err.message:'RESCUE_ACTION_FAILED';return res.status(code==='INTEGRITY_PROTECTED_ACTION'?403:400).json({code})}
  });
  app.get('/api/owner/tenants/:orgId/360',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{const snapshot=repo.buildSnapshot({actor:(req as any).mizanIdentity,tenants:ownerTenantList(),runtime:ownerRuntime(),identityGovernanceConfigured:!!identityGovernance,tenantStoreConfigured:!!tenantStore&&!process.env.MIZAN_TENANTS});return res.json(repo.tenant360({tenantId:String(req.params.orgId),tenants:ownerTenantList(),diagnostics:snapshot.needsAttention,runtime:ownerRuntime()}))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'TENANT_360_FAILED'})}
  });
  app.get('/api/owner/war-room/:orgId/:competitionId',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{return res.json(repo.warRoom({tenantId:String(req.params.orgId),competitionId:String(req.params.competitionId),runtime:ownerRuntime()}))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'WAR_ROOM_FAILED'})}
  });
  app.post('/api/owner/live-mirror',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{return res.status(201).json(repo.liveMirror((req as any).mizanIdentity,{tenantId:String(req.body?.tenantId||''),competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,role:String(req.body?.role||''),reason:String(req.body?.reason||'')}))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'LIVE_MIRROR_FAILED'})}
  });
  app.post('/api/owner/support-route',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{const snapshot=repo.buildSnapshot({actor:(req as any).mizanIdentity,tenants:ownerTenantList(),runtime:ownerRuntime(),identityGovernanceConfigured:!!identityGovernance,tenantStoreConfigured:!!tenantStore&&!process.env.MIZAN_TENANTS});return res.json(repo.routeSupport((req as any).mizanIdentity,{tenantId:String(req.body?.tenantId||''),competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,reporterRole:String(req.body?.reporterRole||''),reason:String(req.body?.reason||''),diagnostics:snapshot.needsAttention}))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'SUPPORT_ROUTE_FAILED'})}
  });
  app.post('/api/owner/incidents',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{return res.status(201).json({incident:repo.updateIncident((req as any).mizanIdentity,{id:req.body?.id?String(req.body.id):undefined,tenantId:req.body?.tenantId?String(req.body.tenantId):undefined,competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,category:String(req.body?.category||''),severity:String(req.body?.severity||'LOW') as any,status:req.body?.status?String(req.body.status) as any:undefined,rootCause:req.body?.rootCause?String(req.body.rootCause):undefined,reason:String(req.body?.reason||'')})})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'INCIDENT_FAILED'})}
  });
  app.post('/api/owner/commercial',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{return res.json({commercial:repo.upsertCommercial((req as any).mizanIdentity,{tenantId:String(req.body?.tenantId||''),plan:String(req.body?.plan||'TRIAL') as any,subscriptionStatus:String(req.body?.subscriptionStatus||'UNKNOWN') as any,contractRef:req.body?.contractRef?String(req.body.contractRef):undefined,renewalAt:req.body?.renewalAt?String(req.body.renewalAt):undefined,licensedModules:Array.isArray(req.body?.licensedModules)?req.body.licensedModules.map(String):[],limits:req.body?.limits&&typeof req.body.limits==='object'?req.body.limits:{},notes:req.body?.notes?String(req.body.notes):undefined})})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'COMMERCIAL_FAILED'})}
  });
  app.post('/api/owner/kill-switches',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{return res.json({switch:repo.setKillSwitch((req as any).mizanIdentity,{key:String(req.body?.key||''),scope:String(req.body?.scope||'PLATFORM') as any,tenantId:req.body?.tenantId?String(req.body.tenantId):undefined,competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,enabled:req.body?.enabled===true,reason:String(req.body?.reason||''),expiresAt:req.body?.expiresAt?String(req.body.expiresAt):undefined})})}catch(err){const code=err instanceof Error?err.message:'KILL_SWITCH_FAILED';return res.status(code==='INTEGRITY_PROTECTED_ACTION'?403:400).json({code})}
  });
  app.post('/api/owner/snapshots',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{return res.status(201).json({snapshot:repo.createSnapshot((req as any).mizanIdentity,{tenantId:String(req.body?.tenantId||''),competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,reason:String(req.body?.reason||''),state:req.body?.state})})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'SNAPSHOT_FAILED'})}
  });
  app.post('/api/owner/rollback-preview',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{return res.json(repo.rollbackPreview((req as any).mizanIdentity,{snapshotId:String(req.body?.snapshotId||''),reason:String(req.body?.reason||'')}))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'ROLLBACK_PREVIEW_FAILED'})}
  });
  app.post('/api/owner/break-glass',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{return res.status(201).json({request:repo.requestBreakGlass((req as any).mizanIdentity,{tenantId:String(req.body?.tenantId||''),competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,protectedAction:String(req.body?.protectedAction||''),reason:String(req.body?.reason||'')})})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'BREAK_GLASS_FAILED'})}
  });
  app.get('/api/owner/summary/:period',ownerRateLimit,ownerOnly,(req,res)=>{
    const repo=controlTowerAdmin(res);if(!repo)return;
    try{const actor=(req as any).mizanIdentity as ServerIdentity;const snapshot=repo.buildSnapshot({actor,tenants:ownerTenantList(),runtime:ownerRuntime(),identityGovernanceConfigured:!!identityGovernance,tenantStoreConfigured:!!tenantStore&&!process.env.MIZAN_TENANTS});return res.json(repo.ownerSummary({period:String(req.params.period)==='weekly'?'weekly':'daily',snapshot}))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'SUMMARY_FAILED'})}
  });
  app.get('/api/owner/tenants',ownerRateLimit,ownerOnly,(_req,res)=>{res.json({tenants:ownerTenantList(),baseDomain:process.env.MIZAN_BASE_DOMAIN||''})});
  app.post('/api/owner/tenants',ownerRateLimit,ownerOnly,(req,res)=>{const store=tenantAdmin(res);if(!store)return;return tenantResult(res,store.add(req.body||{}))});
  app.patch('/api/owner/tenants/:orgId',ownerRateLimit,ownerOnly,(req,res)=>{const store=tenantAdmin(res);if(!store)return;return tenantResult(res,store.update(String(req.params.orgId),req.body||{}))});
  app.post('/api/owner/tenants/:orgId/suspend',ownerRateLimit,ownerOnly,(req,res)=>{const store=tenantAdmin(res);if(!store)return;return tenantResult(res,store.suspend(String(req.params.orgId)))});
  app.post('/api/owner/tenants/:orgId/activate',ownerRateLimit,ownerOnly,(req,res)=>{const store=tenantAdmin(res);if(!store)return;return tenantResult(res,store.activate(String(req.params.orgId)))});

  /* المنظومة التجارية متعددة الجهات. كل مسار يشتق الهوية والنطاق من الرمز الموثق؛
     tenant / operator ids القادمة من الواجهة ليست سلطة. حالة المنصة تُكتب ذرّيًا في ملف واحد،
     بينما أسرار التخزين محفوظة في خزنة مشفرة منفصلة ولا تعاد إلى المتصفح. */
  const commercialRoles=['super_admin','operator_owner','operator_admin','org_admin','storage_admin','billing_admin'];
  const commercialAuth=requireFirebaseRoles(commercialRoles);
  const commercialError=(res:Response,err:unknown)=>{const code=err instanceof Error?err.message:'SAAS_OPERATION_FAILED';const forbidden=/REQUIRED|NOT_ALLOWED|CROSS_TENANT|BLOCKED/.test(code);return res.status(forbidden?403:code.includes('NOT_FOUND')?404:400).json({code})};
  /* الدفع الإلكتروني: البوابة تُعرَّف بالإعداد وحده، وغيابها يعني التحصيل اليدوي فلا شيء يتعطّل. */
  const paymentGateway=paymentGatewayFromEnv();
  app.get('/api/saas/owner/dashboard',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({...repo.dashboard(saasActor(req)),paymentGateway:{configured:!!paymentGateway,name:paymentGateway?.name||'manual'}})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/plans/initial',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.status(201).json({plan:repo.seedInitialPlan(saasActor(req),req.body||{})})}catch(err){return commercialError(res,err)}});
  app.put('/api/saas/owner/plans',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({plan:repo.upsertPlan(saasActor(req),req.body||{})})}catch(err){return commercialError(res,err)}});
  app.delete('/api/saas/owner/plans/:id',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({deleted:repo.deletePlan(saasActor(req),String(req.params.id))})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/operators',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.status(201).json({operator:repo.createOperator(saasActor(req),req.body||{})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/operators/:operatorId/credits',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.status(201).json({credit:repo.adjustCredits(saasActor(req),String(req.params.operatorId),Number(req.body?.quantity),String(req.body?.reason||''))})}catch(err){return commercialError(res,err)}});
  app.put('/api/saas/owner/operators/:operatorId',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({operator:repo.updateOperator(saasActor(req),String(req.params.operatorId),req.body||{})})}catch(err){return commercialError(res,err)}});
  app.delete('/api/saas/owner/operators/:operatorId',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({deleted:repo.deleteOperator(saasActor(req),String(req.params.operatorId))})}catch(err){return commercialError(res,err)}});
  /* Seed the tenant brand with the organization's own name so a purchased tenant never shows the
     platform wordmark on its portal, certificates or domain before anyone opens the brand studio. */
  const seedTenantBrand=(created:{organization?:{id?:string;officialName?:string;shortName?:string}})=>{
    const org=created?.organization;if(!org?.id||!tenantStore||process.env.MIZAN_TENANTS)return;
    const displayNameArabic=String(org.officialName||'').trim();if(!displayNameArabic)return;
    const outcome=tenantStore.saveBrand(org.id,{displayNameArabic,displayName:String(org.shortName||org.officialName||'').trim()||undefined});
    if((outcome as {ok:boolean}).ok)resetTenantRegistry();
  };
  app.post('/api/saas/owner/organizations',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{const created=repo.createOrganization(saasActor(req),req.body||{});seedTenantBrand(created);return res.status(201).json(created)}catch(err){return commercialError(res,err)}});
  app.put('/api/saas/owner/organizations/:id',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json(repo.updateOrganization(saasActor(req),String(req.params.id),req.body||{}))}catch(err){return commercialError(res,err)}});
  app.delete('/api/saas/owner/organizations/:id',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({deleted:repo.deleteOrganization(saasActor(req),String(req.params.id))})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/migrate-tenants',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json(repo.migrateLegacyTenants(saasActor(req),tenantRegistry(),String(req.body?.planId||'')))}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/change-requests/:id/decision',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({request:repo.decideChange(saasActor(req),String(req.params.id),String(req.body?.decision||'') as any,String(req.body?.note||''))})}catch(err){return commercialError(res,err)}});
  const sendInvoiceReminder=(res:Response,out:{invoice:any;organizationId?:string;operatorId?:string})=>{
    const inv=out.invoice;
    if(notificationCenter){
      const target=out.organizationId?{type:'organization' as const,organizationId:out.organizationId}:out.operatorId?{type:'operator' as const,operatorId:out.operatorId}:undefined;
      const amount=`${(Number(inv.amountMinor||0)/100).toFixed(2)} ${inv.currency}`;
      if(target)notificationCenter.system({title:inv.overdue?'فاتورة متأخرة تحتاج سدادًا':'تذكير بفاتورة مستحقة',body:`الفاتورة ${inv.number} بمبلغ ${amount}${inv.overdue?` متأخرة منذ ${inv.daysOverdue} يومًا`:''}. يرجى إتمام السداد.`,category:'admin',priority:inv.overdue?'urgent':'important',target,context:{organizationId:out.organizationId,operatorId:out.operatorId,entityType:'Invoice',entityId:inv.id},dedupeKey:`invoice-reminder:${inv.id}:${new Date().toISOString().slice(0,10)}`});
    }
    return res.json({invoice:inv,reminded:true});
  };
  const publicOrigin=(req:Request)=>`${req.protocol}://${req.get('host')||''}`;
  const startCheckout=async(req:Request,res:Response,repo:SaaSPlatformRepository)=>{
    if(!paymentGateway)return res.status(503).json({code:'PAYMENT_GATEWAY_NOT_CONFIGURED'});
    const actor=saasActor(req);
    const {invoice,subjectName,contact}=repo.beginCheckout(actor,String(req.params.id));
    const origin=publicOrigin(req);
    const out=await paymentGateway.createCheckout({
      invoiceId:invoice.id,invoiceNumber:invoice.number,amountMinor:invoice.amountMinor,currency:invoice.currency,
      description:`${invoice.number} — ${subjectName}`,
      customer:{name:subjectName,email:contact?.legalEmail,phone:contact?.legalPhone},
      callbackUrl:`${origin}/#billing?invoice=${encodeURIComponent(invoice.id)}&status=paid`,
      errorUrl:`${origin}/#billing?invoice=${encodeURIComponent(invoice.id)}&status=failed`,
    });
    const updated=repo.attachCheckout(actor,invoice.id,{provider:paymentGateway.name,externalRef:out.externalRef});
    return res.status(201).json({paymentUrl:out.paymentUrl,invoice:updated});
  };
  // Owner billing (subscriptions + invoices for operators and organizations)
  app.post('/api/saas/owner/billing/run-cycle',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json(repo.runBillingCycle())}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/subscriptions',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.status(201).json({subscription:repo.createSubscription(saasActor(req),req.body||{})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/subscriptions/:id/auto-renew',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({subscription:repo.setSubscriptionAutoRenew(saasActor(req),String(req.params.id),(req.body||{}).autoRenew!==false)})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/subscriptions/:id/cancel',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({subscription:repo.cancelSubscription(saasActor(req),String(req.params.id))})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/invoices',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.status(201).json({invoice:repo.issueInvoice(saasActor(req),req.body||{})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/invoices/:id/pay',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({invoice:repo.markInvoicePaid(saasActor(req),String(req.params.id),req.body||{})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/invoices/:id/checkout',ownerRateLimit,ownerOnly,async(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return await startCheckout(req,res,repo)}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/invoices/:id/remind',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return sendInvoiceReminder(res,repo.remindInvoice(saasActor(req),String(req.params.id)))}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/owner/invoices/:id/void',ownerRateLimit,ownerOnly,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({invoice:repo.voidInvoice(saasActor(req),String(req.params.id))})}catch(err){return commercialError(res,err)}});
  app.get('/api/saas/operator/dashboard',ownerRateLimit,requireFirebaseRoles(['operator_owner','operator_admin']),(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({...repo.operatorDashboard(saasActor(req)),paymentGateway:{configured:!!paymentGateway,name:paymentGateway?.name||'manual'}})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/operator/organizations',ownerRateLimit,requireFirebaseRoles(['operator_owner','operator_admin']),(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{const created=repo.createOrganization(saasActor(req),req.body||{});seedTenantBrand(created);return res.status(201).json(created)}catch(err){return commercialError(res,err)}});
  /* إشعار البوابة: لا هوية مستخدم هنا — الثقة من التوقيع على الجسم الخام وحده، والتسوية متكرّرة بأمان. */
  app.post('/api/payments/webhook',paymentWebhookRateLimit,(req,res)=>{
    if(!paymentGateway)return res.status(503).json({code:'PAYMENT_GATEWAY_NOT_CONFIGURED'});
    const repo=saasPlatform;if(!repo)return res.status(503).json({code:'SAAS_PLATFORM_NOT_CONFIGURED'});
    const raw=(req as any).rawBody as Buffer|undefined;
    const settlement=paymentGateway.verifyWebhook(req.headers as Record<string,unknown>,Buffer.isBuffer(raw)?raw:Buffer.from(JSON.stringify(req.body??{})));
    if(!settlement)return res.status(401).json({code:'PAYMENT_SIGNATURE_INVALID'});
    if(settlement.status!=='paid')return res.status(202).json({accepted:true,status:settlement.status});
    try{const out=repo.settleInvoiceByReference(paymentGateway.name,settlement.externalRef,{amountMinor:settlement.amountMinor,currency:settlement.currency,paidAt:settlement.paidAt,method:settlement.method});return res.json({settled:true,alreadySettled:out.alreadySettled})}
    catch(err){const code=err instanceof Error?err.message:'PAYMENT_SETTLEMENT_FAILED';return res.status(code==='INVOICE_NOT_FOUND'?404:400).json({code})}
  });
  // Operator plans (their own packages) + billing for their organizations
  const opRoles=requireFirebaseRoles(['operator_owner','operator_admin']);
  app.put('/api/saas/operator/plans',ownerRateLimit,opRoles,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({plan:repo.operatorUpsertPlan(saasActor(req),req.body||{})})}catch(err){return commercialError(res,err)}});
  app.delete('/api/saas/operator/plans/:id',ownerRateLimit,opRoles,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({deleted:repo.operatorDeletePlan(saasActor(req),String(req.params.id))})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/operator/subscriptions',ownerRateLimit,opRoles,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.status(201).json({subscription:repo.createSubscription(saasActor(req),req.body||{})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/operator/subscriptions/:id/auto-renew',ownerRateLimit,opRoles,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({subscription:repo.setSubscriptionAutoRenew(saasActor(req),String(req.params.id),(req.body||{}).autoRenew!==false)})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/operator/subscriptions/:id/cancel',ownerRateLimit,opRoles,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({subscription:repo.cancelSubscription(saasActor(req),String(req.params.id))})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/operator/invoices',ownerRateLimit,opRoles,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.status(201).json({invoice:repo.issueInvoice(saasActor(req),req.body||{})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/operator/invoices/:id/pay',ownerRateLimit,opRoles,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({invoice:repo.markInvoicePaid(saasActor(req),String(req.params.id),req.body||{})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/operator/invoices/:id/checkout',ownerRateLimit,opRoles,async(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return await startCheckout(req,res,repo)}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/operator/invoices/:id/remind',ownerRateLimit,opRoles,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return sendInvoiceReminder(res,repo.remindInvoice(saasActor(req),String(req.params.id)))}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/operator/invoices/:id/void',ownerRateLimit,opRoles,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{return res.json({invoice:repo.voidInvoice(saasActor(req),String(req.params.id))})}catch(err){return commercialError(res,err)}});
  app.get('/api/saas/organization',ownerRateLimit,commercialAuth,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{const actor=saasActor(req),organizationId=actor.role==='super_admin'&&req.query.organizationId?String(req.query.organizationId):actor.organizationId;return res.json(repo.usage(actor,organizationId))}catch(err){return commercialError(res,err)}});
  app.patch('/api/saas/organization/operational',ownerRateLimit,commercialAuth,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{const actor=saasActor(req),organizationId=actor.role==='super_admin'&&req.body?.organizationId?String(req.body.organizationId):actor.organizationId;return res.json({organization:repo.updateOperational(actor,organizationId,req.body?.operational||req.body||{})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/organization/change-requests',ownerRateLimit,commercialAuth,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{const actor=saasActor(req),organizationId=actor.role==='super_admin'&&req.body?.organizationId?String(req.body.organizationId):actor.organizationId;return res.status(201).json({request:repo.requestIdentityChange(actor,organizationId,req.body||{})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/organization/storage',ownerRateLimit,requireFirebaseRoles(['super_admin','org_admin','storage_admin']),(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{const actor=saasActor(req),organizationId=actor.role==='super_admin'?String(req.body?.organizationId||''):actor.organizationId;return res.status(201).json({account:repo.configureStorage(actor,organizationId,req.body||{})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/organization/storage/:id/test',ownerRateLimit,requireFirebaseRoles(['super_admin','org_admin','storage_admin']),async(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{const actor=saasActor(req),organizationId=actor.role==='super_admin'?String(req.body?.organizationId||''):actor.organizationId;return res.json({account:await repo.testStorage(actor,organizationId,String(req.params.id))})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/organization/storage/migrations',ownerRateLimit,requireFirebaseRoles(['super_admin','org_admin','storage_admin']),(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{const actor=saasActor(req),organizationId=actor.role==='super_admin'?String(req.body?.organizationId||''):actor.organizationId;return res.status(202).json({migration:repo.startMigration(actor,organizationId,String(req.body?.destination||'') as any,req.body?.deleteAfterVerification===true)})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/usage/competitions/:competitionId/state',ownerRateLimit,commercialAuth,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{const actor=saasActor(req),organizationId=actor.role==='super_admin'?String(req.body?.organizationId||''):actor.organizationId;return res.json({competition:repo.setCompetitionState(actor,{organizationId,competitionId:String(req.params.competitionId),organizerOrganizationId:req.body?.organizerOrganizationId?String(req.body.organizerOrganizationId):undefined,state:String(req.body?.state||'draft') as any})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/usage/participants',ownerRateLimit,commercialAuth,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{const actor=saasActor(req),organizationId=actor.role==='super_admin'?String(req.body?.organizationId||''):actor.organizationId;return res.status(201).json({usage:repo.recordParticipant(actor,{organizationId,competitionId:String(req.body?.competitionId||''),participantId:String(req.body?.participantId||''),year:req.body?.year?Number(req.body.year):undefined})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/uploads/reserve',ownerRateLimit,commercialAuth,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{const actor=saasActor(req),organizationId=actor.role==='super_admin'?String(req.body?.organizationId||''):actor.organizationId;return res.status(201).json({upload:repo.reserveUpload(actor,{organizationId,competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,fileType:String(req.body?.fileType||''),mimeType:String(req.body?.mimeType||''),sizeBytes:Number(req.body?.sizeBytes),provider:req.body?.provider})})}catch(err){return commercialError(res,err)}});
  app.post('/api/saas/uploads/:id/finalize',ownerRateLimit,commercialAuth,(req,res)=>{const repo=saasAdmin(res);if(!repo)return;try{const actor=saasActor(req),organizationId=actor.role==='super_admin'?String(req.body?.organizationId||''):actor.organizationId;return res.json({upload:repo.finalizeUpload(actor,String(req.params.id),{organizationId,checksum:String(req.body?.checksum||''),actualSizeBytes:req.body?.actualSizeBytes===undefined?undefined:Number(req.body.actualSizeBytes)})})}catch(err){return commercialError(res,err)}});

  /* تحديث الهوية البيضاء وإعدادات الشعار والعرض للجهة المشترية (org_admin أو super_admin) */
  const brandAdmins = requireFirebaseRoles(['super_admin', 'org_admin']);
  app.get('/api/tenant/brand', ownerRateLimit, brandAdmins, (req,res)=>{const store=tenantAdmin(res);if(!store)return;const actor=(req as any).mizanIdentity;const isSuper=actor?.role==='super_admin';const orgId=isSuper&&req.query?.orgId?String(req.query.orgId):actor?.organizationId;if(!orgId)return res.status(400).json({code:'ORG_ID_REQUIRED'});const tenant=store.list().find(x=>x.orgId===orgId)||{orgId,status:'active' as const};res.setHeader('cache-control','no-store');return res.json({tenant,baseDomain:process.env.MIZAN_BASE_DOMAIN||''});});
  app.patch('/api/tenant/brand', ownerRateLimit, brandAdmins, async (req, res) => {
    const store = tenantAdmin(res);
    if (!store) return;
    const actor = (req as any).mizanIdentity;
    const isSuper = actor?.role === 'super_admin';
    const orgId = isSuper && req.body?.orgId ? String(req.body.orgId) : actor?.organizationId;
    if (!orgId) return res.status(400).json({ code: 'ORG_ID_REQUIRED' });
    // Domain fields are owner-only: organizations cannot set or replace their subdomain/custom domains here.
    const patch = { ...(req.body || {}) };
    if (!isSuper) { delete (patch as any).subdomain; delete (patch as any).customDomains; }
    const outcome = store.saveBrand(orgId, patch);
    if (!(outcome as { ok: boolean }).ok) return tenantResult(res, outcome);
    resetTenantRegistry(); // make a saved subdomain/custom domain live for host routing immediately

    /*
     * نطاق لا يعرفه Google تُرفض طلباته كلها، فيتعطّل النظام عند الجهة بلا رسالة مفهومة.
     * فيُبلَّغ Google من هنا بدل أن يُدخل المالك كل نطاق يدويًا في وحدة تحكّم Google.
     *
     * الحفظ تمّ فعلًا ولا يُنقض بفشل الإبلاغ: تُعاد حالة الإبلاغ ليعرف المالك أن عليه إتمامه
     * بنفسه، بدل أن يظنّ الربط تامًّا ويكتشف العطل من الجهة يوم مسابقتها.
     */
    return authorizeTenantDomains(res, outcome, patch);
  });

  /* الجهة لا تضبط نطاقها بنفسها (سياسة المالك)، لكنها تستطيع طلبه بعد إتمام خطوات CNAME،
     فيصل الطلب إلى مالك المنصة باسم الجهة والنطاق المطلوب ليُثبّته. */
  app.post('/api/tenant/domain-request', ownerRateLimit, requireFirebaseRoles(['org_admin']), (req,res)=>{
    const actor=(req as any).mizanIdentity as ServerIdentity;
    const organizationId=actor?.organizationId;
    if(!organizationId)return res.status(400).json({code:'ORG_ID_REQUIRED'});
    const domain=String(req.body?.domain||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/[/?#].*$/,'');
    if(!/^(?=.{4,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain))return res.status(400).json({code:'DOMAIN_INVALID'});
    const tenantName=tenantByOrganizationId(organizationId)?.displayNameArabic||organizationId;
    if(notificationCenter)notificationCenter.system({title:'طلب ربط نطاق خاص',body:`طلبت ${tenantName} ربط النطاق ${domain}. تأكّد من سجل CNAME ثم أضِفه من «النطاق والوصول».`,category:'admin',priority:'important',target:{type:'role',role:'super_admin'},context:{organizationId,entityType:'DomainRequest',entityId:domain},actionHref:`#identity?organizationId=${encodeURIComponent(organizationId)}&panel=domain`,actionLabel:'فتح ضبط النطاق',dedupeKey:`domain-request:${organizationId}:${domain}`});
    return res.status(202).json({requested:true,domain});
  });

  // Operator-managed domains for their own organizations
  const operatorOwnsOrg=(req:Request,res:Response):string|null=>{const actor=(req as any).mizanIdentity;const orgId=String(req.params.orgId||'');if(!actor?.operatorId||!saasPlatform?.organizationBelongsToOperator(orgId,actor.operatorId)){res.status(403).json({code:'CROSS_OPERATOR_ORGANIZATION_BLOCKED'});return null}return orgId};
  app.get('/api/saas/operator/organizations/:orgId/domain', ownerRateLimit, requireFirebaseRoles(['operator_owner','operator_admin']), (req,res)=>{const store=tenantAdmin(res);if(!store)return;const orgId=operatorOwnsOrg(req,res);if(!orgId)return;const tenant=store.list().find(x=>x.orgId===orgId)||{orgId,status:'active' as const};res.setHeader('cache-control','no-store');return res.json({tenant,baseDomain:process.env.MIZAN_BASE_DOMAIN||''})});
  app.patch('/api/saas/operator/organizations/:orgId/domain', ownerRateLimit, requireFirebaseRoles(['operator_owner','operator_admin']), (req,res)=>{const store=tenantAdmin(res);if(!store)return;const orgId=operatorOwnsOrg(req,res);if(!orgId)return;const existing=store.list().find(x=>x.orgId===orgId);if(existing&&(existing.subdomain||(existing.customDomains||[]).length>0))return res.status(409).json({code:'DOMAIN_LOCKED'});const patch={subdomain:req.body?.subdomain, customDomains:req.body?.customDomains};const outcome=store.saveBrand(orgId, patch);if(!(outcome as {ok:boolean}).ok)return tenantResult(res, outcome);resetTenantRegistry();
    /* المشغّل يضبط نطاقه مرة واحدة، فهذه فرصته الوحيدة لإبلاغ Google — وإلا تعطّل عنده كل شيء. */
    return void authorizeTenantDomains(res, outcome, patch)});

  app.get('/api/enterprise/tenants',requireEnterpriseKey,(_req,res)=>{const store=tenantAdmin(res);if(!store)return;res.json({tenants:store.list(),baseDomain:process.env.MIZAN_BASE_DOMAIN||''})});
  app.post('/api/enterprise/tenants',requireEnterpriseKey,(req,res)=>{const store=tenantAdmin(res);if(!store)return;return tenantResult(res,store.add(req.body||{}))});
  app.patch('/api/enterprise/tenants/:orgId',requireEnterpriseKey,(req,res)=>{const store=tenantAdmin(res);if(!store)return;return tenantResult(res,store.update(String(req.params.orgId),req.body||{}))});
  app.post('/api/enterprise/tenants/:orgId/suspend',requireEnterpriseKey,(req,res)=>{const store=tenantAdmin(res);if(!store)return;return tenantResult(res,store.suspend(String(req.params.orgId)))});
  app.post('/api/enterprise/tenants/:orgId/activate',requireEnterpriseKey,(req,res)=>{const store=tenantAdmin(res);if(!store)return;return tenantResult(res,store.activate(String(req.params.orgId)))});

  /* صوت «عبارة إنهاء الموضع» — عبارة غير قرآنية يقولها المحكم. تُولَّد عبر Gemini TTS وتُخزَّن.
     القرآن لا يمر من هنا إطلاقًا؛ تلاوته من المصدر المعتمد وحده. 503 عند غياب المفتاح فيتراجع
     العميل إلى تسجيل بشري إن وُجد، وإلا إلى صوت الجهاز. */
  app.get('/api/public/cue-audio',async(req,res)=>{
    const text=String(req.query.text||'');
    if(!cueTextAllowed(text))return res.status(400).json({code:'CUE_TEXT_REJECTED'});
    if(!cueTtsConfigured())return res.status(503).json({code:'CUE_TTS_NOT_CONFIGURED'});
    const wav=await synthesizeCue(text);
    if(!wav)return res.status(502).json({code:'CUE_TTS_FAILED'});
    res.setHeader('content-type','audio/wav');
    res.setHeader('cache-control','public, max-age=86400, immutable');
    return res.end(wav);
  });
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
    try{const passage=await quranDelivery.passage(readingId,surah,startAyah,endAyah);
      if(!passage)return res.status(404).json({code:'OFFICIAL_PASSAGE_NOT_DELIVERED'});
      // Tajweed is derived from each ayah's own text, so the marks land on the very letters in
      // front of the reciter rather than on offsets computed against a different text.
      const withTajweed={...passage,ayat:passage.ayat.map(a=>({...a,tajweed:deriveAyahTajweed(a.text)})),tajweedScopeNote:TAJWEED_SCOPE_NOTE};
      /* The Quran text never changes, but the shape of this payload can — tajweed was added to it
         after clients had already cached an hour-long copy, so the new layer stayed invisible to
         anyone who had opened the passage before. A short window with revalidation keeps the
         bandwidth saving while letting a schema change reach a judge on their next request. */
      res.setHeader('Cache-Control','public, max-age=300, must-revalidate');
      /* الترويسة تُختم من إسناد الرواية نفسها. ثابتٌ مكتوب هنا يجعل نصّ إسلام ويب يخرج
         موسومًا KFGQPC — وهو كذبٌ في الإسناد لا خطأ عرض. */
      res.setHeader('X-MIZAN-Source-Authority',passage.provenance.authority);
      return res.json(withTajweed)}catch{return res.status(502).json({code:'OFFICIAL_PASSAGE_DELIVERY_FAILED'})}});

  app.get('/api/public/kfgqpc/fairdraw/:readingId',async(req,res)=>{
    const readingId=safeSegment(String(req.params.readingId||'hafs'));
    const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>0?Math.floor(n):undefined};
    /*
     * والمعاملُ المكرَّر يُرفض هنا أيضًا، لا يُترك ناجيًا بالمصادفة.
     *
     * فـ`Number(['1','2'])` يعطي NaN فيسقط في `num` — نجاةٌ لا حراسة. ومن كرّر المعامل
     * لا يعرف أيَّ قيمةٍ استُعملت، فالردُّ الصريح أصدقُ من أخذ واحدةٍ صامتًا.
     */
    try{const out=await generativeFairDraw(quranDelivery,{reading:readingId,seed:soleParam(req.query.seed,'seed')||undefined,
        anchor:(soleParam(req.query.anchor,'anchor')||undefined) as any,ayahCount:num(soleParam(req.query.ayahCount,'ayahCount')),
        juz:num(soleParam(req.query.juz,'juz')),surah:num(soleParam(req.query.surah,'surah')),minAyahCount:num(soleParam(req.query.min,'min')),maxAyahCount:num(soleParam(req.query.max,'max'))});
      if(!out)return res.status(404).json({code:'FAIRDRAW_SOURCE_NOT_DELIVERED'});
      // Attach the measured cognitive load of the drawn passage so panels can see — and later
      // equalise — how heavy a draw actually is, instead of assuming randomness means fairness.
      let difficulty:unknown=undefined;
      try{const a=await analysisFor(readingId);if(a)difficulty=a.difficulty.vector(out.passage.surah,out.passage.startAyah,out.passage.endAyah)}catch{}
      res.setHeader('Cache-Control','no-store');return res.json({...out,difficulty})}
    catch{return res.status(502).json({code:'FAIRDRAW_FAILED'})}});

  /* السحب المتوازن لدفعة متسابقين: مقطع مختلف لكل واحد بصعوبة متكافئة مقيسة.
     الإسناد ذاته سرٌّ تشغيلي (يكشف مقطع كل متسابق)، فهو خلف أدوار السحب لا عام. */
  app.post('/api/quran/fairdraw/balanced',requireGovernanceRoles(['comp_admin','org_admin','head_judge',]),async(req,res)=>{
    const readingId=safeSegment(String(req.body?.reading||'hafs'));
    const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>0?Math.floor(n):undefined};
    try{const a=await analysisFor(readingId);if(!a)return res.status(404).json({code:'READING_NOT_DELIVERED'});
      const out=await balancedFairDraw(quranDelivery,a.difficulty,{reading:readingId,
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
    const rows=await quranDelivery.quranData(readingId);if(!rows)return null;
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
  /*
   * التحكيم الأعمى المزدوج.
   *
   * `plan` يسند تلاوات سبق تحكيمها إلى محكّمين آخرين، ويعيد للمكلَّف بندَ عملٍ **بلا أثر** للحكم
   * الأول (لا درجة ولا اسم محكّم) — الإعماء شرط القياس لا تحسينه. و`measure` يقارن الحكمين بعد
   * وصول الثاني. لا يكتب أيٌّ منهما نتيجة ولا يغيّر درجة مختومة.
   */
  app.post('/api/judging/blind-rescoring/plan',requireGovernanceRoles(['head_judge','comp_admin','org_admin']),(req,res)=>{
    const b=req.body||{};
    try{const plan=planBlindRescoring({
      sessions:Array.isArray(b.sessions)?b.sessions.slice(0,500):[],
      reviewers:Array.isArray(b.reviewers)?b.reviewers.map(String).slice(0,64):[],
      targetPairs:Math.min(200,Math.max(1,Number(b.targetPairs)||10)),
      seed:String(b.seed||crypto.randomUUID()),
      maxPerReviewer:b.maxPerReviewer?Number(b.maxPerReviewer):undefined});
      res.setHeader('Cache-Control','no-store');
      // المخرج المعلن للمكلَّفين لا يحمل الحكم الأول؛ الإسناد الكامل للإدارة العلمية وحدها.
      return res.json({assignments:plan,workItems:plan.map(a=>({sessionId:a.sessionId,participantId:a.participantId,reviewerId:a.reviewerId}))})}
    catch{return res.status(400).json({code:'BLIND_RESCORING_PLAN_FAILED'})}});

  app.post('/api/judging/blind-rescoring/measure',requireGovernanceRoles(['head_judge','comp_admin','org_admin','auditor']),(req,res)=>{
    const b=req.body||{};
    try{const report=measureAgreement({
      assignments:Array.isArray(b.assignments)?b.assignments.slice(0,500):[],
      originals:Array.isArray(b.originals)?b.originals.slice(0,500):[],
      reviews:Array.isArray(b.reviews)?b.reviews.slice(0,500):[],
      criteria:Array.isArray(b.criteria)?b.criteria.slice(0,64):[],
      tolerance:Number.isFinite(Number(b.tolerance))?Number(b.tolerance):undefined});
      res.setHeader('Cache-Control','no-store');return res.json(report)}
    catch{return res.status(400).json({code:'BLIND_RESCORING_MEASURE_FAILED'})}});

  app.post('/api/results/attest',requireGovernanceRoles(['comp_admin','org_admin','head_judge','auditor',]),(req,res)=>{
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
      auditAppend(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId:attestation.competitionId,action:'RESULT_ATTESTED',entityType:'Result',entityId:attestation.resultId||attestation.participantId,reason:`Server recomputation ${attestation.verdict}${attestation.reason?` (${attestation.reason})`:''}`,requestId:String(req.headers['x-request-id']||'')});
      res.setHeader('Cache-Control','no-store');
      return res.status(attestation.verdict==='DISAGREES'?409:200).json(attestation);
    }catch{return res.status(400).json({code:'RESULT_ATTESTATION_FAILED'})}});

  /*
   * ختم النتيجة: الخادم يؤلّف الرقم من إرسالات المحكمين ثم يختمه. لا يقبل درجةً من العميل
   * أصلًا، فلا مجال لأن يُختم رقم لم يُحسب هنا.
   */
  app.post('/api/results/seal',requireGovernanceRoles(['comp_admin','org_admin','head_judge',]),(req,res)=>{
    const actor=(req as any).mizanIdentity as ServerIdentity;const body=req.body||{};
    const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:undefined};
    const sealSigner=trustSigner();
    /*
     * بلا سجلٍّ لا ختم — ويُقال صراحةً.
     *
     * كان السجلُّ يُنادى بـ`?.`: فإن لم يُهيَّأ مضى الختمُ وردّ 201 ولم يُكتب شيء. ويترتّب
     * على ذلك ثلاثة أعطالٍ صامتة: لا صفَّ في سجلّ الأختام، ولا كشفَ لإعادة ختمٍ بنفس
     * المدخلات (فكلُّ نداءٍ يُنشئ ختمًا جديدًا لأن `sealedAt` يدخل البصمة)، ولا أساسَ
     * لفصل المهامّ عند النشر — وكلُّها تظهر يوم النزاع لا يوم النشر.
     *
     * والنشرُ أدناه يردّ 503 في الحال نفسها منذ البداية. فيُسوَّى البابان: ما لا يُسجَّل
     * لا يُختم.
     */
    if(!resultSealRegistry)return res.status(503).json({code:'RESULT_SEAL_REGISTRY_NOT_CONFIGURED'});
    try{
      const outcome=sealResult({
        competitionId:String(body.competitionId||actor.competitionId||''),
        participantId:String(body.participantId||''),
        sessionId:String(body.sessionId||''),
        categoryId:body.categoryId?String(body.categoryId):undefined,
        submissions:Array.isArray(body.submissions)?body.submissions.slice(0,64):[],
        criteria:Array.isArray(body.criteria)?body.criteria.slice(0,64):[],
        mode:String(body.mode||'all_judges_all_criteria'),
        dropExtremes:!!body.dropExtremes,
        sessionEventCount:num(body.sessionEventCount)||0,
        // الخاتم هو الهوية المُصدَّقة للطلب، لا اسمًا يرسله العميل عن نفسه.
        sealedBy:String(actor.uid||actor.email||''),
        previousSealSha256:body.previousSealSha256?String(body.previousSealSha256):undefined,
        previousFinalScore:num(body.previousFinalScore),
        // مفتاح خادمي حين يكون مهيّأً. غيابه لا يمنع الختم لكنه يُعلَن في `assurance` بدل ادّعاء توقيع.
        signer:sealSigner?{keyId:sealSigner.keyId,publicKeySpki:sealSigner.spki,sign:(material:string)=>crypto.sign(null,Buffer.from(material),sealSigner.privateKey).toString('base64url')}:undefined,
      });
      res.setHeader('Cache-Control','no-store');
      // فحص بوجود الحقل لا بالراية: التضييق على راية منطقية لا يعمل خارج الوضع الصارم.
      if(!('sealed' in outcome))return res.status(422).json({code:outcome.code,message:outcome.message});
      const {sealed}=outcome;
      /*
       * إعادةُ المحاولة تعيد الختم نفسه، لا ختمًا ثانيًا.
       *
       * `sealedAt` يدخل بصمة الختم، فنداءان بنفس المدخلات يخرجان ببصمتين مختلفتين لنفس
       * الدرجة. والمفتاحُ الصحيح للتمييز هو `inputsSha256` — بصمةُ ما حُسب منه. فإن كان
       * مسجَّلًا أُعيد المسجَّل كما هو (200) بلا صفِّ تدقيقٍ ثانٍ؛ وإن تغيّرت المدخلات فهو
       * إعادةُ ختمٍ حقيقية تُعلن ما نسخته في `supersedes` (201).
       */
      const existing=resultSealRegistry.findByInputs(actor.organizationId,sealed.competitionId,sealed.participantId,sealed.inputsSha256);
      if(existing)return res.status(200).json({...existing.sealed,idempotent:true});
      resultSealRegistry.record({organizationId:actor.organizationId,competitionId:sealed.competitionId,participantId:sealed.participantId,sessionId:sealed.sessionId,inputsSha256:sealed.inputsSha256,sealSha256:sealed.sealSha256,sealedBy:sealed.sealedBy,sealedAt:sealed.sealedAt,finalScore:sealed.finalScore,sealed:sealed as unknown as Record<string,unknown>});
      auditAppend(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId:sealed.competitionId,action:'RESULT_SEALED',entityType:'Result',entityId:sealed.participantId,reason:`Sealed ${sealed.finalScore} from ${sealed.contributingJudges} judges · ${sealed.sealSha256.slice(0,12)}${sealed.supersedes?` · supersedes ${sealed.supersedes.previousSealSha256.slice(0,12)} (Δ${sealed.supersedes.delta})`:''}`,requestId:String(req.headers['x-request-id']||'')});
      return res.status(201).json(sealed);
    }catch{return res.status(400).json({code:'RESULT_SEALING_FAILED'})}});

  /*
   * نشرُ النتائج: الخادم يشهد، لا العميل.
   *
   * فصلُ المهامّ يُطبَّق هنا من سجلّ الأختام — لا من حقلٍ يرسله العميل عن نفسه — وهو
   * نفسُ الشرط الذي تفرضه قاعدةُ Firestore على كلِّ وثيقة: من ختم لا ينشر. والنشرُ
   * يقع مرّة: النداءُ الثاني يعيد المسجَّل (200) بلا أثرٍ ثانٍ.
   */
  app.post('/api/results/publish',auditRateLimit,requireGovernanceRoles(['comp_admin','org_admin','head_judge',]),(req,res)=>{
    const actor=(req as any).mizanIdentity as ServerIdentity;
    const competitionId=String(req.body?.competitionId||actor.competitionId||'');
    if(!competitionId)return res.status(400).json({code:'COMPETITION_REQUIRED'});
    if(!resultSealRegistry||!resultPublications)return res.status(503).json({code:'RESULT_PUBLICATION_NOT_CONFIGURED'});
    res.setHeader('Cache-Control','no-store');
    try{
      const sealers=resultSealRegistry.sealersOf(actor.organizationId,competitionId);
      const sealCount=resultSealRegistry.countFor(actor.organizationId,competitionId);
      const decision=publicationDecision({actorUid:String(actor.uid||''),sealers,sealCount,existing:resultPublications.read(actor.organizationId,competitionId)});
      // فحصٌ بوجود الحقل لا بالراية — التضييق على راية منطقية لا يعمل خارج الوضع الصارم.
      if('code' in decision)return res.status(decision.code==='RESULT_PUBLICATION_SOD_BLOCKED'?403:409).json({code:decision.code});
      if('record' in decision)return res.status(200).json({...decision.record,idempotent:true});
      const record:PublicationRecord={organizationId:actor.organizationId,competitionId,publishedBy:String(actor.uid||actor.email||''),publishedAt:new Date().toISOString(),sealCount:decision.sealCount};
      resultPublications.write(record);
      auditAppend(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId,action:'RESULT_PUBLISHED',entityType:'Competition',entityId:competitionId,reason:`Published ${record.sealCount} sealed result(s)`,requestId:String(req.headers['x-request-id']||'')});
      return res.status(201).json(record);
    }catch{return res.status(400).json({code:'RESULT_PUBLICATION_FAILED'})}});

  /*
   * أربعةُ أفعالٍ حاكمة يشهد بها الخادم.
   *
   * كانت تقع في العميل: هو يفحص الصلاحية وهو يكتب الأثر. والفحصُ في جهازٍ يملكه صاحبُ
   * المصلحة ليس فحصًا. فالقرارُ هنا من `server/governance-attestation`، والفاعلُ هو
   * الهويةُ المُصدَّقة للطلب، والأثرُ يكتبه الخادمُ باسمه.
   */
  const attestationFailed=(res:any,decision:{code:string;detail?:string})=>
    res.status(decision.code.endsWith('_NOT_AUTHORIZED')||decision.code.endsWith('_BLOCKED')?403:422).json(decision);

  app.post('/api/governance/policy-change',auditRateLimit,requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{
    const actor=(req as any).mizanIdentity as ServerIdentity;const b=req.body||{};
    const competitionId=String(b.competitionId||actor.competitionId||'');
    res.setHeader('Cache-Control','no-store');
    // عددُ الأختام يُقرأ من سجلّ الأختام الذي كتبه الخادم، لا من حقلٍ يرسله العميل.
    const sealedResultCount=resultSealRegistry?resultSealRegistry.countFor(actor.organizationId,competitionId):0;
    const decision=policyChangeDecision({
      actorUid:String(actor.uid||''),actorRole:actor.role,competitionId,
      policyVersion:String(b.policyVersion||''),policySha256:String(b.policySha256||''),
      kind:String(b.kind||'POLICY_UPDATED'),reason:b.reason?String(b.reason).slice(0,2000):undefined,
      sealedResultCount,
    });
    if('code' in decision)return attestationFailed(res,decision);
    auditAppend(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId,action:'COMPETITION_POLICY_CHANGED',entityType:'Competition',entityId:competitionId,reason:`${decision.summary}${b.reason?` · ${String(b.reason).slice(0,400)}`:''}`,requestId:String(req.headers['x-request-id']||'')});
    return res.status(201).json(decision);
  });

  app.post('/api/results/score-correction',auditRateLimit,requireGovernanceRoles(['super_admin','org_admin','comp_admin','head_judge']),(req,res)=>{
    const actor=(req as any).mizanIdentity as ServerIdentity;const b=req.body||{};
    const competitionId=String(b.competitionId||actor.competitionId||'');
    const participantId=String(b.participantId||'');
    res.setHeader('Cache-Control','no-store');
    /*
     * «هل خُتمت؟» تُقرأ من سجلّ الأختام لا من الطلب — وإلا أعلن المصحّحُ أنها لم تُختم.
     *
     * وغيابُ السجلّ ليس جوابًا بالنفي: كان `?.` يجعل «لا سجلّ» تُقرأ «لم تُختم»، وهي أوسعُ
     * البابين — فالتصحيح على نتيجةٍ غير مختومة أيسرُ منه على مختومة. أي أن عطلًا في
     * التهيئة كان يفتح البابَ الأوسع صامتًا. فإن لم يوجد السجلُّ فالجواب «لا أعلم»،
     * ولا يُبنى على «لا أعلم» قرار.
     */
    if(!resultSealRegistry)return res.status(503).json({code:'RESULT_SEAL_REGISTRY_NOT_CONFIGURED'});
    const resultSealed=!!resultSealRegistry.latestFor(actor.organizationId,competitionId,participantId);
    const decision=scoreCorrectionDecision({
      actorUid:String(actor.uid||''),actorRole:actor.role,competitionId,participantId,
      appealId:String(b.appealId||''),delta:Number(b.delta),
      reason:b.reason?String(b.reason).slice(0,2000):undefined,
      policyAllowsScoreChange:b.policyAllowsScoreChange===true,resultSealed,
    });
    if('code' in decision)return attestationFailed(res,decision);
    auditAppend(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId,action:'SCORE_CORRECTED',entityType:'Result',entityId:participantId,reason:`${decision.summary}${b.reason?` · ${String(b.reason).slice(0,400)}`:''}`,requestId:String(req.headers['x-request-id']||'')});
    return res.status(201).json(decision);
  });

  app.post('/api/participants/reading-change',auditRateLimit,requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{
    const actor=(req as any).mizanIdentity as ServerIdentity;const b=req.body||{};
    const competitionId=String(b.competitionId||actor.competitionId||'');
    const participantId=String(b.participantId||'');
    res.setHeader('Cache-Control','no-store');
    /*
     * «هل سُحب سؤال؟» تُقرأ من محرّك الأسئلة الخادميّ. وغيابُ المحرّك لا يُقرأ «لم يُسحب»:
     * ذلك يفتح البابَ الذي بُني ليُغلق، فيُعدّ مسحوبًا حتى يُثبت المحرّكُ خلافه.
     */
    let questionDrawn=true;
    if(!secureQuestionRuntime)questionDrawn=false;
    else{try{secureQuestionRuntime.findActiveForParticipant(competitionId,participantId,{uid:actor.uid,role:actor.role,organizationId:actor.organizationId,competitionId} as any);questionDrawn=true}
      catch(err){questionDrawn=!(err instanceof Error&&err.message==='QUESTION_RUNTIME_ACTIVE_SESSION_NOT_FOUND')}}
    const decision=readingChangeDecision({
      actorUid:String(actor.uid||''),actorRole:actor.role,competitionId,participantId,
      fromRiwaya:String(b.fromRiwaya||''),toRiwaya:String(b.toRiwaya||''),
      reason:b.reason?String(b.reason).slice(0,2000):undefined,questionDrawn,
    });
    if('code' in decision)return attestationFailed(res,decision);
    auditAppend(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId,action:'PARTICIPANT_READING_CHANGED',entityType:'Participant',entityId:participantId,reason:`${decision.summary}${b.reason?` · ${String(b.reason).slice(0,400)}`:''}`,requestId:String(req.headers['x-request-id']||'')});
    return res.status(201).json(decision);
  });

  /* التحقّق مفتوح لكل دور حاكم: من يشكّ في ختم يعيد حسابه هنا بلا وساطة. */
  app.post('/api/results/seal/verify',requireGovernanceRoles(['comp_admin','org_admin','head_judge','auditor',]),(req,res)=>{
    const sealed=req.body?.sealed;
    if(!sealed||typeof sealed!=='object')return res.status(400).json({code:'SEAL_REQUIRED'});
    res.setHeader('Cache-Control','no-store');
    try{
      const intact=verifySeal(sealed);
      // سؤالان مختلفان يُجابان معًا: هل تغيّر المحتوى، ومن يسند هذا الختم.
      const signer=trustSigner();
      const signature=verifySealSignature(sealed,(material,value,keyId)=>{
        if(!signer||(keyId&&keyId!==signer.keyId))return false;
        return crypto.verify(null,Buffer.from(material),signer.publicKey,Buffer.from(value,'base64url'));
      });
      return res.status(intact&&signature.state!=='INVALID_SIGNATURE'&&signature.state!=='SIGNATURE_MISSING'?200:409)
        .json({intact,signature:signature.state,sealSha256:String(sealed.sealSha256||'')});
    }
    catch{return res.status(400).json({code:'SEAL_VERIFICATION_FAILED'})}});

  /*
   * النصاب وقرعة FairDraw: كانا في المتصفح، فكان الحارس والمَحروس في يد واحدة. هنا الفاعل هو
   * الهوية المُصدَّقة للطلب، والحالة دائمة، والسجل ملحق-فقط.
   */
  // نوع الاستجابة يأتي من كعب express في هذا المستودع، وهو any؛ لا نخترع نوعًا أدقّ مما يوفّره.
  type AuthorityRes=Parameters<RequestHandler>[1] extends never?never:any;
  const authorityRequired=(res:AuthorityRes)=>{res.status(503).json({code:'INTEGRITY_AUTHORITY_NOT_CONFIGURED',message:'سلطة النزاهة الخادمية غير مهيّأة؛ لا يُعتدّ بنصاب أو قرعة يُحسبان في المتصفح.'});return null};
  const authorityFailed=(res:AuthorityRes,code:string)=>res.status(500).json({code});

  app.get('/api/integrity/quorum',requireGovernanceRoles(['head_judge','comp_admin','org_admin','broadcast_operator','auditor']),(req,res)=>{
    if(!integrityAuthority)return authorityRequired(res);
    const actor=(req as any).mizanIdentity as ServerIdentity;
    try{res.setHeader('Cache-Control','no-store');return res.json({actions:integrityAuthority.listQuorum(actor,String(req.query.competitionId||actor.competitionId||''))})}
    catch{return authorityFailed(res,'QUORUM_LIST_FAILED')}});

  app.post('/api/integrity/quorum/request',requireGovernanceRoles(['head_judge','comp_admin','org_admin',]),(req,res)=>{
    if(!integrityAuthority)return authorityRequired(res);
    const actor=(req as any).mizanIdentity as ServerIdentity;const b=req.body||{};
    const groups=Array.isArray(b.requiredRoleGroups)?b.requiredRoleGroups.slice(0,8).map((g:unknown)=>Array.isArray(g)?g.slice(0,8).map(String):[]).filter((g:string[])=>g.length):[];
    try{
      const outcome=integrityAuthority.requestQuorum(actor,{
        competitionId:String(b.competitionId||actor.competitionId||''),
        action:String(b.action||''),entityId:String(b.entityId||''),
        requiredRoleGroups:groups,
        minimumApprovals:Number.isFinite(Number(b.minimumApprovals))?Number(b.minimumApprovals):undefined});
      res.setHeader('Cache-Control','no-store');
      return 'record' in outcome?res.status(201).json(outcome.record):res.status(409).json({code:outcome.code});
    }catch{return authorityFailed(res,'QUORUM_REQUEST_FAILED')}});

  app.post('/api/integrity/quorum/:id/approve',requireGovernanceRoles(['head_judge','comp_admin','org_admin','broadcast_operator']),(req,res)=>{
    if(!integrityAuthority)return authorityRequired(res);
    const actor=(req as any).mizanIdentity as ServerIdentity;
    try{const outcome=integrityAuthority.approveQuorum(actor,String(req.params.id));
      res.setHeader('Cache-Control','no-store');
      return 'record' in outcome?res.json(outcome.record):res.status(409).json({code:outcome.code});
    }catch{return authorityFailed(res,'QUORUM_APPROVE_FAILED')}});

  app.post('/api/integrity/quorum/:id/execute',requireGovernanceRoles(['head_judge','comp_admin','org_admin','broadcast_operator']),(req,res)=>{
    if(!integrityAuthority)return authorityRequired(res);
    const actor=(req as any).mizanIdentity as ServerIdentity;
    try{const outcome=integrityAuthority.executeQuorum(actor,String(req.params.id));
      res.setHeader('Cache-Control','no-store');
      return 'record' in outcome?res.json(outcome.record):res.status(409).json({code:outcome.code});
    }catch{return authorityFailed(res,'QUORUM_EXECUTE_FAILED')}});

  /* الالتزام يُرجع البصمة ولا يُرجع البذرة — ليست في المُخرَج أصلًا، فلا تُطلب ولا تُسرَّب. */
  app.post('/api/integrity/fairdraw/commit',requireGovernanceRoles(['comp_admin','org_admin','head_judge']),(req,res)=>{
    if(!integrityAuthority)return authorityRequired(res);
    const actor=(req as any).mizanIdentity as ServerIdentity;const b=req.body||{};
    const participantId=String(b.participantId||'');const constraintHash=String(b.constraintHash||'');
    if(!participantId||!constraintHash)return res.status(400).json({code:'COMMIT_FIELDS_REQUIRED'});
    try{res.setHeader('Cache-Control','no-store');
      return res.status(201).json(integrityAuthority.commitFairDraw(actor,{competitionId:String(b.competitionId||actor.competitionId||''),participantId,constraintHash}));
    }catch{return authorityFailed(res,'FAIRDRAW_COMMIT_FAILED')}});

  app.get('/api/integrity/fairdraw/commitments',requireGovernanceRoles(['comp_admin','org_admin','head_judge','auditor']),(req,res)=>{
    if(!integrityAuthority)return authorityRequired(res);
    const actor=(req as any).mizanIdentity as ServerIdentity;
    try{res.setHeader('Cache-Control','no-store');return res.json({commitments:integrityAuthority.listCommitments(actor,String(req.query.competitionId||actor.competitionId||''))})}
    catch{return authorityFailed(res,'FAIRDRAW_LIST_FAILED')}});

  app.post('/api/integrity/fairdraw/:id/reveal',requireGovernanceRoles(['comp_admin','org_admin','head_judge']),(req,res)=>{
    if(!integrityAuthority)return authorityRequired(res);
    const actor=(req as any).mizanIdentity as ServerIdentity;
    try{
      const outcome=integrityAuthority.revealFairDraw(actor,String(req.params.id),req.body?.constraintHash?String(req.body.constraintHash):undefined);
      res.setHeader('Cache-Control','no-store');
      return 'seed' in outcome?res.json(outcome):res.status(409).json({code:outcome.code});
    }catch{return authorityFailed(res,'FAIRDRAW_REVEAL_FAILED')}});

  app.get('/api/integrity/authority-audit',requireGovernanceRoles(['auditor','org_admin','comp_admin',]),(req,res)=>{
    if(!integrityAuthority)return authorityRequired(res);
    const actor=(req as any).mizanIdentity as ServerIdentity;
    try{res.setHeader('Cache-Control','no-store');return res.json(integrityAuthority.readAudit(actor.organizationId))}
    catch{return authorityFailed(res,'AUTHORITY_AUDIT_FAILED')}});

  app.post('/api/judging/calibration',requireGovernanceRoles(['head_judge','comp_admin','org_admin','auditor',]),(req,res)=>{
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
  app.post('/api/science/quran/kfgqpc/:packageId/approve',sensitiveIdentityRateLimit,requireGovernanceRoles(['head_judge','org_admin','super_admin']),(req,res)=>{if(!serverQuranSources)return res.status(503).json({code:'SERVER_QURAN_SOURCE_VAULT_NOT_CONFIGURED'});try{return res.json({manifest:serverQuranSources.approve(String(req.params.packageId),(req as any).mizanIdentity.uid)})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QURAN_SOURCE_APPROVAL_FAILED'})}});
  app.post('/api/science/quran/kfgqpc/:packageId/revoke',sensitiveIdentityRateLimit,requireGovernanceRoles(['head_judge','org_admin','super_admin']),(req,res)=>{if(!serverQuranSources)return res.status(503).json({code:'SERVER_QURAN_SOURCE_VAULT_NOT_CONFIGURED'});try{return res.json({manifest:serverQuranSources.revoke(String(req.params.packageId),String(req.body?.reason||'Scientific revocation'))})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QURAN_SOURCE_REVOCATION_FAILED'})}});

  // Quran Intelligence is fail-closed and reading-isolated. These endpoints never substitute one
  // riwayah for another, never expose private R2 URLs, and never write a judge score.
  /*
   * معامل الاستعلام قد يصل مصفوفةً لا نصًّا.
   *
   * ‎`?surah=1&surah=2` يجعل Express يسلّم `['1','2']`، فينتقل إلى الخدمة قيمةٌ يظنّها
   * القارئ نصًّا واحدًا. أكثر المواضع تنجو بالمصادفة — `Number(['1','2'])` يعطي NaN
   * فيُرفض — لكن النجاة بالمصادفة ليست حراسة، وتكرارُ المعامل يصير بابًا للعبث بالنوع.
   *
   * فيُرفض التكرار صراحةً عند الحدّ: قيمةٌ واحدة لكل معامل، وإلا رُدّ الطلب برمزٍ يقول
   * ما وقع. وهذا أوضح من أخذ الأولى صامتًا — من كرّر المعامل لا يعرف أيّهما استُعمل.
   */
  const soleParam=(value:unknown,name:string):string=>{
    if(Array.isArray(value))throw new Error(`QUERY_PARAM_REPEATED:${name}`);
    return value===undefined||value===null?'':String(value);
  };

  const quranIntelligenceFailure=(res:any,err:unknown)=>{const code=err instanceof Error?err.message:'QURAN_INTELLIGENCE_FAILED';const status=code.includes('NOT_FOUND')?404:code.includes('NOT_CONFIGURED')||code.includes('NOT_INGESTED')||code.includes('NOT_CERTIFIED')?503:code.includes('QUARANTINED')||code.includes('MISMATCH')||code.includes('NOT_APPROVED')?409:400;return res.status(status).json({code})};
  const quranReaderRoles=['org_admin','comp_admin','head_judge','judge','auditor'];
  app.get('/api/quran/intelligence/capabilities',requireGovernanceRoles(quranReaderRoles),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});return res.json(quranIntelligence.capabilities())});
  app.get('/api/quran/intelligence/status',requireGovernanceRoles(['org_admin','comp_admin','head_judge','auditor']),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});return res.json({readings:quranIntelligence.status()})});
  app.get('/api/quran/intelligence/readiness',requireGovernanceRoles(['org_admin','comp_admin','head_judge','auditor']),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});return res.json({protocol:'MIZAN-QURAN-READINESS-1',authority:'KFGQPC',readings:quranIntelligence.readiness()})});
  app.get('/api/quran/intelligence/health',requireGovernanceRoles(['org_admin','comp_admin','head_judge','auditor']),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});res.setHeader('Cache-Control','no-store');return res.json(quranIntelligence.health())});
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
  app.post('/api/quran/alignment/shadow/audio',alignmentAudioIpRateLimit,requireGovernanceRoles(['judge','head_judge',]),alignmentAudioRateLimit,express.raw({type:['audio/*','application/octet-stream'],limit:'2mb'}),async(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;try{const bytes:Buffer=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);const out=await quranIntelligence.processAlignmentChunk({actorId:actor.uid,sessionId:soleParam(req.query.sessionId,'sessionId'),reading:soleParam(req.query.reading,'reading'),surah:soleParam(req.query.surah,'surah'),startAyah:soleParam(req.query.startAyah,'startAyah'),endAyah:soleParam(req.query.endAyah,'endAyah'),sourcePackageId:soleParam(req.query.sourcePackageId,'sourcePackageId'),contentType:soleParam(req.headers['content-type'],'content-type')||'application/octet-stream',bytes});res.setHeader('Cache-Control','no-store');return res.json(out)}catch(err){return quranIntelligenceFailure(res,err)}});
  /*
   * تدريب المتسابق قبل دوره.
   *
   * مسارٌ مستقلّ عن مسار المحكّم عمدًا: توسيعُ مسار التحكيم ليقبل المتسابق يفتح على
   * القاعة بابًا لا يُغلق. وهنا لا خطر: المتسابق يختار المقطع بنفسه من نطاقه، فلا يُكشف
   * له شيء لا يعرفه. ولا يُكتب من هذا في دفتر الأدلّة حرف.
   */
  app.post('/api/quran/practice/align',practiceAlignmentIpRateLimit,requireFirebaseRoles(['participant']),practiceAlignmentRateLimit,express.raw({type:['audio/*','application/octet-stream'],limit:'2mb'}),async(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;try{const bytes:Buffer=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);const out=await quranIntelligence.processAlignmentChunk({actorId:actor.uid,sessionId:`practice:${actor.uid}`,reading:soleParam(req.query.reading,'reading'),surah:soleParam(req.query.surah,'surah'),startAyah:soleParam(req.query.startAyah,'startAyah'),endAyah:soleParam(req.query.endAyah,'endAyah'),sourcePackageId:soleParam(req.query.sourcePackageId,'sourcePackageId'),contentType:soleParam(req.headers['content-type'],'content-type')||'application/octet-stream',bytes,practice:true});res.setHeader('Cache-Control','no-store');return res.json(out)}catch(err){return quranIntelligenceFailure(res,err)}});
  /*
   * وجوهُ المصحف للتمرين — يراجع الطالبُ بصفحته كما يراجع في مصحفه.
   *
   * والمسارُ يُخرج **المواضعَ لا النصّ**: قائمةٌ بأرقام الوجوه ومدياتها، فيختار الطالبُ
   * (أو ترجيحُ ضعفه) وجهًا، ثم يُطلب نصُّه وحده. فلا تُحمَّل حزمةُ الرواية كلُّها إلى
   * متصفّح لأنّه فتح شاشة.
   *
   * وهذا كلُّه من حزمة روايته هو: لا يُعرض وجهٌ ناقصٌ فيها، ولا يُملأ نقصٌ من غيرها.
   */
  const practiceFaceRawi=(req:Request):string=>{const key=soleParam(req.query.reading,'reading');const rawi=candidateRawiForDeliveryKey(key);if(!rawi)throw new PracticeFaceError('PRACTICE_FACE_READING_UNKNOWN');return rawi};
  const practiceFaceFailure=(res:Response,err:unknown)=>{const code=err instanceof Error?err.message:'PRACTICE_FACE_FAILED';return res.status(code==='PRACTICE_FACE_READING_UNKNOWN'||code==='PRACTICE_FACE_PAGE_INVALID'?400:409).json({code})};
  /* وتُسمّى العلّةُ للشاشة: غيابُ محرّكٍ ليس كخطأ طلب، وبابٌ مغلقٌ ليس عطلًا. */
  const recitationRecogniserFailure=(res:Response,err:unknown)=>{const code=err instanceof Error?err.message:'QURAN_ASR_FAILED';const status=code.includes('NOT_CONFIGURED')||code.includes('WARMING')?503:code==='QURAN_ASR_JUDGING_CLOSED'||code==='QURAN_ASR_GATE_CHANGED'?409:code.includes('BACKEND_HTTP')?502:400;return res.status(status).json({code})};

  /*
   * «يسمعك» من بطاقة الرحلة.
   *
   * بطاقة الرحلة اعتمادٌ خاص طويل، لكنها ليست جلسة Firebase. لذلك لا يجوز أن نفتح
   * مسارات الطالب الأصلية بلا هوية، ولا أن نجبر صاحب البطاقة على إنشاء حساب كي يعمل زرّ
   * ظهر له أصلًا. الباب العام أدناه مستقل: يتحقق من البطاقة، ويستخرج نطاق صاحبها وروايته
   * من الخادم، ثم يعيد التحقق من كل وجه/مقطع. لا يثق بنطاق أو رواية يرسلها المتصفح.
   */
  type JourneyPracticeAccess={
    competitionId:string;organizationId:string;participantId:string;
    scope:QuranScope;deliveryReading:string;
    listening:{reading:string;sourcePackageId:string};
  };
  const JOURNEY_PRACTICE_CACHE_MS=5_000;
  const journeyPracticeCache=new Map<string,{expires:number;value:JourneyPracticeAccess}>();
  const practiceDeliveryByReading:Record<string,string>={
    hafs:'hafs',warsh:'warsh',shubah:'shubah',qaloun:'qalun',
    'douri-abu-amr':'duri-abi-amr','sousi-abu-amr':'susi-abi-amr',
  };
  const journeyPracticeFailure=(res:Response,err:unknown)=>{
    const code=err instanceof Error?err.message:'JOURNEY_PRACTICE_FAILED';
    const status=/JOURNEY_(TOKEN_INVALID|NOT_FOUND|REVOKED)/.test(code)?401
      :/PRACTICE_(STATUS_BLOCKED|SCOPE|READING|FACE_OUT_OF_SCOPE|REQUEST_MISMATCH)/.test(code)?409
      :/FIRESTORE|NOT_CONFIGURED|UNAVAILABLE/.test(code)?503:/QURAN_PRACTICE_LISTENER_HTTP_/.test(code)?502:400;
    return res.status(status).json({code});
  };
  const journeyPracticeAccess=async(req:Request):Promise<JourneyPracticeAccess>=>{
    if(!publicRegistration)throw new Error('PUBLIC_REGISTRATION_NOT_CONFIGURED');
    const competitionId=soleParam(req.headers['x-mizan-competition-id'],'x-mizan-competition-id').trim();
    const key=soleParam(req.headers['x-mizan-journey-key'],'x-mizan-journey-key').trim();
    if(!competitionId||!key)throw new Error('JOURNEY_TOKEN_INVALID');
    const cacheKey=crypto.createHash('sha256').update(`${competitionId}:${key}`).digest('hex');
    const cached=journeyPracticeCache.get(cacheKey);
    if(cached&&cached.expires>Date.now())return cached.value;

    const journey=await publicRegistration.resolve(competitionId,'participant',key) as any;
    if(!['approved','checked_in','in_queue'].includes(String(journey?.status||'')))throw new Error('PRACTICE_STATUS_BLOCKED');
    const organizationId=String(journey?.organizationId||'').trim();
    const participantId=String(journey?.participantId||'').trim();
    if(!organizationId||!participantId)throw new Error('JOURNEY_TOKEN_INVALID');

    const prepared=journey?.preparation&&typeof journey.preparation==='object'?journey.preparation as any:{};
    let scope:QuranScope|undefined;
    if(prepared.scope&&typeof prepared.scope==='object'){
      const candidate=normalizeScope(prepared.scope as QuranScope);
      if(scopeAyahCount(candidate)>0)scope=candidate;
    }
    let riwaya=String(prepared.riwaya||'').trim();

    /* السجل القديم لم يكن يحمل النطاق البنيوي ولا الرواية. نصلحه عند القراءة بدل أن
       نجبر صاحب بطاقة قديمة على انتظار إعادة نشرها. */
    if(!scope||!riwaya){
      if(!firestoreRepository)throw new Error('FIRESTORE_UNAVAILABLE');
      const participant=await firestoreRepository.get(`organizations/${organizationId}/competitions/${competitionId}/participants/${participantId}`) as any;
      if(!participant)throw new Error('JOURNEY_NOT_FOUND');
      riwaya=riwaya||String(participant.riwaya||'').trim();
      if(!scope){
        const compRow=await firestoreRepository.get(`public_competitions/${competitionId}`);
        const competition=asCompetition(compRow?.competition);
        if(!competition||competition.organizationId!==organizationId)throw new Error('COMPETITION_NOT_FOUND');
        const category=competition.categories.find(c=>c.id===participant.categoryId);
        let scopes:ParticipantScopeRecord[]=[];
        if(category?.scopeMode==='participant_selected'&&category.selectionRule?.enabled){
          const base=`organizations/${organizationId}/competitions/${competitionId}/participant_scopes`;
          const paths=await firestoreRepository.listDocumentPaths(base);
          const rows=await Promise.all(paths.map(x=>firestoreRepository!.get(x).catch(()=>null)));
          scopes=rows.filter((x):x is Record<string,unknown>=>!!x&&String((x as any).participantId||'')===participantId) as unknown as ParticipantScopeRecord[];
        }
        const resolved=resolveEffectiveScope({participant:{id:participantId},category,scopes,tenant:{organizationId,competitionId}});
        if(resolved.blocked||scopeAyahCount(resolved.scope)===0)throw new Error('PRACTICE_SCOPE_NOT_READY');
        scope=normalizeScope(resolved.scope);
      }
    }

    if(!scope||scopeAyahCount(scope)===0)throw new Error('PRACTICE_SCOPE_NOT_READY');
    /*
     * `participant.riwaya` stores the human-facing canonical label (for example
     * «حفص عن عاصم»), while the listening policy deliberately accepts compact
     * engine ids such as `hafs`.  Passing the display label directly made a valid
     * Hafs/Warsh/... journey look unsupported.  Resolve through the canonical
     * twenty-reading registry first; never guess or fall back to another reading.
     */
    const rawiId=resolveCanonicalRawiId({riwaya});
    const intelligenceReadingByRawi:Record<string,string>={
      hafs:'hafs',warsh:'warsh',shubah:'shubah',qalun:'qaloun',
      'al-duri-abu-amr':'douri-abu-amr','al-susi':'sousi-abu-amr',
    };
    const definition=quranReadingDefinition(rawiId?intelligenceReadingByRawi[rawiId]||'':riwaya);
    /*
     * العشرون كلُّها، لا الستّ.
     *
     * كانت الرواياتُ خارج طبقة الاستماع الستّ تُردّ بـ PRACTICE_READING_NOT_SUPPORTED،
     * فلا يرى طالبُ هشامٍ أو خلفٍ أو رويسٍ وجهًا ولا يُسمع — مع أنّ لكلٍّ منها حزمةَ
     * تسليمٍ ونصًّا ووجوهًا في ميزان. فتُعرف الروايةُ من جدول التسليم الموحّد، ويُسمع
     * صاحبُها على نصّ حزمته هو. ولا انتقالَ إلى رواية أخرى بحال.
     */
    const deliveryKey=definition?practiceDeliveryByReading[definition.id]:(rawiId?DELIVERY_READING_BY_RAWI[rawiId]:undefined);
    if(!deliveryKey)throw new Error('PRACTICE_READING_NOT_SUPPORTED');
    const deliveryReading=deliveryKey;
    const value:JourneyPracticeAccess={competitionId,organizationId,participantId,scope,deliveryReading,listening:definition?{reading:definition.id,sourcePackageId:definition.packageId}:{reading:deliveryKey,sourcePackageId:`mizan-delivery:${deliveryKey}`}};
    journeyPracticeCache.set(cacheKey,{expires:Date.now()+JOURNEY_PRACTICE_CACHE_MS,value});
    return value;
  };

  /*
   * لا نعلن للواجهة أن «يسمعك» متاح لمجرد أن الرواية معروفة.
   *
   * كان سياق الرحلة يعيد `listening` دائمًا، حتى إذا كانت خدمة المحاذاة نفسها غير
   * موصولة أو معيار الرواية غير معتمد. فتُظهر الشاشة زر «ابدأ التلاوة»، يفتح الميكروفون،
   * ثم يسقط أول مقطع بعد ثانيتين ويعود الزر كأن الطالب هو من أوقفه.
   *
   * الجاهزية هنا من المصدر نفسه الذي يحكم الخدمة: مرحلة alignment للرواية يجب أن تكون
   * READY. إن لم تكن، يبقى وجه المصحف مفتوحًا للمراجعة ولا نفتح ميكروفونًا نعرف مسبقًا
   * أن الخادم سيرفضه. ولا يوجد أي fallback إلى رواية أخرى.
   */
  /*
   * «يسمعك» في التدريب العام لا يعتمد على محرّك التحكيم/الظلّ الخاص باللجنة.
   * ذلك المحرّك كان يتطلب خزنة intelligence + benchmark + backend، وهي بنية لم تكن
   * منشورة أصلًا في Cloud Run؛ لذلك كان الزرّ موجودًا بينما لا يوجد مستمع إنتاجي خلفه.
   *
   * التدريب الآن له مستمع قرآني مستقل، خاص بالتدريب فقط. لا يكتب دليلًا ولا درجة،
   * ويعمل على حفص فقط إلى أن يُقاس نموذجٌ مستقل لكل رواية أخرى — بلا fallback بينها.
   */
  const practiceListenerUrl=String(process.env.MIZAN_QURAN_PRACTICE_LISTENER_URL||'').trim();
  /*
   * كلُّ الروايات، كلٌّ بنصّها.
   *
   * كان المستمعُ مقصورًا على حفص. والنموذجُ يسمع الأصوات، والمقابلةُ تقع على نصّ رواية
   * المتسابق نفسها (من حزمة تسليمها) — فلا يُقاس قارئُ ورشٍ بنصّ حفص. وما تنفرد به
   * الروايةُ عن حفص لفظًا لا يُحكم عليه في كشف الأخطاء (انظر MushafListens).
   */
  const dedicatedPracticeListenerReady=(reading:string):boolean=>/^[a-z][a-z-]{1,39}$/.test(reading)&&/^https:\/\//i.test(practiceListenerUrl);
  const asrPracticeListenerReady=(reading:string):boolean=>{
    const gate=recitationRecogniser.gate(reading);
    return recitationRecogniser.configured()&&gate.word==='OPEN';
  };
  const journeyListeningReady=(reading:string):boolean=>dedicatedPracticeListenerReady(reading)||asrPracticeListenerReady(reading);

  const practiceListenerToken=async():Promise<string>=>{
    if(!practiceListenerUrl)return '';
    const explicit=String(process.env.MIZAN_QURAN_PRACTICE_LISTENER_TOKEN||'').trim();
    if(explicit)return explicit;
    /* Cloud Run -> Cloud Run: اطلب identity token من metadata للخدمة الخاصة نفسها. */
    try{
      const audience=new URL(practiceListenerUrl).origin;
      const r=await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,{headers:{'Metadata-Flavor':'Google'}});
      return r.ok?(await r.text()).trim():'';
    }catch{return ''}
  };

  /*
   * نداءٌ واحدٌ للمستمع يشترك فيه تدريبُ الطالب وتتبّعُ المحكّم — فلا يتفرّع البروتوكول.
   * `after` آخرُ موضعٍ معروف (فهرسُ الكلمة في المقطع)، يرجّح به المستمعُ التقدّمَ على الارتداد.
   */
  const callDedicatedListener=async(input:{reading:string;ayat:{surah:number;ayah:number;text:string}[];contentType:string;bytes:Buffer;after?:number})=>{
    const token=await practiceListenerToken();
    const expected=Buffer.from(JSON.stringify(input.ayat.map(x=>({surah:x.surah,ayah:x.ayah,text:x.text}))),'utf8').toString('base64url');
    const response=await fetch(practiceListenerUrl,{method:'POST',headers:{
      'content-type':input.contentType||'application/octet-stream',
      'x-mizan-reading':input.reading,
      'x-mizan-expected-passage':expected,
      ...(Number.isInteger(input.after)?{'x-mizan-after':String(input.after)}:{}),
      ...(token?{authorization:`Bearer ${token}`}:{})
    },body:new Uint8Array(input.bytes),signal:AbortSignal.timeout(20_000)});
    if(response.status===503)throw new Error('QURAN_PRACTICE_LISTENER_WARMING');
    if(!response.ok)throw new Error(`QURAN_PRACTICE_LISTENER_HTTP_${response.status}`);
    const raw=await response.json() as any;
    const candidate=raw?.candidate&&typeof raw.candidate==='object'?raw.candidate:null;
    const confidence=Number(raw?.confidence||0);
    return {candidate,confidence,raw};
  };
  /*
   * حالُ المستمع كما هو، لا كما يُفترض.
   *
   * «مربوط» (العنوانُ مضبوط) لا يعني «جاهز» (النموذجُ حُمِّل). والفرقُ بينهما هو الفرقُ بين
   * طالبٍ يُسمع وطالبٍ يُقال له «يُحمَّل». فتُسأل صحّةُ المستمع نفسِه ويُنقل جوابُها إلى
   * `/api/health` — فيقرؤه سجلُّ النشر بعد كل دفعة، ولا يُعمل على العمياء. يُخزَّن نصفَ
   * دقيقة، ولا يُنقل من المستمع إلا حالُه واسمُ نموذجه (لا رسائلُ خطئه).
   */
  let listenerHealthCache:{at:number;value:{state:string;model:string|null}}|null=null;
  const practiceListenerHealth=async():Promise<{state:string;model:string|null}>=>{
    if(!/^https:\/\//i.test(practiceListenerUrl))return {state:'NOT_CONFIGURED',model:null};
    if(listenerHealthCache&&Date.now()-listenerHealthCache.at<30_000)return listenerHealthCache.value;
    let value:{state:string;model:string|null}={state:'UNREACHABLE',model:null};
    try{
      const token=await practiceListenerToken();
      const r=await fetch(new URL('/health',practiceListenerUrl).toString(),{headers:token?{authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(4_000)});
      const body=await r.json().catch(()=>({})) as any;
      const state=String(body?.status||'').toUpperCase();
      value={state:['OK','LOADING','RETRYING'].includes(state)?(state==='OK'?'READY':state):`HTTP_${r.status}`,model:typeof body?.model==='string'?body.model.slice(0,80):null};
    }catch{/* يبقى UNREACHABLE */}
    listenerHealthCache={at:Date.now(),value};
    return value;
  };
  /* للشاشات التي تسأل كثيرًا: آخرُ ما عُرف فورًا، والتحديثُ في الخلفية — لا تنتظر المستمع. */
  const practiceListenerHealthCached=():{state:string;model:string|null}=>{
    if(!listenerHealthCache||Date.now()-listenerHealthCache.at>=30_000)void practiceListenerHealth().catch(()=>{});
    return listenerHealthCache?.value??{state:/^https:\/\//i.test(practiceListenerUrl)?'CHECKING':'NOT_CONFIGURED',model:null};
  };

  /* إيقاظُ المستمع: Cloud Run ينام بلا طلبات، والنموذجُ يُحمَّل عند الإقلاع. يُنادى عند فتح
     الوجه أو الموضع فيجهز قبل أن يبدأ القارئ. */
  let listenerWokeAt=0;
  const wakeDedicatedListener=()=>{
    if(!/^https:\/\//i.test(practiceListenerUrl)||Date.now()-listenerWokeAt<60_000)return;
    listenerWokeAt=Date.now();
    void practiceListenerToken().then(token=>fetch(new URL('/health',practiceListenerUrl).toString(),{headers:token?{authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(15_000)})).catch(()=>{});
  };

  /*
   * كشفُ أخطاء التدريب لحظيًّا من المستمع نفسه.
   *
   * كان «السماعُ» (ما قيل كلمةً كلمة) معلّقًا بخدمة ASR خارجية وتقرير معايرة، ولم يُنشر
   * أيٌّ منهما — فبقي بابُ الأخطاء مغلقًا في كل مسابقة، والطالبُ لا يسمع تنبيهًا ولا يرى
   * خطأً. المستمعُ المنشور يعرف ما قيل، فيُفتح به الكشفُ **في التدريب وحده** (لا درجة ولا
   * تحكيم)، وبحرفه لا بتشكيله. والتقديرُ يبقى حذرًا: ما لم يثق به المحرّكُ لا يُقال خطأً.
   */
  const PRACTICE_LISTENER_MODEL='mizan-practice-listener';
  const practiceJudgingGate=(reading:string)=>{
    if(!recitationRecogniser.configured()&&dedicatedPracticeListenerReady(reading))
      return {reading,word:'OPEN',tashkeel:'CLOSED',modelVersion:PRACTICE_LISTENER_MODEL,reasons:['PRACTICE_LISTENER']};
    return recitationRecogniser.gate(reading);
  };
  const recogniseWithDedicatedListener=async(input:{reading:string;contentType:string;bytes:Buffer;headBytes:number})=>{
    /* الحمولةُ Buffer حصرًا: النصُّ والمصفوفةُ يملكان `length` كذلك فيُخدع به فحصُ الحجم. */
    if(!(input.bytes instanceof Uint8Array))throw new Error('QURAN_ASR_AUDIO_CHUNK_INVALID');
    const size=input.bytes.byteLength;
    if(!size||size>4_000_000)throw new Error('QURAN_ASR_AUDIO_CHUNK_INVALID');
    const token=await practiceListenerToken();
    const response=await fetch(new URL('/recognise',practiceListenerUrl).toString(),{method:'POST',headers:{
      'content-type':input.contentType||'application/octet-stream','x-mizan-reading':input.reading,
      'x-mizan-head-bytes':String(Number.isInteger(input.headBytes)&&input.headBytes>0?input.headBytes:0),
      ...(token?{authorization:`Bearer ${token}`}:{})
    },body:new Uint8Array(input.bytes),signal:AbortSignal.timeout(20_000)});
    if(response.status===503)throw new Error('QURAN_PRACTICE_LISTENER_WARMING');
    if(!response.ok)throw new Error(`QURAN_PRACTICE_LISTENER_HTTP_${response.status}`);
    const raw=await response.json() as any;
    const words=(Array.isArray(raw?.words)?raw.words:[]).slice(0,200).flatMap((w:any)=>{
      const text=typeof w?.text==='string'?w.text.trim().slice(0,64):'';const confidence=Number(w?.confidence);
      const startMs=Number(w?.startMs),endMs=Number(w?.endMs);
      if(!text||!Number.isFinite(confidence)||confidence<0||confidence>1)return [];
      return [{text,confidence,...(Number.isFinite(startMs)&&startMs>=0?{startMs}:{}),...(Number.isFinite(endMs)&&endMs>=0?{endMs}:{})}];
    });
    return {gate:practiceJudgingGate(input.reading),words,modelVersion:PRACTICE_LISTENER_MODEL};
  };

  /*
   * «المعلّم القرآني» — كشفُ التشكيل والتجويد بعد التلاوة (services/quran-muaalem).
   *
   * التتبّعُ الحيّ يعرف أين القارئ وما قاله من كلمات، ولا يسمع الحركات. والمعلّمُ يسمعها:
   * نموذجٌ درّبه أصحابُه على الرسم الصوتيّ للقرآن (MIT)، يقابل ما قيل بمرجع الآية فيقول
   * «الجيم: حركتُها فتحة، وسُمعت ضمّة»، و«المدّ المنفصل: مقدارُه ٤ حركات، وسُمع نحو ٢».
   *
   * ولأنّه أثقل من أن يسمع أثناء التلاوة، يُطلب بعدها: يُرسل الوجهُ مسجَّلًا مع مقاطعه (آيةً
   * آية، بأزمنتها من السماع الحيّ)، ولا يُحفظ الصوتُ في أيّ طرف. ولحفص وحده — فالرسمُ
   * الصوتيّ في المكتبة مبنيٌّ على حفص، ولا يُقاس قارئُ روايةٍ بمسطرة أخرى.
   */
  const muaalemUrl=String(process.env.MIZAN_QURAN_MUAALEM_URL||'').trim();
  const muaalemReady=():boolean=>/^https:\/\//i.test(muaalemUrl);
  const cloudRunIdentityToken=async(url:string):Promise<string>=>{
    try{
      const audience=new URL(url).origin;
      const r=await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`,{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(3_000)});
      return r.ok?(await r.text()).trim():'';
    }catch{return ''}
  };
  type MuaalemHealth={state:string;model:string|null;analysis?:string|null;mode?:string;modeReason?:string};
  let muaalemHealthCache:{at:number;value:MuaalemHealth}|null=null;
  /* المفتاحُ يُقرأ مع كلّ سؤال: قرارُ المالك (البيئة) وتقريرُ القياس والمحرّكُ العامل معًا. */
  const muaalemMode=(live:MuaalemHealth|null|undefined)=>muaalemGate({requested:process.env.MIZAN_QURAN_MUAALEM_MODE,report:muaalemBenchmarkReport,live});
  const muaalemHealth=async():Promise<MuaalemHealth>=>{
    if(!muaalemReady())return {state:'NOT_CONFIGURED',model:null};
    if(muaalemHealthCache&&Date.now()-muaalemHealthCache.at<30_000)return muaalemHealthCache.value;
    let value:MuaalemHealth={state:'UNREACHABLE',model:null};
    try{
      const token=await cloudRunIdentityToken(muaalemUrl);
      const r=await fetch(new URL('/health',muaalemUrl).toString(),{headers:token?{authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(4_000)});
      const body=await r.json().catch(()=>({})) as any;
      const state=String(body?.status||'').toUpperCase();
      value={state:['OK','LOADING','RETRYING'].includes(state)?(state==='OK'?'READY':state):`HTTP_${r.status}`,model:typeof body?.model==='string'?body.model.slice(0,80):null,analysis:typeof body?.analysis==='string'?body.analysis.slice(0,40):null};
    }catch{/* يبقى UNREACHABLE */}
    const gate=muaalemMode(value);value={...value,mode:gate.mode,modeReason:gate.reason};
    muaalemHealthCache={at:Date.now(),value};
    return value;
  };
  const muaalemHealthCached=():MuaalemHealth=>{
    if(!muaalemHealthCache||Date.now()-muaalemHealthCache.at>=30_000)void muaalemHealth().catch(()=>{});
    return muaalemHealthCache?.value??{state:muaalemReady()?'CHECKING':'NOT_CONFIGURED',model:null};
  };
  /*
   * طلبُ التحليل يُفحص كلُّه قبل أن يخرج: روايةُ حفص، ومقاطعُ في نطاق الطالب، وكلماتٌ
   * بأطوالٍ معقولة، وصوتٌ بحجمٍ محدود. وما يعود من الخدمة يُعاد بناؤه حقلًا حقلًا — فلا يمرّ
   * إلى المتصفّح شيءٌ لم يُسمَّ.
   */
  const MUAALEM_KINDS=new Set(['tashkeel','tajweed','letter']);
  const hafsRawi=candidateRawiForDeliveryKey('hafs');
  const muaalemRequest=(body:any,scope:QuranScope)=>{
    const audio=typeof body?.audio==='string'?body.audio:'';
    if(!audio||audio.length>8_000_000||!/^[A-Za-z0-9+/=]+$/.test(audio))throw new Error('TASHKEEL_AUDIO_INVALID');
    const raw=Array.isArray(body?.segments)?body.segments:[];
    if(!raw.length||raw.length>12)throw new Error('TASHKEEL_SEGMENTS_INVALID');
    const segments=raw.map((x:any,i:number)=>{
      const surah=Number(x?.surah),ayah=Number(x?.ayah),startMs=Number(x?.startMs),endMs=Number(x?.endMs),from=Number(x?.from),to=Number(x?.to);
      const words=Array.isArray(x?.ayahWords)?x.ayahWords.map((w:any)=>String(w).slice(0,40)):[];
      const indices=Array.isArray(x?.wordIndices)?x.wordIndices.map(Number):[];
      if(![surah,ayah,startMs,endMs,from,to].every(Number.isInteger)||!words.length||words.length>140||indices.length!==words.length||!indices.every(Number.isInteger))throw new Error('TASHKEEL_SEGMENTS_INVALID');
      if(from<0||to<from||to>=words.length||startMs<0||endMs<=startMs||endMs-startMs>20_000)throw new Error('TASHKEEL_SEGMENTS_INVALID');
      if(!scopeContainsRange(scope,{surah,ayah},{surah,ayah}))throw new Error('PRACTICE_SCOPE_MISMATCH');
      /* ونصُّ الآية من حزمة حفص نفسِها لا من المتصفّح: ما خالفها كلمةً يُرفض. */
      const canonical=hafsRawi?practiceAyahWords(hafsRawi,surah,ayah):null;
      if(!canonical||canonical.length!==words.length||canonical.some((w,k)=>w!==words[k]))throw new Error('TASHKEEL_TEXT_MISMATCH');
      return {id:String(x?.id??i).slice(0,40),surah,ayah,startMs,endMs,ayahWords:canonical,wordIndices:indices,from,to};
    });
    return {reading:'hafs',audio,segments};
  };
  const runMuaalem=async(request:{reading:string;audio:string;segments:any[]})=>{
    if(!muaalemReady())throw new Error('QURAN_MUAALEM_NOT_CONFIGURED');
    const gate=muaalemMode(await muaalemHealth().catch(()=>null));
    if(gate.mode==='off')throw new Error('QURAN_MUAALEM_OFF');
    const token=await cloudRunIdentityToken(muaalemUrl);
    const response=await fetch(new URL('/analyse',muaalemUrl).toString(),{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(request),signal:AbortSignal.timeout(280_000)});
    if(response.status===503)throw new Error('QURAN_MUAALEM_WARMING');
    if(!response.ok)throw new Error(`QURAN_MUAALEM_HTTP_${response.status}`);
    const raw=await response.json() as any;
    const segments=(Array.isArray(raw?.segments)?raw.segments:[]).slice(0,12).map((x:any)=>({
      id:String(x?.id??'').slice(0,40),
      status:['ok','unclear','skipped'].includes(x?.status)?x.status:'skipped',
      reason:typeof x?.reason==='string'?x.reason.slice(0,40):undefined,
      confidence:Number.isFinite(Number(x?.confidence))?Math.max(0,Math.min(1,Number(x.confidence))):undefined,
      findings:(Array.isArray(x?.findings)?x.findings:[]).slice(0,40).flatMap((f:any)=>{
        const wordIndex=Number(f?.wordIndex);const kind=String(f?.kind||'');
        if(!Number.isInteger(wordIndex)||!MUAALEM_KINDS.has(kind))return [];
        const num=(v:any)=>Number.isInteger(Number(v))&&Number(v)>=0&&Number(v)<=20?Number(v):undefined;
        return [{wordIndex,kind,speech:['replace','delete','insert'].includes(f?.speech)?f.speech:'replace',
          messageAr:String(f?.messageAr||'').slice(0,160),messageEn:String(f?.messageEn||'').slice(0,160),
          ruleAr:typeof f?.ruleAr==='string'?f.ruleAr.slice(0,60):undefined,expectedLen:num(f?.expectedLen),predictedLen:num(f?.predictedLen)}];
      }),
    }));
    return {reading:'hafs',modelVersion:String(raw?.modelVersion||'').slice(0,120),analysisVersion:String(raw?.analysisVersion||'').slice(0,40),
      mode:gate.mode,modeReason:gate.reason,...(gate.benchmark?{benchmark:gate.benchmark}:{}),scoreAuthority:'HUMAN_ONLY',segments};
  };
  const muaalemFailure=(res:Response,err:unknown)=>{
    const code=err instanceof Error?err.message:'TASHKEEL_FAILED';
    const status=/NOT_CONFIGURED|WARMING|MUAALEM_OFF/.test(code)?503:/MUAALEM_HTTP_/.test(code)?502:/SCOPE_MISMATCH|READING|TEXT_MISMATCH/.test(code)?409:/JOURNEY_|IDENTITY/.test(code)?401:400;
    return res.status(status).json({code});
  };

  const runPracticeListener=async(input:{access:JourneyPracticeAccess;surah:number;startAyah:number;endAyah:number;contentType:string;bytes:Buffer})=>{
    if(!journeyListeningReady(input.access.listening.reading))throw new Error('QURAN_PRACTICE_LISTENER_NOT_CONFIGURED');
    const passage=await quranDelivery.passage(input.access.deliveryReading,input.surah,input.startAyah,input.endAyah);
    if(!passage||!passage.ayat.length)throw new Error('PRACTICE_SCOPE_NOT_READY');
    if(!dedicatedPracticeListenerReady(input.access.listening.reading)){
      const recognised=await recitationRecogniser.recognise({
        reading:input.access.listening.reading,
        sourcePackageId:input.access.listening.sourcePackageId,
        contentType:input.contentType,
        bytes:input.bytes,
      });
      const expected=passage.ayat.flatMap(ayah=>String(ayah.text||'').split(/\s+/).filter(Boolean).map((text,index)=>({surah:ayah.surah,ayah:ayah.ayah,wordIndex:index+1,text})));
      let cursor=0;
      let candidate:typeof expected[number]|undefined;
      let confidence=0;
      for(const heard of recognised.words){
        const heardShape=quranSkeleton(heard.text);
        if(!heardShape)continue;
        for(let i=cursor;i<expected.length;i+=1){
          if(sameWord(expected[i].text,heard.text)){
            candidate=expected[i];
            cursor=i+1;
            confidence=Math.max(confidence,heard.confidence);
            break;
          }
        }
      }
      return {
        timestamp:new Date().toISOString(),reading:input.access.listening.reading,
        surah:candidate?.surah,ayah:candidate?.ayah,wordIndex:candidate?.wordIndex,
        alignmentState:candidate&&confidence>=0.55?'LOCKED':'LOST',recoveryState:candidate?'STABLE':'SEARCHING',
        smoothedConfidence:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):0,
        pointerMoved:!!candidate,practice:true,scoreAuthority:'HUMAN_ONLY',scoreDelta:0,shadowMode:true,
        backendEvidence:{modelVersion:recognised.modelVersion,acousticQuality:confidence||undefined}
      };
    }
    const {candidate,confidence,raw}=await callDedicatedListener({reading:input.access.listening.reading,ayat:passage.ayat,contentType:input.contentType,bytes:input.bytes});
    return {
      timestamp:new Date().toISOString(),reading:input.access.listening.reading,
      surah:candidate?Number(candidate.surah):undefined,ayah:candidate?Number(candidate.ayah):undefined,
      wordIndex:candidate?Number(candidate.wordIndex):undefined,
      alignmentState:candidate&&confidence>=0.55?'LOCKED':'LOST',recoveryState:'STABLE',
      smoothedConfidence:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):0,
      pointerMoved:!!candidate,practice:true,scoreAuthority:'HUMAN_ONLY',scoreDelta:0,shadowMode:true,
      backendEvidence:{modelVersion:String(raw?.modelVersion||'tarteel-whisper-base-ar-quran'),acousticQuality:raw?.acousticQuality}
    };
  };

  /*
   * تتبّعُ القارئ على سطح المحكّم — من المستمع نفسه.
   *
   * كان التتبّعُ الحيّ عند المحكّم معلّقًا بمحرّك الظلّ وحده (خزنةٌ ومعايرةٌ وخلفيّةٌ لم تُنشر
   * قط)، فلم يظهر زرّه ولا مؤشّرُه في أيّ مسابقة. والمستمعُ المنشورُ للتدريب يعرف الموضعَ
   * كذلك، فيُستعمل هنا لإظهار «أين القارئ» فقط: لا دليل، ولا درجة، ولا حكم — المحكّمُ يحكم.
   */
  app.get('/api/quran/judge/follow/status',alignmentAudioIpRateLimit,requireGovernanceRoles(['judge','head_judge']),(req,res)=>{
    let reading='';try{reading=soleParam(req.query.reading,'reading')||''}catch{return res.status(400).json({code:'QUERY_PARAM_REPEATED'})}
    const ready=dedicatedPracticeListenerReady(reading);
    if(ready)wakeDedicatedListener();
    res.setHeader('Cache-Control','no-store');
    return res.json({ready,reading,scoreAuthority:'HUMAN_ONLY'});
  });
  app.post('/api/quran/judge/follow',alignmentAudioIpRateLimit,requireGovernanceRoles(['judge','head_judge']),alignmentAudioRateLimit,express.raw({type:['audio/*','application/octet-stream'],limit:'4mb'}),async(req,res)=>{
    try{
      const reading=soleParam(req.query.reading,'reading');
      if(!dedicatedPracticeListenerReady(reading))throw new Error('QURAN_PRACTICE_LISTENER_NOT_CONFIGURED');
      const surah=Number(soleParam(req.query.surah,'surah')),startAyah=Number(soleParam(req.query.startAyah,'startAyah')),endAyah=Number(soleParam(req.query.endAyah,'endAyah'));
      const afterRaw=soleParam(req.query.after,'after');const after=afterRaw===undefined||afterRaw===''?undefined:Number(afterRaw);
      if(![surah,startAyah,endAyah].every(Number.isInteger)||endAyah<startAyah||endAyah-startAyah>60)throw new Error('QURAN_ALIGNMENT_RANGE_INVALID');
      const bytes:Buffer=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);
      if(!bytes.length)throw new Error('QURAN_ALIGNMENT_AUDIO_CHUNK_INVALID');
      const passage=await quranDelivery.passage(reading,surah,startAyah,endAyah);
      if(!passage||!passage.ayat.length)throw new Error('PRACTICE_SCOPE_NOT_READY');
      const {candidate,confidence,raw}=await callDedicatedListener({reading,ayat:passage.ayat,contentType:soleParam(req.headers['content-type'],'content-type')||'application/octet-stream',bytes,after:Number.isInteger(after)?after:undefined});
      const at=candidate?passage.ayat.find((a:any)=>a.ayah===Number(candidate.ayah)):undefined;
      res.setHeader('Cache-Control','no-store');
      return res.json({
        timestamp:new Date().toISOString(),reading,
        surah:candidate?Number(candidate.surah):undefined,ayah:candidate?Number(candidate.ayah):undefined,
        wordIndex:candidate?Number(candidate.wordIndex):undefined,globalIndex:candidate?Number(candidate.globalIndex):undefined,
        confidence,smoothedConfidence:Number.isFinite(confidence)?Math.max(0,Math.min(1,confidence)):0,
        alignmentState:candidate?'LOCKED':'REACQUIRING',recoveryState:candidate?'STABLE':'SEARCHING',
        pointerMoved:!!candidate,scoreAuthority:'HUMAN_ONLY',scoreDelta:0,shadowMode:true,
        visualLocation:at?{page:at.page,lineStart:at.lineStart,lineEnd:at.lineEnd,assurance:'AYAH_FROM_DELIVERY'}:null,
        backendEvidence:{modelVersion:String(raw?.modelVersion||'')}
      });
    }catch(err){
      const code=err instanceof Error?err.message:'QURAN_FOLLOW_FAILED';
      return res.status(/NOT_CONFIGURED/.test(code)?503:/WARMING/.test(code)?503:/LISTENER_HTTP_/.test(code)?502:400).json({code});
    }
  });

  app.post('/api/public/journeys/practice/tashkeel',practiceAlignmentIpRateLimit,journeyPracticeRateLimit,express.json({limit:'9mb'}),async(req,res)=>{
    try{const access=await journeyPracticeAccess(req);if(access.deliveryReading!=='hafs')throw new Error('TASHKEEL_READING_NOT_SUPPORTED');
      const out=await runMuaalem(muaalemRequest(req.body,access.scope));res.setHeader('Cache-Control','private, no-store');return res.json(out)}
    catch(err){return muaalemFailure(res,err)}
  });

  app.post('/api/public/journeys/practice/context',practiceAlignmentIpRateLimit,journeyPracticeRateLimit,async(req,res)=>{
    try{
      const access=await journeyPracticeAccess(req);
      const listening=journeyListeningReady(access.listening.reading)?access.listening:null;
      if(listening&&dedicatedPracticeListenerReady(listening.reading))wakeDedicatedListener();
      res.setHeader('Cache-Control','private, no-store');
      return res.json({scope:access.scope,deliveryReading:access.deliveryReading,listening,owner:access.participantId});
    }
    catch(err){return journeyPracticeFailure(res,err)}
  });
  app.post('/api/public/journeys/practice/faces',practiceAlignmentIpRateLimit,journeyPracticeRateLimit,express.json({limit:'8kb'}),async(req,res)=>{
    try{const access=await journeyPracticeAccess(req);const requested=soleParam(req.query.reading,'reading');if(requested!==access.deliveryReading)throw new Error('PRACTICE_REQUEST_MISMATCH');const rawi=candidateRawiForDeliveryKey(access.deliveryReading);if(!rawi)throw new Error('PRACTICE_READING_NOT_SUPPORTED');res.setHeader('Cache-Control','private, no-store');return res.json(practiceFaceCatalogue(rawi,access.scope))}
    catch(err){return journeyPracticeFailure(res,err)}
  });
  app.get('/api/public/journeys/practice/face',practiceAlignmentIpRateLimit,journeyPracticeRateLimit,async(req,res)=>{
    try{const access=await journeyPracticeAccess(req);const requested=soleParam(req.query.reading,'reading');if(requested!==access.deliveryReading)throw new Error('PRACTICE_REQUEST_MISMATCH');const rawi=candidateRawiForDeliveryKey(access.deliveryReading);if(!rawi)throw new Error('PRACTICE_READING_NOT_SUPPORTED');const page=Number(soleParam(req.query.page,'page'));const catalogue=practiceFaceCatalogue(rawi,access.scope);if(!catalogue.faces.some(x=>x.page===page))throw new Error('PRACTICE_FACE_OUT_OF_SCOPE');res.setHeader('Cache-Control','private, no-store');return res.json(practiceFacePage(rawi,page))}
    catch(err){return journeyPracticeFailure(res,err)}
  });
  app.get('/api/public/journeys/practice/judging-gate',practiceAlignmentIpRateLimit,journeyPracticeRateLimit,async(req,res)=>{
    try{const access=await journeyPracticeAccess(req);const reading=soleParam(req.query.reading,'reading');if(reading!==access.listening.reading)throw new Error('PRACTICE_REQUEST_MISMATCH');res.setHeader('Cache-Control','private, no-store');return res.json(practiceJudgingGate(reading))}
    catch(err){return journeyPracticeFailure(res,err)}
  });
  app.post('/api/public/journeys/practice/align',practiceAlignmentIpRateLimit,journeyPracticeRateLimit,express.raw({type:['audio/*','application/octet-stream'],limit:'2mb'}),async(req,res)=>{
    try{const access=await journeyPracticeAccess(req);const reading=soleParam(req.query.reading,'reading'),sourcePackageId=soleParam(req.query.sourcePackageId,'sourcePackageId');if(reading!==access.listening.reading||sourcePackageId!==access.listening.sourcePackageId)throw new Error('PRACTICE_REQUEST_MISMATCH');const surah=Number(soleParam(req.query.surah,'surah')),startAyah=Number(soleParam(req.query.startAyah,'startAyah')),endAyah=Number(soleParam(req.query.endAyah,'endAyah'));if(!scopeContainsRange(access.scope,{surah,ayah:startAyah},{surah,ayah:endAyah}))throw new Error('PRACTICE_SCOPE_MISMATCH');const bytes:Buffer=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);if(!bytes.length)throw new Error('QURAN_ALIGNMENT_AUDIO_CHUNK_INVALID');const out=await runPracticeListener({access,surah,startAyah,endAyah,contentType:soleParam(req.headers['content-type'],'content-type')||'application/octet-stream',bytes});res.setHeader('Cache-Control','private, no-store');return res.json(out)}
    catch(err){return journeyPracticeFailure(res,err)}
  });
  app.post('/api/public/journeys/practice/recognise',practiceAlignmentIpRateLimit,journeyPracticeRateLimit,express.raw({type:['audio/*','application/octet-stream'],limit:'2mb'}),async(req,res)=>{
    try{const access=await journeyPracticeAccess(req);const reading=soleParam(req.query.reading,'reading'),sourcePackageId=soleParam(req.query.sourcePackageId,'sourcePackageId');if(reading!==access.listening.reading||sourcePackageId!==access.listening.sourcePackageId)throw new Error('PRACTICE_REQUEST_MISMATCH');const bytes:Buffer=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);if(!recitationRecogniser.configured()&&dedicatedPracticeListenerReady(reading)){const headBytes=Number(soleParam(req.headers['x-mizan-head-bytes'],'x-mizan-head-bytes')||0);res.setHeader('Cache-Control','private, no-store');return res.json(await recogniseWithDedicatedListener({reading,contentType:soleParam(req.headers['content-type'],'content-type')||'application/octet-stream',bytes,headBytes}))}const out=await recitationRecogniser.recognise({reading,sourcePackageId,contentType:soleParam(req.headers['content-type'],'content-type')||'application/octet-stream',bytes});res.setHeader('Cache-Control','private, no-store');return res.json(out)}
    catch(err){
      const code=err instanceof Error?err.message:'';
      return code.startsWith('QURAN_ASR_')?recitationRecogniserFailure(res,err):journeyPracticeFailure(res,err);
    }
  });
  app.post('/api/quran/practice/faces',practiceAlignmentIpRateLimit,requireFirebaseRoles(['participant']),express.json({limit:'64kb'}),(req,res)=>{try{const rawi=practiceFaceRawi(req);const raw=req.body?.scope;const scope=raw&&typeof raw==='object'?normalizeScope(raw as QuranScope):undefined;res.setHeader('Cache-Control','no-store');return res.json(practiceFaceCatalogue(rawi,scope))}catch(err){return practiceFaceFailure(res,err)}});
  app.get('/api/quran/practice/face',practiceAlignmentIpRateLimit,requireFirebaseRoles(['participant']),(req,res)=>{try{const rawi=practiceFaceRawi(req);const page=Number(soleParam(req.query.page,'page'));res.setHeader('Cache-Control','no-store');return res.json(practiceFacePage(rawi,page))}catch(err){return practiceFaceFailure(res,err)}});

  /*
   * الإذنُ يُعلن للشاشة قبل أن تُفتح تلاوة — فتقول للطالب الحقَّ بدل أن تصمت.
   *
   * ومغلقٌ هو الأصل: بلا محرّكٍ مضبوطٍ وبلا تقرير قياسٍ لروايته، يعود البابُ مغلقًا
   * باسم سببه. ولا يعود خطأً: انعدامُ الإذن حالةٌ تُعرض لا عُطل.
   */
  app.post('/api/quran/practice/tashkeel',practiceAlignmentIpRateLimit,requireFirebaseRoles(['participant']),practiceAlignmentRateLimit,express.json({limit:'9mb'}),async(req,res)=>{
    try{if(soleParam(req.query.reading,'reading')!=='hafs')throw new Error('TASHKEEL_READING_NOT_SUPPORTED');
      const raw=req.body?.scope;const scope=raw&&typeof raw==='object'?normalizeScope(raw as QuranScope):undefined;if(!scope||scopeAyahCount(scope)===0)throw new Error('PRACTICE_SCOPE_MISMATCH');
      const out=await runMuaalem(muaalemRequest(req.body,scope));res.setHeader('Cache-Control','no-store');return res.json(out)}
    catch(err){return muaalemFailure(res,err)}
  });
  app.get('/api/quran/practice/judging-gate',practiceAlignmentIpRateLimit,requireFirebaseRoles(['participant']),(req,res)=>{res.setHeader('Cache-Control','no-store');return res.json(practiceJudgingGate(soleParam(req.query.reading,'reading')))});

  /*
   * وما يُسمع يُردّ كلماتٍ — ولا حكمَ هنا: الحكمُ حيث يُعرف نصُّ الوجه.
   *
   * ولا يُرسل بايتٌ واحدٌ من صوت الطالب إلى محرّكٍ ما لم يكن البابُ مفتوحًا: الفحصُ
   * كلُّه يقع قبل الشبكة في `RecitationRecogniser`.
   */
  app.post('/api/quran/practice/recognise',practiceAlignmentIpRateLimit,requireFirebaseRoles(['participant']),practiceRecognitionRateLimit,express.raw({type:['audio/*','application/octet-stream'],limit:'2mb'}),async(req,res)=>{try{const bytes:Buffer=Buffer.isBuffer(req.body)?req.body:Buffer.alloc(0);const reading=soleParam(req.query.reading,'reading');if(!recitationRecogniser.configured()&&dedicatedPracticeListenerReady(reading)){res.setHeader('Cache-Control','no-store');return res.json(await recogniseWithDedicatedListener({reading,contentType:soleParam(req.headers['content-type'],'content-type')||'application/octet-stream',bytes,headBytes:Number(soleParam(req.headers['x-mizan-head-bytes'],'x-mizan-head-bytes')||0)}))}const out=await recitationRecogniser.recognise({reading,sourcePackageId:soleParam(req.query.sourcePackageId,'sourcePackageId'),contentType:soleParam(req.headers['content-type'],'content-type')||'application/octet-stream',bytes});res.setHeader('Cache-Control','no-store');return res.json(out)}catch(err){return recitationRecogniserFailure(res,err)}});
  app.get('/api/quran/alignment/shadow/session/:sessionId',requireGovernanceRoles(['judge','head_judge','auditor']),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;try{res.setHeader('Cache-Control','no-store');return res.json(quranIntelligence.sessionEvidence(actor.uid,String(req.params.sessionId||'')))}catch(err){return quranIntelligenceFailure(res,err)}});
  app.post('/api/quran/alignment/shadow/session/:sessionId/human-marker',requireGovernanceRoles(['judge','head_judge']),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;try{return res.json(quranIntelligence.markHumanEvent(actor.uid,String(req.params.sessionId||''),String(req.body?.eventType||'')))}catch(err){return quranIntelligenceFailure(res,err)}});
  app.post('/api/quran/alignment/shadow/reset',requireGovernanceRoles(['judge','head_judge',]),(req,res)=>{if(!quranIntelligence)return res.status(503).json({code:'QURAN_INTELLIGENCE_NOT_CONFIGURED'});const actor=(req as any).mizanIdentity as ServerIdentity;quranIntelligence.resetAlignment(actor.uid,String(req.body?.sessionId||''));return res.json({reset:true,mode:'SHADOW_ONLY',scoreAuthority:'HUMAN_ONLY'})});

  // Production question pools are server-held. The browser never submits question plaintext.
  app.post('/api/enterprise/question-runtime/pools/:competitionId/:poolId/generate-from-certified-source',requireEnterpriseKey,(req,res)=>{if(!serverQuranSources||!serverQuestionPools)return res.status(503).json({code:'SERVER_QUESTION_POOL_SOURCE_NOT_CONFIGURED'});try{const body=req.body||{},poolId=String(req.params.poolId),report=buildQuestionPoolFromCertifiedSource({quran:serverQuranSources,packageId:String(body.sourcePackageId||''),poolId,allowedJuz:Array.isArray(body.allowedJuz)?body.allowedJuz.map(Number):[],scope:body.scope&&typeof body.scope==='object'?body.scope:undefined,passageAyahCount:Number(body.passageAyahCount||3),expectedParticipantCount:body.expectedParticipantCount===undefined?undefined:Number(body.expectedParticipantCount),questionsPerParticipant:body.questionsPerParticipant===undefined?undefined:Number(body.questionsPerParticipant),difficultyByLocus:body.difficultyByLocus&&typeof body.difficultyByLocus==='object'?body.difficultyByLocus:undefined,scientificallyApprovedStartLoci:Array.isArray(body.scientificallyApprovedStartLoci)?body.scientificallyApprovedStartLoci.map(String):undefined});if(body.requireFullFieldUniqueCoverage===true&&!report.fullFieldUniqueCoverage)return res.status(409).json({code:'QUESTION_POOL_UNIQUE_CAPACITY_INSUFFICIENT',uniqueStartLoci:report.uniqueStartLoci,requiredUniqueLoci:report.requiredUniqueLoci});const saved=serverQuestionPools.save(String(req.params.competitionId),poolId,report.items);const {items,...summary}=report;return res.status(201).json({saved,report:summary})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_POOL_GENERATION_FAILED'})}});
  app.post('/api/enterprise/question-runtime/pools/:competitionId/:poolId',requireEnterpriseKey,(req,res)=>{if(!serverQuestionPools)return res.status(503).json({code:'SERVER_QUESTION_POOL_NOT_CONFIGURED'});try{return res.status(201).json(serverQuestionPools.save(String(req.params.competitionId),String(req.params.poolId),Array.isArray(req.body?.items)?req.body.items:[]))}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'SERVER_QUESTION_POOL_SAVE_FAILED'})}});
  app.post('/api/enterprise/question-runtime/provision',enterpriseAuditRateLimit,requireEnterpriseKey,(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});const organizationId=enterpriseOrganization(req,res);if(!organizationId)return;try{const body=req.body||{};const runtime=secureQuestionRuntime.provision({organizationId,competitionId:String(body.competitionId||''),sessionId:String(body.sessionId||''),participantId:String(body.participantId||''),committeeId:String(body.committeeId||''),requiredJudgeIds:Array.isArray(body.requiredJudgeIds)?body.requiredJudgeIds.map(String):[],approvalMode:body.approvalMode==='minimum'?'minimum':'all_assigned',minimumApprovals:body.minimumApprovals?Number(body.minimumApprovals):undefined,expiresAt:String(body.expiresAt||''),sourcePackageId:String(body.sourcePackageId||''),poolId:String(body.poolId||''),questionCount:Number(body.questionCount||0),maxJuz:body.maxJuz===undefined?undefined:Number(body.maxJuz),participantScope:body.participantScope&&typeof body.participantScope==='object'?body.participantScope:undefined,participantScopeVersion:body.participantScopeVersion===undefined?undefined:Number(body.participantScopeVersion),targetDifficulty:body.targetDifficulty===undefined?undefined:Number(body.targetDifficulty),difficultyTolerance:body.difficultyTolerance===undefined?undefined:Number(body.difficultyTolerance),qiraah:String(body.qiraah||''),rawi:String(body.rawi||''),tariq:body.tariq?String(body.tariq):undefined,expectedParticipantCount:body.expectedParticipantCount===undefined?undefined:Number(body.expectedParticipantCount),acrossSurah:body.acrossSurah===undefined?undefined:!!body.acrossSurah,acrossJuz:body.acrossJuz===undefined?undefined:!!body.acrossJuz,requiredStartAssurance:body.requiredStartAssurance==='SCIENTIFICALLY_APPROVED'?'SCIENTIFICALLY_APPROVED':'QURAN_AYAH_BOUNDARY'});auditAppend(platformOperatorActor(organizationId,runtime.competitionId),{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId,competitionId:runtime.competitionId,action:'QUESTION_RUNTIME_PROVISIONED_BY_PLATFORM_OPERATOR',entityType:'QuestionRuntime',entityId:runtime.sessionId,reason:`Platform-operator provision for participant ${runtime.participantId} · ${runtime.questionCount} question(s)`,sessionId:runtime.sessionId,requestId:String(req.headers['x-request-id']||'')});res.status(201).json({runtime,assurance:'SERVER_FAIRDRAW_QURAN_RESOLUTION_ESCROW'})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_PROVISION_FAILED'})}});
  app.get('/api/question-runtime/participant/:participantId/active',questionRuntimeRateLimit,requireFirebaseRoles(['judge','head_judge','comp_admin','org_admin']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;const competitionId=String(req.query.competitionId||actor.competitionId||'');if(!competitionId)return res.status(400).json({code:'COMPETITION_REQUIRED'});return res.json({runtime:secureQuestionRuntime.findActiveForParticipant(competitionId,String(req.params.participantId),actor)})}catch(err){return res.status(404).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_ACTIVE_SESSION_NOT_FOUND'})}});
  app.get('/api/question-runtime/:sessionId/status',questionRuntimeRateLimit,requireFirebaseRoles(['judge','head_judge','comp_admin','org_admin']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;return res.json({runtime:secureQuestionRuntime.status(String(req.params.sessionId),actor)})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_STATUS_FAILED'})}});
  app.post('/api/question-runtime/:sessionId/presence',questionRuntimeRateLimit,requireFirebaseRoles(['judge']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;const method=String(req.body?.method||'manual_visual_confirmation');const runtime=secureQuestionRuntime.confirmPresence(String(req.params.sessionId),actor,method);auditAppend(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId:actor.competitionId||runtime.competitionId,action:'QUESTION_PARTICIPANT_PRESENCE_CONFIRMED',entityType:'QuestionRuntime',entityId:String(req.params.sessionId),reason:`Presence confirmed via ${method}`,sessionId:String(req.params.sessionId),requestId:String(req.headers['x-request-id']||'')});return res.json({runtime})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_PRESENCE_FAILED'})}});
  app.post('/api/question-runtime/:sessionId/questions/:questionIndex/approve',questionRuntimeRateLimit,requireFirebaseRoles(['judge']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;const runtime=secureQuestionRuntime.approveQuestion(String(req.params.sessionId),Number(req.params.questionIndex),actor);return res.json({runtime})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_APPROVAL_FAILED'})}});
  app.get('/api/question-runtime/:sessionId/questions/:questionIndex/reveal',questionRuntimeRateLimit,requireFirebaseRoles(['judge']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;const revealed=secureQuestionRuntime.revealQuestion(String(req.params.sessionId),Number(req.params.questionIndex),actor) as any;if(revealed?.exposureReceipt?.canaryToken)res.setHeader('X-Mizan-Exposure-Canary',revealed.exposureReceipt.canaryToken);auditAppend(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId:actor.competitionId||'',action:'QUESTION_PLAINTEXT_EXPOSED_TO_ASSIGNED_JUDGE',entityType:'QuestionRuntime',entityId:String(req.params.sessionId),reason:'Question released after participant presence and configured judge quorum',sessionId:String(req.params.sessionId),requestId:String(req.headers['x-request-id']||'')});return res.json(revealed)}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_REVEAL_FAILED'})}});
  app.post('/api/question-runtime/:sessionId/emergency-replacement/authorize',questionRuntimeRateLimit,requireGovernanceRoles(['head_judge','comp_admin','org_admin']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity,sessionId=String(req.params.sessionId);if(process.env.MIZAN_WITNESS_REQUIRED_FOR_QUESTION_REPLACEMENT==='true'){if(!witnessMode)throw new Error('WITNESS_MODE_NOT_CONFIGURED');witnessMode.verifyReady(String(req.body?.witnessActionId||''),{organizationId:actor.organizationId,competitionId:String(actor.competitionId||''),actionType:'QUESTION_REPLACEMENT',targetRef:`question-replacement:${sessionId}`})}const runtime=secureQuestionRuntime.authorizeEmergencyReplacement({sessionId,actor,reason:String(req.body?.reason||''),expiresAt:String(req.body?.expiresAt||'')});auditAppend(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId:actor.competitionId||runtime.competitionId,action:'QUESTION_REPLACEMENT_AUTHORIZED',entityType:'QuestionRuntime',entityId:sessionId,reason:String(req.body?.reason||''),sessionId,requestId:String(req.headers['x-request-id']||'')});return res.json({runtime})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_REPLACEMENT_AUTHORIZATION_FAILED'})}});
  app.post('/api/question-runtime/:sessionId/emergency-replacement/revoke',questionRuntimeRateLimit,requireGovernanceRoles(['head_judge','comp_admin','org_admin']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;return res.json({runtime:secureQuestionRuntime.revokeEmergencyReplacement(String(req.params.sessionId),actor)})}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_REPLACEMENT_REVOKE_FAILED'})}});
  app.post('/api/question-runtime/:sessionId/questions/:questionIndex/emergency-replacement/approve',questionRuntimeRateLimit,requireFirebaseRoles(['judge']),(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const actor=(req as any).mizanIdentity;const result=secureQuestionRuntime.approveEmergencyReplacement({sessionId:String(req.params.sessionId),questionIndex:Number(req.params.questionIndex),actor});if(result.replacementReady)auditAppend(actor,{eventId:String(req.headers['x-request-id']||crypto.randomUUID()),organizationId:actor.organizationId,competitionId:actor.competitionId||result.competitionId,action:'QUESTION_REPLACED_EMERGENCY',entityType:'QuestionRuntime',entityId:String(req.params.sessionId),reason:'Authorized one-question emergency replacement',sessionId:String(req.params.sessionId),requestId:String(req.headers['x-request-id']||'')});return res.json(result)}catch(err){return res.status(409).json({code:err instanceof Error?err.message:'QUESTION_REPLACEMENT_APPROVAL_FAILED'})}});
  /* تدقيق النطاق دون كشف السؤال: يُجيب هل كل موضع مخصَّص واقع داخل نطاق صاحبه أم لا. */
  app.get('/api/enterprise/question-runtime/:sessionId/scope-verification',enterpriseAuditRateLimit,requireEnterpriseKey,(req,res)=>{if(!secureQuestionRuntime)return res.status(503).json({code:'SECURE_QUESTION_RUNTIME_NOT_CONFIGURED'});try{const result=secureQuestionRuntime.verifyAllocationScope(String(req.params.sessionId));return res.json({...result,valid:result.violations.length===0})}catch(err){return res.status(404).json({code:err instanceof Error?err.message:'QUESTION_RUNTIME_NOT_FOUND'})}});
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

  app.post('/api/enterprise/question-escrow/sessions',enterpriseAuditRateLimit,requireEnterpriseKey,(req,res)=>{if(!questionEscrowConfigured||!questionEscrow)return res.status(503).json({code:'QUESTION_ESCROW_NOT_CONFIGURED'});const escrowOrganizationId=enterpriseOrganization(req,res);if(!escrowOrganizationId)return;try{const body=req.body||{};const created=questionEscrow.create({organizationId:escrowOrganizationId,competitionId:String(body.competitionId||''),sessionId:String(body.sessionId||''),participantId:String(body.participantId||''),committeeId:String(body.committeeId||''),requiredJudgeIds:Array.isArray(body.requiredJudgeIds)?body.requiredJudgeIds.map(String):[],approvalMode:body.approvalMode==='minimum'?'minimum':'all_assigned',minimumApprovals:body.minimumApprovals?Number(body.minimumApprovals):undefined,expiresAt:String(body.expiresAt||''),questions:Array.isArray(body.questions)?body.questions.map((q:any)=>({index:Number(q.index),questionId:String(q.questionId||''),payload:q.payload&&typeof q.payload==='object'?q.payload:{}})):[]});res.status(201).json({created:true,escrow:created,assurance:'production_server_escrow'})}catch(err){return escrowFailure(res,err)}});
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

  /* رقم الشهادة يصل من طلب عام: يُقيَّد شكله عند الحدّ قبل أن يمسّ السجل. */
  const CERTIFICATE_NUMBER_RE=/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

  /* سجل الشهادات العام: من يمسك شهادة مطبوعة يتحقق منها بنفسه، بلا حساب وبلا وصول لبيانات المسابقة. */
  app.post('/api/certificates/publish',certificatePublishRateLimit,requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{
    if(!certificateRegistry)return res.status(503).json({code:'CERTIFICATE_REGISTRY_NOT_CONFIGURED'});
    const identity=(req as any).mizanIdentity;const body=req.body||{};
    if(String(body.organizationId||'')!==identity.organizationId)return res.status(403).json({code:'CERTIFICATE_TENANT_MISMATCH'});
    try{return res.status(201).json({certificate:certificateRegistry.publish(body)})}catch(err){return res.status(400).json({code:err instanceof Error?err.message:'CERTIFICATE_PUBLISH_FAILED'})}
  });
  app.post('/api/certificates/:number/revoke',certificatePublishRateLimit,requireGovernanceRoles(['super_admin','org_admin','comp_admin']),(req,res)=>{
    if(!certificateRegistry)return res.status(503).json({code:'CERTIFICATE_REGISTRY_NOT_CONFIGURED'});
    const identity=(req as any).mizanIdentity;
    const number=String(req.params.number??'').trim();
    if(!CERTIFICATE_NUMBER_RE.test(number))return res.status(400).json({code:'CERTIFICATE_NUMBER_INVALID'});
    try{return res.json({certificate:certificateRegistry.revoke(number,identity.organizationId,String(req.body?.reason||''))})}
    catch(err){const code=err instanceof Error?err.message:'CERTIFICATE_REVOKE_FAILED';return res.status(code==='CERTIFICATE_NOT_FOUND'?404:code==='CERTIFICATE_TENANT_MISMATCH'?403:400).json({code})}
  });
  app.get('/api/public/certificates/:number',certificateVerifyRateLimit,(req,res)=>{
    if(!certificateRegistry)return res.status(503).json({code:'CERTIFICATE_REGISTRY_NOT_CONFIGURED'});
    const number=String(req.params.number??'').trim();
    if(!CERTIFICATE_NUMBER_RE.test(number))return res.status(404).json({state:'NOT_FOUND'});
    try{const verdict=certificateRegistry.verify(number);return res.status(verdict.state==='NOT_FOUND'?404:200).json(verdict)}
    catch(err){return res.status(500).json({code:err instanceof Error?err.message:'CERTIFICATE_VERIFY_FAILED'})}
  });

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
  const aiAdvisoryRoles=['judge','head_judge','comp_admin','org_admin','ops_manager','auditor'];
  const aiAdvisoryAuth:RequestHandler=firebaseProjectId?requireFirebaseRoles(aiAdvisoryRoles):requireEnterpriseKey;
  app.post('/api/copilot/query',aiAdvisoryAuth,async(req,res)=>{const endpoint=process.env.MIZAN_COPILOT_URL;const token=process.env.MIZAN_COPILOT_TOKEN;if(!endpoint)return res.status(503).json({code:'COPILOT_PROVIDER_NOT_CONNECTED'});try{const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({question:String(req.body?.question||'').slice(0,1000),context:req.body?.context||{}})});const body=await r.text();res.status(r.status).type(r.headers.get('content-type')||'application/json').send(body)}catch{return res.status(502).json({code:'COPILOT_UPSTREAM_UNAVAILABLE'})}});
  app.post('/api/ai/integrity/analyze',aiAdvisoryAuth,async(req,res)=>{const endpoint=process.env.MIZAN_AI_INTEGRITY_URL;const token=process.env.MIZAN_AI_INTEGRITY_TOKEN;if(!endpoint)return res.status(503).json({code:'AI_INTEGRITY_PROVIDER_NOT_CONNECTED'});try{const payload={sessionId:String(req.body?.sessionId||''),audioRef:String(req.body?.audioRef||''),expectedQuestionIds:Array.isArray(req.body?.expectedQuestionIds)?req.body.expectedQuestionIds.slice(0,20):[],riwaya:String(req.body?.riwaya||'')};const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(payload)});const body=await r.text();res.status(r.status).type(r.headers.get('content-type')||'application/json').send(body)}catch{return res.status(502).json({code:'AI_INTEGRITY_UPSTREAM_UNAVAILABLE'})}});

  const providerUrl=(channel:string)=>process.env[`MIZAN_${channel.toUpperCase()}_PROVIDER_URL`];
  const providerToken=(channel:string)=>process.env[`MIZAN_${channel.toUpperCase()}_PROVIDER_TOKEN`];
  app.post('/api/enterprise/notifications/dispatch',requireEnterpriseKey,async(req,res)=>{const channel=String(req.body?.channel||'');if(!['email','sms','whatsapp','push'].includes(channel))return res.status(400).json({code:'UNSUPPORTED_CHANNEL'});const endpoint=providerUrl(channel);if(!endpoint){opsTelemetry?.recordNotification({tenantId:req.body?.tenantId?String(req.body.tenantId):undefined,competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,channel,provider:'not_configured',status:'FAILED',retryable:false,idempotencyKey:req.body?.idempotencyKey?String(req.body.idempotencyKey):undefined,errorCode:'PROVIDER_NOT_CONNECTED'});return res.status(503).json({code:'PROVIDER_NOT_CONNECTED',channel})}const started=Date.now();try{const token=providerToken(channel);const upstream=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({recipient:req.body?.recipient,templateKey:req.body?.templateKey,locale:req.body?.locale,payload:req.body?.payload||{},idempotencyKey:req.body?.idempotencyKey})});opsTelemetry?.recordNotification({tenantId:req.body?.tenantId?String(req.body.tenantId):undefined,competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,channel,provider:endpoint,status:upstream.ok?'ACCEPTED':'FAILED',statusCode:upstream.status,retryable:upstream.status>=500||upstream.status===429,idempotencyKey:req.body?.idempotencyKey?String(req.body.idempotencyKey):undefined,latencyMs:Date.now()-started,errorCode:upstream.ok?undefined:'PROVIDER_REJECTED'});if(!upstream.ok)return res.status(502).json({code:'PROVIDER_REJECTED',channel,status:upstream.status});res.status(202).json({accepted:true,channel})}catch{opsTelemetry?.recordNotification({tenantId:req.body?.tenantId?String(req.body.tenantId):undefined,competitionId:req.body?.competitionId?String(req.body.competitionId):undefined,channel,provider:endpoint,status:'FAILED',retryable:true,idempotencyKey:req.body?.idempotencyKey?String(req.body.idempotencyKey):undefined,latencyMs:Date.now()-started,errorCode:'PROVIDER_UNAVAILABLE'});return res.status(502).json({code:'PROVIDER_UNAVAILABLE',channel})}});

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
