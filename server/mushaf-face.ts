import type { CandidateQuranVerse } from './quran-candidate-source-vault';
import { scopeContainsLocus, type QuranLocus, type QuranScope } from '../src/lib/quran-scope';
import { MIZAN_IDENTITY_CROSSWALK, surahCountAssurance } from '../src/lib/quran-locus-crosswalk';

/*
 * الوجهُ الكامل — صفحةُ مصحفٍ تُسحب بتمامها، لا مقطعًا من ثلاث آيات.
 *
 * طلب المالك أن يُوضع للطالب «وجهٌ كامل بشكل عشوائي». وهذا لم يكن ممكنًا قبل اليوم:
 * لم تكن للنظام خريطةُ صفحاتٍ أصلًا — كان التجميدُ يُسقط `page` فيبقى النصُّ آياتٍ بلا
 * أمكنة. فلمّا استُعيدت الهندسة صار الفهرسُ العكسيّ (صفحة ← آيات) ممكنًا، وصار الوجهُ
 * وحدةَ تدريبٍ حقيقيّة.
 *
 * وثلاثةُ قيودٍ تحكم هذه الوحدة:
 *
 *   ١) **لا تخترع صفحة.** الوجوهُ تُبنى من الآيات التي تحمل موضعًا في حزمتها هي. ورايةٌ
 *      لا تحمل مواضع (حزمُ إسلام ويب) لا وجوهَ لها — ولا تُستعار صفحةُ سواها.
 *   ٢) **لا تخرج عن نطاقه.** الوجهُ لا يُعرض إلا إن كانت **كلُّ** آياته داخل نطاقه
 *      المعتمد. ووجهٌ نصفُه خارج النطاق يُسأل الطالبُ عمّا لم يُكلَّف به — وذلك ظلم.
 *   ٣) **السحبُ حتميٌّ بالبذرة.** البذرةُ نفسُها تعطي الوجهَ نفسَه، فيُعاد إنتاج أيّ
 *      جلسةِ تدريبٍ ويُراجَع اختيارُها. ولا عشوائيةَ لا تُفسَّر.
 */

export interface MushafFace {
  page: number;
  /*
   * هل في هذا الوجه آيةٌ لا يعرف النظامُ موضعَها؟
   *
   * الآيةُ العابرةُ صفحتين لا تُنسب إلى إحداهما، فتغيب من الوجهين معًا — وهي على
   * الورق موجودةٌ فيهما. فلو عُرض وجهٌ منهما لقرأ الطالبُ آيةً لا يراها النظام،
   * فيُحسب عليه انقطاعٌ لم يقع. فتُعلَّم الصفحتان ولا تُعرضان.
   */
  hasUnplacedNeighbour: boolean;
  /** أوّلُ آيةٍ على الوجه وآخرُها — بترقيم الرواية الأصلي. */
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
  /** الآياتُ كلُّها بترتيبها على الوجه. وجهٌ قد يجمع أواخرَ سورةٍ وأوائلَ أخرى. */
  ayat: { surah: number; ayah: number; lineStart: number; lineEnd: number }[];
  /** أعلى سطرٍ مشغولٍ وأدناه — هيئةُ الوجه كما نشرتها الحزمة. */
  lineStart: number;
  lineEnd: number;
}

/**
 * الفهرسُ العكسيّ: صفحةٌ ← آياتُها. يُبنى مرّةً لكلّ رواية، ويُهمل ما لا موضعَ له.
 *
 * والآياتُ العابرةُ صفحتين لا موضعَ لها (لا تُنسب إلى إحداهما)، فتغيب من الفهرس. وهذا
 * يعني أن وجهًا فيه آيةٌ عابرةٌ يبدو ناقصَ آية. فيُعالَج صراحةً في `faceIsWhole` أدناه:
 * وجهٌ لا تتّصل آياتُه لا يُعرض للطالب، لأنّا لا نعرف ما بينها.
 */
export function buildFaceIndex(verses: readonly CandidateQuranVerse[]): Map<number, MushafFace> {
  const byPage = new Map<number, MushafFace['ayat']>();
  const ordered = [...verses].sort((a, b) => (a.sura_no - b.sura_no) || (a.aya_no - b.aya_no));
  /*
   * الآيةُ بلا موضعٍ تُلوّث جارتيها.
   *
   * أوّلُ صياغةٍ لهذا الفهرس أسقطتها بصمت، فبدا الوجهان سليمين وبينهما آيةٌ مفقودة —
   * ولا يكشفها فحصُ الاتّصال داخل الوجه، لأن الفجوة تقع على **حدّ** الوجهين لا داخلَ
   * أحدهما. فتُلتقط هنا: صفحةُ ما قبلها وصفحةُ ما بعدها تُعلَّمان.
   */
  const tainted = new Set<number>();
  for (let i = 0; i < ordered.length; i += 1) {
    const v = ordered[i];
    if (v.page !== undefined && v.line_start !== undefined && v.line_end !== undefined) {
      const list = byPage.get(v.page) || [];
      list.push({ surah: v.sura_no, ayah: v.aya_no, lineStart: v.line_start, lineEnd: v.line_end });
      byPage.set(v.page, list);
      continue;
    }
    for (const neighbour of [ordered[i - 1], ordered[i + 1]]) {
      if (neighbour?.page !== undefined) tainted.add(neighbour.page);
    }
  }
  const faces = new Map<number, MushafFace>();
  for (const [page, list] of byPage) {
    list.sort((a, b) => (a.surah - b.surah) || (a.ayah - b.ayah));
    const first = list[0], last = list[list.length - 1];
    faces.set(page, {
      page,
      hasUnplacedNeighbour: tainted.has(page),
      surahStart: first.surah, ayahStart: first.ayah,
      surahEnd: last.surah, ayahEnd: last.ayah,
      ayat: list,
      lineStart: Math.min(...list.map(x => x.lineStart)),
      lineEnd: Math.max(...list.map(x => x.lineEnd)),
    });
  }
  return faces;
}

