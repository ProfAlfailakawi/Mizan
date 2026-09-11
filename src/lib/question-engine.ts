/*
 * محرك اختيار الأسئلة.
 *
 * ترتيب القرار صريح ومُختبَر، لا معادلة مخفية:
 *
 *   ١) مرشّحات صارمة (MUST): المستأجر والمسابقة · نطاق المتسابق · المنطقة · سياق القراءة ·
 *      اعتماد المصدر · حالة السؤال · قيود التكرار القاطعة.
 *   ٢) مفاضلة (PREFER): ملاءمة الصعوبة · عدالة النموذج الكلية · قلّة الانكشاف · حماية المورد
 *      النادر · توازن الاستعمال · التنوع · التباعد الزمني · حماية المتسابقين القادمين.
 *
 * وكل سؤال مختار يحمل سبب اختياره بصورة بنيوية قابلة للتدقيق — لا نصًّا إنشائيًا ولا سلسلة
 * تفكير نموذج ذكاء اصطناعي.
 */

import { ayahOrdinal, ordinalToLocus, type QuranLocus } from './quran-canon';
import { normalizeScope, scopeContainsRange, scopeRanges, type QuranScope } from './quran-scope';
import type { RepeatPolicy } from './repeat-policy';
import type { ZoneSlot } from './question-zones';

export const QUESTION_ENGINE_VERSION = 'MIZAN-QUESTION-ENGINE-1';

export type DifficultyAssurance = 'unknown' | 'automatically_estimated' | 'human_reviewed' | 'scientifically_approved';
export type QuestionApprovalStatus = 'approved' | 'draft' | 'quarantined' | 'retired';

export interface QuestionCandidate {
  id: string;
  surahNumber: number;
  startAyah: number;
  endAyah: number;
  juzNumber?: number;
  pageNumber?: number;
  difficultyRating: number;
  difficultyAssurance: DifficultyAssurance;
  difficultyConfidence?: number;
  difficultySource?: string;
  qiraahId?: string;
  rawiId?: string;
  tariqId?: string;
  approvalStatus?: QuestionApprovalStatus;
  mutashabihatScore?: number;
  tajweedComplexity?: 'basic' | 'intermediate' | 'advanced';
  /** عدد الاستعمالات الموروثة من مسابقات سابقة أو من مصدر خارجي. */
  priorUsageCount?: number;
}

export interface ReadingContext { qiraahId?: string; rawiId?: string; tariqId?: string }

export interface SelectionRequest {
  participantId: string;
  /** ترتيب المتسابق في تسلسل السحب — أساس قياس المباعدة بين الاستعمالات. */
  sequencePosition?: number;
  effectiveScope: QuranScope;
  slots: ZoneSlot[];
  reading?: ReadingContext;
  targetDifficulty?: number;
  difficultyTolerance?: number;
  hallId?: string;
  day?: string;
  stage?: string;
  roundId?: string;
  atMs?: number;
  /**
   * ضغط ندرة نطاق هذا المتسابق نفسه (٠..١). المرشح لا يُعاقَب إلا بما يزيد عن هذا الأساس:
   * من كان نطاقه هو الأندر لا يُحرم من مورده حمايةً لغيره.
   */
  scarcityBaseline?: number;
  /** مواضع ممنوعة صراحةً (حجر، أو تاريخ سابق لهذا المتسابق). */
  excludedIds?: string[];
}

export interface SelectionReason {
  matchedScope: true;
  matchedZone: boolean;
  zoneId: string | null;
  zoneRelaxed: boolean;
  matchedReading: boolean;
  targetDifficulty: number | null;
  actualDifficulty: number;
  difficultyAssurance: DifficultyAssurance;
  usesBeforeSelection: number;
  participantGapAtSelection: number | null;
  scarcityPressure: number;
  exposurePressure: number;
  alternativeCandidates: number;
  score: number;
  runnerUpScore: number | null;
  /** قيود PREFER التي تُنوزل عنها لعدم توفر بديل، بأسمائها. */
  relaxedPreferences: string[];
}

