/*
 * تدقيق كشف المتسابقين قبل إدخاله — لا بعد أن يقف أحدهم أمام اللجنة.
 *
 * الاستيراد الجماعي هو الباب الذي تدخل منه المسابقة كلّها: خمسمئة صفّ في ملفٍ واحد. وكان
 * التدقيق أربعة أعمدة إلزامية ووجودَ الفئة، فيمرّ بريدٌ مكرّر، وتاريخُ ميلادٍ لا معنى له،
 * وروايةٌ لا تُحلّ («الدوري» وحدها راويان)، وروايةٌ نصُّها حاضرٌ وجسرُ مواضعها ناقص فلا
 * يُسحب لها سؤال. ولا يظهر شيءٌ من ذلك إلا يوم المسابقة، متسابقًا متسابقًا.
 *
 * فالتدقيق هنا **وحدة نقيّة** تُختبر في عقدة: تأخذ نصّ الملف وحالة المسابقة، وتعيد الصفوف
 * الصالحة وقائمةَ أخطاءٍ برقم السطر وسببه. ولا تكتب شيئًا: القرار للمخزن.
 *
 * وقاعدةُ الإدخال تبقى كما كانت: **الكل أو لا شيء**. ملفٌّ فيه خطأٌ واحد لا يُدخَل نصفه،
 * فيبقى نصفُه الآخر مجهولَ المصير عند من رفعه.
 */

import type { Category, Competition, Participant } from '../types';
import { resolveCanonicalRawiId } from './canonical-readings';
import { isReadingQuestionSafe } from './quran-locus-crosswalk';
import { resolveReadings } from './scientific-core';

export const PARTICIPANT_IMPORT_REQUIRED_COLUMNS = ['fullName', 'email', 'dateOfBirth', 'categoryId'] as const;

export interface ImportRowError {
  /** رقم السطر في الملف كما يراه من فتحه في Excel (العنوان = 1). */
  row: number;
  code: string;
  message: string;
  /** العمود المعنيّ إن كان محدّدًا — ليعرف من يصحّح أين ينظر. */
  column?: string;
}

export interface ParticipantImportPlan {
  headers: string[];
  totalRows: number;
  rows: Record<string, string>[];
  errors: ImportRowError[];
  /** هل يجوز الإدخال؟ الكل أو لا شيء. */
  importable: boolean;
}

/** مُحلِّل CSV يحترم الاقتباس والفاصلة والاقتباس المزدوج داخل الخانة. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/*
 * البريد: فحصٌ بنيويّ لا ادّعاءَ تحقّقٍ من وجوده. الغرض منع ما لا يمكن أن يكون بريدًا
 * (بلا @، بلا نطاق، بمسافة) لا الحكم على صلاحية صندوقٍ لا نملك سؤاله.
 */
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[A-Za-z]{2,}$/;

/** تاريخٌ صحيحٌ ومعقول: ليس في المستقبل، وليس قبل قرنٍ ونصف. */
function dateProblem(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'PARTICIPANT_IMPORT_DATE_FORMAT';
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return 'PARTICIPANT_IMPORT_DATE_INVALID';
  if (parsed.toISOString().slice(0, 10) !== value) return 'PARTICIPANT_IMPORT_DATE_INVALID';
  const now = Date.now();
  if (parsed.getTime() > now) return 'PARTICIPANT_IMPORT_DATE_IN_FUTURE';
  if (now - parsed.getTime() > 150 * 365.25 * 24 * 3600 * 1000) return 'PARTICIPANT_IMPORT_DATE_IMPLAUSIBLE';
  return null;
}

