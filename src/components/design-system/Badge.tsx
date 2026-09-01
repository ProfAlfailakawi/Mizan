import React from 'react';
interface BadgeProps { children: React.ReactNode; variant?: 'emerald'|'amber'|'blue'|'rose'|'neutral'; size?: 'sm'|'md'; className?: string; dot?: boolean; }
export const Badge: React.FC<BadgeProps> = ({children,variant='emerald',size='sm',className='',dot=true}) => {
 const v={emerald:'bg-[#E7EEE9] text-[#214C40] border-[#cbdad2]',amber:'bg-[#F2EADC] text-[#7d5e34] border-[#e4d5bd]',blue:'bg-[#E8EEF1] text-[#496477] border-[#d5e0e5]',rose:'bg-[#F4E6E3] text-[#8d4038] border-[#e8cfca]',neutral:'bg-[#EFEEE9] text-[#606863] border-[#deddd7]'};
 const d={emerald:'bg-[#2F6555]',amber:'bg-[#9B7542]',blue:'bg-[#496477]',rose:'bg-[#A34D43]',neutral:'bg-[#7d847f]'};
 return <span className={`inline-flex items-center rounded-full border font-semibold whitespace-nowrap ${size==='sm'?'text-[11px] px-2.5 py-1 gap-1.5':'text-xs px-3 py-1.5 gap-2'} ${v[variant]} ${className}`}>{dot&&<span className={`w-1.5 h-1.5 rounded-full ${d[variant]}`}/>}<span>{children}</span></span>
}
