/*
 * تنويع موضوعات الأسئلة.
 *
 * نموذجٌ سليمٌ حسابيًّا قد يكون رديئًا تربويًّا: خمسة أسئلة كلُّها آياتٌ قصيرة من قصار
 * المفصّل، أو كلُّها من قصص الأنبياء، تقيس ركنًا واحدًا من حفظ المتسابق وتترك بقيته.
 * والعدالة في المقياس لا تكتمل بتساوي الصعوبة وحدها؛ تحتاج أن يُسأل كلُّ متسابق عن
 * ألوانٍ مختلفة مما حفظ.
 *
 * فالموضوع هنا وسمٌ يُشتق من موضع السؤال نفسه — لا يُكتب يدويًّا ولا يُخمَّن بنموذج —
 * ويُستعمل تفضيلًا (PREFER) لا شرطًا: يُحاول المحرك ألّا يكرّر الموضوع داخل النموذج
 * الواحد، فإن لم يجد بديلًا سحب وسجّل التنازل باسمه.
 *
 * والوسوم مبنية على حقائق بنيوية في المصحف (طول الآية، السورة، موضعها من المفصّل)
 * وعلى جداولَ صريحةٍ مراجَعةٍ لمواضع القصص والأحكام. ما لم يقع في جدولٍ منها لا
 * يُلفَّق له وسم: يُوسم «عام»، وهو صدقٌ لا نقص.
 */

export type QuestionTopic =
  | 'ahkam'          // آيات الأحكام
  | 'qasas_anbiya'   // قصص الأنبياء
  | 'short_ayat'     // الآيات القصيرة
  | 'long_ayat'      // الآيات الطوال
  | 'surah_opening'  // مطالع السور
  | 'surah_ending'   // خواتيم السور
  | 'general';

export interface TopicLabel { id: QuestionTopic; ar: string; en: string }

export const QUESTION_TOPICS: TopicLabel[] = [
  { id: 'ahkam', ar: 'آيات الأحكام', en: 'Rulings (ahkam)' },
  { id: 'qasas_anbiya', ar: 'قصص الأنبياء', en: 'Stories of the prophets' },
  { id: 'short_ayat', ar: 'الآيات القصيرة', en: 'Short ayat' },
  { id: 'long_ayat', ar: 'الآيات الطوال', en: 'Long ayat' },
  { id: 'surah_opening', ar: 'مطالع السور', en: 'Surah openings' },
  { id: 'surah_ending', ar: 'خواتيم السور', en: 'Surah endings' },
  { id: 'general', ar: 'عام', en: 'General' },
];

export const topicLabel = (topic: QuestionTopic, arabic: boolean) =>
  (QUESTION_TOPICS.find(x => x.id === topic) || QUESTION_TOPICS[QUESTION_TOPICS.length - 1])[arabic ? 'ar' : 'en'];

/*
 * مواضع القصص وأحكامها بالسور ومدياتها.
 *
 * جدولٌ صريحٌ مختصر لأشهر المواضع، لا استقصاء تفسيريًّا: الغرض تنويع القياس لا الفتوى،
 * ولذلك يقتصر على ما لا خلاف في وصفه، ويُترك ما سواه «عامًّا».
 */
type Band = [surah: number, fromAyah: number, toAyah: number];

const QASAS_BANDS: Band[] = [
  [2, 30, 39], [2, 49, 74], [2, 124, 134], [2, 246, 251],
  [3, 33, 63],
  [7, 59, 171],
  [11, 25, 99],
  [12, 1, 111],
  [14, 35, 41],
  [17, 101, 104],
  [18, 60, 82],
  [19, 1, 58],
  [20, 9, 98],
  [21, 51, 93],
  [26, 10, 191],
  [27, 15, 58],
  [28, 3, 43],
  [29, 14, 40],
  [37, 75, 148],
  [38, 17, 44],
  [54, 9, 42],
  [71, 1, 28],
  [79, 15, 26],
];

const AHKAM_BANDS: Band[] = [
  [2, 178, 203], [2, 216, 242], [2, 275, 283],
  [3, 97, 97],
  [4, 1, 35], [4, 92, 103], [4, 127, 130], [4, 176, 176],
  [5, 1, 6], [5, 33, 45], [5, 87, 96],
  [6, 145, 153],
  [8, 41, 41],
  [9, 60, 60], [9, 103, 103],
  [16, 90, 90],
  [17, 22, 39],
  [22, 26, 37],
  [24, 1, 33], [24, 58, 61],
  [33, 49, 59],
  [58, 1, 4],
  [62, 9, 11],
  [65, 1, 7],
];

const inBand = (bands: Band[], surah: number, startAyah: number, endAyah: number) =>
  bands.some(([s, from, to]) => s === surah && endAyah >= from && startAyah <= to);

/** أول سورة المفصّل القصير — ما بعدها آياته قصيرة في الغالب. */
const SHORT_MUFASSAL_FIRST_SURAH = 78;

export interface TopicInput {
  surahNumber: number;
  startAyah: number;
  endAyah: number;
  /** عدد آيات السورة، إن عُرف — يُميّز خاتمة السورة من وسطها. */
  surahAyahCount?: number;
  /** متوسط عدد كلمات الآية في المقطع، إن حُسب من المصدر المعتمد. */
  averageWordsPerAyah?: number;
}

/**
 * وسم الموضع. يعيد وسمًا واحدًا هو الأدلّ، لأن التنويع يقارن وسمًا بوسم لا مجموعةً بمجموعة.
 * الترتيب مقصود: الخصوصية قبل العموم، والبنية (مطلع/خاتمة) قبل الطول.
 */
export function topicOf(input: TopicInput): QuestionTopic {
  const surah = Math.round(Number(input.surahNumber) || 0);
  const start = Math.max(1, Math.round(Number(input.startAyah) || 1));
  const end = Math.max(start, Math.round(Number(input.endAyah) || start));
  if (!surah) return 'general';

  if (inBand(AHKAM_BANDS, surah, start, end)) return 'ahkam';
  if (inBand(QASAS_BANDS, surah, start, end)) return 'qasas_anbiya';
  if (start === 1) return 'surah_opening';
  if (input.surahAyahCount && end >= input.surahAyahCount) return 'surah_ending';

  const words = input.averageWordsPerAyah;
  if (words !== undefined) return words <= 6 ? 'short_ayat' : words >= 18 ? 'long_ayat' : 'general';
  if (surah >= SHORT_MUFASSAL_FIRST_SURAH) return 'short_ayat';
  if (surah <= 5) return 'long_ayat';
  return 'general';
}

/**
 * توازن الموضوعات داخل نموذج واحد.
 *
 * يعيد عقوبةً (٠ فأعلى) لتكرار الموضوع نفسه: صفرٌ لموضوعٍ جديد، وتزيد مع كل تكرار.
 * تُضرب في وزنها داخل دالة الترجيح، فلا تُلغي الصعوبة ولا موازنة الحمل — تُمِيل فقط.
 */
export function topicRepetitionPenalty(chosenTopics: QuestionTopic[], topic: QuestionTopic): number {
  if (topic === 'general') return 0;
  const seen = chosenTopics.filter(x => x === topic).length;
  return seen;
}

/** تقرير التنويع لنموذجٍ مكتمل — يُعرض للجنة ولا يُخفى خلف رقم واحد. */
export function topicMix(topics: QuestionTopic[]): { topic: QuestionTopic; count: number }[] {
  const counts = new Map<QuestionTopic, number>();
  for (const topic of topics) counts.set(topic, (counts.get(topic) || 0) + 1);
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}
