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
 * لا تبقى أي سجلات عرض أو فئات/قاعات/أرقام جاهزة في النشر الحقيقي. الإعدادات البنيوية
 * المحايدة فقط تبقى كي لا تنكسر الواجهات، وكل ما يُرى للمستخدم يأتي من بيانات أُنشئت فعليًا.
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
  const ruleSet = { ...template.ruleSet, frozenAt: undefined };
  return {
    ...template,
    id: 'comp-pending-setup',
    organizationId,
    name: 'Competition pending setup',
    nameArabic: 'مسابقة قيد الإعداد',
    displayName: undefined,
    displayNameArabic: undefined,
    logoUrl: undefined,
    edition: '',
    country: '',
    timezone: '',
    startDate: '',
    endDate: '',
    registrationStartDate: '',
    registrationEndDate: '',
    venueName: '',
    venuesCount: 0,
    currentDay: 0,
    totalDays: 0,
    categories: [],
    ruleSet,
    ruleSets: [ruleSet],
    status: 'draft',
    totalRegistered: 0,
    totalApproved: 0,
    totalAttended: 0,
    closedAt: undefined,
    closedBy: undefined,
    closureReason: undefined,
    readinessChecklist: {
      datesConfigured: false,
      categoriesConfigured: false,
      ruleSetFrozen: false,
      judgesAssigned: false,
      quranSourceLocked: false,
      devicesRegistered: false,
      certificatesReady: false,
    },
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

  // Any top-level array in the seed is a record collection. A production launch must never
  // inherit it: devices, demo halls, scientific fixtures, support rows and "preview" metrics
  // are just as misleading as fake participants. Start every collection empty, then restore
  // only the two structural lists that identify the active tenant and competition.
  const clean = { ...seeded } as AppStoreState;
  for (const key of Object.keys(clean) as (keyof AppStoreState)[]) {
    if (Array.isArray(clean[key])) (clean as unknown as Record<string, unknown>)[key as string] = [];
  }

  return {
    ...clean,
    currentUser: launchPlaceholderUser(organization.id),
    organization,
    organizations: [organization],
    competition,
    competitions: [competition],
    operatingCostModel: { baselineStaff: 0, mizanStaff: 0, hoursPerDay: 0, days: 0 },
    persistenceError: null,
    isOffline: false,
    emergencyFrozen: false,
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
      audioLevel: 0,
      questionPhase: 'SEALED',
      openingAudioRefId: undefined,
      openingAudioPlayedAt: undefined,
      secureRuntimeSessionId: undefined,
      secureQuestionCount: undefined,
    },
  };
}

/** حالة محفوظة تحمل هوية بيانات العرض لا يجوز إحياؤها في نشرٍ حقيقي. */
export function isDemoResidue(savedOrganizationId: string | undefined, demoOrganizationId: string): boolean {
  return !!savedOrganizationId && savedOrganizationId === demoOrganizationId;
}
