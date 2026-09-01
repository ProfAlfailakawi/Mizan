import {
  Competition,
  CompetitionPolicy,
  CompetitionTemplate,
  JudgeActionDefinition,
  RuleSet
} from '../types';

const DEFAULT_ACTIONS: JudgeActionDefinition[] = [
  { id: 'act-major', eventType: 'major_mistake', labelArabic: 'خطأ', labelEnglish: 'Error', shortArabic: 'خطأ', shortEnglish: 'Error', criterion: 'memorization', penalty: 1, enabled: true, shortcut: '1', icon: 'error' },
  { id: 'act-alert', eventType: 'prompt_alert', labelArabic: 'تنبيه', labelEnglish: 'Prompt', shortArabic: 'تنبيه', shortEnglish: 'Prompt', criterion: 'memorization', penalty: 0.5, enabled: true, shortcut: '2', icon: 'alert' },
  { id: 'act-open', eventType: 'open_correction', labelArabic: 'فتح', labelEnglish: 'Open', shortArabic: 'فتح', shortEnglish: 'Open', criterion: 'memorization', penalty: 1, enabled: true, shortcut: '3', icon: 'open' },
  { id: 'act-repeat', eventType: 'repetition', labelArabic: 'تكرار', labelEnglish: 'Repeat', shortArabic: 'تكرار', shortEnglish: 'Repeat', criterion: 'memorization', penalty: 0.25, enabled: true, shortcut: '4', icon: 'repeat' },
  { id: 'act-tajweed', eventType: 'tajweed_minor', labelArabic: 'تجويد', labelEnglish: 'Tajweed', shortArabic: 'تجويد', shortEnglish: 'Tajweed', criterion: 'tajweed', penalty: 0.25, enabled: true, shortcut: '5', icon: 'tajweed' },
  { id: 'act-stop', eventType: 'waqf_stop', labelArabic: 'وقف', labelEnglish: 'Stop', shortArabic: 'وقف', shortEnglish: 'Stop', criterion: 'waqf_ibtida', penalty: 0.5, enabled: true, shortcut: '6', icon: 'stop' }
];

