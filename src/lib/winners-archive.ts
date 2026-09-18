/*
 * سجل الفائزين.
 *
 * المسابقة التي لا تحفظ فائزيها تبدأ من الصفر كل عام: يُسأل المنظّم «من فاز الدورة
 * الماضية؟» فيبحث في ملفٍ أو في ذاكرته، ويُسأل المتسابق «ما مستوى الأول عادةً؟» فلا
 * يجد جوابًا. والسجل يجعل الجواب صفحةً عامةً ثابتة، ويجعل نِسَب المراكز عبر الدورات
 * قابلةً للمقارنة — وهو ما يعطي «المركز الأول» معناه.
 *
 * ولا يُبنى السجل إلا من نتائج مختومة أو منشورة: النتيجة قبل ختمها ليست تاريخًا بعد.
 * والمركز المحجوب يُذكر محجوبًا بسببه؛ حذفُه من السجل تزويرٌ صغيرٌ يتراكم. ومثلُه المركز
 * الموقوف على تعادل: يُقال موقوفًا، فغيابُه عن السجل يُقرأ «لم يُمنح» وهو غير «لم يُفصل».
 */

import { normalizeAwardPolicy, resolveAwards, scorePercentage, type AwardPolicy } from './award-places';
import { describeTie } from './tie-resolution';

export interface ArchiveResultInput {
  competitionId: string;
  categoryId: string;
  participantId: string;
  participantCode: string;
  participantName: string;
  participantNameArabic: string;
  finalScore: number;
  status: string;
  /** درجاتُ المعايير وعددُ المخالفات — بهما تعمل قواعدُ كسر التعادل المعلنة. */
  criterionScores?: Record<string, number>;
  penaltyCount?: number;
}

export interface ArchiveCompetitionInput {
  id: string;
  name: string;
  nameArabic: string;
  edition?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  categories: { id: string; name: string; nameArabic: string }[];
  awards?: AwardPolicy;
  /** قواعدُ كسر التعادل المعلنة في رُبريك المسابقة. */
  tieBreakRules?: readonly string[];
  /** الدرجة الكاملة لهذه المسابقة. الافتراضي مئة. */
  maxScore?: number;
}

export interface ArchiveWinner {
  placeTitleArabic: string;
  placeTitleEnglish: string;
  rank: number;
  participantCode: string;
  participantName: string;
  participantNameArabic: string;
  percentage: number;
}

export interface ArchiveWithheld {
  placeTitleArabic: string;
  placeTitleEnglish: string;
  rank: number;
  reasonArabic: string;
  reasonEnglish: string;
}

/** مركزٌ وقع فيه تعادل. `decided` يعني أن الإدارة فصلت فيه وسُجّل سببها. */
export interface ArchiveContested {
  placeTitleArabic: string;
  placeTitleEnglish: string;
  rank: number;
  decided: boolean;
  noteArabic: string;
  noteEnglish: string;
}

export interface ArchiveCategoryEntry {
  categoryId: string;
  categoryName: string;
  categoryNameArabic: string;
  winners: ArchiveWinner[];
  withheld: ArchiveWithheld[];
  contested: ArchiveContested[];
}

export interface ArchiveEdition {
  competitionId: string;
  title: string;
  titleArabic: string;
  edition?: string;
  /** السنة الميلادية المستخرجة من تاريخ البدء، إن وُجد. */
  year: number | null;
  categories: ArchiveCategoryEntry[];
}

const SEALED = new Set(['sealed', 'published']);

const yearOf = (iso?: string) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
};

/**
 * يبني السجل من المسابقات ونتائجها. يتجاهل المسابقة التي لا نتيجة مختومة فيها — لا
 * يعرضها فارغةً، فالفراغ يُقرأ «لم يفز أحد» وهو غير «لم تُختم بعد».
 */
export function buildWinnersArchive(input: {
  competitions: ArchiveCompetitionInput[];
  results: ArchiveResultInput[];
  /** استثنِ المسابقة الجارية من السجل التاريخي. */
  excludeCompetitionId?: string;
}): ArchiveEdition[] {
  const byCompetition = new Map<string, ArchiveResultInput[]>();
  for (const result of input.results) {
    if (!SEALED.has(result.status)) continue;
    const list = byCompetition.get(result.competitionId);
    if (list) list.push(result); else byCompetition.set(result.competitionId, [result]);
  }

  const editions: ArchiveEdition[] = [];
  for (const competition of input.competitions) {
    if (competition.id === input.excludeCompetitionId) continue;
    const results = byCompetition.get(competition.id);
    if (!results?.length) continue;
    const policy = normalizeAwardPolicy(competition.awards);
    const maxScore = competition.maxScore || 100;

    const categories: ArchiveCategoryEntry[] = [];
    for (const category of competition.categories) {
      const members = results.filter(r => r.categoryId === category.id);
      if (!members.length) continue;
      const outcome = resolveAwards({
        policy,
        tieBreakRules: competition.tieBreakRules,
        candidates: members.map(r => ({
          participantId: r.participantId, participantCode: r.participantCode, finalScore: r.finalScore, maxScore,
          criterionScores: r.criterionScores, penaltyCount: r.penaltyCount,
        })),
      });
      const byId = new Map(members.map(r => [r.participantId, r]));
      categories.push({
        categoryId: category.id,
        categoryName: category.name || category.nameArabic,
        categoryNameArabic: category.nameArabic || category.name,
        winners: outcome.awarded.flatMap(entry => entry.winners.map(winner => {
          const row = byId.get(winner.participantId);
          return {
            placeTitleArabic: entry.place.titleArabic,
            placeTitleEnglish: entry.place.titleEnglish,
            rank: entry.place.rank,
            participantCode: winner.participantCode,
            participantName: row?.participantName || winner.participantCode,
            participantNameArabic: row?.participantNameArabic || row?.participantName || winner.participantCode,
            percentage: scorePercentage(winner.finalScore, maxScore),
          };
        })),
        withheld: outcome.withheld.map(entry => ({
          placeTitleArabic: entry.place.titleArabic,
          placeTitleEnglish: entry.place.titleEnglish,
          rank: entry.place.rank,
          reasonArabic: entry.reasonArabic,
          reasonEnglish: entry.reasonEnglish,
        })),
        contested: outcome.contested.map(entry => ({
          placeTitleArabic: entry.place.titleArabic,
          placeTitleEnglish: entry.place.titleEnglish,
          rank: entry.place.rank,
          decided: !!entry.decision,
          noteArabic: describeTie(entry.group, entry.decision, true),
          noteEnglish: describeTie(entry.group, entry.decision, false),
        })),
      });
    }
    if (!categories.length) continue;

    editions.push({
      competitionId: competition.id,
      title: competition.name || competition.nameArabic,
      titleArabic: competition.nameArabic || competition.name,
      edition: competition.edition,
      year: yearOf(competition.startDate || competition.endDate),
      categories,
    });
  }

  // الأحدث أولًا: من يفتح السجل يسأل عن الدورة الماضية قبل أن يسأل عن أول دورة.
  return editions.sort((a, b) => (b.year || 0) - (a.year || 0) || a.titleArabic.localeCompare(b.titleArabic));
}
