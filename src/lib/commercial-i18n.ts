/*
 * نطاق ترجمة الواجهات التجارية (الاشتراك، المشغّل، الكتالوج، النسخ، Discover).
 *
 * نطاقٌ مستقل (namespace) بدل إقحام عشرات المفاتيح في القاموس العام: إضافة لغةٍ ثالثة تعني
 * إضافة عمودٍ هنا، ولا تمسّ المكوّنات. العربية أولًا، والمصطلحات عربيةٌ واضحة لا نقحرة.
 * والمال يُعرض من أعدادٍ صحيحة بالوحدة الصغرى — بلا حسابٍ عشري.
 */

export type CommercialLocale = 'ar' | 'en';

const T = {
  subscription: { ar: 'الاشتراك', en: 'Subscription' },
  currentPlan: { ar: 'الباقة الحالية', en: 'Current plan' },
  term: { ar: 'دورة الاشتراك', en: 'Subscription term' },
  termStart: { ar: 'بداية الدورة', en: 'Term start' },
  termEnd: { ar: 'نهاية الدورة', en: 'Term end' },
  renewalDate: { ar: 'موعد التجديد', en: 'Renewal date' },
  status: { ar: 'الحالة', en: 'Status' },
  usage: { ar: 'الاستخدام', en: 'Usage' },
  participantsUsed: { ar: 'المشاركون المستخدمون', en: 'Participants used' },
  remaining: { ar: 'المتبقي', en: 'Remaining' },
  activeCompetitions: { ar: 'المسابقات النشطة', en: 'Active competitions' },
  history: { ar: 'الدورات السابقة', en: 'Previous terms' },
  noHistory: { ar: 'لا توجد دورات سابقة بعد.', en: 'No previous terms yet.' },
  upgrade: { ar: 'الانتقال إلى باقة أعلى', en: 'Move to a larger plan' },
  scheduleDowngrade: { ar: 'جدولة باقة أصغر للدورة التالية', en: 'Schedule a smaller plan for next term' },
  contactOperator: { ar: 'اشتراك جهتكم مُدار عبر المشغّل. للترقية أو التجديد تواصلوا معه.', en: 'Your subscription is managed by your operator. Contact them to upgrade or renew.' },
  upgradeInvoiced: { ar: 'صدرت فاتورة الترقية. تُطبَّق الباقة الجديدة فور السداد.', en: 'Upgrade invoice issued. The new plan applies once paid.' },
  limitsBase: { ar: 'حدّ الباقة', en: 'Plan limit' },
  limitsOverride: { ar: 'تعديل تعاقدي', en: 'Contract override' },
  limitsEffective: { ar: 'الحدّ الفعلي', en: 'Effective limit' },
  pendingChange: { ar: 'تغيير مجدول', en: 'Scheduled change' },
  warn70: { ar: 'استُخدم أكثر من 70% من حصة المشاركين.', en: 'Over 70% of the participant allowance is used.' },
  warnHigh: { ar: 'اقتربت حصة المشاركين من الاكتمال. فكّروا في الباقة الأعلى.', en: 'The participant allowance is nearly used. Consider the next plan.' },
  warnFull: { ar: 'اكتملت حصة المشاركين في هذه الدورة.', en: 'The participant allowance for this term is used.' },
  state_active: { ar: 'نشط', en: 'Active' },
  state_grace: { ar: 'مهلة التجديد', en: 'Grace period' },
  state_read_only: { ar: 'قراءة فقط', en: 'Read-only' },
  state_suspended: { ar: 'موقوف', en: 'Suspended' },
  state_cancelled: { ar: 'ملغى', en: 'Cancelled' },
  stateHelp_read_only: { ar: 'التاريخ والنتائج متاحة، ولا يُفتح تسجيلٌ أو تحكيمٌ جديد حتى التجديد.', en: 'History and results remain available; new registration or judging needs renewal.' },
  // المشغّل
  operator: { ar: 'المشغّل', en: 'Operator' },
  walletBalance: { ar: 'الرصيد', en: 'Wallet Balance' },
  annualCommitment: { ar: 'الالتزام السنوي', en: 'Annual commitment' },
  spent: { ar: 'المصروف', en: 'Spent' },
  commitmentRemaining: { ar: 'المتبقي من الالتزام', en: 'Commitment remaining' },
  agreementDates: { ar: 'مدة الاتفاقية', en: 'Agreement period' },
  tier: { ar: 'مستوى المشغّل', en: 'Operator tier' },
  discount: { ar: 'خصم الجملة', en: 'Wholesale discount' },
  customers: { ar: 'العملاء', en: 'Customers' },
  activeCustomers: { ar: 'اشتراكات نشطة', en: 'Active subscriptions' },
  upcomingRenewals: { ar: 'تجديدات قادمة', en: 'Upcoming renewals' },
  pendingRenewals: { ar: 'تجديدات معلّقة', en: 'Pending renewals' },
  suspendedCustomers: { ar: 'عملاء موقوفون', en: 'Suspended customers' },
  activateCustomer: { ar: 'تفعيل عميل جديد', en: 'Activate a customer' },
  renew: { ar: 'تجديد', en: 'Renew' },
  walletCost: { ar: 'تكلفة الرصيد', en: 'Wallet cost' },
  publicPrice: { ar: 'السعر المعلن', en: 'Public price' },
  wholesalePrice: { ar: 'سعر الجملة', en: 'Wholesale price' },
  resalePrice: { ar: 'سعر البيع لديكم', en: 'Your resale price' },
  topUp: { ar: 'طلب شحن الرصيد', en: 'Request a top-up' },
  ledger: { ar: 'حركات الرصيد', en: 'Wallet transactions' },
  noAgreement: { ar: 'لا توجد اتفاقية مشغّل سارية. التفعيل من الرصيد يحتاج اتفاقية نشطة.', en: 'No active operator agreement. Wallet activation needs an active agreement.' },
  insufficient: { ar: 'رصيد المشغّل غير كافٍ لتفعيل هذه الباقة.', en: 'The operator wallet balance is not enough for this plan.' },
  required: { ar: 'المطلوب', en: 'Required' },
  available: { ar: 'المتاح', en: 'Available' },
  shortfall: { ar: 'العجز', en: 'Shortfall' },
  legacyCredits: { ar: 'وحدات تراخيص قديمة (لا تُحوَّل إلى مال تلقائيًا)', en: 'Legacy licence credits (not converted to money)' },
  entry_commitment: { ar: 'التزام سنوي', en: 'Commitment' },
  entry_top_up: { ar: 'شحن', en: 'Top-up' },
  entry_license_activation: { ar: 'تفعيل ترخيص', en: 'Licence activation' },
  entry_license_renewal: { ar: 'تجديد ترخيص', en: 'Licence renewal' },
  entry_plan_upgrade: { ar: 'ترقية باقة', en: 'Plan upgrade' },
  entry_refund: { ar: 'استرداد', en: 'Refund' },
  entry_admin_adjustment: { ar: 'تسوية إدارية', en: 'Admin adjustment' },
  entry_expiration: { ar: 'انتهاء رصيد الالتزام', en: 'Commitment expiry' },
  // العلامة و Discover
  branding: { ar: 'العلامة التجارية', en: 'Branding' },
  brandingMode: { ar: 'نمط العلامة', en: 'Branding mode' },
  mode_mizan: { ar: 'علامة ميزان', en: 'MIZAN brand' },
  mode_co_branded: { ar: 'علامة مشتركة', en: 'Co-branded' },
  mode_full_white_label: { ar: 'علامة بيضاء كاملة', en: 'Full white label' },
  productName: { ar: 'اسم المنتج', en: 'Product name' },
  poweredBy: { ar: 'إظهار «يعمل بميزان»', en: 'Show “Powered by MIZAN”' },
  customDomain: { ar: 'نطاق مخصّص', en: 'Custom domain' },
  verifyDomain: { ar: 'تحقّق من النطاق', en: 'Verify domain' },
  dnsInstruction: { ar: 'أضيفوا سجل TXT بالاسم والقيمة التاليين، ثم اضغطوا «تحقّق».', en: 'Add a TXT record with this name and value, then press Verify.' },
  sslNote: { ar: 'شهادة TLS تُصدرها بنية النشر بعد ربط النطاق، وتُتابَع هنا.', en: 'TLS is issued by the deployment edge after domain mapping and tracked here.' },
  discover: { ar: 'دليل المسابقات', en: 'Discover' },
  discoverTitle: { ar: 'اكتشف المسابقات القرآنية', en: 'Discover Quran competitions' },
  discoverEmpty: { ar: 'لا توجد مسابقات منشورة تطابق البحث.', en: 'No published competitions match.' },
  registrationOpen: { ar: 'التسجيل مفتوح', en: 'Registration open' },
  registrationClosed: { ar: 'التسجيل مغلق', en: 'Registration closed' },
  register: { ar: 'سجّل الآن', en: 'Register' },
  search: { ar: 'ابحث باسم المسابقة أو الجهة أو المدينة', en: 'Search by competition, institution or city' },
  globalSyndication: { ar: 'النشر العالمي في شبكة ميزان', en: 'Global syndication (MIZAN network)' },
  operatorDirectory: { ar: 'دليل المشغّل', en: 'Operator directory' },
  organizationDirectory: { ar: 'دليل الجهة', en: 'Organization directory' },
  online: { ar: 'عن بُعد', en: 'Online' },
  in_person: { ar: 'حضوري', en: 'In person' },
  hybrid: { ar: 'مدمج', en: 'Hybrid' },
  poweredByMizan: { ar: 'يعمل بميزان — نظام تشغيل المسابقات القرآنية', en: 'Powered by MIZAN — Quran Competition Operating System' },
  // النسخ
  newEdition: { ar: 'إنشاء نسخة جديدة', en: 'Create new edition' },
  cloneFrom: { ar: 'المسابقة المصدر', en: 'Source competition' },
  editionLabel: { ar: 'نسخة المسابقة (السنة أو التسمية)', en: 'Edition (year or label)' },
  nameArabic: { ar: 'الاسم بالعربية', en: 'Arabic name' },
  nameEnglish: { ar: 'الاسم بالإنجليزية', en: 'English name' },
  whatToCopy: { ar: 'ما الذي يُنسخ؟', en: 'What to copy' },
  part_categories: { ar: 'الفئات والمسارات والأهلية', en: 'Categories, tracks and eligibility' },
  part_judging: { ar: 'معايير التحكيم والأوزان والخصومات وعدد المحكّمين', en: 'Judging criteria, weights, deductions and panel size' },
  part_registration: { ar: 'سياسة التسجيل ونموذجه والموافقات', en: 'Registration policy, form and consents' },
  part_certificates: { ar: 'قالب الشهادة', en: 'Certificate template' },
  part_branding: { ar: 'العلامة والشعار', en: 'Branding and logo' },
  part_schedule: { ar: 'بنية الجدول والقاعات', en: 'Schedule structure and venues' },
  part_policies: { ar: 'سياسات النتائج والتظلّم والخصوصية والتشغيل', en: 'Results, appeals, privacy and operations policies' },
  neverCopied: { ar: 'لا يُنسخ أبدًا: المتسابقون والتسجيلات والحضور والدرجات والنتائج والفائزون والتظلّمات والشهادات الصادرة ورموز التحقق والمدفوعات وسجلّ التدقيق والأختام.', en: 'Never copied: participants, registrations, attendance, scores, results, winners, appeals, issued certificates, verification codes, payments, audit logs and seals.' },
  summary: { ar: 'الملخّص', en: 'Summary' },
  createDraft: { ar: 'إنشاء المسودة', en: 'Create draft' },
  startsAsDraft: { ar: 'تبدأ النسخة الجديدة مسودةً ولا تُنشر تلقائيًا، ولا تستهلك مقعد مسابقة نشطة حتى تُفتح.', en: 'The new edition starts as a draft, is not published automatically, and uses no active slot until opened.' },
  next: { ar: 'التالي', en: 'Next' },
  back: { ar: 'السابق', en: 'Back' },
  cancel: { ar: 'إلغاء', en: 'Cancel' },
  save: { ar: 'حفظ', en: 'Save' },
  loading: { ar: 'جارٍ التحميل…', en: 'Loading…' },
  // المنصّة
  catalog: { ar: 'كتالوج الباقات', en: 'Plan catalog' },
  scheduleNewPrice: { ar: 'جدولة سعر جديد', en: 'Schedule a new price' },
  effectiveFrom: { ar: 'يسري من', en: 'Effective from' },
  agreements: { ar: 'اتفاقيات المشغّلين', en: 'Operator agreements' },
  createAgreement: { ar: 'اتفاقية جديدة', en: 'New agreement' },
  approve: { ar: 'اعتماد', en: 'Approve' },
  fundCommitment: { ar: 'تسجيل استلام الالتزام', en: 'Record commitment payment' },
  reference: { ar: 'مرجع الدفع', en: 'Payment reference' },
  reports: { ar: 'التقارير التجارية', en: 'Commercial reports' },
  directRecurring: { ar: 'الاشتراكات المباشرة السنوية', en: 'Direct annual recurring' },
  wholesaleSales: { ar: 'مبيعات الجملة (12 شهرًا)', en: 'Wholesale sales (12 months)' },
  walletBalances: { ar: 'أرصدة المشغّلين', en: 'Operator wallet balances' },
  policy: { ar: 'السياسة التجارية', en: 'Commercial policy' },
  graceDays: { ar: 'أيام مهلة التجديد', en: 'Grace days' },
  readOnlyDays: { ar: 'أيام القراءة فقط', en: 'Read-only days' },
  exportCsv: { ar: 'تصدير السجل المالي', en: 'Export financial ledger' },
  migration: { ar: 'تقرير الترحيل', en: 'Migration report' },
} as const;

