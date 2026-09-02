import React from 'react';

export type MizanPictogramKind='quran-source'|'scientific-approval'|'ai-capability'|'policy'|'conflict'|'seal'|'certificate'|'pass'|'recovery'|'device'|'judge-break'|'fairdraw'|'federation'|'benchmark'|'rehearsal'|'qiraah'|'phoneme'|'audio'|'alignment';
const paths:Record<MizanPictogramKind,React.ReactNode>={
 'quran-source':<><path d="M6 5.5c3-1 5-.5 6 1v11c-1-1.5-3-2-6-1z"/><path d="M18 5.5c-3-1-5-.5-6 1v11c1-1.5 3-2 6-1z"/><path d="M12 6.5V19"/></>,
 'scientific-approval':<><circle cx="12" cy="12" r="7"/><path d="m8.7 12 2 2 4.5-4.5"/><path d="M12 2.5v2M12 19.5v2"/></>,
 'ai-capability':<><rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 10h6M9 14h3M3.5 10H6M18 10h2.5M10 3.5V6M14 18v2.5"/></>,
 'policy':<><path d="M7 3.5h8l3 3V20H7z"/><path d="M15 3.5V7h3M10 11h5M10 15h5"/></>,
 'conflict':<><path d="M12 3 21 19H3z"/><path d="M12 9v4M12 16h.01"/></>,
 'seal':<><circle cx="12" cy="10" r="6"/><path d="m9 16-1 5 4-2 4 2-1-5M9.5 10h5"/></>,
 'certificate':<><rect x="5" y="4" width="14" height="14" rx="2"/><circle cx="12" cy="11" r="3"/><path d="m10 14-1 6 3-2 3 2-1-6"/></>,
 'pass':<><rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M7 10h4M7 14h6M16 9v6"/></>,
 'recovery':<><path d="M4 8h16v11H4zM7 8V5h10v3"/><path d="M8 13a4 4 0 1 0 2-3.5M8 9v4h4"/></>,
 'device':<><rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M9 7h6M10 17h4"/></>,
 'judge-break':<><path d="M6 4h9v7a4.5 4.5 0 0 1-9 0zM15 7h2a2 2 0 0 1 0 4h-2M5 20h12"/></>,
 'fairdraw':<><path d="M6 4h12l2 5-8 11L4 9z"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="12" cy="13" r="1"/></>,
 'federation':<><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="m8.3 11 7.2-3M8.3 13l7.2 3"/></>,
 'benchmark':<><path d="M5 19V9M10 19V5M15 19v-7M20 19V8M3 19h19"/></>,
 'rehearsal':<><circle cx="12" cy="12" r="8"/><path d="m10 8 6 4-6 4z"/></>,
 'qiraah':<><path d="M5 12c2-4 4-6 7-6s5 2 7 6c-2 4-4 6-7 6s-5-2-7-6z"/><path d="M9 12h6M12 9v6"/></>,
 'phoneme':<><path d="M5 13h2l2-6 3 10 3-8 2 4h2"/></>,
 'audio':<><path d="M5 10v4h3l4 4V6L8 10zM16 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/></>,
 'alignment':<><path d="M5 7h14M5 12h14M5 17h14"/><circle cx="9" cy="7" r="1.5"/><circle cx="14" cy="12" r="1.5"/><circle cx="11" cy="17" r="1.5"/></>
};
export const MizanPictogram:React.FC<{kind:MizanPictogramKind;size?:'sm'|'md'|'lg';tone?:'ink'|'emerald'|'amber'|'red';className?:string}>=({kind,size='md',tone='ink',className=''})=>{
 const px=size==='sm'?'w-9 h-9':size==='lg'?'w-16 h-16':'w-11 h-11';const toneClass=tone==='emerald'?'bg-[#E7EEE9] text-[#214C40]':tone==='amber'?'bg-[#F3EBDD] text-[#8A6536]':tone==='red'?'bg-[#F5E7E4] text-[#984F46]':'bg-[#F0EEE8] text-[#2d3732]';
 return <span className={`${px} ${toneClass} rounded-2xl inline-grid place-items-center shrink-0 ${className}`}><svg viewBox="0 0 24 24" className={size==='lg'?'w-8 h-8':'w-5 h-5'} fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg></span>
};