/*
 * آخرُ آيةٍ في كلّ سورةٍ **بترقيم هذه الحزمة هي** — لا بالعدّ القانوني.
 *
 * وهذا خطأٌ وقعتُ فيه ثم قِسته: فحصتُ اتّصالَ أوجه ورشٍ بعدّ حفص، فخرجت ٣٣ صفحةً
 * «مثقوبة» وهي سليمة. والسببُ أن ترقيم ورشٍ يخالف القانونيَّ في **٥٠ سورة**، فانتقالُ
 * السورة يبدو ناقصًا وهو تامّ. وبالعدّ الأصليّ: **صفرُ ثقوب**.
 *
 * وهو في جوهره ما يمنعه النظام كلُّه: أن يُحكَم على روايةٍ بمسطرة رواية أخرى.
 */
export function nativeSurahEnds(verses: readonly CandidateQuranVerse[]): (surah: number) => number {
  const last = new Map<number, number>();
  for (const v of verses) last.set(v.sura_no, Math.max(last.get(v.sura_no) || 0, v.aya_no));
  return (surah: number) => last.get(surah) || 0;
}

/**
 * هل الوجهُ متّصلٌ لا ثقبَ فيه؟ — فجوةٌ داخله، أو آيةٌ بلا موضعٍ على حدّه.
 *
 * ويُمرَّر إليه **عدُّ الرواية الأصليّ** (`nativeSurahEnds`) لا العدُّ القانونيّ، وإلا
 * حُكم على الرواية بمسطرة غيرها فظهرت أوجهٌ سليمةٌ مثقوبةً.
 */
export function faceIsWhole(face: MushafFace, ayahCountOfSurah: (surah: number) => number): boolean {
  if (face.hasUnplacedNeighbour) return false;
  for (let i = 1; i < face.ayat.length; i += 1) {
    const prev = face.ayat[i - 1], cur = face.ayat[i];
    if (cur.surah === prev.surah) {
      if (cur.ayah !== prev.ayah + 1) return false;
      continue;
    }
    /* انتقالُ سورة: يجب أن تكون السابقةُ ختمت وأن تبدأ التاليةُ من أوّلها. */
    if (cur.surah !== prev.surah + 1) return false;
    if (prev.ayah !== ayahCountOfSurah(prev.surah)) return false;
    if (cur.ayah !== 1) return false;
  }
  return true;
}

/*
 * النطاقُ قانونيٌّ والترقيمُ أصليّ — فلا بدّ من جسر.
 *
 * نطاقُ الطالب مكتوبٌ بالإحداثيّ القانونيّ، وآياتُ الحزمة بترقيمها الأصليّ. ومقابلةُ
 * أحدهما بالآخر مباشرةً خطأٌ صامت: قِيس أن ورشًا يخالف القانونيَّ في ٥٠ سورة، فآيةٌ
 * أصليّةٌ رقمُها ٧ قد لا يكون لها في القانونيّ رقمُ ٧ أصلًا.
 *
 * فيمرّ الانتقالُ من جسر المواضع صراحةً. **وما لا يُحلّ لا يُعرض**: موضعٌ لا نعرف
 * مقابله القانونيّ لا نستطيع أن نجزم أنه داخل نطاقه، وعرضُه مقامرةٌ على حفظ الطالب.
 */
export type CanonicalLocusOf = (native: { surah: number; ayah: number }) => QuranLocus | undefined;

/** جسرُ الهُويّة — لروايةٍ ترقيمُها هو القانونيُّ نفسُه، مُثبتًا لا مفترضًا. */
export const identityLocus: CanonicalLocusOf = native => ({ surah: native.surah, ayah: native.ayah });

/*
 * جسرُ روايةٍ بعينها — يُشتقّ في موضعٍ واحد فلا ينساه مستدعٍ.
 *
 * الهُويّةُ تُستعمل **للسورة التي ثبت فيها تطابقُ العدّ** وحدها (`VERIFIED_COUNT_IDENTITY`)،
 * وما سواها يمرّ من صفوف الدليل. وسورةٌ لا صفَّ لها ولا تطابقَ مُثبت يعود موضعُها
 * `undefined` — فلا يُعرض وجهُها. ولهذا تسقط أوجهُ الروايات الخمس الموقوفة: العائقُ
 * نفسُه الذي يمنع أسئلتَها يمنع أوجهَها، وهو الصواب.
 */
