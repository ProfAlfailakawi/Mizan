import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalState, checkModel, renderModelCheck, type ModelAction, type ModelInvariant } from '../src/lib/state-model-checker';
import {
  canonicalReservationWorld, initialReservationWorld, reservationActions, reservationInvariants,
  type ReservationWorld,
} from '../src/lib/mizan-state-models';

/*
 * برهانٌ داخل عالمٍ صغير.
 *
 * الفحوص العشوائية في المشروع تسأل: هل ظهرت المشكلة فيما جرّبنا؟ وهذا يسأل: هل توجد
 * **أيُّ** مجرًى يكسر الثابت؟ فإن استُنفد الفضاء ولم يُكسر، فالجواب برهانٌ لا انطباع.
 *
 * وأول ما يُفحص هنا هو المُدقّق نفسه: مُدقّقٌ لا يكشف عطبًا مزروعًا لا يُوثَق به حين يقول
 * «لا عطب».
 */

test('المُدقّق يكشف عطبًا مزروعًا ويخرج بالمجرى الكاسر بعينه', () => {
  type Counter = { value: number };
  const actions: ModelAction<Counter>[] = [
    { name: 'inc', enabled: state => state.value < 4, apply: state => ({ value: state.value + 1 }) },
    { name: 'dec', enabled: state => state.value > 0, apply: state => ({ value: state.value - 1 }) },
  ];
  const invariants: ModelInvariant<Counter>[] = [
    { id: 'below_three', ar: 'لا يتجاوز العدّاد ثلاثة.', en: 'The counter never exceeds three.', holds: state => state.value <= 3 },
  ];
  const result = checkModel({ initial: { value: 0 }, actions, invariants });
  assert.equal(result.exhaustive, true);
  assert.equal(result.violations.length, 1);
  assert.deepEqual(result.violations[0].trace, ['inc', 'inc', 'inc', 'inc'], 'المجرى الكاسر يجب أن يكون أقصر ما يكسر');
  assert.ok(renderModelCheck('عدّاد', result).includes('below_three'));
});

test('المُدقّق يشهد بالسلامة حين لا يكون ثمة عطب، ويصرّح باستنفاد الفضاء', () => {
  const result = checkModel({
    initial: { value: 0 },
    actions: [{ name: 'inc', enabled: (s: { value: number }) => s.value < 3, apply: s => ({ value: s.value + 1 }) }],
    invariants: [{ id: 'below_ten', ar: 'دون العشرة.', en: 'Below ten.', holds: (s: { value: number }) => s.value < 10 }],
  });
  assert.deepEqual(result.violations, []);
  assert.equal(result.exhaustive, true);
  assert.equal(result.statesExplored, 4);
});

test('التسلسل القانوني يوحّد الحالتين المتطابقتين معنًى مهما اختلف ترتيب المفاتيح', () => {
  assert.equal(canonicalState({ a: 1, b: [2, 3] }), canonicalState({ b: [2, 3], a: 1 }));
  assert.notEqual(canonicalState({ a: 1 }), canonicalState({ a: 2 }));
});

test('دورة حياة الحجز: الفضاء يُستنفد، فالنتيجة برهانٌ لا انطباع', () => {
  /*
   * موضعٌ واحد وثلاثة فاعلين: أشدّ ما يكون التزاحم على مورد واحد. والفضاء يُستنفد هنا
   * فعلًا — وهذا هو الفرق بين «لم يُكسر فيما جرّبنا» وبين «لا يُكسر بحال داخل هذا النموذج».
   * (والعالم الأكبر — موضعان وفاعلان — في `npm run check:model` لأنه أبطأ من فحص دفعة.)
   */
  const result = checkModel<ReservationWorld>({
    initial: initialReservationWorld(),
    actions: reservationActions({ loci: ['2:255'], participants: ['p1', 'p2', 'p3'] }),
    invariants: reservationInvariants(),
    canonical: canonicalReservationWorld,
    maxStates: 500_000,
    maxDepth: 24,
  });
  const report = renderModelCheck('دورة حياة الحجز والكشف', result);
  assert.deepEqual(result.violations.map(v => v.invariantId), [], `ثوابت مكسورة:\n${report}`);
  assert.equal(result.exhaustive, true, `لم يُستنفد الفضاء، فالنتيجة ليست برهانًا:\n${report}`);
  assert.ok(result.statesExplored > 500, `فضاءٌ صغير جدًا ليكون فحصًا (${result.statesExplored} حالة)`);
  assert.equal(result.invariantsHeld.length, reservationInvariants().length, 'لم تصمد كل الثوابت');
});

test('الثابت يُكسر فعلًا حين يُنزع الحارس — فالفحص أعلاه ليس تحصيل حاصل', () => {
  /*
   * يُستبدل فعلٌ واحد بفعلٍ يتجاهل مفتاح الثبات فيُنشئ سجلًّا ثانيًا للموضع نفسه. ولو كان
   * الثابت لا يُكسر بحال لَما كان فحصه شيئًا.
   */
  const actions = reservationActions();
  const broken: ModelAction<ReservationWorld>[] = [
    ...actions,
    {
      name: 'doubleBook(2:255)',
      enabled: world => world.records.filter(r => r.locusKey === '2:255').length === 1,
      apply: world => {
        const source = world.records.find(r => r.locusKey === '2:255')!;
        return { ...world, records: [{ ...source, id: `${source.id}-clone`, participantId: 'p9' }, ...world.records] };
      },
    },
  ];
  const result = checkModel<ReservationWorld>({
    initial: initialReservationWorld(),
    actions: broken,
    invariants: reservationInvariants(),
    canonical: canonicalReservationWorld,
    maxStates: 40_000,
    maxDepth: 6,
  });
  assert.ok(result.violations.some(v => v.invariantId === 'single_active_owner'), 'ازدواج الحجز لم يُكشف — فالثابت لا يحرس شيئًا');
});
