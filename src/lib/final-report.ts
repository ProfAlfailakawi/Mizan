/*
 * التقرير الختامي للمسابقة — ما تطلبه الجهة بعد أن يُغلق اليوم.
 *
 * كشوف النتائج تجيب «من فاز؟». والجهة بعد المسابقة تسأل أسئلةً أوسع: كم سُجّل وكم حضر وكم
 * اختُبر؟ ماذا وقع في القاعة (حوادث، اعتراضات)؟ وكيف عملت اللجان؟ وكان المنظّم يجمع ذلك
 * بيده من خمس شاشات، وهذا بابُ تناقضٍ بين أرقام التقرير وأرقام النظام.
 *
 * وحدةٌ **نقيّة** تأخذ ما في النظام وتعيد أرقامًا فقط. ثلاث قواعد:
 *   ١. لا يدخل في الأرقام الرسمية إلا ما اعتُمد أو خُتم أو نُشر من النتائج (كما في الكشوف).
 *   ٢. لا يخرج نصٌّ حسّاس: الاعتراضات تُعدّ ولا يُنقل سببها، والحوادث تُعدّ ولا يُنقل وصفها
 *      — فالتقرير يُسلَّم لجهاتٍ لا يحقّ لها أن ترى ما كُتب في اعتراض متسابق.
 *   ٣. الرقم الذي لا مصدر له لا يُخترع: لا لجنةَ أنجزت شيئًا ⇒ متوسّطها «—» لا صفر.
 */

import type { AppealRecord, Certificate, Committee, Competition, IncidentRecord, Participant, ResultRecord } from '../types';
import { REPORTABLE_RESULT_STATUSES, buildCategoryResultsReport, type CategoryResultRow } from './results-report';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface FinalReport {
  competitionId: string;
  funnel: { registered: number; approved: number; arrived: number; tested: number; certified: number; noShow: number };
  results: { reportable: number; pendingExcluded: number; average: number | null; highest: number | null; lowest: number | null; sealed: number; published: number };
  categories: CategoryResultRow[];
  podium: { rank: number; code: string; name: string; categoryName: string; score: number }[];
  appeals: { total: number; accepted: number; rejected: number; open: number };
  incidents: { total: number; resolved: number; unresolved: number; critical: number };
  committees: { code: string; name: string; completed: number; averageMinutes: number | null }[];
  certificatesIssued: number;
}

const ARRIVED = new Set(['checked_in', 'in_queue', 'in_session', 'tested', 'certified', 'appealed']);
const APPROVED = new Set(['approved', 'checked_in', 'in_queue', 'in_session', 'tested', 'certified', 'appealed']);