export interface SelectedQuestion { slotIndex: number; candidate: QuestionCandidate; reason: SelectionReason }

export interface SelectionFailure { slotIndex: number; code: string; ar: string; en: string }

export interface SelectionResult {
  participantId: string;
  questions: SelectedQuestion[];
  failures: SelectionFailure[];
  aggregateDifficulty: number;
  difficultyVariance: number;
  minDifficulty: number;
  maxDifficulty: number;
  repeatsUsed: number;
  relaxations: string[];
  engineVersion: typeof QUESTION_ENGINE_VERSION;
}

interface EligibleRow { candidate: QuestionCandidate; uses: number; key: string; from: number; row?: LocusUsageRow }

export interface LocusUsageRow {
  uses: number;
  lastSequence: number;
  lastAtMs?: number;
  halls: string[];
  days: string[];
  stages: string[];
}

export const locusKeyOf = (candidate: Pick<QuestionCandidate, 'surahNumber' | 'startAyah'>) => `${candidate.surahNumber}:${candidate.startAyah}`;

/* ترتيب بداية المقطع ونهايته يُحسب مرة لكل مرشح ويُحفظ، فلا يُعاد حسابه في كل خانة سحب. */
const ORDINAL_CACHE = new WeakMap<QuestionCandidate, { from: number; to: number; key: string }>();
function candidateSpan(candidate: QuestionCandidate) {
  const hit = ORDINAL_CACHE.get(candidate);
  if (hit) return hit;
  const span = {
    from: ayahOrdinal({ surah: candidate.surahNumber, ayah: candidate.startAyah }),
    to: ayahOrdinal({ surah: candidate.surahNumber, ayah: candidate.endAyah }),
    key: locusKeyOf(candidate),
  };
  ORDINAL_CACHE.set(candidate, span);
  return span;
}

/** مصدر ضغط الندرة: كم متسابقًا قادمًا يحتاج هذا الموضع مقابل ما يملكه من بدائل. */
export interface ScarcityOracle { pressureOfLocus(locusKey: string): number }

/* عدد صحيح حتمي من البذرة — لا Math.random، فكل قرعة قابلة لإعادة الإنتاج عند التدقيق. */
function seededUnit(seed: string, domain: string): number {
  let h = 0x811c9dc5;
  const text = `${seed}|${domain}`;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h / 0x100000000;
}

const DEFAULT_WEIGHTS = {
  difficulty: 3.0,
  modelBalance: 1.4,
  usage: 2.2,
  exposure: 1.1,
  scarcity: 1.6,
  separation: 1.8,
  neighborhood: 1.2,
  diversity: 0.9,
  jitter: 0.35,
};
export type EngineWeights = typeof DEFAULT_WEIGHTS;

export interface EngineOptions {
  policy: RepeatPolicy;
  seed: string;
  weights?: Partial<EngineWeights>;
  scarcity?: ScarcityOracle;
  /** يتطلب مراجعة علمية للصعوبة (وضع البطولات الرسمية). */
  requireReviewedDifficulty?: boolean;
  /** قيمة الصعوبة المستهدفة على مستوى المسابقة حين لا تحددها المنطقة. */
  defaultTargetDifficulty?: number;
  /**
   * مُحلّل مرشحين مُخزَّن بحسب النطاق. عشرة آلاف متسابق يسألون عن النطاقات نفسها،
   * فالتصفية تُحسب للعنقود مرة لا لكل متسابق. اختياري: بدونه يُصفّى البنك كاملًا.
   */
  candidateResolver?: (scope: QuranScope) => QuestionCandidate[];
  /**
   * نطاق التسامح في موازنة الاستعمال: لا يُنظر إلا للمرشحين الذين استُعملوا
   * (أقلّ استعمالًا + هذا الهامش) مرة أو أقل. صفر يعطي أدقّ توازن حمل، والزيادة
   * تعطي مساحةً أوسع لمطابقة الصعوبة. الأثر مقيس في تقرير المحاكاة لا مُدَّعى.
   */
  usageBandTolerance?: number;
}

