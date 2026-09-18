/*
 * التعادل: مَن يقرّر، وبأيّ حجّة.
 *
 * حين يتساوى متسابقان على مركزٍ لا يسع إلا واحدًا، للنظام ثلاثة مسالك: أن يرتّبهما
 * بمسطرةٍ من عنده، أو أن يمنح المركز لكليهما، أو أن يقول «تعادل» ويقف. وقد كان يسلك
 * الأوّل صامتًا: الترتيب في `award-places.ts` ينتهي إلى
 * `a.participantCode.localeCompare(b.participantCode)`، أي أن أبجديّة رمز المتسابق تفصل
 * بين متساويين. وهذه مسطرةٌ لا علاقة لها بالحفظ ولا بالأداء، ولا يعلم بها أحدٌ ممّن
 * يقرأ النتيجة — ولو عُلمت لما قُبلت.
 *
 * فالتعادل هنا واقعةٌ تُعلن لا تُحلّ: النظام يرصدها، ويحجب الترتيب، ولا يُعلن المركز
 * نهائيًّا حتى يُسجَّل قرارُ بشرٍ مسؤول بسببٍ مكتوب.
 *
 * ومَن هذا البشر؟ **الإدارة، لا اللجنة.** واللجنة تُقيّم: تسمع وتضع الدرجة، وقد فعلت
 * وانتهت إلى تساوٍ — وهو حكمُها الصحيح لا نقصٌ فيه. فلو طُلب منها أن تفصل بين من
 * ساوت بينهما، طُلب منها أن تنقض تقييمَها بلا مسوّغٍ من السماع. والفصلُ بعد ذلك قرارٌ
 * إداريّ بلائحةٍ إداريّة (مقعدٌ يُقسم، أو معيارٌ منصوص، أو مركزٌ يُشرَّك)، فيُنسب إلى
 * من يملكه ويُسأل عنه.
 *
 * والسبب مكتوبٌ شرطًا: قرارٌ بلا سبب لا يُراجَع ولا يُعترض عليه ولا يُقاس عليه في
 * الدورة القادمة، وهو أقربُ إلى المزاج منه إلى اللائحة.
 *
 * ولا يُخترع هنا معيارُ ترجيح: لا العمر، ولا أسبقيّةُ التسجيل، ولا عددُ الأخطاء. أيُّ
 * معيارٍ من هذه قرارُ لائحةٍ يملكه المالك، وكتابتُه في الشيفرة اختراعُ سياسةٍ باسم من
 * لم يقلها.
 *
 * وما يملكه المالك فعلًا مكتوبٌ قبل ذلك: `ruleSet.tieBreakRules` — أولويّةُ الحفظ ثم
 * التجويد ثم أقلّ المخالفات. تلك قواعدُ رُبريكٍ معلنة تُطبَّق أوّلًا في `award-places.ts`،
 * فلا يُرفع إلى الإدارة إلا ما عجزت عنه. ويُذكر في `rulesTried` أنها طُبِّقت ولم تفصل،
 * كي لا يُقرأ صعودُ التعادل إليها إهمالًا للقواعد.
 */

import type { AwardPlace } from './award-places';

/**
 * الأدوار التي تملك الفصل في التعادل — إداريّة كلُّها.
 *
 * `super_admin` مذكورٌ لأنه مالك المنصّة وله ما للإدارة، لا استثناءً تقنيًّا.
 */
export const TIE_DECISION_ROLES = ['comp_admin', 'org_admin', 'super_admin'] as const;
export type TieDecisionRole = (typeof TIE_DECISION_ROLES)[number];

/** أدوار اللجنة. تُذكر باسمها كي يُردّ عليها بسببها لا برفضٍ عامّ. */
export const TIE_COMMITTEE_ROLES = ['head_judge', 'judge'] as const;

/** أقلّ ما يُقبل سببًا. سطرٌ من كلمةٍ واحدة («تعادل») ليس سببًا. */
export const TIE_REASON_MIN_LENGTH = 12;

