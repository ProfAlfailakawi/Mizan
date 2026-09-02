import type { Competition, CompetitionPolicy, ContradictionIssueRecord, PolicyCompilationRecord, PolicyCompilerEvidence, PolicyCompilerRule, AICapabilityValidationRecord, QuranSourceManifestRecord } from '../types';
import { getCompetitionPolicy } from './competition-config';
import { hashCanonical } from './trust-protocol';
import { certifiedCapabilityFor, sourceUsableForCompetition } from './scientific-core';

const lines=(text:string)=>text.replace(/\r/g,'').split('\n').map((text,i)=>({text:text.trim(),line:i+1})).filter(x=>x.text.length>0);
const ruleMatchers:{category:string;path:string;re:RegExp;value:(m:RegExpMatchArray)=>unknown}[]=[
 {category:'judging',path:'ruleSet.judgesCountPerPanel',re:/(?:judges?|محكم(?:ين|ون)?)\D{0,20}(\d+)/i,value:m=>Number(m[1])},
 {category:'questions',path:'policy.questions.questionsPerParticipant',re:/(?:questions?|أسئلة?)\D{0,20}(\d+)/i,value:m=>Number(m[1])},
 {category:'appeals',path:'policy.appeals.windowHours',re:/(?:appeal|اعتراض).*?(\d+)\s*(?:hours?|ساعة)/i,value:m=>Number(m[1])},
 {category:'privacy',path:'policy.judging.identityVisibility',re:/(?:blind judging|تحكيم أعمى|code only|رمز فقط)/i,value:()=> 'code_only'},
 {category:'recording',path:'policy.judging.requireAudioRecording',re:/(?:audio recording|required recording|تسجيل صوتي).*?(?:required|mandatory|إلزامي)/i,value:()=>true},
 {category:'ai',path:'policy.judging.silentAiGuardian',re:/(?:AI|ذكاء اصطناعي).*?(?:advisory|استشاري|مساعد)/i,value:()=>true},
];

const ambiguityRe=/(?:\bmay\b|\bshould\b|where possible|if appropriate|as needed|يمكن|يجوز|قد|عند الحاجة|حسب الإمكان)/i;
const policySignals:{category:string;re:RegExp}[]=[
 {category:'registration',re:/(register|registration|eligib|participant field|تسجيل|أهلية|بيانات المتسابق)/i},
 {category:'categories',re:/(categor|مسار|فئة|فئات)/i},
 {category:'quran',re:/(qira|riway|rawi|tariq|quran scope|juz|surah|قراءة|رواية|راوي|طريق|جزء|سورة)/i},
 {category:'fairdraw',re:/(fairdraw|draw|selection|سحب|اختيار الأسئلة)/i},
 {category:'judging',re:/(judge|judging|criterion|criteria|weight|penalt|محكم|تحكيم|معيار|وزن|خصم)/i},
 {category:'qualification',re:/(qualif|tie.?break|تأهل|تعادل)/i},
 {category:'appeals',re:/(appeal|اعتراض)/i},
 {category:'privacy',re:/(privacy|consent|recording|retention|خصوصية|موافقة|تسجيل|احتفاظ)/i},
 {category:'certificates',re:/(certificate|شهادة)/i},
 {category:'operations',re:/(queue|notification|ceremony|deployment|routing|طابور|إشعار|حفل|نشر|توجيه)/i},
];
function signalCategory(text:string){return policySignals.find(x=>x.re.test(text))?.category}

