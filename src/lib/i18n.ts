// Only fully-translated locales are exposed. Arabic and English ship complete dictionaries;
// additional locales must not be advertised until a real dictionary exists, otherwise the
// switcher promises languages the app cannot deliver (it previously aliased 7 locales to English).
export type SupportedLanguage = 'ar' | 'en';

export interface TranslationDictionary {
  appName: string;
  tagline: string;
  heroSubtitle: string;
  // Common
  search: string;
  filter: string;
  status: string;
  actions: string;
  save: string;
  cancel: string;
  confirm: string;
  delete: string;
  edit: string;
  view: string;
  back: string;
  next: string;
  loading: string;
  success: string;
  error: string;
  ready: string;
  offline: string;
  online: string;
  all: string;
  print: string;
  download: string;
  copy: string;
  verification: string;
  authentic: string;
  details: string;

  // Navigation
  navOverview: string;
  navParticipants: string;
  navCommittees: string;
  navJudging: string;
  navOperations: string;
  navResults: string;
  navGovernance: string;
  navCertificates: string;
  navAudit: string;
  navCopilot: string;
  navCeremony: string;
  navKiosk: string;
  navSwitchRole: string;

  // Roles
  roleSuperAdmin: string;
  roleOrgAdmin: string;
  roleCompAdmin: string;
  roleScientificAdmin: string;
  roleHeadJudge: string;
  roleJudge: string;
  roleOpsManager: string;
  roleExceptionHost: string;
  roleDelegationManager: string;
  roleParticipant: string;
  roleBroadcast: string;
  roleAuditor: string;

  // Gate & Kiosk
  scanYourPass: string;
  welcomeParticipant: string;
  checkInSuccess: string;
  proceedToWaiting: string;
  yourQueueCode: string;
  assignedCommittee: string;
  scanBarcodePrompt: string;

  // Queue & Flow
  queueStatus: string;
  peopleAhead: string;
  youAreNext: string;
  enterCommittee: string;
  averageWaitTime: string;

  // JudgeOS
  judgeOSHeader: string;
  startSession: string;
  drawQuestions: string;
  bismillahPrompt: string;
  activeRecitation: string;
  mistakeButton: string;
  promptAlertButton: string;
  openCorrectionButton: string;
  repetitionButton: string;
  tajweedButton: string;
  undoButton: string;
  submitAssessment: string;
  assessmentLocked: string;
  shortcutsHint: string;
  audioRecordingActive: string;
  varianceDetected: string;
  noInterferenceAI: string;

  // Head Judge & Review
  reviewInbox: string;
  attentionCases: string;
  playClip: string;
  confirmVariance: string;
  dismissVariance: string;
  varianceNote: string;
  appealsTitle: string;

  // Results & Sealing
  sealResults: string;
  dualApprovalReq: string;
  publishLeaderboard: string;
  generateCertificates: string;
  finalScore: string;
  rank: string;

  // Ceremony
  awardCeremony: string;
  revealWinner: string;
  firstPlace: string;
  secondPlace: string;
  thirdPlace: string;

  // Copilot & Sim
  askMizan: string;
  digitalTwinSim: string;
  capacityForecast: string;
}

