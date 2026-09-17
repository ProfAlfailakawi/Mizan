/*
 * الرواة الذين نملك حزمة نصّهم — المصدر الواحد.
 *
 * كان هذا الجدول مكتوبًا ثلاث مرات: في بنك المواضع، وفي سطح المصحف، وفي الجاهزية. وكل
 * نسخةٍ تعرف رواةً غير ما تعرفه أختها بعد أول إضافة — فوصلُ البزي وقنبل في التسليم ترك
 * الجاهزية تعلن «لا مصدر قرآني» لفئةٍ تعمل، وترك سطحَ المصحف بلا نصٍّ لموضعٍ سُحب.
 *
 * وهو هنا وحدة طرفية بلا استيراد قصدًا: الجاهزية تستورد بنك المواضع وبنك المواضع يستورد
 * الجاهزية، فوضعُ الجدول في أيّهما يصنع حلقةً تُفرغ المجموعة عند الإقلاع بحسب ترتيب
 * التحميل — وهو عطلٌ صامت لا يظهر إلا في الإنتاج.
 *
 * ولهذا تُكتب مفاتيح الاثنتي عشرة هنا نصًّا لا استيرادًا من سجلّ المصادر: يبقى الملف
 * طرفيًّا، ويحرس اختبارُ الانحراف تطابقَه مع السجلّ حرفًا بحرف فلا يفترقان.
 */

/**
 * الرواة الذين تُجلب حزمُهم من طبقة تسليم مجمع الملك فهد (R2 أو المرآة المفتوحة).
 * `rawiId` القانوني ← مفتاح حزمة التسليم.
 */
export const KFGQPC_DELIVERY_READING_BY_RAWI: Record<string, string> = {
  hafs: 'hafs',
  warsh: 'warsh',
  shubah: 'shubah',
  qalun: 'qalun',
  'al-duri-abu-amr': 'duri-abi-amr',
  'al-susi': 'susi-abi-amr',
  'al-bazzi': 'bazzi',
  qunbul: 'qunbul',
};

/**
 * الرواة الذين نصُّهم أثرٌ مثبَّت داخل المستودع (مشتقٌّ من مصاحف إسلام ويب، ببصمةٍ وقرار
 * لجنةٍ مربوطٍ بها). لا يُجلب من شبكة وقت التشغيل، فلا يُعطِّله انقطاعُ موقعٍ خارجي.
 */
export const PINNED_DELIVERY_READING_BY_RAWI: Record<string, string> = {
  hisham: 'hisham',
  'ibn-dhakwan': 'ibn-dhakwan',
  'khalaf-hamzah': 'khalaf-hamzah',
  khallad: 'khallad',
  'abu-al-harith': 'abu-al-harith',
  'al-duri-kisai': 'duri-al-kisai',
  'ibn-wardan': 'ibn-wardan',
  'ibn-jammaz': 'ibn-jammaz',
  ruways: 'ruways',
  rawh: 'rawh',
  ishaq: 'ishaq',
  idris: 'idris',
};

/** الجدول الذي تقرأه كل الطبقات: العشرون بمصدرَيهما، بلا تمييزٍ عند نقطة الاستعمال. */
export const DELIVERY_READING_BY_RAWI: Record<string, string> = {
  ...KFGQPC_DELIVERY_READING_BY_RAWI,
  ...PINNED_DELIVERY_READING_BY_RAWI,
};

/** الرواة الذين نملك لهم حزمة تسليم فعلًا — تقرأها شاشات الإعداد والجاهزية معًا. */
export const DELIVERED_RAWI_IDS: readonly string[] = Object.keys(DELIVERY_READING_BY_RAWI);

/** الثمانية المُسلَّمة من طبقة المجمع — يُفصلون حين يهمّ الإسنادُ لا التوفّر. */
export const KFGQPC_DELIVERED_RAWI_IDS: readonly string[] = Object.keys(KFGQPC_DELIVERY_READING_BY_RAWI);

/** الاثنتا عشرة ذات الأثر المثبَّت — يُفصلن للسبب نفسه. */
export const PINNED_DELIVERED_RAWI_IDS: readonly string[] = Object.keys(PINNED_DELIVERY_READING_BY_RAWI);
