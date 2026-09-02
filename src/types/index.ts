export type Role =
  | 'super_admin'
  | 'org_admin'
  | 'comp_admin'
  | 'scientific_admin'
  | 'head_judge'
  | 'judge'
  | 'ops_manager'
  | 'exception_host'
  | 'delegation_manager'
  | 'participant'
  | 'broadcast_operator'
  | 'auditor'
  | 'guardian'
  | 'support_agent';

export interface User {
  id: string;
  name: string;
  nameArabic?: string;
  email: string;
  role: Role;
  organizationId: string;
  competitionId?: string;
  avatarUrl?: string;
  phone?: string;
  country?: string;
  mfaEnabled?: boolean;
  accountStatus?: 'invited'|'active'|'suspended'|'revoked';
  lastAuthenticatedAt?: string;
  identityAssurance?: 'demo'|'firebase'|'firebase_managed'|'federated_sso';
}

export interface OrganizationBrand {
  name: string;
  nameArabic: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  headerBackground?: string;
  subdomain?: string;
  customDomain?: string;
  emailSenderName?: string;
  emailSenderAddress?: string;
  certificateTheme?: 'quiet_authority'|'institutional'|'ceremonial';
}

export interface Organization {
  id: string;
  name: string;
  nameArabic: string;
  code: string;
  brand: OrganizationBrand;
  plan: 'enterprise' | 'ministry' | 'standard';
  dataResidency: string;
  status: 'active' | 'suspended';
  createdAt: string;
}


export interface FeatureFlagRecord {
  id: string;
  organizationId?: string;
  key: string;
  enabled: boolean;
  environment: 'development'|'staging'|'production';
  updatedAt: string;
}
export type AutomationLevel = 'assisted' | 'automated' | 'autopilot';

export type CompetitionStatus =
  | 'draft'
  | 'configured'
  | 'registration_open'
  | 'registration_closed'
  | 'live'
  | 'paused'
  | 'judging_complete'
  | 'results_sealed'
  | 'results_published'
  | 'completed'
  | 'archived';

export interface CriterionRule {
  id: string;
  name: string;
  nameArabic: string;
  maxScore: number;
  weight: number;
  description?: string;
  assignedJudgeType?: 'all' | 'memorization' | 'tajweed' | 'performance';
}

export interface PenaltyMapping {
  mistake: number;        // e.g., -0.5 or -1.0 for minor or major error
  promptOpening: number;  // e.g., -0.5 when judge opens / alerts
  repetition: number;     // e.g., -0.25
  tajweedMinor: number;   // e.g., -0.25
  tajweedMajor: number;   // e.g., -0.5
  hesitationStop: number; // e.g., -0.5
}

export interface RuleSet {
  id: string;
  version: string;
  name: string;
  judgesCountPerPanel: number;
  dropExtremes: boolean; // drop highest and lowest score
  criteria: CriterionRule[];
  penalties: PenaltyMapping;
  questionsPerParticipant: number;
  questionDurationMinutes: number;
  minimumPassingScore: number;
  tieBreakRules: ('tajweed_priority' | 'memorization_priority' | 'fewest_penalties' | 'additional_question')[];
  appealsAllowed: boolean;
  appealWindowHours: number;
  silentAIGuardianEnabled: boolean;
  frozenAt?: string;
}

export interface Category {
  id: string;
  competitionId: string;
  code: string;
  name: string;
  nameArabic: string;
  description: string;
  riwaya: string; // legacy display string; scientific logic resolves exact canonical reading contexts.
  readingContexts?: { qiraahId:string; rawiId:string; tariqIds?:string[]; allowedWujuh?:string[] }[];
  memorizationScope: string; // e.g. "Full Quran", "20 Juz", "10 Juz", "5 Juz"
  juzCount: number;
  minAge?: number;
  maxAge?: number;
  genderConstraint?: 'all' | 'male' | 'female';
  targetParticipants: number;
  targetDurationMinutes: number;
  ruleSetId?: string;
  questionBlueprintId?: string;
}

export interface Competition {
  id: string;
  organizationId: string;
  name: string;
  nameArabic: string;
  edition: string;
  country: string;
  timezone: string;
  status: CompetitionStatus;
  automationLevel: AutomationLevel;
  startDate: string;
  endDate: string;
  registrationStartDate: string;
  registrationEndDate: string;
  categories: Category[];
  ruleSet: RuleSet;
  venueName: string;
  venuesCount: number;
  totalRegistered: number;
  totalApproved: number;
  totalAttended: number;
  currentDay: number;
  totalDays: number;
  policy?: CompetitionPolicy;
  ruleSets?: RuleSet[];
  readinessChecklist: {
    datesConfigured: boolean;
    categoriesConfigured: boolean;
    ruleSetFrozen: boolean;
    judgesAssigned: boolean;
    quranSourceLocked: boolean;
    devicesRegistered: boolean;
    certificatesReady: boolean;
  };
}

export type RegistrationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'checked_in'
  | 'in_queue'
  | 'in_session'
  | 'tested'
  | 'appealed'
  | 'certified';

export interface Participant {
  id: string;
  code: string; // e.g., A-104
  competitionId: string;
  organizationId: string;
  fullName: string;
  fullNameArabic: string;
  email: string;
  phone: string;
  country: string;
  nationality: string;
  nationalIdOrPassport: string;
  dateOfBirth: string;
  gender: 'male' | 'female';
  categoryId: string;
  riwaya: string;
  institution?: string;
  delegationId?: string;
  status: RegistrationStatus;
  statusHistory: { status: RegistrationStatus; timestamp: string; actor: string; reason?: string }[];
  arrivalSlot?: string;
  checkedInAt?: string;
  checkInMethod?: 'kiosk_qr' | 'mobile_self' | 'exception_host';
  assignedCommitteeId?: string;
  queueNumber?: number;
  originalQueueNumber?: number;
  queueOrderKey?: number;
  queueTransferCount?: number;
  specialNeeds?: boolean;
  photoUrl?: string;
  documents?: { type: string; url: string; verified: boolean }[];
  createdAt: string;
}

export interface Committee {
  id: string;
  competitionId: string;
  name: string;
  nameArabic: string;
  code: string; // e.g. C1
  venueHall: string;
  assignedCategories: string[];
  headJudgeId: string;
  judgeIds: string[];
  status: 'ready' | 'testing' | 'paused' | 'offline';
  currentParticipantId?: string;
  completedCount: number;
  averageSessionMinutes: number;
  audioInputOk: boolean;
  devicesConnected: number;
}

export interface JudgeProfile {
  id: string;
  userId: string;
  name: string;
  nameArabic: string;
  title: string;
  country: string;
  specialty: 'memorization' | 'tajweed' | 'waqf_ibtida' | 'all';
  certifiedRiwayat: string[];
  assignedCommitteeId?: string;
  conflictsDeclared: { participantId?: string; institution?: string; type: 'student' | 'relative' | 'institution'; hardConflict: boolean }[];
  calibrationScore: number; // e.g., 96.5% agreement in calibration lab
  isReady: boolean;
}

export interface QuestionPoolItem {
  id: string;
  surahNumber: number;
  surahNameArabic: string;
  surahNameEnglish: string;
  startAyah: number;
  endAyah: number;
  juzNumber: number;
  riwaya: string;
  expectedTextArabic: string;
  difficultyRating: number; // 1 to 5
  mutashabihatDensity: 'none' | 'low' | 'medium' | 'high';
  tajweedComplexity: 'basic' | 'intermediate' | 'advanced';
  timesUsed: number;
}

export interface QuestionSelection {
  questionSetId: string;
  participantId: string;
  questions: QuestionPoolItem[];
  difficultyVectorScore: number;
  seedCommitmentHash: string;
  fairnessToleranceDelta: number;
  generatedAt: string;
  algorithmVersion?:string; poolVersion?:string; poolSnapshotHash?:string; ruleVersion?:string; constraintHash?:string; publicCommitmentHash?:string; seedReveal?:string; quranSourceManifestId?:string; quranSourceVersion?:string; quranSourcePackageHash?:string; sourceMode?:'CERTIFIED_SOURCE'|'DEVELOPMENT_FIXTURE'; qiraah?:string; rawi?:string; tariq?:string; variantLocusVersion?:string; difficultyMetadataVersion?:string;
}

export type JudgeEventType = string;

