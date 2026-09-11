import type { AICapability, FederationClaimType } from '../types';

const AR_TOKENS:Record<string,string>={
  CERTIFIED:'معتمد علميًا', PENDING_REVIEW:'بانتظار المراجعة', DEVELOPMENT:'بيئة تطوير', REVOKED:'ملغى', SUSPENDED:'موقوف', UNSUPPORTED:'غير مدعوم', BETA:'تجريبي', RESEARCH:'بحثي', PENDING_VALIDATION:'بانتظار التحقق',
  APPROVED_REFERENCE:'مرجع صوتي معتمد', REFERENCE:'مرجع', COMPLETED:'مكتمل', INVALIDATED:'ملغى', PASS:'ناجح', WARNING:'تنبيه', FAIL:'فشل', PASS_WITH_WARNINGS:'ناجح مع تنبيهات', READY:'جاهز',
  SEALED:'مختوم', REVEALED:'مكشوف', APPLIED:'تم التطبيق', PROPOSED:'مقترح', APPROVED:'معتمد', DISMISSED:'مرفوض', BLOCKED:'محظور', AUTHENTIC:'أصيل', NOT_FOUND:'غير موجود', INVALID_PROOF:'إثبات غير صالح',
  MATCH:'مطابق', DIFFERENCE:'اختلاف', UNVERIFIED:'غير متحقق', EXPORTED:'مُصدّر', VERIFIED:'متحقق', FAILED:'فشل', RESTORE_TESTED:'اختبار الاستعادة ناجح',
  'LOCAL BENCHMARK ONLY':'مقارنة محلية فقط', 'SOURCE CANDIDATE':'مصدر مرشح', 'PENDING SOURCE':'المصدر العلمي معلّق',
  REQUIRED:'مطلوب', RECOMMENDED:'موصى به', OPTIONAL:'اختياري',
  /* حالة المسابقة ومستوى الأتمتة كانا يُعرضان بالرمز الإنجليزي الخام داخل شاشة عربية:
     «live» و«autopilot» فوق عنوان المسابقة. المصطلح التشغيلي يبقى في البيانات، والعرض بالعربية. */
  live:'قائمة الآن', upcoming:'قادمة', archived:'مؤرشفة',
  autopilot:'تشغيل ذاتي', assisted:'مساعَد', manual:'يدوي', supervised:'تحت إشراف',
  /* أدوار الفاعلين في دفتر التدقيق. */
  super_admin:'إدارة المنصة', operator_owner:'مالك المشغّل', operator_admin:'مدير المشغّل',
  org_admin:'مدير الجهة', storage_admin:'مدير التخزين', billing_admin:'مدير الفوترة', branch_admin:'مدير الفرع', comp_admin:'مدير المسابقة',
  head_judge:'رئيس التحكيم', judge:'محكم', ops_manager:'مدير التشغيل', exception_host:'مكتب الاستثناء',
  delegation_manager:'مندوب الوفد', participant:'متسابق', broadcast_operator:'البث والحفل', auditor:'مدقق',
  guardian:'ولي الأمر', support_agent:'الدعم',
  fixture:'بيانات تطوير', approved:'معتمد', reviewed:'تمت المراجعة', pending:'معلّق', active:'نشط', offline:'غير متصل', online:'متصل', valid:'ساري', revoked:'ملغى', requested:'بانتظار الموافقة', ended:'منتهٍ', rejected:'مرفوض',
  forming:'قيد التشكيل', reconciling:'قيد المصالحة', closed:'مغلق', connected:'متصل', unavailable:'غير متاح', disabled:'معطّل', degraded:'متدهور', sent:'أُرسل', queued:'في قائمة الإرسال', failed:'فشل',
  not_required:'غير مطلوب', scheduled:'مجدول', completed:'مكتمل', ready:'جاهزة', testing:'تستقبل متسابقًا', paused:'متوقفة مؤقتًا', calculated:'محسوبة', sealed:'مختومة', published:'منشورة', immediate:'فوري', after_committee:'بعد انتهاء اللجنة', after_round:'بعد انتهاء الجولة', ceremony_only:'في الحفل فقط', private_only:'خاص فقط',
  development_client_gate:'بوابة تطوير محلية', operational_panel_gate:'بوابة تشغيل اللجنة', production_server_escrow:'حجز خادمي آمن للسؤال',
  development_adapter:'محول تطوير', production_external_kms:'إدارة مفاتيح إنتاجية خارجية', development_per_credential:'توقيع تطويري لكل بطاقة', production_issuer_key:'مفتاح جهة إصدار إنتاجي',
  all_assigned:'كل المحكمين المكلّفين', minimum:'حد أدنى من المحكمين',

  // Status values that reach the screen through <Badge> and status text but had no
  // Arabic form, so an Arabic-first UI printed "medium", "under_review", "in_queue".
  // Adding them here fixes every badge at once; an unmapped key still falls through
  // to the raw value exactly as before.
  low:'منخفضة', medium:'متوسطة', high:'عالية', critical:'حرجة', moderate:'متوسطة',
  registered:'مسجّل', in_queue:'في الانتظار', in_session:'داخل اللجنة', tested:'أنهى الاختبار',
  certified:'حاصل على شهادة', withdrawn:'منسحب', absent:'غائب',
  submitted:'مُقدَّم', under_review:'قيد المراجعة', accepted:'مقبول',
  confirmed:'مؤكَّد', dismissed:'مصروف', committee_escalation:'تصعيد إلى اللجنة',
  investigating:'قيد الفحص', resolved:'مُعالَج', open:'مفتوح',
  quality_checked:'فُحصت الجودة', recording:'قيد التسجيل',
  draft:'مسودة', issued:'صادر', expired:'منتهٍ', cancelled:'ملغى', retired:'متقاعد',
  running:'قيد التشغيل', executed:'نُفّذ', rolled_back:'تم التراجع', validated:'تم التحقق',
  configured:'مُهيّأ', not_configured:'غير مُهيّأ', stale:'قديم', warning:'تنبيه', info:'معلومة',
  joined:'انضم', left:'غادر', proposed:'مقترح', imported:'مستورد', dry_run:'تشغيل تجريبي',
  // تصنيفات إعادة المحاكاة/السجل، وأنواع القنوات، وأسباب الاعتراض وقواعد كسر التعادل، ورموز
  // كانت تُعرض خامًا بالإنجليزية داخل شاشة عربية. أي مفتاح غير معروف يبقى كما هو دون كسر.
  results:'النتائج', incidents:'الحوادث', operations:'العمليات', trust:'الثقة', devices:'الأجهزة',
  storage:'التخزين', broadcast:'البث',
  audio_interruption:'انقطاع الصوت', scoring_miscalculation:'خطأ في احتساب الدرجة', question_scope_dispute:'خلاف على نطاق السؤال', procedural_error:'خطأ إجرائي', identity_dispute:'خلاف على الهوية',
  memorization_priority:'أولوية الحفظ', tajweed_priority:'أولوية التجويد', fewest_penalties:'الأقل أخطاءً', performance_priority:'أولوية الأداء', waqf_priority:'أولوية الوقف والابتداء', earliest_submission:'الأسبق تسليمًا',
  ACTIVE:'نشط', TEXTUAL:'تطابق نصّي', EXPERT:'مستوى الخبير', SHADOW:'وضع العرض', BLOCKER:'مانع',
  DRAFT:'مسودة', REVIEWED:'تمت المراجعة', SIMULATED:'بعد المحاكاة', PUBLISHED:'منشورة', CONFLICT:'تعارض', NEEDS_REVIEW:'تحتاج مراجعة', REVIEW:'مراجعة', NOT_RUN:'لم تُشغّل بعد', UNDERSTOOD:'مفهومة',
  // باقة الجهة ومنطقة استضافة البيانات (كانت enterprise / eu-west-locked تُعرض خامًا).
  enterprise:'مؤسسات', growth:'نمو', pilot:'تجريبية', standard:'قياسية', 'eu-west-locked':'أوروبا الغربية (مقفلة)', 'us-east':'شرق الولايات المتحدة', 'me-central':'الشرق الأوسط', configurable:'قابلة للضبط',
  in_transit:'في الطريق', arrived:'وصل', delayed:'متأخر', boarding:'الصعود للطائرة',
  integrity:'النزاهة', timing:'التوقيت', experience:'التجربة', performance:'الأداء',
  OPEN:'مفتوح', INVESTIGATING:'قيد الفحص', RESOLVED:'مُعالَج', DETECTED:'مرصود', MITIGATED:'مُحتوى', CONSUMED:'مُستخدَم', NONE:'لا يوجد', AUTHORIZED:'مصرَّح', PENDING_PANEL_QUORUM:'بانتظار نصاب اللجنة',
};

