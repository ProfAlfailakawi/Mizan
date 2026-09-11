// MIZAN — canonical shape of the local runtime store.
//
// This interface was extracted from store.ts so the store's *shape* can be read, reviewed and
// diffed on its own, apart from the ~1,900 lines of behaviour. It is intentionally the single
// source of truth for what MIZAN keeps in local state; store.ts imports it and nothing here
// carries logic. Grouping is by domain to keep the surface navigable.
import type { QueueWaitSample, SessionTempoSample } from './session-tempo';
import {
  User, Role, Organization, Competition, Participant, Committee, JudgeProfile, ResultRecord,
  ReviewCase, AIObservation, Certificate, AuditEvent, JudgeSubmission, IncidentRecord,
  AppealRecord, IntegrationConfig, NotificationRecord, WebhookSubscription, DeviceRecord,
  DelegationTravelRecord, ConsentRecord, ImportJobRecord, ShadowRun, ParticipantPassportEntry,
  JudgePassportEntry, TrainingRun, BackupRecord, RetentionJob, SupportSession, RemoteSessionCheck,
  AudioRecordingRecord, FeatureFlagRecord, QuranSourceManifestRecord, QuestionGovernanceRecord,
  AICapabilityValidationRecord, OperatingCostModel, TimeMachineScenarioRecord, QuorumActionRecord,
  InvariantViolationRecord, ScientificEvidenceNode, ScientificEvidenceEdge, PublicResultRootRecord,
  PublicResultProofRecord, LocalMeshSessionRecord, FederationAttestationRecord,
  MizanProtocolPackageRecord, FlightRecorderEntry, IntegrityEnvelopeRecord, ChaosDrillRecord,
  AccessibilityProfileRecord, CommitteeElasticityRecommendation, JourneyPassRecord,
  PolicyCompilationRecord, ContradictionIssueRecord, DisasterPackRecord, DeviceReassignmentRecord,
  JudgeFatigueRecommendationRecord, CompetitionBenchmarkRecord, RehearsalRecord,
  ScientificDatasetRecord, BenchmarkRunRecord, VariantLocusRecord, QuranReferenceAudioRecord,
  FederationTrustRecord, CeremonyVaultRecord, FairDrawProofRecord, QuranSourceContentRecord,
  QuranCrossCheckRecord, ScientificAdjudicationCaseRecord, ScientificImpactReportRecord,
  QuestionRevealGateRecord, QueueTransferRecord, IdentityAccountRecord, RoleGrantRecord,
  IdentityInvitationRecord, AuthSessionRecord, PassReissueRecord, ParticipantCredentialLineageRecord,
  SessionCheckpointRecord, ContinuityIncidentRecord, SessionRecoveryRecord, AuditLedgerSealRecord,
  CompetitionBlackBoxRecord, FairnessConstitutionalCourtRecord, AcousticVenuePassportRecord,
  RecitationDigitalTwinRecord, MutashabihatTrapRecord, MultiRiwayahRoutingDecisionRecord,
  AppealCapsuleRecord, BlindChamberLiftRecord, BlindAnchorCalibrationRecord, IntegrityEntropySignalRecord,
  ScientificCircuitBreakerRecord, MizanIntegrityPassportRecord, IntegrityCinemaRecord,
  CertifiedVenueSealRecord, QuestionSelection, JudgeEvent,
  ParticipantScopeRecord, QuestionModelRecord, QuestionModelBatchRecord, ScopeSimulationRecord, ScopeEngineSealRecord,
  QuestionQuarantineRecord, QuestionReservationRecord, FairnessReportRecord,
} from '../types';
import { SupportedLanguage } from './i18n';

/** The active JudgeOS session held in local state (one participant in front of one panel). */
export interface ActiveSessionState {
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
  questionPhase?: 'SEALED' | 'READY' | 'RECITING' | 'TRANSITION';
  openingAudioRefId?: string;
  openingAudioPlayedAt?: string;
  secureQuestionMode?: 'SERVER' | 'CLIENT';
  secureRuntimeSessionId?: string;
  secureQuestionCount?: number;
}