/**
 * محرك تخصيص حالته داخلية: يعرف ما سُحب قبل الآن، فيوازن الحمل ويباعد بين الاستعمالات.
 * يُنشأ لمسابقة وبنك وسياق قراءة، ويُغذّى بالتاريخ السابق قبل أول سحب.
 */
export class QuestionAllocationEngine {
  readonly policy: RepeatPolicy;
  private readonly seed: string;
  private readonly weights: EngineWeights;
  private readonly scarcity?: ScarcityOracle;
  private readonly requireReviewedDifficulty: boolean;
  private readonly defaultTargetDifficulty: number;
  private readonly candidateResolver?: (scope: QuranScope) => QuestionCandidate[];
  private readonly usageBandTolerance: number;
  private usage = new Map<string, LocusUsageRow>();
  private participantHistory = new Map<string, Set<string>>();
  private sequence = 0;
  private totalDraws = 0;
  private repeats = 0;

  constructor(options: EngineOptions) {
    this.policy = options.policy;
    this.seed = options.seed;
    this.weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
    this.scarcity = options.scarcity;
    this.requireReviewedDifficulty = !!options.requireReviewedDifficulty;
    this.defaultTargetDifficulty = options.defaultTargetDifficulty ?? 3;
    this.candidateResolver = options.candidateResolver;
    this.usageBandTolerance = Math.max(0, Math.round(options.usageBandTolerance ?? 0));
  }

  /** تغذية المحرك بتاريخ سابق (جلسات اليوم الأول، أو مسابقة سابقة عند تفعيل السياسة). */
  primeUsage(rows: { locusKey: string; participantId?: string; uses?: number; sequence?: number; atMs?: number; hallId?: string; day?: string; stage?: string }[]) {
    for (const row of rows) {
      const current = this.usage.get(row.locusKey) || { uses: 0, lastSequence: -Infinity, halls: [], days: [], stages: [] };
      current.uses += Math.max(1, row.uses || 1);
      if (row.sequence !== undefined) current.lastSequence = Math.max(current.lastSequence, row.sequence);
      if (row.atMs !== undefined) current.lastAtMs = Math.max(current.lastAtMs || 0, row.atMs);
      if (row.hallId && !current.halls.includes(row.hallId)) current.halls.push(row.hallId);
      if (row.day && !current.days.includes(row.day)) current.days.push(row.day);
      if (row.stage && !current.stages.includes(row.stage)) current.stages.push(row.stage);
      this.usage.set(row.locusKey, current);
      if (row.participantId) {
        const set = this.participantHistory.get(row.participantId) || new Set<string>();
        set.add(row.locusKey);
        this.participantHistory.set(row.participantId, set);
      }
    }
  }

  usageSnapshot() {
    return [...this.usage.entries()].map(([locusKey, row]) => ({ locusKey, uses: row.uses, lastSequence: row.lastSequence, halls: [...row.halls], days: [...row.days] }));
  }

  statistics() {
    const uses = [...this.usage.values()].map(x => x.uses);
    const usedLoci = uses.length;
    const maxUse = usedLoci ? Math.max(...uses) : 0;
    const minUse = usedLoci ? Math.min(...uses) : 0;
    const mean = usedLoci ? uses.reduce((a, b) => a + b, 0) / usedLoci : 0;
    const variance = usedLoci ? uses.reduce((a, b) => a + (b - mean) ** 2, 0) / usedLoci : 0;
    return {
      totalDraws: this.totalDraws, uniqueLociUsed: usedLoci, repeats: this.repeats,
      maxUsesOfAnyLocus: maxUse, minUsesOfAnyLocus: minUse,
      meanUses: Number(mean.toFixed(3)), usageVariance: Number(variance.toFixed(3)),
      /** معامل التشتت: صفر يعني توزيعًا مثاليًا للحمل على المواضع المستعملة. */
      reuseDispersion: mean > 0 ? Number((Math.sqrt(variance) / mean).toFixed(3)) : 0,
    };
  }

