/*
 * فحص النماذج الصوري — Mizan Formal State Model Check.
 *
 * يُشغَّل بالأمر `npm run check:model`. لا مستندَ وصفيًّا هنا ولا نموذجًا يشيخ في ملف: أفعال
 * النموذج تستدعي دوال الإنتاج نفسها، فما يُفحص هو الشيفرة العاملة.
 *
 * ويخرج بواحدٍ إذا كُسر ثابت، وبواحدٍ أيضًا إذا لم يُستنفد الفضاء — لأن «لم يُكسر فيما
 * زُرت» ليست برهانًا، ولا يجوز أن تُقرأ على أنها برهان في تقرير إصدار.
 */

import { checkModel, renderModelCheck } from '../src/lib/state-model-checker';
import {
  canonicalReservationWorld, initialReservationWorld, reservationActions, reservationInvariants,
  type ReservationWorld,
} from '../src/lib/mizan-state-models';

const arg = (name: string, fallback: number) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) || fallback : fallback;
};

console.log('MIZAN Formal State Model Check — استكشافٌ صريح لفضاءٍ محدود.\n');

interface ModelCase {
  name: string;
  ar: string;
  loci: string[];
  participants: string[];
  maxDepth: number;
  maxStates: number;
  /** أفعال النطاق والاستبدال الطارئ — تُطفأ حيث تكون مغطّاةً في نموذجٍ أصغر. */
  withScopeAndReplacement?: boolean;
}

/*
 * الأعماق مختارة لتُستنفد لا لتُقطع.
 *
 * العمق هنا ليس سقفَ صبرٍ بل حدٌّ لا يبلغه البحث أصلًا: أطول مجرًى في أكبر هذه النماذج
 * عشرون خطوة، فالأربعة والعشرون تترك هامشًا ويبقى الجواب برهانًا. ومن قصّره فقد استبدل
 * بالبرهان انطباعًا — ولذلك يسقط هذا الأمر إذا لم يُستنفد الفضاء.
 */
const cases: ModelCase[] = [
  {
    name: 'reservation-1x2',
    ar: 'موضعٌ واحد وفاعلان — أصغر عالمٍ يظهر فيه التزاحم',
    loci: ['2:255'],
    participants: ['p1', 'p2'],
    maxDepth: arg('depth', 24),
    maxStates: arg('states', 500_000),
  },
  {
    name: 'reservation-1x3',
    ar: 'موضعٌ واحد وثلاثة فاعلين — أشدّ ما يكون التزاحم على مورد واحد',
    loci: ['2:255'],
    participants: ['p1', 'p2', 'p3'],
    maxDepth: arg('depth', 24),
    maxStates: arg('states', 500_000),
  },
  {
    /*
     * موردان وفاعلان، بلا أفعال النطاق والاستبدال.
     *
     * وإطفاؤها هنا ليس تخفيفًا: هي مغطّاةٌ استنفادًا في النموذجين أعلاه، وضربُها في تزاحم
     * موردين يُضخّم الفضاء بلا أن يضيف مجرًى جديدًا — فيبلغ السقف، فيصير الجواب انطباعًا
     * بعد أن كان برهانًا. والبرهان في عالمٍ أصغر خيرٌ من انطباعٍ في عالمٍ أكبر.
     */
    name: 'reservation-2x2',
    ar: 'موضعان وفاعلان — تزاحمٌ على موردين، وأكثر أخطاء التزامن تظهر عند اثنين',
    loci: ['2:255', '78:1'],
    participants: ['p1', 'p2'],
    maxDepth: arg('depth', 24),
    maxStates: arg('states', 500_000),
    withScopeAndReplacement: false,
  },
];

let failed = false;
let totalStates = 0;
let totalViolations = 0;

for (const modelCase of cases) {
  const result = checkModel<ReservationWorld>({
    initial: initialReservationWorld(),
    actions: reservationActions({ loci: modelCase.loci, participants: modelCase.participants, withScopeAndReplacement: modelCase.withScopeAndReplacement }),
    invariants: reservationInvariants(),
    canonical: canonicalReservationWorld,
    maxStates: modelCase.maxStates,
    maxDepth: modelCase.maxDepth,
  });
  totalStates += result.statesExplored;
  totalViolations += result.violations.length;
  console.log(`── ${modelCase.ar}`);
  console.log(renderModelCheck(modelCase.name, result));
  console.log(`  الزمن: ${result.elapsedMs} ملّي ثانية\n`);
  if (result.violations.length) failed = true;
  if (!result.exhaustive) {
    console.log('  ⚠ لم يُستنفد الفضاء عند هذا العمق والسقف. النتيجة ليست برهانًا؛ ارفع --depth أو --states، أو صغّر النموذج.\n');
    failed = true;
  }
}

console.log('══ الخلاصة');
console.log(`  حالات استُكشفت: ${totalStates}`);
console.log(`  ثوابت مكسورة: ${totalViolations}`);
console.log(`\n${failed ? 'سقط الفحص الصوري.' : 'كل الثوابت صمدت على كل حالةٍ ممكنة داخل هذه النماذج.'}`);
process.exitCode = failed ? 1 : 0;