export interface TieParticipant {
  participantId: string;
  participantCode: string;
}

/** تعادلٌ قائم: متساوون يتجاوزون المقاعد الباقية في مركزٍ بعينه. */
export interface TieGroup {
  /** مفتاحٌ يربط القرار بهذا التعادل بعينه؛ إن تغيّرت الدرجات بطل القرار. */
  key: string;
  placeRank: number;
  placeTitleArabic: string;
  placeTitleEnglish: string;
  /** النسبة التي وقع عندها التعادل. */
  percentage: number;
  /** المقاعد الباقية في المركز لهؤلاء المتساوين. */
  seatsRemaining: number;
  /** قواعد الرُبريك المعلنة التي طُبِّقت ولم تفصل بينهم. فارغةٌ تعني أن المسابقة لم تُعلن قاعدة. */
  rulesTried: string[];
  /** المتساوون، مرتّبون بالمعرّف — ترتيبُ عرضٍ لا ترتيبُ فوز. */
  participants: TieParticipant[];
}

/**
 * ما تقرّره الإدارة:
 *   · `ordered` — تُرتّب المتساوين بلائحتها، فيأخذ المقاعدَ أوائلُهم ويسقط الباقون إلى
 *     ما دون المركز، كأيّ متسابقٍ لم يبلغ عتبته.
 *   · `shared` — يُشرَّك المركز بين جميع المتساوين ولو تجاوزوا المقاعد.
 */
export type TieOutcomeKind = 'ordered' | 'shared';

export interface TieDecision {
  key: string;
  placeRank: number;
  outcome: TieOutcomeKind;
  /** ترتيب الإدارة. في `shared` يبقى فارغًا. */
  orderedParticipantIds: string[];
  reason: string;
  decidedBy: { userId: string; role: TieDecisionRole };
  decidedAt: string;
}

export type TieRefusalCode =
  | 'TIE_DECISION_NO_TIE'
  | 'TIE_DECISION_DECIDER_UNKNOWN'
  | 'TIE_DECISION_IS_ADMINISTRATION_NOT_COMMITTEE'
  | 'TIE_DECISION_ROLE_FORBIDDEN'
  | 'TIE_DECISION_REASON_REQUIRED'
  | 'TIE_DECISION_ORDER_INCOMPLETE'
  | 'TIE_DECISION_ORDER_DUPLICATED'
  | 'TIE_DECISION_PARTICIPANTS_MISMATCH';

export type TieDecisionResult =
  | { ok: true; decision: TieDecision }
  | { ok: false; code: TieRefusalCode; messageArabic: string; messageEnglish: string };

const refuse = (code: TieRefusalCode, messageArabic: string, messageEnglish: string): TieDecisionResult =>
  ({ ok: false, code, messageArabic, messageEnglish });

/**
 * مفتاح التعادل.
 *
 * يحمل المركز والنسبة وأسماء المتساوين، فلا يُقرأ قرارٌ اتُّخذ على تعادلٍ بين اثنين
 * إذنًا لتعادلٍ آخر بين ثلاثة بعد تعديل درجة. والمعرّفات تُرمَّز قبل الجمع كي لا يصنع
 * معرّفٌ يحمل فاصلةً مفتاحًا يطابق مفتاحَ غيره.
 */
export function tieGroupKey(input: { placeRank: number; percentage: number; participantIds: string[] }): string {
  const ids = [...new Set(input.participantIds)].sort().map(encodeURIComponent).join(',');
  return `tie:1:${input.placeRank}:${Number(input.percentage).toFixed(2)}:${ids}`;
}

/**
 * هل هنا تعادلٌ يحتاج قرارًا؟
 *
 * لا يكون التعادل نزاعًا إلا حين يتجاوز المتساوون المقاعدَ الباقية. متساويان على
 * مركزٍ بمقعدين ينالانه معًا ولا شيء يُقرَّر.
 */