export interface JudgeEvent {
  id: string;
  sessionId: string;
  questionIndex: number;
  judgeId: string;
  judgeName: string;
  timestamp: string; // ISO
  relativeSeconds: number;
  type: JudgeEventType;
  criterion: 'memorization' | 'tajweed' | 'waqf_ibtida' | 'performance';
  penalty: number;
  reversed?: boolean;
  notes?: string;
}

export interface JudgeSubmission {
  participantId?: string;
  judgeId: string;
  judgeName: string;
  sessionId: string;
  criterionScores: Record<string, number>;
  totalScore: number;
  eventsCount: number;
  submittedAt: string;
  locked: boolean;
  independenceCommitmentHash?: string;
  independenceCommittedAt?: string;
  independenceCommitmentVersion?: 'MIZAN-JUDGE-INDEPENDENCE-v1';
  independenceCommitmentAssurance?: 'client_sha256_commitment'|'server_signed_receipt';
}

export interface AIObservation {
  id: string;
  competitionId: string;
  sessionId: string;
  timestampSeconds: number;
  type: 'omission' | 'insertion' | 'substitution' | 'repetition' | 'hesitation_pause' | 'audio_noise_clipping';
  confidence: 'high' | 'medium' | 'low';
  expectedLocation: string; // e.g. "Al-Baqarah:142"
  detectedHypothesis: string;
  modelIdentifier: string;
  reviewClipStartSec: number;
  reviewClipEndSec: number;
  audioClipUrl?: string;
  flaggedForReview: boolean;
  participantId?:string; capability?:AICapability; model?:string; modelVersion?:string; modelHash?:string;
  qiraah?:string; rawi?:string; tariq?:string; wajh?:string; expectedQuranPosition?:string; observedEvidence?:string|Record<string,unknown>;
  calibratedConfidence?:number; capabilityCertificationState?:AICertificationState; capabilityCertificationVersion?:string;
  benchmarkReference?:string; modelEvidence?:string|Record<string,unknown>; humanReviewState?:'pending'|'confirmed'|'dismissed'|'ambiguous'; humanReviewer?:string; humanDecision?:string;
  audioStart?:number; audioEnd?:number; phonemeSchemaVersion?:string;
}

export interface ReviewCase {
  id: string;
  competitionId: string;
  sessionId: string;
  participantId: string;
  participantCode: string;
  committeeId: string;
  reason: 'judge_variance' | 'ai_high_confidence_alert' | 'audio_dropout' | 'score_outlier' | 'sealed_result_protection';
  severity: 'high' | 'medium' | 'low';
  timestampSec: number;
  details: string;
  audioClipUrl?: string;
  status: 'pending' | 'confirmed' | 'dismissed' | 'committee_escalation';
  headJudgeDecision?: {
    actor: string;
    action: 'confirmed' | 'dismissed';
    adjustedPenaltyDelta: number;
    notes: string;
    resolvedAt: string;
  };
}

export interface ScoreCalculation {
  sessionId: string;
  participantId: string;
  categoryId: string;
  ruleSetVersion: string;
  judgeSubmissions: JudgeSubmission[];
  rawAverageScore: number;
  droppedScores?: { highest: number; lowest: number };
  finalScore: number;
  memorizationScore: number;
  tajweedScore: number;
  performanceScore: number;
  rank?: number;
  passed: boolean;
  calculatedAt: string;
}

export interface ResultRecord {
  id: string;
  competitionId: string;
  participantId: string;
  participantCode: string;
  participantName: string;
  participantNameArabic: string;
  country: string;
  categoryId: string;
  categoryName: string;
  finalScore: number;
  rank: number;
  status: 'calculated' | 'quality_checked' | 'approved' | 'sealed' | 'published';
  sealMetadata?: {
    sealedBy: string;
    sealedById?: string;
    sealedAt: string;
    cryptographicChecksum: string;
    dualApprovalBy?: string;
  };
  publishedById?: string;
  publishedAt?: string;
  awardTitle?: 'First Place' | 'Second Place' | 'Third Place' | 'Honorable Mention' | 'Qualified';
  awardTitleArabic?: 'المركز الأول' | 'المركز الثاني' | 'المركز الثالث' | 'تقدير امتياز' | 'مؤهل';
}

export interface AppealRecord {
  id: string;
  competitionId: string;
  participantId: string;
  participantCode: string;
  categoryName: string;
  grounds: 'scoring_miscalculation' | 'audio_interruption' | 'question_scope_dispute';
  reasonText: string;
  status: 'submitted' | 'under_review' | 'accepted' | 'rejected';
  resolutionNotes?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  scoreAdjustmentDelta?: number;
  createdAt: string;
}

export interface Certificate {
  id: string;
  certificateNumber: string; // e.g. MZN-2027-A104-9872
  competitionId: string;
  competitionName: string;
  competitionNameArabic: string;
  organizationName: string;
  organizationNameArabic: string;
  participantId: string;
  participantName: string;
  participantNameArabic: string;
  categoryName: string;
  categoryNameArabic: string;
  score: number;
  rank?: number;
  awardTextArabic: string;
  issueDate: string;
  signatories: { name: string; title: string; signatureUrl?: string }[];
  verificationToken: string;
  verificationUrl: string;
  isAuthentic: boolean;
  qrPayload: string;
  resultId?:string; certificateVersion?:string; resultSealReference?:string; merkleProofId?:string; issuerSignature?:string; issuedTimestamp?:string;
  revocationState?:'ACTIVE'|'REVOKED'; revocationReason?:string; proofPackageHash?:string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  organizationId: string;
  competitionId?: string;
  actorId: string;
  actorName: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  humanSummaryArabic: string;
  humanSummaryEnglish: string;
  previousStateHash?: string;
  currentStateHash: string;
  ipAddress?: string;
  deviceInfo?: string;
  requestId?: string;
  sessionId?: string;
  authenticationMethod?: 'password'|'mfa'|'sso'|'demo'|'unknown';
  authenticationAssurance?: 'single_factor'|'mfa'|'federated'|'demo';
  reason?: string;
  sequence?: number;
  assurance?: 'client_hash_chain'|'server_hash_chain'|'external_worm';
}

export interface SimulationResult {
  totalParticipants: number;
  committeesCount: number;
  projectedFinishTime: string;
  averageWaitMinutes: number;
  maxWaitMinutes: number;
  peakBottleneckTimeRange: string;
  bottleneckCommittee: string;
  optimizationAdviceArabic: string;
  optimizationAdviceEnglish: string;
  simulatedHourlyThroughput: { hour: string; processed: number; queueSize: number }[];
}

export interface IncidentRecord {
  id: string;
  competitionId: string;
  type: 'power' | 'network' | 'audio_mic' | 'device' | 'judge_absence' | 'participant_emergency' | 'conflict_routing' | 'security' | 'venue' | 'quran_source_discrepancy' | 'source_hash_mismatch' | 'wrong_riwayah_mapping' | 'variant_locus_error' | 'ai_false_positive_cluster' | 'ai_false_negative_cluster' | 'model_regression' | 'dataset_contamination' | 'annotation_defect' | 'certification_scope_violation';
  severity: 'critical' | 'moderate' | 'low';
  title: string;
  description: string;
  reportedBy: string;
  reportedAt: string;
  resolvedAt?: string;
  status: 'active' | 'investigating' | 'resolved';
}


// ---- Competition-specific policy engine -------------------------------------------------
// Every competition can define its own registration, workflow, judging, result and privacy
// policies. Defaults are only templates; no policy below is globally hard-coded.

export interface RegistrationFieldDefinition {
  id: string;
  labelArabic: string;
  labelEnglish: string;
  type: 'text' | 'email' | 'phone' | 'date' | 'select' | 'file' | 'checkbox';
  required: boolean;
  visible: boolean;
  options?: { value: string; labelArabic: string; labelEnglish: string }[];
}

export interface EligibilityCondition {
  id: string;
  field: 'age' | 'country' | 'nationality' | 'gender' | 'previousWinner' | 'document' | 'custom';
  operator: 'eq' | 'neq' | 'lte' | 'gte' | 'in' | 'not_in' | 'exists';
  value: string | number | boolean | string[];
  action: 'reject' | 'review' | 'suggest_category';
  messageArabic: string;
  messageEnglish: string;
}

export interface RegistrationPolicy {
  mode: 'public' | 'invitation' | 'delegation' | 'hybrid';
  accountMode: 'otp' | 'magic_link' | 'password' | 'no_account';
  autoApproveEligible: boolean;
  requireIdentityVerification: boolean;
  requireGuardianForMinors: boolean;
  fields: RegistrationFieldDefinition[];
  eligibility: EligibilityCondition[];
}

