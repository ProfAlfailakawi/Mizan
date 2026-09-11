/*
 * سياسة التكرار.
 *
 * Mizan does not promise zero repetition when mathematically impossible. It minimizes
 * repetition, maximizes separation, balances reuse, and records the reason.
 * ميزان لا يَعِد بعدم التكرار حين يكون التكرار مستحيلَ الاجتناب رياضيًا؛ يُقلّله، ويُباعد بين
 * استعمالاته، ويوازن الحمل، ويسجّل السبب.
 *
 * ألف متسابق كلّهم في الجزء الأول، وبنكٌ فيه مئة وستة وعشرون موضعًا صالحًا: التكرار حتمي.
 * نظامٌ يرفع `noRepeat = true` هنا لا يكون عادلًا — يكون متوقفًا.
 *
 * كل قيد يعرف رتبته:
 *   MUST   — فشله يُبطل السؤال (النطاق، الرواية، الاعتماد، المنطقة، تكرار على المتسابق نفسه).
 *   PREFER — يُحاوَل ويُسجَّل سبب التنازل عنه (عدم تكرار السورة، التباعد المثالي، أقل استعمالًا).
 */

export type RepeatMode = 'strict_no_repeat' | 'repeat_when_necessary' | 'balanced_reuse';
export type ConstraintRank = 'MUST' | 'PREFER';

export interface RepeatPolicy {
  version: number;
  mode: RepeatMode;
  /** أقصى عدد استعمالات للموضع الواحد في هذه المسابقة. صفر أو غير محدد = بلا سقف صريح. */
  maxUsesPerQuestion?: number;
  /** أقل عدد متسابقين بين استعمالين للموضع نفسه. */
  minimumParticipantGap?: number;
  /** أقل فاصل زمني بالدقائق بين استعمالين. */
  minimumMinutesGap?: number;
  /** لا يُعاد الموضع نفسه للمتسابق نفسه أبدًا. MUST. */
  noRepeatWithinParticipant: boolean;
  /** لا يتكرر الموضع داخل نموذج واحد. MUST. */
  noRepeatWithinModel: boolean;
  /** لا يتكرر عبر جولات البطولة للمتسابق نفسه. */
  noRepeatAcrossRoundsForParticipant: boolean;
  /** تجنّب الموضع المستعمل في القاعة/اللجنة نفسها قريبًا. */
  roomAware: boolean;
  /** تجنّب إعادة الاستعمال في اليوم نفسه إن أمكن. */
  dayAware: boolean;
  /** تجنّب إعادة الاستعمال في المرحلة نفسها إن أمكن. */
  stageAware: boolean;
  /**
   * نصف قطر الجوار بالآيات: موضعان بدايتهما متقاربة ليسا مختلفَين عمليًا ولو اختلف المعرّف.
   * صفر يعطّل الاعتبار.
   */
  neighborhoodAyahRadius: number;
  /** هل يمتد منع التكرار إلى تاريخ المتسابق خارج هذه المسابقة؟ قرار تنظيمي وخصوصي. */
  participantHistoryScope: 'none' | 'competition' | 'organization';
  /** هل يُسمح باستعمال سؤال لم يُراجَع علميًا؟ */
  allowUnreviewedDifficulty: boolean;
}

export const DEFAULT_REPEAT_POLICY: RepeatPolicy = {
  version: 1,
  mode: 'repeat_when_necessary',
  minimumParticipantGap: 25,
  noRepeatWithinParticipant: true,
  noRepeatWithinModel: true,
  noRepeatAcrossRoundsForParticipant: true,
  roomAware: true,
  dayAware: false,
  stageAware: false,
  neighborhoodAyahRadius: 3,
  participantHistoryScope: 'competition',
  allowUnreviewedDifficulty: true,
};

export const STRICT_REPEAT_POLICY: RepeatPolicy = {
  ...DEFAULT_REPEAT_POLICY,
  mode: 'strict_no_repeat',
  maxUsesPerQuestion: 1,
  minimumParticipantGap: 0,
  allowUnreviewedDifficulty: false,
};

export interface RepeatConstraint {
  id: string;
  rank: ConstraintRank;
  ar: string;
  en: string;
}