  private eligible(candidates: QuestionCandidate[], request: SelectionRequest, slot: ZoneSlot, chosen: SelectedQuestion[], excluded: Set<string>): EligibleRow[] {
    const policy = this.policy;
    // مدى النطاق يُحسب مرة واحدة للخانة، لا مرة لكل مرشح: هذا هو الفرق بين ثوانٍ ودقائق.
    const ranges = scopeRanges(slot.scope);
    const history = this.participantHistory.get(request.participantId);
    const chosenIds = new Set(chosen.map(x => x.candidate.id));
    const chosenLoci = new Set(chosen.map(x => locusKeyOf(x.candidate)));
    const out: EligibleRow[] = [];
    for (const candidate of candidates) {
      if (excluded.has(candidate.id)) continue;
      if (candidate.approvalStatus && candidate.approvalStatus !== 'approved') continue;
      if (this.requireReviewedDifficulty && candidate.difficultyAssurance !== 'human_reviewed' && candidate.difficultyAssurance !== 'scientifically_approved') continue;
      if (!policy.allowUnreviewedDifficulty && candidate.difficultyAssurance === 'unknown') continue;
      if (!readingMatches(candidate, request.reading)) continue;
      // النطاق شرط قاطع: المقطع كله داخل نطاق المتسابق وداخل المنطقة، لا بدايته وحدها.
      const span = candidateSpan(candidate);
      let inside = false;
      for (const [a, b] of ranges) if (span.from >= a && span.to <= b) { inside = true; break; }
      if (!inside) continue;
      if (policy.noRepeatWithinModel && (chosenIds.has(candidate.id) || chosenLoci.has(span.key))) continue;
      if (policy.noRepeatWithinParticipant && history?.has(span.key)) continue;
      const row = this.usage.get(span.key);
      const uses = (row?.uses || 0) + (candidate.priorUsageCount || 0);
      if (policy.mode === 'strict_no_repeat' && uses > 0) continue;
      if (policy.maxUsesPerQuestion && uses >= policy.maxUsesPerQuestion) continue;
      out.push({ candidate, uses, key: span.key, from: span.from, row });
    }
    return out;
  }

  /*
   * موازنة الحمل أولًا، ثم المفاضلة.
   *
   * لو تُرك الترجيح وحده لطغت ملاءمة الصعوبة على توازن الاستعمال، فيُستعمل موضعٌ أربع عشرة
   * مرة وآخر مرة واحدة. الحزام هنا يقصر المفاضلة على المواضع الأقلّ استعمالًا، فيقترب أكثرُ
   * المواضع استعمالًا من الحدّ الأدنى الذي تفرضه الرياضيات.
   */
  /*
   * الجوار داخل النموذج الواحد قيدٌ قاطع لا تفضيل: سؤالان يبدآن من آيتين متجاورتين ليسا
   * سؤالين في تجربة المتسابق. وإن لم يبقَ بديل، يُتنازل عنه ويُسجَّل التنازل صراحةً.
   */
  private neighborhoodFilter(rows: EligibleRow[], chosen: SelectedQuestion[]) {
    const radius = this.policy.neighborhoodAyahRadius;
    if (radius <= 0 || !chosen.length) return { rows, relaxed: false };
    const picked = chosen.map(x => candidateSpan(x.candidate).from);
    const kept = rows.filter(row => picked.every(from => Math.abs(row.from - from) > radius));
    return kept.length ? { rows: kept, relaxed: false } : { rows, relaxed: true };
  }

