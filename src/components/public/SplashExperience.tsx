import React, {useEffect, useState} from 'react';

const SPLASH_DURATION_MS=1550;
const SPLASH_EXIT_MS=260;

export const SplashExperience:React.FC<{onDone:()=>void}>=({onDone})=>{
 const [leaving,setLeaving]=useState(false);
 useEffect(()=>{
  const prefersReduced=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const hold=prefersReduced?520:SPLASH_DURATION_MS;
  const exit=prefersReduced?20:SPLASH_EXIT_MS;
  const leaveTimer=window.setTimeout(()=>setLeaving(true),hold);
  const doneTimer=window.setTimeout(onDone,hold+exit);
  return()=>{window.clearTimeout(leaveTimer);window.clearTimeout(doneTimer)};
 },[onDone]);
 return <div className={`mizan-splash ${leaving?'mizan-splash-leaving':''}`} dir="rtl" role="status" aria-label="جاري فتح ميزان">
  <div className="mizan-splash-glow" aria-hidden="true"/>
  <img className="mizan-splash-art" src="/brand/mizan-splash.webp" alt="" width="941" height="1672" decoding="async" fetchPriority="high"/>
  <div className="mizan-splash-hairline" aria-hidden="true"><span/></div>
  <span className="sr-only">جاري فتح ميزان</span>
 </div>;
};
