/*
 * فهرسُ رموز الأعطال: رمزٌ للمهندس، وجملةٌ عربية لمن يقرأ الشاشة.
 *
 * الرموز تُرمى في الشيفرة بالإنجليزية لأنها ثابتةٌ تُبحث في السجلّ ولا تُترجم
 * (`READING_CONTEXT_UNRESOLVED`)، لكن المسؤول في القاعة لا يعنيه الرمز — يعنيه ما يفعله
 * الآن. وكانت الرموز تظهر كما هي في شاشةٍ عربية، فلا تعني شيئًا لمن يقرأها.
 *
 * فهنا موضعٌ واحد يجمعهما: الرمز كما هو للتتبّع، ومعه جملةٌ عربية تقول العائق والمخرج.
 * ويحرسه اختبارُ انحراف: رمزٌ يُرمى في وحداتنا ولا يُسجَّل هنا يُسقِط الاختبار — فلا
 * يظهر للمسؤول رمزٌ عارٍ بلا تفسير.
 *
 * وحدة طرفية نقيّة: لا شبكة، لا حالة.
 */

export type ErrorDomain = 'READING' | 'CROSSWALK' | 'STORAGE' | 'QURAN_TEXT' | 'CONFIG' | 'DRAW' | 'RECOVERY';

export interface ErrorDescription {
  code: string;
  domain: ErrorDomain;
  /** ما يُعرض لمن يقرأ الشاشة: العائق والمخرج، بلا مصطلحٍ تقني. */
  messageArabic: string;
  /** هل يمنع المتابعة؟ (blocker) أم هو إخبارٌ يُسجَّل؟ */
  blocking: boolean;
}

const ENTRY = (code: string, domain: ErrorDomain, messageArabic: string, blocking = true): ErrorDescription =>
  ({ code, domain, messageArabic, blocking });

/**
 * الرموز المسجّلة. الرموزُ ذات اللاحقة المتغيّرة (مثل `MANIFEST_FILE_SHA256_INVALID:<اسم>`)
 * تُسجَّل بأصلها، ويُطابَق عليها بالبادئة.
 */