  private usageBand(rows: EligibleRow[]) {
    if (rows.length <= 1) return rows;
    let min = Infinity;
    for (const row of rows) if (row.uses < min) min = row.uses;
    const ceiling = min + this.usageBandTolerance;
    const banded = rows.filter(row => row.uses <= ceiling);
    return banded.length ? banded : rows;
  }

  private score(entry: EligibleRow, request: SelectionRequest, slot: ZoneSlot, chosen: SelectedQuestion[], target: number) {
    const w = this.weights;
    const candidate = entry.candidate, key = entry.key, row = entry.row, uses = entry.uses;
    const position = request.sequencePosition ?? this.sequence;
    const relaxed: string[] = [];

    const difficultyGap = Math.abs(candidate.difficultyRating - target);
    const usagePressure = uses;
    const exposurePressure = uses > 0 && row ? 1 / (1 + Math.max(0, position - row.lastSequence)) : 0;

    let separation = 0;
    if (row && Number.isFinite(row.lastSequence)) {
      const gap = position - row.lastSequence;
      const wanted = this.policy.minimumParticipantGap || 0;
      if (wanted > 0 && gap < wanted) { separation += (wanted - gap) / wanted; relaxed.push('participant_gap'); }
      if (this.policy.minimumMinutesGap && request.atMs && row.lastAtMs) {
        const minutes = (request.atMs - row.lastAtMs) / 60000;
        if (minutes < this.policy.minimumMinutesGap) { separation += (this.policy.minimumMinutesGap - minutes) / this.policy.minimumMinutesGap; relaxed.push('time_gap'); }
      }
      if (this.policy.roomAware && request.hallId && row.halls.includes(request.hallId)) { separation += 0.6; relaxed.push('room_separation'); }
      if (this.policy.dayAware && request.day && row.days.includes(request.day)) { separation += 0.4; relaxed.push('day_separation'); }
      if (this.policy.stageAware && request.stage && row.stages.includes(request.stage)) { separation += 0.4; relaxed.push('stage_separation'); }
    }

    let neighborhood = 0;
    const radius = this.policy.neighborhoodAyahRadius;
    if (radius > 0) {
      const ordinal = entry.from;
      for (const picked of chosen) {
        const distance = Math.abs(ordinal - candidateSpan(picked.candidate).from);
        if (distance <= radius) { neighborhood += (radius + 1 - distance) / (radius + 1); relaxed.push('neighborhood'); }
      }
    }

    let diversity = 0;
    if (slot.preferDistinctSurah !== false && chosen.some(x => x.candidate.surahNumber === candidate.surahNumber)) { diversity += 1; relaxed.push('surah_diversity'); }

    /* حماية المتسابقين القادمين.
       العقوبة فرقيّة لا مطلقة: يُعاقب المرشح بما يزيد ضغطُه على ضغط نطاق صاحبه.
       فمن كان نطاقه هو الأندر لم يُمنع من مورده الوحيد حمايةً لمن هو أوسع حيلةً منه،
       ومن كان له بدائل كثيرة لم يستهلك موردًا لا يملك غيره سواه. */
    const rawPressure = this.scarcity?.pressureOfLocus(key) ?? 0;
    const scarcityPressure = Math.max(0, rawPressure - (request.scarcityBaseline ?? 0));
    if (scarcityPressure > 0) relaxed.push('scarcity_preservation');

    const score =
      w.difficulty * difficultyGap +
      w.modelBalance * modelBalancePenalty(chosen, candidate, target) +
      w.usage * usagePressure +
      w.exposure * exposurePressure +
      w.scarcity * scarcityPressure +
      w.separation * separation +
      w.neighborhood * neighborhood +
      w.diversity * diversity +
      w.jitter * seededUnit(this.seed, `${request.participantId}|${slot.index}|${candidate.id}`);

    return { score, uses, scarcityPressure, exposurePressure, relaxed, lastSequence: row?.lastSequence };
  }