export type CommercialKey = keyof typeof T;

export function ct(locale: string, key: CommercialKey): string {
  const entry = T[key];
  return locale === 'ar' ? entry.ar : entry.en;
}

/** Integer minor units → display string, without floating-point arithmetic. */
export function formatMoney(minor: number | undefined, currency = 'USD', locale = 'ar'): string {
  if (minor === undefined || minor === null || !Number.isFinite(minor)) return '—';
  const sign = minor < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minor));
  const major = Math.floor(abs / 100).toLocaleString(locale === 'ar' ? 'ar-KW-u-nu-latn' : 'en-US');
  const cents = String(abs % 100).padStart(2, '0');
  return locale === 'ar' ? `${sign}${major}.${cents} ${currency}` : `${sign}${currency} ${major}.${cents}`;
}

export function formatDate(iso: string | undefined, locale = 'ar'): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-KW-u-nu-latn' : 'en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));
}

/** The inclusive last day of a half-open term, for display. */
export function termLastDay(endsAtIso: string | undefined): string | undefined {
  if (!endsAtIso) return undefined;
  return new Date(Date.parse(endsAtIso) - 86_400_000).toISOString();
}

export function commercialErrorText(code: string, locale: string, details?: Record<string, any>): string {
  const ar = locale === 'ar';
  if (code === 'INSUFFICIENT_WALLET_BALANCE' && details) {
    const c = details.currency || 'USD';
    return `${ct(locale, 'insufficient')} ${ct(locale, 'required')}: ${formatMoney(details.requiredMinor, c, locale)} · ${ct(locale, 'available')}: ${formatMoney(details.availableMinor, c, locale)} · ${ct(locale, 'shortfall')}: ${formatMoney(details.shortfallMinor, c, locale)}`;
  }
  const known: Record<string, [string, string]> = {
    ACTIVE_COMPETITION_LIMIT_REACHED: ['وصلت إلى الحد الأقصى للمسابقات النشطة في باقتك. يمكنك إغلاق مسابقة منتهية أو ترقية الباقة.', 'You reached the active competition limit of your plan. Close a finished competition or upgrade.'],
    ANNUAL_PARTICIPANT_LIMIT_REACHED: ['اكتملت حصة المشاركين في دورة الاشتراك الحالية. يمكن الانتقال إلى الباقة الأعلى.', 'The participant allowance for this term is used. Move to a larger plan.'],
    TENANT_READ_ONLY: ['الجهة في وضع القراءة فقط حتى تجديد الاشتراك.', 'The organization is read-only until the subscription is renewed.'],
    ORGANIZATION_MANAGED_BY_OPERATOR: ['هذه الجهة مُدارة عبر مشغّلها؛ الترقية والتجديد من خلاله.', 'This organization is managed by its operator.'],
    RENEWAL_TOO_EARLY: ['موعد التجديد لم يحن بعد (يُتاح قبل نهاية الدورة بستين يومًا).', 'Renewal opens 60 days before the term ends.'],
    AGREEMENT_NOT_ACTIVE: ['لا توجد اتفاقية مشغّل سارية.', 'No active operator agreement.'],
    DOWNGRADE_MUST_BE_SCHEDULED: ['الباقة الأصغر تُجدول للدورة التالية.', 'Smaller plans are scheduled for the next term.'],
    BRANDING_MODE_NOT_PERMITTED: ['نمط العلامة غير مشمول في اتفاقيتكم.', 'This branding mode is not in your agreement.'],
    HIDE_MIZAN_BRAND_NOT_PERMITTED: ['إخفاء علامة ميزان غير مشمول في اتفاقيتكم.', 'Hiding the MIZAN brand is not in your agreement.'],
    CUSTOM_DOMAIN_NOT_PERMITTED: ['النطاق المخصّص غير مشمول في اتفاقيتكم.', 'Custom domains are not in your agreement.'],
    GLOBAL_SYNDICATION_NOT_PERMITTED: ['النشر العالمي غير مسموح.', 'Global syndication is not permitted.'],
    IDENTITY_REQUIRED: ['يلزم تسجيل الدخول.', 'Sign-in required.'],
    SAAS_PLATFORM_NOT_CONFIGURED: ['منظومة الاشتراكات غير مهيأة في هذا النشر.', 'The commercial platform is not configured on this deployment.'],
  };
  const hit = known[code];
  if (hit) return ar ? hit[0] : hit[1];
  return ar ? 'تعذّرت العملية. أعد المحاولة أو تواصل مع الدعم.' : 'The operation failed. Try again or contact support.';
}