const AR_CLAIMS:Record<FederationClaimType,string>={
  identity_verified:'الهوية موثقة', age_verified:'العمر موثق', delegation_authorized:'تفويض الوفد موثق', guardian_consent_verified:'موافقة ولي الأمر موثقة', travel_document_verified:'وثيقة السفر موثقة', organization_nomination:'ترشيح الجهة موثق', judge_credential_valid:'اعتماد المحكم ساري', participant_nomination_valid:'ترشيح المتسابق ساري', certificate_authentic:'الشهادة أصيلة'
};

const EN_CLAIMS:Record<FederationClaimType,string>={
  identity_verified:'Identity verified', age_verified:'Age verified', delegation_authorized:'Delegation authorized', guardian_consent_verified:'Guardian consent verified', travel_document_verified:'Travel document verified', organization_nomination:'Organization nomination', judge_credential_valid:'Judge credential valid', participant_nomination_valid:'Participant nomination valid', certificate_authentic:'Certificate authentic'
};


const AR_CAPABILITIES:Partial<Record<AICapability,string>>={
  audio_quality:'جودة الصوت', speech_non_speech:'تمييز التلاوة من غيرها', surah_alignment:'محاذاة السورة', ayah_alignment:'محاذاة الآية', word_alignment:'محاذاة الكلمات', quran_position:'تحديد موضع التلاوة', memorization_watch:'مراقبة الحفظ استشاريًا',
  omission:'سقوط محتمل', insertion:'زيادة محتملة', substitution:'استبدال محتمل', repetition:'تكرار', restart:'إعادة البدء', jump:'انتقال غير متوقع', hesitation:'تردد', similar_verse_transition:'انتقال إلى آية متشابهة',
  tajweed_phoneme:'تحليل صوتيات التجويد', phoneme_recognition:'تمييز الصوت اللغوي', phoneme_substitution:'استبدال صوت لغوي', phoneme_deletion:'سقوط صوت لغوي', phoneme_insertion:'زيادة صوت لغوي',
  makhraj:'ملاحظة المخرج', sifat:'ملاحظة الصفات', gemination:'الشدة', madd:'المد', madd_duration:'مدة المد', ghunnah:'الغنة', ghunnah_duration:'مدة الغنة', ikhfa:'الإخفاء', idgham:'الإدغام', iqlab:'الإقلاب', izhar:'الإظهار',
  qalqalah:'القلقلة', tafkhim:'التفخيم', tarqiq:'الترقيق', hamzah_behavior:'أحكام الهمز', waqf_pause_detection:'اكتشاف الوقف', waqf_classification:'تصنيف الوقف', ibtida:'الابتداء', pause_duration:'مدة الوقف'
};

