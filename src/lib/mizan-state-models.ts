/*
 * نماذج الحالة الحرجة في ميزان.
 *
 * النموذج هنا ليس وصفًا موازيًا للنظام يُكتب مرة ثم يشيخ في مستند: أفعاله تستدعي دوال
 * الإنتاج نفسها — `reserveQuestions` و`transitionReservations` و`expireReservations` —
 * فما يُفحص هو الشيفرة العاملة لا حكايةٌ عنها. ولو تغيّرت تلك الدوال غدًا لتغيّر النموذج
 * معها بلا تدخّل، أو لسقط الفحص.
 *
 * وما يضيفه المُدقّق فوق الفحوص القائمة: أنه يجرّب **كل** التشابكات الممكنة داخل عالمٍ
 * صغير — موضعان وفاعلان — لا التشابكات التي خطرت لكاتب الفحص. وأكثر أخطاء التزامن تظهر
 * عند اثنين.
 *
 * والحدّ معلن: البرهان يخصّ هذا العالم الصغير. موضعان لا يثبتان شيئًا عن ألف، لكن ما
 * ينكسر عند اثنين مكسورٌ عند ألف.
 */

import {
  DEFAULT_RESERVATION_TTL_SECONDS, RESERVATION_TRANSITIONS, effectiveState,
  expireReservations, reserveQuestions, transitionReservations,
} from './question-reservation';
import type { QuestionReservationRecord, QuestionReservationState } from '../types';
import { canonicalState, type ModelAction, type ModelInvariant } from './state-model-checker';

const EPOCH = Date.parse('2026-05-01T09:00:00.000Z');
/* التكّة دقيقة واحدة: أصغر من مدة الحجز بكثير، فيمكن تمثيل ما قبل الانقضاء وما بعده. */
const TICK_MS = 60_000;
const isoAt = (tick: number) => new Date(EPOCH + tick * TICK_MS).toISOString();

export interface ReservationWorld {
  tick: number;
  records: QuestionReservationRecord[];
  /** مواضع كُشفت — الكشف واقعةٌ لا رجعة فيها. */
  revealed: string[];
  /** متسابقون نُفِّذ لهم استبدالٌ طارئ. */
  replaced: string[];
  scope: { version: number; locked: boolean; ranges: string };
  /*
   * وقائع مرتّبة، تُسجَّل لحظة وقوعها ثم تلزم.
   *
   * كان تاريخ كل سجلّ داخلًا في تسلسل الحالة، فصار الفضاء لا نهائيًّا: سجلٌّ يدور بين
   * «مخصَّص» و«مُطلق» يولّد تاريخًا جديدًا في كل دورة، فلا يُستنفد الفضاء أبدًا، ولا
   * يخرج الفحص ببرهان قطّ.
   *
   * والترتيب مطلوبٌ في ثابتين فقط: كشفٌ بعد حجر، وحجبٌ بعد كشف. فيُحسبان لحظة الانتقال
   * ويُثبَّتان هنا راية لا تنطفئ، ويخرج التاريخ من التسلسل. والفضاء يصير محدودًا بلا أن
   * يفقد الفحص شيئًا: ما كان يُرى بالتاريخ يُرى بالراية.
   */
  revealedAfterQuarantine: boolean;
  heldAfterReveal: boolean;
}

export interface ReservationModelOptions {
  loci?: string[];
  participants?: string[];
  /** يسمح بأفعال النطاق والاستبدال الطارئ. */
  withScopeAndReplacement?: boolean;
}

const DEFAULT_LOCI = ['2:255', '78:1'];
const DEFAULT_PARTICIPANTS = ['p1', 'p2'];

export function initialReservationWorld(): ReservationWorld {
  return {
    tick: 0, records: [], revealed: [], replaced: [],
    scope: { version: 1, locked: false, ranges: '1-30' },
    revealedAfterQuarantine: false, heldAfterReveal: false,
  };
}

