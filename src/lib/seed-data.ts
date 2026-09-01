import {
  Organization,
  Competition,
  Category,
  RuleSet,
  Participant,
  Committee,
  JudgeProfile,
  ResultRecord,
  ReviewCase,
  Certificate,
  AuditEvent,
  IncidentRecord,
  User
} from '../types';

export const SEED_ORGANIZATION: Organization = {
  id: 'org-gqa-global',
  name: 'MIZAN Demo Competition Authority',
  nameArabic: 'جهة ميزان التجريبية للمسابقات القرآنية',
  code: 'GQA',
  brand: {
    name: 'MIZAN Demo Award',
    nameArabic: 'جائزة ميزان التجريبية',
    primaryColor: '#0d1e18',
    accentColor: '#10b981',
    headerBackground: '#0d1e18',
    subdomain: 'award'
  },
  plan: 'enterprise',
  dataResidency: 'eu-west-locked',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z'
};

export const SEED_USERS: User[] = [
  {
    id: 'usr-super-1',
    name: 'MIZAN Platform Demo Admin',
    nameArabic: 'مدير المنصة التجريبي',
    email: 'super@mizan.org',
    role: 'super_admin',
    organizationId: 'org-gqa-global'
  },
  {
    id: 'usr-comp-admin-1',
    name: 'MIZAN Competition Demo Admin',
    nameArabic: 'مدير المسابقة التجريبي',
    email: 'admin@award.gov',
    role: 'comp_admin',
    organizationId: 'org-gqa-global',
    competitionId: 'comp-dubai-2027'
  },
  {
    id: 'usr-head-judge-1',
    name: 'MIZAN Demo Head Judge',
    nameArabic: 'رئيس التحكيم التجريبي',
    email: 'headjudge@award.gov',
    role: 'head_judge',
    organizationId: 'org-gqa-global',
    competitionId: 'comp-dubai-2027'
  },
  {
    id: 'usr-judge-1',
    name: 'MIZAN Demo Judge 1',
    nameArabic: 'المحكم التجريبي ١',
    email: 'judge1@award.gov',
    role: 'judge',
    organizationId: 'org-gqa-global',
    competitionId: 'comp-dubai-2027'
  },
  {
    id: 'usr-ops-1',
    name: 'Fahad Al-Husseini',
    nameArabic: 'أ. فهد الحسيني',
    email: 'ops@award.gov',
    role: 'ops_manager',
    organizationId: 'org-gqa-global',
    competitionId: 'comp-dubai-2027'
  },
  {
    id: 'usr-exception-1',
    name: 'Salim Al-Kandari',
    nameArabic: 'سالم الكندري',
    email: 'host@award.gov',
    role: 'exception_host',
    organizationId: 'org-gqa-global',
    competitionId: 'comp-dubai-2027'
  },
  {
    id: 'usr-part-1',
    name: 'Bilal Ahmad Al-Sayed',
    nameArabic: 'بلال أحمد السيد',
    email: 'bilal.sayed@gmail.com',
    role: 'participant',
    organizationId: 'org-gqa-global',
    competitionId: 'comp-dubai-2027'
  }
];

export const SEED_RULESET: RuleSet = {
  id: 'rule-int-canon-2027',
  version: '2.4.0-canonical',
  name: 'Standard International Quran Competition Scoring Protocol',
  judgesCountPerPanel: 3,
  dropExtremes: false,
  criteria: [
    {
      id: 'crit-memorization',
      name: 'Memorization (Hifz & Accuracy)',
      nameArabic: 'الحفظ والضبط والإتقان',
      maxScore: 70,
      weight: 0.7,
      assignedJudgeType: 'memorization'
    },
    {
      id: 'crit-tajweed',
      name: 'Tajweed & Makharij',
      nameArabic: 'التجويد ومخارج الحروف وصفاتها',
      maxScore: 25,
      weight: 0.25,
      assignedJudgeType: 'tajweed'
    },
    {
      id: 'crit-performance',
      name: 'Waqf, Ibtida & Voice Poise',
      nameArabic: 'الوقف والابتداء وحسن الأداء',
      maxScore: 5,
      weight: 0.05,
      assignedJudgeType: 'performance'
    }
  ],
  penalties: {
    mistake: 0.5,
    promptOpening: 1.0,
    repetition: 0.25,
    tajweedMinor: 0.25,
    tajweedMajor: 0.5,
    hesitationStop: 0.5
  },
  questionsPerParticipant: 3,
  questionDurationMinutes: 8,
  minimumPassingScore: 80,
  tieBreakRules: ['memorization_priority', 'tajweed_priority', 'fewest_penalties'],
  appealsAllowed: true,
  appealWindowHours: 12,
  silentAIGuardianEnabled: true,
  frozenAt: '2026-08-15T10:00:00Z'
};

