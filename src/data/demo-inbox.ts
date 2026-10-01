/*
 * صندوق الإشعارات في بيئة العرض.
 *
 * مركز الإشعارات يقرأ من الخادم بهوية موثّقة، ولا هوية في الصندوق التجريبي، فكان الجرس يقول
 * «لا إشعارات» ومعه سطرٌ أحمر عن تسجيل الدخول. هذه صناديق مصطنعة بأسماءٍ خيالية، تُبنى
 * بحسب الدور المعروض، وتُستورد ديناميكيًّا من داخل البيئة التجريبية وحدها. القراءة وحدها هي
 * ما يُجاب هنا؛ والتعليم كمقروء والأرشفة تُطبَّق في ذاكرة الواجهة ولا تُكتب في أي مكان.
 */
type Row = {
  id: string; title: string; body: string; category: 'admin' | 'system' | 'competition' | 'identity' | 'support'; priority: 'normal' | 'important' | 'urgent';
  createdAt: string; senderName?: string; createdBy?: string; readAt?: string; actionHref?: string; actionLabel?: string;
  context?: { organizationId?: string; competitionId?: string }; contextKey?: string; contextLabel?: string;
};

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export function demoInbox(role: string, competitionId: string, competitionLabel: string, organizationId: string): { notifications: Row[]; unread: number } {
  const ctx = { context: { organizationId, competitionId }, contextKey: `competition:${competitionId}`, contextLabel: competitionLabel };
  const row = (n: number, hoursAgo: number, read: boolean, r: Omit<Row, 'id' | 'createdAt' | 'readAt' | 'context' | 'contextKey' | 'contextLabel'>): Row => ({
    id: `ntf-inbox-${role}-${n}`, createdAt: ago(hoursAgo), readAt: read ? ago(hoursAgo - 0.5) : undefined, ...ctx, ...r,
  });
  const common: Row[] = [
    row(1, 1.5, false, { title: 'اكتمل النسخ الاحتياطي الليلي', body: 'حُفظت نسخة كاملة من بيانات المسابقة وتحقّقت بصمتها بنجاح. حجم النسخة 38 ميغابايت.', category: 'system', priority: 'normal', senderName: 'نظام ميزان', createdBy: 'MIZAN_SYSTEM' }),
    row(2, 5, false, { title: 'تذكير: بروفة يوم المسابقة', body: 'تبدأ بروفة التشغيل الكاملة غدًا الساعة الرابعة عصرًا في القاعة الرئيسية. يُرجى حضور رؤساء اللجان قبلها بنصف ساعة.', category: 'competition', priority: 'important', senderName: 'مكتب مدير المسابقة', createdBy: 'usr-demo-admin' }),
    row(3, 26, true, { title: 'حُدّثت سياسة التحكيم', body: 'اعتُمدت النسخة 2027.1 من سياسة التحكيم، وتشمل حدّ الخلاف بين المحكّمين وآلية المراجعة. اطّلع على التغييرات قبل الجلسة الأولى.', category: 'competition', priority: 'normal', senderName: 'جهة ميزان التجريبية', createdBy: 'usr-demo-org_admin', actionHref: '#', actionLabel: 'فتح' }),
    row(4, 52, true, { title: 'تفعيل حسابك', body: 'فُعّل حسابك بنجاح وأُسندت إليك الصلاحيات المطلوبة لمسابقة 2027. يمكنك تعديل بياناتك من إعدادات الحساب.', category: 'identity', priority: 'normal', senderName: 'إدارة الهويات', createdBy: 'MIZAN_SYSTEM' }),
    row(5, 80, true, { title: 'رسالة من الدعم: تحديث الأجهزة', body: 'اكتمل فحص الأجهزة اللوحية للجان الأربع. جهازان بحاجة إلى شحنٍ كامل قبل يوم المسابقة.', category: 'support', priority: 'normal', senderName: 'فريق الدعم', createdBy: 'usr-demo-support_agent' }),
  ];
  const byRole: Record<string, Row[]> = {
    judge: [
      row(11, 2, false, { title: 'أُسندت إليك لجنة جديدة', body: 'كُلّفت بلجنة «الفرع الأول» لجلسة الغد. راجع قائمة الانتظار وتأكد من اتصال جهازك.', category: 'competition', priority: 'important', senderName: 'مكتب التشغيل', createdBy: 'usr-demo-ops_manager' }),
      row(12, 30, true, { title: 'تنبيه تضارب المصالح', body: 'أكمل إقرار تضارب المصالح قبل بدء الجلسة، ولا يُظهر النظام المتسابقين لك إلا بعد الإقرار.', category: 'admin', priority: 'important', senderName: 'مكتب النزاهة', createdBy: 'usr-demo-auditor' }),
    ],
    head_judge: [
      row(13, 1, false, { title: 'ثلاث حالات خلاف تنتظر قرارك', body: 'تباين الدرجات تجاوز الحد المسموح في ثلاث تلاوات. افتح «الاعتراضات والمراجعات» لاتخاذ القرار.', category: 'competition', priority: 'urgent', senderName: 'نظام ميزان', createdBy: 'MIZAN_SYSTEM' }),
      row(14, 20, true, { title: 'اكتمل تسليم الدرجات لجلسة الأمس', body: 'سلّم جميع محكّمي لجنتك درجاتهم، وأُغلقت الجلسة بلا حالات معلّقة.', category: 'competition', priority: 'normal', senderName: 'نظام ميزان', createdBy: 'MIZAN_SYSTEM' }),
    ],
    comp_admin: [
      row(15, 3, false, { title: 'سبعة وعشرون متسابقًا ينتظرون المراجعة', body: 'وصلت طلبات تسجيل جديدة خلال اليوم. افتح «المشاركون» لاعتمادها أو إعادتها بملاحظات.', category: 'competition', priority: 'important', senderName: 'نظام ميزان', createdBy: 'MIZAN_SYSTEM' }),
      row(16, 9, false, { title: 'ختم النتائج ينتظر الموافقة الثانية', body: 'وافق عضو واحد من اثنين على ختم النتائج النهائية. أرسل تذكيرًا للمعتمد الثاني.', category: 'admin', priority: 'urgent', senderName: 'مكتب النزاهة', createdBy: 'usr-demo-auditor' }),
    ],
    participant: [
      row(17, 2, false, { title: 'اقترب دورك', body: 'يفصلك عن الدخول إلى اللجنة ثلاثة متسابقين. توجّه إلى قاعة الانتظار وجهّز هويتك.', category: 'competition', priority: 'urgent', senderName: 'مكتب الاستقبال', createdBy: 'usr-demo-ops_manager' }),
      row(18, 40, true, { title: 'تم اعتماد تسجيلك', body: 'اعتُمدت مشاركتك في المسابقة. احتفظ ببطاقة الدخول واحضر قبل موعدك بنصف ساعة.', category: 'competition', priority: 'normal', senderName: 'جهة ميزان التجريبية', createdBy: 'usr-demo-org_admin' }),
    ],
    ops_manager: [
      row(19, 1, false, { title: 'اللجنة B2 متوقفة منذ ثلاث دقائق', body: 'انقطع الاتصال بجهاز اللجنة B2. نُقل الصف مؤقتًا إلى اللجنة B1 مع حفظ الأسبقية الأصلية.', category: 'system', priority: 'urgent', senderName: 'نظام ميزان', createdBy: 'MIZAN_SYSTEM' }),
    ],
    auditor: [
      row(20, 6, false, { title: 'سجل التدقيق جاهز للمراجعة', body: 'اكتمل ختم سجل الأحداث لليوم الأول بثلاثمئة وأربعة أحداث. بصمة الختم مطابقة.', category: 'system', priority: 'normal', senderName: 'نظام ميزان', createdBy: 'MIZAN_SYSTEM' }),
    ],
  };
  const notifications = [...(byRole[role] || []), ...common].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { notifications, unread: notifications.filter(n => !n.readAt).length };
}

/** مستلمون خياليون لنموذج «إرسال» في الصندوق التجريبي. */
export function demoRecipients(organizationId: string, competitionId: string) {
  return {
    recipients: [
      { userId: 'usr-demo-ops_manager', displayName: 'مدير التشغيل (تجريبي)', email: 'demo.ops_manager@mizan.test', role: 'ops_manager', roles: ['ops_manager'], organizationId, competitionIds: [competitionId], organizationName: 'جهة ميزان التجريبية' },
      { userId: 'usr-demo-support_agent', displayName: 'الدعم (تجريبي)', email: 'demo.support_agent@mizan.test', role: 'support_agent', roles: ['support_agent'], organizationId, competitionIds: [competitionId], organizationName: 'جهة ميزان التجريبية' },
      { userId: 'usr-demo-auditor', displayName: 'المدقّق (تجريبي)', email: 'demo.auditor@mizan.test', role: 'auditor', roles: ['auditor'], organizationId, competitionIds: [competitionId], organizationName: 'جهة ميزان التجريبية' },
    ],
  };
}