export function tieNeedingDecision(input: {
  place: Pick<AwardPlace, 'rank' | 'titleArabic' | 'titleEnglish'>;
  seatsRemaining: number;
  percentage: number;
  tied: TieParticipant[];
  /** ما طُبِّق قبل الوصول إلى هنا من قواعد الرُبريك المعلنة. */
  rulesTried?: readonly string[];
}): TieGroup | null {
  const seatsRemaining = Math.max(0, Math.round(Number(input.seatsRemaining) || 0));
  const participants = [...input.tied].sort((a, b) => a.participantId.localeCompare(b.participantId));
  if (participants.length < 2 || participants.length <= seatsRemaining) return null;
  return {
    key: tieGroupKey({
      placeRank: input.place.rank,
      percentage: input.percentage,
      participantIds: participants.map(p => p.participantId),
    }),
    placeRank: input.place.rank,
    placeTitleArabic: input.place.titleArabic,
    placeTitleEnglish: input.place.titleEnglish,
    percentage: input.percentage,
    seatsRemaining,
    rulesTried: [...(input.rulesTried || [])],
    participants,
  };
}

/**
 * تسجيل قرار الإدارة. يُرَدّ برمزٍ مسمّى عند كل رفض، فلا يفشل القرار صامتًا ولا يُقبل
 * ناقصًا.
 */
export function tieDecision(input: {
  group: TieGroup | null;
  outcome: TieOutcomeKind;
  orderedParticipantIds?: string[];
  reason: string;
  decidedBy: { userId?: string | null; role?: string | null };
  now?: Date;
}): TieDecisionResult {
  const group = input.group;
  if (!group || group.participants.length < 2) {
    return refuse('TIE_DECISION_NO_TIE',
      'لا تعادل هنا يُقرَّر فيه.',
      'There is no tie here to decide.');
  }

  const userId = (input.decidedBy?.userId || '').trim();
  if (!userId) {
    return refuse('TIE_DECISION_DECIDER_UNKNOWN',
      'القرار يُنسب إلى شخصٍ بعينه؛ لا يُسجَّل بلا صاحب.',
      'A tie decision is attributed to a named person; it is not recorded anonymously.');
  }

  const role = (input.decidedBy?.role || '').trim();
  if ((TIE_COMMITTEE_ROLES as readonly string[]).includes(role)) {
    return refuse('TIE_DECISION_IS_ADMINISTRATION_NOT_COMMITTEE',
      'اللجنة تُقيّم ولا تُرتّب. التعادل حكمُها، والفصلُ فيه قرارٌ إداريّ.',
      'The committee scores; it does not rank. The tie is its verdict, and breaking it is an administrative decision.');
  }
  if (!(TIE_DECISION_ROLES as readonly string[]).includes(role)) {
    return refuse('TIE_DECISION_ROLE_FORBIDDEN',
      'هذا الدور لا يملك الفصل في التعادل.',
      'This role may not decide a tie.');
  }

  const reason = (input.reason || '').trim();
  if (reason.length < TIE_REASON_MIN_LENGTH) {
    return refuse('TIE_DECISION_REASON_REQUIRED',
      `السبب مكتوبٌ شرطًا (${TIE_REASON_MIN_LENGTH} حرفًا فأكثر): قرارٌ بلا سبب لا يُراجَع ولا يُقاس عليه.`,
      `A written reason is required (${TIE_REASON_MIN_LENGTH} characters or more): an unexplained decision cannot be reviewed or repeated.`);
  }

  let orderedParticipantIds: string[] = [];
  if (input.outcome === 'ordered') {
    const given = (input.orderedParticipantIds || []).map(id => String(id || '').trim()).filter(Boolean);
    if (new Set(given).size !== given.length) {
      return refuse('TIE_DECISION_ORDER_DUPLICATED',
        'تكرّر متسابقٌ في الترتيب.',
        'A participant appears twice in the ordering.');
    }
    if (given.length !== group.participants.length) {
      return refuse('TIE_DECISION_ORDER_INCOMPLETE',
        'الترتيب يشمل كلَّ المتساوين، لا أوائلَهم وحدهم: من لم يُذكر لا يُعلم أسقط أم نُسي.',
        'The ordering must cover every tied participant, not only the top ones: an omitted name cannot be told from a forgotten one.');
    }
    const expected = new Set(group.participants.map(p => p.participantId));
    if (given.some(id => !expected.has(id))) {
      return refuse('TIE_DECISION_PARTICIPANTS_MISMATCH',
        'الترتيب يذكر من ليس في هذا التعادل.',
        'The ordering names someone who is not in this tie.');
    }
    orderedParticipantIds = given;
  }

  return {
    ok: true,
    decision: {
      key: group.key,
      placeRank: group.placeRank,
      outcome: input.outcome === 'ordered' ? 'ordered' : 'shared',
      orderedParticipantIds,
      reason,
      decidedBy: { userId, role: role as TieDecisionRole },
      decidedAt: (input.now || new Date()).toISOString(),
    },
  };
}