export const SEED_CATEGORIES: Category[] = [
  {
    id: 'cat-full-quran',
    competitionId: 'comp-dubai-2027',
    code: 'CAT-01',
    name: 'Full Quran with Tajweed & Qiraat',
    nameArabic: 'الفرع الأول: حفظ القرآن الكريم كاملاً مع التجويد والقراءات',
    description: 'Complete 30 Juz memorization with rigorous recitation guidelines',
    riwaya: 'حفص عن عاصم / ورش / قالون',
    memorizationScope: 'كامل القرآن (30 جزءاً)',
    juzCount: 30,
    maxAge: 25,
    targetParticipants: 60,
    targetDurationMinutes: 12
  },
  {
    id: 'cat-20-juz',
    competitionId: 'comp-dubai-2027',
    code: 'CAT-02',
    name: '20 Consecutive Juz',
    nameArabic: 'الفرع الثاني: حفظ عشرين جزءاً متتالية',
    description: 'Twenty consecutive parts with Tajweed mastery',
    riwaya: 'حفص عن عاصم',
    memorizationScope: '20 جزءاً',
    juzCount: 20,
    maxAge: 20,
    targetParticipants: 45,
    targetDurationMinutes: 9
  },
  {
    id: 'cat-10-juz',
    competitionId: 'comp-dubai-2027',
    code: 'CAT-03',
    name: '10 Juz for Youth',
    nameArabic: 'الفرع الثالث: حفظ عشرة أجزاء للناشئة',
    description: 'Youth category for emerging reciters',
    riwaya: 'حفص عن عاصم',
    memorizationScope: '10 أجزاء',
    juzCount: 10,
    maxAge: 15,
    targetParticipants: 50,
    targetDurationMinutes: 7
  }
];

export const SEED_COMPETITION: Competition = {
  id: 'comp-dubai-2027',
  organizationId: 'org-gqa-global',
  name: 'MIZAN Demo International Quran Competition 2027',
  nameArabic: 'مسابقة ميزان القرآنية الدولية التجريبية 2027',
  edition: '14th International Edition',
  country: 'الإمارات العربية المتحدة (United Arab Emirates)',
  timezone: 'Asia/Dubai',
  status: 'live',
  automationLevel: 'autopilot',
  startDate: '2027-02-10',
  endDate: '2027-02-15',
  registrationStartDate: '2026-11-01',
  registrationEndDate: '2027-01-15',
  categories: SEED_CATEGORIES,
  ruleSet: SEED_RULESET,
  venueName: 'Grand Conference & Recitation Auditorium (Main Hall)',
  venuesCount: 3,
  totalRegistered: 184,
  totalApproved: 142,
  totalAttended: 138,
  currentDay: 2,
  totalDays: 4,
  readinessChecklist: {
    datesConfigured: true,
    categoriesConfigured: true,
    ruleSetFrozen: true,
    judgesAssigned: true,
    quranSourceLocked: true,
    devicesRegistered: true,
    certificatesReady: true
  }
};