  selectForParticipant(request: SelectionRequest, candidates: QuestionCandidate[]): SelectionResult {
    const excluded = new Set(request.excludedIds || []);
    const chosen: SelectedQuestion[] = [];
    const failures: SelectionFailure[] = [];
    const relaxations = new Set<string>();
    const position = request.sequencePosition ?? this.sequence;

    for (const slot of request.slots) {
      const scoped = this.candidateResolver ? this.candidateResolver(slot.scope) : candidates;
      const eligible = this.eligible(scoped, request, slot, chosen, excluded);
      const spaced = this.neighborhoodFilter(eligible, chosen);
      if (spaced.relaxed) relaxations.add('neighborhood');
      const pool = this.usageBand(spaced.rows);
      if (!pool.length) {
        failures.push({
          slotIndex: slot.index, code: 'NO_ELIGIBLE_QUESTION',
          ar: `لا يوجد سؤال صالح للخانة ${slot.index + 1} داخل ${slot.zoneNameArabic}.`,
          en: `No eligible question for slot ${slot.index + 1} inside ${slot.zoneName}.`,
        });
        continue;
      }
      // العدالة التكيّفية: الهدف يتحرك بحسب ما خرج في هذا النموذج، لا بحسب أداء المتسابق.
      const baseTarget = slot.targetDifficulty ?? request.targetDifficulty ?? this.defaultTargetDifficulty;
      const target = adaptiveTarget(baseTarget, chosen, request.slots.length);
      let winner: { candidate: QuestionCandidate; score: number; uses: number; scarcityPressure: number; exposurePressure: number; relaxed: string[]; lastSequence?: number } | null = null;
      let runnerUp = Infinity;
      for (const entry of pool) {
        const scored = { candidate: entry.candidate, ...this.score(entry, request, slot, chosen, target) };
        if (!winner || scored.score < winner.score || (scored.score === winner.score && scored.candidate.id < winner.candidate.id)) {
          if (winner) runnerUp = Math.min(runnerUp, winner.score);
          winner = scored;
        } else runnerUp = Math.min(runnerUp, scored.score);
      }
      if (!winner) continue;
      for (const name of winner.relaxed) relaxations.add(name);
      const key = locusKeyOf(winner.candidate);
      const row = this.usage.get(key) || { uses: 0, lastSequence: -Infinity, halls: [], days: [], stages: [] };
      if (row.uses + (winner.candidate.priorUsageCount || 0) > 0) this.repeats++;
      chosen.push({
        slotIndex: slot.index,
        candidate: winner.candidate,
        reason: {
          matchedScope: true,
          matchedZone: slot.zoneId !== null,
          zoneId: slot.zoneId,
          zoneRelaxed: !!slot.relaxed,
          matchedReading: readingMatches(winner.candidate, request.reading),
          targetDifficulty: Number(target.toFixed(3)),
          actualDifficulty: winner.candidate.difficultyRating,
          difficultyAssurance: winner.candidate.difficultyAssurance,
          usesBeforeSelection: winner.uses,
          participantGapAtSelection: Number.isFinite(winner.lastSequence ?? NaN) ? position - (winner.lastSequence as number) : null,
          scarcityPressure: Number(winner.scarcityPressure.toFixed(4)),
          exposurePressure: Number(winner.exposurePressure.toFixed(4)),
          alternativeCandidates: eligible.length,
          score: Number(winner.score.toFixed(4)),
          runnerUpScore: Number.isFinite(runnerUp) ? Number(runnerUp.toFixed(4)) : null,
          relaxedPreferences: [...new Set(winner.relaxed)],
        },
      });
      row.uses += 1;
      row.lastSequence = position;
      if (request.atMs !== undefined) row.lastAtMs = request.atMs;
      if (request.hallId && !row.halls.includes(request.hallId)) row.halls.push(request.hallId);
      if (request.day && !row.days.includes(request.day)) row.days.push(request.day);
      if (request.stage && !row.stages.includes(request.stage)) row.stages.push(request.stage);
      this.usage.set(key, row);
      const history = this.participantHistory.get(request.participantId) || new Set<string>();
      history.add(key);
      this.participantHistory.set(request.participantId, history);
      this.totalDraws++;
    }

    this.sequence = position + 1;
    const difficulties = chosen.map(x => x.candidate.difficultyRating);
    const mean = difficulties.length ? difficulties.reduce((a, b) => a + b, 0) / difficulties.length : 0;
    const variance = difficulties.length ? difficulties.reduce((a, b) => a + (b - mean) ** 2, 0) / difficulties.length : 0;
    return {
      participantId: request.participantId,
      questions: chosen,
      failures,
      aggregateDifficulty: Number(mean.toFixed(3)),
      difficultyVariance: Number(variance.toFixed(4)),
      minDifficulty: difficulties.length ? Math.min(...difficulties) : 0,
      maxDifficulty: difficulties.length ? Math.max(...difficulties) : 0,
      repeatsUsed: chosen.filter(x => x.reason.usesBeforeSelection > 0).length,
      relaxations: [...relaxations],
      engineVersion: QUESTION_ENGINE_VERSION,
    };
  }
}