/** القرار المطابق لهذا التعادل بعينه، إن وُجد. */
export function decisionForTie(group: TieGroup, decisions?: readonly TieDecision[] | null): TieDecision | null {
  if (!decisions?.length) return null;
  return decisions.find(d => d.key === group.key) || null;
}

/**
 * هل ما زال المركز موقوفًا؟ يُسأل قبل إعلان أيّ مركزٍ نهائيًّا وقبل طباعة شهادة.
 */
export function placeAwaitsTieDecision(group: TieGroup, decisions?: readonly TieDecision[] | null): boolean {
  return decisionForTie(group, decisions) === null;
}

/**
 * أثر القرار: من يأخذ المقاعد ومن يسقط إلى ما دونها.
 *
 * وبلا قرار لا يُقسم شيء — تُعاد القائمتان فارغتين والمركز موقوف.
 */
export function tieWinners(group: TieGroup, decision: TieDecision | null): { winners: string[]; fellThrough: string[] } {
  if (!decision || decision.key !== group.key) return { winners: [], fellThrough: [] };
  if (decision.outcome === 'shared') {
    return { winners: group.participants.map(p => p.participantId), fellThrough: [] };
  }
  return {
    winners: decision.orderedParticipantIds.slice(0, group.seatsRemaining),
    fellThrough: decision.orderedParticipantIds.slice(group.seatsRemaining),
  };
}

/** ما يُقرأ في الشاشة والسجل العام عن مركزٍ موقوف. */
export function describeTie(group: TieGroup, decision: TieDecision | null, arabic: boolean): string {
  const names = group.participants.length;
  if (!decision) {
    const rules = group.rulesTried.length
      ? (arabic
        ? ` وقواعد كسر التعادل المعلنة (${group.rulesTried.length}) طُبِّقت ولم تفصل بينهم.`
        : ` The ${group.rulesTried.length} published tie-break rule(s) were applied and did not separate them.`)
      : (arabic
        ? ' ولم تُعلن لهذه المسابقة قاعدةُ كسر تعادل.'
        : ' This competition publishes no tie-break rule.');
    return (arabic
      ? `${group.placeTitleArabic} موقوف: تعادل ${names} متسابقين عند ${group.percentage}٪ على ${group.seatsRemaining} مقعدًا.${rules} لا يُعلن حتى يُسجَّل قرار الإدارة بسببه.`
      : `${group.placeTitleEnglish} is on hold: ${names} participants tied at ${group.percentage}% for ${group.seatsRemaining} seat(s).${rules} It is not announced until the administration records a decision and its reason.`);
  }
  if (decision.outcome === 'shared') {
    return arabic
      ? `${group.placeTitleArabic} مُشرَّك بين ${names} متسابقين بقرار الإدارة: ${decision.reason}`
      : `${group.placeTitleEnglish} is shared among ${names} participants by administrative decision: ${decision.reason}`;
  }
  return arabic
    ? `${group.placeTitleArabic} فُصل فيه بقرار الإدارة: ${decision.reason}`
    : `${group.placeTitleEnglish} was decided by the administration: ${decision.reason}`;
}
