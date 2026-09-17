/*
 * تقارير النتائج — أول ما تطلبه جهةٌ بعد انتهاء اليوم.
 *
 * كان في ميزان تصديرٌ لبطاقات الرحلة ولقطةٌ كاملة بصيغة JSON، وكلاهما لمن يعرف ما يفعل.
 * أما ما يُطلب في القاعة — كشفُ نتائج المتسابقين مرتّبًا، وكشفُ كل فئة على حدة — فلم يكن
 * له مخرج. فكان المنظّم يقرأ الأرقام من الشاشة ويكتبها بيده، وهذا بابُ خطأٍ لا يُكشف.
 *
 * والوحدة هنا **نقيّة**: تأخذ الصفوف وتعيد الصفوف، بلا متصفّح ولا شبكة ولا حالة — فتُختبر
 * في عقدة، ويُتحقّق من الترتيب والتعادل والإجماليات قبل أن تُطبع على ورق.
 *
 * وثلاثة قيود من واقع الاستعمال:
 *   ١. الملف يُفتح في Excel أمام موظفين عرب — فبادئة BOM، وإلا قرأ Excel العربية رموزًا.
 *   ٢. الفاصلة والاقتباس وسطرٌ جديد داخل الاسم لا تكسر الصفّ — كلُّ خانةٍ مقتبسة.
 *   ٣. لا يُصدَّر إلا ما اعتُمد أو خُتم أو نُشر. نتيجةٌ قيد الحساب في ورقةٍ رسمية تُقرأ
 *      نهائيةً وهي ليست كذلك.
 */

import type { Category, Competition, ResultRecord } from '../types';

/** الحالات التي يجوز أن تخرج في تقرير رسمي. */
export const REPORTABLE_RESULT_STATUSES: readonly ResultRecord['status'][] = ['approved', 'sealed', 'published'];

export interface ResultsReportOptions {
  /** العربية لغة العرض؟ يغيّر العناوين والأسماء المعروضة، لا الأرقام. */
  arabic?: boolean;
  /** فئةٌ بعينها، أو كل الفئات حين تُترك. */
  categoryId?: string;
}

export interface ParticipantResultRow {
  rank: number;
  participantCode: string;
  participantName: string;
  categoryName: string;
  country: string;
  finalScore: number;
  penaltyCount: number;
  status: ResultRecord['status'];
  sealAssurance: string;
}

export interface CategoryResultRow {
  categoryName: string;
  participants: number;
  highestScore: number;
  lowestScore: number;
  averageScore: number;
  firstPlace: string;
  sealed: number;
  published: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** الصفوف القابلة للتقرير فقط، مرتّبةً ترتيبًا حتميًا. */
function reportable(results: ResultRecord[], competition: Competition, options: ResultsReportOptions): ResultRecord[] {
  return results
    .filter(r => r.competitionId === competition.id)
    .filter(r => REPORTABLE_RESULT_STATUSES.includes(r.status))
    .filter(r => !options.categoryId || r.categoryId === options.categoryId)
    /*
     * الترتيب حتميّ: بالمرتبة، ثم بالدرجة نزولًا، ثم بالكود.
     * والكودُ فاصلٌ أخير لأن متعادلَين في المرتبة والدرجة لا يجوز أن يتبادلا موضعيهما بين
     * طبعةٍ وأخرى من الورقة نفسها — فتُقرأ الطبعتان كأنهما نتيجتان.
     */
    .sort((a, b) => a.rank - b.rank || b.finalScore - a.finalScore || a.participantCode.localeCompare(b.participantCode));
}

export function buildParticipantResultsReport(
  input: { competition: Competition; results: ResultRecord[] },
  options: ResultsReportOptions = {},
): ParticipantResultRow[] {
  const ar = options.arabic !== false;
  return reportable(input.results, input.competition, options).map(r => ({
    rank: r.rank,
    participantCode: r.participantCode,
    participantName: (ar ? r.participantNameArabic : r.participantName) || r.participantName || r.participantCode,
    categoryName: (ar ? r.categoryNameArabic : r.categoryName) || r.categoryName || '',
    country: r.country || '',
    finalScore: round2(r.finalScore),
    penaltyCount: r.penaltyCount ?? 0,
    status: r.status,
    /* «مختوم» وحدها تخفي الفرق بين ختمٍ موقَّعٍ بمفتاح خادمي وبصمةٍ محلّية. */
    sealAssurance: r.sealMetadata?.assurance || (r.sealMetadata ? 'SEALED' : ''),
  }));
}

export function buildCategoryResultsReport(
  input: { competition: Competition; results: ResultRecord[]; categories?: Category[] },
  options: ResultsReportOptions = {},
): CategoryResultRow[] {
  const ar = options.arabic !== false;
  const rows = reportable(input.results, input.competition, options);
  const byCategory = new Map<string, ResultRecord[]>();
  for (const r of rows) {
    const list = byCategory.get(r.categoryId) || [];
    list.push(r);
    byCategory.set(r.categoryId, list);
  }

  const order = (input.categories || input.competition.categories || []).map(c => c.id);
  const keys = [...byCategory.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? Number.MAX_SAFE_INTEGER : ia) - (ib < 0 ? Number.MAX_SAFE_INTEGER : ib) || a.localeCompare(b);
  });

  return keys.map(categoryId => {
    const list = byCategory.get(categoryId)!;
    const scores = list.map(r => r.finalScore);
    const top = list.reduce((best, r) => (r.rank < best.rank ? r : best), list[0]);
    const category = (input.categories || input.competition.categories || []).find(c => c.id === categoryId);
    const categoryName = (ar ? (list[0].categoryNameArabic || category?.nameArabic) : (list[0].categoryName || category?.name)) || categoryId;
    return {
      categoryName,
      participants: list.length,
      highestScore: round2(Math.max(...scores)),
      lowestScore: round2(Math.min(...scores)),
      averageScore: round2(scores.reduce((sum, n) => sum + n, 0) / list.length),
      firstPlace: `${top.participantCode} — ${(ar ? top.participantNameArabic : top.participantName) || top.participantCode}`,
      sealed: list.filter(r => r.status === 'sealed').length,
      published: list.filter(r => r.status === 'published').length,
    };
  });
}

