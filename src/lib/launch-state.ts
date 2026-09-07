import type { AppStoreState } from './store-state';
import type { Competition, Organization, User } from '../types';

/*
 * حالة الإطلاق — ما يراه النظام أول مرة في نشرٍ حقيقي.
 *
 * كانت الحالة الابتدائية تُزرع دائمًا ببيانات عرض: ثمانية عشر متسابقًا باسمٍ مخترع، ولجانٌ
 * ومحكمون ونتائج و**شهادة صادرة** وسجلّ تدقيق — بلا أي حارس يفرّق بين عرضٍ للمنتج ونشرٍ حقيقي.
 * أول من يفتح النظام يوم الإطلاق كان سيجد مسابقة مليئة بأشخاص لا وجود لهم.
 *
 * هنا تُشتقّ حالة الإطلاق من القالب نفسه ثم يُفرَّغ منها كل ما يخصّ الأشخاص والسجلات، فتبقى
 * الحقول كاملة (الشاشات تعتمد وجودها) ويبقى المحتوى فارغًا. الاشتقاق مقصود: لو أُضيف حقل جديد
 * إلى الحالة لاحقًا فسيصل إلى الإطلاق موجودًا لا مفقودًا، ولن تنكسر شاشة لأن أحدًا نسي تحديث
 * قائمة ثانية.
 *
 * ما يبقى عمدًا: هيكل الرُبريك والفئة كقالب يبدأ منه المنظّم — قالبُ تقييم ليس شخصًا مخترعًا.
 */

/** يُميّز النشر الحقيقي عن عرض المنتج. المصادقة الإلزامية هي علامة النشر الحقيقي. */
export function isLaunchDeployment(env: Record<string, unknown> = import.meta.env as unknown as Record<string, unknown>): boolean {
  return env.VITE_REQUIRE_AUTH === 'true';
}

/** مؤسسة فارغة تنتظر إعداد المنظّم — لا اسم مخترع ولا علامة تجارية منتحلة. */
export function launchOrganization(template: Organization): Organization {
  return {
    ...template,
    id: 'org-pending-setup',
    name: 'Organization pending setup',
    nameArabic: 'جهة قيد الإعداد',
    code: 'ORG',
    brand: { ...template.brand, name: 'MIZAN', nameArabic: 'ميزان', subdomain: 'mizan' },
  };
}

/** مسابقة مسودّة صفرية: الهيكل قائم، والعدّادات صفر، والحالة draft حتى يفتحها المنظّم. */
export function launchCompetition(template: Competition, organizationId: string): Competition {
  return {
    ...template,
    id: 'comp-pending-setup',
    organizationId,
    name: 'Competition pending setup',
    nameArabic: 'مسابقة قيد الإعداد',
    edition: '',
    status: 'draft',
    totalRegistered: 0,
    totalApproved: 0,
    totalAttended: 0,
  };
}

/** حسابٌ محايد قبل أن تُثبت المصادقة الهوية؛ لا يملك صلاحية ولا يظهر في واجهة. */
export function launchPlaceholderUser(organizationId: string): User {
  return {
    id: 'unauthenticated',
    name: '—',
    email: '',
    role: 'participant',
    organizationId,
  } as User;
}

/**
 * يفرّغ حالةَ القالب من كل شخص وسجل، ويُبقي الهيكل كاملًا.
 * يُستدعى على الحالة المزروعة نفسها، فأي حقل جديد يصل تلقائيًا.
 */
export function toLaunchState(seeded: AppStoreState): AppStoreState {
  const organization = launchOrganization(seeded.organization);
  const competition = launchCompetition(seeded.competition, organization.id);
  return {
    ...seeded,
    currentUser: launchPlaceholderUser(organization.id),
    organization,
    organizations: [organization],
    competition,
    competitions: [competition],
    // أشخاص وسجلات: تبدأ فارغة دائمًا في نشرٍ حقيقي.
    participants: [],
    committees: [],
    judges: [],
    results: [],
    certificates: [],
    reviewCases: [],
    auditLogs: [],
    incidents: [],
    appeals: [],
    judgeSubmissions: [],
    aiObservations: [],
    audioRecordings: [],
    notifications: [],
    sealApprovals: [],
    // هويات وأدوار تأتي من حوكمة الهوية الخادمية، لا من قائمة مزروعة.
    identityAccounts: [],
    roleGrants: [],
    identityInvitations: [],
    authSessions: [],
    // بيانات عرض إضافية لا يجوز أن تتسرّب إلى نشرٍ حقيقي (تُزرع للعرض فقط).
    webhooks: [],
    integrations: [],
    supportSessions: [],
    travelRecords: [],
    federationAttestations: [],
    participantPassport: [],
    consents: [],
    quorumActions: [],
    featureFlags: [],
    sessionCheckpoints: [],
    continuityIncidents: [],
    sessionRecoveries: [],
    passReissues: [],
    auditLedgerSeals: [],
    // لا جلسة تحكيم مزروعة ولا بوابات كشف في نشرٍ حقيقي: وإلا ورث محكمٌ حقيقي جلسة العرض
    // (متسابق ولجنة مخترعان) فتعطّلت موافقته على الكشف لعدم تطابق هويته مع محكمي تلك اللجنة.
    questionRevealGates: [],
    activeSession: {
      ...seeded.activeSession,
      sessionId: '',
      participant: null,
      committee: null,
      questionSelection: null,
      currentQuestionIndex: 0,
      isReciting: false,
      durationSeconds: 0,
      events: [],
      isLocked: false,
      questionPhase: 'SEALED',
    },
  };
}

/** حالة محفوظة تحمل هوية بيانات العرض لا يجوز إحياؤها في نشرٍ حقيقي. */
export function isDemoResidue(savedOrganizationId: string | undefined, demoOrganizationId: string): boolean {
  return !!savedOrganizationId && savedOrganizationId === demoOrganizationId;
}
