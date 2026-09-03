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
