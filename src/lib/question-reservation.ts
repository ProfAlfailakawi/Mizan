/*
 * دورة حياة حجز السؤال.
 *
 * بين لحظة اختيار المحرك للسؤال ولحظة كشفه في القاعة مسافةٌ زمنية حقيقية: المتسابق في
 * الطابور، أو تأخّر، أو لم يحضر. وفي هذه المسافة يجب أن يُجاب سؤالان:
 *
 *   ١) هل يجوز أن يُسحب هذا الموضع لمتسابق آخر؟ — لا، ما دام الحجز قائمًا.
 *   ٢) وإن لم يحضر صاحبه؟ — لا يبقى الموضع رهينةً إلى الأبد؛ للحجز مدة معلنة، فإذا انقضت
 *      عاد الموضع إلى المخزون وحده، بلا تدخل بشري وبلا قرار صامت.
 *
 * والانتقالات محصورة في جدول واحد: لا يُكشف موضعٌ أُطلق، ولا يُطلق موضعٌ كُشف. وكل انتقال
 * يُسجَّل في تاريخ السجل نفسه بمن فعله ولماذا، فالحجز الذي لا يُعرف سببه ليس حجزًا بل ضياع.
 */

import type { QuestionReservationRecord, QuestionReservationState } from '../types';

/** المدة الافتراضية للحجز المؤقت: ربع ساعة تكفي طابورًا معقولًا ولا تعطّل قاعة. */
export const DEFAULT_RESERVATION_TTL_SECONDS = 900;

/*
 * افتراضٌ يُصرَّح به: كل وقتٍ هنا وقتُ الجهاز الذي كتبه.
 *
 * `expiresAt` يُحسب بساعة الجهاز الحاجز، ويُقارَن بساعة الجهاز الكانس. وليس في النظام
 * كلِّه وقتُ خادمٍ موثوق. والمسابقة تعمل على أجهزة قاعاتٍ متعددة، بعضها بلا شبكة، فساعاتها
 * مستقلة — والانحراف واقعٌ متوقَّع لا نادر.
 *
 * وأثره مقيسٌ لا مقدَّر (انظر tests/reservation-clock-skew.test.ts):
 *   · جهازٌ ساعته متأخرة → الحجز **يولد منقضيًا**: يُكتب expiresAt في الماضي، فيَكنسه
 *     أولُ جهازٍ صحيح الساعة، ويصير الموضع حرًّا والمتسابق واقفٌ أمام اللجنة. ولا يُخبَر
 *     أحد: الحجز يعود ناجحًا.
 *   · جهازٌ ساعته متقدمة → الحجز يحجب ٤٥ دقيقة والمعلن ١٥. والمدة المعلنة حينئذٍ ليست
 *     المدة الواقعة.
 *
 * فالمدة المعلنة صادقةٌ ما دامت الساعات متفقة، وكاذبةٌ بقدر انحرافها. وعلاجُ هذا وقتٌ
 * موثوق من الخادم (مثل serverTimestamp)، وهو قرارُ بنيةٍ لا يُتخذ في هذا الملف. وإنما
 * يُكتب هنا لئلا يُظنّ محلولًا.
 */

/*
 * لمن هذا الحجز؟
 *
 * السجلّ يحمل `organizationId` و`competitionId` منذ أول يوم — ولم يكن أحدٌ يقرؤهما.
 * فكانت قراءات الدفتر كلُّها تمسح السجلّ بلا تمييز، ومواضعُ المصحف واحدةٌ عند الجميع
 * (`2:255` هو `2:255` في كل مسابقة على وجه الأرض). فحجزُ جهةٍ يمنع جهةً أخرى من موضعٍ
 * لا شأن لها به، ويُذكر في رسالة التزاحم **كودُ متسابقٍ من جهةٍ أخرى** — فهو منعٌ
 * وتسريبٌ معًا.
 *
 * ويكفي في وقوعه أن تُبدَّل المسابقة: `selectCompetition` يبدّل المسابقة ولا يمسح
 * الدفتر. فالعطب داخل الجهة الواحدة قبل أن يكون بين جهتين.
 *
 * فصار كلُّ قارئٍ للدفتر يُسأل: لمن تقرأ؟ ومن لم يُجب قرأ الكلّ كما كان — لأن الدوالّ
 * تُستعمل في فحوصٍ ومحاكاةٍ لا تعرف جهة. والكتابةُ تُعيد الدفتر كاملًا دائمًا: العزل
 * في **القراءة** لا في الحفظ، فلا يضيع سجلُّ أحد.
 */
