/*
 * وجوهُ المصحف للتمرين — ما يحتاجه الطالبُ ليرى وجهًا كاملًا ويقرأه.
 *
 * والفرقُ بين هذا وبين التسليم في المسابقة فرقٌ في الغاية لا في المصدر: النصُّ واحدٌ
 * من حزمة الرواية نفسِها، والمواضعُ من مواضع صفحاتها المقيسة. لكنّ هذا لا يمسّ خزنةَ
 * السؤال بحرف، ولا يُكتب منه دفترُ أدلّة، ولا يصل اللجنةَ منه شيء.
 *
 * وحدٌّ لا يُتجاوز: **لا يُعرض وجهٌ إلا كان كاملًا في هذه الرواية**. فالوجهُ الذي تعبره
 * آيةٌ إلى صفحةٍ أخرى، أو الذي تنقص من آياته آيةٌ لم تُوضع، يُترك — ولا يُملأ نقصُه من
 * روايةٍ أخرى ولا يُقدَّر.
 */

import { loadIslamwebReadingPackage } from './islamweb-reading-packages';
import { buildFaceIndex, canonicalBridgeFor, faceInScope, faceIsWhole, nativeSurahEnds, type MushafFace } from './mushaf-face';
import type { QuranScope } from '../src/lib/quran-scope';
import type { CandidateQuranVerse } from './quran-candidate-source-vault';

/** وجهٌ في القائمة: ما يكفي الطالبَ ليعرف أين هو، ولا كلمةَ نصٍّ قبل أن يطلبه. */
export interface PracticeFaceSummary {
  page: number;
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
  /** عددُ آيات الوجه — يُرى في القائمة فيُعرف ثِقَلُه قبل فتحه. */
  ayahCount: number;
}

export interface PracticeFaceCatalogue {
  rawiId: string;
  /** هل تحمل حزمةُ هذه الرواية مواضعَ صفحاتٍ أصلًا؟ بلا مواضعَ لا وجوه. */
  supportsFaces: boolean;
  /** وجوهُ الرواية كلُّها الكاملة — قبل حصرها في نطاق طالب. */
  wholeFaces: number;
  faces: PracticeFaceSummary[];
}

/** كلمةٌ على الوجه — بفهرسها العامّ الذي يعدّه المحرّك، لا بفهرسٍ داخل آيتها. */
export interface PracticeFaceWord {
  index: number;
  text: string;
  surah: number;
  ayah: number;
  /** فهرسُ الكلمة داخل آيتها، بدءًا من واحد — هو ما يرسله المحاذي. */
  ayahWordIndex: number;
  endsAyah: boolean;
}

export interface PracticeFacePage {
  rawiId: string;
  page: number;
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
  words: PracticeFaceWord[];
  /** السورُ الحاضرةُ على الوجه بأرقامها — أسماؤها تُسمّى في الواجهة لا هنا. */
  surahs: number[];
}

export class PracticeFaceError extends Error {}

/*
 * تقطيعُ الآية إلى كلمات.
 *
 * والرسمُ العثمانيُّ لا يُمسّ: يُقطَّع على المسافات وحدها، فلا تُحذف حركةٌ ولا يُوحَّد
 * همزٌ ولا يُسقط حرفٌ صغير. وما بين الكلمتين من مسافاتٍ متعدّدةٍ أو أسطرٍ يُطوى، فالكلمةُ
 * الفارغةُ ليست كلمة.
 */
export function splitAyahWords(text: string): string[] {
  return String(text || '').split(/\s+/).filter(w => w.length > 0);
}

function versesOf(rawiId: string, env: NodeJS.ProcessEnv): readonly CandidateQuranVerse[] {
  try {
    return loadIslamwebReadingPackage(rawiId, env).verses;
  } catch (err) {
    throw new PracticeFaceError(err instanceof Error ? err.message : 'PRACTICE_FACE_PACKAGE_UNAVAILABLE');
  }
}

/** فهرسُ الوجوه الكاملة لرواية — يُبنى مرّةً ويُحفظ، فبناؤه مرورٌ على ست آلاف آية. */
const catalogueCache = new Map<string, PracticeFaceCatalogue>();
const faceCache = new Map<string, Map<number, MushafFace>>();

export function clearPracticeFaceCache() { catalogueCache.clear(); faceCache.clear(); }

function facesOf(rawiId: string, env: NodeJS.ProcessEnv): Map<number, MushafFace> {
  const cached = faceCache.get(rawiId);
  if (cached) return cached;
  const built = buildFaceIndex(versesOf(rawiId, env));
  faceCache.set(rawiId, built);
  return built;
}

