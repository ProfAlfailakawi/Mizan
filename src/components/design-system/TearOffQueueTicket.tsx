import React,{useEffect,useState} from 'react';
import { Scissors } from 'lucide-react';

export const TearOffQueueTicket:React.FC<{number:number|string;committee?:string;ar?:boolean;compact?:boolean}>=({number,committee,ar=true,compact=false})=>{
 const [issued,setIssued]=useState(false);useEffect(()=>{setIssued(false);const t=window.setTimeout(()=>setIssued(true),80);return()=>window.clearTimeout(t)},[number]);
 const value=typeof number==='number'?String(number).padStart(3,'0'):String(number);
 return <div className={`mizan-ticket-machine ${compact?'mizan-ticket-machine-compact':''}`} aria-label={ar?`تذكرة الدور ${value}`:`Queue ticket ${value}`}>
  <div className="mizan-ticket-dispenser"><span/><span/></div>
  <div className={`mizan-ticket-paper ${issued?'mizan-ticket-issued':''}`}>
   <div className="mizan-ticket-cut"><Scissors className="w-3 h-3"/></div>
   <div className="mizan-ticket-label">{ar?'رقم الدور':'QUEUE'}</div>
   <div className="mizan-ticket-number">{value}</div>
   <div className="mizan-ticket-meta">{committee?`${ar?'اللجنة':'Panel'} ${committee}`:(ar?'احتفظ بهذه الأسبقية':'Priority preserved')}</div>
  </div>
 </div>
}