export interface JudgeActionDefinition {
  id: string;
  eventType: JudgeEventType;
  labelArabic: string;
  labelEnglish: string;
  shortArabic: string;
  shortEnglish: string;
  criterion: 'memorization' | 'tajweed' | 'waqf_ibtida' | 'performance' | 'custom';
  penalty: number;
  enabled: boolean;
  shortcut?: string;
  icon?: 'error' | 'alert' | 'open' | 'repeat' | 'tajweed' | 'stop' | 'custom';
  requiresNote?: boolean;
}

export interface JudgingPolicy {
  mode: 'all_judges_all_criteria' | 'specialized_judges' | 'hybrid';
  identityVisibility: 'full' | 'code_only' | 'custom';
  independentUntilLock: boolean;
  scoreEntryMode: 'event_based' | 'direct_score' | 'hybrid';
  actions: JudgeActionDefinition[];
  requireAudioRecording: boolean;
  allowPhysicalJudgePad: boolean;
  allowCertifiedAudioPrompt: boolean;
  silentAiGuardian: boolean;
  aiCanAffectScore: false;
  reviewThreshold: 'strict' | 'balanced' | 'lenient';
  calibrationRequired: boolean;
  reserveJudgeAllowed: boolean;
  directScoreStep?: number;
}

export interface QuestionPolicy {
  drawMode: 'fairdraw' | 'pure_random' | 'manual_approved' | 'hybrid';
  participantInitiatedDraw: boolean;
  questionsPerParticipant: number;
  targetDifficulty: number;
  difficultyTolerance: number;
  avoidRepeatWithinRound: boolean;
  diversity: { acrossJuz: boolean; acrossSurah: boolean; mutashabihatBalance: boolean };
  promptMode: 'judge' | 'certified_audio' | 'visual' | 'configurable';
  secureReveal?: { requireParticipantPresence:boolean; judgeApprovalMode:'all_assigned'|'minimum'; minimumApprovals?:number };
  openingPrompt?: { mode:'approved_reference_audio'|'judge'; autoplay:boolean; usageScope:string; preferredReciter?:string };
  transitionCue?: { enabled:boolean; phraseArabic:string; phraseEnglish:string; autoAdvanceDelayMs:number; audioUrl?:string };
}

export interface WorkflowStagePolicy {
  id: string;
  enabled: boolean;
  automated: boolean;
  requiresApproval: boolean;
}

export interface OperationsPolicy {
  deploymentProfile: 'lean' | 'balanced' | 'premium';
  gateStationMode: 'computer_only' | 'touch_kiosk' | 'bring_your_own_device';
  ticketMode: 'digital_only' | 'screen_number' | 'print_optional';
  hardwareStrategy: 'reuse_existing' | 'mixed' | 'dedicated';
  selfCheckIn: boolean;
  kioskCheckIn: boolean;
  exceptionDesk: boolean;
  smartArrivalSlots: boolean;
  autoRouting: boolean;
  publicQueueUsesCodesOnly: boolean;
  offlineContinuity: boolean;
  lateArrivalGraceMinutes: number;
  badgeMode: 'digital' | 'print' | 'both' | 'none';
  fatigueGuardEnabled?: boolean;
  fatigueTargetMinutes?: number;
  fatigueRecommendedBreakMinutes?: number;
}

export interface ResultPolicy {
  visibility: 'immediate' | 'after_committee' | 'after_round' | 'ceremony_only' | 'private_only';
  publicLeaderboard: 'disabled' | 'top_only' | 'full';
  requireDualApprovalToSeal: boolean;
  qualificationRule: 'top_n' | 'minimum_score' | 'custom';
  qualificationValue: number;
  tieBreakRules: string[];
}

export interface AppealPolicy {
  enabled: boolean;
  windowHours: number;
  grounds: string[];
  reviewerRole: 'head_judge' | 'scientific_admin' | 'committee';
  allowScoreChange: boolean;
}

export interface CertificatePolicy {
  enabled: boolean;
  autoIssue: boolean;
  issueFor: 'all_participants' | 'qualified' | 'winners' | 'custom';
  showScore: boolean;
  showRank: boolean;
  publicVerification: boolean;
  titleArabic?: string;
  titleEnglish?: string;
  awardTextArabic?: string;
  awardTextEnglish?: string;
  verificationBasePath?: string;
  signatories?: { name: string; title: string }[];
}


export interface PrivacyPolicy {
  audioRetentionDays: number;
  documentRetentionDays: number;
  displayParticipantNameOnPublicScreens: boolean;
  allowAiProcessing: boolean;
  allowAnonymousBenchmarking: boolean;
}

export type CompetitionAIPolicyMode='AI_DISABLED'|'AI_AUDIO_QUALITY_ONLY'|'AI_ALIGNMENT_ONLY'|'AI_MEMORIZATION_ADVISORY'|'AI_CERTIFIED_CAPABILITIES_ONLY'|'AI_RESEARCH_SHADOW_MODE';
export interface CompetitionAIPolicy { mode:CompetitionAIPolicyMode; enabledCapabilities?:Partial<Record<AICapability,boolean>>; requireCertifiedScope:boolean; revealOnlyAfterJudgeLock:boolean; }
export interface CompetitionPolicy {
  version: string;
  templateId?: string;
  registration: RegistrationPolicy;
  judging: JudgingPolicy;
  questions: QuestionPolicy;
  operations: OperationsPolicy;
  results: ResultPolicy;
  appeals: AppealPolicy;
  certificates: CertificatePolicy;
  privacy: PrivacyPolicy;
  aiPolicy: CompetitionAIPolicy;
  workflow: WorkflowStagePolicy[];
  terminology?: Record<string, { ar: string; en: string }>;
  updatedAt: string;
  frozenAt?: string;
}

export interface CompetitionTemplate {
  id: string;
  nameArabic: string;
  nameEnglish: string;
  descriptionArabic: string;
  descriptionEnglish: string;
  policy: CompetitionPolicy;
  ruleSets: RuleSet[];
}

export type Permission =
  | 'platform.manage'
  | 'organization.manage'
  | 'competition.create'
  | 'competition.configure'
  | 'competition.publish'
  | 'participant.read'
  | 'participant.edit'
  | 'participant.checkin'
  | 'committee.manage'
  | 'judge.manage'
  | 'judging.submit'
  | 'judging.review'
  | 'result.calculate'
  | 'result.seal'
  | 'result.publish'
  | 'appeal.review'
  | 'certificate.issue'
  | 'audit.read'
  | 'quran.manage'
  | 'operations.manage'
  | 'broadcast.manage'
  | 'identity.invite'
  | 'identity.approve'
  | 'identity.suspend'
  | 'identity.audit'
  | 'participant.pass.reissue'
  | 'session.recover'
  | 'continuity.override';

