import React from 'react';

export const MizanMark:React.FC<{className?:string;decorative?:boolean}>=({className='',decorative=false})=><svg className={className} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" role={decorative?undefined:'img'} aria-label={decorative?undefined:'شعار ميزان'} aria-hidden={decorative||undefined}>
  <path d="M60 11 64 15 60 19 56 15 60 11Z" fill="#B98B4E"/>
  <path d="M60 23c-14 6-24 17-29 31 8-9 17-14 29-17V23Z" fill="#164C40"/>
  <path d="M60 23c14 6 24 17 29 31-8-9-17-14-29-17V23Z" fill="#245D50"/>
  <path d="M28 62c12-5 22-5 32 2v29c-9-9-19-13-32-12V62Z" fill="#F7F0E3" stroke="#D6B77F" strokeWidth="1.6"/>
  <path d="M92 62c-12-5-22-5-32 2v29c9-9 19-13 32-12V62Z" fill="#FFF9EE" stroke="#D6B77F" strokeWidth="1.6"/>
  <path d="M29 82c11-1 21 3 31 13-12-6-23-8-34-5l3-8Z" fill="#164C40"/>
  <path d="M91 82c-11-1-21 3-31 13 12-6 23-8 34-5l-3-8Z" fill="#164C40"/>
  <path d="M60 42v50" stroke="#B98B4E" strokeWidth="2.8" strokeLinecap="round"/>
  <circle cx="60" cy="47" r="4.6" fill="#CBA05E"/>
  <path d="M31 54c7-17 17-28 29-31" stroke="#164C40" strokeWidth="5" strokeLinecap="round"/>
  <path d="M89 54c-7-17-17-28-29-31" stroke="#245D50" strokeWidth="5" strokeLinecap="round"/>
</svg>;

export const MizanLogo:React.FC<{language?:string;compact?:boolean;className?:string;showWordmark?:boolean}>=({language='ar',compact=false,className='',showWordmark=true})=>{
 const ar=language==='ar';
 return <div className={`inline-flex items-center gap-2.5 ${className}`} aria-label={ar?'ميزان':'MIZAN'}>
   <MizanMark className={compact?'w-9 h-9':'w-12 h-12'} decorative/>
   {showWordmark&&<div className="leading-none"><div className={`${compact?'text-[19px]':'text-[27px]'} font-black tracking-[-.045em] text-[#173F36]`}>{ar?'ميزان':'MIZAN'}</div>{!ar&&!compact&&<div className="mt-1 text-[8px] tracking-[.32em] text-[#967342]">QURAN COMPETITION OS</div>}</div>}
 </div>
}