export interface AppStoreState {
  // Identity & tenancy
  currentUser: User;
  organization: Organization;
  /** سبب رفض آخر محاولة اعتماد علمي — ليُقال للمستخدم بدل أن يبتلع الزرّ الرفض. */
  lastScientificCertificationError?: { sourceId:string; reviewers:number; required:number; errors:string[] };
  organizations: Organization[];
  language: SupportedLanguage;
  competition: Competition;
  competitions: Competition[];
  /** آخر تعديل محلي على إعداد المسابقة؛ يمنع snapshot سحابيًا أقدم من مسح حفظ أحدث. */
  competitionConfigUpdatedAt?: string;
  // Core competition entities
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
  // Runtime flags
  isOffline: boolean;
  emergencyFrozen: boolean;
  /** Set when a local snapshot write fails (e.g. storage quota exceeded) so the UI can warn instead of losing data silently. */
  /* عطل حفظ ظاهر للمشغّل: محليًا (حصة التخزين) أو سحابيًا (صلاحية، حجم، فشل كتابة).
     العطل الصامت في منتصف مسابقة أسوأ من العطل نفسه. */
  persistenceError?: { code: 'QUOTA_EXCEEDED' | 'WRITE_FAILED' | 'CLOUD_WRITE_FAILED' | 'CLOUD_PAYLOAD_TOO_LARGE' | 'CLOUD_PERMISSION_DENIED'; message: string; at: string } | null;
  sealApprovals: { actorId: string; actorRole: Role; actorName: string; timestamp: string }[];
  // Platform / operations
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
  // Scientific governance
  quranSourceManifests: QuranSourceManifestRecord[];
  quranSourceContents: QuranSourceContentRecord[];
  questionGovernance: QuestionGovernanceRecord[];
  aiCapabilityValidations: AICapabilityValidationRecord[];
  operatingCostModel: OperatingCostModel;
  // Trust & integrity layer
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
  questionRevealGates: QuestionRevealGateRecord[];
  // ---- محرك النطاق والأسئلة ----
  /** نطاق كل متسابق بدورة حياته ونسخه. النسخة السابقة تبقى superseded ولا تُحذف. */
  participantScopes: ParticipantScopeRecord[];
  /** نماذج الأسئلة المولَّدة (مسبقًا أو في وقتها) مع عدالتها وإثباتها. */
  questionModels: QuestionModelRecord[];
  questionModelBatches: QuestionModelBatchRecord[];
  /** نتائج المحاكاة المحفوظة — تقرير عدالة وتوزيع الأسئلة. */
  scopeSimulations: ScopeSimulationRecord[];
  /** تجميدات إعداد المحرك قبل المسابقة. */
  scopeEngineSeals: ScopeEngineSealRecord[];
  /** المواضع المحجورة بعد اكتشاف عيب فيها، وأثر كل حجر. */
  questionQuarantines: QuestionQuarantineRecord[];
  /** دورة حياة حجز الأسئلة: من حجز ماذا، ومتى ينقضي حجزه. */
  questionReservations: QuestionReservationRecord[];
  /** تقارير عدالة وتوزيع الأسئلة المصدَّرة. */
  fairnessReports: FairnessReportRecord[];
  queueTransfers: QueueTransferRecord[];
  // Identity governance
  identityAccounts: IdentityAccountRecord[];
  roleGrants: RoleGrantRecord[];
  identityInvitations: IdentityInvitationRecord[];
  authSessions: AuthSessionRecord[];
  passReissues: PassReissueRecord[];
  credentialLineages: ParticipantCredentialLineageRecord[];
  // Continuity
  sessionCheckpoints: SessionCheckpointRecord[];
  continuityIncidents: ContinuityIncidentRecord[];
  sessionRecoveries: SessionRecoveryRecord[];
  auditLedgerSeals: AuditLedgerSealRecord[];
  competitionBlackBoxes: CompetitionBlackBoxRecord[];
  // Global integrity protocol layer
  fairnessCourtRecords: FairnessConstitutionalCourtRecord[];
  acousticVenuePassports: AcousticVenuePassportRecord[];
  recitationDigitalTwins: RecitationDigitalTwinRecord[];
  mutashabihatTrapMaps: MutashabihatTrapRecord[];
  smartRoutingDecisions: MultiRiwayahRoutingDecisionRecord[];
  appealCapsules: AppealCapsuleRecord[];
  blindChamberLifts: BlindChamberLiftRecord[];
  blindAnchorCalibrations: BlindAnchorCalibrationRecord[];
  integrityEntropySignals: IntegrityEntropySignalRecord[];
  scientificCircuitBreakers: ScientificCircuitBreakerRecord[];
  mizanIntegrityPassports: MizanIntegrityPassportRecord[];
  integrityCinemaRecords: IntegrityCinemaRecord[];
  certifiedVenueSeals: CertifiedVenueSealRecord[];
  // Active JudgeOS session
  /**
   * ما استغرقته الجلسات فعلًا، لتتعلّم اللجنة إيقاعها بدل أن تبقى على قيمة الإعداد.
   * محدودةٌ بسقفٍ في المخزن: سجلٌّ بلا حدّ يُضخّم اللقطة المحفوظة على الجهاز.
   */
  sessionTempoSamples: SessionTempoSample[];
  /** ما وُعد به من انتظار وما وقع — فيُحاسَب التقدير بدل أن يَعِد ولا يُراجَع. */
  queueWaitSamples: QueueWaitSample[];
  activeSession: ActiveSessionState;
}

/** localStorage key for the persisted MIZAN runtime snapshot. */
export const STORAGE_KEY = 'mizan_os_store_v1';
