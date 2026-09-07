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
  AppealRecord,
  JudgeSubmission,
  SessionCheckpointRecord,
  ContinuityIncidentRecord,
  SessionRecoveryRecord,
  AuthSessionRecord,
  PassReissueRecord,
  AuditLedgerSealRecord,
  NotificationRecord,
  WebhookSubscription,
  IntegrationConfig,
  SupportSession,
  IdentityInvitationRecord,
  DelegationTravelRecord,
  FederationAttestationRecord,
  ParticipantPassportEntry,
  ConsentRecord,
  QuorumActionRecord,
  FeatureFlagRecord,
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
    name: 'Bilal Yusuf Al-Sayed',
    nameArabic: 'بلال يوسف السيد',
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
  judgesCountPerPanel: 1,
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
  edition: 'النسخة الدولية الرابعة عشرة',
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
  venueName: 'قاعة المؤتمرات والتلاوة الكبرى (القاعة الرئيسية)',
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
    judgeIds: ['usr-judge-1'],
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
    headJudgeId: '',
    judgeIds: [],
    status: 'offline',
    completedCount: 34,
    averageSessionMinutes: 8.1,
    audioInputOk: true,
    devicesConnected: 0
  },
  {
    id: 'comm-3',
    competitionId: 'comp-dubai-2027',
    name: 'Committee 3 (East Hall)',
    nameArabic: 'اللجنة الثالثة (القاعة الشرقية C)',
    code: 'C3',
    venueHall: 'Recitation Hall C',
    assignedCategories: ['cat-10-juz'],
    headJudgeId: '',
    judgeIds: [],
    status: 'offline',
    completedCount: 40,
    averageSessionMinutes: 6.8,
    audioInputOk: true,
    devicesConnected: 0
  }
];

export const SEED_JUDGES: JudgeProfile[] = [
  {
    id: 'judge-prof-1',
    userId: 'usr-judge-1',
    name: 'MIZAN Demo Judge 1',
    nameArabic: 'المحكم التجريبي ١',
    title: 'Demo Quran Competition Judge',
    country: 'Demo',
    specialty: 'all',
    certifiedRiwayat: ['Hafs', 'Warsh', 'Qalun'],
    assignedCommitteeId: 'comm-1',
    conflictsDeclared: [],
    calibrationScore: 98.4,
    isReady: true
  }
];

