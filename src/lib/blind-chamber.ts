import type { BlindChamberLiftRecord, JudgingPolicy, Participant } from '../types';
import { hashCanonical } from './trust-protocol';
import { newId } from './crypto';

/*
 * الغرفة العمياء — تحكيم أعمى بدرجات مختارة، مع إثبات مدقَّق أن القرارات قُفلت قبل كشف الهوية.
 *
 * إخفاء الاسم وحده لا يكفي: الجنسية والجهة والرواية وسجل النتائج السابقة كلها قنوات استدلال.
 * لذلك تُختار درجة العتامة، ويُبنى ما يراه المحكّم من المسموح فقط لا بحذف الممنوع.
 */

export type BlindnessLevel='OFF'|'IDENTITY'|'ORIGIN'|'FULL';

export interface Blindness{level:BlindnessLevel;hideIdentity:boolean;hideOrigin:boolean;hideAffiliation:boolean;hideHistory:boolean}

export const BLIND_LEVELS:{id:BlindnessLevel;labelArabic:string;labelEnglish:string;noteArabic:string;noteEnglish:string}[]=[
 {id:'OFF',labelArabic:'مكشوف',labelEnglish:'Open',noteArabic:'يرى المحكّم اسم المتسابق كاملًا.',noteEnglish:'The judge sees the full participant name.'},
 {id:'IDENTITY',labelArabic:'إخفاء الهوية',labelEnglish:'Hide identity',noteArabic:'الكود بدل الاسم. تبقى الجنسية والجهة ظاهرتين.',noteEnglish:'Code instead of name; origin and affiliation remain visible.'},
 {id:'ORIGIN',labelArabic:'إخفاء الهوية والجنسية',labelEnglish:'Hide identity and origin',noteArabic:'الكود فقط، وتُحجب الجنسية والدولة والجهة.',noteEnglish:'Code only; nationality, country and affiliation are withheld.'},
 {id:'FULL',labelArabic:'عتامة كاملة',labelEnglish:'Full blind',noteArabic:'الكود فقط، وتُحجب الجنسية والجهة والفئة والرواية والنتائج السابقة.',noteEnglish:'Code only; origin, affiliation, category, riwaya and prior results are all withheld.'},
];

/** الدرجة المعلنة تسبق، وإلا اشتُقت من الإعداد القديم حتى لا تنقلب مسابقة قائمة إلى مكشوفة. */
export function resolveBlindness(judging:Pick<JudgingPolicy,'identityVisibility'|'blindnessLevel'>):Blindness{
 const level:BlindnessLevel=judging.blindnessLevel||(judging.identityVisibility==='code_only'?'IDENTITY':'OFF');
 return {level,hideIdentity:level!=='OFF',hideOrigin:level==='ORIGIN'||level==='FULL',hideAffiliation:level==='ORIGIN'||level==='FULL',hideHistory:level==='FULL'};
}

export interface MaskedParticipantView{displayName:string;country?:string;nationality?:string;institution?:string;riwaya?:string;categoryId?:string;withheldArabic:string[]}

/** يُبنى بالإضافة لا بالحذف: حقل جديد على المتسابق لا يتسرّب للمحكّم إلا بقرار صريح هنا. */
export function maskParticipantForJudge(participant:Participant|undefined|null,blindness:Blindness,arabic:boolean):MaskedParticipantView{
 if(!participant)return {displayName:'',withheldArabic:[]};
 const withheld:string[]=[];
 const view:MaskedParticipantView={displayName:'',withheldArabic:withheld};
 view.displayName=blindness.hideIdentity?(participant.code||''):((arabic?participant.fullNameArabic:participant.fullName)||participant.code||'');
 if(blindness.hideIdentity)withheld.push('الاسم');
 if(blindness.hideOrigin)withheld.push('الجنسية والدولة');
 else {view.country=participant.country;view.nationality=participant.nationality}
 if(blindness.hideAffiliation)withheld.push('الجهة');
 else view.institution=participant.institution;
 if(blindness.hideHistory)withheld.push('الفئة والرواية والنتائج السابقة');
 else {view.riwaya=participant.riwaya;view.categoryId=participant.categoryId}
 return view;
}