const MESSAGES: Record<string, string> = {
  PARTICIPANT_IMPORT_MISSING_COLUMNS: 'الملف ينقصه عمود إلزامي.',
  PARTICIPANT_IMPORT_EMPTY_FILE: 'الملف بلا صفوف بعد سطر العناوين.',
  PARTICIPANT_IMPORT_REQUIRED_FIELD: 'حقل إلزامي فارغ في هذا السطر.',
  PARTICIPANT_IMPORT_EMAIL_INVALID: 'صيغة البريد الإلكتروني غير صحيحة.',
  PARTICIPANT_IMPORT_EMAIL_DUPLICATE_IN_FILE: 'البريد مكرّر داخل الملف نفسه.',
  PARTICIPANT_IMPORT_EMAIL_ALREADY_REGISTERED: 'البريد مسجَّل لمتسابق في هذه المسابقة.',
  PARTICIPANT_IMPORT_IDENTITY_DUPLICATE_IN_FILE: 'رقم الهوية/الجواز مكرّر داخل الملف نفسه.',
  PARTICIPANT_IMPORT_IDENTITY_ALREADY_REGISTERED: 'رقم الهوية/الجواز مسجَّل لمتسابق في هذه المسابقة.',
  PARTICIPANT_IMPORT_DATE_FORMAT: 'تاريخ الميلاد يُكتب هكذا: YYYY-MM-DD.',
  PARTICIPANT_IMPORT_DATE_INVALID: 'تاريخ الميلاد غير صحيح.',
  PARTICIPANT_IMPORT_DATE_IN_FUTURE: 'تاريخ الميلاد في المستقبل.',
  PARTICIPANT_IMPORT_DATE_IMPLAUSIBLE: 'تاريخ الميلاد بعيدٌ عن المعقول.',
  PARTICIPANT_IMPORT_CATEGORY_UNKNOWN: 'الفئة غير موجودة في هذه المسابقة.',
  PARTICIPANT_IMPORT_GENDER_INVALID: 'قيمة الجنس تُكتب male أو female.',
  PARTICIPANT_IMPORT_READING_UNRESOLVED: 'الرواية غير قاطعة. تُكتب كاملة، مثل: الدوري عن أبي عمرو.',
  PARTICIPANT_IMPORT_READING_NOT_QUESTION_READY: 'جسر مواضع هذه الرواية غير مكتمل، فلا تُسحب لها أسئلة بعد.',
  PARTICIPANT_IMPORT_CATEGORY_READING_UNRESOLVED: 'رواية الفئة نفسها غير قاطعة، فلا يرثها المتسابق.',
  PARTICIPANT_IMPORT_READING_REQUIRED_FOR_CATEGORY: 'هذه الفئة تتيح أكثر من رواية، فرواية المتسابق تُكتب صراحةً في عمود riwaya.',
};

export const participantImportMessage = (code: string) => MESSAGES[code] || code;

/**
 * يدقّق كشفًا كاملًا ويعيد خطّة إدخال. لا يكتب شيئًا ولا يغيّر حالة.
 */
