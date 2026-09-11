import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RESERVATION_TTL_SECONDS, blockedLocusKeys, expireReservations, reserveQuestions,
} from '../src/lib/question-reservation';

/*
 * الساعة خصمًا.
 *
 * المدة المعلنة للحجز (§٦٦) وعدٌ: «هذا الموضع محجوزٌ ربع ساعة، ثم يعود». وهذا الوعد
 * مبنيٌّ على أن الساعات متفقة. والمسابقة تعمل على أجهزة قاعاتٍ متعددة، بعضها بلا شبكة،
 * وليس في النظام كلِّه وقتُ خادمٍ موثوق — فالساعات مستقلة، والانحراف متوقَّع.
 *
 * وهذه الفحوص **لا تُصلح** الانحراف؛ تُثبّت أثره مقيسًا، لئلا يُظنّ محلولًا وهو ليس
 * كذلك. وعلاجُه وقتٌ موثوق من الخادم، وذلك قرارُ بنيةٍ لصاحب النظام.
 */

let counter = 0;
const newId = (prefix: string) => `${prefix}-${++counter}`;
const REAL_NOW = '2026-05-01T10:00:00.000Z';
const shifted = (minutes: number) => new Date(new Date(REAL_NOW).getTime() + minutes * 60000).toISOString();

const reserveWithClock = (deviceClock: string, participantId: string) => reserveQuestions({
  records: [], organizationId: 'org-1', competitionId: 'comp-1',
  items: [{ locusKey: '2:255', questionId: 'q-1' }],
  participantId, idempotencyKey: `key-${participantId}`, actorId: 'device',
  now: deviceClock, ttlSeconds: DEFAULT_RESERVATION_TTL_SECONDS, newId,
});

test('جهازٌ ساعته متأخرة يُنشئ حجزًا وُلد منقضيًا — والموضع يصير حرًّا والمتسابق واقف', () => {
  const late = reserveWithClock(shifted(-30), 'p-late');
  assert.equal(late.created.length, 1);
  assert.equal(late.conflicts.length, 0, 'الحجز عاد ناجحًا — ولا أحد أُخبر بشيء');

  /* المدة المعلنة ربع ساعة، والمكتوب انقضاءٌ قبل الوقت الحقيقي بربع ساعة. */
  assert.ok(late.created[0].expiresAt! < REAL_NOW, 'expiresAt كُتب في الماضي');

  /* فأولُ جهازٍ صحيح الساعة يكنسه فورًا. */
  const swept = expireReservations(late.records, REAL_NOW);
  assert.equal(swept.changed.length, 1, 'الحجز انقضى لحظةَ إنشائه');
  assert.equal(blockedLocusKeys(swept.records, REAL_NOW).has('2:255'), false, 'الموضع صار حرًّا فورًا');
});

test('جهازٌ ساعته متقدمة يحجب ثلاثة أضعاف المدة المعلنة', () => {
  const early = reserveWithClock(shifted(+30), 'p-early');
  const declaredMinutes = DEFAULT_RESERVATION_TTL_SECONDS / 60;

  /* بعد مضيّ المدة المعلنة كاملةً بالوقت الحقيقي، ما زال يحجب. */
  const afterDeclared = shifted(declaredMinutes + 1);
  assert.equal(expireReservations(early.records, afterDeclared).changed.length, 0, 'ما زال يحجب بعد انقضاء المدة المعلنة');
  assert.equal(blockedLocusKeys(early.records, afterDeclared).has('2:255'), true);

  /* ولا ينقضي إلا بعد المدة المعلنة زائدًا الانحراف. */
  assert.equal(expireReservations(early.records, shifted(30 + declaredMinutes)).changed.length, 1);
});

test('وما دامت الساعات متفقة فالمدة المعلنة هي المدة الواقعة', () => {
  const agreed = reserveWithClock(REAL_NOW, 'p-ok');
  const declaredMinutes = DEFAULT_RESERVATION_TTL_SECONDS / 60;
  assert.equal(expireReservations(agreed.records, shifted(declaredMinutes - 1)).changed.length, 0);
  assert.equal(expireReservations(agreed.records, shifted(declaredMinutes)).changed.length, 1);
});
