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

const invoices = () => {
  const rows: Record<string, unknown>[] = [];
  DEMO_ORGS.forEach((org, orgIndex) => {
    for (let back = 0; back < 6; back++) {
      /* أكثرها مدفوع، وواحدةٌ مفتوحة وأخرى متأخّرة: لوحةُ فوترةٍ كلها «مدفوع» لا تُظهر كيف تُدار. */
      const open = back === 0 && orgIndex < 2;
      const overdue = back === 1 && orgIndex === 1;
      rows.push({
        id: `INV-DEMO-${orgIndex + 1}-${back + 1}`,
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
  return rows;
};

const subscriptions = () => DEMO_ORGS.map((org, index) => ({
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
}));

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
    billing: { ...b, mySubscription: [], myInvoices: [] },
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

/** يردّ حمولة العرض لمسار الخادم المطلوب، أو `null` إن لم يكن لهذا المسار مقابلٌ هنا. */
export function demoCommercialResponse(path: string): unknown | null {
  if (path.startsWith('/api/saas/owner/dashboard')) return demoOwnerDashboard();
  if (path.startsWith('/api/saas/operator/dashboard')) return demoOperatorDashboard();
  if (path.startsWith('/api/saas/organization')) return demoOrganizationUsage();
  return null;
}
