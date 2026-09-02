import { Competition } from '../types';
import { getCompetitionPolicy } from './competition-config';

export type DeploymentProfile = 'lean'|'balanced'|'premium';

export interface DeploymentItem {
  id:string;
  labelAr:string;
  labelEn:string;
  quantity:number;
  required:boolean;
  noteAr:string;
  noteEn:string;
}

export interface DeploymentPlan {
  profile:DeploymentProfile;
  gateStations:number;
  judgeStations:number;
  publicDisplays:number;
  edgeServers:number;
  printers:number;
  staffFloor:number;
  items:DeploymentItem[];
  principleAr:string;
  principleEn:string;
}

export function buildDeploymentPlan(competition:Competition, profile:DeploymentProfile):DeploymentPlan {
  const policy=getCompetitionPolicy(competition);
  const committees=Math.max(1,competition.venuesCount ? Math.ceil(competition.categories.length/Math.max(1,competition.venuesCount)) : competition.categories.length);
  const judgeStations=Math.max(policy.judging.mode==='specialized_judges'?committees*2:committees, 1);
  const participantScale=Math.max(competition.totalApproved,competition.totalRegistered,competition.categories.reduce((a,c)=>a+c.targetParticipants,0),100);
  const gateStations=profile==='lean'?1:profile==='balanced'?Math.max(1,Math.ceil(participantScale/500)):Math.max(2,Math.ceil(participantScale/300));
  const publicDisplays=profile==='lean'?1:profile==='balanced'?Math.max(1,competition.venuesCount):Math.max(2,competition.venuesCount*2);
  const edgeServers=policy.operations.offlineContinuity?(profile==='premium'?2:1):0;
  const printers=policy.operations.ticketMode==='print_optional'?(profile==='lean'?0:1):0;
  const staffFloor=profile==='lean'?1:profile==='balanced'?2:Math.max(2,competition.venuesCount);
  return {
    profile,gateStations,judgeStations,publicDisplays,edgeServers,printers,staffFloor,
    principleAr: profile==='lean'?'استفد من الموجود أولًا: كمبيوتر عادي + متصفح + شاشة انتظار. الطابعة والكشك المخصص اختياريان.':profile==='balanced'?'أجهزة مخصصة فقط في نقاط الاحتكاك العالية، مع إعادة استخدام بقية الأجهزة.':'تجهيز مخصص واحتياطي أعلى للفعاليات الكبرى والبث الرسمي.',
    principleEn: profile==='lean'?'Reuse what already exists: a normal computer + browser + waiting display. Printer and dedicated kiosk are optional.':profile==='balanced'?'Dedicated hardware only at high-friction points; reuse the rest.':'Dedicated and redundant hardware for major official events.',
    items:[
      {id:'gate',labelAr:'بوابة الحضور',labelEn:'Arrival gate',quantity:gateStations,required:true,noteAr:'كمبيوتر مكتبي أو لابتوب يكفي؛ وضع ملء الشاشة يحوله إلى Kiosk.',noteEn:'Any desktop or laptop works; fullscreen mode turns it into a kiosk.'},
      {id:'scanner',labelAr:'مسح QR',labelEn:'QR scanning',quantity:gateStations,required:false,noteAr:'كاميرا الجهاز تكفي. قارئ USB خيار للسرعة فقط.',noteEn:'Device camera is enough. USB scanner is only a speed upgrade.'},
      {id:'ticket',labelAr:'رقم الانتظار',labelEn:'Queue ticket',quantity:publicDisplays,required:true,noteAr:'الرقم يظهر على الشاشة وهاتف المتسابق؛ لا حاجة لطباعة ورق.',noteEn:'Number appears on screen and participant phone; no paper required.'},
      {id:'judge',labelAr:'محطات التحكيم',labelEn:'Judge stations',quantity:judgeStations,required:true,noteAr:'متصفح على جهاز موجود؛ Judge Pad اختياري.',noteEn:'Browser on existing hardware; Judge Pad is optional.'},
      {id:'display',labelAr:'شاشات الانتظار',labelEn:'Waiting displays',quantity:publicDisplays,required:true,noteAr:'أي TV/شاشة مع متصفح أو HDMI.',noteEn:'Any TV/display with browser or HDMI.'},
      {id:'edge',labelAr:'استمرارية محلية',labelEn:'Local continuity',quantity:edgeServers,required:policy.operations.offlineContinuity,noteAr:'Mini PC واحد يكفي للوضع الاقتصادي؛ الثاني احتياطي في Premium.',noteEn:'One mini PC is enough in lean mode; Premium adds standby.'},
      {id:'printer',labelAr:'طابعة',labelEn:'Printer',quantity:printers,required:false,noteAr:'اختيارية فقط إذا اشترطت الجهة تذاكر أو بطاقات ورقية.',noteEn:'Optional only when paper tickets/badges are required.'}
    ]
  };
}