export function buildFinalReport(input: {
  competition: Competition;
  participants: Participant[];
  results: ResultRecord[];
  appeals: AppealRecord[];
  incidents: IncidentRecord[];
  committees: Committee[];
  certificates: Certificate[];
  arabic?: boolean;
}): FinalReport {
  const id = input.competition.id;
  const ar = input.arabic !== false;
  const people = input.participants.filter(p => p.competitionId === id);
  const allResults = input.results.filter(r => r.competitionId === id);
  const official = allResults.filter(r => REPORTABLE_RESULT_STATUSES.includes(r.status));
  const scores = official.map(r => r.finalScore);

  const approved = people.filter(p => APPROVED.has(String(p.status))).length;
  const arrived = people.filter(p => ARRIVED.has(String(p.status))).length;
  const testedIds = new Set([
    ...people.filter(p => p.status === 'tested' || p.status === 'certified').map(p => p.id),
    ...allResults.map(r => r.participantId),
  ]);

  const appeals = input.appeals.filter(a => a.competitionId === id);
  const incidents = input.incidents.filter(i => i.competitionId === id);
  const committees = input.committees.filter(c => c.competitionId === id);

  return {
    competitionId: id,
    funnel: {
      registered: people.length,
      approved,
      arrived,
      tested: testedIds.size,
      certified: people.filter(p => p.status === 'certified').length,
      /* وافقت الجهة على المتسابق ولم يصل قطّ: الفرق بين المقبول والواصل. */
      noShow: Math.max(0, approved - arrived),
    },
    results: {
      reportable: official.length,
      pendingExcluded: allResults.length - official.length,
      average: scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      highest: scores.length ? round2(Math.max(...scores)) : null,
      lowest: scores.length ? round2(Math.min(...scores)) : null,
      sealed: official.filter(r => r.status === 'sealed').length,
      published: official.filter(r => r.status === 'published').length,
    },
    categories: buildCategoryResultsReport({ competition: input.competition, results: input.results, categories: input.competition.categories }, { arabic: ar }),
    podium: official
      .filter(r => r.rank >= 1 && r.rank <= 3)
      .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.rank - b.rank || a.participantCode.localeCompare(b.participantCode))
      .map(r => ({
        rank: r.rank,
        code: r.participantCode,
        name: (ar ? r.participantNameArabic : r.participantName) || r.participantName || r.participantCode,
        categoryName: (ar ? r.categoryNameArabic : r.categoryName) || r.categoryName || '',
        score: round2(r.finalScore),
      })),
    appeals: {
      total: appeals.length,
      accepted: appeals.filter(a => a.status === 'accepted').length,
      rejected: appeals.filter(a => a.status === 'rejected').length,
      open: appeals.filter(a => a.status === 'submitted' || a.status === 'under_review').length,
    },
    incidents: {
      total: incidents.length,
      resolved: incidents.filter(i => !!i.resolvedAt || (i as { status?: string }).status === 'resolved').length,
      unresolved: incidents.filter(i => !i.resolvedAt && (i as { status?: string }).status !== 'resolved').length,
      critical: incidents.filter(i => i.severity === 'critical').length,
    },
    committees: committees
      .map(c => ({
        code: c.code,
        name: (ar ? c.nameArabic : c.name) || c.name || c.code,
        completed: c.completedCount || 0,
        averageMinutes: c.completedCount > 0 && c.averageSessionMinutes > 0 ? round2(c.averageSessionMinutes) : null,
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    certificatesIssued: input.certificates.filter(c => c.competitionId === id).length,
  };
}

const cell = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;

/** CSV بادئته BOM (يُفتح في Excel العربي): قسمٌ، بندٌ، قيمة. */
export function finalReportCsv(report: FinalReport, arabic = true): string {
  const L = (a: string, e: string) => (arabic ? a : e);
  const rows: (string | number)[][] = [
    [L('القسم', 'section'), L('البند', 'item'), L('القيمة', 'value')],
    [L('الحضور', 'funnel'), L('المسجّلون', 'registered'), report.funnel.registered],
    [L('الحضور', 'funnel'), L('المقبولون', 'approved'), report.funnel.approved],
    [L('الحضور', 'funnel'), L('الواصلون', 'arrived'), report.funnel.arrived],
    [L('الحضور', 'funnel'), L('لم يحضروا', 'no show'), report.funnel.noShow],
    [L('الحضور', 'funnel'), L('اختُبروا', 'tested'), report.funnel.tested],
    [L('الحضور', 'funnel'), L('حصلوا على شهادة', 'certified'), report.funnel.certified],
    [L('النتائج', 'results'), L('نتائج معتمدة', 'approved results'), report.results.reportable],
    [L('النتائج', 'results'), L('قيد الاعتماد (مستبعدة)', 'pending (excluded)'), report.results.pendingExcluded],
    [L('النتائج', 'results'), L('المتوسط', 'average'), report.results.average ?? '—'],
    [L('النتائج', 'results'), L('الأعلى', 'highest'), report.results.highest ?? '—'],
    [L('النتائج', 'results'), L('الأدنى', 'lowest'), report.results.lowest ?? '—'],
    [L('الاعتراضات', 'appeals'), L('الإجمالي', 'total'), report.appeals.total],
    [L('الاعتراضات', 'appeals'), L('مقبولة', 'accepted'), report.appeals.accepted],
    [L('الاعتراضات', 'appeals'), L('مرفوضة', 'rejected'), report.appeals.rejected],
    [L('الاعتراضات', 'appeals'), L('مفتوحة', 'open'), report.appeals.open],
    [L('الحوادث', 'incidents'), L('الإجمالي', 'total'), report.incidents.total],
    [L('الحوادث', 'incidents'), L('حرجة', 'critical'), report.incidents.critical],
    [L('الحوادث', 'incidents'), L('غير محلولة', 'unresolved'), report.incidents.unresolved],
    [L('الشهادات', 'certificates'), L('صادرة', 'issued'), report.certificatesIssued],
    ...report.committees.map(c => [L('اللجان', 'committees'), `${c.code} — ${c.name}`, `${c.completed} / ${c.averageMinutes ?? '—'}`]),
    ...report.categories.map(c => [L('الفئات', 'categories'), c.categoryName, `${c.participants} / ${c.averageScore} / ${c.firstPlace}`]),
    ...report.podium.map(p => [L('المنصّة', 'podium'), `${p.categoryName} #${p.rank}`, `${p.code} — ${p.name} — ${p.score}`]),
  ];
  return '﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n');
}

export function finalReportFileName(competition: Competition, arabic = true): string {
  const slug = String(competition.id).replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 40) || 'competition';
  return arabic ? `التقرير-الختامي-${slug}.csv` : `final-report-${slug}.csv`;
}
