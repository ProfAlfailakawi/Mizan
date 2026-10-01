/*
 * إعادة تقسيم حزم خمس روايات على عدّ مصاحف التيسير — قرار اللجنة (1 أكتوبر 2026).
 *
 * اعتمدت اللجنة مصاحف التيسير (alwa7y.com) مرجعًا لعدّ الآي للدوري والسوسي والبزي وقنبل
 * وروح. وحزمُ هذه الروايات في ميزان نصُّها صحيح، لكنّ رؤوس آيها على عدٍّ آخر:
 *
 *   الدوري والسوسي  حزمة المجمّع على المدني الأول (6217، «مراعاةً للسودان»)  ← البصري 6204
 *   البزي وقنبل      حزمة المجمّع تعدّ «عذابًا قريبًا» (6220)                   ← المكي 6219
 *   روح              حزمة إسلام ويب تخلط البصري بالمدني في الانشقاق (6206)      ← البصري 6205
 *
 * وإعادة التقسيم لا تمسّ حرفًا: كلماتُ الحزمة هي هي بترتيبها. الذي يتغيّر موضعُ الحدّ بين
 * آيتين فقط، وكلُّ حدٍّ يُضاف أو يُرفع مصدرُه **كلمةٌ مسمّاة** في quran-ws المجمَّد، ويُقبل
 * الناتج فقط إن طابق فهرسَ مصحف التيسير المطبوع ١١٤/١١٤. والتفصيل والأدلة في
 * `docs/QIRAAT-COUNT-RESEARCH.md` و`quran-sources/crosswalk/alwa7y/`.
 *
 * وحدةٌ نقيّة: أوصافٌ وبصمات، بلا قراءة ملفات. البناءُ في `scripts/quran-tayseer-resegment.ts`.
 */

/** موضعٌ في quran-ws: الآية بالترقيم الكوفي، ونوعه، والكلمة التي ينتهي عندها (للتحقّق). */
export interface BoundaryPointRef {
  surah: number;
  kufiAyah: number;
  kind: 'end' | 'internal';
  word: string;
}

/**
 * نظامُ عدٍّ = نظامٌ في quran-ws مع إضافاتٍ وحذوفٍ مسمّاة. كلُّ إضافةٍ أو حذفٍ له دليلٌ مكتوب
 * في `evidence`، ولا يُقبل إلا إذا طابق عدد الأسطر/الفهرس.
 */
export interface CountModel {
  base: 'madani-first' | 'madani-last' | 'makki' | 'basri' | 'dimashqi' | 'kufi';
  add: readonly BoundaryPointRef[];
  drop: readonly BoundaryPointRef[];
  evidence: string;
}

/**
 * إصلاحٌ مسمّى لعيبٍ في الحزمة الأصل — نوعان لا ثالث لهما:
 *   - حدٌّ وُضع قبل كلمته (`moveWords`): تُنقل الكلمات من أول السطر التالي إلى آخر هذا.
 *   - كلمةٌ تالفةُ الترميز (`replaceWord`): حرفٌ دخيلٌ في كلمةٍ واحدة بعينها.
 * وكلاهما يُفشل البناء إن لم يجد نصَّه بالضبط، ويُسجَّل في التقرير بدليله.
 */
export type BoundaryRepair =
  | { surah: number; packageAyah: number; moveWords: readonly string[]; evidence: string }
  | { surah: number; packageAyah: number; replaceWord: { from: string; to: string }; evidence: string };

export type TayseerNativeCountSystemId =
  | 'BASRI_ABU_AMR_TAYSEER'
  | 'MAKKI_IBN_KATHIR_TAYSEER'
  | 'BASRI_YAQUB_RAWH_TAYSEER'
  | 'BASRI_YAQUB_RUWAYS_TAYSEER';