// ---- Enterprise completion layer ---------------------------------------------------------
export type IntegrationKind = 'email' | 'sms' | 'whatsapp' | 'identity' | 'storage' | 'broadcast' | 'payments' | 'webhook';
export interface IntegrationConfig { id:string; organizationId:string; kind:IntegrationKind; name:string; enabled:boolean; status:'not_configured'|'configured'|'degraded'; secretRef?:string; endpoint?:string; lastCheckedAt?:string; }
export interface NotificationRecord { id:string; competitionId:string; participantId?:string; channel:'in_app'|'email'|'sms'|'whatsapp'|'push'; templateKey:string; locale:string; recipient:string; status:'scheduled'|'queued'|'sent'|'failed'|'cancelled'; attempts:number; createdAt:string; scheduledFor?:string; nextRetryAt?:string; sentAt?:string; error?:string; providerResponse?:string; fallbackChannel?:'in_app'|'email'|'sms'|'whatsapp'|'push'; consentRequired?:boolean; consentSatisfied?:boolean; idempotencyKey:string; }
export interface WebhookSubscription { id:string; organizationId:string; competitionId?:string; event:string; endpoint:string; enabled:boolean; secretRef:string; lastDeliveryStatus?:'success'|'failed'; }
export interface DeviceRecord { id:string; competitionId:string; name:string; type:'kiosk'|'judge_tablet'|'edge_server'|'display'|'printer'|'audio'; role?:'Gate'|'Kiosk'|'JudgeOS'|'Head Judge'|'Operations'|'Waiting Display'|'Committee Display'|'Exception Host'|'Ceremony'|'Broadcast'|'Edge'; zone?:string; committeeId?:string; status:'online'|'offline'|'degraded'|'disabled'|'revoked'; connection?:'online'|'offline'|'local'; lastSeenAt:string; lastSyncAt?:string; softwareVersion:string; sessionExpiresAt?:string; batteryPercent?:number; revokedAt?:string; }
export interface DelegationTravelRecord { id:string; competitionId:string; delegationId:string; participantId?:string; flightNumber?:string; arrivalAirport?:string; arrivalAt?:string; hotel?:string; room?:string; transportStatus:'not_required'|'pending'|'scheduled'|'completed'; companionCount:number; notes?:string; }
export interface ConsentRecord { id:string; participantId:string; competitionId:string; kind:'terms'|'privacy'|'audio_recording'|'ai_processing'|'guardian'|'human_review'|'ai_inference'|'ai_validation'|'ai_training'|'scientific_research'|'external_dataset_publication'; version:string; accepted:boolean; acceptedAt:string; guardianName?:string; }
export interface ImportJobRecord { id:string; competitionId:string; entity:'participants'|'judges'|'delegations'|'categories'|'committees'|'historical_results'; fileName:string; status:'mapping'|'validated'|'dry_run'|'imported'|'failed'|'rolled_back'; totalRows:number; validRows:number; invalidRows:number; duplicateRows?:number; columns?:string[]; mapping:Record<string,string>; errors:{row:number;message:string}[]; warnings?:{row:number;message:string}[]; rollbackToken?:string; importedIds?:string[]; createdAt:string; completedAt?:string; }
export interface ShadowRun { id:string; competitionId:string; mode:'record'|'analyze'|'simulate'|'compare'; status:'draft'|'running'|'completed'; startedAt?:string; completedAt?:string; observations:{type:string;severity:'info'|'medium'|'high';summary:string}[]; }
export interface ParticipantPassportEntry { id:string; participantId:string; competitionId:string; competitionName:string; categoryName:string; year:string; result?:string; certificateNumber?:string; verified:boolean; }
export interface JudgePassportEntry { id:string; judgeId:string; competitionId:string; competitionName:string; role:string; riwayat:string[]; calibrationScore?:number; completedSessions:number; verified:boolean; }
export interface TrainingRun { id:string; competitionId:string; type:'judge_practice'|'operations_dry_run'|'sandbox'; status:'ready'|'running'|'completed'; startedAt?:string; score?:number; notes?:string; }
export interface BackupRecord { id:string; organizationId:string; competitionId?:string; createdAt:string; scope:'competition'|'organization'; checksum:string; status:'ready'|'failed'; sizeLabel:string; }
export interface RetentionJob { id:string; competitionId:string; dataType:'audio'|'documents'|'audit'|'participant_pii'; scheduledFor:string; action:'delete'|'anonymize'|'retain'; status:'scheduled'|'completed'|'cancelled'; }
export interface SupportSession { id:string; organizationId:string; requestedBy:string; approvedBy?:string; reason:string; status:'requested'|'approved'|'active'|'ended'|'rejected'; createdAt:string; expiresAt:string; }
export interface RemoteSessionCheck { id:string; participantId:string; competitionId:string; identity:'pending'|'verified'|'failed'; device:'pending'|'passed'|'failed'; environment:'pending'|'passed'|'review'; networkQuality:'good'|'fair'|'poor'; recordingReady:boolean; suspiciousSignals:string[]; }


export type QuranSourceCertificationState='DEVELOPMENT'|'PENDING_REVIEW'|'CERTIFIED'|'REVOKED';
export interface QuranScientificReview {
  reviewerId:string; reviewerName:string; reviewerRole?:string; decision:'approve'|'reject'; comments?:string; packageHash:string; reviewedAt:string;
}
export interface QuranSourceManifestRecord {
  id:string; organizationId:string;
  // Legacy compatibility fields remain mapped to the scientific state; no parallel source model is created.
  riwaya:string; edition:string; version:string; checksumSha256:string; sourceAuthority:string; reviewerNames:string[]; status:'draft'|'reviewed'|'approved'|'retired'; createdAt:string; approvedAt?:string;
  sourcePublication?:string; sourceEdition?:string; sourceVersion?:string; publicationDate?:string;
  qiraah?:string; imam?:string; rawi?:string; tariq?:string; wajh?:string;
  rasmSystem?:string; dabtSystem?:string; ayahNumberingConvention?:string; surahNumberingConvention?:string; waqfConvention?:string;
  sourceFiles?:{name:string;format:string;sha256:string;sizeBytes?:number}[]; packageHash?:string; checksumAlgorithm?:'SHA-256'; expectedChecksumSha256?:string; checksumVerificationState?:'MATCH'|'MISMATCH'|'NOT_PROVIDED'; contentHash?:string; structuralValidation?:{surahCount:number;ayahCount:number;surahCountValid:boolean;ayahCountProfile?:string;ayahCountValid?:boolean;errors:string[]};
  sourceReference?:string; licenseProvenance?:string; ingestionTimestamp?:string; ingestedBy?:string;
  scientificReviews?:QuranScientificReview[]; scientificReviewNotes?:string; approvalVersion?:string; approvedBy?:string[];
  certificationState?:QuranSourceCertificationState; revocationState?:'ACTIVE'|'REVOKED'; revocationReason?:string; supersededBy?:string;
  historicalUsageReferences?:string[]; usageRestrictions?:string[]; immutable?:boolean; pendingScientificSource?:boolean;
}
export interface QuestionGovernanceRecord {
  questionId:string; competitionId:string; sourceManifestId?:string; expertDifficulty:number; historicalDifficulty?:number; status:'fixture'|'draft'|'reviewed'|'approved'|'retired'; reviewedBy?:string; updatedAt:string;
}
export type AICapability =
  |'audio_quality'|'speech_non_speech'|'surah_alignment'|'ayah_alignment'|'word_alignment'|'quran_position'
  |'memorization_watch'|'omission'|'insertion'|'substitution'|'repetition'|'restart'|'jump'|'hesitation'|'similar_verse_transition'
  |'tajweed_phoneme'|'phoneme_recognition'|'phoneme_substitution'|'phoneme_deletion'|'phoneme_insertion'
  |'makhraj'|'sifat'|'gemination'|'madd'|'madd_duration'|'ghunnah'|'ghunnah_duration'|'ikhfa'|'idgham'|'iqlab'|'izhar'
  |'qalqalah'|'tafkhim'|'tarqiq'|'hamzah_behavior'|'waqf_pause_detection'|'waqf_classification'|'ibtida'|'pause_duration';
export type AICertificationState='RESEARCH'|'BETA'|'PENDING_VALIDATION'|'CERTIFIED'|'SUSPENDED'|'REVOKED'|'UNSUPPORTED';
export interface AICapabilityValidationRecord {
  id:string; organizationId:string; riwaya:string; capability:AICapability; modelName:string; modelVersion:string; datasetName:string; datasetSize:number;
  falsePositiveRate?:number; falseNegativeRate?:number; status:'draft'|'validated'|'certified'|'suspended'; evidenceRef?:string; approvedBy:string[]; updatedAt:string;
  provider?:string; modelHash?:string; qiraah?:string; rawi?:string; tariq?:string; wajh?:string; datasetVersion?:string; benchmark?:string; benchmarkVersion?:string; benchmarkReference?:string;
  phonemeErrorRate?:number; precision?:number; recall?:number; f1?:number; falseAcceptanceRate?:number; falseRejectionRate?:number; diagnosticErrorRate?:number;
  calibrationError?:number; calibrationReference?:string; recommendedReviewThreshold?:number;
  speakerPopulation?:string; ageRange?:string; genderCoverage?:string; nativeNonNativeCoverage?:string; accentCoverage?:string;
  audioEnvironment?:string; noiseRange?:string; deviceClass?:string; samplingRequirements?:string;
  evaluationDate?:string; scientificBoard?:string; approvalVersion?:string; reviewDate?:string; certificationState?:AICertificationState; validationStage?:'RESEARCH'|'LAB_VALIDATION'|'SHADOW_MODE'|'SCIENTIFIC_REVIEW'|'LIMITED_BETA'|'CERTIFIED'; shadowEvidenceRef?:string;
  scopeNotes?:string; reproducibility?:{codeVersion?:string;datasetSplit?:string;seed?:string;evaluationScriptVersion?:string;metricDefinitionsVersion?:string;environment?:string};
}
export interface OperatingCostModel { baselineStaff:number; mizanStaff:number; hoursPerDay:number; days:number; hourlyCost?:number; currency?:string; }
export interface AudioRecordingRecord {
  id: string;
  competitionId: string;
  sessionId: string;
  participantId: string;
  status: 'recording' | 'completed' | 'failed';
  mimeType: string;
  startedAt: string;
  stoppedAt?: string;
  sizeBytes?: number;
  localObjectUrl?: string;
  storageRef?: string;
  checksum?: string;
  quality: 'unknown' | 'good' | 'degraded';
  retentionDays: number;
}