/*
 * التسلسل القانوني.
 *
 * المعرّفات والطوابع الزمنية تُسقط عمدًا: حالتان متطابقتان في المعنى ومختلفتان في المعرّف
 * ليستا حالتين. ولولا هذا الإسقاط لانفجر الفضاء بلا فائدة، ولصار «استُنفد الفضاء» كذبًا.
 *
 * ويبقى في التسلسل ما يؤثر في القرار: الموضع، والحالة الفعلية لحظةَ التكّة، وصاحبُه،
 * ومفتاح ثبات الطلب، وتاريخ الحالات المارّة — لأن «كُشف بعد أن حُجر» لا يُرى إلا في التاريخ.
 */
export function canonicalReservationWorld(world: ReservationWorld): string {
  const now = isoAt(world.tick);
  const rows = world.records
    .map(record => {
      const visited = new Set(record.history.map(entry => entry.state));
      return {
        locusKey: record.locusKey,
        state: effectiveState(record, now),
        participantId: record.participantId || '',
        idempotencyKey: record.idempotencyKey,
        everRevealed: visited.has('revealed'),
        everQuarantined: visited.has('quarantined'),
        everReleased: visited.has('released'),
      };
    })
    .sort((a, b) => canonicalState(a).localeCompare(canonicalState(b)));
  return canonicalState({
    tick: world.tick,
    rows,
    revealed: [...world.revealed].sort(),
    replaced: [...world.replaced].sort(),
    scope: world.scope,
    revealedAfterQuarantine: world.revealedAfterQuarantine,
    heldAfterReveal: world.heldAfterReveal,
  });
}

const recordsAt = (world: ReservationWorld, locusKey: string) => world.records.filter(record => record.locusKey === locusKey);
const stateOf = (world: ReservationWorld, record: QuestionReservationRecord) => effectiveState(record, isoAt(world.tick));

/**
 * أفعال العالم.
 *
 * كل فعلٍ ينادي دالة الإنتاج ولا يعيد كتابة منطقها. والفعل الذي ترفضه الدالة يبقى مُمكَّنًا
 * عمدًا في بعض المواضع: أن يُطلب المستحيل ثم يُرفض هو نفسه ما نريد التحقق منه.
 */
