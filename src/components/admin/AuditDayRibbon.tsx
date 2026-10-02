import React, { useMemo } from 'react';

/*
 * شريط الأيام لدفتر التدقيق: يومٌ في كل سطر، وساعاته الأربع والعشرون أعمدةٌ بارتفاع عدد الأحداث،
 * ونقطةٌ فوق الساعة التي وقع فيها حدثٌ حسّاس. كل رقم هنا مأخوذ من السجل الظاهر تحته؛ لا بيانات جديدة.
 * «الحسّاس» = ما يفتح باب مراجعة: بلاغ، تظلّم، إلغاء شهادة، رفض نطاق، إيقاف لجنة.
 */
const RISK_ACTIONS = new Set([
  'INCIDENT_RAISED', 'APPEAL_OPENED', 'CERTIFICATE_REVOKED', 'SCOPE_REJECTED', 'COMMITTEE_PAUSED',
]);
export const isSensitiveAuditAction = (action?: string) => !!action && RISK_ACTIONS.has(action);

interface Ev { timestamp: string; action: string }

export const AuditDayRibbon: React.FC<{ events: Ev[]; ar: boolean; maxDays?: number }> = ({ events, ar, maxDays = 7 }) => {
  const days = useMemo(() => {
    const m = new Map<string, { label: string; hours: number[]; risk: boolean[]; total: number; sensitive: number; ts: number }>();
    for (const e of events) {
      const d = new Date(e.timestamp); if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      let row = m.get(key);
      if (!row) { row = { label: d.toLocaleDateString(ar ? 'ar-KW-u-nu-latn' : 'en-US'), hours: Array(24).fill(0), risk: Array(24).fill(false), total: 0, sensitive: 0, ts: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }; m.set(key, row); }
      const h = d.getHours(); row.hours[h]++; row.total++;
      if (isSensitiveAuditAction(e.action)) { row.risk[h] = true; row.sensitive++; }
    }
    return [...m.values()].sort((a, b) => b.ts - a.ts).slice(0, maxDays);
  }, [events, ar, maxDays]);
  if (!days.length) return null;
  const peak = Math.max(1, ...days.flatMap(d => d.hours));
  const totalSensitive = days.reduce((n, d) => n + d.sensitive, 0);
  return (
    <section className="mizan-surface p-4 sm:p-5" aria-label={ar ? 'شريط أيام السجل' : 'Audit day ribbon'} data-testid="audit-day-ribbon">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="mizan-kicker">{ar ? 'شريط الأيام' : 'DAY RIBBON'}</div>
        <div className="flex items-center gap-3 text-[11px] font-bold text-[#646965]">
          <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[#C08A2E] ring-2 ring-[#F5EDE2]" />{ar ? `حدث حسّاس (${totalSensitive})` : `Sensitive (${totalSensitive})`}</span>
          <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm bg-[#9fb8ad]" />{ar ? 'أحداث الساعة' : 'Events / hour'}</span>
        </div>
      </div>
      <div className="mt-3 space-y-2.5">
        {days.map(d => (
          <div key={d.ts} className="grid items-end gap-x-3 gap-y-1 sm:grid-cols-[8.5rem_1fr_3.5rem]">
            <div className="text-xs font-black text-[#3a423d] tabular-nums">{d.label}</div>
            <div dir="ltr" className="grid h-12 items-end gap-[2px]" style={{ gridTemplateColumns: 'repeat(24,minmax(0,1fr))' }} aria-hidden>
              {d.hours.map((n, h) => (
                <div key={h} className="relative flex h-full flex-col items-center justify-end" title={`${String(h).padStart(2, '0')}:00 — ${n}`}>
                  {d.risk[h] && <span className="mb-0.5 h-2 w-2 rounded-full bg-[#C08A2E] ring-2 ring-[#F5EDE2]" />}
                  <span className={`w-full rounded-sm ${n ? 'bg-[#9fb8ad]' : 'bg-[#eceae4]'}`} style={{ height: n ? `${Math.max(12, (n / peak) * 70)}%` : '3px' }} />
                </div>
              ))}
            </div>
            <div className="text-xs font-black text-[#214C40] tabular-nums sm:text-end">{d.total}{d.sensitive ? <span className="ms-1.5 text-[#8a6a2c]">· {d.sensitive}</span> : null}</div>
          </div>
        ))}
      </div>
      <div dir="ltr" className="mt-1 grid gap-[2px] text-[10px] font-bold text-[#656b67] sm:ms-[calc(3.5rem+0.75rem)] sm:me-[calc(8.5rem+0.75rem)]" style={{ gridTemplateColumns: 'repeat(24,minmax(0,1fr))' }} aria-hidden>{[0, 6, 12, 18, 23].map(h => <span key={h} className="text-center tabular-nums" style={{ gridColumn: `${h + 1} / span 1`, justifySelf: 'center' }}>{String(h).padStart(2, '0')}</span>)}</div>
    </section>
  );
};