// ---- MIZAN Trust 8 -----------------------------------------------------------------------
// Portable governance primitives. These records are tenant/competition scoped and are designed
// to remain useful even when optional AI, broadcast or cloud integrations are unavailable.

export interface TimeMachineScenarioRecord {
  id:string; competitionId:string; baseTimestamp:string; label:string; nonOfficial:true;
  assumptions:{committeeDelta:number;arrivalRatePerHour:number;absentJudgeIds:string[];networkMode:'normal'|'local_mesh'|'offline'};
  baseline:{committees:number;participantsInScope:number;averageWaitMinutes:number;projectedFinishTime:string;maxWaitMinutes:number};
  alternative:{committees:number;participantsInScope:number;averageWaitMinutes:number;projectedFinishTime:string;maxWaitMinutes:number};
  delta:{averageWaitMinutes:number;finishMinutes:number}; createdAt:string; createdBy:string;
}

export type QuorumActionType='results_seal'|'ceremony_reveal'|'policy_publish'|'emergency_override';
export interface QuorumApproval { actorId:string;actorName:string;actorRole:Role;approvedAt:string; }
export interface QuorumActionRecord {
  id:string; competitionId:string; action:QuorumActionType; entityId:string;
  requiredRoleGroups:Role[][]; distinctActorsRequired:boolean; approvals:QuorumApproval[]; minimumApprovals?:number; authorizedRoles?:Role[];
  status:'pending'|'ready'|'executed'|'cancelled'; requestedAt:string; requestedBy:string; executedAt?:string; executedBy?:string; approvalExpiresAt?:string; revokedApprovalActorIds?:string[]; cryptographicAssurance?:'development_adapter'|'production_threshold'; publicCommitmentHash?:string;
}

export interface InvariantCheckResult {
  key:string; titleArabic:string; titleEnglish:string; status:'pass'|'warning'|'violation'; evidence:string[];
}
export interface InvariantViolationRecord {
  id:string; competitionId:string; invariantKey:string; operation:string; entityType:string; entityId:string;
  actorId:string;actorRole:Role;reason:string;blockedAt:string;evidence?:Record<string,unknown>;
}

export type ScientificEvidenceNodeType='competition_policy'|'rule_set'|'quran_source'|'question'|'fairdraw'|'ai_capability'|'calibration'|'result'|'certificate'|'quorum';
export interface ScientificEvidenceNode {
  id:string;competitionId:string;type:ScientificEvidenceNodeType;label:string;status:string;version?:string;checksum?:string;authority?:string;entityRef:string;createdAt:string;
}
export interface ScientificEvidenceEdge { id:string;competitionId:string;fromNodeId:string;toNodeId:string;relation:string; }

export interface PublicMerkleLeaf { index:number;resultId:string;participantCode:string;leafHash:string; }
export interface PublicResultProofRecord {
  id:string;competitionId:string;resultId:string;verificationVersion:'mizan-merkle-v1';merkleRoot:string;leafIndex:number;
  disclosed:{participantCode:string;categoryId:string;finalScore:number;rank:number;status:string}; disclosureSalt:string;
  proof:{position:'left'|'right';hash:string}[];createdAt:string;
}
export interface PublicResultRootRecord { id:string;competitionId:string;merkleRoot:string;leaves:PublicMerkleLeaf[];resultCount:number;createdAt:string;algorithm:'SHA-256'; }

export interface LocalMeshNodeRecord { deviceId:string;name:string;role?:DeviceRecord['role'];status:'joined'|'stale'|'left';lastSeenAt:string;sequence:number; }
export interface LocalMeshEventRecord {
  id:string;competitionId:string;originDeviceId:string;sequence:number;type:string;payloadHash:string;payload?:Record<string,unknown>;createdAt:string;
  acknowledgedBy:string[];conflictKey?:string;transport?:'local'|'browser_broadcast'|'edge_relay';
}
export interface LocalMeshSessionRecord {
  id:string;competitionId:string;status:'forming'|'active'|'reconciling'|'closed';coordinatorDeviceId?:string;nodes:LocalMeshNodeRecord[];events:LocalMeshEventRecord[];
  conflicts:{id:string;eventIds:string[];reason:string;status:'open'|'resolved';resolution?:string}[];startedAt:string;reconciledAt?:string;
  transportMode?:'journal_only'|'browser_broadcast'|'edge_relay';transportStatus?:'connected'|'unavailable'|'disabled';
}

export type FederationClaimType='identity_verified'|'age_verified'|'delegation_authorized'|'guardian_consent_verified'|'travel_document_verified'|'organization_nomination'|'judge_credential_valid'|'participant_nomination_valid'|'certificate_authentic';
export interface FederationAttestationRecord {
  id:string;organizationId:string;subjectRef:string;subjectKind:'participant'|'delegation';issuer:string;claim:FederationClaimType;value:string;
  issuedAt:string;expiresAt?:string;status:'valid'|'revoked';evidenceDigest:string;signatureRef:string;privacyMode:'claim_only'; scope?:string; revocationEndpoint?:string; evidencePolicy?:string; privacyClassification?:'public_claim'|'restricted_claim'; issuerKeyId?:string; signatureAlgorithm?:string;
}

export interface MizanProtocolPackageRecord {
  id:string;competitionId:string;protocolVersion:'MIZAN-PROTOCOL-1.0';generatedAt:string;generatedBy:string;genomeHash:string;resultRoot?:string;auditHead?:string;
  quranSourceHashes:string[];integrityEnvelopeHashes:string[];evidenceGraphHash?:string;
  manifest:{competitionId:string;organizationId:string;edition:string;policyVersion:string;ruleVersion:string;status:CompetitionStatus;nonSecret:true};
  packageHash:string;verificationStatus:'self_verified'|'verification_failed';
}

// ---- MIZAN Beyond 8 ----------------------------------------------------------------------
// Advanced operational intelligence remains progressive-disclosure only. None of these
// records can mutate an official result without the normal permission/quorum paths.
export interface FlightRecorderEntry {
  id:string; competitionId:string; timestamp:string;
  stream:'operations'|'judging'|'devices'|'incidents'|'ai'|'results'|'appeals'|'trust';
  sourceType:string; sourceId:string; summaryArabic:string; summaryEnglish:string; checksum:string;
}
export interface IntegrityEnvelopeRecord {
  id:string; competitionId:string; participantId:string; sessionId?:string; resultId?:string;
  policyVersion:string; ruleVersion:string; fairDrawHash?:string; judgeSubmissionHashes:string[];
  recordingChecksum?:string; auditHead?:string; resultSealHash?:string; createdAt:string; createdBy:string;
  envelopeHash:string; status:'sealed';
}
export interface ChaosDrillScenario {
  id:string; type:'network'|'judge_absence'|'device'|'audio'|'queue_spike'|'power'|'committee';
  titleArabic:string; titleEnglish:string; expectedSafeguard:string; passed:boolean; evidence:string;
}
export interface ChaosDrillRecord {
  id:string; competitionId:string; nonOfficial:true; createdAt:string; createdBy:string;
  scenarios:ChaosDrillScenario[]; readinessScore:number; status:'completed';
}
export interface AccessibilityProfileRecord {
  id:string; userId:string; competitionId:string; source:'system_preference'|'user';
  textScale:'normal'|'large'; touchScale:'normal'|'xl'; contrast:'system'|'high'; motion:'system'|'reduced'; audioCues:boolean;
  updatedAt:string;
}
export interface CommitteeElasticityRecommendation {
  id:string; competitionId:string; createdAt:string; createdBy:string;
  sourceCommitteeId?:string; targetCommitteeId?:string; participantIds:string[];
  reasonArabic:string; reasonEnglish:string; constraintsChecked:string[];
  status:'proposed'|'approved'|'dismissed'; approvedAt?:string; approvedBy?:string;
}
export interface JourneyPassRecord {
  id:string; competitionId:string; participantId:string; participantCode:string; version:'MZ1';
  payload:string; checksum:string; issuedAt:string; status:'active'|'revoked'; validFrom?:string; expiresAt?:string; credentialId?:string; issuer?:string; categoryEntitlement?:string; signature?:string; signatureAlgorithm?:string; issuerPublicKeyJwk?:JsonWebKey; signatureAssurance?:'development_per_credential'|'production_issuer_key'; revocationVersion?:number; usedAt?:string;
  lineageId?:string; generation?:number; reissuedFromId?:string; revokedAt?:string; revocationReason?:string;
}



