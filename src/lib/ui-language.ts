import type { AICapability, FederationClaimType } from '../types';

const AR_TOKENS:Record<string,string>={
  CERTIFIED:'معتمد علميًا', PENDING_REVIEW:'بانتظار المراجعة', DEVELOPMENT:'بيئة تطوير', REVOKED:'ملغى', SUSPENDED:'موقوف', UNSUPPORTED:'غير مدعوم', BETA:'تجريبي', RESEARCH:'بحثي', PENDING_VALIDATION:'بانتظار التحقق',
  APPROVED_REFERENCE:'مرجع صوتي معتمد', REFERENCE:'مرجع', COMPLETED:'مكتمل', INVALIDATED:'ملغى', PASS:'ناجح', WARNING:'تنبيه', FAIL:'فشل', PASS_WITH_WARNINGS:'ناجح مع تنبيهات', READY:'جاهز',
  SEALED:'مختوم', REVEALED:'مكشوف', APPLIED:'تم التطبيق', PROPOSED:'مقترح', APPROVED:'معتمد', DISMISSED:'مرفوض', BLOCKED:'محظور', AUTHENTIC:'أصيل', NOT_FOUND:'غير موجود', INVALID_PROOF:'إثبات غير صالح',
  MATCH:'مطابق', DIFFERENCE:'اختلاف', UNVERIFIED:'غير متحقق', EXPORTED:'مُصدّر', VERIFIED:'متحقق', FAILED:'فشل', RESTORE_TESTED:'اختبار الاستعادة ناجح',
  'LOCAL BENCHMARK ONLY':'مقارنة محلية فقط', 'SOURCE CANDIDATE':'مصدر مرشح', 'PENDING SOURCE':'المصدر العلمي معلّق',
  REQUIRED:'مطلوب', RECOMMENDED:'موصى به', OPTIONAL:'اختياري',
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
  IDENTITY_REQUIRED: 'هذه الخدمة تتطلب تسجيل الدخول والخادم المباشر (غير متاحة في وضع العرض).',
  KFGQPC_LIBRARY_UNAVAILABLE: 'مكتبة المصدر الرسمي غير متاحة حاليًا.',
  KFGQPC_DELIVERY_STATUS_UNAVAILABLE: 'حالة تسليم المصدر الرسمي غير متاحة حاليًا.',
  SOURCE_NOT_CERTIFIED: 'المصدر غير معتمد علميًا بعد.',
  SOURCE_NOT_FOUND: 'المصدر غير موجود.',
  READING_NOT_RESOLVED: 'تعذّر تحديد القراءة.',
  POLICY_HUMAN_APPROVAL_REQUIRED: 'يلزم اعتماد بشري لهذا الإجراء.',
};
const SERVER_ERROR_EN: Record<string, string> = {
  IDENTITY_REQUIRED: 'This service requires sign-in and the live server (unavailable in demo).',
  KFGQPC_LIBRARY_UNAVAILABLE: 'The official source library is currently unavailable.',
  KFGQPC_DELIVERY_STATUS_UNAVAILABLE: 'Official source delivery status is currently unavailable.',
  SOURCE_NOT_CERTIFIED: 'The source is not scientifically certified yet.',
  SOURCE_NOT_FOUND: 'Source not found.',
  READING_NOT_RESOLVED: 'The reading could not be resolved.',
  POLICY_HUMAN_APPROVAL_REQUIRED: 'This action requires human approval.',
};
export function serverErrorLabel(code: string, ar: boolean): string {
  const map = ar ? SERVER_ERROR_AR : SERVER_ERROR_EN;
  return map[code] || code;
}
