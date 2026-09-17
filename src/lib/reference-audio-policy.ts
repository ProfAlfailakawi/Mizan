/*
 * سياسة التلاوة المرجعية في ميزان.
 *
 * قرار المنتج نهائي: زر الاستماع يستخدم تسجيل حفص نفسه لكل الروايات العشرين. هذه التلاوة
 * مرجع سمعي للمحكّم/المتسابق فقط وليست دليلًا علميًا على نص الرواية المعروضة، ولا تدخل
 * في الدرجة أو المطابقة. لذلك يبقى معرّف الصوت منفصلًا تمامًا عن معرّف الرواية.
 *
 * الأهم: توقيت كلمات تسجيل حفص لا يجوز إسقاطه على نص رواية أخرى. نسمح بتتبّع الكلمة فقط
 * حين يكون النص المعروض حفصًا؛ في بقية الروايات يكون التركيز على مستوى الآية/المقطع.
 */

export const REFERENCE_AUDIO_ID = 'hafs-muaiqly' as const;
export const REFERENCE_AUDIO_READING = 'hafs' as const;
export const REFERENCE_AUDIO_BUTTON_AR = 'استمع إلى الآية' as const;
export const REFERENCE_AUDIO_BUTTON_EN = 'Listen to the ayah' as const;

export interface ReferenceAudioPolicy {
  audioId: typeof REFERENCE_AUDIO_ID;
  evidenceForDisplayedReading: false;
  canAffectScore: false;
  mayProjectWordTiming: boolean;
}

export function referenceAudioPolicy(displayReading: string): ReferenceAudioPolicy {
  return {
    audioId: REFERENCE_AUDIO_ID,
    evidenceForDisplayedReading: false,
    canAffectScore: false,
    mayProjectWordTiming: displayReading === REFERENCE_AUDIO_READING,
  };
}
