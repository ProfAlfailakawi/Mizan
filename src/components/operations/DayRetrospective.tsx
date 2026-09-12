import React, { useMemo, useState } from 'react';
import { History, Lightbulb } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { Button } from '../design-system/Button';
import { Badge } from '../design-system/Badge';
import { describeEtaAccuracy } from '../../lib/session-tempo';
import type { DayRetrospective as Report } from '../../lib/day-retrospective';

/*
 * ماذا حدث اليوم فعلًا.
 *
 * كل سطحٍ آخر في المنصّة يخدم اللحظة: من يُنادى الآن، ومن التالي، وأين تعثّر الطابور.
 * وهذا وحده ينظر إلى الوراء — لأن أضعف ما في المسابقة السنويّة أن تجربتها تُكتسب ولا
 * تُحفظ، فيُعاد الإعداد في السنة القادمة بالأرقام نفسها التي ثبت خطؤها.
 *
 * ولا يُرتَّب به أحد. الأرقام هنا تقارن **ما قُدّر بما وقع**، لا لجنةً بلجنة — وترتيب
 * اللجان بالسرعة محظورٌ في هذا النظام لأنه يتحوّل ضغطًا على التحكيم.
 */

export const DayRetrospective: React.FC = () => {
  const s = useAppStore();
  const ar = s.language === 'ar';
  const [open, setOpen] = useState(false);
  const report: Report | null = useMemo(() => (open ? s.buildRetrospective() : null), [open, s.participants, s.committees, s.queueTransfers, s.incidents]);

  return <section className="mizan-surface p-5 sm:p-6">
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="w-11 h-11 rounded-xl bg-[#E7EEE9] text-[#214C40] grid place-items-center"><History className="w-5 h-5" /></span>
        <div>
          <div className="mizan-kicker">{ar ? 'مراجعة اليوم' : 'DAY RETROSPECTIVE'}</div>
          <h2 className="font-black mt-1">{ar ? 'ما قُدّر مقابل ما وقع' : 'What was planned against what happened'}</h2>
          <p className="text-[11px] text-[#646965] mt-2 max-w-2xl leading-5">
            {ar
              ? 'يقارن زمن الجلسة المُعدّ بما فعلته كل لجنة، وصدقَ الأرقام المعروضة على المنتظرين، وما اضطُرّت إليه القاعة من نقلٍ واستثناء. الغرض إعدادُ السنة القادمة، لا تقييمُ أحد.'
              : 'Compares configured session length with what each panel actually did, how honest the displayed waits were, and what the hall had to improvise. For next year’s setup — not for judging anyone.'}
          </p>
        </div>
      </div>
      <Badge variant="neutral">{ar ? 'وصفيّ — لا يُرتَّب به أحد' : 'Descriptive — ranks nobody'}</Badge>
    </div>

    <div className="mt-5">
      <Button variant={open ? 'outline' : 'primary'} onClick={() => setOpen(v => !v)} icon={<History className="w-4 h-4" />}>
        {open ? (ar ? 'إخفاء' : 'Hide') : (ar ? 'اعرض مراجعة اليوم' : 'Show the day retrospective')}
      </Button>
    </div>

    {report && <div className="mt-4 space-y-3">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <Figure n={report.participantsTested} t={ar ? 'اكتمل اختبارهم' : 'Tested'} />
        <Figure n={report.participantsStillWaiting} t={ar ? 'ما زالوا ينتظرون' : 'Still waiting'} />
        <Figure n={report.strain.queueTransfers} t={ar ? 'عمليات نقل' : 'Transfers'} tone={report.strain.queueTransfers ? 'warn' : 'plain'} />
        <Figure n={report.strain.crossCategoryExceptions} t={ar ? 'استثناء عبر الفئات' : 'Cross-category'} tone={report.strain.crossCategoryExceptions ? 'warn' : 'plain'} />
      </div>

      {/* إيقاع كل لجنة مقابل ما قُدّر لها — الفارق هو الدرس، لا الترتيب. */}
      <div className="rounded-2xl border border-[#dfddd6] p-4">
        <div className="text-[10px] font-black text-[#646965]">{ar ? 'زمن الجلسة: المُعدّ مقابل المقيس' : 'SESSION LENGTH: CONFIGURED VS MEASURED'}</div>
        <ul className="mt-2.5 divide-y divide-[#e6e4dd]">
          {report.panels.map(p => <li key={p.committeeId} className="py-2.5 flex items-center justify-between gap-3 text-[11px]">
            <span className="font-black shrink-0">{p.code}</span>
            <span className="text-[#646965] truncate">{ar ? `أنجز ${p.completed}` : `${p.completed} completed`}</span>
            <span className="tabular-nums shrink-0">
              {p.measuredMinutes === null
                ? <span className="text-[#646965]">{ar ? `${p.configuredMinutes}د · عيّنة قليلة` : `${p.configuredMinutes}m · too few`}</span>
                : <span className={Math.abs(p.driftMinutes || 0) >= 2 ? 'font-black text-[#725630]' : 'text-[#646965]'}>
                    {p.configuredMinutes} → {p.measuredMinutes} {ar ? 'د' : 'm'}
                    {p.driftMinutes ? ` (${p.driftMinutes > 0 ? '+' : ''}${p.driftMinutes})` : ''}
                  </span>}
            </span>
          </li>)}
          {!report.panels.length && <li className="py-3 text-[11px] text-[#646965]">{ar ? 'لا لجان في هذه المسابقة.' : 'No panels in this competition.'}</li>}
        </ul>
      </div>

      {/* التقدير يُحاسَب: الشيء الوحيد في المنصّة الذي كان يَعِد ولا يُراجَع. */}
      <div className="rounded-2xl bg-[#f1efe9] px-4 py-3">
        <div className="text-[10px] font-black text-[#646965]">{ar ? 'صدق الأرقام المعروضة على المنتظرين' : 'HONESTY OF THE WAITS WE SHOWED'}</div>
        <p className="text-[11px] mt-1.5 leading-5">{describeEtaAccuracy(report.eta, ar)}</p>
      </div>

      <div className="rounded-2xl border border-[#d8c7a7] bg-[#fffaf0] p-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-[#8a6d1f]" aria-hidden />
          <div className="text-xs font-black text-[#604724]">{ar ? 'لإعداد السنة القادمة' : 'For next year’s setup'}</div>
        </div>
        <ul className="mt-2.5 space-y-2.5">
          {report.lessons.map((l, i) => <li key={i}>
            <div className="text-[11px] font-black text-[#604724]">{ar ? l.titleArabic : l.titleEnglish}</div>
            <div className="text-[10px] text-[#6b5b45] mt-0.5 leading-5">{ar ? l.detailArabic : l.detailEnglish}</div>
          </li>)}
        </ul>
      </div>
    </div>}
  </section>;
};

const Figure = ({ n, t, tone = 'plain' }: { n: number; t: string; tone?: 'plain' | 'warn' }) => (
  <div className={`rounded-xl px-4 py-3 ${tone === 'warn' ? 'bg-[#F2EADC] text-[#725630]' : 'bg-[#f1efe9] text-[#171b18]'}`}>
    <div className="text-lg font-black tabular-nums">{n}</div>
    <div className="text-[10px] opacity-75">{t}</div>
  </div>
);