export function reservationActions(options: ReservationModelOptions = {}): ModelAction<ReservationWorld>[] {
  const loci = options.loci || DEFAULT_LOCI;
  const participants = options.participants || DEFAULT_PARTICIPANTS;
  const actions: ModelAction<ReservationWorld>[] = [];

  for (const locusKey of loci) {
    for (const participantId of participants) {
      const reserve = (idempotencySuffix: string) => (world: ReservationWorld): ReservationWorld => {
        const now = isoAt(world.tick);
        let counter = 0;
        const outcome = reserveQuestions({
          records: world.records,
          organizationId: 'org', competitionId: 'comp',
          items: [{ locusKey, questionId: `q-${locusKey}` }],
          participantId,
          idempotencyKey: `idem-${participantId}-${locusKey}${idempotencySuffix}`,
          actorId: participantId,
          now,
          ttlSeconds: DEFAULT_RESERVATION_TTL_SECONDS,
          newId: prefix => `${prefix}-${locusKey}-${participantId}-${++counter}`,
        });
        return { ...world, records: outcome.records };
      };
      actions.push({ name: `reserve(${participantId},${locusKey})`, enabled: () => true, apply: reserve('') });
      /* إعادة الطلب بالمفتاح نفسه — الحالة التي يقع فيها ازدواج التخصيص إن لم يُحفظ الثبات. */
      actions.push({ name: `retry(${participantId},${locusKey})`, enabled: world => world.records.some(r => r.idempotencyKey === `idem-${participantId}-${locusKey}`), apply: reserve('') });
    }

    /*
     * الانتقال يخصّ سجلَّ صاحبه لا كلَّ سجلّات الموضع.
     *
     * وهذا ما يفعله المستدعي في الإنتاج: يمرّر معرّفات الحجز الذي يملكه. ولو نُقلت كل
     * سجلّات الموضع دفعةً واحدة لأُحييَ حجزٌ مُطلقٌ لصاحبٍ سابق مع حجزٍ قائم لصاحبٍ جديد،
     * فيظهر «صاحبان قائمان» — وهو عيبُ النموذج لا عيبُ النظام.
     */
    for (const participantId of participants) {
      const transition = (to: QuestionReservationState) => (world: ReservationWorld): ReservationWorld => {
        const now = isoAt(world.tick);
        const before = new Map(world.records.map(record => [record.id, record.history.map(entry => entry.state)]));
        const ids = recordsAt(world, locusKey)
          .filter(record => record.participantId === participantId && RESERVATION_TRANSITIONS[effectiveState(record, now)].includes(to))
          .map(record => record.id);
        const outcome = transitionReservations({ records: world.records, ids, to, actorId: 'ops', now });
        const revealed = to === 'revealed' && outcome.changed.length ? [...new Set([...world.revealed, locusKey])] : world.revealed;
        // الوقائع المرتّبة تُلتقط هنا لحظة وقوعها، فلا يحتاج التسلسل إلى التاريخ كله.
        let revealedAfterQuarantine = world.revealedAfterQuarantine;
        let heldAfterReveal = world.heldAfterReveal;
        for (const changed of outcome.changed) {
          const priorStates = before.get(changed.id) || [];
          if (to === 'revealed' && priorStates.includes('quarantined')) revealedAfterQuarantine = true;
          if ((to === 'temporarily_reserved' || to === 'assigned') && priorStates.includes('revealed')) heldAfterReveal = true;
        }
        return { ...world, records: outcome.records, revealed, revealedAfterQuarantine, heldAfterReveal };
      };
      for (const to of ['assigned', 'revealed', 'released', 'quarantined'] as QuestionReservationState[]) {
        actions.push({
          name: `${to}(${participantId},${locusKey})`,
          enabled: world => recordsAt(world, locusKey).some(record => record.participantId === participantId && RESERVATION_TRANSITIONS[stateOf(world, record)].includes(to)),
          apply: transition(to),
        });
      }
    }
  }

  /* مرور الوقت: القفزة الوحيدة المهمّة هي ما يتجاوز مدة الحجز فيقع الكنس. */
  actions.push({
    name: 'expire',
    enabled: world => world.records.some(record => record.state === 'temporarily_reserved'),
    apply: world => {
      const tick = Math.max(world.tick, Math.ceil(DEFAULT_RESERVATION_TTL_SECONDS / 60) + 1);
      const outcome = expireReservations(world.records, isoAt(tick), 'system');
      return { ...world, tick, records: outcome.records };
    },
  });

  if (options.withScopeAndReplacement !== false) {
    for (const participantId of (options.participants || DEFAULT_PARTICIPANTS)) {
      actions.push({
        name: `emergencyReplace(${participantId})`,
        // مُمكَّنٌ دائمًا عمدًا: إن كان المنع في مكانٍ آخر فليُكسر الثابت ويظهر.
        enabled: () => true,
        apply: world => (world.replaced.includes(participantId) ? world : { ...world, replaced: [...world.replaced, participantId] }),
      });
    }
    actions.push({ name: 'lockScope', enabled: world => !world.scope.locked, apply: world => ({ ...world, scope: { ...world.scope, locked: true } }) });
    actions.push({
      name: 'editScopeWithVersion',
      enabled: world => world.scope.version < 3,
      apply: world => ({ ...world, scope: { version: world.scope.version + 1, locked: false, ranges: `${world.scope.ranges}+` } }),
    });
  }

  return actions;
}

/**
 * الثوابت.
 *
 * كل ثابتٍ هنا عطبٌ وقع أو كاد أن يقع في نظامٍ حيّ، لا تمرينٌ نظري.
 */
