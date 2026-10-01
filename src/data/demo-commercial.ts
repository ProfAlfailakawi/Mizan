/*
 * اللوحات التجارية في بيئة العرض — المنصّة والمشغّل والترخيص.
 *
 * هذه اللوحات الثلاث تقرأ من الخادم بهوية مالكٍ موثّقة (`/api/saas/...`)، ولا هوية كهذه
 * في صندوقٍ بلا حساب. فكان من يدخل بدور «مالك المشغّل» أو «مدير الفوترة» أو «مدير
 * التخزين» يرى صفحةً بيضاء وسطرًا أحمر: «يلزم تسجيل الدخول بحساب مخوّل» — فيظنّ العطل في
 * المنتج لا في غياب الحساب، ويبقى ثلث المنظومة بلا ما يُعرض به.
 *
 * والقاعدة لم تُمسّ: الخادم كما هو، وحرّاسه كما هي، والجلسة الحقيقية تقرأ منه وحده. وهذه
 * حمولاتٌ تُبنى في `src/data` ولا يصل إليها إلا `api()` وهي داخل بيئة العرض، باستيرادٍ
 * ديناميكي لا يُنفَّذ في نشرٍ حقيقي أصلًا. وكل رقمٍ فيها مخترع، والشريط التجريبي فوق كل
 * شاشة يقول ذلك.
 */

import { demoDate } from './demo-clock';

const GB = 1024 ** 3;
const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString();
const month = (back: number) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - back);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

const DEMO_OPERATOR = { id: 'OP-DEMO-1', name: 'دار ميزان للتشغيل المعتمد', status: 'active', pricingTier: 'enterprise', whiteLabelLevel: 'operator', createdAt: iso(-620) };

const DEMO_PLANS = [
  { id: 'PLAN-ENT', name: 'باقة المؤسسات', active: true, ownerOperatorId: undefined as string | undefined, limits: { activeCompetitions: 12, annualParticipants: 20000, storageBytes: 2048 * GB } },
  { id: 'PLAN-GROWTH', name: 'باقة النمو', active: true, ownerOperatorId: undefined as string | undefined, limits: { activeCompetitions: 4, annualParticipants: 4000, storageBytes: 512 * GB } },
  { id: 'PLAN-OP-GULF', name: 'باقة الخليج — من المشغّل', active: true, ownerOperatorId: DEMO_OPERATOR.id, limits: { activeCompetitions: 6, annualParticipants: 9000, storageBytes: 1024 * GB } },
];

const DEMO_ORGS = [
  { id: 'org-demo-mizan', officialName: 'جهة ميزان التجريبية للمسابقات القرآنية', shortName: 'ميزان', country: 'الكويت', status: 'active', operatorId: DEMO_OPERATOR.id, tenantId: 'tenant-demo-mizan', licenseId: 'LIC-DEMO-1', planId: 'PLAN-ENT', mizanBytes: 431 * GB, externalBytes: 96 * GB, activeCompetitions: 3, participants: 2480 },
  { id: 'org-demo-hafiz', officialName: 'مؤسسة حفّاظ الخليج', shortName: 'حفّاظ', country: 'المملكة العربية السعودية', status: 'active', operatorId: DEMO_OPERATOR.id, tenantId: 'tenant-demo-hafiz', licenseId: 'LIC-DEMO-2', planId: 'PLAN-OP-GULF', mizanBytes: 188 * GB, externalBytes: 0, activeCompetitions: 2, participants: 1140 },
  { id: 'org-demo-nour', officialName: 'جمعية نور التلاوة', shortName: 'نور', country: 'الأردن', status: 'active', operatorId: DEMO_OPERATOR.id, tenantId: 'tenant-demo-nour', licenseId: 'LIC-DEMO-3', planId: 'PLAN-GROWTH', mizanBytes: 62 * GB, externalBytes: 0, activeCompetitions: 1, participants: 380 },
  { id: 'org-demo-sakina', officialName: 'دار السكينة للقرآن', shortName: 'السكينة', country: 'المغرب', status: 'suspended', operatorId: DEMO_OPERATOR.id, tenantId: 'tenant-demo-sakina', licenseId: 'LIC-DEMO-4', planId: 'PLAN-GROWTH', mizanBytes: 9 * GB, externalBytes: 0, activeCompetitions: 0, participants: 0 },
];

const licenseOf = (org: (typeof DEMO_ORGS)[number], index: number) => {
  const plan = DEMO_PLANS.find(p => p.id === org.planId) || DEMO_PLANS[0];
  return {
    id: org.licenseId,
    organizationId: org.id,
    planId: plan.id,
    planName: plan.name,
    status: org.status === 'suspended' ? 'suspended' : 'active',
    startsAt: iso(-365 + index * 12),
    expiresAt: iso(index === 1 ? 21 : 180 + index * 30),
    whiteLabelEnabled: plan.id !== 'PLAN-GROWTH',
    limits: plan.limits,
  };
};

const usageOf = (org: (typeof DEMO_ORGS)[number]) => ({
  activeCompetitions: org.activeCompetitions,
  annualParticipants: org.participants,
  mizanStorageBytes: org.mizanBytes,
  externalStorageBytes: org.externalBytes,
  reservedBytes: Math.round(org.mizanBytes * 0.02),
  byCategory: {
    audio: Math.round(org.mizanBytes * 0.71),
    video: Math.round(org.mizanBytes * 0.18),
    image: Math.round(org.mizanBytes * 0.06),
    document: Math.round(org.mizanBytes * 0.04),
    other: Math.round(org.mizanBytes * 0.01),
  },
});

