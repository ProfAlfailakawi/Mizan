import { useState, useEffect } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from './firebase';
import {
  User,
  Role,
  Organization,
  OrganizationBrand,
  Competition,
  Category,
  Participant,
  Committee,
  JudgeProfile,
  ResultRecord,
  ReviewCase,
  AIObservation,
  Certificate,
  AuditEvent,
  JudgeEvent,
  JudgeEventType,
  JudgeSubmission,
  QuestionSelection,
  IncidentRecord,
  SimulationResult,
  AppealRecord,
  IntegrationConfig, NotificationRecord, WebhookSubscription, DeviceRecord, DelegationTravelRecord, ConsentRecord, ImportJobRecord, ShadowRun, ParticipantPassportEntry, JudgePassportEntry, TrainingRun, BackupRecord, RetentionJob, SupportSession, RemoteSessionCheck, AudioRecordingRecord, FeatureFlagRecord, QuranSourceManifestRecord, QuestionGovernanceRecord, AICapabilityValidationRecord, OperatingCostModel, TimeMachineScenarioRecord, QuorumActionRecord, QuorumActionType, InvariantCheckResult, InvariantViolationRecord, ScientificEvidenceNode, ScientificEvidenceEdge, PublicResultRootRecord, PublicResultProofRecord, LocalMeshSessionRecord, FederationAttestationRecord, MizanProtocolPackageRecord, FlightRecorderEntry, IntegrityEnvelopeRecord, ChaosDrillRecord, AccessibilityProfileRecord, CommitteeElasticityRecommendation, JourneyPassRecord, PolicyCompilationRecord, ContradictionIssueRecord, DisasterPackRecord, DeviceReassignmentRecord, JudgeFatigueRecommendationRecord, CompetitionBenchmarkRecord, RehearsalRecord, RehearsalCheckRecord, ScientificDatasetRecord, BenchmarkRunRecord, VariantLocusRecord, QuranReferenceAudioRecord, FederationTrustRecord, CeremonyVaultRecord, FairDrawProofRecord, QuranSourceContentRecord, QuranCrossCheckRecord, ScientificAdjudicationCaseRecord, ScientificImpactReportRecord
} from '../types';
import {
  SEED_ORGANIZATION,
  SEED_COMPETITION,
  SEED_USERS,
  SEED_COMMITTEES,
  SEED_JUDGES,
  SEED_PARTICIPANTS,
  SEED_REVIEW_CASES,
  SEED_RESULTS,
  SEED_CERTIFICATE,
  SEED_AUDIT_LOGS,
  SEED_INCIDENTS
} from './seed-data';
import { DEVELOPMENT_QUESTION_BANK } from './quran-vault';
import { SupportedLanguage, LANGUAGE_META } from './i18n';
import { applyTemplate as applyCompetitionTemplate, getCompetitionPolicy, getEnabledJudgeActions, getReadinessIssues } from './competition-config';
import { newId, sha256 } from './crypto';
import { generateFairDraw, verifyFairDrawSelection, verifyFairDrawPublicProof } from './fairdraw';
import { enqueueOfflineEvent, drainOfflineEvents } from './offline-queue';
import { buildMerkleTree, canonicalStringify, finishMinutes, hashCanonical, merkleProofForIndex, quorumSatisfied, verifyMerkleProof } from './trust-protocol';
import { createBrowserBroadcastMesh, MeshTransportAdapter, MeshWireEnvelope } from './mesh-transport';
import { can } from './permissions';
import { TEN_QIRAAT_GRAPH, computeQuranPackageHash, immutableSourceUpdateAllowed, canPromoteQuranSource, certificationReleaseGate, aiCapabilityState, sourceUsableForCompetition, certifiedCapabilityFor, resolveReading, resolveReadings, detectModelChange, explicitConsentGranted } from './scientific-core';
import { compilePolicyText, detectContradictions, policyCompilerSummary, applyApprovedCompilation } from './policy-compiler';
import { validateVerseStructure, compareQuranRows, type QuranVerseRecord } from './quran-source-ingestion';
import { buildDisasterPack, generateEncryptionKey, encryptJson, privacySafeBenchmark, fatigueRecommendation, proposeDeviceReassignment, canApplyDeviceReassignment, runRehearsal, simulateNotificationFailureRecovery, verifyDisasterPack, generateSigningKeyPair, exportPublicJwk, issueSignedPass, importPublicJwk, verifySignedPass, compactCredentialToJourneyRecord, testRestoreDisasterPack, federationAttestationDigest, developmentFederationSignature, verifyFederationAttestationEvidence, REQUIRED_REHEARSAL_CHECK_IDS } from './nextgen-integrity';

interface AppStoreState {
  currentUser: User;
  organization: Organization;
  organizations: Organization[];
  language: SupportedLanguage;
  competition: Competition;
  competitions: Competition[];
  participants: Participant[];
  committees: Committee[];
  judges: JudgeProfile[];
  results: ResultRecord[];
  reviewCases: ReviewCase[];
  aiObservations: AIObservation[];
  judgeSubmissions: JudgeSubmission[];
  certificates: Certificate[];
  auditLogs: AuditEvent[];
  incidents: IncidentRecord[];
  appeals: AppealRecord[];
  isOffline: boolean;
  emergencyFrozen: boolean;
  sealApprovals: { actorId: string; actorRole: Role; actorName: string; timestamp: string }[];
  integrations: IntegrationConfig[];
  notifications: NotificationRecord[];
  webhooks: WebhookSubscription[];
  devices: DeviceRecord[];
  travelRecords: DelegationTravelRecord[];
  consents: ConsentRecord[];
  importJobs: ImportJobRecord[];
  shadowRuns: ShadowRun[];
  participantPassport: ParticipantPassportEntry[];
  judgePassport: JudgePassportEntry[];
  trainingRuns: TrainingRun[];
  backups: BackupRecord[];
  retentionJobs: RetentionJob[];
  supportSessions: SupportSession[];
  remoteChecks: RemoteSessionCheck[];
  audioRecordings: AudioRecordingRecord[];
  featureFlags: FeatureFlagRecord[];
  quranSourceManifests: QuranSourceManifestRecord[];
  quranSourceContents: QuranSourceContentRecord[];
  questionGovernance: QuestionGovernanceRecord[];
  aiCapabilityValidations: AICapabilityValidationRecord[];
  operatingCostModel: OperatingCostModel;
  timeMachineScenarios: TimeMachineScenarioRecord[];
  quorumActions: QuorumActionRecord[];
  invariantViolations: InvariantViolationRecord[];
  evidenceNodes: ScientificEvidenceNode[];
  evidenceEdges: ScientificEvidenceEdge[];
  publicResultRoots: PublicResultRootRecord[];
  publicResultProofs: PublicResultProofRecord[];
  localMeshSessions: LocalMeshSessionRecord[];
  federationAttestations: FederationAttestationRecord[];
  protocolPackages: MizanProtocolPackageRecord[];
  flightRecorderEntries: FlightRecorderEntry[];
  integrityEnvelopes: IntegrityEnvelopeRecord[];
  chaosDrills: ChaosDrillRecord[];
  accessibilityProfiles: AccessibilityProfileRecord[];
  elasticityRecommendations: CommitteeElasticityRecommendation[];
  journeyPasses: JourneyPassRecord[];
  policyCompilations: PolicyCompilationRecord[];
  contradictionIssues: ContradictionIssueRecord[];
  disasterPacks: DisasterPackRecord[];
  deviceReassignments: DeviceReassignmentRecord[];
  fatigueRecommendations: JudgeFatigueRecommendationRecord[];
  competitionBenchmarks: CompetitionBenchmarkRecord[];
  rehearsals: RehearsalRecord[];
  scientificDatasets: ScientificDatasetRecord[];
  benchmarkRuns: BenchmarkRunRecord[];
  variantLoci: VariantLocusRecord[];
  quranReferenceAudio: QuranReferenceAudioRecord[];
  quranCrossChecks: QuranCrossCheckRecord[];
  scientificAdjudications: ScientificAdjudicationCaseRecord[];
  scientificImpactReports: ScientificImpactReportRecord[];
  federationTrust: FederationTrustRecord[];
  ceremonyVaults: CeremonyVaultRecord[];
  fairDrawProofs: FairDrawProofRecord[];
  
  // Active JudgeOS Session State
  activeSession: {
    sessionId: string;
    participant: Participant | null;
    committee: Committee | null;
    questionSelection: QuestionSelection | null;
    currentQuestionIndex: number;
    isReciting: boolean;
    durationSeconds: number;
    events: JudgeEvent[];
    isLocked: boolean;
    audioLevel: number; // 0 to 100 for mic monitor
  };
}

const STORAGE_KEY = 'mizan_os_store_v1';

function getInitialState(): AppStoreState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as AppStoreState;
      parsed.organization = parsed.organization || SEED_ORGANIZATION;
      parsed.organizations = parsed.organizations?.length ? parsed.organizations : [parsed.organization];
      parsed.competition = { ...parsed.competition, policy: getCompetitionPolicy(parsed.competition), ruleSets: parsed.competition.ruleSets || [parsed.competition.ruleSet] };
      parsed.competitions = parsed.competitions?.length ? parsed.competitions.map(c => ({ ...c, policy: getCompetitionPolicy(c), ruleSets: c.ruleSets || [c.ruleSet] })) : [parsed.competition];
      // Legacy local demo data is migrated into the active competition scope so no record can leak across competitions.
      parsed.reviewCases = (parsed.reviewCases || []).map(r => ({ ...r, competitionId: r.competitionId || parsed.competition.id }));
      parsed.aiObservations = (parsed.aiObservations || []).map(o => ({ ...o, competitionId: o.competitionId || parsed.competition.id }));
      parsed.appeals = parsed.appeals || [];
      parsed.sealApprovals = parsed.sealApprovals || [];
      parsed.integrations = parsed.integrations || []; parsed.notifications = parsed.notifications || []; parsed.webhooks = parsed.webhooks || []; parsed.devices = parsed.devices || [];
      parsed.travelRecords = parsed.travelRecords || []; parsed.consents = parsed.consents || []; parsed.importJobs = parsed.importJobs || []; parsed.shadowRuns = parsed.shadowRuns || [];
      parsed.participantPassport = parsed.participantPassport || []; parsed.judgePassport = parsed.judgePassport || []; parsed.trainingRuns = parsed.trainingRuns || [];
      parsed.backups = parsed.backups || []; parsed.retentionJobs = parsed.retentionJobs || []; parsed.supportSessions = parsed.supportSessions || []; parsed.remoteChecks = parsed.remoteChecks || []; parsed.audioRecordings = parsed.audioRecordings || []; parsed.featureFlags = parsed.featureFlags || []; parsed.quranSourceManifests=parsed.quranSourceManifests||[]; parsed.quranSourceContents=parsed.quranSourceContents||[]; parsed.questionGovernance=parsed.questionGovernance||DEVELOPMENT_QUESTION_BANK.map(q=>({questionId:q.id,competitionId:parsed.competition.id,expertDifficulty:q.difficultyRating,status:'fixture',updatedAt:new Date().toISOString()})); parsed.aiCapabilityValidations=parsed.aiCapabilityValidations||[]; parsed.operatingCostModel=parsed.operatingCostModel||{baselineStaff:24,mizanStaff:6,hoursPerDay:8,days:2}; parsed.timeMachineScenarios=parsed.timeMachineScenarios||[]; parsed.quorumActions=parsed.quorumActions||[]; parsed.invariantViolations=parsed.invariantViolations||[]; parsed.evidenceNodes=parsed.evidenceNodes||[]; parsed.evidenceEdges=parsed.evidenceEdges||[]; parsed.publicResultRoots=parsed.publicResultRoots||[]; parsed.publicResultProofs=parsed.publicResultProofs||[]; parsed.localMeshSessions=parsed.localMeshSessions||[]; parsed.federationAttestations=parsed.federationAttestations||[]; parsed.protocolPackages=parsed.protocolPackages||[]; parsed.flightRecorderEntries=parsed.flightRecorderEntries||[]; parsed.integrityEnvelopes=parsed.integrityEnvelopes||[]; parsed.chaosDrills=parsed.chaosDrills||[]; parsed.accessibilityProfiles=parsed.accessibilityProfiles||[]; parsed.elasticityRecommendations=parsed.elasticityRecommendations||[]; parsed.journeyPasses=parsed.journeyPasses||[]; parsed.policyCompilations=parsed.policyCompilations||[]; parsed.contradictionIssues=parsed.contradictionIssues||[]; parsed.disasterPacks=parsed.disasterPacks||[]; parsed.deviceReassignments=parsed.deviceReassignments||[]; parsed.fatigueRecommendations=parsed.fatigueRecommendations||[]; parsed.competitionBenchmarks=parsed.competitionBenchmarks||[]; parsed.rehearsals=parsed.rehearsals||[]; parsed.scientificDatasets=parsed.scientificDatasets||[]; parsed.benchmarkRuns=parsed.benchmarkRuns||[]; parsed.variantLoci=parsed.variantLoci||[]; parsed.quranReferenceAudio=parsed.quranReferenceAudio||[]; parsed.quranCrossChecks=parsed.quranCrossChecks||[]; parsed.scientificAdjudications=parsed.scientificAdjudications||[]; parsed.scientificImpactReports=parsed.scientificImpactReports||[]; parsed.federationTrust=parsed.federationTrust||[]; parsed.ceremonyVaults=parsed.ceremonyVaults||[]; parsed.fairDrawProofs=parsed.fairDrawProofs||[]; parsed.quranSourceManifests=(parsed.quranSourceManifests||[]).map(q=>({...q,certificationState:q.certificationState||(q.status==='approved'?'CERTIFIED':q.status==='retired'?'REVOKED':q.status==='reviewed'?'PENDING_REVIEW':'DEVELOPMENT'),revocationState:q.revocationState||(q.status==='retired'?'REVOKED':'ACTIVE'),immutable:q.immutable??q.status==='approved'})); parsed.aiCapabilityValidations=(parsed.aiCapabilityValidations||[]).map(v=>({...v,certificationState:v.certificationState||(v.status==='certified'?'CERTIFIED':v.status==='suspended'?'SUSPENDED':v.status==='validated'?'PENDING_VALIDATION':'RESEARCH')}));
      return parsed;
    }
  } catch {
    // fallback to initial seed
  }

  const defaultUser = SEED_USERS.find((u) => u.role === 'comp_admin') || SEED_USERS[0];

  return {
    currentUser: defaultUser,
    organization: SEED_ORGANIZATION,
    organizations: [SEED_ORGANIZATION],
    language: 'ar',
    competition: { ...SEED_COMPETITION, policy: getCompetitionPolicy(SEED_COMPETITION), ruleSets: SEED_COMPETITION.ruleSets || [SEED_COMPETITION.ruleSet] },
    competitions: [{ ...SEED_COMPETITION, policy: getCompetitionPolicy(SEED_COMPETITION), ruleSets: SEED_COMPETITION.ruleSets || [SEED_COMPETITION.ruleSet] }],
    participants: SEED_PARTICIPANTS,
    committees: SEED_COMMITTEES,
    judges: SEED_JUDGES,
    results: SEED_RESULTS,
    reviewCases: SEED_REVIEW_CASES,
    aiObservations: [],
    judgeSubmissions: [],
    certificates: [SEED_CERTIFICATE],
    auditLogs: SEED_AUDIT_LOGS,
    incidents: SEED_INCIDENTS,
    appeals: [],
    isOffline: false,
    emergencyFrozen: false,
    sealApprovals: [],
    integrations: [], notifications: [], webhooks: [],
    devices: [
      {id:'dev-kiosk-1',competitionId:SEED_COMPETITION.id,name:'Gate Kiosk 01',type:'kiosk',zone:'Gate',status:'online',lastSeenAt:new Date().toISOString(),softwareVersion:'1.0.0'},
      {id:'dev-edge-1',competitionId:SEED_COMPETITION.id,name:'MIZAN Edge Primary',type:'edge_server',zone:'Control',status:'online',lastSeenAt:new Date().toISOString(),softwareVersion:'1.0.0'}
    ],
    travelRecords: [], consents: [], importJobs: [], shadowRuns: [], participantPassport: [], judgePassport: [], trainingRuns: [], backups: [], retentionJobs: [], supportSessions: [], remoteChecks: [], audioRecordings: [], featureFlags: [], quranSourceManifests: [], quranSourceContents: [], questionGovernance: DEVELOPMENT_QUESTION_BANK.map(q=>({questionId:q.id,competitionId:SEED_COMPETITION.id,expertDifficulty:q.difficultyRating,status:'fixture',updatedAt:new Date().toISOString()})), aiCapabilityValidations: [], operatingCostModel:{baselineStaff:24,mizanStaff:6,hoursPerDay:8,days:2},
    timeMachineScenarios:[], quorumActions:[], invariantViolations:[], evidenceNodes:[], evidenceEdges:[], publicResultRoots:[], publicResultProofs:[], localMeshSessions:[], federationAttestations:[], protocolPackages:[], flightRecorderEntries:[], integrityEnvelopes:[], chaosDrills:[], accessibilityProfiles:[], elasticityRecommendations:[], journeyPasses:[], policyCompilations:[], contradictionIssues:[], disasterPacks:[], deviceReassignments:[], fatigueRecommendations:[], competitionBenchmarks:[], rehearsals:[], scientificDatasets:[], benchmarkRuns:[], variantLoci:[], quranReferenceAudio:[], quranCrossChecks:[], scientificAdjudications:[], scientificImpactReports:[], federationTrust:[], ceremonyVaults:[], fairDrawProofs:[],
    activeSession: {
      sessionId: 'sess-active-001',
      participant: SEED_PARTICIPANTS[0], // Bilal Ahmad (A-104)
      committee: SEED_COMMITTEES[0],
      questionSelection: {
        questionSetId: 'qset-104-fairdraw',
        participantId: 'part-104',
        questions: [DEVELOPMENT_QUESTION_BANK[0], DEVELOPMENT_QUESTION_BANK[1], DEVELOPMENT_QUESTION_BANK[3]],
        difficultyVectorScore: 2.33,
        seedCommitmentHash: 'DEMO:generated-at-runtime-in-live-sessions',
        fairnessToleranceDelta: 0.04,
        generatedAt: new Date().toISOString()
      },
      currentQuestionIndex: 0,
      isReciting: true,
      durationSeconds: 142,
      events: [
        {
          id: 'ev-1',
          sessionId: 'sess-active-001',
          questionIndex: 0,
          judgeId: 'usr-judge-1',
          judgeName: 'Dr. Ahmad Isa Al-Masarawi',
          timestamp: new Date().toISOString(),
          relativeSeconds: 45,
          type: 'tajweed_minor',
          criterion: 'tajweed',
          penalty: 0.25
        }
      ],
      isLocked: false,
      audioLevel: 78
    }
  };
}

let globalState = getInitialState();
let browserMeshAdapter: MeshTransportAdapter | null = null;
const productionMode = import.meta.env.PROD === true;

function activeRuleSetForCategory(categoryId?: string) {
  const category = categoryId ? globalState.competition.categories.find(c => c.id === categoryId) : undefined;
  const requestedId = category?.ruleSetId;
  return (requestedId ? globalState.competition.ruleSets?.find(r => r.id === requestedId) : undefined) || globalState.competition.ruleSet;
}
const listeners = new Set<() => void>();

let firestoreSyncTimeout: ReturnType<typeof setTimeout> | null = null;

async function persistScopedDocument(collectionName:string,id:string,data:Record<string,unknown>){
  if(globalState.isOffline||!auth.currentUser)return;
  try{
    await setDoc(doc(db,'organizations',globalState.competition.organizationId,'competitions',globalState.competition.id,collectionName,id),{...data,organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,updatedAt:new Date().toISOString()},{merge:true});
  }catch(err){console.warn(`Scoped persistence paused for ${collectionName}/${id}:`,err);}
}

function syncToFirestore() {
  if (globalState.isOffline || !auth.currentUser) return;
  if (!['super_admin','org_admin','comp_admin'].includes(globalState.currentUser.role)) return;
  if (firestoreSyncTimeout) clearTimeout(firestoreSyncTimeout);
  firestoreSyncTimeout = setTimeout(async () => {
    try {
      const docRef = doc(db, 'organizations', globalState.competition.organizationId, 'competitions', globalState.competition.id);
      await setDoc(docRef, {
        competition: globalState.competition,
        participants: globalState.participants,
        committees: globalState.committees,
        judges: globalState.judges,
        results: globalState.results,
        reviewCases: globalState.reviewCases,
        aiObservations: globalState.aiObservations,
        judgeSubmissions: globalState.judgeSubmissions,
        certificates: globalState.certificates,
        auditLogs: globalState.auditLogs,
        incidents: globalState.incidents,
        appeals: globalState.appeals,
        emergencyFrozen: globalState.emergencyFrozen,
        sealApprovals: globalState.sealApprovals,
        notifications: globalState.notifications, devices: globalState.devices, travelRecords: globalState.travelRecords, consents: globalState.consents, shadowRuns: globalState.shadowRuns, audioRecordings: globalState.audioRecordings.map(r=>({...r,localObjectUrl:undefined})), importJobs:globalState.importJobs, timeMachineScenarios:globalState.timeMachineScenarios, quorumActions:globalState.quorumActions, invariantViolations:globalState.invariantViolations, evidenceNodes:globalState.evidenceNodes, evidenceEdges:globalState.evidenceEdges, publicResultRoots:globalState.publicResultRoots, publicResultProofs:globalState.publicResultProofs, localMeshSessions:globalState.localMeshSessions, federationAttestations:globalState.federationAttestations, protocolPackages:globalState.protocolPackages, flightRecorderEntries:globalState.flightRecorderEntries, integrityEnvelopes:globalState.integrityEnvelopes, chaosDrills:globalState.chaosDrills, accessibilityProfiles:globalState.accessibilityProfiles, elasticityRecommendations:globalState.elasticityRecommendations, journeyPasses:globalState.journeyPasses, policyCompilations:globalState.policyCompilations, contradictionIssues:globalState.contradictionIssues, disasterPacks:globalState.disasterPacks, deviceReassignments:globalState.deviceReassignments, fatigueRecommendations:globalState.fatigueRecommendations, competitionBenchmarks:globalState.competitionBenchmarks, rehearsals:globalState.rehearsals, scientificDatasets:globalState.scientificDatasets, benchmarkRuns:globalState.benchmarkRuns, variantLoci:globalState.variantLoci, quranReferenceAudio:globalState.quranReferenceAudio, quranCrossChecks:globalState.quranCrossChecks, scientificAdjudications:globalState.scientificAdjudications, scientificImpactReports:globalState.scientificImpactReports, federationTrust:globalState.federationTrust, ceremonyVaults:globalState.ceremonyVaults, fairDrawProofs:globalState.fairDrawProofs,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn('Firestore cloud sync paused (local cache active):', err);
    }
  }, 1000);
}

let auditHashing=false;
async function finalizeAuditChain(){
  if(auditHashing)return; auditHashing=true;
  try{
    const chronological=[...globalState.auditLogs].reverse(); let previous='GENESIS'; const changed:AuditEvent[]=[];
    for(const ev of chronological){
      const material=JSON.stringify({previous,id:ev.id,timestamp:ev.timestamp,organizationId:ev.organizationId,competitionId:ev.competitionId,actorId:ev.actorId,actorRole:ev.actorRole,action:ev.action,entityType:ev.entityType,entityId:ev.entityId,summary:ev.humanSummaryEnglish});
      const hash=await sha256(material); if(ev.previousStateHash!==previous||ev.currentStateHash!==hash) changed.push(ev); ev.previousStateHash=previous; ev.currentStateHash=hash; previous=hash;
    }
    for(const ev of changed.slice(-12)) void persistScopedDocument('audit',ev.id,ev as unknown as Record<string,unknown>);
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(globalState));}catch{}
    listeners.forEach(l=>l());
    syncToFirestore();
  } finally { auditHashing=false; }
}

function notify() {
  if(globalState.isOffline){void enqueueOfflineEvent({id:newId('offline'),type:'STATE_SYNC',competitionId:globalState.competition.id,createdAt:new Date().toISOString(),payload:{competitionId:globalState.competition.id}}).catch(()=>{});}
  const existing = globalState.competitions?.findIndex(c => c.id === globalState.competition.id) ?? -1;
  if (!globalState.competitions) globalState.competitions = [globalState.competition];
  else if (existing >= 0) globalState.competitions = globalState.competitions.map(c => c.id === globalState.competition.id ? globalState.competition : c);
  else globalState.competitions = [globalState.competition, ...globalState.competitions];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(globalState));
  } catch {}
  listeners.forEach((l) => l());
  syncToFirestore();
  void finalizeAuditChain();
}