const coreTranslations: Record<'ar'|'en', TranslationDictionary> = {
  ar: {
    appName: 'ميزان',
    tagline: 'البنية التحتية ونظام التشغيل الذاتي لمسابقات القرآن الكريم',
    heroSubtitle: 'أحضر المحكّمين.. واترك تشغيل المسابقة لميزان',

    search: 'بحث...',
    filter: 'تصفية',
    status: 'الحالة',
    actions: 'الإجراءات',
    save: 'حفظ',
    cancel: 'إلغاء',
    confirm: 'تأكيد',
    delete: 'حذف',
    edit: 'تعديل',
    view: 'عرض',
    back: 'السابق',
    next: 'التالي',
    loading: 'جاري المعالجة...',
    success: 'تم بنجاح',
    error: 'حدث خطأ',
    ready: 'جاهز',
    offline: 'العمل دون اتصال',
    online: 'متصل بالمخدم',
    all: 'الكل',
    print: 'طباعة',
    download: 'تحميل',
    copy: 'نسخ',
    verification: 'التحقق الرسمي',
    authentic: 'شهادة معتمدة ورسمية',
    details: 'التفاصيل',

    navOverview: 'نظرة عامة',
    navParticipants: 'المشاركون',
    navCommittees: 'اللجان والمحكمون',
    navJudging: 'منصة التحكيم',
    navOperations: 'مركز العمليات',
    navResults: 'النتائج والختم',
    navGovernance: 'الحوكمة والمصحف',
    navCertificates: 'الشهادات',
    navAudit: 'سجل النزاهة والتدقيق',
    navCopilot: 'المساعد الذكي والمحاكاة',
    navCeremony: 'حفل الختام',
    navKiosk: 'بوابة الحضور الذاتي',
    navSwitchRole: 'تبديل الدور (تجريبي)',

    roleSuperAdmin: 'المدير العام للمنصة',
    roleOrgAdmin: 'مدير المؤسسة / الوزارة',
    roleCompAdmin: 'مدير المسابقة التنفيذي',
    roleScientificAdmin: 'المسؤول العلمي والحوكمة',
    roleHeadJudge: 'رئيس لجنة التحكيم',
    roleJudge: 'محكّم معتمد',
    roleOpsManager: 'مدير التشغيل والعمليات',
    roleExceptionHost: 'موظف الاستثناءات',
    roleDelegationManager: 'رئيس الوفد الدولي',
    roleParticipant: 'المتسابق',
    roleBroadcast: 'مشغل البث والمسرح',
    roleAuditor: 'المراقب والمدقق الخارجي',

    scanYourPass: 'امسح بطاقة الحضور الرقمية',
    welcomeParticipant: 'أهلاً بك',
    checkInSuccess: 'تم تسجيل الحضور بنجاح',
    proceedToWaiting: 'تفضّل إلى قاعة الانتظار',
    yourQueueCode: 'رقمك في الطابور',
    assignedCommittee: 'اللجنة المخصصة',
    scanBarcodePrompt: 'وجّه الكود أمام الكاميرا أو القارئ',

    queueStatus: 'حالة الطابور',
    peopleAhead: 'أمامك في الانتظار',
    youAreNext: 'أنت التالي - يرجى الاستعداد',
    enterCommittee: 'تفضل بالدخول إلى اللجنة',
    averageWaitTime: 'متوسط وقت الانتظار',

    judgeOSHeader: 'منصة التحكيم المباشر',
    startSession: 'بدء الجلسة',
    drawQuestions: 'سحب أسئلة الاختبار بالسحب العادل',
    bismillahPrompt: 'بسم الله الرحمن الرحيم',
    activeRecitation: 'التلاوة جارية الآن',
    mistakeButton: 'خطأ جلي (-0.5)',
    promptAlertButton: 'تنبيه (-0.5)',
    openCorrectionButton: 'فتح وتصحيح (-1.0)',
    repetitionButton: 'ترداد (-0.25)',
    tajweedButton: 'ملاحظة تجويد (-0.25)',
    undoButton: 'تراجع عن آخر رصد (Z)',
    submitAssessment: 'اعتماد وقفل التقييم',
    assessmentLocked: 'تم قفل التقييم واعتماده بنجاح',
    shortcutsHint: 'اختصارات لوحة المفاتيح: 1 خطأ | 2 تنبيه | 3 فتح | 4 تجويد | Z تراجع',
    audioRecordingActive: 'تسجيل التلاوة نشط ومشفّر',
    varianceDetected: 'رصد تباين بين المحكمين',
    noInterferenceAI: 'المراقب الصامت يعمل في الخلفية دون التأثير على المحكم',

    reviewInbox: 'صندوق مراجعة رئيس اللجنة',
    attentionCases: 'حالات تستدعي الانتباه',
    playClip: 'استماع للمقطع (8 ثوانٍ)',
    confirmVariance: 'تثبيت الخصم',
    dismissVariance: 'إلغاء الخصم',
    varianceNote: 'ملاحظة التدقيق العلمي',
    appealsTitle: 'طلبات الاعتراض العلمي',

    sealResults: 'ختم النتائج تشفيريًا باعتماد مزدوج',
    dualApprovalReq: 'يتطلب اعتماد رئيس اللجنة ومدير المسابقة',
    publishLeaderboard: 'نشر النتائج العامة',
    generateCertificates: 'إصدار الشهادات الرقمية الموقعة',
    finalScore: 'الدرجة النهائية',
    rank: 'الترتيب',

    awardCeremony: 'حفل إعلان النتائج والتتويج',
    revealWinner: 'الكشف عن الفائز',
    firstPlace: 'الفائز بالمركز الأول',
    secondPlace: 'المركز الثاني',
    thirdPlace: 'المركز الثالث',

    askMizan: 'اسأل مساعد ميزان التشغيلي',
    digitalTwinSim: 'محاكاة التوأم الرقمي',
    capacityForecast: 'توقعات الطاقة الاستيعابية والانتظار'
  },
  en: {
    appName: 'MIZAN',
    tagline: 'The Autonomous Operating System & Global Infrastructure for Quran Competitions',
    heroSubtitle: 'Bring the judges. MIZAN operates the competition.',

    search: 'Search...',
    filter: 'Filter',
    status: 'Status',
    actions: 'Actions',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    delete: 'Delete',
    edit: 'Edit',
    view: 'View',
    back: 'Back',
    next: 'Next',
    loading: 'Processing...',
    success: 'Success',
    error: 'An error occurred',
    ready: 'Ready',
    offline: 'Offline Continuity',
    online: 'Server Connected',
    all: 'All',
    print: 'Print',
    download: 'Download',
    copy: 'Copy',
    verification: 'Official Verification',
    authentic: 'Certified Official Document',
    details: 'Details',

    navOverview: 'Overview',
    navParticipants: 'Participants',
    navCommittees: 'Committees & Judges',
    navJudging: 'JudgeOS',
    navOperations: 'Command Center',
    navResults: 'Results & Sealing',
    navGovernance: 'Quran Governance',
    navCertificates: 'Certificates',
    navAudit: 'Audit & Integrity',
    navCopilot: 'Copilot & Simulation',
    navCeremony: 'Ceremony Stage',
    navKiosk: 'Self Check-in Kiosk',
    navSwitchRole: 'Switch Role (Demo)',

    roleSuperAdmin: 'Platform Super Admin',
    roleOrgAdmin: 'Organization Admin',
    roleCompAdmin: 'Competition Admin',
    roleScientificAdmin: 'Scientific Governance Admin',
    roleHeadJudge: 'Head of Jury Panel',
    roleJudge: 'Certified Judge',
    roleOpsManager: 'Operations Manager',
    roleExceptionHost: 'Exception Host',
    roleDelegationManager: 'Delegation Manager',
    roleParticipant: 'Participant',
    roleBroadcast: 'Broadcast / Media Operator',
    roleAuditor: 'Observer / Auditor',

    scanYourPass: 'Scan Your Digital Pass',
    welcomeParticipant: 'Welcome',
    checkInSuccess: 'Check-in Verified',
    proceedToWaiting: 'Proceed to Waiting Hall',
    yourQueueCode: 'Queue Code',
    assignedCommittee: 'Assigned Committee',
    scanBarcodePrompt: 'Align your code with the scanner',

    queueStatus: 'Queue Status',
    peopleAhead: 'Participants Ahead',
    youAreNext: 'You are next - Please be ready',
    enterCommittee: 'Please proceed to Committee room',
    averageWaitTime: 'Average Wait Time',

    judgeOSHeader: 'JudgeOS Live Evaluation',
    startSession: 'Start Session',
    drawQuestions: 'Draw Questions (FairDraw)',
    bismillahPrompt: 'In the name of Allah, Most Gracious, Most Merciful',
    activeRecitation: 'Recitation in Progress',
    mistakeButton: 'Mistake (-0.5)',
    promptAlertButton: 'Prompt (-0.5)',
    openCorrectionButton: 'Opening (-1.0)',
    repetitionButton: 'Repetition (-0.25)',
    tajweedButton: 'Tajweed Note (-0.25)',
    undoButton: 'Undo Event (Z)',
    submitAssessment: 'Submit & Lock Assessment',
    assessmentLocked: 'Assessment locked and submitted securely',
    shortcutsHint: 'Key shortcuts: 1 Error | 2 Prompt | 3 Open | 4 Tajweed | Z Undo',
    audioRecordingActive: 'Audio recording stream encrypted & verified',
    varianceDetected: 'Judge scoring variance detected',
    noInterferenceAI: 'Silent Guardian runs in background without altering human judgment',

    reviewInbox: 'Head Judge Review Inbox',
    attentionCases: 'Cases Requiring Attention',
    playClip: 'Play Audio Clip (8s)',
    confirmVariance: 'Confirm Deduction',
    dismissVariance: 'Dismiss Deduction',
    varianceNote: 'Scientific review notes',
    appealsTitle: 'Scientific Appeals',

    sealResults: 'Cryptographically Seal Results',
    dualApprovalReq: 'Requires Dual Approval from Head Judge and Executive Director',
    publishLeaderboard: 'Publish Public Leaderboard',
    generateCertificates: 'Issue Signed Digital Certificates',
    finalScore: 'Final Score',
    rank: 'Rank',

    awardCeremony: 'Award Ceremony Stage',
    revealWinner: 'Reveal Winner',
    firstPlace: '1st Place Winner',
    secondPlace: '2nd Place',
    thirdPlace: '3rd Place',

    askMizan: 'Ask MIZAN Operations Copilot',
    digitalTwinSim: 'Digital Twin Simulation',
    capacityForecast: 'Capacity Forecast & Wait Estimator'
  }
};


export const translations: Record<SupportedLanguage, TranslationDictionary> = {
  ar: coreTranslations.ar, en: coreTranslations.en
};

export const LANGUAGE_META: Record<SupportedLanguage,{label:string;dir:'rtl'|'ltr';locale:string}> = {
 ar:{label:'العربية',dir:'rtl',locale:'ar-KW'}, en:{label:'English',dir:'ltr',locale:'en-US'}
};