export async function compilePolicyText(input:{competitionId:string;sourceFileName:string;sourceType:PolicyCompilationRecord['sourceType'];text:string;createdBy:string;currentPolicy:CompetitionPolicy}){
 const evidence:PolicyCompilerEvidence[]=[]; const rules:PolicyCompilerRule[]=[];
 for(const row of lines(input.text)){
   let matched=false;
   for(const matcher of ruleMatchers){const m=row.text.match(matcher.re); if(!m)continue;matched=true;
    const eid=`ev-${evidence.length+1}`; evidence.push({id:eid,sourceFileName:input.sourceFileName,sourceType:input.sourceType,lineStart:row.line,lineEnd:row.line,excerpt:row.text.slice(0,280)});
    const ambiguous=ambiguityRe.test(row.text);
    rules.push({id:`rule-${rules.length+1}`,category:matcher.category,summary:row.text.slice(0,120),genomePath:matcher.path,proposedValue:matcher.value(m),confidence:ambiguous?'LOW':'MEDIUM',state:ambiguous?'NEEDS_REVIEW':'UNDERSTOOD',evidenceIds:[eid]});
   }
   if(!matched){const category=signalCategory(row.text);if(category){const eid=`ev-${evidence.length+1}`;evidence.push({id:eid,sourceFileName:input.sourceFileName,sourceType:input.sourceType,lineStart:row.line,lineEnd:row.line,excerpt:row.text.slice(0,280)});rules.push({id:`rule-${rules.length+1}`,category,summary:row.text.slice(0,120),genomePath:'UNMAPPED_REQUIRES_HUMAN_MAPPING',proposedValue:null,confidence:'LOW',state:'NEEDS_REVIEW',evidenceIds:[eid]});}}
 }
 const seen=new Map<string,PolicyCompilerRule>();
 for(const r of rules){const prev=seen.get(r.genomePath); if(prev&&JSON.stringify(prev.proposedValue)!==JSON.stringify(r.proposedValue)){prev.state='CONFLICT';r.state='CONFLICT';}else seen.set(r.genomePath,r)}
 const sourceHash=await hashCanonical({file:input.sourceFileName,type:input.sourceType,text:input.text});
 const major=Number(input.currentPolicy.version.split('.')[0]||1); const minor=Number(input.currentPolicy.version.split('.')[1]||0)+1;
 const record:PolicyCompilationRecord={id:`policy-${sourceHash.slice(0,14)}`,competitionId:input.competitionId,sourceFileName:input.sourceFileName,sourceType:input.sourceType,sourceHash,createdAt:new Date().toISOString(),createdBy:input.createdBy,state:'DRAFT',rules,evidence,proposedPolicyVersion:`${major}.${minor}.0`};
 return record;
}

export function policyCompilerSummary(record:PolicyCompilationRecord){return {understood:record.rules.filter(r=>r.state==='UNDERSTOOD').length,review:record.rules.filter(r=>r.state==='NEEDS_REVIEW').length,conflicts:record.rules.filter(r=>r.state==='CONFLICT').length}}

export function applyApprovedCompilation(record:PolicyCompilationRecord,competition:Competition):Competition{
 if(record.state!=='REVIEWED'||!record.humanApprovedBy)throw new Error('POLICY_HUMAN_APPROVAL_REQUIRED');
 const next=structuredClone(competition); const policy=getCompetitionPolicy(next);
 for(const r of record.rules.filter(x=>x.state==='UNDERSTOOD')){
  if(r.genomePath==='ruleSet.judgesCountPerPanel')next.ruleSet.judgesCountPerPanel=Number(r.proposedValue);
  if(r.genomePath==='policy.questions.questionsPerParticipant')policy.questions.questionsPerParticipant=Number(r.proposedValue);
  if(r.genomePath==='policy.appeals.windowHours')policy.appeals.windowHours=Number(r.proposedValue);
  if(r.genomePath==='policy.judging.identityVisibility')policy.judging.identityVisibility=String(r.proposedValue) as any;
  if(r.genomePath==='policy.judging.requireAudioRecording')policy.judging.requireAudioRecording=Boolean(r.proposedValue);
  if(r.genomePath==='policy.judging.silentAiGuardian')policy.judging.silentAiGuardian=Boolean(r.proposedValue);
 }
 policy.version=record.proposedPolicyVersion; policy.updatedAt=new Date().toISOString(); next.policy=policy; return next;
}

