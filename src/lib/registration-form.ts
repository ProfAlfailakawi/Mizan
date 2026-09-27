/*
 * محرّك نموذج التسجيل — مشتركٌ بين المتصفّح والخادم، فالحقل الذي يظهر للمتسابق هو الحقل
 * الذي يتحقّق منه الخادم، بالقاعدة نفسها لا بنسخةٍ منها.
 *
 * - أنواع الحقول: نصّ قصير وطويل، رقم، تاريخ، بريد، هاتف، اختيار وتعدّد اختيار، دولة، مرفق،
 *   مربّع اختيار، موافقة، وقسم إرشادي (لا إجابة له).
 * - الشروط تصريحية (`visibleWhen` / `requiredWhen`): «إن كان العمر < 12 أظهر حقول وليّ الأمر»،
 *   «إن كانت الدولة X أظهر رقم الهوية المحلي»، «إن كانت المشاركة عن بُعد أخفِ حقول الوصول».
 * - ما يُخفيه شرطٌ لا يُحفظ جوابه: الخادم يُسقط إجابات الحقول المخفية قبل الكتابة، فلا
 *   تتسرّب بياناتٌ طُلبت في فرعٍ لم يسلكه المتسابق.
 *
 * وحدة نقيّة: لا شبكة ولا حالة.
 */
import type { RegistrationFieldCondition, RegistrationFieldDefinition } from '../types';
import { isPlausibleEmail } from '../../shared/email-shape';

export type AnswerValue = string | number | boolean | string[] | undefined;
export type Answers = Record<string, AnswerValue>;

export interface FieldError { fieldId: string; code: 'REQUIRED' | 'TOO_SHORT' | 'TOO_LONG' | 'NOT_A_NUMBER' | 'OUT_OF_RANGE' | 'PATTERN' | 'INVALID_OPTION' | 'INVALID_EMAIL' | 'INVALID_PHONE' | 'INVALID_DATE' | 'CONSENT_REQUIRED' }

/** Core participant fields. Everything else is a custom field stored in `customAnswers`. */
export const CORE_FIELD_IDS = ['fullNameArabic', 'fullName', 'email', 'phone', 'country', 'nationality', 'dateOfBirth', 'gender', 'identity'] as const;

