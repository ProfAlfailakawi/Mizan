/**
 * Arabic count + noun agreement (display only).
 *
 * Arabic has six plural categories and the counted noun changes with them:
 * «بند واحد»، «بندان»، «٣ بنود»، «١١ بندًا»، «١٠٠ بند». Concatenating `${n} ${plural}`
 * is wrong for every n except the few-range, so UI strings pick their form here through
 * `Intl.PluralRules('ar')`. Forms may use `{n}` where the number belongs.
 */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

let rules: Intl.PluralRules | null = null;
function arRules(): Intl.PluralRules | null {
  if (rules) return rules;
  try { rules = new Intl.PluralRules('ar'); } catch { rules = null; }
  return rules;
}

/** Fallback with the same boundaries CLDR uses for Arabic (used only if Intl lacks 'ar'). */
function fallbackCategory(n: number): Intl.LDMLPluralRule {
  if (n === 0) return 'zero';
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  const m = n % 100;
  if (Number.isInteger(n) && m >= 3 && m <= 10) return 'few';
  if (Number.isInteger(n) && m >= 11 && m <= 99) return 'many';
  return 'other';
}

/** `oblique`: after a preposition the dual takes -ين / -تين («بين متسابقين»). */
export function arPlural(n: number, forms: PluralForms, oblique = false): string {
  const count = Math.abs(Number.isFinite(n) ? n : 0);
  const r = arRules();
  const cat = r ? r.select(count) : fallbackCategory(count);
  let form = forms[cat] ?? forms.other;
  if (oblique && cat === 'two') form = form.replace(/ان(?=\s|$)/g, 'ين');
  return form.replace(/\{n\}/g, String(n));
}

/**
 * Counted nouns used across the UI. `{n}` marks where the number goes.
 * Rule: a form WITHOUT `{n}` is used beside a separately shown digit, so for two it is the
 * plural («2 مسابقات»), never the dual («2 مسابقتان»). Forms WITH `{n}` carry the number
 * themselves, and for two they use the dual alone without the digit («مسابقتان»).
 */
export const AR_NOUNS = {
  day: { one: 'منذ يوم', two: 'منذ يومين', few: 'منذ {n} أيام', many: 'منذ {n} يومًا', other: 'منذ {n} يوم' },
  minuteAgo: { one: 'منذ دقيقة', two: 'منذ دقيقتين', few: 'منذ {n} دقائق', many: 'منذ {n} دقيقة', other: 'منذ {n} دقيقة' },
  hourAgo: { one: 'منذ ساعة', two: 'منذ ساعتين', few: 'منذ {n} ساعات', many: 'منذ {n} ساعة', other: 'منذ {n} ساعة' },
  openItem: { one: 'بند مفتوح', two: 'بنود مفتوحة', few: 'بنود مفتوحة', many: 'بندًا مفتوحًا', other: 'بند مفتوح' },
  moreItems: { one: 'وبند آخر', two: 'وبندان آخران', few: 'و{n} بنود أخرى', many: 'و{n} بندًا آخر', other: 'و{n} بند آخر' },
  escalatedIssue: { one: 'قضية مصعّدة واحدة', two: 'قضيتان مصعّدتان', few: '{n} قضايا مصعّدة', many: '{n} قضية مصعّدة', other: '{n} قضية مصعّدة' },
  competition: { one: 'مسابقة', two: 'مسابقات', few: 'مسابقات', many: 'مسابقة', other: 'مسابقة' },
  liveCompetition: { one: 'مسابقة جارية', two: 'مسابقات جارية', few: 'مسابقات جارية', many: 'مسابقة جارية', other: 'مسابقة جارية' },
  committee: { one: 'لجنة واحدة', two: 'لجنتان', few: '{n} لجان', many: '{n} لجنة', other: '{n} لجنة' },
  judge: { one: 'محكّم واحد', two: 'محكّمان', few: '{n} محكّمين', many: '{n} محكّمًا', other: '{n} محكّم' },
  participant: { one: 'متسابق واحد', two: 'متسابقان', few: '{n} متسابقين', many: '{n} متسابقًا', other: '{n} متسابق' },
  alert: { one: 'تنبيه واحد', two: 'تنبيهان', few: '{n} تنبيهات', many: '{n} تنبيهًا', other: '{n} تنبيه' },
  session: { one: 'جلسة واحدة', two: 'جلستان', few: '{n} جلسات', many: '{n} جلسة', other: '{n} جلسة' },
  result: { one: 'نتيجة واحدة', two: 'نتيجتان', few: '{n} نتائج', many: '{n} نتيجة', other: '{n} نتيجة' },
  minute: { one: 'دقيقة واحدة', two: 'دقيقتان', few: '{n} دقائق', many: '{n} دقيقة', other: '{n} دقيقة' },
  category: { one: 'فئة واحدة', two: 'فئتان', few: '{n} فئات', many: '{n} فئة', other: '{n} فئة' },
  question: { one: 'سؤال واحد', two: 'سؤالان', few: '{n} أسئلة', many: '{n} سؤالًا', other: '{n} سؤال' },
  pageN: { one: 'صفحة واحدة', two: 'صفحتان', few: '{n} صفحات', many: '{n} صفحة', other: '{n} صفحة' },
  request: { one: 'طلب واحد', two: 'طلبان', few: '{n} طلبات', many: '{n} طلبًا', other: '{n} طلب' },
  caseN: { one: 'حالة واحدة', two: 'حالتان', few: '{n} حالات', many: '{n} حالة', other: '{n} حالة' },
  device: { one: 'جهاز واحد', two: 'جهازان', few: '{n} أجهزة', many: '{n} جهازًا', other: '{n} جهاز' },
  note: { one: 'ملاحظة واحدة', two: 'ملاحظتان', few: '{n} ملاحظات', many: '{n} ملاحظة', other: '{n} ملاحظة' },
  dayN: { one: 'يوم واحد', two: 'يومان', few: '{n} أيام', many: '{n} يومًا', other: '{n} يوم' },
  hourN: { one: 'ساعة واحدة', two: 'ساعتان', few: '{n} ساعات', many: '{n} ساعة', other: '{n} ساعة' },
  event: { one: 'حدث واحد', two: 'حدثان', few: '{n} أحداث', many: '{n} حدثًا', other: '{n} حدث' },
  attendee: { one: 'مشارك واحد', two: 'مشاركان', few: '{n} مشاركين', many: '{n} مشاركًا', other: '{n} مشارك' },
  itemN: { one: 'بند واحد', two: 'بندان', few: '{n} بنود', many: '{n} بندًا', other: '{n} بند' },
} satisfies Record<string, PluralForms>;
