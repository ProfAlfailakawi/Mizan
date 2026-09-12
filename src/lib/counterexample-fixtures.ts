/*
 * حصاد الشواهد المضادّة.
 *
 * البحث الخصومي يجد تهيئةً تكسر شيئًا. ثم ماذا؟ إن لم تُحفظ، عاد العطب نفسه بعد ستة أشهر
 * ولم يعرف أحد أنه هو هو. فالقيمة ليست في العثور بل في **ألّا يُعثر عليه مرتين**.
 *
 * فكلُّ شاهدٍ يُحفظ حفظًا يكفي لإعادة إنتاجه وحده: البذرة، والمُدخل كاملًا، ونسخ المحرّكات،
 * والعطب الذي وقع، والثابت الذي كُسر. ثم يدخل مجموعة الانحدار فيُشغَّل مع كل دفعة.
 *
 * ولا بيانات أشخاص هنا بحال: المتسابقون في هذه الشواهد أرقامٌ مولَّدة ولا أسماء لها.
 */

import { QUESTION_ENGINE_VERSION } from './question-engine';
import { FAIRNESS_ORACLE_VERSION } from './fairness-oracle';
import { FAIRNESS_EXPERIMENTS_VERSION } from './fairness-experiments';
import { hashCanonical } from './trust-protocol';
import type { TwinInput, TwinMetrics } from './competition-twin';

export const COUNTEREXAMPLE_FIXTURE_VERSION = 'MIZAN-COUNTEREXAMPLE-1';

export interface CounterexampleFixture {
  fixtureVersion: typeof COUNTEREXAMPLE_FIXTURE_VERSION;
  id: string;
  discoveredAt: string;
  /** كيف وُجد: بحثٌ خصومي، أو أسوأ ترتيب، أو مونتي كارلو، أو يدويًا. */
  discoveredBy: 'adversarial_search' | 'worst_case_arrival' | 'monte_carlo' | 'manual';
  seed: string;
  engineVersion: string;
  oracleVersion: string;
  experimentsVersion: string;
  /** العطب بلغةٍ تُقرأ: ما الذي كُسر وبكم. */
  failure: { code: string; ar: string; en: string; observed: number; expected: number | null };
  /** الثابت الذي يجب أن يصمد حين يُعاد تشغيل هذا الشاهد. */
  expectedInvariant: { id: string; ar: string; metric: keyof TwinMetrics; comparator: 'lte' | 'gte' | 'eq'; threshold: number };
  /** المُدخل كاملًا، بلا مراجع خارجية: الشاهد يُعاد تشغيله وحده. */
  input: SerializedTwinInput;
  /** بصمة المُدخل — تُكشف بها كل تعديلٍ صامت على الشاهد. */
  inputHash: string;
}

/** مُدخل التوأم كما يُكتب في ملف. لا دوال ولا مراجع — نصٌّ قابل للقراءة والمراجعة. */
export type SerializedTwinInput = Omit<TwinInput, 'candidates'> & {
  candidates: TwinInput['candidates'];
};

export async function buildCounterexampleFixture(input: {
  id: string;
  discoveredBy: CounterexampleFixture['discoveredBy'];
  twinInput: TwinInput;
  failure: CounterexampleFixture['failure'];
  expectedInvariant: CounterexampleFixture['expectedInvariant'];
  now?: string;
}): Promise<CounterexampleFixture> {
  const serialized = JSON.parse(JSON.stringify(input.twinInput)) as SerializedTwinInput;
  return {
    fixtureVersion: COUNTEREXAMPLE_FIXTURE_VERSION,
    id: input.id,
    discoveredAt: input.now || new Date().toISOString(),
    discoveredBy: input.discoveredBy,
    seed: input.twinInput.seed,
    engineVersion: QUESTION_ENGINE_VERSION,
    oracleVersion: FAIRNESS_ORACLE_VERSION,
    experimentsVersion: FAIRNESS_EXPERIMENTS_VERSION,
    failure: input.failure,
    expectedInvariant: input.expectedInvariant,
    input: serialized,
    inputHash: await hashCanonical(serialized),
  };
}

/** حكمٌ على شاهدٍ مُعاد تشغيله: هل صمد الثابت هذه المرة؟ */
export function judgeFixture(fixture: CounterexampleFixture, metrics: TwinMetrics): { ok: boolean; observed: number; ar: string } {
  const observed = Number(metrics[fixture.expectedInvariant.metric] ?? 0);
  const { comparator, threshold, ar } = fixture.expectedInvariant;
  const ok = comparator === 'lte' ? observed <= threshold : comparator === 'gte' ? observed >= threshold : observed === threshold;
  return {
    ok,
    observed,
    ar: ok
      ? `الشاهد «${fixture.id}» صامد: ${ar} (المرصود ${observed}).`
      : `الشاهد «${fixture.id}» انكسر من جديد: ${ar} — المرصود ${observed} والمطلوب ${comparator === 'lte' ? '≤' : comparator === 'gte' ? '≥' : '='} ${threshold}.`,
  };
}