// ---- Identity, credential recovery, and continuity governance --------------------------------
export type IdentityAccountStatus='INVITED'|'ACTIVE'|'SUSPENDED'|'REVOKED';
export interface IdentityAccountRecord { id:string;firebaseUid?:string;email:string;displayName:string;organizationId:string;status:IdentityAccountStatus;createdAt:string;createdBy:string;activatedAt?:string;suspendedAt?:string;revokedAt?:string;lastAuthenticatedAt?:string;mfaRequired:boolean;identityAssurance:'PENDING'|'FIREBASE'|'FEDERATED_SSO'|'DEMO'; }
export interface RoleGrantRecord { id:string;accountId:string;role:Role;organizationId:string;competitionId?:string;committeeId?:string;status:'PENDING_APPROVAL'|'ACTIVE'|'SUSPENDED'|'REVOKED'|'EXPIRED';requestedAt:string;requestedBy:string;approvedAt?:string;approvedBy?:string;validFrom?:string;expiresAt?:string;reason:string;dualApprovalRequired:boolean; }
export interface IdentityInvitationRecord { id:string;email:string;displayName:string;organizationId:string;requestedRole:Role;competitionId?:string;committeeId?:string;status:'PENDING_APPROVAL'|'READY'|'ACCEPTED'|'EXPIRED'|'REVOKED';createdAt:string;createdBy:string;approvedAt?:string;approvedBy?:string;expiresAt:string;activationTokenHash?:string;acceptedAt?:string;accountId?:string; }
export interface AuthSessionRecord { id:string;accountId:string;firebaseUid?:string;organizationId:string;competitionId?:string;role:Role;deviceId:string;deviceName?:string;openedAt:string;lastSeenAt:string;expiresAt:string;status:'ACTIVE'|'ENDED'|'REVOKED'|'CONFLICT_BLOCKED';authenticationAssurance:'SINGLE_FACTOR'|'MFA'|'FEDERATED'|'DEMO';ipHint?:string; }
export interface PassReissueRecord { id:string;competitionId:string;participantId:string;oldCredentialIds:string[];newCredentialId:string;lineageId:string;generation:number;reason:'LOST'|'DAMAGED'|'SECURITY'|'NAME_CORRECTION'|'OTHER';identityVerification:'PHOTO_ID'|'PASSPORT'|'PARTICIPANT_PROFILE'|'DELEGATION_CONFIRMATION'|'MANUAL_EXCEPTION';requestedAt:string;requestedBy:string;status:'ISSUED'|'CANCELLED';revocationEpoch:number; }
export interface ParticipantCredentialLineageRecord { id:string;competitionId:string;participantId:string;lineageId:string;latestGeneration:number;latestCredentialId:string;revocationEpoch:number;updatedAt:string;updatedBy:string; }
export type SessionContinuityPhase='BEFORE_REVEAL'|'REVEALED_NOT_STARTED'|'RECITING'|'BETWEEN_QUESTIONS'|'JUDGES_LOCKING'|'PANEL_LOCKED'|'COMPLETED';
export interface SessionCheckpointRecord { id:string;competitionId:string;sessionId:string;participantId:string;committeeId:string;phase:SessionContinuityPhase;questionIndex:number;questionCommitmentHash?:string;questionRevealed:boolean;durationSeconds:number;eventIds:string[];lockedJudgeIds:string[];sequence:number;createdAt:string;createdBy:string;checkpointHash:string;previousCheckpointHash?:string;assurance:'client_hash_chain'|'edge_persisted'|'server_persisted'; }
export interface ContinuityIncidentRecord { id:string;competitionId:string;sessionId:string;participantId:string;type:'POWER_LOSS'|'NETWORK_LOSS'|'DEVICE_FAILURE'|'BROWSER_CRASH'|'AUDIO_FAILURE'|'VENUE_EVACUATION'|'UNKNOWN';occurredAt:string;reportedBy:string;lastCheckpointId?:string;status:'OPEN'|'RECOVERING'|'RESOLVED'|'ESCALATED';notes?:string; }
export interface SessionRecoveryRecord { id:string;competitionId:string;sessionId:string;participantId:string;incidentId:string;checkpointId?:string;decision:'RESUME_SAME_SESSION_SAME_QUESTION'|'RESUME_SAME_SESSION_NEXT_QUESTION'|'RESTORE_LOCKED_PANEL'|'HEAD_JUDGE_ADJUDICATION'|'FULL_RETEST_LAST_RESORT';reason:string;preserveRevealedQuestion:boolean;preserveLockedJudgeSubmissions:boolean;createdAt:string;createdBy:string;approvedByHeadJudge?:string;secondApprovedBy?:string;retestSessionId?:string;originalSessionPreserved?:boolean;status:'PROPOSED'|'APPLIED'|'REJECTED'; }
export interface AuditLedgerSealRecord { id:string;competitionId:string;createdAt:string;createdBy:string;eventCount:number;headHash:string;firstEventId?:string;lastEventId?:string;assurance:'client_hash_chain'|'server_hash_chain'|'external_worm';verificationState:'VERIFIED'|'FAILED'; }