export const SEED_COMMITTEES: Committee[] = [
  {
    id: 'comm-1',
    competitionId: 'comp-dubai-2027',
    name: 'Committee 1 (Main Podium)',
    nameArabic: 'اللجنة الأولى (القاعة الرئيسية A)',
    code: 'C1',
    venueHall: 'Auditorium Hall A',
    assignedCategories: ['cat-full-quran'],
    headJudgeId: 'usr-head-judge-1',
    judgeIds: ['usr-judge-1', 'usr-judge-2', 'usr-judge-3'],
    status: 'testing',
    currentParticipantId: 'part-104',
    completedCount: 28,
    averageSessionMinutes: 9.4,
    audioInputOk: true,
    devicesConnected: 4
  },
  {
    id: 'comm-2',
    competitionId: 'comp-dubai-2027',
    name: 'Committee 2 (North Hall)',
    nameArabic: 'اللجنة الثانية (القاعة الشمالية B)',
    code: 'C2',
    venueHall: 'Recitation Hall B',
    assignedCategories: ['cat-20-juz'],
    headJudgeId: 'usr-head-judge-2',
    judgeIds: ['usr-judge-4', 'usr-judge-5', 'usr-judge-6'],
    status: 'ready',
    completedCount: 34,
    averageSessionMinutes: 8.1,
    audioInputOk: true,
    devicesConnected: 4
  },
  {
    id: 'comm-3',
    competitionId: 'comp-dubai-2027',
    name: 'Committee 3 (East Hall)',
    nameArabic: 'اللجنة الثالثة (القاعة الشرقية C)',
    code: 'C3',
    venueHall: 'Recitation Hall C',
    assignedCategories: ['cat-10-juz'],
    headJudgeId: 'usr-head-judge-3',
    judgeIds: ['usr-judge-7', 'usr-judge-8', 'usr-judge-9'],
    status: 'ready',
    completedCount: 40,
    averageSessionMinutes: 6.8,
    audioInputOk: true,
    devicesConnected: 4
  }
];

export const SEED_JUDGES: JudgeProfile[] = [
  {
    id: 'judge-prof-1',
    userId: 'usr-head-judge-1',
    name: 'MIZAN Demo Head Judge',
    nameArabic: 'رئيس التحكيم التجريبي',
    title: 'Head of Scientific Jury & Ten Qiraat Scholar',
    country: 'Somalia / Qatar',
    specialty: 'all',
    certifiedRiwayat: ['Hafs', 'Warsh', 'Qalun', 'Al-Duri', 'Al-Susi', 'Hamzah'],
    assignedCommitteeId: 'comm-1',
    conflictsDeclared: [],
    calibrationScore: 99.2,
    isReady: true
  },
  {
    id: 'judge-prof-2',
    userId: 'usr-judge-1',
    name: 'MIZAN Demo Judge 1',
    nameArabic: 'المحكم التجريبي ١',
    title: 'Former Grand Sheikh of Egyptian Reciters',
    country: 'Egypt',
    specialty: 'memorization',
    certifiedRiwayat: ['Hafs', 'Warsh', 'Qalun'],
    assignedCommitteeId: 'comm-1',
    conflictsDeclared: [],
    calibrationScore: 98.4,
    isReady: true
  },
  {
    id: 'judge-prof-3',
    userId: 'usr-judge-2',
    name: 'Sheikh Ibrahim Al-Akhdar',
    nameArabic: 'فضيلة الشيخ إبراهيم الأخضر',
    title: 'Sheikh of Reciters at Prophet Mosque (Madinah)',
    country: 'Saudi Arabia',
    specialty: 'tajweed',
    certifiedRiwayat: ['Hafs', 'Warsh'],
    assignedCommitteeId: 'comm-1',
    conflictsDeclared: [],
    calibrationScore: 97.9,
    isReady: true
  }
];

