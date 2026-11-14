/*
 * «أبنائي» — أبناءُ ولي الأمر الواحد في صفحة واحدة، دون حساب ودون رقم هاتف.
 *
 * رابطُ المتابعة مفتاحٌ خاصٌّ بكل متسابق، وهو الباب الوحيد المفتوح لبيانات قاصرين بلا حساب؛
 * ورقمُ الهاتف أو رقمُ المتسابق معلنان أو قابلان للتخمين فلا يصلحان بديلًا (والتحقق برمز
 * يصل إلى الهاتف يحتاج مزوّد رسائل لم يُفعَّل بعد). فالجمعُ يتمّ على جهاز ولي الأمر نفسه:
 * كلُّ رابطٍ يفتحه يُحفَظ، فإذا فتح رابطَ ابنه الثاني ظهر الاثنان معًا.
 *
 * المحفوظ هو المفتاح نفسه الذي يملكه أصلًا، لا أكثر، ولا يغادر الجهاز إلا إلى نقطة الاستعلام
 * العامة نفسها التي يستعملها الرابط. فلا يتّسع الوصول عمّا كان.
 */

export const GUARDIAN_FAMILY_MAX = 12;
const GUARDIAN_TOKEN = /^mz_guardian_[A-Za-z0-9_-]{16,200}$/;

export interface FamilyMember {
  token: string;
  participantId: string;
  name: string;
  code: string;
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/** يقرأ القائمة المحفوظة بحذرٍ: أيُّ شيءٍ غير سليم يُسقَط بدل أن يكسر الصفحة. */
export function readFamily(raw: string | null | undefined): FamilyMember[] {
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: FamilyMember[] = [];
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const token = clean(r.token, 260);
    const participantId = clean(r.participantId, 120);
    if (!GUARDIAN_TOKEN.test(token) || !participantId || seen.has(participantId)) continue;
    seen.add(participantId);
    out.push({ token, participantId, name: clean(r.name, 80), code: clean(r.code, 24) });
  }
  return out.slice(0, GUARDIAN_FAMILY_MAX);
}

/**
 * يضيف ابنًا أو يحدّث بياناته. المفتاح الجديد لنفس المتسابق (بعد إعادة إصدار الرابط) يحلّ
 * محلّ القديم، فلا يبقى رابطٌ مُبطَل في القائمة. وعند الامتلاء يخرج الأقدم.
 */
export function upsertFamily(list: FamilyMember[], member: FamilyMember): FamilyMember[] {
  if (!GUARDIAN_TOKEN.test(member.token) || !member.participantId) return list;
  const next = list.filter(m => m.participantId !== member.participantId);
  next.push({ ...member, name: clean(member.name, 80), code: clean(member.code, 24) });
  return next.slice(-GUARDIAN_FAMILY_MAX);
}

export const removeFromFamily = (list: FamilyMember[], participantId: string) =>
  list.filter(m => m.participantId !== participantId);