const AR_FEATURES:Record<string,string>={
  ai_integrity:'مراقبة النزاهة بالذكاء الاصطناعي', shadow_mode:'التحقق الصامت', hospitality:'الضيافة والوصول', remote_rounds:'الجولات عن بُعد', broadcast:'البث', benchmark:'المقارنة التشغيلية'
};

const EN_FEATURES:Record<string,string>={
  ai_integrity:'AI integrity', shadow_mode:'Shadow mode', hospitality:'Hospitality', remote_rounds:'Remote rounds', broadcast:'Broadcast', benchmark:'Benchmark'
};

export function uiToken(value:string|undefined|null, ar:boolean){
  if(value===undefined||value===null||value==='')return '—';
  return ar?(AR_TOKENS[value]||value):value.replaceAll('_',' ');
}

/*
 * أفعال دفتر التدقيق.
 *
 * كانت تُعرض بالرمز الخام (QUEUE_ROUTED، RESULT_SEALED) في شاشة عربية، فيقرأ المدقّق رموزًا
 * لا جملًا. الرمز يبقى في السجل نفسه — فهو المرجع الثابت — والعرض بالعربية. وما لا نعرف له
 * ترجمة يُعرض مقروءًا (شرطات سفلية تصير مسافات) بدل أن يُخفى.
 */