const baseInvoices = () => {
  const rows: Record<string, unknown>[] = [];
  DEMO_ORGS.forEach((org, orgIndex) => {
    for (let back = 0; back < 6; back++) {
      /* أكثرها مدفوع، وواحدةٌ مفتوحة وأخرى متأخّرة: لوحةُ فوترةٍ كلها «مدفوع» لا تُظهر كيف تُدار. */
      const open = back === 0 && orgIndex < 2;
      const overdue = back === 1 && orgIndex === 1;
      rows.push({
        id: `INV-DEMO-${orgIndex + 1}-${back + 1}`,
        number: `MZN-${month(back).replace('-', '')}-${String(orgIndex + 1).padStart(3, '0')}`,
        daysOverdue: overdue ? 17 : 0,
        lines: [
          { description: 'اشتراك ميزان السنوي — قسط شهري', amountMinor: 250_000 + orgIndex * 75_000 - 25_000 },
          { description: 'تخزين إضافي وأرشفة التسجيلات', amountMinor: 25_000 },
        ],
        subjectType: 'organization',
        subjectId: org.id,
        subjectName: org.officialName,
        planId: org.planId,
        currency: 'KWD',
        amountMinor: 250_000 + orgIndex * 75_000,
        status: open ? 'open' : overdue ? 'open' : 'paid',
        issuedAt: `${month(back)}-01T09:00:00.000Z`,
        dueAt: `${month(back)}-15T09:00:00.000Z`,
        paidAt: open || overdue ? undefined : `${month(back)}-09T11:20:00.000Z`,
        overdue,
      });
    }
  });
  for (let back = 0; back < 4; back++) {
    rows.push({
      id: `INV-DEMO-OP-${back + 1}`, number: `MZN-${month(back).replace('-', '')}-OP1`, daysOverdue: 0, lines: [{ description: 'رسوم تشغيل المنصّة — المشغّل المعتمد', amountMinor: 120_000 }],
      subjectType: 'operator', subjectId: DEMO_OPERATOR.id, subjectName: DEMO_OPERATOR.name, planId: 'PLAN-ENT', currency: 'KWD', amountMinor: 120_000,
      status: back === 0 ? 'open' : 'paid', issuedAt: `${month(back)}-01T09:00:00.000Z`, dueAt: `${month(back)}-20T09:00:00.000Z`, paidAt: back === 0 ? undefined : `${month(back)}-12T10:05:00.000Z`, overdue: false,
    });
  }
  return rows;
};

const operatorSubscription = () => ({
  id: 'SUB-DEMO-OP-1', subjectType: 'operator', subjectId: DEMO_OPERATOR.id, subjectName: DEMO_OPERATOR.name, planId: 'PLAN-ENT', planName: 'باقة المؤسسات',
  status: 'active', currency: 'KWD', amountMinor: 120_000, interval: 'month', startedAt: iso(-330), renewsAt: iso(20), currentPeriodEnd: iso(20), autoRenew: true, openAmountMinor: 120_000,
});

const baseSubscriptions = () => [...DEMO_ORGS.map((org, index) => ({
  currentPeriodEnd: iso(180 - index * 20), autoRenew: org.status !== 'suspended', openAmountMinor: index < 2 ? 250_000 + index * 75_000 : 0, operatorName: DEMO_OPERATOR.name,
  id: `SUB-DEMO-${index + 1}`,
  subjectType: 'organization',
  subjectId: org.id,
  subjectName: org.officialName,
  planId: org.planId,
  planName: DEMO_PLANS.find(p => p.id === org.planId)?.name,
  status: org.status === 'suspended' ? 'canceled' : 'active',
  currency: 'KWD',
  amountMinor: 250_000 + index * 75_000,
  interval: 'year',
  startedAt: iso(-360 + index * 10),
  renewsAt: iso(180 - index * 20),
})), operatorSubscription()];

/* طبقة الكتابة المحاكاة (ذاكرة التبويب وحدها): تُصحَّح بها القراءات اللاحقة فيرى المالك أثر نقرته. */
const EXTRA_INVOICES: Record<string, unknown>[] = [];
const EXTRA_SUBSCRIPTIONS: Record<string, unknown>[] = [];
const INVOICE_PATCH = new Map<string, Record<string, unknown>>();
const SUBSCRIPTION_PATCH = new Map<string, Record<string, unknown>>();
const invoices = () => [...baseInvoices(), ...EXTRA_INVOICES].map(r => ({ ...r, ...(INVOICE_PATCH.get(String(r.id)) || {}) }));
const subscriptions = () => [...baseSubscriptions(), ...EXTRA_SUBSCRIPTIONS].map(r => ({ ...r, ...(SUBSCRIPTION_PATCH.get(String(r.id)) || {}) }));

const byCurrency = (rows: Record<string, unknown>[]) => {
  const total = rows.reduce((sum, r) => sum + Number(r.amountMinor || 0), 0);
  return total ? [{ currency: 'KWD', amountMinor: total }] : [];
};

const billing = () => {
  const invs = invoices();
  const subs = subscriptions();
  const paid = invs.filter(x => x.status === 'paid');
  const open = invs.filter(x => x.status === 'open');
  const overdue = open.filter(x => x.overdue);
  return {
    subscriptions: subs,
    invoices: invs,
    summary: {
      activeSubscriptions: subs.filter(x => x.status === 'active').length,
      canceledSubscriptions: subs.filter(x => x.status === 'canceled').length,
      paidInvoices: paid.length,
      openInvoices: open.length,
      overdueInvoices: overdue.length,
      collected: byCurrency(paid),
      outstanding: byCurrency(open),
      overdue: byCurrency(overdue),
      revenueByMonth: Array.from({ length: 12 }, (_, i) => {
        const key = month(11 - i);
        const rows = paid.filter(x => String(x.paidAt || '').slice(0, 7) === key);
        return { month: key, count: rows.length, byCurrency: byCurrency(rows) };
      }),
    },
  };
};

const storageAccounts = (organizationId: string) => organizationId === 'org-demo-mizan'
  ? [{ id: 'STG-DEMO-1', organizationId, provider: 'cloudflare_r2', container: 'mizan-demo-assets', region: 'eu-west-locked', connectionStatus: 'connected', lastTestedAt: iso(-2), createdAt: iso(-200) }]
  : [];