export function repeatConstraints(policy: RepeatPolicy): RepeatConstraint[] {
  const list: RepeatConstraint[] = [
    { id: 'participant_scope', rank: 'MUST', ar: 'السؤال داخل نطاق المتسابق المعتمد', en: 'Question lies inside the approved participant scope' },
    { id: 'reading_context', rank: 'MUST', ar: 'مطابقة القراءة والرواية والطريق', en: 'Reading context matches (qiraah / riwaya / tariq)' },
    { id: 'approval_status', rank: 'MUST', ar: 'السؤال معتمد وغير محجور', en: 'Question is approved and not quarantined' },
  ];
  if (policy.noRepeatWithinModel) list.push({ id: 'no_repeat_in_model', rank: 'MUST', ar: 'لا يتكرر الموضع داخل النموذج الواحد', en: 'No locus repeats inside one model' });
  if (policy.noRepeatWithinParticipant) list.push({ id: 'no_repeat_for_participant', rank: 'MUST', ar: 'لا يُعاد الموضع للمتسابق نفسه', en: 'A locus is never returned to the same participant' });
  if (policy.mode === 'strict_no_repeat') list.push({ id: 'strict_unique', rank: 'MUST', ar: 'لا يتكرر الموضع في المسابقة كلها', en: 'No locus repeats anywhere in the competition' });
  if (policy.maxUsesPerQuestion) list.push({ id: 'max_uses', rank: 'MUST', ar: `لا يتجاوز استعمال الموضع ${policy.maxUsesPerQuestion} مرات`, en: `A locus is used at most ${policy.maxUsesPerQuestion} times` });
  if (policy.minimumParticipantGap) list.push({ id: 'participant_gap', rank: 'PREFER', ar: `مباعدة ${policy.minimumParticipantGap} متسابقًا على الأقل بين استعمالين`, en: `At least ${policy.minimumParticipantGap} participants between reuses` });
  if (policy.minimumMinutesGap) list.push({ id: 'time_gap', rank: 'PREFER', ar: `مباعدة ${policy.minimumMinutesGap} دقيقة على الأقل بين استعمالين`, en: `At least ${policy.minimumMinutesGap} minutes between reuses` });
  if (policy.neighborhoodAyahRadius > 0) list.push({ id: 'neighborhood', rank: 'PREFER', ar: `تجنّب بداية على بعد ${policy.neighborhoodAyahRadius} آيات أو أقل من موضع مستعمل`, en: `Avoid starts within ${policy.neighborhoodAyahRadius} ayat of a recently used locus` });
  if (policy.roomAware) list.push({ id: 'room_separation', rank: 'PREFER', ar: 'تجنّب إعادة الاستعمال في القاعة نفسها', en: 'Avoid reuse inside the same hall' });
  if (policy.dayAware) list.push({ id: 'day_separation', rank: 'PREFER', ar: 'تجنّب إعادة الاستعمال في اليوم نفسه', en: 'Avoid reuse on the same day' });
  list.push({ id: 'usage_balance', rank: 'PREFER', ar: 'توزيع الاستعمال بالتساوي على المواضع الصالحة', en: 'Spread usage evenly across eligible loci' });
  list.push({ id: 'scarcity_preservation', rank: 'PREFER', ar: 'حماية المواضع النادرة للمتسابقين القادمين', en: 'Preserve scarce loci for upcoming participants' });
  return list;
}

/** وصف السياسة بلغة مسؤول المسابقة، لا بلغة المهندس. */
export function describeRepeatPolicy(policy: RepeatPolicy, arabic: boolean): string {
  if (arabic) {
    switch (policy.mode) {
      case 'strict_no_repeat': return 'لا يتكرر أي سؤال إطلاقًا. يتطلب بنكًا يكفي كل المتسابقين، وإلا توقفت المسابقة.';
      case 'balanced_reuse': return 'يُعاد استعمال المواضع بتوازن مقصود، فلا يحمل موضعٌ عبء غيره.';
      default: return 'يحاول ميزان استعمال مواضع مختلفة أولًا، ولا يعيد السؤال إلا عندما لا يسمح حجم البنك وعدد المتسابقين بتحقيق عدم التكرار.';
    }
  }
  switch (policy.mode) {
    case 'strict_no_repeat': return 'No question is ever repeated. Requires a pool large enough for every participant, or the competition stops.';
    case 'balanced_reuse': return 'Loci are deliberately reused in balance so no single locus carries the load.';
    default: return 'Mizan uses fresh loci first and repeats only when pool size and participant count make no-repeat impossible.';
  }
}

/** الحدّ الأدنى النظري لإعادة الاستعمال. يفصل التكرار الحتمي عن التكرار الذي سببته الخوارزمية. */
export function theoreticalRepeatFloor(input: { draws: number; uniqueLoci: number }) {
  const draws = Math.max(0, Math.round(input.draws));
  const loci = Math.max(0, Math.round(input.uniqueLoci));
  if (!loci) return { averageReuse: 0, minimumMaxUses: 0, unavoidableRepeats: draws, feasibleWithoutRepeat: false };
  const averageReuse = draws / loci;
  return {
    averageReuse: Number(averageReuse.toFixed(3)),
    /** أقل قيمة ممكنة لأكثر موضع استعمالًا حين يوزَّع الحمل توزيعًا مثاليًا. */
    minimumMaxUses: Math.ceil(averageReuse),
    unavoidableRepeats: Math.max(0, draws - loci),
    feasibleWithoutRepeat: draws <= loci,
  };
}