const AR_AUDIT_ACTIONS:Record<string,string>={
  QUEUE_ROUTED:'توجيه إلى لجنة', RESULT_SEALED:'ختم نتيجة', RESULT_PUBLISHED:'نشر نتيجة',
  FAIRDRAW_GENERATED:'توليد قرعة', FAIRDRAW_PROOF_PUBLISHED:'نشر إثبات القرعة',
  RESULT_ATTESTED:'شهادة الخادم على نتيجة', CERTIFICATE_ISSUED:'إصدار شهادة', CERTIFICATE_REVOKED:'إلغاء شهادة',
  COMPETITION_PUBLISHED:'فتح التسجيل', PARTICIPANT_CHECKED_IN:'تسجيل حضور',
  JUDGE_SUBMISSION_LOCKED:'قفل تقييم محكم', QUESTION_REVEALED:'كشف سؤال',
  AUDIT_LEDGER_SEALED:'ختم سجل التدقيق', SCIENTIFIC_DATASET_REGISTERED:'تسجيل حزمة علمية',
  LOCAL_MESH_STARTED:'بدء الشبكة المحلية', LOCAL_MESH_RECONCILED:'مصالحة الشبكة المحلية',
  FEDERATION_ATTESTATION_ISSUED:'إصدار إثبات اتحادي', OPERATIONAL_REHEARSAL_COMPLETED:'إكمال بروفة تشغيلية',
};
export function auditActionLabel(value:string|undefined|null, ar:boolean){
  if(!value)return '—';
  if(!ar)return value.replaceAll('_',' ').toLowerCase();
  return AR_AUDIT_ACTIONS[value] || value.replaceAll('_',' ');
}
/** اسم الدور بالعربية، ويقبل الأدوار غير المعروفة دون أن يُظهر رمزًا خامًا. */
export function roleLabel(value:string|undefined|null, ar:boolean){
  if(!value)return '—';
  return ar?(AR_TOKENS[value]||value.replaceAll('_',' ')):value.replaceAll('_',' ');
}

export function federationClaimLabel(value:FederationClaimType,ar:boolean){return ar?AR_CLAIMS[value]:EN_CLAIMS[value]}
export function featureLabel(value:string,ar:boolean){return ar?(AR_FEATURES[value]||value):(EN_FEATURES[value]||value.replaceAll('_',' '))}
export function signatureAssuranceLabel(signatureRef:string,ar:boolean){
  const development=signatureRef.startsWith('development://');
  return development?(ar?'إثبات تطويري — ليس توقيعًا مؤسسيًا':'Development proof — not institutional signing'):(ar?'موقّع من جهة الإصدار':'Issuer-signed');
}
export function claimPrivacyLabel(ar:boolean){return ar?'إثبات الصفة فقط — دون مشاركة الوثيقة':'Claim only — source document stays private'}

export function capabilityLabel(value:AICapability,ar:boolean){return ar?(AR_CAPABILITIES[value]||value):value.replaceAll('_',' ')}

/*
 * Country values are stored bilingually in one string, e.g. "Jordan (الأردن)". Rendering
 * them raw shows the Latin name inside an Arabic surface. Split by locale, and degrade
 * gracefully for values with no parenthetical (e.g. "Demo").
 */
export function localizedCountry(raw: string | undefined, ar: boolean): string {
  if (!raw) return '';
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m) return raw;
  return ar ? m[2].trim() : m[1].trim();
}

/*
 * Arabic count-noun agreement. Modern Standard Arabic treats a counted noun differently
 * by number: 1 → singular, 2 → dual, 3-10 → plural, 11+ → singular again. "1 حالات" and
 * "2 حالات" are both wrong. Non-human plurals (3-10) take a feminine-singular verb, so the
 * existing plural phrasing is correct there and only 1 and 2 need special forms.
 */
export function arCount(
  n: number,
  forms: { one: string; two: string; plural: (n: number) => string; many?: (n: number) => string },
): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return forms.plural(n);
  return (forms.many || forms.plural)(n);
}

/*
 * Server clients throw coded errors (e.g. "IDENTITY_REQUIRED"). Several consoles printed
 * the raw code to the screen. In demo mode with no backend, the common ones are expected
 * and benefit from a plain-language line; genuinely diagnostic codes fall through
 * unchanged so support can still read them.
 */