const paymentGateway = { configured: true, name: 'بوابة الدفع التجريبية' };

/** لوحة مالك المنصّة. */
export function demoOwnerDashboard() {
  const b = billing();
  return {
    counts: {
      organizations: DEMO_ORGS.length,
      activeOrganizations: DEMO_ORGS.filter(o => o.status === 'active').length,
      suspendedOrganizations: DEMO_ORGS.filter(o => o.status === 'suspended').length,
      operators: 1,
      activeOperators: 1,
      activeCompetitions: DEMO_ORGS.reduce((n, o) => n + o.activeCompetitions, 0),
      participantsThisYear: DEMO_ORGS.reduce((n, o) => n + o.participants, 0),
      licensesExpiringSoon: 1,
      pendingChangeRequests: 2,
    },
    storage: {
      mizanBytes: DEMO_ORGS.reduce((n, o) => n + o.mizanBytes, 0),
      externalBytes: DEMO_ORGS.reduce((n, o) => n + o.externalBytes, 0),
    },
    organizations: DEMO_ORGS.map((o, i) => ({
      ...o,
      license: licenseOf(o, i),
      storageUsedBytes: o.mizanBytes,
      operatorName: DEMO_OPERATOR.name,
    })),
    operators: [{
      ...DEMO_OPERATOR,
      creditBalance: 6,
      organizations: DEMO_ORGS.length,
      storageUsedBytes: DEMO_ORGS.reduce((n, o) => n + o.mizanBytes, 0),
    }],
    plans: DEMO_PLANS.filter(p => !p.ownerOperatorId),
    changeRequests: [
      { id: 'CR-DEMO-1', organizationId: 'org-demo-nour', field: 'officialName', requestedValue: 'جمعية نور التلاوة الخيرية', status: 'pending', createdAt: iso(-3) },
      { id: 'CR-DEMO-2', organizationId: 'org-demo-hafiz', field: 'country', requestedValue: 'المملكة العربية السعودية', status: 'pending', createdAt: iso(-1) },
    ],
    creditLedger: [
      { id: 'CL-DEMO-1', operatorId: DEMO_OPERATOR.id, delta: 10, reason: 'رصيد افتتاحي', createdAt: iso(-600) },
      { id: 'CL-DEMO-2', operatorId: DEMO_OPERATOR.id, delta: -4, reason: 'إنشاء أربع جهات', createdAt: iso(-320) },
    ],
    audit: [],
    billing: b,
    paymentGateway,
  };
}

/** لوحة المشغّل. */
export function demoOperatorDashboard() {
  const b = billing();
  return {
    operator: DEMO_OPERATOR,
    creditBalance: 6,
    plans: DEMO_PLANS.map(p => ({ id: p.id, name: p.name, active: p.active, ownerOperatorId: p.ownerOperatorId })),
    ownedPlans: DEMO_PLANS.filter(p => p.ownerOperatorId === DEMO_OPERATOR.id),
    organizations: DEMO_ORGS.map((o, i) => ({
      organization: o,
      license: licenseOf(o, i),
      linkedToOperator: true,
      usage: usageOf(o),
    })),
    creditLedger: [
      { id: 'CL-DEMO-2', operatorId: DEMO_OPERATOR.id, delta: -4, reason: 'إنشاء أربع جهات', createdAt: iso(-320) },
    ],
    billing: { ...b, mySubscription: [operatorSubscription()], myInvoices: (b.invoices as { subjectType: string }[]).filter(x => x.subjectType === 'operator') },
    paymentGateway,
  };
}

/** لوحة «الاستخدام والترخيص» لجهةٍ بعينها — يقرؤها مدير الجهة والتخزين والفوترة. */
export function demoOrganizationUsage(organizationId = 'org-demo-mizan') {
  const index = Math.max(0, DEMO_ORGS.findIndex(o => o.id === organizationId));
  const org = DEMO_ORGS[index] || DEMO_ORGS[0];
  return {
    organization: org,
    license: licenseOf(org, index),
    usage: usageOf(org),
    storageAccounts: storageAccounts(org.id),
    migrations: [],
    changeRequests: [],
  };
}

/*
 * غرفة قيادة المنصّة (`/api/owner/control-tower`) في بيئة العرض.
 *
 * الشكل هو ما يبنيه `ControlTowerRepository.buildSnapshot` في الخادم حرفيًّا، والأرقام
 * من الجهات الأربع أعلاه نفسها: ثلاث نشطة وواحدة موقوفة، ومسابقاتها الحيّة، وقضايا ثلاث
 * تحتاج المالك — واحدةٌ يحلّها ميزان بضغطة، وواحدةٌ عند الجهة، وواحدةٌ محميّة بالنزاهة لا
 * تُحلّ إلا بمسار حوكمة. فيرى الزائر كل صنفٍ من أصناف «ميزان Doctor» مرةً واحدة.
 */
