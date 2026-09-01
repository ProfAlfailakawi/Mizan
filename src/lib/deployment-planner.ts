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