function readingMatches(candidate: QuestionCandidate, reading?: ReadingContext) {
  if (!reading) return true;
  if (reading.qiraahId && candidate.qiraahId && candidate.qiraahId !== reading.qiraahId) return false;
  if (reading.rawiId && candidate.rawiId && candidate.rawiId !== reading.rawiId) return false;
  if (reading.tariqId && candidate.tariqId && candidate.tariqId !== reading.tariqId) return false;
  // سؤالٌ بلا سياق قراءة لا يُفترض مطابقًا حين يُطلب سياق بعينه.
  if (reading.rawiId && !candidate.rawiId) return false;
  return true;
}

/**
 * ميزانية الصعوبة: التوازن على مستوى النموذج كله لا على السؤال الواحد.
 * نموذجان مجموعهما متقارب عادلان ولو اختلف كل سؤال فيهما عن نظيره.
 */
function modelBalancePenalty(chosen: SelectedQuestion[], candidate: QuestionCandidate, target: number) {
  if (!chosen.length) return 0;
  const values = [...chosen.map(x => x.candidate.difficultyRating), candidate.difficultyRating];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.abs(mean - target);
}

/** يقارب الهدف ما تبقّى من النموذج نحو المتوسط المطلوب — بلا نظرٍ إلى أداء المتسابق إطلاقًا. */
function adaptiveTarget(base: number, chosen: SelectedQuestion[], totalSlots: number) {
  if (!chosen.length || totalSlots <= 1) return base;
  const drawn = chosen.reduce((sum, x) => sum + x.candidate.difficultyRating, 0);
  const remaining = Math.max(1, totalSlots - chosen.length);
  const wanted = base * totalSlots - drawn;
  return Math.max(1, Math.min(5, wanted / remaining));
}

/** عدد المواضع المميزة (بالبداية) في قائمة مرشحين — مقياس السعة الحقيقية لا عدد الصفوف. */
export function uniqueLocusCount(candidates: QuestionCandidate[]): number {
  return new Set(candidates.map(locusKeyOf)).size;
}

/** المرشحون الواقعون داخل نطاق بعينه — الأساس لقياس الكفاية لكل نطاق على حدة. */
export function candidatesInScope(candidates: QuestionCandidate[], scope: QuranScope): QuestionCandidate[] {
  const normalized = normalizeScope(scope);
  const ranges = scopeRanges(normalized);
  if (!ranges.length) return [];
  return candidates.filter(c => {
    const from = ayahOrdinal({ surah: c.surahNumber, ayah: c.startAyah });
    const to = ayahOrdinal({ surah: c.surahNumber, ayah: c.endAyah });
    return ranges.some(([a, b]) => from >= a && to <= b);
  });
}

export function locusOfCandidate(candidate: QuestionCandidate): QuranLocus {
  return { surah: candidate.surahNumber, ayah: candidate.startAyah };
}