export const BASE_POLICY: CompetitionPolicy = {
  version: '1.0.0',
  registration: {
    mode: 'hybrid',
    accountMode: 'otp',
    autoApproveEligible: true,
    requireIdentityVerification: true,
    requireGuardianForMinors: true,
    fields: [
      { id: 'fullNameArabic', labelArabic: 'الاسم بالعربية', labelEnglish: 'Arabic name', type: 'text', required: true, visible: true },
      { id: 'fullName', labelArabic: 'الاسم بالإنجليزية', labelEnglish: 'English name', type: 'text', required: true, visible: true },
      { id: 'email', labelArabic: 'البريد', labelEnglish: 'Email', type: 'email', required: true, visible: true },
      { id: 'phone', labelArabic: 'الهاتف', labelEnglish: 'Phone', type: 'phone', required: true, visible: true },
      { id: 'country', labelArabic: 'الدولة', labelEnglish: 'Country', type: 'text', required: true, visible: true },
      { id: 'nationality', labelArabic: 'الجنسية', labelEnglish: 'Nationality', type: 'text', required: false, visible: false },
      { id: 'dateOfBirth', labelArabic: 'تاريخ الميلاد', labelEnglish: 'Date of birth', type: 'date', required: true, visible: true },
      { id: 'gender', labelArabic: 'الفئة', labelEnglish: 'Gender', type: 'select', required: false, visible: false, options:[{value:'male',labelArabic:'رجال',labelEnglish:'Male'},{value:'female',labelArabic:'نساء',labelEnglish:'Female'}] },
      { id: 'identity', labelArabic: 'رقم الهوية / الجواز', labelEnglish: 'ID / Passport number', type: 'text', required: true, visible: true }
    ],
    eligibility: []
  },
  judging: {
    mode: 'hybrid',
    identityVisibility: 'code_only',
    independentUntilLock: true,
    scoreEntryMode: 'event_based',
    actions: DEFAULT_ACTIONS,
    requireAudioRecording: true,
    allowPhysicalJudgePad: true,
    allowCertifiedAudioPrompt: true,
    silentAiGuardian: true,
    aiCanAffectScore: false,
    reviewThreshold: 'balanced',
    calibrationRequired: true,
    reserveJudgeAllowed: true,
    directScoreStep: 0.25
  },
  questions: {
    drawMode: 'fairdraw',
    participantInitiatedDraw: true,
    questionsPerParticipant: 3,
    targetDifficulty: 3,
    difficultyTolerance: 0.75,
    avoidRepeatWithinRound: true,
    diversity: { acrossJuz: true, acrossSurah: true, mutashabihatBalance: true },
    promptMode: 'configurable'
  },
  operations: {
    selfCheckIn: true,
    kioskCheckIn: true,
    exceptionDesk: true,
    smartArrivalSlots: true,
    autoRouting: true,
    publicQueueUsesCodesOnly: true,
    offlineContinuity: true,
    lateArrivalGraceMinutes: 20,
    badgeMode: 'digital'
  },
  results: {
    visibility: 'ceremony_only',
    publicLeaderboard: 'top_only',
    requireDualApprovalToSeal: true,
    qualificationRule: 'top_n',
    qualificationValue: 20,
    tieBreakRules: ['memorization_priority', 'tajweed_priority', 'fewest_penalties']
  },
  appeals: {
    enabled: true,
    windowHours: 12,
    grounds: ['scoring_miscalculation', 'audio_interruption', 'question_scope_dispute'],
    reviewerRole: 'head_judge',
    allowScoreChange: true
  },
  certificates: {
    enabled: true,
    autoIssue: true,
    issueFor: 'all_participants',
    showScore: false,
    showRank: true,
    publicVerification: true,
    titleArabic: 'شهادة مشاركة',
    titleEnglish: 'Participation Certificate',
    awardTextArabic: 'تشهد الجهة المنظمة بإتمام المشاركة وفق لائحة المسابقة المعتمدة.',
    awardTextEnglish: 'The organizer certifies completion of participation under the approved competition rules.',
    verificationBasePath: '/verify',
    signatories: []
  },
  privacy: {
    audioRetentionDays: 90,
    documentRetentionDays: 365,
    displayParticipantNameOnPublicScreens: false,
    allowAiProcessing: true,
    allowAnonymousBenchmarking: false
  },
  workflow: [
    { id: 'register', enabled: true, automated: true, requiresApproval: false },
    { id: 'verify', enabled: true, automated: true, requiresApproval: false },
    { id: 'approve', enabled: true, automated: true, requiresApproval: false },
    { id: 'schedule', enabled: true, automated: true, requiresApproval: false },
    { id: 'notify', enabled: true, automated: true, requiresApproval: false },
    { id: 'checkin', enabled: true, automated: true, requiresApproval: false },
    { id: 'route', enabled: true, automated: true, requiresApproval: false },
    { id: 'draw', enabled: true, automated: true, requiresApproval: false },
    { id: 'judge', enabled: true, automated: false, requiresApproval: true },
    { id: 'integrity', enabled: true, automated: true, requiresApproval: false },
    { id: 'seal', enabled: true, automated: false, requiresApproval: true },
    { id: 'publish', enabled: true, automated: false, requiresApproval: true },
    { id: 'certificate', enabled: true, automated: true, requiresApproval: false }
  ],
  updatedAt: new Date().toISOString()
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const makeRule = (overrides?: Partial<RuleSet>): RuleSet => ({
  id: 'rules-global-hifz',
  version: '1.0.0',
  name: 'Configurable Hifz Protocol',
  judgesCountPerPanel: 3,
  dropExtremes: false,
  criteria: [
    { id: 'memorization', name: 'Memorization', nameArabic: 'الحفظ', maxScore: 70, weight: .7, assignedJudgeType: 'memorization' },
    { id: 'tajweed', name: 'Tajweed', nameArabic: 'التجويد', maxScore: 25, weight: .25, assignedJudgeType: 'tajweed' },
    { id: 'performance', name: 'Performance', nameArabic: 'حسن الأداء', maxScore: 5, weight: .05, assignedJudgeType: 'performance' }
  ],
  penalties: { mistake: 1, promptOpening: .5, repetition: .25, tajweedMinor: .25, tajweedMajor: .5, hesitationStop: .5 },
  questionsPerParticipant: 3,
  questionDurationMinutes: 8,
  minimumPassingScore: 80,
  tieBreakRules: ['memorization_priority', 'tajweed_priority', 'fewest_penalties'],
  appealsAllowed: true,
  appealWindowHours: 12,
  silentAIGuardianEnabled: true,
  ...overrides
});

export const COMPETITION_TEMPLATES: CompetitionTemplate[] = [
  {
    id: 'international-hifz',
    nameArabic: 'دولية — حفظ متقدم',
    nameEnglish: 'International Hifz',
    descriptionArabic: 'تحكيم مستقل، FairDraw، مراجعة نزاهة، وإعلان مرن للنتائج.',
    descriptionEnglish: 'Independent judging, FairDraw, integrity review and controlled result reveal.',
    policy: clone(BASE_POLICY),
    ruleSets: [makeRule()]
  },
  {
    id: 'youth-local',
    nameArabic: 'ناشئة — محلية',
    nameEnglish: 'Youth Local',
    descriptionArabic: 'تسجيل مبسط، ولي أمر، سؤالان، وتشغيل ذاتي سريع.',
    descriptionEnglish: 'Simplified guardian registration, two questions and fast autonomous flow.',
    policy: (() => {
      const p = clone(BASE_POLICY);
      p.templateId = 'youth-local';
      p.registration.mode = 'public';
      p.registration.requireGuardianForMinors = true;
      p.questions.questionsPerParticipant = 2;
      p.questions.targetDifficulty = 2.4;
      p.results.visibility = 'after_round';
      p.appeals.windowHours = 6;
      p.privacy.audioRetentionDays = 30;
      return p;
    })(),
    ruleSets: [makeRule({ id: 'rules-youth', questionsPerParticipant: 2, questionDurationMinutes: 5, minimumPassingScore: 70 })]
  },
  {
    id: 'recitation-performance',
    nameArabic: 'تلاوة وحسن أداء',
    nameEnglish: 'Recitation & Performance',
    descriptionArabic: 'تحكيم متخصص في التجويد والأداء مع درجات مباشرة أو هجينة.',
    descriptionEnglish: 'Specialized tajweed/performance judging with hybrid score entry.',
    policy: (() => {
      const p = clone(BASE_POLICY);
      p.templateId = 'recitation-performance';
      p.judging.mode = 'specialized_judges';
      p.judging.scoreEntryMode = 'hybrid';
      p.judging.actions = p.judging.actions.filter(a => ['tajweed_minor', 'waqf_stop'].includes(a.eventType));
      p.questions.questionsPerParticipant = 1;
      p.questions.drawMode = 'manual_approved';
      p.questions.participantInitiatedDraw = false;
      p.results.visibility = 'immediate';
      return p;
    })(),
    ruleSets: [makeRule({
      id: 'rules-recitation',
      judgesCountPerPanel: 5,
      questionsPerParticipant: 1,
      criteria: [
        { id: 'tajweed', name: 'Tajweed', nameArabic: 'التجويد', maxScore: 40, weight: .4, assignedJudgeType: 'tajweed' },
        { id: 'performance', name: 'Performance', nameArabic: 'حسن الأداء والصوت', maxScore: 60, weight: .6, assignedJudgeType: 'performance' }
      ]
    })]
  }
];

function mergePolicy<T>(base: T, override: Partial<T> | undefined): T {
  if (!override) return clone(base);
  if (Array.isArray(base)) return (Array.isArray(override) ? clone(override) : clone(base)) as T;
  if (base && typeof base === 'object') {
    const out: any = clone(base);
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
      const current = (out as any)[key];
      if (value !== undefined && current && typeof current === 'object' && !Array.isArray(current) && typeof value === 'object' && !Array.isArray(value)) {
        (out as any)[key] = mergePolicy(current, value as any);
      } else if (value !== undefined) {
        (out as any)[key] = clone(value as any);
      }
    }
    return out;
  }
  return (override ?? base) as T;
}