const PARTICIPANT_HEADERS_AR = ['المرتبة', 'كود المتسابق', 'اسم المتسابق', 'الفئة', 'الدولة', 'الدرجة النهائية', 'عدد المخالفات', 'الحالة', 'توثيق الختم'];
const PARTICIPANT_HEADERS_EN = ['rank', 'participant_code', 'participant_name', 'category', 'country', 'final_score', 'penalties', 'status', 'seal_assurance'];
const CATEGORY_HEADERS_AR = ['الفئة', 'عدد المتسابقين', 'أعلى درجة', 'أدنى درجة', 'المتوسط', 'المركز الأول', 'مختومة', 'منشورة'];
const CATEGORY_HEADERS_EN = ['category', 'participants', 'highest_score', 'lowest_score', 'average_score', 'first_place', 'sealed', 'published'];

/** خانةٌ آمنة: الاقتباس دائمًا، والاقتباس المزدوج داخلها يُضاعَف. */
const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

/**
 * يبني CSV ببادئة BOM. البادئة ليست زينة: بدونها يقرأ Excel على ويندوز العربيةَ رموزًا
 * لا تُفهم، وهو أوّل ما يُفتح به هذا الملف.
 */
export function resultsCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return `﻿${[headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')}\r\n`;
}

export function participantResultsCsv(
  input: { competition: Competition; results: ResultRecord[] },
  options: ResultsReportOptions = {},
): string {
  const ar = options.arabic !== false;
  const rows = buildParticipantResultsReport(input, options)
    .map(r => [r.rank, r.participantCode, r.participantName, r.categoryName, r.country, r.finalScore, r.penaltyCount, r.status, r.sealAssurance]);
  return resultsCsv(ar ? PARTICIPANT_HEADERS_AR : PARTICIPANT_HEADERS_EN, rows);
}

export function categoryResultsCsv(
  input: { competition: Competition; results: ResultRecord[]; categories?: Category[] },
  options: ResultsReportOptions = {},
): string {
  const ar = options.arabic !== false;
  const rows = buildCategoryResultsReport(input, options)
    .map(r => [r.categoryName, r.participants, r.highestScore, r.lowestScore, r.averageScore, r.firstPlace, r.sealed, r.published]);
  return resultsCsv(ar ? CATEGORY_HEADERS_AR : CATEGORY_HEADERS_EN, rows);
}

/** اسم ملفٍ آمنٍ على كل نظام ملفات، ويبقى مفهومًا لمن يفتح مجلّد التنزيلات. */
export function resultsFileName(competition: Competition, kind: 'participants' | 'categories', arabic = true): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const safe = String(competition.id || 'competition').replace(/[^A-Za-z0-9._-]/g, '-');
  const label = arabic ? (kind === 'participants' ? 'نتائج-المتسابقين' : 'نتائج-الفئات') : `mizan-${kind}-results`;
  return `${label}-${safe}-${stamp}.csv`;
}