// ---- Scientific foundation + Next Generation merge records -------------------------------
export interface QuranSourceContentRecord { id:string;organizationId:string;sourceManifestId:string;packageHash:string;contentHash:string;sourceFileHash:string;sourceFormat:string;verseCount:number;surahCount:number;rows:{surah:number;ayah:number;text:string}[];importedAt:string;immutable:boolean; }
export interface QiraatGraphNode {
  qiraahId:string; qiraah:string; imam:string; rawiId:string; rawi:string; tariqIds:string[]; allowedWujuh:string[]; canonical:boolean; sourceStatus:'AVAILABLE_CANDIDATE'|'PENDING_SCIENTIFIC_SOURCE'; sourceManifestId?:string;
}
export interface VariantLocusRecord { id:string;sourceManifestId?:string;surah:number;ayah:number;wordPosition?:number;baseReading?:string;alternateReading?:string;qiraah:string;rawi:string;tariq?:string;allowedWajh?:string;pronunciationEvidenceRef?:string;rasmEvidenceRef?:string;scientificNote?:string;version:string;approvalState:'DEVELOPMENT'|'PENDING_REVIEW'|'CERTIFIED'|'REVOKED'; }
export interface QuranReferenceAudioRecord { id:string;organizationId:string;reciter:string;qiraah:string;rawi:string;tariq?:string;surah:number;ayahStart:number;ayahEnd:number;recordingSource:string;recordingDate?:string;audioFormat:string;sampleRate?:number;channels?:number;fileHash:string;audioUrl?:string;ayahTimings?:{ayah:number;startMs:number;endMs:number}[];approvalState:'REFERENCE'|'PENDING_REVIEW'|'APPROVED_REFERENCE'|'REVOKED';reviewer?:string;usageScope:string[];licenseProvenance?:string; }
export interface QuranCrossCheckRecord { id:string;organizationId:string;sourceManifestId:string;sourcePackageHash:string;referenceAuthority:string;referenceVersion?:string;referenceHash?:string;status:'MATCH'|'DIFFERENCE'|'UNVERIFIED';differenceCount:number;differences:{surah:number;ayah:number;level:'TEXT'|'CHARACTER'|'DIACRITIC'|'WAQF_MARKER'|'UNVERIFIED';left:string;right:string;offset?:number}[];createdAt:string;createdBy:string; }
export interface QuranPhonemeEvidenceRecord { schemaVersion:string; phoneme:string; allophone?:string; gemination?:boolean; durationMs?:number; madd?:{kind?:string;durationMs?:number;relativeUnits?:number}; nasalization?:boolean; emphasis?:boolean; voicing?:string; articulationContext?:string; pauseBehavior?:string; readingSpecificRealization?:string; boundaryConfidence?:number; }
export interface ScientificAdjudicationCaseRecord { id:string;organizationId:string;datasetId:string;capability:AICapability;sampleRef:string;expertLabels:{reviewerId:string;label:string;reasoningCode?:string;createdAt:string}[];status:'OPEN'|'ADJUDICATED';finalGoldLabel?:string;adjudicatedBy?:string;adjudicatedAt?:string; }
export interface ScientificImpactReportRecord { id:string;organizationId:string;kind:'QURAN_SOURCE_REVOCATION'|'AI_CAPABILITY_SUSPENSION'|'MODEL_CHANGE'|'DATASET_REVOCATION';entityId:string;reason:string;futureUseBlocked:boolean;affectedCompetitionIds:string[];affectedHistoricalRecordIds:string[];createdAt:string;createdBy:string; }
export interface ScientificDatasetRecord { id:string;organizationId:string;name:string;version:string;purpose:string;source:string;license?:string;consent:string[];recordingProvenance:string;qiraah:string;rawi:string;tariq?:string;speakerCount:number;utteranceCount:number;hours:number;ageDistribution?:string;genderCoverage?:string;nativeNonNativeDistribution?:string;accentDistribution?:string;deviceDistribution?:string;environmentDistribution?:string;annotationSchema:string;annotationVersion:string;annotators:string[];annotatorQualifications:string[];blindAnnotation:boolean;interRaterAgreement?:number;adjudicationMethod?:string;goldLabelMethod?:string;trainSplit:string;validationSplit:string;testSplit:string;speakerLeakageChecked:boolean;contentLeakageChecked:boolean;datasetHash:string;status:'RESEARCH'|'VALIDATION'|'APPROVED_BENCHMARK'|'REVOKED'; }
export interface BenchmarkRunRecord { id:string;organizationId:string;modelName:string;modelVersion:string;capability:AICapability;qiraah:string;rawi:string;tariq?:string;datasetId:string;datasetVersion:string;benchmark:string;benchmarkVersion:string;ranAt:string;metrics:{phonemeErrorRate?:number;precision?:number;recall?:number;f1?:number;falseAcceptanceRate?:number;falseRejectionRate?:number;diagnosticErrorRate?:number;sensitivity?:number;specificity?:number;calibrationError?:number;expectedCalibrationError?:number};calibrationCurve?:{lower:number;upper:number;count:number;meanConfidence:number;observedAccuracy:number}[];groupMetrics?:Record<string,Record<string,number>>;confusionMatrix?:number[][];reproducibility:{codeVersion:string;split:string;seed:string;evaluationScriptVersion:string;metricDefinitionsVersion:string;environment?:string};status:'COMPLETED'|'INVALIDATED'; }
export interface PolicyCompilerEvidence { id:string;sourceFileName:string;sourceType:'pdf'|'docx'|'text'|'form'|'genome';page?:number;lineStart?:number;lineEnd?:number;excerpt:string; }
export interface PolicyCompilerRule { id:string;category:string;summary:string;genomePath:string;proposedValue:unknown;confidence:'HIGH'|'MEDIUM'|'LOW';state:'UNDERSTOOD'|'NEEDS_REVIEW'|'CONFLICT';evidenceIds:string[]; }
export interface PolicyCompilationRecord { id:string;competitionId:string;sourceFileName:string;sourceType:'pdf'|'docx'|'text'|'form'|'genome';sourceHash:string;createdAt:string;createdBy:string;state:'EXTRACTED'|'DRAFT'|'REVIEWED'|'SIMULATED'|'PUBLISHED'|'REJECTED';rules:PolicyCompilerRule[];evidence:PolicyCompilerEvidence[];proposedPolicyVersion:string;humanApprovedBy?:string;simulatedAt?:string;simulationHash?:string;simulationSummary?:{blockers:number;reviews:number;infos:number};publishedAt?:string;publishedGenomeVersion?:string; }
export interface ContradictionIssueRecord { id:string;competitionId:string;severity:'BLOCKER'|'REVIEW'|'INFO';kind:'logical'|'scientific'|'privacy'|'operational'|'resource'|'permission'|'publication'|'blind_judging'|'qiraah_ai'|'certificate';title:string;why:string;affectedWorkflow:string;evidence:string[];fixTarget:'competition_dna'|'scientific'|'field'|'trust'|'privacy'|'none'; }
export interface CeremonyVaultRecord { id:string;competitionId:string;resultPackageHash:string;encryptedPayload?:string;encryptionAlgorithm?:string;keyManagement:'development_adapter'|'production_external_kms';quorumActionId:string;status:'SEALED'|'READY'|'REVEALED'|'REVOKED';createdAt:string;revealTimestamp?:string;publicCommitmentHash:string; }
export interface DisasterPackRecord { id:string;competitionId:string;version:string;createdAt:string;createdBy:string;packageHash:string;encryptedPayload:string;encryptionMode:'development_adapter'|'production_kms';contentsManifest:string[];status:'EXPORTED'|'VERIFIED'|'RESTORE_TESTED'|'REVOKED';verifiedAt?:string;restoreTestedAt?:string; }
export interface DeviceReassignmentRecord { id:string;competitionId:string;failedDeviceId:string;spareDeviceId:string;fromRole?:DeviceRecord['role'];toRole:DeviceRecord['role'];requiredCachedState:string[];status:'PROPOSED'|'APPROVED'|'DISMISSED'|'APPLIED'|'BLOCKED';reason:string;createdAt:string;decidedAt?:string;decidedBy?:string; }
export interface JudgeFatigueRecommendationRecord { id:string;competitionId:string;committeeId:string;continuousMinutes:number;sessions:number;timeSinceBreakMinutes:number;recommendedBreakMinutes:number;policyTargetMinutes:number;message:string;status:'RECOMMENDED'|'APPROVED'|'DISMISSED'|'DISABLED';createdAt:string; }
export interface FairDrawProofRecord {
  id:string;competitionId:string;questionSetId:string;algorithmVersion:string;ruleVersion:string;poolVersion:string;poolSnapshotHash:string;constraintHash:string;seedCommitmentHash:string;publicCommitmentHash:string;secretSeed?:string;selectionIds:string[];status:'COMMITTED'|'REVEALED'|'VERIFIED';createdAt:string;revealedAt?:string;
  participantReading?:string; qiraah?:string; rawi?:string; tariq?:string; variantLocusVersion?:string; difficultyMetadataVersion?:string; quranSourceManifestId?:string; quranSourcePackageHash?:string;
  constraints?:{questionsPerParticipant:number;targetDifficulty:number;difficultyTolerance:number;diversity:CompetitionPolicy['questions']['diversity'];maxJuz?:number;excludedIds?:string[]};
  eligiblePoolSnapshot?:{id:string;riwaya:string;surahNumber:number;startAyah:number;endAyah:number;juzNumber:number;difficultyRating:number;mutashabihatDensity:QuestionPoolItem['mutashabihatDensity'];tajweedComplexity:QuestionPoolItem['tajweedComplexity']}[];
  verificationStatement?:string;
}
export interface FederationTrustRecord { id:string;organizationId:string;issuer:string;issuerKeyId?:string;trusted:boolean;claimScopes:FederationClaimType[];updatedAt:string;updatedBy:string; }
export interface CompetitionBenchmarkRecord { id:string;competitionId:string;metric:string;value:number;basis:'OBSERVED'|'ESTIMATE'|'EXTERNAL_BENCHMARK';cohortSize:number;peerGroup?:string;minimumCohortSize:number;createdAt:string; }
export interface RehearsalCheckRecord { id:string;name:string;status:'PASS'|'WARNING'|'FAIL';impact:string;evidence:string[];fix?:string; }
export interface RehearsalRecord { id:string;competitionId:string;nonOfficial:true;startedAt:string;completedAt:string;createdBy:string;checks:RehearsalCheckRecord[];status:'PASS'|'PASS_WITH_WARNINGS'|'FAIL';reportHash:string;signedReport?:string; }

export interface QuestionRevealGateRecord {
  id:string;competitionId:string;sessionId:string;participantId:string;committeeId:string;questionIndex:number;
  participantPresence:{verified:boolean;verifiedAt?:string;verifiedBy?:string;method?:'participant_pass'|'manual_visual_confirmation'};
  requiredJudgeIds:string[];approvals:{judgeId:string;judgeName:string;approvedAt:string}[];
  status:'SEALED'|'READY'|'REVEALED'|'CANCELLED';createdAt:string;revealedAt?:string;
  questionCommitmentHash:string;quranSourcePackageHash?:string;
  revealAssurance:'development_client_gate'|'operational_panel_gate'|'production_server_escrow';
}
export interface QueueTransferRecord {
  id:string;competitionId:string;sourceCommitteeId:string;targetCommitteeId:string;participantIds:string[];
  mode:'PRESERVE_ORIGINAL_TURN'|'MOVE_TO_END';reason:string;requestedAt:string;requestedBy:string;
  status:'APPLIED'|'REJECTED';changes:{participantId:string;previousOrderKey:number;nextOrderKey:number;originalQueueNumber?:number}[];
}

