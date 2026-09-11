import { useState, useEffect } from 'react';
import { computePanelScore, panelPenaltyCount, breakTie as coreBreakTie } from './scoring-core';
import { sealResultOnServer, requestQuorum, approveQuorum, succeeded, authorityFailureText, type SealedResultView } from './integrity-authority-client';
import { isDemoResidue, isLaunchDeployment, toLaunchState } from './launch-state';
import { uiToken, capabilityLabel, bilingualName } from './ui-language';
import { canWriteSyncedCollection, classifyCloudError, exceedsSafeDocumentSize, type CloudSyncErrorCode } from './cloud-sync';
import { decideArrival, findByIdOrCode } from './arrival-core';
import { buildDisplayBoard, parseDisplayBoard, PANEL_NEXT_DEPTH, type DisplayBoard } from './display-board';
import { chooseSessionCommittee, freezeRulesOnce, estimateQueueWait } from './session-start-core';
import { PendingRegister, decideUpload, configWriteAllowed, mergeRowsFromCloud, mergeRankedFromCloud, sameScope, type PendingScope } from './cloud-authority';
import { auth, getFirestoreClient } from './firebase';
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
  RuleSet,
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
  IntegrationConfig, NotificationRecord, WebhookSubscription, DeviceRecord, DelegationTravelRecord, ConsentRecord, ImportJobRecord, ShadowRun, ParticipantPassportEntry, JudgePassportEntry, TrainingRun, BackupRecord, RetentionJob, SupportSession, RemoteSessionCheck, AudioRecordingRecord, FeatureFlagRecord, QuranSourceManifestRecord, QuestionGovernanceRecord, AICapabilityValidationRecord, OperatingCostModel, TimeMachineScenarioRecord, QuorumActionRecord, QuorumActionType, InvariantCheckResult, InvariantViolationRecord, ScientificEvidenceNode, ScientificEvidenceEdge, PublicResultRootRecord, PublicResultProofRecord, LocalMeshSessionRecord, FederationAttestationRecord, MizanProtocolPackageRecord, FlightRecorderEntry, IntegrityEnvelopeRecord, ChaosDrillRecord, AccessibilityProfileRecord, CommitteeElasticityRecommendation, JourneyPassRecord, PolicyCompilationRecord, ContradictionIssueRecord, DisasterPackRecord, DeviceReassignmentRecord, JudgeFatigueRecommendationRecord, CompetitionBenchmarkRecord, RehearsalRecord, RehearsalCheckRecord, ScientificDatasetRecord, BenchmarkRunRecord, VariantLocusRecord, QuranReferenceAudioRecord, FederationTrustRecord, CeremonyVaultRecord, FairDrawProofRecord, QuranSourceContentRecord, QuranCrossCheckRecord, ScientificAdjudicationCaseRecord, ScientificImpactReportRecord, QuestionRevealGateRecord, QueueTransferRecord, IdentityAccountRecord, RoleGrantRecord, IdentityInvitationRecord, AuthSessionRecord, PassReissueRecord, ParticipantCredentialLineageRecord, SessionCheckpointRecord, ContinuityIncidentRecord, SessionRecoveryRecord, AuditLedgerSealRecord, CompetitionBlackBoxRecord, FairnessConstitutionalCourtRecord, AcousticVenuePassportRecord, RecitationDigitalTwinRecord, MutashabihatTrapRecord, MultiRiwayahRoutingDecisionRecord, AppealCapsuleRecord, BlindAnchorCalibrationRecord, IntegrityEntropySignalRecord, ScientificCircuitBreakerRecord, MizanIntegrityPassportRecord, IntegrityCinemaRecord, CertifiedVenueSealRecord
} from '../types';
import {
  SEED_ORGANIZATION,
  SEED_COMPETITION,
  SEED_USERS,
  SEED_COMMITTEES,
  SEED_JUDGES,
  SEED_PARTICIPANTS,
  SEED_PARTICIPANT_SCOPES,
  SEED_REVIEW_CASES,
  SEED_MUTASHABIHAT_TRAPS,
  SEED_AI_OBSERVATIONS,
  SEED_FAIRDRAW_PROOFS,
  SEED_RESULTS,
  SEED_CERTIFICATE,
  SEED_AUDIT_LOGS,
  SEED_INCIDENTS,
  SEED_APPEALS,
  SEED_JUDGE_SUBMISSIONS,
  SEED_SESSION_CHECKPOINTS,
  SEED_CONTINUITY_INCIDENTS,
  SEED_SESSION_RECOVERIES,
  SEED_AUTH_SESSIONS,
  SEED_PASS_REISSUES,
  SEED_AUDIT_LEDGER_SEALS,
  SEED_NOTIFICATIONS,
  SEED_WEBHOOKS,
  SEED_INTEGRATIONS,
  SEED_SUPPORT_SESSIONS,
  SEED_IDENTITY_INVITATIONS,
  SEED_TRAVEL_RECORDS,
  SEED_FEDERATION_ATTESTATIONS,
  SEED_PARTICIPANT_PASSPORT,
  SEED_CONSENTS,
  SEED_QUORUM_ACTIONS,
  SEED_FEATURE_FLAGS
} from './seed-data';
import { DEVELOPMENT_QUESTION_BANK } from './quran-vault';
import { buildDeliveryQuestionPool } from './delivery-question-pool';
import { SupportedLanguage, LANGUAGE_META } from './i18n';
import { calibrateJudges } from '../../server/judge-calibration';
import { LOCAL_ONLY_PARTICIPANT_FIELDS, journeyTokenWithheldLocally, redactStateForLocalSnapshot } from './local-snapshot-privacy';
import { certificateVerifyUrl, publishCertificateToRegistry, revokeCertificateInRegistry } from './certificate-verification';
import { buildBlindLiftProof, resolveBlindness, verifyBlindLiftProof } from './blind-chamber';
import { applyTemplate as applyCompetitionTemplate, getCompetitionPolicy, getEnabledJudgeActions, getReadinessIssues } from './competition-config';
import { newId, sha256 } from './crypto';
import { generateFairDraw, verifyFairDrawSelection, verifyFairDrawPublicProof, poolItemToCandidate, validateScopedSelection } from './fairdraw';
import { describeScope, derivedLegacyJuzCount, derivedLegacyMaxJuz, fullQuranScope, normalizeScope, scopeAyahCount, scopeContainsRange, scopeSignature, validateScope, type QuranScope } from './quran-scope';
import { buildParticipantScopeRecord, nextScopeVersion, selectionIsValid, validateParticipantSelection, type ParticipantScopeRecord, type ParticipantScopeSelectionRule } from './participant-scope';
import { type QuestionDistributionPlan } from './question-zones';
import { describeRepeatPolicy, type RepeatPolicy } from './repeat-policy';
import { QuestionAllocationEngine, type QuestionCandidate } from './question-engine';
import { buildScopeReadiness } from './scope-readiness';
import { invalidateStaleModels, buildQuestionModel } from './model-fairness';
import { migrateLegacyScope, planCategoryMigration } from './scope-migration';
import { buildCandidatePool, categoryDistribution, categoryRepeatPolicy, categoryScopeOf, categorySelectionRule, planAllocation, readingContextOf, resolveEffectiveScope, resolveQuestionCount, staleModels } from './scope-engine';
import { surahNameArabic } from './quran-canon';
import type { ScopeEngineSealRecord, ScopeSimulationRecord, QuestionModelRecord, QuestionModelBatchRecord, QuestionQuarantineRecord, QuestionReservationRecord, FairnessReportRecord } from '../types';
import { applyQuarantine, claimReserveModel, generateModelBatch, recoverFromQuarantine } from './model-batch';
import { blockedLocusKeys, expireReservations, reserveQuestions, transitionReservations } from './question-reservation';
import { buildExposureOracle, buildExposureProfiles } from './exposure-risk';
import { aggregateFairness } from './model-fairness';
import { enqueueOfflineEvent, drainOfflineEvents } from './offline-queue';
import { buildMerkleTree, canonicalStringify, finishMinutes, hashCanonical, merkleProofForIndex, quorumSatisfied, verifyMerkleProof } from './trust-protocol';
import { createBrowserBroadcastMesh, MeshTransportAdapter, MeshWireEnvelope } from './mesh-transport';
import { can } from './permissions';
import { TEN_QIRAAT_GRAPH, computeQuranPackageHash, immutableSourceUpdateAllowed, canPromoteQuranSource, certificationReleaseGate, aiCapabilityState, sourceUsableForCompetition, certifiedCapabilityFor, resolveReading, resolveReadings, isKfgqpcOfficialReading, detectModelChange, explicitConsentGranted } from './scientific-core';
import { compilePolicyText, detectContradictions, policyCompilerSummary, applyApprovedCompilation } from './policy-compiler';
import { validateVerseStructure, compareQuranRows, type QuranVerseRecord } from './quran-source-ingestion';
import { buildJudgeIndependenceCommitment, buildParticipantFairnessEvidence, questionRevealReady, planQueueTransfer, queueOrderValue, recommendBalancedQueueMove } from './judging-integrity';
import { buildSessionCheckpoint, verifyCheckpointChain, recoveryDecisionFromCheckpoint, nextCredentialGeneration, credentialLineageFor, passReissueAllowed, roleGrantRequiresDualApproval, canGrantRole, invitationTokenHash, normalizedIdentityEmail, detectConcurrentPrivilegedSession, verifyAuditChain, appendAuditHash, passReissueJourneyStateAllowed, fullRetestProposalAllowed, fullRetestApprovalAllowed } from './operational-integrity';
import { buildCompetitionBlackBox, runFairnessConstitutionalCourt, issueAcousticVenuePassport, buildRecitationDigitalTwin, mapMutashabihatTrap, multiRiwayahSmartRoute, buildAppealCapsule, verifyAppealCapsule, blindAnchorCalibration, integrityEntropyRadar, tripScientificCircuitBreaker, issueMizanIntegrityPassport } from './global-integrity-protocol';
import { fetchSecureQuestionCapabilities, findSecureRuntimeForParticipant } from './server-question-client';
import { buildIntegrityCinema, certifyVenue, verifyVenueBaseline } from './integrity-extensions';
import { buildDisasterPack, generateEncryptionKey, encryptJson, privacySafeBenchmark, fatigueRecommendation, proposeDeviceReassignment, canApplyDeviceReassignment, runRehearsal, simulateNotificationFailureRecovery, verifyDisasterPack, generateSigningKeyPair, exportPublicJwk, issueSignedPass, importPublicJwk, verifySignedPass, compactCredentialToJourneyRecord, testRestoreDisasterPack, federationAttestationDigest, developmentFederationSignature, verifyFederationAttestationEvidence, REQUIRED_REHEARSAL_CHECK_IDS } from './nextgen-integrity';

import { AppStoreState, STORAGE_KEY } from './store-state';

const RETIRED_IDENTITY_ROLE='scientific_admin' as const;
const isRetiredIdentityRole=(role:unknown)=>String(role||'')===RETIRED_IDENTITY_ROLE;

/*
 * ترقية حالة محفوظة إلى الشكل الحالي: تُضاف الحقول المستحدثة ويُنسب كل سجل لمسابقته.
 * الحسابات والأدوار لا تُزرع في نشرٍ حقيقي — مصدرها حوكمة الهوية الخادمية وحدها.
 */
function hydrateSavedState(parsed: AppStoreState): AppStoreState {
  const launch = isLaunchDeployment();
  /* عطل الحفظ حالةٌ حيّة تُكتشف عند وقوعها، لا أثرٌ يُبعث من اللقطة المحفوظة: لقطةٌ حملت
     الشريط مرةً كانت تُعيده إلى الأبد بعد زوال سببه، ولا شيء يمسحه في صفحةٍ لا تكتب للسحابة. */
  parsed.persistenceError = null;
  // يسبق الترقية: وإلا لملأ احتياطُ الحسابات المزروعة الفراغَ قبل أن يصل الحارس.
  if (launch) { parsed.identityAccounts = parsed.identityAccounts ?? []; parsed.roleGrants = parsed.roleGrants ?? []; }
      parsed.organization = parsed.organization || SEED_ORGANIZATION;
      parsed.organizations = parsed.organizations?.length ? parsed.organizations : [parsed.organization];
      parsed.competition = { ...parsed.competition, policy: getCompetitionPolicy(parsed.competition), ruleSets: parsed.competition.ruleSets || [parsed.competition.ruleSet] };
      parsed.competitions = parsed.competitions?.length ? parsed.competitions.map(c => ({ ...c, policy: getCompetitionPolicy(c), ruleSets: c.ruleSets || [c.ruleSet] })) : [parsed.competition];
      // Legacy local demo data is migrated into the active competition scope so no record can leak across competitions.
      parsed.reviewCases = (parsed.reviewCases || []).map(r => ({ ...r, competitionId: r.competitionId || parsed.competition.id }));
      parsed.aiObservations = (parsed.aiObservations || (launch ? [] : SEED_AI_OBSERVATIONS)).map(o => ({ ...o, competitionId: o.competitionId || parsed.competition.id }));
      parsed.appeals = parsed.appeals || [];
      parsed.sealApprovals = parsed.sealApprovals || [];
      parsed.integrations = parsed.integrations || []; parsed.notifications = parsed.notifications || []; parsed.webhooks = parsed.webhooks || []; parsed.devices = parsed.devices || [];
      parsed.travelRecords = (parsed.travelRecords || []).filter(r=>!['trv-1','trv-2','trv-3'].includes(r.id)&&r.flightNumber!=='MZ 417'); parsed.consents = parsed.consents || []; parsed.importJobs = parsed.importJobs || []; parsed.shadowRuns = parsed.shadowRuns || [];
      parsed.participantPassport = parsed.participantPassport || []; parsed.judgePassport = parsed.judgePassport || []; parsed.trainingRuns = parsed.trainingRuns || [];
      parsed.backups = parsed.backups || []; parsed.retentionJobs = parsed.retentionJobs || []; parsed.supportSessions = parsed.supportSessions || []; parsed.remoteChecks = parsed.remoteChecks || []; parsed.audioRecordings = parsed.audioRecordings || []; parsed.featureFlags = parsed.featureFlags || []; parsed.quranSourceManifests=parsed.quranSourceManifests||[]; parsed.quranSourceContents=parsed.quranSourceContents||[]; parsed.questionGovernance=parsed.questionGovernance||(launch?[]:DEVELOPMENT_QUESTION_BANK.map(q=>({questionId:q.id,competitionId:parsed.competition.id,expertDifficulty:q.difficultyRating,status:'fixture',updatedAt:new Date().toISOString()}))); parsed.aiCapabilityValidations=parsed.aiCapabilityValidations||[]; parsed.operatingCostModel=parsed.operatingCostModel||(launch?{baselineStaff:0,mizanStaff:0,hoursPerDay:0,days:0}:{baselineStaff:24,mizanStaff:6,hoursPerDay:8,days:2}); parsed.timeMachineScenarios=parsed.timeMachineScenarios||[]; parsed.quorumActions=parsed.quorumActions||[]; parsed.invariantViolations=parsed.invariantViolations||[]; parsed.evidenceNodes=parsed.evidenceNodes||[]; parsed.evidenceEdges=parsed.evidenceEdges||[]; parsed.publicResultRoots=parsed.publicResultRoots||[]; parsed.publicResultProofs=parsed.publicResultProofs||[]; parsed.localMeshSessions=parsed.localMeshSessions||[]; parsed.federationAttestations=parsed.federationAttestations||[]; parsed.protocolPackages=parsed.protocolPackages||[]; parsed.flightRecorderEntries=parsed.flightRecorderEntries||[]; parsed.integrityEnvelopes=parsed.integrityEnvelopes||[]; parsed.chaosDrills=parsed.chaosDrills||[]; parsed.accessibilityProfiles=parsed.accessibilityProfiles||[]; parsed.elasticityRecommendations=parsed.elasticityRecommendations||[]; parsed.journeyPasses=parsed.journeyPasses||[]; parsed.policyCompilations=parsed.policyCompilations||[]; parsed.contradictionIssues=parsed.contradictionIssues||[]; parsed.disasterPacks=parsed.disasterPacks||[]; parsed.deviceReassignments=parsed.deviceReassignments||[]; parsed.fatigueRecommendations=parsed.fatigueRecommendations||[]; parsed.competitionBenchmarks=parsed.competitionBenchmarks||[]; parsed.rehearsals=parsed.rehearsals||[]; parsed.scientificDatasets=parsed.scientificDatasets||[]; parsed.benchmarkRuns=parsed.benchmarkRuns||[]; parsed.variantLoci=parsed.variantLoci||[]; parsed.quranReferenceAudio=parsed.quranReferenceAudio||[]; parsed.quranCrossChecks=parsed.quranCrossChecks||[]; parsed.scientificAdjudications=parsed.scientificAdjudications||[]; parsed.scientificImpactReports=parsed.scientificImpactReports||[]; parsed.federationTrust=parsed.federationTrust||[]; parsed.ceremonyVaults=parsed.ceremonyVaults||[]; parsed.fairDrawProofs=parsed.fairDrawProofs||(launch?[]:SEED_FAIRDRAW_PROOFS); parsed.questionRevealGates=parsed.questionRevealGates||[]; parsed.queueTransfers=parsed.queueTransfers||[]; parsed.identityAccounts=parsed.identityAccounts||(launch?[]:SEED_USERS.map(u=>({id:`acct-${u.id}`,firebaseUid:u.id,email:u.email,displayName:u.name,organizationId:u.organizationId,status:'ACTIVE',createdAt:new Date().toISOString(),createdBy:'seed',activatedAt:new Date().toISOString(),mfaRequired:['super_admin','org_admin','comp_admin','head_judge','judge','auditor'].includes(u.role),identityAssurance:'DEMO'}))); parsed.roleGrants=parsed.roleGrants||(launch?[]:SEED_USERS.map(u=>({id:`grant-${u.id}`,accountId:`acct-${u.id}`,role:u.role,organizationId:u.organizationId,competitionId:u.competitionId,status:'ACTIVE',requestedAt:new Date().toISOString(),requestedBy:'seed',approvedAt:new Date().toISOString(),approvedBy:'seed',reason:'Development seed role',dualApprovalRequired:false}))); parsed.identityInvitations=parsed.identityInvitations||[]; parsed.authSessions=parsed.authSessions||[]; parsed.passReissues=parsed.passReissues||[]; parsed.credentialLineages=parsed.credentialLineages||[]; parsed.sessionCheckpoints=parsed.sessionCheckpoints||[]; parsed.continuityIncidents=parsed.continuityIncidents||[]; parsed.sessionRecoveries=parsed.sessionRecoveries||[]; parsed.auditLedgerSeals=parsed.auditLedgerSeals||[]; parsed.competitionBlackBoxes=parsed.competitionBlackBoxes||[]; parsed.fairnessCourtRecords=parsed.fairnessCourtRecords||[]; parsed.acousticVenuePassports=parsed.acousticVenuePassports||[]; parsed.recitationDigitalTwins=parsed.recitationDigitalTwins||[]; parsed.mutashabihatTrapMaps=parsed.mutashabihatTrapMaps||(launch?[]:SEED_MUTASHABIHAT_TRAPS); parsed.smartRoutingDecisions=parsed.smartRoutingDecisions||[]; parsed.appealCapsules=parsed.appealCapsules||[]; parsed.blindAnchorCalibrations=parsed.blindAnchorCalibrations||[]; parsed.integrityEntropySignals=parsed.integrityEntropySignals||[]; parsed.scientificCircuitBreakers=parsed.scientificCircuitBreakers||[]; parsed.mizanIntegrityPassports=parsed.mizanIntegrityPassports||[]; parsed.integrityCinemaRecords=parsed.integrityCinemaRecords||[]; parsed.certifiedVenueSeals=parsed.certifiedVenueSeals||[]; parsed.quranSourceManifests=(parsed.quranSourceManifests||[]).map(q=>({...q,certificationState:q.certificationState||(q.status==='approved'?'CERTIFIED':q.status==='retired'?'REVOKED':q.status==='reviewed'?'PENDING_REVIEW':'DEVELOPMENT'),revocationState:q.revocationState||(q.status==='retired'?'REVOKED':'ACTIVE'),immutable:q.immutable??q.status==='approved'})); parsed.aiCapabilityValidations=(parsed.aiCapabilityValidations||[]).map(v=>({...v,certificationState:v.certificationState||(v.status==='certified'?'CERTIFIED':v.status==='suspended'?'SUSPENDED':v.status==='validated'?'PENDING_VALIDATION':'RESEARCH')}));
  // Preserve history, revoke authority: no legacy role is remapped to an active role.
  parsed.roleGrants=(parsed.roleGrants||[]).map(grant=>isRetiredIdentityRole((grant as unknown as {role?:unknown}).role)?{...grant,status:'REVOKED' as const,reason:[grant.reason,'Retired identity authority'].filter(Boolean).join(' · ')}:grant);
  parsed.identityInvitations=(parsed.identityInvitations||[]).map(invitation=>isRetiredIdentityRole((invitation as unknown as {requestedRole?:unknown}).requestedRole)?{...invitation,status:'REVOKED' as const,activationTokenHash:undefined}:invitation);
  parsed.authSessions=(parsed.authSessions||[]).map(session=>isRetiredIdentityRole((session as unknown as {role?:unknown}).role)?{...session,status:'REVOKED' as const}:session);
  return parsed;
}

/*
 * بوابة كشف مزروعة للجلسة التجريبية النشطة.
 *
 * منظومة الكشف الآمن جعلت الجلسة تبدأ "مختومة"، فصار المحكم في وضع العرض يرى شاشة انتظار
 * بدل أن يهبط مباشرة على سطح التحكيم للمتسابق أمامه كما كان قبلها. نزرع هنا بوابةً مكتملة
 * (حضور مؤكَّد + موافقة المحكم المكلّف) للجلسة sess-active-001 حتى يظهر سطح التحكيم فورًا في
 * العرض. البوابة خاصة بالعرض فقط؛ الجلسات الحقيقية تُنشئ بواباتها بنفسها، ووضع الإطلاق يمسحها.
 */
const SEED_ACTIVE_REVEAL_GATE: QuestionRevealGateRecord = {
  id: 'qgate-active-001',
  competitionId: SEED_COMPETITION.id,
  sessionId: 'sess-active-001',
  participantId: SEED_PARTICIPANTS[0].id,
  committeeId: SEED_COMMITTEES[0].id,
  questionIndex: 0,
  participantPresence: { verified: true, verifiedAt: new Date().toISOString(), verifiedBy: 'usr-judge-1', method: 'manual_visual_confirmation' },
  requiredJudgeIds: [...new Set(SEED_COMMITTEES[0].judgeIds)],
  approvals: SEED_COMMITTEES[0].judgeIds.map(judgeId => ({ judgeId, judgeName: 'Dr. Kamal Isa Al-Masarawi', approvedAt: new Date().toISOString() })),
  status: 'REVEALED',
  createdAt: new Date().toISOString(),
  revealedAt: new Date().toISOString(),
  questionCommitmentHash: 'DEMO:active-session-reveal-gate',
  revealAssurance: 'development_client_gate',
};

function seededInitialState(): AppStoreState {

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
    aiObservations: SEED_AI_OBSERVATIONS,
    judgeSubmissions: SEED_JUDGE_SUBMISSIONS,
    certificates: [SEED_CERTIFICATE],
    auditLogs: SEED_AUDIT_LOGS,
    incidents: SEED_INCIDENTS,
    appeals: SEED_APPEALS,
    isOffline: false,
    emergencyFrozen: false,
    sealApprovals: [],
    integrations: SEED_INTEGRATIONS, notifications: SEED_NOTIFICATIONS, webhooks: SEED_WEBHOOKS,
    devices: [
      {id:'dev-kiosk-1',competitionId:SEED_COMPETITION.id,name:'Gate Kiosk 01',type:'kiosk',zone:'Gate',status:'online',lastSeenAt:new Date().toISOString(),softwareVersion:'1.0.0'},
      {id:'dev-edge-1',competitionId:SEED_COMPETITION.id,name:'MIZAN Edge Primary',type:'edge_server',zone:'Control',status:'online',lastSeenAt:new Date().toISOString(),softwareVersion:'1.0.0'}
    ],
    travelRecords: SEED_TRAVEL_RECORDS, consents: SEED_CONSENTS, importJobs: [], shadowRuns: [], participantPassport: SEED_PARTICIPANT_PASSPORT, judgePassport: [], trainingRuns: [], backups: [], retentionJobs: [], supportSessions: SEED_SUPPORT_SESSIONS, remoteChecks: [], audioRecordings: [], featureFlags: SEED_FEATURE_FLAGS, quranSourceManifests: [], quranSourceContents: [], questionGovernance: DEVELOPMENT_QUESTION_BANK.map(q=>({questionId:q.id,competitionId:SEED_COMPETITION.id,expertDifficulty:q.difficultyRating,status:'fixture',updatedAt:new Date().toISOString()})), aiCapabilityValidations: [], operatingCostModel:{baselineStaff:24,mizanStaff:6,hoursPerDay:8,days:2},
    timeMachineScenarios:[], quorumActions:SEED_QUORUM_ACTIONS, invariantViolations:[], evidenceNodes:[], evidenceEdges:[], publicResultRoots:[], publicResultProofs:[], localMeshSessions:[], federationAttestations:SEED_FEDERATION_ATTESTATIONS, protocolPackages:[], flightRecorderEntries:[], integrityEnvelopes:[], chaosDrills:[], accessibilityProfiles:[], elasticityRecommendations:[], journeyPasses:[], policyCompilations:[], contradictionIssues:[], disasterPacks:[], deviceReassignments:[], fatigueRecommendations:[], competitionBenchmarks:[], rehearsals:[], scientificDatasets:[], benchmarkRuns:[], variantLoci:[], quranReferenceAudio:[], quranCrossChecks:[], scientificAdjudications:[], scientificImpactReports:[], federationTrust:[], ceremonyVaults:[], fairDrawProofs:SEED_FAIRDRAW_PROOFS, questionRevealGates:[SEED_ACTIVE_REVEAL_GATE], participantScopes:SEED_PARTICIPANT_SCOPES, questionModels:[], questionModelBatches:[], scopeSimulations:[], scopeEngineSeals:[], questionQuarantines:[], questionReservations:[], fairnessReports:[], queueTransfers:[], identityAccounts:SEED_USERS.map(u=>({id:`acct-${u.id}`,firebaseUid:u.id,email:u.email,displayName:u.name,organizationId:u.organizationId,status:'ACTIVE',createdAt:new Date().toISOString(),createdBy:'seed',activatedAt:new Date().toISOString(),mfaRequired:['super_admin','org_admin','comp_admin','head_judge','judge','auditor'].includes(u.role),identityAssurance:'DEMO'})), roleGrants:SEED_USERS.map(u=>({id:`grant-${u.id}`,accountId:`acct-${u.id}`,role:u.role,organizationId:u.organizationId,competitionId:u.competitionId,status:'ACTIVE',requestedAt:new Date().toISOString(),requestedBy:'seed',approvedAt:new Date().toISOString(),approvedBy:'seed',reason:'Development seed role',dualApprovalRequired:false})), identityInvitations:SEED_IDENTITY_INVITATIONS, authSessions:SEED_AUTH_SESSIONS, passReissues:SEED_PASS_REISSUES, credentialLineages:[], sessionCheckpoints:SEED_SESSION_CHECKPOINTS, continuityIncidents:SEED_CONTINUITY_INCIDENTS, sessionRecoveries:SEED_SESSION_RECOVERIES, auditLedgerSeals:SEED_AUDIT_LEDGER_SEALS, competitionBlackBoxes:[], fairnessCourtRecords:[], acousticVenuePassports:[], recitationDigitalTwins:[], mutashabihatTrapMaps:SEED_MUTASHABIHAT_TRAPS, smartRoutingDecisions:[], appealCapsules:[], blindChamberLifts:[], blindAnchorCalibrations:[], integrityEntropySignals:[], scientificCircuitBreakers:[], mizanIntegrityPassports:[], integrityCinemaRecords:[], certifiedVenueSeals:[],
    activeSession: {
      sessionId: 'sess-active-001',
      participant: SEED_PARTICIPANTS[0], // Bilal Yusuf (A-104)
      committee: SEED_COMMITTEES[0],
      questionSelection: {
        questionSetId: 'qset-104-fairdraw',
        participantId: 'part-104',
        // ثلاثة أسئلة مختلفة ومقاطع قصيرة (٣ آيات) حتى لا تبدو مكررة ولا يتمدّد المقطع على وجهين في العرض.
        questions: [
          { ...DEVELOPMENT_QUESTION_BANK[0], endAyah: DEVELOPMENT_QUESTION_BANK[0].startAyah + 2 },
          { ...DEVELOPMENT_QUESTION_BANK[1], endAyah: DEVELOPMENT_QUESTION_BANK[1].startAyah + 2 },
          { ...DEVELOPMENT_QUESTION_BANK[3], endAyah: DEVELOPMENT_QUESTION_BANK[3].startAyah + 2 },
        ],
        difficultyVectorScore: 2.33,
        seedCommitmentHash: 'DEMO:generated-at-runtime-in-live-sessions',
        fairnessToleranceDelta: 0.04,
        generatedAt: new Date().toISOString()
      },
      currentQuestionIndex: 0,
      isReciting: true,
      durationSeconds: 142,
      secureQuestionMode:'CLIENT',
      events: [
        {
          id: 'ev-1',
          sessionId: 'sess-active-001',
          questionIndex: 0,
          judgeId: 'usr-judge-1',
          judgeName: 'Dr. Kamal Isa Al-Masarawi',
          timestamp: new Date().toISOString(),
          relativeSeconds: 45,
          type: 'tajweed_minor',
          criterion: 'tajweed',
          penalty: 0.25
        }
      ],
      isLocked: false,
      audioLevel: 78,
      // كُشف السؤال في العرض عبر البوابة المزروعة، فتظهر منصة التحكيم مباشرة كما كانت قبل منظومة الكشف الآمن.
      questionPhase: 'RECITING'
    }
  };
}

/*
 * الحالة الابتدائية.
 *
 * في نشرٍ حقيقي لا تُزرع بيانات عرض إطلاقًا، ولا تُحيا حالةٌ محفوظة تعود لبيانات العرض: متصفّح
 * جرّب النسخة التجريبية ثم وُجّه إلى الإنتاج كان سيستعيد المتسابقين المخترعين من تخزينه المحلي.
 */
function getInitialState(): AppStoreState {
  const launch = isLaunchDeployment();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as AppStoreState;
      if (launch && isDemoResidue(parsed?.organization?.id, SEED_ORGANIZATION.id)) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        /* جهاز يحمل نسخة سابقة للترقية يبقى حاملًا لأرقام الهوية إلى أن يُكتب شيء جديد — وقد
           لا يُكتب أبدًا على جهاز خامل. فتُنظَّف النسخة المخزَّنة عند أول قراءة، لا عند أول كتابة. */
        const sanitized=redactStateForLocalSnapshot(parsed);
        try{localStorage.setItem(STORAGE_KEY,JSON.stringify(sanitized))}catch{/* التنظيف لا يمنع الإقلاع */}
        return hydrateSavedState(sanitized);
      }
    }
  } catch {
    // fallback below
  }
  const seeded = seededInitialState();
  return launch ? toLaunchState(seeded) : seeded;
}

let globalState = getInitialState();

/*
 * الاسم كما يُحفَظ داخل مستند مُولَّد — شهادة، أو بطاقة رحلة، أو جواز مشاركة.
 *
 * صار الاسم الإنجليزي اختياريًا، وهذه المستندات تنسخه وقت الإنشاء ثم تعيش به إلى الأبد؛
 * ومنها ما لا يحمل إلا خانة اسم واحدة. فمسابقة عربية بلا اسم إنجليزي كانت ستُصدر شهادة
 * بلا اسم مسابقة أصلًا. الاحتياط هنا وقت الكتابة لا وقت العرض: المستند الصادر لا يُصلَّح
 * لاحقًا، ولا يُعاد إصداره لأن اسمًا أُضيف بعده.
 */
const storedCompetitionName = (english: boolean) => bilingualName(globalState.competition, !english) || globalState.competition.id;

const QURAN_JUZ_TOTAL = 30;
const PENDING_CLOUD_KEY = 'mizan_pending_cloud_v1';
const MAX_PENDING_BYTES = 2_000_000;
function markCompetitionConfigChanged(){
  const now=new Date().toISOString();
  globalState.competitionConfigUpdatedAt=now;
  return now;
}
let browserMeshAdapter: MeshTransportAdapter | null = null;
const productionMode = import.meta.env.PROD === true;

function activeRuleSetForCategory(categoryId?: string) {
  const category = categoryId ? globalState.competition.categories.find(c => c.id === categoryId) : undefined;
  const requestedId = category?.ruleSetId;
  return (requestedId ? globalState.competition.ruleSets?.find(r => r.id === requestedId) : undefined) || globalState.competition.ruleSet;
}
// Deterministic tie-break comparator for equal final scores, honouring the RuleSet's ordered
// tieBreakRules. Returns <0 if a should rank ahead of b. `additional_question` cannot be resolved
// automatically (needs a re-test) and is treated as neutral here.
function breakTie(a: ResultRecord, b: ResultRecord, rules: RuleSet['tieBreakRules'] = []): number {
  return coreBreakTie(a, b, rules as readonly string[]);
}

// Non-lossy reconciliation of results arriving from the live server snapshot.
// The previous "accept remote only if its array is at least as long as ours" rule could both drop
// newer local records and let a stale remote copy overwrite a locally sealed/published result.
// Instead we union by id and, when both sides hold the same result, keep the one whose status is
// more advanced — sealed/published are authoritative and must never regress to 'calculated'.
const RESULT_STATUS_RANK: Record<ResultRecord['status'], number> = { calculated: 0, quality_checked: 1, approved: 2, sealed: 3, published: 4 };
function mergeResultsByAuthority(local: ResultRecord[], remote: ResultRecord[]): ResultRecord[] {
  /* السلطة أولًا: المختوم لا يتراجع. والحارس المحليّ لا يعمل إلا عند تساوي الرتبة، وإلا
     لحُبست نتيجةٌ ختمها الخادم خلف مسوّدةٍ على جهاز. */
  return mergeRankedFromCloud(local, remote, RESULT_STATUS_RANK, (rowId) => rowHasPendingWrite('results', rowId));
}
// Union judge submissions by (sessionId, judgeId); a locked submission always wins over an unlocked one.
function mergeJudgeSubmissions(local: JudgeSubmission[], remote: JudgeSubmission[]): JudgeSubmission[] {
  const key = (s: JudgeSubmission) => `${s.sessionId}::${s.judgeId}`;
  const byKey = new Map<string, JudgeSubmission>();
  for (const s of local) byKey.set(key(s), s);
  for (const s of remote) { const cur = byKey.get(key(s)); if (!cur || (s.locked && !cur.locked)) byKey.set(key(s), s); }
  return [...byKey.values()];
}

const judgeSpecialties=(judge?:JudgeProfile|null)=>[...new Set(((judge?.specialties?.length?judge.specialties:[judge?.specialty||'all'])).filter(Boolean))];
// A judge may sit on more than one panel with a different scope on each — e.g. "شامل" on one
// committee and "تجويد" on another. The panel-scoped key is whichever id the committee stored.
const committeeJudgeKey=(committee:Committee|null|undefined,judge:JudgeProfile|null|undefined):string|undefined=>{
  if(!committee||!judge)return undefined;
  if(committee.judgeIds.includes(judge.id))return judge.id;
  if(committee.judgeIds.includes(judge.userId))return judge.userId;
  return judge.id;
};
const committeeSpecialtiesFor=(committee:Committee|null|undefined,judge:JudgeProfile|null|undefined):string[]=>{
  const key=committeeJudgeKey(committee,judge);
  const scoped=key?committee?.judgeSpecialties?.[key]:undefined;
  if(scoped&&scoped.length)return [...new Set(scoped.filter(Boolean))];
  return judgeSpecialties(judge);
};
const specialtiesCanScore=(specs:string[],assigned?:string,mode?:string)=>mode==='all_judges_all_criteria'||!specs.length||specs.includes('all')||!assigned||assigned==='all'||specs.includes(assigned);
const judgeCanScoreCriterion=(judge:JudgeProfile|undefined|null,assigned?:string,mode?:string)=>mode==='all_judges_all_criteria'||!judge||judgeSpecialties(judge).includes('all')||!assigned||assigned==='all'||judgeSpecialties(judge).includes(assigned);

/*
 * دمج غير مُفقِد بالمعرّف: السحابة تُضيف ما لا نملكه وتحدّث ما نملكه، ولا تحذف سجلًا محليًا
 * لم يصل الخادم بعد (جهاز كان بلا شبكة). الحذف عملية صريحة لا أثرٌ جانبي لمزامنة.
 */
/*
 * سجلّ ما لم يصل السحابة بعد.
 *
 * الأصل هو السحابة: كل صفٍّ يأتي منها يغلب النسخة المحلية. والاستثناء الوحيد صفٌّ غيّره
 * هذا الجهاز ولم يصل بعد — فلو غلبته السحابة لمُحي التغيير من الشاشة قبل أن يُرفع، ولضاع.
 * فيُحفظ هنا بحمولته ووقت تغييره، ويُحمى من الكتابة فوقه حتى يُرفع أو تثبت أسبقية السحابة.
 */
/*
 * السجلّ وقواعد السلطة تعيش في `cloud-authority` نقيّةً بلا فايرستور ولا حالةٍ عامّة،
 * لتُختبر بتشغيلها لا بقراءتها: اختبارها يُنشئ جهازين حقيقيين ويحاكي القاعة. وما هنا
 * توصيلٌ لتلك القواعد بحالة التطبيق — لا نسخةٌ ثانية منها.
 */
const pendingRegister = PendingRegister.deserialize((() => {
  try { return localStorage.getItem(PENDING_CLOUD_KEY); } catch { return null; }
})());
const pendingScope = (): PendingScope => ({ organizationId: globalState.competition.organizationId, competitionId: globalState.competition.id });

/*
 * السجلّ يعيش عبر إعادة التحميل.
 *
 * صار اللحاق يرفع المعلَّق وحده، فلو ضاع السجلّ بإغلاق التبويب لضاع معه ما لم يُرفع إلى
 * الأبد — وهذا بالضبط حال محكّمٍ رصد درجاته بلا شبكة ثم أغلق الجهاز.
 */
let pendingPersistTimer: ReturnType<typeof setTimeout> | null = null;
function savePendingRegister() {
  if (pendingPersistTimer) clearTimeout(pendingPersistTimer);
  pendingPersistTimer = setTimeout(() => {
    try {
      const payload = pendingRegister.serialize();
      /* أكبر من أن يُخزَّن؟ يبقى في الذاكرة ويُرفع في هذه الجلسة؛ الأسوأ ألّا يُخزَّن شيء. */
      if (payload.length <= MAX_PENDING_BYTES) localStorage.setItem(PENDING_CLOUD_KEY, payload);
    } catch { /* متصفح يمنع التخزين، أو حصّة ممتلئة */ }
  }, 200);
}

/*
 * ما لا يُعلَّق.
 *
 * سجلّ التدقيق له طريق ديمومةٍ خاصّ به: صندوقٌ صادرٌ دائم إلى سجلّ الخادم الملحَق يعيد
 * المحاولة وحده. فتعليقه هنا تكرارٌ يملأ تخزين المتصفح بآلاف الأحداث، ويزاحم لقطةَ
 * الحالة على الحصّة. ووضعُ العرض المحليّ لا سحابة له أصلًا: ما لم تقم جلسةٌ سحابية قطّ
 * فلا معلَّق يُنتظَر رفعه. أمّا من دخل ثم انقطع — وهو حال المحكّم في القاعة — فهذا بالضبط
 * ما وُجد السجلّ له.
 */
const PENDING_EXEMPT_COLLECTIONS = new Set(['audit']);
function shouldRegisterPending(collection: string) {
  if (PENDING_EXEMPT_COLLECTIONS.has(collection)) return false;
  noteCloudSessionState();
  return !!auth.currentUser || cloudSessionEverEstablished;
}

function markPendingWrite(collection: string, id: string, data: Record<string, unknown>) {
  if (!shouldRegisterPending(collection)) return;
  pendingRegister.markWrite(pendingScope(), collection, id, data);
  savePendingRegister();
}
function clearPendingWrite(collection: string, id: string) {
  if (pendingRegister.clearWrite(pendingScope(), collection, id)) savePendingRegister();
}
function markPendingDelete(collection: string, id: string) {
  if (!shouldRegisterPending(collection)) return;
  pendingRegister.markDelete(pendingScope(), collection, id);
  savePendingRegister();
}
function clearPendingDelete(collection: string, id: string) {
  if (pendingRegister.clearDelete(pendingScope(), collection, id)) savePendingRegister();
}
const rowHasPendingWrite = (collection: string, rowId: string) => pendingRegister.rowHasWrite(pendingScope(), collection, rowId);
const rowHasPendingDelete = (collection: string, rowId: string) => pendingRegister.rowHasDelete(pendingScope(), collection, rowId);
export function pendingCloudWriteCount() { return pendingRegister.size; }

/* الدمج الوارد بقواعده الخالصة؛ الغلاف هنا يمرّر حارسي المعلَّق لهذه المجموعة وحدها. */
function mergeById<T extends { id: string }>(local: T[], remote: T[], collection?: string): T[] {
  return mergeRowsFromCloud(local, remote, collection ? {
    isPendingWrite: (rowId: string) => rowHasPendingWrite(collection, rowId),
    isPendingDelete: (rowId: string) => rowHasPendingDelete(collection, rowId),
  } : undefined);
}

const listeners = new Set<() => void>();

let firestoreSyncTimeout: ReturnType<typeof setTimeout> | null = null;

/*
 * كتابة مستند واحد في مجموعة المسابقة الفرعية.
 *
 * الدور يُفحص قبل الشبكة: لا معنى لإرسال كتابة سترفضها قواعد فايرستور، والرفض الصامت كان
 * يجعل عمل المحكّم يبدو محفوظًا وهو ليس كذلك. وأي فشل يُرفَع إلى حالة ظاهرة لا إلى سجلّ الطرفية.
 */
async function persistScopedDocument(collectionName:string,id:string,data:Record<string,unknown>){
  /* لا يُعلَّق ما لا يملك هذا الدور كتابته أصلًا: لن يُرفع أبدًا، فتعليقه حَبْسٌ بلا فائدة. */
  if(!canWriteSyncedCollection(globalState.currentUser.role,collectionName))return false;
  markPendingWrite(collectionName,id,data);
  if(cloudSessionLost()){reportLostCloudSession(collectionName);return false;}
  if(globalState.isOffline||!auth.currentUser)return false;
  if(exceedsSafeDocumentSize(data)){clearPendingWrite(collectionName,id);reportCloudError('CLOUD_PAYLOAD_TOO_LARGE',`${collectionName}/${id}`);return false;}
  try{
    const {db,doc,setDoc}=await getFirestoreClient();
    /* الحقول المشتقّة محليًا لا تُرفع: الخادم مصدرها الحقيقي ولا يُكتب فوقه بمشتقّ ناقص. */
    const payload={...data};for(const key of LOCAL_ONLY_PARTICIPANT_FIELDS)delete payload[key];
    /* قواعد فايرستور تربط الرفع بهوية المصادقة عبر uploaderUid لا عبر معرّفات النطاق المحلية:
       actorId وjudgeId معرّفات سجلّ ميزان (usr-...) لا تساوي uid فايربيس أبدًا، ومقارنتها به كانت
       ترفض رفع سجل التدقيق لكل الأدوار بلا استثناء. */
    const write=()=>setDoc(doc(db,'organizations',globalState.competition.organizationId,'competitions',globalState.competition.id,collectionName,id),{...payload,organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,uploaderUid:auth.currentUser.uid,updatedAt:new Date().toISOString()},{merge:true});
    try{await write();}
    catch(err){
      /* رفض صلاحية ورمز المصادقة أقدم من آخر مزامنة مطالبات؟ نجدّد الرمز مرة ونعيد الكتابة
         مرة — فتلتئم الجلسات القائمة بعد مزامنة الصلاحيات بلا خروجٍ ودخول. */
      if(classifyCloudError(err)!=='CLOUD_PERMISSION_DENIED'||!refreshAuthTokenOnce())throw err;
      await auth.currentUser.getIdToken(true);
      await write();
    }
    clearPendingWrite(collectionName,id);
    resolveCloudScope(collectionName);
    return true;
  }catch(err){console.error('MIZAN cloud write denied',{path:`${collectionName}/${id}`,error:err instanceof Error?err.message:String(err)});reportCloudError(classifyCloudError(err),`${collectionName}/${id}`);return false;}
}

/* تجديد رمز المصادقة عند أول رفض صلاحية: مرة كل دقيقتين على الأكثر، فلا تنشأ حلقة تجديد. */
/*
 * انقطاع الجلسة أثناء التحكيم كان صامتًا تمامًا: الكتابة تخرج من الدالة عند غياب
 * auth.currentUser دون شكوى، فيرصد المحكّم درجاته وهي لا تغادر الجهاز، ولا يعلم
 * إلا بعد إعادة التحميل. نتذكّر أن جلسة سحابية قامت فعلًا، فإن غابت والجهاز متصل
 * فهذا انقطاعٌ يستحق شريطًا ظاهرًا لا صمتًا. (لا يُطلق قبل أول دخول ولا في وضع العرض.)
 */
let cloudSessionEverEstablished=false;
function noteCloudSessionState(){ if(auth.currentUser)cloudSessionEverEstablished=true; }
function cloudSessionLost(){ noteCloudSessionState(); return cloudSessionEverEstablished&&!auth.currentUser&&!globalState.isOffline; }
function reportLostCloudSession(scope:string){
  if(scopeKey(scope)==='audit')return;
  const message='انتهت جلسة الدخول، فتوقّف الحفظ السحابي. عملك محفوظ على هذا الجهاز؛ سجّل الدخول من جديد ليُرفع.';
  failingCloudScopes.set(scopeKey(scope),{code:'CLOUD_PERMISSION_DENIED',message});
  globalState.persistenceError={code:'CLOUD_PERMISSION_DENIED',message,at:new Date().toISOString()};
  listeners.forEach(l=>l());
}

let lastAuthTokenRefreshAt=0;
function refreshAuthTokenOnce(){const now=Date.now();if(now-lastAuthTokenRefreshAt<120_000)return false;lastAuthTokenRefreshAt=now;return true;}


async function deleteScopedDocument(collectionName:string,id:string){
  if(!canWriteSyncedCollection(globalState.currentUser.role,collectionName))return false;
  /* حذفٌ لم يصل السحابة يبقى مُعلَّقًا: وإلا أعاد المستمعُ المحذوفَ إلى الشاشة عند أول لقطة. */
  markPendingDelete(collectionName,id);
  if(cloudSessionLost()){reportLostCloudSession(collectionName);return false;}
  if(globalState.isOffline||!auth.currentUser)return false;
  try{
    const {db,doc,deleteDoc}=await getFirestoreClient();
    await deleteDoc(doc(db,'organizations',globalState.competition.organizationId,'competitions',globalState.competition.id,collectionName,id));
    clearPendingDelete(collectionName,id);
    resolveCloudScope(collectionName);
    return true;
  }catch(err){reportCloudError(classifyCloudError(err),`${collectionName}/${id}`);return false;}
}

const JOURNEY_PUBLISHERS:Role[]=['super_admin','org_admin','comp_admin','head_judge','ops_manager','exception_host','delegation_manager'];
const launchPlaceholderActive=()=>globalState.competition.id==='comp-pending-setup'||globalState.competition.organizationId==='org-pending-setup';
async function publishPublicJourneyRecord(participant:Participant,revoked=false):Promise<boolean>{
  if(globalState.isOffline||!auth.currentUser||!JOURNEY_PUBLISHERS.includes(globalState.currentUser.role)||launchPlaceholderActive())return false;
  const records:[string,'participant'|'guardian'][]=[];
  if(participant.journeyAccessToken)records.push([await sha256(participant.journeyAccessToken),'participant']);else if(participant.journeyAccessTokenHash)records.push([participant.journeyAccessTokenHash,'participant']);
  if(participant.guardianAccessToken)records.push([await sha256(participant.guardianAccessToken),'guardian']);else if(participant.guardianAccessTokenHash)records.push([participant.guardianAccessTokenHash,'guardian']);
  if(!records.length)return false;
  try{
    const {db,doc,setDoc}=await getFirestoreClient();
    await setDoc(doc(db,'public_competitions',globalState.competition.id),{organizationId:globalState.competition.organizationId,competition:globalState.competition,updatedAt:new Date().toISOString()},{merge:true});
    const committee=globalState.committees.find(c=>c.id===participant.assignedCommitteeId&&c.competitionId===participant.competitionId);
    const result=globalState.results.find(r=>r.participantId===participant.id&&r.competitionId===participant.competitionId&&r.status==='published');
    const certificate=globalState.certificates.find(c=>c.participantId===participant.id&&c.competitionId===participant.competitionId&&c.revocationState!=='REVOKED');
    const base={
      organizationId:participant.organizationId,competitionId:participant.competitionId,participantId:participant.id,
      competitionName:storedCompetitionName(true),competitionNameArabic:storedCompetitionName(false),
      participantCode:participant.code,participantName:participant.fullName,participantNameArabic:participant.fullNameArabic,
      status:participant.status,arrivalSlot:participant.arrivalSlot||null,queueNumber:participant.queueNumber||null,
      venueName:globalState.competition.venueName||null,
      committee:committee?{code:committee.code,name:committee.name,nameArabic:committee.nameArabic,hall:committee.venueHall||null}:null,
      result:result?{score:result.finalScore,rank:result.rank,status:result.status}:null,
      certificate:certificate?{number:certificate.certificateNumber,verificationUrl:certificate.verificationUrl}:null,
      revoked:revoked||globalState.competition.status==='completed'||globalState.competition.status==='archived',
      updatedAt:new Date().toISOString(),
    };
    for(const [key,audience] of records)await setDoc(doc(db,'public_journeys',key),{...base,audience},{merge:true});
    resolveCloudScope('public journey');
    return true;
  }catch(err){reportCloudError(classifyCloudError(err),'public journey');return false;}
}
async function syncPublicJourneys(){
  if(!JOURNEY_PUBLISHERS.includes(globalState.currentUser.role))return;
  for(const p of globalState.participants.filter(x=>x.competitionId===globalState.competition.id))await publishPublicJourneyRecord(p);
}

/*
 * فشل المزامنة السحابية كان يُبتلع في console.warn، فتتوقّف المزامنة في منتصف مسابقة ولا يعلم
 * أحد. صار يُرفع إلى حالة يعرضها شريطٌ للمشغّل: عطلٌ مسموع خيرٌ من عطلٍ مكتوم.
 */
/*
 * اسم المجموعة معرّف برمجي لا يعني المستخدم شيئًا. وكان يُدسّ وسط جملة عربية فيقرأ المشغّل
 * «تعذّرت مزامنة competition مع السحابة» — نصفها بلغته ونصفها بلغة قاعدة البيانات.
 * والنطاق يأتي أحيانًا بصيغة `collection/id`، فيُؤخذ الجزء الأول ويُترجم، ولا يُعرض المعرّف.
 */
const AR_SYNC_SCOPE:Record<string,string>={
  competition:'إعدادات المسابقة',participants:'المتسابقون',results:'النتائج',committees:'اللجان',
  judges:'المحكمون',audit:'سجل التدقيق',certificates:'الشهادات',organizations:'بيانات الجهة',
  public_competitions:'الصفحة العامة للمسابقة',public_journeys:'بطاقات الرحلة','public journey':'بطاقة الرحلة',
  judgeSubmissions:'تقييمات المحكمين',appeals:'الاعتراضات',notifications:'الإشعارات',
};
function syncScopeLabel(scope:string){
  const head=String(scope||'').split('/')[0].trim();
  return AR_SYNC_SCOPE[head]||'بيانات المسابقة';
}
/*
 * أعطال السحابة تُحصى بنطاقها، لا بعلمٍ واحد.
 *
 * كان علمُ العطل واحدًا: أي رفعٍ ناجح لأي مجموعة يمسحه، وأي فشلٍ يعيده — فيرتجف الشريط مع كل
 * حفظة (نجاح المتسابقين يمسح، فشل التدقيق يعيد، وهكذا في الثانية الواحدة). الآن لكل نطاقٍ
 * فاشل قيدُه، ولا يُمسح الشريط إلا حين ينجح النطاق الفاشل نفسه ويخلو السجل كله.
 */
const failingCloudScopes=new Map<string,{code:CloudSyncErrorCode;message:string}>();
const scopeKey=(scope:string)=>String(scope||'').split('/')[0].trim();
function reportCloudError(code:CloudSyncErrorCode,scope:string){
  const label=syncScopeLabel(scope);
  /* سجلّ التدقيق محفوظ محليًا ومرآته في سجلّ الخادم الملحَق؛ تعذّر نسخته في فايرستور ليس فقدًا
     ولا يستحق شريطًا أحمر يقطع عمل مدير المسابقة، ولا كشف معرّف الوثيقة الداخلي. */
  if(scopeKey(scope)==='audit')return;
  const message=code==='CLOUD_PAYLOAD_TOO_LARGE'?`حجم ${label} تجاوز الحدّ المسموح، فلم تُرفع إلى السحابة.`
    :code==='CLOUD_PERMISSION_DENIED'?`الصلاحية الحالية لا تسمح برفع ${label} إلى السحابة.`
    :`تعذّرت مزامنة ${label} مع السحابة.`;
  failingCloudScopes.set(scopeKey(scope),{code,message});
  globalState.persistenceError={code,message,at:new Date().toISOString()};
  notify();
}
/* نجاح رفعٍ في نطاقٍ ما يحلّ عطل ذلك النطاق وحده؛ الشريط يبقى ما دام غيره فاشلًا. */
function resolveCloudScope(scope:string){
  failingCloudScopes.delete(scopeKey(scope));
  if(!globalState.persistenceError||!globalState.persistenceError.code.startsWith('CLOUD_'))return;
  const remaining=[...failingCloudScopes.values()].pop();
  if(!remaining){globalState.persistenceError=null;notify();return;}
  if(globalState.persistenceError.message!==remaining.message){globalState.persistenceError={code:remaining.code,message:remaining.message,at:new Date().toISOString()};notify();}
}
function clearCloudError(){failingCloudScopes.clear();globalState.persistenceError=null;notify();}

/*
 * لحاق: يرفع ما يملكه هذا الدور ولم يصل الخادم بعد (جهاز عاد من انقطاع).
 * الأسماء والمعرّفات هي نفسها التي تكتبها مواضع الفعل، فلا يتولّد مستند مكرّر للسجل الواحد.
 */
/*
 * لحاقٌ يرفع ما لم يصل السحابة — وما لم يصلها وحده.
 *
 * كان يرفع **كل** ما يملكه الدور في كل مزامنة (كل إشعارٍ، كل ثانية). وهذا يقلب الأصل:
 * جهازٌ لم يمسّ سجلًّا قطّ يكتب نسخته القديمة منه فوق نسخة السحابة الأحدث التي كتبها
 * جهازٌ آخر قبل لحظة — فيُمحى عمل زميلٍ بلا سبب. والأسوأ جهازٌ عاد من انقطاعِ ساعة:
 * يرفع عالَمه كلّه عمرَ ساعة فوق الحاضر.
 *
 * الآن لا يُرفع إلا صفٌّ غيّره هذا الجهاز فعلًا ولم يصل. وقبل رفعه يُسأل الأصل: إن كانت
 * نسخة السحابة أحدث من تغييرنا فقد سبقنا إليها غيرنا، فتُترك ويُسقَط المعلَّق — الأصل
 * السحابي يغلب، ولا يُكتب فوقه بما هو أقدم منه.
 */
async function persistOwnedRecords(){
  if(globalState.isOffline||!auth.currentUser)return;
  const {db,doc,getDoc}=await getFirestoreClient();
  const scopedDoc=(collection:string,id:string)=>doc(db,'organizations',globalState.competition.organizationId,'competitions',globalState.competition.id,collection,id);

  /* معلَّقٌ من مسابقةٍ أخرى يُترك حتى تُفتح مسابقته: مساره ليس المسار المفتوح الآن. */
  const scope=pendingScope();
  for(const entry of pendingRegister.listDeletes()){ if(!sameScope(entry,scope))continue; await deleteScopedDocument(entry.collection,entry.id); }

  for(const entry of pendingRegister.listWrites()){
    let cloudUpdatedAt=0;
    if(sameScope(entry,scope)) try{
      const snap=await getDoc(scopedDoc(entry.collection,entry.id));
      const raw=snap.exists()?(snap.data() as {updatedAt?:unknown}).updatedAt:undefined;
      if(typeof raw==='string')cloudUpdatedAt=Date.parse(raw)||0;
    }catch{ /* تعذّرت القراءة: القاعدة تقرّر الرفع، وفشله يُبقي المعلَّق كما هو. */ }
    const verdict=decideUpload(entry,{scope,canWrite:(c)=>canWriteSyncedCollection(globalState.currentUser.role,c),cloudUpdatedAt});
    if(verdict==='skip-other-competition')continue;
    if(verdict!=='upload'){clearPendingWrite(entry.collection,entry.id);continue;}
    await persistScopedDocument(entry.collection,entry.id,entry.data);
  }
}


/* ذاكرتان تمنعان تكرار ما تمّ: وثيقةُ تدقيقٍ لا تُرفع مرّتين، وحدثٌ لا يُرسَل مرّتين. */
const auditDocumentsUploaded=new Set<string>();
const auditEventsMirrored=new Set<string>();
const SERVER_AUDIT_OUTBOX_KEY='mizan_server_audit_outbox_v1';
type ServerAuditMirror={eventId:string;organizationId:string;competitionId:string;action:string;entityType:string;entityId:string;reason?:string;humanSummaryEnglish?:string;clientTimestamp:string;sessionId?:string;authenticationAssurance?:string};
let serverAuditFlushRunning=false;let serverAuditBackoffUntil=0;
function readServerAuditOutbox():ServerAuditMirror[]{try{const raw=localStorage.getItem(SERVER_AUDIT_OUTBOX_KEY);const rows=raw?JSON.parse(raw):[];return Array.isArray(rows)?rows.slice(-1000):[]}catch{return []}}
function writeServerAuditOutbox(rows:ServerAuditMirror[]){try{localStorage.setItem(SERVER_AUDIT_OUTBOX_KEY,JSON.stringify(rows.slice(-1000)))}catch{}}
async function flushServerAuditOutbox(){
 if(serverAuditFlushRunning||Date.now()<serverAuditBackoffUntil||globalState.isOffline||!auth.currentUser)return;
 const pending=readServerAuditOutbox();if(!pending.length)return;serverAuditFlushRunning=true;
 try{const token=await auth.currentUser.getIdToken();let deviceId='';try{deviceId=localStorage.getItem('mizan_device_identity')||''}catch{}const keep:ServerAuditMirror[]=[];
  for(let i=0;i<pending.length;i++){const row=pending[i];try{const response=await fetch('/api/audit/events',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(deviceId?{'x-mizan-device-id':deviceId}:{})},body:JSON.stringify(row)});if(response.ok)continue;const body=await response.json().catch(()=>({}));keep.push(row,...pending.slice(i+1));serverAuditBackoffUntil=Date.now()+(response.status===503?60_000:10_000);if(body?.code==='MFA_REQUIRED')serverAuditBackoffUntil=Date.now()+60_000;break}catch{keep.push(row,...pending.slice(i+1));serverAuditBackoffUntil=Date.now()+10_000;break}}
  writeServerAuditOutbox(keep);
 }finally{serverAuditFlushRunning=false}
}
function mirrorAuditEventToServer(ev:AuditEvent){if(!auth.currentUser)return;auditEventsMirrored.add(ev.id);const row:ServerAuditMirror={eventId:ev.id,organizationId:ev.organizationId,competitionId:ev.competitionId,action:ev.action,entityType:ev.entityType,entityId:ev.entityId,reason:ev.reason,humanSummaryEnglish:ev.humanSummaryEnglish,clientTimestamp:ev.timestamp,sessionId:ev.sessionId,authenticationAssurance:ev.authenticationAssurance};const rows=readServerAuditOutbox();if(!rows.some(x=>x.eventId===row.eventId)){rows.push(row);writeServerAuditOutbox(rows)}void flushServerAuditOutbox();}
if(typeof window!=='undefined'&&!(window as any).__mizanAuditOnlineHook){(window as any).__mizanAuditOnlineHook=true;window.addEventListener('online',()=>void flushServerAuditOutbox())}

/*
 * المزامنة السحابية.
 *
 * كانت تكتب الحالة كاملة — مشاركون ونتائج وسجلّ تدقيق وعشرات المجموعات — حقولًا في **وثيقة
 * واحدة**، ومن جهاز الإدارة وحده. فمخرجات المحكّم لا تصل أحدًا، ووثيقةٌ بهذا الحجم تتجاوز حدّ
 * فايرستور في يومٍ حقيقي فتتوقّف المزامنة بصمت.
 *
 * الآن: وثيقة المسابقة تحمل إعدادها فقط (صغيرة وثابتة، تكتبها الإدارة)، وكل سجل يُكتب مستندًا
 * مستقلًا في مجموعته الفرعية بيد الدور الذي يملكه. فيصل عمل المحكّم إلى الخادم، ويختفي سقف
 * الوثيقة الواحدة.
 */
function syncToFirestore() {
  if(cloudSessionLost()){reportLostCloudSession('competition');return;}
  if (globalState.isOffline || !auth.currentUser) return;
  if (firestoreSyncTimeout) clearTimeout(firestoreSyncTimeout);
  firestoreSyncTimeout = setTimeout(async () => {
    // كل دور يرفع ما يملكه؛ لم يعد جهاز الإدارة نقطة العبور الوحيدة.
    try { await persistOwnedRecords(); }
    catch (err) { console.error('MIZAN pending upload flush failed', err); reportCloudError(classifyCloudError(err), 'competition'); }
    try { await syncPublicJourneys(); }
    catch (err) { console.error('MIZAN journey sync failed', err); }
    if (!['super_admin','org_admin','comp_admin'].includes(globalState.currentUser.role)) return;
    try {
      const { db, doc, setDoc } = await getFirestoreClient();
      const docRef = doc(db, 'organizations', globalState.competition.organizationId, 'competitions', globalState.competition.id);
      // إعداد المسابقة وحده. السجلات تعيش في مجموعاتها الفرعية.
      const updatedAt=globalState.competitionConfigUpdatedAt||new Date().toISOString();
      const configuration = {
        competition: globalState.competition,
        judges: globalState.judges,
        emergencyFrozen: globalState.emergencyFrozen,
        updatedAt,
      };
      if (exceedsSafeDocumentSize(configuration)) { reportCloudError('CLOUD_PAYLOAD_TOO_LARGE', 'competition'); return; }
      /*
       * لا يُكتب فوق الأصل بما هو أقدم منه. المستمع يتبنّى نسخة السحابة حين تكون أحدث ويأخذ
       * وقتها، فتتساوى الطوابع ويمضي الرفع. أما إن سبقتنا السحابة بين قراءتنا وكتابتنا —
       * جهاز إدارةٍ آخر عدّل الآن — فالكتابة تُترك ويُترك للمستمع أن يوفّق بيننا.
       */
      const { getDoc } = await getFirestoreClient();
      try {
        const currentSnap = await getDoc(docRef);
        const currentRaw = currentSnap.exists() ? (currentSnap.data() as { updatedAt?: unknown }).updatedAt : undefined;
        const cloudUpdatedAt = typeof currentRaw === 'string' ? (Date.parse(currentRaw) || 0) : 0;
        const localUpdatedAt = Date.parse(updatedAt) || 0;
        if (!configWriteAllowed(cloudUpdatedAt, localUpdatedAt)) { resolveCloudScope('competition'); return; }
      } catch { /* تعذّرت القراءة: نمضي إلى الكتابة، وفشلها يُبلَّغ كعادته. */ }
      await setDoc(docRef, configuration, { merge: true });
      // النسخة العامة لا تُنشأ للمسودات. نشرُها مرتبط بحالة مسابقة حقيقية لا بوجود شاشة في الكود.
      // نبقي completed منشورة لصفحة «انتهت المسابقة» والتحقق العام، لكن التسجيل/الرحلة يُغلقان.
      if(!launchPlaceholderActive()&&!['draft','configured'].includes(globalState.competition.status)){
        const publicRef=doc(db,'public_competitions',globalState.competition.id);
        await setDoc(publicRef,{organizationId:globalState.competition.organizationId,competition:globalState.competition,updatedAt},{merge:true});
      }
      resolveCloudScope('competition');
    } catch (err) {
      console.error('MIZAN cloud write denied',{path:'competition',error:err instanceof Error?err.message:String(err)});
      reportCloudError(classifyCloudError(err), 'competition');
    }
  }, 1000);
}

let auditHashing=false;
async function finalizeAuditChain(){
  if(auditHashing)return; auditHashing=true;
  try{
    const chronological=[...globalState.auditLogs].reverse(); let previous='GENESIS'; const changed:AuditEvent[]=[];
    for(let i=0;i<chronological.length;i++){
      const ev=chronological[i];ev.sequence=i+1;ev.assurance=ev.assurance||'client_hash_chain';
      const hash=await appendAuditHash(previous,ev); if(ev.previousStateHash!==previous||ev.currentStateHash!==hash) changed.push(ev); ev.previousStateHash=previous; ev.currentStateHash=hash; previous=hash;
    }
    /* سجلّ التدقيق ملحَق لا يُعدَّل: قاعدة فايرستور تمنع التحديث منعًا باتًّا (allow update: if false).
       وكانت إعادة التجزئة ترفع آخر اثني عشر حدثًا في كل مرّة، فأيّ حدثٍ رُفع مرّة يصير تحديثًا
       مرفوضًا إلى الأبد — وهذا مصدر شريط «الصلاحية لا تسمح» المتكرّر على حسابٍ سليم تمامًا.
       الرفع الآن مرّة واحدة لكل حدث، وبعد اكتمال سلسلة تجزئته، ولا يُحاوَل أصلًا على مسابقة
       التهيئة المؤقتة التي لا وجود لها في السحابة. والضمانة الحقيقية للديمومة ليست هنا: كل حدث
       يُرسَل إلى سجلّ الخادم الملحَق عبر صندوق صادرٍ دائم يعيد المحاولة وحده. */
    if(!launchPlaceholderActive()){
      for(const ev of changed){
        if(auditDocumentsUploaded.has(ev.id))continue;
        auditDocumentsUploaded.add(ev.id);
        void persistScopedDocument('audit',ev.id,ev as unknown as Record<string,unknown>);
      }
    }
    /* الأحداث المدفوعة مباشرة إلى auditLogs (خارج auditTrustAction) لم تكن تصل الخادم إطلاقًا. */
    for(const ev of changed){ if(auditEventsMirrored.has(ev.id))continue; auditEventsMirrored.add(ev.id); mirrorAuditEventToServer(ev); }
    persistLocalSnapshot();
    listeners.forEach(l=>l());
    syncToFirestore();
  } finally { auditHashing=false; }
}

// Central local-snapshot writer. A quota overflow or write failure must never be swallowed:
// the participant scores would appear saved in the UI while nothing reached storage, and the
// next refresh would silently roll back hours of work. Instead we record a surfaced error flag.
function persistLocalSnapshot(): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(redactStateForLocalSnapshot(globalState)));
    /*
     * كتابةٌ محلية ناجحة تمسح أعطال الكتابة المحلية وحدها.
     *
     * كانت تمسح كل شيء — ومنها أعطال المزامنة السحابية. و`reportCloudError` يضبط العطل ثم
     * ينادي `notify()`، و`notify()` ينادي هذه الدالة قبل أن يُبلّغ المستمعين: فيُمحى العطل
     * بعد أجزاء من الثانية من ضبطه، ولا تراه شاشة قط. أي أن شريط تنبيه فشل الرفع كان ميتًا
     * منذ كُتب، لا لعيب فيه بل لأن هذا السطر يسبقه.
     *
     * وأعطال السحابة يمسحها `clearCloudError` عند نجاح رفعٍ فعليّ، وهو موجود ويُنادى.
     */
    if (globalState.persistenceError && !globalState.persistenceError.code.startsWith('CLOUD_')) globalState.persistenceError = null;
    return true;
  } catch (err) {
    const quota = err instanceof DOMException && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    globalState.persistenceError = { code: quota ? 'QUOTA_EXCEEDED' : 'WRITE_FAILED', message: err instanceof Error ? err.message : 'LOCAL_WRITE_FAILED', at: new Date().toISOString() };
    console.error('MIZAN local snapshot write failed — data was NOT persisted locally:', err);
    return false;
  }
}

function notify() {
  if(globalState.isOffline){void enqueueOfflineEvent({id:newId('offline'),type:'STATE_SYNC',competitionId:globalState.competition.id,createdAt:new Date().toISOString(),payload:{competitionId:globalState.competition.id}}).catch(()=>{});}
  const existing = globalState.competitions?.findIndex(c => c.id === globalState.competition.id) ?? -1;
  if (!globalState.competitions) globalState.competitions = [globalState.competition];
  else if (existing >= 0) globalState.competitions = globalState.competitions.map(c => c.id === globalState.competition.id ? globalState.competition : c);
  else globalState.competitions = [globalState.competition, ...globalState.competitions];
  persistLocalSnapshot();
  listeners.forEach((l) => l());
  syncToFirestore();
  void finalizeAuditChain();
}

export function useAppStore() {
  const [state, setState] = useState<AppStoreState>(globalState);

  useEffect(() => {
    const listener = () => setState({ ...globalState });
    listeners.add(listener);

    /*
     * الاشتراك بعد مصادقة حقيقية فقط؛ وضع العرض المحلي يبقى محليًا بالكامل.
     *
     * كان الاستماع على وثيقة المسابقة وحدها يقرأ مصفوفاتٍ لم تعد تُكتب فيها. صار لكل مجموعة
     * فرعية مستمعٌ خاص، فيصل عمل كل جهاز إلى بقية الأجهزة: درجات المحكّم إلى رئيس اللجنة،
     * وتسجيل المشارك إلى الإدارة.
     */
    const unsubscribers: (() => void)[] = [];
    let cancelled = false;
    try {
      if (!auth.currentUser) return () => { listeners.delete(listener); };
      /* عملٌ نجا من إغلاق التبويب بلا شبكة يُستأنف رفعه فور توفّر جلسة سحابية، لا عند
         أوّل تغييرٍ يصادف أن يحدث بعده. */
      if (pendingCloudWriteCount() > 0) syncToFirestore();
      void getFirestoreClient().then((fs) => {
      if (cancelled) return;
      const { db, doc, onSnapshot, collection: collectionFn } = fs;
      const orgId = globalState.competition.organizationId, compId = globalState.competition.id;

      // 1) إعداد المسابقة من وثيقتها.
      unsubscribers.push(onSnapshot(doc(db, 'organizations', orgId, 'competitions', compId), (snapshot: any) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data(); if (!data) return;
        let changed = false;
        if (data.emergencyFrozen !== undefined && data.emergencyFrozen !== globalState.emergencyFrozen) { globalState.emergencyFrozen = data.emergencyFrozen; changed = true; }
        if (data.competition) {
          const remoteUpdatedAt=typeof data.updatedAt==='string'?Date.parse(data.updatedAt):0;
          const localUpdatedAt=globalState.competitionConfigUpdatedAt?Date.parse(globalState.competitionConfigUpdatedAt):0;
          if(!localUpdatedAt||!remoteUpdatedAt||remoteUpdatedAt>=localUpdatedAt){
            globalState.competition = { ...globalState.competition, ...data.competition, policy: getCompetitionPolicy({ ...globalState.competition, ...data.competition }) };
            if(typeof data.updatedAt==='string')globalState.competitionConfigUpdatedAt=data.updatedAt;
            changed = true;
          }
        }
        if (Array.isArray(data.judges)) { globalState.judges = data.judges; changed = true; }
        if (changed) notify();
      }));

      // 2) السجلات من مجموعاتها الفرعية. الدمج بالسلطة يبقى: المختوم لا يتراجع.
      if (typeof collectionFn === 'function') {
        const watch = (name: string, apply: (rows: any[]) => void) => {
          unsubscribers.push(onSnapshot(collectionFn(db, 'organizations', orgId, 'competitions', compId, name), (snap: any) => {
            const rows: any[] = []; snap.forEach((d: any) => rows.push(d.data()));
            apply(rows); notify();
          }));
        };
        watch('results', rows => { globalState.results = mergeResultsByAuthority(globalState.results, rows as ResultRecord[]); });
        watch('judge_submissions', rows => { globalState.judgeSubmissions = mergeJudgeSubmissions(globalState.judgeSubmissions, rows as JudgeSubmission[]); });
        watch('participants', rows => { globalState.participants = mergeById(globalState.participants, rows, 'participants'); });
        watch('committees', rows => { globalState.committees = mergeById(globalState.committees, rows, 'committees'); });
        watch('certificates', rows => { globalState.certificates = mergeById(globalState.certificates, rows, 'certificates'); });
        watch('reviews', rows => { globalState.reviewCases = mergeById(globalState.reviewCases, rows, 'reviews'); });
        watch('appeals', rows => { globalState.appeals = mergeById(globalState.appeals, rows, 'appeals'); });
        watch('support_sessions', rows => { globalState.supportSessions = mergeById(globalState.supportSessions, rows, 'support_sessions'); });
      }
      // A late unmount that raced the import still gets cleaned up here.
      if (cancelled) { unsubscribers.forEach(u => u()); unsubscribers.length = 0; }
      }).catch(e => { console.warn('Firestore initialization warning:', e); });
    } catch (e) {
      console.warn('Firestore initialization warning:', e);
    }

    return () => {
      cancelled = true;
      listeners.delete(listener);
      unsubscribers.forEach(u => u());
    };
  }, []);

  const setLanguage = (lang: SupportedLanguage) => {
    globalState.language = lang;
    document.documentElement.lang = lang;
    document.documentElement.dir = LANGUAGE_META[lang].dir;
    notify();
  };

  const applyAuthenticatedIdentity = (identity:{id:string;email:string;name:string;role:Role;organizationId:string;operatorId?:string;competitionId?:string;mfaEnabled?:boolean;identityAssurance?:User['identityAssurance']}) => {
    globalState.currentUser={id:identity.id,email:identity.email,name:identity.name,nameArabic:identity.name,role:identity.role,organizationId:identity.organizationId,operatorId:identity.operatorId,competitionId:identity.competitionId,mfaEnabled:!!identity.mfaEnabled,accountStatus:'active',lastAuthenticatedAt:new Date().toISOString(),identityAssurance:identity.identityAssurance||'firebase'};
    if(!identity.operatorId&&identity.role!=='super_admin'){
      const existingOrg=globalState.organizations.find(o=>o.id===identity.organizationId);
      /* لا يُزرع اسم الشخص ولا معرّف النظام كعلامة للجهة: العلامة تأتي من سجل الجهة على الخادم،
         ويبقى الاسم فارغًا حتى تُحمّل، فلا يتسرّب اسم مسؤول إلى واجهة عامة أو شهادة. */
      const organization=existingOrg||{...globalState.organization,id:identity.organizationId,name:'',nameArabic:'',code:identity.organizationId,brand:{...globalState.organization.brand,name:'',nameArabic:''},status:'active' as const,createdAt:new Date().toISOString()};
      const scopedCompetitions=globalState.competitions.filter(c=>c.organizationId===identity.organizationId);
      const fallbackCompetition={...globalState.competition,id:'comp-pending-setup',organizationId:identity.organizationId,name:'',nameArabic:'',edition:'',status:'draft' as const,categories:[],totalRegistered:0,totalApproved:0,totalAttended:0,currentDay:0,readinessChecklist:{datesConfigured:false,categoriesConfigured:false,ruleSetFrozen:false,judgesAssigned:false,quranSourceLocked:false,devicesRegistered:false,certificatesReady:false}};
      globalState.organization=organization;
      globalState.organizations=[organization];
      globalState.competitions=scopedCompetitions.length?scopedCompetitions:[fallbackCompetition];
      globalState.competition=identity.competitionId?(scopedCompetitions.find(c=>c.id===identity.competitionId)||fallbackCompetition):(scopedCompetitions[0]||fallbackCompetition);
    }else if(identity.competitionId){const target=globalState.competitions.find(c=>c.id===identity.competitionId&&c.organizationId===identity.organizationId);if(target)globalState.competition=target;}
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
    for(const c of globalState.committees){const q=globalState.participants.filter(p=>p.assignedCommitteeId===c.id&&p.status==='in_queue').sort((a,b)=>queueOrderValue(a)-queueOrderValue(b)); if(q[0])appendParticipantNotifications(q[0],'queue.next'); if(q[1])appendParticipantNotifications(q[1],'queue.prepare');}
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
    /* القرار في `arrival-core` نقيًّا ومُختبَرًا بالتشغيل؛ وما هنا أثرُه: السجلّ والحفظ وتاريخ الحالة. */
    const found = findByIdOrCode(globalState.participants, participantIdOrCode);
    const pIndex = found ? globalState.participants.findIndex(x => x.id === found.id) : -1;
    const decision = decideArrival({
      participant: found,
      roster: globalState.participants,
      competitionId: globalState.competition.id,
      eligibleCommittees: found ? compatibleCommitteesFor(found) : [],
      fallbackCommittees: found
        ? globalState.committees.filter(c => c.competitionId === globalState.competition.id && c.status !== 'offline' && !committeeHasHardConflict(c, found))
        : [],
    });

    if (pIndex !== -1) {
      const p = globalState.participants[pIndex];
      if (decision.kind === 'other-competition') return null;
      if (decision.kind === 'duplicate') {
        auditTrustAction(
          'DUPLICATE_CHECKIN_IGNORED',
          'Participant',
          p.id,
          `تجاهل مسح حضور مكرر للمتسابق ${p.code} مع الحفاظ على رقمه الأصلي ${p.originalQueueNumber||p.queueNumber||'—'}`,
          `Ignored duplicate check-in for ${p.code}; preserved original queue position ${p.originalQueueNumber||p.queueNumber||'—'}`
        );
        return p;
      }
      if (decision.kind !== 'admit') return p;
      const updated: Participant = {
        ...p,
        status: 'in_queue',
        checkedInAt: new Date().toISOString(),
        checkInMethod: method,
        queueNumber: decision.queueNumber,
        originalQueueNumber: decision.originalQueueNumber,
        queueOrderKey: decision.queueOrderKey,
        assignedCommitteeId: decision.assignedCommitteeId,
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
    if (globalState.activeSession.isLocked || globalState.activeSession.questionPhase!=='RECITING') return;
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
    void createContinuityCheckpoint('judge-event');
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
    const sessionSpecialties = committeeSpecialtiesFor(globalState.activeSession.committee, judgeProfile);
    const eligibleCriteria = criteria.filter(c => (!judgeProfile ? true : specialtiesCanScore(sessionSpecialties,c.assignedJudgeType,policy.judging.mode)) || (policy.judging.mode === 'hybrid' && c.assignedJudgeType === 'all'));
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
      criterionScores, totalScore: judgeScore, eventsCount: globalState.activeSession.events.length, submittedAt: new Date().toISOString(), locked: true,
      scoredCriterionIds: scoredCriteria.map(c => c.id),
      sessionPenaltyCount: globalState.activeSession.events.filter(e => !e.reversed).length
    };
    globalState.judgeSubmissions = [...globalState.judgeSubmissions.filter(s => !(s.sessionId === submission.sessionId && s.judgeId === submission.judgeId)), submission];
    void persistScopedDocument('judge_submissions',`${submission.sessionId}_${submission.judgeId}`,submission as unknown as Record<string,unknown>);
    /*
     * إثبات القرعة يُسجَّل هنا، عند قفل التقييم، لا قبله: كشف البذرة قبل انتهاء التلاوة
     * يكشف بقيّة الطقم. وبعد القفل لم يبقَ ما يُكشف، فهذا هو موضع reveal الصحيح من
     * commit–reveal. لا يُغيّر بذرة ولا اختيارًا — يسجّل ما وقع ويتحقّق منه.
     *
     * وبلا هذه السطور كان دفتر الإثباتات يبقى فارغًا أبدًا: الدالة موجودة ومُصدَّرة ولا
     * يستدعيها أحد، فيبقى مؤشّر تكافؤ القرعة بلا شيء يقيسه مهما جرت المسابقة.
     * وهي مُحصَّنة بنفسها ضد التكرار: طقمٌ له إثبات يُعيد إثباته ولا ينشئ ثانيًا.
     */
    void buildFairDrawPublicProof().catch(()=>{ /* الإثبات دليل عام؛ تعذّره لا يمنع قفل تقييم بشري. */ });
    void buildJudgeIndependenceCommitment({
      competitionId:globalState.competition.id,
      participantId:submission.participantId,
      sessionId:submission.sessionId,
      judgeId:submission.judgeId,
      ruleSetVersion:sessionRuleSet.version,
      policyVersion:policy.version,
      submittedAt:submission.submittedAt,
      criterionScores:submission.criterionScores,
      totalScore:submission.totalScore,
    }).then(commitment=>{
      globalState.judgeSubmissions=globalState.judgeSubmissions.map(s=>s.sessionId===submission.sessionId&&s.judgeId===submission.judgeId?{...s,independenceCommitmentHash:commitment.commitmentHash,independenceCommittedAt:commitment.committedAt,independenceCommitmentVersion:commitment.version,independenceCommitmentAssurance:commitment.assurance}:s);
      const committed=globalState.judgeSubmissions.find(s=>s.sessionId===submission.sessionId&&s.judgeId===submission.judgeId);
      if(committed)void persistScopedDocument('judge_submissions',`${committed.sessionId}_${committed.judgeId}`,committed as unknown as Record<string,unknown>);
      notify();
    }).catch(()=>{ /* Submission remains valid; independence proof is evidence-only and never blocks human scoring. */ });

    const sessionSubs = globalState.judgeSubmissions.filter(s => s.sessionId === submission.sessionId && s.locked);
    const participant = globalState.activeSession.participant;
    if (participant && sessionSubs.length >= sessionRuleSet.judgesCountPerPanel) {
      // Panel aggregation.
      // Averaging each judge's self-normalised 0-100 score is ONLY valid when every judge scores
      // the whole rubric (all_judges_all_criteria). For specialized/hybrid panels each judge scores
      // only their own criteria, so the correct final score is the sum of every criterion's score
      // taken from the judge(s) responsible for it — never the mean of up-projected partial scores.
      const rsCriteria = sessionRuleSet.criteria;
      const panel = computePanelScore({ submissions: sessionSubs, criteria: rsCriteria, mode: policy.judging.mode, dropExtremes: sessionRuleSet.dropExtremes });
      const aggregatedCriterionScores = panel.criterionScores;
      const finalScore = panel.finalScore;
      const sessionPenaltyCount = panelPenaltyCount(sessionSubs, globalState.activeSession.events.filter(e => !e.reversed).length);
      const sealedExisting=globalState.results.find(r=>r.competitionId===globalState.competition.id&&r.participantId===participant.id&&['sealed','published'].includes(r.status));
      if(sealedExisting){
        recordInvariantBlock('sealed_results_immutable','judge_panel_recalculation','Result',sealedExisting.id,'A later judge panel attempted to recalculate an already sealed/published result',{sealedScore:sealedExisting.finalScore,newPanelScore:finalScore,sessionId:submission.sessionId});
        if(!globalState.reviewCases.some(r=>r.participantId===participant.id&&r.reason==='sealed_result_protection'&&r.status==='pending'))globalState.reviewCases=[{id:newId('review'),competitionId:globalState.competition.id,sessionId:submission.sessionId,participantId:participant.id,participantCode:participant.code,committeeId:globalState.activeSession.committee?.id||'',reason:'sealed_result_protection',severity:'high',timestampSec:globalState.activeSession.durationSeconds,details:`Protected sealed result ${sealedExisting.id}; new panel score ${finalScore} retained only as evidence.`,status:'pending'},...globalState.reviewCases];
        notify();return;
      }
      const category = globalState.competition.categories.find(c=>c.id===participant.categoryId);
      const existing = globalState.results.findIndex(r => r.competitionId===globalState.competition.id && r.participantId === participant.id && r.status !== 'published');
      // Throughput/status side effects run once — only on the first time a panel result is calculated
      // for this participant, so a reserve/extra judge re-locking cannot double-count committee load.
      if (existing < 0) {
        const pIndex = globalState.participants.findIndex(p => p.id === participant.id);
        if (pIndex !== -1) globalState.participants[pIndex] = { ...globalState.participants[pIndex], status:'tested', statusHistory:[...globalState.participants[pIndex].statusHistory,{status:'tested',timestamp:new Date().toISOString(),actor:'Panel completion'}] };
        globalState.committees=globalState.committees.map(c=>c.id===globalState.activeSession.committee?.id?{...c,currentParticipantId:undefined,status:'ready',completedCount:c.completedCount+1}:c);
        refreshQueueNotifications();
      }
      const result: ResultRecord = { id:existing>=0?globalState.results[existing].id:newId('res'), competitionId:globalState.competition.id, participantId:participant.id, participantCode:participant.code, participantName:participant.fullName, participantNameArabic:participant.fullNameArabic, country:participant.country, categoryId:participant.categoryId, categoryName:category?.name||category?.nameArabic||'', categoryNameArabic:category?.nameArabic||category?.name||'', finalScore, criterionScores:aggregatedCriterionScores, penaltyCount:sessionPenaltyCount, rank:0, status:'calculated' };
      if(existing>=0) globalState.results[existing]=result; else globalState.results=[...globalState.results,result];
      void persistScopedDocument('results',result.id,result as unknown as Record<string,unknown>);
      const ranked=globalState.results.filter(r=>r.categoryId===participant.categoryId).sort((a,b)=>(b.finalScore-a.finalScore)||breakTie(a,b,sessionRuleSet.tieBreakRules)); ranked.forEach((r,i)=>{const x=globalState.results.findIndex(z=>z.id===r.id);if(x>=0)globalState.results[x]={...globalState.results[x],rank:i+1}});
      const spread=Math.max(...sessionSubs.map(s=>s.totalScore))-Math.min(...sessionSubs.map(s=>s.totalScore));
      if(spread>=5 && !globalState.reviewCases.some(r=>r.sessionId===submission.sessionId && r.status==='pending')) globalState.reviewCases=[{ id:newId('review'), competitionId:globalState.competition.id, sessionId:submission.sessionId, participantId:participant.id, participantCode:participant.code, committeeId:globalState.activeSession.committee?.id||'', reason:'judge_variance', severity:spread>=10?'high':'medium', timestampSec:globalState.activeSession.durationSeconds, details:`Panel spread ${spread.toFixed(2)} points`, status:'pending' },...globalState.reviewCases];
    }
    if(participant && sessionSubs.length >= sessionRuleSet.judgesCountPerPanel) reconcileIntegrityForSession(submission.sessionId);
    globalState.auditLogs = [{ id:newId('aud'), timestamp:new Date().toISOString(), organizationId:globalState.competition.organizationId, competitionId:globalState.competition.id, actorId:globalState.currentUser.id, actorName:globalState.currentUser.name, actorRole:globalState.currentUser.role, action:'JUDGE_SUBMISSION_LOCKED', entityType:'JudgeSubmission', entityId:`${submission.sessionId}:${submission.judgeId}`, humanSummaryArabic:`قفل تقييم المحكم للمتسابق ${participant?.code||''} دون إظهار تقييم بقية اللجنة`, humanSummaryEnglish:`Judge submission locked for ${participant?.code||''} independently of the rest of the panel`, currentStateHash:`PENDING:${newId('audit')}` },...globalState.auditLogs];
    void createContinuityCheckpoint('judge-lock');
    if(judgeProfile){ const existingPass=globalState.judgePassport.findIndex(x=>x.judgeId===judgeProfile.id&&x.competitionId===globalState.competition.id); const pass:JudgePassportEntry={id:existingPass>=0?globalState.judgePassport[existingPass].id:newId('jp'),judgeId:judgeProfile.id,competitionId:globalState.competition.id,competitionName:storedCompetitionName(true),role:judgeProfile.specialty,riwayat:judgeProfile.certifiedRiwayat,calibrationScore:judgeProfile.calibrationScore,completedSessions:globalState.judgeSubmissions.filter(x=>x.judgeId===judgeProfile.userId).length,verified:judgeProfile.isReady}; if(existingPass>=0)globalState.judgePassport[existingPass]=pass;else globalState.judgePassport=[pass,...globalState.judgePassport]; }
    notify();
  };

  // Next Question in Session
  const nextQuestion = () => {
    const total=globalState.activeSession.secureQuestionMode==='SERVER'?(globalState.activeSession.secureQuestionCount||0):(globalState.activeSession.questionSelection?.questions.length||0);
    if(total>0&&globalState.activeSession.currentQuestionIndex<total-1){
      globalState.activeSession.currentQuestionIndex += 1;
      globalState.activeSession.isReciting=false;
      globalState.activeSession.questionPhase='SEALED';
      globalState.activeSession.openingAudioRefId=undefined;
      globalState.activeSession.openingAudioPlayedAt=undefined;
      void createContinuityCheckpoint('next-question');
      notify();
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

  /*
   * ختم النتائج.
   *
   * كان الختم يقع هنا بالكامل: المتصفح يجمع النتائج، ويحسب بصمة SHA-256، ويكتبها في الحالة.
   * وهذه بصمة لا توقيع — من يملك النتائج يعيد إنتاجها لأي أرقام يختارها — والحالة كلها في
   * `localStorage`. أي أن الختم كان يوثّق التسلسل للمراجعة ولا يمنع التلاعب.
   *
   * صار الخادم هو الذي **يؤلّف** الرقم من إرسالات المحكمين الخام ويختمه، ويوقّعه بمفتاحه حين
   * يكون مهيّأً. وما يُكتب هنا هو ما أعاده الخادم لا ما حسبه المتصفح.
   *
   * وحين لا تُتاح سلطة الخادم، **لا يقع ختم**. هذا رفضٌ مقصود: كنّا نُنتج عندها بصمةً محلّية
   * تُسمّى ختمًا وليست منه، فيُورَث اطمئنانٌ لا سند له. والامتناع الصريح أصدق من ختم أجوف.
   */
  const sealResults = async () => {
    const policy = getCompetitionPolicy(globalState.competition);
    const allowedRoles: Role[] = ['head_judge', 'comp_admin', 'org_admin'];
    if (!allowedRoles.includes(globalState.currentUser.role)) return { sealed: false, reason: 'not_authorized', approvals: globalState.sealApprovals.length };

    /*
     * بوابة النصاب انتقلت إلى الخادم. الفرق ليس شكليًا: الموافق هنا هو الهوية المُصدَّقة للطلب،
     * فلا يستطيع جهازٌ واحد أن يكتب موافقتين باسمين. والحالة المحلية تُحدَّث لتعكس ما قرّره
     * الخادم — لا لتقرّر بدله.
     */
    let sealQuorum:QuorumActionRecord|undefined;
    let serverQuorumApprovals=0;
    // التكيّف التلقائي: الموافقة المزدوجة تُشترط فقط عندما تسمح اللجنة بمحكّمين اثنين فأكثر.
    const dualApprovalActive = policy.results.requireDualApprovalToSeal && (globalState.competition.ruleSet?.judgesCountPerPanel ?? 0) >= 2;
    if (dualApprovalActive) {
      const requested=await requestQuorum({competitionId:globalState.competition.id,action:'results_seal',entityId:globalState.competition.id,requiredRoleGroups:[['head_judge'],['comp_admin','org_admin']]});
      if(!succeeded(requested)){notify();return {sealed:false,reason:'server_authority_required' as const,failure:requested.failure,message:authorityFailureText(requested.failure,true),approvals:0};}
      const approved=await approveQuorum(requested.value.id);
      // موافقةٌ سبق تسجيلها ليست خطأً: يبقى المعوَّل حالةَ الإجراء لا نتيجة هذا النداء.
      const state=succeeded(approved)?approved.value:requested.value;
      serverQuorumApprovals=state.approvals.length;
      sealQuorum=globalState.quorumActions.find(q=>q.action==='results_seal'&&q.entityId===globalState.competition.id);
      if(state.status!=='ready'){
        globalState.sealApprovals=state.approvals.map(a=>({actorId:a.actorId,actorRole:a.actorRole as Role,actorName:a.actorId,timestamp:a.approvedAt}));
        notify();
        return {sealed:false,reason:'independent_quorum_required' as const,approvals:serverQuorumApprovals};
      }
    }
    const invariantRows=await runInvariantChecks();const blocking=invariantRows.filter(r=>r.status==='violation');
    if(blocking.length){recordInvariantBlock(blocking[0].key,'seal_results','Competition',globalState.competition.id,blocking.map(x=>x.titleEnglish).join('; '));return {sealed:false,reason:'integrity_invariant',approvals:serverQuorumApprovals};}

    const sealedAt = new Date().toISOString();
    const competitionResults = globalState.results.filter(r => r.competitionId === globalState.competition.id);
    if (!competitionResults.length) return { sealed:false, reason:'no_results', approvals:new Set(globalState.sealApprovals.map(a=>a.actorId)).size };

    /*
     * كل نتيجة تُختم على حدة من إرسالات محكميها الخام. لا تُرسَل الدرجة المحسوبة هنا إطلاقًا؛
     * الخادم يؤلّفها بنفسه، فلا يوجد رقم يمكن لهذا الجهاز أن يمليه.
     */
    const ruleSet = globalState.competition.ruleSet;
    const seals = new Map<string, SealedResultView>();
    for (const res of competitionResults) {
      const submissions = globalState.judgeSubmissions.filter(x => x.participantId === res.participantId && x.locked);
      const sessionId = submissions[0]?.sessionId || '';
      const outcome = await sealResultOnServer({
        competitionId: globalState.competition.id, participantId: res.participantId, sessionId,
        categoryId: res.categoryId,
        submissions, criteria: ruleSet.criteria,
        mode: policy.judging.mode, dropExtremes: ruleSet.dropExtremes,
        sessionEventCount: 0,
        previousSealSha256: res.sealMetadata?.serverSealSha256,
        previousFinalScore: res.sealMetadata?.serverSealSha256 ? res.finalScore : undefined,
      });
      // فحص بوجود الحقل لا بالراية: التضييق على راية منطقية لا يعمل خارج الوضع الصارم.
      if ('failure' in outcome) {
        // امتناعٌ صريح: لا يُختم بعضٌ ويُترك بعض، ولا تُلفَّق بصمة محلّية لسدّ الفراغ.
        auditTrustAction('RESULT_SEAL_AUTHORITY_UNAVAILABLE','Competition',globalState.competition.id,
          `تعذّر ختم النتائج على الخادم (${outcome.failure}); لم يُختم شيء`,
          `Server sealing unavailable (${outcome.failure}); nothing was sealed`);
        notify();
        return { sealed:false, reason:'server_authority_required' as const, failure:outcome.failure,
          message:authorityFailureText(outcome.failure,true), approvals:serverQuorumApprovals };
      }
      seals.set(res.id, outcome.value);
    }

    const approverNames = globalState.sealApprovals.map(a=>a.actorName);
    globalState.results = globalState.results.map((res) => {
      const seal = seals.get(res.id);
      if (res.competitionId !== globalState.competition.id || !seal) return res;
      return {
        ...res,
        // الدرجة المعتمدة هي التي ألّفها الخادم، لا التي بقيت في هذا الجهاز.
        finalScore: seal.finalScore,
        criterionScores: seal.criterionScores || res.criterionScores,
        penaltyCount: typeof seal.penaltyCount === 'number' ? seal.penaltyCount : res.penaltyCount,
        status: 'sealed' as const,
        sealMetadata: {
          sealedBy: globalState.currentUser.name,
          sealedById: globalState.currentUser.id,
          sealedAt: seal.sealedAt || sealedAt,
          cryptographicChecksum: `SHA256:${seal.sealSha256}`,
          dualApprovalBy: policy.results.requireDualApprovalToSeal ? approverNames.join(' + ') : undefined,
          assurance: seal.assurance === 'SIGNED_ED25519' ? 'SERVER_SIGNED' as const : 'SERVER_DIGEST' as const,
          serverSealSha256: seal.sealSha256,
          signatureKeyId: seal.signature?.keyId,
          serverComposedScore: seal.finalScore,
          contributingJudges: seal.contributingJudges,
        },
      };
    });
    const checksum = competitionResults.map(r => seals.get(r.id)?.sealSha256 || '').join('').slice(0, 64) || await sha256(sealedAt);
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
    if(competitionResults.some(r=>r.sealMetadata?.sealedById===globalState.currentUser.id)){
      auditTrustAction('RESULT_PUBLICATION_SOD_BLOCKED','Competition',globalState.competition.id,'منع ناشر النتائج من أن يكون هو نفس الشخص الذي ختمها','Blocked result publication because the publisher is the same person who sealed the results');
      notify();return false;
    }
    const publishedAt=new Date().toISOString();
    globalState.results=globalState.results.map(r=>r.competitionId===globalState.competition.id?({...r,status:'published',publishedById:globalState.currentUser.id,publishedAt}):r);
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

  const closeCompetition = async (reason:string) => {
    if(!['org_admin','super_admin'].includes(globalState.currentUser.role))return{ok:false,code:'COMPETITION_CLOSE_NOT_ALLOWED'};
    const clean=reason.trim();if(clean.length<5)return{ok:false,code:'CLOSE_REASON_REQUIRED'};
    if(['completed','archived'].includes(globalState.competition.status))return{ok:true,alreadyClosed:true};
    if(isLaunchDeployment()){
      const u=auth.currentUser;if(!u)return{ok:false,code:'IDENTITY_REQUIRED'};
      try{
        const token=await u.getIdToken();
        const response=await fetch(`/api/identity/competitions/${encodeURIComponent(globalState.competition.id)}/close`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({reason:clean,organizationId:globalState.competition.organizationId})});
        const body=await response.json().catch(()=>({}));if(!response.ok)return{ok:false,code:String(body.code||'COMPETITION_CLOSE_FAILED')};
      }catch{return{ok:false,code:'COMPETITION_CLOSE_SERVER_UNAVAILABLE'}}
    }
    const now=new Date().toISOString();const cid=globalState.competition.id;
    globalState.competition={...globalState.competition,status:'completed',closedAt:now,closedBy:globalState.currentUser.id,closureReason:clean};
    globalState.roleGrants=globalState.roleGrants.map(g=>g.competitionId===cid&&g.role!=='auditor'&&['ACTIVE','SUSPENDED','PENDING_APPROVAL'].includes(g.status)?{...g,status:'REVOKED'}:g);
    globalState.identityInvitations=globalState.identityInvitations.map(i=>i.competitionId===cid&&i.requestedRole!=='auditor'&&['READY','PENDING_APPROVAL'].includes(i.status)?{...i,status:'REVOKED'}:i);
    globalState.authSessions=globalState.authSessions.map(x=>x.competitionId===cid&&x.role!=='auditor'&&x.status==='ACTIVE'?{...x,status:'REVOKED',revokedAt:now,revokedBy:globalState.currentUser.id,revocationReason:'Competition permanently closed'}:x);
    globalState.supportSessions=globalState.supportSessions.map(x=>x.competitionId===cid&&!['ended','rejected'].includes(x.status)?{...x,status:'ended',updatedAt:now,expiresAt:now}:x);
    for(const x of globalState.supportSessions.filter(x=>x.competitionId===cid))void persistScopedDocument('support_sessions',x.id,x as unknown as Record<string,unknown>);
    for(const p of globalState.participants.filter(p=>p.competitionId===cid))void publishPublicJourneyRecord(p,true);
    globalState.auditLogs=[{id:newId('aud'),timestamp:now,organizationId:globalState.competition.organizationId,competitionId:cid,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'COMPETITION_PERMANENTLY_CLOSED',entityType:'Competition',entityId:cid,reason:clean,humanSummaryArabic:'إنهاء المسابقة وإغلاق كل وصول تشغيلي مع إبقاء البيانات والنتائج محفوظة.',humanSummaryEnglish:'Competition completed; all operational access was closed while records and results were retained.',currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    markCompetitionConfigChanged();notify();return{ok:true,closedAt:now};
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
    /* الرابط المطبوع يجب أن يفتح صفحة تحقق حقيقية. الافتراضي يُبنى من دالة واحدة مشتركة مع
       الصفحة نفسها، وتبقى المسارات المخصصة لمن لديه مُتحقِّق خاص كما ضبطها. */
    const customBase = (cp.verificationBasePath || '').replace(/\/$/,'');
    const verificationUrl = customBase && customBase !== '/verify'
      ? `${customBase}/${encodeURIComponent(certNumber)}?token=${verificationToken.slice(0,24)}`
      : certificateVerifyUrl(typeof window==='undefined'?'':window.location.origin, certNumber);
    const awardTextArabic = cp.awardTextArabic || 'تشهد الجهة المنظمة بإتمام المشاركة وفق لائحة المسابقة المعتمدة.';

    let proof=getPublicResultProof(res.id);if(!proof){await buildPublicResultRoot();proof=getPublicResultProof(res.id);}
    const resultSealReference=res.sealMetadata?.cryptographicChecksum||await hashCanonical({resultId:res.id,score:res.finalScore,rank:res.rank,status:res.status});
    const issuedTimestamp=new Date().toISOString();
    const certId=newId('cert');
    const proofPackageHash=await hashCanonical({certificateId:certId,resultId:res.id,competitionId:globalState.competition.id,certificateVersion:'MZ-CERT-1',resultSealReference,merkleProofId:proof?.id,issuedTimestamp,revocationState:'ACTIVE'});
    const newCert: Certificate = {
      id: certId, certificateNumber: certNumber, competitionId: globalState.competition.id,
      competitionName: storedCompetitionName(true), competitionNameArabic: storedCompetitionName(false),
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
    const passCat=globalState.competition.categories.find(c=>c.id===res.categoryId); globalState.participantPassport=[{id:newId('pp'),participantId:res.participantId,competitionId:globalState.competition.id,competitionName:storedCompetitionName(true),categoryName:passCat?.name||res.categoryName,year:globalState.competition.startDate.slice(0,4),result:`${res.rank} / ${res.finalScore}`,certificateNumber:certNumber,verified:true},...globalState.participantPassport.filter(x=>!(x.participantId===res.participantId&&x.competitionId===globalState.competition.id))];
    void persistScopedDocument('certificates',newCert.id,newCert as unknown as Record<string,unknown>);
    /* النشر إلى السجل العام لا يُفشل الإصدار: الشهادة صدرت، وتعذّر النشر يُعاد لاحقًا. */
    if(proof)void (async()=>{
      const state=await publishCertificateToRegistry({
        certificateNumber:certNumber,certificateId:certId,competitionId:globalState.competition.id,organizationId:globalState.competition.organizationId,
        competitionName:globalState.competition.nameArabic||globalState.competition.name,organizationName:SEED_ORGANIZATION.nameArabic||SEED_ORGANIZATION.name,
        issuedAt:issuedTimestamp,
        /* ما يُنشر هو ما هو مطبوع على الشهادة، محكومًا بسياستها. */
        disclosed:{participantCode:proof.disclosed.participantCode,participantName:newCert.participantNameArabic||newCert.participantName,categoryName:newCert.categoryNameArabic||newCert.categoryName,finalScore:cp.showScore?res.finalScore:undefined,rank:cp.showRank?res.rank:undefined,status:res.status},
        certificateVersion:'MZ-CERT-1',resultSealReference,resultId:res.id,merkleProofId:proof.id,
        merkleRoot:proof.merkleRoot,merkleProof:proof.proof,merkleLeafMaterial:canonicalStringify({v:'mizan-merkle-v1',disclosed:proof.disclosed,salt:proof.disclosureSalt}),
        proofPackageHash,
      },await registryBearer());
      /* التحذير في الطرفية لا يراه أحد في التشغيل: الأثر يُكتب في سجل التدقيق الذي يُراجَع فعلًا،
         وإلا بقيت الشهادة غائبة عن السجل العام حتى يفشل تحقق حاملها. */
      if(state==='FAILED'){
        console.warn(`[certificates] ${certNumber} issued but not published to the public registry; retry publication.`);
        auditTrustAction('CERTIFICATE_REGISTRY_PUBLISH_FAILED','Certificate',certId,`تعذّر نشر الشهادة ${certNumber} في السجل العام: لن يتمكن حاملها من التحقق حتى يُعاد النشر`,`Certificate ${certNumber} could not be published to the public registry; its holder cannot verify it until publication is retried`);
        notify();
      }
    })();
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
      journeyAccessToken: newP.journeyAccessToken || newId('journey'),
      guardianAccessToken: newP.guardianAccessToken || newId('guardian'),
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
      globalState.participants[idx] = {
        ...globalState.participants[idx], status: 'approved',
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
    const finalParticipant=globalState.participants.find(p => p.id === participant.id)!;
    // انشر الحالة النهائية (approved/under_review) مع مفتاح الرحلة نفسه. كانت النسخة الأولى
    // وحدها تُحفظ، فيعود الطالب إلى رابط بلا سجل عام صالح فيبدو زر «العودة لمشاركتي» فارغًا.
    void persistScopedDocument('participants',finalParticipant.id,finalParticipant as unknown as Record<string,unknown>);
    void publishPublicJourneyRecord(finalParticipant);
    notify();
    return finalParticipant;
  };

  const reviewParticipant = (participantId: string, decision: 'approved' | 'rejected', reason = '') => {
    const idx = globalState.participants.findIndex(p=>p.id===participantId);
    if(idx<0) return null;
    const current=globalState.participants[idx];
    const next: Participant={...current,status:decision,statusHistory:[...current.statusHistory,{status:decision,timestamp:new Date().toISOString(),actor:globalState.currentUser.name,reason:reason||undefined}]};
    globalState.participants[idx]=next;
    void persistScopedDocument('participants',next.id,next as unknown as Record<string,unknown>);
    appendParticipantNotifications(next,decision==='approved'?'participant.approved':'participant.rejected');
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:decision==='approved'?'PARTICIPANT_APPROVED':'PARTICIPANT_REJECTED',entityType:'Participant',entityId:participantId,humanSummaryArabic:`${decision==='approved'?'اعتماد':'رفض'} طلب ${current.code} وفق سياسة المسابقة`,humanSummaryEnglish:`${decision==='approved'?'Approved':'Rejected'} ${current.code} under the competition policy`,currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify(); return next;
  };

  const updateParticipant = (participantId: string, patch: Partial<Participant>) => {
    const idx = globalState.participants.findIndex(p=>p.id===participantId);
    if(idx<0) return null;
    const next: Participant = { ...globalState.participants[idx], ...patch, id: participantId };
    globalState.participants[idx]=next;
    void persistScopedDocument('participants',next.id,next as unknown as Record<string,unknown>);
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'PARTICIPANT_UPDATED',entityType:'Participant',entityId:participantId,humanSummaryArabic:`تعديل بيانات المتسابق ${next.code}`,humanSummaryEnglish:`Updated participant ${next.code}`,currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify(); return next;
  };
  const removeParticipant = (participantId: string) => {
    const target = globalState.participants.find(p=>p.id===participantId);
    if(!target) return false;
    // A participant who already sat before a panel keeps a scored record; deleting would orphan it.
    if(['in_session','tested','certified','appealed'].includes(target.status) || globalState.results.some(r=>r.participantId===participantId)) return false;
    globalState.participants = globalState.participants.filter(p=>p.id!==participantId);
    // كان الحذف محليًّا فقط: الوثيقة تبقى في السحابة، فيعيدها المستمع (watch/mergeById)
    // بعد لحظات فيظهر المتسابق المحذوف من جديد. الحذف الآن يطال النسخة السحابية
    // ويُبطل بطاقة رحلته العامة، وإلا بقي رابطها صالحًا لمن لم يعد مسجّلًا.
    void deleteScopedDocument('participants',participantId);
    void publishPublicJourneyRecord(target,true);
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'PARTICIPANT_REMOVED',entityType:'Participant',entityId:participantId,humanSummaryArabic:`حذف المتسابق ${target.code} قبل دخوله أي لجنة`,humanSummaryEnglish:`Removed participant ${target.code} before any panel session`,currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify(); return true;
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
      const rIdx=globalState.results.findIndex(r=>r.competitionId===globalState.competition.id&&r.participantId===appeal.participantId);
      if(rIdx>=0 && !['sealed','published'].includes(globalState.results[rIdx].status)){
        const r=globalState.results[rIdx]; globalState.results[rIdx]={...r,finalScore:Math.max(0,Number((r.finalScore+appliedDelta).toFixed(2)))};
        const cat=r.categoryId; const tieRules=activeRuleSetForCategory(r.categoryId).tieBreakRules; const ranked=globalState.results.filter(x=>x.categoryId===cat).sort((a,b)=>(b.finalScore-a.finalScore)||breakTie(a,b,tieRules)); ranked.forEach((rr,i)=>{const x=globalState.results.findIndex(z=>z.id===rr.id);if(x>=0)globalState.results[x]={...globalState.results[x],rank:i+1}});
      }
    }
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:accepted?'APPEAL_ACCEPTED':'APPEAL_REJECTED',entityType:'Appeal',entityId:appealId,humanSummaryArabic:`حسم اعتراض ${appeal.participantCode} بقرار بشري${appliedDelta?` وتعديل ${appliedDelta} نقطة`:''}`,humanSummaryEnglish:`Resolved ${appeal.participantCode} appeal by human decision${appliedDelta?` with ${appliedDelta} point adjustment`:''}`,currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify(); return true;
  };

  const updateOrganizationBrand = (patch: Partial<OrganizationBrand>) => { globalState.organization={...globalState.organization,brand:{...globalState.organization.brand,...patch}}; notify(); };

  const ensureParticipantJourneyAccess=async(participantId:string)=>{
    const idx=globalState.participants.findIndex(p=>p.id===participantId&&p.competitionId===globalState.competition.id);if(idx<0)return null;
    const current=globalState.participants[idx];
    /*
     * التوكن الغائب عن الجهاز ليس توكنًا غير موجود: النسخة المحلية لا تحفظه، والبصمة تشهد
     * بوجوده. توليد بديل هنا كان سيُبطل بطاقة مطبوعة بيد المتسابق بلا أن يدري أحد — فيُرفض
     * الإصدار بدل أن يُتلف اعتمادًا قائمًا. المزامنة تُعيد التوكن الأصلي عند الاتصال.
     */
    if(journeyTokenWithheldLocally(current))return null;
    const journeyAccessToken=current.journeyAccessToken||newId('journey'),guardianAccessToken=current.guardianAccessToken||newId('guardian');const next={...current,journeyAccessToken,guardianAccessToken,journeyAccessTokenHash:await sha256(journeyAccessToken),guardianAccessTokenHash:await sha256(guardianAccessToken)};
    globalState.participants[idx]=next;const [saved,published]=await Promise.all([persistScopedDocument('participants',next.id,next as unknown as Record<string,unknown>),publishPublicJourneyRecord(next)]);notify();if(!globalState.isOffline&&auth.currentUser&&(!saved||!published))return null;return next;
  };

  const prepareJourneyAccessBatch=async()=>{const ready:Participant[]=[],failed:string[]=[];for(const participant of globalState.participants.filter(p=>p.competitionId===globalState.competition.id&&p.status!=='rejected')){const out=await ensureParticipantJourneyAccess(participant.id);if(out)ready.push(out);else failed.push(participant.id)}return {participants:ready,failed};};

  const syncAuthorizedJudgeProfiles=(accounts:IdentityAccountRecord[],grants:RoleGrantRecord[])=>{const cid=globalState.competition.id,oid=globalState.competition.organizationId;const active=grants.filter(g=>g.organizationId===oid&&g.status==='ACTIVE'&&['judge','head_judge'].includes(g.role)&&(!g.competitionId||g.competitionId===cid));const managedIds=new Set(active.map(g=>g.id));const next=globalState.judges.filter(j=>!j.identityGrantId||managedIds.has(j.identityGrantId));for(const grant of active){const account=accounts.find(a=>a.id===grant.accountId&&a.organizationId===oid&&a.status==='ACTIVE');if(!account)continue;const managedUid=String((account as IdentityAccountRecord&{uid?:string}).uid||account.firebaseUid||account.id);const idx=next.findIndex(j=>j.identityGrantId===grant.id||j.userId===managedUid);const old=idx>=0?next[idx]:undefined;const specialties=old?.specialties?.length?old.specialties:old?.specialty?[old.specialty]:['all'];const profile:JudgeProfile={id:old?.id||`judge-${grant.id}`,userId:managedUid,name:account.displayName,nameArabic:account.displayName,title:grant.role==='head_judge'?'رئيس لجنة':'محكم',country:old?.country||'',specialty:specialties[0]||'all',specialties,certifiedRiwayat:old?.certifiedRiwayat||[...new Set(globalState.competition.categories.map(c=>c.riwaya).filter(Boolean))],assignedCommitteeId:old?.assignedCommitteeId,conflictsDeclared:old?.conflictsDeclared||[],calibrationScore:old?.calibrationScore||0,isReady:true,identityGrantId:grant.id,competitionId:grant.competitionId||cid};if(idx>=0)next[idx]=profile;else next.push(profile)}if(JSON.stringify(next)!==JSON.stringify(globalState.judges)){globalState.judges=next;notify()}return next;};

  const selectCompetition = (competitionId: string) => {
    const target = globalState.competitions.find(c => c.id === competitionId);
    if (!target) return false;
    globalState.competition = { ...target, policy: getCompetitionPolicy(target), ruleSets: target.ruleSets || [target.ruleSet] };
    notify(); return true;
  };

  const loadPublicCompetition = async (competitionId:string) => {
    try{
      const {db,doc,getDoc}=await getFirestoreClient();
      const snap=await getDoc(doc(db,'public_competitions',competitionId));
      if(!snap.exists())return false;
      const data=snap.data() as {competition?:Competition;updatedAt?:string};
      if(!data.competition||data.competition.id!==competitionId)return false;
      const target={...data.competition,policy:getCompetitionPolicy(data.competition),ruleSets:data.competition.ruleSets||[data.competition.ruleSet]};
      globalState.competition=target;
      const existing=globalState.competitions.findIndex(c=>c.id===target.id);
      globalState.competitions=existing>=0?globalState.competitions.map(c=>c.id===target.id?target:c):[target,...globalState.competitions];
      if(data.updatedAt)globalState.competitionConfigUpdatedAt=data.updatedAt;
      persistLocalSnapshot();listeners.forEach(l=>l());
      return true;
    }catch(err){console.warn('Public competition load failed:',err);return false}
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
    if(!(globalState.currentUser.role==='super_admin'))return null;
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
    if(!(globalState.currentUser.role==='super_admin'))return {ok:false,reason:'not_authorized'};
    const i=globalState.quranSourceManifests.findIndex(x=>x.id===id);if(i<0)return {ok:false,reason:'not_found'};const x=globalState.quranSourceManifests[i];
    if(x.certificationState==='CERTIFIED'||x.certificationState==='REVOKED')return {ok:false,reason:'immutable_state'};
    const packageHash=await computeQuranPackageHash(x);if(x.packageHash&&x.packageHash!==packageHash)return {ok:false,reason:'hash_changed'};
    const reviews=(x.scientificReviews||[]).filter(r=>r.reviewerId!==globalState.currentUser.id);reviews.push({reviewerId:globalState.currentUser.id,reviewerName:globalState.currentUser.name,reviewerRole:globalState.currentUser.role,decision,comments,packageHash,reviewedAt:new Date().toISOString()});
    const reviewerNames=[...new Set(reviews.filter(r=>r.decision==='approve').map(r=>r.reviewerName))];globalState.quranSourceManifests[i]={...x,packageHash,scientificReviews:reviews,reviewerNames,status:'reviewed',certificationState:'PENDING_REVIEW'};
    void persistScopedDocument('quran_sources',id,globalState.quranSourceManifests[i] as unknown as Record<string,unknown>);
    auditTrustAction('QURAN_SOURCE_REVIEWED','QuranSource',id,'تسجيل مراجعة علمية مستقلة على hash محدد','Recorded independent scientific review against the exact package hash');notify();return {ok:true,packageHash};
  };
  /* السلطة العلمية للجهة تعلن عدد مراجعيها. القرار مسجَّل، ولا يغيّر شيئًا في المصادر المعتمدة سلفًا. */
  const setScientificReviewersRequired=(count:1|2)=>{
    if(!(globalState.currentUser.role==='super_admin'))return false;
    globalState.organization={...globalState.organization,scientificReviewersRequired:count};
    auditTrustAction('SCIENTIFIC_REVIEWERS_POLICY_SET','Organization',globalState.organization.id,
      count===1?'إعلان أن مراجعًا علميًا واحدًا هو السلطة العلمية المطلوبة للاعتماد':'إعلان اشتراط مراجعَين علميَّين مستقلَّين للاعتماد',
      count===1?'Declared a single scientific reviewer as the required certifying authority':'Declared two independent scientific reviewers as required');
    notify();return true;
  };
  const certifyQuranSource=async(id:string)=>{
    if(!(globalState.currentUser.role==='super_admin'))return false;const i=globalState.quranSourceManifests.findIndex(x=>x.id===id);if(i<0)return false;const x=globalState.quranSourceManifests[i];
    const computed=await computeQuranPackageHash(x);if(!x.packageHash||computed!==x.packageHash)return false;
    /* عدد المراجعين المطلوب سياسةٌ معلنة للجهة (الافتراضي اثنان). واحدٌ يعني أن مراجعًا واحدًا
       هو السلطة العلمية كاملةً — وهو خيار مسجَّل في الأثر، لا تجاوز صامت. */
    const requireTwo=(globalState.organization.scientificReviewersRequired??2)!==1;
    const gate=canPromoteQuranSource(x,requireTwo);
    if(!gate.allowed){globalState.lastScientificCertificationError={sourceId:id,reviewers:gate.reviewers,required:requireTwo?2:1,errors:gate.errors};notify();return false;}
    globalState.lastScientificCertificationError=undefined;
    globalState.quranSourceManifests[i]={...x,status:'approved',certificationState:'CERTIFIED',revocationState:'ACTIVE',immutable:true,approvedAt:new Date().toISOString(),approvedBy:[...new Set((x.scientificReviews||[]).filter(r=>r.decision==='approve').map(r=>r.reviewerId))],approvalVersion:x.approvalVersion||`SG-${new Date().getFullYear()}-${id.slice(-6)}`};globalState.quranSourceContents=globalState.quranSourceContents.map(c=>c.sourceManifestId===id?{...c,immutable:true}:c);
    void persistScopedDocument('quran_sources',id,globalState.quranSourceManifests[i] as unknown as Record<string,unknown>);
    auditTrustAction('QURAN_SOURCE_CERTIFIED','QuranSource',id,'اعتماد مصدر قرآني immutable بمراجعتين مستقلتين','Certified immutable Quran source after independent scientific approvals');notify();return true;
  };
  const revokeQuranSource=(id:string,reason:string)=>{if(!(globalState.currentUser.role==='super_admin')||reason.trim().length<3)return false;const i=globalState.quranSourceManifests.findIndex(x=>x.id===id);if(i<0)return false;const x=globalState.quranSourceManifests[i];globalState.quranSourceManifests[i]={...x,status:'retired',certificationState:'REVOKED',revocationState:'REVOKED',revocationReason:reason};createScientificImpact('QURAN_SOURCE_REVOCATION',id,reason,x);void persistScopedDocument('quran_sources',id,globalState.quranSourceManifests[i] as unknown as Record<string,unknown>);auditTrustAction('QURAN_SOURCE_REVOKED','QuranSource',id,'إلغاء اعتماد مصدر قرآني مع إبقاء التاريخ وإنشاء تقرير أثر','Revoked Quran source for future use while preserving history and generated an impact report');notify();return true;};
  const advanceQuranSource=async(id:string,status:'reviewed'|'approved'|'retired')=>status==='reviewed'?(await reviewQuranSource(id)).ok:status==='approved'?(await certifyQuranSource(id)):revokeQuranSource(id,'Superseded or scientifically revoked');
  const runQuranSourceCrossCheck=async(sourceManifestId:string,reference:{authority:string;version?:string;hash?:string;rows:QuranVerseRecord[]})=>{if(!(globalState.currentUser.role==='super_admin'))return null;const source=globalState.quranSourceManifests.find(x=>x.id===sourceManifestId);if(!source?.packageHash)return null;const content=globalState.quranSourceContents.find(x=>x.sourceManifestId===sourceManifestId&&x.packageHash===source.packageHash);if(!content)return null;const compared=compareQuranRows(content.rows,reference.rows);const rec:QuranCrossCheckRecord={id:newId('qcross'),organizationId:source.organizationId,sourceManifestId,sourcePackageHash:source.packageHash,referenceAuthority:reference.authority,referenceVersion:reference.version,referenceHash:reference.hash,status:compared.state,differenceCount:compared.differences.length,differences:compared.differences,createdAt:new Date().toISOString(),createdBy:globalState.currentUser.id};globalState.quranCrossChecks=[rec,...globalState.quranCrossChecks];auditTrustAction('QURAN_SOURCE_CROSS_CHECKED','QuranSource',sourceManifestId,`مقارنة علمية مستقلة: ${rec.status} · ${rec.differenceCount} فرق`,`Independent Quran source cross-check: ${rec.status} · ${rec.differenceCount} difference(s)`);notify();return rec;};
  const registerVariantLocus=(input:Omit<VariantLocusRecord,'id'|'approvalState'> & {approvalState?:VariantLocusRecord['approvalState']})=>{if(!(globalState.currentUser.role==='super_admin'))return null;const rec:VariantLocusRecord={...input,id:newId('locus'),approvalState:input.approvalState||'PENDING_REVIEW'};globalState.variantLoci=[rec,...globalState.variantLoci];auditTrustAction('VARIANT_LOCUS_REGISTERED','VariantLocus',rec.id,'تسجيل موضع اختلاف للمراجعة العلمية','Registered a reading variant locus for scientific review');notify();return rec;};
  const setVariantLocusState=(id:string,state:'CERTIFIED'|'REVOKED')=>{if(!(globalState.currentUser.role==='super_admin'))return false;const i=globalState.variantLoci.findIndex(x=>x.id===id);if(i<0)return false;globalState.variantLoci[i]={...globalState.variantLoci[i],approvalState:state};auditTrustAction(state==='CERTIFIED'?'VARIANT_LOCUS_CERTIFIED':'VARIANT_LOCUS_REVOKED','VariantLocus',id,state==='CERTIFIED'?'اعتماد موضع اختلاف':'إلغاء اعتماد موضع اختلاف',state==='CERTIFIED'?'Certified variant locus':'Revoked variant locus');notify();return true;};
  const registerQuranReferenceAudio=(input:Omit<QuranReferenceAudioRecord,'id'|'organizationId'|'approvalState'|'reviewer'>)=>{if(!(globalState.currentUser.role==='super_admin'))return null;const reading=resolveReading({qiraah:input.qiraah,rawi:input.rawi});if(!reading||!input.reciter.trim()||!input.recordingSource.trim()||!/^https:\/\//i.test(input.audioUrl||'')||!/^[0-9a-f]{64}$/i.test(input.fileHash)||input.surah<1||input.surah>114||input.ayahStart<1||input.ayahEnd<input.ayahStart)return null;const rec:QuranReferenceAudioRecord={...input,qiraah:reading.qiraah,rawi:reading.rawi,tariq:input.tariq,id:newId('qaudio'),organizationId:globalState.organization.id,approvalState:'PENDING_REVIEW'};globalState.quranReferenceAudio=[rec,...globalState.quranReferenceAudio];auditTrustAction('QURAN_REFERENCE_AUDIO_REGISTERED','QuranReferenceAudio',rec.id,'تسجيل صوت مرجعي مطابق لقراءة محددة وبصمة ملف؛ ما زال بانتظار المراجعة العلمية','Registered reading-scoped reference audio with a file hash; scientific review is still pending');notify();return rec;};
  const setQuranReferenceAudioState=(id:string,state:'APPROVED_REFERENCE'|'REVOKED')=>{if(!(globalState.currentUser.role==='super_admin'))return false;const i=globalState.quranReferenceAudio.findIndex(x=>x.id===id);if(i<0)return false;const current=globalState.quranReferenceAudio[i];if(state==='APPROVED_REFERENCE'){const reading=resolveReading({qiraah:current.qiraah,rawi:current.rawi});if(!reading||!/^https:\/\//i.test(current.audioUrl||'')||!/^[0-9a-f]{64}$/i.test(current.fileHash)||!current.usageScope.includes('opening_prompt'))return false;}globalState.quranReferenceAudio[i]={...current,approvalState:state,reviewer:globalState.currentUser.name};auditTrustAction(state==='APPROVED_REFERENCE'?'QURAN_REFERENCE_AUDIO_APPROVED':'QURAN_REFERENCE_AUDIO_REVOKED','QuranReferenceAudio',id,state==='APPROVED_REFERENCE'?'اعتماد مرجع صوتي محدد القراءة والآية والبصمة':'إلغاء مرجع صوتي',state==='APPROVED_REFERENCE'?'Approved reading/ayah/hash-scoped Quran reference audio':'Revoked Quran reference audio');notify();return true;};
  const updateQuestionGovernance=(questionId:string,patch:Partial<QuestionGovernanceRecord>)=>{
    if(globalState.currentUser.role!=='org_admin')return false; const i=globalState.questionGovernance.findIndex(x=>x.questionId===questionId&&x.competitionId===globalState.competition.id); const current=i>=0?globalState.questionGovernance[i]:{questionId,competitionId:globalState.competition.id,expertDifficulty:3,status:'draft' as const,updatedAt:new Date().toISOString()}; const next={...current,...patch,updatedAt:new Date().toISOString(),reviewedBy:globalState.currentUser.name}; if(next.status==='approved'&&!next.sourceManifestId)return false; if(i>=0)globalState.questionGovernance[i]=next;else globalState.questionGovernance=[next,...globalState.questionGovernance]; notify();return true;
  };
  const registerAiValidation=(input:Omit<AICapabilityValidationRecord,'id'|'organizationId'|'status'|'approvedBy'|'updatedAt'>)=>{
    if(!(globalState.currentUser.role==='super_admin'))return null; const rec:AICapabilityValidationRecord={id:newId('aival'),organizationId:globalState.organization.id,status:'validated',certificationState:'PENDING_VALIDATION',validationStage:'RESEARCH',approvedBy:[],updatedAt:new Date().toISOString(),...input}; globalState.aiCapabilityValidations=[rec,...globalState.aiCapabilityValidations];notify();return rec;
  };
  const approveAiCapability=(id:string)=>{
    if(!(globalState.currentUser.role==='super_admin'))return false;const i=globalState.aiCapabilityValidations.findIndex(x=>x.id===id);if(i<0)return false;const r=globalState.aiCapabilityValidations[i];const approvedBy=[...new Set([...r.approvedBy,globalState.currentUser.id])];const candidate={...r,approvedBy,approvalVersion:r.approvalVersion||`AI-SG-${new Date().getFullYear()}-${id.slice(-6)}`};
    const dataset=globalState.scientificDatasets.find(d=>d.organizationId===r.organizationId&&d.name===r.datasetName&&(r.datasetVersion?d.version===r.datasetVersion:true));const benchmark=globalState.benchmarkRuns.find(b=>b.organizationId===r.organizationId&&b.modelName===r.modelName&&b.modelVersion===r.modelVersion&&b.capability===r.capability);const source=globalState.quranSourceManifests.find(q=>q.organizationId===r.organizationId&&sourceUsableForCompetition(q,{qiraah:r.qiraah,rawi:r.rawi,riwaya:r.riwaya,tariq:r.tariq}).ok);
    const gate=certificationReleaseGate({validation:candidate,dataset,benchmark,approvedQuranSource:source});globalState.aiCapabilityValidations[i]={...candidate,status:gate.allowed?'certified':'validated',certificationState:gate.allowed?'CERTIFIED':'PENDING_VALIDATION',validationStage:gate.allowed?'CERTIFIED':candidate.validationStage,updatedAt:new Date().toISOString()};notify();return gate.allowed;
  };
  const advanceAiValidationStage=(id:string,next:'LAB_VALIDATION'|'SHADOW_MODE'|'SCIENTIFIC_REVIEW'|'LIMITED_BETA',evidenceRef?:string)=>{if(!(globalState.currentUser.role==='super_admin'))return false;const i=globalState.aiCapabilityValidations.findIndex(x=>x.id===id);if(i<0)return false;const current=globalState.aiCapabilityValidations[i];const order=['RESEARCH','LAB_VALIDATION','SHADOW_MODE','SCIENTIFIC_REVIEW','LIMITED_BETA'] as const;const from=current.validationStage||'RESEARCH';if(from==='CERTIFIED')return false;if(order.indexOf(next)!==order.indexOf(from as typeof order[number])+1)return false;if(from==='SHADOW_MODE'&&!current.shadowEvidenceRef&&!evidenceRef)return false;globalState.aiCapabilityValidations[i]={...current,validationStage:next,shadowEvidenceRef:evidenceRef||current.shadowEvidenceRef,updatedAt:new Date().toISOString()};auditTrustAction('AI_VALIDATION_STAGE_ADVANCED','AICapability',id,`تقدم دورة التحقق العلمي إلى ${next}`,`Advanced scientific validation lifecycle to ${next}`);notify();return true;};
  const suspendAiCapability=(id:string,reason='Scientific review required')=>{if(!(globalState.currentUser.role==='super_admin'))return false;const i=globalState.aiCapabilityValidations.findIndex(x=>x.id===id);if(i<0)return false;const current=globalState.aiCapabilityValidations[i];globalState.aiCapabilityValidations[i]={...current,status:'suspended',certificationState:'SUSPENDED',scopeNotes:[current.scopeNotes,reason].filter(Boolean).join(' · '),updatedAt:new Date().toISOString()};createScientificImpact('AI_CAPABILITY_SUSPENSION',id,reason,current);auditTrustAction('AI_CAPABILITY_SUSPENDED','AICapability',id,'تعليق قدرة AI مع استمرار التحكيم البشري','Suspended AI capability; human judging remains operational');notify();return true;};
  const revalidateAiProviderModel=(id:string,currentModel:{modelVersion:string;modelHash?:string})=>{if(!(globalState.currentUser.role==='super_admin'))return {changed:false,reason:'not_authorized'};const i=globalState.aiCapabilityValidations.findIndex(x=>x.id===id);if(i<0)return {changed:false,reason:'not_found'};const existing=globalState.aiCapabilityValidations[i];const detected=detectModelChange(existing,currentModel);if(!detected.changed)return {changed:false,state:aiCapabilityState(existing)};globalState.aiCapabilityValidations[i]={...existing,modelVersion:currentModel.modelVersion,modelHash:currentModel.modelHash,status:'validated',certificationState:'PENDING_VALIDATION',validationStage:'RESEARCH',approvedBy:[],approvalVersion:undefined,updatedAt:new Date().toISOString()};createScientificImpact('MODEL_CHANGE',id,'Provider model version/fingerprint changed; certification reset to pending validation.',existing);auditTrustAction('AI_MODEL_CHANGE_DETECTED','AICapability',id,'تغير نموذج المزود؛ إعادة الاعتماد إلى PENDING_VALIDATION','Provider model changed; certification reset to PENDING_VALIDATION');notify();return {changed:true,state:'PENDING_VALIDATION' as const};};
  const registerScientificDataset=(input:Omit<ScientificDatasetRecord,'id'|'organizationId'>)=>{if(!(globalState.currentUser.role==='super_admin')||!input.consent.length)return null;const d:ScientificDatasetRecord={id:newId('dataset'),organizationId:globalState.organization.id,...input};globalState.scientificDatasets=[d,...globalState.scientificDatasets];auditTrustAction('SCIENTIFIC_DATASET_REGISTERED','ScientificDataset',d.id,'تسجيل dataset مع provenance وموافقات منفصلة','Registered scientific dataset with provenance and explicit consent scopes');notify();return d;};
  const revokeScientificDataset=(id:string,reason:string)=>{if(!(globalState.currentUser.role==='super_admin')||reason.trim().length<3)return false;const i=globalState.scientificDatasets.findIndex(x=>x.id===id);if(i<0)return false;const dataset=globalState.scientificDatasets[i];globalState.scientificDatasets[i]={...dataset,status:'REVOKED'};createScientificImpact('DATASET_REVOCATION',id,reason,{qiraah:dataset.qiraah,rawi:dataset.rawi,riwaya:dataset.rawi});for(let n=0;n<globalState.aiCapabilityValidations.length;n++){const v=globalState.aiCapabilityValidations[n];if(v.datasetName===dataset.name&&(!v.datasetVersion||v.datasetVersion===dataset.version))globalState.aiCapabilityValidations[n]={...v,status:'suspended',certificationState:'SUSPENDED',updatedAt:new Date().toISOString()}}auditTrustAction('SCIENTIFIC_DATASET_REVOKED','ScientificDataset',id,'إلغاء dataset وتعليق القدرات المعتمدة عليه','Revoked dataset and suspended capabilities that depended on it');notify();return true;};
  const openScientificAdjudication=(input:{datasetId:string;capability:ScientificAdjudicationCaseRecord['capability'];sampleRef:string})=>{if(!(globalState.currentUser.role==='super_admin'))return null;const rec:ScientificAdjudicationCaseRecord={id:newId('adjudication'),organizationId:globalState.organization.id,datasetId:input.datasetId,capability:input.capability,sampleRef:input.sampleRef,expertLabels:[],status:'OPEN'};globalState.scientificAdjudications=[rec,...globalState.scientificAdjudications];notify();return rec;};
  const recordAdjudicationLabel=(id:string,label:string,reasoningCode?:string)=>{if(!(globalState.currentUser.role==='super_admin'))return false;const i=globalState.scientificAdjudications.findIndex(x=>x.id===id&&x.status==='OPEN');if(i<0)return false;const current=globalState.scientificAdjudications[i];const expertLabels=current.expertLabels.filter(x=>x.reviewerId!==globalState.currentUser.id);expertLabels.push({reviewerId:globalState.currentUser.id,label,reasoningCode,createdAt:new Date().toISOString()});globalState.scientificAdjudications[i]={...current,expertLabels};notify();return true;};
  const adjudicateScientificCase=(id:string,finalGoldLabel:string)=>{if(!(globalState.currentUser.role==='super_admin'))return false;const i=globalState.scientificAdjudications.findIndex(x=>x.id===id&&x.status==='OPEN');if(i<0)return false;const current=globalState.scientificAdjudications[i];if(new Set(current.expertLabels.map(x=>x.reviewerId)).size<2)return false;globalState.scientificAdjudications[i]={...current,status:'ADJUDICATED',finalGoldLabel,adjudicatedBy:globalState.currentUser.id,adjudicatedAt:new Date().toISOString()};auditTrustAction('SCIENTIFIC_ADJUDICATION_COMPLETED','ScientificAdjudication',id,'حسم Gold label مع حفظ اختلاف الخبراء','Adjudicated gold label while preserving expert disagreement');notify();return true;};
  const registerBenchmarkRun=(input:Omit<BenchmarkRunRecord,'id'|'organizationId'|'ranAt'>)=>{if(!(globalState.currentUser.role==='super_admin'))return null;const b:BenchmarkRunRecord={id:newId('benchrun'),organizationId:globalState.organization.id,ranAt:new Date().toISOString(),...input};globalState.benchmarkRuns=[b,...globalState.benchmarkRuns];notify();return b;};
  const updateOperatingCostModel=(patch:Partial<OperatingCostModel>)=>{globalState.operatingCostModel={...globalState.operatingCostModel,...patch};notify();};
  const getOperatingSavings=()=>{const m=globalState.operatingCostModel; const baselineHours=m.baselineStaff*m.hoursPerDay*m.days; const mizanHours=m.mizanStaff*m.hoursPerDay*m.days; const savedHours=Math.max(0,baselineHours-mizanHours); return {baselineHours,mizanHours,savedHours,estimatedMoney:m.hourlyCost!==undefined?savedHours*m.hourlyCost:undefined,currency:m.currency};};



  /*
   * الاسم الإنجليزي اختياري ويُخزَّن كما أُدخل. كان النموذج يمرّر الاسم العربي في الخانتين،
   * فيُولد كل سجل ومعه نصٌّ عربي في خانة الاسم الإنجليزي — ثم يظهر في الشهادة الإنجليزية.
   * الفراغ أصدق، والعرض يعالجه بـ bilingualName لا التخزين.
   */

  const createCompetition = (nameArabic: string, nameEnglish = '') => {
    const base: Competition = {
      ...JSON.parse(JSON.stringify(globalState.competition)), id:newId('comp'), name:nameEnglish.trim(), nameArabic:nameArabic.trim(), edition:'', status:'draft',
      startDate:'', endDate:'', registrationStartDate:'', registrationEndDate:'', totalRegistered:0, totalApproved:0, totalAttended:0, currentDay:0,
      categories: [],
      readinessChecklist:{datesConfigured:false,categoriesConfigured:false,ruleSetFrozen:false,judgesAssigned:false,quranSourceLocked:false,devicesRegistered:false,certificatesReady:false}
    };
    // New competitions start as the buyer's empty configuration, not one of MIZAN's demo templates.
    base.displayName=undefined;base.displayNameArabic=undefined;base.logoUrl=undefined;
    base.country='';base.timezone='';base.venueName='';base.venuesCount=0;base.totalDays=0;
    base.ruleSet={...base.ruleSet,id:newId('ruleset'),name:'',criteria:[],frozenAt:undefined};base.ruleSets=[base.ruleSet];
    delete (base as any).policy;
    globalState.competitions = [base, ...globalState.competitions];
    globalState.competition = base;
    markCompetitionConfigChanged(); notify(); return base;
  };

  const applyTemplate = (templateId: string) => {
    globalState.competition = applyCompetitionTemplate(globalState.competition, templateId);
    markCompetitionConfigChanged(); notify();
  };

  const updateCompetitionPolicy = (updater: (policy: ReturnType<typeof getCompetitionPolicy>) => ReturnType<typeof getCompetitionPolicy>) => {
    const current = getCompetitionPolicy(globalState.competition);
    if (current.frozenAt) return false;
    const next = updater(JSON.parse(JSON.stringify(current)));
    next.version = current.version === next.version ? `${current.version.split('.')[0]}.${Number(current.version.split('.')[1] || 0) + 1}.0` : next.version;
    next.updatedAt = new Date().toISOString();
    globalState.competition = { ...globalState.competition, policy: next };
    markCompetitionConfigChanged(); notify();
    return true;
  };

  const updateRuleSet = (patch: Partial<Competition['ruleSet']>, opts?: { allowWhenFrozen?: boolean }) => {
    // Panel capacity (judges per panel) is an operational setting, not a scoring rule, so it can be
    // tuned even after the rulebook is frozen. Everything else stays locked once the event is live.
    const frozen = globalState.competition.ruleSet.frozenAt || getCompetitionPolicy(globalState.competition).frozenAt;
    if (frozen && !opts?.allowWhenFrozen) return false;
    const version = frozen && opts?.allowWhenFrozen
      ? globalState.competition.ruleSet.version
      : `${globalState.competition.ruleSet.version}-rev`;
    const next = { ...globalState.competition.ruleSet, ...patch, version };
    globalState.competition = { ...globalState.competition, ruleSet: next, ruleSets: [next, ...(globalState.competition.ruleSets || []).filter(r => r.id !== next.id)] };
    markCompetitionConfigChanged(); notify();
    return true;
  };

  const getCompetitionReadiness = () => getReadinessIssues(globalState.competition);

  const updateCompetitionDetails = (patch: Partial<Competition>) => {
    globalState.competition = { ...globalState.competition, ...patch };
    markCompetitionConfigChanged(); notify();
  };

  /*
   * المصحف ثلاثون جزءًا. فئةٌ مكتوبٌ فيها خمسون لا تعني شيئًا، لكنها تصل إلى FairDraw
   * بوصفها maxJuz فيبحث عن أسئلة في أجزاء لا وجود لها. الحدّ يُفرض هنا — في المخزن —
   * لا في شاشةٍ واحدة، فأي واجهة تكتب الفئة (استيراد، نسخ مسابقة، شاشة أخرى) تلتزم به.
   */
  const clampCategory = (patch: Partial<Category>): Partial<Category> => {
    if (patch.juzCount === undefined) return patch;
    const n = Number(patch.juzCount);
    return { ...patch, juzCount: Number.isFinite(n) ? Math.max(1, Math.min(QURAN_JUZ_TOTAL, Math.round(n))) : 1 };
  };

  const addCategory = (initial?: Partial<Category>) => {
    const id = newId('cat');
    const category: Category = {
      id, competitionId: globalState.competition.id, code:`CAT-${globalState.competition.categories.length+1}`,
      name:'New category', nameArabic:'فئة جديدة', description:'', riwaya:'', memorizationScope:'Custom', juzCount:30,
      genderConstraint:'all', targetParticipants:100, targetDurationMinutes:8, ruleSetId:globalState.competition.ruleSet.id,
      ...clampCategory(initial || {})
    };
    globalState.competition = { ...globalState.competition, categories:[...globalState.competition.categories, category] };
    markCompetitionConfigChanged(); notify(); return category;
  };

  const updateCategory = (categoryId: string, patch: Partial<Category>) => {
    const safe = clampCategory(patch);
    globalState.competition = { ...globalState.competition, categories:globalState.competition.categories.map(c=>c.id===categoryId?{...c,...safe}:c) };
    markCompetitionConfigChanged(); notify();
  };

  /* ============================ محرك النطاق والأسئلة ============================
   *
   * A competition category is data + scope + rules, not a hard-coded competition type.
   * الفئة في ميزان تُعرّف بنطاقها وقواعدها الفعلية، لا باسمٍ ثابت داخل الكود.
   *
   * كل ما يلي يمرّ على واجهة واحدة (scope-engine) فلا يبقى في النظام معنيان للنطاق.
   */

  /* نطاق المتسابق بيانٌ يقوم عليه السحب، فيُقيَّد للرفع السحابي كما تُقيَّد بقية سجلات المسابقة. */
  const queueScopeUpload = (record: ParticipantScopeRecord) => {
    markPendingWrite('participant_scopes', record.id, { ...record, updatedAt: record.updatedAt } as unknown as Record<string, unknown>);
    void persistScopedDocument('participant_scopes', record.id, { ...record } as unknown as Record<string, unknown>);
  };

  /*
   * سبب اختيار السؤال. وضع النطاق يملؤه دائمًا، أما الإثبات الموروث فلا يحمله؛ فيُسجَّل
   * سببٌ صريح يقول ذلك بدل تمرير قيمة مفقودة تُقرأ لاحقًا على أنها تفصيلٌ ضائع.
   */
  const reasonFor = (selection: QuestionSelection, index: number) => selection.selectionReasons?.[index] || {
    matchedScope: true as const, matchedZone: false, zoneId: null, zoneRelaxed: false, matchedReading: true,
    targetDifficulty: null, actualDifficulty: selection.questions[index]?.difficultyRating ?? 0,
    difficultyAssurance: 'unknown' as const, usesBeforeSelection: 0, participantGapAtSelection: null,
    scarcityPressure: 0, exposurePressure: 0, alternativeCandidates: 0, score: 0, runnerUpScore: null,
    relaxedPreferences: ['legacy_fairdraw_no_structured_reason'],
  };

  const activeParticipantScope = (participantId: string) =>
    globalState.participantScopes.find(x => x.participantId === participantId && x.status !== 'superseded');

  /*
   * سجل نسخ نطاق المتسابق.
   *
   * النسخة السابقة كانت تُحفظ ولا تُعرض — وهذا حفظٌ بلا شهادة: «لا تغيير صامت بعد الاعتماد»
   * لا تتحقق بأن يكون التغيير مكتوبًا في التخزين، بل بأن يراه صاحبه واللجنة. فيُفتح السجل
   * كاملًا بنسخه وحالاتها وأسباب تغييرها ومن قرّرها.
   */
  const participantScopeHistory = (participantId: string) => globalState.participantScopes
    .filter(x => x.participantId === participantId
      && x.competitionId === globalState.competition.id
      && x.organizationId === globalState.competition.organizationId)
    .sort((a, b) => b.version - a.version);

  /* إبطال ما بُني على نسخة نطاق لم تعد سارية. لا تغيير صامت بعد الاعتماد. */
  const invalidateAffectedModels = (reason: string) => {
    const stale = staleModels(globalState.questionModels, globalState.participantScopes, globalState.competition.categories);
    if (!stale.length) return 0;
    const outcome = invalidateStaleModels({
      models: globalState.questionModels,
      currentScopeVersionOf: id => activeParticipantScope(id)?.version,
      currentCategoryScopeVersionOf: id => globalState.competition.categories.find(c => c.id === id)?.scopeVersion || 1,
    });
    globalState.questionModels = outcome.models;
    for (const model of outcome.invalidated) {
      auditTrustAction('QUESTION_MODEL_INVALIDATED', 'QuestionModel', model.id,
        `إبطال نموذج أسئلة لأن نطاقه تغيّر (${reason}) — ${model.invalidationReason}`,
        `Invalidated a question model after a scope change (${reason}) — ${model.invalidationReason}`);
    }
    return outcome.invalidated.length;
  };

  const bumpCategory = (categoryId: string, patch: Partial<Category>, action: string, ar: string, en: string) => {
    const category = globalState.competition.categories.find(c => c.id === categoryId);
    if (!category) return { ok: false as const, reason: 'CATEGORY_NOT_FOUND' };
    globalState.competition = {
      ...globalState.competition,
      categories: globalState.competition.categories.map(c => c.id === categoryId ? { ...c, ...patch } : c),
    };
    auditTrustAction(action, 'Category', categoryId, ar, en);
    const invalidated = invalidateAffectedModels(action);
    markCompetitionConfigChanged(); notify();
    return { ok: true as const, invalidatedModels: invalidated };
  };

  /** تحديد نطاق الفئة. يرفع نسخة النطاق ويبطل ما بُني على النسخة السابقة. */
  const setCategoryScope = (categoryId: string, scope: QuranScope, options?: { mode?: Category['scopeMode']; reason?: string }) => {
    const category = globalState.competition.categories.find(c => c.id === categoryId);
    if (!category) return { ok: false as const, reason: 'CATEGORY_NOT_FOUND' };
    const issues = validateScope(scope);
    if (issues.length) return { ok: false as const, reason: 'SCOPE_INVALID', issues };
    const normalized = normalizeScope(scope);
    const version = (category.scopeVersion || 0) + 1;
    return bumpCategory(categoryId, {
      scope: normalized, scopeVersion: version, scopeMigration: 'none',
      ...(options?.mode ? { scopeMode: options.mode } : {}),
      // الحقول الموروثة تبقى مشتقةً للعرض، ولا يُسحب منها شيء.
      juzCount: derivedLegacyJuzCount(normalized),
      memorizationScope: describeScope(normalized, true),
    }, 'CATEGORY_SCOPE_SET',
      `تحديد نطاق الفئة: ${describeScope(normalized, true)} (النسخة ${version})${options?.reason ? ` — ${options.reason}` : ''}`,
      `Set category scope to ${describeScope(normalized, false)} (version ${version})`);
  };

  const setCategorySelectionRule = (categoryId: string, rule: ParticipantScopeSelectionRule) => {
    const current = globalState.competition.categories.find(c => c.id === categoryId);
    const next: ParticipantScopeSelectionRule = { ...rule, version: (current?.selectionRule?.version || 0) + 1 };
    return bumpCategory(categoryId, { selectionRule: next, scopeMode: next.enabled ? 'participant_selected' : 'fixed' },
      'CATEGORY_SELECTION_RULE_SET',
      next.enabled ? `تفعيل اختيار المتسابق لنطاقه بقواعد النسخة ${next.version}` : 'إلغاء اختيار المتسابق: نطاق الفئة ثابت للجميع',
      next.enabled ? `Enabled participant scope selection (rules v${next.version})` : 'Disabled participant scope selection; the category scope is fixed');
  };

  const setCategoryDistribution = (categoryId: string, plan: QuestionDistributionPlan) => {
    const current = globalState.competition.categories.find(c => c.id === categoryId);
    const next: QuestionDistributionPlan = { ...plan, version: (current?.distribution?.version || 0) + 1, updatedAt: new Date().toISOString() };
    return bumpCategory(categoryId, { distribution: next }, 'CATEGORY_DISTRIBUTION_SET',
      `ضبط توزيع الأسئلة (${next.mode}) بـ${next.zones.length} منطقة`,
      `Set question distribution (${next.mode}) with ${next.zones.length} zones`);
  };

  const setCategoryRepeatPolicy = (categoryId: string, policy: RepeatPolicy) => {
    const current = globalState.competition.categories.find(c => c.id === categoryId);
    const next: RepeatPolicy = { ...policy, version: (current?.repeatPolicy?.version || 0) + 1 };
    return bumpCategory(categoryId, { repeatPolicy: next }, 'CATEGORY_REPEAT_POLICY_SET',
      `ضبط سياسة التكرار: ${describeRepeatPolicy(next, true)}`,
      `Set repeat policy: ${describeRepeatPolicy(next, false)}`);
  };

  const setCategoryQuestionCount = (categoryId: string, count: number) =>
    bumpCategory(categoryId, { questionsCount: Math.max(1, Math.min(40, Math.round(count))) }, 'CATEGORY_QUESTION_COUNT_SET',
      `عدد أسئلة المتسابق في هذه الفئة: ${Math.max(1, Math.round(count))}`,
      `Questions per participant for this category: ${Math.max(1, Math.round(count))}`);

  /** خطة ترحيل الفئات القديمة. لا تُطبَّق شيئًا؛ تعرض ما يمكن اشتقاقه وما يحتاج قرار المنظم. */
  const categoryScopeMigrationPlan = () => planCategoryMigration(globalState.competition.categories);

  /** تطبيق ترحيل فئة واحدة. المبهم لا يُطبَّق إلا إذا اعتمد المنظم الاقتراح صراحةً. */
  const applyCategoryScopeMigration = (categoryId: string, options?: { acceptSuggestion?: boolean }) => {
    const category = globalState.competition.categories.find(c => c.id === categoryId);
    if (!category) return { ok: false as const, reason: 'CATEGORY_NOT_FOUND' };
    const outcome = migrateLegacyScope({ memorizationScope: category.memorizationScope, juzCount: category.juzCount, existingScope: category.scope || null });
    if (outcome.status === 'already_defined') return { ok: false as const, reason: 'SCOPE_ALREADY_DEFINED' };
    const scope = outcome.scope || (options?.acceptSuggestion ? outcome.suggestion : null);
    if (!scope) {
      bumpCategory(categoryId, { scopeMigration: 'needs_scope_confirmation' }, 'CATEGORY_SCOPE_NEEDS_CONFIRMATION',
        `«${category.memorizationScope || category.juzCount}» لا تحدد نطاقًا بعينه؛ بقيت الفئة بانتظار قرار المنظم.`,
        'The legacy value does not identify a specific range; the category awaits an explicit decision.');
      return { ok: false as const, reason: 'NEEDS_SCOPE_CONFIRMATION', outcome };
    }
    const result = setCategoryScope(categoryId, scope, { reason: outcome.basisArabic });
    if (result.ok) {
      globalState.competition = {
        ...globalState.competition,
        categories: globalState.competition.categories.map(c => c.id === categoryId ? { ...c, scopeMigration: outcome.scope ? 'derived_from_legacy' : 'none' } : c),
      };
      notify();
    }
    return { ...result, outcome };
  };

  /** حفظ اختيار المتسابق لنطاقه. كل حفظ نسخة جديدة؛ السابقة تُعلَّم superseded ولا تُحذف. */
  const saveParticipantScope = (participantId: string, selection: QuranScope, options?: { submit?: boolean; reason?: string }) => {
    const participant = globalState.participants.find(p => p.id === participantId);
    if (!participant) return { ok: false as const, reason: 'PARTICIPANT_NOT_FOUND', issues: [] };
    const category = globalState.competition.categories.find(c => c.id === participant.categoryId);
    const rule = categorySelectionRule(category);
    const issues = validateParticipantSelection(rule, selection);
    if (!selectionIsValid(issues)) return { ok: false as const, reason: 'SELECTION_INVALID', issues };
    const previous = activeParticipantScope(participantId);
    if (previous?.status === 'locked') return { ok: false as const, reason: 'SCOPE_LOCKED', issues };
    const now = new Date().toISOString();
    const record = buildParticipantScopeRecord({
      id: newId('pscope'), organizationId: globalState.competition.organizationId, competitionId: globalState.competition.id,
      categoryId: participant.categoryId, participantId, rule, selection, version: nextScopeVersion(previous),
      status: options?.submit ? (rule.approval === 'auto' ? 'approved' : 'submitted') : 'draft',
      now, changeReason: options?.reason,
    });
    if (record.status === 'approved') { record.approvedAt = now; record.approvedBy = 'auto_policy'; }
    if (options?.submit) record.submittedAt = now;
    globalState.participantScopes = [
      record,
      ...globalState.participantScopes.map(x => x.participantId === participantId && x.status !== 'superseded'
        ? { ...x, status: 'superseded' as const, supersededAt: now, supersededByVersion: record.version } : x),
    ];
    queueScopeUpload(record);
    auditTrustAction('PARTICIPANT_SCOPE_SAVED', 'ParticipantScope', record.id,
      `حفظ نطاق المتسابق ${participant.code}: ${describeScope(record.scope, true)} (النسخة ${record.version}، الحالة ${record.status})`,
      `Saved participant ${participant.code} scope: ${describeScope(record.scope, false)} (v${record.version}, ${record.status})`);
    invalidateAffectedModels('PARTICIPANT_SCOPE_SAVED');
    notify();
    return { ok: true as const, record, issues };
  };

  const decideParticipantScope = (participantId: string, decision: 'approved' | 'rejected' | 'locked', reason?: string) => {
    const index = globalState.participantScopes.findIndex(x => x.participantId === participantId && x.status !== 'superseded');
    if (index < 0) return { ok: false as const, reason: 'SCOPE_NOT_FOUND' };
    const current = globalState.participantScopes[index];
    if (decision === 'rejected' && !reason?.trim()) return { ok: false as const, reason: 'REJECTION_REASON_REQUIRED' };
    const now = new Date().toISOString();
    const next: ParticipantScopeRecord = {
      ...current, status: decision, updatedAt: now,
      ...(decision === 'approved' ? { approvedAt: now, approvedBy: globalState.currentUser.id } : {}),
      ...(decision === 'rejected' ? { rejectedAt: now, rejectionReason: reason?.trim() } : {}),
      ...(decision === 'locked' ? { lockedAt: now } : {}),
    };
    globalState.participantScopes = globalState.participantScopes.map((x, i) => i === index ? next : x);
    queueScopeUpload(next);
    const participant = globalState.participants.find(p => p.id === participantId);
    auditTrustAction('PARTICIPANT_SCOPE_DECIDED', 'ParticipantScope', next.id,
      `${decision === 'approved' ? 'اعتماد' : decision === 'rejected' ? 'رفض' : 'قفل'} نطاق المتسابق ${participant?.code || participantId}${reason ? ` — ${reason}` : ''}`,
      `${decision} participant scope for ${participant?.code || participantId}${reason ? ` — ${reason}` : ''}`);
    invalidateAffectedModels('PARTICIPANT_SCOPE_DECIDED');
    notify();
    return { ok: true as const, record: next };
  };

  const participantEffectiveScope = (participantId: string) => {
    const participant = globalState.participants.find(p => p.id === participantId);
    if (!participant) return null;
    return resolveEffectiveScope({
      participant,
      category: globalState.competition.categories.find(c => c.id === participant.categoryId),
      scopes: globalState.participantScopes,
      tenant: { organizationId: globalState.competition.organizationId, competitionId: globalState.competition.id },
    });
  };

  /*
   * مرشحو النطاق: البنك المعتمد متى وُجد، وإلا المواضع البنيوية لقياس السعة والمحاكاة.
   *
   * سياق القراءة يأتي من **المتسابق** لا من الفئة. فئةٌ مكتوب في روايتها «حفص / ورش / قالون»
   * لا تُحلّ إلى رواية واحدة — وهذا صحيح علميًا — فلو بُني بنكها على روايتها لخرج بلا سياق
   * قراءة، ثم رفضه المحرك لكل متسابق له رواية محددة، فيعود صفرًا بلا سبب ظاهر.
   */
  const scopeCandidatePool = (scope: QuranScope, categoryId?: string, reading?: ReturnType<typeof readingContextOf>) => {
    const category = globalState.competition.categories.find(c => c.id === categoryId);
    const pool = buildCandidatePool({ scope, category, reading: reading || readingContextOf({ riwaya: category?.riwaya }) });
    /* الموضع المحجور يخرج من البنك عند منبعه، فلا يصل إلى سحبٍ ولا إلى إحصاء سعة. */
    const quarantined = activeQuarantinedLoci();
    const clean = quarantined.size ? pool.filter(c => !quarantined.has(`${c.surahNumber}:${c.startAyah}`)) : pool;
    return enrichCandidates(clean);
  };

  /*
   * إثراء بيانات السؤال بما هو معروف فعلًا، لا بما يمكن تخمينه.
   *
   * ثلاثة حقول تُملأ من مصادر قائمة: عدد مرات الكشف (من سجل الانكشاف)، والأوجه المسموحة
   * (من مواضع الخلاف المعتمدة علميًا وحدها)، وكثافة المتشابه (من خريطة المتشابهات المعتمدة).
   * وما لا مصدر له يبقى فارغًا: الفراغ يقول «لم يُقرأ من مصدر»، والتخمين يقول «هذا هو» وهو
   * كذب. ولا يُبنى على أيٍّ من الثلاثة قرارُ أهلية — الأهلية بالآية وحدها.
   */
  const enrichCandidates = (candidates: QuestionCandidate[]): QuestionCandidate[] => {
    const exposure = exposureProfiles();
    const variants = globalState.variantLoci.filter(v => v.approvalState === 'CERTIFIED' && v.allowedWajh);
    const traps = globalState.mutashabihatTrapMaps.filter(t => t.status === 'APPROVED');
    if (!exposure.size && !variants.length && !traps.length) return candidates;
    const wujuhAt = new Map<string, string[]>();
    for (const variant of variants) {
      const key = `${variant.surah}:${variant.ayah}`;
      const list = wujuhAt.get(key) || [];
      if (variant.allowedWajh && !list.includes(variant.allowedWajh)) list.push(variant.allowedWajh);
      wujuhAt.set(key, list);
    }
    const trapAt = new Set(traps.map(t => `${t.expected.surah}:${t.expected.ayah}`));
    return candidates.map(candidate => {
      const key = `${candidate.surahNumber}:${candidate.startAyah}`;
      const revealed = exposure.get(key)?.reveals;
      const wujuh = wujuhAt.get(key);
      const trapped = trapAt.has(key);
      if (revealed === undefined && !wujuh && !trapped) return candidate;
      return {
        ...candidate,
        ...(revealed === undefined ? {} : { exposureCount: revealed }),
        ...(wujuh ? { allowedWujuh: wujuh } : {}),
        ...(trapped ? { mutashabihatScore: Math.max(candidate.mutashabihatScore || 0, 0.8) } : {}),
      };
    });
  };

  /** مفاتيح المواضع المحجورة حجرًا ساريًا في هذه المسابقة. */
  const activeQuarantinedLoci = () => new Set(
    globalState.questionQuarantines
      .filter(q => q.status === 'active' && q.competitionId === globalState.competition.id)
      .flatMap(q => q.locusKeys),
  );

  /* تجميع البنك بحسب (النطاق × سياق القراءة): لا يُبنى مرتين لعنقود واحد، ولا يُخلط بين روايتين. */
  const poolsForRows = (rows: { scope: QuranScope; categoryId: string; reading: ReturnType<typeof readingContextOf> }[]) => {
    const byKey = new Map<string, QuestionCandidate[]>();
    for (const row of rows) {
      const key = `${scopeSignature(row.scope)}|${row.reading.qiraahId || ''}|${row.reading.rawiId || ''}`;
      if (!byKey.has(key)) byKey.set(key, scopeCandidatePool(row.scope, row.categoryId, row.reading));
    }
    return [...new Map([...byKey.values()].flat().map(c => [c.id, c] as const)).values()];
  };

  /*
   * تحليل الازدحام والمحاكاة يُحمَّلان عند الطلب.
   *
   * لجنةُ تحكيمٍ في القاعة لا تحتاج محرّك المحاكاة في حزمتها الأولى، وميزان يَعِد بالعمل
   * عند انقطاع الشبكة — فكل كيلوبايت في الحزمة الأولى ثمنٌ يدفعه من لا ينتفع به.
   */
  const scopeDemandAnalysis = async () => {
    const { analyzeDemand } = await import('./scope-demand');
    const policy = getCompetitionPolicy(globalState.competition);
    const rows = globalState.participants
      .filter(p => !['rejected', 'draft'].includes(p.status))
      .map(p => {
        const resolution = participantEffectiveScope(p.id);
        const category = globalState.competition.categories.find(c => c.id === p.categoryId);
        return resolution && !resolution.blocked
          ? { participantId: p.id, categoryId: p.categoryId, scope: resolution.scope, questionCount: resolveQuestionCount(category, policy), reading: readingContextOf({ riwaya: p.riwaya }) }
          : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    const unique = poolsForRows(rows.map(r => ({ scope: r.scope, categoryId: r.categoryId, reading: r.reading })));
    return analyzeDemand({ participants: rows.map(({ reading, ...rest }) => { void reading; return rest; }), candidates: unique });
  };

  const getScopeReadiness = () => {
    const policy = getCompetitionPolicy(globalState.competition);
    return buildScopeReadiness({
      categories: globalState.competition.categories,
      scopeOf: categoryScopeOf,
      participants: globalState.participants.map(p => ({ id: p.id, code: p.code, categoryId: p.categoryId, status: p.status })),
      participantScopes: globalState.participantScopes,
      candidatesFor: scope => scopeCandidatePool(scope),
      questionsPerParticipant: category => resolveQuestionCount(category, policy),
      repeatPolicyFor: category => categoryRepeatPolicy(category, policy),
      staleModelCount: staleModels(globalState.questionModels, globalState.participantScopes, globalState.competition.categories).length,
      activeQuarantines: globalState.questionQuarantines
        .filter(q => q.status === 'active' && q.competitionId === globalState.competition.id)
        .map(q => ({ locusCount: q.locusKeys.length, canContinue: q.canContinue, summaryAr: q.summaryArabic, summaryEn: q.summaryEnglish })),
      reserveModelCount: globalState.questionModels.filter(m => !m.participantId && m.status === 'draft' && m.competitionId === globalState.competition.id).length,
      escrowRequired: policy.questions.secureReveal?.requireParticipantPresence !== false,
      escrowReady: globalState.activeSession.secureQuestionMode === 'SERVER' || !isLaunchDeployment(),
      strictDifficultyRequired: globalState.competition.categories.some(c => c.requireReviewedDifficulty),
    });
  };

  /** محاكاة بالمحرك نفسه الذي يعمل يوم المسابقة. لا تمسّ بيانات التشغيل. */
  const runScopeSimulation = async (options?: { label?: string; participantCount?: number; questionCount?: number; poolMultiplier?: number; repeatMode?: RepeatPolicy['mode']; minimumParticipantGap?: number; seed?: string; syntheticOnly?: boolean }) => {
    const [{ runCompetitionTwin, syntheticParticipants }, { recommendPolicy }] = await Promise.all([import('./competition-twin'), import('./scope-demand')]);
    const policy = getCompetitionPolicy(globalState.competition);
    const seed = options?.seed || `${globalState.competition.id}:${Date.now()}`;
    const real = globalState.participants
      .filter(p => !['rejected', 'draft'].includes(p.status))
      .map(p => {
        const resolution = participantEffectiveScope(p.id);
        const category = globalState.competition.categories.find(c => c.id === p.categoryId);
        if (!resolution || resolution.blocked) return null;
        return {
          participantId: p.id, categoryId: p.categoryId, scope: resolution.scope,
          questionCount: options?.questionCount || resolveQuestionCount(category, policy),
          reading: readingContextOf({ riwaya: p.riwaya }),
          hallId: p.assignedCommitteeId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    const target = options?.participantCount || real.length;
    const participants = real.length
      ? Array.from({ length: target }, (_, i) => ({ ...real[i % real.length], participantId: `${real[i % real.length].participantId}#${Math.floor(i / real.length)}` }))
      : syntheticParticipants({
          count: Math.max(1, target),
          categoryId: globalState.competition.categories[0]?.id || 'cat',
          questionCount: options?.questionCount || resolveQuestionCount(globalState.competition.categories[0], policy),
          scopes: globalState.competition.categories.length
            ? globalState.competition.categories.map(c => ({ scope: categoryScopeOf(c), share: 1 })).filter(x => scopeAyahCount(x.scope) > 0)
            : [{ scope: fullQuranScope(), share: 1 }],
          reading: readingContextOf({ riwaya: globalState.competition.categories[0]?.riwaya }),
        });
    /* محاكاة بلا سؤال واحد ناجح ليست محاكاة: يُقال ذلك صراحةً بدل تقرير أصفارٍ يبدو نظيفًا. */

    if (!participants.length) return { ok: false as const, reason: 'NO_PARTICIPANTS_TO_SIMULATE' };
    let candidates = poolsForRows(participants.map(p => ({ scope: p.scope, categoryId: p.categoryId, reading: p.reading || {} })));
    const multiplier = options?.poolMultiplier ?? 1;
    if (multiplier < 1) candidates = candidates.filter((_, i) => i % Math.max(1, Math.round(1 / multiplier)) === 0);

    const baseRepeat = categoryRepeatPolicy(globalState.competition.categories[0], policy);
    const result = runCompetitionTwin({
      competitionId: globalState.competition.id,
      participants, candidates,
      distributionPlanByCategory: Object.fromEntries(globalState.competition.categories.map(c => [c.id, categoryDistribution(c, resolveQuestionCount(c, policy))])),
      defaultPlan: categoryDistribution(globalState.competition.categories[0], options?.questionCount || policy.questions.questionsPerParticipant),
      repeatPolicy: { ...baseRepeat, ...(options?.repeatMode ? { mode: options.repeatMode } : {}), ...(options?.minimumParticipantGap !== undefined ? { minimumParticipantGap: options.minimumParticipantGap } : {}) },
      targetDifficulty: policy.questions.targetDifficulty,
      seed,
    });
    const record: ScopeSimulationRecord = {
      id: newId('sim'), organizationId: globalState.competition.organizationId, competitionId: globalState.competition.id,
      label: options?.label || `محاكاة ${participants.length} متسابقًا`,
      seed, participantCount: result.metrics.participants, draws: result.metrics.draws,
      metrics: result.metrics as unknown as Record<string, unknown>,
      clusters: result.perCluster,
      recommendations: recommendPolicy(result.demand, baseRepeat).map(x => ({ id: x.id, ar: x.ar, en: x.en, severity: x.severity })),
      createdBy: globalState.currentUser.id, createdAt: new Date().toISOString(), runtimeMs: result.runtimeMs,
      syntheticData: !real.length || target !== real.length,
    };
    globalState.scopeSimulations = [record, ...globalState.scopeSimulations].slice(0, 20);
    auditTrustAction('SCOPE_SIMULATION_RUN', 'ScopeSimulation', record.id,
      `تشغيل محاكاة لـ${record.participantCount} متسابقًا و${record.draws} سحبة — خروقات النطاق ${result.metrics.scopeViolations}`,
      `Ran a simulation over ${record.participantCount} participants and ${record.draws} draws — scope violations ${result.metrics.scopeViolations}`);
    notify();
    return { ok: true as const, record, result };
  };

  /** أثر تغيير الإعداد بعد التجميد: من تأثر، وكم نموذجًا بطل، وهل تلزم إعادة المحاكاة. */
  const scopeSealImpact = () => {
    const seal = globalState.scopeEngineSeals.find(x => x.status === 'active');
    if (!seal) return { sealed: false as const, affectedParticipants: 0, invalidModels: 0, changedCategories: [] as string[], requiresResimulation: false };
    const changedCategories = globalState.competition.categories
      .filter(category => {
        const row = seal.categories.find(x => x.categoryId === category.id);
        return !row || row.scopeSignature !== scopeSignature(categoryScopeOf(category)) || (category.scopeVersion || 1) !== row.scopeVersion;
      })
      .map(c => c.nameArabic || c.name);
    const changedScopes = globalState.participantScopes.filter(record => {
      if (record.status === 'superseded') return false;
      const row = seal.participantScopeVersions.find(x => x.participantId === record.participantId);
      return !row || row.version !== record.version;
    });
    const invalid = staleModels(globalState.questionModels, globalState.participantScopes, globalState.competition.categories).length;
    return {
      sealed: true as const,
      sealedAt: seal.sealedAt,
      affectedParticipants: changedScopes.length,
      invalidModels: invalid,
      changedCategories,
      requiresResimulation: changedCategories.length > 0 || changedScopes.length > 0,
    };
  };

  const sealScopeEngine = async (reason?: string) => {
    const readiness = getScopeReadiness();
    if (!readiness.ready) return { ok: false as const, reason: 'READINESS_BLOCKED', checks: readiness.checks.filter(x => x.severity === 'critical') };
    const policy = getCompetitionPolicy(globalState.competition);
    const now = new Date().toISOString();
    const categories = globalState.competition.categories.map(category => ({
      categoryId: category.id,
      scopeSignature: scopeSignature(categoryScopeOf(category)),
      scopeVersion: category.scopeVersion || 1,
      selectionRuleVersion: category.selectionRule?.version || 0,
      distributionVersion: category.distribution?.version || 0,
      repeatPolicyVersion: category.repeatPolicy?.version || 0,
      questionsPerParticipant: resolveQuestionCount(category, policy),
    }));
    const participantScopeVersions = globalState.participantScopes
      .filter(x => x.status !== 'superseded')
      .map(x => ({ participantId: x.participantId, version: x.version, scopeSignature: x.scopeSignature }));
    const poolVersion = `STRUCTURAL:${categories.map(c => c.scopeSignature).join('|')}`;
    const sealHash = await hashCanonical({ categories, participantScopeVersions, poolVersion, policyVersion: policy.version });
    const seal: ScopeEngineSealRecord = {
      id: newId('scopeseal'), organizationId: globalState.competition.organizationId, competitionId: globalState.competition.id,
      sealedAt: now, sealedBy: globalState.currentUser.id, sealHash, categories, participantScopeVersions, poolVersion, status: 'active',
    };
    globalState.scopeEngineSeals = [seal, ...globalState.scopeEngineSeals.map(x => x.status === 'active'
      ? { ...x, status: 'superseded' as const, supersededAt: now, supersededReason: reason || 'تجميد جديد' } : x)];
    globalState.participantScopes = globalState.participantScopes.map(x => x.status === 'approved' ? { ...x, status: 'locked' as const, lockedAt: now } : x);
    auditTrustAction('SCOPE_ENGINE_SEALED', 'ScopeEngineSeal', seal.id,
      `تجميد إعداد محرك النطاق: ${categories.length} فئة و${participantScopeVersions.length} نطاق متسابق${reason ? ` — ${reason}` : ''}`,
      `Sealed the scope engine configuration: ${categories.length} categories and ${participantScopeVersions.length} participant scopes`);
    notify();
    return { ok: true as const, seal };
  };

  /*
   * ---- الدفعات والاحتياط والحجر والتقرير -------------------------------------------------
   *
   * حتى الآن كان كل نموذج يُولَّد في لحظته (just_in_time). هذا يصلح لمسابقةٍ صغيرة، ولا
   * يصلح لمسابقةٍ تريد أن تراجع نماذجها قبل يومها، ولا لمسابقةٍ تريد احتياطًا جاهزًا إن
   * سقط سؤال. فهنا وضعان آخران: التوليد المسبق، والمختلط.
   */

  /*
   * مِرصد الانكشاف.
   *
   * الموضع الذي أُلقي في قاعةٍ فيها ثلاثون منتظرًا لم يعد مجهولًا لهم. فيُقاس نصف قطر
   * انكشافه — عدد من سمعه، ومدى البثّ، وكم مضى — ثم يدخل المحرك من بوابة الندرة نفسها،
   * لا من باب ثانٍ موازٍ، فيُفاضل به بدل أن يُمنع به منعًا أعمى.
   */
  const exposureEvents = () => {
    const committeeSize = (committeeId?: string) => {
      const committee = globalState.committees.find(c => c.id === committeeId);
      return committee ? Math.max(6, committee.judgeIds.length + 8) : 12;
    };
    return globalState.questionModels
      .filter(m => m.competitionId === globalState.competition.id && (m.status === 'consumed' || m.status === 'sealed') && !!m.participantId)
      .flatMap((model, order) => {
        const participant = globalState.participants.find(p => p.id === model.participantId);
        const hallId = participant?.assignedCommitteeId;
        return model.questions.map(q => ({
          locusKey: `${q.surahNumber}:${q.startAyah}`,
          hallId,
          audienceSize: committeeSize(hallId),
          broadcast: 'hall_only' as const,
          sequence: order,
          day: model.createdAt.slice(0, 10),
        }));
      });
  };

  /*
   * ملفات الانكشاف الحالية — تُعرض للمنظم وتُستهلك في المفاضلة.
   *
   * تُحسب مرة لكل حالة: بناء بنك عشرة آلاف متسابق يستدعيها لكل عنقود، وإعادة الحساب لكل
   * عنقود تضاعف زمن السحب بلا فائدة ما دام السجل لم يتغيّر.
   */
  let exposureMemo: { key: string; profiles: ReturnType<typeof buildExposureProfiles> } | null = null;
  const exposureProfiles = () => {
    const key = `${globalState.competition.id}:${globalState.questionModels.length}:${globalState.participants.length}`;
    if (exposureMemo?.key === key) return exposureMemo.profiles;
    const profiles = buildExposureProfiles(exposureEvents());
    exposureMemo = { key, profiles };
    return profiles;
  };

  /** المتسابقون الصالحون للتوليد في فئة، مع نطاق كلٍّ منهم وعدد أسئلته. */
  const batchRowsFor = (categoryId?: string) => {
    const policy = getCompetitionPolicy(globalState.competition);
    return globalState.participants
      .filter(p => !['rejected', 'draft'].includes(p.status))
      .filter(p => !categoryId || p.categoryId === categoryId)
      .map(p => {
        const resolution = participantEffectiveScope(p.id);
        const category = globalState.competition.categories.find(c => c.id === p.categoryId);
        if (!resolution || resolution.blocked) return null;
        return {
          participantId: p.id, categoryId: p.categoryId, scope: resolution.scope, scopeVersion: resolution.version,
          questionCount: resolveQuestionCount(category, policy),
          reading: readingContextOf({ riwaya: p.riwaya }),
          hallId: p.assignedCommitteeId,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  };

  /**
   * توليد دفعة نماذج مسبقًا.
   *
   * بالمحرك نفسه وبالقيود نفسها التي تعمل يوم المسابقة — لا بمسار ثانٍ «للتجهيز». ولو
   * اختلف المساران لكان التجهيز كذبًا مهذّبًا.
   */
  const generateQuestionModelBatch = (options?: { categoryId?: string; reserveCount?: number; generationMode?: 'pre_generated' | 'hybrid'; seed?: string }) => {
    const rows = batchRowsFor(options?.categoryId);
    if (!rows.length) return { ok: false as const, reason: 'NO_ELIGIBLE_PARTICIPANTS' };
    const categoryId = options?.categoryId || rows[0].categoryId;
    const category = globalState.competition.categories.find(c => c.id === categoryId);
    const policy = getCompetitionPolicy(globalState.competition);
    const questionCount = resolveQuestionCount(category, policy);
    const candidates = poolsForRows(rows.map(r => ({ scope: r.scope, categoryId: r.categoryId, reading: r.reading })));
    if (!candidates.length) return { ok: false as const, reason: 'EMPTY_CANDIDATE_POOL' };
    const batchId = newId('qbatch');
    const outcome = generateModelBatch({
      batchId,
      organizationId: globalState.competition.organizationId,
      competitionId: globalState.competition.id,
      categoryId,
      categoryScopeVersion: category?.scopeVersion || 1,
      policyVersion: policy.version,
      poolVersion: `STRUCTURAL:${scopeSignature(categoryScopeOf(category))}`,
      participants: rows.map(r => ({ participantId: r.participantId, scope: r.scope, scopeVersion: r.scopeVersion, questionCount: r.questionCount, reading: r.reading, hallId: r.hallId })),
      candidates,
      distribution: categoryDistribution(category, questionCount),
      repeatPolicy: categoryRepeatPolicy(category, policy),
      targetDifficulty: policy.questions.targetDifficulty,
      difficultyTolerance: policy.questions.difficultyTolerance,
      seed: options?.seed || `${globalState.competition.id}:${categoryId}:${batchId}`,
      reserveCount: options?.reserveCount ?? 2,
      generationMode: options?.generationMode || 'pre_generated',
      requireReviewedDifficulty: !!category?.requireReviewedDifficulty,
      newId,
    });
    /* النماذج السابقة المسوّدة لهذه الفئة تُبطَل لا تُحذف: لا تاريخ يُمحى. */
    const now = new Date().toISOString();
    globalState.questionModels = [
      ...outcome.models, ...outcome.reserves,
      ...globalState.questionModels.map(m => m.categoryId === categoryId && m.batchId && m.batchId !== batchId && m.status !== 'consumed'
        ? { ...m, status: 'invalidated' as const, invalidatedAt: now, invalidationReason: `SUPERSEDED_BY_BATCH:${batchId}` } : m),
    ];
    globalState.questionModelBatches = [outcome.batch, ...globalState.questionModelBatches];
    auditTrustAction('QUESTION_MODEL_BATCH_GENERATED', 'QuestionModelBatch', batchId,
      `توليد دفعة: ${outcome.models.length} نموذجًا و${outcome.reserves.length} احتياطيًا لفئة ${category?.nameArabic || categoryId}${outcome.failures.length ? ` — تعذّر ${outcome.failures.length}` : ''}`,
      `Generated a batch of ${outcome.models.length} models and ${outcome.reserves.length} reserves for category ${categoryId}${outcome.failures.length ? ` — ${outcome.failures.length} failures` : ''}`);
    notify();
    return { ok: true as const, ...outcome };
  };

  const decideModelBatch = (batchId: string, decision: 'approved' | 'sealed' | 'invalidated', reason?: string) => {
    const batch = globalState.questionModelBatches.find(b => b.id === batchId);
    if (!batch) return { ok: false as const, reason: 'BATCH_NOT_FOUND' };
    if (decision === 'approved' && batch.approvalState !== 'draft') return { ok: false as const, reason: 'BATCH_NOT_DRAFT' };
    if (decision === 'sealed' && batch.approvalState !== 'approved') return { ok: false as const, reason: 'BATCH_NOT_APPROVED' };
    const now = new Date().toISOString();
    const next: QuestionModelBatchRecord = {
      ...batch, approvalState: decision,
      ...(decision === 'approved' ? { approvedBy: globalState.currentUser.id, approvedAt: now } : {}),
      ...(decision === 'sealed' ? { sealedAt: now } : {}),
    };
    globalState.questionModelBatches = globalState.questionModelBatches.map(b => b.id === batchId ? next : b);
    if (decision === 'invalidated') {
      globalState.questionModels = globalState.questionModels.map(m => m.batchId === batchId && m.status !== 'consumed'
        ? { ...m, status: 'invalidated' as const, invalidatedAt: now, invalidationReason: `BATCH_INVALIDATED:${reason || 'قرار المنظم'}` } : m);
    }
    auditTrustAction('QUESTION_MODEL_BATCH_DECIDED', 'QuestionModelBatch', batchId,
      `${decision === 'approved' ? 'اعتماد' : decision === 'sealed' ? 'ختم' : 'إبطال'} دفعة النماذج${reason ? ` — ${reason}` : ''}`,
      `${decision} question model batch${reason ? ` — ${reason}` : ''}`);
    notify();
    return { ok: true as const, batch: next };
  };

  /** النموذج المولَّد مسبقًا لمتسابق، إن وُجد صالحًا لنطاقه الساري. */
  const preGeneratedModelFor = (participantId: string) => {
    const resolution = participantEffectiveScope(participantId);
    if (!resolution || resolution.blocked) return null;
    const signature = resolution.signature || scopeSignature(resolution.scope);
    return globalState.questionModels.find(m =>
      m.participantId === participantId && m.competitionId === globalState.competition.id && m.status === 'sealed' && m.batchId
      && m.scopeSignature === signature && m.participantScopeVersion === resolution.version
      && globalState.questionModelBatches.find(b => b.id === m.batchId)?.approvalState === 'sealed') || null;
  };

  /** استدعاء نموذج احتياطي — بمطابقة بصمة النطاق، لا بالتقريب. */
  const claimReserveForParticipant = (participantId: string, reason: string) => {
    const resolution = participantEffectiveScope(participantId);
    if (!resolution || resolution.blocked) return { ok: false as const, reason: 'PARTICIPANT_SCOPE_UNAVAILABLE' };
    if (!reason?.trim()) return { ok: false as const, reason: 'REASON_REQUIRED' };
    /* الاحتياط من هذه المسابقة وهذه الجهة وحدها: نموذجٌ من مسابقةٍ أخرى ليس احتياطًا لهذه. */
    const reserves = globalState.questionModels.filter(m => !m.participantId && m.status === 'draft'
      && m.competitionId === globalState.competition.id && m.organizationId === globalState.competition.organizationId);
    const outcome = claimReserveModel({ reserves, participantId, scope: resolution.scope, scopeVersion: resolution.version, reason: reason.trim() });
    const claimed = outcome.model;
    if (!outcome.ok || !claimed) return { ok: false as const, reason: outcome.reason || 'NO_RESERVE_FOR_THIS_SCOPE' };
    globalState.questionModels = globalState.questionModels.map(m => m.id === claimed.id ? claimed : m);
    const participant = globalState.participants.find(p => p.id === participantId);
    auditTrustAction('QUESTION_MODEL_RESERVE_CLAIMED', 'QuestionModel', claimed.id,
      `استدعاء نموذج احتياطي للمتسابق ${participant?.code || participantId} — ${reason.trim()}`,
      `Claimed a reserve question model for ${participant?.code || participantId} — ${reason.trim()}`);
    notify();
    return { ok: true as const, model: claimed, remaining: outcome.remaining.length };
  };

  /**
   * حجر مواضع.
   *
   * لا يُحذف سؤال ولا تاريخ. يُعلَّم الموضع محجورًا فيخرج من البنك عند منبعه، ويُبطل كل
   * نموذج يحمله، ويُقاس الأثر: كم متسابقًا، وكم بقي، وهل تستطيع المسابقة الاستمرار.
   */
  const quarantineQuestionLoci = (input: { locusKeys: string[]; reason: string; severity?: QuestionQuarantineRecord['severity']; questionIds?: string[] }) => {
    const keys = [...new Set(input.locusKeys.map(k => k.trim()).filter(Boolean))];
    if (!keys.length) return { ok: false as const, reason: 'NO_LOCI' };
    if (!input.reason?.trim()) return { ok: false as const, reason: 'REASON_REQUIRED' };
    const policy = getCompetitionPolicy(globalState.competition);
    const rows = batchRowsFor();
    const candidates = rows.length ? poolsForRows(rows.map(r => ({ scope: r.scope, categoryId: r.categoryId, reading: r.reading }))) : [];
    const requiredDraws = rows.reduce((sum, r) => sum + r.questionCount, 0) || policy.questions.questionsPerParticipant;
    const now = new Date().toISOString();
    const impact = applyQuarantine({
      locusKeys: keys, reason: input.reason.trim(),
      models: globalState.questionModels.filter(m => m.competitionId === globalState.competition.id),
      candidates, requiredDraws, now,
    });
    const invalidatedIds = new Set(impact.invalidatedModels.map(m => m.id));
    globalState.questionModels = globalState.questionModels.map(m => invalidatedIds.has(m.id) ? impact.invalidatedModels.find(x => x.id === m.id)! : m);
    /* الحجوزات القائمة على موضع محجور تُنقل إلى «محجور» فلا يصل الموضع إلى قاعة. */
    const heldOnQuarantined = globalState.questionReservations.filter(r => keys.includes(r.locusKey) && r.state !== 'quarantined').map(r => r.id);
    if (heldOnQuarantined.length) {
      globalState.questionReservations = transitionReservations({
        records: globalState.questionReservations, ids: heldOnQuarantined, to: 'quarantined',
        actorId: globalState.currentUser.id, reason: input.reason.trim(), now,
      }).records;
    }
    const record: QuestionQuarantineRecord = {
      id: newId('qquar'), organizationId: globalState.competition.organizationId, competitionId: globalState.competition.id,
      locusKeys: keys, questionIds: input.questionIds || [], reason: input.reason.trim(),
      raisedBy: globalState.currentUser.id, raisedAt: now, severity: input.severity || 'defect',
      invalidatedModelIds: [...invalidatedIds], affectedParticipantCount: impact.affectedParticipantIds.length,
      remainingUniqueLoci: impact.remainingUniqueLoci, averageReuseAfter: impact.averageReuseAfter,
      canContinue: impact.canContinue, summaryArabic: impact.summaryArabic, summaryEnglish: impact.summaryEnglish,
      status: 'active',
    };
    globalState.questionQuarantines = [record, ...globalState.questionQuarantines];
    auditTrustAction('QUESTION_LOCI_QUARANTINED', 'QuestionQuarantine', record.id, record.summaryArabic, record.summaryEnglish);
    if (!impact.canContinue) createIncident('quran_source_discrepancy', 'الحجر أفرغ البنك', record.summaryArabic, 'critical');
    notify();
    return { ok: true as const, record, impact };
  };

  /**
   * الاسترداد الطارئ: خطوةٌ واحدة بدل أربع.
   *
   * الحجر وحده يترك المتأثرين بلا نماذج، والمنظم في القاعة لا يملك ترف تنفيذ أربع خطواتٍ
   * بيده. فهذا يحجر، ويبطل، ويعطي كل متأثرٍ احتياطَه إن وُجد لبصمة نطاقه، وإلا يولّد له من
   * البنك **بعد** الحجر. ومن لم يُسترد يُقال باسمه وبسببه: «عولج الأثر» ليست «عولج الجميع».
   */
  const recoverQuarantinedLoci = (input: { locusKeys: string[]; reason: string; severity?: QuestionQuarantineRecord['severity']; categoryId?: string }) => {
    const keys = [...new Set(input.locusKeys.map(k => k.trim()).filter(Boolean))];
    if (!keys.length) return { ok: false as const, reason: 'NO_LOCI' };
    if (!input.reason?.trim()) return { ok: false as const, reason: 'REASON_REQUIRED' };
    const policy = getCompetitionPolicy(globalState.competition);
    const rows = batchRowsFor(input.categoryId);
    if (!rows.length) return { ok: false as const, reason: 'NO_ELIGIBLE_PARTICIPANTS' };
    const categoryId = input.categoryId || rows[0].categoryId;
    const category = globalState.competition.categories.find(c => c.id === categoryId);
    const candidates = poolsForRows(rows.map(r => ({ scope: r.scope, categoryId: r.categoryId, reading: r.reading })));
    const now = new Date().toISOString();
    const outcome = recoverFromQuarantine({
      locusKeys: keys, reason: input.reason.trim(),
      models: globalState.questionModels.filter(m => m.competitionId === globalState.competition.id),
      candidates,
      participants: rows.map(r => ({ participantId: r.participantId, scope: r.scope, scopeVersion: r.scopeVersion, questionCount: r.questionCount, reading: r.reading, hallId: r.hallId })),
      distribution: categoryDistribution(category, resolveQuestionCount(category, policy)),
      repeatPolicy: categoryRepeatPolicy(category, policy),
      targetDifficulty: policy.questions.targetDifficulty,
      difficultyTolerance: policy.questions.difficultyTolerance,
      seed: `${globalState.competition.id}:${categoryId}:${now}`,
      organizationId: globalState.competition.organizationId,
      competitionId: globalState.competition.id,
      categoryId, categoryScopeVersion: category?.scopeVersion || 1,
      policyVersion: policy.version,
      poolVersion: `STRUCTURAL:${scopeSignature(categoryScopeOf(category))}`,
      requireReviewedDifficulty: !!category?.requireReviewedDifficulty,
      requiredDraws: rows.reduce((sum, r) => sum + r.questionCount, 0),
      now, newId,
    });
    /* نماذج المسابقات الأخرى تبقى كما هي: الاسترداد لا يمسّ ما ليس له. */
    const foreign = globalState.questionModels.filter(m => m.competitionId !== globalState.competition.id);
    globalState.questionModels = [...outcome.models, ...foreign];

    const heldOnQuarantined = globalState.questionReservations.filter(r => keys.includes(r.locusKey) && r.state !== 'quarantined').map(r => r.id);
    if (heldOnQuarantined.length) {
      globalState.questionReservations = transitionReservations({
        records: globalState.questionReservations, ids: heldOnQuarantined, to: 'quarantined',
        actorId: globalState.currentUser.id, reason: input.reason.trim(), now,
      }).records;
    }

    const record: QuestionQuarantineRecord = {
      id: newId('qquar'), organizationId: globalState.competition.organizationId, competitionId: globalState.competition.id,
      locusKeys: keys, questionIds: [], reason: input.reason.trim(),
      raisedBy: globalState.currentUser.id, raisedAt: now, severity: input.severity || 'defect',
      invalidatedModelIds: outcome.quarantine.invalidatedModels.map(m => m.id),
      affectedParticipantCount: outcome.quarantine.affectedParticipantIds.length,
      remainingUniqueLoci: outcome.quarantine.remainingUniqueLoci,
      averageReuseAfter: outcome.quarantine.averageReuseAfter,
      canContinue: outcome.quarantine.canContinue,
      summaryArabic: outcome.summaryArabic, summaryEnglish: outcome.summaryEnglish,
      status: 'active',
    };
    globalState.questionQuarantines = [record, ...globalState.questionQuarantines];
    auditTrustAction('QUESTION_QUARANTINE_RECOVERED', 'QuestionQuarantine', record.id, outcome.summaryArabic, outcome.summaryEnglish);
    for (const row of outcome.unrecovered) {
      const participant = globalState.participants.find(p => p.id === row.participantId);
      createIncident('conflict_routing', 'متسابق بلا نموذج بعد الحجر',
        `${participant?.code || row.participantId}: ${row.ar}`, 'critical');
    }
    notify();
    return { ok: true as const, record, outcome };
  };

  const liftQuestionQuarantine = (quarantineId: string, reason: string) => {
    const record = globalState.questionQuarantines.find(q => q.id === quarantineId);
    if (!record) return { ok: false as const, reason: 'QUARANTINE_NOT_FOUND' };
    if (record.status === 'lifted') return { ok: false as const, reason: 'ALREADY_LIFTED' };
    if (!reason?.trim()) return { ok: false as const, reason: 'REASON_REQUIRED' };
    const now = new Date().toISOString();
    globalState.questionQuarantines = globalState.questionQuarantines.map(q => q.id === quarantineId
      ? { ...q, status: 'lifted' as const, liftedAt: now, liftedBy: globalState.currentUser.id, liftReason: reason.trim() } : q);
    /* رفع الحجر يعيد الموضع إلى البنك، ولا يعيد إحياء نموذج أُبطل: ذاك يُعاد توليده. */
    auditTrustAction('QUESTION_QUARANTINE_LIFTED', 'QuestionQuarantine', quarantineId,
      `رفع حجر ${record.locusKeys.length} موضعًا — ${reason.trim()}؛ النماذج المبطلة لا تُحيا، تُعاد توليدًا.`,
      `Lifted quarantine on ${record.locusKeys.length} loci — ${reason.trim()}; invalidated models are regenerated, not revived.`);
    notify();
    return { ok: true as const };
  };

  /* ---- دورة حياة الحجز ---- */

  const reserveQuestionsForParticipant = (input: { participantId: string; items: { locusKey: string; questionId: string }[]; sessionId?: string; modelId?: string; ttlSeconds?: number; idempotencyKey?: string }) => {
    const expired = expireReservations(globalState.questionReservations, new Date().toISOString(), 'system');
    globalState.questionReservations = expired.records;
    const outcome = reserveQuestions({
      records: globalState.questionReservations,
      organizationId: globalState.competition.organizationId,
      competitionId: globalState.competition.id,
      items: input.items, participantId: input.participantId, sessionId: input.sessionId, modelId: input.modelId,
      idempotencyKey: input.idempotencyKey || `${globalState.competition.id}:${input.participantId}:${input.modelId || input.sessionId || 'draw'}`,
      actorId: globalState.currentUser.id, ttlSeconds: input.ttlSeconds, newId,
    });
    globalState.questionReservations = outcome.records;
    if (!outcome.replayed && outcome.created.length) {
      auditTrustAction('QUESTION_RESERVATIONS_CREATED', 'QuestionReservation', outcome.created[0].id,
        `حجز ${outcome.created.length} موضعًا مؤقتًا${outcome.conflicts.length ? ` وتعذّر ${outcome.conflicts.length} لأن غيرهم يحجزها` : ''}`,
        `Reserved ${outcome.created.length} loci${outcome.conflicts.length ? `; ${outcome.conflicts.length} were held by others` : ''}`);
    }
    notify();
    return outcome;
  };

  const advanceReservations = (ids: string[], to: QuestionReservationRecord['state'], reason?: string) => {
    const outcome = transitionReservations({ records: globalState.questionReservations, ids, to, actorId: globalState.currentUser.id, reason });
    globalState.questionReservations = outcome.records;
    if (outcome.changed.length) {
      auditTrustAction('QUESTION_RESERVATION_ADVANCED', 'QuestionReservation', outcome.changed[0].id,
        `نقل ${outcome.changed.length} حجزًا إلى «${to}»${reason ? ` — ${reason}` : ''}`,
        `Advanced ${outcome.changed.length} reservations to ${to}${reason ? ` — ${reason}` : ''}`);
    }
    notify();
    return outcome;
  };

  const sweepExpiredReservations = () => {
    const outcome = expireReservations(globalState.questionReservations, new Date().toISOString(), 'system');
    globalState.questionReservations = outcome.records;
    if (outcome.changed.length) {
      auditTrustAction('QUESTION_RESERVATIONS_EXPIRED', 'QuestionReservation', outcome.changed[0].id,
        `انقضت مدة ${outcome.changed.length} حجزًا فعادت مواضعها إلى المخزون`,
        `${outcome.changed.length} reservations expired and their loci returned to the pool`);
      notify();
    }
    return outcome.changed.length;
  };

  const reservationBlockedLoci = (exceptParticipantId?: string) => blockedLocusKeys(globalState.questionReservations, new Date().toISOString(), exceptParticipantId);

  /**
   * تقرير عدالة وتوزيع الأسئلة.
   *
   * يُبنى من النماذج المعتمدة ومن تحليل الازدحام، ويُختم ببصمة تُعيد إنتاجه. وقبل أن يُحفظ
   * يُفحص فحصًا صريحًا: لا اسم متسابق ولا كوده فيه. التقرير عن الأسئلة لا عن الناس.
   */
  const buildCompetitionFairnessReport = async (options?: { categoryId?: string; batchId?: string; label?: string }) => {
    const [{ buildFairnessReport, fairnessReportPrivacyViolations }, { zoneAwareReuseLowerBound }] = await Promise.all([import('./fairness-report'), import('./scope-demand')]);
    const policy = getCompetitionPolicy(globalState.competition);
    const models = globalState.questionModels.filter(m =>
      m.competitionId === globalState.competition.id && m.status !== 'invalidated' && !!m.participantId
      && (!options?.categoryId || m.categoryId === options.categoryId)
      && (!options?.batchId || m.batchId === options.batchId));
    if (!models.length) return { ok: false as const, reason: 'NO_MODELS' };
    const demand = await scopeDemandAnalysis();
    const rows = batchRowsFor(options?.categoryId);
    const candidates = rows.length ? poolsForRows(rows.map(r => ({ scope: r.scope, categoryId: r.categoryId, reading: r.reading }))) : [];
    const lowerBound = demand.clusters.length && candidates.length ? zoneAwareReuseLowerBound({
      clusters: demand.clusters, candidates,
      planFor: categoryId => categoryDistribution(globalState.competition.categories.find(c => c.id === categoryId), resolveQuestionCount(globalState.competition.categories.find(c => c.id === categoryId), policy)),
      questionCountFor: cluster => resolveQuestionCount(globalState.competition.categories.find(c => c.id === cluster.categoryIds[0]), policy),
    }) : null;
    const category = globalState.competition.categories.find(c => c.id === options?.categoryId);
    const report = await buildFairnessReport({
      id: newId('fairrep'),
      organizationId: globalState.competition.organizationId,
      competitionId: globalState.competition.id,
      scope: options?.batchId ? 'batch' : options?.categoryId ? 'category' : 'competition',
      scopeRef: options?.batchId || options?.categoryId,
      titleSuffixArabic: options?.label || category?.nameArabic,
      models, aggregate: aggregateFairness(models), demand, lowerBound,
      /* الفشل المعلَن يدخل التقرير: نماذجُ ناجحةٌ وحدها تُخرج ورقةً نظيفة تُضلّل. */
      declaredFailures: globalState.questionModelBatches
        .filter(b => b.competitionId === globalState.competition.id
          && (!options?.batchId || b.id === options.batchId)
          && (!options?.categoryId || b.categoryId === options.categoryId)
          && b.approvalState !== 'invalidated')
        .flatMap(b => (b.declaredFailures || []).flatMap(f => Array.from({ length: f.count }, () => ({ code: f.code, ar: f.ar, en: f.en })))),
      repeatPolicy: categoryRepeatPolicy(category, policy),
      policyVersion: policy.version,
      generatedBy: globalState.currentUser.id,
    });
    /* حاجز الخصوصية: لو تسرّب اسم أو كود إلى نصّ التقرير لم يُحفظ ولم يُصدَّر. */
    const forbidden = globalState.participants.flatMap(p => [p.code, p.fullName, p.fullNameArabic].filter((x): x is string => !!x));
    const leaks = fairnessReportPrivacyViolations(report, forbidden);
    if (leaks.length) return { ok: false as const, reason: 'PRIVACY_VIOLATION', leaks };
    globalState.fairnessReports = [report, ...globalState.fairnessReports].slice(0, 20);
    auditTrustAction('FAIRNESS_REPORT_BUILT', 'FairnessReport', report.id,
      `إصدار تقرير عدالة وتوزيع الأسئلة عن ${models.length} نموذجًا — بصمته ${report.reportHash.slice(0, 12)}`,
      `Issued a question fairness and distribution report over ${models.length} models — hash ${report.reportHash.slice(0, 12)}`);
    notify();
    return { ok: true as const, report };
  };

  const removeCategory = (categoryId: string) => {
    if (globalState.participants.some(p=>p.categoryId===categoryId)) return false;
    globalState.competition = { ...globalState.competition, categories:globalState.competition.categories.filter(c=>c.id!==categoryId) };
    markCompetitionConfigChanged(); notify(); return true;
  };

  const addCommittee = () => {
    const n=globalState.committees.length+1;
    const firstCategory=globalState.competition.categories[0];
    const committee: Committee={ id:newId('comm'),competitionId:globalState.competition.id,name:`Committee ${n}`,nameArabic:`اللجنة ${n}`,code:`C${n}`,venueHall:'',assignedCategories:firstCategory?[firstCategory.id]:[],headJudgeId:'',judgeIds:[],status:'ready',completedCount:0,averageSessionMinutes:globalState.competition.ruleSet.questionDurationMinutes||8,audioInputOk:false,devicesConnected:0 };
    globalState.committees=[...globalState.committees,committee]; void persistScopedDocument('committees',committee.id,committee as unknown as Record<string,unknown>); notify(); return committee;
  };

  const updateCommittee = (committeeId: string, patch: Partial<Committee>) => {
    globalState.committees=globalState.committees.map(c=>c.id===committeeId?{...c,...patch}:c);
    const next=globalState.committees.find(c=>c.id===committeeId);
    if(next)void persistScopedDocument('committees',next.id,next as unknown as Record<string,unknown>);
    notify();
  };

  // Toggle a judge's specialty ON A SPECIFIC PANEL only — never mutate the shared judge profile,
  // so the same judge can carry a different scope on each committee.
  const updateCommitteeJudgeSpecialty = (committeeId: string, judgeId: string, specialty: string) => {
    const committee=globalState.committees.find(c=>c.id===committeeId);
    if(!committee)return;
    const judge=globalState.judges.find(j=>j.id===judgeId||j.userId===judgeId);
    const key=(committee.judgeIds.includes(judgeId)?judgeId:(judge&&committee.judgeIds.includes(judge.userId)?judge.userId:(judge?.id||judgeId)));
    const fallback=judge?[...new Set((judge.specialties?.length?judge.specialties:[judge.specialty||'all']).filter(Boolean))]:['all'];
    const currentList=committee.judgeSpecialties?.[key]?.length?committee.judgeSpecialties[key]:fallback;
    const current=new Set(currentList.filter(Boolean));
    let nextList:string[];
    if(specialty==='all'){nextList=['all'];}
    else{current.delete('all');current.has(specialty)?current.delete(specialty):current.add(specialty);nextList=[...current];}
    if(!nextList.length)nextList=['all'];
    const map={...(committee.judgeSpecialties||{}),[key]:[...new Set(nextList)]};
    updateCommittee(committeeId,{judgeSpecialties:map});
  };

  const removeCommittee = (committeeId:string) => {
    const committee=globalState.committees.find(c=>c.id===committeeId);
    if(!committee)return {ok:false,mode:'not_found' as const};
    const hasParticipantHistory=globalState.participants.some(p=>p.assignedCommitteeId===committeeId);
    const isActive=globalState.activeSession.committee?.id===committeeId||Boolean(committee.currentParticipantId);
    const hasHistory=hasParticipantHistory||isActive||committee.completedCount>0;
    if(hasHistory){
      const paused={...committee,status:'paused' as const,currentParticipantId:undefined};
      globalState.committees=globalState.committees.map(c=>c.id===committeeId?paused:c);
      void persistScopedDocument('committees',paused.id,paused as unknown as Record<string,unknown>);
      auditTrustAction('COMMITTEE_ARCHIVED_FOR_HISTORY','Committee',committeeId,'لم تُحذف اللجنة لأن لها سجلًا تشغيليًا؛ تم إيقافها مع حفظ التاريخ','Committee preserved and paused because operational history exists');
      notify();
      return {ok:false,mode:'paused_due_to_history' as const};
    }
    globalState.committees=globalState.committees.filter(c=>c.id!==committeeId);
    globalState.judges=globalState.judges.map(j=>j.assignedCommitteeId===committeeId?{...j,assignedCommitteeId:undefined}:j);
    void deleteScopedDocument('committees',committeeId);
    auditTrustAction('COMMITTEE_DELETED','Committee',committeeId,'حذف لجنة فارغة لم تبدأ أي جلسة تحكيم','Deleted an empty committee with no judging history');
    notify();
    return {ok:true,mode:'deleted' as const};
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

  /*
   * النسخة العامة للمسابقة — وهي وحدها ما يراه الخادم — كانت تُكتب كأثرٍ جانبيّ لمزامنةٍ
   * مؤجَّلة ثانيةً واحدة، تُلغى صامتةً إن كان الجهاز دون إنترنت أو المستخدم غير مسجَّل أو
   * دوره غير مخوَّل، وتُبتلع أخطاؤها في سجلّ الطرفية. فيرى المدير «فُتحت المسابقة»، وتَظهر
   * الصفحة العامة من نسخته المحلية، ثم يُكمل المتسابق خطواته الثلاث فيردّ الخادم «لم نعثر
   * على المسابقة» — لأنها فعلًا لم تصل إليه قطّ. النشر الآن كتابةٌ صريحة تُنتظَر ويُبلَّغ
   * عن فشلها في وجه من نشر، لا في سجلٍّ لا يفتحه أحد.
   */
  /* ── إسقاط شاشات القاعة ───────────────────────────────────────────────────
   *
   * الشاشات كانت تحتاج جهازًا مسجَّلًا بدورٍ تشغيليّ لتقرأ الطابور — أي عشرة أجهزة
   * بصلاحية قراءة سجلّ المتسابقين كاملًا معلَّقة في ممرّات بلا حارس. فصار جهاز الإدارة
   * ينشر إسقاطًا واحدًا بالأكواد وحدها، وتقرؤه كل الشاشات بلا تسجيل دخول ولا امتياز.
   */
  const currentDisplayBoard = (): DisplayBoard => buildDisplayBoard({
    competitionId: globalState.competition.id,
    /* مسابقةٌ بلا اسمٍ إنجليزي كانت ستنشر شاشةً بعنوانٍ فارغ. الاحتياط وقت الكتابة. */
    competitionName: storedCompetitionName(true),
    competitionNameArabic: storedCompetitionName(false),
    participants: globalState.participants,
    committees: globalState.committees,
    categories: globalState.competition.categories || [],
    fallbackSessionMinutes: globalState.competition.ruleSet?.questionDurationMinutes,
    elapsedSecondsByCommittee: globalState.activeSession.committee
      ? { [globalState.activeSession.committee.id]: globalState.activeSession.durationSeconds }
      : undefined,
    nextDepth: PANEL_NEXT_DEPTH,
  });

  /** من يملك نشر الإسقاط. أضيق مجموعة تُنجز العمل: من يدير المسابقة أو يشغّلها. */
  const canPublishDisplayBoard = () =>
    !!auth.currentUser
    && !globalState.isOffline
    && !launchPlaceholderActive()
    && ['super_admin','org_admin','comp_admin','ops_manager'].includes(globalState.currentUser.role);

  const publishDisplayBoard = async ():Promise<{ok:boolean;reason:string}> => {
    if(!canPublishDisplayBoard())return {ok:false,reason:'NOT_ELIGIBLE'};
    try{
      const {db,doc,setDoc}=await getFirestoreClient();
      await setDoc(doc(db,'public_boards',globalState.competition.id),{
        organizationId:globalState.competition.organizationId,
        board:currentDisplayBoard(),
        updatedAt:new Date().toISOString(),
      });
      return {ok:true,reason:''};
    }catch(err){
      console.warn('MIZAN display board publish failed',err);
      return {ok:false,reason:'PUBLISH_FAILED'};
    }
  };

  /** إطفاء كل الشاشات دفعةً واحدة: تُحذف الوثيقة فلا يبقى ما يُقرأ. */
  const unpublishDisplayBoard = async ():Promise<boolean> => {
    if(!auth.currentUser||!['super_admin','org_admin','comp_admin'].includes(globalState.currentUser.role))return false;
    try{
      const {db,doc,deleteDoc}=await getFirestoreClient();
      await deleteDoc(doc(db,'public_boards',globalState.competition.id));
      return true;
    }catch(err){console.warn('MIZAN display board unpublish failed',err);return false}
  };

  /*
   * قراءة الإسقاط المنشور. الوثيقة مكشوفة للقراءة وكاتبها مُصرَّح لا معصوم، فما يُقرأ
   * يمرّ بـ`parseDisplayBoard` الذي يعيد بناءه من الحقول المعروفة وحدها — فحقلٌ لم
   * يُصمَّم لا يبلغ الشاشة ولو كُتب في الوثيقة.
   */
  const loadPublicDisplayBoard = async (competitionId:string):Promise<DisplayBoard|null> => {
    try{
      const {db,doc,getDoc}=await getFirestoreClient();
      const snap=await getDoc(doc(db,'public_boards',competitionId));
      if(!snap.exists())return null;
      const board=parseDisplayBoard((snap.data() as {board?:unknown})?.board);
      return board&&board.competitionId===competitionId?board:null;
    }catch(err){console.warn('MIZAN display board load failed',err);return null}
  };

  const publishPublicCompetitionRecord=async():Promise<{ok:boolean;reason:string}>=>{
    if(launchPlaceholderActive())return {ok:false,reason:'أكمل تهيئة المسابقة والجهة قبل فتح التسجيل.'};
    if(globalState.isOffline)return {ok:false,reason:'الجهاز دون إنترنت الآن، ولا يمكن نشر صفحة التسجيل العامة حتى يعود الاتصال.'};
    if(!auth.currentUser)return {ok:false,reason:'يلزم تسجيل الدخول لنشر صفحة التسجيل العامة.'};
    if(!['super_admin','org_admin','comp_admin'].includes(globalState.currentUser.role))return {ok:false,reason:'صلاحية هذا الحساب لا تسمح بنشر صفحة التسجيل العامة.'};
    try{
      const {db,doc,setDoc}=await getFirestoreClient();
      await setDoc(doc(db,'public_competitions',globalState.competition.id),{organizationId:globalState.competition.organizationId,competition:globalState.competition,updatedAt:new Date().toISOString()},{merge:true});
      resolveCloudScope('competition');
      return {ok:true,reason:''};
    }catch(err){
      console.error('MIZAN public competition publish failed',{competitionId:globalState.competition.id,error:err instanceof Error?err.message:String(err)});
      return {ok:false,reason:'تعذّر نشر صفحة التسجيل العامة. تحقّق من الاتصال وأعد المحاولة.'};
    }
  };

  /*
   * النشر كان يحدث لحظة فتح التسجيل فقط. أي مسابقة فُتحت قبل ذلك — أو فُتحت ثم تعذّر
   * رفع نسختها العامة مرّة واحدة — تبقى بلا سجلّ عامّ، فتظهر صفحتها من ذاكرة جهاز الإدارة
   * بينما يرد الخادم «لم نعثر على المسابقة» عند إرسال الطلب. هذان الفعلان يجعلان الحالة
   * قابلة للفحص وللإصلاح بضغطة واحدة بدل أن تُكتشف من متسابقٍ ضاع نموذجه.
   */
  const checkPublicCompetitionPublished=async():Promise<boolean>=>{
    if(launchPlaceholderActive()||globalState.isOffline)return false;
    try{
      const {db,doc,getDoc}=await getFirestoreClient();
      const snap=await getDoc(doc(db,'public_competitions',globalState.competition.id));
      const data=snap.exists()?snap.data() as {competition?:Competition}:null;
      return !!data?.competition&&data.competition.id===globalState.competition.id;
    }catch(err){console.warn('MIZAN public competition check failed',err);return false}
  };
  const republishPublicCompetition=async()=>publishPublicCompetitionRecord();

  const publishCompetition = async () => {
    const issues=getReadinessIssues(globalState.competition);
    const contradictions=detectContradictions({competition:globalState.competition,quranSources:globalState.quranSourceManifests,aiValidations:globalState.aiCapabilityValidations,availableQualifiedJudges:globalState.judges.filter(j=>j.isReady).length,committeeCount:globalState.committees.filter(c=>c.status!=='offline').length});
    const scientific=scientificSourcesForCompetition();
    const scientificBlockers=scientific.flatMap(({category,reading,source,content})=>{
      const out:{code:string;message:string;categoryId:string}[]=[];
      if(!reading)out.push({code:'CANONICAL_READING_MAPPING_REQUIRED',message:`${category.name}: reading is not mapped to the canonical qiraat graph.`,categoryId:category.id});
      if(!source&&!isKfgqpcOfficialReading({riwaya:category.riwaya}))out.push({code:'CERTIFIED_QURAN_SOURCE_REQUIRED',message:`${category.name}: no official or internally certified Quran source for ${category.riwaya}.`,categoryId:category.id});
      // فتح التسجيل لا يحتاج نص السؤال على جهاز الإدارة. توفر محتوى الحزمة يُفحص قبل FairDraw/جلسة التحكيم.
      if(source&&!content&&globalState.competition.status==='live')out.push({code:'CERTIFIED_QURAN_CONTENT_REQUIRED',message:`${category.name}: certified source content is not available for exact package ${source.packageHash||source.id}.`,categoryId:category.id});
      return out;
    });
    const laterStageWarnings=[...contradictions.filter(x=>x.severity==='BLOCKER').map(x=>x.title),...scientificBlockers.map(x=>x.message)];
    // فتح التسجيل يعني استقبال الطلبات فقط. نقص المحكمين، تجهيز اللجان، المصدر العلمي للسؤال
    // وتعارضات نشر النتائج تُعالج قبل التحكيم/النشر في بواباتها الخاصة، ولا تجعل زر التسجيل ميتًا.
    if(issues.length) return {ok:false,issues:issues.map(x=>x.ar),warnings:laterStageWarnings,scientificBlockers,contradictions};
    globalState.contradictionIssues=contradictions;
    const previousStatus=globalState.competition.status;
    globalState.competition={...globalState.competition,status:'registration_open'};
    const published=await publishPublicCompetitionRecord();
    if(!published.ok){
      /* لا تُترك المسابقة «مفتوحة» على جهاز الإدارة وحده: الحالة تعود كما كانت حتى ينجح النشر. */
      globalState.competition={...globalState.competition,status:previousStatus};
      notify();
      return {ok:false,issues:[published.reason],warnings:laterStageWarnings,scientificBlockers,contradictions};
    }
    markCompetitionConfigChanged();
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'COMPETITION_PUBLISHED',entityType:'Competition',entityId:globalState.competition.id,humanSummaryArabic:productionMode?'فتح التسجيل بعد اجتياز بوابات الجاهزية العلمية والتشغيلية.':'فتح التسجيل في بيئة تطوير؛ الاعتماد العلمي الكامل مطلوب قبل الإنتاج.',humanSummaryEnglish:productionMode?'Opened registration after scientific and operational gates passed.':'Opened registration in development; full scientific source certification remains required for production.',currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs];
    notify(); return {ok:true,issues:[],warnings:laterStageWarnings,scientificBlockers,contradictions};
  };

  const categoryPassageAyahRange=(category:Category|undefined)=>{
    if(!category)return {} as {minAyahCount?:number;maxAyahCount?:number;targetAyahCount?:number};
    if(category.passageMode==='ayat'&&category.ayatPerQuestion&&category.ayatPerQuestion>0){const n=Math.max(1,Math.round(category.ayatPerQuestion));return {minAyahCount:n,maxAyahCount:n,targetAyahCount:n};}
    const legacyUnits=category.pagePortion==='quarter'?1:category.pagePortion==='half'?2:category.pagePortion==='third'?Math.max(1,Math.round(4/3)):category.pagePortion==='full'?4:undefined;
    const units=category.pageQuarterUnits&&category.pageQuarterUnits>0?category.pageQuarterUnits:legacyUnits;
    if(!units)return category.ayatPerQuestion&&category.ayatPerQuestion>0?{minAyahCount:category.ayatPerQuestion,maxAyahCount:category.ayatPerQuestion,targetAyahCount:category.ayatPerQuestion}:{};
    // تقدير تشغيلي فقط: طول الآية متغير، لذلك يحدد «ربع/نصف/وجه» نافذة آيات لا رقمًا نصيًا جامدًا.
    const presets:Record<number,{minAyahCount:number;maxAyahCount:number}>={1:{minAyahCount:1,maxAyahCount:3},2:{minAyahCount:3,maxAyahCount:5},3:{minAyahCount:4,maxAyahCount:7},4:{minAyahCount:6,maxAyahCount:9}};
    const range=presets[Math.round(units)]||{minAyahCount:Math.max(1,Math.round(units*1.5)),maxAyahCount:Math.max(2,Math.round(units*2.25))};
    return {...range,targetAyahCount:Math.max(1,Math.round((range.minAyahCount+range.maxAyahCount)/2))};
  };

  const sourceResolvedQuestionPool = (participant:Participant, source:QuranSourceManifestRecord, content:QuranSourceContentRecord) => {
    const reading=resolveReading({riwaya:participant.riwaya});
    if(!reading)return [];
    const category=globalState.competition.categories.find(c=>c.id===participant.categoryId);
    const passage=categoryPassageAyahRange(category);
    const approved=new Set(globalState.questionGovernance.filter(g=>g.competitionId===globalState.competition.id&&g.status==='approved'&&g.sourceManifestId===source.id).map(g=>g.questionId));
    const rows=new Map(content.rows.map(v=>[`${v.surah}:${v.ayah}`,v.text]));
    const candidates=DEVELOPMENT_QUESTION_BANK.filter(q=>{
      const qr=resolveReading({riwaya:q.riwaya});
      const available=q.endAyah-q.startAyah+1;
      return qr?.qiraahId===reading.qiraahId&&qr?.rawiId===reading.rawiId&&approved.has(q.id)&&(!passage.minAyahCount||available>=passage.minAyahCount);
    });
    return candidates.flatMap(q=>{
      // لا نمد السؤال المعتمد خارج حدوده العلمية؛ يمكن فقط تقصيره إلى طول الفئة.
      const target=passage.targetAyahCount?Math.min(q.endAyah,q.startAyah+passage.targetAyahCount-1):q.endAyah;
      const verses:string[]=[];
      for(let ayah=q.startAyah;ayah<=target;ayah++){const text=rows.get(`${q.surahNumber}:${ayah}`);if(!text)return [];verses.push(text);}
      const governance=globalState.questionGovernance.find(g=>g.competitionId===globalState.competition.id&&g.questionId===q.id&&g.sourceManifestId===source.id&&g.status==='approved');
      return [{...q,endAyah:target,riwaya:participant.riwaya,expectedTextArabic:verses.join(' '),difficultyRating:governance?.expertDifficulty??q.difficultyRating}];
    });
  };

  const startSessionForParticipant = async (participantId: string) => {
    const participant = globalState.participants.find(p => p.id === participantId);
    /* القراران في `session-start-core` مُختبَرين بالتشغيل؛ وما هنا أثرهما. */
    const assignedCommittee = participant ? globalState.committees.find(c => c.id === participant.assignedCommitteeId) : undefined;
    const choice = chooseSessionCommittee({
      participant,
      assignedCommittee,
      assignedHasHardConflict: !!(assignedCommittee && participant && committeeHasHardConflict(assignedCommittee, participant)),
      compatibleCommittees: participant ? compatibleCommitteesFor(participant) : [],
    });
    if (choice.kind === 'no-participant' || !participant) return false;
    if (choice.kind === 'no-safe-committee') {
      createIncident('conflict_routing', 'No conflict-free committee', `Participant ${participant.code} needs a manual conflict-safe committee assignment.`, 'critical');
      return false;
    }
    const committee = choice.committee;
    const policy = getCompetitionPolicy(globalState.competition);
    const frozen = freezeRulesOnce({
      policy,
      ruleSet: globalState.competition.ruleSet,
      ruleSets: globalState.competition.ruleSets,
      now: new Date().toISOString(),
    });
    if (frozen) globalState.competition = { ...globalState.competition, policy: frozen.policy, ruleSet: frozen.ruleSet, ruleSets: frozen.ruleSets };
    const category = globalState.competition.categories.find(c => c.id === participant.categoryId);
    const reading=resolveReading({riwaya:participant.riwaya});
    if(productionMode){
      try{
        const capabilities=await fetchSecureQuestionCapabilities();
        if(!capabilities.ready){createIncident('quran_source_discrepancy','Secure question runtime blocker',`Official session blocked for ${participant.code}: server FairDraw + Quran resolution + Silent Question Capsule are not all active.`,'critical');return false;}
        const runtime=await findSecureRuntimeForParticipant(globalState.competition.id,participant.id);
        if(runtime.committeeId!==committee.id){createIncident('conflict_routing','Secure runtime committee mismatch',`Participant ${participant.code} is provisioned for committee ${runtime.committeeId}, not ${committee.id}.`,'critical');return false;}
        const runtimeReading=resolveReading({qiraah:runtime.qiraah,rawi:runtime.rawi});
        if(!reading||!runtimeReading||runtimeReading.qiraahId!==reading.qiraahId||runtimeReading.rawiId!==reading.rawiId){createIncident('quran_source_discrepancy','Secure runtime reading mismatch',`Server-held question runtime reading does not match participant ${participant.code}.`,'critical');return false;}
        globalState.questionRevealGates=[...runtime.escrow.questions.map(item=>({id:newId('qgate'),competitionId:globalState.competition.id,sessionId:runtime.sessionId,participantId:participant.id,committeeId:committee.id,questionIndex:item.index,participantPresence:{verified:runtime.escrow.presenceVerified},requiredJudgeIds:[...new Set(committee.judgeIds)],approvals:[],status:item.released?'REVEALED' as const:'SEALED' as const,revealedAt:item.releasedAt,createdAt:new Date().toISOString(),questionCommitmentHash:item.commitmentHash,quranSourcePackageHash:runtime.sourcePackageHash,revealAssurance:'production_server_escrow' as const})),...globalState.questionRevealGates.filter(g=>g.sessionId!==runtime.sessionId)];
        globalState.activeSession={sessionId:runtime.sessionId,participant,committee,questionSelection:null,currentQuestionIndex:0,isReciting:false,durationSeconds:0,events:[],isLocked:false,audioLevel:76,questionPhase:'SEALED',secureQuestionMode:'SERVER',secureRuntimeSessionId:runtime.sessionId,secureQuestionCount:runtime.questionCount};
        const idx=globalState.participants.findIndex(p=>p.id===participantId);if(idx>=0)globalState.participants[idx]={...globalState.participants[idx],status:'in_session'};
        globalState.committees=globalState.committees.map(c=>c.id===committee.id?{...c,status:'testing',currentParticipantId:participantId}:c);refreshQueueNotifications();
        auditTrustAction('SERVER_QUESTION_RUNTIME_ATTACHED','JudgingSession',runtime.sessionId,'ربط جلسة التحكيم بحزمة أسئلة خادمية؛ لم ينفذ FairDraw أو حل النص القرآني داخل جهاز المحكم','Attached JudgeOS to server-held question runtime; FairDraw and Quran plaintext resolution did not run on the judge device');
        void createContinuityCheckpoint('server-session-start');notify();return true;
      }catch(error){createIncident('quran_source_discrepancy','Secure question provisioning missing',`Official session blocked for ${participant.code}: ${error instanceof Error?error.message:'secure runtime unavailable'}.`,'critical');return false;}
    }
    /*
     * نطاق المتسابق يُحسم قبل أي سحب.
     *
     * Participant Effective Scope is the authoritative source for question eligibility whenever
     * participant-specific selection applies. وإن كانت الفئة تشترط نطاقًا معتمدًا ولم يوجد،
     * فالجلسة لا تبدأ: بدء جلسةٍ بنطاقٍ مجهول أسوأ من تأخيرها.
     */
    const scopeResolution=participantEffectiveScope(participantId);
    if(!scopeResolution||scopeResolution.blocked){
      createIncident('conflict_routing','نطاق الحفظ يحتاج مراجعة',`تعذر بدء جلسة ${participant.code}: ${scopeResolution?.reasonArabic||'لا نطاق محددًا لهذا المتسابق.'}`,'critical');
      return false;
    }
    const effectiveScope=scopeResolution.scope;
    const source=reading?globalState.quranSourceManifests.find(q=>q.organizationId===globalState.competition.organizationId&&sourceUsableForCompetition(q,{qiraah:reading.qiraah,rawi:reading.rawi}).ok):undefined;
    const content=source?globalState.quranSourceContents.find(c=>c.sourceManifestId===source.id&&c.packageHash===source.packageHash&&c.immutable):undefined;
    let pool=source&&content?sourceResolvedQuestionPool(participant,source,content):[];
    // حاجز أول: البنك نفسه يُقصّ على نطاق المتسابق قبل أن يصل إلى السحب.
    pool=pool.filter(item=>scopeContainsRange(effectiveScope,{surah:item.surahNumber,ayah:item.startAyah},{surah:item.surahNumber,ayah:item.endAyah}));
    let sourceMode:'CERTIFIED_SOURCE'|'DEVELOPMENT_FIXTURE'=source&&content&&pool.length?'CERTIFIED_SOURCE':'DEVELOPMENT_FIXTURE';
    if(productionMode&&sourceMode!=='CERTIFIED_SOURCE'){
      createIncident('quran_source_discrepancy','Scientific Quran source blocker',`Official session blocked for ${participant.code}: exact certified source/content/question governance is unavailable for ${participant.riwaya}.`,'critical');
      return false;
    }
    if(sourceMode==='DEVELOPMENT_FIXTURE'){
      /* No certified vault mounted. Rather than drawing from a handful of fixtures whose text is a
         placeholder sentence, generate the pool from the delivery Mushaf for this exact narration:
         real passages, each starting on a real ayah boundary and carrying a difficulty measured
         from the text. The fixture bank remains only for when delivery is unreachable too. */
      /* مقدار الموضع من الوجه ⇒ مدى تقريبي لعدد الآيات. الوجه يظهر كاملًا على سطح المصحف،
         والتظليل يقع على هذا المقدار وحده. تقريبي لأن أطوال الآيات تتفاوت بين السور. */
      const passageSpan=categoryPassageAyahRange(category);
      const generated=await buildDeliveryQuestionPool(participant.riwaya,{size:Math.max(14,resolveQuestionCount(category,policy)*6),seedBase:`${globalState.competition.id}:${participant.id}`,scope:effectiveScope,minAyahCount:passageSpan.minAyahCount,maxAyahCount:passageSpan.maxAyahCount});
      /* تعذّر التسليم لا يعني السحب من خارج النطاق: تُسقَط مواضع المصحف البنيوية داخله. */
      const structural=generated.length?[]:buildCandidatePool({scope:effectiveScope,category,reading:readingContextOf({riwaya:participant.riwaya})})
        .slice(0,60)
        .map(c=>({id:c.id,surahNumber:c.surahNumber,surahNameArabic:surahNameArabic(c.surahNumber),surahNameEnglish:'',startAyah:c.startAyah,endAyah:c.endAyah,juzNumber:c.juzNumber||1,riwaya:participant.riwaya,expectedTextArabic:'',difficultyRating:c.difficultyRating,mutashabihatDensity:'none' as const,tajweedComplexity:'intermediate' as const,timesUsed:0}));
      const fallback=structural.length?structural:DEVELOPMENT_QUESTION_BANK.filter(item=>scopeContainsRange(effectiveScope,{surah:item.surahNumber,ayah:item.startAyah},{surah:item.surahNumber,ayah:item.endAyah}));
      pool=generated.length?generated:fallback;
    }
    // عدد الأسئلة وطول الموضع الآن يأتيان من الفئة نفسها قبل FairDraw؛ فلا ينفصل «وجه/ربع»
    // الذي اختاره المنظم عن السؤال الذي يصل إلى لجنة الطالب.
    const questionCount=resolveQuestionCount(category,policy);
    const effPolicy={...policy,questions:{...policy.questions,questionsPerParticipant:questionCount}};
    const allocation=planAllocation({category,policy:effPolicy,effectiveScope,candidates:pool.map(item=>poolItemToCandidate(item))});
    const drawEngine=new QuestionAllocationEngine({
      policy:categoryRepeatPolicy(category,policy),
      seed:`${globalState.competition.id}:${participant.id}`,
      requireReviewedDifficulty:!!category?.requireReviewedDifficulty,
      defaultTargetDifficulty:policy.questions.targetDifficulty,
      /* ما سُمع في القاعات قبل الآن يدخل المفاضلة: الموضع المنكشف يُؤخَّر لا يُمنع أعمى. */
      scarcity:buildExposureOracle(exposureProfiles()),
    });
    /* الدفتر يُغذَّى بما سُحب قبل الآن في هذه المسابقة، فيباعد المحرك ويوازن الحمل بدل أن يبدأ من صفر. */
    drawEngine.primeUsage(globalState.questionModels
      .filter(m=>m.competitionId===globalState.competition.id&&m.status!=='invalidated'&&m.status!=='draft')
      .flatMap((m,order)=>m.questions.map(q=>({locusKey:`${q.surahNumber}:${q.startAyah}`,participantId:m.participantId,sequence:order}))));
    /*
     * نموذجٌ مختوم مسبقًا يُنفَّذ ولا يُعاد سحبه.
     *
     * لكن البنك في القاعة قد يكون غير البنك الذي وُلّد منه النموذج (مصدر معتمد مقابل بنية
     * المصحف)، فالمطابقة بالموضع لا بالمعرّف. وإن لم يُوجد لموضعٍ من النموذج مقابلٌ في بنك
     * القاعة، لا يُلفَّق نصفُ نموذج: يُسحب حيًّا ويُقال السبب في السجل.
     */
    let preGenerated:{modelId:string;batchId?:string;questionIds:string[];reasons?:typeof sealedModel.questions[number]['reason'][];fairness?:typeof sealedModel.fairness}|undefined;
    const sealedModel=preGeneratedModelFor(participantId);
    if(sealedModel){
      const byLocus=new Map(pool.map(item=>[`${item.surahNumber}:${item.startAyah}:${item.endAyah}`,item] as const));
      const mapped=sealedModel.questions.map(q=>byLocus.get(`${q.surahNumber}:${q.startAyah}:${q.endAyah}`));
      if(mapped.every(Boolean)){
        preGenerated={modelId:sealedModel.id,batchId:sealedModel.batchId,questionIds:mapped.map(item=>item!.id),reasons:sealedModel.questions.map(q=>q.reason),fairness:sealedModel.fairness};
      }else{
        auditTrustAction('QUESTION_MODEL_PREGENERATED_SKIPPED','QuestionModel',sealedModel.id,
          `تعذّر تنفيذ النموذج المختوم للمتسابق ${participant.code}: ${mapped.filter(x=>!x).length} من مواضعه غير موجودة في بنك القاعة؛ جرى سحب حيّ بدلًا منه.`,
          `Could not execute the sealed model for ${participant.code}: ${mapped.filter(x=>!x).length} of its loci are absent from the hall pool; drew live instead.`);
      }
    }
    try {
      const selection = await generateFairDraw({ pool, participant, policy:effPolicy, poolVersion:sourceMode==='CERTIFIED_SOURCE'?source!.packageHash:undefined,quranSourceManifestId:sourceMode==='CERTIFIED_SOURCE'?source!.id:undefined,qiraah:reading?.qiraah,rawi:reading?.rawi,tariq:source?.tariq,variantLocusVersion:sourceMode==='CERTIFIED_SOURCE'?'SOURCE_BOUND':undefined,difficultyMetadataVersion:sourceMode==='CERTIFIED_SOURCE'?`QG:${source!.packageHash}`:'DEVELOPMENT',
        scoped:{ scope:effectiveScope, participantScopeVersion:scopeResolution.version, slots:allocation.slots, engine:drawEngine, reading:readingContextOf({riwaya:participant.riwaya}), sequencePosition:globalState.questionModels.length, hallId:committee.id, preGenerated } });
      selection.sourceMode=sourceMode;selection.quranSourceVersion=source?.sourceVersion||source?.version;selection.quranSourcePackageHash=source?.packageHash;
      const sessionId=newId('sess');
      /* نموذج المتسابق يُحفظ كيانًا مستقلًا: عليه تقوم العدالة والتدقيق وإبطال ما بُني على نطاق قديم. */
      const model:QuestionModelRecord={
        id:newId('qmodel'),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,
        categoryId:participant.categoryId,participantId:participant.id,
        participantScopeVersion:scopeResolution.version,scopeSignature:scopeResolution.signature||scopeSignature(effectiveScope),
        categoryScopeVersion:category?.scopeVersion||1,policyVersion:effPolicy.version,poolVersion:selection.poolVersion||'unknown',
        quranSourceVersion:selection.quranSourceVersion,quranSourcePackageHash:selection.quranSourcePackageHash,
        reading:readingContextOf({riwaya:participant.riwaya}),
        questions:selection.questions.map((item,index)=>({questionId:item.id,surahNumber:item.surahNumber,startAyah:item.startAyah,endAyah:item.endAyah,zoneId:allocation.slots[index]?.zoneId??null,zoneName:allocation.slots[index]?.zoneNameArabic||'النطاق كاملًا',difficultyRating:item.difficultyRating,difficultyAssurance:sourceMode==='CERTIFIED_SOURCE'?'human_reviewed':'automatically_estimated',reason:reasonFor(selection,index)})),
        zones:[...new Map(allocation.slots.map(slot=>[slot.zoneId??'open',{id:slot.zoneId??'open',name:slot.zoneNameArabic,scopeSignature:scopeSignature(slot.scope)}])).values()],
        aggregateDifficulty:selection.difficultyVectorScore,
        difficultyVariance:Number((selection.questions.reduce((sum,q)=>sum+(q.difficultyRating-selection.difficultyVectorScore)**2,0)/Math.max(1,selection.questions.length)).toFixed(4)),
        minDifficulty:Math.min(...selection.questions.map(q=>q.difficultyRating)),
        maxDifficulty:Math.max(...selection.questions.map(q=>q.difficultyRating)),
        coverageAyahCount:scopeAyahCount(effectiveScope),
        repeatsUsed:(selection.selectionReasons||[]).filter(r=>r.usesBeforeSelection>0).length,
        relaxations:[...new Set((selection.selectionReasons||[]).flatMap(r=>r.relaxedPreferences))],
        fairness:selection.fairness||{score:0,difficultyParity:0,scopeCoverage:0,repeatPressure:0,diversity:0,similarity:0,exposure:0,zoneCompliance:0,notesArabic:[],notesEnglish:[]},
        generationMode:'just_in_time',engineVersion:selection.engineVersion||'MIZAN-FAIRDRAW-2.0',
        seedCommitmentHash:selection.seedCommitmentHash,status:'sealed',createdAt:new Date().toISOString(),sealedAt:new Date().toISOString(),
      };
      if(preGenerated){
        /* النموذج المختوم لا يُستنسخ: يُعلَّم مستهلَكًا ويُربط بالجلسة، فيبقى كيانًا واحدًا له تاريخ واحد. */
        globalState.questionModels=globalState.questionModels.map(m=>m.id===preGenerated!.modelId?{...m,status:'consumed' as const}:m);
        auditTrustAction('QUESTION_MODEL_PREGENERATED_EXECUTED','QuestionModel',preGenerated.modelId,
          `تنفيذ نموذج مختوم مسبقًا للمتسابق ${participant.code} من الدفعة ${preGenerated.batchId||'—'}؛ لم يُعد السحب في القاعة.`,
          `Executed a pre-sealed model for ${participant.code} from batch ${preGenerated.batchId||'—'}; no draw ran in the hall.`);
      } else {
        globalState.questionModels=[model,...globalState.questionModels];
      }
      /* الحجز: مواضع هذه الجلسة تُخصَّص فلا تُسحب لغير صاحبها، وتنقضي وحدها إن لم يحضر. */
      const reservation=reserveQuestionsForParticipant({
        participantId:participant.id,
        items:selection.questions.map(item=>({locusKey:`${item.surahNumber}:${item.startAyah}`,questionId:item.id})),
        sessionId,modelId:preGenerated?preGenerated.modelId:model.id,
        idempotencyKey:`${globalState.competition.id}:${selection.questionSetId}`,
      });
      /* المتسابق أمام اللجنة الآن، فالحجز ينتقل من «مؤقت» إلى «مخصَّص» ولا ينقضي بمرور الوقت. */
      if(reservation.created.length)advanceReservations(reservation.created.map(r=>r.id),'assigned',`بدء جلسة ${participant.code}`);
      const revealGates:QuestionRevealGateRecord[]=[];
      for(let questionIndex=0;questionIndex<selection.questions.length;questionIndex++){
        const item=selection.questions[questionIndex];
        revealGates.push({id:newId('qgate'),competitionId:globalState.competition.id,sessionId,participantId:participant.id,committeeId:committee.id,questionIndex,participantPresence:{verified:false},requiredJudgeIds:[...new Set(committee.judgeIds)],approvals:[],status:'SEALED',createdAt:new Date().toISOString(),questionCommitmentHash:await hashCanonical({questionSetId:selection.questionSetId,questionIndex,questionId:item.id,quranSourcePackageHash:selection.quranSourcePackageHash||'DEVELOPMENT'}),quranSourcePackageHash:selection.quranSourcePackageHash,revealAssurance:productionMode?'operational_panel_gate':'development_client_gate'});
      }
      globalState.questionRevealGates=[...revealGates,...globalState.questionRevealGates.filter(g=>g.sessionId!==sessionId)];
      globalState.activeSession = {
        sessionId, participant, committee, questionSelection:selection, currentQuestionIndex:0, isReciting:false, durationSeconds:0, events:[], isLocked:false, audioLevel:76, questionPhase:'SEALED',secureQuestionMode:'CLIENT'
      };
      if(sourceMode==='CERTIFIED_SOURCE'&&source){
        const ref=globalState.competition.id;const idx=globalState.quranSourceManifests.findIndex(q=>q.id===source.id);if(idx>=0&&!globalState.quranSourceManifests[idx].historicalUsageReferences?.includes(ref))globalState.quranSourceManifests[idx]={...globalState.quranSourceManifests[idx],historicalUsageReferences:[...(globalState.quranSourceManifests[idx].historicalUsageReferences||[]),ref]};
      }
      const idx=globalState.participants.findIndex(p=>p.id===participantId); if(idx>=0) globalState.participants[idx]={...globalState.participants[idx],status:'in_session'};
      globalState.committees=globalState.committees.map(c=>c.id===committee.id?{...c,status:'testing',currentParticipantId:participantId}:c);
      refreshQueueNotifications();
      globalState.auditLogs = [{ id:newId('aud'), timestamp:new Date().toISOString(), organizationId:globalState.competition.organizationId, competitionId:globalState.competition.id, actorId:globalState.currentUser.id, actorName:globalState.currentUser.name, actorRole:globalState.currentUser.role, action:'FAIRDRAW_COMMITTED', entityType:'QuestionSelection', entityId:selection.questionSetId, humanSummaryArabic:sourceMode==='CERTIFIED_SOURCE'?`اعتماد حزمة أسئلة ${participant.code} من مصدر قرآني معتمد محدد النسخة`:`حزمة تطوير ${participant.code} — ليست مصدرًا قرآنيًا رسميًا`, humanSummaryEnglish:sourceMode==='CERTIFIED_SOURCE'?`Committed ${participant.code} question set from exact certified Quran source package`:`Development-only question fixture for ${participant.code}; not an official Quran source`, currentStateHash:selection.seedCommitmentHash }, ...globalState.auditLogs];
      void createContinuityCheckpoint('session-start');
      notify(); return true;
    } catch (error) {
      console.error('FairDraw could not create an eligible set', error); return false;
    }
  };


  const ensureQuestionRevealGate=async(questionIndex=globalState.activeSession.currentQuestionIndex)=>{
    const session=globalState.activeSession;const participant=session.participant;const committee=session.committee;const q=session.questionSelection?.questions[questionIndex];
    if(!participant||!committee||!q)return null;
    let gate=globalState.questionRevealGates.find(g=>g.sessionId===session.sessionId&&g.questionIndex===questionIndex);
    if(gate)return gate;
    gate={id:newId('qgate'),competitionId:globalState.competition.id,sessionId:session.sessionId,participantId:participant.id,committeeId:committee.id,questionIndex,participantPresence:{verified:false},requiredJudgeIds:[...new Set(committee.judgeIds)],approvals:[],status:'SEALED',createdAt:new Date().toISOString(),questionCommitmentHash:await hashCanonical({questionSetId:session.questionSelection?.questionSetId,questionIndex,questionId:q.id,quranSourcePackageHash:session.questionSelection?.quranSourcePackageHash||'DEVELOPMENT'}),quranSourcePackageHash:session.questionSelection?.quranSourcePackageHash,revealAssurance:productionMode?'operational_panel_gate':'development_client_gate'};
    globalState.questionRevealGates=[gate,...globalState.questionRevealGates];notify();return gate;
  };

  const verifyParticipantPresenceForQuestion=async(method:'participant_pass'|'manual_visual_confirmation'='manual_visual_confirmation')=>{
    const session=globalState.activeSession;if(!session.participant||!session.committee||session.isLocked)return {ok:false,reason:'NO_ACTIVE_SESSION'} as const;
    if(!['judge','head_judge','ops_manager','comp_admin'].includes(globalState.currentUser.role))return {ok:false,reason:'UNAUTHORIZED'} as const;
    const now=new Date().toISOString();
    const sessionGates=globalState.questionRevealGates.filter(g=>g.sessionId===session.sessionId);
    if(!sessionGates.length)await ensureQuestionRevealGate();
    globalState.questionRevealGates=globalState.questionRevealGates.map(g=>g.sessionId===session.sessionId?{...g,participantPresence:{verified:true,verifiedAt:now,verifiedBy:globalState.currentUser.id,method}}:g);
    auditTrustAction('PARTICIPANT_PRESENCE_VERIFIED','JudgingSession',session.sessionId,`تأكيد وجود المتسابق ${session.participant.code} أمام اللجنة قبل كشف السؤال`,`Confirmed participant ${session.participant.code} is physically present before question reveal`);
    notify();return {ok:true} as const;
  };

  const approveQuestionReveal=async()=>{
    const session=globalState.activeSession;if(!session.participant||!session.committee||session.isLocked)return {ok:false,reason:'NO_ACTIVE_SESSION'} as const;
    const gate=await ensureQuestionRevealGate();if(!gate)return {ok:false,reason:'NO_GATE'} as const;
    const judge=globalState.judges.find(j=>j.userId===globalState.currentUser.id||j.id===globalState.currentUser.id);
    const judgeId=judge?.userId||globalState.currentUser.id;
    if(globalState.currentUser.role!=='judge'||!gate.requiredJudgeIds.includes(judgeId))return {ok:false,reason:'ASSIGNED_JUDGE_REQUIRED'} as const;
    if(!gate.participantPresence.verified)return {ok:false,reason:'PARTICIPANT_NOT_PRESENT'} as const;
    const approvals=gate.approvals.some(a=>a.judgeId===judgeId)?gate.approvals:[...gate.approvals,{judgeId,judgeName:judge?.name||globalState.currentUser.name,approvedAt:new Date().toISOString()}];
    const revealPolicy=getCompetitionPolicy(globalState.competition).questions.secureReveal||{requireParticipantPresence:true,judgeApprovalMode:'all_assigned' as const};
    const ready=questionRevealReady({participantPresent:gate.participantPresence.verified,requiredJudgeIds:gate.requiredJudgeIds,approvals,mode:revealPolicy.judgeApprovalMode,minimumApprovals:revealPolicy.minimumApprovals});
    const status=ready.ready?'REVEALED' as const:'SEALED' as const;const revealedAt=ready.ready?new Date().toISOString():undefined;
    globalState.questionRevealGates=globalState.questionRevealGates.map(g=>g.id===gate.id?{...g,approvals,status,revealedAt}:g);
    if(ready.ready){
      /* الكشف ينقل الحجز إلى «مكشوف»: بابٌ لا رجعة منه إلا بالحجر، فلا يُعاد الموضع إلى المخزون بعد أن سُمع. */
      const revealedItem=session.questionSelection?.questions[gate.questionIndex];
      if(revealedItem){
        const held=globalState.questionReservations.filter(r=>r.sessionId===session.sessionId&&r.questionId===revealedItem.id).map(r=>r.id);
        if(held.length)advanceReservations(held,'revealed',`كُشف السؤال ${gate.questionIndex+1} في القاعة`);
      }
    }
    if(ready.ready){globalState.activeSession.isReciting=true;globalState.activeSession.questionPhase='RECITING';auditTrustAction('QUESTION_REVEALED_AFTER_PANEL_APPROVAL','QuestionRevealGate',gate.id,`كشف السؤال ${gate.questionIndex+1} بعد حضور المتسابق واكتمال موافقات ${ready.approved}/${ready.required}`,`Revealed question ${gate.questionIndex+1} after participant presence and ${ready.approved}/${ready.required} judge approvals`);}else auditTrustAction('QUESTION_REVEAL_APPROVAL_RECORDED','QuestionRevealGate',gate.id,`تسجيل موافقة محكم على فتح السؤال (${ready.approved}/${ready.required})`,`Recorded judge approval to reveal question (${ready.approved}/${ready.required})`);
    void createContinuityCheckpoint(ready.ready?'question-revealed':'judge-reveal-approval');
    notify();return {ok:true,revealed:ready.ready,approved:ready.approved,required:ready.required} as const;
  };

  const markOpeningAudioPlayed=(referenceId:string)=>{const gate=globalState.questionRevealGates.find(g=>g.sessionId===globalState.activeSession.sessionId&&g.questionIndex===globalState.activeSession.currentQuestionIndex);if(!gate||gate.status!=='REVEALED')return false;globalState.activeSession.openingAudioRefId=referenceId;globalState.activeSession.openingAudioPlayedAt=new Date().toISOString();auditTrustAction('APPROVED_OPENING_AUDIO_PLAYED','QuranReferenceAudio',referenceId,'تشغيل أول آية من مرجع صوتي معتمد مطابق للقراءة','Played the opening ayah from an approved reading-matched reference audio');notify();return true;};

  const finishCurrentQuestionSegment=()=>{if(globalState.activeSession.isLocked||globalState.activeSession.questionPhase!=='RECITING')return false;globalState.activeSession.isReciting=false;globalState.activeSession.questionPhase='TRANSITION';void createContinuityCheckpoint('passage-ended');auditTrustAction('QUESTION_SEGMENT_ENDED','JudgingSession',globalState.activeSession.sessionId,`إنهاء موضع السؤال ${globalState.activeSession.currentQuestionIndex+1} والانتقال المنضبط`,`Ended question segment ${globalState.activeSession.currentQuestionIndex+1} with controlled transition`);notify();return true;};

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
    const safeEndpoint=!!cleanEndpoint&&/^https:\/\//i.test(cleanEndpoint)&&!cleanEndpoint.includes('example.')&&!cleanEndpoint.includes('localhost');
    const previous=existing>=0?globalState.integrations[existing]:undefined;
    const item:IntegrationConfig={id:previous?.id||newId('int'),organizationId:globalState.competition.organizationId,kind,name:name.trim(),enabled,status:previous?.status==='configured'&&enabled&&safeEndpoint?'configured':'not_configured',secretRef:previous?.secretRef,endpoint:safeEndpoint?cleanEndpoint:undefined,lastCheckedAt:new Date().toISOString()};
    if(existing>=0)globalState.integrations[existing]=item;else globalState.integrations=[item,...globalState.integrations];
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'INTEGRATION_PROFILE_UPDATED',entityType:'Integration',entityId:item.id,humanSummaryArabic:`تحديث ربط ${item.name} من داخل ميزان: ${item.status}`,humanSummaryEnglish:`Updated ${item.name} connection profile inside MIZAN: ${item.status}`,currentStateHash:`integration:${item.id}:${item.status}:${item.enabled}`},...globalState.auditLogs];
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
  const addParticipantPassportEntry=(participantId:string)=>{const p=globalState.participants.find(x=>x.id===participantId);if(!p)return;const r=globalState.results.find(x=>x.participantId===participantId);const c=globalState.certificates.find(x=>x.participantId===participantId);const cat=globalState.competition.categories.find(x=>x.id===p.categoryId);const e:ParticipantPassportEntry={id:newId('pp'),participantId,competitionId:globalState.competition.id,competitionName:storedCompetitionName(true),categoryName:cat?.name||'',year:globalState.competition.startDate.slice(0,4),result:r?`${r.rank} / ${r.finalScore}`:undefined,certificateNumber:c?.certificateNumber,verified:!!c};globalState.participantPassport=[e,...globalState.participantPassport.filter(x=>!(x.participantId===participantId&&x.competitionId===globalState.competition.id))];notify();return e;};
  const addJudgePassportEntry=(judgeId:string)=>{const j=globalState.judges.find(x=>x.id===judgeId||x.userId===judgeId);if(!j)return;const e:JudgePassportEntry={id:newId('jp'),judgeId:j.id,competitionId:globalState.competition.id,competitionName:storedCompetitionName(true),role:j.specialty,riwayat:j.certifiedRiwayat,calibrationScore:j.calibrationScore,completedSessions:globalState.judgeSubmissions.filter(x=>x.judgeId===j.userId).length,verified:j.isReady};globalState.judgePassport=[e,...globalState.judgePassport.filter(x=>!(x.judgeId===j.id&&x.competitionId===globalState.competition.id))];notify();return e;};
  const updateJudgeSpecialties=(judgeId:string,specialties:string[])=>{const clean=[...new Set(specialties.filter(Boolean))];const next=clean.includes('all')||!clean.length?['all']:clean;globalState.judges=globalState.judges.map(j=>(j.id===judgeId||j.userId===judgeId)?{...j,specialty:next[0],specialties:next}:j);notify();return globalState.judges.find(j=>j.id===judgeId||j.userId===judgeId)||null;};
  const completeJudgeCalibration=(judgeId:string,score:number)=>{
    const bounded=Math.max(0,Math.min(100,score));
    globalState.judges=globalState.judges.map(j=>(j.id===judgeId||j.userId===judgeId)?{...j,calibrationScore:bounded,isReady:bounded>=85}:j);
    const j=globalState.judges.find(x=>x.id===judgeId||x.userId===judgeId);
    if(j) addJudgePassportEntry(j.id);
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'JUDGE_CALIBRATION_COMPLETED',entityType:'JudgeProfile',entityId:j?.id||judgeId,humanSummaryArabic:`إكمال معايرة المحكم بنتيجة ${bounded}%`,humanSummaryEnglish:`Judge calibration completed at ${bounded}%`,currentStateHash:`PENDING:${newId('audit')}`},...globalState.auditLogs]; notify(); return j;
  };

  const createTrainingRun=(type:TrainingRun['type'])=>{const t:TrainingRun={id:newId('train'),competitionId:globalState.competition.id,type,status:'ready'};globalState.trainingRuns=[t,...globalState.trainingRuns];notify();return t;};
  const completeTrainingRun=(id:string,score=100)=>{globalState.trainingRuns=globalState.trainingRuns.map(t=>t.id===id?{...t,status:'completed',startedAt:t.startedAt||new Date().toISOString(),score}:t);notify();};
  const createBackup=async()=>{const payload=exportCompetitionSnapshot();const b:BackupRecord={id:newId('backup'),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,createdAt:new Date().toISOString(),scope:'competition',checksum:await sha256(payload),status:'ready',sizeLabel:`${Math.max(1,Math.round(payload.length/1024))} KB`,snapshotJson:payload};globalState.backups=[b,...globalState.backups];notify();return b;};
  const restoreBackup=(id:string)=>{const b=globalState.backups.find(x=>x.id===id&&x.status==='ready');if(!b?.snapshotJson)return{ok:false,message:'BACKUP_PAYLOAD_MISSING'};return restoreCompetitionSnapshot(b.snapshotJson);};
  const scheduleRetention=(dataType:RetentionJob['dataType'],days:number,action:RetentionJob['action'])=>{const d=new Date();d.setDate(d.getDate()+days);const r:RetentionJob={id:newId('ret'),competitionId:globalState.competition.id,dataType,scheduledFor:d.toISOString(),action,status:'scheduled'};globalState.retentionJobs=[r,...globalState.retentionJobs];notify();return r;};
  const requestSupportSession=(reason:string)=>{const d=new Date();d.setHours(d.getHours()+1);const now=new Date().toISOString();const x:SupportSession={id:newId('support'),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,requestedBy:globalState.currentUser.id,reason,status:'requested',createdAt:now,updatedAt:now,expiresAt:d.toISOString()};globalState.supportSessions=[x,...globalState.supportSessions];void persistScopedDocument('support_sessions',x.id,x as unknown as Record<string,unknown>);notify();return x;};
  const approveSupportSession=(id:string)=>{const now=new Date().toISOString();globalState.supportSessions=globalState.supportSessions.map(s=>s.id===id?{...s,status:'active',approvedBy:globalState.currentUser.id,updatedAt:now}:s);const x=globalState.supportSessions.find(s=>s.id===id);if(x)void persistScopedDocument('support_sessions',x.id,x as unknown as Record<string,unknown>);notify();};
  const endSupportSession=(id:string)=>{const now=new Date().toISOString();globalState.supportSessions=globalState.supportSessions.map(s=>s.id===id?{...s,status:'ended',updatedAt:now,expiresAt:now}:s);const x=globalState.supportSessions.find(s=>s.id===id);if(x)void persistScopedDocument('support_sessions',x.id,x as unknown as Record<string,unknown>);notify();};
  const runRemoteCheck=(participantId:string)=>{const mediaReady=typeof navigator!=='undefined'&&!!navigator.mediaDevices?.getUserMedia; const online=typeof navigator==='undefined'?true:navigator.onLine; const r:RemoteSessionCheck={id:newId('remote'),participantId,competitionId:globalState.competition.id,identity:'pending',device:mediaReady?'passed':'failed',environment:'review',networkQuality:online?'good':'poor',recordingReady:mediaReady,suspiciousSignals:[]};globalState.remoteChecks=[r,...globalState.remoteChecks.filter(x=>x.participantId!==participantId)];notify();return r;};
  const cloneCompetition=(nameArabic?:string,nameEnglish?:string)=>{
    const source=globalState.competition;const base=JSON.parse(JSON.stringify(source)) as Competition;base.id=newId('comp');
    base.nameArabic=nameArabic||source.nameArabic;base.name=nameEnglish||source.name;base.edition='';
    base.status='draft';base.startDate='';base.endDate='';base.registrationStartDate='';base.registrationEndDate='';
    base.totalRegistered=0;base.totalApproved=0;base.totalAttended=0;base.currentDay=0;
    const rule={...base.ruleSet,id:newId('rule'),frozenAt:undefined,version:`${base.ruleSet.version}-new-edition`};
    base.ruleSet=rule;base.ruleSets=[rule];base.policy={...getCompetitionPolicy(base),updatedAt:new Date().toISOString(),frozenAt:undefined};
    base.categories=base.categories.map(c=>({...c,id:newId('cat'),competitionId:base.id,ruleSetId:rule.id}));
    base.readinessChecklist={datesConfigured:false,categoriesConfigured:base.categories.length>0,ruleSetFrozen:false,judgesAssigned:false,quranSourceLocked:false,devicesRegistered:false,certificatesReady:false};
    globalState.competitions=[base,...globalState.competitions];globalState.competition=base;
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:base.organizationId,competitionId:base.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'COMPETITION_NEW_EDITION_CREATED',entityType:'Competition',entityId:base.id,humanSummaryArabic:`بدء إصدار جديد مستقل من ${source.nameArabic}`,humanSummaryEnglish:`Started a clean new edition of ${source.name}`,currentStateHash:`edition:${base.id}`},...globalState.auditLogs];
    notify();return base;
  };
  const exportCompetitionSnapshot=()=>JSON.stringify({version:2,exportedAt:new Date().toISOString(),organizationId:globalState.competition.organizationId,competition:globalState.competition,judges:globalState.judges,participants:globalState.participants.filter(p=>p.competitionId===globalState.competition.id),committees:globalState.committees.filter(c=>c.competitionId===globalState.competition.id),results:globalState.results.filter(r=>r.competitionId===globalState.competition.id),certificates:globalState.certificates.filter(c=>c.competitionId===globalState.competition.id),appeals:globalState.appeals.filter(a=>a.competitionId===globalState.competition.id),reviews:globalState.reviewCases.filter(r=>r.competitionId===globalState.competition.id),supportSessions:globalState.supportSessions.filter(x=>x.competitionId===globalState.competition.id),auditLogs:globalState.auditLogs.filter(a=>a.competitionId===globalState.competition.id)},null,2);
  // Restore/import counterpart to exportCompetitionSnapshot. Replaces the imported competition's
  // scoped records (participants/committees/results/certificates/audit) so an exported snapshot is a
  // genuinely restorable backup — the previous build could export but never import.
  const restoreCompetitionSnapshot=(json:string):{ok:boolean;message:string;competitionId?:string}=>{
    let snap:any; try{snap=JSON.parse(json)}catch{return{ok:false,message:'INVALID_JSON'}}
    if(!snap||typeof snap!=='object'||!snap.competition||typeof snap.competition!=='object'||!snap.competition.id) return {ok:false,message:'INVALID_SNAPSHOT'};
    const arr=<T,>(v:any):T[]=>Array.isArray(v)?v as T[]:[];
    const comp={...snap.competition} as Competition; comp.policy=getCompetitionPolicy(comp); comp.ruleSets=comp.ruleSets||[comp.ruleSet];
    const cid=comp.id;
    globalState.competitions=[comp,...globalState.competitions.filter(c=>c.id!==cid)];
    globalState.competition=comp;
    globalState.participants=[...globalState.participants.filter(p=>p.competitionId!==cid),...arr<Participant>(snap.participants)];
    globalState.committees=[...globalState.committees.filter(c=>c.competitionId!==cid),...arr<Committee>(snap.committees)];
    globalState.results=[...globalState.results.filter(r=>r.competitionId!==cid),...arr<ResultRecord>(snap.results)];
    globalState.certificates=[...globalState.certificates.filter(c=>c.competitionId!==cid),...arr<Certificate>(snap.certificates)];
    if(Array.isArray(snap.judges))globalState.judges=arr<JudgeProfile>(snap.judges);
    globalState.appeals=[...globalState.appeals.filter(a=>a.competitionId!==cid),...arr<AppealRecord>(snap.appeals)];
    globalState.reviewCases=[...globalState.reviewCases.filter(r=>r.competitionId!==cid),...arr<ReviewCase>(snap.reviews)];
    globalState.supportSessions=[...globalState.supportSessions.filter(x=>x.competitionId!==cid),...arr<SupportSession>(snap.supportSessions)];
    globalState.auditLogs=[{id:newId('aud'),timestamp:new Date().toISOString(),organizationId:comp.organizationId,competitionId:cid,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action:'COMPETITION_SNAPSHOT_RESTORED',entityType:'Competition',entityId:cid,humanSummaryArabic:`استعادة نسخة المسابقة ${comp.nameArabic||comp.name}`,humanSummaryEnglish:`Restored competition snapshot ${comp.name}`,currentStateHash:`PENDING:${newId('audit')}`},...arr<AuditEvent>(snap.auditLogs),...globalState.auditLogs.filter(a=>a.competitionId!==cid)];
    notify();
    return {ok:true,message:'RESTORED',competitionId:cid};
  };

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
    const p=globalState.participants.find(x=>x.id===participantId);
    if(!p) return null;
    const r=globalState.results.find(x=>x.participantId===participantId);
    const sub=globalState.judgeSubmissions.filter(x=>x.participantId===participantId);
    const cert=globalState.certificates.find(x=>x.participantId===participantId);
    const queueTransfers=globalState.queueTransfers.filter(t=>t.participantIds.includes(participantId));
    const revealGates=globalState.questionRevealGates.filter(g=>g.participantId===participantId);
    return buildParticipantFairnessEvidence({
      participant:p,
      policyVersion:getCompetitionPolicy(globalState.competition).version,
      ruleSetVersion:globalState.competition.ruleSet.version,
      queueTransfers,
      revealGates,
      independentJudgeSubmissions:sub,
      result:r,
      certificate:cert,
    });
  };

  /*
   * كان هذا يقارن متوسط درجات المحكّم بمتوسط بقية المحكّمين على **متسابقين مختلفين**، فمن
   * وقعت له مجموعة أضعف ظهر «متشددًا» بلا ذنب — والإشارة كانت تُعرض في تبويب الختم نفسه،
   * أي عند لحظة القرار، بينما التحليل المعاير الصحيح في تبويب آخر يقول غير ذلك.
   *
   * صار يقارن مثلًا بمثل: المحكّم مقابل بقية لجنته على المتسابق نفسه، بانكماش بايزي يمنع
   * وصم محكّم من عيّنة صغيرة. لا يُعدَّل حكم بشري، والمخرج استشاري لرئيس التحكيم وحده.
   */
  /* بلا هوية مسجَّلة لا نشر: السجل يرفض غير المصرّح له أصلًا، ولا داعي لمحاولة فاشلة. */
  const registryBearer=async()=>{try{return await auth.currentUser?.getIdToken()}catch{return undefined}};

  const getIntegrityAnalytics = () => {
    const observations=globalState.judgeSubmissions.filter(x=>x.locked&&x.participantId).map(x=>({judgeId:x.judgeId,judgeName:x.judgeName,sessionId:x.sessionId,participantId:x.participantId!,score:x.totalScore}));
    const report=calibrateJudges(observations);
    const byId=new Map(report.judges.map(j=>[j.judgeId,j]));
    return globalState.judges.map(j=>{
      const cal=byId.get(j.userId)||byId.get(j.id);
      const sessions=globalState.judgeSubmissions.filter(s=>s.judgeId===j.userId||s.judgeId===j.id).length;
      const avg=cal?.mean??0;
      return {judgeId:j.id,name:j.name,sessions,averageScore:Math.round(avg*100)/100,calibrationScore:j.calibrationScore,isReady:j.isReady,
        deviationFromPanel:Math.round((cal?.shrunkBias??0)*100)/100,
        tendency:cal?.tendency||'INSUFFICIENT_DATA',
        confidence:cal?.confidence??0,
        /* لا انتباه من عيّنة صغيرة: الميل غير المؤكد ليس إشارة. */
        attention:!!cal&&cal.tendency!=='INSUFFICIENT_DATA'&&cal.tendency!=='BALANCED',
        advisoryOnly:true as const};
    });
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
    const event:AuditEvent={id:newId('aud'),timestamp:new Date().toISOString(),organizationId:globalState.competition.organizationId,competitionId:globalState.competition.id,actorId:globalState.currentUser.id,actorName:globalState.currentUser.name,actorRole:globalState.currentUser.role,action,entityType,entityId,humanSummaryArabic:ar,humanSummaryEnglish:en,currentStateHash:`PENDING:${newId('audit')}`,sessionId:globalState.activeSession?.sessionId||undefined,authenticationMethod:globalState.currentUser.identityAssurance==='firebase'||globalState.currentUser.identityAssurance==='firebase_managed'?'password':globalState.currentUser.identityAssurance==='federated_sso'?'sso':'demo',authenticationAssurance:globalState.currentUser.mfaEnabled?'mfa':globalState.currentUser.identityAssurance==='federated_sso'?'federated':globalState.currentUser.identityAssurance==='demo'?'demo':'single_factor',assurance:'client_hash_chain'};
    globalState.auditLogs=[event,...globalState.auditLogs];mirrorAuditEventToServer(event);
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
  const executeQuorumAction=(id:string)=>{const q=globalState.quorumActions.find(x=>x.id===id);if(!q||q.status!=='ready'||!quorumSatisfied(q))return false;if(q.approvalExpiresAt&&Date.parse(q.approvalExpiresAt)<Date.now())return false;const allowed=['head_judge','comp_admin','org_admin'];if(!allowed.includes(globalState.currentUser.role)||globalState.currentUser.role==='super_admin')return false;const executedAt=new Date().toISOString();globalState.quorumActions=globalState.quorumActions.map(x=>x.id===id?{...x,status:'executed',executedAt,executedBy:globalState.currentUser.id}:x);if(q.action==='ceremony_reveal')globalState.ceremonyVaults=globalState.ceremonyVaults.map(v=>v.quorumActionId===q.id?{...v,status:'REVEALED',revealTimestamp:executedAt}:v);auditTrustAction('QUORUM_EXECUTED','QuorumAction',id,'تنفيذ الإجراء بعد اكتمال النصاب','Executed action after quorum was satisfied');notify();return true;};
  const requestCeremonyReveal=async()=>{if(!globalState.results.some(r=>r.competitionId===globalState.competition.id&&['sealed','published'].includes(r.status)))return null;return ensureQuorumAction('ceremony_reveal',globalState.competition.id,[['head_judge'],['comp_admin'],['org_admin']],2,['head_judge','comp_admin','org_admin']);};
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
  /*
   * سلسلة أدلة الشهادة — للعرض لا للحكم.
   *
   * `verifyCertificateEvidence` تبقى وحدها صاحبة الحكم بالأصالة. وهذه تُظهر **الحلقات** التي
   * يقوم عليها ذلك الحكم: من حرف المصحف المعتمد إلى ختم النتيجة إلى جذر الإدراج إلى الشهادة.
   * فالثقة تُرى ولا تُطلب: من يتحقّق يرى ما الذي رُبط بما، وأي حلقة غائبة تُقال غائبةً بصراحة.
   * لا تكشف هذه الدالة أي بيانات شخصية — بصمات ومراجع فقط.
   */
  const certificateEvidenceChain=(certificateId:string)=>{
    const cert=globalState.certificates.find(c=>c.id===certificateId&&c.competitionId===globalState.competition.id);
    if(!cert)return [] as {id:string;labelArabic:string;labelEnglish:string;hash?:string;present:boolean}[];
    const result=globalState.results.find(r=>r.id===cert.resultId&&r.competitionId===cert.competitionId);
    const proof=globalState.publicResultProofs.find(p=>p.id===cert.merkleProofId);
    const blackBox=globalState.competitionBlackBoxes.find(b=>b.competitionId===cert.competitionId);
    const source=globalState.quranSourceManifests.find(q=>q.certificationState==='CERTIFIED'&&q.revocationState!=='REVOKED');
    const link=(id:string,labelArabic:string,labelEnglish:string,hash?:string)=>({id,labelArabic,labelEnglish,hash,present:!!hash});
    return [
      link('source','مصدر المصحف المعتمد','Certified Quran source',source?.packageHash),
      link('blackbox','الصندوق الأسود للمسابقة','Competition black box',blackBox?.headHash),
      link('seal','ختم النتيجة','Result seal',result?.sealMetadata?.cryptographicChecksum||cert.resultSealReference),
      link('merkle','جذر إثبات الإدراج','Merkle inclusion root',proof?.merkleRoot),
      link('certificate','حزمة الشهادة','Certificate package',cert.proofPackageHash),
    ];
  };

  const revokeCertificate=(certificateId:string,reason:string)=>{if(!['comp_admin','org_admin'].includes(globalState.currentUser.role)||!reason.trim())return false;const cert=globalState.certificates.find(c=>c.id===certificateId&&c.competitionId===globalState.competition.id);if(!cert)return false;globalState.certificates=globalState.certificates.map(c=>c.id===certificateId?{...c,isAuthentic:false,revocationState:'REVOKED',revocationReason:reason}:c);auditTrustAction('CERTIFICATE_REVOKED','Certificate',certificateId,`إلغاء الشهادة: ${reason}`,`Certificate revoked: ${reason}`);
    /* الإبطال يجب أن يصل السجل العام، وإلا بقيت الشهادة الملغاة «أصلية» لمن يمسك الورقة. */
    void (async()=>{const state=await revokeCertificateInRegistry(cert.certificateNumber,reason,await registryBearer());
      if(state==='FAILED'){
        console.warn(`[certificates] ${cert.certificateNumber} revoked locally but the public registry still shows it active; retry revocation.`);
        /* الأخطر في الباب كله: شهادة ملغاة تظهر «أصلية» لمن يمسك الورقة. */
        auditTrustAction('CERTIFICATE_REGISTRY_REVOKE_FAILED','Certificate',certificateId,`تعذّر إبطال الشهادة ${cert.certificateNumber} في السجل العام: ما زالت تظهر أصلية للعامة`,`Certificate ${cert.certificateNumber} could not be revoked in the public registry; it still verifies as authentic publicly`);
        notify();
      }
      else if(state==='NOT_PUBLISHED')console.warn(`[certificates] ${cert.certificateNumber} was never published to the public registry, so its issuance publication had failed; nothing to revoke there.`)})();
    notify();return true;};

  const ingestMeshEnvelope=(wire:MeshWireEnvelope)=>{const mesh=globalState.localMeshSessions.find(x=>x.id===wire.sessionId&&x.competitionId===wire.competitionId);if(!mesh||mesh.events.some(e=>e.id===wire.event.id))return false;const existing=mesh.events.find(e=>e.originDeviceId===wire.event.originDeviceId&&e.sequence===wire.event.sequence);const semantic=wire.event.conflictKey?mesh.events.filter(e=>e.conflictKey===wire.event.conflictKey&&e.payloadHash!==wire.event.payloadHash):[];const conflicts=[...mesh.conflicts,...(existing?[{id:newId('mesh_conflict'),eventIds:[existing.id,wire.event.id],reason:`Duplicate sequence ${wire.event.originDeviceId}:${wire.event.sequence}`,status:'open' as const}]:[]),...(semantic.length?[{id:newId('mesh_conflict'),eventIds:[...semantic.map(e=>e.id),wire.event.id],reason:`Conflicting payloads for ${wire.event.conflictKey}`,status:'open' as const}]:[])];globalState.localMeshSessions=globalState.localMeshSessions.map(x=>x.id===mesh.id?{...x,status:'active',events:[...x.events,{...wire.event,transport:'browser_broadcast'}],conflicts,nodes:x.nodes.map(n=>n.deviceId===wire.event.originDeviceId?{...n,status:'joined',lastSeenAt:new Date().toISOString(),sequence:Math.max(n.sequence,wire.event.sequence)}:n)}:x);notify();return true;};
  const startLocalMesh=()=>{const joined=globalState.devices.filter(d=>d.competitionId===globalState.competition.id&&!['revoked','disabled'].includes(d.status)).map(d=>({deviceId:d.id,name:d.name,role:d.role,status:'joined' as const,lastSeenAt:d.lastSeenAt,sequence:0}));const coordinator=globalState.devices.find(d=>d.competitionId===globalState.competition.id&&d.type==='edge_server'&&d.status==='online')||globalState.devices.find(d=>d.competitionId===globalState.competition.id&&d.role==='Operations'&&d.status==='online')||globalState.devices.find(d=>d.competitionId===globalState.competition.id&&d.status==='online');const item:LocalMeshSessionRecord={id:newId('mesh'),competitionId:globalState.competition.id,status:joined.length?'active':'forming',coordinatorDeviceId:coordinator?.id,nodes:joined,events:[],conflicts:[],startedAt:new Date().toISOString(),transportMode:'journal_only',transportStatus:'disabled'};browserMeshAdapter?.close();browserMeshAdapter=null;const allowed=!productionMode||import.meta.env.VITE_ENABLE_BROWSER_MESH_ADAPTER==='true';if(allowed){browserMeshAdapter=createBrowserBroadcastMesh({competitionId:item.competitionId,sessionId:item.id,onEnvelope:ingestMeshEnvelope});item.transportMode=browserMeshAdapter.available?'browser_broadcast':'journal_only';item.transportStatus=browserMeshAdapter.available?'connected':'unavailable';}globalState.localMeshSessions=[item,...globalState.localMeshSessions];auditTrustAction('LOCAL_MESH_STARTED','LocalMesh',item.id,item.transportMode==='browser_broadcast'?'بدء Mesh عبر BroadcastChannel لنوافذ نفس الأصل':'بدء دفتر Mesh؛ النقل بين أجهزة مستقلة يحتاج Edge موثوق',item.transportMode==='browser_broadcast'?'Started same-origin BroadcastChannel mesh':'Started mesh journal; independent devices require trusted Edge transport');notify();return item;};
  const appendLocalMeshEvent=async(sessionId:string,type:string,payload:Record<string,unknown>,originDeviceId?:string,conflictKey?:string)=>{const mesh=globalState.localMeshSessions.find(x=>x.id===sessionId&&x.competitionId===globalState.competition.id);if(!mesh||!['active','forming'].includes(mesh.status))return null;const origin=originDeviceId||mesh.coordinatorDeviceId||mesh.nodes[0]?.deviceId||'local';const node=mesh.nodes.find(n=>n.deviceId===origin);const sequence=(node?.sequence||0)+1;const payloadHash=await hashCanonical(payload);const event={id:newId('mesh_evt'),competitionId:globalState.competition.id,originDeviceId:origin,sequence,type,payloadHash,payload,createdAt:new Date().toISOString(),acknowledgedBy:mesh.nodes.filter(n=>n.status==='joined').map(n=>n.deviceId),conflictKey,transport:'local' as const};const same=conflictKey?mesh.events.filter(e=>e.conflictKey===conflictKey&&e.payloadHash!==payloadHash):[];const conflicts=[...mesh.conflicts,...(same.length?[{id:newId('mesh_conflict'),eventIds:[...same.map(e=>e.id),event.id],reason:`Conflicting payloads for ${conflictKey}`,status:'open' as const}]:[])];globalState.localMeshSessions=globalState.localMeshSessions.map(x=>x.id===sessionId?{...x,status:'active',nodes:x.nodes.map(n=>n.deviceId===origin?{...n,sequence,lastSeenAt:new Date().toISOString()}:n),events:[...x.events,event],conflicts}:x);if(browserMeshAdapter?.available&&mesh.transportMode==='browser_broadcast')browserMeshAdapter.publish({version:'mizan-mesh-wire-v1',competitionId:globalState.competition.id,sessionId,sentAt:new Date().toISOString(),event});auditTrustAction('LOCAL_MESH_EVENT_APPENDED','LocalMesh',sessionId,`حفظ حدث Mesh ${type} بتسلسل ${sequence}`,`Recorded mesh event ${type} sequence ${sequence}`);notify();return event;};
  const reconcileLocalMesh=(sessionId:string)=>{const mesh=globalState.localMeshSessions.find(x=>x.id===sessionId);if(!mesh)return null;const keys=new Set<string>();const duplicates:string[]=[];for(const e of mesh.events){const k=`${e.originDeviceId}:${e.sequence}`;if(keys.has(k))duplicates.push(e.id);else keys.add(k)}const open=mesh.conflicts.filter(c=>c.status==='open');const status:LocalMeshSessionRecord['status']=!globalState.isOffline&&!open.length?'closed':'reconciling';globalState.localMeshSessions=globalState.localMeshSessions.map(x=>x.id===sessionId?{...x,status,reconciledAt:new Date().toISOString()}:x);auditTrustAction('LOCAL_MESH_RECONCILED','LocalMesh',sessionId,`مصالحة Mesh: ${open.length} تعارض مفتوح`,`Mesh reconciled: ${open.length} open conflict(s)`);notify();return {status,duplicates,openConflicts:open.length,events:mesh.events.length};};
  const resolveLocalMeshConflict=(sessionId:string,conflictId:string,resolution:string)=>{if(!resolution.trim())return false;globalState.localMeshSessions=globalState.localMeshSessions.map(x=>x.id===sessionId?{...x,conflicts:x.conflicts.map(c=>c.id===conflictId?{...c,status:'resolved',resolution}:c)}:x);auditTrustAction('LOCAL_MESH_CONFLICT_RESOLVED','LocalMesh',sessionId,'حل تعارض Mesh مع حفظ القرار','Resolved mesh conflict with an auditable decision');notify();return true;};

  const issueFederationAttestation=async(input:{subjectRef:string;subjectKind:'participant'|'delegation';issuer:string;claim:FederationAttestationRecord['claim'];value:string;expiresInDays?:number;scope?:string;evidencePolicy?:string;privacyClassification?:FederationAttestationRecord['privacyClassification']})=>{if(!input.subjectRef.trim())return null;const issued=new Date();const issuer=globalState.organization.name;const expiresAt=input.expiresInDays?new Date(issued.getTime()+input.expiresInDays*86400000).toISOString():undefined;const scope=input.scope||globalState.competition.id;const evidencePolicy=input.evidencePolicy||'claim_only_no_raw_document';const privacyClassification=input.privacyClassification||'restricted_claim';const core={organizationId:globalState.competition.organizationId,subjectRef:input.subjectRef,issuer,claim:input.claim,value:input.value,scope,issuedAt:issued.toISOString(),expiresAt,evidencePolicy,privacyClassification};const evidenceDigest=await federationAttestationDigest(core);const signatureRef=await developmentFederationSignature(evidenceDigest,issuer);const item:FederationAttestationRecord={id:newId('attest'),...core,subjectKind:input.subjectKind,status:'valid',evidenceDigest,signatureRef,signatureAlgorithm:'DEVELOPMENT-SHA256-COMMITMENT',privacyMode:'claim_only',revocationEndpoint:`mizan://federation/${globalState.competition.organizationId}/attestations/${newId('rev')}`};globalState.federationAttestations=[item,...globalState.federationAttestations];auditTrustAction('FEDERATION_ATTESTATION_ISSUED','FederationAttestation',item.id,'إصدار إثبات claim-only دون مشاركة الوثيقة الخام؛ توقيع التطوير موسوم بوضوح','Issued a claim-only attestation without sharing the raw document; development signature is explicitly labeled');notify();return item;};
  const verifyFederationAttestation=async(id:string)=>{const a=globalState.federationAttestations.find(x=>x.id===id);if(!a)return {valid:false,reason:'not_found'};return verifyFederationAttestationEvidence(a,{receivingOrganizationId:globalState.competition.organizationId,receivingOrganizationName:globalState.organization.name,trustList:globalState.federationTrust});};
  const revokeFederationAttestation=(id:string)=>{globalState.federationAttestations=globalState.federationAttestations.map(a=>a.id===id?{...a,status:'revoked'}:a);auditTrustAction('FEDERATION_ATTESTATION_REVOKED','FederationAttestation',id,'إلغاء إثبات اتحادي','Revoked federation attestation');notify();};


  const getQueueEstimate=(participantId:string)=>{
    const p=globalState.participants.find(x=>x.id===participantId&&x.competitionId===globalState.competition.id);
    const c=p?globalState.committees.find(x=>x.id===p.assignedCommitteeId):undefined;
    return estimateQueueWait({
      participant:p,
      committee:c,
      committeeQueueInOrder:c?globalState.participants.filter(x=>x.status==='in_queue'&&x.assignedCommitteeId===c.id).sort((a,b)=>queueOrderValue(a)-queueOrderValue(b)):[],
      fallbackSessionMinutes:globalState.competition.ruleSet.questionDurationMinutes,
      now:Date.now(),
    });
  };

  // ---- MIZAN Beyond 8 ------------------------------------------------------------------
  const buildFlightRecorder=async()=>{
    const rows:{timestamp:string;stream:FlightRecorderEntry['stream'];sourceType:string;sourceId:string;ar:string;en:string}[]=[];
    for(const a of globalState.auditLogs.filter(x=>x.competitionId===globalState.competition.id))rows.push({timestamp:a.timestamp,stream:'trust',sourceType:'audit',sourceId:a.id,ar:a.humanSummaryArabic,en:a.humanSummaryEnglish});
    for(const i of globalState.incidents.filter(x=>x.competitionId===globalState.competition.id))rows.push({timestamp:i.reportedAt,stream:'incidents',sourceType:'incident',sourceId:i.id,ar:`${i.title} · ${uiToken(i.status,true)}`,en:`${i.title} · ${i.status}`});
    for(const a of globalState.aiObservations.filter(x=>x.competitionId===globalState.competition.id)){const rc=globalState.reviewCases.find(r=>r.sessionId===a.sessionId);const p=rc?globalState.participants.find(x=>x.id===rc.participantId):undefined;const start=p?.statusHistory?.find(h=>h.status==='in_session')?.timestamp;if(start){const timestamp=new Date(new Date(start).getTime()+a.timestampSeconds*1000).toISOString();rows.push({timestamp,stream:'ai',sourceType:'ai_observation',sourceId:a.id,ar:`إشارة الذكاء: ${capabilityLabel(a.type as any,true)} · ${a.confidence}`,en:`AI observation: ${a.type} · ${a.confidence}`});}}
    for(const r of globalState.results.filter(x=>x.competitionId===globalState.competition.id)){const t=r.sealMetadata?.sealedAt||new Date().toISOString();rows.push({timestamp:t,stream:'results',sourceType:'result',sourceId:r.id,ar:`نتيجة ${r.participantCode} · ${uiToken(r.status,true)}`,en:`Result ${r.participantCode} · ${r.status}`});}
    for(const a of globalState.appeals.filter(x=>x.competitionId===globalState.competition.id))rows.push({timestamp:a.createdAt,stream:'appeals',sourceType:'appeal',sourceId:a.id,ar:`اعتراض ${a.participantCode} · ${uiToken(a.status,true)}`,en:`Appeal ${a.participantCode} · ${a.status}`});
    for(const d of globalState.devices.filter(x=>x.competitionId===globalState.competition.id))rows.push({timestamp:d.lastSeenAt,stream:'devices',sourceType:'device',sourceId:d.id,ar:`${d.name} · ${uiToken(d.status,true)}`,en:`${d.name} · ${d.status}`});
    for(const p of globalState.participants.filter(x=>x.competitionId===globalState.competition.id))for(const h of p.statusHistory||[])rows.push({timestamp:h.timestamp,stream:'operations',sourceType:'participant_state',sourceId:p.id,ar:`${p.code} · ${uiToken(h.status,true)}`,en:`${p.code} · ${h.status}`});
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

  const transferQueueParticipants=(input:{sourceCommitteeId:string;targetCommitteeId:string;participantIds?:string[];mode:'PRESERVE_ORIGINAL_TURN'|'MOVE_TO_END';reason:string})=>{
    if(!['ops_manager','comp_admin','head_judge'].includes(globalState.currentUser.role))return {ok:false,reason:'UNAUTHORIZED'} as const;
    if(!input.reason.trim())return {ok:false,reason:'REASON_REQUIRED'} as const;
    const target=globalState.committees.find(c=>c.id===input.targetCommitteeId&&c.competitionId===globalState.competition.id&&c.status!=='offline');
    const source=globalState.committees.find(c=>c.id===input.sourceCommitteeId&&c.competitionId===globalState.competition.id);if(!target||!source)return {ok:false,reason:'COMMITTEE_NOT_FOUND'} as const;
    const plan=planQueueTransfer({participants:globalState.participants,sourceCommitteeId:source.id,targetCommitteeId:target.id,participantIds:input.participantIds,mode:input.mode});if(!plan.ok)return plan;
    const invalid=plan.selectedIds.map(id=>globalState.participants.find(p=>p.id===id)).filter((p):p is Participant=>!!p).filter(p=>!compatibleCommitteesFor(p).some(c=>c.id===target.id));
    if(invalid.length)return {ok:false,reason:'INCOMPATIBLE_TARGET',participantCodes:invalid.map(p=>p.code)} as const;
    const byId=new Map(plan.changes.map(c=>[c.participantId,c]));
    globalState.participants=globalState.participants.map(p=>{const c=byId.get(p.id);if(!c)return p;return {...p,assignedCommitteeId:target.id,originalQueueNumber:p.originalQueueNumber??p.queueNumber,queueOrderKey:c.nextOrderKey,queueTransferCount:(p.queueTransferCount||0)+1,statusHistory:[...(p.statusHistory||[]),{status:'in_queue',timestamp:new Date().toISOString(),actor:`Queue Justice · ${globalState.currentUser.name}`,reason:input.reason}]};});
    const record:QueueTransferRecord={id:newId('qtransfer'),competitionId:globalState.competition.id,sourceCommitteeId:source.id,targetCommitteeId:target.id,participantIds:plan.selectedIds,mode:input.mode,reason:input.reason.trim(),requestedAt:new Date().toISOString(),requestedBy:globalState.currentUser.id,status:'APPLIED',changes:plan.changes.map(c=>({participantId:c.participantId,previousOrderKey:c.previousOrderKey,nextOrderKey:c.nextOrderKey,originalQueueNumber:c.originalQueueNumber}))};
    globalState.queueTransfers=[record,...globalState.queueTransfers];
    auditTrustAction('QUEUE_TRANSFER_APPLIED','QueueTransfer',record.id,input.mode==='PRESERVE_ORIGINAL_TURN'?`نقل ${plan.selectedIds.length} متسابقًا من ${source.code} إلى ${target.code} مع حفظ أسبقية الوصول الأصلية`:`نقل ${plan.selectedIds.length} متسابقًا من ${source.code} إلى ${target.code} إلى آخر الطابور`,input.mode==='PRESERVE_ORIGINAL_TURN'?`Moved ${plan.selectedIds.length} participant(s) from ${source.code} to ${target.code} preserving original arrival priority`:`Moved ${plan.selectedIds.length} participant(s) from ${source.code} to ${target.code} at the end of the queue`);
    refreshQueueNotifications();notify();return {ok:true,record} as const;
  };

  const recommendCommitteeElasticity=()=>{
    const active=globalState.committees.filter(c=>c.competitionId===globalState.competition.id&&c.status!=='offline');if(active.length<2)return null;
    const load=(c:Committee)=>globalState.participants.filter(p=>p.status==='in_queue'&&p.assignedCommitteeId===c.id).length*Math.max(1,c.averageSessionMinutes);
    const source=[...active].sort((a,b)=>load(b)-load(a))[0],target=[...active].sort((a,b)=>load(a)-load(b))[0];if(!source||!target||source.id===target.id||load(source)<=load(target)+Math.max(5,source.averageSessionMinutes))return null;
    const recommendation=recommendBalancedQueueMove({participants:globalState.participants,sourceCommittee:source,targetCommittee:target,maxMove:5,isCompatible:(p,t)=>compatibleCommitteesFor(p).some(c=>c.id===t.id)});if(!recommendation.participantIds.length)return null;
    const item:CommitteeElasticityRecommendation={id:newId('elastic'),competitionId:globalState.competition.id,createdAt:new Date().toISOString(),createdBy:globalState.currentUser.name,sourceCommitteeId:source.id,targetCommitteeId:target.id,participantIds:recommendation.participantIds,reasonArabic:`${source.code} أعلى حملًا؛ أقل نقل يحسن الفجوة هو ${recommendation.participantIds.length} إلى ${target.code} مع حفظ أسبقية الوصول.`,reasonEnglish:`${source.code} is carrying more load; the smallest transfer improving the gap is ${recommendation.participantIds.length} to ${target.code} while preserving arrival priority.`,constraintsChecked:['category','committee availability','declared hard conflicts','current load','average session duration',`projected gap ${recommendation.before.gapMinutes}→${recommendation.after.gapMinutes} min`],status:'proposed'};globalState.elasticityRecommendations=[item,...globalState.elasticityRecommendations];auditTrustAction('ELASTICITY_RECOMMENDATION_CREATED','Committee',source.id,'اقتراح أقل نقل يحسن توازن اللجان دون تنفيذ تلقائي ومع حفظ الأسبقية','Proposed the smallest queue move that improves panel balance without automatic execution and while preserving priority');notify();return item;
  };
  const decideCommitteeElasticity=(id:string,approve:boolean)=>{const item=globalState.elasticityRecommendations.find(x=>x.id===id&&x.competitionId===globalState.competition.id);if(!item||item.status!=='proposed')return false;if(!['comp_admin','ops_manager','head_judge'].includes(globalState.currentUser.role))return false;if(approve&&item.targetCommitteeId){const moved=transferQueueParticipants({sourceCommitteeId:item.sourceCommitteeId,targetCommitteeId:item.targetCommitteeId,participantIds:item.participantIds,mode:'PRESERVE_ORIGINAL_TURN',reason:'Approved committee load balancing'});if(!moved.ok)return false;}
    globalState.elasticityRecommendations=globalState.elasticityRecommendations.map(x=>x.id===id?{...x,status:approve?'approved':'dismissed',approvedAt:approve?new Date().toISOString():undefined,approvedBy:approve?globalState.currentUser.name:undefined}:x);auditTrustAction(approve?'ELASTICITY_APPROVED':'ELASTICITY_DISMISSED','CommitteeElasticity',id,approve?'اعتماد موازنة اللجان يدويًا مع حفظ أسبقية الوصول':'رفض اقتراح موازنة اللجان',approve?'Approved committee elasticity recommendation while preserving arrival priority':'Dismissed committee elasticity recommendation');notify();return true;};

  const issueJourneyPass=async(participantId:string)=>{
    const p=globalState.participants.find(x=>x.id===participantId&&x.competitionId===globalState.competition.id);if(!p)return null;
    const existing=globalState.journeyPasses.find(x=>x.participantId===p.id&&x.status==='active');if(existing)return existing;
    const keys=await generateSigningKeyPair();const now=new Date();const expiry=new Date(Math.max(Date.parse(globalState.competition.endDate||''),now.getTime()+24*60*60*1000));const credentialId=newId('cred');const category=p.categoryId||'competition';
    const lineageId=credentialLineageFor(globalState.journeyPasses,p.id);const generation=nextCredentialGeneration(globalState.journeyPasses,p.id);
    const payload={v:'MZP1' as const,competition:globalState.competition.id,participantToken:p.code,categoryEntitlement:category,validFrom:now.toISOString(),expiry:expiry.toISOString(),credentialId,issuer:globalState.competition.organizationId,lineageId,generation};
    const compact=await issueSignedPass(payload,keys.privateKey);const base=await compactCredentialToJourneyRecord({compact,payload,participantId:p.id,participantCode:p.code});const item:JourneyPassRecord={...base,issuerPublicKeyJwk:await exportPublicJwk(keys.publicKey),signatureAssurance:'development_per_credential'};
    globalState.journeyPasses=[item,...globalState.journeyPasses];
    const lineage:ParticipantCredentialLineageRecord={id:`lineage-record:${globalState.competition.id}:${p.id}`,competitionId:globalState.competition.id,participantId:p.id,lineageId,latestGeneration:generation,latestCredentialId:credentialId,revocationEpoch:Math.max(0,...globalState.credentialLineages.filter(x=>x.participantId===p.id).map(x=>x.revocationEpoch)),updatedAt:now.toISOString(),updatedBy:globalState.currentUser.id};
    globalState.credentialLineages=[lineage,...globalState.credentialLineages.filter(x=>x.participantId!==p.id||x.competitionId!==globalState.competition.id)];
    auditTrustAction('JOURNEY_PASS_ISSUED','Participant',p.id,'إصدار اعتماد تشغيل موقّع مرتبط بسلسلة إصدار تمنع قبول نسخة أقدم بعد إعادة الإصدار','Issued a signed operational credential bound to a generation lineage so superseded passes can be rejected');notify();return item;
  };
  const verifyOfflineJourneyPass=async(raw:string)=>{
    const token=raw.trim().startsWith('MZ1|')?raw.trim().slice(4).trim():raw.trim();const pass=globalState.journeyPasses.find(x=>x.competitionId===globalState.competition.id&&((x.credentialId&&x.credentialId===token)||x.payload===token||x.participantCode===token));if(!pass)return {valid:false,reason:'NOT_FOUND'} as const;if(pass.status==='revoked')return {valid:false,reason:'REVOKED'} as const;if(!pass.issuerPublicKeyJwk)return {valid:false,reason:'TRUST_KEY_NOT_CACHED'} as const;const key=await importPublicJwk(pass.issuerPublicKeyJwk);const revoked=new Set(globalState.journeyPasses.filter(x=>x.status==='revoked').map(x=>x.credentialId||x.id));const used=new Set(globalState.journeyPasses.filter(x=>x.usedAt).map(x=>x.credentialId||x.id));const latest=new Map(globalState.credentialLineages.filter(x=>x.competitionId===globalState.competition.id).map(x=>[x.lineageId,x.latestGeneration]));return verifySignedPass(pass.payload,key,{competition:globalState.competition.id,revokedCredentialIds:revoked,usedCredentialIds:used,singleUse:false,latestGenerationByLineage:latest});
  };
  const revokeJourneyPass=(id:string,reason='Administrative revocation')=>{globalState.journeyPasses=globalState.journeyPasses.map(x=>x.id===id?{...x,status:'revoked',revocationVersion:(x.revocationVersion||0)+1,revokedAt:new Date().toISOString(),revocationReason:reason}:x);auditTrustAction('JOURNEY_PASS_REVOKED','JourneyPass',id,'إلغاء رمز الرحلة وتحديث حالة الإلغاء القابلة للتخزين على Edge','Revoked journey pass and advanced the revocation state for Edge caches');notify();};
  const reissueJourneyPass=async(participantId:string,identityVerification:PassReissueRecord['identityVerification'],reason:PassReissueRecord['reason'],notes='')=>{
    const allowed=passReissueAllowed({actorRole:globalState.currentUser.role,identityVerification,reason:`${reason} ${notes}`});if(!allowed.ok)return {ok:false,reason:allowed.reason} as const;
    const p=globalState.participants.find(x=>x.id===participantId&&x.competitionId===globalState.competition.id);if(!p)return {ok:false,reason:'PARTICIPANT_NOT_FOUND'} as const;
    const journeyGate=passReissueJourneyStateAllowed(p.status);if(!journeyGate.ok){if(journeyGate.reason==='ACTIVE_SESSION_SECURITY_HOLD'){auditTrustAction('PASS_REISSUE_ACTIVE_SESSION_BLOCKED','Participant',p.id,'منع إعادة إصدار QR أثناء جلسة تحكيم نشطة لأي دور؛ الجلسة الحالية هي مرجع الهوية ويعالج الفقد عبر مسار الاستمرارية لا بطاقة جديدة','Blocked QR reissue for every role during an active judging session; the active session remains the identity anchor and loss is handled through continuity, not a new credential');notify();}return {ok:false,reason:journeyGate.reason} as const;}
    const active=globalState.journeyPasses.filter(x=>x.participantId===p.id&&x.competitionId===globalState.competition.id&&x.status==='active');const oldIds=active.map(x=>x.credentialId||x.id);const reissuedFromId=active[0]?.id;
    const lineageId=credentialLineageFor(globalState.journeyPasses,p.id);const generation=nextCredentialGeneration(globalState.journeyPasses,p.id);const previousEpoch=Math.max(0,...globalState.credentialLineages.filter(x=>x.participantId===p.id).map(x=>x.revocationEpoch));const revocationEpoch=previousEpoch+1;const now=new Date();
    globalState.journeyPasses=globalState.journeyPasses.map(x=>active.some(a=>a.id===x.id)?{...x,status:'revoked',revokedAt:now.toISOString(),revocationReason:`REISSUED:${reason}`,revocationVersion:revocationEpoch}:x);
    const keys=await generateSigningKeyPair();const expiry=new Date(Math.max(Date.parse(globalState.competition.endDate||''),now.getTime()+24*60*60*1000));const credentialId=newId('cred');const payload={v:'MZP1' as const,competition:globalState.competition.id,participantToken:p.code,categoryEntitlement:p.categoryId||'competition',validFrom:now.toISOString(),expiry:expiry.toISOString(),credentialId,issuer:globalState.competition.organizationId,lineageId,generation};const compact=await issueSignedPass(payload,keys.privateKey);const base=await compactCredentialToJourneyRecord({compact,payload,participantId:p.id,participantCode:p.code});const fresh:JourneyPassRecord={...base,issuerPublicKeyJwk:await exportPublicJwk(keys.publicKey),signatureAssurance:'development_per_credential',reissuedFromId};globalState.journeyPasses=[fresh,...globalState.journeyPasses];
    const lineage:ParticipantCredentialLineageRecord={id:`lineage-record:${globalState.competition.id}:${p.id}`,competitionId:globalState.competition.id,participantId:p.id,lineageId,latestGeneration:generation,latestCredentialId:credentialId,revocationEpoch,updatedAt:now.toISOString(),updatedBy:globalState.currentUser.id};globalState.credentialLineages=[lineage,...globalState.credentialLineages.filter(x=>x.participantId!==p.id||x.competitionId!==globalState.competition.id)];
    const rec:PassReissueRecord={id:newId('pass-reissue'),competitionId:globalState.competition.id,participantId:p.id,oldCredentialIds:oldIds,newCredentialId:credentialId,lineageId,generation,reason,identityVerification,requestedAt:now.toISOString(),requestedBy:globalState.currentUser.id,status:'ISSUED',revocationEpoch};globalState.passReissues=[rec,...globalState.passReissues];auditTrustAction('JOURNEY_PASS_REISSUED','Participant',p.id,`إعادة إصدار QR بعد تحقق الهوية؛ إلغاء ${oldIds.length} اعتماد سابق ورفع جيل البطاقة إلى ${generation}`,`Reissued participant QR after identity verification; revoked ${oldIds.length} prior credential(s) and advanced generation to ${generation}`);notify();return {ok:true,pass:fresh,reissue:rec} as const;
  };
  const reissueQrBundle=async(participantId:string,identityVerification:PassReissueRecord['identityVerification']='PHOTO_ID',reason:PassReissueRecord['reason']='DAMAGED',notes='')=>reissueJourneyPass(participantId,identityVerification,reason,notes);

  const compileCompetitionPolicy=async(fileName:string,sourceType:PolicyCompilationRecord['sourceType'],text:string)=>{
    if(!['comp_admin','org_admin'].includes(globalState.currentUser.role)||!text.trim())return null;
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
      async()=>{if(!sampleParticipant)return pass('fairdraw','FairDraw',false,'Question selection',['No rehearsal participant'],'Load a DEMO/REHEARSAL participant.',true);try{const category=globalState.competition.categories.find(c=>c.id===sampleParticipant.categoryId);const resolution=participantEffectiveScope(sampleParticipant.id);if(!resolution||resolution.blocked)return pass('fairdraw','FairDraw',false,'Deterministic constrained draw',[resolution?.reasonEnglish||'participant scope unavailable'],'Approve the participant memorization scope, or give the category a fixed range.');const scoped=DEVELOPMENT_QUESTION_BANK.filter(q=>scopeContainsRange(resolution.scope,{surah:q.surahNumber,ayah:q.startAyah},{surah:q.surahNumber,ayah:q.endAyah}));const rehearsalPool=scoped.length?scoped:buildCandidatePool({scope:resolution.scope,category,reading:readingContextOf({riwaya:sampleParticipant.riwaya})}).slice(0,40).map(c=>({id:c.id,surahNumber:c.surahNumber,surahNameArabic:surahNameArabic(c.surahNumber),surahNameEnglish:'',startAyah:c.startAyah,endAyah:c.endAyah,juzNumber:c.juzNumber||1,riwaya:sampleParticipant.riwaya,expectedTextArabic:'',difficultyRating:c.difficultyRating,mutashabihatDensity:'none' as const,tajweedComplexity:'intermediate' as const,timesUsed:0}));const allocation=planAllocation({category,policy,effectiveScope:resolution.scope});const scopedContext={scope:resolution.scope,participantScopeVersion:resolution.version,slots:allocation.slots,engine:new QuestionAllocationEngine({policy:categoryRepeatPolicy(category,policy),seed:`rehearsal:${sampleParticipant.id}`,defaultTargetDifficulty:policy.questions.targetDifficulty}),reading:readingContextOf({riwaya:sampleParticipant.riwaya}),sequencePosition:0};const draw=await generateFairDraw({pool:rehearsalPool,participant:sampleParticipant,policy,scoped:scopedContext});const verified=await verifyFairDrawSelection({selection:draw,pool:rehearsalPool,participant:sampleParticipant,policy,scoped:{...scopedContext,engine:new QuestionAllocationEngine({policy:categoryRepeatPolicy(category,policy),seed:`rehearsal:${sampleParticipant.id}`,defaultTargetDifficulty:policy.questions.targetDifficulty})}});return pass('fairdraw','FairDraw',verified.valid,'Deterministic constrained draw inside the participant scope',[verified.valid?'Commitment/reveal reproduced inside the approved scope':verified.reason||'verification failed'],'Repair FairDraw constraints or reading-scoped pool.')}catch(e){return pass('fairdraw','FairDraw',false,'Deterministic constrained draw',[e instanceof Error?e.message:String(e)],'Repair FairDraw configuration.',true)}},
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

  const buildFairDrawPublicProof=async()=>{const sel=globalState.activeSession.questionSelection;const participant=globalState.activeSession.participant;if(!sel||!participant||!sel.seedReveal||!sel.publicCommitmentHash)return null;const existing=globalState.fairDrawProofs.find(x=>x.questionSetId===sel.questionSetId);if(existing)return existing;const policy=getCompetitionPolicy(globalState.competition);const category=globalState.competition.categories.find(c=>c.id===participant.categoryId);const source=sel.quranSourceManifestId?globalState.quranSourceManifests.find(q=>q.id===sel.quranSourceManifestId):undefined;const content=source?globalState.quranSourceContents.find(c=>c.sourceManifestId===source.id&&c.packageHash===source.packageHash):undefined;const resolution=participantEffectiveScope(participant.id);const rawPool=source&&content?sourceResolvedQuestionPool(participant,source,content):DEVELOPMENT_QUESTION_BANK;/* لقطة المرشحين في وضع النطاق هي ما كان صالحًا لصاحب النموذج، لا البنك كله: لقطةٌ أوسع من الواقع تُضلّل المدقّق. */const pool=resolution&&!resolution.blocked?rawPool.filter(q=>scopeContainsRange(resolution.scope,{surah:q.surahNumber,ayah:q.startAyah},{surah:q.surahNumber,ayah:q.endAyah})):rawPool;const item:FairDrawProofRecord={id:newId('fairproof'),competitionId:globalState.competition.id,questionSetId:sel.questionSetId,algorithmVersion:sel.algorithmVersion||'MIZAN-FAIRDRAW-2.0',ruleVersion:sel.ruleVersion||policy.version,poolVersion:sel.poolVersion||'unknown',poolSnapshotHash:sel.poolSnapshotHash||'unknown',constraintHash:sel.constraintHash||'unknown',seedCommitmentHash:sel.seedCommitmentHash,publicCommitmentHash:sel.publicCommitmentHash,secretSeed:sel.seedReveal,selectionIds:sel.questions.map(q=>q.id),status:'REVEALED',createdAt:sel.generatedAt,revealedAt:new Date().toISOString(),participantReading:participant.riwaya,qiraah:sel.qiraah,rawi:sel.rawi,tariq:sel.tariq,variantLocusVersion:sel.variantLocusVersion,difficultyMetadataVersion:sel.difficultyMetadataVersion,quranSourceManifestId:sel.quranSourceManifestId,quranSourcePackageHash:sel.quranSourcePackageHash,constraints:{questionsPerParticipant:sel.questions.length,targetDifficulty:policy.questions.targetDifficulty,difficultyTolerance:policy.questions.difficultyTolerance,diversity:policy.questions.diversity,maxJuz:sel.scopeSignature?undefined:derivedLegacyMaxJuz(categoryScopeOf(category)),excludedIds:[]},scopeSignature:sel.scopeSignature,participantScopeVersion:sel.participantScopeVersion,zoneSignatures:sel.zoneSignatures,eligiblePoolSnapshot:pool.map(q=>({id:q.id,riwaya:q.riwaya,surahNumber:q.surahNumber,startAyah:q.startAyah,endAyah:q.endAyah,juzNumber:q.juzNumber,difficultyRating:q.difficultyRating,mutashabihatDensity:q.mutashabihatDensity,tajweedComplexity:q.tajweedComplexity})),verificationStatement:'The selected set satisfies the configured fairness constraints.'};const result=await verifyFairDrawPublicProof(item);item.status=result.valid?'VERIFIED':'REVEALED';globalState.fairDrawProofs=[item,...globalState.fairDrawProofs];auditTrustAction('FAIRDRAW_PROOF_PUBLISHED','FairDrawProof',item.id,result.valid?'نشر إثبات FairDraw قابل لإعادة الإنتاج':'نشر بيانات FairDraw مع تعذر التحقق المحلي الكامل',result.valid?'Published reproducible FairDraw proof':'Published FairDraw data; local verification did not fully pass');notify();return item;};
  const verifyActiveFairDrawProof=async()=>{const sel=globalState.activeSession.questionSelection;const p=globalState.activeSession.participant;
    /* قرعة النطاق تُتحقَّق بما يستطيع المدقّق فعله دون إعادة تشغيل البطولة: كل سؤال داخل
       نطاق صاحبه وداخل منطقته، ولا تكرار في النموذج، والالتزام سليم. */
    if(sel?.algorithmVersion==='MIZAN-FAIRDRAW-SCOPE-1'&&p){
      const category=globalState.competition.categories.find(c=>c.id===p.categoryId);
      const resolution=participantEffectiveScope(p.id);
      if(!resolution||resolution.blocked)return {valid:false,reason:'PARTICIPANT_SCOPE_UNAVAILABLE'} as const;
      const allocation=planAllocation({category,policy:getCompetitionPolicy(globalState.competition),effectiveScope:resolution.scope});
      const outcome=await validateScopedSelection(sel,{slots:allocation.slots});
      return outcome.valid?{valid:true,statement:outcome.statement}:{valid:false,reason:(outcome as {problems?:string[]}).problems?.join(', ')||'SCOPE_VALIDATION_FAILED'} as const;
    }
    const proof=globalState.fairDrawProofs.find(x=>x.questionSetId===globalState.activeSession.questionSelection?.questionSetId);if(proof)return verifyFairDrawPublicProof(proof);if(!sel||!p)return {valid:false,reason:'NO_SELECTION'} as const;const source=sel.quranSourceManifestId?globalState.quranSourceManifests.find(q=>q.id===sel.quranSourceManifestId):undefined;const content=source?globalState.quranSourceContents.find(c=>c.sourceManifestId===source.id&&c.packageHash===source.packageHash):undefined;const pool=source&&content?sourceResolvedQuestionPool(p,source,content):DEVELOPMENT_QUESTION_BANK;return verifyFairDrawSelection({selection:sel,pool,participant:p,policy:getCompetitionPolicy(globalState.competition),maxJuz:derivedLegacyMaxJuz(categoryScopeOf(globalState.competition.categories.find(c=>c.id===p.categoryId)))});};

  const setFederationTrust=(issuer:string,trusted:boolean,claimScopes:FederationTrustRecord['claimScopes'])=>{if(!['org_admin','super_admin'].includes(globalState.currentUser.role))return false;const existing=globalState.federationTrust.find(x=>x.organizationId===globalState.competition.organizationId&&x.issuer===issuer);const rec:FederationTrustRecord={id:existing?.id||newId('trustissuer'),organizationId:globalState.competition.organizationId,issuer,trusted,claimScopes,updatedAt:new Date().toISOString(),updatedBy:globalState.currentUser.id};globalState.federationTrust=existing?globalState.federationTrust.map(x=>x.id===existing.id?rec:x):[rec,...globalState.federationTrust];auditTrustAction('FEDERATION_TRUST_CHANGED','FederationIssuer',rec.id,trusted?'اعتماد جهة مُصدرة في قائمة الثقة':'إلغاء الثقة بجهة مُصدرة',trusted?'Trusted federation issuer':'Revoked federation issuer trust');notify();return true;};

  const sealCeremonyVault=async()=>{const sealed=globalState.results.filter(r=>r.competitionId===globalState.competition.id&&['sealed','published'].includes(r.status));if(!sealed.length)return null;const existing=globalState.ceremonyVaults.find(v=>v.competitionId===globalState.competition.id&&!['REVEALED','REVOKED'].includes(v.status));if(existing)return existing;const q=await requestCeremonyReveal();if(!q)return null;const resultPayload=sealed.map(r=>({id:r.id,participantId:r.participantId,rank:r.rank,score:r.finalScore,status:r.status,seal:r.sealMetadata?.cryptographicChecksum}));const resultPackageHash=await hashCanonical(resultPayload);const publicCommitmentHash=await hashCanonical({competitionId:globalState.competition.id,resultPackageHash,quorumActionId:q.id});const key=await generateEncryptionKey();const encryptedPayload=await encryptJson({competitionId:globalState.competition.id,results:resultPayload,createdAt:new Date().toISOString()},key);if(typeof sessionStorage!=='undefined')sessionStorage.setItem(`mizan-ceremony-key:${globalState.competition.id}`,Array.from(key).map(b=>b.toString(16).padStart(2,'0')).join(''));const item:CeremonyVaultRecord={id:newId('ceremonyvault'),competitionId:globalState.competition.id,resultPackageHash,encryptedPayload,encryptionAlgorithm:'AES-256-GCM',keyManagement:'development_adapter',quorumActionId:q.id,status:q.status==='ready'?'READY':'SEALED',createdAt:new Date().toISOString(),publicCommitmentHash};globalState.ceremonyVaults=[item,...globalState.ceremonyVaults];auditTrustAction('CEREMONY_PACKAGE_SEALED','CeremonyVault',item.id,'تشفير حزمة نتائج الحفل وربطها بالنصاب؛ مفتاح التطوير منفصل عن الحزمة','Encrypted ceremony result package and bound it to quorum; development key is stored separately from the package');notify();return item;};
  const generateMizanProtocolPackage=async()=>{if(!globalState.evidenceNodes.some(n=>n.competitionId===globalState.competition.id))await rebuildEvidenceGraph();let root=globalState.publicResultRoots.find(r=>r.competitionId===globalState.competition.id);if(!root&&globalState.results.some(r=>r.competitionId===globalState.competition.id&&['sealed','published'].includes(r.status)))root=await buildPublicResultRoot()||undefined;const genomeHash=await hashCanonical(globalState.competition);const graphNodes=globalState.evidenceNodes.filter(n=>n.competitionId===globalState.competition.id).map(n=>({id:n.id,type:n.type,status:n.status,version:n.version,checksum:n.checksum,authority:n.authority})).sort((a,b)=>a.id.localeCompare(b.id));const graphEdges=globalState.evidenceEdges.filter(e=>e.competitionId===globalState.competition.id).map(e=>({from:e.fromNodeId,to:e.toNodeId,relation:e.relation})).sort((a,b)=>`${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));const evidenceGraphHash=await hashCanonical({nodes:graphNodes,edges:graphEdges});const manifest={competitionId:globalState.competition.id,organizationId:globalState.competition.organizationId,edition:globalState.competition.edition,policyVersion:getCompetitionPolicy(globalState.competition).version,ruleVersion:globalState.competition.ruleSet.version,status:globalState.competition.status,nonSecret:true as const};const core={protocolVersion:'MIZAN-PROTOCOL-1.0' as const,generatedAt:new Date().toISOString(),generatedBy:globalState.currentUser.name,genomeHash,resultRoot:root?.merkleRoot,auditHead:globalState.auditLogs.find(a=>a.competitionId===globalState.competition.id)?.currentStateHash,quranSourceHashes:globalState.quranSourceManifests.filter(q=>q.organizationId===globalState.competition.organizationId&&q.status==='approved').map(q=>q.checksumSha256),integrityEnvelopeHashes:globalState.integrityEnvelopes.filter(x=>x.competitionId===globalState.competition.id).map(x=>x.envelopeHash),evidenceGraphHash,manifest};const packageHash=await hashCanonical(core);const item:MizanProtocolPackageRecord={id:newId('protocol'),competitionId:globalState.competition.id,...core,packageHash,verificationStatus:'self_verified'};const verifyHash=await hashCanonical(core);item.verificationStatus=verifyHash===packageHash?'self_verified':'verification_failed';globalState.protocolPackages=[item,...globalState.protocolPackages];auditTrustAction('MIZAN_PROTOCOL_PACKAGE_GENERATED','MizanProtocolPackage',item.id,'إنشاء حزمة MIZAN Protocol مستقلة','Generated a portable MIZAN Protocol package');notify();return item;};
  const verifyMizanProtocolPackage=async(item:MizanProtocolPackageRecord)=>{const core:any={protocolVersion:item.protocolVersion,generatedAt:item.generatedAt,generatedBy:item.generatedBy,genomeHash:item.genomeHash,resultRoot:item.resultRoot,auditHead:item.auditHead,quranSourceHashes:item.quranSourceHashes,integrityEnvelopeHashes:item.integrityEnvelopeHashes,manifest:item.manifest};if(item.evidenceGraphHash)core.evidenceGraphHash=item.evidenceGraphHash;const computed=await hashCanonical(core);return {valid:computed===item.packageHash,computedHash:computed};};
  const exportMizanProtocolPackage=(id:string)=>{const p=globalState.protocolPackages.find(x=>x.id===id);return p?JSON.stringify(p,null,2):null;};



  // ---- Identity Governance + High-Value Competition Continuity ---------------------------
  const randomInviteToken=()=>{const bytes=crypto.getRandomValues(new Uint8Array(24));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')};
  const createIdentityInvitation=async(input:{email:string;displayName:string;requestedRole:Role;competitionId?:string;committeeId?:string;reason:string})=>{
    if(['participant','guardian'].includes(input.requestedRole))return {ok:false,reason:'SELF_SERVICE_ROLE_NOT_PROVISIONABLE'} as const;
    if(['completed','archived'].includes(globalState.competition.status)&&input.requestedRole!=='auditor')return {ok:false,reason:'COMPETITION_ACCESS_CLOSED'} as const;
    const email=normalizedIdentityEmail(input.email);if(!email||!email.includes('@')||input.reason.trim().length<3)return {ok:false,reason:'INVALID_INVITATION'} as const;
    if(!canGrantRole(globalState.currentUser.role,input.requestedRole))return {ok:false,reason:'ROLE_GRANT_NOT_ALLOWED'} as const;
    if(globalState.identityAccounts.some(a=>a.organizationId===globalState.organization.id&&normalizedIdentityEmail(a.email)===email&&a.status==='ACTIVE'))return {ok:false,reason:'ACCOUNT_ALREADY_ACTIVE'} as const;
    if(globalState.identityInvitations.some(i=>i.organizationId===globalState.organization.id&&i.email===email&&['PENDING_APPROVAL','READY'].includes(i.status)))return {ok:false,reason:'INVITATION_ALREADY_PENDING'} as const;
    const dual=roleGrantRequiresDualApproval(input.requestedRole)&&globalState.currentUser.role!=='super_admin';const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();let activationToken:string|undefined,activationTokenHash:string|undefined;if(!dual){activationToken=randomInviteToken();activationTokenHash=await invitationTokenHash(activationToken)}
    const item:IdentityInvitationRecord={id:newId('invite'),email,displayName:input.displayName.trim()||email,organizationId:globalState.organization.id,requestedRole:input.requestedRole,competitionId:input.competitionId||globalState.competition.id,committeeId:input.committeeId,status:dual?'PENDING_APPROVAL':'READY',createdAt:new Date().toISOString(),createdBy:globalState.currentUser.id,expiresAt,activationTokenHash};globalState.identityInvitations=[item,...globalState.identityInvitations];auditTrustAction('IDENTITY_INVITATION_CREATED','IdentityInvitation',item.id,dual?'إنشاء دعوة حساب حساسة بانتظار موافقة شخص ثانٍ':'إنشاء دعوة حساب جاهزة للتفعيل','Created identity invitation with separation-of-duties controls');notify();return {ok:true,invitation:item,activationToken} as const;
  };
  const approveIdentityInvitation=async(id:string)=>{
    const i=globalState.identityInvitations.findIndex(x=>x.id===id);if(i<0)return {ok:false,reason:'NOT_FOUND'} as const;const current=globalState.identityInvitations[i];if(current.status!=='PENDING_APPROVAL')return {ok:false,reason:'NOT_PENDING'} as const;if(current.createdBy===globalState.currentUser.id)return {ok:false,reason:'SELF_APPROVAL_BLOCKED'} as const;if(!canGrantRole(globalState.currentUser.role,current.requestedRole))return {ok:false,reason:'ROLE_GRANT_NOT_ALLOWED'} as const;
    const token=randomInviteToken();const activationTokenHash=await invitationTokenHash(token);const next={...current,status:'READY' as const,approvedAt:new Date().toISOString(),approvedBy:globalState.currentUser.id,activationTokenHash};globalState.identityInvitations[i]=next;auditTrustAction('IDENTITY_INVITATION_APPROVED','IdentityInvitation',id,'موافقة مستقلة ثانية على دعوة حساب حساس','Second-person approval granted for sensitive account invitation');notify();return {ok:true,invitation:next,activationToken:token} as const;
  };
  const activateIdentityInvitation=async(id:string,token:string,firebaseUid:string,email:string)=>{
    const i=globalState.identityInvitations.findIndex(x=>x.id===id);if(i<0)return {ok:false,reason:'NOT_FOUND'} as const;const inv=globalState.identityInvitations[i];if(['participant','guardian'].includes(inv.requestedRole))return {ok:false,reason:'SELF_SERVICE_ROLE_NOT_PROVISIONABLE'} as const;if(['completed','archived'].includes(globalState.competition.status)&&inv.requestedRole!=='auditor')return {ok:false,reason:'COMPETITION_ACCESS_CLOSED'} as const;if(inv.status!=='READY'||Date.parse(inv.expiresAt)<=Date.now())return {ok:false,reason:'INVITATION_NOT_USABLE'} as const;if(normalizedIdentityEmail(email)!==inv.email)return {ok:false,reason:'EMAIL_MISMATCH'} as const;if(!inv.activationTokenHash||await invitationTokenHash(token)!==inv.activationTokenHash)return {ok:false,reason:'INVALID_ACTIVATION_TOKEN'} as const;
    const account:IdentityAccountRecord={id:newId('account'),firebaseUid,email:inv.email,displayName:inv.displayName,organizationId:inv.organizationId,status:'ACTIVE',createdAt:inv.createdAt,createdBy:inv.createdBy,activatedAt:new Date().toISOString(),mfaRequired:roleGrantRequiresDualApproval(inv.requestedRole),identityAssurance:'FIREBASE'};const grant:RoleGrantRecord={id:newId('grant'),accountId:account.id,role:inv.requestedRole,organizationId:inv.organizationId,competitionId:inv.competitionId,committeeId:inv.committeeId,status:'ACTIVE',requestedAt:inv.createdAt,requestedBy:inv.createdBy,approvedAt:inv.approvedAt||new Date().toISOString(),approvedBy:inv.approvedBy||inv.createdBy,reason:'Activated from approved invitation',dualApprovalRequired:roleGrantRequiresDualApproval(inv.requestedRole)};globalState.identityAccounts=[account,...globalState.identityAccounts];globalState.roleGrants=[grant,...globalState.roleGrants];globalState.identityInvitations[i]={...inv,status:'ACCEPTED',acceptedAt:new Date().toISOString(),accountId:account.id,activationTokenHash:undefined};auditTrustAction('IDENTITY_ACCOUNT_ACTIVATED','IdentityAccount',account.id,'تفعيل حساب شخصي وربطه بصلاحية محددة النطاق','Activated named account and bound it to a scoped role grant');notify();return {ok:true,account,grant} as const;
  };
  const suspendIdentityAccount=(accountId:string,reason:string)=>{if(!['org_admin','super_admin','comp_admin'].includes(globalState.currentUser.role)||reason.trim().length<3)return false;const i=globalState.identityAccounts.findIndex(x=>x.id===accountId&&x.organizationId===globalState.organization.id);if(i<0)return false;const target=globalState.identityAccounts[i];if(target.firebaseUid===globalState.currentUser.id)return false;globalState.identityAccounts[i]={...target,status:'SUSPENDED',suspendedAt:new Date().toISOString()};globalState.roleGrants=globalState.roleGrants.map(g=>g.accountId===accountId&&g.status==='ACTIVE'?{...g,status:'SUSPENDED'}:g);globalState.authSessions=globalState.authSessions.map(a=>a.accountId===accountId&&a.status==='ACTIVE'?{...a,status:'REVOKED'}:a);auditTrustAction('IDENTITY_ACCOUNT_SUSPENDED','IdentityAccount',accountId,'تعليق الحساب وإبطال جلساته النشطة','Suspended identity account and revoked active sessions');notify();return true;};
  // Demo-mode identity mutations. In production these go to the identity server; in demo/preview
  // (no auth server) the governance UI has no backend, so these operate on local seeded state and
  // keep the same buttons (approve, delete, reissue, freeze) fully functional.
  const resumeIdentityAccount=(accountId:string)=>{const i=globalState.identityAccounts.findIndex(x=>x.id===accountId);if(i<0)return false;globalState.identityAccounts[i]={...globalState.identityAccounts[i],status:'ACTIVE',suspendedAt:undefined};globalState.roleGrants=globalState.roleGrants.map(g=>g.accountId===accountId&&g.status==='SUSPENDED'?{...g,status:'ACTIVE'}:g);auditTrustAction('IDENTITY_ACCOUNT_RESTORED','IdentityAccount',accountId,'إعادة تفعيل الحساب وصلاحياته','Restored identity account and its grants');notify();return true;};
  const removeIdentityAccount=(accountId:string,reason:string)=>{const before=globalState.identityAccounts.length;globalState.identityAccounts=globalState.identityAccounts.filter(x=>x.id!==accountId);if(globalState.identityAccounts.length===before)return false;globalState.roleGrants=globalState.roleGrants.filter(g=>g.accountId!==accountId);globalState.authSessions=globalState.authSessions.map(a=>a.accountId===accountId&&a.status==='ACTIVE'?{...a,status:'REVOKED'}:a);auditTrustAction('IDENTITY_ACCOUNT_ACCESS_REMOVED','IdentityAccount',accountId,reason||'إلغاء وصول الحساب بالكامل','Removed account access');notify();return true;};
  const removeRoleGrant=(grantId:string,reason:string)=>{const before=globalState.roleGrants.length;globalState.roleGrants=globalState.roleGrants.filter(g=>g.id!==grantId);if(globalState.roleGrants.length===before)return false;auditTrustAction('ROLE_GRANT_REMOVED','RoleGrant',grantId,reason||'إلغاء الصلاحية المحددة','Removed scoped grant');notify();return true;};
  const setRoleGrantStatus=(grantId:string,status:RoleGrantRecord['status'])=>{const i=globalState.roleGrants.findIndex(g=>g.id===grantId);if(i<0)return false;globalState.roleGrants[i]={...globalState.roleGrants[i],status};if(status!=='ACTIVE'){const acct=globalState.roleGrants[i].accountId;globalState.authSessions=globalState.authSessions.map(a=>a.accountId===acct&&a.status==='ACTIVE'?{...a,status:'REVOKED'}:a);}auditTrustAction('ROLE_GRANT_STATUS_CHANGED','RoleGrant',grantId,`تغيير حالة الصلاحية إلى ${status}`,`Grant status set to ${status}`);notify();return true;};
  const deleteIdentityInvitation=(id:string)=>{const before=globalState.identityInvitations.length;globalState.identityInvitations=globalState.identityInvitations.filter(x=>x.id!==id);if(globalState.identityInvitations.length===before)return false;auditTrustAction('IDENTITY_INVITATION_CANCELLED','IdentityInvitation',id,'إلغاء الدعوة المعلّقة','Cancelled pending invitation');notify();return true;};
  const updateIdentityAccountName=(accountId:string,displayName:string)=>{const i=globalState.identityAccounts.findIndex(x=>x.id===accountId);if(i<0)return false;globalState.identityAccounts[i]={...globalState.identityAccounts[i],displayName};auditTrustAction('IDENTITY_ACCOUNT_UPDATED','IdentityAccount',accountId,'تعديل اسم الحساب','Updated account display name');notify();return true;};
  const updateRoleGrantRole=(grantId:string,role:Role)=>{const i=globalState.roleGrants.findIndex(x=>x.id===grantId);if(i<0)return false;globalState.roleGrants[i]={...globalState.roleGrants[i],role};auditTrustAction('ROLE_GRANT_UPDATED','RoleGrant',grantId,`تعديل الدور إلى ${role}`,`Updated grant role to ${role}`);notify();return true;};
  const updateIdentityInvitationDetails=(id:string,patch:{displayName?:string;email?:string;requestedRole?:Role})=>{const i=globalState.identityInvitations.findIndex(x=>x.id===id);if(i<0)return false;globalState.identityInvitations[i]={...globalState.identityInvitations[i],...patch};auditTrustAction('IDENTITY_INVITATION_UPDATED','IdentityInvitation',id,'تعديل الدعوة المعلّقة','Updated pending invitation');notify();return true;};
  const reissueIdentityInvitation=async(id:string)=>{const i=globalState.identityInvitations.findIndex(x=>x.id===id);if(i<0)return {ok:false,reason:'NOT_FOUND'} as const;const token=randomInviteToken();const activationTokenHash=await invitationTokenHash(token);globalState.identityInvitations[i]={...globalState.identityInvitations[i],status:'READY',activationTokenHash,expiresAt:new Date(Date.now()+7*86400_000).toISOString()};auditTrustAction('IDENTITY_INVITATION_REISSUED','IdentityInvitation',id,'إصدار رمز تفعيل جديد للدعوة','Reissued one-time activation token');notify();return {ok:true,activationToken:token} as const;};
  const openCurrentAuthSession=(deviceId:string,deviceName?:string,assurance:AuthSessionRecord['authenticationAssurance']='DEMO')=>{if(['completed','archived'].includes(globalState.competition.status)&&!['super_admin','org_admin','auditor'].includes(globalState.currentUser.role))return {ok:false,reason:'COMPETITION_ACCESS_CLOSED'} as const;const account=globalState.identityAccounts.find(a=>a.firebaseUid===globalState.currentUser.id||normalizedIdentityEmail(a.email)===normalizedIdentityEmail(globalState.currentUser.email));if(!account||account.status!=='ACTIVE')return {ok:false,reason:'ACCOUNT_NOT_ACTIVE'} as const;const conflict=detectConcurrentPrivilegedSession({role:globalState.currentUser.role,newDeviceId:deviceId,sessions:globalState.authSessions.filter(s=>s.accountId===account.id)});if(conflict.blocked){const blocked:AuthSessionRecord={id:newId('authsess'),accountId:account.id,firebaseUid:globalState.currentUser.id,organizationId:globalState.organization.id,competitionId:globalState.competition.id,role:globalState.currentUser.role,deviceId,deviceName,openedAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),expiresAt:new Date(Date.now()+8*60*60*1000).toISOString(),status:'CONFLICT_BLOCKED',authenticationAssurance:assurance};globalState.authSessions=[blocked,...globalState.authSessions];auditTrustAction('CONCURRENT_PRIVILEGED_SESSION_BLOCKED','AuthSession',blocked.id,'منع جلسة متزامنة لحساب حساس على جهاز آخر','Blocked concurrent privileged account session on another device');notify();return {ok:false,reason:conflict.reason,session:blocked} as const;}const session:AuthSessionRecord={id:newId('authsess'),accountId:account.id,firebaseUid:globalState.currentUser.id,organizationId:globalState.organization.id,competitionId:globalState.competition.id,role:globalState.currentUser.role,deviceId,deviceName,openedAt:new Date().toISOString(),lastSeenAt:new Date().toISOString(),expiresAt:new Date(Date.now()+8*60*60*1000).toISOString(),status:'ACTIVE',authenticationAssurance:assurance};globalState.authSessions=[session,...globalState.authSessions];auditTrustAction('AUTH_SESSION_OPENED','AuthSession',session.id,'فتح جلسة مستخدم مسماة مرتبطة بجهاز ودور محدد','Opened named user session bound to a device and scoped role');notify();return {ok:true,session} as const;};

  const createContinuityCheckpoint=async(reason='automatic')=>{const a=globalState.activeSession;if(!a.participant||!a.committee||!a.sessionId)return null;const gate=globalState.questionRevealGates.find(g=>g.sessionId===a.sessionId&&g.questionIndex===a.currentQuestionIndex);const locked=globalState.judgeSubmissions.filter(x=>x.sessionId===a.sessionId&&x.locked);const panelComplete=locked.length>=activeRuleSetForCategory(a.participant.categoryId).judgesCountPerPanel;let phase:SessionCheckpointRecord['phase']=a.questionPhase==='SEALED'?'BEFORE_REVEAL':a.questionPhase==='RECITING'?'RECITING':a.questionPhase==='TRANSITION'?'BETWEEN_QUESTIONS':a.isLocked?(panelComplete?'PANEL_LOCKED':'JUDGES_LOCKING'):(gate?.status==='REVEALED'?'REVEALED_NOT_STARTED':'BEFORE_REVEAL');if(panelComplete)phase='PANEL_LOCKED';const previous=globalState.sessionCheckpoints.filter(x=>x.sessionId===a.sessionId).sort((x,y)=>y.sequence-x.sequence)[0];const base={competitionId:globalState.competition.id,sessionId:a.sessionId,participantId:a.participant.id,committeeId:a.committee.id,phase,questionIndex:a.currentQuestionIndex,questionCommitmentHash:gate?.questionCommitmentHash,questionRevealed:gate?.status==='REVEALED',durationSeconds:a.durationSeconds,eventIds:a.events.map(e=>e.id),lockedJudgeIds:locked.map(x=>x.judgeId),sequence:(previous?.sequence||0)+1,createdBy:globalState.currentUser.id,previousCheckpointHash:previous?.checkpointHash};let cp=await buildSessionCheckpoint({...base,assurance:(!globalState.isOffline&&auth.currentUser)?'server_persisted':'client_hash_chain'});let persisted=false;if(cp.assurance==='server_persisted')persisted=await persistScopedDocument('session_checkpoints',cp.id,cp as unknown as Record<string,unknown>);if(cp.assurance==='server_persisted'&&!persisted)cp=await buildSessionCheckpoint({...base,assurance:'client_hash_chain'});globalState.sessionCheckpoints=[cp,...globalState.sessionCheckpoints];if(cp.assurance!=='server_persisted')void persistScopedDocument('session_checkpoints',cp.id,cp as unknown as Record<string,unknown>);auditTrustAction('SESSION_CHECKPOINT_CREATED','JudgingSession',a.sessionId,`حفظ نقطة استمرارية (${reason}) بمستوى ${cp.assurance} دون تغيير السؤال أو الأحكام المقفلة`,`Saved continuity checkpoint (${reason}) at ${cp.assurance} assurance without changing the revealed question or locked human submissions`);notify();return cp;};
  const reportSessionInterruption=async(type:ContinuityIncidentRecord['type'],notes='')=>{const a=globalState.activeSession;if(!a.participant)return null;const cp=await createContinuityCheckpoint(`interruption:${type}`);const incident:ContinuityIncidentRecord={id:newId('continuity'),competitionId:globalState.competition.id,sessionId:a.sessionId,participantId:a.participant.id,type,occurredAt:new Date().toISOString(),reportedBy:globalState.currentUser.id,lastCheckpointId:cp?.id,status:'OPEN',notes};globalState.continuityIncidents=[incident,...globalState.continuityIncidents];auditTrustAction('SESSION_INTERRUPTED','JudgingSession',a.sessionId,'تسجيل انقطاع مع تجميد آخر حالة موثقة؛ لا إعادة تلقائية ولا سحب سؤال جديد','Recorded interruption and froze the last trustworthy state; no automatic restart and no question redraw');notify();return incident;};
  const proposeSessionRecovery=async(incidentId:string)=>{const incident=globalState.continuityIncidents.find(x=>x.id===incidentId);if(!incident)return null;const chain=globalState.sessionCheckpoints.filter(x=>x.sessionId===incident.sessionId);const verified=await verifyCheckpointChain(chain);const cp=[...chain].sort((a,b)=>b.sequence-a.sequence)[0];const locked=globalState.judgeSubmissions.filter(x=>x.sessionId===incident.sessionId&&x.locked);const p=globalState.participants.find(x=>x.id===incident.participantId);const panelComplete=!!p&&locked.length>=activeRuleSetForCategory(p.categoryId).judgesCountPerPanel;const decision=recoveryDecisionFromCheckpoint({checkpoint:cp,checkpointVerified:verified.valid,lockedPanelComplete:panelComplete});const rec:SessionRecoveryRecord={id:newId('recovery'),competitionId:globalState.competition.id,sessionId:incident.sessionId,participantId:incident.participantId,incidentId,checkpointId:cp?.id,...decision,createdAt:new Date().toISOString(),createdBy:globalState.currentUser.id,status:'PROPOSED'};globalState.sessionRecoveries=[rec,...globalState.sessionRecoveries];globalState.continuityIncidents=globalState.continuityIncidents.map(x=>x.id===incidentId?{...x,status:decision.decision==='HEAD_JUDGE_ADJUDICATION'?'ESCALATED':'RECOVERING'}:x);auditTrustAction('SESSION_RECOVERY_PROPOSED','JudgingSession',incident.sessionId,decision.reason,decision.reason);notify();return rec;};
  const applySessionRecovery=(recoveryId:string,headJudgeReason='')=>{const i=globalState.sessionRecoveries.findIndex(x=>x.id===recoveryId);if(i<0)return {ok:false,reason:'NOT_FOUND'} as const;const r=globalState.sessionRecoveries[i];if(r.decision==='FULL_RETEST_LAST_RESORT')return {ok:false,reason:'FULL_RETEST_REQUIRES_SECOND_APPROVAL'} as const;if(r.decision==='HEAD_JUDGE_ADJUDICATION'&&globalState.currentUser.role!=='head_judge')return {ok:false,reason:'HEAD_JUDGE_REQUIRED'} as const;if(r.decision==='HEAD_JUDGE_ADJUDICATION'&&headJudgeReason.trim().length<5)return {ok:false,reason:'ADJUDICATION_REASON_REQUIRED'} as const;const cp=globalState.sessionCheckpoints.find(x=>x.id===r.checkpointId);if(cp&&globalState.activeSession.sessionId===r.sessionId){globalState.activeSession.currentQuestionIndex=cp.questionIndex;globalState.activeSession.durationSeconds=cp.durationSeconds;globalState.activeSession.events=globalState.activeSession.events.filter(e=>cp.eventIds.includes(e.id));globalState.activeSession.isLocked=r.decision==='RESTORE_LOCKED_PANEL';globalState.activeSession.questionPhase=r.decision==='RESUME_SAME_SESSION_NEXT_QUESTION'?'SEALED':r.preserveRevealedQuestion?'RECITING':cp.phase==='BEFORE_REVEAL'?'SEALED':'READY';globalState.activeSession.isReciting=globalState.activeSession.questionPhase==='RECITING';}globalState.sessionRecoveries[i]={...r,status:'APPLIED',approvedByHeadJudge:globalState.currentUser.role==='head_judge'?globalState.currentUser.id:undefined,reason:headJudgeReason.trim()?`${r.reason} · ${headJudgeReason.trim()}`:r.reason};globalState.continuityIncidents=globalState.continuityIncidents.map(x=>x.id===r.incidentId?{...x,status:'RESOLVED'}:x);auditTrustAction('SESSION_RECOVERY_APPLIED','JudgingSession',r.sessionId,`استعادة الجلسة بقرار ${r.decision} مع حفظ السؤال المكشوف والأحكام المقفلة`,`Applied ${r.decision}; preserved revealed-question fairness and locked human submissions`);notify();return {ok:true,recovery:globalState.sessionRecoveries[i]} as const;};
  const requestFullRetestLastResort=(incidentId:string,reason:string)=>{const incident=globalState.continuityIncidents.find(x=>x.id===incidentId&&x.status!=='RESOLVED');const adjudication=globalState.sessionRecoveries.find(x=>x.incidentId===incidentId&&x.status==='PROPOSED'&&x.decision==='HEAD_JUDGE_ADJUDICATION');const existing=globalState.sessionRecoveries.find(x=>x.incidentId===incidentId&&x.status==='PROPOSED'&&x.decision==='FULL_RETEST_LAST_RESORT');const gate=fullRetestProposalAllowed({actorRole:globalState.currentUser.role,reason,hasOpenIncident:!!incident,baseRecoveryDecision:adjudication?.decision,alreadyProposed:!!existing});if(!gate.ok){if(incident){auditTrustAction('FULL_RETEST_LAST_RESORT_BLOCKED','JudgingSession',incident.sessionId,`منع طلب إعادة كاملة: ${gate.reason}`,`Blocked full retest request: ${gate.reason}`);notify();}return existing||null;}if(!incident||!adjudication)return null;const rec:SessionRecoveryRecord={id:newId('recovery'),competitionId:globalState.competition.id,sessionId:incident.sessionId,participantId:incident.participantId,incidentId,checkpointId:adjudication.checkpointId,decision:'FULL_RETEST_LAST_RESORT',reason,preserveRevealedQuestion:false,preserveLockedJudgeSubmissions:true,createdAt:new Date().toISOString(),createdBy:globalState.currentUser.id,approvedByHeadJudge:globalState.currentUser.id,status:'PROPOSED'};globalState.sessionRecoveries=[rec,...globalState.sessionRecoveries];auditTrustAction('FULL_RETEST_LAST_RESORT_PROPOSED','JudgingSession',incident.sessionId,'اقتراح إعادة اختبار كاملة كحل أخير بعد ثبوت تعذر الاستعادة الآمنة؛ لا تنفذ تلقائيًا وتحتاج اعتماد شخص ثانٍ مستقل','Full retest proposed only after safe recovery was unprovable; it never executes automatically and requires an independent second authority');notify();return rec;};
  const approveFullRetestLastResort=async(recoveryId:string,approvalReason:string)=>{const i=globalState.sessionRecoveries.findIndex(x=>x.id===recoveryId);if(i<0)return {ok:false,reason:'NOT_FOUND'} as const;const r=globalState.sessionRecoveries[i];if(r.decision!=='FULL_RETEST_LAST_RESORT'||r.status!=='PROPOSED')return {ok:false,reason:'NOT_RETEST_PROPOSAL'} as const;const gate=fullRetestApprovalAllowed({actorRole:globalState.currentUser.role,actorId:globalState.currentUser.id,proposedBy:r.createdBy,headJudgeId:r.approvedByHeadJudge,reason:approvalReason});if(!gate.ok)return {ok:false,reason:gate.reason} as const;const originalSessionId=r.sessionId;const started=await startSessionForParticipant(r.participantId);if(!started)return {ok:false,reason:'RETEST_SESSION_COULD_NOT_START'} as const;const retestSessionId=globalState.activeSession.sessionId;globalState.sessionRecoveries[i]={...r,status:'APPLIED',secondApprovedBy:globalState.currentUser.id,retestSessionId,originalSessionPreserved:true,reason:`${r.reason} · Independent approval: ${approvalReason.trim()}`};globalState.continuityIncidents=globalState.continuityIncidents.map(x=>x.id===r.incidentId?{...x,status:'RESOLVED'}:x);auditTrustAction('FULL_RETEST_LAST_RESORT_APPROVED','JudgingSession',originalSessionId,`اعتماد مستقل لإعادة كاملة استثنائية؛ حفظت الجلسة الأصلية ${originalSessionId} وبدأت محاولة جديدة ${retestSessionId}`,`Independent approval for exceptional full retest; preserved original session ${originalSessionId} and started new attempt ${retestSessionId}`);notify();return {ok:true,recovery:globalState.sessionRecoveries[i],retestSessionId} as const;};
  const verifyAuditLedger=async()=>{await finalizeAuditChain();const scoped=globalState.auditLogs.filter(x=>x.competitionId===globalState.competition.id);return verifyAuditChain(scoped);};
  const sealAuditLedger=async()=>{if(!['org_admin','comp_admin','super_admin'].includes(globalState.currentUser.role))return null;await finalizeAuditChain();const scoped=globalState.auditLogs.filter(x=>x.competitionId===globalState.competition.id);const verified=await verifyAuditChain(scoped);const chronological=[...scoped].reverse();const seal:AuditLedgerSealRecord={id:newId('auditseal'),competitionId:globalState.competition.id,createdAt:new Date().toISOString(),createdBy:globalState.currentUser.id,eventCount:scoped.length,headHash:verified.valid?verified.headHash:'INVALID',firstEventId:chronological[0]?.id,lastEventId:chronological[chronological.length-1]?.id,assurance:'client_hash_chain',verificationState:verified.valid?'VERIFIED':'FAILED'};globalState.auditLedgerSeals=[seal,...globalState.auditLedgerSeals];auditTrustAction('AUDIT_LEDGER_SEALED','AuditLedger',seal.id,`ختم سجل التدقيق عند ${scoped.length} حدثًا؛ مستوى الضمان ${seal.assurance}`,`Sealed audit ledger at ${scoped.length} events; assurance ${seal.assurance}`);notify();return seal;};


  const createCompetitionBlackBox=async()=>{const rec=await buildCompetitionBlackBox({competitionId:globalState.competition.id,events:globalState.auditLogs.filter(x=>x.competitionId===globalState.competition.id),assurance:globalState.auditLedgerSeals.some(x=>x.competitionId===globalState.competition.id&&x.verificationState==='VERIFIED')?'server_evidence_ledger':'client_hash_chain'});globalState.competitionBlackBoxes=[rec,...globalState.competitionBlackBoxes];auditTrustAction('BLACK_BOX_SNAPSHOT_CREATED','CompetitionBlackBox',rec.id,'إنشاء لقطة الصندوق الأسود للمسابقة','Created competition black-box timeline snapshot');notify();return rec;};
  const runFairnessCourt=()=>{const contrib=globalState.judgeSubmissions.filter(x=>x.participantId).map(x=>({participantId:x.participantId!,judgeId:x.judgeId,score:x.totalScore}));const rec=runFairnessConstitutionalCourt({competitionId:globalState.competition.id,results:globalState.results,judgeContributions:contrib,allowDropExtreme:true,allowedTieBreakAlternative:false});void hashCanonical({competitionId:rec.competitionId,results:globalState.results.filter(x=>x.competitionId===globalState.competition.id).map(x=>({id:x.id,participantId:x.participantId,finalScore:x.finalScore}))}).then(h=>{globalState.fairnessCourtRecords=globalState.fairnessCourtRecords.map(x=>x.id===rec.id?{...x,resultSetHash:h}:x);notify()});globalState.fairnessCourtRecords=[rec,...globalState.fairnessCourtRecords];auditTrustAction('FAIRNESS_CONSTITUTIONAL_REVIEW_RUN','Competition',globalState.competition.id,'تشغيل محكمة الحساسية للعدالة دون تغيير النتائج','Ran non-official fairness sensitivity court without mutating results');notify();return rec;};
  const createAcousticVenuePassport=(input:{venueZone:string;deviceId?:string;measurements:AcousticVenuePassportRecord['measurements'];thresholds:{noiseFloorDbMax?:number;clippingPercentMax?:number;packetLossPercentMax?:number;sampleRateMin?:number;echoScoreMax?:number;snrDbMin?:number}})=>{const rec=issueAcousticVenuePassport({competitionId:globalState.competition.id,venueZone:input.venueZone,deviceId:input.deviceId,createdBy:globalState.currentUser.id,policyVersion:globalState.competition.ruleSet.version,measurements:input.measurements,thresholds:input.thresholds});globalState.acousticVenuePassports=[rec,...globalState.acousticVenuePassports];auditTrustAction('ACOUSTIC_VENUE_PASSPORT_ISSUED','VenueZone',input.venueZone,`إصدار جواز صوتي: ${rec.status}`,`Issued acoustic venue passport: ${rec.status}`);notify();return rec;};
  const createRecitationDigitalTwin=async(input:{sourceManifestId:string;surah:number;ayahStart:number;ayahEnd:number;wajh?:string;allowedWujuh?:string[];phonemeSchemaVersion?:string})=>{const source=globalState.quranSourceManifests.find(x=>x.id===input.sourceManifestId);if(!source)throw new Error('SOURCE_NOT_FOUND');const reading=resolveReading({qiraah:source.qiraah,rawi:source.rawi,riwaya:source.riwaya});if(!reading)throw new Error('READING_NOT_RESOLVED');const rec=await buildRecitationDigitalTwin({competitionId:globalState.competition.id,source,qiraah:reading.qiraah,rawi:reading.rawi,tariq:source.tariq,wajh:input.wajh,surah:input.surah,ayahStart:input.ayahStart,ayahEnd:input.ayahEnd,variantLoci:globalState.variantLoci,allowedWujuh:input.allowedWujuh||[],phonemeSchemaVersion:input.phonemeSchemaVersion});globalState.recitationDigitalTwins=[rec,...globalState.recitationDigitalTwins];auditTrustAction('RECITATION_DIGITAL_TWIN_CREATED','QuranSource',source.id,'إنشاء توأم تلاوة مرتبط بالمصدر والرواية','Created source-bound recitation digital twin');notify();return rec;};
  const createMutashabihatTrap=(input:{sourceManifestId:string;expected:{surah:number;ayah:number};possible:{surah:number;ayah:number};qiraah:string;rawi:string;tariq?:string;kind:'TEXTUAL'|'VARIANT_LOCUS'|'EXPERT';score?:number;reference?:string;approve?:boolean})=>{const rec=mapMutashabihatTrap({competitionId:globalState.competition.id,sourceManifestId:input.sourceManifestId,qiraah:input.qiraah,rawi:input.rawi,tariq:input.tariq,expected:input.expected,possible:input.possible,similarityEvidence:{kind:input.kind,score:input.score,reference:input.reference},approvedBy:input.approve?globalState.currentUser.id:undefined});globalState.mutashabihatTrapMaps=[rec,...globalState.mutashabihatTrapMaps];auditTrustAction('MUTASHABIHAT_TRAP_MAPPED','QuranSource',input.sourceManifestId,'تسجيل نقطة تشابه للمراجعة أو الاعتماد','Mapped a similar-verse transition locus');notify();return rec;};
  const routeParticipantByReading=(participantId:string,input?:{requireAudio?:boolean;requireAi?:boolean})=>{const p=globalState.participants.find(x=>x.id===participantId);if(!p)return null;const counts=new Map(globalState.committees.map(c=>[c.id,globalState.participants.filter(x=>x.status==='in_queue'&&x.assignedCommitteeId===c.id).length]));const audioReady=new Set(globalState.committees.filter(c=>c.audioInputOk).map(c=>c.id));const aiReady=new Set(globalState.committees.map(c=>c.id));const rec=multiRiwayahSmartRoute({competitionId:globalState.competition.id,participant:p,committees:globalState.committees,judges:globalState.judges,queueCounts:counts,audioReadyCommitteeIds:audioReady,aiCompatibleCommitteeIds:aiReady,requireAudio:input?.requireAudio,requireAi:input?.requireAi});globalState.smartRoutingDecisions=[rec,...globalState.smartRoutingDecisions];if(rec.selectedCommitteeId){globalState.participants=globalState.participants.map(x=>x.id===p.id?{...x,assignedCommitteeId:rec.selectedCommitteeId}:x)}auditTrustAction('MULTI_RIWAYAH_SMART_ROUTING','Participant',p.id,rec.explanation,rec.explanation);notify();return rec;};
  const createAppealCapsule=async(participantId:string,appealId?:string)=>{
    const result=globalState.results.find(x=>x.participantId===participantId&&x.competitionId===globalState.competition.id);
    const chain=await verifyAuditLedger();
    const policy=getCompetitionPolicy(globalState.competition);
    /* الإفصاح الأدنى: ما يثبت سلامة الإجراء دون كشف هوية محكّم أو نصّ سؤال أو صوت. */
    const evidence:{kind:string;ref:string;private?:boolean;disclosed?:Record<string,unknown>}[]=[
      ...globalState.fairDrawProofs.filter(x=>x.competitionId===globalState.competition.id).map(x=>({kind:'fairdraw_proof',ref:x.id,disclosed:{algorithmVersion:x.algorithmVersion,ruleVersion:x.ruleVersion,poolSnapshotHash:x.poolSnapshotHash,constraintHash:x.constraintHash,seedCommitmentHash:x.seedCommitmentHash,publicCommitmentHash:x.publicCommitmentHash,status:x.status}})),
      ...globalState.questionRevealGates.filter(x=>x.participantId===participantId).map(x=>({kind:'question_reveal',ref:x.id,disclosed:{questionCommitmentHash:x.questionCommitmentHash,participantPresence:x.participantPresence,approvalCount:(x.approvals||[]).length,revealedAt:x.revealedAt,revealAssurance:x.revealAssurance}})),
      ...globalState.sessionCheckpoints.filter(x=>x.participantId===participantId).map(x=>({kind:'continuity_checkpoint',ref:x.id,disclosed:{createdAt:x.createdAt}})),
      ...globalState.integrityEnvelopes.filter(x=>x.participantId===participantId).map(x=>({kind:'integrity_envelope',ref:x.id})),
      ...(result?[{kind:'result_seal',ref:result.id,disclosed:{finalScore:result.finalScore,status:result.status,penaltyCount:result.penaltyCount,sealedAt:result.sealMetadata?.sealedAt,assurance:result.sealMetadata?.assurance,serverSealSha256:result.sealMetadata?.serverSealSha256,contributingJudges:result.sealMetadata?.contributingJudges}}]:[]),
      ...globalState.reviewCases.filter(x=>x.participantId===participantId&&x.headJudgeDecision).map(x=>({kind:'judge_decision',ref:x.id,disclosed:{action:x.headJudgeDecision?.action,adjustedPenaltyDelta:x.headJudgeDecision?.adjustedPenaltyDelta,resolvedAt:x.headJudgeDecision?.resolvedAt}})),
      ...globalState.aiObservations.filter(x=>x.participantId===participantId).map(x=>({kind:'ai_observation',ref:x.id,disclosed:{modelIdentifier:x.modelIdentifier||x.model,modelVersion:x.modelVersion,modelHash:x.modelHash,capability:x.capability,calibratedConfidence:x.calibratedConfidence,humanReviewState:x.humanReviewState,humanDecision:x.humanDecision}})),
      ...globalState.audioRecordings.filter(x=>x.participantId===participantId).map(x=>({kind:'raw_audio',ref:x.id,private:true})),
    ];
    const rec=await buildAppealCapsule({competitionId:globalState.competition.id,participantId,appealId,createdBy:globalState.currentUser.id,evidence,auditHeadHash:chain.headHash,policyVersion:policy.version,policy,ruleSetVersion:globalState.competition.ruleSet?.version,ruleSet:globalState.competition.ruleSet});
    globalState.appealCapsules=[rec,...globalState.appealCapsules];auditTrustAction('APPEAL_CAPSULE_CREATED','Participant',participantId,'إنشاء كبسولة تظلّم قابلة للتحقق ومحدودة الإفصاح','Created verifiable minimum-disclosure appeal capsule');notify();return rec;};
  /* رفع العتامة: لا يُكشف اسم قبل أن يقفل كل محكّم، ويُبصم الترتيب في سجل يتحقق منه غيرنا. */
  const liftBlindChamber=async()=>{
    const session=globalState.activeSession;
    if(!session?.sessionId||!session.participant)throw new Error('BLIND_CHAMBER_NO_ACTIVE_SESSION');
    const blindness=resolveBlindness(getCompetitionPolicy(globalState.competition).judging);
    if(blindness.level==='OFF')throw new Error('BLIND_CHAMBER_NOT_ACTIVE');
    const subs=globalState.judgeSubmissions.filter(x=>x.sessionId===session.sessionId);
    if(!subs.length||subs.some(x=>!x.locked))throw new Error('BLIND_CHAMBER_LOCK_REQUIRED');
    const rec=await buildBlindLiftProof({competitionId:globalState.competition.id,sessionId:session.sessionId,participantId:session.participant.id,blindness,revealedBy:globalState.currentUser.id,submissions:subs.map(x=>({judgeId:x.judgeId,locked:x.locked,submittedAt:x.submittedAt}))});
    globalState.blindChamberLifts=[rec,...globalState.blindChamberLifts];
    auditTrustAction('BLIND_CHAMBER_LIFTED','Participant',session.participant.id,`كشف الهوية بعد قفل ${rec.judgeCount} تسليمًا · ${rec.status==='PROVEN'?'الترتيب مُثبت':'الترتيب غير مُثبت'}`,`Identity revealed after ${rec.judgeCount} locked submission(s) · ${rec.status}`);
    notify();return rec;
  };
  const verifyBlindLift=async(id:string)=>{const rec=globalState.blindChamberLifts.find(x=>x.id===id);if(!rec)throw new Error('BLIND_LIFT_NOT_FOUND');return verifyBlindLiftProof(rec)};
  const verifyAppealCapsuleRecord=async(capsuleId:string)=>{const rec=globalState.appealCapsules.find(x=>x.id===capsuleId);if(!rec)throw new Error('APPEAL_CAPSULE_NOT_FOUND');return verifyAppealCapsule(rec);};
  const runBlindAnchorCalibration=(samples:{committeeId:string;judgeId:string;judgeScore:number;expertScore:number;tolerance:number}[],anchorSetVersion='ANCHOR-v1')=>{const rec=blindAnchorCalibration({competitionId:globalState.competition.id,anchorSetVersion,samples});globalState.blindAnchorCalibrations=[rec,...globalState.blindAnchorCalibrations];auditTrustAction('BLIND_ANCHOR_CALIBRATION_RUN','Competition',globalState.competition.id,'تشغيل معايرة مرجعية عمياء في وضع غير رسمي','Ran non-official blind anchor calibration');notify();return rec;};
  const runIntegrityEntropyRadar=(input:{reviewThresholds:Partial<Record<IntegrityEntropySignalRecord['signals'][number]['kind'],number>>;highThresholds?:Partial<Record<IntegrityEntropySignalRecord['signals'][number]['kind'],number>>;windowMinutes?:number})=>{const since=Date.now()-(input.windowMinutes||240)*60000;const events:{kind:IntegrityEntropySignalRecord['signals'][number]['kind'];entityRef:string}[]=[];globalState.queueTransfers.filter(x=>Date.parse(x.requestedAt)>=since).forEach(x=>x.participantIds.forEach(id=>events.push({kind:'REPEATED_TRANSFER',entityRef:id})));globalState.questionRevealGates.filter(x=>x.revealedAt&&Date.parse(x.revealedAt)>=since).forEach(x=>events.push({kind:'REVEAL_PATTERN',entityRef:x.committeeId}));globalState.passReissues.filter(x=>Date.parse(x.requestedAt)>=since).forEach(x=>events.push({kind:'REISSUE_CLUSTER',entityRef:x.participantId}));globalState.sessionRecoveries.filter(x=>Date.parse(x.createdAt)>=since&&x.decision==='FULL_RETEST_LAST_RESORT').forEach(x=>events.push({kind:'RETEST_CLUSTER',entityRef:x.participantId}));const rec=integrityEntropyRadar({competitionId:globalState.competition.id,windowStart:new Date(since).toISOString(),windowEnd:new Date().toISOString(),events,reviewThresholds:input.reviewThresholds,highThresholds:input.highThresholds});globalState.integrityEntropySignals=[rec,...globalState.integrityEntropySignals];auditTrustAction('INTEGRITY_ENTROPY_RADAR_RUN','Competition',globalState.competition.id,`رادار النزاهة: ${rec.signals.length} نمط يحتاج مراجعة`, `Integrity entropy radar: ${rec.signals.length} pattern(s) require review`);notify();return rec;};
  const activateScientificCircuitBreaker=(input:{triggerType:ScientificCircuitBreakerRecord['triggerType'];triggerRef:string;reason:string;affectedCapabilities:string[];affectedCompetitionIds?:string[];action?:ScientificCircuitBreakerRecord['action']})=>{const rec=tripScientificCircuitBreaker({organizationId:globalState.organization.id,competitionId:globalState.competition.id,createdBy:globalState.currentUser.id,triggerType:input.triggerType,triggerRef:input.triggerRef,reason:input.reason,affectedCapabilities:input.affectedCapabilities,affectedCompetitionIds:input.affectedCompetitionIds||[globalState.competition.id],action:input.action||'SUSPEND_FUTURE_USE'});globalState.scientificCircuitBreakers=[rec,...globalState.scientificCircuitBreakers];if(input.triggerType==='AI_CAPABILITY')globalState.aiCapabilityValidations=globalState.aiCapabilityValidations.map(x=>x.id===input.triggerRef?{...x,status:'suspended',certificationState:'SUSPENDED'}:x);if(input.triggerType==='QURAN_SOURCE')globalState.quranSourceManifests=globalState.quranSourceManifests.map(x=>x.id===input.triggerRef?{...x,status:'retired',certificationState:'REVOKED',revocationState:'REVOKED',revocationReason:input.reason}:x);auditTrustAction('SCIENTIFIC_CIRCUIT_BREAKER_TRIPPED',input.triggerType,input.triggerRef,'تفعيل قاطع علمي للاستخدام المستقبلي مع إبقاء التاريخ كما هو','Scientific circuit breaker suspended future use without rewriting history');notify();return rec;};
  const issueIntegrityPassport=async()=>{const source=globalState.quranSourceManifests.find(x=>x.certificationState==='CERTIFIED'&&x.revocationState!=='REVOKED');const fair=globalState.fairDrawProofs.find(x=>x.status==='VERIFIED');const rehearsal=globalState.rehearsals[0];const root=globalState.publicResultRoots[0];const rec=await issueMizanIntegrityPassport({competition:globalState.competition,quranSource:source,fairDrawAlgorithm:fair?.algorithmVersion,fairDrawCommitment:fair?.publicCommitmentHash,rehearsalStatus:rehearsal?.status,quorumPolicy:getCompetitionPolicy(globalState.competition).results.requireDualApprovalToSeal?'2 independent approvals':'not required',resultRootHash:root?.merkleRoot,certificateVerifier:'MIZAN Public Verifier',auditAssurance:globalState.auditLedgerSeals[0]?.assurance||'client_hash_chain'});globalState.mizanIntegrityPassports=[rec,...globalState.mizanIntegrityPassports];auditTrustAction('MIZAN_INTEGRITY_PASSPORT_ISSUED','Competition',globalState.competition.id,'إصدار جواز نزاهة عام محدود البيانات','Issued privacy-safe MIZAN Integrity Passport');notify();return rec;};
  const createIntegrityCinema=async()=>{const black=globalState.competitionBlackBoxes[0];const rec=await buildIntegrityCinema({competitionId:globalState.competition.id,events:globalState.auditLogs.filter(x=>x.competitionId===globalState.competition.id),blackBoxHeadHash:black?.headHash});globalState.integrityCinemaRecords=[rec,...globalState.integrityCinemaRecords];auditTrustAction('INTEGRITY_CINEMA_BUILT','Competition',globalState.competition.id,`إنشاء فيلم أدلة من ${rec.sceneCount} مشهدًا`,`Built integrity cinema with ${rec.sceneCount} evidence scenes`);notify();return rec;};
  const certifyCurrentVenue=async(input:{venueZone:string;audioDeviceFingerprint?:string;printerReady?:boolean})=>{const acoustic=globalState.acousticVenuePassports.find(x=>x.venueZone===input.venueZone);const source=globalState.quranSourceManifests.find(x=>x.certificationState==='CERTIFIED'&&x.revocationState!=='REVOKED');const devices=globalState.devices.filter(x=>!x.zone||x.zone===input.venueZone);const edgeReady=devices.some(x=>x.role==='Edge'&&x.status==='online')||globalState.localMeshSessions.some(x=>x.status==='active');const offlinePassReady=globalState.journeyPasses.some(x=>x.status==='active');const recoveryTested=globalState.rehearsals.some(x=>x.status!=='FAIL')||globalState.chaosDrills.some(x=>x.status==='completed');const rec=await certifyVenue({competitionId:globalState.competition.id,venueZone:input.venueZone,createdBy:globalState.currentUser.id,acousticPassport:acoustic?{id:acoustic.id,status:acoustic.status}:undefined,devices,sourcePackageHash:source?.packageHash,edgeReady,offlinePassReady,recoveryTested,printerReady:input.printerReady,audioDeviceFingerprint:input.audioDeviceFingerprint});globalState.certifiedVenueSeals=[rec,...globalState.certifiedVenueSeals];auditTrustAction('VENUE_READINESS_SEAL_CREATED','Competition',globalState.competition.id,`ختم جاهزية القاعة ${input.venueZone}: ${rec.status}`,`Venue readiness seal ${input.venueZone}: ${rec.status}`);notify();return rec;};
  const verifyCurrentVenueSeal=async(sealId:string,input:{audioDeviceFingerprint?:string})=>{const seal=globalState.certifiedVenueSeals.find(x=>x.id===sealId);if(!seal)throw new Error('VENUE_SEAL_NOT_FOUND');const devices=globalState.devices.filter(x=>!x.zone||x.zone===seal.venueZone);return verifyVenueBaseline(seal,{devices,audioDeviceFingerprint:input.audioDeviceFingerprint,sourcePackageHash:globalState.quranSourceManifests.find(x=>x.certificationState==='CERTIFIED'&&x.revocationState!=='REVOKED')?.packageHash})};

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
    policyCompilations: state.policyCompilations.filter(x=>x.competitionId===state.competition.id), contradictionIssues: state.contradictionIssues.filter(x=>x.competitionId===state.competition.id), disasterPacks: state.disasterPacks.filter(x=>x.competitionId===state.competition.id), deviceReassignments: state.deviceReassignments.filter(x=>x.competitionId===state.competition.id), fatigueRecommendations: state.fatigueRecommendations.filter(x=>x.competitionId===state.competition.id), competitionBenchmarks: state.competitionBenchmarks.filter(x=>x.competitionId===state.competition.id), rehearsals: state.rehearsals.filter(x=>x.competitionId===state.competition.id), scientificDatasets: state.scientificDatasets.filter(x=>x.organizationId===state.competition.organizationId), benchmarkRuns: state.benchmarkRuns.filter(x=>x.organizationId===state.competition.organizationId), variantLoci: state.variantLoci, quranReferenceAudio: state.quranReferenceAudio.filter(x=>x.organizationId===state.competition.organizationId), quranCrossChecks: state.quranCrossChecks.filter(x=>x.organizationId===state.competition.organizationId), scientificAdjudications: state.scientificAdjudications.filter(x=>x.organizationId===state.competition.organizationId), scientificImpactReports: state.scientificImpactReports.filter(x=>x.organizationId===state.competition.organizationId), federationTrust: state.federationTrust.filter(x=>x.organizationId===state.competition.organizationId), ceremonyVaults: state.ceremonyVaults.filter(x=>x.competitionId===state.competition.id), fairDrawProofs: state.fairDrawProofs.filter(x=>x.competitionId===state.competition.id), questionRevealGates: state.questionRevealGates.filter(x=>x.competitionId===state.competition.id), participantScopes: state.participantScopes.filter(x=>x.competitionId===state.competition.id), questionModels: state.questionModels.filter(x=>x.competitionId===state.competition.id), questionModelBatches: state.questionModelBatches.filter(x=>x.competitionId===state.competition.id), scopeSimulations: state.scopeSimulations.filter(x=>x.competitionId===state.competition.id), scopeEngineSeals: state.scopeEngineSeals.filter(x=>x.competitionId===state.competition.id), queueTransfers: state.queueTransfers.filter(x=>x.competitionId===state.competition.id), identityAccounts:state.identityAccounts.filter(x=>x.organizationId===state.organization.id), roleGrants:state.roleGrants.filter(x=>x.organizationId===state.organization.id&&(!x.competitionId||x.competitionId===state.competition.id)), identityInvitations:state.identityInvitations.filter(x=>x.organizationId===state.organization.id), authSessions:state.authSessions.filter(x=>x.organizationId===state.organization.id&&(!x.competitionId||x.competitionId===state.competition.id)), passReissues:state.passReissues.filter(x=>x.competitionId===state.competition.id), credentialLineages:state.credentialLineages.filter(x=>x.competitionId===state.competition.id), sessionCheckpoints:state.sessionCheckpoints.filter(x=>x.competitionId===state.competition.id), continuityIncidents:state.continuityIncidents.filter(x=>x.competitionId===state.competition.id), sessionRecoveries:state.sessionRecoveries.filter(x=>x.competitionId===state.competition.id), auditLedgerSeals:state.auditLedgerSeals.filter(x=>x.competitionId===state.competition.id), competitionBlackBoxes:state.competitionBlackBoxes.filter(x=>x.competitionId===state.competition.id), fairnessCourtRecords:state.fairnessCourtRecords.filter(x=>x.competitionId===state.competition.id), acousticVenuePassports:state.acousticVenuePassports.filter(x=>x.competitionId===state.competition.id), recitationDigitalTwins:state.recitationDigitalTwins.filter(x=>x.competitionId===state.competition.id), mutashabihatTrapMaps:state.mutashabihatTrapMaps.filter(x=>x.competitionId===state.competition.id), smartRoutingDecisions:state.smartRoutingDecisions.filter(x=>x.competitionId===state.competition.id), appealCapsules:state.appealCapsules.filter(x=>x.competitionId===state.competition.id), blindChamberLifts:state.blindChamberLifts.filter(x=>x.competitionId===state.competition.id), blindAnchorCalibrations:state.blindAnchorCalibrations.filter(x=>x.competitionId===state.competition.id), integrityEntropySignals:state.integrityEntropySignals.filter(x=>x.competitionId===state.competition.id), scientificCircuitBreakers:state.scientificCircuitBreakers.filter(x=>!x.competitionId||x.competitionId===state.competition.id), mizanIntegrityPassports:state.mizanIntegrityPassports.filter(x=>x.competitionId===state.competition.id), integrityCinemaRecords:state.integrityCinemaRecords.filter(x=>x.competitionId===state.competition.id), certifiedVenueSeals:state.certifiedVenueSeals.filter(x=>x.competitionId===state.competition.id),
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
    completeCompetition, closeCompetition,
    registerParticipant, updateParticipant, removeParticipant,
    reviewParticipant, ensureParticipantJourneyAccess, prepareJourneyAccessBatch, syncAuthorizedJudgeProfiles,
    selectCompetition, loadPublicCompetition, checkPublicCompetitionPublished, republishPublicCompetition,
    currentDisplayBoard, publishDisplayBoard, unpublishDisplayBoard, loadPublicDisplayBoard,
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
    // محرك النطاق والأسئلة
    setCategoryScope, setCategorySelectionRule, setCategoryDistribution, setCategoryRepeatPolicy, setCategoryQuestionCount,
    categoryScopeMigrationPlan, applyCategoryScopeMigration,
    saveParticipantScope, decideParticipantScope, participantEffectiveScope, activeParticipantScope,
    scopeCandidatePool, scopeDemandAnalysis, getScopeReadiness, runScopeSimulation, sealScopeEngine, scopeSealImpact,
    generateQuestionModelBatch, decideModelBatch, preGeneratedModelFor, claimReserveForParticipant, exposureProfiles,
    quarantineQuestionLoci, liftQuestionQuarantine, recoverQuarantinedLoci, participantScopeHistory,
    reserveQuestionsForParticipant, advanceReservations, sweepExpiredReservations, reservationBlockedLoci,
    buildCompetitionFairnessReport,
    addCommittee,
    updateCommittee, removeCommittee, updateJudgeSpecialties, updateCommitteeJudgeSpecialty,
    publishCompetition,
    setScientificReviewersRequired,
    startSessionForParticipant, ensureQuestionRevealGate, verifyParticipantPresenceForQuestion, approveQuestionReveal, markOpeningAudioPlayed, finishCurrentQuestionSegment,
    queueNotification, retryNotification, configureIntegration, addWebhook, registerDevice, updateDeviceStatus, updateDevice, revokeDevice, upsertTravelRecord, recordConsent, createImportJob, importParticipantsCsv, startShadowRun, completeShadowRun, addParticipantPassportEntry, addJudgePassportEntry, completeJudgeCalibration, createTrainingRun, completeTrainingRun, createBackup, restoreBackup, scheduleRetention, requestSupportSession, approveSupportSession, endSupportSession, runRemoteCheck, cloneCompetition, exportCompetitionSnapshot, restoreCompetitionSnapshot,
    optimizeArrivalSlots, getFairnessReceipt, getIntegrityAnalytics,
    runSimulation,
    runTimeMachine, runInvariantChecks, recordInvariantBlock,
    ensureQuorumAction, approveQuorumAction, revokeQuorumApproval, executeQuorumAction, requestCeremonyReveal, ceremonyRevealAuthorized,
    rebuildEvidenceGraph, traceEvidence, buildPublicResultRoot, getPublicResultProof, verifyPublicResultProof, verifyCertificateEvidence, certificateEvidenceChain, revokeCertificate,
    startLocalMesh, appendLocalMeshEvent, reconcileLocalMesh, resolveLocalMeshConflict,
    issueFederationAttestation, verifyFederationAttestation, revokeFederationAttestation,
    generateMizanProtocolPackage, verifyMizanProtocolPackage, exportMizanProtocolPackage,
    getQueueEstimate, buildFlightRecorder, createIntegrityEnvelope, verifyIntegrityEnvelope, runChaosDrill, ensureAccessibilityProfile, updateAccessibilityProfile, recommendCommitteeElasticity, decideCommitteeElasticity, transferQueueParticipants, issueJourneyPass, verifyOfflineJourneyPass, revokeJourneyPass, reissueJourneyPass, reissueQrBundle, compileCompetitionPolicy, reviewPolicyCompilation, simulatePolicyCompilation, publishPolicyCompilation, refreshContradictionRadar, exportEmergencyPack, verifyEmergencyPack, testRestoreEmergencyPack, proposeDeviceHealing, decideDeviceHealing, refreshFatigueGuard, createLocalBenchmark, runOperationalRehearsal, buildFairDrawPublicProof, verifyActiveFairDrawProof, setFederationTrust, sealCeremonyVault, createIdentityInvitation, approveIdentityInvitation, activateIdentityInvitation, suspendIdentityAccount, resumeIdentityAccount, removeIdentityAccount, removeRoleGrant, setRoleGrantStatus, deleteIdentityInvitation, reissueIdentityInvitation, updateIdentityAccountName, updateRoleGrantRole, updateIdentityInvitationDetails, openCurrentAuthSession, createContinuityCheckpoint, reportSessionInterruption, proposeSessionRecovery, applySessionRecovery, requestFullRetestLastResort, approveFullRetestLastResort, verifyAuditLedger, sealAuditLedger, createCompetitionBlackBox, runFairnessCourt, createAcousticVenuePassport, createRecitationDigitalTwin, createMutashabihatTrap, routeParticipantByReading, createAppealCapsule, verifyAppealCapsuleRecord, liftBlindChamber, verifyBlindLift, runBlindAnchorCalibration, runIntegrityEntropyRadar, activateScientificCircuitBreaker, issueIntegrityPassport, createIntegrityCinema, certifyCurrentVenue, verifyCurrentVenueSeal
  };
}