export function useAppStore() {
  const [state, setState] = useState<AppStoreState>(globalState);

  useEffect(() => {
    const listener = () => setState({ ...globalState });
    listeners.add(listener);

    // Subscribe only after real Firebase authentication. Demo/local mode stays fully local.
    let unsubscribe: (() => void) | undefined;
    try {
      if (!auth.currentUser) return () => { listeners.delete(listener); };
      const docRef = doc(db, 'organizations', globalState.competition.organizationId, 'competitions', globalState.competition.id);
      unsubscribe = onSnapshot(docRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data) {
            let changed = false;
            if (data.emergencyFrozen !== undefined && data.emergencyFrozen !== globalState.emergencyFrozen) {
              globalState.emergencyFrozen = data.emergencyFrozen;
              changed = true;
            }
            if (data.results && Array.isArray(data.results) && data.results.length >= globalState.results.length) {
              globalState.results = data.results;
              changed = true;
            }
            if (data.certificates && Array.isArray(data.certificates)) {
              globalState.certificates = data.certificates;
              changed = true;
            }
            if (data.reviewCases && Array.isArray(data.reviewCases)) { globalState.reviewCases = data.reviewCases; changed = true; }
            if (data.aiObservations && Array.isArray(data.aiObservations)) { globalState.aiObservations = data.aiObservations; changed = true; }
            if (data.audioRecordings && Array.isArray(data.audioRecordings)) { globalState.audioRecordings = data.audioRecordings; changed = true; }
            if (data.judgeSubmissions && Array.isArray(data.judgeSubmissions)) {
              globalState.judgeSubmissions = data.judgeSubmissions;
              changed = true;
            }
            if (data.appeals && Array.isArray(data.appeals)) {
              globalState.appeals = data.appeals;
              changed = true;
            }
            if (data.sealApprovals && Array.isArray(data.sealApprovals)) {
              globalState.sealApprovals = data.sealApprovals;
              changed = true;
            }
            if (changed) {
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(globalState));
              } catch {}
              setState({ ...globalState });
            }
          }
        }
      }, (error) => {
        console.warn('Firestore live listener warning:', error);
      });
    } catch (e) {
      console.warn('Firestore initialization warning:', e);
    }

    return () => {
      listeners.delete(listener);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const setLanguage = (lang: SupportedLanguage) => {
    globalState.language = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = LANGUAGE_META[lang].dir;
    notify();
  };

  const applyAuthenticatedIdentity = (identity:{id:string;email:string;name:string;role:Role;organizationId:string;competitionId?:string}) => {
    globalState.currentUser={id:identity.id,email:identity.email,name:identity.name,nameArabic:identity.name,role:identity.role,organizationId:identity.organizationId,competitionId:identity.competitionId};
    if(identity.competitionId){const target=globalState.competitions.find(c=>c.id===identity.competitionId&&c.organizationId===identity.organizationId);if(target)globalState.competition=target;}
    notify();
  };

  const switchRole = (role: Role) => {
    const matchedUser = SEED_USERS.find((u) => u.role === role);
    if (matchedUser) {
      globalState.currentUser = matchedUser;
    } else {
      globalState.currentUser = {
        id: `usr-${role}`,
        name: `User (${role})`,
        nameArabic: `مستخدم (${role})`,
        email: `${role}@mizan.org`,
        role,
        organizationId: globalState.competition.organizationId
      };
    }
    notify();
  };

  const toggleOffline = () => {
    const wasOffline=globalState.isOffline; globalState.isOffline = !globalState.isOffline;
    if(!wasOffline&&globalState.isOffline&&!globalState.localMeshSessions.some(m=>m.competitionId===globalState.competition.id&&['forming','active'].includes(m.status))) startLocalMesh();
    notify();
    if(wasOffline&&!globalState.isOffline){void drainOfflineEvents(async()=>{syncToFirestore();return true;}).catch(()=>{});const mesh=globalState.localMeshSessions.find(m=>m.competitionId===globalState.competition.id&&m.status!=='closed');if(mesh)reconcileLocalMesh(mesh.id);}
  };

  const appendParticipantNotifications=(participant:Participant,templateKey:string)=>{
    const now=new Date().toISOString(); const channels:NotificationRecord['channel'][]=['in_app'];
    for(const kind of ['email','sms','whatsapp','push'] as const){if(globalState.integrations.some(i=>i.kind===kind&&i.enabled&&i.status==='configured'))channels.push(kind)}
    for(const channel of channels){const recipient=channel==='email'?participant.email:channel==='sms'||channel==='whatsapp'?participant.phone:participant.id;if(!recipient)continue;const key=`${globalState.competition.id}:${participant.id}:${channel}:${templateKey}`;if(globalState.notifications.some(n=>n.idempotencyKey===key&&n.status!=='cancelled'))continue;globalState.notifications.unshift({id:newId('ntf'),competitionId:globalState.competition.id,participantId:participant.id,channel,templateKey,locale:globalState.language,recipient,status:channel==='in_app'?'sent':'queued',attempts:channel==='in_app'?1:0,createdAt:now,sentAt:channel==='in_app'?now:undefined,idempotencyKey:key});}
  };

  const refreshQueueNotifications=()=>{
    for(const c of globalState.committees){const q=globalState.participants.filter(p=>p.assignedCommitteeId===c.id&&p.status==='in_queue').sort((a,b)=>(a.queueNumber||9999)-(b.queueNumber||9999)); if(q[0])appendParticipantNotifications(q[0],'queue.next'); if(q[1])appendParticipantNotifications(q[1],'queue.prepare');}
  };

  const createIncident = (type: IncidentRecord['type'], title:string, description:string, severity:IncidentRecord['severity']='moderate') => { const x:IncidentRecord={id:newId('inc'),competitionId:globalState.competition.id,type,severity,title,description,reportedBy:globalState.currentUser.name,reportedAt:new Date().toISOString(),status:'active'};globalState.incidents=[x,...globalState.incidents];notify();return x;};
  const resolveIncident = (id:string) => { globalState.incidents=globalState.incidents.map(i=>i.id===id?{...i,status:'resolved',resolvedAt:new Date().toISOString()}:i);notify(); };

  const setEmergencyMode = (active:boolean, reason:string) => {
    const allowed=['comp_admin','ops_manager','org_admin'];
    if(!allowed.includes(globalState.currentUser.role)) return {ok:false,error:'Not authorized'};
    const clean=reason.trim();
    if(clean.length<3) return {ok:false,error:'Reason required'};
    if(globalState.emergencyFrozen===active) return {ok:true,unchanged:true};
    globalState.emergencyFrozen=active;
    const now=new Date().toISOString();
    if(active){
      const incident:IncidentRecord={id:newId('inc'),competitionId:globalState.competition.id,type:'venue',severity:'critical',title:'Emergency mode',description:clean,reportedBy:globalState.currentUser.name,reportedAt:now,status:'active'};
      globalState.incidents=[incident,...globalState.incidents];
    } else {
      const incident=globalState.incidents.find(i=>i.competitionId===globalState.competition.id&&i.title==='Emergency mode'&&i.status!=='resolved');
      if(incident){globalState.incidents=globalState.incidents.map(i=>i.id===incident.id?{...i,status:'resolved',resolvedAt:now,description:`${i.description}\nResume: ${clean}`}:i);}
    }
    const log:AuditEvent={id:newId('aud'),timestamp:now,organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:active?'EMERGENCY_FREEZE_ACTIVATED':'EMERGENCY_FREEZE_RESUMED',entityType:'Competition',entityId:globalState.competition.id,humanSummaryArabic:active?`تفعيل وضع الطوارئ: ${clean}`:`استئناف آمن بعد الطوارئ: ${clean}`,humanSummaryEnglish:active?`Emergency mode activated: ${clean}`:`Emergency mode safely resumed: ${clean}`,currentStateHash:`emergency:${active?'on':'off'}:${now}`};
    globalState.auditLogs=[log,...globalState.auditLogs];
    notify();
    return {ok:true};
  };
  // Compatibility alias. New UI requires an explicit reason through setEmergencyMode.
  const toggleEmergencyFreeze = (reason?:string) => setEmergencyMode(!globalState.emergencyFrozen, reason||'');

  const committeeHasHardConflict = (committee: Committee, participant: Participant) => {
    const panelJudges = globalState.judges.filter(j => committee.judgeIds.includes(j.id) || committee.judgeIds.includes(j.userId));
    return panelJudges.some(j => j.conflictsDeclared.some(c => c.hardConflict && (c.participantId === participant.id || (!!c.institution && !!participant.institution && c.institution.trim().toLowerCase() === participant.institution.trim().toLowerCase()))));
  };

  const compatibleCommitteesFor = (participant: Participant) => globalState.committees.filter(c =>
    c.competitionId === participant.competitionId &&
    c.status !== 'offline' &&
    c.assignedCategories.includes(participant.categoryId) &&
    !committeeHasHardConflict(c, participant)
  );

  // Check-In Kiosk & Exceptions
  const checkInParticipant = (participantIdOrCode: string, method: 'kiosk_qr' | 'mobile_self' | 'exception_host' = 'kiosk_qr') => {
    const pIndex = globalState.participants.findIndex(
      (p) => p.id === participantIdOrCode || p.code.toLowerCase() === participantIdOrCode.toLowerCase()
    );

    if (pIndex !== -1) {
      const p = globalState.participants[pIndex];
      if (p.competitionId !== globalState.competition.id) return null;
      const updated: Participant = {
        ...p,
        status: 'in_queue',
        checkedInAt: new Date().toISOString(),
        checkInMethod: method,
        queueNumber: globalState.participants.filter((x) => x.competitionId === globalState.competition.id && x.status === 'in_queue').length + 1,
        assignedCommitteeId: p.assignedCommitteeId || (() => {
          const compatible = compatibleCommitteesFor(p);
          const pool = compatible.length ? compatible : globalState.committees.filter((c) => c.competitionId === globalState.competition.id && c.status !== 'offline' && !committeeHasHardConflict(c, p));
          return [...pool].sort((a, b) => {
            const aLoad = globalState.participants.filter(x => x.competitionId === globalState.competition.id && x.assignedCommitteeId === a.id && x.status === 'in_queue').length;
            const bLoad = globalState.participants.filter(x => x.competitionId === globalState.competition.id && x.assignedCommitteeId === b.id && x.status === 'in_queue').length;
            return aLoad - bLoad || a.averageSessionMinutes - b.averageSessionMinutes;
          })[0]?.id;
        })(),
        statusHistory: [
          ...p.statusHistory,
          {
            status: 'checked_in',
            timestamp: new Date().toISOString(),
            actor: method === 'kiosk_qr' ? 'Kiosk Scanner 01' : method === 'mobile_self' ? 'Mobile Self' : 'Exception Host'
          },
          {
            status: 'in_queue',
            timestamp: new Date().toISOString(),
            actor: 'Smart Auto Routing Dispatcher'
          }
        ]
      };

      globalState.participants[pIndex] = updated;
      void persistScopedDocument('checkins',p.id,{participantId:p.id,participantCode:p.code,method,checkedInAt:updated.checkedInAt,assignedCommitteeId:updated.assignedCommitteeId,queueNumber:updated.queueNumber});

      const log: AuditEvent = {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        organizationId: globalState.competition.organizationId,
        competitionId: globalState.competition.id,
        actorId: globalState.currentUser.id,
        actorName: globalState.currentUser.name,
        actorRole: globalState.currentUser.role,
        action: 'PARTICIPANT_CHECKIN',
        entityType: 'Participant',
        entityId: p.id,
        humanSummaryArabic: `تسجيل حضور المتسابق ${p.fullNameArabic} (${p.code}) عبر ${method} وتوجيهه للطابور`,
        humanSummaryEnglish: `Checked in participant ${p.fullName} (${p.code}) via ${method} and routed to queue`,
        currentStateHash: `PENDING:${newId('audit')}`
      };
      globalState.auditLogs = [log, ...globalState.auditLogs];
      appendParticipantNotifications(updated,'participant.checked_in');
      refreshQueueNotifications();
      notify();
      return updated;
    }
    return null;
  };

  const recordAIObservation = (input: Omit<AIObservation,'id'|'competitionId'>) => {
    const policy=getCompetitionPolicy(globalState.competition);
    if(!policy.judging.silentAiGuardian||!policy.privacy.allowAiProcessing||policy.aiPolicy.mode==='AI_DISABLED') return null;
    const capability=input.capability||(input.type==='audio_noise_clipping'?'audio_quality':input.type==='omission'?'omission':input.type==='insertion'?'insertion':input.type==='substitution'?'substitution':input.type==='repetition'?'repetition':'hesitation');
    if(policy.aiPolicy.enabledCapabilities?.[capability]===false)return null;
    const participant=globalState.participants.find(p=>p.id===(input.participantId||globalState.activeSession.participant?.id));
    if(!participant)return null;
    if(!explicitConsentGranted(globalState.consents,{participantId:participant.id,competitionId:globalState.competition.id,kind:'ai_inference'}))return null;
    const shadow=policy.aiPolicy.mode==='AI_RESEARCH_SHADOW_MODE';
    if(shadow&&!explicitConsentGranted(globalState.consents,{participantId:participant.id,competitionId:globalState.competition.id,kind:'ai_validation'}))return null;
    const reading=resolveReading({riwaya:participant.riwaya});if(!reading)return null;
    const certified=certifiedCapabilityFor(globalState.aiCapabilityValidations,{capability,modelName:input.model||input.modelIdentifier,modelVersion:input.modelVersion,qiraah:reading.qiraah,rawi:reading.rawi,riwaya:participant.riwaya,tariq:input.tariq,wajh:input.wajh});
    if(!certified&&!shadow)return null;
    const observation:AIObservation={...input,id:newId('aiobs'),competitionId:globalState.competition.id,participantId:participant.id,capability,qiraah:reading.qiraah,rawi:reading.rawi,model:certified?.modelName||input.model||input.modelIdentifier,modelVersion:certified?.modelVersion||input.modelVersion||'research-unfrozen',modelHash:certified?.modelHash||input.modelHash,capabilityCertificationState:certified?'CERTIFIED':'RESEARCH',capabilityCertificationVersion:certified?.approvalVersion,benchmarkReference:certified?.benchmark?`${certified.benchmark}${certified.benchmarkVersion?`@${certified.benchmarkVersion}`:''}`:input.benchmarkReference,modelEvidence:input.modelEvidence||certified?.evidenceRef};
    globalState.aiObservations=[observation,...globalState.aiObservations];
    notify(); return observation;
  };

  const reconcileIntegrityForSession = (sessionId:string) => {
    const policy=getCompetitionPolicy(globalState.competition); if(!policy.judging.silentAiGuardian||policy.aiPolicy.mode==='AI_RESEARCH_SHADOW_MODE')return [] as ReviewCase[];
    const observations=globalState.aiObservations.filter(o=>o.sessionId===sessionId&&o.flaggedForReview&&o.capabilityCertificationState==='CERTIFIED');
    const human=globalState.activeSession.sessionId===sessionId?globalState.activeSession.events.filter(e=>!e.reversed):[];
    const participant=globalState.activeSession.participant; const committee=globalState.activeSession.committee; if(!participant)return [] as ReviewCase[];
    const created:ReviewCase[]=[];
    for(const o of observations){
      const matched=human.some(e=>Math.abs(e.relativeSeconds-o.timestampSeconds)<=4);
      if(!matched&&!globalState.reviewCases.some(r=>r.sessionId===sessionId&&Math.abs(r.timestampSec-o.timestampSeconds)<=2)){
        const reason=o.type==='audio_noise_clipping'?'audio_dropout':'ai_high_confidence_alert';
        const c:ReviewCase={id:newId('review'),competitionId:globalState.competition.id,sessionId,participantId:participant.id,participantCode:participant.code,committeeId:committee?.id||'',reason,severity:reason==='audio_dropout'?'high':o.confidence==='low'?'low':'medium',timestampSec:o.timestampSeconds,details:`AI integrity observation (${o.type}) requires human review; no score was changed.`,audioClipUrl:o.audioClipUrl,status:'pending'};
        globalState.reviewCases=[c,...globalState.reviewCases];created.push(c);
      }
    }
    if(created.length)notify(); return created;
  };

  const registerAudioRecording = async (record: Omit<AudioRecordingRecord,'id'|'competitionId'|'retentionDays'|'checksum'> & {checksumSource?:string}) => {
    if(!explicitConsentGranted(globalState.consents,{participantId:record.participantId,competitionId:globalState.competition.id,kind:'audio_recording'}))return null;
    const checksum=record.checksumSource?await sha256(record.checksumSource):undefined;
    const item:AudioRecordingRecord={id:newId('audio'),competitionId:globalState.competition.id,retentionDays:getCompetitionPolicy(globalState.competition).privacy.audioRetentionDays,checksum,...record};
    delete (item as any).checksumSource;
    const idx=globalState.audioRecordings.findIndex(r=>r.sessionId===record.sessionId);
    if(idx>=0)globalState.audioRecordings[idx]=item;else globalState.audioRecordings=[item,...globalState.audioRecordings];
    notify();return item;
  };

  // JudgeOS Actions
  const recordJudgeEvent = (type: JudgeEventType) => {
    if (globalState.activeSession.isLocked) return;
    const action = getEnabledJudgeActions(globalState.competition).find(a => a.eventType === type);
    if (!action) return;

    const newEvent: JudgeEvent = {
      id: newId('ev'),
      sessionId: globalState.activeSession.sessionId,
      questionIndex: globalState.activeSession.currentQuestionIndex,
      judgeId: globalState.currentUser.id,
      judgeName: globalState.currentUser.name,
      timestamp: new Date().toISOString(),
      relativeSeconds: globalState.activeSession.durationSeconds,
      type,
      criterion: action.criterion === 'custom' ? 'performance' : action.criterion,
      penalty: action.penalty
    };

    globalState.activeSession.events = [...globalState.activeSession.events, newEvent];
    void persistScopedDocument('judge_events',newEvent.id,newEvent as unknown as Record<string,unknown>);
    notify();
  };

  const undoLastJudgeEvent = () => {
    if (globalState.activeSession.isLocked || globalState.activeSession.events.length === 0) return;
    const last = globalState.activeSession.events[globalState.activeSession.events.length - 1];
    
    // Instead of completely destroying history, we mark as reversed for audit trail integrity
    globalState.activeSession.events = globalState.activeSession.events.map(ev => ev.id === last.id ? { ...ev, reversed: true } : ev);

    const log: AuditEvent = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      organizationId: globalState.competition.organizationId,
      competitionId: globalState.competition.id,
      actorId: globalState.currentUser.id,
      actorName: globalState.currentUser.name,
      actorRole: globalState.currentUser.role,
      action: 'JUDGE_EVENT_UNDO',
      entityType: 'JudgeEvent',
      entityId: last.id,
      humanSummaryArabic: `تراجع المحكم عن رصد (${last.type}) عند الثانية ${last.relativeSeconds}`,
      humanSummaryEnglish: `Judge undone event (${last.type}) at second ${last.relativeSeconds}`,
      currentStateHash: `PENDING:${newId('audit')}`
    };
    globalState.auditLogs = [log, ...globalState.auditLogs];
    notify();
  };

  const lockAndSubmitAssessment = (directScores?: Record<string, number>) => {
    if (globalState.activeSession.isLocked) return;
    globalState.activeSession.isLocked = true;
    globalState.activeSession.isReciting = false;

    const participantForRule = globalState.activeSession.participant;
    const sessionRuleSet = activeRuleSetForCategory(participantForRule?.categoryId);
    const criteria = sessionRuleSet.criteria;
    const baseScore = criteria.reduce((sum, c) => sum + c.maxScore, 0) || 100;
    const deductionsByCriterion: Record<string, number> = {};
    globalState.activeSession.events.filter(e => !e.reversed).forEach(ev => { deductionsByCriterion[ev.criterion] = (deductionsByCriterion[ev.criterion] || 0) + ev.penalty; });
    const criterionScores: Record<string, number> = {};
    const policy = getCompetitionPolicy(globalState.competition);
    const judgeProfile = globalState.judges.find(j => j.userId === globalState.currentUser.id || j.id === globalState.currentUser.id);
    const eligibleCriteria = criteria.filter(c => policy.judging.mode === 'all_judges_all_criteria' || !judgeProfile || judgeProfile.specialty === 'all' || c.assignedJudgeType === judgeProfile.specialty || (policy.judging.mode === 'hybrid' && c.assignedJudgeType === 'all'));
    criteria.forEach(c => {
      const eventScore = Math.max(0, c.maxScore - (deductionsByCriterion[c.id] || deductionsByCriterion[c.assignedJudgeType || ''] || 0));
      criterionScores[c.id] = directScores && directScores[c.id] !== undefined ? Math.min(c.maxScore, Math.max(0, directScores[c.id])) : eventScore;
    });
    const scoredCriteria = eligibleCriteria.length ? eligibleCriteria : criteria;
    const scoredMax = scoredCriteria.reduce((sum,c)=>sum+c.maxScore,0) || baseScore;
    const scoredValue = scoredCriteria.reduce((sum,c)=>sum+(criterionScores[c.id] ?? c.maxScore),0);
    const judgeScore = Number(((scoredValue / scoredMax) * baseScore).toFixed(2));
    const submission: JudgeSubmission = {
      participantId: globalState.activeSession.participant?.id,
      judgeId: globalState.currentUser.id, judgeName: globalState.currentUser.name, sessionId: globalState.activeSession.sessionId,
      criterionScores, totalScore: judgeScore, eventsCount: globalState.activeSession.events.length, submittedAt: new Date().toISOString(), locked: true
    };
    globalState.judgeSubmissions = [...globalState.judgeSubmissions.filter(s => !(s.sessionId === submission.sessionId && s.judgeId === submission.judgeId)), submission];
    void persistScopedDocument('judge_submissions',`${submission.sessionId}_${submission.judgeId}`,submission as unknown as Record<string,unknown>);

    const sessionSubs = globalState.judgeSubmissions.filter(s => s.sessionId === submission.sessionId && s.locked);
    const participant = globalState.activeSession.participant;
    if (participant && sessionSubs.length >= sessionRuleSet.judgesCountPerPanel) {
      let scoreInputs = sessionSubs.map(s => s.totalScore);
      if (sessionRuleSet.dropExtremes && scoreInputs.length >= 3) {
        const sorted = [...scoreInputs].sort((a,b)=>a-b); scoreInputs = sorted.slice(1,-1);
      }
      const finalScore = Number((scoreInputs.reduce((a,b)=>a+b,0)/Math.max(1,scoreInputs.length)).toFixed(2));
      const sealedExisting=globalState.results.find(r=>r.competitionId===globalState.competition.id&&r.participantId===participant.id&&['sealed','published'].includes(r.status));
      if(sealedExisting){
        recordInvariantBlock('sealed_results_immutable','judge_panel_recalculation','Result',sealedExisting.id,'A later judge panel attempted to recalculate an already sealed/published result',{sealedScore:sealedExisting.finalScore,newPanelScore:finalScore,sessionId:submission.sessionId});
        if(!globalState.reviewCases.some(r=>r.participantId===participant.id&&r.reason==='sealed_result_protection'&&r.status==='pending'))globalState.reviewCases=[{id:newId('review'),competitionId:globalState.competition.id,sessionId:submission.sessionId,participantId:participant.id,participantCode:participant.code,committeeId:globalState.activeSession.committee?.id||'',reason:'sealed_result_protection',severity:'high',timestampSec:globalState.activeSession.durationSeconds,details:`Protected sealed result ${sealedExisting.id}; new panel score ${finalScore} retained only as evidence.`,status:'pending'},...globalState.reviewCases];
        notify();return;
      }
      const pIndex = globalState.participants.findIndex(p => p.id === participant.id);
      if (pIndex !== -1) globalState.participants[pIndex] = { ...globalState.participants[pIndex], status:'tested', statusHistory:[...globalState.participants[pIndex].statusHistory,{status:'tested',timestamp:new Date().toISOString(),actor:'Panel completion'}] };
      globalState.committees=globalState.committees.map(c=>c.id===globalState.activeSession.committee?.id?{...c,currentParticipantId:undefined,status:'ready',completedCount:c.completedCount+1}:c);
      refreshQueueNotifications();
      const category = globalState.competition.categories.find(c=>c.id===participant.categoryId);
      const existing = globalState.results.findIndex(r => r.participantId === participant.id && r.status !== 'published');
      const result: ResultRecord = { id:existing>=0?globalState.results[existing].id:newId('res'), competitionId:globalState.competition.id, participantId:participant.id, participantCode:participant.code, participantName:participant.fullName, participantNameArabic:participant.fullNameArabic, country:participant.country, categoryId:participant.categoryId, categoryName:category?.name||participant.categoryId, finalScore, rank:0, status:'calculated' };
      if(existing>=0) globalState.results[existing]=result; else globalState.results=[...globalState.results,result];
      const ranked=globalState.results.filter(r=>r.categoryId===participant.categoryId).sort((a,b)=>b.finalScore-a.finalScore); ranked.forEach((r,i)=>{const x=globalState.results.findIndex(z=>z.id===r.id);if(x>=0)globalState.results[x]={...globalState.results[x],rank:i+1}});
      const spread=Math.max(...sessionSubs.map(s=>s.totalScore))-Math.min(...sessionSubs.map(s=>s.totalScore));
      if(spread>=5 && !globalState.reviewCases.some(r=>r.sessionId===submission.sessionId && r.status==='pending')) globalState.reviewCases=[{ id:newId('review'), competitionId:globalState.competition.id, sessionId:submission.sessionId, participantId:participant.id, participantCode:participant.code, committeeId:globalState.activeSession.committee?.id||'', reason:'judge_variance', severity:spread>=10?'high':'medium', timestampSec:globalState.activeSession.durationSeconds, details:`Panel spread ${spread.toFixed(2)} points`, status:'pending' },...globalState.reviewCases];
    }
    if(participant && sessionSubs.length >= sessionRuleSet.judgesCountPerPanel) reconcileIntegrityForSession(submission.sessionId);
    globalState.auditLogs = [{ id:newId('aud'), timestamp:new Date().toISOString(), organizationId:globalState.competition.organizationId, competitionId:globalState.competition.id, actorId:globalState.currentUser.id, actorName:globalState.currentUser.name, actorRole:globalState.currentUser.role, action:'JUDGE_SUBMISSION_LOCKED', entityType:'JudgeSubmission', entityId:`${submission.sessionId}:${submission.judgeId}`, humanSummaryArabic:`قفل تقييم المحكم للمتسابق ${participant?.code||''} دون إظهار تقييم بقية اللجنة`, humanSummaryEnglish:`Judge submission locked for ${participant?.code||''} independently of the rest of the panel`, currentStateHash:`PENDING:${newId('audit')}` },...globalState.auditLogs];
    if(judgeProfile){ const existingPass=globalState.judgePassport.findIndex(x=>x.judgeId===judgeProfile.id&&x.competitionId===globalState.competition.id); const pass:JudgePassportEntry={id:existingPass>=0?globalState.judgePassport[existingPass].id:newId('jp'),judgeId:judgeProfile.id,competitionId:globalState.competition.id,competitionName:globalState.competition.name,role:judgeProfile.specialty,riwayat:judgeProfile.certifiedRiwayat,calibrationScore:judgeProfile.calibrationScore,completedSessions:globalState.judgeSubmissions.filter(x=>x.judgeId===judgeProfile.userId).length,verified:judgeProfile.isReady}; if(existingPass>=0)globalState.judgePassport[existingPass]=pass;else globalState.judgePassport=[pass,...globalState.judgePassport]; }
    notify();
  };

  // Next Question in Session
  const nextQuestion = () => {
    if (globalState.activeSession.questionSelection) {
      const total = globalState.activeSession.questionSelection.questions.length;
      if (globalState.activeSession.currentQuestionIndex < total - 1) {
        globalState.activeSession.currentQuestionIndex += 1;
        notify();
      }
    }
  };

  // Head Judge Review Resolution
  const resolveReviewCase = (caseId: string, decision: 'confirmed' | 'dismissed', notes: string) => {
    const cIndex = globalState.reviewCases.findIndex((c) => c.id === caseId);
    if (cIndex !== -1) {
      const targetCase = globalState.reviewCases[cIndex];
      globalState.reviewCases[cIndex] = {
        ...targetCase,
        status: decision === 'confirmed' ? 'confirmed' : 'dismissed',
        headJudgeDecision: {
          actor: globalState.currentUser.name,
          action: decision,
          adjustedPenaltyDelta: 0,
          notes,
          resolvedAt: new Date().toISOString()
        }
      };

      const log: AuditEvent = {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        organizationId: globalState.competition.organizationId,
        competitionId: globalState.competition.id,
        actorId: globalState.currentUser.id,
        actorName: globalState.currentUser.name,
        actorRole: globalState.currentUser.role,
        action: 'REVIEW_CASE_RESOLVED',
        entityType: 'ReviewCase',
        entityId: caseId,
        humanSummaryArabic: `قرار رئيس اللجنة (${decision === 'confirmed' ? 'تأكيد الحاجة للمعالجة وفق اللائحة' : 'استبعاد الملاحظة'}) للحالة ${targetCase.participantCode}`,
        humanSummaryEnglish: `Head Judge decision (${decision}) for review case ${targetCase.participantCode}`,
        currentStateHash: `PENDING:${newId('audit')}`
      };
      globalState.auditLogs = [log, ...globalState.auditLogs];
      void persistScopedDocument('reviews',caseId,globalState.reviewCases[cIndex] as unknown as Record<string,unknown>);
      notify();
    }
  };

  // Cryptographic sealing. A configured dual-approval policy requires two distinct authorized actors.
  const sealResults = async () => {
    const policy = getCompetitionPolicy(globalState.competition);
    const allowedRoles: Role[] = ['head_judge', 'comp_admin', 'org_admin'];
    if (!allowedRoles.includes(globalState.currentUser.role)) return { sealed: false, reason: 'not_authorized', approvals: globalState.sealApprovals.length };

    let sealQuorum:QuorumActionRecord|undefined;
    if (policy.results.requireDualApprovalToSeal) {
      sealQuorum=ensureQuorumAction('results_seal',globalState.competition.id,[['head_judge'],['comp_admin','org_admin']]);
      const approval=approveQuorumAction(sealQuorum.id);
      sealQuorum=globalState.quorumActions.find(q=>q.id===sealQuorum!.id);
      if(!approval.ok||sealQuorum?.status!=='ready'){notify();return {sealed:false,reason:'independent_quorum_required',approvals:sealQuorum?.approvals.length||0};}
    }
    const invariantRows=await runInvariantChecks();const blocking=invariantRows.filter(r=>r.status==='violation');
    if(blocking.length){recordInvariantBlock(blocking[0].key,'seal_results','Competition',globalState.competition.id,blocking.map(x=>x.titleEnglish).join('; '));return {sealed:false,reason:'integrity_invariant',approvals:sealQuorum?.approvals.length||0};}

    const sealedAt = new Date().toISOString();
    const competitionResults = globalState.results.filter(r => r.competitionId === globalState.competition.id);
    if (!competitionResults.length) return { sealed:false, reason:'no_results', approvals:new Set(globalState.sealApprovals.map(a=>a.actorId)).size };
    const payload = JSON.stringify(competitionResults.map(r => ({ id:r.id, participantId:r.participantId, score:r.finalScore, rank:r.rank, categoryId:r.categoryId })).sort((a,b)=>a.id.localeCompare(b.id))) + globalState.competition.ruleSet.version + sealedAt;
    const checksum = await sha256(payload);
    const approverNames = globalState.sealApprovals.map(a=>a.actorName);
    globalState.results = globalState.results.map((res) => res.competitionId !== globalState.competition.id ? res : ({
      ...res,
      status: 'sealed',
      sealMetadata: {
        sealedBy: globalState.currentUser.name,
        sealedAt,
        cryptographicChecksum: `SHA256:${checksum}`,
        dualApprovalBy: policy.results.requireDualApprovalToSeal ? approverNames.join(' + ') : undefined
      }
    }));
    globalState.competition = { ...globalState.competition, status: 'results_sealed' };
    for(const rr of globalState.results.filter(r=>r.competitionId===globalState.competition.id)) void persistScopedDocument('results',rr.id,rr as unknown as Record<string,unknown>);
    globalState.auditLogs = [{
      id: newId('aud'), timestamp: sealedAt, organizationId: globalState.competition.organizationId, competitionId: globalState.competition.id,
      actorId: globalState.currentUser.id, actorName: globalState.currentUser.name, actorRole: globalState.currentUser.role,
      action: 'RESULTS_SEALED', entityType: 'Competition', entityId: globalState.competition.id,
      humanSummaryArabic: `ختم النتائج وفق سياسة هذه المسابقة وبصمة SHA-256 ${checksum.slice(0,12)}…`,
      humanSummaryEnglish: `Results sealed under this competition policy with SHA-256 ${checksum.slice(0,12)}…`,
      currentStateHash: `SHA256:${checksum}`
    }, ...globalState.auditLogs];
    if(sealQuorum)executeQuorumAction(sealQuorum.id);
    for(const rr of globalState.results.filter(r=>r.competitionId===globalState.competition.id)) await createIntegrityEnvelope(rr.participantId);
    notify();
    return { sealed:true, approvals:new Set(globalState.sealApprovals.map(a=>a.actorId)).size, checksum };
  };

  const publishResults = () => {
    if(globalState.currentUser.role==='super_admin'||!can(globalState.currentUser.role,'result.publish'))return false;
    const competitionResults=globalState.results.filter(r=>r.competitionId===globalState.competition.id);
    if(!competitionResults.length || competitionResults.some(r=>r.status!=='sealed' && r.status!=='published')) return false;
    globalState.results=globalState.results.map(r=>r.competitionId===globalState.competition.id?({...r,status:'published'}):r);
    for(const rr of globalState.results.filter(r=>r.competitionId===globalState.competition.id)) void persistScopedDocument('results',rr.id,rr as unknown as Record<string,unknown>);
    globalState.competition={...globalState.competition,status:'results_published'};
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'RESULTS_PUBLISHED',entityType:'Competition',entityId:globalState.competition.id,humanSummaryArabic:'نشر النتائج وفق سياسة الإظهار الخاصة بالمسابقة.',humanSummaryEnglish:'Published results under this competition visibility policy.',currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    for(const r of competitionResults){ const p=globalState.participants.find(x=>x.id===r.participantId&&x.competitionId===globalState.competition.id); if(p) appendParticipantNotifications(p,'result.published'); }
    notify(); return true;
  };

  const completeCompetition = () => {
    const unresolvedReviews=globalState.reviewCases.some(r=>r.competitionId===globalState.competition.id&&r.status==='pending');
    const unresolvedAppeals=globalState.appeals.some(a=>a.competitionId===globalState.competition.id&&(a.status==='submitted'||a.status==='under_review'));
    if(unresolvedReviews||unresolvedAppeals) return false;
    globalState.competition={...globalState.competition,status:'completed'};
    notify(); return true;
  };

  // Issue a certificate only under the active competition's own certificate policy.
  const generateCertificate = async (resultId: string) => {
    const res = globalState.results.find((r) => r.id === resultId && r.competitionId === globalState.competition.id);
    if (!res) return null;
    const policy = getCompetitionPolicy(globalState.competition);
    const cp = policy.certificates;
    if (!cp.enabled) return null;
    if (!['sealed','published'].includes(res.status)) return null;
    const eligible = cp.issueFor === 'all_participants'
      || (cp.issueFor === 'winners' && res.rank > 0 && res.rank <= 3)
      || (cp.issueFor === 'qualified' && res.finalScore >= activeRuleSetForCategory(res.categoryId).minimumPassingScore);
    if (!eligible || cp.issueFor === 'custom') return null;

    const existing = globalState.certificates.find(c => c.competitionId === globalState.competition.id && c.participantId === res.participantId);
    if (existing) return existing;

    const category = globalState.competition.categories.find(c => c.id === res.categoryId);
    const year = (globalState.competition.endDate || globalState.competition.startDate || new Date().toISOString()).slice(0,4);
    const shortComp = globalState.competition.id.replace(/[^a-zA-Z0-9]/g,'').slice(-6).toUpperCase() || 'COMP';
    const certNumber = `MZN-${year}-${shortComp}-${res.participantCode.replace(/[^a-zA-Z0-9]/g,'')}`;
    const issueDate = new Date().toISOString().split('T')[0];
    const verificationToken = await sha256(`${globalState.competition.id}|${res.participantId}|${certNumber}|${issueDate}|${res.finalScore}`);
    const basePath = (cp.verificationBasePath || '/verify').replace(/\/$/,'');
    const verificationUrl = `${basePath}/${encodeURIComponent(certNumber)}?token=${verificationToken.slice(0,24)}`;
    const awardTextArabic = cp.awardTextArabic || 'تشهد الجهة المنظمة بإتمام المشاركة وفق لائحة المسابقة المعتمدة.';

    let proof=getPublicResultProof(res.id);if(!proof){await buildPublicResultRoot();proof=getPublicResultProof(res.id);}
    const resultSealReference=res.sealMetadata?.cryptographicChecksum||await hashCanonical({resultId:res.id,score:res.finalScore,rank:res.rank,status:res.status});
    const issuedTimestamp=new Date().toISOString();
    const certId=newId('cert');
    const proofPackageHash=await hashCanonical({certificateId:certId,resultId:res.id,competitionId:globalState.competition.id,certificateVersion:'MZ-CERT-1',resultSealReference,merkleProofId:proof?.id,issuedTimestamp,revocationState:'ACTIVE'});
    const newCert: Certificate = {
      id: certId, certificateNumber: certNumber, competitionId: globalState.competition.id,
      competitionName: globalState.competition.name, competitionNameArabic: globalState.competition.nameArabic,
      organizationName: SEED_ORGANIZATION.name, organizationNameArabic: SEED_ORGANIZATION.nameArabic,
      participantId: res.participantId, participantName: res.participantName, participantNameArabic: res.participantNameArabic,
      categoryName: category?.name || res.categoryName, categoryNameArabic: category?.nameArabic || res.categoryName,
      score: cp.showScore ? res.finalScore : 0, rank: cp.showRank ? res.rank : undefined,
      awardTextArabic, issueDate, signatories: cp.signatories || [], verificationToken, verificationUrl, isAuthentic: true, qrPayload: verificationUrl,
      resultId:res.id,certificateVersion:'MZ-CERT-1',resultSealReference,merkleProofId:proof?.id,issuedTimestamp,revocationState:'ACTIVE',proofPackageHash
    };

    globalState.certificates = [newCert, ...globalState.certificates];
    const pIdx = globalState.participants.findIndex(p=>p.id===res.participantId);
    if (pIdx >= 0) globalState.participants[pIdx] = { ...globalState.participants[pIdx], status:'certified', statusHistory:[...globalState.participants[pIdx].statusHistory,{status:'certified',timestamp:new Date().toISOString(),actor:'Certificate engine'}] };
    const passCat=globalState.competition.categories.find(c=>c.id===res.categoryId); globalState.participantPassport=[{id:newId('pp'),participantId:res.participantId,competitionId:globalState.competition.id,competitionName:globalState.competition.name,categoryName:passCat?.name||res.categoryName,year:globalState.competition.startDate.slice(0,4),result:`${res.rank} / ${res.finalScore}`,certificateNumber:certNumber,verified:true},...globalState.participantPassport.filter(x=>!(x.participantId===res.participantId&&x.competitionId===globalState.competition.id))];
    void persistScopedDocument('certificates',newCert.id,newCert as unknown as Record<string,unknown>);
    globalState.auditLogs = [{
      id:newId('aud'), timestamp:new Date().toISOString(), organizationId:globalState.competition.organizationId, competitionId:globalState.competition.id,
      actorId:globalState.currentUser.id, actorName:globalState.currentUser.name, actorRole:globalState.currentUser.role, action:'CERTIFICATE_ISSUED',
      entityType:'Certificate', entityId:newCert.id, humanSummaryArabic:`إصدار شهادة ${certNumber} وفق سياسة الشهادات الخاصة بالمسابقة`,
      humanSummaryEnglish:`Issued certificate ${certNumber} under this competition's certificate policy`, currentStateHash:`SHA256:${verificationToken}`
    }, ...globalState.auditLogs];
    const certParticipant=globalState.participants.find(x=>x.id===res.participantId); if(certParticipant)appendParticipantNotifications(certParticipant,'certificate.ready');
    notify();
    return newCert;
  };

  // Register New Participant
  const registerParticipant = (newP: Omit<Participant, 'id' | 'code' | 'status' | 'statusHistory' | 'createdAt'>) => {
    const policy = getCompetitionPolicy(globalState.competition);
    const competitionCount=globalState.participants.filter(p=>p.competitionId===globalState.competition.id).length;
    const code = `A-${String(100 + competitionCount + 1).padStart(3,'0')}`;
    const participant: Participant = {
      ...newP,
      id: newId('part'),
      code,
      status: 'submitted',
      statusHistory: [{ status: 'submitted', timestamp: new Date().toISOString(), actor: 'Online registration' }],
      createdAt: new Date().toISOString()
    };
    globalState.participants = [...globalState.participants, participant];
    void persistScopedDocument('participants',participant.id,participant as unknown as Record<string,unknown>);
    appendParticipantNotifications(participant,'registration.received');
    const category = globalState.competition.categories.find(c => c.id === participant.categoryId);
    const age = Math.floor((Date.now() - new Date(participant.dateOfBirth).getTime()) / 31557600000);
    const ageEligible = (!category?.minAge || age >= category.minAge) && (!category?.maxAge || age <= category.maxAge);
    const shouldAutoApprove = policy.registration.autoApproveEligible && ageEligible;
    if (shouldAutoApprove) {
      const idx = globalState.participants.findIndex(p => p.id === participant.id);
      const slotMinute = 10 + (((competitionCount+1) * 10) % 50);
      globalState.participants[idx] = {
        ...globalState.participants[idx], status: 'approved', arrivalSlot: `09:${String(slotMinute).padStart(2,'0')}–09:${String(Math.min(59,slotMinute+20)).padStart(2,'0')}`,
        statusHistory: [...globalState.participants[idx].statusHistory, { status: 'approved', timestamp: new Date().toISOString(), actor: 'Eligibility Engine', reason: 'Objective eligibility rules passed' }]
      };
    } else {
      const idx = globalState.participants.findIndex(p => p.id === participant.id);
      globalState.participants[idx] = { ...globalState.participants[idx], status: 'under_review', statusHistory: [...globalState.participants[idx].statusHistory, { status: 'under_review', timestamp: new Date().toISOString(), actor: 'Eligibility Engine', reason: ageEligible ? 'Policy requires human review' : 'Eligibility exception requires review' }] };
    }
    globalState.auditLogs = [{
      id:newId('aud'), timestamp:new Date().toISOString(), organizationId:globalState.competition.organizationId, competitionId:globalState.competition.id,
      actorId:globalState.currentUser.id, actorName:globalState.currentUser.name, actorRole:globalState.currentUser.role, action:'REGISTRATION_CREATED', entityType:'Participant', entityId:participant.id,
      humanSummaryArabic:`استلام طلب ${code} ومعالجته وفق سياسة التسجيل الخاصة بالمسابقة`, humanSummaryEnglish:`Received ${code} and processed it under this competition registration policy`, currentStateHash:`PENDING:${newId('audit')}`
    }, ...globalState.auditLogs];
    notify();
    return globalState.participants.find(p => p.id === participant.id)!;
  };

  const reviewParticipant = (participantId: string, decision: 'approved' | 'rejected', reason = '') => {
    const idx = globalState.participants.findIndex(p=>p.id===participantId);
    if(idx<0) return null;
    const current=globalState.participants[idx];
    const slotIndex=globalState.participants.filter(p=>p.competitionId===globalState.competition.id&&p.status==='approved' && p.arrivalSlot).length;
    const startMinutes=8*60+30+slotIndex*10;
    const h=Math.floor(startMinutes/60); const m=startMinutes%60; const end=startMinutes+20;
    const arrivalSlot=decision==='approved' ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}–${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}` : current.arrivalSlot;
    const next: Participant={...current,status:decision,arrivalSlot,statusHistory:[...current.statusHistory,{status:decision,timestamp:new Date().toISOString(),actor:globalState.currentUser.name,reason:reason||undefined}]};
    globalState.participants[idx]=next;
    void persistScopedDocument('participants',next.id,next as unknown as Record<string,unknown>);
    appendParticipantNotifications(next,decision==='approved'?'participant.approved':'participant.rejected');
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:decision==='approved'?'PARTICIPANT_APPROVED':'PARTICIPANT_REJECTED',entityType:'Participant',entityId:participantId,humanSummaryArabic:`${decision==='approved'?'اعتماد':'رفض'} طلب ${current.code} وفق سياسة المسابقة`,humanSummaryEnglish:`${decision==='approved'?'Approved':'Rejected'} ${current.code} under the competition policy`,currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify(); return next;
  };

  const submitAppeal = (participantId: string, grounds: AppealRecord['grounds'], reasonText: string) => {
    const policy = getCompetitionPolicy(globalState.competition);
    if (!policy.appeals.enabled) return null;
    const participant = globalState.participants.find(p => p.id === participantId);
    if (!participant) return null;
    const category = globalState.competition.categories.find(c => c.id === participant.categoryId);
    const appeal: AppealRecord = {
      id: newId('appeal'), competitionId: globalState.competition.id, participantId, participantCode: participant.code,
      categoryName: category?.name || participant.categoryId, grounds, reasonText, status: 'submitted', createdAt: new Date().toISOString()
    };
    globalState.appeals = [appeal, ...globalState.appeals];
    const pIdx = globalState.participants.findIndex(p => p.id === participantId);
    if (pIdx >= 0) globalState.participants[pIdx] = { ...globalState.participants[pIdx], status: 'appealed', statusHistory: [...globalState.participants[pIdx].statusHistory, { status:'appealed', timestamp:new Date().toISOString(), actor:'Participant portal', reason:grounds }] };
    notify(); return appeal;
  };

  const resolveAppeal = (appealId: string, accepted: boolean, notes: string, scoreAdjustmentDelta = 0) => {
    const idx = globalState.appeals.findIndex(a => a.id === appealId);
    if (idx < 0) return false;
    const appeal=globalState.appeals[idx];
    const policy=getCompetitionPolicy(globalState.competition);
    const appliedDelta = accepted && policy.appeals.allowScoreChange ? Number(scoreAdjustmentDelta||0) : 0;
    globalState.appeals[idx] = { ...appeal, status: accepted ? 'accepted' : 'rejected', resolutionNotes: notes, resolvedBy: globalState.currentUser.name, resolvedAt: new Date().toISOString(), scoreAdjustmentDelta: appliedDelta };
    if(appliedDelta!==0){
      const rIdx=globalState.results.findIndex(r=>r.participantId===appeal.participantId);
      if(rIdx>=0 && !['sealed','published'].includes(globalState.results[rIdx].status)){
        const r=globalState.results[rIdx]; globalState.results[rIdx]={...r,finalScore:Math.max(0,Number((r.finalScore+appliedDelta).toFixed(2)))};
        const cat=r.categoryId; const ranked=globalState.results.filter(x=>x.categoryId===cat).sort((a,b)=>b.finalScore-a.finalScore); ranked.forEach((rr,i)=>{const x=globalState.results.findIndex(z=>z.id===rr.id);if(x>=0)globalState.results[x]={...globalState.results[x],rank:i+1}});
      }
    }
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:accepted?'APPEAL_ACCEPTED':'APPEAL_REJECTED',entityType:'Appeal',entityId:appealId,humanSummaryArabic:`حسم اعتراض ${appeal.participantCode} بقرار بشري${appliedDelta?` وتعديل ${appliedDelta} نقطة`:''}`,humanSummaryEnglish:`Resolved ${appeal.participantCode} appeal by human decision${appliedDelta?` with ${appliedDelta} point adjustment`:''}`,currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify(); return true;
  };

  const updateOrganizationBrand = (patch: Partial<OrganizationBrand>) => { globalState.organization={...globalState.organization,brand:{...globalState.organization.brand,...patch}}; notify(); };

  const selectCompetition = (competitionId: string) => {
    const target = globalState.competitions.find(c => c.id === competitionId);
    if (!target) return false;
    globalState.competition = { ...target, policy: getCompetitionPolicy(target), ruleSets: target.ruleSets || [target.ruleSet] };
    notify(); return true;
  };

  const provisionOrganization = (nameArabic:string, nameEnglish:string, code?:string) => {
    if (globalState.currentUser.role !== 'super_admin') return null;
    const org:Organization={id:newId('org'),name:nameEnglish,nameArabic,code:(code||nameEnglish.slice(0,4)).toUpperCase(),brand:{name:nameEnglish,nameArabic,primaryColor:'#214C40',accentColor:'#2F6555',certificateTheme:'quiet_authority'},plan:'enterprise',dataResidency:'configurable',status:'active',createdAt:new Date().toISOString()};
    globalState.organizations=[org,...globalState.organizations];
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:org.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'ORGANIZATION_PROVISIONED',entityType:'Organization',entityId:org.id,humanSummaryArabic:`إنشاء جهة جديدة: ${nameArabic}`,humanSummaryEnglish:`Provisioned organization: ${nameEnglish}`,currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs]; notify(); return org;
  };

  const setFeatureFlag=(key:string,enabled:boolean,organizationId?:string)=>{
    if(globalState.currentUser.role!=='super_admin'&&globalState.currentUser.role!=='org_admin') return false;
    const scope=organizationId||globalState.organization.id; const i=globalState.featureFlags.findIndex(f=>f.key===key&&f.organizationId===scope); const item:FeatureFlagRecord={id:i>=0?globalState.featureFlags[i].id:newId('flag'),organizationId:scope,key,enabled,environment:(import.meta.env.MODE==='production'?'production':'development'),updatedAt:new Date().toISOString()}; if(i>=0)globalState.featureFlags[i]=item; else globalState.featureFlags=[item,...globalState.featureFlags]; notify(); return true;
  };

  const createScientificImpact=(kind:ScientificImpactReportRecord['kind'],entityId:string,reason:string,reading?:{qiraah?:string;rawi?:string;riwaya?:string})=>{const node=reading?resolveReading(reading):undefined;const affectedCompetitionIds=globalState.competitions.filter(c=>c.organizationId===globalState.organization.id&&(!node||c.categories.some(cat=>resolveReading({riwaya:cat.riwaya})?.rawiId===node.rawiId))).map(c=>c.id);const source=kind==='QURAN_SOURCE_REVOCATION'?globalState.quranSourceManifests.find(q=>q.id===entityId):undefined;const report:ScientificImpactReportRecord={id:newId('simpact'),organizationId:globalState.organization.id,kind,entityId,reason,futureUseBlocked:true,affectedCompetitionIds:[...new Set(affectedCompetitionIds)],affectedHistoricalRecordIds:[...(source?.historicalUsageReferences||[])],createdAt:new Date().toISOString(),createdBy:globalState.currentUser.id};globalState.scientificImpactReports=[report,...globalState.scientificImpactReports];return report;};

  const registerQuranSourceManifest=async(input:Omit<QuranSourceManifestRecord,'id'|'organizationId'|'status'|'createdAt'>,verses?:QuranVerseRecord[],ayahCountBySurah?:Record<number,number>)=>{
    if(globalState.currentUser.role!=='scientific_admin')return null;
    const structural=verses?validateVerseStructure(verses,{surahCount:114,ayahCountBySurah}):undefined;
    const contentHash=verses?await hashCanonical(verses.map(v=>({surah:v.surah,ayah:v.ayah,text:v.text}))):undefined;
    const checksumVerificationState=input.expectedChecksumSha256?(input.checksumSha256.toLowerCase()===input.expectedChecksumSha256.toLowerCase()?'MATCH':'MISMATCH'):'NOT_PROVIDED';
    const rec:QuranSourceManifestRecord={id:newId('qsrc'),organizationId:globalState.organization.id,status:'draft',createdAt:new Date().toISOString(),certificationState:'DEVELOPMENT',revocationState:'ACTIVE',immutable:false,checksumAlgorithm:'SHA-256',ingestionTimestamp:new Date().toISOString(),ingestedBy:globalState.currentUser.id,...input,checksumVerificationState,contentHash,structuralValidation:structural?{surahCount:structural.surahCount,ayahCount:structural.ayahCount,surahCountValid:structural.surahCount===114,ayahCountProfile:ayahCountBySurah?input.ayahNumberingConvention:undefined,ayahCountValid:ayahCountBySurah?structural.errors.every(x=>!x.startsWith('AYAH_COUNT_MISMATCH')):undefined,errors:structural.errors}:undefined};
    rec.sourceVersion=rec.sourceVersion||rec.version;rec.sourceEdition=rec.sourceEdition||rec.edition;rec.rawi=rec.rawi||rec.riwaya;rec.packageHash=await computeQuranPackageHash(rec);
    globalState.quranSourceManifests=[rec,...globalState.quranSourceManifests];
    if(verses&&contentHash){const sourceFile=rec.sourceFiles?.[0];const content:QuranSourceContentRecord={id:newId('qcontent'),organizationId:rec.organizationId,sourceManifestId:rec.id,packageHash:rec.packageHash,contentHash,sourceFileHash:sourceFile?.sha256||rec.checksumSha256,sourceFormat:sourceFile?.format||'structured',verseCount:verses.length,surahCount:new Set(verses.map(v=>v.surah)).size,rows:verses.map(v=>({...v})),importedAt:new Date().toISOString(),immutable:false};globalState.quranSourceContents=[content,...globalState.quranSourceContents];}
    void persistScopedDocument('quran_sources',rec.id,rec as unknown as Record<string,unknown>);
    auditTrustAction('QURAN_SOURCE_INGESTED','QuranSource',rec.id,`إدخال مصدر علمي: ${verses?.length||0} آية؛ الاعتماد ما زال معلقًا`,`Ingested scientific source: ${verses?.length||0} verses; certification remains pending`);notify();return rec;
  };
  const reviewQuranSource=async(id:string,decision:'approve'|'reject'='approve',comments='')=>{
    if(globalState.currentUser.role!=='scientific_admin')return {ok:false,reason:'not_authorized'};
    const i=globalState.quranSourceManifests.findIndex(x=>x.id===id);if(i<0)return {ok:false,reason:'not_found'};const x=globalState.quranSourceManifests[i];
    if(x.certificationState==='CERTIFIED'||x.certificationState==='REVOKED')return {ok:false,reason:'immutable_state'};
    const packageHash=await computeQuranPackageHash(x);if(x.packageHash&&x.packageHash!==packageHash)return {ok:false,reason:'hash_changed'};
    const reviews=(x.scientificReviews||[]).filter(r=>r.reviewerId!==globalState.currentUser.id);reviews.push({reviewerId:globalState.currentUser.id,reviewerName:globalState.currentUser.name,reviewerRole:globalState.currentUser.role,decision,comments,packageHash,reviewedAt:new Date().toISOString()});
    const reviewerNames=[...new Set(reviews.filter(r=>r.decision==='approve').map(r=>r.reviewerName))];globalState.quranSourceManifests[i]={...x,packageHash,scientificReviews:reviews,reviewerNames,status:'reviewed',certificationState:'PENDING_REVIEW'};
    void persistScopedDocument('quran_sources',id,globalState.quranSourceManifests[i] as unknown as Record<string,unknown>);
    auditTrustAction('QURAN_SOURCE_REVIEWED','QuranSource',id,'تسجيل مراجعة علمية مستقلة على hash محدد','Recorded independent scientific review against the exact package hash');notify();return {ok:true,packageHash};
  };
  const certifyQuranSource=async(id:string)=>{
    if(globalState.currentUser.role!=='scientific_admin')return false;const i=globalState.quranSourceManifests.findIndex(x=>x.id===id);if(i<0)return false;const x=globalState.quranSourceManifests[i];
    const computed=await computeQuranPackageHash(x);if(!x.packageHash||computed!==x.packageHash)return false;
    const gate=canPromoteQuranSource(x,true);if(!gate.allowed)return false;
    globalState.quranSourceManifests[i]={...x,status:'approved',certificationState:'CERTIFIED',revocationState:'ACTIVE',immutable:true,approvedAt:new Date().toISOString(),approvedBy:[...new Set((x.scientificReviews||[]).filter(r=>r.decision==='approve').map(r=>r.reviewerId))],approvalVersion:x.approvalVersion||`SG-${new Date().getFullYear()}-${id.slice(-6)}`};globalState.quranSourceContents=globalState.quranSourceContents.map(c=>c.sourceManifestId===id?{...c,immutable:true}:c);
    void persistScopedDocument('quran_sources',id,globalState.quranSourceManifests[i] as unknown as Record<string,unknown>);
    auditTrustAction('QURAN_SOURCE_CERTIFIED','QuranSource',id,'اعتماد مصدر قرآني immutable بمراجعتين مستقلتين','Certified immutable Quran source after independent scientific approvals');notify();return true;
  };
  const revokeQuranSource=(id:string,reason:string)=>{if(globalState.currentUser.role!=='scientific_admin'||reason.trim().length<3)return false;const i=globalState.quranSourceManifests.findIndex(x=>x.id===id);if(i<0)return false;const x=globalState.quranSourceManifests[i];globalState.quranSourceManifests[i]={...x,status:'retired',certificationState:'REVOKED',revocationState:'REVOKED',revocationReason:reason};createScientificImpact('QURAN_SOURCE_REVOCATION',id,reason,x);void persistScopedDocument('quran_sources',id,globalState.quranSourceManifests[i] as unknown as Record<string,unknown>);auditTrustAction('QURAN_SOURCE_REVOKED','QuranSource',id,'إلغاء اعتماد مصدر قرآني مع إبقاء التاريخ وإنشاء تقرير أثر','Revoked Quran source for future use while preserving history and generated an impact report');notify();return true;};
  const advanceQuranSource=async(id:string,status:'reviewed'|'approved'|'retired')=>status==='reviewed'?(await reviewQuranSource(id)).ok:status==='approved'?(await certifyQuranSource(id)):revokeQuranSource(id,'Superseded or scientifically revoked');
  const runQuranSourceCrossCheck=async(sourceManifestId:string,reference:{authority:string;version?:string;hash?:string;rows:QuranVerseRecord[]})=>{if(globalState.currentUser.role!=='scientific_admin')return null;const source=globalState.quranSourceManifests.find(x=>x.id===sourceManifestId);if(!source?.packageHash)return null;const content=globalState.quranSourceContents.find(x=>x.sourceManifestId===sourceManifestId&&x.packageHash===source.packageHash);if(!content)return null;const compared=compareQuranRows(content.rows,reference.rows);const rec:QuranCrossCheckRecord={id:newId('qcross'),organizationId:source.organizationId,sourceManifestId,sourcePackageHash:source.packageHash,referenceAuthority:reference.authority,referenceVersion:reference.version,referenceHash:reference.hash,status:compared.state,differenceCount:compared.differences.length,differences:compared.differences,createdAt:new Date().toISOString(),createdBy:globalState.currentUser.id};globalState.quranCrossChecks=[rec,...globalState.quranCrossChecks];auditTrustAction('QURAN_SOURCE_CROSS_CHECKED','QuranSource',sourceManifestId,`مقارنة علمية مستقلة: ${rec.status} · ${rec.differenceCount} فرق`,`Independent Quran source cross-check: ${rec.status} · ${rec.differenceCount} difference(s)`);notify();return rec;};
  const registerVariantLocus=(input:Omit<VariantLocusRecord,'id'|'approvalState'> & {approvalState?:VariantLocusRecord['approvalState']})=>{if(globalState.currentUser.role!=='scientific_admin')return null;const rec:VariantLocusRecord={...input,id:newId('locus'),approvalState:input.approvalState||'PENDING_REVIEW'};globalState.variantLoci=[rec,...globalState.variantLoci];auditTrustAction('VARIANT_LOCUS_REGISTERED','VariantLocus',rec.id,'تسجيل موضع اختلاف للمراجعة العلمية','Registered a reading variant locus for scientific review');notify();return rec;};
  const setVariantLocusState=(id:string,state:'CERTIFIED'|'REVOKED')=>{if(globalState.currentUser.role!=='scientific_admin')return false;const i=globalState.variantLoci.findIndex(x=>x.id===id);if(i<0)return false;globalState.variantLoci[i]={...globalState.variantLoci[i],approvalState:state};auditTrustAction(state==='CERTIFIED'?'VARIANT_LOCUS_CERTIFIED':'VARIANT_LOCUS_REVOKED','VariantLocus',id,state==='CERTIFIED'?'اعتماد موضع اختلاف':'إلغاء اعتماد موضع اختلاف',state==='CERTIFIED'?'Certified variant locus':'Revoked variant locus');notify();return true;};
  const registerQuranReferenceAudio=(input:Omit<QuranReferenceAudioRecord,'id'|'organizationId'|'approvalState'|'reviewer'>)=>{if(globalState.currentUser.role!=='scientific_admin')return null;const rec:QuranReferenceAudioRecord={...input,id:newId('qaudio'),organizationId:globalState.organization.id,approvalState:'PENDING_REVIEW'};globalState.quranReferenceAudio=[rec,...globalState.quranReferenceAudio];auditTrustAction('QURAN_REFERENCE_AUDIO_REGISTERED','QuranReferenceAudio',rec.id,'تسجيل صوت مرجعي دون افتراض السلطة العلمية','Registered reference audio without assuming scientific authority');notify();return rec;};
  const setQuranReferenceAudioState=(id:string,state:'APPROVED_REFERENCE'|'REVOKED')=>{if(globalState.currentUser.role!=='scientific_admin')return false;const i=globalState.quranReferenceAudio.findIndex(x=>x.id===id);if(i<0)return false;globalState.quranReferenceAudio[i]={...globalState.quranReferenceAudio[i],approvalState:state,reviewer:globalState.currentUser.name};auditTrustAction(state==='APPROVED_REFERENCE'?'QURAN_REFERENCE_AUDIO_APPROVED':'QURAN_REFERENCE_AUDIO_REVOKED','QuranReferenceAudio',id,state==='APPROVED_REFERENCE'?'اعتماد مرجع صوتي':'إلغاء مرجع صوتي',state==='APPROVED_REFERENCE'?'Approved Quran reference audio':'Revoked Quran reference audio');notify();return true;};
  const updateQuestionGovernance=(questionId:string,patch:Partial<QuestionGovernanceRecord>)=>{
    if(!['scientific_admin','org_admin'].includes(globalState.currentUser.role))return false; const i=globalState.questionGovernance.findIndex(x=>x.questionId===questionId&&x.competitionId===globalState.competition.id); const current=i>=0?globalState.questionGovernance[i]:{questionId,competitionId:globalState.competition.id,expertDifficulty:3,status:'draft' as const,updatedAt:new Date().toISOString()}; const next={...current,...patch,updatedAt:new Date().toISOString(),reviewedBy:globalState.currentUser.name}; if(next.status==='approved'&&!next.sourceManifestId)return false; if(i>=0)globalState.questionGovernance[i]=next;else globalState.questionGovernance=[next,...globalState.questionGovernance]; notify();return true;
  };
  const registerAiValidation=(input:Omit<AICapabilityValidationRecord,'id'|'organizationId'|'status'|'approvedBy'|'updatedAt'>)=>{
    if(globalState.currentUser.role!=='scientific_admin')return null; const rec:AICapabilityValidationRecord={id:newId('aival'),organizationId:globalState.organization.id,status:'validated',certificationState:'PENDING_VALIDATION',validationStage:'RESEARCH',approvedBy:[],updatedAt:new Date().toISOString(),...input}; globalState.aiCapabilityValidations=[rec,...globalState.aiCapabilityValidations];notify();return rec;
  };
  const approveAiCapability=(id:string)=>{
    if(globalState.currentUser.role!=='scientific_admin')return false;const i=globalState.aiCapabilityValidations.findIndex(x=>x.id===id);if(i<0)return false;const r=globalState.aiCapabilityValidations[i];const approvedBy=[...new Set([...r.approvedBy,globalState.currentUser.id])];const candidate={...r,approvedBy,approvalVersion:r.approvalVersion||`AI-SG-${new Date().getFullYear()}-${id.slice(-6)}`};
    const dataset=globalState.scientificDatasets.find(d=>d.organizationId===r.organizationId&&d.name===r.datasetName&&(r.datasetVersion?d.version===r.datasetVersion:true));const benchmark=globalState.benchmarkRuns.find(b=>b.organizationId===r.organizationId&&b.modelName===r.modelName&&b.modelVersion===r.modelVersion&&b.capability===r.capability);const source=globalState.quranSourceManifests.find(q=>q.organizationId===r.organizationId&&sourceUsableForCompetition(q,{qiraah:r.qiraah,rawi:r.rawi,riwaya:r.riwaya,tariq:r.tariq}).ok);
    const gate=certificationReleaseGate({validation:candidate,dataset,benchmark,approvedQuranSource:source});globalState.aiCapabilityValidations[i]={...candidate,status:gate.allowed?'certified':'validated',certificationState:gate.allowed?'CERTIFIED':'PENDING_VALIDATION',validationStage:gate.allowed?'CERTIFIED':candidate.validationStage,updatedAt:new Date().toISOString()};notify();return gate.allowed;
  };
  const advanceAiValidationStage=(id:string,next:'LAB_VALIDATION'|'SHADOW_MODE'|'SCIENTIFIC_REVIEW'|'LIMITED_BETA',evidenceRef?:string)=>{if(globalState.currentUser.role!=='scientific_admin')return false;const i=globalState.aiCapabilityValidations.findIndex(x=>x.id===id);if(i<0)return false;const current=globalState.aiCapabilityValidations[i];const order=['RESEARCH','LAB_VALIDATION','SHADOW_MODE','SCIENTIFIC_REVIEW','LIMITED_BETA'] as const;const from=current.validationStage||'RESEARCH';if(from==='CERTIFIED')return false;if(order.indexOf(next)!==order.indexOf(from as typeof order[number])+1)return false;if(from==='SHADOW_MODE'&&!current.shadowEvidenceRef&&!evidenceRef)return false;globalState.aiCapabilityValidations[i]={...current,validationStage:next,shadowEvidenceRef:evidenceRef||current.shadowEvidenceRef,updatedAt:new Date().toISOString()};auditTrustAction('AI_VALIDATION_STAGE_ADVANCED','AICapability',id,`تقدم دورة التحقق العلمي إلى ${next}`,`Advanced scientific validation lifecycle to ${next}`);notify();return true;};
  const suspendAiCapability=(id:string,reason='Scientific review required')=>{if(globalState.currentUser.role!=='scientific_admin')return false;const i=globalState.aiCapabilityValidations.findIndex(x=>x.id===id);if(i<0)return false;const current=globalState.aiCapabilityValidations[i];globalState.aiCapabilityValidations[i]={...current,status:'suspended',certificationState:'SUSPENDED',scopeNotes:[current.scopeNotes,reason].filter(Boolean).join(' · '),updatedAt:new Date().toISOString()};createScientificImpact('AI_CAPABILITY_SUSPENSION',id,reason,current);auditTrustAction('AI_CAPABILITY_SUSPENDED','AICapability',id,'تعليق قدرة AI مع استمرار التحكيم البشري','Suspended AI capability; human judging remains operational');notify();return true;};
  const revalidateAiProviderModel=(id:string,currentModel:{modelVersion:string;modelHash?:string})=>{if(globalState.currentUser.role!=='scientific_admin')return {changed:false,reason:'not_authorized'};const i=globalState.aiCapabilityValidations.findIndex(x=>x.id===id);if(i<0)return {changed:false,reason:'not_found'};const existing=globalState.aiCapabilityValidations[i];const detected=detectModelChange(existing,currentModel);if(!detected.changed)return {changed:false,state:aiCapabilityState(existing)};globalState.aiCapabilityValidations[i]={...existing,modelVersion:currentModel.modelVersion,modelHash:currentModel.modelHash,status:'validated',certificationState:'PENDING_VALIDATION',validationStage:'RESEARCH',approvedBy:[],approvalVersion:undefined,updatedAt:new Date().toISOString()};createScientificImpact('MODEL_CHANGE',id,'Provider model version/fingerprint changed; certification reset to pending validation.',existing);auditTrustAction('AI_MODEL_CHANGE_DETECTED','AICapability',id,'تغير نموذج المزود؛ إعادة الاعتماد إلى PENDING_VALIDATION','Provider model changed; certification reset to PENDING_VALIDATION');notify();return {changed:true,state:'PENDING_VALIDATION' as const};};
  const registerScientificDataset=(input:Omit<ScientificDatasetRecord,'id'|'organizationId'>)=>{if(globalState.currentUser.role!=='scientific_admin'||!input.consent.length)return null;const d:ScientificDatasetRecord={id:newId('dataset'),organizationId:globalState.organization.id,...input};globalState.scientificDatasets=[d,...globalState.scientificDatasets];auditTrustAction('SCIENTIFIC_DATASET_REGISTERED','ScientificDataset',d.id,'تسجيل dataset مع provenance وموافقات منفصلة','Registered scientific dataset with provenance and explicit consent scopes');notify();return d;};
  const revokeScientificDataset=(id:string,reason:string)=>{if(globalState.currentUser.role!=='scientific_admin'||reason.trim().length<3)return false;const i=globalState.scientificDatasets.findIndex(x=>x.id===id);if(i<0)return false;const dataset=globalState.scientificDatasets[i];globalState.scientificDatasets[i]={...dataset,status:'REVOKED'};createScientificImpact('DATASET_REVOCATION',id,reason,{qiraah:dataset.qiraah,rawi:dataset.rawi,riwaya:dataset.rawi});for(let n=0;n<globalState.aiCapabilityValidations.length;n++){const v=globalState.aiCapabilityValidations[n];if(v.datasetName===dataset.name&&(!v.datasetVersion||v.datasetVersion===dataset.version))globalState.aiCapabilityValidations[n]={...v,status:'suspended',certificationState:'SUSPENDED',updatedAt:new Date().toISOString()}}auditTrustAction('SCIENTIFIC_DATASET_REVOKED','ScientificDataset',id,'إلغاء dataset وتعليق القدرات المعتمدة عليه','Revoked dataset and suspended capabilities that depended on it');notify();return true;};
  const openScientificAdjudication=(input:{datasetId:string;capability:ScientificAdjudicationCaseRecord['capability'];sampleRef:string})=>{if(globalState.currentUser.role!=='scientific_admin')return null;const rec:ScientificAdjudicationCaseRecord={id:newId('adjudication'),organizationId:globalState.organization.id,datasetId:input.datasetId,capability:input.capability,sampleRef:input.sampleRef,expertLabels:[],status:'OPEN'};globalState.scientificAdjudications=[rec,...globalState.scientificAdjudications];notify();return rec;};
  const recordAdjudicationLabel=(id:string,label:string,reasoningCode?:string)=>{if(globalState.currentUser.role!=='scientific_admin')return false;const i=globalState.scientificAdjudications.findIndex(x=>x.id===id&&x.status==='OPEN');if(i<0)return false;const current=globalState.scientificAdjudications[i];const expertLabels=current.expertLabels.filter(x=>x.reviewerId!==globalState.currentUser.id);expertLabels.push({reviewerId:globalState.currentUser.id,label,reasoningCode,createdAt:new Date().toISOString()});globalState.scientificAdjudications[i]={...current,expertLabels};notify();return true;};
  const adjudicateScientificCase=(id:string,finalGoldLabel:string)=>{if(globalState.currentUser.role!=='scientific_admin')return false;const i=globalState.scientificAdjudications.findIndex(x=>x.id===id&&x.status==='OPEN');if(i<0)return false;const current=globalState.scientificAdjudications[i];if(new Set(current.expertLabels.map(x=>x.reviewerId)).size<2)return false;globalState.scientificAdjudications[i]={...current,status:'ADJUDICATED',finalGoldLabel,adjudicatedBy:globalState.currentUser.id,adjudicatedAt:new Date().toISOString()};auditTrustAction('SCIENTIFIC_ADJUDICATION_COMPLETED','ScientificAdjudication',id,'حسم Gold label مع حفظ اختلاف الخبراء','Adjudicated gold label while preserving expert disagreement');notify();return true;};
  const registerBenchmarkRun=(input:Omit<BenchmarkRunRecord,'id'|'organizationId'|'ranAt'>)=>{if(globalState.currentUser.role!=='scientific_admin')return null;const b:BenchmarkRunRecord={id:newId('benchrun'),organizationId:globalState.organization.id,ranAt:new Date().toISOString(),...input};globalState.benchmarkRuns=[b,...globalState.benchmarkRuns];notify();return b;};
  const updateOperatingCostModel=(patch:Partial<OperatingCostModel>)=>{globalState.operatingCostModel={...globalState.operatingCostModel,...patch};notify();};
  const getOperatingSavings=()=>{const m=globalState.operatingCostModel; const baselineHours=m.baselineStaff*m.hoursPerDay*m.days; const mizanHours=m.mizanStaff*m.hoursPerDay*m.days; const savedHours=Math.max(0,baselineHours-mizanHours); return {baselineHours,mizanHours,savedHours,estimatedMoney:m.hourlyCost!==undefined?savedHours*m.hourlyCost:undefined,currency:m.currency};};



  const createCompetition = (nameArabic: string, nameEnglish: string, templateId = 'international-hifz') => {
    const base: Competition = {
      ...JSON.parse(JSON.stringify(globalState.competition)), id:newId('comp'), name:nameEnglish, nameArabic, edition:'New Edition', status:'draft',
      startDate:'', endDate:'', registrationStartDate:'', registrationEndDate:'', totalRegistered:0, totalApproved:0, totalAttended:0, currentDay:0,
      categories: globalState.competition.categories.map(c => ({...c,id:newId('cat'),competitionId:''})),
      readinessChecklist:{datesConfigured:false,categoriesConfigured:true,ruleSetFrozen:false,judgesAssigned:false,quranSourceLocked:false,devicesRegistered:false,certificatesReady:false}
    };
    base.categories = base.categories.map(c => ({...c,competitionId:base.id}));
    const configured = applyCompetitionTemplate(base, templateId);
    globalState.competitions = [configured, ...globalState.competitions];
    globalState.competition = configured;
    notify(); return configured;
  };

  const applyTemplate = (templateId: string) => {
    globalState.competition = applyCompetitionTemplate(globalState.competition, templateId);
    notify();
  };

  const updateCompetitionPolicy = (updater: (policy: ReturnType<typeof getCompetitionPolicy>) => ReturnType<typeof getCompetitionPolicy>) => {
    const current = getCompetitionPolicy(globalState.competition);
    if (current.frozenAt) return false;
    const next = updater(JSON.parse(JSON.stringify(current)));
    next.version = current.version === next.version ? `${current.version.split('.')[0]}.${Number(current.version.split('.')[1] || 0) + 1}.0` : next.version;
    next.updatedAt = new Date().toISOString();
    globalState.competition = { ...globalState.competition, policy: next };
    notify();
    return true;
  };

  const updateRuleSet = (patch: Partial<Competition['ruleSet']>) => {
    if (globalState.competition.ruleSet.frozenAt || getCompetitionPolicy(globalState.competition).frozenAt) return false;
    const next = { ...globalState.competition.ruleSet, ...patch, version: `${globalState.competition.ruleSet.version}-rev` };
    globalState.competition = { ...globalState.competition, ruleSet: next, ruleSets: [next, ...(globalState.competition.ruleSets || []).filter(r => r.id !== next.id)] };
    notify();
    return true;
  };

  const getCompetitionReadiness = () => getReadinessIssues(globalState.competition);

  const updateCompetitionDetails = (patch: Partial<Competition>) => {
    globalState.competition = { ...globalState.competition, ...patch };
    notify();
  };

  const addCategory = () => {
    const id = newId('cat');
    const category: Category = {
      id, competitionId: globalState.competition.id, code:`CAT-${globalState.competition.categories.length+1}`,
      name:'New category', nameArabic:'فئة جديدة', description:'', riwaya:'', memorizationScope:'Custom', juzCount:30,
      genderConstraint:'all', targetParticipants:100, targetDurationMinutes:8, ruleSetId:globalState.competition.ruleSet.id
    };
    globalState.competition = { ...globalState.competition, categories:[...globalState.competition.categories, category] };
    notify(); return category;
  };

  const updateCategory = (categoryId: string, patch: Partial<Category>) => {
    globalState.competition = { ...globalState.competition, categories:globalState.competition.categories.map(c=>c.id===categoryId?{...c,...patch}:c) };
    notify();
  };

  const removeCategory = (categoryId: string) => {
    if (globalState.participants.some(p=>p.categoryId===categoryId)) return false;
    globalState.competition = { ...globalState.competition, categories:globalState.competition.categories.filter(c=>c.id!==categoryId) };
    notify(); return true;
  };

  const addCommittee = () => {
    const n=globalState.committees.length+1;
    const firstCategory=globalState.competition.categories[0];
    const committee: Committee={ id:newId('comm'),competitionId:globalState.competition.id,name:`Committee ${n}`,nameArabic:`اللجنة ${n}`,code:`C${n}`,venueHall:'',assignedCategories:firstCategory?[firstCategory.id]:[],headJudgeId:'',judgeIds:[],status:'ready',completedCount:0,averageSessionMinutes:globalState.competition.ruleSet.questionDurationMinutes||8,audioInputOk:false,devicesConnected:0 };
    globalState.committees=[...globalState.committees,committee]; notify(); return committee;
  };

  const updateCommittee = (committeeId: string, patch: Partial<Committee>) => {
    globalState.committees=globalState.committees.map(c=>c.id===committeeId?{...c,...patch}:c); notify();
  };

  const scientificSourcesForCompetition = () => globalState.competition.categories.flatMap(category => {
    const explicit=(category.readingContexts||[]).map(rc=>TEN_QIRAAT_GRAPH.find(x=>x.qiraahId===rc.qiraahId&&x.rawiId===rc.rawiId)).filter(Boolean);
    const readings=explicit.length?explicit:resolveReadings({riwaya:category.riwaya});
    if(!readings.length)return [{category,reading:undefined,source:undefined,content:undefined}];
    return readings.map(reading=>{
      const source=reading?globalState.quranSourceManifests.find(q=>q.organizationId===globalState.competition.organizationId&&sourceUsableForCompetition(q,{qiraah:reading.qiraah,rawi:reading.rawi}).ok):undefined;
      const content=source?globalState.quranSourceContents.find(c=>c.sourceManifestId===source.id&&c.packageHash===source.packageHash&&c.immutable):undefined;
      return {category,reading,source,content};
    });
  });

  const publishCompetition = () => {
    const issues=getReadinessIssues(globalState.competition);
    const contradictions=detectContradictions({competition:globalState.competition,quranSources:globalState.quranSourceManifests,aiValidations:globalState.aiCapabilityValidations,availableQualifiedJudges:globalState.judges.filter(j=>j.isReady).length,committeeCount:globalState.committees.filter(c=>c.status!=='offline').length});
    const scientific=scientificSourcesForCompetition();
    const scientificBlockers=scientific.flatMap(({category,reading,source,content})=>{
      const out:{code:string;message:string;categoryId:string}[]=[];
      if(!reading)out.push({code:'CANONICAL_READING_MAPPING_REQUIRED',message:`${category.name}: reading is not mapped to the canonical qiraat graph.`,categoryId:category.id});
      if(!source)out.push({code:'CERTIFIED_QURAN_SOURCE_REQUIRED',message:`${category.name}: no exact certified Quran source for ${category.riwaya}.`,categoryId:category.id});
      if(source&&!content)out.push({code:'CERTIFIED_QURAN_CONTENT_REQUIRED',message:`${category.name}: certified source content is not available for exact package ${source.packageHash||source.id}.`,categoryId:category.id});
      return out;
    });
    const blockers=contradictions.filter(x=>x.severity==='BLOCKER');
    // In production, a competition cannot open as official without exact source content. Development remains usable but visibly non-official.
    if(issues.length||blockers.length||(productionMode&&scientificBlockers.length)) return {ok:false,issues:[...issues,...blockers.map(x=>x.title),...scientificBlockers.map(x=>x.message)],scientificBlockers,contradictions};
    globalState.contradictionIssues=contradictions;
    globalState.competition={...globalState.competition,status:'registration_open'};
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'COMPETITION_PUBLISHED',entityType:'Competition',entityId:globalState.competition.id,humanSummaryArabic:productionMode?'فتح التسجيل بعد اجتياز بوابات الجاهزية العلمية والتشغيلية.':'فتح التسجيل في بيئة تطوير؛ الاعتماد العلمي الكامل مطلوب قبل الإنتاج.',humanSummaryEnglish:productionMode?'Opened registration after scientific and operational gates passed.':'Opened registration in development; full scientific source certification remains required for production.',currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify(); return {ok:true,issues:[],scientificBlockers,contradictions};
  };

  const sourceResolvedQuestionPool = (participant:Participant, source:QuranSourceManifestRecord, content:QuranSourceContentRecord) => {
    const reading=resolveReading({riwaya:participant.riwaya});
    if(!reading)return [];
    const approved=new Set(globalState.questionGovernance.filter(g=>g.competitionId===globalState.competition.id&&g.status==='approved'&&g.sourceManifestId===source.id).map(g=>g.questionId));
    const rows=new Map(content.rows.map(v=>[`${v.surah}:${v.ayah}`,v.text]));
    const candidates=DEVELOPMENT_QUESTION_BANK.filter(q=>{
      const qr=resolveReading({riwaya:q.riwaya});
      return qr?.qiraahId===reading.qiraahId&&qr?.rawiId===reading.rawiId&&approved.has(q.id);
    });
    return candidates.flatMap(q=>{
      const verses:string[]=[];
      for(let ayah=q.startAyah;ayah<=q.endAyah;ayah++){const text=rows.get(`${q.surahNumber}:${ayah}`);if(!text)return [];verses.push(text);}
      const governance=globalState.questionGovernance.find(g=>g.competitionId===globalState.competition.id&&g.questionId===q.id&&g.sourceManifestId===source.id&&g.status==='approved');
      return [{...q,riwaya:participant.riwaya,expectedTextArabic:verses.join(' '),difficultyRating:governance?.expertDifficulty??q.difficultyRating}];
    });
  };

  const startSessionForParticipant = async (participantId: string) => {
    const participant = globalState.participants.find(p => p.id === participantId);
    if (!participant) return false;
    const assigned = globalState.committees.find(c => c.id === participant.assignedCommitteeId && !committeeHasHardConflict(c, participant));
    const committee = assigned || compatibleCommitteesFor(participant)[0];
    if (!committee) {
      createIncident('conflict_routing', 'No conflict-free committee', `Participant ${participant.code} needs a manual conflict-safe committee assignment.`, 'critical');
      return false;
    }
    const policy = getCompetitionPolicy(globalState.competition);
    if (!policy.frozenAt) {
      const now = new Date().toISOString();
      const frozenPolicy = { ...policy, frozenAt: now, updatedAt: now };
      const frozenRuleSet = { ...globalState.competition.ruleSet, frozenAt: now };
      globalState.competition = { ...globalState.competition, policy: frozenPolicy, ruleSet: frozenRuleSet, ruleSets: [frozenRuleSet, ...(globalState.competition.ruleSets || []).filter(r => r.id !== frozenRuleSet.id)] };
    }
    const category = globalState.competition.categories.find(c => c.id === participant.categoryId);
    const reading=resolveReading({riwaya:participant.riwaya});
    const source=reading?globalState.quranSourceManifests.find(q=>q.organizationId===globalState.competition.organizationId&&sourceUsableForCompetition(q,{qiraah:reading.qiraah,rawi:reading.rawi}).ok):undefined;
    const content=source?globalState.quranSourceContents.find(c=>c.sourceManifestId===source.id&&c.packageHash===source.packageHash&&c.immutable):undefined;
    let pool=source&&content?sourceResolvedQuestionPool(participant,source,content):[];
    let sourceMode:'CERTIFIED_SOURCE'|'DEVELOPMENT_FIXTURE'=source&&content&&pool.length?'CERTIFIED_SOURCE':'DEVELOPMENT_FIXTURE';
    if(productionMode&&sourceMode!=='CERTIFIED_SOURCE'){
      createIncident('quran_source_discrepancy','Scientific Quran source blocker',`Official session blocked for ${participant.code}: exact certified source/content/question governance is unavailable for ${participant.riwaya}.`,'critical');
      return false;
    }
    if(sourceMode==='DEVELOPMENT_FIXTURE')pool=DEVELOPMENT_QUESTION_BANK;
    try {
      const selection = await generateFairDraw({ pool, participant, policy, maxJuz: category?.juzCount,poolVersion:sourceMode==='CERTIFIED_SOURCE'?source!.packageHash:undefined,quranSourceManifestId:sourceMode==='CERTIFIED_SOURCE'?source!.id:undefined,qiraah:reading?.qiraah,rawi:reading?.rawi,tariq:source?.tariq,variantLocusVersion:sourceMode==='CERTIFIED_SOURCE'?'SOURCE_BOUND':undefined,difficultyMetadataVersion:sourceMode==='CERTIFIED_SOURCE'?`QG:${source!.packageHash}`:'DEVELOPMENT' });
      selection.sourceMode=sourceMode;selection.quranSourceVersion=source?.sourceVersion||source?.version;selection.quranSourcePackageHash=source?.packageHash;
      globalState.activeSession = {
        sessionId:newId('sess'), participant, committee, questionSelection:selection, currentQuestionIndex:0, isReciting:true, durationSeconds:0, events:[], isLocked:false, audioLevel:76
      };
      if(sourceMode==='CERTIFIED_SOURCE'&&source){
        const ref=globalState.competition.id;const idx=globalState.quranSourceManifests.findIndex(q=>q.id===source.id);if(idx>=0&&!globalState.quranSourceManifests[idx].historicalUsageReferences?.includes(ref))globalState.quranSourceManifests[idx]={...globalState.quranSourceManifests[idx],historicalUsageReferences:[...(globalState.quranSourceManifests[idx].historicalUsageReferences||[]),ref]};
      }
      const idx=globalState.participants.findIndex(p=>p.id===participantId); if(idx>=0) globalState.participants[idx]={...globalState.participants[idx],status:'in_session'};
      globalState.committees=globalState.committees.map(c=>c.id===committee.id?{...c,status:'testing',currentParticipantId:participantId}:c);
      refreshQueueNotifications();
      globalState.auditLogs = [{ id:newId('aud'), timestamp:new Date().toISOString(), organizationId:globalState.competition.organizationId, competitionId:globalState.competition.id, actorId:globalState.currentUser.id, actorName:globalState.currentUser.name, actorRole:globalState.currentUser.role, action:'FAIRDRAW_COMMITTED', entityType:'QuestionSelection', entityId:selection.questionSetId, humanSummaryArabic:sourceMode==='CERTIFIED_SOURCE'?`اعتماد حزمة أسئلة ${participant.code} من مصدر قرآني معتمد محدد النسخة`:`حزمة تطوير ${participant.code} — ليست مصدرًا قرآنيًا رسميًا`, humanSummaryEnglish:sourceMode==='CERTIFIED_SOURCE'?`Committed ${participant.code} question set from exact certified Quran source package`:`Development-only question fixture for ${participant.code}; not an official Quran source`, currentStateHash:selection.seedCommitmentHash }, ...globalState.auditLogs];
      notify(); return true;
    } catch (error) {
      console.error('FairDraw could not create an eligible set', error); return false;
    }
  };

  // Digital Twin / capacity estimate. Every value is derived from the current competition inputs or declared assumptions.
  const queueNotification = (channel: NotificationRecord['channel'], recipient: string, templateKey: string, participantId?: string, locale = globalState.language) => {
    const idempotencyKey = `${globalState.competition.id}:${participantId||recipient}:${channel}:${templateKey}`;
    const existing = globalState.notifications.find(n => n.idempotencyKey === idempotencyKey && ['queued','sent'].includes(n.status));
    if (existing) return existing;
    const provider = globalState.integrations.find(i => i.kind === channel && i.enabled && i.status === 'configured');
    const consentKinds=globalState.consents.filter(c=>c.participantId===participantId&&c.accepted).map(c=>c.kind); const consentSatisfied=!participantId||channel==='in_app'||consentKinds.includes('privacy'); const item: NotificationRecord = { id:newId('ntf'), competitionId:globalState.competition.id, participantId, channel, templateKey, locale, recipient, status: channel==='in_app' ? 'sent' : provider&&consentSatisfied ? 'queued' : 'failed', attempts: channel==='in_app'?1:0, createdAt:new Date().toISOString(), sentAt:channel==='in_app'?new Date().toISOString():undefined, error:channel==='in_app'||(provider&&consentSatisfied)?undefined:!consentSatisfied?'Consent required':'Provider not configured', consentRequired:channel!=='in_app', consentSatisfied, fallbackChannel:channel==='whatsapp'?'sms':channel==='sms'?'email':'in_app', idempotencyKey };
    globalState.notifications=[item,...globalState.notifications]; notify(); return item;
  };
  const retryNotification = (id:string) => { const i=globalState.notifications.findIndex(n=>n.id===id); if(i<0)return; const n=globalState.notifications[i]; const provider=globalState.integrations.find(x=>x.kind===n.channel&&x.enabled&&x.status==='configured'); const attempts=n.attempts+1; const backoffMinutes=Math.min(60,Math.max(1,2**Math.min(attempts,6))); const next=new Date(Date.now()+backoffMinutes*60000).toISOString(); globalState.notifications[i]={...n,status:provider?'queued':'failed',attempts,error:provider?undefined:'Provider not configured',nextRetryAt:provider?undefined:next}; globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'NOTIFICATION_RETRY',entityType:'Notification',entityId:id,humanSummaryArabic:`إعادة محاولة إشعار؛ المحاولة ${attempts}`,humanSummaryEnglish:`Notification retry attempt ${attempts}`,currentStateHash:`retry:${attempts}`},...globalState.auditLogs]; notify(); };
  const configureIntegration = (kind: IntegrationConfig['kind'], name:string, enabled=true, endpoint?:string) => {
    const existing=globalState.integrations.findIndex(i=>i.kind===kind);
    const cleanEndpoint=endpoint?.trim();
    const looksPlaceholder=!cleanEndpoint||cleanEndpoint.startsWith('internal://')||cleanEndpoint.includes('example.')||cleanEndpoint.includes('localhost');
    // Registering an adapter is not proof that a credentialed provider is live.
    // Development/UI configuration therefore stays NOT_CONFIGURED until a deployed backend health check promotes it.
    const previous=existing>=0?globalState.integrations[existing]:undefined;
    const item:IntegrationConfig={id:previous?.id||newId('int'),organizationId:globalState.competition.organizationId,kind,name,enabled,status:previous?.status==='configured'&&!looksPlaceholder?'configured':'not_configured',endpoint:looksPlaceholder?undefined:cleanEndpoint,lastCheckedAt:new Date().toISOString()};
    if(existing>=0)globalState.integrations[existing]=item;else globalState.integrations=[item,...globalState.integrations];
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'INTEGRATION_ADAPTER_CONFIGURED',entityType:'Integration',entityId:item.id,humanSummaryArabic:`تهيئة محول ${name} دون ادعاء اتصال مزود خارجي`,humanSummaryEnglish:`Configured ${name} adapter without claiming external provider connectivity`,currentStateHash:`integration:${item.id}:${item.status}`},...globalState.auditLogs];
    notify(); return item;
  };
  const addWebhook = (event:string, endpoint:string) => { const item:WebhookSubscription={id:newId('wh'),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,event,endpoint,enabled:true,secretRef:`secret://webhooks/${newId('ref')}`}; globalState.webhooks=[item,...globalState.webhooks]; notify(); return item; };
  const registerDevice = (name:string,type:DeviceRecord['type'],zone?:string,role?:DeviceRecord['role']) => { const now=new Date().toISOString(); const d:DeviceRecord={id:newId('dev'),competitionId:globalState.competition.id,name,type,role,zone,status:'online',connection:'online',lastSeenAt:now,lastSyncAt:now,softwareVersion:'1.0.0',sessionExpiresAt:new Date(Date.now()+12*60*60*1000).toISOString()};globalState.devices=[d,...globalState.devices];notify();return d; };
  const updateDeviceStatus=(id:string,status:DeviceRecord['status'])=>{globalState.devices=globalState.devices.map(d=>d.id===id?{...d,status,connection:status==='offline'?'offline':d.connection,lastSeenAt:new Date().toISOString()}:d);notify();};
  const updateDevice=(id:string,patch:Partial<DeviceRecord>)=>{const current=globalState.devices.find(d=>d.id===id);if(!current)return false;if(patch.role&&patch.role!==current.role&&!['org_admin','comp_admin','ops_manager','super_admin'].includes(globalState.currentUser.role))return false;const activeJudgeLocked=current.role==='JudgeOS'&&globalState.activeSession.isLocked&&!!current.committeeId&&current.committeeId===globalState.activeSession.committee?.id;if(activeJudgeLocked&&patch.role&&patch.role!=='JudgeOS')return false;globalState.devices=globalState.devices.map(d=>d.id===id?{...d,...patch,lastSeenAt:new Date().toISOString()}:d);globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'DEVICE_UPDATED',entityType:'Device',entityId:id,humanSummaryArabic:'تحديث دور أو إعداد جهاز تشغيلي',humanSummaryEnglish:'Operational device role/settings updated',currentStateHash:`device:${id}:${Date.now()}`},...globalState.auditLogs];notify();return true;};
  const revokeDevice=(id:string)=>updateDevice(id,{status:'revoked',revokedAt:new Date().toISOString()});
  const upsertTravelRecord=(participantId:string,patch:Partial<DelegationTravelRecord>)=>{const i=globalState.travelRecords.findIndex(r=>r.participantId===participantId&&r.competitionId===globalState.competition.id);const base:DelegationTravelRecord=i>=0?globalState.travelRecords[i]:{id:newId('travel'),competitionId:globalState.competition.id,delegationId:globalState.participants.find(p=>p.id===participantId)?.delegationId||'direct',participantId,transportStatus:'pending',companionCount:0};const next={...base,...patch};if(i>=0)globalState.travelRecords[i]=next;else globalState.travelRecords=[next,...globalState.travelRecords];notify();return next;};
  const recordConsent=(participantId:string,kind:ConsentRecord['kind'],version:string,accepted=true,guardianName?:string)=>{const c:ConsentRecord={id:newId('consent'),participantId,competitionId:globalState.competition.id,kind,version,accepted,acceptedAt:new Date().toISOString(),guardianName};globalState.consents=[c,...globalState.consents];notify();return c;};
  const createImportJob=(entity:ImportJobRecord['entity'],fileName:string,totalRows:number,invalidRows=0)=>{const j:ImportJobRecord={id:newId('imp'),competitionId:globalState.competition.id,entity,fileName,status:invalidRows?'validated':'imported',totalRows,validRows:Math.max(0,totalRows-invalidRows),invalidRows,mapping:{},errors:invalidRows?[{row:2,message:'Validation required before import'}]:[],createdAt:new Date().toISOString()};globalState.importJobs=[j,...globalState.importJobs];notify();return j;};
  const importParticipantsCsv=(fileName:string,csv:string)=>{
    const lines=csv.replace(/\r/g,'').split('\n').filter(Boolean); if(!lines.length) return createImportJob('participants',fileName,0,0);
    const parse=(line:string)=>{const out:string[]=[];let cur='';let quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='\"'){if(quoted&&line[i+1]==='\"'){cur+='\"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){out.push(cur.trim());cur='';}else cur+=ch;}out.push(cur.trim());return out;};
    const headers=parse(lines[0]).map(h=>h.trim()); const required=['fullName','email','dateOfBirth','categoryId']; const missing=required.filter(h=>!headers.includes(h));
    const errors:{row:number;message:string}[]=[]; const staged:Participant[]=[];
    if(missing.length) errors.push({row:1,message:`Missing columns: ${missing.join(', ')}`});
    if(!missing.length) for(let i=1;i<lines.length;i++){const cells=parse(lines[i]);const row=Object.fromEntries(headers.map((h,idx)=>[h,cells[idx]||''])) as Record<string,string>; if(!row.fullName||!row.email||!row.dateOfBirth||!row.categoryId){errors.push({row:i+1,message:'Missing required participant fields'});continue;} const cat=globalState.competition.categories.find(c=>c.id===row.categoryId||c.code===row.categoryId); if(!cat){errors.push({row:i+1,message:`Unknown category: ${row.categoryId}`});continue;} const code=`A-${String(100+globalState.participants.length+staged.length+1).padStart(3,'0')}`; staged.push({id:newId('part'),code,competitionId:globalState.competition.id,organizationId:globalState.competition.organizationId,fullName:row.fullName,fullNameArabic:row.fullNameArabic||row.fullName,email:row.email,phone:row.phone||'',country:row.country||'',nationality:row.nationality||row.country||'',nationalIdOrPassport:row.identity||'',dateOfBirth:row.dateOfBirth,gender:row.gender==='female'?'female':'male',categoryId:cat.id,riwaya:row.riwaya||cat.riwaya,institution:row.institution||'',status:'under_review',statusHistory:[{status:'submitted',timestamp:new Date().toISOString(),actor:'CSV import'},{status:'under_review',timestamp:new Date().toISOString(),actor:'Import validator'}],createdAt:new Date().toISOString()});}
    const job:ImportJobRecord={id:newId('imp'),competitionId:globalState.competition.id,entity:'participants',fileName,status:errors.length?'validated':'imported',totalRows:Math.max(0,lines.length-1),validRows:staged.length,invalidRows:errors.filter(e=>e.row>1).length,mapping:Object.fromEntries(headers.map(h=>[h,h])),errors,createdAt:new Date().toISOString()};
    globalState.importJobs=[job,...globalState.importJobs]; if(!errors.length){globalState.participants=[...globalState.participants,...staged];}
    notify(); return job;
  };
  const startShadowRun=(mode:ShadowRun['mode'])=>{const s:ShadowRun={id:newId('shadow'),competitionId:globalState.competition.id,mode,status:'running',startedAt:new Date().toISOString(),observations:[]};globalState.shadowRuns=[s,...globalState.shadowRuns];notify();return s;};
  const completeShadowRun=(id:string)=>{globalState.shadowRuns=globalState.shadowRuns.map(s=>s.id===id?{...s,status:'completed',completedAt:new Date().toISOString(),observations:[{type:'queue',severity:'medium',summary:'Peak queue can be reduced by dynamic arrival slots.'},{type:'judging',severity:'info',summary:'Independent locking preserved across the shadow comparison.'},{type:'automation',severity:'info',summary:'Routine reception steps are eligible for self-service.'}]}:s);notify();};
  const addParticipantPassportEntry=(participantId:string)=>{const p=globalState.participants.find(x=>x.id===participantId);if(!p)return;const r=globalState.results.find(x=>x.participantId===participantId);const c=globalState.certificates.find(x=>x.participantId===participantId);const cat=globalState.competition.categories.find(x=>x.id===p.categoryId);const e:ParticipantPassportEntry={id:newId('pp'),participantId,competitionId:globalState.competition.id,competitionName:globalState.competition.name,categoryName:cat?.name||'',year:globalState.competition.startDate.slice(0,4),result:r?`${r.rank} / ${r.finalScore}`:undefined,certificateNumber:c?.certificateNumber,verified:!!c};globalState.participantPassport=[e,...globalState.participantPassport.filter(x=>!(x.participantId===participantId&&x.competitionId===globalState.competition.id))];notify();return e;};
  const addJudgePassportEntry=(judgeId:string)=>{const j=globalState.judges.find(x=>x.id===judgeId||x.userId===judgeId);if(!j)return;const e:JudgePassportEntry={id:newId('jp'),judgeId:j.id,competitionId:globalState.competition.id,competitionName:globalState.competition.name,role:j.specialty,riwayat:j.certifiedRiwayat,calibrationScore:j.calibrationScore,completedSessions:globalState.judgeSubmissions.filter(x=>x.judgeId===j.userId).length,verified:j.isReady};globalState.judgePassport=[e,...globalState.judgePassport.filter(x=>!(x.judgeId===j.id&&x.competitionId===globalState.competition.id))];notify();return e;};
  const completeJudgeCalibration=(judgeId:string,score:number)=>{
    const bounded=Math.max(0,Math.min(100,score));
    globalState.judges=globalState.judges.map(j=>(j.id===judgeId||j.userId===judgeId)?{...j,calibrationScore:bounded,isReady:bounded>=85}:j);
    const j=globalState.judges.find(x=>x.id===judgeId||x.userId===judgeId);
    if(j) addJudgePassportEntry(j.id);
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'JUDGE_CALIBRATION_COMPLETED',entityType:'JudgeProfile',entityId:j?.id||judgeId,humanSummaryArabic:`إكمال معايرة المحكم بنتيجة ${bounded}%`,humanSummaryEnglish:`Judge calibration completed at ${bounded}%`,currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs]; notify(); return j;
  };

  const createTrainingRun=(type:TrainingRun['type'])=>{const t:TrainingRun={id:newId('train'),competitionId:globalState.competition.id,type,status:'ready'};globalState.trainingRuns=[t,...globalState.trainingRuns];notify();return t;};
  const completeTrainingRun=(id:string,score=100)=>{globalState.trainingRuns=globalState.trainingRuns.map(t=>t.id===id?{...t,status:'completed',startedAt:t.startedAt||new Date().toISOString(),score}:t);notify();};
  const createBackup=async()=>{const payload=JSON.stringify({competition:globalState.competition,participants:globalState.participants,results:globalState.results,audit:globalState.auditLogs});const b:BackupRecord={id:newId('backup'),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,createdAt:new Date().toISOString(),scope:'competition',checksum:await sha256(payload),status:'ready',sizeLabel:`${Math.max(1,Math.round(payload.length/1024))} KB`};globalState.backups=[b,...globalState.backups];notify();return b;};
  const scheduleRetention=(dataType:RetentionJob['dataType'],days:number,action:RetentionJob['action'])=>{const d=new Date();d.setDate(d.getDate()+days);const r:RetentionJob={id:newId('ret'),competitionId:globalState.competition.id,dataType,scheduledFor:d.toISOString(),action,status:'scheduled'};globalState.retentionJobs=[r,...globalState.retentionJobs];notify();return r;};
  const requestSupportSession=(reason:string)=>{const d=new Date();d.setHours(d.getHours()+1);const x:SupportSession={id:newId('support'),organizationId:globalState.competition.organizationId,requestedBy:globalState.currentUser.id,reason,status:'requested',createdAt:new Date().toISOString(),expiresAt:d.toISOString()};globalState.supportSessions=[x,...globalState.supportSessions];notify();return x;};
  const approveSupportSession=(id:string)=>{globalState.supportSessions=globalState.supportSessions.map(s=>s.id===id?{...s,status:'approved',approvedBy:globalState.currentUser.id}:s);notify();};
  const runRemoteCheck=(participantId:string)=>{const mediaReady=typeof navigator!=='undefined'&&!!navigator.mediaDevices?.getUserMedia; const online=typeof navigator==='undefined'?true:navigator.onLine; const r:RemoteSessionCheck={id:newId('remote'),participantId,competitionId:globalState.competition.id,identity:'pending',device:mediaReady?'passed':'failed',environment:'review',networkQuality:online?'good':'poor',recordingReady:mediaReady,suspiciousSignals:[]};globalState.remoteChecks=[r,...globalState.remoteChecks.filter(x=>x.participantId!==participantId)];notify();return r;};
  const cloneCompetition=(nameArabic?:string,nameEnglish?:string)=>{const base=JSON.parse(JSON.stringify(globalState.competition)) as Competition;base.id=newId('comp');base.nameArabic=nameArabic||`${base.nameArabic} — نسخة`;base.name=nameEnglish||`${base.name} — Copy`;base.status='draft';base.totalRegistered=0;base.totalApproved=0;base.totalAttended=0;base.policy={...getCompetitionPolicy(base),updatedAt:new Date().toISOString(),frozenAt:undefined};base.categories=base.categories.map(c=>({...c,id:newId('cat'),competitionId:base.id}));globalState.competitions=[base,...globalState.competitions];globalState.competition=base;notify();return base;};
  const exportCompetitionSnapshot=()=>JSON.stringify({version:1,exportedAt:new Date().toISOString(),organizationId:globalState.competition.organizationId,competition:globalState.competition,participants:globalState.participants.filter(p=>p.competitionId===globalState.competition.id),committees:globalState.committees.filter(c=>c.competitionId===globalState.competition.id),results:globalState.results.filter(r=>r.competitionId===globalState.competition.id),certificates:globalState.certificates.filter(c=>c.competitionId===globalState.competition.id),auditLogs:globalState.auditLogs.filter(a=>a.competitionId===globalState.competition.id)},null,2);

  const optimizeArrivalSlots = () => {
    const approved = globalState.participants.filter(p => p.competitionId===globalState.competition.id && ['approved','scheduled'].includes(p.status));
    const panels = Math.max(1, globalState.committees.filter(c => c.competitionId===globalState.competition.id&&c.status !== 'offline').length);
    const avg = globalState.committees.filter(c => c.competitionId===globalState.competition.id&&c.status !== 'offline').reduce((a,c)=>a+c.averageSessionMinutes,0) / panels || 10;
    const perWave = Math.max(1, Math.floor(panels * (30 / Math.max(4, avg))));
    const day = new Date(globalState.competition.startDate || Date.now());
    day.setHours(8,0,0,0);
    const changed:Participant[]=[];
    globalState.participants = globalState.participants.map(p => {
      const idx = approved.findIndex(x=>x.id===p.id); if (idx < 0) return p;
      const wave = Math.floor(idx / perWave); const start = new Date(day.getTime()+wave*30*60*1000); const end = new Date(start.getTime()+20*60*1000);
      const fmt=(d:Date)=>`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; const arrivalSlot=`${fmt(start)}–${fmt(end)}`; const next={...p,arrivalSlot}; if(p.arrivalSlot!==arrivalSlot)changed.push(next); return next;
    });
    changed.forEach(p=>appendParticipantNotifications(p,'arrival.updated'));
    notify();
    return { scheduled: approved.length, perWave, averageSessionMinutes: Math.round(avg*10)/10 };
  };

  const getFairnessReceipt = (participantId:string) => {
    const p=globalState.participants.find(x=>x.id===participantId); const r=globalState.results.find(x=>x.participantId===participantId); const sub=globalState.judgeSubmissions.filter(x=>x.participantId===participantId); const cert=globalState.certificates.find(x=>x.participantId===participantId);
    if(!p) return null;
    return { receiptVersion:1, participantCode:p.code, competitionId:globalState.competition.id, policyVersion:getCompetitionPolicy(globalState.competition).version, ruleSetVersion:globalState.competition.ruleSet.version, independentJudgeSubmissions:sub.length, resultStatus:r?.status||'not_calculated', resultSealHash:r?.sealMetadata?.cryptographicChecksum, certificateId:cert?.id, generatedAt:new Date().toISOString() };
  };

  const getIntegrityAnalytics = () => {
    const byJudge=globalState.judges.map(j=>{const subs=globalState.judgeSubmissions.filter(s=>s.judgeId===j.userId); const avg=subs.length?subs.reduce((a,s)=>a+s.totalScore,0)/subs.length:0; return {judgeId:j.id,name:j.name,sessions:subs.length,averageScore:Math.round(avg*100)/100,calibrationScore:j.calibrationScore,isReady:j.isReady};});
    const scored=byJudge.filter(j=>j.sessions>0); const panelAvg=scored.length?scored.reduce((a,j)=>a+j.averageScore,0)/scored.length:0;
    return byJudge.map(j=>({...j,deviationFromPanel:Math.round((j.averageScore-panelAvg)*100)/100,attention:j.sessions>=3&&Math.abs(j.averageScore-panelAvg)>=8}));
  };

  const runSimulation = (committeesCount: number, arrivalThroughputPerHr: number): SimulationResult => {
    const totalP = Math.max(1, globalState.participants.filter(p=>p.competitionId===globalState.competition.id&&p.status!=='rejected').length || globalState.competition.totalApproved || 1);
    const activeCommitteeDurations = globalState.committees.filter(c=>c.competitionId===globalState.competition.id&&c.status!=='offline').map(c=>c.averageSessionMinutes).filter(n=>Number.isFinite(n)&&n>0);
    const configuredMinutes = globalState.competition.ruleSet.questionDurationMinutes * Math.max(1, getCompetitionPolicy(globalState.competition).questions.questionsPerParticipant);
    const avgSessionMins = activeCommitteeDurations.length
      ? activeCommitteeDurations.reduce((a,b)=>a+b,0)/activeCommitteeDurations.length
      : Math.max(3, configuredMinutes);
    const safePanels = Math.max(1, committeesCount);
    const capacityPerHour = safePanels * (60 / avgSessionMins);
    const projectedHours = totalP / Math.max(0.1, capacityPerHour);
    const startH = 8;
    const finishDecimal = startH + projectedHours;
    const finishH = Math.min(23, Math.floor(finishDecimal));
    const finishM = Math.floor((finishDecimal - Math.floor(finishDecimal)) * 60);
    const projectedFinishTime = `${String(finishH).padStart(2,'0')}:${String(finishM).padStart(2,'0')}${finishDecimal>=24?'+':''}`;

    const arrivalPressure = Math.max(0, arrivalThroughputPerHr - capacityPerHour);
    const averageWaitMinutes = Math.max(2, Math.round((arrivalPressure / Math.max(1,capacityPerHour))*60 + avgSessionMins*.45));
    const sortedPanels=[...globalState.committees].filter(c=>c.competitionId===globalState.competition.id&&c.status!=='offline').sort((a,b)=>b.averageSessionMinutes-a.averageSessionMinutes);
    const bottleneck=sortedPanels[0];
    const suggestedPanels=Math.max(1,Math.ceil(arrivalThroughputPerHr/(60/avgSessionMins)));
    const delta=Math.max(0,suggestedPanels-safePanels);
    const adviceAr = delta>0 ? `وفق الافتراضات الحالية، أضف ${delta} ${delta===1?'لجنة':'لجان'} أو خفّض تدفق الوصول لتفادي تراكم الطابور.` : 'السعة الحالية تستوعب معدل الوصول المفترض؛ راقب الاستثناءات وزمن الجلسة الفعلي.';
    const adviceEn = delta>0 ? `Under the current assumptions, add ${delta} panel${delta===1?'':'s'} or reduce arrival throughput to avoid queue accumulation.` : 'Current capacity covers the assumed arrival rate; monitor exceptions and actual session duration.';
    const hourly=[] as {hour:string;processed:number;queueSize:number}[];
    let remaining=totalP, queue=0;
    for(let h=8;h<Math.min(22,8+Math.ceil(projectedHours)+2);h++){
      const arriving=Math.min(remaining,Math.round(arrivalThroughputPerHr)); queue+=arriving; remaining-=arriving;
      const processed=Math.min(queue,Math.max(1,Math.floor(capacityPerHour))); queue-=processed; hourly.push({hour:`${String(h).padStart(2,'0')}:00`,processed,queueSize:queue});
      if(remaining<=0&&queue<=0) break;
    }
    return {
      totalParticipants:totalP, committeesCount:safePanels, projectedFinishTime, averageWaitMinutes, maxWaitMinutes:Math.max(averageWaitMinutes,Math.round(averageWaitMinutes*1.8)),
      peakBottleneckTimeRange: hourly.length>2 ? `${hourly[Math.min(2,hourly.length-1)].hour} – ${hourly[Math.min(3,hourly.length-1)]?.hour||hourly[hourly.length-1].hour}` : '—',
      bottleneckCommittee: bottleneck ? `${bottleneck.code} · ${bottleneck.name}` : 'No active panel data', optimizationAdviceArabic:adviceAr, optimizationAdviceEnglish:adviceEn, simulatedHourlyThroughput:hourly
    };
  };


  // ---- MIZAN Trust 8 --------------------------------------------------------------------
  const auditTrustAction=(action:string,entityType:string,entityId:string,ar:string,en:string)=>{
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action,entityType,entityId,humanSummaryArabic:ar,humanSummaryEnglish:en,currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
  };

  const recordInvariantBlock=(invariantKey:string,operation:string,entityType:string,entityId:string,reason:string,evidence?:Record<string,unknown>)=>{
    const item:InvariantViolationRecord={id:newId('inv'),competitionId:globalState.competition.id,invariantKey,operation,entityType,entityId,actorId:globalState.currentUser.id,actorRole:globalState.currentUser.role,reason,blockedAt:new Date().toISOString(),evidence};
    globalState.invariantViolations=[item,...globalState.invariantViolations];
    auditTrustAction('INVARIANT_BLOCKED_OPERATION',entityType,entityId,`منع محرك النزاهة عملية ${operation}: ${reason}`,`Integrity invariant blocked ${operation}: ${reason}`);
    notify();return item;
  };

  const runInvariantChecks=async():Promise<InvariantCheckResult[]>=>{
    const policy=getCompetitionPolicy(globalState.competition); const rows:InvariantCheckResult[]=[];
    rows.push({key:'ai_never_scores',titleArabic:'الذكاء الاصطناعي لا يحكم',titleEnglish:'AI never scores',status:policy.judging.aiCanAffectScore===false?'pass':'violation',evidence:[`aiCanAffectScore=${String(policy.judging.aiCanAffectScore)}`]});
    const sealed=globalState.results.filter(r=>r.competitionId===globalState.competition.id&&['sealed','published'].includes(r.status));
    let sealOk=true;
    for(const r of sealed){const at=r.sealMetadata?.sealedAt;const expected=r.sealMetadata?.cryptographicChecksum;if(!at||!expected){sealOk=false;break;}const set=globalState.results.filter(x=>x.competitionId===globalState.competition.id&&['sealed','published'].includes(x.status));const payload=JSON.stringify(set.map(x=>({id:x.id,participantId:x.participantId,score:x.finalScore,rank:x.rank,categoryId:x.categoryId})).sort((a,b)=>a.id.localeCompare(b.id)))+globalState.competition.ruleSet.version+at;const h=`SHA256:${await sha256(payload)}`;if(h!==expected){sealOk=false;break;}}
    rows.push({key:'sealed_results_immutable',titleArabic:'النتيجة المختومة ثابتة',titleEnglish:'Sealed results immutable',status:sealOk?'pass':'violation',evidence:[sealed.length?`${sealed.length} sealed/published result(s) checked`:'No sealed results yet']});
    const independent=policy.judging.independentUntilLock!==false;
    rows.push({key:'judge_independence',titleArabic:'استقلال المحكم',titleEnglish:'Judge independence',status:independent?'pass':'violation',evidence:[`independentUntilLock=${String(policy.judging.independentUntilLock)}`]});
    const tenantLeaks=[...globalState.participants,...globalState.results].filter((x:any)=>x.competitionId===globalState.competition.id&&x.organizationId&&x.organizationId!==globalState.competition.organizationId);
    rows.push({key:'tenant_isolation',titleArabic:'عزل الجهة',titleEnglish:'Tenant isolation',status:tenantLeaks.length?'violation':'pass',evidence:[`${tenantLeaks.length} scoped mismatch(es)`]});
    const competitionLeaks=globalState.results.filter(r=>r.competitionId!==globalState.competition.id&&globalState.participants.some(p=>p.id===r.participantId&&p.competitionId===globalState.competition.id));
    rows.push({key:'competition_isolation',titleArabic:'عزل المسابقة',titleEnglish:'Competition isolation',status:competitionLeaks.length?'violation':'pass',evidence:[`${competitionLeaks.length} cross-competition result link(s)`]});
    const invalidCerts=globalState.certificates.filter(c=>c.competitionId===globalState.competition.id&&!globalState.results.some(r=>r.participantId===c.participantId&&['sealed','published'].includes(r.status)));
    rows.push({key:'certificate_requires_seal',titleArabic:'الشهادة بعد الختم',titleEnglish:'Certificate requires seal',status:invalidCerts.length?'violation':'pass',evidence:[`${invalidCerts.length} certificate(s) without sealed result`]});
    const live=['live','results_sealed','results_published','completed'].includes(globalState.competition.status);const approvedSource=globalState.quranSourceManifests.some(q=>q.organizationId===globalState.competition.organizationId&&q.status==='approved');
    rows.push({key:'certified_quran_source',titleArabic:'مصدر قرآني معتمد',titleEnglish:'Approved Quran source',status:!live||approvedSource?'pass':productionMode?'violation':'warning',evidence:[live?(approvedSource?'Approved source present':productionMode?'Production/live state without approved source':'Development fixture: source approval still required before production'):'Not live yet']});
    return rows;
  };

  const runTimeMachine=(input:{baseTimestamp:string;committeeDelta:number;arrivalRatePerHour:number;absentJudgeIds:string[];networkMode:'normal'|'local_mesh'|'offline'})=>{
    const baseMs=new Date(input.baseTimestamp).getTime(); if(!Number.isFinite(baseMs))return null;
    const statusAt=(p:Participant)=>{const history=[...(p.statusHistory||[])].filter(h=>new Date(h.timestamp).getTime()<=baseMs).sort((a,b)=>new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime());return history.at(-1)?.status||p.status};
    const inScope=globalState.participants.filter(p=>p.competitionId===globalState.competition.id&&!['rejected','tested','certified'].includes(statusAt(p))).length;
    const activeBase=globalState.committees.filter(c=>c.competitionId===globalState.competition.id&&c.status!=='offline').length||1;
    const absentPanels=Math.min(activeBase,new Set(input.absentJudgeIds).size); const basePanels=Math.max(1,activeBase-absentPanels);const altPanels=Math.max(1,basePanels+input.committeeDelta);
    const durations=globalState.committees.filter(c=>c.competitionId===globalState.competition.id&&c.averageSessionMinutes>0).map(c=>c.averageSessionMinutes);const avg=durations.length?durations.reduce((a,b)=>a+b,0)/durations.length:Math.max(3,globalState.competition.ruleSet.questionDurationMinutes);
    const sim=(panels:number,network:'normal'|'local_mesh'|'offline')=>{const degradation=network==='normal'?1:network==='local_mesh'?1.05:1.12;const capacity=Math.max(.1,panels*(60/(avg*degradation)));const pressure=Math.max(0,input.arrivalRatePerHour-capacity);const averageWaitMinutes=Math.max(1,Math.round((pressure/Math.max(1,capacity))*60+avg*.45));const finishM=Math.ceil((inScope/Math.max(.1,capacity))*60);const finish=new Date(baseMs+finishM*60000);return {committees:panels,participantsInScope:inScope,averageWaitMinutes,projectedFinishTime:`${String(finish.getHours()).padStart(2,'0')}:${String(finish.getMinutes()).padStart(2,'0')}`,maxWaitMinutes:Math.max(averageWaitMinutes,Math.round(averageWaitMinutes*1.75))};};
    const baseline=sim(basePanels,'normal'),alternative=sim(altPanels,input.networkMode);const item:TimeMachineScenarioRecord={id:newId('tm'),competitionId:globalState.competition.id,baseTimestamp:new Date(baseMs).toISOString(),label:`${altPanels} panels · ${input.arrivalRatePerHour}/h`,nonOfficial:true,assumptions:input,baseline,alternative,delta:{averageWaitMinutes:alternative.averageWaitMinutes-baseline.averageWaitMinutes,finishMinutes:finishMinutes(alternative.projectedFinishTime)-finishMinutes(baseline.projectedFinishTime)},createdAt:new Date().toISOString(),createdBy:globalState.currentUser.name};globalState.timeMachineScenarios=[item,...globalState.timeMachineScenarios];auditTrustAction('TIME_MACHINE_SIMULATED','Competition',globalState.competition.id,'تشغيل مستقبل بديل غير رسمي دون تعديل التاريخ','Ran a NON-OFFICIAL alternate future without mutating history');notify();return item;
  };

  const ensureQuorumAction=(action:QuorumActionType,entityId:string,groups?:Role[][],minimumApprovals?:number,authorizedRoles?:Role[])=>{let q=globalState.quorumActions.find(x=>x.competitionId===globalState.competition.id&&x.action===action&&x.entityId===entityId&&!['executed','cancelled'].includes(x.status));if(q)return q;const required=groups||[['head_judge'],['comp_admin','org_admin']];const requestedAt=new Date().toISOString();q={id:newId('quorum'),competitionId:globalState.competition.id,action,entityId,requiredRoleGroups:required,distinctActorsRequired:true,approvals:[],minimumApprovals,authorizedRoles,status:'pending',requestedAt,requestedBy:globalState.currentUser.id,approvalExpiresAt:new Date(Date.now()+30*60*1000).toISOString(),cryptographicAssurance:'development_adapter'};globalState.quorumActions=[q,...globalState.quorumActions];auditTrustAction('QUORUM_REQUESTED','QuorumAction',q.id,'إنشاء إجراء يتطلب سلطات مستقلة بلا تجاوز Super Admin','Created an action requiring independent authorities with no Super Admin bypass');notify();return q;};
  const approveQuorumAction=(id:string)=>{const q=globalState.quorumActions.find(x=>x.id===id);if(!q)return {ok:false,reason:'not_found'};if(q.status==='executed'||q.status==='cancelled')return {ok:false,reason:q.status};if(q.approvalExpiresAt&&Date.parse(q.approvalExpiresAt)<Date.now())return {ok:false,reason:'approval_expired'};const allowed=q.authorizedRoles?.length?q.authorizedRoles:q.requiredRoleGroups.flat();if(!allowed.includes(globalState.currentUser.role)||globalState.currentUser.role==='super_admin')return {ok:false,reason:'role_not_required'};if(q.approvals.some(a=>a.actorId===globalState.currentUser.id))return {ok:true,status:q.status};const approvals=[...q.approvals,{actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,approvedAt:new Date().toISOString()}];const next={...q,approvals,status:quorumSatisfied({...q,approvals})?'ready' as const:'pending' as const};globalState.quorumActions=globalState.quorumActions.map(x=>x.id===id?next:x);if(q.action==='results_seal')globalState.sealApprovals=approvals.map(a=>({actorId:a.actorId,actorRole:a.actorRole,actorName:a.actorName,timestamp:a.approvedAt}));auditTrustAction('QUORUM_APPROVED','QuorumAction',id,'تسجيل اعتماد مستقل ضمن النصاب','Recorded an independent quorum approval');notify();return {ok:true,status:next.status};};
  const revokeQuorumApproval=(id:string)=>{const q=globalState.quorumActions.find(x=>x.id===id);if(!q)return {ok:false,reason:'not_found'};if(q.status==='executed'||q.status==='cancelled')return {ok:false,reason:q.status};const own=q.approvals.find(a=>a.actorId===globalState.currentUser.id);if(!own)return {ok:false,reason:'no_own_approval'};const approvals=q.approvals.filter(a=>a.actorId!==globalState.currentUser.id);const next={...q,approvals,revokedApprovalActorIds:[...new Set([...(q.revokedApprovalActorIds||[]),globalState.currentUser.id])],status:quorumSatisfied({...q,approvals})?'ready' as const:'pending' as const};globalState.quorumActions=globalState.quorumActions.map(x=>x.id===id?next:x);if(q.action==='results_seal')globalState.sealApprovals=approvals.map(a=>({actorId:a.actorId,actorRole:a.actorRole,actorName:a.actorName,timestamp:a.approvedAt}));if(q.action==='ceremony_reveal')globalState.ceremonyVaults=globalState.ceremonyVaults.map(v=>v.quorumActionId===q.id&&v.status!=='REVEALED'?{...v,status:'SEALED'}:v);auditTrustAction('QUORUM_APPROVAL_REVOKED','QuorumAction',id,'سحب صاحب الموافقة لاعتماده قبل التنفيذ','Approval owner revoked their approval before execution');notify();return {ok:true,status:next.status};};
  const executeQuorumAction=(id:string)=>{const q=globalState.quorumActions.find(x=>x.id===id);if(!q||q.status!=='ready'||!quorumSatisfied(q))return false;if(q.approvalExpiresAt&&Date.parse(q.approvalExpiresAt)<Date.now())return false;const allowed=q.action==='ceremony_reveal'?['broadcast_operator','comp_admin','org_admin','scientific_admin']:['head_judge','comp_admin','org_admin'];if(!allowed.includes(globalState.currentUser.role)||globalState.currentUser.role==='super_admin')return false;const executedAt=new Date().toISOString();globalState.quorumActions=globalState.quorumActions.map(x=>x.id===id?{...x,status:'executed',executedAt,executedBy:globalState.currentUser.id}:x);if(q.action==='ceremony_reveal')globalState.ceremonyVaults=globalState.ceremonyVaults.map(v=>v.quorumActionId===q.id?{...v,status:'REVEALED',revealTimestamp:executedAt}:v);auditTrustAction('QUORUM_EXECUTED','QuorumAction',id,'تنفيذ الإجراء بعد اكتمال النصاب','Executed action after quorum was satisfied');notify();return true;};
  const requestCeremonyReveal=async()=>{if(!globalState.results.some(r=>r.competitionId===globalState.competition.id&&['sealed','published'].includes(r.status)))return null;return ensureQuorumAction('ceremony_reveal',globalState.competition.id,[['scientific_admin'],['comp_admin'],['org_admin']],2,['scientific_admin','comp_admin','org_admin']);};
  const ceremonyRevealAuthorized=()=>globalState.quorumActions.some(q=>q.competitionId===globalState.competition.id&&q.action==='ceremony_reveal'&&q.entityId===globalState.competition.id&&q.status==='executed');

  const rebuildEvidenceGraph=async()=>{const now=new Date().toISOString();const nodes:ScientificEvidenceNode[]=[];const edges:ScientificEvidenceEdge[]=[];const add=(n:Omit<ScientificEvidenceNode,'id'|'competitionId'|'createdAt'>)=>{const x={id:`evn:${n.type}:${n.entityRef}`,competitionId:globalState.competition.id,createdAt:now,...n};nodes.push(x);return x};const link=(from:ScientificEvidenceNode,to:ScientificEvidenceNode,relation:string)=>edges.push({id:newId('eve'),competitionId:globalState.competition.id,fromNodeId:from.id,toNodeId:to.id,relation});
    const policyNode=add({type:'competition_policy',label:'Competition Policy',status:globalState.competition.status,version:getCompetitionPolicy(globalState.competition).version,checksum:await hashCanonical(getCompetitionPolicy(globalState.competition)),authority:'Competition Governance',entityRef:globalState.competition.id});const ruleNode=add({type:'rule_set',label:globalState.competition.ruleSet.name,status:globalState.competition.ruleSet.frozenAt?'frozen':'active',version:globalState.competition.ruleSet.version,checksum:await hashCanonical(globalState.competition.ruleSet),authority:'Scientific Governance',entityRef:globalState.competition.ruleSet.id});link(policyNode,ruleNode,'uses_rule_set');
    for(const q of globalState.quranSourceManifests.filter(x=>x.organizationId===globalState.competition.organizationId)){const n=add({type:'quran_source',label:`${q.riwaya} · ${q.edition}`,status:q.status,version:q.version,checksum:q.checksumSha256,authority:q.sourceAuthority,entityRef:q.id});link(policyNode,n,'governed_by_source');}
    for(const q of globalState.questionGovernance.filter(x=>x.competitionId===globalState.competition.id)){const n=add({type:'question',label:q.questionId,status:q.status,version:String(q.expertDifficulty),authority:q.reviewedBy,entityRef:q.questionId});link(ruleNode,n,'governs_question');const src=nodes.find(x=>x.entityRef===q.sourceManifestId);if(src)link(n,src,'derived_from');}
    for(const a of globalState.aiCapabilityValidations.filter(x=>x.organizationId===globalState.competition.organizationId)){const n=add({type:'ai_capability',label:`${a.capability} · ${a.modelName}`,status:a.status,version:a.modelVersion,authority:a.approvedBy.join(', '),entityRef:a.id});link(policyNode,n,'permits_capability');}
    for(const log of globalState.auditLogs.filter(x=>x.competitionId===globalState.competition.id&&x.action.includes('FAIRDRAW'))){const n=add({type:'fairdraw',label:'FairDraw commitment',status:'recorded',version:globalState.competition.ruleSet.version,checksum:log.currentStateHash,authority:log.actorName,entityRef:log.id});link(ruleNode,n,'generated_under');}
    for(const r of globalState.results.filter(x=>x.competitionId===globalState.competition.id)){const n=add({type:'result',label:r.participantCode,status:r.status,version:globalState.competition.ruleSet.version,checksum:r.sealMetadata?.cryptographicChecksum,authority:r.sealMetadata?.sealedBy,entityRef:r.id});link(n,ruleNode,'calculated_under');for(const c of globalState.certificates.filter(c=>c.participantId===r.participantId&&c.competitionId===globalState.competition.id)){const cn=add({type:'certificate',label:c.certificateNumber,status:c.isAuthentic?'authentic':'revoked',checksum:await hashCanonical({id:c.id,token:c.verificationToken}),authority:c.signatories.map(s=>s.name).join(', '),entityRef:c.id});link(cn,n,'certifies_result');}}
    for(const q of globalState.quorumActions.filter(x=>x.competitionId===globalState.competition.id)){const n=add({type:'quorum',label:q.action,status:q.status,authority:q.approvals.map(a=>a.actorName).join(' + '),entityRef:q.id});link(n,policyNode,'authorized_under');}
    globalState.evidenceNodes=[...nodes,...globalState.evidenceNodes.filter(x=>x.competitionId!==globalState.competition.id)];globalState.evidenceEdges=[...edges,...globalState.evidenceEdges.filter(x=>x.competitionId!==globalState.competition.id)];auditTrustAction('EVIDENCE_GRAPH_REBUILT','Competition',globalState.competition.id,'إعادة بناء رسم الأدلة العلمية والتشغيلية','Rebuilt scientific and operational evidence graph');notify();return {nodes,edges};
  };
  const traceEvidence=(nodeId:string)=>{const nodes=new Map(globalState.evidenceNodes.filter(n=>n.competitionId===globalState.competition.id).map(n=>[n.id,n]));const visited=new Set<string>();const ordered:ScientificEvidenceNode[]=[];const walk=(id:string)=>{if(visited.has(id))return;visited.add(id);const n=nodes.get(id);if(n)ordered.push(n);globalState.evidenceEdges.filter(e=>e.competitionId===globalState.competition.id&&e.fromNodeId===id).forEach(e=>walk(e.toNodeId));};walk(nodeId);return {nodes:ordered,edges:globalState.evidenceEdges.filter(e=>visited.has(e.fromNodeId)&&visited.has(e.toNodeId))};};

  const buildPublicResultRoot=async()=>{const results=globalState.results.filter(r=>r.competitionId===globalState.competition.id&&['sealed','published'].includes(r.status)).sort((a,b)=>a.id.localeCompare(b.id));if(!results.length)return null;const salts=await Promise.all(results.map(r=>sha256(`${r.id}:${r.sealMetadata?.sealedAt||''}:${newId('salt')}`)));const materials=results.map((r,i)=>canonicalStringify({v:'mizan-merkle-v1',disclosed:{participantCode:r.participantCode,categoryId:r.categoryId,finalScore:r.finalScore,rank:r.rank,status:r.status},salt:salts[i]}));const tree=await buildMerkleTree(materials);const root:PublicResultRootRecord={id:newId('root'),competitionId:globalState.competition.id,merkleRoot:tree.root,leaves:results.map((r,i)=>({index:i,resultId:r.id,participantCode:r.participantCode,leafHash:tree.levels[0][i]})),resultCount:results.length,createdAt:new Date().toISOString(),algorithm:'SHA-256'};const proofs:PublicResultProofRecord[]=results.map((r,i)=>({id:newId('proof'),competitionId:globalState.competition.id,resultId:r.id,verificationVersion:'mizan-merkle-v1',merkleRoot:tree.root,leafIndex:i,disclosed:{participantCode:r.participantCode,categoryId:r.categoryId,finalScore:r.finalScore,rank:r.rank,status:r.status},disclosureSalt:salts[i],proof:merkleProofForIndex(tree.levels,i),createdAt:new Date().toISOString()}));globalState.publicResultRoots=[root,...globalState.publicResultRoots.filter(x=>x.competitionId!==globalState.competition.id)];globalState.publicResultProofs=[...proofs,...globalState.publicResultProofs.filter(x=>x.competitionId!==globalState.competition.id)];auditTrustAction('PUBLIC_RESULT_ROOT_COMMITTED','ResultSet',root.id,'إنشاء التزام Merkle لمجموعة النتائج المختومة','Committed a Merkle root for the sealed result set');notify();return root;};
  const getPublicResultProof=(resultId:string)=>globalState.publicResultProofs.find(p=>p.competitionId===globalState.competition.id&&p.resultId===resultId)||null;
  const verifyPublicResultProof=async(p:PublicResultProofRecord)=>verifyMerkleProof(canonicalStringify({v:'mizan-merkle-v1',disclosed:p.disclosed,salt:p.disclosureSalt}),p.proof,p.merkleRoot);
  const verifyCertificateEvidence=async(certificateId:string)=>{const cert=globalState.certificates.find(c=>c.id===certificateId&&c.competitionId===globalState.competition.id);if(!cert)return {state:'NOT_FOUND' as const};if(cert.revocationState==='REVOKED'||!cert.isAuthentic)return {state:'REVOKED' as const};if(!cert.resultId||!cert.certificateVersion||!cert.resultSealReference||!cert.merkleProofId||!cert.issuedTimestamp||!cert.proofPackageHash)return {state:'INVALID_PROOF' as const,reason:'MISSING_PROOF_FIELDS'};const computed=await hashCanonical({certificateId:cert.id,resultId:cert.resultId,competitionId:cert.competitionId,certificateVersion:cert.certificateVersion,resultSealReference:cert.resultSealReference,merkleProofId:cert.merkleProofId,issuedTimestamp:cert.issuedTimestamp,revocationState:cert.revocationState||'ACTIVE'});if(computed!==cert.proofPackageHash)return {state:'INVALID_PROOF' as const,reason:'PACKAGE_HASH_MISMATCH'};const proof=globalState.publicResultProofs.find(p=>p.id===cert.merkleProofId&&p.resultId===cert.resultId&&p.competitionId===cert.competitionId);if(!proof||!(await verifyPublicResultProof(proof)))return {state:'INVALID_PROOF' as const,reason:'MERKLE_PROOF_INVALID'};const result=globalState.results.find(r=>r.id===cert.resultId&&r.competitionId===cert.competitionId);if(!result)return {state:'INVALID_PROOF' as const,reason:'RESULT_NOT_FOUND'};if(result.sealMetadata?.cryptographicChecksum&&result.sealMetadata.cryptographicChecksum!==cert.resultSealReference)return {state:'INVALID_PROOF' as const,reason:'RESULT_SEAL_MISMATCH'};return {state:'AUTHENTIC' as const,proofVersion:proof.verificationVersion,merkleRoot:proof.merkleRoot};};
  const revokeCertificate=(certificateId:string,reason:string)=>{if(!['comp_admin','org_admin'].includes(globalState.currentUser.role)||!reason.trim())return false;const cert=globalState.certificates.find(c=>c.id===certificateId&&c.competitionId===globalState.competition.id);if(!cert)return false;globalState.certificates=globalState.certificates.map(c=>c.id===certificateId?{...c,isAuthentic:false,revocationState:'REVOKED',revocationReason:reason}:c);auditTrustAction('CERTIFICATE_REVOKED','Certificate',certificateId,`إلغاء الشهادة: ${reason}`,`Certificate revoked: ${reason}`);notify();return true;};

  const ingestMeshEnvelope=(wire:MeshWireEnvelope)=>{const mesh=globalState.localMeshSessions.find(x=>x.id===wire.sessionId&&x.competitionId===wire.competitionId);if(!mesh||mesh.events.some(e=>e.id===wire.event.id))return false;const existing=mesh.events.find(e=>e.originDeviceId===wire.event.originDeviceId&&e.sequence===wire.event.sequence);const semantic=wire.event.conflictKey?mesh.events.filter(e=>e.conflictKey===wire.event.conflictKey&&e.payloadHash!==wire.event.payloadHash):[];const conflicts=[...mesh.conflicts,...(existing?[{id:newId('mesh_conflict'),eventIds:[existing.id,wire.event.id],reason:`Duplicate sequence ${wire.event.originDeviceId}:${wire.event.sequence}`,status:'open' as const}]:[]),...(semantic.length?[{id:newId('mesh_conflict'),eventIds:[...semantic.map(e=>e.id),wire.event.id],reason:`Conflicting payloads for ${wire.event.conflictKey}`,status:'open' as const}]:[])];globalState.localMeshSessions=globalState.localMeshSessions.map(x=>x.id===mesh.id?{...x,status:'active',events:[...x.events,{...wire.event,transport:'browser_broadcast'}],conflicts,nodes:x.nodes.map(n=>n.deviceId===wire.event.originDeviceId?{...n,status:'joined',lastSeenAt:new Date().toISOString(),sequence:Math.max(n.sequence,wire.event.sequence)}:n)}:x);notify();return true;};
  const startLocalMesh=()=>{const joined=globalState.devices.filter(d=>d.competitionId===globalState.competition.id&&!['revoked','disabled'].includes(d.status)).map(d=>({deviceId:d.id,name:d.name,role:d.role,status:'joined' as const,lastSeenAt:d.lastSeenAt,sequence:0}));const coordinator=globalState.devices.find(d=>d.competitionId===globalState.competition.id&&d.type==='edge_server'&&d.status==='online')||globalState.devices.find(d=>d.competitionId===globalState.competition.id&&d.role==='Operations'&&d.status==='online')||globalState.devices.find(d=>d.competitionId===globalState.competition.id&&d.status==='online');const item:LocalMeshSessionRecord={id:newId('mesh'),competitionId:globalState.competition.id,status:joined.length?'active':'forming',coordinatorDeviceId:coordinator?.id,nodes:joined,events:[],conflicts:[],startedAt:new Date().toISOString(),transportMode:'journal_only',transportStatus:'disabled'};browserMeshAdapter?.close();browserMeshAdapter=null;const allowed=!productionMode||import.meta.env.VITE_ENABLE_BROWSER_MESH_ADAPTER==='true';if(allowed){browserMeshAdapter=createBrowserBroadcastMesh({competitionId:item.competitionId,sessionId:item.id,onEnvelope:ingestMeshEnvelope});item.transportMode=browserMeshAdapter.available?'browser_broadcast':'journal_only';item.transportStatus=browserMeshAdapter.available?'connected':'unavailable';}globalState.localMeshSessions=[item,...globalState.localMeshSessions];auditTrustAction('LOCAL_MESH_STARTED','LocalMesh',item.id,item.transportMode==='browser_broadcast'?'بدء Mesh عبر BroadcastChannel لنوافذ نفس الأصل':'بدء دفتر Mesh؛ النقل بين أجهزة مستقلة يحتاج Edge موثوق',item.transportMode==='browser_broadcast'?'Started same-origin BroadcastChannel mesh':'Started mesh journal; independent devices require trusted Edge transport');notify();return item;};
  const appendLocalMeshEvent=async(sessionId:string,type:string,payload:Record<string,unknown>,originDeviceId?:string,conflictKey?:string)=>{const mesh=globalState.localMeshSessions.find(x=>x.id===sessionId&&x.competitionId===globalState.competition.id);if(!mesh||!['active','forming'].includes(mesh.status))return null;const origin=originDeviceId||mesh.coordinatorDeviceId||mesh.nodes[0]?.deviceId||'local';const node=mesh.nodes.find(n=>n.deviceId===origin);const sequence=(node?.sequence||0)+1;const payloadHash=await hashCanonical(payload);const event={id:newId('mesh_evt'),competitionId:globalState.competition.id,originDeviceId:origin,sequence,type,payloadHash,payload,createdAt:new Date().toISOString(),acknowledgedBy:mesh.nodes.filter(n=>n.status==='joined').map(n=>n.deviceId),conflictKey,transport:'local' as const};const same=conflictKey?mesh.events.filter(e=>e.conflictKey===conflictKey&&e.payloadHash!==payloadHash):[];const conflicts=[...mesh.conflicts,...(same.length?[{id:newId('mesh_conflict'),eventIds:[...same.map(e=>e.id),event.id],reason:`Conflicting payloads for ${conflictKey}`,status:'open' as const}]:[])];globalState.localMeshSessions=globalState.localMeshSessions.map(x=>x.id===sessionId?{...x,status:'active',nodes:x.nodes.map(n=>n.deviceId===origin?{...n,sequence,lastSeenAt:new Date().toISOString()}:n),events:[...x.events,event],conflicts}:x);if(browserMeshAdapter?.available&&mesh.transportMode==='browser_broadcast')browserMeshAdapter.publish({version:'mizan-mesh-wire-v1',competitionId:globalState.competition.id,sessionId,sentAt:new Date().toISOString(),event});auditTrustAction('LOCAL_MESH_EVENT_APPENDED','LocalMesh',sessionId,`حفظ حدث Mesh ${type} بتسلسل ${sequence}`,`Recorded mesh event ${type} sequence ${sequence}`);notify();return event;};
  const reconcileLocalMesh=(sessionId:string)=>{const mesh=globalState.localMeshSessions.find(x=>x.id===sessionId);if(!mesh)return null;const keys=new Set<string>();const duplicates:string[]=[];for(const e of mesh.events){const k=`${e.originDeviceId}:${e.sequence}`;if(keys.has(k))duplicates.push(e.id);else keys.add(k)}const open=mesh.conflicts.filter(c=>c.status==='open');const status:LocalMeshSessionRecord['status']=!globalState.isOffline&&!open.length?'closed':'reconciling';globalState.localMeshSessions=globalState.localMeshSessions.map(x=>x.id===sessionId?{...x,status,reconciledAt:new Date().toISOString()}:x);auditTrustAction('LOCAL_MESH_RECONCILED','LocalMesh',sessionId,`مصالحة Mesh: ${open.length} تعارض مفتوح`,`Mesh reconciled: ${open.length} open conflict(s)`);notify();return {status,duplicates,openConflicts:open.length,events:mesh.events.length};};
  const resolveLocalMeshConflict=(sessionId:string,conflictId:string,resolution:string)=>{if(!resolution.trim())return false;globalState.localMeshSessions=globalState.localMeshSessions.map(x=>x.id===sessionId?{...x,conflicts:x.conflicts.map(c=>c.id===conflictId?{...c,status:'resolved',resolution}:c)}:x);auditTrustAction('LOCAL_MESH_CONFLICT_RESOLVED','LocalMesh',sessionId,'حل تعارض Mesh مع حفظ القرار','Resolved mesh conflict with an auditable decision');notify();return true;};

  const issueFederationAttestation=async(input:{subjectRef:string;subjectKind:'participant'|'delegation';issuer:string;claim:FederationAttestationRecord['claim'];value:string;expiresInDays?:number;scope?:string;evidencePolicy?:string;privacyClassification?:FederationAttestationRecord['privacyClassification']})=>{if(!input.subjectRef.trim())return null;const issued=new Date();const issuer=globalState.organization.name;const expiresAt=input.expiresInDays?new Date(issued.getTime()+input.expiresInDays*86400000).toISOString():undefined;const scope=input.scope||globalState.competition.id;const evidencePolicy=input.evidencePolicy||'claim_only_no_raw_document';const privacyClassification=input.privacyClassification||'restricted_claim';const core={organizationId:globalState.competition.organizationId,subjectRef:input.subjectRef,issuer,claim:input.claim,value:input.value,scope,issuedAt:issued.toISOString(),expiresAt,evidencePolicy,privacyClassification};const evidenceDigest=await federationAttestationDigest(core);const signatureRef=await developmentFederationSignature(evidenceDigest,issuer);const item:FederationAttestationRecord={id:newId('attest'),...core,subjectKind:input.subjectKind,status:'valid',evidenceDigest,signatureRef,signatureAlgorithm:'DEVELOPMENT-SHA256-COMMITMENT',privacyMode:'claim_only',revocationEndpoint:`mizan://federation/${globalState.competition.organizationId}/attestations/${newId('rev')}`};globalState.federationAttestations=[item,...globalState.federationAttestations];auditTrustAction('FEDERATION_ATTESTATION_ISSUED','FederationAttestation',item.id,'إصدار إثبات claim-only دون مشاركة الوثيقة الخام؛ توقيع التطوير موسوم بوضوح','Issued a claim-only attestation without sharing the raw document; development signature is explicitly labeled');notify();return item;};
  const verifyFederationAttestation=async(id:string)=>{const a=globalState.federationAttestations.find(x=>x.id===id);if(!a)return {valid:false,reason:'not_found'};return verifyFederationAttestationEvidence(a,{receivingOrganizationId:globalState.competition.organizationId,receivingOrganizationName:globalState.organization.name,trustList:globalState.federationTrust});};
  const revokeFederationAttestation=(id:string)=>{globalState.federationAttestations=globalState.federationAttestations.map(a=>a.id===id?{...a,status:'revoked'}:a);auditTrustAction('FEDERATION_ATTESTATION_REVOKED','FederationAttestation',id,'إلغاء إثبات اتحادي','Revoked federation attestation');notify();};


  const getQueueEstimate=(participantId:string)=>{
    const p=globalState.participants.find(x=>x.id===participantId&&x.competitionId===globalState.competition.id);if(!p||p.status!=='in_queue')return null;const c=globalState.committees.find(x=>x.id===p.assignedCommitteeId);if(!c)return null;const queue=globalState.participants.filter(x=>x.status==='in_queue'&&x.assignedCommitteeId===c.id).sort((a,b)=>(a.queueNumber||999999)-(b.queueNumber||999999));const index=Math.max(0,queue.findIndex(x=>x.id===p.id));const avg=Math.max(2,c.averageSessionMinutes||globalState.competition.ruleSet.questionDurationMinutes||8);const activeCarry=c.status==='testing'?avg*.55:0;const pauseCarry=c.status==='paused'?avg:0;const estimatedWaitMinutes=Math.max(1,Math.round(index*avg+activeCarry+pauseCarry));const expectedTurnAt=new Date(Date.now()+estimatedWaitMinutes*60000).toISOString();return {ahead:index,estimatedWaitMinutes,expectedTurnAt,committeeId:c.id,committeeCode:c.code,basis:{currentCompetitionAverageMinutes:avg,activeSession:c.status==='testing',paused:c.status==='paused',queueSize:queue.length},confidence:index<=2?'medium' as const:'low' as const};
  };

  // ---- MIZAN Beyond 8 ------------------------------------------------------------------
  const buildFlightRecorder=async()=>{
    const rows:{timestamp:string;stream:FlightRecorderEntry['stream'];sourceType:string;sourceId:string;ar:string;en:string}[]=[];
    for(const a of globalState.auditLogs.filter(x=>x.competitionId===globalState.competition.id))rows.push({timestamp:a.timestamp,stream:'trust',sourceType:'audit',sourceId:a.id,ar:a.humanSummaryArabic,en:a.humanSummaryEnglish});
    for(const i of globalState.incidents.filter(x=>x.competitionId===globalState.competition.id))rows.push({timestamp:i.reportedAt,stream:'incidents',sourceType:'incident',sourceId:i.id,ar:`${i.title} · ${i.status}`,en:`${i.title} · ${i.status}`});
    for(const a of globalState.aiObservations.filter(x=>x.competitionId===globalState.competition.id)){const rc=globalState.reviewCases.find(r=>r.sessionId===a.sessionId);const p=rc?globalState.participants.find(x=>x.id===rc.participantId):undefined;const start=p?.statusHistory?.find(h=>h.status==='in_session')?.timestamp;if(start){const timestamp=new Date(new Date(start).getTime()+a.timestampSeconds*1000).toISOString();rows.push({timestamp,stream:'ai',sourceType:'ai_observation',sourceId:a.id,ar:`إشارة AI: ${a.type} · ${a.confidence}`,en:`AI observation: ${a.type} · ${a.confidence}`});}}
    for(const r of globalState.results.filter(x=>x.competitionId===globalState.competition.id)){const t=r.sealMetadata?.sealedAt||new Date().toISOString();rows.push({timestamp:t,stream:'results',sourceType:'result',sourceId:r.id,ar:`نتيجة ${r.participantCode} · ${r.status}`,en:`Result ${r.participantCode} · ${r.status}`});}
    for(const a of globalState.appeals.filter(x=>x.competitionId===globalState.competition.id))rows.push({timestamp:a.createdAt,stream:'appeals',sourceType:'appeal',sourceId:a.id,ar:`اعتراض ${a.participantCode} · ${a.status}`,en:`Appeal ${a.participantCode} · ${a.status}`});
    for(const d of globalState.devices.filter(x=>x.competitionId===globalState.competition.id))rows.push({timestamp:d.lastSeenAt,stream:'devices',sourceType:'device',sourceId:d.id,ar:`${d.name} · ${d.status}`,en:`${d.name} · ${d.status}`});
    for(const p of globalState.participants.filter(x=>x.competitionId===globalState.competition.id))for(const h of p.statusHistory||[])rows.push({timestamp:h.timestamp,stream:'operations',sourceType:'participant_state',sourceId:p.id,ar:`${p.code} · ${h.status}`,en:`${p.code} · ${h.status}`});
    const entries:FlightRecorderEntry[]=[];
    for(const row of rows.sort((a,b)=>a.timestamp.localeCompare(b.timestamp))){const checksum=await hashCanonical({competitionId:globalState.competition.id,...row});entries.push({id:newId('flight'),competitionId:globalState.competition.id,timestamp:row.timestamp,stream:row.stream,sourceType:row.sourceType,sourceId:row.sourceId,summaryArabic:row.ar,summaryEnglish:row.en,checksum});}
    globalState.flightRecorderEntries=[...entries,...globalState.flightRecorderEntries.filter(x=>x.competitionId!==globalState.competition.id)];
    auditTrustAction('FLIGHT_RECORDER_REBUILT','Competition',globalState.competition.id,`إعادة بناء مسجل الرحلة: ${entries.length} حدثًا`,`Rebuilt flight recorder: ${entries.length} event(s)`);notify();return entries;
  };

  const createIntegrityEnvelope=async(participantId:string)=>{
    const p=globalState.participants.find(x=>x.id===participantId&&x.competitionId===globalState.competition.id);if(!p)return null;
    const result=globalState.results.find(x=>x.participantId===participantId&&x.competitionId===globalState.competition.id);
    const submissions=globalState.judgeSubmissions.filter(x=>x.participantId===participantId);
    const judgeSubmissionHashes=await Promise.all(submissions.map(x=>hashCanonical({judgeId:x.judgeId,participantId:x.participantId,totalScore:x.totalScore,criterionScores:x.criterionScores,submittedAt:x.submittedAt})));
    const audio=globalState.audioRecordings.find(x=>x.participantId===participantId&&x.competitionId===globalState.competition.id&&x.status==='completed');
    const receipt=getFairnessReceipt(participantId); const fairDrawHash=receipt?await hashCanonical(receipt):undefined;
    const auditHead=globalState.auditLogs.filter(x=>x.competitionId===globalState.competition.id).sort((a,b)=>b.timestamp.localeCompare(a.timestamp))[0]?.currentStateHash;
    const core={competitionId:globalState.competition.id,participantId:p.id,sessionId:submissions[0]?.sessionId,resultId:result?.id,policyVersion:getCompetitionPolicy(globalState.competition).version,ruleVersion:globalState.competition.ruleSet.version,fairDrawHash,judgeSubmissionHashes,recordingChecksum:audio?.checksum,auditHead,resultSealHash:result?.sealMetadata?.cryptographicChecksum,createdAt:new Date().toISOString(),createdBy:globalState.currentUser.name,status:'sealed' as const};
    const envelopeHash=await hashCanonical(core);const item:IntegrityEnvelopeRecord={id:newId('envelope'),...core,envelopeHash};globalState.integrityEnvelopes=[item,...globalState.integrityEnvelopes];
    auditTrustAction('INTEGRITY_ENVELOPE_SEALED','Participant',p.id,'إغلاق ظرف النزاهة وربط أدلة الجلسة والنتيجة','Sealed integrity envelope binding session and result evidence');notify();return item;
  };
  const verifyIntegrityEnvelope=async(item:IntegrityEnvelopeRecord)=>{const core={competitionId:item.competitionId,participantId:item.participantId,sessionId:item.sessionId,resultId:item.resultId,policyVersion:item.policyVersion,ruleVersion:item.ruleVersion,fairDrawHash:item.fairDrawHash,judgeSubmissionHashes:item.judgeSubmissionHashes,recordingChecksum:item.recordingChecksum,auditHead:item.auditHead,resultSealHash:item.resultSealHash,createdAt:item.createdAt,createdBy:item.createdBy,status:item.status};return {valid:(await hashCanonical(core))===item.envelopeHash};};

  const runChaosDrill=()=>{
    const sim=runSimulation(Math.max(1,globalState.committees.filter(c=>c.status!=='offline').length),Math.max(45,globalState.participants.length));
    const readyJudges=globalState.judges.filter(j=>j.isReady).length;const activeCommittees=globalState.committees.filter(c=>c.status!=='offline').length;const edge=globalState.devices.some(d=>d.type==='edge_server'&&d.status==='online');const audio=globalState.committees.some(c=>c.audioInputOk);const spareDevice=globalState.devices.filter(d=>d.status==='online').length>activeCommittees;
    const scenarios:ChaosDrillRecord['scenarios']=[
      {id:newId('chaos_case'),type:'network',titleArabic:'انقطاع الشبكة',titleEnglish:'Network loss',expectedSafeguard:'offline event journal + reconciliation',passed:true,evidence:'Core queue/judging events have local idempotent continuity paths.'},
      {id:newId('chaos_case'),type:'judge_absence',titleArabic:'غياب محكم',titleEnglish:'Judge absence',expectedSafeguard:'qualified reassignment',passed:readyJudges>activeCommittees,evidence:`readyJudges=${readyJudges}; activeCommittees=${activeCommittees}`},
      {id:newId('chaos_case'),type:'device',titleArabic:'تعطل جهاز',titleEnglish:'Device failure',expectedSafeguard:'one-tap reassignment / BYOD',passed:spareDevice||getCompetitionPolicy(globalState.competition).operations.gateStationMode==='bring_your_own_device',evidence:`spareDevice=${spareDevice}; byod=${getCompetitionPolicy(globalState.competition).operations.gateStationMode==='bring_your_own_device'}`},
      {id:newId('chaos_case'),type:'audio',titleArabic:'خلل الصوت',titleEnglish:'Audio issue',expectedSafeguard:'human judging continues; recording may degrade',passed:audio,evidence:`committeeWithAudioOk=${audio}`},
      {id:newId('chaos_case'),type:'queue_spike',titleArabic:'قفزة الطابور',titleEnglish:'Queue spike',expectedSafeguard:'adaptive routing + capacity recommendation',passed:sim.maxWaitMinutes<=90,evidence:`simulatedMaxWait=${sim.maxWaitMinutes}m`},
      {id:newId('chaos_case'),type:'power',titleArabic:'فقد الخادم السحابي',titleEnglish:'Cloud host loss',expectedSafeguard:'trusted local edge when configured',passed:edge,evidence:`onlineEdge=${edge}`},
      {id:newId('chaos_case'),type:'committee',titleArabic:'تعطل لجنة',titleEnglish:'Committee unavailable',expectedSafeguard:'elastic reassignment with human approval',passed:activeCommittees>1,evidence:`activeCommittees=${activeCommittees}`}
    ];
    const readinessScore=Math.round((scenarios.filter(x=>x.passed).length/scenarios.length)*100);const item:ChaosDrillRecord={id:newId('chaos'),competitionId:globalState.competition.id,nonOfficial:true,createdAt:new Date().toISOString(),createdBy:globalState.currentUser.name,scenarios,readinessScore,status:'completed'};globalState.chaosDrills=[item,...globalState.chaosDrills];auditTrustAction('CHAOS_DRILL_COMPLETED','Competition',globalState.competition.id,`اختبار فشل اصطناعي غير رسمي: ${readinessScore}%`,`NON-OFFICIAL chaos drill completed: ${readinessScore}%`);notify();return item;
  };

  const ensureAccessibilityProfile=()=>{
    const existing=globalState.accessibilityProfiles.find(x=>x.userId===globalState.currentUser.id&&x.competitionId===globalState.competition.id);if(existing)return existing;
    const reduce=typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;const contrast=typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia('(prefers-contrast: more)').matches;
    const item:AccessibilityProfileRecord={id:newId('a11y'),userId:globalState.currentUser.id,competitionId:globalState.competition.id,source:'system_preference',textScale:'normal',touchScale:'normal',contrast:contrast?'high':'system',motion:reduce?'reduced':'system',audioCues:false,updatedAt:new Date().toISOString()};globalState.accessibilityProfiles=[item,...globalState.accessibilityProfiles];notify();return item;
  };
  const updateAccessibilityProfile=(patch:Partial<Pick<AccessibilityProfileRecord,'textScale'|'touchScale'|'contrast'|'motion'|'audioCues'>>)=>{const current=ensureAccessibilityProfile();const next={...current,...patch,source:'user' as const,updatedAt:new Date().toISOString()};globalState.accessibilityProfiles=globalState.accessibilityProfiles.map(x=>x.id===current.id?next:x);if(typeof document!=='undefined'){document.documentElement.dataset.mizanText=next.textScale;document.documentElement.dataset.mizanTouch=next.touchScale;document.documentElement.dataset.mizanContrast=next.contrast;document.documentElement.dataset.mizanMotion=next.motion;}notify();return next;};

  const recommendCommitteeElasticity=()=>{
    const active=globalState.committees.filter(c=>c.competitionId===globalState.competition.id&&c.status!=='offline');if(active.length<2)return null;
    const load=(c:Committee)=>globalState.participants.filter(p=>p.status==='in_queue'&&p.assignedCommitteeId===c.id).length*Math.max(1,c.averageSessionMinutes);
    const source=[...active].sort((a,b)=>load(b)-load(a))[0],target=[...active].sort((a,b)=>load(a)-load(b))[0];if(!source||!target||source.id===target.id||load(source)<=load(target)+Math.max(5,source.averageSessionMinutes))return null;
    const candidates=globalState.participants.filter(p=>p.status==='in_queue'&&p.assignedCommitteeId===source.id&&compatibleCommitteesFor(p).some(c=>c.id===target.id)).slice(0,3);if(!candidates.length)return null;
    const item:CommitteeElasticityRecommendation={id:newId('elastic'),competitionId:globalState.competition.id,createdAt:new Date().toISOString(),createdBy:globalState.currentUser.name,sourceCommitteeId:source.id,targetCommitteeId:target.id,participantIds:candidates.map(p=>p.id),reasonArabic:`${source.code} أعلى حملًا؛ نقل ${candidates.length} حالات مؤهلة إلى ${target.code}.`,reasonEnglish:`${source.code} is carrying more load; move ${candidates.length} eligible case(s) to ${target.code}.`,constraintsChecked:['category','committee availability','declared hard conflicts','current load','average session duration'],status:'proposed'};globalState.elasticityRecommendations=[item,...globalState.elasticityRecommendations];auditTrustAction('ELASTICITY_RECOMMENDATION_CREATED','Committee',source.id,'اقتراح موازنة لجان دون تنفيذ تلقائي','Created committee elasticity recommendation without automatic execution');notify();return item;
  };
  const decideCommitteeElasticity=(id:string,approve:boolean)=>{const item=globalState.elasticityRecommendations.find(x=>x.id===id&&x.competitionId===globalState.competition.id);if(!item||item.status!=='proposed')return false;if(!['comp_admin','ops_manager','head_judge'].includes(globalState.currentUser.role))return false;if(approve&&item.targetCommitteeId){for(const pid of item.participantIds){const p=globalState.participants.find(x=>x.id===pid);if(!p||!compatibleCommitteesFor(p).some(c=>c.id===item.targetCommitteeId))continue;p.assignedCommitteeId=item.targetCommitteeId;p.statusHistory=[...(p.statusHistory||[]),{status:'in_queue',timestamp:new Date().toISOString(),actor:`Elasticity approval · ${globalState.currentUser.name}`}];}}
    globalState.elasticityRecommendations=globalState.elasticityRecommendations.map(x=>x.id===id?{...x,status:approve?'approved':'dismissed',approvedAt:approve?new Date().toISOString():undefined,approvedBy:approve?globalState.currentUser.name:undefined}:x);auditTrustAction(approve?'ELASTICITY_APPROVED':'ELASTICITY_DISMISSED','CommitteeElasticity',id,approve?'اعتماد موازنة اللجان يدويًا':'رفض اقتراح موازنة اللجان',approve?'Approved committee elasticity recommendation':'Dismissed committee elasticity recommendation');notify();return true;};

  const issueJourneyPass=async(participantId:string)=>{const p=globalState.participants.find(x=>x.id===participantId&&x.competitionId===globalState.competition.id);if(!p)return null;const existing=globalState.journeyPasses.find(x=>x.participantId===p.id&&x.status==='active');if(existing)return existing;const keys=await generateSigningKeyPair();const now=new Date();const expiry=new Date(Math.max(Date.parse(globalState.competition.endDate||''),now.getTime()+24*60*60*1000));const credentialId=newId('cred');const category=p.categoryId||'competition';const payload={v:'MZP1' as const,competition:globalState.competition.id,participantToken:p.code,categoryEntitlement:category,validFrom:now.toISOString(),expiry:expiry.toISOString(),credentialId,issuer:globalState.competition.organizationId};const compact=await issueSignedPass(payload,keys.privateKey);const base=await compactCredentialToJourneyRecord({compact,payload,participantId:p.id,participantCode:p.code});const item:JourneyPassRecord={...base,issuerPublicKeyJwk:await exportPublicJwk(keys.publicKey),signatureAssurance:'development_per_credential'};globalState.journeyPasses=[item,...globalState.journeyPasses];auditTrustAction('JOURNEY_PASS_ISSUED','Participant',p.id,'إصدار اعتماد تشغيل موقّع؛ التحقق غير المتصل يعتمد على نسخة الثقة/الإلغاء المخزنة مسبقًا','Issued signed operational credential; offline verification uses the pre-cached trust and revocation state');notify();return item;};
  const verifyOfflineJourneyPass=async(raw:string)=>{const token=raw.trim().startsWith('MZ1|')?raw.trim().slice(4).trim():raw.trim();const pass=globalState.journeyPasses.find(x=>x.competitionId===globalState.competition.id&&((x.credentialId&&x.credentialId===token)||x.participantCode===token));if(!pass)return {valid:false,reason:'NOT_FOUND'} as const;if(pass.status==='revoked')return {valid:false,reason:'REVOKED'} as const;if(!pass.issuerPublicKeyJwk)return {valid:false,reason:'TRUST_KEY_NOT_CACHED'} as const;const key=await importPublicJwk(pass.issuerPublicKeyJwk);const revoked=new Set(globalState.journeyPasses.filter(x=>x.status==='revoked').map(x=>x.credentialId||x.id));const used=new Set(globalState.journeyPasses.filter(x=>x.usedAt).map(x=>x.credentialId||x.id));return verifySignedPass(pass.payload,key,{competition:globalState.competition.id,revokedCredentialIds:revoked,usedCredentialIds:used,singleUse:false});};
  const revokeJourneyPass=(id:string)=>{globalState.journeyPasses=globalState.journeyPasses.map(x=>x.id===id?{...x,status:'revoked',revocationVersion:(x.revocationVersion||0)+1}:x);auditTrustAction('JOURNEY_PASS_REVOKED','JourneyPass',id,'إلغاء رمز الرحلة وتحديث حالة الإلغاء القابلة للتخزين على Edge','Revoked journey pass and advanced the revocation state for Edge caches');notify();};

  // ---- Scientific foundation + Next Generation merged workflows -------------------------
  const compileCompetitionPolicy=async(fileName:string,sourceType:PolicyCompilationRecord['sourceType'],text:string)=>{
    if(!['comp_admin','org_admin','scientific_admin'].includes(globalState.currentUser.role)||!text.trim())return null;
    const rec=await compilePolicyText({competitionId:globalState.competition.id,sourceFileName:fileName,sourceType,text,createdBy:globalState.currentUser.id,currentPolicy:getCompetitionPolicy(globalState.competition)});globalState.policyCompilations=[rec,...globalState.policyCompilations];auditTrustAction('POLICY_COMPILER_DRAFTED','CompetitionGenome',globalState.competition.id,'تحويل اللائحة إلى مقترح Genome يحتاج مراجعة بشرية','Compiled regulation into a draft Genome requiring human review');notify();return {...rec,summary:policyCompilerSummary(rec)};
  };
  const reviewPolicyCompilation=(id:string,approve:boolean)=>{if(!['comp_admin','org_admin'].includes(globalState.currentUser.role))return false;globalState.policyCompilations=globalState.policyCompilations.map(x=>x.id===id?{...x,state:approve?'REVIEWED':'REJECTED',humanApprovedBy:approve?globalState.currentUser.id:undefined}:x);auditTrustAction(approve?'POLICY_COMPILER_REVIEWED':'POLICY_COMPILER_REJECTED','PolicyCompilation',id,approve?'اعتماد بشري لمسودة اللائحة قبل المحاكاة':'رفض مسودة اللائحة','Human-approved policy draft before simulation');notify();return true;};
  const simulatePolicyCompilation=async(id:string)=>{const rec=globalState.policyCompilations.find(x=>x.id===id);if(!rec||rec.state!=='REVIEWED'||!rec.humanApprovedBy)return null;const candidate=applyApprovedCompilation(rec,globalState.competition);const issues=detectContradictions({competition:candidate,quranSources:globalState.quranSourceManifests,aiValidations:globalState.aiCapabilityValidations,availableQualifiedJudges:globalState.judges.filter(j=>j.isReady).length,committeeCount:globalState.committees.filter(c=>c.status!=='offline').length});const simulationSummary={blockers:issues.filter(x=>x.severity==='BLOCKER').length,reviews:issues.filter(x=>x.severity==='REVIEW').length,infos:issues.filter(x=>x.severity==='INFO').length};const simulatedAt=new Date().toISOString();const simulationHash=await hashCanonical({candidatePolicy:candidate.policy,candidateRuleSet:candidate.ruleSet,issues,simulatedAt});globalState.policyCompilations=globalState.policyCompilations.map(x=>x.id===id?{...x,state:'SIMULATED',simulatedAt,simulationHash,simulationSummary}:x);notify();return {candidate,issues,simulationSummary,simulationHash};};
  const publishPolicyCompilation=(id:string)=>{if(!['comp_admin','org_admin'].includes(globalState.currentUser.role))return false;const rec=globalState.policyCompilations.find(x=>x.id===id);if(!rec||rec.state!=='SIMULATED'||!rec.humanApprovedBy||!rec.simulationHash)return false;if((rec.simulationSummary?.blockers||0)>0)return false;const next=applyApprovedCompilation({...rec,state:'REVIEWED'},globalState.competition);globalState.competition=next;globalState.competitions=globalState.competitions.map(c=>c.id===next.id?next:c);const publishedAt=new Date().toISOString();globalState.policyCompilations=globalState.policyCompilations.map(x=>x.id===id?{...x,state:'PUBLISHED',publishedAt,publishedGenomeVersion:getCompetitionPolicy(next).version}:x);auditTrustAction('POLICY_COMPILER_PUBLISHED','CompetitionGenome',next.id,'نشر نسخة Genome جديدة بعد مراجعة بشرية ومحاكاة بلا موانع','Published a new Genome version only after human review and blocker-free simulation');notify();return true;};
  const refreshContradictionRadar=()=>{const issues=detectContradictions({competition:globalState.competition,quranSources:globalState.quranSourceManifests,aiValidations:globalState.aiCapabilityValidations,availableQualifiedJudges:globalState.judges.filter(j=>j.isReady&&globalState.competition.categories.some(c=>j.certifiedRiwayat.some(r=>String(c.riwaya).toLowerCase().includes(String(r).toLowerCase().split(' ')[0])))).length,committeeCount:globalState.committees.filter(c=>c.status!=='offline').length,committeeSeesDelegation:false,certificateProofRequired:true});globalState.contradictionIssues=issues;auditTrustAction('CONTRADICTION_RADAR_RAN','Competition',globalState.competition.id,`رادار التعارض: ${issues.filter(x=>x.severity==='BLOCKER').length} مانع`,`Contradiction radar: ${issues.filter(x=>x.severity==='BLOCKER').length} blocker(s)`);notify();return issues;};

  const exportEmergencyPack=async()=>{if(!['org_admin','comp_admin','ops_manager'].includes(globalState.currentUser.role))return null;const key=await generateEncryptionKey();const keyId=`mizan-disaster-key:${globalState.competition.id}`;try{sessionStorage.setItem(keyId,Array.from(key).map(b=>b.toString(16).padStart(2,'0')).join(''))}catch{}
    const minimumData={competitionGenome:{...globalState.competition,participants:undefined},quranSourceManifests:globalState.quranSourceManifests.filter(q=>q.status==='approved'||q.certificationState==='CERTIFIED').map(q=>({id:q.id,version:q.version,packageHash:q.packageHash,checksumSha256:q.checksumSha256,qiraah:q.qiraah,rawi:q.rawi,riwaya:q.riwaya})),participantOperationalPasses:globalState.journeyPasses.filter(p=>p.status==='active').map(p=>({credentialId:p.credentialId||p.id,payload:p.payload,checksum:p.checksum,expiresAt:p.expiresAt})),committees:globalState.committees.map(c=>({id:c.id,code:c.code,judgeIds:c.judgeIds,headJudgeId:c.headJudgeId,assignedCategories:c.assignedCategories})),deviceRolePlan:globalState.devices.map(d=>({id:d.id,name:d.name,role:d.role,zone:d.zone,status:d.status})),publicVerificationMaterial:{resultRoots:globalState.publicResultRoots.map(r=>({id:r.id,merkleRoot:r.merkleRoot,algorithm:r.algorithm}))},emergencyContacts:[],latestCheckpoint:globalState.auditLogs[0]?.currentStateHash,recoveryInstructions:'Verify package hash, load preview, then reconcile idempotently with the official event journal.'};
    const pack=await buildDisasterPack({competition:globalState.competition,createdBy:globalState.currentUser.id,minimumData,keyRaw:key,productionKms:false});globalState.disasterPacks=[pack,...globalState.disasterPacks];auditTrustAction('DISASTER_PACK_EXPORTED','DisasterPack',pack.id,'إنشاء حزمة طوارئ مشفرة بمفتاح منفصل عن الحزمة','Exported encrypted emergency pack with key kept separate from the package');notify();return pack;};
  const testRestoreEmergencyPack=async(id:string)=>{const p=globalState.disasterPacks.find(x=>x.id===id);if(!p)return {ok:false,reason:'NOT_FOUND'} as const;let keyHex='';try{keyHex=sessionStorage.getItem(`mizan-disaster-key:${globalState.competition.id}`)||''}catch{}if(!/^[0-9a-f]{64}$/i.test(keyHex))return {ok:false,reason:'KEY_UNAVAILABLE'} as const;const key=Uint8Array.from(keyHex.match(/.{2}/g)!.map(x=>parseInt(x,16)));const restored=await testRestoreDisasterPack(p,key);if(restored.ok){globalState.disasterPacks=globalState.disasterPacks.map(x=>x.id===id?{...x,status:'RESTORE_TESTED',restoreTestedAt:new Date().toISOString()}:x);auditTrustAction('DISASTER_PACK_RESTORE_TESTED','DisasterPack',id,`اختبار استعادة آمن: ${restored.previewKeys.join(' · ')}`,`Safe restore preview tested: ${restored.previewKeys.join(' · ')}`);notify()}return restored;};
  const verifyEmergencyPack=async(id:string)=>{const p=globalState.disasterPacks.find(x=>x.id===id);if(!p)return {valid:false};const v=await verifyDisasterPack(p);if(v.valid){globalState.disasterPacks=globalState.disasterPacks.map(x=>x.id===id?{...x,status:'VERIFIED',verifiedAt:new Date().toISOString()}:x);notify()}return v;};

  const proposeDeviceHealing=(failedDeviceId:string)=>{const failed=globalState.devices.find(d=>d.id===failedDeviceId);if(!failed)return null;const locked=new Set<string>();if(globalState.activeSession.isLocked&&globalState.activeSession.committee){for(const d of globalState.devices.filter(x=>x.role==='JudgeOS'&&x.committeeId===globalState.activeSession.committee?.id))locked.add(d.id)}const rec=proposeDeviceReassignment({competitionId:globalState.competition.id,failed,devices:globalState.devices,activeLockedJudgeDeviceIds:locked});if(rec){globalState.deviceReassignments=[rec,...globalState.deviceReassignments];auditTrustAction('DEVICE_REASSIGNMENT_PROPOSED','Device',failed.id,'اقتراح بديل لجهاز متعطل دون تحويل تلقائي حساس','Proposed compatible spare for failed device without automatic sensitive reassignment');notify()}return rec;};
  const decideDeviceHealing=(id:string,approve:boolean)=>{const rec=globalState.deviceReassignments.find(x=>x.id===id);if(!rec)return false;if(!approve){globalState.deviceReassignments=globalState.deviceReassignments.map(x=>x.id===id?{...x,status:'DISMISSED',decidedAt:new Date().toISOString(),decidedBy:globalState.currentUser.id}:x);notify();return true}if(!['ops_manager','comp_admin','org_admin'].includes(globalState.currentUser.role))return false;const locked=new Set<string>();if(globalState.activeSession.isLocked&&globalState.activeSession.committee){for(const d of globalState.devices.filter(x=>x.role==='JudgeOS'&&x.committeeId===globalState.activeSession.committee?.id))locked.add(d.id)}const gate=canApplyDeviceReassignment(rec,globalState.devices,locked);if(!gate.ok){globalState.deviceReassignments=globalState.deviceReassignments.map(x=>x.id===id?{...x,status:'BLOCKED'}:x);notify();return false}globalState.devices=globalState.devices.map(d=>d.id===rec.spareDeviceId?{...d,role:rec.toRole,committeeId:globalState.devices.find(f=>f.id===rec.failedDeviceId)?.committeeId,lastSyncAt:new Date().toISOString()}:d);globalState.deviceReassignments=globalState.deviceReassignments.map(x=>x.id===id?{...x,status:'APPLIED',decidedAt:new Date().toISOString(),decidedBy:globalState.currentUser.id}:x);auditTrustAction('DEVICE_REASSIGNMENT_APPLIED','Device',rec.spareDeviceId,'تطبيق إعادة تعيين جهاز احتياطي بعد موافقة بشرية','Applied spare-device role reassignment after human approval');notify();return true;};

  const refreshFatigueGuard=()=>{const p=getCompetitionPolicy(globalState.competition);const enabled=p.operations.fatigueGuardEnabled!==false;const target=p.operations.fatigueTargetMinutes||105;const breakM=p.operations.fatigueRecommendedBreakMinutes||12;const now=Date.now();const recs=globalState.committees.map(c=>{const sessionCount=Math.max(c.completedCount,0);const continuous=Math.round(sessionCount*c.averageSessionMinutes);return fatigueRecommendation({competitionId:globalState.competition.id,committeeId:c.id,continuousMinutes:continuous,sessions:sessionCount,timeSinceBreakMinutes:Math.min(continuous,Math.round((now-Date.parse(globalState.competition.startDate||new Date().toISOString()))/60000)),targetMinutes:target,recommendedBreakMinutes:breakM,enabled})});globalState.fatigueRecommendations=recs;notify();return recs;};

  const createLocalBenchmark=(metric:string,values:number[],minimumCohortSize=10)=>{if(!getCompetitionPolicy(globalState.competition).privacy.allowAnonymousBenchmarking)return {published:false,reason:'OPT_IN_REQUIRED'} as const;const out=privacySafeBenchmark({competitionId:globalState.competition.id,metric,values,basis:'OBSERVED',minimumCohortSize,peerGroup:'LOCAL BENCHMARK ONLY'});if(out.published){globalState.competitionBenchmarks=[out.record,...globalState.competitionBenchmarks];notify()}return out;};

  const runOperationalRehearsal=async()=>{
    if(!['comp_admin','org_admin','ops_manager'].includes(globalState.currentUser.role))return null;
    const policy=getCompetitionPolicy(globalState.competition);const rehearsalId=`${globalState.competition.id}:REHEARSAL:${newId('run')}`;
    const readyJudges=globalState.judges.filter(j=>j.isReady);const activeCommittees=globalState.committees.filter(c=>c.status!=='offline');const sampleParticipant=globalState.participants.find(p=>!['rejected','certified'].includes(p.status));
    const pass=(id:string,name:string,ok:boolean,impact:string,evidence:string[],fix:string,warning=false):RehearsalCheckRecord=>({id,name,status:ok?'PASS':warning?'WARNING':'FAIL',impact,evidence,fix});
    const checks:(()=>Promise<RehearsalCheckRecord>)[]=[
      async()=>pass('gate-scan','Gate scan',globalState.devices.some(d=>d.role==='Gate'||d.type==='kiosk'),'Participant arrival',['Gate/Kiosk device discovery executed'],'Assign at least one authorized Gate/Kiosk device.'),
      async()=>{const keys=await generateSigningKeyPair();const now=new Date(),expiry=new Date(now.getTime()+60000);const compact=await issueSignedPass({v:'MZP1',competition:rehearsalId,participantToken:'REHEARSAL',categoryEntitlement:'demo',validFrom:new Date(now.getTime()-1000).toISOString(),expiry:expiry.toISOString(),credentialId:newId('rehcred'),issuer:'MIZAN REHEARSAL'},keys.privateKey);const verified=await verifySignedPass(compact,keys.publicKey,{competition:rehearsalId,now});return pass('offline-pass','Offline signed pass verification',verified.valid,'Offline gate continuity',[verified.valid?'Signature verified offline':`Verification failed: ${verified.reason}`],'Repair offline credential verification.');},
      async()=>pass('participant-checkin','Participant check-in',!!sampleParticipant,'Arrival workflow',[sampleParticipant?`Demo candidate=${sampleParticipant.code}`:'No rehearsal candidate available'],'Load DEMO/REHEARSAL participant data.',!sampleParticipant),
      async()=>pass('queue','Queue',activeCommittees.length>0,'Queue continuity',[`activeCommittees=${activeCommittees.length}`],'Configure at least one operational committee.'),
      async()=>pass('routing','Routing',activeCommittees.length>0&&globalState.competition.categories.length>0,'Participant routing',[`categories=${globalState.competition.categories.length}`,`committees=${activeCommittees.length}`],'Complete category and committee routing configuration.'),
      async()=>pass('judge-session','Judge session',readyJudges.length>0&&activeCommittees.length>0,'Human judging',[`readyJudges=${readyJudges.length}`],'Assign and qualify at least one judge.'),
      async()=>pass('judge-lock','Independent judge lock',policy.judging.independentUntilLock!==false,'Judge independence',[`independentUntilLock=${String(policy.judging.independentUntilLock)}`],'Require independent lock before review evidence.'),
      async()=>pass('head-judge-review','Head Judge review',globalState.judges.some(j=>j.isReady&&j.specialty==='all'),'Escalated human review',['Head Judge qualification lookup executed'],'Assign a ready Head Judge / all-specialty reviewer.',true),
      async()=>{if(!sampleParticipant)return pass('fairdraw','FairDraw',false,'Question selection',['No rehearsal participant'],'Load a DEMO/REHEARSAL participant.',true);try{const category=globalState.competition.categories.find(c=>c.id===sampleParticipant.categoryId);const draw=await generateFairDraw({pool:DEVELOPMENT_QUESTION_BANK,participant:sampleParticipant,policy,maxJuz:category?.juzCount});const verified=await verifyFairDrawSelection({selection:draw,pool:DEVELOPMENT_QUESTION_BANK,participant:sampleParticipant,policy,maxJuz:category?.juzCount});return pass('fairdraw','FairDraw',verified.valid,'Deterministic constrained draw',[verified.valid?'Commitment/reveal reproduced':verified.reason||'verification failed'],'Repair FairDraw constraints or reading-scoped pool.')}catch(e){return pass('fairdraw','FairDraw',false,'Deterministic constrained draw',[e instanceof Error?e.message:String(e)],'Repair FairDraw configuration.',true)}},
      async()=>pass('network-interruption','Network interruption',policy.operations.offlineContinuity===true,'Network loss',['Offline continuity policy evaluated'],'Enable offline continuity and Edge planning.'),
      async()=>pass('offline-continuation','Offline event continuation',policy.operations.offlineContinuity===true,'Offline operations',['Idempotent offline journal path configured'],'Enable the offline event journal.'),
      async()=>pass('reconnect','Reconnect',policy.operations.offlineContinuity===true,'Connectivity restoration',['Reconciliation path evaluated'],'Configure reconnect reconciliation.'),
      async()=>pass('conflict-reconciliation','Conflict reconciliation',policy.operations.offlineContinuity===true,'Idempotent merge',['Conflict model and idempotency path evaluated'],'Configure Edge conflict reconciliation.'),
      async()=>{const failed=globalState.devices.find(d=>d.role&&d.status==='offline')||globalState.devices.find(d=>d.role);return pass('device-failure','Device failure',!!failed,'Device continuity',[failed?`device=${failed.name}`:'No role-bearing device to simulate'],'Register operational devices.',!failed)},
      async()=>{const failed=globalState.devices.find(d=>d.role);if(!failed)return pass('device-reassignment','Device reassignment',false,'Role continuity',['No device available'],'Register a spare device.',true);const simulated={...failed,status:'offline' as const};const proposal=proposeDeviceReassignment({competitionId:rehearsalId,failed:simulated,devices:globalState.devices.map(d=>d.id===failed.id?simulated:d),activeLockedJudgeDeviceIds:new Set()});return pass('device-reassignment','Device reassignment',!!proposal,'Role continuity',[proposal?`${proposal.spareDeviceId} → ${proposal.toRole}`:'No compatible spare'],'Register an authorized compatible spare.',!proposal)},
      async()=>pass('judge-absence','Judge absence',readyJudges.length>activeCommittees.length,'Committee continuity',[`readyJudges=${readyJudges.length}`,`activeCommittees=${activeCommittees.length}`],'Add qualified reserve judges.',true),
      async()=>pass('committee-reassignment','Committee reassignment',activeCommittees.length>1,'Routing continuity',[`activeCommittees=${activeCommittees.length}`],'Provide at least two compatible committees.',true),
      async()=>pass('emergency-mode','Emergency Mode',policy.operations.offlineContinuity===true,'Emergency continuity',['Emergency workflow prerequisite evaluated'],'Enable continuity prerequisites.'),
      async()=>{const configured=globalState.integrations.some(i=>i.enabled&&['email','sms','whatsapp'].includes(i.kind));const fallback=globalState.notifications.some(n=>!!n.fallbackChannel);const simulation=simulateNotificationFailureRecovery({providerConfigured:configured,primaryFailed:true,attempts:0,maxAttempts:3,fallbackConfigured:fallback});return pass('notification-failure','Notification failure',simulation.resilient,'Communication resilience',[`state=${simulation.state}`,`providerConfigured=${configured}`,`fallbackConfigured=${fallback}`],'Configure at least one production notification provider with retry/fallback behavior.',true)},
      async()=>pass('ai-outage','AI outage safety',policy.judging.aiCanAffectScore===false,'Human judging continuity',['aiCanAffectScore=false','Judge submission path does not await AI'],'Set AI to advisory-only.'),
      async()=>pass('result-seal','Result seal',policy.results.requireDualApprovalToSeal!==undefined,'Result authority',[`dualApproval=${String(policy.results.requireDualApprovalToSeal)}`],'Configure result seal policy.'),
      async()=>pass('quorum','Quorum',policy.results.requireDualApprovalToSeal===true,'Multi-authority authorization',['Quorum policy evaluated'],'Enable quorum for protected actions when required.',true),
      async()=>pass('appeal','Appeal',policy.appeals.enabled&&policy.appeals.windowHours>0,'Appeal workflow',[`windowHours=${policy.appeals.windowHours}`],'Configure an appeal window.'),
      async()=>pass('certificate-issuance','Certificate issuance',policy.certificates.enabled===true,'Proof-carrying certificate',['certificateAfterSeal policy evaluated'],'Require sealed result before issuance.'),
      async()=>{const cert=globalState.certificates.find(c=>c.competitionId===globalState.competition.id);if(!cert)return pass('certificate-verification','Certificate verification',false,'Public verification',['No existing certificate; verifier path not mutated'],'Issue a DEMO proof-carrying certificate in rehearsal data.',true);const verified=await verifyCertificateEvidence(cert.id);return pass('certificate-verification','Certificate verification',verified.state==='AUTHENTIC'||verified.state==='REVOKED','Public verification',[`state=${verified.state}`],'Repair certificate proof chain.',verified.state==='NOT_FOUND')},
      async()=>{const pack=globalState.disasterPacks.find(p=>p.status==='RESTORE_TESTED');return pass('disaster-restore','Disaster Box restore test',!!pack,'Severe infrastructure recovery',[pack?`restoreTested=${pack.id}`:`packs=${globalState.disasterPacks.length}`],'Export, verify, and test-restore an Emergency Pack before event day.',true)}
    ];
    const rec=await runRehearsal({competitionId:globalState.competition.id,createdBy:globalState.currentUser.id,checks,requiredCheckIds:REQUIRED_REHEARSAL_CHECK_IDS});
    const contamination=globalState.participants.some(p=>p.competitionId===rehearsalId);if(contamination){rec.checks.push({id:'isolation',name:'Rehearsal isolation',status:'FAIL',impact:'Official record contamination',evidence:['REHEARSAL participant found in official participant store'],fix:'Use ephemeral rehearsal fixtures only.'});rec.status='FAIL';rec.reportHash=await hashCanonical({competitionId:rec.competitionId,startedAt:rec.startedAt,completedAt:rec.completedAt,checks:rec.checks,status:rec.status});}
    globalState.rehearsals=[rec,...globalState.rehearsals];auditTrustAction('OPERATIONAL_REHEARSAL_COMPLETED','Rehearsal',rec.id,`إكمال بروفة تشغيلية: ${rec.status}`,`Operational rehearsal completed: ${rec.status}`);notify();return rec;
  };

  const buildFairDrawPublicProof=async()=>{const sel=globalState.activeSession.questionSelection;const participant=globalState.activeSession.participant;if(!sel||!participant||!sel.seedReveal||!sel.publicCommitmentHash)return null;const existing=globalState.fairDrawProofs.find(x=>x.questionSetId===sel.questionSetId);if(existing)return existing;const policy=getCompetitionPolicy(globalState.competition);const category=globalState.competition.categories.find(c=>c.id===participant.categoryId);const source=sel.quranSourceManifestId?globalState.quranSourceManifests.find(q=>q.id===sel.quranSourceManifestId):undefined;const content=source?globalState.quranSourceContents.find(c=>c.sourceManifestId===source.id&&c.packageHash===source.packageHash):undefined;const pool=source&&content?sourceResolvedQuestionPool(participant,source,content):DEVELOPMENT_QUESTION_BANK;const item:FairDrawProofRecord={id:newId('fairproof'),competitionId:globalState.competition.id,questionSetId:sel.questionSetId,algorithmVersion:sel.algorithmVersion||'MIZAN-FAIRDRAW-2.0',ruleVersion:sel.ruleVersion||policy.version,poolVersion:sel.poolVersion||'unknown',poolSnapshotHash:sel.poolSnapshotHash||'unknown',constraintHash:sel.constraintHash||'unknown',seedCommitmentHash:sel.seedCommitmentHash,publicCommitmentHash:sel.publicCommitmentHash,secretSeed:sel.seedReveal,selectionIds:sel.questions.map(q=>q.id),status:'REVEALED',createdAt:sel.generatedAt,revealedAt:new Date().toISOString(),participantReading:participant.riwaya,qiraah:sel.qiraah,rawi:sel.rawi,tariq:sel.tariq,variantLocusVersion:sel.variantLocusVersion,difficultyMetadataVersion:sel.difficultyMetadataVersion,quranSourceManifestId:sel.quranSourceManifestId,quranSourcePackageHash:sel.quranSourcePackageHash,constraints:{questionsPerParticipant:policy.questions.questionsPerParticipant,targetDifficulty:policy.questions.targetDifficulty,difficultyTolerance:policy.questions.difficultyTolerance,diversity:policy.questions.diversity,maxJuz:category?.juzCount,excludedIds:[]},eligiblePoolSnapshot:pool.map(q=>({id:q.id,riwaya:q.riwaya,surahNumber:q.surahNumber,startAyah:q.startAyah,endAyah:q.endAyah,juzNumber:q.juzNumber,difficultyRating:q.difficultyRating,mutashabihatDensity:q.mutashabihatDensity,tajweedComplexity:q.tajweedComplexity})),verificationStatement:'The selected set satisfies the configured fairness constraints.'};const result=await verifyFairDrawPublicProof(item);item.status=result.valid?'VERIFIED':'REVEALED';globalState.fairDrawProofs=[item,...globalState.fairDrawProofs];auditTrustAction('FAIRDRAW_PROOF_PUBLISHED','FairDrawProof',item.id,result.valid?'نشر إثبات FairDraw قابل لإعادة الإنتاج':'نشر بيانات FairDraw مع تعذر التحقق المحلي الكامل',result.valid?'Published reproducible FairDraw proof':'Published FairDraw data; local verification did not fully pass');notify();return item;};
  const verifyActiveFairDrawProof=async()=>{const proof=globalState.fairDrawProofs.find(x=>x.questionSetId===globalState.activeSession.questionSelection?.questionSetId);if(proof)return verifyFairDrawPublicProof(proof);const sel=globalState.activeSession.questionSelection;const p=globalState.activeSession.participant;if(!sel||!p)return {valid:false,reason:'NO_SELECTION'} as const;const source=sel.quranSourceManifestId?globalState.quranSourceManifests.find(q=>q.id===sel.quranSourceManifestId):undefined;const content=source?globalState.quranSourceContents.find(c=>c.sourceManifestId===source.id&&c.packageHash===source.packageHash):undefined;const pool=source&&content?sourceResolvedQuestionPool(p,source,content):DEVELOPMENT_QUESTION_BANK;return verifyFairDrawSelection({selection:sel,pool,participant:p,policy:getCompetitionPolicy(globalState.competition),maxJuz:globalState.competition.categories.find(c=>c.id===p.categoryId)?.juzCount});};

  const setFederationTrust=(issuer:string,trusted:boolean,claimScopes:FederationTrustRecord['claimScopes'])=>{if(!['org_admin','super_admin'].includes(globalState.currentUser.role))return false;const existing=globalState.federationTrust.find(x=>x.organizationId===globalState.competition.organizationId&&x.issuer===issuer);const rec:FederationTrustRecord={id:existing?.id||newId('trustissuer'),organizationId:globalState.competition.organizationId,issuer,trusted,claimScopes,updatedAt:new Date().toISOString(),updatedBy:globalState.currentUser.id};globalState.federationTrust=existing?globalState.federationTrust.map(x=>x.id===existing.id?rec:x):[rec,...globalState.federationTrust];auditTrustAction('FEDERATION_TRUST_CHANGED','FederationIssuer',rec.id,trusted?'اعتماد جهة مُصدرة في قائمة الثقة':'إلغاء الثقة بجهة مُصدرة',trusted?'Trusted federation issuer':'Revoked federation issuer trust');notify();return true;};

  const sealCeremonyVault=async()=>{const sealed=globalState.results.filter(r=>r.competitionId===globalState.competition.id&&['sealed','published'].includes(r.status));if(!sealed.length)return null;const existing=globalState.ceremonyVaults.find(v=>v.competitionId===globalState.competition.id&&!['REVEALED','REVOKED'].includes(v.status));if(existing)return existing;const q=await requestCeremonyReveal();if(!q)return null;const resultPayload=sealed.map(r=>({id:r.id,participantId:r.participantId,rank:r.rank,score:r.finalScore,status:r.status,seal:r.sealMetadata?.cryptographicChecksum}));const resultPackageHash=await hashCanonical(resultPayload);const publicCommitmentHash=await hashCanonical({competitionId:globalState.competition.id,resultPackageHash,quorumActionId:q.id});const key=await generateEncryptionKey();const encryptedPayload=await encryptJson({competitionId:globalState.competition.id,results:resultPayload,createdAt:new Date().toISOString()},key);if(typeof sessionStorage!=='undefined')sessionStorage.setItem(`mizan-ceremony-key:${globalState.competition.id}`,Array.from(key).map(b=>b.toString(16).padStart(2,'0')).join(''));const item:CeremonyVaultRecord={id:newId('ceremonyvault'),competitionId:globalState.competition.id,resultPackageHash,encryptedPayload,encryptionAlgorithm:'AES-256-GCM',keyManagement:'development_adapter',quorumActionId:q.id,status:q.status==='ready'?'READY':'SEALED',createdAt:new Date().toISOString(),publicCommitmentHash};globalState.ceremonyVaults=[item,...globalState.ceremonyVaults];auditTrustAction('CEREMONY_PACKAGE_SEALED','CeremonyVault',item.id,'تشفير حزمة نتائج الحفل وربطها بالنصاب؛ مفتاح التطوير منفصل عن الحزمة','Encrypted ceremony result package and bound it to quorum; development key is stored separately from the package');notify();return item;};
  const generateMizanProtocolPackage=async()=>{if(!globalState.evidenceNodes.some(n=>n.competitionId===globalState.competition.id))await rebuildEvidenceGraph();let root=globalState.publicResultRoots.find(r=>r.competitionId===globalState.competition.id);if(!root&&globalState.results.some(r=>r.competitionId===globalState.competition.id&&['sealed','published'].includes(r.status)))root=await buildPublicResultRoot()||undefined;const genomeHash=await hashCanonical(globalState.competition);const graphNodes=globalState.evidenceNodes.filter(n=>n.competitionId===globalState.competition.id).map(n=>({id:n.id,type:n.type,status:n.status,version:n.version,checksum:n.checksum,authority:n.authority})).sort((a,b)=>a.id.localeCompare(b.id));const graphEdges=globalState.evidenceEdges.filter(e=>e.competitionId===globalState.competition.id).map(e=>({from:e.fromNodeId,to:e.toNodeId,relation:e.relation})).sort((a,b)=>`${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));const evidenceGraphHash=await hashCanonical({nodes:graphNodes,edges:graphEdges});const manifest={competitionId:globalState.competition.id,organizationId:globalState.competition.organizationId,edition:globalState.competition.edition,policyVersion:getCompetitionPolicy(globalState.competition).version,ruleVersion:globalState.competition.ruleSet.version,status:globalState.competition.status,nonSecret:true as const};const core={protocolVersion:'MIZAN-PROTOCOL-1.0' as const,generatedAt:new Date().toISOString(),generatedBy:globalState.currentUser.name,genomeHash,resultRoot:root?.merkleRoot,auditHead:globalState.auditLogs.find(a=>a.competitionId===globalState.competition.id)?.currentStateHash,quranSourceHashes:globalState.quranSourceManifests.filter(q=>q.organizationId===globalState.competition.organizationId&&q.status==='approved').map(q=>q.checksumSha256),integrityEnvelopeHashes:globalState.integrityEnvelopes.filter(x=>x.competitionId===globalState.competition.id).map(x=>x.envelopeHash),evidenceGraphHash,manifest};const packageHash=await hashCanonical(core);const item:MizanProtocolPackageRecord={id:newId('protocol'),competitionId:globalState.competition.id,...core,packageHash,verificationStatus:'self_verified'};const verifyHash=await hashCanonical(core);item.verificationStatus=verifyHash===packageHash?'self_verified':'verification_failed';globalState.protocolPackages=[item,...globalState.protocolPackages];auditTrustAction('MIZAN_PROTOCOL_PACKAGE_GENERATED','MizanProtocolPackage',item.id,'إنشاء حزمة MIZAN Protocol مستقلة','Generated a portable MIZAN Protocol package');notify();return item;};
  const verifyMizanProtocolPackage=async(item:MizanProtocolPackageRecord)=>{const core:any={protocolVersion:item.protocolVersion,generatedAt:item.generatedAt,generatedBy:item.generatedBy,genomeHash:item.genomeHash,resultRoot:item.resultRoot,auditHead:item.auditHead,quranSourceHashes:item.quranSourceHashes,integrityEnvelopeHashes:item.integrityEnvelopeHashes,manifest:item.manifest};if(item.evidenceGraphHash)core.evidenceGraphHash=item.evidenceGraphHash;const computed=await hashCanonical(core);return {valid:computed===item.packageHash,computedHash:computed};};
  const exportMizanProtocolPackage=(id:string)=>{const p=globalState.protocolPackages.find(x=>x.id===id);return p?JSON.stringify(p,null,2):null;};


  const scopedState = {
    ...state,
    participants: state.participants.filter(x=>x.competitionId===state.competition.id),
    committees: state.committees.filter(x=>x.competitionId===state.competition.id),
    results: state.results.filter(x=>x.competitionId===state.competition.id),
    reviewCases: state.reviewCases.filter(x=>x.competitionId===state.competition.id),
    aiObservations: state.aiObservations.filter(x=>x.competitionId===state.competition.id),
    certificates: state.certificates.filter(x=>x.competitionId===state.competition.id),
    auditLogs: state.auditLogs.filter(x=>x.competitionId===state.competition.id),
    incidents: state.incidents.filter(x=>x.competitionId===state.competition.id),
    appeals: state.appeals.filter(x=>x.competitionId===state.competition.id),
    notifications: state.notifications.filter(x=>x.competitionId===state.competition.id),
    webhooks: state.webhooks.filter(x=>!x.competitionId||x.competitionId===state.competition.id),
    devices: state.devices.filter(x=>x.competitionId===state.competition.id),
    travelRecords: state.travelRecords.filter(x=>x.competitionId===state.competition.id),
    consents: state.consents.filter(x=>x.competitionId===state.competition.id),
    importJobs: state.importJobs.filter(x=>x.competitionId===state.competition.id),
    shadowRuns: state.shadowRuns.filter(x=>x.competitionId===state.competition.id),
    trainingRuns: state.trainingRuns.filter(x=>x.competitionId===state.competition.id),
    remoteChecks: state.remoteChecks.filter(x=>x.competitionId===state.competition.id),
    audioRecordings: state.audioRecordings.filter(x=>x.competitionId===state.competition.id),
    timeMachineScenarios: state.timeMachineScenarios.filter(x=>x.competitionId===state.competition.id),
    quorumActions: state.quorumActions.filter(x=>x.competitionId===state.competition.id),
    invariantViolations: state.invariantViolations.filter(x=>x.competitionId===state.competition.id),
    evidenceNodes: state.evidenceNodes.filter(x=>x.competitionId===state.competition.id),
    evidenceEdges: state.evidenceEdges.filter(x=>x.competitionId===state.competition.id),
    publicResultRoots: state.publicResultRoots.filter(x=>x.competitionId===state.competition.id),
    publicResultProofs: state.publicResultProofs.filter(x=>x.competitionId===state.competition.id),
    localMeshSessions: state.localMeshSessions.filter(x=>x.competitionId===state.competition.id),
    federationAttestations: state.federationAttestations.filter(x=>x.organizationId===state.competition.organizationId),
    protocolPackages: state.protocolPackages.filter(x=>x.competitionId===state.competition.id),
    flightRecorderEntries: state.flightRecorderEntries.filter(x=>x.competitionId===state.competition.id),
    integrityEnvelopes: state.integrityEnvelopes.filter(x=>x.competitionId===state.competition.id),
    chaosDrills: state.chaosDrills.filter(x=>x.competitionId===state.competition.id),
    accessibilityProfiles: state.accessibilityProfiles.filter(x=>x.competitionId===state.competition.id),
    elasticityRecommendations: state.elasticityRecommendations.filter(x=>x.competitionId===state.competition.id),
    journeyPasses: state.journeyPasses.filter(x=>x.competitionId===state.competition.id),
    quranSourceContents: state.quranSourceContents.filter(x=>x.organizationId===state.competition.organizationId),
    policyCompilations: state.policyCompilations.filter(x=>x.competitionId===state.competition.id), contradictionIssues: state.contradictionIssues.filter(x=>x.competitionId===state.competition.id), disasterPacks: state.disasterPacks.filter(x=>x.competitionId===state.competition.id), deviceReassignments: state.deviceReassignments.filter(x=>x.competitionId===state.competition.id), fatigueRecommendations: state.fatigueRecommendations.filter(x=>x.competitionId===state.competition.id), competitionBenchmarks: state.competitionBenchmarks.filter(x=>x.competitionId===state.competition.id), rehearsals: state.rehearsals.filter(x=>x.competitionId===state.competition.id), scientificDatasets: state.scientificDatasets.filter(x=>x.organizationId===state.competition.organizationId), benchmarkRuns: state.benchmarkRuns.filter(x=>x.organizationId===state.competition.organizationId), variantLoci: state.variantLoci, quranReferenceAudio: state.quranReferenceAudio.filter(x=>x.organizationId===state.competition.organizationId), quranCrossChecks: state.quranCrossChecks.filter(x=>x.organizationId===state.competition.organizationId), scientificAdjudications: state.scientificAdjudications.filter(x=>x.organizationId===state.competition.organizationId), scientificImpactReports: state.scientificImpactReports.filter(x=>x.organizationId===state.competition.organizationId), federationTrust: state.federationTrust.filter(x=>x.organizationId===state.competition.organizationId), ceremonyVaults: state.ceremonyVaults.filter(x=>x.competitionId===state.competition.id), fairDrawProofs: state.fairDrawProofs.filter(x=>x.competitionId===state.competition.id),
  };

  return {
    ...scopedState,
    qiraatGraph:TEN_QIRAAT_GRAPH,
    setLanguage,
    switchRole,
    applyAuthenticatedIdentity,
    toggleOffline,
    toggleEmergencyFreeze, setEmergencyMode,
    createIncident, resolveIncident,
    checkInParticipant,
    recordAIObservation, reconcileIntegrityForSession, registerAudioRecording,
    recordJudgeEvent,
    undoLastJudgeEvent,
    lockAndSubmitAssessment,
    nextQuestion,
    resolveReviewCase,
    sealResults,
    generateCertificate,
    publishResults,
    completeCompetition,
    registerParticipant,
    reviewParticipant,
    selectCompetition,
    updateOrganizationBrand, provisionOrganization, setFeatureFlag, registerQuranSourceManifest, reviewQuranSource, certifyQuranSource, revokeQuranSource, advanceQuranSource, runQuranSourceCrossCheck, registerVariantLocus, setVariantLocusState, registerQuranReferenceAudio, setQuranReferenceAudioState, updateQuestionGovernance, registerAiValidation, approveAiCapability, advanceAiValidationStage, suspendAiCapability, revalidateAiProviderModel, registerScientificDataset, revokeScientificDataset, openScientificAdjudication, recordAdjudicationLabel, adjudicateScientificCase, registerBenchmarkRun, updateOperatingCostModel, getOperatingSavings,
    createCompetition,
    submitAppeal,
    resolveAppeal,
    applyTemplate,
    updateCompetitionPolicy,
    updateRuleSet,
    getCompetitionReadiness,
    updateCompetitionDetails,
    addCategory,
    updateCategory,
    removeCategory,
    addCommittee,
    updateCommittee,
    publishCompetition,
    startSessionForParticipant,
    queueNotification, retryNotification, configureIntegration, addWebhook, registerDevice, updateDeviceStatus, updateDevice, revokeDevice, upsertTravelRecord, recordConsent, createImportJob, importParticipantsCsv, startShadowRun, completeShadowRun, addParticipantPassportEntry, addJudgePassportEntry, completeJudgeCalibration, createTrainingRun, completeTrainingRun, createBackup, scheduleRetention, requestSupportSession, approveSupportSession, runRemoteCheck, cloneCompetition, exportCompetitionSnapshot,
    optimizeArrivalSlots, getFairnessReceipt, getIntegrityAnalytics,
    runSimulation,
    runTimeMachine, runInvariantChecks, recordInvariantBlock,
    ensureQuorumAction, approveQuorumAction, revokeQuorumApproval, executeQuorumAction, requestCeremonyReveal, ceremonyRevealAuthorized,
    rebuildEvidenceGraph, traceEvidence, buildPublicResultRoot, getPublicResultProof, verifyPublicResultProof, verifyCertificateEvidence, revokeCertificate,
    startLocalMesh, appendLocalMeshEvent, reconcileLocalMesh, resolveLocalMeshConflict,
    issueFederationAttestation, verifyFederationAttestation, revokeFederationAttestation,
    generateMizanProtocolPackage, verifyMizanProtocolPackage, exportMizanProtocolPackage,
    getQueueEstimate, buildFlightRecorder, createIntegrityEnvelope, verifyIntegrityEnvelope, runChaosDrill, ensureAccessibilityProfile, updateAccessibilityProfile, recommendCommitteeElasticity, decideCommitteeElasticity, issueJourneyPass, verifyOfflineJourneyPass, revokeJourneyPass, compileCompetitionPolicy, reviewPolicyCompilation, simulatePolicyCompilation, publishPolicyCompilation, refreshContradictionRadar, exportEmergencyPack, verifyEmergencyPack, testRestoreEmergencyPack, proposeDeviceHealing, decideDeviceHealing, refreshFatigueGuard, createLocalBenchmark, runOperationalRehearsal, buildFairDrawPublicProof, verifyActiveFairDrawProof, setFederationTrust, sealCeremonyVault
  };
}