const SERVER_ERROR_AR: Record<string, string> = {
  KFGQPC_LIBRARY_UNAVAILABLE: 'مكتبة المصدر الرسمي غير متاحة حاليًا.',
  KFGQPC_DELIVERY_STATUS_UNAVAILABLE: 'حالة تسليم المصدر الرسمي غير متاحة حاليًا.',
  SOURCE_NOT_CERTIFIED: 'المصدر غير معتمد علميًا بعد.',
  SOURCE_NOT_FOUND: 'المصدر غير موجود.',
  READING_NOT_RESOLVED: 'تعذّر تحديد القراءة.',
  POLICY_HUMAN_APPROVAL_REQUIRED: 'يلزم اعتماد بشري لهذا الإجراء.',
  RUNTIME_NOT_FOUND: 'لا توجد جلسة سؤال خادمية لهذا المتسابق (غير متاحة في وضع العرض).',
  AUTHORIZATION_FAILED: 'تعذّر منح الإذن.',
  REVOKE_FAILED: 'تعذّر سحب الإذن.',
  SECURE_RUNTIME_UNAVAILABLE: 'تعذّر الوصول إلى خادم الأسئلة الآمن (غير متاح في وضع العرض).',
  ACCOUNT_ALREADY_ACTIVE_IN_COMPETITION: 'هذا الحساب مفعّل بالفعل في هذه المسابقة.',
  INVITATION_ALREADY_PENDING: 'توجد دعوة تفعيل سارية لهذا الحساب بالفعل.',
  INVITATION_FIELDS_REQUIRED: 'أكمل الاسم والبريد وسبب إضافة المستخدم.',
  INVITATION_NOT_FOUND: 'دعوة التفعيل غير موجودة أو لم تعد متاحة.',
  INVITATION_NOT_PENDING: 'هذه الدعوة ليست بانتظار الاعتماد.',
  ACTIVATION_TOKEN_INVALID: 'رابط التفعيل غير صالح أو انتهت صلاحيته. اطلب رمز QR جديدًا.',
  ACTIVATION_EMAIL_MISMATCH: 'البريد المسجل لا يطابق البريد المرتبط بالدعوة.',
  ACTIVATION_FAILED: 'تعذر تفعيل الحساب. اطلب رمز تفعيل جديدًا وحاول مرة أخرى.',
  ACCOUNT_NOT_PROVISIONED: 'الحساب صحيح، لكنه غير مضاف إلى هذه الجهة بعد.',
  ACCOUNT_NOT_FOUND: 'الحساب غير موجود في هذا النطاق.',
  ACCOUNT_NOT_ACTIVE: 'هذا الحساب غير نشط حاليًا.',
  IDENTITY_GOVERNANCE_NOT_CONFIGURED: 'خدمة إدارة الحسابات غير مهيأة على الخادم.',
  IDENTITY_REQUIRED: 'يلزم تسجيل الدخول بحساب مخول لإكمال هذه العملية.',
  COMPETITION_SCOPE_REQUIRED: 'اختر المسابقة التي ستُمنح فيها هذه الصلاحية.',
  COMPETITION_SCOPE_MISMATCH: 'هذه الصلاحية تخص مسابقة أخرى.',
  COMPETITION_ACCESS_CLOSED: 'المسابقة مغلقة ولا تسمح بوصول تشغيلي جديد.',
  ROLE_GRANT_NOT_ALLOWED: 'ليس لديك صلاحية منح هذا الدور.',
  ROLE_NOT_ALLOWED: 'هذا الدور غير مسموح لهذا الإجراء.',
  ROLE_RETIRED: 'هذا الدور لم يعد مستخدمًا في النظام.',
  SELF_ACCOUNT_CHANGE_NOT_ALLOWED: 'لا يمكن تعديل حسابك من إجراء إدارة المستخدمين هذا.',
  ORG_ADMIN_PROTECTED: 'حساب مدير الجهة محمي ولا يمكن تغييره من هذا المستوى.',
  SUPER_ADMIN_PROTECTED: 'حساب مالك المنصة محمي ولا يمكن تغييره من هذا المستوى.',
  LAST_ORG_ADMIN_PROTECTED: 'لا يمكن إيقاف آخر مدير نشط للجهة. عيّن مديرًا آخر أولًا.',
  CROSS_TENANT_GRANT_BLOCKED: 'لا يمكن منح صلاحية خارج الجهة الحالية.',
  PRIVILEGED_SESSION_CONFLICT: 'هذا الحساب الحساس مفتوح على جهاز آخر. أغلق الجلسة القديمة أو استخدم الاستيلاء الآمن.',
  MFA_REQUIRED: 'يلزم إكمال التحقق بخطوتين لهذا الحساب.',
  DEVICE_ID_REQUIRED: 'تعذر تحديد الجهاز لهذه الجلسة.',
  TENANT_SUSPENDED: 'هذه الجهة موقوفة حاليًا.',
  RATE_LIMITED: 'تمت محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.',
  PASSWORD_RESET_REQUEST_NOT_FOUND: 'طلب تغيير كلمة المرور غير موجود أو انتهت صلاحيته.',
  PASSWORD_RESET_REQUEST_EXPIRED: 'انتهت صلاحية طلب تغيير كلمة المرور. اطلب رابطًا جديدًا.',
  PASSWORD_RESET_REQUEST_NOT_PENDING: 'تم التعامل مع طلب تغيير كلمة المرور مسبقًا.',
  PASSWORD_RESET_NOT_ALLOWED: 'ليس لديك صلاحية اعتماد طلب تغيير كلمة المرور هذا.',
  PASSWORD_RESET_LINK_UNAVAILABLE: 'تعذر إنشاء رابط تغيير كلمة المرور الآن. أعد المحاولة لاحقًا.',
  PASSWORD_RESET_TOKEN_INVALID: 'رابط تغيير كلمة المرور غير صالح أو استُخدم من قبل.',
  NOTIFICATION_CENTER_UNAVAILABLE: 'تعذّر تحميل الإشعارات الآن. تحقّق من الاتصال وأعد المحاولة.',
  NOTIFICATION_RECIPIENTS_FAILED: 'تعذّر تحميل قائمة المستلمين. أعد المحاولة بعد قليل.',
  NOTIFICATION_UPDATE_FAILED: 'تعذّر تحديث الإشعار. أعد المحاولة بعد قليل.',
  NOTIFICATION_SEND_FAILED: 'تعذّر إرسال الإشعار. تحقّق من الاتصال وأعد المحاولة.',
};
const SERVER_ERROR_EN: Record<string, string> = {
  IDENTITY_REQUIRED: 'This service requires sign-in and the live server (unavailable in demo).',
  KFGQPC_LIBRARY_UNAVAILABLE: 'The official source library is currently unavailable.',
  KFGQPC_DELIVERY_STATUS_UNAVAILABLE: 'Official source delivery status is currently unavailable.',
  SOURCE_NOT_CERTIFIED: 'The source is not scientifically certified yet.',
  SOURCE_NOT_FOUND: 'Source not found.',
  READING_NOT_RESOLVED: 'The reading could not be resolved.',
  POLICY_HUMAN_APPROVAL_REQUIRED: 'This action requires human approval.',
  RUNTIME_NOT_FOUND: 'No server-held question session for this participant (unavailable in demo).',
  AUTHORIZATION_FAILED: 'Authorization failed.',
  REVOKE_FAILED: 'Could not revoke authorization.',
  SECURE_RUNTIME_UNAVAILABLE: 'The secure question server is unavailable (unavailable in demo).',
  NOTIFICATION_CENTER_UNAVAILABLE: 'Notifications could not be loaded. Check the connection and try again.',
  NOTIFICATION_RECIPIENTS_FAILED: 'The recipient list could not be loaded. Try again shortly.',
  NOTIFICATION_UPDATE_FAILED: 'The notification could not be updated. Try again shortly.',
  NOTIFICATION_SEND_FAILED: 'The notification could not be sent. Check the connection and try again.',
};
export function serverErrorLabel(code: string, ar: boolean): string {
  const map = ar ? SERVER_ERROR_AR : SERVER_ERROR_EN;
  if(map[code])return map[code];
  // لا نعرض enum أو exception أو رمز خدمة خارجي للمستخدم. الرمز يبقى في السجل التشخيصي فقط.
  return ar ? 'تعذر إكمال العملية. تحقق من البيانات وحاول مرة أخرى.' : 'The operation could not be completed. Check the details and try again.';
}

