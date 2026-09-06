import React from 'react';
import { Activity, ShieldCheck } from 'lucide-react';
import { Ratio } from '../design-system/Ratio';

/*
 * موثوقية التحكيم، معروضة كرقم لا كادّعاء.
 *
 * الشاشة تقاوم إغراءين: أن تُقرأ حكمًا على محكّم، وأن تُقرأ نتيجةً وهي عيّنة صغيرة. فالعنوان
 * يقول ما قيس، والعيّنة الصغيرة تُعرض عددًا صريحًا بدل نسبة مئوية تُوهم بالدقّة، والفروق تُعرض
 * بلا اسم محكّم — المقيس هو النظام لا الشخص.
 */

export interface ReliabilityView {
  pairs: number;
  agreementRate: number;
  toleranceUsed: number;
  meanAbsoluteDifference: number;
  maxAbsoluteDifference: number;
  sufficientSample: boolean;
  widestCriterion?: { criterionId: string; meanAbsoluteDifference: number };
  outliers: { sessionId: string; participantId: string; difference: number }[];
  note: string;
}

const CRITERION_AR: Record<string, string> = { memorization: 'الحفظ', tajweed: 'التجويد', voice: 'الأداء الصوتي', waqf_ibtida: 'الوقف والابتداء', performance: 'الأداء' };

export const ReliabilityPanel: React.FC<{ data: ReliabilityView | null; ar: boolean }> = ({ data, ar }) => {
  if (!data) return null;
  const strong = data.sufficientSample && data.agreementRate >= 0.85;
  return (
    <section className="mizan-surface overflow-hidden">
      <div className="flex items-start gap-3 p-5 sm:p-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#E7EEE9] text-[#214C40]"><ShieldCheck className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="mizan-kicker">{ar ? 'موثوقية التحكيم' : 'JUDGING RELIABILITY'}</div>
          <h2 className="mt-1 text-lg font-black">{ar ? 'قياس بالإعماء، لا شهادة حسن سيرة' : 'Measured blind, not asserted'}</h2>
          <p className="mt-2 max-w-2xl text-[11px] leading-5 text-[#636864]">
            {ar
              ? 'تلاواتٌ سبق تحكيمها أُعيدت على محكّم آخر دون أن يعلم أنها مُعادة، ثم قِيس الفرق بين الحكمين. لا يغيّر هذا أي درجة مختومة، ولا يُنسب فرقٌ إلى محكّم بعينه.'
              : 'Already-judged recitations were re-judged by another judge who was not told they were re-judged, and the two verdicts were compared. No sealed score changes, and no difference is attributed to a named judge.'}
          </p>
        </div>
      </div>

      {/* العيّنة الصغيرة لا تُعرض نسبةً مئوية: الرقم الكبير يُقرأ يقينًا. */}
      <div className="grid grid-cols-2 gap-px bg-[#e8e5dd] sm:grid-cols-4">
        <Cell label={ar ? 'أزواج مقيسة' : 'Pairs measured'} value={<span className="tabular-nums">{data.pairs}</span>} />
        <Cell
          label={ar ? `اتفاق ضمن ±${data.toleranceUsed}` : `Agreement within ±${data.toleranceUsed}`}
          value={data.sufficientSample
            ? <span className={`tabular-nums ${strong ? 'text-[#214C40]' : 'text-[#8a6738]'}`}>{Math.round(data.agreementRate * 100)}%</span>
            : <span className="text-sm font-black text-[#6b706c]">{ar ? 'عيّنة صغيرة' : 'sample too small'}</span>}
        />
        <Cell label={ar ? 'متوسط الفرق' : 'Mean difference'} value={<span className="tabular-nums">{data.meanAbsoluteDifference}</span>} />
        <Cell label={ar ? 'أقصى فرق' : 'Largest difference'} value={<span className="tabular-nums">{data.maxAbsoluteDifference}</span>} />
      </div>

      <div className="space-y-4 p-5 sm:p-6">
        {data.widestCriterion && (
          <div className="flex items-center gap-3 rounded-2xl bg-[#f5f3ed] px-4 py-3">
            <Activity className="h-4 w-4 shrink-0 text-[#8a6738]" />
            <p className="text-[11px] leading-5 text-[#5b615d]">
              {ar ? 'أوسع المعايير خلافًا: ' : 'Widest divergence: '}
              <strong className="font-black text-[#2c3330]">{ar ? (CRITERION_AR[data.widestCriterion.criterionId] || data.widestCriterion.criterionId) : data.widestCriterion.criterionId}</strong>
              {ar ? ` بمتوسط ${data.widestCriterion.meanAbsoluteDifference} درجة. هذا موضع تدريب لا موضع لوم.` : ` averaging ${data.widestCriterion.meanAbsoluteDifference} points — a training subject, not a fault.`}
            </p>
          </div>
        )}

        {data.outliers.length > 0 && (
          <div>
            <div className="text-[9px] font-black tracking-[.14em] text-[#6b706c]">{ar ? 'جلسات تجاوزت السماحية' : 'BEYOND TOLERANCE'}</div>
            <ul className="mt-2 divide-y divide-[#eceae3]">
              {data.outliers.slice(0, 6).map((o) => (
                <li key={o.sessionId} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="font-mono text-[11px] text-[#5b615d]" dir="ltr">{o.participantId}</span>
                  <span className="tabular-nums text-[11px] font-black text-[#8a6738]" dir="ltr">{o.difference > 0 ? '+' : ''}{o.difference}</span>
                </li>
              ))}
            </ul>
            {data.outliers.length > 6 && (
              /* «و6/9 أخرى» تُقرأ كسرًا لا عددًا، والمقصود عدد المعروض من الجملة. تُقال كما هي. */
              <p className="mt-2 text-[10px] text-[#6b706c]">
                {ar ? 'معروضة ' : 'Showing '}<Ratio value={6} of={data.outliers.length} label={ar ? `معروضة 6 من ${data.outliers.length}` : `showing 6 of ${data.outliers.length}`} />
              </p>
            )}
          </div>
        )}

        <p className="text-[10px] leading-5 text-[#6b706c]">{data.note}</p>
      </div>
    </section>
  );
};

const Cell: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="bg-[#fffefb] px-5 py-4">
    <div className="text-2xl font-black text-[#2c3330]">{value}</div>
    <div className="mt-1 text-[10px] text-[#646965]">{label}</div>
  </div>
);
