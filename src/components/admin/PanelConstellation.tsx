import React from 'react';

export interface ConstellationJudge { id: string; userId?: string; name: string; nameArabic?: string }

/*
 * كوكبة اللجنة: الرئيس في المركز والمحكّمون حوله عُقَدًا صغيرة، والعقدة المملوءة هي من انضمّ إلى اللجنة.
 * قراءة فقط — كل ما فيها مشتقّ من القائمة التي تحتها، والاختيار الفعلي يبقى في مربّعات القائمة نفسها.
 */
const initialOf = (name: string) => (name || '').trim().replace(/^(د\.|أ\.|الشيخ|الدكتور|الأستاذ|Dr\.?|Sheikh)\s*/i, '').charAt(0) || '·';

export const PanelConstellation: React.FC<{
  judges: ConstellationJudge[];
  isSelected: (j: ConstellationJudge) => boolean;
  headId?: string;
  ar: boolean;
}> = ({ judges, isSelected, headId, ar }) => {
  const nm = (j: ConstellationJudge) => (ar ? j.nameArabic || j.name : j.name) || '';
  const n = Math.max(judges.length, 1);
  const C = 120, R = 92;
  const isHead = (j: ConstellationJudge) => !!headId && (j.id === headId || j.userId === headId);
  const head = judges.find(isHead);
  const members = judges.filter(isSelected).length;
  const pos = (i: number) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [C + R * Math.cos(a), C + R * Math.sin(a)] as const; };
  const label = ar
    ? `${members} من ${judges.length} محكمًا في اللجنة${head ? ` · الرئيس ${nm(head)}` : ''}`
    : `${members} of ${judges.length} judges on this panel${head ? ` · chair ${nm(head)}` : ''}`;
  return (
    <figure className="mx-auto mt-2 flex w-full max-w-[176px] flex-col items-center" data-testid="panel-constellation">
      <svg viewBox="0 0 240 240" role="img" aria-label={label} className="h-auto w-full">
        <circle cx={C} cy={C} r={R} fill="none" stroke="#e4e2db" strokeWidth="1" strokeDasharray="2 4" />
        {judges.map((j, i) => { if (!isSelected(j)) return null; const [x, y] = pos(i); return <line key={`l-${j.id}`} x1={C} y1={C} x2={x} y2={y} stroke="#2F6555" strokeOpacity="0.22" strokeWidth="1.2" />; })}
        {judges.map((j, i) => {
          const [x, y] = pos(i); const sel = isSelected(j); const h = isHead(j);
          return (
            <g key={j.id}>
              <title>{nm(j)}</title>
              <circle cx={x} cy={y} r={h ? 11 : 9.5} fill={sel ? '#214C40' : '#fffefb'} stroke={h ? '#B98B4E' : sel ? '#214C40' : '#cfd5d0'} strokeWidth={h ? 2.4 : 1.4} />
              <text x={x} y={y + 3.4} textAnchor="middle" fontSize="9.5" fontWeight="800" fill={sel ? '#fffefb' : '#8a918c'}>{initialOf(nm(j))}</text>
            </g>
          );
        })}
        <circle cx={C} cy={C} r="27" fill={head ? '#E7EEE9' : '#fffefb'} stroke={head ? '#B98B4E' : '#cfd5d0'} strokeWidth="2" strokeDasharray={head ? undefined : '3 4'} />
        <text x={C} y={C + 8} textAnchor="middle" fontSize="22" fontWeight="900" fill={head ? '#214C40' : '#a2a8a4'}>{head ? initialOf(nm(head)) : '·'}</text>
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-bold text-[#646965]">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#B98B4E] bg-[#E7EEE9]" />{ar ? 'الرئيس' : 'Chair'}</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[#214C40]" />{ar ? 'في اللجنة' : 'On panel'}</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="inline-block h-2.5 w-2.5 rounded-full border border-[#cfd5d0] bg-white" />{ar ? 'خارجها' : 'Not assigned'}</span>
      </figcaption>
    </figure>
  );
};