/*
 * رفضُ الختم كان يصل إلى الشاشة فارغًا: الحالة الوحيدة التي تحمل `message` هي تعذّر سلطة
 * الخادم، وما عداها — «لست مخوّلًا»، «النصاب لم يكتمل»، «قاعدة نزاهة مانعة»، «لا توجد نتائج» —
 * كان يُعيد `reason` فقط، فيُضغط الزر ولا يقع شيء ولا يُقال لماذا. لكلٍّ منها هنا جملة تقول
 * السبب والخطوة التالية.
 */
const SEAL_FAILURE_AR: Record<string, string> = {
  not_authorized: 'الختم من صلاحية رئيس التحكيم أو مدير المسابقة أو مالك الجهة فقط.',
  independent_quorum_required: 'الختم يحتاج موافقة شخصين من جهازين مختلفين. سُجِّلت موافقتك، وينتظر اعتماد الطرف الثاني.',
  server_authority_required: 'تعذّر الوصول إلى خادم الاعتماد، فلم يُختم شيء. أعد المحاولة بعد استقرار الاتصال.',
  integrity_invariant: 'قاعدة نزاهة مانعة تمنع الختم. راجع لوحة النزاهة وعالج التنبيه قبل إعادة المحاولة.',
  no_results: 'لا توجد نتائج مكتملة لختمها بعد.',
};
const SEAL_FAILURE_EN: Record<string, string> = {
  not_authorized: 'Only the head judge, competition manager or organization owner can seal.',
  independent_quorum_required: 'Sealing needs two people on two devices. Your approval is recorded; the second is still pending.',
  server_authority_required: 'The sealing authority was unreachable, so nothing was sealed. Try again once the connection is stable.',
  integrity_invariant: 'A blocking integrity rule prevents sealing. Clear it on the integrity board first.',
  no_results: 'There are no completed results to seal yet.',
};
/** يُعيد جملة عربية دائمًا: لا يُعرض `reason` خامًا، ولا تبقى الشاشة صامتة عند الرفض. */
export function sealFailureLabel(outcome: { sealed?: boolean; reason?: string; message?: string } | null | undefined, ar: boolean): string {
  if(!outcome || outcome.sealed) return '';
  if(outcome.message) return outcome.message;
  const map = ar ? SEAL_FAILURE_AR : SEAL_FAILURE_EN;
  return map[String(outcome.reason || '')] || (ar ? 'تعذّر ختم النتائج. راجع الاعتراضات والمراجعات المعلّقة ثم أعد المحاولة.' : 'Results could not be sealed. Clear pending reviews and appeals, then try again.');
}

