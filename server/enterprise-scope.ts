/*
 * نموذجُ تهديد المفتاح المنصّي — مكتوبًا لا ضمنيًّا.
 *
 * `MIZAN_ENTERPRISE_API_KEY` مفتاحٌ واحدٌ للمنصّة كلِّها، لا مفتاحُ جهة. وكانت مسارات
 * المؤسسات تقرأ `organizationId` من جسم الطلب خلفه، فيبدو الأمر كأن الجهة تُشتقّ من
 * الاعتماد وهي لا تُشتقّ: من يحمل المفتاح يتصرّف باسم كل الجهات.
 *
 * والقرار المعماريّ المتّخذ هنا صريح: **المفتاحُ اعتمادُ مشغّل منصّة**، لا اعتمادَ جهة.
 * ولأنه كذلك، فالجهةُ تأتي من الطلب بالضرورة — لكنها لا تُقبل لمجرّد أنها مكتوبة:
 *
 *   1. جهةٌ غير مذكورة تُردّ.
 *   2. جهةٌ خارج حصر المفتاح (`MIZAN_ENTERPRISE_ALLOWED_ORG_IDS`) تُردّ.
 *   3. جهةٌ غير معروفة في سجلّ الجهات تُردّ — فلا تُنشأ جلسةٌ لمستأجرٍ لا وجود له.
 *   4. وكلُّ تصرّفٍ يُكتب في سجلّ التدقيق باسم مشغّل المنصّة، لا مجهولًا.
 *
 * وما لا يحميه هذا: من سرق المفتاح يملك ما يملكه مشغّل المنصّة داخل الجهات المسموحة.
 * فالحصرُ والتدقيقُ وحدُّ المعدّل هي الحدود، والمفتاحُ يُدار كسرٍّ منصّيّ لا كسرِّ جهة.
 */

export type EnterpriseScopeDecision =
  | { ok: true; organizationId: string }
  | { ok: false; status: 400 | 403 | 404; code: string };

export interface EnterpriseScopeInput {
  /** المعرّف كما ورد في الطلب — لا يُوثق به، يُفحص. */
  requestedOrganizationId: unknown;
  /** حصرُ هذا المفتاح. فارغٌ = بلا حصرٍ إضافي فوق سجلّ الجهات. */
  allowedOrgIds?: Iterable<string>;
  /**
   * الجهات المعروفة. `undefined` أو فارغة = نشرٌ بجهةٍ واحدة لم تُسجَّل بعد، فلا يُقلب
   * غيابُ السجلّ إلى قبول أيِّ معرّف حين يوجد سجلّ.
   */
  knownOrgIds?: Iterable<string>;
}

export function resolveEnterpriseOrganization(input: EnterpriseScopeInput): EnterpriseScopeDecision {
  /*
   * نصٌّ أو لا شيء. رقمٌ أو كائنٌ في هذا الحقل ليس معرّف جهة، وتحويلُه بـ`String()` يصنع
   * معرّفًا لم يقصده أحد (`0` تصير `"0"`، والكائن يصير `"[object Object]"`).
   */
  if (typeof input.requestedOrganizationId !== 'string') {
    return { ok: false, status: 400, code: 'ENTERPRISE_ORGANIZATION_REQUIRED' };
  }
  const organizationId = input.requestedOrganizationId.trim();
  if (!organizationId) return { ok: false, status: 400, code: 'ENTERPRISE_ORGANIZATION_REQUIRED' };

  const allowed = new Set(input.allowedOrgIds ?? []);
  if (allowed.size > 0 && !allowed.has(organizationId)) {
    return { ok: false, status: 403, code: 'ENTERPRISE_ORGANIZATION_NOT_IN_KEY_SCOPE' };
  }

  const known = new Set(input.knownOrgIds ?? []);
  if (known.size > 0 && !known.has(organizationId)) {
    return { ok: false, status: 404, code: 'ENTERPRISE_ORGANIZATION_UNKNOWN' };
  }

  return { ok: true, organizationId };
}

/** قائمة الحصر كما تُكتب في البيئة: معرّفات مفصولة بفواصل. */
export function parseAllowedOrgIds(raw: string | undefined): string[] {
  return String(raw || '').split(',').map(x => x.trim()).filter(Boolean);
}