export function demoOwnerControlTower() {
  const now = new Date().toISOString();
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const signals = [
    { key: 'api', label: 'واجهة ميزان', state: 'HEALTHY', source: 'probe', checkedAt: minutesAgo(1) },
    { key: 'firestore', label: 'قاعدة البيانات', state: 'HEALTHY', source: 'probe', checkedAt: minutesAgo(1) },
    { key: 'storage', label: 'تخزين الجهات', state: 'HEALTHY', source: 'probe', checkedAt: minutesAgo(2) },
    { key: 'notifications', label: 'الإشعارات', state: 'DEGRADED', source: 'telemetry', checkedAt: minutesAgo(3), reason: 'مزوّد الرسائل القصيرة يردّ ببطء', tenantId: 'org-demo-hafiz' },
    { key: 'edge', label: 'خوادم القاعات', state: 'HEALTHY', source: 'heartbeat', checkedAt: minutesAgo(1) },
  ];
  const needsAttention = [
    {
      id: 'diag-demo-1', code: 'NOTIFICATION_PROVIDER_SLOW', tenantId: 'org-demo-hafiz', classification: 'MIZAN_ACTION_REQUIRED', confidence: 'HIGH',
      rootCause: 'SMS provider latency above threshold', evidence: [{ check: 'زمن ردّ المزوّد', state: 'DEGRADED', detail: '4.8 ثانية (الحدّ 2)' }, { check: 'رسائل فاشلة آخر ساعة', state: 'FAIL', detail: '37 من 612' }],
      recommendedActions: ['notification.retry', 'provider.circuit_break'], safeActionCodes: ['notification.retry', 'provider.circuit_break', 'diagnostic.bundle.generate'],
      doctorSummaryArabic: 'رسائل «اقترب دورك» تتأخّر لدى مؤسسة حفّاظ الخليج', doctorSummaryEnglish: 'Turn-soon SMS messages are delayed for Gulf Huffaz',
    },
    {
      id: 'diag-demo-2', code: 'HOST_REQUIRED', tenantId: 'org-demo-nour', classification: 'TENANT_ACTION_REQUIRED', confidence: 'HIGH',
      rootCause: 'HOST_REQUIRED', evidence: [{ check: 'نطاق الجهة', state: 'UNKNOWN', detail: 'لم يُضبط نطاق فرعي' }],
      recommendedActions: ['domain.retest'], safeActionCodes: ['domain.retest'],
      remedy: { kind: 'configure', actions: [], hintArabic: 'تضبط جمعية نور التلاوة نطاقها الفرعي من «إدارة الجهة ← الهوية»، ثم يُعاد الاختبار تلقائيًا.', hintEnglish: 'The tenant sets its subdomain, then the check re-runs automatically.' },
      doctorSummaryArabic: 'جمعية نور التلاوة لم تضبط نطاقها بعد', doctorSummaryEnglish: 'Noor Tilawa has not configured its domain yet',
    },
    {
      id: 'diag-demo-3', code: 'SEAL_QUORUM_PENDING', tenantId: 'org-demo-mizan', competitionId: 'comp-dubai-2027', classification: 'INTEGRITY_PROTECTED', confidence: 'MEDIUM',
      rootCause: 'Result seal waiting for second approver', evidence: [{ check: 'نصاب الختم', state: 'UNKNOWN', detail: 'موافقة 1 من 2' }],
      recommendedActions: [], safeActionCodes: [],
      doctorSummaryArabic: 'ختم نتائج مسابقة ميزان ينتظر الموافقة الثانية', doctorSummaryEnglish: 'Mizan competition seal is waiting for the second approval',
    },
  ];
  const active = DEMO_ORGS.filter(o => o.status === 'active');
  return {
    generatedAt: now,
    platform: { state: 'DEGRADED', healthScore: 94, scoreAvailable: true, unknownSignals: 0, signals },
    metrics: {
      activeTenants: active.length,
      liveCompetitions: active.reduce((n, o) => n + o.activeCompetitions, 0),
      connectedUsers: 318,
      connectedDevices: 46,
      activeIncidents: 1,
      degradedTenants: 1,
      authFailureSpike: null,
      notificationFailureRate: 0.06,
      autoHealedToday: 4,
      unresolvedProblems: needsAttention.length,
      supportEscalations: 2,
    },
    needsAttention,
    autoResolved: [],
    incidents: [{ id: 'inc-demo-1', tenantId: 'org-demo-hafiz', severity: 'MEDIUM', status: 'MONITORING', title: 'تأخّر الرسائل القصيرة', openedAt: minutesAgo(42) }],
    supportSessions: [],
    knownErrors: [],
    commercial: [],
    killSwitches: [],
    safeSnapshots: [],
    breakGlass: [],
    autoHealRuns: [],
    telemetry: null,
    playbooks: [],
    summaryCadence: { daily: 'ملخّص يومي بالقضايا المفتوحة والإصلاحات التلقائية', weekly: 'ملخّص أسبوعي بالاتجاهات والجهات الأكثر ضجيجًا' },
  };
}

/*
 * اللوحات التجارية التفصيلية (`CommercialPanels`): الاشتراك، وحساب المشغّل ومحفظته، وتقارير المنصّة،
 * والعلامة، والنشر في الاكتشاف، والدخول الموحّد، وبوابة الدفع. الجهات والباقات هي نفسها أعلاه،
 * فما يُرى هنا يطابق ما في لوحات المالك والمشغّل رقمًا باسم.
 */
const ENTITLEMENTS = [
  { id: 'PLAN-GROWTH', name: 'Growth', nameArabic: 'باقة النمو', participantAllowance: 4000, activeCompetitionAllowance: 4, publicPriceMinor: 250_000, currency: 'KWD' },
  { id: 'PLAN-ENT', name: 'Enterprise', nameArabic: 'باقة المؤسسات', participantAllowance: 20000, activeCompetitionAllowance: 12, publicPriceMinor: 700_000, currency: 'KWD' },
  { id: 'PLAN-PLUS', name: 'Enterprise Plus', nameArabic: 'باقة المؤسسات بلس', participantAllowance: 50000, activeCompetitionAllowance: 30, publicPriceMinor: 1_400_000, currency: 'KWD' },
  { id: 'PLAN-START', name: 'Starter', nameArabic: 'باقة البداية', participantAllowance: 800, activeCompetitionAllowance: 1, publicPriceMinor: 90_000, currency: 'KWD' },
];