export interface TayseerResegmentation {
  rawiId: string;
  /** الأثر الأصل كما هو مثبَّت قبل إعادة التقسيم. */
  baseArtifactFileName: string;
  baseArtifactSha256: string;
  baseVerseCount: number;
  /** عدُّ الحزمة الأصل — يُثبت من بايتاتها بكلماتها قبل أي تغيير. */
  packageModel: CountModel;
  /** العدُّ المطلوب — عدّ مصحف التيسير المعتمد. */
  targetModel: CountModel;
  /** ملفّ مصحف التيسير في `quran-sources/crosswalk/alwa7y/extracted-counts.json`. */
  tayseerMushaf: 'TayseerDoryBasry.pdf' | 'TayseerSosy.pdf' | 'TayseerKathir.pdf' | 'TayseerYakob.pdf';
  repairs: readonly BoundaryRepair[];
  nativeCountSystem: TayseerNativeCountSystemId;
  /** الأثر الناتج — يُبنى بجانب الأصل في المجلّد نفسه. */
  artifactFileName: string;
  artifactSha256: string;
  verseCount: number;
}

export const TAYSEER_COMMITTEE_DECISION_REFERENCE = 'MIZAN-COMMITTEE-2026-10-01-TAYSEER-AYAH-COUNT';
export const TAYSEER_COMMITTEE_DECISION_DATE = '2026-10-01';

const SHAYBAH_POINTS: readonly BoundaryPointRef[] = [
  { surah: 3, kufiAyah: 92, kind: 'internal', word: 'تحبون' },
  { surah: 37, kufiAyah: 167, kind: 'end', word: 'ليقولون' },
  { surah: 80, kufiAyah: 24, kind: 'end', word: 'طعامه' },
  { surah: 81, kufiAyah: 26, kind: 'end', word: 'تذهبون' },
];

const ABU_AMR_PACKAGE: CountModel = {
  base: 'madani-first',
  add: SHAYBAH_POINTS,
  drop: [{ surah: 3, kufiAyah: 97, kind: 'internal', word: 'إبراهيم' }],
  evidence:
    'حزمة المجمّع للدوري والسوسي على المدني الأول برواية شيبة (6217): تعدّ «مما تحبون» وتترك «مقام إبراهيم»، '
    + 'وتعدّ «وإن كانوا ليقولون» و«إلى طعامه» و«فأين تذهبون» — وهي مواضع خلاف أبي جعفر وشيبة الستة في البيان للداني. '
    + 'وquran-ws يحمل المدني الأول على رواية أبي جعفر.',
};

const BASRI_TARGET: CountModel = {
  base: 'basri',
  add: [],
  drop: [],
  evidence: 'العدّ البصري كما في quran-ws (6204، قول أيوب بن المتوكل) — يطابق فهرس مصحفَي التيسير للدوري والسوسي ١١٤/١١٤.',
};

const MAKKI_PACKAGE: CountModel = {
  base: 'makki',
  add: [{ surah: 78, kufiAyah: 40, kind: 'internal', word: 'قريبا' }],
  drop: [],
  evidence: 'حزمة المجمّع للبزي وقنبل على المكي مع عدّ «عذابًا قريبًا» (6220) — كمصحف دار الفكر.',
};

const MAKKI_TARGET: CountModel = {
  base: 'makki',
  add: [],
  drop: [],
  evidence: 'العدّ المكي على ترجيح الداني (6219): لا تُعدّ «عذابًا قريبًا» — يطابق فهرس مصحف التيسير لابن كثير ١١٤/١١٤.',
};

const RAWH_PACKAGE: CountModel = {
  base: 'basri',
  add: [
    { surah: 84, kufiAyah: 7, kind: 'end', word: 'بيمينه' },
    { surah: 84, kufiAyah: 10, kind: 'end', word: 'ظهره' },
  ],
  drop: [],
  evidence: 'حزمة إسلام ويب لروح (6206): بصريةٌ إلا أنها تعدّ موضعَي الانشقاق «كتابه بيمينه» و«وراء ظهره» على المدني.',
};