export function detectContradictions(input:{competition:Competition;quranSources:QuranSourceManifestRecord[];aiValidations:AICapabilityValidationRecord[];availableQualifiedJudges:number;committeeCount?:number;committeeSeesDelegation?:boolean;certificateProofRequired?:boolean}){
 const c=input.competition,p=getCompetitionPolicy(c);const issues:ContradictionIssueRecord[]=[];const push=(x:Omit<ContradictionIssueRecord,'id'|'competitionId'>)=>issues.push({id:`conflict-${issues.length+1}`,competitionId:c.id,...x});
 if(p.judging.identityVisibility==='code_only'&&input.committeeSeesDelegation)push({severity:'BLOCKER',kind:'blind_judging',title:'Blind judging conflicts with delegation visibility',why:'Identity-linked delegation data can reveal the participant during independent judging.',affectedWorkflow:'JudgeOS',evidence:['identityVisibility=code_only','committeeSeesDelegation=true'],fixTarget:'competition_dna'});
 const requiredJudgeSlots=c.ruleSet.judgesCountPerPanel*Math.max(1,input.committeeCount||1);if(requiredJudgeSlots>input.availableQualifiedJudges)push({severity:'BLOCKER',kind:'resource',title:'Qualified judge shortage',why:'Required qualified judge slots exceed the available qualified judges.',affectedWorkflow:'Committee assignment',evidence:[`perCommittee=${c.ruleSet.judgesCountPerPanel}`,`committees=${Math.max(1,input.committeeCount||1)}`,`requiredSlots=${requiredJudgeSlots}`,`available=${input.availableQualifiedJudges}`],fixTarget:'field'});
 for(const cat of c.categories){
  const source=input.quranSources.find(s=>sourceUsableForCompetition(s,{riwaya:cat.riwaya}).ok);
  if(!source)push({severity:'BLOCKER',kind:'scientific',title:`No certified Quran source for ${cat.riwaya}`,why:'Official passages must resolve to an immutable certified source for the exact reading.',affectedWorkflow:'FairDraw / JudgeOS',evidence:[cat.riwaya],fixTarget:'scientific'});
  if(p.judging.silentAiGuardian&&!certifiedCapabilityFor(input.aiValidations,{capability:'word_alignment',riwaya:cat.riwaya}))push({severity:'REVIEW',kind:'qiraah_ai',title:`AI unavailable for ${cat.riwaya}`,why:'The competition remains operational, but this AI capability is not certified for the reading.',affectedWorkflow:'Post-lock AI review',evidence:[cat.riwaya,'word_alignment'],fixTarget:'scientific'});
 }
 if(input.certificateProofRequired&&!p.certificates.enabled)push({severity:'REVIEW',kind:'certificate',title:'Proof policy requires certificates but issuance is disabled',why:'Public proof cannot be attached to a certificate that is never issued.',affectedWorkflow:'Certificate lifecycle',evidence:['certificate proof required','certificates.enabled=false'],fixTarget:'competition_dna'});
 if(p.judging.silentAiGuardian&&p.aiPolicy.mode!=='AI_DISABLED'&&!p.privacy.allowAiProcessing)push({severity:'BLOCKER',kind:'privacy',title:'AI policy conflicts with privacy consent policy',why:'AI processing is enabled operationally while competition privacy policy prohibits AI processing.',affectedWorkflow:'Post-lock AI review',evidence:[`aiMode=${p.aiPolicy.mode}`,'privacy.allowAiProcessing=false'],fixTarget:'privacy'});
 if(p.results.visibility==='ceremony_only'&&p.results.publicLeaderboard!=='disabled')push({severity:'BLOCKER',kind:'publication',title:'Ceremony-only results conflict with public leaderboard',why:'A public leaderboard can disclose results before the protected ceremony reveal.',affectedWorkflow:'Results / Ceremony',evidence:['visibility=ceremony_only',`publicLeaderboard=${p.results.publicLeaderboard}`],fixTarget:'competition_dna'});
 if(p.certificates.publicVerification&&!p.certificates.enabled)push({severity:'REVIEW',kind:'certificate',title:'Public certificate verification is enabled while certificates are disabled',why:'The verifier cannot authenticate certificates that policy never permits issuing.',affectedWorkflow:'Public verifier',evidence:['publicVerification=true','certificates.enabled=false'],fixTarget:'competition_dna'});
 return issues;
}
