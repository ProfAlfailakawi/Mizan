/*
 * حقولٌ جاهزة لنموذج التسجيل — تُضاف بنقرة بدل أن تُبنى حقلًا حقلًا.
 *
 * «اليوم المفضّل»: المسابقة متعدّدة الأيام تحتاج أن يقول المتسابق أيَّ يومٍ يناسبه، وكانت
 * الجهة تُنشئه يدويًّا: حقلُ اختيارٍ وخياراتٌ تكتبها بيدها وتخطئ في تاريخٍ منها. والحقل هنا
 * يُبنى من أيام المسابقة نفسها، فلا يُعرض يومٌ خارجها. وهو **طلبٌ** لا حجز: الإسنادُ النهائي
 * لمحرّك التوزيع على اللجان كما كان، يقرأ الطلبَ ولا يُلزَم به — فلا تُنقض سعةُ لجنةٍ
 * لأن عشرين متسابقًا اختاروا الخميس.
 */

import type { RegistrationFieldDefinition } from '../types';

export const PREFERRED_DAY_FIELD_ID = 'custom_preferred_day';
export const PREFERRED_DAY_MAX_DAYS = 14;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const parseDay = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) || isoDay(d) !== `${m[1]}-${m[2]}-${m[3]}` ? null : d;
};

const label = (d: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);

/**
 * حقل «اليوم المفضّل» من أيام المسابقة، أو `null` إن تعذّر (تاريخٌ ناقص، أو نهايةٌ قبل
 * البداية، أو يومٌ واحدٌ فقط — لا اختيارَ فيه — أو أكثر من أربعة عشر يومًا).
 */
export function preferredDayField(startDate: string, endDate: string): RegistrationFieldDefinition | null {
  const start = parseDay(startDate), end = parseDay(endDate);
  if (!start || !end || end < start) return null;
  const days: Date[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) {
    days.push(d);
    if (days.length > PREFERRED_DAY_MAX_DAYS) return null;
  }
  if (days.length < 2) return null;
  return {
    id: PREFERRED_DAY_FIELD_ID,
    labelArabic: 'اليوم المفضّل للاختبار',
    labelEnglish: 'Preferred test day',
    type: 'select',
    required: false,
    visible: true,
    custom: true,
    helpArabic: 'طلبٌ لا حجز: تُراعيه الجهة ما أمكن، والتأكيد النهائي يصلك بالموعد.',
    helpEnglish: 'A request, not a booking: the organizer honours it where capacity allows and confirms your final slot.',
    options: days.map(d => ({ value: isoDay(d), labelArabic: label(d, 'ar'), labelEnglish: label(d, 'en') })),
  };
}