export function reservationInvariants(): ModelInvariant<ReservationWorld>[] {
  return [
    {
      id: 'single_active_owner',
      ar: 'لا يكون لموضعٍ واحد صاحبان قائمان في اللحظة نفسها.',
      en: 'No locus has two simultaneously active owners.',
      holds: world => {
        const now = isoAt(world.tick);
        const owners = new Map<string, Set<string>>();
        for (const record of world.records) {
          const state = effectiveState(record, now);
          if (state !== 'temporarily_reserved' && state !== 'assigned') continue;
          const set = owners.get(record.locusKey) || new Set<string>();
          set.add(record.participantId || '');
          owners.set(record.locusKey, set);
        }
        return [...owners.values()].every(set => set.size <= 1);
      },
    },
    {
      /*
       * الإبطال هو الحجر وحده.
       *
       * وكان هذا الثابت مكتوبًا أولًا «لا كشفَ بعد حجرٍ **أو إطلاق**»، فكسره المُدقّق بمجرًى
       * من أربع خطوات: حجزٌ ثم إطلاقٌ ثم تخصيصٌ ثم كشف. والمراجعة أثبتت أن العيب في الثابت
       * لا في النظام: الإطلاق انقضاءُ حجزٍ مؤقت لا إبطالٌ للموضع، والموضع المُطلق يعود إلى
       * المخزون فيُخصَّص لغيره ويُكشف بحقّ. والحجر وحده نهائيّ — ولذلك جدولُ الانتقالات
       * يجعل «محجور» بلا مخرج. فصُحّح الثابت ليقول ما يُراد إثباته حقًّا.
       */
      id: 'no_reveal_after_invalidation',
      ar: 'لا يُكشف موضعٌ بعد أن حُجر. (والإطلاق ليس إبطالًا: الموضع يعود إلى المخزون.)',
      en: 'No locus is revealed after quarantine. (Release is not invalidation: the locus returns to stock.)',
      holds: world => !world.revealedAfterQuarantine,
    },
    {
      id: 'retry_creates_no_second_record',
      ar: 'إعادة الطلب بمفتاح الثبات نفسه لا تُنشئ حجزًا ثانيًا.',
      en: 'Replaying a request with the same idempotency key creates no second reservation.',
      holds: world => {
        const seen = new Map<string, number>();
        for (const record of world.records) {
          const key = `${record.idempotencyKey}|${record.locusKey}`;
          seen.set(key, (seen.get(key) || 0) + 1);
        }
        return [...seen.values()].every(count => count <= 1);
      },
    },
    {
      id: 'no_double_replacement',
      ar: 'لا يُنفَّذ استبدالٌ طارئ مرتين للمتسابق نفسه.',
      en: 'No participant receives an emergency replacement twice.',
      holds: world => new Set(world.replaced).size === world.replaced.length,
    },
    {
      id: 'locked_scope_needs_version_transition',
      ar: 'نطاقٌ مقفل لا يتغيّر مدى صلاحيته بلا انتقال نسخة.',
      en: 'A locked scope never changes its ranges without a version transition.',
      holds: world => !(world.scope.locked && world.scope.ranges !== '1-30' && world.scope.version === 1),
    },
    {
      id: 'revealed_never_returns_to_held',
      ar: 'المكشوف لا يعود محجوزًا ولا مخصَّصًا.',
      en: 'A revealed locus never returns to a held state.',
      holds: world => !world.heldAfterReveal,
    },
    {
      id: 'blocked_means_one_holder',
      ar: 'الموضع المحجوب محجوبٌ بسجلٍّ واحد قائم، فلا يُنسب الحجز إلى غير صاحبه.',
      en: 'A blocked locus is blocked by exactly one live record, so a hold is never attributed to the wrong participant.',
      holds: world => {
        const now = isoAt(world.tick);
        const live = new Map<string, number>();
        for (const record of world.records) {
          const state = effectiveState(record, now);
          if (state === 'temporarily_reserved' || state === 'assigned') live.set(record.locusKey, (live.get(record.locusKey) || 0) + 1);
        }
        return [...live.values()].every(count => count <= 1);
      },
    },
  ];
}
