import React, { useMemo } from 'react';
import { MapPin as MapIcon } from 'lucide-react';
import type { CommitteeBoardSlice } from '../../lib/display-board';

/*
 * «القاعة من فوق» — مخطّطٌ حيّ لمدير المسابقة.
 *
 * كل لجنةٍ جزيرة، والمنتظرون نقاطٌ تسري من البوابة إلى جزيرة لجنتهم، والجزيرة المزدحمة
 * (لجنةٌ شاغرة وأمامها منتظرون، أو طابورٌ أطول بوضوح من بقية القاعة) يتوهّج حولها كهرمان.
 * المصدر هو إسقاط القاعة نفسه (`buildDisplayBoard`) الذي تقرؤه شاشة الانتظار: أعداد ورموز
 * لجان فقط، لا أسماء. لا يرتّب اللجان بالسرعة ولا يحكم عليها؛ يقول أين يتجمّع الناس.
 * الحركة CSS، وتقليلها يُبقي النقاط ثابتةً في طريقها.
 */

const W = 640;
const GATE = { x: W / 2, y: 300 };
const MAX_DOTS = 7;

export const HallFromAbove: React.FC<{ ar: boolean; committees: CommitteeBoardSlice[]; unassignedWaiting: number }> = ({ ar, committees, unassignedWaiting }) => {
  const shown = committees.slice(0, 12);
  const cols = Math.min(4, Math.max(1, shown.length));
  const rows = Math.ceil(shown.length / cols);
  const H = 330;
  const waits = shown.map(c => c.waitingCount).sort((a, b) => a - b);
  const median = waits.length ? waits[Math.floor(waits.length / 2)] : 0;
  const islands = useMemo(() => shown.map((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = ((ar ? cols - 1 - col : col) + 0.5) * (W / cols);
    const y = 52 + row * (rows > 2 ? 72 : 96);
    const congested = c.status !== 'offline' && (c.stalled || (c.waitingCount >= 4 && c.waitingCount >= median * 2));
    return { c, x, y, congested };
  }), [shown, cols, rows, ar, median]);

  const busy = islands.filter(i => i.congested).length;
  const label = ar
    ? `القاعة من فوق: ${shown.length} لجنة، ${shown.reduce((n, c) => n + c.waitingCount, 0)} منتظرًا${busy ? `، ${busy} لجنة مزدحمة` : ''}`
    : `Hall from above: ${shown.length} panels, ${shown.reduce((n, c) => n + c.waitingCount, 0)} waiting${busy ? `, ${busy} congested` : ''}`;

  return (
    <section className="mizan-surface p-5 mz-vw-above" data-hall-from-above>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><div className="mizan-kicker">{ar ? 'القاعة من فوق' : 'HALL FROM ABOVE'}</div><h2 className="mt-1 font-extrabold">{ar ? 'أين يتجمّع المنتظرون الآن' : 'Where people are waiting right now'}</h2></div>
        <MapIcon className="h-5 w-5 shrink-0 text-[color:var(--emerald-2)]" aria-hidden="true" />
      </div>
      <div className="overflow-hidden rounded-2xl bg-[var(--venue-2)]">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="block h-auto w-full">
          {islands.map(({ c, x, y }) => <path key={`p-${c.committeeId}`} d={`M${GATE.x} ${GATE.y} Q ${(GATE.x + x) / 2} ${(GATE.y + y) / 2 + 40} ${x} ${y + 22}`} className="mz-vw-above__lane" />)}
          {islands.map(({ c, x, y }) => {
            const n = c.status === 'offline' ? 0 : Math.min(MAX_DOTS, c.waitingCount);
            return Array.from({ length: n }, (_, k) => {
              const t = (k + 1) / (MAX_DOTS + 1);
              const cx = GATE.x + (x - GATE.x) * t;
              const cy = GATE.y + (y + 22 - GATE.y) * t + 40 * 2 * t * (1 - t);
              return <circle key={`${c.committeeId}-${k}`} cx={cx.toFixed(1)} cy={cy.toFixed(1)} r={3.4} className="mz-vw-above__dot" style={{ '--mz-vw-dx': `${((x - GATE.x) / (MAX_DOTS + 1)).toFixed(1)}px`, '--mz-vw-dy': `${((y + 22 - GATE.y) / (MAX_DOTS + 1)).toFixed(1)}px`, animationDelay: `${k * -0.35}s` } as React.CSSProperties} />;
            });
          })}
          {islands.map(({ c, x, y, congested }) => (
            <g key={c.committeeId} className={`mz-vw-above__island${congested ? ' is-congested' : ''}${c.status === 'offline' ? ' is-offline' : ''}`}>
              {congested && <ellipse cx={x} cy={y} rx={62} ry={30} className="mz-vw-above__glow" />}
              <ellipse cx={x} cy={y} rx={50} ry={22} className="mz-vw-above__land" />
              <text x={x} y={y - 2} textAnchor="middle" className="mz-vw-above__code">{c.code}</text>
              <text x={x} y={y + 13} textAnchor="middle" className="mz-vw-above__count">{c.status === 'offline' ? (ar ? 'متوقفة' : 'offline') : (ar ? `${c.waitingCount} منتظرًا` : `${c.waitingCount} waiting`)}</text>
              {c.nowCalling && <circle cx={x + (ar ? -44 : 44)} cy={y - 14} r={5} className="mz-vw-above__live" />}
            </g>
          ))}
          <g>
            <rect x={GATE.x - 46} y={GATE.y - 2} width={92} height={24} rx={12} className={`mz-vw-above__gate${unassignedWaiting ? ' is-congested' : ''}`} />
            <text x={GATE.x} y={GATE.y + 14} textAnchor="middle" className="mz-vw-above__gate-text">{ar ? `البوابة${unassignedWaiting ? ` · ${unassignedWaiting} بلا لجنة` : ''}` : `Gate${unassignedWaiting ? ` · ${unassignedWaiting} unassigned` : ''}`}</text>
          </g>
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold text-[color:var(--muted)]">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-[#e8cb93]" />{ar ? 'منتظر' : 'waiting'}</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-[#86c6a8]" />{ar ? 'تنادي الآن' : 'calling now'}</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full bg-[#d99a3d]" />{ar ? 'ازدحام' : 'congestion'}</span>
        {committees.length > 12 && <span>{ar ? `أول ١٢ لجنة من ${committees.length}` : `First 12 of ${committees.length} panels`}</span>}
      </div>
    </section>
  );
};