export const SEED_PARTICIPANTS: Participant[] = [
  {
    id: 'part-104',
    code: 'A-104',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Bilal Ahmad Al-Sayed',
    fullNameArabic: 'بلال أحمد السيد',
    email: 'bilal.sayed@gmail.com',
    phone: '+971501234567',
    country: 'Jordan (الأردن)',
    nationality: 'Jordanian',
    nationalIdOrPassport: 'JOD-8849102',
    dateOfBirth: '2004-06-14',
    gender: 'male',
    categoryId: 'cat-full-quran',
    riwaya: 'Hafs',
    institution: 'Ministry of Awqaf Quranic Centers - Amman',
    status: 'in_session',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' },
      { status: 'checked_in', timestamp: '2027-02-11T08:45:12Z', actor: 'MIZAN Gate Kiosk-01' },
      { status: 'in_queue', timestamp: '2027-02-11T08:45:15Z', actor: 'Smart Routing Dispatcher' },
      { status: 'in_session', timestamp: '2027-02-11T09:12:00Z', actor: 'Committee C1 Caller' }
    ],
    arrivalSlot: '08:45–09:00',
    checkedInAt: '2027-02-11T08:45:12Z',
    checkInMethod: 'kiosk_qr',
    assignedCommitteeId: 'comm-1',
    queueNumber: 1,
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-105',
    code: 'A-105',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Zaid Omar Al-Husseini',
    fullNameArabic: 'زيد عمر الحسيني',
    email: 'zaid.omar@gmail.com',
    phone: '+96599881122',
    country: 'Kuwait (الكويت)',
    nationality: 'Kuwaiti',
    nationalIdOrPassport: 'KWT-29901452',
    dateOfBirth: '2005-01-20',
    gender: 'male',
    categoryId: 'cat-full-quran',
    riwaya: 'Hafs',
    institution: 'Kuwait Grand Mosque Quran Academy',
    status: 'in_queue',
    statusHistory: [
      { status: 'approved', timestamp: '2026-11-15T10:00:00Z', actor: 'Auto Engine' },
      { status: 'checked_in', timestamp: '2027-02-11T08:52:30Z', actor: 'MIZAN Gate Kiosk-02' }
    ],
    arrivalSlot: '08:50–09:10',
    checkedInAt: '2027-02-11T08:52:30Z',
    checkInMethod: 'kiosk_qr',
    assignedCommitteeId: 'comm-1',
    queueNumber: 2,
    createdAt: '2026-11-13T10:00:00Z'
  },
  {
    id: 'part-106',
    code: 'A-106',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Yassine Abdul-Karim Mansoor',
    fullNameArabic: 'ياسين عبد الكريم منصور',
    email: 'yassine.m@gmail.com',
    phone: '+212612345678',
    country: 'Morocco (المغرب)',
    nationality: 'Moroccan',
    nationalIdOrPassport: 'MAR-C492019',
    dateOfBirth: '2003-09-10',
    gender: 'male',
    categoryId: 'cat-full-quran',
    riwaya: 'Warsh',
    institution: 'Mohammed VI Institute for Qiraat - Rabat',
    status: 'in_queue',
    statusHistory: [
      { status: 'approved', timestamp: '2026-11-18T11:00:00Z', actor: 'Delegation Batch' },
      { status: 'checked_in', timestamp: '2027-02-11T09:00:10Z', actor: 'Mobile Self Check-in' }
    ],
    arrivalSlot: '09:00–09:20',
    checkedInAt: '2027-02-11T09:00:10Z',
    checkInMethod: 'mobile_self',
    assignedCommitteeId: 'comm-1',
    queueNumber: 3,
    createdAt: '2026-11-18T11:00:00Z'
  },
  {
    id: 'part-101',
    code: 'A-101',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Ibrahim Muhammad Al-Ansari',
    fullNameArabic: 'إبراهيم محمد الأنصاري',
    email: 'ibrahim.ansari@gmail.com',
    phone: '+966551122334',
    country: 'Saudi Arabia (المملكة العربية السعودية)',
    nationality: 'Saudi',
    nationalIdOrPassport: 'SAU-10928374',
    dateOfBirth: '2002-04-18',
    gender: 'male',
    categoryId: 'cat-full-quran',
    riwaya: 'Hafs',
    status: 'certified',
    statusHistory: [
      { status: 'tested', timestamp: '2027-02-10T10:30:00Z', actor: 'Committee C1' },
      { status: 'certified', timestamp: '2027-02-10T18:00:00Z', actor: 'Auto Certificate Engine' }
    ],
    createdAt: '2026-11-05T08:00:00Z'
  },
  {
    id: 'part-102',
    code: 'A-102',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Hamza Nur-ud-Din Farooq',
    fullNameArabic: 'حمزة نور الدين فاروق',
    email: 'hamza.farooq@gmail.com',
    phone: '+60129988776',
    country: 'Malaysia (ماليزيا)',
    nationality: 'Malaysian',
    nationalIdOrPassport: 'MYS-8802194',
    dateOfBirth: '2003-12-05',
    gender: 'male',
    categoryId: 'cat-full-quran',
    riwaya: 'Hafs',
    status: 'tested',
    statusHistory: [
      { status: 'tested', timestamp: '2027-02-10T11:15:00Z', actor: 'Committee C1' }
    ],
    createdAt: '2026-11-06T09:00:00Z'
  }
];