export const ERROR_CATALOG: readonly ErrorDescription[] = [
  // — هوية القراءة —
  ENTRY('READING_CONTEXT_UNKNOWN_RAWI', 'READING', 'الراوي غير معروف في سجلّ ميزان. تُختار الرواية من قائمة الروايات المعتمدة.'),
  ENTRY('READING_CONTEXT_UNRESOLVED', 'READING', 'اسم الرواية غير قاطع (مثل «الدوري» وحدها). يُكتب كاملًا: الدوري عن أبي عمرو، أو الدوري عن الكسائي.'),
  ENTRY('READING_CONTEXT_QIRAAH_MISMATCH', 'READING', 'القراءة لا تطابق راويها. يُراجَع تسجيل المتسابق قبل بدء الجلسة.'),
  ENTRY('READING_CONTEXT_FROZEN_MISMATCH', 'READING', 'الجلسة مقفلةٌ على روايةٍ أخرى، ورواية الجلسة لا تتغيّر بعد القفل. يلزم تصحيحٌ إداريّ قبل الجلسة لا خلالها.'),

  // — جسر المواضع —
  ENTRY('CROSSWALK_UNKNOWN_RAWI', 'CROSSWALK', 'الراوي غير معروف في السجلّ، فلا يُحوَّل موضعٌ إلى ترقيمه.'),
  ENTRY('CROSSWALK_CANONICAL_LOCUS_INVALID', 'CROSSWALK', 'الموضع القانوني غير صحيح: سورةٌ أو آيةٌ خارج الحدّ المعروف.'),
  ENTRY('CROSSWALK_NATIVE_SURAH_INVALID', 'CROSSWALK', 'رقم السورة في ترقيم الرواية غير صحيح، فيُراجَع صفّ الجسر.'),
  ENTRY('CROSSWALK_NATIVE_TARGET_REQUIRED', 'CROSSWALK', 'صفّ الجسر بلا آيةٍ ولا مدى في ترقيم الرواية، فلا هدفَ للتحويل.'),
  ENTRY('CROSSWALK_NATIVE_RANGE_INVERTED', 'CROSSWALK', 'مدى الآيات مقلوب: بدايته بعد نهايته، فيُصحَّح ترتيبه.'),
  ENTRY('CROSSWALK_EVIDENCE_REQUIRED', 'CROSSWALK', 'دعوى اختلافٍ في الترقيم بلا دليل. لا يُقبل دمجٌ ولا تقسيمٌ ولا انزياحُ حدٍّ إلا بمرجعٍ منصوص.'),
  ENTRY('CROSSWALK_EXACT_REQUIRES_SINGLE_AYAH', 'CROSSWALK', 'علاقةُ التطابق تقتضي آيةً واحدة مقابلة لا مدى، فيُراجَع نوع العلاقة.'),
  ENTRY('CROSSWALK_SPLIT_REQUIRES_RANGE', 'CROSSWALK', 'علاقةُ التقسيم تقتضي مدى آياتٍ في ترقيم الرواية لا آيةً واحدة.'),
  ENTRY('CROSSWALK_DUPLICATE_CANONICAL_LOCUS', 'CROSSWALK', 'الموضع القانوني مذكورٌ مرتين لرواية واحدة، فيُحذف المكرّر.'),

  // — التخزين والنزاهة —
  ENTRY('R2_KEY_EMPTY', 'STORAGE', 'مسار الكائن فارغ، فلا يُحدَّد ملفٌّ يُقرأ أو يُرفع.'),
  ENTRY('R2_KEY_SEGMENT_EMPTY', 'STORAGE', 'مقطعٌ فارغ في مسار الكائن، والمسار يُبنى من معرّفاتٍ كاملة.'),
  ENTRY('R2_KEY_TRAVERSAL', 'STORAGE', 'مسارٌ يحاول الخروج من نطاقه. المسارات تُبنى على الخادم من معرّفاتٍ موثوقة لا من إدخال العميل.'),
  ENTRY('R2_KEY_SEPARATOR', 'STORAGE', 'فاصلُ مسارٍ داخل مقطعٍ واحد. كل مقطعٍ يُمرَّر منفصلًا لا مدموجًا.'),
  ENTRY('R2_KEY_UNSAFE_SEGMENT', 'STORAGE', 'مقطعٌ يحمل محارف غير مسموحة في مسار الكائن، فلا يُقبل مفتاحًا.'),
  ENTRY('R2_OBJECT_SIZE_MISMATCH', 'STORAGE', 'حجم الملفّ المرفوع يخالف بيانه. الحزمة غير صالحة حتى تُصلَح.'),
  ENTRY('R2_OBJECT_INTEGRITY_FAILED', 'STORAGE', 'بصمة الملفّ تخالف بيانه. الحزمة غير صالحة للاستعمال العلمي.'),
  ENTRY('R2_OBJECT_SHA256_UNVERIFIED', 'STORAGE', 'لا بصمةَ للملفّ المرفوع، فلا يُعتبر مُتحقَّقًا.'),
  ENTRY('R2_NOT_CONFIGURED', 'STORAGE', 'تخزين الحزم غير مضبوط في البيئة، فلا رفعَ ولا تحقّق.'),
  ENTRY('MANIFEST_FILES_MISSING', 'STORAGE', 'بيان الحزمة بلا قائمة ملفّات، فلا شيء يُتحقَّق منه.'),
  ENTRY('MANIFEST_FILE_NAME_MISSING_AT', 'STORAGE', 'ملفٌّ في البيان بلا اسم، فلا يُعرف أي كائنٍ يُطابَق به.'),
  ENTRY('MANIFEST_FILE_SHA256_INVALID', 'STORAGE', 'ملفٌّ في البيان بلا بصمةٍ صحيحة. بيانٌ ناقصٌ يعني تحقُّقًا وهميًّا.'),
  ENTRY('MANIFEST_FILE_SIZE_INVALID', 'STORAGE', 'ملفٌّ في البيان بلا حجمٍ صالح، فلا يُتحقَّق من اكتمال رفعه.'),

  // — سلامة النصّ —
  ENTRY('QURAN_TEXT_INTEGRITY_FAILED', 'QURAN_TEXT', 'نصّ الموضع مشكوكٌ في ترميزه، فلا يُعرض ولا يُفهرَس حتى يُراجَع مصدره.'),
  ENTRY('REPLACEMENT_CHARACTER', 'QURAN_TEXT', 'محرف إبدال في النصّ: الترميز مكسور.', true),
  ENTRY('DISALLOWED_CONTROL_CHARACTER', 'QURAN_TEXT', 'محرف تحكّم غير مسموح في نصّ الخزنة.', true),
  ENTRY('INVISIBLE_FORMAT_CHARACTER', 'QURAN_TEXT', 'محرف اتجاهيّ أو صفريّ العرض: يغيّر العرض بلا أن يُرى.', true),
  ENTRY('MOJIBAKE_SUSPECTED', 'QURAN_TEXT', 'أثرُ ترميزٍ مزدوج: النصّ قُرئ بترميزٍ خاطئ.', true),
  ENTRY('NO_ARABIC_CONTENT', 'QURAN_TEXT', 'لا حرف عربي في النصّ: مصدرٌ مشكوكٌ فيه.', true),
  ENTRY('EMPTY_TEXT', 'QURAN_TEXT', 'النصّ فارغ، ولا يُعرض موضعٌ بلا نصّ.', true),
  ENTRY('ISLAMWEB_PACKAGE_UNKNOWN_READING', 'QURAN_TEXT', 'هذه الرواية ليست من حزم الأثر المثبَّت، فلا تُقرأ منه.'),
  ENTRY('ISLAMWEB_PACKAGE_PATH_INVALID', 'QURAN_TEXT', 'مسارُ حزمة الرواية خارج جذرها المعتمد، فلا يُقرأ.'),
  ENTRY('ISLAMWEB_PACKAGE_ARTIFACT_MISSING', 'QURAN_TEXT', 'نصّ هذه الرواية غير منشور مع النسخة المشغَّلة. تُستكمل ملفات المصدر قبل استعمالها في مسابقة — ولا يُعرض نصّ روايةٍ أخرى مكانها.'),
  ENTRY('ISLAMWEB_PACKAGE_DIGEST_MISMATCH', 'QURAN_TEXT', 'بايتات نصّ الرواية تخالف البصمة المعتمدة. الحزمة لا تُستعمل حتى تُستعاد نسختها المعتمدة.'),
  ENTRY('ISLAMWEB_PACKAGE_NOT_APPROVED', 'QURAN_TEXT', 'قرار اللجنة لا يشمل هذه البايتات بعينها، فلا تُقرأ حتى يصدر قرارٌ مربوطٌ بها.'),
  ENTRY('QURAN_PINNED_ARTIFACT_INVALID', 'QURAN_TEXT', 'حزمة نصٍّ مثبَّتة موجودةٌ لكنها غير صالحة. لا يُقلع الخادم على نصٍّ قرآنيٍّ مشكوكٍ فيه.'),
  // — بدء الجلسة —
  ENTRY('SESSION_START_PARTICIPANT_NOT_FOUND', 'RECOVERY', 'المتسابق غير موجود في هذه المسابقة، فلا تُفتح له جلسة.'),
  ENTRY('SESSION_START_NO_SAFE_COMMITTEE', 'RECOVERY', 'لا لجنة تخدم فئة هذا المتسابق بلا تضارب مصالح. يُسنَد إلى لجنة أخرى من غرفة العمليات.'),
  ENTRY('SESSION_START_SERVER_PACKAGE_MISMATCH', 'RECOVERY', 'حزمة الأسئلة المحفوظة على الخادم لا تطابق هذه الجلسة. تُعاد تهيئة الحزمة قبل النداء.'),
  ENTRY('SESSION_START_SCOPE_UNRESOLVED', 'RECOVERY', 'نطاق حفظ المتسابق غير معتمد بعد، ولا تبدأ جلسةٌ بنطاقٍ مجهول. يُعتمد نطاقه ثم يُنادى.'),
  ENTRY('SESSION_START_DRAW_FAILED', 'RECOVERY', 'تعذّر تكوين مجموعة مواضع صالحة داخل نطاق المتسابق. يُوسَّع النطاق أو تُراجَع قيود القرعة.'),
  ENTRY('QURAN_PINNED_ARTIFACT_ABSENT', 'QURAN_TEXT', 'حزمة نصٍّ مثبَّتة غير منشورة مع النسخة. رواياتها تفشل مغلقةً باسمها ولا تعمل في مسابقة.'),

  // — إعدادات الإنتاج —
  ENTRY('PRODUCTION_CONFIG_INVALID', 'CONFIG', 'إعدادُ التشغيل ناقصٌ أو غير آمن، فلا يبدأ الخادم نصف جاهز.'),
  ENTRY('CLIENT_EXPOSED_SECRET', 'CONFIG', 'سرٌّ مكشوفٌ للمتصفّح. كل مفتاحٍ سرّي خادميٌّ فقط.'),
  ENTRY('DEMO_SEED_ENABLED_IN_PRODUCTION', 'CONFIG', 'بيانات العرض التجريبي مفعّلةٌ في الإنتاج، ولا تُخلط بمسابقةٍ حقيقية.'),
  ENTRY('IDENTITY_VERIFICATION_UNCONFIGURED', 'CONFIG', 'التحقّق من الهوية على الخادم غير مضبوط، فتصير الصلاحيات دعوى العميل.'),
  ENTRY('WEAK_SIGNING_SECRET', 'CONFIG', 'سرُّ توقيعٍ ضعيف. القيمة النائبة أسوأ من الغياب لأنها توهم بالحماية.'),
  ENTRY('SIGNING_SECRET_ABSENT', 'CONFIG', 'سرُّ توقيعٍ غير مضبوط: الميزة المعتمدة عليه تبقى معطَّلة.', false),

  // — الخزنة الباردة والاستعادة —
  ENTRY('AUDIT_LEDGER_TRUNCATED', 'RECOVERY', 'سجلُّ المراجعة أقصرُ من طوله المرصود: حُذفت سطورٌ من آخره. تُستعاد النسخةُ الاحتياطية ويُوقَف الاعتماد على السجل حتى تُراجَع.'),
  ENTRY('AUDIT_LEDGER_ANCHOR_MISMATCH', 'RECOVERY', 'سجلُّ المراجعة لا يطابق مرساتَه المحفوظة خارجه: طولُه صحيحٌ وتلبيدُه الأخير مختلف. يُعدّ السجلُّ موضعَ شكٍّ حتى تُراجَع النسخُ.'),
  ENTRY('COLD_VAULT_KEY_MUST_BE_32_BYTES', 'RECOVERY', 'مفتاح النقل يجب أن يكون ٣٢ بايتًا بالضبط (AES-256).'),
  ENTRY('COLD_VAULT_COMPETITION_REQUIRED', 'RECOVERY', 'لا تُصدَّر خزنةٌ بلا تحديد المسابقة التي تُستعاد بها.'),
  ENTRY('COLD_VAULT_FORBIDDEN_SECRET', 'RECOVERY', 'الحمولة تحمل حقلَ سرٍّ (مفتاح أو كلمة مرور أو اعتماد). الخزنة للاستمرارية لا للأسرار، والمفتاح يبقى خارجها.'),
  ENTRY('COLD_VAULT_FORBIDDEN_SECRET_VALUE', 'RECOVERY', 'الحمولة تحمل قيمةً تُشبه مفتاحًا خاصًّا أو رمز وصول. تُنقّى الحمولة قبل التصدير.'),
  ENTRY('COLD_VAULT_FORBIDDEN_HIGH_RISK_CONTENT', 'RECOVERY', 'الحمولة تحمل محتوًى بالغَ الحساسية (نصّ سؤالٍ مكشوف أو صوتَ تحكيمٍ خامًا أو بياناتٍ حيوية)، ولا يُصدَّر في خزنةٍ منقولة.'),
  ENTRY('COLD_VAULT_PACKAGE_HASH_MISMATCH', 'RECOVERY', 'بصمة الخزنة تخالف محتواها: الحزمة مُعدَّلة أو تالفة، فلا تُستعاد.'),
  ENTRY('COLD_VAULT_PAYLOAD_HASH_MISMATCH', 'RECOVERY', 'بصمة الحمولة بعد فكّ التشفير تخالف المسجَّلة، فلا تُستعاد.'),

  // — القرعة —
  ENTRY('FAIRDRAW_READING_SOURCE_MISMATCH', 'DRAW', 'لا موضعَ في البنك من رواية هذا المتسابق. لا يُسحب له من روايةٍ أخرى بحال؛ يلزم وصولُ نصّ روايته.'),
  ENTRY('FAIRDRAW_NO_ELIGIBLE_QUESTIONS', 'DRAW', 'لا مواضعَ مؤهَّلة بعد تطبيق النطاق والاستثناءات. يُراجَع نطاق الفئة وبنك المواضع.'),
];