export interface VenueInventory {
  laptops:number;
  desktops:number;
  tablets:number;
  tvs:number;
  printers:number;
  usbScanners:number;
  edgeMiniPcs:number;
  wifi:boolean;
  participantByod:boolean;
}

export interface VenueAssignment {
  id:string;
  role:'Gate'|'JudgeOS'|'Operations'|'Waiting Display'|'Head Judge'|'Exception Host'|'Ceremony'|'Broadcast'|'Edge';
  source:string;
  status:'AVAILABLE'|'REQUIRED'|'OPTIONAL'|'RECOMMENDED';
}

export interface VenueComposition {
  assignments:VenueAssignment[];
  missingRequired:number;
  recommendedAdditional:number;
  summaryAr:string;
  summaryEn:string;
  checklistAr:string[];
  checklistEn:string[];
}

/** Deterministic venue composition. It never invents prices or savings. */
export function composeVenue(competition:Competition, inventory:VenueInventory):VenueComposition {
  const policy=getCompetitionPolicy(competition);
  const pool:string[]=[];
  for(let i=1;i<=inventory.laptops;i++) pool.push(`Laptop ${i}`);
  for(let i=1;i<=inventory.desktops;i++) pool.push(`Desktop ${i}`);
  for(let i=1;i<=inventory.tablets;i++) pool.push(`Tablet ${i}`);
  const take=()=>pool.shift();
  const assignments:VenueAssignment[]=[];
  const add=(role:VenueAssignment['role'], source:string|undefined, status:VenueAssignment['status'])=>assignments.push({id:`${role}-${assignments.length+1}`,role,source:source||'Additional device required',status:source?status:'REQUIRED'});
  add('Gate',take(),'AVAILABLE');
  add('Operations',take(),'AVAILABLE');
  const activePanels=Math.max(1, Math.min(competition.categories.length, 8));
  for(let i=0;i<activePanels;i++) add('JudgeOS',take(),'AVAILABLE');
  if(pool.length) add('Head Judge',take(),'AVAILABLE'); else add('Head Judge',undefined,'RECOMMENDED');
  if(pool.length) add('Exception Host',take(),'OPTIONAL');
  for(let i=1;i<=inventory.tvs;i++) assignments.push({id:`tv-${i}`,role:i===1?'Waiting Display':i===2?'Ceremony':'Broadcast',source:`TV ${i}`,status:i===1?'AVAILABLE':'OPTIONAL'});
  if(policy.operations.offlineContinuity){
    const edge=inventory.edgeMiniPcs>0?'Mini PC 1':pool.shift();
    add('Edge',edge,edge?'AVAILABLE':'RECOMMENDED');
  }
  const missingRequired=assignments.filter(a=>a.status==='REQUIRED'&&a.source==='Additional device required').length;
  const recommendedAdditional=assignments.filter(a=>a.status==='RECOMMENDED'&&a.source==='Additional device required').length;
  const enough=missingRequired===0;
  return {
    assignments,missingRequired,recommendedAdditional,
    summaryAr: enough ? (recommendedAdditional?`لا توجد أجهزة إلزامية إضافية. ${recommendedAdditional} جهاز إضافي موصى به.`:'لا توجد أجهزة إضافية مطلوبة.') : `${missingRequired} جهاز إضافي مطلوب للتشغيل المحدد.`,
    summaryEn: enough ? (recommendedAdditional?`No additional mandatory hardware. ${recommendedAdditional} additional device recommended.`:'No additional hardware required.') : `${missingRequired} additional device(s) required for this deployment.`,
    checklistAr:['تسمية كل جهاز وموقعه','فتح رابط الدور بملء الشاشة','اختبار الشبكة والعمل دون اتصال','اختبار الصوت قبل أول جلسة','تثبيت مسار استثناء بشري واحد'],
    checklistEn:['Name every device and location','Open the assigned role in fullscreen','Test network and offline continuity','Test audio before the first session','Keep one human exception path']
  };
}