export function getCompetitionPolicy(competition: Competition): CompetitionPolicy {
  return mergePolicy(BASE_POLICY, competition.policy);
}

export function applyTemplate(competition: Competition, templateId: string): Competition {
  const template = COMPETITION_TEMPLATES.find(t => t.id === templateId);
  if (!template) return competition;
  const policy = clone(template.policy);
  policy.templateId = template.id;
  policy.updatedAt = new Date().toISOString();
  return {
    ...competition,
    policy,
    ruleSet: clone(template.ruleSets[0]),
    ruleSets: clone(template.ruleSets),
    automationLevel: policy.workflow.filter(w => w.enabled && w.automated).length > 8 ? 'autopilot' : 'automated'
  };
}

export function getEnabledJudgeActions(competition: Competition) {
  return getCompetitionPolicy(competition).judging.actions.filter(a => a.enabled);
}

export function getReadinessIssues(competition: Competition): { id: string; ar: string; en: string }[] {
  const p = getCompetitionPolicy(competition);
  const issues: { id: string; ar: string; en: string }[] = [];
  if (!competition.categories.length) issues.push({ id: 'categories', ar: 'أضف فئة واحدة على الأقل', en: 'Add at least one category' });
  if (!competition.ruleSet.criteria.length) issues.push({ id: 'rules', ar: 'أكمل معايير التحكيم', en: 'Complete judging criteria' });
  if (p.judging.actions.filter(a => a.enabled).length === 0 && p.judging.scoreEntryMode !== 'direct_score') issues.push({ id: 'actions', ar: 'حدد أدوات المحكم', en: 'Define judge actions' });
  if (p.questions.questionsPerParticipant < 1) issues.push({ id: 'questions', ar: 'عدد الأسئلة غير صالح', en: 'Question count is invalid' });
  if (p.results.requireDualApprovalToSeal && competition.ruleSet.judgesCountPerPanel < 2) issues.push({ id: 'seal', ar: 'الختم المزدوج يتطلب أكثر من جهة اعتماد', en: 'Dual seal requires multiple approvers' });
  if (!p.operations.exceptionDesk && (p.operations.selfCheckIn || p.operations.kioskCheckIn)) issues.push({ id: 'exceptions', ar: 'ينصح بمسار استثناء للحالات غير الطبيعية', en: 'An exception path is recommended for self-service operations' });
  return issues;
}
