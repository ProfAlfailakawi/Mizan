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
  | 'auditor';

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
}

export interface OrganizationBrand {
  name: string;
  nameArabic: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  headerBackground?: string;
  subdomain?: string;
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
  riwaya: string; // e.g. Hafs, Warsh, Qalun, Al-Duri
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
  judgeId: string;
  judgeName: string;
  sessionId: string;
  criterionScores: Record<string, number>;
  totalScore: number;
  eventsCount: number;
  submittedAt: string;
  locked: boolean;
}

export interface AIObservation {
  id: string;
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
}

export interface ReviewCase {
  id: string;
  sessionId: string;
  participantId: string;
  participantCode: string;
  committeeId: string;
  reason: 'judge_variance' | 'ai_high_confidence_alert' | 'audio_dropout' | 'score_outlier';
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
    sealedAt: string;
    cryptographicChecksum: string;
    dualApprovalBy?: string;
  };
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
  type: 'power' | 'network' | 'audio_mic' | 'device' | 'judge_absence' | 'participant_emergency';
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
}

export interface WorkflowStagePolicy {
  id: string;
  enabled: boolean;
  automated: boolean;
  requiresApproval: boolean;
}

export interface OperationsPolicy {
  selfCheckIn: boolean;
  kioskCheckIn: boolean;
  exceptionDesk: boolean;
  smartArrivalSlots: boolean;
  autoRouting: boolean;
  publicQueueUsesCodesOnly: boolean;
  offlineContinuity: boolean;
  lateArrivalGraceMinutes: number;
  badgeMode: 'digital' | 'print' | 'both' | 'none';
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
  | 'broadcast.manage';