/*
 * اسمٌ بلغتين، وأحدهما قد يغيب.
 *
 * كان إنشاء المسابقة يأخذ حقلًا واحدًا ويكتبه في الاسمين معًا، فيُولد كل سجل ومعه نصٌّ عربي
 * مخزَّن في خانة الاسم الإنجليزي — بيانٌ يكذب على نفسه، ثم يظهر في الشهادة الإنجليزية.
 * والحلّ ألّا يُكتب ما لم يُدخَل: يبقى الإنجليزي فارغًا حتى يكتبه صاحبه.
 *
 * وحينها يجب ألّا تُفرَّغ شاشة. هذه الدالة تُرجع المتاح: المطلوب أولًا، ثم الآخر إن غاب.
 */
export function bilingualName(entity: { name?: string; nameArabic?: string } | null | undefined, ar: boolean): string {
  const arabic = String(entity?.nameArabic || '').trim();
  const english = String(entity?.name || '').trim();
  return (ar ? (arabic || english) : (english || arabic)) || '';
}

/* مستوى الأتمتة معروضًا بالعربية (كان يُعرض Assisted/Automated/Autopilot خامًا). */
const AR_AUTOMATION: Record<string, string> = { assisted: 'مساعَد', automated: 'آلي', autopilot: 'تشغيل ذاتي' };
export function automationLevelLabel(value: string, ar: boolean): string {
  return ar ? (AR_AUTOMATION[value] || value) : value.charAt(0).toUpperCase() + value.slice(1);
}

/* أدوار الأجهزة في القاعة (كانت Gate/JudgeOS/Waiting Display… خامة داخل شاشة عربية). */
const AR_DEVICE_ROLE: Record<string, string> = {
  Gate: 'البوابة', Kiosk: 'كشك الحضور', JudgeOS: 'منصة المحكم', 'Head Judge': 'رئيس التحكيم',
  Operations: 'التشغيل', 'Waiting Display': 'شاشة الانتظار', 'Committee Display': 'شاشة اللجنة',
  'Exception Host': 'مكتب الاستثناء', Ceremony: 'شاشة الحفل', Broadcast: 'البث', Edge: 'الخادم الطرفي',
};
export function deviceRoleLabel(value: string | undefined | null, ar: boolean): string {
  if (!value) return '—';
  return ar ? (AR_DEVICE_ROLE[value] || value) : value;
}

