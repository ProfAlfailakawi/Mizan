/*
 * تنسيق العرض: أرقام لاتينية (123) دائمًا، بلا رموز فترة مشوّهة، في الواجهة العربية والإنجليزية.
 *
 * هذه الدوال للعرض فقط. لا تُستعمل لتخزين قيمة ولا لفرز ولا لتحليل نص، ولا تلمس نص القرآن.
 * (`ar-KW` وحدها تُخرج أرقامًا هندية ٠١٢٣ وموضع «م/ص» يقفز في النص ثنائي الاتجاه، و
 *  `toLocaleString()` بلا وسيط يتبع لغة المتصفح فتظهر الأرقام الهندية عند من يضبط العربية.)
 */
const toDate = (value: string | number | Date | undefined | null): Date | null => {
  if (value === undefined || value === null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** تاريخ ووقت بأرقام لاتينية وترتيب ثابت: «2026/10/01 16:17» (لا يتبع لغة المتصفح ولا يقفز في النص ثنائي الاتجاه). */
export function displayDateTime(value: string | number | Date | undefined | null, _ar: boolean = true, fallback = '—'): string {
  const d = toDate(value);
  return d ? `\u2066${ymd(d)} ${hm(d)}\u2069` : fallback;
}

/** التاريخ والوقت للقوائم: بالعربية «2026/10/01 16:17» في وحدة واحدة لا تتبعثر؛ وبالإنجليزية «1 Oct 2026 16:17». */
export function displayDateTimeMedium(value: string | number | Date | undefined | null, ar: boolean, fallback = '—'): string {
  const d = toDate(value);
  if (!d) return fallback;
  if (ar) return displayDateTime(d, true, fallback);
  return `${new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(d)} ${hm(d)}`;
}

/** وقت بصيغة 24 ساعة بأرقام لاتينية: «16:17». */
export function displayTime(value: string | number | Date | undefined | null, _ar: boolean = true, fallback = '—'): string {
  const d = toDate(value);
  return d ? `\u2066${hm(d)}\u2069` : fallback;
}

/** تاريخ فقط بأرقام لاتينية: «2026/10/01». */
export function displayDate(value: string | number | Date | undefined | null, _ar: boolean = true, fallback = '—'): string {
  const d = toDate(value);
  return d ? `\u2066${ymd(d)}\u2069` : fallback;
}

/** عدد بأرقام لاتينية وفواصل آلاف. */
export function displayNumber(n: number, ar: boolean = true, options?: Intl.NumberFormatOptions): string {
  return Number(n || 0).toLocaleString(ar ? 'ar-KW-u-nu-latn' : 'en-US', options);
}
