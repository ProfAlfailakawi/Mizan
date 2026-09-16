/*
 * عنوان العطل بالعربية دائمًا.
 *
 * كانت بعض الأعطال تُكتب بعناوين إنجليزية في الشيفرة، فتظهر كما هي في شاشةٍ عربية
 * («Secure question provisioning missing») ولا تعني شيئًا لمن يقرأها. العناوين الجديدة
 * عربية، وما حُفظ قبل ذلك يُسمّى بنوعه بدل أن يُعرض بلغته.
 *
 * وهو هنا في موضع واحد لأن شاشتين تعرضان الأعطال — «اليوم» وغرفة العمليات — ونسختان
 * من الجدول تفترقان عند أول نوعٍ يُضاف.
 */
import type { IncidentRecord } from '../types';

export const INCIDENT_TYPE_ARABIC: Record<IncidentRecord['type'], string> = {
  power: 'انقطاع كهرباء', network: 'انقطاع شبكة', audio_mic: 'عطل صوت أو ميكروفون', device: 'عطل جهاز',
  judge_absence: 'غياب محكّم', participant_emergency: 'طارئ لمتسابق', conflict_routing: 'توجيه وتضارب مصالح',
  security: 'أمن', venue: 'القاعة', quran_source_discrepancy: 'تعذّر تجهيز الأسئلة',
  source_hash_mismatch: 'اختلاف بصمة المصدر', wrong_riwayah_mapping: 'ربط رواية خاطئ',
  variant_locus_error: 'خطأ في موضع وجه', ai_false_positive_cluster: 'إنذارات آلية زائدة',
  ai_false_negative_cluster: 'إغفالات آلية', model_regression: 'تراجع نموذج',
  dataset_contamination: 'تلوّث بيانات', annotation_defect: 'خلل توصيف',
  certification_scope_violation: 'تجاوز نطاق اعتماد',
};

const HAS_ARABIC = /[\u0600-\u06FF]/;

/** العنوان المحفوظ إن كان عربيًّا، وإلا اسم نوعه بالعربية — ومعه عدد التكرار إن تكرّر. */
export function incidentTitle(
  incident: Pick<IncidentRecord, 'title' | 'type'> & { occurrences?: number },
  arabic: boolean,
): string {
  const base = !arabic
    ? incident.title
    : HAS_ARABIC.test(incident.title)
      ? incident.title
      : INCIDENT_TYPE_ARABIC[incident.type] || 'حالة تحتاج مراجعة';
  const times = incident.occurrences || 1;
  if (times < 2) return base;
  /* «٣ مرات» أنفع من ثلاثة أسطر متطابقة: يقول للمشغّل أيّها يستحق نظره أولًا. */
  return arabic ? `${base} — ${timesArabic(times)}` : `${base} (×${times})`;
}

const timesArabic = (n: number) =>
  n === 2 ? 'مرتين' : n <= 10 ? `${n} مرات` : `${n} مرة`;