export const SEED_REVIEW_CASES: ReviewCase[] = [
  {
    id: 'rev-01',
    competitionId: SEED_COMPETITION.id,
    sessionId: 'sess-part-104-q1',
    participantId: 'part-104',
    participantCode: 'A-104',
    committeeId: 'comm-1',
    reason: 'judge_variance',
    severity: 'medium',
    timestampSec: 142,
    details: 'Judge 1 flagged mistake (-0.5) at 02:22 while Judge 2 flagged Tajweed note (-0.25). AI Silent Guardian detected potential hesitation restart.',
    audioClipUrl: 'https://cdn.mizan.org/audio/clips/clip-104-142.mp3',
    status: 'pending'
  },
  {
    id: 'rev-02',
    competitionId: SEED_COMPETITION.id,
    sessionId: 'sess-part-102-q2',
    participantId: 'part-102',
    participantCode: 'A-102',
    committeeId: 'comm-1',
    reason: 'ai_high_confidence_alert',
    severity: 'low',
    timestampSec: 215,
    details: 'AI Silent Guardian flagged subtle harakah vowel substitution (High Confidence 94%). Requires human review against the institution-approved Quran source before any decision.',
    status: 'pending'
  }
];

export const SEED_RESULTS: ResultRecord[] = [
  {
    id: 'res-1',
    competitionId: 'comp-dubai-2027',
    participantId: 'part-101',
    participantCode: 'A-101',
    participantName: 'Ibrahim Muhammad Al-Ansari',
    participantNameArabic: 'إبراهيم محمد الأنصاري',
    country: 'المملكة العربية السعودية (KSA)',
    categoryId: 'cat-full-quran',
    categoryName: 'Full Quran Memorization',
    finalScore: 99.25,
    rank: 1,
    status: 'sealed',
    sealMetadata: {
      sealedBy: 'MIZAN Demo Head Judge (Head Judge) & MIZAN Competition Demo Admin (Director)',
      sealedAt: '2027-02-11T16:00:00Z',
      cryptographicChecksum: 'DEMO:RESULT-SEAL-001',
      dualApprovalBy: 'Demo dual approval'
    },
    awardTitle: 'First Place',
    awardTitleArabic: 'المركز الأول'
  },
  {
    id: 'res-2',
    competitionId: 'comp-dubai-2027',
    participantId: 'part-102',
    participantCode: 'A-102',
    participantName: 'Hamza Nur-ud-Din Farooq',
    participantNameArabic: 'حمزة نور الدين فاروق',
    country: 'ماليزيا (Malaysia)',
    categoryId: 'cat-full-quran',
    categoryName: 'Full Quran Memorization',
    finalScore: 97.75,
    rank: 2,
    status: 'sealed',
    sealMetadata: {
      sealedBy: 'MIZAN Demo Head Judge',
      sealedAt: '2027-02-11T16:00:00Z',
      cryptographicChecksum: 'DEMO:RESULT-SEAL-002'
    },
    awardTitle: 'Second Place',
    awardTitleArabic: 'المركز الثاني'
  },
  {
    id: 'res-3',
    competitionId: 'comp-dubai-2027',
    participantId: 'part-106',
    participantCode: 'A-106',
    participantName: 'Yassine Abdul-Karim Mansoor',
    participantNameArabic: 'ياسين عبد الكريم منصور',
    country: 'المملكة المغربية (Morocco)',
    categoryId: 'cat-full-quran',
    categoryName: 'Full Quran Memorization',
    finalScore: 96.50,
    rank: 3,
    status: 'sealed',
    sealMetadata: {
      sealedBy: 'MIZAN Demo Head Judge',
      sealedAt: '2027-02-11T16:00:00Z',
      cryptographicChecksum: 'DEMO:RESULT-SEAL-003'
    },
    awardTitle: 'Third Place',
    awardTitleArabic: 'المركز الثالث'
  }
];