const RUWAYS_PACKAGE: CountModel = {
  base: 'basri',
  add: [],
  drop: [],
  evidence: 'حزمة إسلام ويب لرويس (6204): البصري على قول أيوب بن المتوكل كما في quran-ws، لا يعدّ «والحق أقول».',
};

const RAWH_TARGET: CountModel = {
  base: 'basri',
  add: [{ surah: 38, kufiAyah: 84, kind: 'end', word: 'أقول' }],
  drop: [],
  evidence:
    'العدّ البصري على قول عاصم الجحدري (6205): يعدّ «قال فالحق والحق أقول» في ص. '
    + 'الداني: «وفي ص بخلاف عن البصري: والحق أقول»؛ ومصحف التيسير ليعقوب: «والأول [6205] هو ما تم اعتماده».',
};

/*
 * البصماتُ أدناه يكتبها `npm run quran:tayseer-resegment` ثم تُلصق هنا، ويقابلها المُحمِّل
 * في كل تحميل. فلو تغيّر بايتٌ واحد في الأثر الناتج فشل التحميل مغلقًا.
 */
export const TAYSEER_RESEGMENTATIONS: readonly TayseerResegmentation[] = [
  {
    rawiId: 'al-duri-abu-amr',
    baseArtifactFileName: 'al-duri-abu-amr.kfgqpc-mirror.json.deflate',
    baseArtifactSha256: 'f65ed00fcac4a49e2fcd072f952587f69f12b25ce9fc2914dcb058a732fc57f1',
    baseVerseCount: 6217,
    packageModel: ABU_AMR_PACKAGE,
    targetModel: BASRI_TARGET,
    tayseerMushaf: 'TayseerDoryBasry.pdf',
    repairs: [],
    nativeCountSystem: 'BASRI_ABU_AMR_TAYSEER',
    artifactFileName: 'al-duri-abu-amr.tayseer-basri.json.deflate',
    artifactSha256: 'ce6b41442186eb56af132a02770851a4d49ec2cc399f8c7db58089c5344cdeab',
    verseCount: 6204,
  },
  {
    rawiId: 'al-susi',
    baseArtifactFileName: 'al-susi.kfgqpc-mirror.json.deflate',
    baseArtifactSha256: '5c46e77bbc050bc69688ab156dd71a8b689fb5a1af7e971e12703f3c7f894f82',
    baseVerseCount: 6217,
    packageModel: ABU_AMR_PACKAGE,
    targetModel: BASRI_TARGET,
    tayseerMushaf: 'TayseerSosy.pdf',
    repairs: [{
      surah: 71,
      packageAyah: 26,
      moveWords: ['نَارٗا'],
      evidence:
        'حزمة السوسي تُنهي الآية عند «فأدخلوا» وتبدأ التالية بـ«نارا»؛ وكلُّ أعداد quran-ws وحزمةُ الدوري من الناشر نفسه '
        + 'ومصحفُ التيسير للسوسي (ص 571: «فأدخلوا نارا ㉕») تجعل الحدّ بعد «نارا». وهو الفرق الوحيد بين حدود الحزمتين في 6217 موضعًا.',
    }],
    nativeCountSystem: 'BASRI_ABU_AMR_TAYSEER',
    artifactFileName: 'al-susi.tayseer-basri.json.deflate',
    artifactSha256: '1f2db8582a47bb57e9a99471001f76c97d5461e166d4de6036d491b117ff71b8',
    verseCount: 6204,
  },
  {
    rawiId: 'al-bazzi',
    baseArtifactFileName: 'al-bazzi.kfgqpc-mirror.json.deflate',
    baseArtifactSha256: '5f510078c5df7437b9d383e9cf234be8d1bbe4423b6f1499ca3f556a7a8bc810',
    baseVerseCount: 6220,
    packageModel: MAKKI_PACKAGE,
    targetModel: MAKKI_TARGET,
    tayseerMushaf: 'TayseerKathir.pdf',
    repairs: [],
    nativeCountSystem: 'MAKKI_IBN_KATHIR_TAYSEER',
    artifactFileName: 'al-bazzi.tayseer-makki.json.deflate',
    artifactSha256: '1a738083b4e084fca37013cf8248f10a1fcb02f7eac34c329a2302c104f07dd9',
    verseCount: 6219,
  },
  {
    rawiId: 'qunbul',
    baseArtifactFileName: 'qunbul.kfgqpc-mirror.json.deflate',
    baseArtifactSha256: '6e7bfee6fa282b8df4ef369fb05519ae690ee7ad1a1c90fc27df25ed5ab9d4db',
    baseVerseCount: 6220,
    packageModel: MAKKI_PACKAGE,
    targetModel: MAKKI_TARGET,
    tayseerMushaf: 'TayseerKathir.pdf',
    repairs: [],
    nativeCountSystem: 'MAKKI_IBN_KATHIR_TAYSEER',
    artifactFileName: 'qunbul.tayseer-makki.json.deflate',
    artifactSha256: '0bf4429f0d063183e2dbfc4fa38321524b81e80d9e3c46e78514998730a4fd6b',
    verseCount: 6219,
  },
  {
    rawiId: 'rawh',
    baseArtifactFileName: 'QiraahRawh.json.deflate',
    baseArtifactSha256: '01e680bf68fdfe050aa49097f253c628d8e3455836fbe63210b6ee95a689e036',
    baseVerseCount: 6206,
    packageModel: RAWH_PACKAGE,
    targetModel: RAWH_TARGET,
    tayseerMushaf: 'TayseerYakob.pdf',
    repairs: [],
    nativeCountSystem: 'BASRI_YAQUB_RAWH_TAYSEER',
    artifactFileName: 'QiraahRawh.tayseer-basri-jahdari.json.deflate',
    artifactSha256: 'ef8370b304cbec3df75044426baa7d8eb8e96542448f335e0c4b7c4ffcf165a5',
    verseCount: 6205,
  },
  {
    rawiId: 'ruways',
    baseArtifactFileName: 'QiraahRuways.json.deflate',
    baseArtifactSha256: 'df236a65d32ce0a68b6326c1811628cf143283e2ec788d82c0521ce1ee0ac1c6',
    baseVerseCount: 6204,
    packageModel: RUWAYS_PACKAGE,
    // مصحف التيسير ليعقوب يعتمد قول الجحدري (6205) ليعقوب كلّه — بروايتيه.
    targetModel: RAWH_TARGET,
    tayseerMushaf: 'TayseerYakob.pdf',
    repairs: [{
      surah: 2,
      packageAyah: 113,
      replaceWord: { from: 'خَآئِفِينلَ', to: 'خَآئِفِينَ' },
      evidence:
        'كلمةٌ تالفة الترميز في حزمة رويس: «خائفين» دخلتها لامٌ زائدة («خَآئِفِينلَ»). وهي في حزمة روح من الناشر نفسه '
        + '«خَآئِفِينَ»، وكذلك في حفص وفي كل مصحف. ويقع فيها حدٌّ مختلف فيه (البقرة ١١٤ «إلا خائفين» يعدّها البصري)، فكشفها التحقّق.',
    }],
    nativeCountSystem: 'BASRI_YAQUB_RUWAYS_TAYSEER',
    artifactFileName: 'QiraahRuways.tayseer-basri-jahdari.json.deflate',
    artifactSha256: '5fd47765ab7e47a9e08f25a4591fbd90c73ef256044007001a689fef8c6c4155',
    verseCount: 6205,
  },
];


export const TAYSEER_RESEGMENTATION_BY_RAWI = new Map(TAYSEER_RESEGMENTATIONS.map(r => [r.rawiId, r] as const));

export function tayseerResegmentationFor(rawiId: string): TayseerResegmentation | undefined {
  return TAYSEER_RESEGMENTATION_BY_RAWI.get(rawiId);
}