export interface ReservationScope { organizationId: string; competitionId: string }

const inScope = (record: QuestionReservationRecord, scope?: ReservationScope) =>
  !scope || (record.organizationId === scope.organizationId && record.competitionId === scope.competitionId);

/** الانتقالات المسموحة وحدها. ما ليس هنا مرفوض بصريح النص لا بالسكوت. */
export const RESERVATION_TRANSITIONS: Record<QuestionReservationState, QuestionReservationState[]> = {
  available: ['temporarily_reserved', 'assigned', 'quarantined'],
  temporarily_reserved: ['assigned', 'released', 'quarantined'],
  assigned: ['revealed', 'released', 'quarantined'],
  revealed: ['quarantined'],
  released: ['temporarily_reserved', 'assigned', 'quarantined'],
  quarantined: [],
};

export const RESERVATION_STATE_ARABIC: Record<QuestionReservationState, string> = {
  available: 'متاح',
  temporarily_reserved: 'محجوز مؤقتًا',
  assigned: 'مخصَّص',
  revealed: 'مكشوف',
  released: 'مُطلق',
  quarantined: 'محجور',
};

export interface ReserveInput {
  records: QuestionReservationRecord[];
  organizationId: string;
  competitionId: string;
  items: { locusKey: string; questionId: string }[];
  participantId?: string;
  sessionId?: string;
  modelId?: string;
  /** مفتاح ثبات الطلب: الطلب نفسه مرتين لا ينتج حجزين. */
  idempotencyKey: string;
  actorId: string;
  ttlSeconds?: number;
  now?: string;
  newId: (prefix: string) => string;
}

export interface ReserveOutcome {
  records: QuestionReservationRecord[];
  created: QuestionReservationRecord[];
  /** ما تعذّر حجزه لأن غيره يحجزه الآن، أو لأنه محجور. */
  conflicts: { locusKey: string; heldBy?: string; state: QuestionReservationState }[];
  /** صحيحٌ إذا كان هذا الطلب قد نُفّذ من قبل بالمفتاح نفسه، فلم يُنشأ شيء جديد. */
  replayed: boolean;
}

const iso = (base: string, addSeconds: number) => new Date(new Date(base).getTime() + addSeconds * 1000).toISOString();

/** هل انقضت مدة الحجز المؤقت؟ الانقضاء وحده لا يغيّر السجل؛ يغيّره expireReservations. */
export function reservationExpired(record: QuestionReservationRecord, now: string): boolean {
  return record.state === 'temporarily_reserved' && !!record.expiresAt && record.expiresAt <= now;
}

/** الحالة الفعلية لحظةَ السؤال: المنقضي يُقرأ متاحًا وإن لم يُكتب بعد. */
export function effectiveState(record: QuestionReservationRecord, now: string): QuestionReservationState {
  return reservationExpired(record, now) ? 'released' : record.state;
}

/*
 * المواضع التي لا يجوز سحبها الآن لغير أصحابها.
 *
 * والحدّ هنا **جلسةٌ مفتوحة**، لا جلسةٌ مضت. فالحاجز يمنع أن يخرج الموضع لاثنين في اللحظة
 * نفسها — لا أن يُستعمل مرة أخرى بعد أن انتهى صاحبه.
 *
 * وكان `revealed` محسوبًا حاجبًا، فصار الدفتر يمنع كل إعادة استعمال إلى الأبد. وذلك يناقض
 * سياسة التكرار مناقضةً صريحة: السياسة تحسب أن الحدّ الأدنى الرياضي قد يكون اثنين — أي أن
 * إعادة الاستعمال **واجبة** لا مباحة — ثم يأتي الدفتر فيمنعها. نظامان بقاعدتين متضادّتين،
 * والتناقض صامت.
 *
 * فما بعد الكشف يحكمه من يملك حكمه: **سياسة التكرار** (كم مرة)، و**مباعدةُ المحرك**
 * (بالتسلسل والوقت والقاعة واليوم والمرحلة). وهذه المباعدة **ترجيحٌ لا منع**: مباعدة
 * القاعة تزيد ثقل الموضع ولا تُسقطه، فتُغلب عند الشحّ — وقد وقع ذلك فعلًا في يومٍ بثلاثة
 * آلاف متسابق، فسُمع موضعٌ مرتين في قاعةٍ واحدة. وهذا مقصودٌ لا خلل: المحرك يحني المفضَّل
 * ولا يكسر الواجب، **ويُعلن ما حناه** في تقرير العدالة تحت «ما اضطر المحرك إلى التنازل
 * عنه». فلا يُتَّكل هنا على منعٍ باتٍّ لا وجود له.
 *
 * والحجرُ وحده يبقى حاجبًا أبديًا، لأن الموضع المعيب معيبٌ في كل حال.
 */
