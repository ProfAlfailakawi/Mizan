/*
 * جسرٌ بين ما يعود من المحاذاة الحيّة وبين إشارات الوجه.
 *
 * وهذا الملفُّ موضعُ الصدق الأشدّ في الميزة كلِّها، لأنّه يقف بين مقياسٍ خشنٍ وعرضٍ
 * دقيق. فيجب أن يُقال هنا بالضبط **ما يُقاس وما لا يُقاس**:
 *
 * المسارُ الذي يعمل في الإنتاج يرسل مقطعًا صوتيًّا كلَّ ثانيتين، فيعود بموضعٍ واحد:
 * السورةُ والآيةُ وفهرسُ الكلمة، وحالةُ التتبّع، ووضوحُ الصوت. ولا يعود بكلفةٍ صوتيّة
 * ولا بكلمةٍ منافسة. فمنه يُعرف:
 *
 *   ✓ **لبثتَ** — بقي الموضعُ نفسَه بين مقطعين: بطءٌ مقيس.
 *   ✓ **أعدتَ** — رجع الموضعُ إلى الوراء: رجوعٌ مقيس.
 *   ✓ **انقطع الأثر** — قالت الحالةُ `LOST`.
 *
 * ولا يُعرف منه:
 *
 *   ✗ **بَعُد صوتُك** — تحتاج كلفةً صوتيّةً لا يرسلها هذا المسار. ولا تُشتقّ من الثقة:
 *     الثقةُ رقمٌ آخر يقيس شيئًا آخر، وتسميتُها كلفةً كذبٌ في التسمية.
 *   ✗ **موضعٌ مشابه** — تحتاج كلمةً منافسةً وفجوةً، ولا يرسلها هذا المسار.
 *   ✗ **تخطّيتَ** — وهذا أدقُّها: بين مقطعين يقرأ القارئُ خمسَ كلماتٍ أو عشرًا، فتقدّمُ
 *     الموضع سرعةُ قراءةٍ لا تخطٍّ. ولو عُدَّ تخطّيًا لامتلأ وجهُ الطالب بعلامةٍ كاذبة
 *     في كلّ تلاوةٍ سليمة. فالتخطّي **لا يُقاس على هذا المسار**، ولا يُدَّعى.
 *
 * ولا يُملأ ما لا يُقاس بصفرٍ ولا بتقدير: يُترك `NaN` و`null` فتسقط علامتُه من نفسها،
 * ويُقال للطالب صراحةً أيُّ علاماتٍ متاحةٌ له.
 */

import type { AlignmentStep } from '../../server/alignment/word-signals';

/** ما نحتاجه من ردّ المحاذاة — لا أكثر، فلا يُستعمل ما لم يُذكر هنا. */
export interface FaceAlignmentSample {
  surah?: number;
  ayah?: number;
  /** فهرسُ الكلمة داخل آيتها، بدءًا من واحد. */
  wordIndex?: number;
  alignmentState?: string;
}

/** جدولُ كلمات الوجه: منه يُترجَم الموضعُ إلى فهرسٍ عامّ. */
export interface FaceWordKey { index: number; surah: number; ayah: number; ayahWordIndex: number }

/** العلاماتُ التي يمكن قياسُها على مسارٍ ما — تُعلن للطالب ولا تُخفى. */
export const SAMPLED_PATH_MARKS = ['dwell', 'repeat', 'lost'] as const;

export function faceWordLookup(words: readonly FaceWordKey[]): (s: FaceAlignmentSample) => number | null {
  const table = new Map<string, number>();
  for (const w of words) table.set(`${w.surah}:${w.ayah}:${w.ayahWordIndex}`, w.index);
  return sample => {
    if (sample.surah === undefined || sample.ayah === undefined || sample.wordIndex === undefined) return null;
    const found = table.get(`${sample.surah}:${sample.ayah}:${sample.wordIndex}`);
    return found === undefined ? null : found;
  };
}

/**
 * يحوّل مقاطعَ التلاوة إلى خطوات إشارة.
 *
 * والقفزةُ تُرفع للرجوع وحده: تقدّمُ الموضع بين مقطعين سرعةُ قراءةٍ لا تخطٍّ، والمقياسُ
 * أخشنُ من أن يفرّق بينهما. فلا يُرفع علمُ القفزة إلى الأمام بحال.
 */
export function stepsFromSamples(
  samples: Iterable<FaceAlignmentSample>,
  words: readonly FaceWordKey[],
): AlignmentStep[] {
  const locate = faceWordLookup(words);
  const steps: AlignmentStep[] = [];
  let previous: number | null = null;

  for (const sample of samples) {
    const lost = String(sample.alignmentState || '').toUpperCase() === 'LOST';
    const word = lost ? null : locate(sample);
    if (word === null) {
      /* موضعٌ غيرُ معروفٍ على هذا الوجه = أثرٌ منقطع. ولا يُقدَّر له مكان. */
      steps.push({ word: -1, emission: Number.NaN, competingWord: null, competingGap: Number.NaN, tookJump: false, lost: true });
      continue;
    }
    steps.push({
      word,
      /* لا كلفةَ على هذا المسار — و`NaN` تُسقط علامةَ الشدّة من نفسها. */
      emission: Number.NaN,
      competingWord: null,
      competingGap: Number.NaN,
      tookJump: previous !== null && word < previous,
      lost: false,
    });
    previous = word;
  }
  return steps;
}