function demoOrganizationBilling() {
  /* جهة ميزان التجريبية على «باقة المؤسسات» — كما في لوحة المالك ولوحة الاستخدام — فلا تتناقض الشاشات. */
  const org = DEMO_ORGS[0];
  const plan = ENTITLEMENTS[1];
  return {
    plan,
    term: { id: 'TERM-DEMO-3', termIndex: 3, startsAt: iso(-200), endsAt: iso(165) },
    accessState: 'active',
    usage: {
      participantsUsed: org.participants, participantAllowance: 22_000, participantsRemaining: 22_000 - org.participants,
      activeCompetitions: org.activeCompetitions, activeCompetitionAllowance: plan.activeCompetitionAllowance,
      warningThresholdBps: 0,
    },
    limits: { base: { participantAllowance: plan.participantAllowance, activeCompetitionAllowance: plan.activeCompetitionAllowance }, override: { participantAllowance: 22_000 }, effective: { participantAllowance: 22_000, activeCompetitionAllowance: plan.activeCompetitionAllowance } },
    pendingPlanChange: null,
    upgradePath: 'self_serve',
    catalog: ENTITLEMENTS,
    history: [
      { id: 'TERM-DEMO-2', startsAt: iso(-565), endsAt: iso(-200), participantsUsed: 2310, participantAllowance: 20_000 },
      { id: 'TERM-DEMO-1', startsAt: iso(-930), endsAt: iso(-565), participantsUsed: 1740, participantAllowance: 20_000 },
    ],
  };
}

function demoOperatorCommercial() {
  const dash = demoOperatorDashboard();
  const cost = [180_000, 150_000, 150_000, 150_000];
  const customers = DEMO_ORGS.map((o, i) => {
    const plan = DEMO_PLANS.find(p => p.id === o.planId) || DEMO_PLANS[0];
    return {
      organizationId: o.id, officialName: o.officialName, planName: plan.name,
      term: { id: `TERM-OP-${i + 1}`, termIndex: 1 + (i % 3) },
      participantsUsed: o.participants, participantAllowance: plan.limits.annualParticipants,
      renewalDate: iso(i === 1 ? 21 : 150 + i * 30), accessState: o.status === 'suspended' ? 'suspended' : i === 1 ? 'grace' : 'active',
      walletCostMinor: cost[i], currency: 'KWD', domain: i === 0 ? 'quran.mizan-demo.example' : i === 1 ? 'hufaz.mizan-demo.example' : '',
    };
  });
  const ledgerRows: { type: string; amountMinor: number; reason: string; daysAgo: number }[] = [
    { type: 'commitment', amountMinor: 2_000_000, reason: 'التزام العام الأول', daysAgo: 330 },
    { type: 'top_up', amountMinor: 500_000, reason: 'شحن المحفظة — حوالة بنكية', daysAgo: 270 },
    { type: 'license_activation', amountMinor: -180_000, reason: 'تفعيل ترخيص جهة ميزان التجريبية', daysAgo: 262 },
    { type: 'license_activation', amountMinor: -150_000, reason: 'تفعيل ترخيص مؤسسة حفّاظ الخليج', daysAgo: 200 },
    { type: 'license_activation', amountMinor: -150_000, reason: 'تفعيل ترخيص جمعية نور التلاوة', daysAgo: 140 },
    { type: 'top_up', amountMinor: 400_000, reason: 'شحن المحفظة — حوالة بنكية', daysAgo: 95 },
    { type: 'plan_upgrade', amountMinor: -90_000, reason: 'ترقية باقة مؤسسة حفّاظ الخليج', daysAgo: 60 },
    { type: 'license_renewal', amountMinor: -150_000, reason: 'تجديد ترخيص دار السكينة', daysAgo: 35 },
    { type: 'refund', amountMinor: 45_000, reason: 'استرداد جزئي — إلغاء ترخيص', daysAgo: 18 },
    { type: 'admin_adjustment', amountMinor: 20_000, reason: 'تسوية رصيد افتتاحي', daysAgo: 7 },
  ];
  let bal = 0;
  const ledger = ledgerRows.map((r, i) => { bal += r.amountMinor; return { id: `LED-DEMO-${i + 1}`, type: r.type, amountMinor: r.amountMinor, currency: 'KWD', balanceAfterMinor: bal, reason: r.reason, createdAt: iso(-r.daysAgo) }; }).reverse();
  return {
    summary: {
      currency: 'KWD', balanceMinor: bal, annualCommitmentMinor: 2_000_000, spentThisAgreementMinor: 720_000, discountBps: 2_500,
      customerOrganizations: customers.length, activeCustomerSubscriptions: customers.filter(c => c.accessState !== 'suspended').length,
      upcomingRenewals: 2, pendingRenewals: 1, suspendedCustomers: customers.filter(c => c.accessState === 'suspended').length,
    },
    tier: { id: 'authorized', slug: 'authorized', name: 'Authorized Partner', nameArabic: 'شريك معتمد', discountBps: 2_500 },
    agreement: { id: 'AGR-DEMO-1', operatorId: DEMO_OPERATOR.id, status: 'active', startsAt: iso(-330), endsAt: iso(35) },
    wallet: { operatorId: DEMO_OPERATOR.id },
    legacyCreditBalance: dash.creditBalance,
    customers,
    pricing: DEMO_PLANS.map((p, i) => ({ id: p.id, name: p.name, custom: false, publicPriceMinor: [700_000, 250_000, 220_000][i], wholesalePriceMinor: [525_000, 187_500, 150_000][i], resalePriceMinor: [600_000, 220_000, 190_000][i], currency: 'KWD' })),
    ledger,
  };
}

