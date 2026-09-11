import React, { useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, PlayCircle, RotateCcw, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { ScopeSimulationRecord } from '../../types';
import { Button } from '../design-system/Button';
import { EmptyState } from '../design-system/EmptyState';

/*
 * استوديو المحاكاة.
 *
 * يشغّل المسابقة افتراضيًا بالمحرك نفسه الذي سيعمل يوم المسابقة، ثم يعرض ما يهمّ القرار:
 * هل خرج سؤال عن نطاق صاحبه؟ كم تكرارًا كان حتميًا وكم كان من صنع الخوارزمية؟ وأين عنق
 * الزجاجة بالاسم؟
 *
 * والقاعدة المعروضة هنا صريحة: التكرار الحتمي رياضيًا ليس عيبًا، والزائد عنه هو العيب.
 */

export interface WhatIfState {
  participantCount: number;
  questionCount: number;
  poolMultiplier: number;
  repeatMode: 'strict_no_repeat' | 'repeat_when_necessary' | 'balanced_reuse';
  minimumParticipantGap: number;
}

export const ScopeSimulationStudio: React.FC<{
  arabic: boolean;
  latest?: ScopeSimulationRecord;
  history: ScopeSimulationRecord[];
  defaults: WhatIfState;
  busy?: boolean;
  error?: string | null;
  onRun: (state: WhatIfState) => void;
}> = ({ arabic, latest, history, defaults, busy, error, onRun }) => {
  const [state, setState] = useState<WhatIfState>(defaults);
  const metrics = (latest?.metrics || {}) as Record<string, number>;
  /* تقريرٌ كل سحوباته فاشلة ليس تقريرًا نظيفًا: أصفارُ المخالفات فيه أصفارُ عدمٍ لا أصفارُ سلامة. */
  const served = Number(metrics.successfulDraws || 0);
  const violationsClean = !!latest && served > 0 && metrics.scopeViolations === 0 && metrics.readingViolations === 0 && metrics.duplicateWithinModelViolations === 0 && metrics.duplicateForParticipantViolations === 0;
  const starved = !!latest && served < Number(metrics.draws || 0);

  return (
    <div className="space-y-5">
      <section className="mizan-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mizan-kicker">{arabic ? 'ماذا لو؟' : 'WHAT IF?'}</div>
            <h2 className="mt-1 text-lg font-black">{arabic ? 'جرّب قبل أن تلتزم' : 'Try it before you commit'}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-6 text-[#666c68]">
              {arabic
                ? 'غيّر عدد المتسابقين أو عدد الأسئلة أو حجم البنك، وشغّل المحاكاة لترى الأثر على التكرار والعدالة قبل أن يقع في القاعة.'
                : 'Change the field size, the question count or the pool, then run the simulation to see the effect before competition day.'}
            </p>
          </div>
          <Button onClick={() => onRun(state)} loading={busy} icon={<PlayCircle className="h-4 w-4" />}>
            {arabic ? 'تشغيل المحاكاة' : 'Run simulation'}
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <NumberDial label={arabic ? 'عدد المتسابقين' : 'Participants'} value={state.participantCount} min={1} max={20000} step={50}
            onChange={v => setState(s => ({ ...s, participantCount: v }))} hint={arabic ? 'العدد الافتراضي هو المسجَّلون فعلًا.' : 'Defaults to the real registered field.'} />
          <NumberDial label={arabic ? 'عدد الأسئلة لكل متسابق' : 'Questions per participant'} value={state.questionCount} min={1} max={20} step={1}
            onChange={v => setState(s => ({ ...s, questionCount: v }))} hint={arabic ? 'مستقل تمامًا عن حجم النطاق.' : 'Entirely independent of scope size.'} />
          <NumberDial label={arabic ? 'حجم البنك (نسبة)' : 'Pool size (ratio)'} value={Math.round(state.poolMultiplier * 100)} min={10} max={100} step={10}
            onChange={v => setState(s => ({ ...s, poolMultiplier: v / 100 }))} suffix="%" hint={arabic ? 'اخفضها لترى ماذا يحدث لو ضاق البنك.' : 'Lower it to see a thinner pool.'} />
          <label className="block min-w-0">
            <span className="block text-[10px] font-black tracking-[.1em] text-[#696f6b]">{arabic ? 'سياسة التكرار' : 'Repeat policy'}</span>
            <select value={state.repeatMode} onChange={e => setState(s => ({ ...s, repeatMode: e.target.value as WhatIfState['repeatMode'] }))} className="mizan-input mt-1 text-xs">
              <option value="strict_no_repeat">{arabic ? 'منع التكرار تمامًا' : 'Strict no repeat'}</option>
              <option value="repeat_when_necessary">{arabic ? 'السماح بالتكرار عند الضرورة' : 'Repeat only when necessary'}</option>
              <option value="balanced_reuse">{arabic ? 'إعادة استعمال متوازنة' : 'Balanced reuse'}</option>
            </select>
          </label>
          <NumberDial label={arabic ? 'أقل مباعدة بين استعمالين' : 'Minimum gap between reuses'} value={state.minimumParticipantGap} min={0} max={500} step={5}
            onChange={v => setState(s => ({ ...s, minimumParticipantGap: v }))} hint={arabic ? 'بعدد المتسابقين.' : 'Counted in participants.'} />
          <div className="flex items-end">
            <Button variant="ghost" size="sm" onClick={() => setState(defaults)} icon={<RotateCcw className="h-4 w-4" />}>{arabic ? 'إعادة القيم' : 'Reset values'}</Button>
          </div>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-[#F6E7E7] px-3 py-2 text-[11px] font-bold text-[#7A2E2E]">{error}</p>}
      </section>

      {!latest ? (
        <div className="mizan-surface">
          <EmptyState icon={Activity} title={arabic ? 'لم تُشغَّل محاكاة بعد' : 'No simulation has been run yet'}
            hint={arabic ? 'شغّل المحاكاة لترى كم سؤالًا سيتكرر، وكم من ذلك تفرضه الرياضيات لا الخوارزمية، وأين ستضيق المواضع.' : 'Run it to see how much repetition is mathematically forced and where the pool will run thin.'} />
        </div>
      ) : (
        <>
          <section className={`rounded-2xl border p-5 ${violationsClean ? 'border-[#cddbd3] bg-[#F7FAF8]' : 'border-[#e0c6c1] bg-[#F9F0EE]'}`} role="status">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className={`inline-flex items-center gap-2 text-sm font-black ${violationsClean ? 'text-[#214C40]' : 'text-[#8a3f34]'}`}>
                {violationsClean ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {violationsClean
                  ? (arabic ? 'لم يخرج سؤال واحد عن نطاق صاحبه' : 'Not one question left its owner\'s range')
                  : served === 0
                    ? (arabic ? 'لم تنجح أي سحبة — لا يوجد سؤال صالح لهذه النطاقات' : 'No draw succeeded — no eligible question for these ranges')
                    : (arabic ? 'رُصدت مخالفات تحتاج معالجة' : 'Violations were detected')}
              </h3>
              <span className="text-[10px] font-bold text-[#656b67]">
                {arabic ? `${latest.participantCount} متسابقًا · ${latest.draws} سحبة · ${latest.runtimeMs} مللي ثانية` : `${latest.participantCount} participants · ${latest.draws} draws · ${latest.runtimeMs} ms`}
              </span>
            </div>
            {served === 0 && (
              <p className="mt-3 rounded-xl bg-white/70 px-3 py-2.5 text-[11px] leading-6 text-[#7A2E2E]">
                {arabic
                  ? 'راجع نطاقات الفئات ورواياتها: البنك المتاح لا يحتوي موضعًا واحدًا مطابقًا لرواية هؤلاء المتسابقين داخل نطاقاتهم.'
                  : 'Check the category ranges and readings: the available pool holds no locus matching these participants\' reading inside their ranges.'}
              </p>
            )}
            {starved && served > 0 && (
              <p className="mt-3 rounded-xl bg-white/70 px-3 py-2.5 text-[11px] leading-6 text-[#7d5e34]">
                {arabic ? `${Number(metrics.draws) - served} سحبة لم تجد سؤالًا صالحًا. وسِّع البنك أو خفّف سياسة التكرار.` : `${Number(metrics.draws) - served} draws found no eligible question. Widen the pool or relax the repeat policy.`}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Violation label={arabic ? 'خارج النطاق' : 'Out of scope'} value={metrics.scopeViolations} arabic={arabic} />
              <Violation label={arabic ? 'مخالفة رواية' : 'Reading mismatch'} value={metrics.readingViolations} arabic={arabic} />
              <Violation label={arabic ? 'تكرار داخل النموذج' : 'Duplicate in model'} value={metrics.duplicateWithinModelViolations} arabic={arabic} />
              <Violation label={arabic ? 'تكرار على المتسابق' : 'Repeat to same participant'} value={metrics.duplicateForParticipantViolations} arabic={arabic} />
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label={arabic ? 'سحوبات نجحت' : 'Draws served'} value={`${served} / ${metrics.draws}`} tone={starved ? 'warn' : 'good'} />
            <Tile label={arabic ? 'أسئلة مختلفة استُعملت' : 'Distinct questions used'} value={metrics.uniqueQuestionsUsed} />
            <Tile label={arabic ? 'إجمالي التكرار' : 'Total repeats'} value={metrics.totalRepeats} />
            <Tile label={arabic ? 'تكرار حتمي رياضيًا' : 'Mathematically unavoidable'} value={metrics.unavoidableRepeats} tone="quiet" />
            <Tile label={arabic ? 'تكرار كان يمكن تفاديه' : 'Avoidable repeats'} value={metrics.avoidableRepeats} tone={metrics.avoidableRepeats > 0 ? 'warn' : 'good'} />
            <Tile label={arabic ? 'أكثر سؤال استعمالًا' : 'Most-used question'} value={metrics.maxUsesOfAnyQuestion} />
            <Tile label={arabic ? 'الحدّ الأدنى الرياضي' : 'Mathematical floor'} value={metrics.theoreticalMinimumMaxUses} tone="quiet" />
            <Tile label={arabic ? 'الفائض فوق الحدّ' : 'Excess over the floor'} value={metrics.excessOverLowerBound} tone={metrics.excessOverLowerBound > 2 ? 'warn' : 'good'} />
            <Tile label={arabic ? 'متوسط صعوبة النموذج' : 'Average model difficulty'} value={metrics.averageModelDifficulty} />
          </section>

          <section className="mizan-surface p-5">
            <h3 className="text-sm font-black">{arabic ? 'توزيع الاستعمال' : 'Reuse distribution'}</h3>
            <p className="mt-1 text-[11px] leading-6 text-[#666c68]">
              {arabic ? 'العمود الواحد يقول: كم سؤالًا استُعمل هذا العدد من المرات. عمودان متجاوران متقاربا الارتفاع يعنيان حملًا موزَّعًا.' : 'Each bar says how many questions were used that many times. Even bars mean an evenly spread load.'}
            </p>
            <ReuseChart distribution={(latest.metrics as { reuseDistribution?: { uses: number; questionCount: number }[] }).reuseDistribution || []} arabic={arabic} />
          </section>

          {latest.recommendations.length > 0 && (
            <section className="mizan-surface p-5">
              <h3 className="inline-flex items-center gap-2 text-sm font-black"><SlidersHorizontal className="h-4 w-4" />{arabic ? 'توصيات المحرك' : 'Engine recommendations'}</h3>
              <p className="mt-1 text-[11px] text-[#666c68]">{arabic ? 'اقتراحات مبنية على الأرقام. اللجنة هي التي تعتمد.' : 'Number-driven suggestions. The committee decides.'}</p>
              <ul className="mt-3 space-y-2">
                {latest.recommendations.map(item => (
                  <li key={item.id} className={`rounded-xl px-3 py-2.5 text-[11px] leading-6 ${item.severity === 'critical' ? 'bg-[#F6E7E7] text-[#7A2E2E]' : item.severity === 'warning' ? 'bg-[#F5EDE2] text-[#7a5a2f]' : 'bg-[#f1efe9] text-[#4f5752]'}`}>
                    {arabic ? item.ar : item.en}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {history.length > 1 && (
            <section className="mizan-surface p-5">
              <h3 className="text-sm font-black">{arabic ? 'محاكاة سابقة' : 'Earlier runs'}</h3>
              <ul className="mt-3 divide-y divide-[#efeee8]">
                {history.slice(1, 6).map(row => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[11px]">
                    <span className="font-bold text-[#3c4541]">{row.label}</span>
                    <span className="tabular-nums text-[#656b67]">
                      {arabic ? `${row.participantCount} متسابقًا · تكرار ${(row.metrics as Record<string, number>).totalRepeats}` : `${row.participantCount} participants · repeats ${(row.metrics as Record<string, number>).totalRepeats}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
};

const Violation: React.FC<{ label: string; value: number; arabic: boolean }> = ({ label, value, arabic }) => (
  <div className={`rounded-xl px-3 py-2.5 ${value ? 'bg-[#F6E7E7]' : 'bg-white/80'}`}>
    <div className="text-[9px] font-bold text-[#656b67]">{label}</div>
    <div className={`mt-0.5 inline-flex items-center gap-1.5 text-lg font-black tabular-nums ${value ? 'text-[#8a3f34]' : 'text-[#214C40]'}`}>
      {value ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      {value}
    </div>
    <div className="text-[9px] text-[#696f6b]">{value === 0 ? (arabic ? 'مطابق' : 'clean') : (arabic ? 'يحتاج معالجة' : 'needs work')}</div>
  </div>
);

const Tile: React.FC<{ label: string; value: React.ReactNode; tone?: 'good' | 'warn' | 'quiet' }> = ({ label, value, tone }) => (
  <div className={`rounded-2xl border p-4 ${tone === 'warn' ? 'border-[#e6d9c2] bg-[#FBF7F0]' : tone === 'good' ? 'border-[#cddbd3] bg-[#F7FAF8]' : 'border-[#e4e2da] bg-white'}`}>
    <div className="text-[10px] font-bold text-[#656b67]">{label}</div>
    <div className="mt-1 text-2xl font-black tabular-nums text-[#24302b]">{value ?? '—'}</div>
  </div>
);

const NumberDial: React.FC<{ label: string; value: number; min: number; max: number; step: number; suffix?: string; hint?: string; onChange: (value: number) => void }> = ({ label, value, min, max, step, suffix, hint, onChange }) => (
  <label className="block min-w-0">
    <span className="block text-[10px] font-black tracking-[.1em] text-[#696f6b]">{label}</span>
    <div className="mizan-control mt-1 flex items-center gap-2">
      <button type="button" className="mizan-step-btn" aria-label="-" onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <input type="number" inputMode="numeric" min={min} max={max} value={value}
        onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
        className="min-w-0 flex-1 border-0 bg-transparent text-center text-sm font-black tabular-nums outline-none" />
      {suffix && <span className="text-[10px] font-bold text-[#696f6b]">{suffix}</span>}
      <button type="button" className="mizan-step-btn" aria-label="+" onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </div>
    {hint && <span className="mt-1 block text-[9px] leading-4 text-[#696f6b]">{hint}</span>}
  </label>
);

const ReuseChart: React.FC<{ distribution: { uses: number; questionCount: number }[]; arabic: boolean }> = ({ distribution, arabic }) => {
  if (!distribution.length) return <p className="mt-3 text-[11px] text-[#696f6b]">{arabic ? 'لا بيانات استعمال.' : 'No usage data.'}</p>;
  const max = Math.max(...distribution.map(d => d.questionCount));
  return (
    <div className="mt-4 overflow-x-auto">
      <div className="flex min-w-max items-end gap-2" role="img"
        aria-label={arabic ? distribution.map(d => `${d.questionCount} سؤالًا استُعمل ${d.uses} مرة`).join('، ') : distribution.map(d => `${d.questionCount} questions used ${d.uses} times`).join(', ')}>
        {distribution.map(row => (
          <div key={row.uses} className="flex w-12 flex-col items-center gap-1">
            <span className="text-[9px] font-black tabular-nums text-[#4f5752]">{row.questionCount}</span>
            <div className="h-24 w-full rounded-t-lg bg-[#eef1ec]">
              <div className="w-full rounded-t-lg bg-[#2F6555]" style={{ height: `${Math.max(4, Math.round((row.questionCount / max) * 96))}px`, marginTop: `${96 - Math.max(4, Math.round((row.questionCount / max) * 96))}px` }} />
            </div>
            <span className="text-[9px] font-bold tabular-nums text-[#696f6b]">{row.uses}×</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[9px] text-[#696f6b]">{arabic ? 'المحور الأفقي: عدد مرات الاستعمال · فوق العمود: عدد الأسئلة' : 'Horizontal: times used · above each bar: number of questions'}</p>
    </div>
  );
};
