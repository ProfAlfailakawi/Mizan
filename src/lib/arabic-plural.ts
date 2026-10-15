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

export function arPlural(n: number, forms: PluralForms): string {
  const count = Math.abs(Number.isFinite(n) ? n : 0);
  const r = arRules();
  const cat = r ? r.select(count) : fallbackCategory(count);
  const form = forms[cat] ?? forms.other;
  return form.replace(/\{n\}/g, String(n));
}

/** Counted nouns used across the UI. `{n}` marks where the number goes. */
export const AR_NOUNS = {
  day: { one: 'منذ يوم', two: 'منذ يومين', few: 'منذ {n} أيام', many: 'منذ {n} يومًا', other: 'منذ {n} يوم' },
  minuteAgo: { one: 'منذ دقيقة', two: 'منذ دقيقتين', few: 'منذ {n} دقائق', many: 'منذ {n} دقيقة', other: 'منذ {n} دقيقة' },
  hourAgo: { one: 'منذ ساعة', two: 'منذ ساعتين', few: 'منذ {n} ساعات', many: 'منذ {n} ساعة', other: 'منذ {n} ساعة' },
  moreItems: { one: 'وبند آخر', two: 'وبندان آخران', few: 'و{n} بنود أخرى', many: 'و{n} بندًا آخر', other: 'و{n} بند آخر' },
  escalatedIssue: { one: 'قضية مصعّدة واحدة', two: 'قضيتان مصعّدتان', few: '{n} قضايا مصعّدة', many: '{n} قضية مصعّدة', other: '{n} قضية مصعّدة' },
  competition: { one: 'مسابقة', two: 'مسابقتان', few: 'مسابقات', many: 'مسابقة', other: 'مسابقة' },
  liveCompetition: { one: 'مسابقة جارية', two: 'مسابقتان جاريتان', few: 'مسابقات جارية', many: 'مسابقة جارية', other: 'مسابقة جارية' },
  committee: { one: 'لجنة واحدة', two: 'لجنتان', few: '{n} لجان', many: '{n} لجنة', other: '{n} لجنة' },
  judge: { one: 'محكّم واحد', two: 'محكّمان', few: '{n} محكّمين', many: '{n} محكّمًا', other: '{n} محكّم' },
  participant: { one: 'متسابق واحد', two: 'متسابقان', few: '{n} متسابقين', many: '{n} متسابقًا', other: '{n} متسابق' },
  alert: { one: 'تنبيه واحد', two: 'تنبيهان', few: '{n} تنبيهات', many: '{n} تنبيهًا', other: '{n} تنبيه' },
} satisfies Record<string, PluralForms>;
