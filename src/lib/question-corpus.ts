/*
 * إسقاط المواضع البنيوية على نطاق.
 *
 * ما الذي تعرفه هذه الوحدة وما الذي لا تعرفه: تعرف **بنية** المصحف — أن سورة البقرة مئتان
 * وستٌّ وثمانون آية، وأن مقطعًا من ثلاث آيات يبدأ عند ٢:٥ ينتهي عند ٢:٧ — وهذا قانوني.
 * ولا تعرف **نصّ** الآية ولا صعوبتها العلمية؛ هذان يأتيان من حزمة المصدر المعتمدة وحدها.
 *
 * فائدتها إذًا قياس السعة لا التسليم: كم موضعَ بدايةٍ صالحًا بنيويًا يملكه هذا النطاق؟
 * هذا الرقم هو مقام كل حسابات الندرة والكفاية والتنبؤ بالتكرار، وهو مستقل عن البنك المركّب.
 * ولا يُسلَّم منه سؤالٌ إلى لجنة تحكيم: التسليم من المصدر المعتمد عبر خزنة السؤال.
 */

import { QURAN_TOTAL_AYAHS, ayahCountOf, ayahOrdinal, juzOfLocus, ordinalToLocus, pageOfLocus } from './quran-canon';
import { scopeRanges, type QuranScope } from './quran-scope';
import type { DifficultyAssurance, QuestionCandidate } from './question-engine';

export interface CorpusProjectionOptions {
  /** عدد آيات المقطع. المقطع لا يعبر حدّ السورة ولا حدّ النطاق. */
  passageAyahCount?: number;
  /** المسافة بين بدايتين متتاليتين. واحد يعني كل آية بداية محتملة. */
  stride?: number;
  /** خريطة صعوبة مُعتمدة إن وُجدت: "surah:ayah" → ١..٥. */
  difficultyByLocus?: Record<string, number>;
  /** درجة توثيق الصعوبة لما لا يوجد له تقييم. */
  fallbackAssurance?: DifficultyAssurance;
  reading?: { qiraahId?: string; rawiId?: string; tariqId?: string };
  idPrefix?: string;
  /** حد أعلى للحماية من إسقاط المصحف كله في حلقة واجهة. */
  limit?: number;
}

/*
 * تقدير صعوبة بنيوي حتمي — يُعلَن بوضوح أنه تقدير آلي لا مراجعة علمية.
 * يقوم على إشارات بنيوية محضة: البدء من أول السورة أسهل مرساةً، والمقاطع الطويلة أثقل،
 * والمواضع في وسط السور الطويلة أصعب استدعاءً من أطرافها. لا يُدَّعى له أثر شرعي ولا علمي،
 * ولا يصلح لبطولة رسمية تشترط المراجعة — ولذلك درجته 'automatically_estimated'.
 */
function structuralDifficulty(surah: number, startAyah: number, endAyah: number): number {
  const total = ayahCountOf(surah) || 1;
  const relative = total <= 1 ? 0 : (startAyah - 1) / (total - 1);
  const middle = 1 - Math.abs(relative - 0.5) * 2;
  const length = Math.min(1, (endAyah - startAyah + 1) / 10);
  const longSurah = Math.min(1, total / 200);
  const raw = 0.25 + 0.35 * middle + 0.2 * length + 0.2 * longSurah;
  return Math.max(1, Math.min(5, Math.round(raw * 4 * 2) / 2 + 1));
}

/** كل مواضع البداية الصالحة بنيويًا داخل النطاق. */
export function projectCandidatesFromScope(scope: QuranScope, options: CorpusProjectionOptions = {}): QuestionCandidate[] {
  const length = Math.max(1, Math.min(20, Math.round(options.passageAyahCount ?? 3)));
  const stride = Math.max(1, Math.round(options.stride ?? 1));
  const limit = Math.max(1, Math.min(QURAN_TOTAL_AYAHS, options.limit ?? QURAN_TOTAL_AYAHS));
  /*
   * سياق القراءة جزء من هوية الموضع، لا وصفٌ له.
   *
   * موضعُ «البقرة ٥–٧» في رواية حفص غيرُ موضعِ «البقرة ٥–٧» في رواية ورش: نصّهما يختلف،
   * وأهليتهما تختلف. ولو تشاركا معرّفًا واحدًا لابتلع أحدهما الآخر عند التجميع، فيجد
   * متسابقُ ورشٍ بنكًا فارغًا بلا سبب ظاهر.
   */
  const readingKey = [options.reading?.qiraahId, options.reading?.rawiId, options.reading?.tariqId].filter(Boolean).join('-');
  const prefix = `${options.idPrefix || 'loc'}${readingKey ? `-${readingKey}` : ''}`;
  const out: QuestionCandidate[] = [];
  for (const [from, to] of scopeRanges(scope)) {
    for (let ordinal = from; ordinal <= to; ordinal += stride) {
      const start = ordinalToLocus(ordinal);
      const endAyah = start.ayah + length - 1;
      // المقطع لا يتجاوز سورته ولا مقطع النطاق الذي وقعت فيه بدايته.
      if (endAyah > ayahCountOf(start.surah)) continue;
      if (ayahOrdinal({ surah: start.surah, ayah: endAyah }) > to) continue;
      const key = `${start.surah}:${start.ayah}`;
      const rated = options.difficultyByLocus?.[key];
      out.push({
        id: `${prefix}-${start.surah}-${start.ayah}-${length}`,
        surahNumber: start.surah,
        startAyah: start.ayah,
        endAyah,
        juzNumber: juzOfLocus(start),
        pageNumber: pageOfLocus(start),
        difficultyRating: Number.isFinite(rated) ? Math.max(1, Math.min(5, Number(rated))) : structuralDifficulty(start.surah, start.ayah, endAyah),
        difficultyAssurance: Number.isFinite(rated) ? 'scientifically_approved' : (options.fallbackAssurance || 'automatically_estimated'),
        difficultySource: Number.isFinite(rated) ? 'CERTIFIED_DIFFICULTY_MAP' : 'MIZAN_STRUCTURAL_ESTIMATE',
        difficultyConfidence: Number.isFinite(rated) ? 1 : 0.35,
        approvalStatus: 'approved',
        ...(options.reading || {}),
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** سعة النطاق البنيوية: كم موضع بداية صالحًا يحتمل، بأطوال مقاطع مختلفة. */
export function scopeStructuralCapacity(scope: QuranScope, passageAyahCount = 3): number {
  return projectCandidatesFromScope(scope, { passageAyahCount }).length;
}