export const SEED_PARTICIPANTS: Participant[] = [
  {
    id: 'part-104',
    code: 'A-104',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Bilal Yusuf Al-Sayed',
    fullNameArabic: 'بلال يوسف السيد',
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
  },
  {
    id: 'part-107',
    code: 'A-107',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Yusuf Abdullah Al-Harbi',
    fullNameArabic: 'يوسف عبدالله الحربي',
    email: 'a107@example.org',
    phone: '+9715000000107',
    country: 'Saudi Arabia (السعودية)',
    nationality: 'Saudi Arabia',
    nationalIdOrPassport: 'DOC-1070099',
    dateOfBirth: '2005-03-09',
    gender: 'male',
    categoryId: 'cat-full-quran',
    riwaya: 'Hafs',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'in_queue',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    checkedInAt: '2027-02-11T08:50:00Z',
    checkInMethod: 'kiosk_qr',
    arrivalSlot: '08:45–09:00',
    assignedCommitteeId: 'comm-1',
    queueNumber: 4,
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-108',
    code: 'A-108',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Omar Tariq Al-Nabulsi',
    fullNameArabic: 'عمر طارق النابلسي',
    email: 'a108@example.org',
    phone: '+9715000000108',
    country: 'Palestine (فلسطين)',
    nationality: 'Palestine',
    nationalIdOrPassport: 'DOC-1080099',
    dateOfBirth: '2005-03-01',
    gender: 'male',
    categoryId: 'cat-full-quran',
    riwaya: 'Warsh',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'in_queue',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    checkedInAt: '2027-02-11T08:50:00Z',
    checkInMethod: 'kiosk_qr',
    arrivalSlot: '08:45–09:00',
    assignedCommitteeId: 'comm-2',
    queueNumber: 5,
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-109',
    code: 'A-109',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Ibrahim Salih Al-Amri',
    fullNameArabic: 'إبراهيم صالح العامري',
    email: 'a109@example.org',
    phone: '+9715000000109',
    country: 'Oman (عُمان)',
    nationality: 'Oman',
    nationalIdOrPassport: 'DOC-1090099',
    dateOfBirth: '2005-03-02',
    gender: 'male',
    categoryId: 'cat-20-juz',
    riwaya: 'Hafs',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'in_queue',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    checkedInAt: '2027-02-11T08:50:00Z',
    checkInMethod: 'kiosk_qr',
    arrivalSlot: '08:45–09:00',
    assignedCommitteeId: 'comm-2',
    queueNumber: 6,
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-110',
    code: 'A-110',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Khalid Mansur Al-Dosari',
    fullNameArabic: 'خالد منصور الدوسري',
    email: 'a110@example.org',
    phone: '+9715000000110',
    country: 'Qatar (قطر)',
    nationality: 'Qatar',
    nationalIdOrPassport: 'DOC-1100099',
    dateOfBirth: '2005-03-03',
    gender: 'male',
    categoryId: 'cat-20-juz',
    riwaya: 'Hafs',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'in_session',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    checkedInAt: '2027-02-11T08:50:00Z',
    checkInMethod: 'kiosk_qr',
    arrivalSlot: '08:45–09:00',
    assignedCommitteeId: 'comm-3',
    queueNumber: 2,
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-111',
    code: 'A-111',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Abdulrahman Faisal Al-Otaibi',
    fullNameArabic: 'عبدالرحمن فيصل العتيبي',
    email: 'a111@example.org',
    phone: '+9715000000111',
    country: 'Kuwait (الكويت)',
    nationality: 'Kuwait',
    nationalIdOrPassport: 'DOC-1110099',
    dateOfBirth: '2005-03-04',
    gender: 'male',
    categoryId: 'cat-10-juz',
    riwaya: 'Hafs',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'tested',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    checkedInAt: '2027-02-11T08:50:00Z',
    checkInMethod: 'kiosk_qr',
    arrivalSlot: '08:45–09:00',
    assignedCommitteeId: 'comm-1',
    queueNumber: 7,
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-112',
    code: 'A-112',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Hamza Nabil Al-Rashidi',
    fullNameArabic: 'حمزة نبيل الراشدي',
    email: 'a112@example.org',
    phone: '+9715000000112',
    country: 'UAE (الإمارات)',
    nationality: 'UAE',
    nationalIdOrPassport: 'DOC-1120099',
    dateOfBirth: '2005-03-05',
    gender: 'male',
    categoryId: 'cat-10-juz',
    riwaya: 'Hafs',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'tested',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    checkedInAt: '2027-02-11T08:50:00Z',
    checkInMethod: 'kiosk_qr',
    arrivalSlot: '08:45–09:00',
    assignedCommitteeId: 'comm-2',
    queueNumber: 8,
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-113',
    code: 'A-113',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Zayd Kamal Al-Maliki',
    fullNameArabic: 'زيد كمال المالكي',
    email: 'a113@example.org',
    phone: '+9715000000113',
    country: 'Bahrain (البحرين)',
    nationality: 'Bahrain',
    nationalIdOrPassport: 'DOC-1130099',
    dateOfBirth: '2005-03-06',
    gender: 'male',
    categoryId: 'cat-full-quran',
    riwaya: 'Qalun',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'certified',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    checkedInAt: '2027-02-11T08:50:00Z',
    checkInMethod: 'kiosk_qr',
    arrivalSlot: '08:45–09:00',
    assignedCommitteeId: 'comm-1',
    queueNumber: 9,
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-114',
    code: 'A-114',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Sami Rashid Al-Kaabi',
    fullNameArabic: 'سامي راشد الكعبي',
    email: 'a114@example.org',
    phone: '+9715000000114',
    country: 'UAE (الإمارات)',
    nationality: 'UAE',
    nationalIdOrPassport: 'DOC-1140099',
    dateOfBirth: '2005-03-07',
    gender: 'male',
    categoryId: 'cat-20-juz',
    riwaya: 'Hafs',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'certified',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    checkedInAt: '2027-02-11T08:50:00Z',
    checkInMethod: 'kiosk_qr',
    arrivalSlot: '08:45–09:00',
    assignedCommitteeId: 'comm-3',
    queueNumber: 10,
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-115',
    code: 'A-115',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Bilal Hassan Al-Farsi',
    fullNameArabic: 'بلال حسن الفارسي',
    email: 'a115@example.org',
    phone: '+9715000000115',
    country: 'Oman (عُمان)',
    nationality: 'Oman',
    nationalIdOrPassport: 'DOC-1150099',
    dateOfBirth: '2005-03-08',
    gender: 'male',
    categoryId: 'cat-10-juz',
    riwaya: 'Hafs',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'submitted',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-116',
    code: 'A-116',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Adam Sulaiman Al-Ghamdi',
    fullNameArabic: 'آدم سليمان الغامدي',
    email: 'a116@example.org',
    phone: '+9715000000116',
    country: 'Saudi Arabia (السعودية)',
    nationality: 'Saudi Arabia',
    nationalIdOrPassport: 'DOC-1160099',
    dateOfBirth: '2005-03-09',
    gender: 'male',
    categoryId: 'cat-full-quran',
    riwaya: 'Hafs',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'submitted',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-117',
    code: 'A-117',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Musa Talal Al-Shammari',
    fullNameArabic: 'موسى طلال الشمري',
    email: 'a117@example.org',
    phone: '+9715000000117',
    country: 'Kuwait (الكويت)',
    nationality: 'Kuwait',
    nationalIdOrPassport: 'DOC-1170099',
    dateOfBirth: '2005-03-01',
    gender: 'male',
    categoryId: 'cat-20-juz',
    riwaya: 'Hafs',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'approved',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-118',
    code: 'A-118',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Nuh Faris Al-Zahrani',
    fullNameArabic: 'نوح فارس الزهراني',
    email: 'a118@example.org',
    phone: '+9715000000118',
    country: 'Saudi Arabia (السعودية)',
    nationality: 'Saudi Arabia',
    nationalIdOrPassport: 'DOC-1180099',
    dateOfBirth: '2005-03-02',
    gender: 'male',
    categoryId: 'cat-10-juz',
    riwaya: 'Warsh',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'approved',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    createdAt: '2026-11-12T09:00:00Z'
  },
  {
    id: 'part-119',
    code: 'A-119',
    competitionId: 'comp-dubai-2027',
    organizationId: 'org-gqa-global',
    fullName: 'Ismail Nasser Al-Balushi',
    fullNameArabic: 'إسماعيل ناصر البلوشي',
    email: 'a119@example.org',
    phone: '+9715000000119',
    country: 'Oman (عُمان)',
    nationality: 'Oman',
    nationalIdOrPassport: 'DOC-1190099',
    dateOfBirth: '2005-03-03',
    gender: 'male',
    categoryId: 'cat-full-quran',
    riwaya: 'Hafs',
    institution: 'Ministry of Awqaf Quranic Centers',
    status: 'in_queue',
    statusHistory: [
      { status: 'submitted', timestamp: '2026-11-12T09:00:00Z', actor: 'participant' },
      { status: 'approved', timestamp: '2026-11-14T14:20:00Z', actor: 'AI Eligibility Engine' }
    ],
    checkedInAt: '2027-02-11T08:50:00Z',
    checkInMethod: 'kiosk_qr',
    arrivalSlot: '08:45–09:00',
    assignedCommitteeId: 'comm-3',
    queueNumber: 11,
    createdAt: '2026-11-12T09:00:00Z'
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
    // نصّ إنجليزي داخل فقرة عربية تُبعثره خوارزمية الاتجاه فيخرج غير مقروء. العرض بالعربية.
    details: 'رصد المحكم الأول خطأ حفظ (-0.5) عند الدقيقة 02:22، ورصد المحكم الثاني ملاحظة تجويد (-0.25). ونبّه الحارس الصامت إلى احتمال تردّد وإعادة.',
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
    details: 'رصد المراقب الصامت استبدالًا دقيقًا في حركة (ثقة عالية ٩٤٪). يتطلب مراجعة بشرية مقابل المصدر القرآني المعتمد قبل أي قرار.',
    status: 'pending'
  }
];