export function blockedLocusKeys(records: QuestionReservationRecord[], now = new Date().toISOString(), exceptParticipantId?: string, scope?: ReservationScope): Set<string> {
  const blocked = new Set<string>();
  for (const record of records) {
    if (!inScope(record, scope)) continue;
    const state = effectiveState(record, now);
    if (state === 'quarantined') { blocked.add(record.locusKey); continue; }
    if (state !== 'temporarily_reserved' && state !== 'assigned') continue;
    if (exceptParticipantId && record.participantId === exceptParticipantId) continue;
    blocked.add(record.locusKey);
  }
  return blocked;
}

/*
 * الحجز: مرورٌ واحد على الدفتر.
 *
 * كان الحجز الواحد يمرّ على الدفتر ثلاث مرات — مرةً يلتمس مفتاح الثبات، ومرةً يبني
 * مجموعة المحجوب كلِّه، ومرةً يبني خريطة الحائزين كلِّهم — ثم لا يسأل إلا عن مواضع هذا
 * الطلب وحدها، وهي ثلاثةٌ أو نحوها. فكان بناء الفهرسين بحجم الدفتر كلِّه لا بحجم السؤال،
 * فيغلو الحجز كلما طال اليوم: آخر من يدخل القاعة يدفع أضعاف ما دفعه أولهم، وكلُّ حجزٍ
 * يخلّف فهرسين يُبنيان ثم يُرميان.
 *
 * والمطلوب معلومٌ قبل المرور، فلا يُبنى فهرسٌ لغيره: مرورٌ واحد يلتقط ما يخصّ هذه المواضع
 * وحدها، فتبقى الفهارس بحجم الطلب لا بحجم اليوم.
 *
 * ويُسمّى في التزاحم السجلُّ المانعُ نفسه، لا سجلٌّ آخر يشاركه الموضع. فقد كانت الخريطة
 * تُبنى بالترتيب فيُذكر أقدمُ من مرّ بالموضع وإن كان غيرُه هو الحاجز الآن، فيُنسب الحجز
 * إلى من لا يحجزه. والتزاحم الذي يُسمّى فيه غيرُ صاحبه بلاغٌ كاذب.
 */
export function reserveQuestions(input: ReserveInput): ReserveOutcome {
  const now = input.now || new Date().toISOString();
  const ttl = Math.max(30, Math.round(input.ttlSeconds ?? DEFAULT_RESERVATION_TTL_SECONDS));

  const wanted = new Set(input.items.map(item => item.locusKey));
  const replayedRecords: QuestionReservationRecord[] = [];
  const blockedBy = new Map<string, QuestionReservationRecord>();

  const scope: ReservationScope = { organizationId: input.organizationId, competitionId: input.competitionId };
  for (const record of input.records) {
    if (!inScope(record, scope)) continue;
    if (record.idempotencyKey === input.idempotencyKey) replayedRecords.push(record);
    if (!wanted.has(record.locusKey)) continue;
    const state = effectiveState(record, now);
    const blocks = state === 'quarantined'
      || ((state === 'temporarily_reserved' || state === 'assigned')
        && !(input.participantId && record.participantId === input.participantId));
    if (!blocks) continue;
    /* والحجر أولى بالذكر من الحجز، لأن الموضع المعيب معيبٌ في كل حال لا في هذه الجلسة. */
    const known = blockedBy.get(record.locusKey);
    if (known && effectiveState(known, now) === 'quarantined') continue;
    blockedBy.set(record.locusKey, record);
  }

  if (replayedRecords.length) return { records: input.records, created: replayedRecords, conflicts: [], replayed: true };

  const conflicts: ReserveOutcome['conflicts'] = [];
  const created: QuestionReservationRecord[] = [];

  for (const item of input.items) {
    const holder = blockedBy.get(item.locusKey);
    if (holder) {
      conflicts.push({ locusKey: item.locusKey, heldBy: holder.participantId, state: effectiveState(holder, now) });
      continue;
    }
    const record: QuestionReservationRecord = {
      id: input.newId('qres'),
      organizationId: input.organizationId,
      competitionId: input.competitionId,
      locusKey: item.locusKey,
      questionId: item.questionId,
      participantId: input.participantId,
      sessionId: input.sessionId,
      modelId: input.modelId,
      state: 'temporarily_reserved',
      expiresAt: iso(now, ttl),
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
      history: [{ state: 'temporarily_reserved', at: now, by: input.actorId, reason: input.participantId ? `حجز مؤقت لمتسابق` : 'حجز مؤقت' }],
    };
    created.push(record);
    /* وموضعٌ تكرّر في الطلب نفسه لا يُحجز مرتين؛ وثانيه يُردّ باسم أولِه لا بلا اسم. */
    blockedBy.set(item.locusKey, record);
  }
  return { records: [...created, ...input.records], created, conflicts, replayed: false };
}

