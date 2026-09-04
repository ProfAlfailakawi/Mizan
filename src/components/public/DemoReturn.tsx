import React from 'react';
import { LayoutDashboard } from 'lucide-react';

export const DemoReturn:React.FC<{onReturn:()=>void;label?:string}>=({onReturn,label='كل التجارب'})=>
  <button onClick={onReturn} className="fixed bottom-4 start-4 sm:bottom-auto sm:top-4 z-[80] inline-flex items-center gap-2 rounded-xl border border-black/10 bg-[#FFFEFB]/95 backdrop-blur-sm px-3.5 py-2.5 text-[11px] font-black text-[#303733] shadow-md hover:bg-white" aria-label={label}>
    <LayoutDashboard className="w-4 h-4"/><span>{label}</span>
  </button>;