// اعتراضات ديمو: تُغذّي تبويب "الاعتراضات" لدى رئيس التحكيم حتى تظهر الشاشة بمحتوى واقعي في وضع العرض.
export const SEED_APPEALS: AppealRecord[] = [
  {
    id: 'apl-01',
    competitionId: SEED_COMPETITION.id,
    participantId: 'part-104',
    participantCode: 'A-104',
    categoryName: 'الفرع الأول: حفظ القرآن الكريم كاملاً مع التجويد والقراءات',
    grounds: 'scoring_miscalculation',
    reasonText: 'يرى المتسابق أن خصم درجة الحفظ عند الدقيقة 02:22 احتُسب مرتين، ويطلب إعادة احتساب المجموع.',
    status: 'submitted',
    createdAt: '2027-02-11T10:05:00Z'
  },
  {
    id: 'apl-02',
    competitionId: SEED_COMPETITION.id,
    participantId: 'part-105',
    participantCode: 'A-105',
    categoryName: 'الفرع الأول: حفظ القرآن الكريم كاملاً مع التجويد والقراءات',
    grounds: 'audio_interruption',
    reasonText: 'انقطع الصوت في القاعة لبضع ثوانٍ أثناء التلاوة، ويطلب المتسابق إعادة تقييم المقطع المتأثر.',
    status: 'under_review',
    createdAt: '2027-02-11T10:40:00Z'
  },
  {
    id: 'apl-03',
    competitionId: SEED_COMPETITION.id,
    participantId: 'part-102',
    participantCode: 'A-102',
    categoryName: 'الفرع الثاني: حفظ عشرين جزءاً متتالية',
    grounds: 'question_scope_dispute',
    reasonText: 'يرى المتسابق أن السؤال خرج عن النطاق المقرر للفئة، ويطلب مراجعة أهلية السؤال.',
    status: 'accepted',
    resolutionNotes: 'بعد مراجعة نطاق الفئة تبيّن خروج السؤال عن الحدود المقررة، فأُعيد احتساب الدرجة.',
    resolvedBy: 'رئيس لجنة التحكيم',
    resolvedAt: '2027-02-11T11:15:00Z',
    scoreAdjustmentDelta: 0.5,
    createdAt: '2027-02-11T09:30:00Z'
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
  resultId: 'res-1',
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
    humanSummaryArabic: 'توجيه المتسابق بلال يوسف (A-104) آلياً إلى اللجنة الأولى C1 دون تعارض مصالح',
    humanSummaryEnglish: 'Auto-routed participant Bilal Yusuf (A-104) to Committee C1 with zero conflicts',
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

/*
 * بيانات عرض إضافية (Demo only).
 *
 * تُغذّي الشاشات التي كانت تبدأ فارغة في وضع العرض حتى يستطيع مُقدِّم المنتج أن يرى كل ميزة
 * بمحتوى واقعي. جميعها مقصورة على العرض؛ وضع الإطلاق الحقيقي يمسحها في toLaunchState.
 */

// أحكام محكمين مقفلة عبر أربع جلسات وثلاثة محكمين — تُشغّل لوحات الموثوقية والمعايرة لدى رئيس التحكيم.
export const SEED_JUDGE_SUBMISSIONS: JudgeSubmission[] = (() => {
  const judges = [
    { id: 'usr-judge-1', name: 'Dr. Kamal Isa Al-Masarawi', mem: 68, taj: 24, perf: 5 },   // متساهل
    { id: 'usr-judge-2', name: 'Dr. Sami Al-Tamimi',        mem: 65, taj: 22, perf: 4 },   // متوازن
    { id: 'usr-judge-3', name: 'Dr. Layla Al-Nouri',        mem: 61, taj: 20, perf: 4 },   // متشدّد
  ];
  const sessions = [
    { sessionId: 'sess-104', participantId: 'part-104', delta: 0 },
    { sessionId: 'sess-105', participantId: 'part-105', delta: 1 },
    { sessionId: 'sess-106', participantId: 'part-106', delta: -1 },
    { sessionId: 'sess-107', participantId: 'part-107', delta: 2 }, // تباعد أوضح لإظهار صفّ خارج التفاوت
  ];
  const rows: JudgeSubmission[] = [];
  sessions.forEach((s, si) => {
    judges.forEach((j, ji) => {
      const mem = Math.max(0, Math.min(70, j.mem - (s.delta * (ji === 2 ? 2 : 1))));
      const taj = Math.max(0, Math.min(25, j.taj - s.delta));
      const perf = Math.max(0, Math.min(5, j.perf));
      rows.push({
        judgeId: j.id,
        judgeName: j.name,
        participantId: s.participantId,
        sessionId: s.sessionId,
        criterionScores: { 'crit-memorization': mem, 'crit-tajweed': taj, 'crit-performance': perf },
        totalScore: mem + taj + perf,
        eventsCount: 2 + ji,
        sessionPenaltyCount: 2 + ji,
        submittedAt: new Date(Date.parse('2027-02-11T09:30:00Z') + (si * 3 + ji) * 60000).toISOString(),
        locked: true,
      });
    });
  });
  return rows;
})();

// استمرارية الجلسة: نقاط حفظ + حادثة مُعالَجة + قرار تعافٍ مُطبَّق (بلا إنذار مفتوح يزعج العرض).
export const SEED_SESSION_CHECKPOINTS: SessionCheckpointRecord[] = [
  { id: 'ckpt-104-1', competitionId: 'comp-dubai-2027', sessionId: 'sess-active-001', participantId: 'part-104', committeeId: 'comm-1', phase: 'RECITING', questionIndex: 0, questionRevealed: true, durationSeconds: 90, eventIds: ['ev-1'], lockedJudgeIds: [], sequence: 1, createdAt: '2027-02-11T09:13:30Z', createdBy: 'usr-judge-1', checkpointHash: 'DEMO:CKPT-104-1', assurance: 'client_hash_chain' },
  { id: 'ckpt-104-2', competitionId: 'comp-dubai-2027', sessionId: 'sess-active-001', participantId: 'part-104', committeeId: 'comm-1', phase: 'RECITING', questionIndex: 0, questionRevealed: true, durationSeconds: 142, eventIds: ['ev-1'], lockedJudgeIds: [], sequence: 2, createdAt: '2027-02-11T09:14:22Z', createdBy: 'usr-judge-1', checkpointHash: 'DEMO:CKPT-104-2', previousCheckpointHash: 'DEMO:CKPT-104-1', assurance: 'client_hash_chain' },
];
export const SEED_CONTINUITY_INCIDENTS: ContinuityIncidentRecord[] = [
  { id: 'cont-inc-1', competitionId: 'comp-dubai-2027', sessionId: 'sess-active-001', participantId: 'part-104', type: 'NETWORK_LOSS', occurredAt: '2027-02-11T09:14:40Z', reportedBy: 'usr-ops-1', lastCheckpointId: 'ckpt-104-2', status: 'RESOLVED', notes: 'انقطاع شبكة قصير استُعيدت الجلسة بعده من آخر نقطة حفظ دون فقد أي حكم.' },
];
export const SEED_SESSION_RECOVERIES: SessionRecoveryRecord[] = [
  { id: 'rec-1', competitionId: 'comp-dubai-2027', sessionId: 'sess-active-001', participantId: 'part-104', incidentId: 'cont-inc-1', checkpointId: 'ckpt-104-2', decision: 'RESUME_SAME_SESSION_SAME_QUESTION', reason: 'استئناف الجلسة من آخر نقطة حفظ بعد عودة الشبكة.', preserveRevealedQuestion: true, preserveLockedJudgeSubmissions: true, createdAt: '2027-02-11T09:15:10Z', createdBy: 'usr-head-judge-1', status: 'APPLIED' },
];

// جلسات دخول نشطة — تُظهر عدّاد الجلسات والشارات في حوكمة الهوية ولوحة المدقّق.
export const SEED_AUTH_SESSIONS: AuthSessionRecord[] = [
  { id: 'auths-1', accountId: 'acct-usr-comp-admin-1', organizationId: 'org-gqa-global', competitionId: 'comp-dubai-2027', role: 'comp_admin', deviceId: 'dev-edge-1', deviceName: 'MIZAN Edge Primary', openedAt: '2027-02-11T07:30:00Z', lastSeenAt: '2027-02-11T09:20:00Z', expiresAt: '2027-02-11T19:30:00Z', status: 'ACTIVE', authenticationAssurance: 'MFA' },
  { id: 'auths-2', accountId: 'acct-usr-judge-1', organizationId: 'org-gqa-global', competitionId: 'comp-dubai-2027', role: 'judge', deviceId: 'dev-kiosk-1', deviceName: 'Committee Tablet C1', openedAt: '2027-02-11T08:40:00Z', lastSeenAt: '2027-02-11T09:22:00Z', expiresAt: '2027-02-11T18:40:00Z', status: 'ACTIVE', authenticationAssurance: 'MFA' },
  { id: 'auths-3', accountId: 'acct-usr-head-judge-1', organizationId: 'org-gqa-global', competitionId: 'comp-dubai-2027', role: 'head_judge', deviceId: 'dev-edge-1', deviceName: 'Head Judge Station', openedAt: '2027-02-11T08:10:00Z', lastSeenAt: '2027-02-11T09:18:00Z', expiresAt: '2027-02-11T18:10:00Z', status: 'ACTIVE', authenticationAssurance: 'MFA' },
];

// إعادة إصدار بطاقات — تُظهر سجلّ المدقّق.
export const SEED_PASS_REISSUES: PassReissueRecord[] = [
  { id: 'reissue-1', competitionId: 'comp-dubai-2027', participantId: 'part-105', oldCredentialIds: ['cred-105-1'], newCredentialId: 'cred-105-2', lineageId: 'lin-105', generation: 2, reason: 'LOST', identityVerification: 'PARTICIPANT_PROFILE', requestedAt: '2027-02-11T08:05:00Z', requestedBy: 'usr-exception-1', status: 'ISSUED', revocationEpoch: 1 },
  { id: 'reissue-2', competitionId: 'comp-dubai-2027', participantId: 'part-106', oldCredentialIds: ['cred-106-1'], newCredentialId: 'cred-106-2', lineageId: 'lin-106', generation: 2, reason: 'DAMAGED', identityVerification: 'PHOTO_ID', requestedAt: '2027-02-11T08:20:00Z', requestedBy: 'usr-exception-1', status: 'ISSUED', revocationEpoch: 1 },
];

// ختم دفتر التدقيق — يُظهر سطر البصمة في لوحة المدقّق.
export const SEED_AUDIT_LEDGER_SEALS: AuditLedgerSealRecord[] = [
  { id: 'seal-1', competitionId: 'comp-dubai-2027', createdAt: '2027-02-11T09:00:00Z', createdBy: 'usr-comp-admin-1', eventCount: 42, headHash: 'DEMO:AUDIT-HEAD-9F2C7A', firstEventId: 'aud-1', lastEventId: 'aud-42', assurance: 'client_hash_chain', verificationState: 'VERIFIED' },
];

// إشعارات — مزيج مُرسَل/فاشل لإظهار مركز الإشعارات وزرّ إعادة المحاولة.
export const SEED_NOTIFICATIONS: NotificationRecord[] = [
  { id: 'ntf-1', competitionId: 'comp-dubai-2027', participantId: 'part-104', channel: 'email', templateKey: 'registration_approved', locale: 'ar', recipient: 'bilal.sayed@gmail.com', status: 'sent', attempts: 1, createdAt: '2026-11-14T14:21:00Z', sentAt: '2026-11-14T14:21:05Z', idempotencyKey: 'comp-dubai-2027:part-104:email:registration_approved' },
  { id: 'ntf-2', competitionId: 'comp-dubai-2027', participantId: 'part-105', channel: 'sms', templateKey: 'arrival_window', locale: 'ar', recipient: '+96599881122', status: 'sent', attempts: 1, createdAt: '2027-02-10T18:00:00Z', sentAt: '2027-02-10T18:00:03Z', idempotencyKey: 'comp-dubai-2027:part-105:sms:arrival_window' },
  { id: 'ntf-3', competitionId: 'comp-dubai-2027', participantId: 'part-106', channel: 'whatsapp', templateKey: 'arrival_window', locale: 'ar', recipient: '+962790000000', status: 'failed', attempts: 3, createdAt: '2027-02-10T18:05:00Z', error: 'PROVIDER_TIMEOUT', idempotencyKey: 'comp-dubai-2027:part-106:whatsapp:arrival_window' },
  { id: 'ntf-4', competitionId: 'comp-dubai-2027', participantId: 'part-104', channel: 'in_app', templateKey: 'result_ready', locale: 'ar', recipient: 'part-104', status: 'sent', attempts: 1, createdAt: '2027-02-12T12:00:00Z', sentAt: '2027-02-12T12:00:00Z', idempotencyKey: 'comp-dubai-2027:part-104:in_app:result_ready' },
];

// اشتراكات Webhook.
export const SEED_WEBHOOKS: WebhookSubscription[] = [
  { id: 'wh-1', organizationId: 'org-gqa-global', competitionId: 'comp-dubai-2027', event: 'participant.approved', endpoint: 'https://hooks.example.org/mizan/participant', enabled: true, secretRef: 'secret://wh-participant', lastDeliveryStatus: 'success' },
  { id: 'wh-2', organizationId: 'org-gqa-global', competitionId: 'comp-dubai-2027', event: 'result.sealed', endpoint: 'https://hooks.example.org/mizan/results', enabled: true, secretRef: 'secret://wh-results', lastDeliveryStatus: 'failed' },
];

// قنوات التكامل — بعضها مُفعّل ليظهر "المزوّد يعمل".
export const SEED_INTEGRATIONS: IntegrationConfig[] = [
  { id: 'intg-email', organizationId: 'org-gqa-global', kind: 'email', name: 'Transactional Email', enabled: true, status: 'configured' },
  { id: 'intg-sms', organizationId: 'org-gqa-global', kind: 'sms', name: 'SMS Gateway', enabled: true, status: 'configured' },
  { id: 'intg-whatsapp', organizationId: 'org-gqa-global', kind: 'whatsapp', name: 'WhatsApp Business', enabled: true, status: 'degraded' },
  { id: 'intg-storage', organizationId: 'org-gqa-global', kind: 'storage', name: 'Evidence Storage', enabled: true, status: 'configured' },
  { id: 'intg-identity', organizationId: 'org-gqa-global', kind: 'identity', name: 'Identity Provider', enabled: true, status: 'configured' },
  { id: 'intg-broadcast', organizationId: 'org-gqa-global', kind: 'broadcast', name: 'Ceremony Broadcast', enabled: false, status: 'not_configured' },
];

// جلسات دعم — تُظهر قائمة وحدة الدعم بدل شاشة فارغة.
export const SEED_SUPPORT_SESSIONS: SupportSession[] = [
  { id: 'sup-1', organizationId: 'org-gqa-global', requestedBy: 'usr-comp-admin-1', reason: 'مراجعة إعداد اللجان قبل اليوم الأول', status: 'requested', createdAt: '2027-02-10T15:00:00Z', expiresAt: '2027-02-10T17:00:00Z' },
  { id: 'sup-2', organizationId: 'org-gqa-global', requestedBy: 'usr-ops-1', approvedBy: 'usr-org-admin-1', reason: 'تشخيص بطء مزامنة في القاعة B', status: 'active', createdAt: '2027-02-11T08:30:00Z', expiresAt: '2027-02-11T10:30:00Z' },
];

// دعوات هوية بانتظار الاعتماد — تُظهر لوحة "الموافقات المعلّقة".
export const SEED_IDENTITY_INVITATIONS: IdentityInvitationRecord[] = [
  { id: 'inv-1', email: 'new.judge@awqaf.example', displayName: 'الشيخ عدنان الرشيدي', organizationId: 'org-gqa-global', requestedRole: 'judge', competitionId: 'comp-dubai-2027', committeeId: 'comm-2', status: 'PENDING_APPROVAL', createdAt: '2027-02-09T10:00:00Z', createdBy: 'seed', expiresAt: '2027-02-16T10:00:00Z' },
  { id: 'inv-2', email: 'panel.auditor@awqaf.example', displayName: 'الأستاذة هدى الصباح', organizationId: 'org-gqa-global', requestedRole: 'auditor', competitionId: 'comp-dubai-2027', status: 'PENDING_APPROVAL', createdAt: '2027-02-09T11:00:00Z', createdBy: 'seed', expiresAt: '2027-02-16T11:00:00Z' },
];

// سجلات سفر الوفود — تُظهر قائمة بوابة الوفود ومؤشّر الوصول.
export const SEED_TRAVEL_RECORDS: DelegationTravelRecord[] = [
  { id: 'trv-1', competitionId: 'comp-dubai-2027', delegationId: 'delegation-current', participantId: 'part-105', flightNumber: 'KU671', arrivalAirport: 'DXB', arrivalAt: '2027-02-10T14:20:00Z', hotel: 'Grand Auditorium Hotel', room: '512', transportStatus: 'completed', companionCount: 1 },
  { id: 'trv-2', competitionId: 'comp-dubai-2027', delegationId: 'delegation-current', participantId: 'part-106', flightNumber: 'RJ180', arrivalAirport: 'DXB', arrivalAt: '2027-02-10T16:45:00Z', hotel: 'Grand Auditorium Hotel', room: '514', transportStatus: 'scheduled', companionCount: 2 },
  { id: 'trv-3', competitionId: 'comp-dubai-2027', delegationId: 'delegation-current', participantId: 'part-107', transportStatus: 'pending', companionCount: 0, notes: 'بانتظار تأكيد الرحلة.' },
];

// شهادات اتحادية (Federation) — ادعاءات موثّقة بلا كشف بيانات.
export const SEED_FEDERATION_ATTESTATIONS: FederationAttestationRecord[] = [
  { id: 'fed-1', organizationId: 'org-gqa-global', subjectRef: 'part-105', subjectKind: 'participant', issuer: 'Kuwait Awqaf Authority', claim: 'identity_verified', value: 'true', issuedAt: '2027-02-09T09:00:00Z', status: 'valid', evidenceDigest: 'DEMO:FED-EVID-105', signatureRef: 'sig://fed-105', privacyMode: 'claim_only' },
  { id: 'fed-2', organizationId: 'org-gqa-global', subjectRef: 'part-106', subjectKind: 'participant', issuer: 'Jordan Ifta Department', claim: 'delegation_authorized', value: 'true', issuedAt: '2027-02-09T09:30:00Z', status: 'valid', evidenceDigest: 'DEMO:FED-EVID-106', signatureRef: 'sig://fed-106', privacyMode: 'claim_only' },
];

// جواز ميزان للمتسابق — سجلّ مشاركات سابقة يظهر في لوحة المتسابق.
export const SEED_PARTICIPANT_PASSPORT: ParticipantPassportEntry[] = [
  { id: 'pass-104-1', participantId: 'part-104', competitionId: 'comp-dubai-2025', competitionName: 'MIZAN International Quran Competition 2025', categoryName: 'حفظ عشرين جزءاً', year: '2025', result: 'المركز الثالث', certificateNumber: 'MZN-2025-B210-4471', verified: true },
  { id: 'pass-104-2', participantId: 'part-104', competitionId: 'comp-dubai-2026', competitionName: 'MIZAN International Quran Competition 2026', categoryName: 'حفظ القرآن كاملاً', year: '2026', result: 'مشارك', certificateNumber: 'MZN-2026-A118-2290', verified: true },
];

// موافقة ولي الأمر للطفل المعروض في بوابة ولي الأمر.
export const SEED_CONSENTS: ConsentRecord[] = [
  { id: 'consent-104-guardian', participantId: 'part-104', competitionId: 'comp-dubai-2027', kind: 'guardian', version: '1.0', accepted: true, acceptedAt: '2026-11-12T09:05:00Z', guardianName: 'يوسف السيد' },
];

// إجراء نصاب مُنفَّذ لكشف الحفل — يتيح ظهور شاشة إعلان الفائزين في العرض بدل بوابة الختم.
export const SEED_QUORUM_ACTIONS: QuorumActionRecord[] = [
  { id: 'quorum-ceremony-1', competitionId: 'comp-dubai-2027', action: 'ceremony_reveal', entityId: 'comp-dubai-2027', requiredRoleGroups: [['scientific_admin'], ['comp_admin'], ['org_admin']], distinctActorsRequired: true, minimumApprovals: 2, authorizedRoles: ['scientific_admin', 'comp_admin', 'org_admin'], approvals: [ { actorId: 'usr-scientific-1', actorName: 'أ.د. عبدالله العلمي', actorRole: 'scientific_admin', approvedAt: '2027-02-14T18:00:00Z' }, { actorId: 'usr-comp-admin-1', actorName: 'مدير المسابقة التجريبي', actorRole: 'comp_admin', approvedAt: '2027-02-14T18:02:00Z' }, { actorId: 'usr-org-admin-1', actorName: 'أمين عام الجائزة', actorRole: 'org_admin', approvedAt: '2027-02-14T18:03:00Z' } ], status: 'executed', requestedAt: '2027-02-14T17:55:00Z', requestedBy: 'usr-comp-admin-1', executedAt: '2027-02-14T18:05:00Z', executedBy: 'usr-comp-admin-1', cryptographicAssurance: 'development_adapter', publicCommitmentHash: 'DEMO:CEREMONY-REVEAL-COMMIT' },
];

// أعلام ميزات مُفعّلة — تُظهر بعض الوحدات مُشغّلة في لوحة المشرف الأعلى.
export const SEED_FEATURE_FLAGS: FeatureFlagRecord[] = [
  { id: 'flag-ai', organizationId: 'org-gqa-global', key: 'ai_integrity', enabled: true, environment: 'development', updatedAt: '2027-02-01T00:00:00Z' },
  { id: 'flag-broadcast', organizationId: 'org-gqa-global', key: 'broadcast', enabled: true, environment: 'development', updatedAt: '2027-02-01T00:00:00Z' },
  { id: 'flag-hospitality', organizationId: 'org-gqa-global', key: 'hospitality', enabled: true, environment: 'development', updatedAt: '2027-02-01T00:00:00Z' },
  { id: 'flag-remote', organizationId: 'org-gqa-global', key: 'remote_rounds', enabled: false, environment: 'development', updatedAt: '2027-02-01T00:00:00Z' },
];