/* قنوات الإشعار. */
const AR_CHANNEL: Record<string, string> = { in_app: 'داخل التطبيق', email: 'البريد', sms: 'رسالة نصية', whatsapp: 'واتساب', push: 'إشعار فوري', storage: 'التخزين', identity: 'التحقق من الهوية', broadcast: 'البث' };
export function channelLabel(value: string, ar: boolean): string {
  return ar ? (AR_CHANNEL[value] || value) : value.replaceAll('_', ' ');
}

/* قوالب الإشعارات: مفاتيح تقنية (result.published, arrival_window…) تُعرض بجملة عربية. */
const AR_NOTIFICATION_TEMPLATE: Record<string, string> = {
  registration_approved: 'اعتماد التسجيل', registration_received: 'استلام طلب التسجيل',
  arrival_window: 'موعد الوصول', result_ready: 'النتيجة جاهزة', 'result.published': 'نشر النتيجة',
  result_published: 'نشر النتيجة', certificate_ready: 'الشهادة جاهزة', committee_call: 'نداء اللجنة',
  queue_update: 'تحديث الدور', reminder: 'تذكير',
};
export function notificationTemplateLabel(value: string, ar: boolean): string {
  if (!value) return '—';
  return ar ? (AR_NOTIFICATION_TEMPLATE[value] || value.replaceAll('_', ' ').replaceAll('.', ' · ')) : value.replaceAll('_', ' ');
}

/* عناوين فحوص البروفة التشغيلية بالعربية (كانت الأسماء والأثر تُعرض إنجليزية داخل شاشة عربية). */
const AR_REHEARSAL: Record<string, { name: string; impact: string }> = {
  'gate-scan': { name: 'مسح البوابة', impact: 'وصول المتسابق' },
  'offline-pass': { name: 'التحقق من التصريح دون اتصال', impact: 'استمرارية البوابة دون اتصال' },
  'participant-checkin': { name: 'تسجيل حضور المتسابق', impact: 'مسار الوصول' },
  queue: { name: 'الطابور', impact: 'استمرارية الطابور' },
  routing: { name: 'التوجيه', impact: 'توجيه المتسابقين' },
  'judge-session': { name: 'جلسة التحكيم', impact: 'التحكيم البشري' },
  'judge-lock': { name: 'قفل المحكم المستقل', impact: 'استقلال المحكم' },
  'head-judge-review': { name: 'مراجعة رئيس التحكيم', impact: 'المراجعة البشرية المصعّدة' },
  fairdraw: { name: 'السحب العادل', impact: 'اختيار السؤال' },
  'network-interruption': { name: 'انقطاع الشبكة', impact: 'فقد الاتصال' },
  'offline-continuation': { name: 'استمرار الحدث دون اتصال', impact: 'التشغيل دون اتصال' },
  reconnect: { name: 'إعادة الاتصال', impact: 'استعادة الاتصال' },
  'conflict-reconciliation': { name: 'تسوية التعارض', impact: 'دمج غير مكرَّر' },
  'device-failure': { name: 'عطل جهاز', impact: 'استمرارية الأجهزة' },
  'device-reassignment': { name: 'إعادة تعيين جهاز', impact: 'استمرارية الأدوار' },
  'judge-absence': { name: 'غياب محكم', impact: 'استمرارية اللجنة' },
  'committee-reassignment': { name: 'إعادة تعيين لجنة', impact: 'استمرارية التوجيه' },
  'emergency-mode': { name: 'وضع الطوارئ', impact: 'استمرارية الطوارئ' },
  'notification-failure': { name: 'فشل الإشعارات', impact: 'صمود التواصل' },
  'ai-outage': { name: 'تعطّل الذكاء الاصطناعي', impact: 'استمرارية التحكيم البشري' },
  'result-seal': { name: 'ختم النتيجة', impact: 'سلطة النتيجة' },
  quorum: { name: 'النصاب', impact: 'تفويض متعدد السلطات' },
  appeal: { name: 'الاعتراض', impact: 'مسار الاعتراض' },
  'certificate-issuance': { name: 'إصدار الشهادة', impact: 'شهادة تحمل الإثبات' },
};
export function rehearsalCheckLabel(id: string, name: string, impact: string, ar: boolean): { name: string; impact: string } {
  if (!ar) return { name, impact };
  return AR_REHEARSAL[id] || { name, impact };
}
