/*
 * مفتاحُ «المعلّم» وبوّابةُ فتحه — لا يُفتح للطلاب إلا بتقرير قياسٍ يجتاز شروطه.
 *
 * `MIZAN_QURAN_MUAALEM_MODE`:
 *   ـ `off`   : لا يظهر للطلاب شيء (والخدمةُ قائمةٌ للقياس).
 *   ـ `trial` : يظهر موسومًا «تجريبي — قيد القياس» (الأصل حين لا يُضبط).
 *   ـ `open`  : يظهر بلا وسم — **بشرط** تقريرٍ في `services/quran-muaalem/benchmark/reports/hafs.json`
 *               يجتاز شروطه كلَّها، وقاس النموذجَ نفسَه والقواعدَ نفسَها العاملةَ الآن. وإلا بقي
 *               «تجريبيًّا» وقيل لماذا — فلا يفتحه قرارٌ بلا قياس، ولا قياسٌ لقواعدَ تغيّرت.
 */

export type MuaalemMode = 'off' | 'trial' | 'open';

export interface MuaalemBenchmarkSummary {
  falseAlarmRate: number;
  substitutionRecall: number;
  unclearRate: number;
  reciters: number;
  words: number;
  measuredAt: string;
}

export interface MuaalemGate {
  mode: MuaalemMode;
  reason: string;
  benchmark?: MuaalemBenchmarkSummary;
}

const modelId = (v: unknown) => String(v ?? '').split('@')[0].trim();
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);

export function muaalemGate(input: {
  requested?: string;
  report: unknown;
  live: { model?: string | null; analysis?: string | null } | null | undefined;
}): MuaalemGate {
  const requested = String(input.requested ?? '').trim().toLowerCase();
  if (requested === 'off') return { mode: 'off', reason: 'OWNER_OFF' };
  if (requested !== 'open') return { mode: 'trial', reason: 'OWNER_TRIAL' };

  const r = (input.report ?? {}) as any;
  if (r.protocol !== 'MIZAN-MUAALEM-BENCH-1' || r.reading !== 'hafs' || r.status === 'NOT_MEASURED') return { mode: 'trial', reason: 'NOT_MEASURED' };
  const gates = r.gates && typeof r.gates === 'object' ? Object.values(r.gates) : [];
  if (r.passes !== true || !gates.length || gates.some(g => g !== true)) return { mode: 'trial', reason: 'BENCHMARK_NOT_PASSED' };
  if (!input.live?.model || !input.live?.analysis) return { mode: 'trial', reason: 'LIVE_ENGINE_UNKNOWN' };
  if (modelId(r.model) !== modelId(input.live.model)) return { mode: 'trial', reason: 'BENCHMARK_MODEL_MISMATCH' };
  if (String(r.analysisVersion ?? '') !== String(input.live.analysis)) return { mode: 'trial', reason: 'BENCHMARK_RULES_MISMATCH' };

  const benchmark: MuaalemBenchmarkSummary = {
    falseAlarmRate: num(r.correct?.falseAlarm?.rate),
    substitutionRecall: num(r.substitutions?.recall?.rate),
    unclearRate: num(r.correct?.unclear?.rate),
    reciters: Array.isArray(r.reciters) ? r.reciters.filter((x: any) => Number(x?.words) > 0).length : 0,
    words: Number(r.correct?.words) || 0,
    measuredAt: String(r.measuredAt ?? ''),
  };
  if (![benchmark.falseAlarmRate, benchmark.substitutionRecall, benchmark.unclearRate].every(Number.isFinite)) return { mode: 'trial', reason: 'BENCHMARK_MALFORMED' };
  return { mode: 'open', reason: 'BENCHMARK_PASSED', benchmark };
}