export function canonicalBridgeFor(rawiId: string): CanonicalLocusOf {
  return native => (surahCountAssurance(rawiId, native.surah) === 'VERIFIED_COUNT_IDENTITY'
    ? identityLocus(native)
    : MIZAN_IDENTITY_CROSSWALK.toCanonicalFromEvidence(rawiId, native));
}

/** هل كلُّ آيات الوجه داخل نطاق الطالب؟ نصفُ وجهٍ ليس وجهًا، وموضعٌ مجهولٌ ليس داخلًا. */
export function faceInScope(face: MushafFace, scope: QuranScope, toCanonical: CanonicalLocusOf = identityLocus): boolean {
  return face.ayat.every(a => {
    const canonical = toCanonical({ surah: a.surah, ayah: a.ayah });
    return canonical ? scopeContainsLocus(scope, canonical) : false;
  });
}

export interface FaceCandidate { page: number; weight: number }

/**
 * الأوجهُ الصالحة لهذا الطالب: متّصلةٌ، وداخلَ نطاقه، مرتّبةً بأرقامها.
 */
export function facesForScope(
  faces: ReadonlyMap<number, MushafFace>,
  scope: QuranScope,
  ayahCountOfSurah: (surah: number) => number,
  toCanonical: CanonicalLocusOf = identityLocus,
): MushafFace[] {
  const out: MushafFace[] = [];
  for (const face of faces.values()) {
    if (!faceIsWhole(face, ayahCountOfSurah)) continue;
    if (!faceInScope(face, scope, toCanonical)) continue;
    out.push(face);
  }
  return out.sort((a, b) => a.page - b.page);
}

/*
 * مولّدٌ حتميٌّ من بذرةٍ نصّية — نفسُ البذرة، نفسُ الوجه، في أيّ جهازٍ وأيّ وقت.
 * (xorshift32 مزروعٌ بـ FNV-1a: صغيرٌ، بلا اعتماد، وموزّعٌ توزيعًا مقبولًا لهذا الغرض.)
 */
function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 0x9e3779b9;
}

export function deterministicUnit(seed: string, step = 0): number {
  let x = seedOf(seed) ^ Math.imul(step + 1, 0x9e3779b9);
  x >>>= 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return x / 0x100000000;
}

/*
 * أدنى نصيبٍ يُترك لوزنٍ ساقط — نسبةً إلى أثقل وزنٍ في السحب.
 *
 * وكانت الأرضيّةُ `Number.EPSILON`: موجبةٌ على الورق، مستحيلةٌ في القسمة. فمولّدُنا
 * يُخرج ٢^٣٢ قيمةً لا غير، فنصيبٌ مقدارُه ٢^-٥٢ لا تقع فيه قيمةٌ واحدة. وقِيس ذلك
 * فإذا وجهٌ وزنُه صفرٌ لم يُسحب مرّةً واحدةً في ٢٠٠٠٠٠ بذرة — أي أنّ ضمانَ «لا وجهَ
 * يُقصى» كان دعوى في تعليقٍ لا خاصّيّةً في الشيفرة.
 *
 * والألفُ نسبةٌ مقصودة: نادرٌ بحقّ، ومسحوبٌ بحقّ.
 */
export const MIN_DRAW_SHARE = 1e-3;

/**
 * سحبُ وجهٍ واحد. الأوزانُ اختيارية: بلا أوزانٍ يكون السحبُ متساويًا، ومعها يميل إلى
 * ما يحتاجه الطالب — **ولا يُقصي شيئًا**: أدنى وزنٍ يبقى نصيبًا يقع فيه المولّد.
 *
 * وليس هذا وعدًا بأن يظهر كلُّ وجهٍ في كلّ جلسة، بل بألّا يكون وجهٌ **غيرَ قابلٍ
 * للسحب حسابًا**. والفرقُ بينهما هو الفرقُ بين النادر والممتنع.
 *
 * ويُرجع `null` حين لا وجهَ صالحًا، ولا يُختلق وجهٌ خارج النطاق ليملأ الفراغ.
 */
export function drawFace(
  candidates: readonly MushafFace[],
  seed: string,
  weightOf: (page: number) => number = () => 1,
): MushafFace | null {
  if (!candidates.length) return null;
  const raw = candidates.map(f => {
    const w = weightOf(f.page);
    return Number.isFinite(w) && w > 0 ? w : 0;
  });
  const heaviest = raw.reduce((a, b) => (b > a ? b : a), 0);
  /* لا وزنَ موجبًا البتّة: فالسحبُ متساوٍ — ولا يُرجَّح أحدُها بحجّة أنّه الأوّل. */
  const weights = heaviest > 0 ? raw.map(w => (w > 0 ? w : heaviest * MIN_DRAW_SHARE)) : raw.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let cut = deterministicUnit(seed) * total;
  for (let i = 0; i < candidates.length; i += 1) {
    cut -= weights[i];
    if (cut < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
