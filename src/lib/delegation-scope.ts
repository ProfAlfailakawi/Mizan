import type { Category, User } from '../types';

/*
 * نطاق الوفد — مصدرٌ واحد للبيئتين.
 *
 * كانت بوابة «وفدي» تثبّت `delegation-current` حرفيًا، فتعمل في البيئة التجريبية وحدها
 * (حيث البذور تحمل هذا المعرّف) وتبقى فارغة لكل حساب مدير وفد حقيقي. الآن النطاق يُشتقّ
 * من الحساب نفسه: كل مدير وفد يملك وفده، والبيئة التجريبية تختلف في البيانات لا في الشيفرة.
 */
export const delegationScopeFor = (user: Pick<User, 'id' | 'delegationId'>): string =>
  user.delegationId || `delegation-${user.id}`;

/** الروايات المسموح بها لفئة — نفس قاعدة استمارة التسجيل الفردي. */
export const allowedReadingsFor = (category?: Category): string[] =>
  Array.from(new Set([String(category?.riwaya || '').trim(), ...((category?.allowedRiwayat || []).map(x => String(x || '').trim()))].filter(Boolean)));
