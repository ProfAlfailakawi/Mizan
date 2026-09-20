import { arabicIndicDigits } from '../components/judge/AyahMark';

/*
 * أين تعثّر — لا كم مرّة فقط.
 *
 * المحرّك يقول في كل مقطعٍ صوتيّ أين بلغ القارئ (آيةً وكلمة) وهل ما زال متتبِّعًا. وكان
 * التدريبُ يعدّ مرّاتِ الانقطاع وحدها، فيُقال للمتسابق «فقد أثرك ٣ مرّات» ولا يُقال أين —
 * وهو أوّلُ ما يحتاج: الموضعُ الذي يُعيده، لا عددٌ يقلقه.
 *
 * ولحظةُ الانقطاع نفسُها لا تعرف موضعًا — «فقدتُ أثره» تعني أنه لا يعرف أين هو. فالموضعُ
 * الصادق هو **آخرُ ما تتبّعه قبل أن يفقده**، ويُحفظ من النتيجة السابقة لا من نتيجة العطب.
 *
 * وهذا وصفٌ لا حكم: لا يُشتقّ منه رقمٌ ولا درجة، ولا يبلغ التحكيمَ منه شيء. والانقطاعُ
 * قد يكون تردّدًا وقد يكون ضعفَ صوت — فيُعرض معه وضوحُ الصوت، ويُترك الحكمُ لصاحبه.
 */

export interface TrialPosition {
  ayah: number;
  /** ترتيبُ الكلمة في الآية حين يعرفه المحرّك. */
  wordIndex?: number;
}

export interface StumbleState {
  /** آخرُ موضعٍ تتبّعه المحرّك وهو واثق. */
  lastTracked: TrialPosition | null;
  /** هل كان المقطعُ السابق منقطعًا — فلا يُعدّ الانقطاعُ الواحد مرّتين. */
  wasLost: boolean;
  /** كم مرّةً انقطع الأثر، عُرف موضعُها أو لم يُعرف. */
  lostCount: number;
  /** مواضعُ الانقطاع المعروفة، بترتيب وقوعها. */
  stumbles: TrialPosition[];
}

export const emptyStumbleState = (): StumbleState => ({ lastTracked: null, wasLost: false, lostCount: 0, stumbles: [] });

export interface AlignmentObservation {
  alignmentState?: string;
  ayah?: number;
  wordIndex?: number;
}

/**
 * يقرأ نتيجةَ مقطعٍ واحد ويُرجع الحالةَ بعده. دالّةٌ محضة: لا تقرأ وقتًا ولا شبكة،
 * فتُقاس بتسلسلٍ مصنوع بدل انتظار تلاوةٍ حقيقية.
 */
export function observeAlignment(state: StumbleState, result: AlignmentObservation): StumbleState {
  const lost = result.alignmentState === 'LOST';
  if (lost) {
    if (state.wasLost) return state;
    return {
      ...state,
      wasLost: true,
      lostCount: state.lostCount + 1,
      /* موضعٌ مجهولٌ لا يُخترع: انقطاعٌ قبل أن يتتبّع شيئًا يُعدّ ولا يُوضَع له مكان. */
      stumbles: state.lastTracked ? [...state.stumbles, state.lastTracked] : state.stumbles,
    };
  }
  /*
   * `REACQUIRING` ليس تتبّعًا: المحرّك يبحث عن موضعه، فما يقوله ظنٌّ لا يُبنى عليه.
   * فلا يُحدَّث آخرُ موضعٍ معروف إلا من حالٍ واثقة.
   */
  const confident = result.alignmentState !== 'REACQUIRING' && Number.isInteger(result.ayah) && (result.ayah as number) >= 1;
  return {
    ...state,
    wasLost: false,
    lastTracked: confident
      ? { ayah: result.ayah as number, ...(Number.isInteger(result.wordIndex) && (result.wordIndex as number) >= 0 ? { wordIndex: result.wordIndex as number } : {}) }
      : state.lastTracked,
  };
}

/** «الآية ٦ · الكلمة ٤» — أو «الآية ٦» حين لا تُعرف الكلمة. */
export function describeStumble(position: TrialPosition, arabic: boolean): string {
  if (arabic) {
    const ayah = arabicIndicDigits(position.ayah);
    return position.wordIndex === undefined
      ? `الآية ${ayah}`
      : `الآية ${ayah} · الكلمة ${arabicIndicDigits(position.wordIndex + 1)}`;
  }
  return position.wordIndex === undefined ? `ayah ${position.ayah}` : `ayah ${position.ayah}, word ${position.wordIndex + 1}`;
}
