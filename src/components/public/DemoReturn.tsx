import React from 'react';
import { LayoutDashboard } from 'lucide-react';

export const DemoReturn:React.FC<{onReturn:()=>void;label?:string}>=({onReturn,label='كل التجارب'})=>
  <button onClick={onReturn} className="fixed top-4 start-4 z-[80] inline-flex items-center gap-2 rounded-xl border border-black/10 bg-[#FFFEFB]/90 backdrop-blur-sm px-3 py-2 text-[11px] font-black text-[#303733] shadow-sm hover:bg-white" aria-label={label}>
    <LayoutDashboard className="w-4 h-4"/><span>{label}</span>
  </button>;