export function ageOn(dob: unknown, now: Date): number | undefined {
  const d = new Date(`${String(dob || '')}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d > now) return undefined;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  if (now.getUTCMonth() < d.getUTCMonth() || (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

const isEmpty = (v: AnswerValue) => v === undefined || v === null || v === '' || v === false || (Array.isArray(v) && v.length === 0);

export function conditionHolds(c: RegistrationFieldCondition, answers: Answers, now: Date): boolean {
  const actual: AnswerValue = c.field === 'age' ? ageOn(answers.dateOfBirth, now) : answers[c.field];
  const expected = c.value;
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v));
  switch (c.operator) {
    case 'eq': return String(actual ?? '') === String(expected ?? '');
    case 'neq': return String(actual ?? '') !== String(expected ?? '');
    case 'lt': return !isEmpty(actual) && num(actual) < num(expected);
    case 'lte': return !isEmpty(actual) && num(actual) <= num(expected);
    case 'gt': return !isEmpty(actual) && num(actual) > num(expected);
    case 'gte': return !isEmpty(actual) && num(actual) >= num(expected);
    case 'in': return Array.isArray(expected) && expected.map(String).includes(String(actual ?? ''));
    case 'not_in': return Array.isArray(expected) && !expected.map(String).includes(String(actual ?? ''));
    case 'exists': return !isEmpty(actual);
    case 'not_exists': return isEmpty(actual);
    case 'contains': return Array.isArray(actual) ? actual.map(String).includes(String(expected)) : String(actual ?? '').includes(String(expected ?? ''));
    default: return false;
  }
}

const allHold = (conds: RegistrationFieldCondition[] | undefined, answers: Answers, now: Date) => !conds?.length || conds.every(c => conditionHolds(c, answers, now));

export function isFieldVisible(field: RegistrationFieldDefinition, answers: Answers, now: Date) {
  return field.visible && allHold(field.visibleWhen, answers, now);
}

export function isFieldRequired(field: RegistrationFieldDefinition, answers: Answers, now: Date) {
  if (!isFieldVisible(field, answers, now) || field.type === 'section') return false;
  return field.required || (!!field.requiredWhen?.length && allHold(field.requiredWhen, answers, now));
}

export function visibleFields(fields: readonly RegistrationFieldDefinition[], answers: Answers, now: Date) {
  return fields.filter(f => isFieldVisible(f, answers, now));
}

function safePattern(pattern: string | undefined) {
  if (!pattern || pattern.length > 200) return undefined;
  try { return new RegExp(`^(?:${pattern})$`, 'u'); } catch { return undefined; }
}

/** Validate one visible field's answer. */
export function validateField(field: RegistrationFieldDefinition, value: AnswerValue, required: boolean): FieldError['code'] | undefined {
  if (field.type === 'section') return undefined;
  if (isEmpty(value)) return required ? (field.type === 'consent' ? 'CONSENT_REQUIRED' : 'REQUIRED') : undefined;
  const text = Array.isArray(value) ? '' : String(value);
  switch (field.type) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(text);
      if (!Number.isFinite(n)) return 'NOT_A_NUMBER';
      if ((field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) return 'OUT_OF_RANGE';
      return undefined;
    }
    case 'email': return isPlausibleEmail(text) ? undefined : 'INVALID_EMAIL';
    case 'phone': return /^\+?[0-9٠-٩۰-۹ -]{7,24}$/.test(text) ? undefined : 'INVALID_PHONE';
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(`${text}T00:00:00Z`)) ? undefined : 'INVALID_DATE';
    case 'select': return field.options?.length && !field.options.some(o => o.value === text) ? 'INVALID_OPTION' : undefined;
    case 'multi_select': {
      if (!Array.isArray(value)) return 'INVALID_OPTION';
      return field.options?.length && value.some(v => !field.options!.some(o => o.value === v)) ? 'INVALID_OPTION' : undefined;
    }
    case 'checkbox': case 'consent': return typeof value === 'boolean' ? undefined : 'INVALID_OPTION';
    case 'country': return /^[A-Za-z]{2}$/.test(text) || text.length <= 100 ? undefined : 'INVALID_OPTION';
    default: {
      if (field.minLength !== undefined && text.length < field.minLength) return 'TOO_SHORT';
      if (text.length > (field.maxLength ?? (field.type === 'long_text' ? 4000 : 300))) return 'TOO_LONG';
      const re = safePattern(field.pattern);
      if (re && !re.test(text)) return 'PATTERN';
      return undefined;
    }
  }
}

/** Validate every visible field; hidden fields are never required. */
export function validateAnswers(fields: readonly RegistrationFieldDefinition[], answers: Answers, now: Date): FieldError[] {
  const errors: FieldError[] = [];
  for (const f of fields) {
    if (!isFieldVisible(f, answers, now)) continue;
    const code = validateField(f, answers[f.id], isFieldRequired(f, answers, now));
    if (code) errors.push({ fieldId: f.id, code });
  }
  return errors;
}

const cleanValue = (v: unknown): AnswerValue => {
  if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return v;
  if (Array.isArray(v)) return v.slice(0, 50).map(x => String(x).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 200));
  if (v === undefined || v === null) return undefined;
  return String(v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 4000);
};

/**
 * Custom answers to persist: only custom fields, only when visible under the submitted answers,
 * sanitised. Hidden-branch answers and unknown keys are dropped.
 */
export function persistableCustomAnswers(fields: readonly RegistrationFieldDefinition[], answers: Answers, now: Date): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const f of fields) {
    if (!f.custom || f.type === 'section' || !isFieldVisible(f, answers, now)) continue;
    const v = cleanValue(answers[f.id]);
    if (!isEmpty(v)) out[f.id] = v;
  }
  return out;
}

/** Structural checks for the builder: ids unique, conditions reference known fields, no self-reference. */
export function validateFormSchema(fields: readonly RegistrationFieldDefinition[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const f of fields) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,59}$/.test(f.id)) problems.push(`FIELD_ID_INVALID:${f.id}`);
    if (ids.has(f.id)) problems.push(`FIELD_ID_DUPLICATE:${f.id}`);
    ids.add(f.id);
    if ((f.type === 'select' || f.type === 'multi_select') && !f.options?.length) problems.push(`FIELD_OPTIONS_REQUIRED:${f.id}`);
    if (f.pattern && !safePattern(f.pattern)) problems.push(`FIELD_PATTERN_INVALID:${f.id}`);
  }
  for (const f of fields) for (const c of [...(f.visibleWhen || []), ...(f.requiredWhen || [])]) {
    if (c.field === f.id) problems.push(`CONDITION_SELF_REFERENCE:${f.id}`);
    else if (c.field !== 'age' && !ids.has(c.field)) problems.push(`CONDITION_UNKNOWN_FIELD:${f.id}->${c.field}`);
  }
  return problems;
}
