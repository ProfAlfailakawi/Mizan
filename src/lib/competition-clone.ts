/*
 * إنشاء نسخةٍ جديدة من مسابقةٍ سابقة — الإعداد لا السجلّات.
 *
 * يُنسخ «المخطط»: الفئات، وقواعد التحكيم والأوزان والخصومات، وسياسة التسجيل ونموذجه، وقالب
 * الشهادة، والعلامة، وبنية الجدول والقاعات، وسياسات النتائج والتظلّم والخصوصية.
 *
 * ولا يُنسخ أبدًا ما هو تشغيليٌّ أو تاريخي: التسجيلات والحضور والطوابير والتعيينات والدرجات
 * والنتائج والفائزون والتظلّمات والشهادات الصادرة ورموز التحقّق والمدفوعات وسجلّات الإرسال
 * والتدقيق وأختام النتائج وبراهين Merkle وبصمة المسابقة القديمة. هذه كلها تعيش في مجموعاتٍ
 * مستقلة مفتاحُها `competitionId`، فالنسخة الجديدة بمعرّفها الجديد تبدأ فارغةً منها بالبناء؛
 * وما يسكن داخل كائن المسابقة نفسه من عدّاداتٍ وتواريخ وأقفال يُصفَّر هنا صراحةً.
 *
 * والنسخة لقطةٌ مستقلة (deep copy) لا مرجعٌ مشترك: تعديل 2027 لا يمسّ 2026 ولا العكس.
 * وتبدأ دائمًا `draft` — فلا تستهلك مقعد «مسابقة نشطة» حتى تُفتح فعلًا.
 */

import type { Competition } from '../types';

export const CLONE_PARTS = ['categories', 'judging', 'registration', 'certificates', 'branding', 'schedule', 'policies'] as const;
export type ClonePart = typeof CLONE_PARTS[number];

export interface CloneOptions {
  newId: string;
  newIdFor: (prefix: string) => string;
  nameArabic?: string;
  nameEnglish?: string;
  editionLabel?: string;
  /** Default: every part. */
  parts?: readonly ClonePart[];
  now?: string;
}

const deep = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function slugSeriesId(source: Competition) {
  return source.seriesId || `series-${source.id}`;
}

export function cloneCompetitionConfiguration(source: Competition, opts: CloneOptions): Competition {
  const parts = new Set<ClonePart>(opts.parts?.length ? opts.parts : CLONE_PARTS);
  const now = opts.now || new Date().toISOString();
  const base = deep(source);
  const template = deep(source);

  base.id = opts.newId;
  base.nameArabic = opts.nameArabic?.trim() || source.nameArabic;
  base.name = opts.nameEnglish?.trim() || source.name;
  base.edition = opts.editionLabel?.trim() || '';
  base.status = 'draft';
  base.startDate = ''; base.endDate = ''; base.registrationStartDate = ''; base.registrationEndDate = '';
  base.totalRegistered = 0; base.totalApproved = 0; base.totalAttended = 0; base.currentDay = 0;
  delete base.closedAt; delete base.closedBy; delete base.closureReason; delete base.updatedAt;

  // السلسلة: الأصل يصير نسخةً سابقة، والجديدة تنضمّ إلى السلسلة نفسها.
  base.seriesId = slugSeriesId(source);
  base.seriesName = source.seriesName || source.name;
  base.seriesNameArabic = source.seriesNameArabic || source.nameArabic;
  base.editionLabel = opts.editionLabel?.trim() || undefined;
  base.previousEditionId = source.id;

  // التحكيم: قواعد جديدة غير مجمّدة بمعرّف جديد — أو قواعد فارغة إن لم تُنسخ.
  const ruleSetId = opts.newIdFor('ruleset');
  base.ruleSet = parts.has('judging')
    ? { ...deep(template.ruleSet), id: ruleSetId, frozenAt: undefined, version: `${template.ruleSet.version}-edition` }
    : { ...deep(template.ruleSet), id: ruleSetId, frozenAt: undefined, name: '', criteria: [] };
  base.ruleSets = [base.ruleSet];

  base.categories = parts.has('categories')
    ? template.categories.map(c => ({ ...deep(c), id: opts.newIdFor('cat'), competitionId: base.id, ruleSetId }))
    : [];

  if (!parts.has('branding')) { base.displayName = undefined; base.displayNameArabic = undefined; base.logoUrl = undefined; }
  if (!parts.has('schedule')) { base.venueName = ''; base.venuesCount = 0; base.totalDays = 0; }

  // السياسة: لقطةٌ جديدة غير مجمّدة. الأجزاء غير المنسوخة تعود إلى ما يولّده الإعداد الافتراضي.
  if (template.policy) {
    const policy = deep(template.policy);
    policy.updatedAt = now;
    delete policy.frozenAt;
    if (!parts.has('registration')) (policy as Partial<typeof policy>).registration = undefined;
    if (!parts.has('certificates')) (policy as Partial<typeof policy>).certificates = undefined;
    if (!parts.has('policies')) {
      for (const k of ['results', 'appeals', 'privacy', 'operations'] as const) (policy as Partial<typeof policy>)[k] = undefined;
    }
    base.policy = Object.fromEntries(Object.entries(policy).filter(([, v]) => v !== undefined)) as typeof policy;
    if (!base.policy.registration || !base.policy.results) delete base.policy; // يُعاد توليدها كاملةً بواسطة getCompetitionPolicy
  }

  base.readinessChecklist = {
    datesConfigured: false, categoriesConfigured: base.categories.length > 0, ruleSetFrozen: false, judgesAssigned: false,
    quranSourceLocked: false, devicesRegistered: false, certificatesReady: false,
  };
  base.clonedFrom = { competitionId: source.id, at: now, parts: [...parts] };
  return base;
}

/** Group competitions into series with their editions, newest first. */
export function buildSeriesIndex(competitions: readonly Competition[]) {
  const map = new Map<string, { seriesId: string; name: string; nameArabic: string; editions: Competition[] }>();
  for (const c of competitions) {
    const id = c.seriesId || `series-${c.id}`;
    const entry = map.get(id) || { seriesId: id, name: c.seriesName || c.name, nameArabic: c.seriesNameArabic || c.nameArabic, editions: [] };
    entry.editions.push(c);
    map.set(id, entry);
  }
  for (const e of map.values()) e.editions.sort((a, b) => String(b.editionLabel || b.edition || b.startDate).localeCompare(String(a.editionLabel || a.edition || a.startDate)));
  return [...map.values()];
}

export function suggestNextEditionLabel(source: Competition, now = new Date()) {
  const current = Number(/(\d{4})/.exec(source.editionLabel || source.edition || source.startDate || '')?.[1]);
  return String(Number.isFinite(current) && current > 2000 ? current + 1 : now.getUTCFullYear() + 1);
}