function demoOwnerCommercial() {
  const plans = ENTITLEMENTS.map((p, i) => ({ ...p, custom: false, upcomingVersion: i === 1 ? { publicPriceMinor: 760_000, effectiveFrom: iso(60) } : null }));
  return {
    plans,
    tiers: [
      { id: 'tier-1', slug: 'registered', name: 'Registered Partner', nameArabic: 'شريك مسجّل', discountBps: 1_500 },
      { id: 'tier-2', slug: 'authorized', name: 'Authorized Partner', nameArabic: 'شريك معتمد', discountBps: 2_500 },
      { id: 'tier-3', slug: 'strategic', name: 'Strategic Partner', nameArabic: 'شريك استراتيجي', discountBps: 3_500 },
    ],
    report: {
      directAnnualRecurring: [{ currency: 'KWD', amountMinor: 1_550_000 }],
      operatorWholesaleSales12m: [{ currency: 'KWD', amountMinor: 1_120_000 }],
      walletBalances: [{ currency: 'KWD', amountMinor: 1_835_000 }],
      activeOrganizations: DEMO_ORGS.filter(o => o.status === 'active').length,
      upcomingRenewals60d: 2,
      operators: [{ id: DEMO_OPERATOR.id, name: DEMO_OPERATOR.name }, { id: 'OP-DEMO-2', name: 'مركز الإتقان للتشغيل' }],
      agreements: [
        { id: 'AGR-DEMO-1', operatorId: DEMO_OPERATOR.id, status: 'active', discountBps: 2_500, minimumAnnualCommitmentMinor: 2_000_000, currency: 'KWD', startsAt: iso(-330), endsAt: iso(35) },
        { id: 'AGR-DEMO-2', operatorId: 'OP-DEMO-2', status: 'draft', discountBps: 1_500, minimumAnnualCommitmentMinor: 800_000, currency: 'KWD', startsAt: iso(10), endsAt: iso(375) },
      ],
      migrationReports: [],
    },
  };
}

const DEMO_BRAND = {
  profile: { brandingMode: 'co_branded', productName: 'ميزان — جهة ميزان التجريبية', logoUrl: '', faviconUrl: '', primaryColor: '#1f6f4a', directoryName: 'دليل مسابقات ميزان', supportEmail: 'support@mizan-demo.example', showPoweredByMizan: true },
  rights: { maxMode: 'full_white_label', hideMizanBrand: true, customDomain: true, operatorDirectory: true, globalSyndication: true },
  domains: [
    { id: 'DOM-DEMO-1', hostname: 'quran.mizan-demo.example', status: 'active' },
    { id: 'DOM-DEMO-2', hostname: 'awards.mizan-demo.example', status: 'pending', verificationRecord: '_mizan-verify.awards.mizan-demo.example', verificationToken: 'mzn-demo-verification-token' },
  ],
};

const DEMO_LISTINGS = {
  listings: [{
    id: 'LST-DEMO-1', competitionId: 'comp-dubai-2027', title: 'MIZAN International Quran Competition 2026', titleArabic: 'مسابقة ميزان القرآنية الدولية 2026',
    summary: 'Recitation and memorization tracks for four age groups, judged by blind panels.', summaryArabic: 'مسارات الحفظ والتلاوة لأربع فئات عمرية، بتحكيم لجانٍ مستقلة.',
    city: 'دبي', mode: 'in_person', ageRanges: ['8-12', '13-17', '18-25'], languages: ['ar', 'en'], memorizationLevels: ['خمسة أجزاء', 'عشرة أجزاء', 'المصحف كاملًا'],
    visibility: { organizationDirectory: true, operatorDirectory: true, globalSyndication: false }, status: 'published', publicSlug: 'mizan-international-2027',
  }],
};

const DEMO_SSO = {
  config: {
    protocol: 'saml', firebaseProviderId: 'saml.mizan-demo-idp', displayName: 'الدخول بحساب الجهة', allowedEmailDomains: ['mizan-demo.example'], groupsAttribute: 'groups',
    roleMapping: [{ group: 'mizan-judges', role: 'judge' }, { group: 'mizan-head-judges', role: 'head_judge' }, { group: 'mizan-ops', role: 'ops_manager' }, { group: 'mizan-auditors', role: 'auditor' }],
    status: 'active', preferSso: true,
  },
};

const GATEWAY_PRESETS = {
  presets: [
    { id: 'myfatoorah', label: 'MyFatoorah', labelArabic: 'ماي فاتورة', docsUrl: 'https://docs.myfatoorah.com', notes: ['Use the sandbox key first.', 'Set the notification URL in the dashboard.'], notesArabic: ['ابدأ بمفتاح البيئة التجريبية.', 'اضبط عنوان الإشعار من لوحة البوابة.'], profile: { name: 'myfatoorah', currency: 'KWD' } },
    { id: 'tap', label: 'Tap Payments', labelArabic: 'تاب', docsUrl: 'https://developers.tap.company', notes: ['Webhook signature uses HMAC-SHA256.'], notesArabic: ['توقيع الإشعار بخوارزمية HMAC-SHA256.'], profile: { name: 'tap', currency: 'KWD' } },
    { id: 'stripe', label: 'Stripe', labelArabic: 'سترايب', docsUrl: 'https://stripe.com/docs', notes: ['Create a restricted key with Checkout permission.'], notesArabic: ['أنشئ مفتاحًا مقيّدًا بصلاحية صفحة الدفع.'], profile: { name: 'stripe', currency: 'USD' } },
  ],
};

function demoPaymentGateways(ownerType: string, ownerId: string) {
  return {
    gateways: [
      { id: `GW-${ownerId}-1`, displayName: 'ماي فاتورة — الكويت', provider: 'myfatoorah', status: 'active', lastTest: { at: iso(-12), ok: true } },
      { id: `GW-${ownerId}-2`, displayName: 'تاب — احتياطية', provider: 'tap', status: 'pending_test' },
    ],
    effective: { displayName: 'ماي فاتورة — الكويت', ownerType },
    webhookBase: 'https://demo.mizan.example/api/payments/webhook/',
  };
}

function demoLedgerCsv() {
  const rows = demoOperatorCommercial().ledger;
  return ['id,type,amountMinor,currency,balanceAfterMinor,createdAt', ...rows.map(r => `${r.id},${r.type},${r.amountMinor},${r.currency},${r.balanceAfterMinor},${r.createdAt}`)].join('\n');
}