export interface BlindLiftInput{competitionId:string;sessionId:string;participantId:string;blindness:Blindness;revealedBy:string;submissions:{judgeId:string;locked:boolean;submittedAt?:string}[];revealedAt?:string}

/**
 * إثبات رفع العتامة. لا يكفي أن نقول «قُفلت قبل الكشف»: تُسجَّل لحظة قفل كل محكّم ولحظة الكشف
 * معًا في سجل واحد مبصوم، فيتحقق أي مدقّق لاحقًا من الترتيب بنفسه.
 */
export async function buildBlindLiftProof(input:BlindLiftInput):Promise<BlindChamberLiftRecord>{
 const revealedAt=input.revealedAt||new Date().toISOString();
 const at=Date.parse(revealedAt);
 const locks=input.submissions.map(x=>({judgeId:x.judgeId,locked:!!x.locked,lockedAt:x.submittedAt})).sort((a,b)=>a.judgeId.localeCompare(b.judgeId));
 const unlocked=locks.filter(x=>!x.locked).length;
 const lateLocks=locks.filter(x=>x.locked&&(!x.lockedAt||Date.parse(x.lockedAt)>at)).length;
 const allLockedBeforeReveal=locks.length>0&&unlocked===0&&lateLocks===0;
 const payload={domain:'MIZAN-BLIND-CHAMBER-v1',competitionId:input.competitionId,sessionId:input.sessionId,participantId:input.participantId,level:input.blindness.level,withheld:{identity:input.blindness.hideIdentity,origin:input.blindness.hideOrigin,affiliation:input.blindness.hideAffiliation,history:input.blindness.hideHistory},locks,revealedAt,allLockedBeforeReveal};
 return {id:newId('blindlift'),competitionId:input.competitionId,sessionId:input.sessionId,participantId:input.participantId,level:input.blindness.level,createdAt:revealedAt,revealedBy:input.revealedBy,revealedAt,judgeLocks:locks,judgeCount:locks.length,unlockedCount:unlocked,allLockedBeforeReveal,proofHash:await hashCanonical(payload),assurance:'client_sha256_commitment',status:allLockedBeforeReveal?'PROVEN':'UNPROVEN'};
}

/** تحقّق مستقل: يعيد بناء البصمة من محتوى السجل وحده ويعيد فحص ترتيب القفل والكشف. */
export async function verifyBlindLiftProof(record:BlindChamberLiftRecord){
 const reasons:string[]=[];
 const at=Date.parse(record.revealedAt);
 if(!record.judgeLocks.length)reasons.push('لا يوجد تسليم محكّم في السجل.');
 for(const l of record.judgeLocks){
  if(!l.locked)reasons.push('تسليم محكّم غير مقفل عند الكشف.');
  else if(!l.lockedAt||Date.parse(l.lockedAt)>at)reasons.push('قفل تسليم بعد لحظة كشف الهوية.');
 }
 const expected=await hashCanonical({domain:'MIZAN-BLIND-CHAMBER-v1',competitionId:record.competitionId,sessionId:record.sessionId,participantId:record.participantId,level:record.level,withheld:{identity:record.level!=='OFF',origin:record.level==='ORIGIN'||record.level==='FULL',affiliation:record.level==='ORIGIN'||record.level==='FULL',history:record.level==='FULL'},locks:record.judgeLocks,revealedAt:record.revealedAt,allLockedBeforeReveal:record.allLockedBeforeReveal});
 if(expected!==record.proofHash)reasons.push('بصمة الإثبات لا تطابق محتواه.');
 return {state:(reasons.length?'UNPROVEN':'PROVEN') as 'PROVEN'|'UNPROVEN',reasons};
}
