import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Flame, Info, Users } from 'lucide-react';
import type { DemandAnalysis, JuzHeatCell } from '../../lib/scope-demand';
import { juzBounds, surahNameArabic, surahNameEnglish } from '../../lib/quran-canon';
import { EmptyState } from '../design-system/EmptyState';

/*
 * خريطة ازدحام المصحف.
 *
 * تجيب في ثانية عن سؤال مسؤول المسابقة: أين سيقع الضغط؟ ولا تعتمد على اللون وحده —
 * لكل خانة رقمها ودرجتها ووصفها النصّي، فتُقرأ بالعين وبقارئ الشاشة وبطابعة رمادية.
 *
 * ولا تُعرض فيها أسماء المتسابقين ولا بياناتهم: أعدادٌ وضغوطٌ فقط.
 */

const RISK_STYLE: Record<JuzHeatCell['exhaustionRisk'], { bg: string; ink: string; ar: string; en: string; bar: string }> = {
  none: { bg: 'bg-[#f4f2ec]', ink: 'text-[#696f6b]', ar: 'بلا طلب', en: 'No demand', bar: 'bg-[#d7d5cd]' },
  low: { bg: 'bg-[#E7EEE9]', ink: 'text-[#214C40]', ar: 'مريح', en: 'Comfortable', bar: 'bg-[#2F6555]' },
  medium: { bg: 'bg-[#E8EEF1]', ink: 'text-[#3c5566]', ar: 'متوسط', en: 'Moderate', bar: 'bg-[#496477]' },
  high: { bg: 'bg-[#F2EADC]', ink: 'text-[#7d5e34]', ar: 'مرتفع', en: 'High', bar: 'bg-[#9b7542]' },
  critical: { bg: 'bg-[#F4E6E3]', ink: 'text-[#8a3f34]', ar: 'حرج', en: 'Critical', bar: 'bg-[#a34d43]' },
};