/** دليل Discover العام في بيئة العرض: بطاقات جهات الصندوق نفسها، تُصفّى بالبحث وبحالة التسجيل كما يفعل الخادم. */
export function demoDiscoverDirectory(query = '', registrationOpenOnly = false) {
  const base = (over: Record<string, unknown> & { title: string; titleArabic: string; institutionName: string }) => ({ summary: '', summaryArabic: '', country: '', city: '', mode: 'in_person', riwayat: ['حفص عن عاصم'] as string[], registrationOpen: true, ...over });
  const all = [
    base({ publicSlug: 'mizan-international-2027', title: 'MIZAN International Quran Competition 2026', titleArabic: 'مسابقة ميزان القرآنية الدولية 2026', institutionName: 'جهة ميزان التجريبية للمسابقات القرآنية', summaryArabic: 'مسارات الحفظ والتلاوة لأربع فئات عمرية، بتحكيم لجانٍ مستقلة.', summary: 'Recitation and memorization tracks for four age groups, judged by blind panels.', country: 'AE', city: 'دبي', startsOn: demoDate(-1), endsOn: demoDate(4), registrationUrl: '/#register?comp=comp-dubai-2027' }),
    base({ publicSlug: 'hufaz-gulf-youth-2027', title: 'Gulf Huffaz Youth Cup 2027', titleArabic: 'كأس حفّاظ الخليج للناشئة 2027', institutionName: 'مؤسسة حفّاظ الخليج', summaryArabic: 'منافسة سنوية لحفظ القرآن الكريم للفئة من 8 إلى 15 سنة.', summary: 'Annual memorization contest for ages 8 to 15.', country: 'SA', city: 'الرياض', startsOn: '2027-03-18', endsOn: '2027-03-21', mode: 'hybrid', registrationUrl: '/#register?comp=comp-hufaz-2027' }),
    base({ publicSlug: 'noor-tilawa-2026', title: 'Noor Tilawa Recitation Award', titleArabic: 'جائزة نور التلاوة', institutionName: 'جمعية نور التلاوة', summaryArabic: 'جائزة التلاوة المجوّدة عن بُعد، بقراءة ورش عن نافع.', summary: 'Remote tajweed recitation award (Warsh).', country: 'JO', city: 'عمّان', startsOn: '2026-11-12', endsOn: '2026-11-14', mode: 'online', riwayat: ['ورش عن نافع'], registrationUrl: '/#register?comp=comp-noor-2026' }),
    base({ publicSlug: 'sakina-spring-2026', title: 'Sakina Spring Contest 2026', titleArabic: 'مسابقة السكينة الربيعية 2026', institutionName: 'دار السكينة للقرآن', summaryArabic: 'اختُتمت المسابقة وأُعلنت النتائج.', summary: 'Concluded; results published.', country: 'MA', city: 'الدار البيضاء', startsOn: '2026-04-10', endsOn: '2026-04-12', registrationOpen: false }),
  ];
  const q = query.trim();
  const listings = all.filter(l => (!registrationOpenOnly || l.registrationOpen) && (!q || [l.title, l.titleArabic, l.institutionName, l.city].some(v => String(v).includes(q))));
  return { brand: { directoryName: 'MIZAN Discover', directoryNameArabic: 'اكتشف المسابقات القرآنية', primaryColor: '#1f6f4a', showPoweredByMizan: true }, listings };
}

/** يردّ حمولة العرض لمسار الخادم المطلوب، أو `null` إن لم يكن لهذا المسار مقابلٌ هنا. */
export function demoCommercialResponse(path: string): unknown | null {
  /* الأخصّ أولًا: `/api/saas/organization` بادئةٌ لمسارات الاشتراك والاكتشاف والدخول الموحّد أيضًا. */
  if (path.startsWith('/api/saas/organization/billing')) return demoOrganizationBilling();
  if (path.startsWith('/api/saas/organization/discover')) return DEMO_LISTINGS;
  if (path.startsWith('/api/saas/organization/sso')) return DEMO_SSO;
  if (path.startsWith('/api/saas/operator/commercial')) return demoOperatorCommercial();
  if (path.startsWith('/api/saas/owner/commercial')) return demoOwnerCommercial();
  if (path.startsWith('/api/saas/owner/wallet/ledger')) return demoLedgerCsv();
  if (path.startsWith('/api/saas/brand/')) return DEMO_BRAND;
  if (path.startsWith('/api/saas/payment-gateways/presets')) return GATEWAY_PRESETS;
  const gw = /^\/api\/saas\/payment-gateways\/(operator|organization)\/([^/?]+)/.exec(path);
  if (gw) return demoPaymentGateways(gw[1], decodeURIComponent(gw[2]));
  if (path.startsWith('/api/saas/owner/dashboard')) return demoOwnerDashboard();
  if (path.startsWith('/api/saas/operator/dashboard')) return demoOperatorDashboard();
  if (path.startsWith('/api/saas/organization')) return demoOrganizationUsage();
  if (path.startsWith('/api/owner/control-tower')) return demoOwnerControlTower();
  return null;
}

let simSeq = 0;
const simId = (prefix: string) => `${prefix}-DEMO-NEW-${++simSeq}`;
const parseBody = (init?: { body?: unknown }): Record<string, any> => {
  try { return typeof init?.body === 'string' ? JSON.parse(init.body) : {}; } catch { return {}; }
};

/**
 * كتابةٌ محاكاة في بيئة العرض فقط — لا شبكة ولا خادم ولا Firestore.
 * تُنفَّذ في ذاكرة التبويب فتُرى آثارها في القراءات اللاحقة حتى يُعاد تحميل الصفحة أو «إعادة تعيين البيانات».
 * ما لا أثر ظاهرًا له (اختبار بوابة، تذكير، تحقق نطاق...) يُجاب بنجاحٍ محاكى `{ ok: true, simulated: true }`.
 */