export const SEED_CERTIFICATE: Certificate = {
  id: 'cert-2027-a101',
  certificateNumber: 'MZN-2027-A101-9925',
  competitionId: 'comp-dubai-2027',
  competitionName: 'MIZAN Demo International Quran Competition 2027',
  competitionNameArabic: 'مسابقة ميزان القرآنية الدولية التجريبية',
  organizationName: 'MIZAN Demo Competition Authority',
  organizationNameArabic: 'جهة ميزان التجريبية للمسابقات القرآنية',
  participantId: 'part-101',
  participantName: 'Ibrahim Muhammad Al-Ansari',
  participantNameArabic: 'إبراهيم محمد الأنصاري',
  categoryName: 'Full Quran Memorization with Tajweed',
  categoryNameArabic: 'حفظ القرآن الكريم كاملاً مع التجويد وحسن الأداء',
  score: 99.25,
  rank: 1,
  awardTextArabic: 'تشهد الأمانة العامة لجائزة ميزان التجريبية بأن المتسابق قد أتمّ اختبارات المسابقة بجدارة واستحقاق ونال المركز الأول بدرجة امتياز مع مرتبة الشرف الأولى.',
  issueDate: '2027-02-15',
  signatories: [
    { name: 'رئيس التحكيم التجريبي', title: 'رئيس اللجنة العلمية للتحكيم' },
    { name: 'مدير المسابقة التجريبي', title: 'الأمين العام للجائزة' }
  ],
  verificationToken: 'DEMO-VERIFICATION-TOKEN',
  verificationUrl: '/verify/MZN-2027-A101-9925',
  isAuthentic: true,
  qrPayload: '/verify/MZN-2027-A101-9925'
};

export const SEED_AUDIT_LOGS: AuditEvent[] = [
  {
    id: 'aud-001',
    timestamp: '2027-02-11T09:12:00Z',
    organizationId: 'org-gqa-global',
    competitionId: 'comp-dubai-2027',
    actorId: 'sys-routing',
    actorName: 'MIZAN Smart Queue Engine',
    actorRole: 'ops_manager',
    action: 'QUEUE_ROUTED',
    entityType: 'Participant',
    entityId: 'part-104',
    humanSummaryArabic: 'توجيه المتسابق بلال أحمد (A-104) آلياً إلى اللجنة الأولى C1 دون تعارض مصالح',
    humanSummaryEnglish: 'Auto-routed participant Bilal Ahmad (A-104) to Committee C1 with zero conflicts',
    currentStateHash: 'DEMO:AUDIT-SEED-001'
  },
  {
    id: 'aud-002',
    timestamp: '2027-02-11T09:12:30Z',
    organizationId: 'org-gqa-global',
    competitionId: 'comp-dubai-2027',
    actorId: 'sys-fairdraw',
    actorName: 'FairDraw Cryptographic Engine',
    actorRole: 'scientific_admin',
    action: 'FAIRDRAW_GENERATED',
    entityType: 'TestSession',
    entityId: 'sess-part-104',
    humanSummaryArabic: 'توليد حزمة اختبار متوازنة الصعوبة مع قفل التجزئة والتحقق من التكافؤ',
    humanSummaryEnglish: 'Generated balanced difficulty question bundle with cryptographic seed commit',
    currentStateHash: 'DEMO:FAIRDRAW-SEED-001'
  },
  {
    id: 'aud-003',
    timestamp: '2027-02-11T16:00:00Z',
    organizationId: 'org-gqa-global',
    competitionId: 'comp-dubai-2027',
    actorId: 'usr-head-judge-1',
    actorName: 'MIZAN Demo Head Judge',
    actorRole: 'head_judge',
    action: 'RESULT_SEALED',
    entityType: 'ResultRecord',
    entityId: 'res-1',
    humanSummaryArabic: 'ختم وتشفير نتائج الفرع الأول باعتماد مزدوج من رئيس اللجنة والأمين العام',
    humanSummaryEnglish: 'Cryptographically sealed Category 1 results with Dual Approval protocol',
    currentStateHash: 'DEMO:RESULT-SEAL-001'
  }
];

export const SEED_INCIDENTS: IncidentRecord[] = [
  {
    id: 'inc-01',
    competitionId: 'comp-dubai-2027',
    type: 'audio_mic',
    severity: 'low',
    title: 'Microphone Sensitivity Fluctuation on Podium C3',
    description: 'Noise floor slightly increased due to external air-vent. Re-calibrated automatically by Audio Engine.',
    reportedBy: 'Audio SNR Monitor',
    reportedAt: '2027-02-11T08:15:00Z',
    resolvedAt: '2027-02-11T08:17:30Z',
    status: 'resolved'
  }
];
