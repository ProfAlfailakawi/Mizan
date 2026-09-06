/**
 * MIZAN — اشتقاق أحكام التجويد من نص المجمع مباشرة
 *
 * لماذا الاشتقاق لا الاستيراد:
 * حزم التجويد المفتوحة تصف كل حكم بإزاحة حرفية محسوبة على نسخة نصية أخرى. وبالفحص على نص
 * المجمع تبيّن أن نحو نصف الآيات فقط تقع إزاحاتها في موضعها، وتنزلق في الباقي — ولو عُرض ذلك
 * لظهر التلوين على حرف ليس محلّ الحكم. وتلوين حرف خاطئ في المصحف غير مقبول ولو مرة واحدة،
 * كما أن تلوين النصف وإسكات النصف يوهم الحَكَم أن ما لم يُلوَّن لا حكم فيه.
 *
 * لذلك تُشتق الأحكام هنا من النص المعتمد نفسه بقواعد قطعية معلومة، فيكون كل ما يُعرض محسوبًا من
 * الحرف الذي أمام القارئ، لا منقولًا عن نص آخر. والاشتقاق حتمي: النص نفسه يعطي النتيجة نفسها.
 *
 * النطاق مقصود ومحدود: تُشتق الأحكام التي تُحسم بالرسم وحده (النون الساكنة والتنوين، الميم
 * الساكنة، القلقلة، همزة الوصل، اللام الشمسية والقمرية، الغنة المشددة). أما ما يتوقف على
 * الأداء أو الخلاف بين الطرق — كمقادير المدود ودرجات التفخيم — فلا يُشتق هنا ولا يُدّعى.
 *
 * طبقة عرض وتعليم: لا ترصد خطأً، ولا تدخل في درجة، ولا تُغني عن المحكّم.
 */

export type TajweedRule =
  | 'hamzat_wasl' | 'lam_shamsiyyah' | 'lam_qamariyyah'
  | 'ghunnah' | 'qalqalah'
  | 'izhar' | 'ikhfa' | 'iqlab' | 'idghaam_ghunnah' | 'idghaam_no_ghunnah'
  | 'ikhfa_shafawi' | 'idghaam_shafawi' | 'izhar_shafawi';

export interface TajweedSpan { rule: TajweedRule; start: number; end: number }

/* حروف الضبط. نص المجمع يستعمل السكون العثماني (U+06E1) كما يستعمل السكون المعتاد (U+0652). */
const SUKUN = 'ْۡ';
const SHADDA = 'ّ';
/*
 * التنوين في رسم المجمع يُكتب بصورتين: المتراكبة المعتادة (ً ٌ ٍ) حين يُظهَر، والمتراصفة
 * (ٞ ٗ ٖ) حين يُخفى أو يُدغَم أو يُقلَب. وقد تحقّقنا من ذلك على النص كله: المتراصفة لا تقع إلا
 * قبل حروف الإخفاء والإدغام، ولا تقع قبل حرف حلقي ولا مرة واحدة — وهو ما يطابق القاعدة تمامًا.
 */
const TANWEEN = 'ًٌٍٖٞٗ';
/* مقاعد المدّ الصامتة: التنوين يُرسم قبلها والحكم يقع على أول حرف بعدها. */
const SILENT_SEATS = 'اىٰوي';
/*
 * علامات الضبط كاملةً كما يستعملها المصحف: الحركات والتنوين بصورتيه (064B–065F)، والألف الخنجرية
 * (0670)، والتطويل (0640)، وعلامات الوقف والرموز المصحفية (06D6–06ED). حصر النطاق في الحركات
 * وحدها كان يوقف الفحص عند أول تنوين متراصف فلا يُرى أصلًا.
 */
const DIACRITIC = /[ً-ٰٟـۖ-ۭ]/;

const SUN_LETTERS = 'تثدذرزسشصضطظلن';
const IKHFA_LETTERS = 'تثجدذزسشصضطظفقك';
const IDGHAAM_GHUNNAH = 'ينمو';
const IDGHAAM_NO_GHUNNAH = 'لر';
const IZHAR_LETTERS = 'ءأإآهعحغخ';
const QALQALAH_LETTERS = 'قطبجد';

const isDiacritic = (ch: string) => DIACRITIC.test(ch);

/**
 * موضع أول حرف أصلي (غير ضبط ولا مسافة) بعد الفهرس المعطى.
 *
 * `skipSeats` لحكم التنوين: يُرسم التنوين على الحرف ثم يليه مقعد مدّ صامت (ألف أو ألف مقصورة)،
 * والحكم إنما يتعلق بأول حرف بعد ذلك المقعد — كما في «هُدٗى لِّلۡمُتَّقِينَ»، فاللام هي محل الحكم
 * لا الألف المقصورة.
 */
function nextLetter(text: string, from: number, skipSeats = false): { index: number; char: string } | null {
  let seen = false;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === ' ' || isDiacritic(c)) continue;
    if (/[ء-ي]/.test(c)) {
      // مقعد صامت مباشرة بعد التنوين: يُتخطّى مرة واحدة فقط، ولا يُتخطّى حرف محرَّك أبدًا.
      if (skipSeats && !seen && SILENT_SEATS.includes(c) && !marksOf(text, i).vowel) { seen = true; continue; }
      return { index: i, char: c };
    }
    return null; // رقم الآية أو رمز مصحفي: انتهى موضع الحكم
  }
  return null;
}

/** هل الحرف عند الفهرس متبوع بعلامة من المجموعة المعطاة (قبل أي حرف أصلي آخر)؟ */
function markAfter(text: string, index: number, marks: string): boolean {
  for (let i = index + 1; i < text.length; i++) {
    const c = text[i];
    if (marks.includes(c)) return true;
    if (!isDiacritic(c)) return false;
  }
  return false;
}