export function planParticipantImport(input: {
  csv: string;
  competition: Pick<Competition, 'id' | 'categories'>;
  existingParticipants: Pick<Participant, 'competitionId' | 'email' | 'nationalIdOrPassport'>[];
}): ParticipantImportPlan {
  const lines = input.csv.replace(/\r/g, '').split('\n').filter(line => line.trim().length > 0);
  const errors: ImportRowError[] = [];
  const fail = (row: number, code: string, column?: string) =>
    errors.push({ row, code, message: participantImportMessage(code), ...(column ? { column } : {}) });

  if (!lines.length) {
    fail(1, 'PARTICIPANT_IMPORT_EMPTY_FILE');
    return { headers: [], totalRows: 0, rows: [], errors, importable: false };
  }

  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  const missing = PARTICIPANT_IMPORT_REQUIRED_COLUMNS.filter(h => !headers.includes(h));
  if (missing.length) {
    errors.push({
      row: 1, code: 'PARTICIPANT_IMPORT_MISSING_COLUMNS',
      message: `${participantImportMessage('PARTICIPANT_IMPORT_MISSING_COLUMNS')} (${missing.join('، ')})`,
    });
    return { headers, totalRows: Math.max(0, lines.length - 1), rows: [], errors, importable: false };
  }
  if (lines.length === 1) {
    fail(1, 'PARTICIPANT_IMPORT_EMPTY_FILE');
    return { headers, totalRows: 0, rows: [], errors, importable: false };
  }

  const categories = input.competition.categories || [];
  const categoryOf = (value: string): Category | undefined =>
    categories.find(c => c.id === value || c.code === value);

  const existing = input.existingParticipants.filter(p => p.competitionId === input.competition.id);
  const takenEmails = new Set(existing.map(p => String(p.email || '').trim().toLowerCase()).filter(Boolean));
  const takenIdentities = new Set(existing.map(p => String(p.nationalIdOrPassport || '').trim().toLowerCase()).filter(Boolean));
  const fileEmails = new Set<string>();
  const fileIdentities = new Set<string>();

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1;
    const cells = parseCsvLine(lines[i]);
    const row = Object.fromEntries(headers.map((h, idx) => [h, cells[idx] || ''])) as Record<string, string>;
    let rowOk = true;
    const reject = (code: string, column?: string) => { fail(rowNumber, code, column); rowOk = false; };

    for (const column of PARTICIPANT_IMPORT_REQUIRED_COLUMNS) {
      if (!String(row[column] || '').trim()) reject('PARTICIPANT_IMPORT_REQUIRED_FIELD', column);
    }
    if (!rowOk) continue;

    const email = row.email.trim().toLowerCase();
    if (!EMAIL.test(email)) reject('PARTICIPANT_IMPORT_EMAIL_INVALID', 'email');
    else if (fileEmails.has(email)) reject('PARTICIPANT_IMPORT_EMAIL_DUPLICATE_IN_FILE', 'email');
    else if (takenEmails.has(email)) reject('PARTICIPANT_IMPORT_EMAIL_ALREADY_REGISTERED', 'email');

    const identity = String(row.identity || '').trim().toLowerCase();
    if (identity) {
      if (fileIdentities.has(identity)) reject('PARTICIPANT_IMPORT_IDENTITY_DUPLICATE_IN_FILE', 'identity');
      else if (takenIdentities.has(identity)) reject('PARTICIPANT_IMPORT_IDENTITY_ALREADY_REGISTERED', 'identity');
    }

    const dateIssue = dateProblem(row.dateOfBirth.trim());
    if (dateIssue) reject(dateIssue, 'dateOfBirth');

    const gender = String(row.gender || '').trim().toLowerCase();
    if (gender && gender !== 'male' && gender !== 'female') reject('PARTICIPANT_IMPORT_GENDER_INVALID', 'gender');

    const category = categoryOf(row.categoryId.trim());
    if (!category) reject('PARTICIPANT_IMPORT_CATEGORY_UNKNOWN', 'categoryId');

    /*
     * الرواية: تُقرأ من الصفّ إن كُتبت، وإلا وُرثت من الفئة. وفي الحالتين يجب أن تُحلّ إلى
     * راوٍ واحد لا أكثر — ثم أن يكون جسر مواضعها مكتملًا. فخمسمئة متسابقٍ في روايةٍ لا
     * تُسحب لها أسئلة يظهر عطلُهم واحدًا واحدًا يوم المسابقة، وهذا أسوأ ما يُكتشف متأخّرًا.
     */
    const declaredReading = String(row.riwaya || '').trim();
    const categoryReading = String(category?.riwaya || '').trim();
    const effectiveReading = declaredReading || categoryReading;
    if (category) {
      if (!effectiveReading) {
        reject('PARTICIPANT_IMPORT_CATEGORY_READING_UNRESOLVED', 'riwaya');
      } else if (!resolveCanonicalRawiId({ riwaya: effectiveReading })) {
        /*
         * فئةٌ تتيح أكثر من رواية ليست خطأً — «حفص عن عاصم / ورش / قالون» فئةٌ يعلن فيها
         * المتسابق روايته. لكنّ صفًّا صامتًا فيها لا يرث شيئًا: يُطلب منه التصريح. أما
         * قيمةٌ ملتبسة بين راويين («الدوري») فرفضٌ في كل حال — لا تخمين.
         */
        const offered = resolveReadings({ riwaya: effectiveReading, rawi: effectiveReading });
        if (!declaredReading && offered.length > 1) reject('PARTICIPANT_IMPORT_READING_REQUIRED_FOR_CATEGORY', 'riwaya');
        else reject(declaredReading ? 'PARTICIPANT_IMPORT_READING_UNRESOLVED' : 'PARTICIPANT_IMPORT_CATEGORY_READING_UNRESOLVED', 'riwaya');
      } else if (!isReadingQuestionSafe({ riwaya: effectiveReading })) {
        reject('PARTICIPANT_IMPORT_READING_NOT_QUESTION_READY', 'riwaya');
      }
    }

    if (!rowOk) continue;
    fileEmails.add(email);
    if (identity) fileIdentities.add(identity);
    rows.push({ ...row, email, riwaya: effectiveReading });
  }

  return {
    headers,
    totalRows: Math.max(0, lines.length - 1),
    rows,
    errors,
    importable: errors.length === 0 && rows.length > 0,
  };
}

/**
 * كودُ متسابقٍ لا يصطدم بكودٍ قائم. العدّ وحده يصطدم حين يُحذف متسابقٌ أو يُستورد ملفان
 * معًا، فيُقفز إلى أول كودٍ حرّ بدل أن يُنتج كودين متطابقين لشخصين.
 */
export function nextParticipantCodes(taken: Iterable<string>, count: number): string[] {
  const used = new Set([...taken].map(c => String(c || '').trim().toUpperCase()));
  const out: string[] = [];
  let n = 101;
  while (out.length < count) {
    const code = `A-${String(n).padStart(3, '0')}`;
    if (!used.has(code)) { used.add(code); out.push(code); }
    n++;
    if (n > 100000) break;
  }
  return out;
}