// ---- Global Integrity Protocol / next-generation judging integrity -----------------------
export interface CompetitionBlackBoxRecord { id:string;competitionId:string;createdAt:string;eventCount:number;streams:string[];genesisHash:string;headHash:string;timelineHash:string;verificationState:'VERIFIED'|'FAILED';assurance:'client_hash_chain'|'server_evidence_ledger'|'external_worm'; }
export interface FairnessCourtScenario { id:string;label:string;kind:'REMOVE_JUDGE'|'TIEBREAK_VARIANT'|'DROP_EXTREME'|'REWEIGHT_ALLOWED';baselineRank:string[];scenarioRank:string[];rankChanges:number;winnerChanged:boolean;notes:string; }
export interface FairnessConstitutionalCourtRecord { id:string;competitionId:string;createdAt:string;resultSetHash:string;status:'STABLE'|'REVIEW';scenarios:FairnessCourtScenario[];maximumRankMovement:number;winnerChangedInAnyPermittedScenario:boolean;nonOfficial:true; }
export interface AcousticVenuePassportRecord { id:string;competitionId:string;venueZone:string;deviceId?:string;createdAt:string;createdBy:string;policyVersion:string;measurements:{noiseFloorDb?:number;clippingPercent?:number;packetLossPercent?:number;sampleRate?:number;echoScore?:number;snrDb?:number};checks:{id:string;label:string;status:'PASS'|'REVIEW'|'FAIL';observed?:number;threshold?:number;unit?:string}[];status:'PASS'|'PASS_WITH_WARNINGS'|'FAIL';scopeNote:string; }
export interface RecitationDigitalTwinRecord { id:string;competitionId:string;sourceManifestId:string;sourcePackageHash:string;qiraah:string;rawi:string;tariq?:string;wajh?:string;surah:number;ayahStart:number;ayahEnd:number;variantLocusIds:string[];allowedWujuh:string[];phonemeSchemaVersion?:string;expectedSequenceHash:string;createdAt:string;state:'SOURCE_BOUND'|'PENDING_SCIENTIFIC_ENRICHMENT'; }
export interface MutashabihatTrapRecord { id:string;competitionId:string;sourceManifestId:string;qiraah:string;rawi:string;tariq?:string;expected:{surah:number;ayah:number};possible:{surah:number;ayah:number};similarityEvidence:{kind:'TEXTUAL'|'VARIANT_LOCUS'|'EXPERT';score?:number;reference?:string};status:'REVIEW_MAP'|'APPROVED';createdAt:string;approvedBy?:string; }
export interface MultiRiwayahRoutingDecisionRecord { id:string;competitionId:string;participantId:string;participantReading:string;createdAt:string;candidates:{committeeId:string;eligible:boolean;score:number;reasons:string[]}[];selectedCommitteeId?:string;status:'ROUTED'|'NO_ELIGIBLE_COMMITTEE';explanation:string; }
export interface AppealCapsuleRecord { id:string;competitionId:string;participantId:string;appealId?:string;createdAt:string;createdBy:string;privacyScope:'APPEAL_PANEL_ONLY';evidenceRefs:string[];includedKinds:string[];excludedKinds:string[];capsuleHash:string;status:'READY'|'REVOKED'; }
export interface BlindAnchorCalibrationRecord { id:string;competitionId:string;rehearsalId?:string;anchorSetVersion:string;createdAt:string;nonOfficial:true;judgeCount:number;aggregateMedianDeviation:number;aggregateAgreementRate:number;committeeSummaries:{committeeId:string;sampleCount:number;medianDeviation:number;agreementRate:number;status:'CALIBRATED'|'REVIEW'}[];individualRankingProhibited:true; }
export interface IntegrityEntropySignalRecord { id:string;competitionId:string;createdAt:string;windowStart:string;windowEnd:string;signals:{kind:'REPEATED_TRANSFER'|'REVEAL_PATTERN'|'DEVICE_CHURN'|'EXCEPTION_CLUSTER'|'REISSUE_CLUSTER'|'RETEST_CLUSTER';entityRef:string;count:number;baseline?:number;severity:'INFO'|'REVIEW'|'HIGH';explanation:string}[];status:'CLEAR'|'REVIEW';accusationProhibited:true; }
export interface ScientificCircuitBreakerRecord { id:string;organizationId:string;competitionId?:string;createdAt:string;createdBy:string;triggerType:'QURAN_SOURCE'|'AI_CAPABILITY'|'DATASET'|'BENCHMARK'|'REFERENCE_AUDIO';triggerRef:string;reason:string;affectedCapabilities:string[];affectedCompetitionIds:string[];action:'SUSPEND_FUTURE_USE'|'REVOKE_FUTURE_USE';historicalRecordsRewritten:false;status:'ACTIVE'|'RESOLVED';resolvedAt?:string;resolvedBy?:string; }
export interface MizanIntegrityPassportRecord { id:string;competitionId:string;createdAt:string;competitionName:string;protocolVersion:string;publicClaims:{quranSourceAuthority?:string;quranSourcePackageHash?:string;fairDrawAlgorithm?:string;fairDrawCommitment?:string;rehearsalStatus?:string;quorumPolicy?:string;resultRootHash?:string;certificateVerifier?:string;auditAssurance?:string};privacy:{participantIdentities:false;judgeScores:false;rawAudio:false};passportHash:string;signatureRef?:string;status:'DRAFT'|'ISSUED'|'REVOKED'; }

// ---- MIZAN next integrity surface ----------------------------------------------------------
export interface WitnessModeRecord { version?:1|2;id:string;competitionId:string;organizationId:string;actionType:'QUESTION_REPLACEMENT'|'FULL_RETEST'|'PASS_REISSUE'|'EMERGENCY_UNSEAL'|'RESULT_OVERRIDE';targetRef:string;reason:string;initiatedBy:string;createdAt:string;expiresAt:string;requiredWitnesses:number;allowedWitnessRoles?:string[];requireDistinctRoles?:boolean;attestations:{uid:string;role:string;attestedAt:string;evidenceRef?:string;previousHash?:string;attestationHash?:string}[];state:'PENDING'|'READY'|'EXPIRED'|'REVOKED';commitmentHash:string;evidenceHash?:string; }
export interface IntegrityCinemaScene { id:string;timestamp:string;kind:'ARRIVAL'|'QUEUE'|'QUESTION'|'JUDGING'|'CONTINUITY'|'RESULT'|'AUDIT'|'INCIDENT';titleArabic:string;titleEnglish:string;evidenceRefs:string[];sceneHash:string; }
export interface IntegrityCinemaRecord { id:string;competitionId:string;createdAt:string;blackBoxHeadHash?:string;sceneCount:number;scenes:IntegrityCinemaScene[];cinemaHash:string;privacySafe:true;status:'READY'|'REVIEW'; }
export interface CertifiedVenueSealRecord { id:string;competitionId:string;venueZone:string;createdAt:string;createdBy:string;acousticPassportId?:string;checks:{id:string;labelArabic:string;labelEnglish:string;status:'PASS'|'REVIEW'|'FAIL';evidence?:string}[];status:'CERTIFIED_READY'|'READY_WITH_REVIEW'|'NOT_READY';baseline:{deviceFingerprint:string;softwareFingerprint:string;audioFingerprint?:string;sourcePackageHash?:string;edgeCheckpoint?:string};sealHash:string;invalidatedAt?:string;invalidatedReason?:string; }
export interface ExposureRadiusSnapshot { sessionId:string;competitionId:string;allowedRecipientCount:number;uniqueExposedRecipients:number;unexpectedRecipientCount:number;unexpectedRecipientIds:string[];withinConfiguredRadius:boolean;questionExposureCounts:{questionIndex:number;uniqueRecipients:number;totalReveals:number}[]; }
export interface QuestionCustodyCorridorSnapshot { sessionId:string;competitionId:string;participantPresent:boolean;state:string;plaintextIncluded:false;questions:{questionIndex:number;commitmentHash:string;state:'SEALED'|'PRESENCE_VERIFIED'|'QUORUM_PENDING'|'RELEASED';approved:number;required:number;exposureCount:number}[]; }
