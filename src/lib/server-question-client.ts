import { auth } from './firebase';

export interface SecureQuestionRuntimeState {
  version:number;
  sessionId:string;
  competitionId:string;
  participantId:string;
  committeeId:string;
  sourcePackageId:string;
  sourcePackageHash:string;
  qiraah:string;
  rawi:string;
  tariq?:string;
  algorithmVersion:string;
  seedCommitmentHash:string;
  poolSnapshotHash:string;
  constraintHash:string;
  questionCount:number;
  emergencyReplacement:{
    state:'NONE'|'AUTHORIZED'|'PENDING_PANEL_QUORUM'|'CONSUMED'|'EXPIRED'|'REVOKED';
    authorizationId?:string;
    authorizedAt?:string;
    authorizedBy?:string;
    reason?:string;
    expiresAt?:string;
    questionIndex?:number;
    judgeApprovals:number;
    consumedAt?:string;
    replacementBlueprintId?:string;
  };
  escrow:{
    version:number;
    state:'ACTIVE'|'REVOKED'|'EXPIRED';
    presenceVerified:boolean;
    questions:{index:number;commitmentHash:string;approved:number;required:number;released:boolean;releasedAt?:string;exposureCount:number}[];
    replacementCount:number;
  };
}

export interface SecureQuestionPlaintext {
  version:'MIZAN-SERVER-QUESTION-1';
  questionId:string;
  surahNumber:number;
  surahNameArabic?:string;
  surahNameEnglish?:string;
  startAyah:number;
  endAyah:number;
  juzNumber:number;
  difficultyRating:number;
  mutashabihatDensity?:'low'|'medium'|'high';
  tajweedComplexity?:'basic'|'intermediate'|'advanced';
  qiraah:string;
  rawi:string;
  tariq?:string;
  quranSourcePackageId:string;
  quranSourcePackageHash:string;
  pageNumber?:number;
  lineStart?:number;
  lineEnd?:number;
  officialSurfaceAuthority?:string;
  officialSurfaceMode?:'UTHMANIC_TEXT_WITH_PAGE_ANCHOR'|'OFFICIAL_PAGE_IMAGE';
  expectedTextArabic:string;
  openingAyahArabic?:string;
}

export interface SecureQuestionCapabilities {
  ready:boolean;
  serverFairDraw:boolean;
  serverQuranResolution:boolean;
  silentQuestionCapsule:boolean;
}

async function token(){
  const u=auth.currentUser;if(!u)throw new Error('IDENTITY_REQUIRED');return u.getIdToken();
}
async function api(path:string,init:RequestInit={}){
  const bearer=await token();
  const r=await fetch(path,{...init,headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json',...(init.headers||{})},cache:'no-store'});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(String(body.code||`HTTP_${r.status}`));
  return body;
}

export async function fetchSecureQuestionCapabilities():Promise<SecureQuestionCapabilities>{
  try{
    const r=await fetch('/api/capabilities',{cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)return {ready:false,serverFairDraw:false,serverQuranResolution:false,silentQuestionCapsule:false};
    const body=await r.json();const x=body?.externalDependencies||{};const serverFairDraw=x.serverFairDraw===true,serverQuranResolution=x.serverQuranResolution===true,silentQuestionCapsule=x.silentQuestionCapsule===true;
    return {ready:serverFairDraw&&serverQuranResolution&&silentQuestionCapsule,serverFairDraw,serverQuranResolution,silentQuestionCapsule};
  }catch{return {ready:false,serverFairDraw:false,serverQuranResolution:false,silentQuestionCapsule:false}}
}

export async function findSecureRuntimeForParticipant(competitionId:string,participantId:string){
  const body=await api(`/api/question-runtime/participant/${encodeURIComponent(participantId)}/active?competitionId=${encodeURIComponent(competitionId)}`);return body.runtime as SecureQuestionRuntimeState;
}
export async function getSecureRuntimeStatus(sessionId:string){const body=await api(`/api/question-runtime/${encodeURIComponent(sessionId)}/status`);return body.runtime as SecureQuestionRuntimeState}
export async function confirmSecureParticipantPresence(sessionId:string,method='manual_visual_confirmation'){const body=await api(`/api/question-runtime/${encodeURIComponent(sessionId)}/presence`,{method:'POST',body:JSON.stringify({method})});return body.runtime as SecureQuestionRuntimeState}
export async function approveSecureQuestion(sessionId:string,questionIndex:number){const body=await api(`/api/question-runtime/${encodeURIComponent(sessionId)}/questions/${questionIndex}/approve`,{method:'POST',body:'{}'});return body.runtime as SecureQuestionRuntimeState}
export async function revealSecureQuestion(sessionId:string,questionIndex:number){const body=await api(`/api/question-runtime/${encodeURIComponent(sessionId)}/questions/${questionIndex}/reveal`);return {payload:body.payload as SecureQuestionPlaintext,commitmentHash:String(body.commitmentHash||''),releasedAt:String(body.releasedAt||'')}}
export async function approveEmergencyQuestionReplacement(sessionId:string,questionIndex:number){return api(`/api/question-runtime/${encodeURIComponent(sessionId)}/questions/${questionIndex}/emergency-replacement/approve`,{method:'POST',body:'{}'}) as Promise<SecureQuestionRuntimeState&{replacementReady:boolean;approved:number;required:number}>}
export async function authorizeEmergencyQuestionReplacement(sessionId:string,reason:string,minutes=10){const expiresAt=new Date(Date.now()+Math.max(2,Math.min(30,minutes))*60_000).toISOString();const body=await api(`/api/question-runtime/${encodeURIComponent(sessionId)}/emergency-replacement/authorize`,{method:'POST',body:JSON.stringify({reason,expiresAt})});return body.runtime as SecureQuestionRuntimeState}
export async function revokeEmergencyQuestionReplacement(sessionId:string){const body=await api(`/api/question-runtime/${encodeURIComponent(sessionId)}/emergency-replacement/revoke`,{method:'POST',body:'{}'});return body.runtime as SecureQuestionRuntimeState}