/**
 * علامات الضبط الملاصقة لحرف بعينه.
 *
 * الرسم العثماني لا يضع سكونًا على كل حرف ساكن: فالنون المُظهَرة تُرسم بالسكون، والمُقلَبة بميم
 * صغيرة فوقها، أما المُخفاة والمُدغَمة فتُترك عارية بلا علامة أصلًا. لذلك لا يصح اشتراط السكون
 * لمعرفة السكون؛ العلامة الفارقة هي **غياب الحركة**.
 */
function marksOf(text: string, index: number) {
  let vowel = false, shadda = false, sukun = false, iqlabMark = false, tanween = false;
  for (let i = index + 1; i < text.length; i++) {
    const c = text[i];
    if (!isDiacritic(c)) break;
    if ('َُِ'.includes(c)) vowel = true;
    else if (c === SHADDA) shadda = true;
    else if (SUKUN.includes(c)) sukun = true;
    else if (c === 'ۢ') iqlabMark = true;      // ميم صغيرة: علامة الإقلاب في المصحف
    else if (TANWEEN.includes(c)) tanween = true;
  }
  return { vowel, shadda, sukun, iqlabMark, tanween };
}

/**
 * اشتقاق أحكام آية واحدة على فهارس نصها الأصلي، فيقع التلوين على الحرف نفسه بلا إزاحة.
 */
export function deriveAyahTajweed(text: string): TajweedSpan[] {
  const spans: TajweedSpan[] = [];
  const push = (rule: TajweedRule, start: number, end: number) => { if (end > start) spans.push({ rule, start, end }); };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!/[ء-يٱ]/.test(ch)) continue;

    // همزة الوصل: تُرسم في المصحف بحرفها الخاص، فلا اجتهاد فيها.
    if (ch === 'ٱ') {
      push('hamzat_wasl', i, i + 1);
      // اللام بعدها: شمسية إن أُدغمت في حرف شمسي مشدد، وقمرية إن ظهرت.
      const lam = nextLetter(text, i + 1);
      if (lam && lam.char === 'ل') {
        const after = nextLetter(text, lam.index + 1);
        if (after && SUN_LETTERS.includes(after.char) && markAfter(text, after.index, SHADDA)) push('lam_shamsiyyah', lam.index, lam.index + 1);
        else if (after) push('lam_qamariyyah', lam.index, lam.index + 1);
      }
      continue;
    }

    const m = marksOf(text, i);

    // الغنة: نون أو ميم مشددة.
    if ((ch === 'ن' || ch === 'م') && m.shadda) { push('ghunnah', i, i + 1); continue; }

    // النون الساكنة والتنوين. الساكنة هنا: نون بلا حركة ولا شدة — سواء رُسم سكونها أو تُركت عارية.
    const isNoonSakin = ch === 'ن' && !m.vowel && !m.shadda;
    if (isNoonSakin || m.tanween) {
      const next = nextLetter(text, i + 1, m.tanween);
      if (next) {
        const c = next.char;
        if (m.iqlabMark || c === 'ب') push('iqlab', i, i + 1);
        else if (IKHFA_LETTERS.includes(c)) push('ikhfa', i, i + 1);
        else if (IDGHAAM_GHUNNAH.includes(c)) push('idghaam_ghunnah', i, i + 1);
        else if (IDGHAAM_NO_GHUNNAH.includes(c)) push('idghaam_no_ghunnah', i, i + 1);
        else if (IZHAR_LETTERS.includes(c)) push('izhar', i, i + 1);
      }
      continue;
    }

    // الميم الساكنة.
    if (ch === 'م' && !m.vowel && !m.shadda) {
      const next = nextLetter(text, i + 1);
      if (next) {
        if (next.char === 'ب') push('ikhfa_shafawi', i, i + 1);
        else if (next.char === 'م') push('idghaam_shafawi', i, i + 1);
        else push('izhar_shafawi', i, i + 1);
      }
      continue;
    }

    // القلقلة: حرف من «قطب جد» ساكن. هنا يُشترط السكون المرسوم، لأن قلقلة الوقف تتوقف على موضع
    // وقوف القارئ لا على الرسم وحده، فلا تُدّعى.
    if (QALQALAH_LETTERS.includes(ch) && m.sukun) { push('qalqalah', i, i + 1); continue; }
  }

  return spans.sort((a, b) => a.start - b.start);
}

/** التسميات العربية المعتمدة للعرض. */
export const TAJWEED_LABELS_AR: Record<TajweedRule, string> = {
  hamzat_wasl: 'همزة وصل', lam_shamsiyyah: 'لام شمسية', lam_qamariyyah: 'لام قمرية',
  ghunnah: 'غنة', qalqalah: 'قلقلة',
  izhar: 'إظهار', ikhfa: 'إخفاء', iqlab: 'إقلاب',
  idghaam_ghunnah: 'إدغام بغنة', idghaam_no_ghunnah: 'إدغام بغير غنة',
  ikhfa_shafawi: 'إخفاء شفوي', idghaam_shafawi: 'إدغام شفوي', izhar_shafawi: 'إظهار شفوي',
};

export const TAJWEED_SCOPE_NOTE =
  'أحكام مشتقّة حتميًا من رسم المصحف المعتمد لهذه الرواية. تقتصر على ما يُحسم بالرسم؛ ولا تشمل مقادير المدود ولا درجات التفخيم لأنها تتعلق بالأداء. طبقة تعليم وعرض لا ترصد خطأً ولا تؤثر في الدرجة.';