export function demoCommercialWrite(path: string, init?: { method?: string; body?: unknown }): unknown {
  const method = (init?.method || 'POST').toUpperCase();
  const body = parseBody(init);
  const ok = { ok: true, simulated: true, demo: true };
  const clean = path.split('?')[0];

  if (method === 'POST' && /^\/api\/saas\/(owner|operator)\/organizations$|^\/api\/saas\/operator\/customers$/.test(clean)) {
    const n = DEMO_ORGS.length + 1;
    const org = {
      id: simId('org'), officialName: String(body.officialName || 'جهة تجريبية جديدة'), shortName: String(body.shortName || body.officialName || 'جديدة'),
      country: String(body.country || 'الكويت'), status: 'active', operatorId: String(body.operatorId || DEMO_OPERATOR.id), tenantId: `tenant-demo-new-${n}`,
      licenseId: `LIC-DEMO-${n}`, planId: String(body.planId || DEMO_PLANS[0].id), mizanBytes: 0, externalBytes: 0, activeCompetitions: 0, participants: 0,
    } as (typeof DEMO_ORGS)[number];
    DEMO_ORGS.push(org);
    return { ...ok, organization: org };
  }
  const orgDel = /^\/api\/saas\/owner\/organizations\/([^/]+)$/.exec(clean);
  if (orgDel && method === 'DELETE') { const i = DEMO_ORGS.findIndex(o => o.id === decodeURIComponent(orgDel[1])); if (i >= 0) DEMO_ORGS.splice(i, 1); return ok; }
  if (orgDel && method === 'PUT') {
    const org = DEMO_ORGS.find(o => o.id === decodeURIComponent(orgDel[1]));
    if (org) Object.assign(org, Object.fromEntries(Object.entries(body).filter(([k, v]) => k in org && v !== undefined && v !== '')));
    return { ...ok, organization: org };
  }
  if (method === 'PUT' && /^\/api\/saas\/(owner|operator)\/plans$/.test(clean)) {
    const isOp = clean.includes('/operator/');
    const existing = body.id ? DEMO_PLANS.find(p => p.id === body.id) : undefined;
    const limits = { activeCompetitions: Number(body.limits?.activeCompetitions) || 1, annualParticipants: Number(body.limits?.annualParticipants) || 100, storageBytes: Number(body.limits?.storageBytes) || 10 * GB };
    if (existing) Object.assign(existing, { name: String(body.name || existing.name), active: body.active !== false, limits });
    else DEMO_PLANS.push({ id: simId('PLAN'), name: String(body.name || 'باقة جديدة'), active: body.active !== false, ownerOperatorId: isOp ? DEMO_OPERATOR.id : undefined, limits });
    return ok;
  }
  const planDel = /^\/api\/saas\/(owner|operator)\/plans\/([^/]+)$/.exec(clean);
  if (planDel && method === 'DELETE') { const i = DEMO_PLANS.findIndex(p => p.id === decodeURIComponent(planDel[2])); if (i >= 0) DEMO_PLANS.splice(i, 1); return ok; }

  const base = /^\/api\/saas\/(?:owner|operator)\/billing/.exec(clean) ? clean.replace(/\/(subscriptions|invoices).*$/, '') : '';
  if (base && method === 'POST' && /\/invoices$/.test(clean)) {
    const [subjectType, subjectId] = [String(body.subjectType || 'organization'), String(body.subjectId || DEMO_ORGS[0].id)];
    const org = DEMO_ORGS.find(o => o.id === subjectId);
    const amountMinor = Number(body.amountMinor) || 0;
    const row = {
      id: simId('INV'), number: `MZN-${iso(0).slice(0, 7).replace('-', '')}-N${String(EXTRA_INVOICES.length + 1).padStart(3, '0')}`, daysOverdue: 0,
      lines: [{ description: String(body.note || 'فاتورة يدوية (محاكاة)'), amountMinor }], subjectType, subjectId,
      subjectName: org?.officialName || (subjectId === DEMO_OPERATOR.id ? DEMO_OPERATOR.name : subjectId), planId: org?.planId, currency: String(body.currency || 'KWD'),
      amountMinor, status: 'open', issuedAt: iso(0), dueAt: body.dueAt ? new Date(String(body.dueAt)).toISOString() : iso(14), overdue: false,
    };
    EXTRA_INVOICES.push(row);
    return { ...ok, invoice: row };
  }
  const inv = /\/invoices\/([^/]+)\/(pay|void|remind|checkout)$/.exec(clean);
  if (inv && method === 'POST') {
    const id = decodeURIComponent(inv[1]);
    if (inv[2] === 'pay') INVOICE_PATCH.set(id, { status: 'paid', paidAt: iso(0), overdue: false, daysOverdue: 0 });
    if (inv[2] === 'void') INVOICE_PATCH.set(id, { status: 'void', overdue: false, daysOverdue: 0 });
    /* لا رابط دفع حقيقي في العرض: تُترك الفاتورة مفتوحة ويُعاد نجاحٌ محاكى بلا `paymentUrl`. */
    return ok;
  }
  if (base && method === 'POST' && /\/subscriptions$/.test(clean)) {
    const subjectId = String(body.subjectId || DEMO_ORGS[0].id);
    const org = DEMO_ORGS.find(o => o.id === subjectId);
    const plan = DEMO_PLANS.find(p => p.id === body.planId) || DEMO_PLANS[0];
    const row = {
      id: simId('SUB'), subjectType: String(body.subjectType || 'organization'), subjectId, subjectName: org?.officialName || subjectId, planId: plan.id, planName: plan.name,
      status: 'active', currency: 'KWD', amountMinor: 250_000, interval: 'year', startedAt: body.startsAt ? new Date(String(body.startsAt)).toISOString() : iso(0),
      renewsAt: iso(365), currentPeriodEnd: iso(365), autoRenew: true, openAmountMinor: 0, operatorName: DEMO_OPERATOR.name,
    };
    EXTRA_SUBSCRIPTIONS.push(row);
    return { ...ok, subscription: row };
  }
  const sub = /\/subscriptions\/([^/]+)\/(cancel|auto-renew)$/.exec(clean);
  if (sub && method === 'POST') {
    const id = decodeURIComponent(sub[1]);
    SUBSCRIPTION_PATCH.set(id, sub[2] === 'cancel' ? { status: 'canceled', autoRenew: false } : { ...(SUBSCRIPTION_PATCH.get(id) || {}), autoRenew: body.autoRenew !== false });
    return ok;
  }
  return ok;
}