const BY_CODE = new Map(ERROR_CATALOG.map(e => [e.code, e]));

/** كل الرموز المسجّلة. */
export const REGISTERED_ERROR_CODES: readonly string[] = ERROR_CATALOG.map(e => e.code);

/**
 * يصف رمزًا. يقبل اللاحقة المتغيّرة فيطابق بالبادئة (`CODE:detail` و`CODE_AT_0`).
 * يعود `undefined` لرمزٍ غير مسجَّل — ولا يُخترع له وصف.
 */
export function describeError(rawCode: string): ErrorDescription | undefined {
  const code = String(rawCode || '').trim();
  if (!code) return undefined;
  const exact = BY_CODE.get(code);
  if (exact) return exact;
  // لاحقةٌ متغيّرة: `CODE:name` أو `CODE_AT_3`
  const base = code.split(':')[0].replace(/_AT_\d+$/, '_AT').replace(/_+$/, '');
  return BY_CODE.get(base);
}

/**
 * جملةٌ عربية لأي رمز. غير المسجَّل يُعطى جملةً عامّة صادقة ولا يُعرض الرمز عاريًا
 * وكأنه رسالة — فالمسؤول لا يعنيه الرمز.
 */
export function errorMessageArabic(code: string): string {
  return describeError(code)?.messageArabic
    ?? 'تعذّر إتمام العملية. أُبلغ الفريق التقني بالرمز المرفق لمتابعته.';
}

/** شكلُ خطأ الواجهة الثابت (§122): رمزٌ للتتبّع، ومعرّفُ طلبٍ، وجملةٌ للقارئ. */
export interface ApiErrorEnvelope {
  error: { code: string; requestId: string; message: string };
}

/**
 * يبني مغلّف الخطأ. لا يُدرج تفاصيل داخلية ولا آثار مكدّس — الجملةُ للقارئ والرمزُ
 * للتتبّع، وما زاد يبقى في سجلّ الخادم.
 */
export function apiErrorEnvelope(code: string, requestId: string): ApiErrorEnvelope {
  return { error: { code: String(code || 'UNKNOWN_ERROR'), requestId: String(requestId || ''), message: errorMessageArabic(code) } };
}
