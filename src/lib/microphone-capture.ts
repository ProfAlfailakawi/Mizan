/*
 * أدواتٌ صغيرةٌ مشتركة لالتقاط الميكروفون في أسطح التدريب.
 *
 * ١. `framedChunk`: مقاطعُ MediaRecorder بعد الأولى بلا ترويسة ملف (EBML في WebM، و moov في MP4)،
 *    فلا يفكّها المستمعُ منفردة ويعود بلا موضع. فيُسبق كلُّ مقطعٍ بالأوّل ويُعلَن حجمُه
 *    (`x-mizan-head-bytes`) كما يفعل «يسمعك» في `MushafListens`.
 *
 * ٢. `microphoneErrorNote`: كلُّ تعذّرٍ في فتح الميكروفون كان يُقال له «لم يُسمح»، فيُرسَل من لا
 *    ميكروفون عنده، أو من ميكروفونه مشغولٌ بتطبيقٍ آخر، إلى إعدادات الإذن بلا فائدة. فيُفرَّق بين
 *    الإذن والغياب والانشغال، ويُقال لكلٍّ ما يصلحه.
 */

export interface FramedChunk { blob: Blob; headBytes: number }

/** يسبق المقطعَ بترويسة التسجيل (أوّل مقطع)؛ والمقطعُ الأوّل يُرسل وحده بلا إعلان حجم. */
export const framedChunk = (head: Blob, chunk: Blob): FramedChunk =>
  chunk === head
    ? { blob: chunk, headBytes: 0 }
    : { blob: new Blob([head, chunk], { type: chunk.type || head.type }), headBytes: head.size };

export type MicrophoneFailure = 'denied' | 'missing' | 'busy' | 'other';

export const microphoneFailureKind = (error: unknown): MicrophoneFailure => {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name || '') : '';
  if (/NotAllowedError|SecurityError|PermissionDeniedError/i.test(name)) return 'denied';
  if (/NotFoundError|DevicesNotFoundError|OverconstrainedError/i.test(name)) return 'missing';
  if (/NotReadableError|TrackStartError|AbortError/i.test(name)) return 'busy';
  return 'other';
};

export const microphoneErrorNote = (error: unknown, ar: boolean): string => {
  switch (microphoneFailureKind(error)) {
    case 'denied': return ar
      ? 'لم يُسمح للميكروفون. اضغط رمز القفل بجوار عنوان الموقع، واسمح بالميكروفون، ثم أعد المحاولة.'
      : 'Microphone permission is blocked. Allow microphone access for this site, then try again.';
    case 'missing': return ar
      ? 'لم يجد الجهاز ميكروفونًا متاحًا. وصّل الميكروفون أو فعّله ثم أعد المحاولة.'
      : 'No microphone was found. Connect or enable one, then try again.';
    case 'busy': return ar
      ? 'الميكروفون مستخدم من تطبيق آخر أو تعذّر تشغيله. أغلق التطبيق الذي يستخدمه ثم أعد المحاولة.'
      : 'The microphone is busy or could not start. Close the app using it, then try again.';
    default: return ar
      ? 'تعذّر فتح الميكروفون الآن. أعد المحاولة.'
      : 'The microphone could not open. Try again.';
  }
};
