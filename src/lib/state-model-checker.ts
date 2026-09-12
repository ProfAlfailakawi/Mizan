/*
 * مُدقّق نماذج الحالة — استكشافٌ صريح لفضاءٍ محدود.
 *
 * في ميزان اليوم فحوصٌ للتزامن، وفحوصٌ عشوائية للثوابت، وتمارين أعطال. وكلها تسأل:
 * «هل تظهر المشكلة في هذه المجاري التي جرّبناها؟». وهذا الملف يسأل سؤالًا آخر:
 *
 *     هل توجد **أيُّ** مجرًى — مهما كان ترتيبه — يكسر هذا الثابت؟
 *
 * والفرق ليس في الدقة بل في نوع الجواب. الفحص العشوائي يعطي «لم نجد»، وهذا يعطي
 * «لا يوجد، داخل هذا النموذج المحدود» — أو يعطي **المجرى الكاسر بعينه**، خطوةً خطوة.
 *
 * والحدّ معلن: البرهان يخصّ النموذج المحدود لا النظام كله. نموذجٌ بموضعين وفاعلَين لا
 * يثبت شيئًا عن ألف موضع وأربعين قاعة — لكن أكثر أخطاء التزامن تظهر عند اثنين، وما لا
 * يظهر عند اثنين لا يظهر في الفحص العشوائي أصلًا.
 *
 * ولا يُقبل هنا مستندٌ وصفيّ لا يُشغَّل: هذا الملف يُشغَّل بأمرٍ في CI (`npm run check:model`)،
 * ويفشل البناء إذا كُسر ثابت.
 */

export const STATE_MODEL_CHECKER_VERSION = 'MIZAN-MODEL-CHECKER-1';

export interface ModelAction<S> {
  name: string;
  /** هل هذا الفعل ممكن في هذه الحالة؟ */
  enabled: (state: S) => boolean;
  /** الحالة بعد الفعل. يجب ألّا يعدّل الحالة الأصلية. */
  apply: (state: S) => S;
}

export interface ModelInvariant<S> {
  id: string;
  ar: string;
  en: string;
  /** صحيحٌ = الثابت محفوظ. */
  holds: (state: S) => boolean;
}

export interface ModelCheckOptions<S> {
  initial: S;
  actions: ModelAction<S>[];
  invariants: ModelInvariant<S>[];
  /** تسلسلٌ قانوني للحالة يُستعمل في كشف التكرار. الافتراضي `JSON.stringify` مرتَّب المفاتيح. */
  canonical?: (state: S) => string;
  /** سقف عدد الحالات. تجاوزه يعني أن الفضاء لم يُستنفد، ويُقال ذلك صراحةً. */
  maxStates?: number;
  /** أقصى عمقٍ من الحالة الابتدائية. */
  maxDepth?: number;
}

export interface InvariantViolation {
  invariantId: string;
  ar: string;
  en: string;
  /** المجرى الكاسر: أسماء الأفعال من الحالة الابتدائية حتى الكسر. */
  trace: string[];
  state: unknown;
}

export interface ModelCheckResult {
  statesExplored: number;
  transitionsExplored: number;
  maxDepthReached: number;
  /** صحيحٌ = زُرت كل حالةٍ ممكنة، فالنتيجة برهانٌ داخل النموذج. */
  exhaustive: boolean;
  violations: InvariantViolation[];
  /** أسماء الثوابت التي صمدت على كل الحالات المزارة. */
  invariantsHeld: string[];
  elapsedMs: number;
}

/** تسلسل قانوني بمفاتيح مرتَّبة — حالتان متساويتان لهما نصٌّ واحد. */
export function canonicalState(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalState).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${canonicalState(v)}`).join(',')}}`;
}

/**
 * استكشافٌ بالعرض لكل الحالات الممكنة.
 *
 * العرض لا العمق عمدًا: المجرى الكاسر الذي يخرج به أقصرُ ما يكسر الثابت، وأقصرُ مجرًى
 * هو أسهلُ ما يُقرأ ويُعاد إنتاجه في فحصٍ يدوي.
 */
export function checkModel<S>(options: ModelCheckOptions<S>): ModelCheckResult {
  const startedAt = Date.now();
  const canonical = options.canonical || ((state: S) => canonicalState(state));
  const maxStates = options.maxStates ?? 200_000;
  const maxDepth = options.maxDepth ?? 64;

  const seen = new Set<string>();
  const queue: { state: S; trace: string[] }[] = [];
  const violations: InvariantViolation[] = [];
  const brokenIds = new Set<string>();

  const initialKey = canonical(options.initial);
  seen.add(initialKey);
  queue.push({ state: options.initial, trace: [] });

  let transitions = 0, maxDepthReached = 0, exhaustive = true;

  const inspect = (state: S, trace: string[]) => {
    for (const invariant of options.invariants) {
      if (invariant.holds(state)) continue;
      if (brokenIds.has(invariant.id)) continue;
      brokenIds.add(invariant.id);
      violations.push({ invariantId: invariant.id, ar: invariant.ar, en: invariant.en, trace: [...trace], state });
    }
  };
  inspect(options.initial, []);

  while (queue.length) {
    const node = queue.shift()!;
    maxDepthReached = Math.max(maxDepthReached, node.trace.length);
    if (node.trace.length >= maxDepth) { exhaustive = false; continue; }
    for (const action of options.actions) {
      if (!action.enabled(node.state)) continue;
      const next = action.apply(node.state);
      transitions++;
      const key = canonical(next);
      if (seen.has(key)) continue;
      if (seen.size >= maxStates) { exhaustive = false; break; }
      seen.add(key);
      const trace = [...node.trace, action.name];
      inspect(next, trace);
      queue.push({ state: next, trace });
    }
    if (seen.size >= maxStates) { exhaustive = false; break; }
  }

  return {
    statesExplored: seen.size,
    transitionsExplored: transitions,
    maxDepthReached,
    exhaustive,
    violations,
    invariantsHeld: options.invariants.filter(inv => !brokenIds.has(inv.id)).map(inv => inv.id),
    elapsedMs: Date.now() - startedAt,
  };
}

/** تقريرٌ نصيّ للطرفية — يُطبع في CI فيُقرأ سببُ الفشل بلا فتح ملف. */
export function renderModelCheck(name: string, result: ModelCheckResult): string {
  const lines = [
    `نموذج: ${name}`,
    `  حالات مزارة: ${result.statesExplored}`,
    `  انتقالات: ${result.transitionsExplored}`,
    `  أقصى عمق: ${result.maxDepthReached}`,
    `  استُنفد الفضاء: ${result.exhaustive ? 'نعم — النتيجة برهان داخل هذا النموذج' : 'لا — بلغ السقف، فالنتيجة «لم يُكسر فيما زُير» لا برهان'}`,
    `  ثوابت صمدت: ${result.invariantsHeld.length ? result.invariantsHeld.join('، ') : 'لا شيء'}`,
  ];
  for (const violation of result.violations) {
    lines.push(`  ✗ ${violation.invariantId} — ${violation.ar}`);
    lines.push(`     المجرى الكاسر: ${violation.trace.join(' ← ') || '(الحالة الابتدائية نفسها)'}`);
  }
  return lines.join('\n');
}
