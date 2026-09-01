import React from 'react';
type Tone='emerald'|'ink'|'amber'|'rose'|'blue'|'neutral';
export const Pictogram:React.FC<{icon:React.ComponentType<{className?:string}>;size?:'sm'|'md'|'lg';tone?:Tone;className?:string}>=({icon:Icon,size='md',tone='emerald',className=''})=>{
 const dims=size==='sm'?'w-10 h-10 rounded-[14px]':size==='lg'?'w-16 h-16 rounded-[21px]':'w-12 h-12 rounded-[17px]';
 return <span className={`mizan-pictogram mizan-pictogram-${tone} ${dims} ${className}`} aria-hidden="true"><span className="mizan-pictogram-scene"><span className="mizan-pictogram-dot"/><span className="mizan-pictogram-plane"/></span><Icon className={size==='lg'?'w-7 h-7':size==='sm'?'w-4 h-4':'w-5 h-5'}/></span>
}