export interface TransitionOutcome {
  records: QuestionReservationRecord[];
  changed: QuestionReservationRecord[];
  rejected: { id: string; from: QuestionReservationState; to: QuestionReservationState }[];
}

/** انتقال محكوم بالجدول. المرفوض يُقال صراحةً بدل أن يُبتلع. */
export function transitionReservations(input: {
  records: QuestionReservationRecord[];
  ids: string[];
  to: QuestionReservationState;
  actorId: string;
  reason?: string;
  now?: string;
}): TransitionOutcome {
  const now = input.now || new Date().toISOString();
  const wanted = new Set(input.ids);
  const changed: QuestionReservationRecord[] = [];
  const rejected: TransitionOutcome['rejected'] = [];
  const records = input.records.map(record => {
    if (!wanted.has(record.id)) return record;
    const from = effectiveState(record, now);
    if (from === input.to) return record;
    if (!RESERVATION_TRANSITIONS[from].includes(input.to)) { rejected.push({ id: record.id, from, to: input.to }); return record; }
    const next: QuestionReservationRecord = {
      ...record,
      state: input.to,
      updatedAt: now,
      expiresAt: input.to === 'temporarily_reserved' ? record.expiresAt : undefined,
      history: [...record.history, { state: input.to, at: now, by: input.actorId, reason: input.reason }],
    };
    changed.push(next);
    return next;
  });
  return { records, changed, rejected };
}

/*
 * إطلاق ما انقضت مدته.
 *
 * يُكتب هنا مباشرةً لا عبر transitionReservations: ذاك يقرأ الحالة الفعلية، والمنقضي
 * يُقرأ «مُطلقًا» أصلًا، فيرى الانتقال إلى «مُطلق» انتقالًا إلى ما هو فيه فلا يكتب شيئًا —
 * فيبقى السجل مكتوبًا فيه «محجوز مؤقتًا» إلى الأبد. الانقضاء واقعٌ يُثبَّت في السجل.
 */
export function expireReservations(records: QuestionReservationRecord[], now = new Date().toISOString(), actorId = 'system', scope?: ReservationScope): TransitionOutcome {
  const expired = new Set(records.filter(r => inScope(r, scope) && reservationExpired(r, now)).map(r => r.id));
  if (!expired.size) return { records, changed: [], rejected: [] };
  const changed: QuestionReservationRecord[] = [];
  const next = records.map(record => {
    if (!expired.has(record.id)) return record;
    const released: QuestionReservationRecord = {
      ...record, state: 'released', updatedAt: now, expiresAt: undefined,
      history: [...record.history, { state: 'released', at: now, by: actorId, reason: 'انقضت مدة الحجز المؤقت' }],
    };
    changed.push(released);
    return released;
  });
  return { records: next, changed, rejected: [] };
}

export function reservationSummary(records: QuestionReservationRecord[], now = new Date().toISOString(), scope?: ReservationScope) {
  const counts: Record<QuestionReservationState, number> = { available: 0, temporarily_reserved: 0, assigned: 0, revealed: 0, released: 0, quarantined: 0 };
  let total = 0;
  for (const record of records) { if (!inScope(record, scope)) continue; total++; counts[effectiveState(record, now)]++; }
  /* «القائم» ما يحجب الآن: المؤقت والمخصَّص. والمكشوف انتهى أمره فلا يُعدّ قائمًا. */
  return { counts, total, held: counts.temporarily_reserved + counts.assigned };
}