const summarise = (face: MushafFace): PracticeFaceSummary => ({
  page: face.page,
  surahStart: face.surahStart, ayahStart: face.ayahStart,
  surahEnd: face.surahEnd, ayahEnd: face.ayahEnd,
  ayahCount: face.ayat.length,
});

/** الوجوهُ الكاملةُ لرواية، مرتّبةً — بلا نطاق. يُبنى مرّةً ويُحفظ. */
function wholeFacesOf(rawiId: string, env: NodeJS.ProcessEnv): MushafFace[] {
  const ayahCountOf = nativeSurahEnds(versesOf(rawiId, env));
  return [...facesOf(rawiId, env).values()]
    .filter(face => faceIsWhole(face, ayahCountOf))
    .sort((a, b) => a.page - b.page);
}

/*
 * حصرُ الوجوه في نطاق الطالب يقع **هنا**، لا في المتصفّح.
 *
 * لأنّ النطاق مكتوبٌ بالترقيم القانونيّ، وحزمةُ الرواية مرقّمةٌ بترقيمها هي، وبينهما
 * جسرٌ (`canonicalBridgeFor`) يحمل أدلّةَ المقابلة. ولو حُصر في المتصفّح لاحتاج إمّا
 * إرسالَ آيات المصحف كلِّها إليه، أو حكمًا على رواية بترقيم أخرى — وكلاهما مرفوض.
 * وما لا يُحسم في الجسر يسقط مغلقًا: وجهٌ لا نعرف مقابله لا يُعرض.
 */
export function practiceFaceCatalogue(
  rawiId: string,
  scope?: QuranScope,
  env: NodeJS.ProcessEnv = process.env,
): PracticeFaceCatalogue {
  const cacheKey = `${rawiId}|${scope ? JSON.stringify(scope.segments) : ''}`;
  const cached = catalogueCache.get(cacheKey);
  if (cached) return cached;

  const whole = wholeFacesOf(rawiId, env);
  const toCanonical = canonicalBridgeFor(rawiId);
  const listed = (scope ? whole.filter(face => faceInScope(face, scope, toCanonical)) : whole).map(summarise);

  const out: PracticeFaceCatalogue = {
    rawiId,
    supportsFaces: whole.length > 0,
    wholeFaces: whole.length,
    faces: listed,
  };
  catalogueCache.set(cacheKey, out);
  return out;
}

export function practiceFacePage(rawiId: string, page: number, env: NodeJS.ProcessEnv = process.env): PracticeFacePage {
  if (!Number.isInteger(page) || page < 1 || page > 604) throw new PracticeFaceError('PRACTICE_FACE_PAGE_INVALID');
  const verses = versesOf(rawiId, env);
  const face = facesOf(rawiId, env).get(page);
  if (!face) throw new PracticeFaceError('PRACTICE_FACE_NOT_IN_PACKAGE');
  if (!faceIsWhole(face, nativeSurahEnds(verses))) throw new PracticeFaceError('PRACTICE_FACE_NOT_WHOLE');

  /* نصُّ الآية يُطلب من الحزمة نفسِها بمفتاحٍ صريح — ولا يُبنى وجهٌ على آيةٍ لم تُوجد. */
  const byLocus = new Map<string, CandidateQuranVerse>();
  for (const v of verses) byLocus.set(`${v.sura_no}:${v.aya_no}`, v);

  const words: PracticeFaceWord[] = [];
  for (const locus of face.ayat) {
    const verse = byLocus.get(`${locus.surah}:${locus.ayah}`);
    if (!verse) throw new PracticeFaceError(`PRACTICE_FACE_AYAH_MISSING:${locus.surah}:${locus.ayah}`);
    const parts = splitAyahWords(verse.aya_text);
    if (!parts.length) throw new PracticeFaceError(`PRACTICE_FACE_AYAH_EMPTY:${locus.surah}:${locus.ayah}`);
    parts.forEach((text, i) => {
      words.push({
        index: words.length, text,
        surah: locus.surah, ayah: locus.ayah,
        ayahWordIndex: i + 1,
        endsAyah: i === parts.length - 1,
      });
    });
  }

  return {
    rawiId, page,
    surahStart: face.surahStart, ayahStart: face.ayahStart,
    surahEnd: face.surahEnd, ayahEnd: face.ayahEnd,
    words,
    surahs: [...new Set(face.ayat.map(a => a.surah))].sort((a, b) => a - b),
  };
}
