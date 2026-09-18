import React, { useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';

/*
 * ميل المسطرة — مرسومًا لا مسرودًا.
 *
 * كان يُعرض سطرًا نصيًّا واحدًا يُلصق فيه اثنا عشر محكّمًا بنقاطٍ فاصلة:
 * «Ibrahim Al-Dosari: +1.34 أليَن · Yusuf Al-Mutairi: -1.34 أشدّ · …» — بالإنجليزية في
 * شاشةٍ عربية، وبلا ترتيبٍ يُقرأ منه شيء. ورئيس التحكيم لا يريد من هذه البطاقة اثني عشر
 * رقمًا؛ يريد جوابًا واحدًا: **من أبعد عن لجنته، وفي أي اتجاه؟**
 *
 * فصار المحور خطّ الصفر، وكل محكّمٍ شريطٌ يمتدّ عنه: إلى جهةٍ للتشدّد وإلى الأخرى للّين،
 * وطولُه بعدُه، مرتّبين بالأبعد أولًا. يُقرأ بلمحةٍ قبل أن يُقرأ رقمًا.
 *
 * وحدوده حدود ما قبله بالحرف: مقارنةٌ مع بقية اللجنة على المتسابق نفسه، بانكماشٍ يمنع
 * الحكم من عيّنةٍ صغيرة، واستشاريٌّ بحت — لا يُعدَّل بهذا حكمُ محكّم ولا تُمسّ درجة.
 */

export interface ScaleTendencyRow {
  judgeId: string;
  name: string;
  nameArabic?: string;
  committeeId?: string;
  /** موجبٌ = أليَن من لجنته، سالبٌ = أشدّ. */
  deviationFromPanel: number;
  tendency: string;
  sessions?: number;
  confidence?: number;
}

export const ScaleTendencyChart: React.FC<{ rows: ScaleTendencyRow[]; ar: boolean; committeeCodeOf?: (committeeId?: string) => string }> = ({ rows, ar, committeeCodeOf }) => {
  /* الأبعد أولًا: البطاقة تُقرأ من أعلاها، وأعلاها يجب أن يحمل ما يستحقّ الانتباه. */
  const ordered = useMemo(
    () => [...rows].sort((a, b) => Math.abs(b.deviationFromPanel) - Math.abs(a.deviationFromPanel)).slice(0, 12),
    [rows],
  );
  if (!ordered.length) return null;
  /* المقياس من أكبر ميلٍ حاضر، فلا يبدو فارقُ ربع درجةٍ كأنه فارق ثلاث. */
  const span = Math.max(0.5, ...ordered.map(r => Math.abs(r.deviationFromPanel)));

  return (
    <section className="mizan-surface overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e3dc] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#F2EADC] text-[#7d5e34]"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <div className="mizan-kicker">{ar ? 'مراجعة مساندة' : 'ADVISORY'}</div>
            <h3 className="mt-0.5 text-sm font-black">{ar ? 'ميل المسطرة — من أبعد عن لجنته' : 'Scale tendency — who stands furthest from their panel'}</h3>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-black">
          <span className="inline-flex items-center gap-1.5 text-[#92642d]"><span className="h-2.5 w-2.5 rounded-full bg-[#B98A3E]" />{ar ? 'أشدّ من لجنته' : 'harsher'}</span>
          <span className="inline-flex items-center gap-1.5 text-[#3f5f74]"><span className="h-2.5 w-2.5 rounded-full bg-[#5b7f96]" />{ar ? 'أليَن من لجنته' : 'gentler'}</span>
        </div>
      </header>

      <ul className="divide-y divide-[#eeece5]">
        {ordered.map(row => {
          const value = Number(row.deviationFromPanel) || 0;
          const harsher = value < 0;
          const width = Math.min(50, (Math.abs(value) / span) * 50);
          const name = ar ? (row.nameArabic || row.name) : row.name;
          const code = committeeCodeOf?.(row.committeeId);
          return (
            <li key={row.judgeId} className="grid grid-cols-[minmax(96px,1.1fr)_2fr_auto] items-center gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="truncate text-xs font-black text-[#39423d]">{name}</div>
                <div className="mt-0.5 text-[9px] font-bold text-[#656b66]">
                  {code ? `${code} · ` : ''}{row.sessions ? (ar ? `${row.sessions} جلسة` : `${row.sessions} sessions`) : (ar ? 'ميل مرصود' : 'observed')}
                </div>
              </div>

              {/* الشريط: الصفر في المنتصف، والطول هو البعد. لا يعتمد على اتجاه الصفحة. */}
              <div className="relative h-5" role="img" aria-label={`${name}: ${harsher ? (ar ? 'أشدّ' : 'harsher') : (ar ? 'أليَن' : 'gentler')} ${Math.abs(value).toFixed(2)}`}>
                <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#ded9cd]" aria-hidden="true" />
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full"
                  style={{
                    left: harsher ? `${50 - width}%` : '50%',
                    width: `${Math.max(1.5, width)}%`,
                    background: harsher ? '#B98A3E' : '#5b7f96',
                  }}
                />
              </div>

              <div className={`w-16 text-end text-xs font-black tabular-nums ${harsher ? 'text-[#92642d]' : 'text-[#3f5f74]'}`} dir="ltr">
                {value > 0 ? '+' : ''}{value.toFixed(2)}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-[#eeece5] bg-[#fbfaf6] px-5 py-3 text-[10px] leading-5 text-[#6b706c]">
        {ar
          ? 'مقارنة مع بقية اللجنة على المتسابق نفسه، بانكماشٍ يمنع الحكم من عيّنة صغيرة. استشاري فقط: لا يُعدَّل حكم محكّم ولا تُمسّ درجة.'
          : 'Compared with the rest of the panel on the same participant, shrunk so a small sample cannot label a judge. Advisory only: no judge score is altered.'}
      </p>
    </section>
  );
};

export default ScaleTendencyChart;