export const ScopeHeatMap: React.FC<{ analysis: DemandAnalysis; arabic: boolean }> = ({ analysis, arabic }) => {
  const [focus, setFocus] = useState<number | null>(null);
  const maxParticipants = useMemo(() => Math.max(1, ...analysis.juzHeat.map(c => c.participantCount)), [analysis]);
  const cell = focus ? analysis.juzHeat.find(c => c.juz === focus) : null;

  if (!analysis.participantCount) {
    return <EmptyState icon={Users} title={arabic ? 'لا تسجيلات بعد' : 'No registrations yet'}
      hint={arabic ? 'تظهر خريطة الازدحام بمجرد اعتماد نطاقات المتسابقين، فتعرف أي أجزاء المصحف ستحمل أكبر ضغط.' : 'The demand map appears once participant scopes are approved.'} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={arabic ? 'المتسابقون' : 'Participants'} value={analysis.participantCount} />
        <Stat label={arabic ? 'السحوبات المطلوبة' : 'Required draws'} value={analysis.totalDraws} />
        <Stat label={arabic ? 'المواضع المتاحة' : 'Available loci'} value={analysis.totalUniqueLoci} />
        <Stat label={arabic ? 'نطاقات مختلفة' : 'Distinct scopes'} value={analysis.clusters.length} />
      </div>

      <div>
        <div className="mizan-kicker mb-2">{arabic ? 'ضغط التسجيل على أجزاء المصحف' : 'REGISTRATION PRESSURE ACROSS THE QURAN'}</div>
        <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-6 lg:grid-cols-10">
          {analysis.juzHeat.map(row => {
            const style = RISK_STYLE[row.exhaustionRisk];
            const bounds = juzBounds(row.juz);
            return (
              <button key={row.juz} type="button" onClick={() => setFocus(focus === row.juz ? null : row.juz)} aria-pressed={focus === row.juz}
                aria-label={arabic
                  ? `الجزء ${row.juz}: ${row.participantCount} متسابقًا، ${row.supply} موضعًا متاحًا، الضغط ${style.ar}`
                  : `Juz ${row.juz}: ${row.participantCount} participants, ${row.supply} loci, pressure ${style.en}`}
                className={`min-h-[74px] rounded-xl border p-2 text-start transition ${style.bg} ${focus === row.juz ? 'border-[#214C40] ring-2 ring-[#214C40]/20' : 'border-transparent hover:border-[#cddbd3]'}`}>
                <div className="flex items-baseline justify-between gap-1">
                  <span className={`text-sm font-black tabular-nums ${style.ink}`}>{row.juz}</span>
                  <span className={`text-[9px] font-bold ${style.ink}`}>{arabic ? style.ar : style.en}</span>
                </div>
                <div className={`mt-1 flex items-baseline gap-1 text-[10px] font-black tabular-nums ${style.ink}`}>
                  <span>{row.participantCount}</span><span className="text-[8px] font-bold opacity-75">{arabic ? 'متسابقًا' : 'part.'}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/70">
                  <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${Math.max(3, Math.round((row.participantCount / maxParticipants) * 100))}%` }} />
                </div>
                <div className="mt-1 text-[9px] text-[#656b67]">{arabic ? `${row.supply} موضعًا` : `${row.supply} loci`}</div>
                <span className="sr-only">{arabic ? `من ${surahNameArabic(bounds.start.surah)} ${bounds.start.ayah}` : `from ${surahNameEnglish(bounds.start.surah)} ${bounds.start.ayah}`}</span>
              </button>
            );
          })}
        </div>
        <ul className="mt-2 flex flex-wrap gap-3 text-[10px] font-bold text-[#656b67]">
          {(Object.keys(RISK_STYLE) as JuzHeatCell['exhaustionRisk'][]).map(key => (
            <li key={key} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${RISK_STYLE[key].bar}`} aria-hidden="true" />
              {arabic ? RISK_STYLE[key].ar : RISK_STYLE[key].en}
            </li>
          ))}
        </ul>
      </div>

      {cell && (
        <div className="rounded-2xl border border-[#cddbd3] bg-[#F7FAF8] p-4" role="status">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-black text-[#214C40]">{arabic ? `الجزء ${cell.juz}` : `Juz ${cell.juz}`}</h3>
            <span className="text-[10px] font-bold text-[#656b67]">
              {arabic ? `يبدأ عند ${surahNameArabic(juzBounds(cell.juz).start.surah)} ${juzBounds(cell.juz).start.ayah}` : `starts at ${surahNameEnglish(juzBounds(cell.juz).start.surah)} ${juzBounds(cell.juz).start.ayah}`}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label={arabic ? 'متسابقون يشملونه' : 'Participants covering it'} value={cell.participantCount} tight />
            <Stat label={arabic ? 'السحوبات المتوقعة' : 'Expected draws'} value={cell.demand} tight />
            <Stat label={arabic ? 'مواضع صالحة' : 'Eligible loci'} value={cell.supply} tight />
            <Stat label={arabic ? 'مراجَعة علميًا' : 'Scientifically reviewed'} value={cell.approvedSupply} tight />
          </dl>
          <p className="mt-3 text-[11px] leading-6 text-[#4f5752]">
            {cell.supply === 0
              ? (arabic ? 'لا يوجد في هذا الجزء موضع صالح واحد. أي متسابق نطاقه محصور فيه لن يجد سؤالًا.' : 'This juz has no eligible locus at all.')
              : cell.pressure > 1
                ? (arabic ? `كل موضع في هذا الجزء سيُستعمل ${cell.pressure} مرة في المتوسط. التكرار هنا حتمي رياضيًا، وميزان سيوزّعه بأكبر مباعدة ممكنة.` : `Each locus here will be used about ${cell.pressure} times. Repetition is mathematically unavoidable and will be spread as widely as possible.`)
                : (arabic ? 'المخزون يكفي هذا الجزء دون تكرار حتمي.' : 'Supply covers this juz without forced repetition.')}
          </p>
        </div>
      )}

      {analysis.bottlenecks.length > 0 && (
        <div className="rounded-2xl border border-[#e6d9c2] bg-[#FBF7F0] p-4">
          <h3 className="inline-flex items-center gap-2 text-sm font-black text-[#7d5e34]"><Flame className="h-4 w-4" />{arabic ? 'النطاقات التي ستواجه التكرار أولًا' : 'Ranges that meet repetition first'}</h3>
          <ul className="mt-3 space-y-2">
            {analysis.bottlenecks.map(cluster => (
              <li key={cluster.signature} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2">
                <span className="min-w-0 text-[11px] font-black text-[#3c4541]">{cluster.label}</span>
                <span className="text-[10px] font-bold tabular-nums text-[#7d5e34]">
                  {arabic ? `${cluster.participantCount} متسابقًا · ${cluster.demand} سحبة على ${cluster.supply} موضعًا · إعادة ${cluster.averageReuse}×` : `${cluster.participantCount} participants · ${cluster.demand} draws over ${cluster.supply} loci · reuse ${cluster.averageReuse}×`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-[#e4e2da] bg-white p-4">
        <h3 className="inline-flex items-center gap-2 text-sm font-black text-[#39423d]"><Info className="h-4 w-4" />{arabic ? 'أكثر النطاقات ازدحامًا' : 'Most crowded ranges'}</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[11px]">
            <thead>
              <tr className="text-[9px] font-black tracking-[.1em] text-[#696f6b]">
                <th className="pb-2 text-start">{arabic ? 'النطاق' : 'Range'}</th>
                <th className="pb-2 text-end">{arabic ? 'متسابقون' : 'Participants'}</th>
                <th className="pb-2 text-end">{arabic ? 'سحوبات' : 'Draws'}</th>
                <th className="pb-2 text-end">{arabic ? 'مواضع' : 'Loci'}</th>
                <th className="pb-2 text-end">{arabic ? 'كفاية بلا تكرار' : 'No-repeat feasible'}</th>
              </tr>
            </thead>
            <tbody>
              {analysis.clusters.slice(0, 10).map(cluster => (
                <tr key={cluster.signature} className="border-t border-[#efeee8]">
                  <td className="py-2 pe-2 font-bold text-[#3c4541]">{cluster.label}</td>
                  <td className="py-2 text-end tabular-nums">{cluster.participantCount}</td>
                  <td className="py-2 text-end tabular-nums">{cluster.demand}</td>
                  <td className="py-2 text-end tabular-nums">{cluster.supply}</td>
                  <td className="py-2 text-end">
                    {cluster.sufficientForStrictNoRepeat
                      ? <span className="inline-flex items-center gap-1 font-black text-[#214C40]"><CheckCircle2 className="h-3.5 w-3.5" />{arabic ? 'نعم' : 'Yes'}</span>
                      : <span className="inline-flex items-center gap-1 font-black text-[#8a3f34]"><AlertTriangle className="h-3.5 w-3.5" />{arabic ? 'لا' : 'No'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: React.ReactNode; tight?: boolean }> = ({ label, value, tight }) => (
  <div className={`min-w-0 rounded-xl ${tight ? 'bg-white/80 px-2.5 py-2' : 'mizan-surface-soft p-3'}`}>
    <div className="text-[9px] font-bold text-[#656b67]">{label}</div>
    <div className="mt-0.5 text-lg font-black tabular-nums text-[#24302b]">{value}</div>
  </div>
);
