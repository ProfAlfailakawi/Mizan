import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { QuestionEscrowRepository, type EscrowActor } from './question-escrow';
import { ServerQuranSourceRepository } from './quran-source-repository';

export interface ServerQuestionBlueprint {
  id:string;poolId:string;qiraah:string;rawi:string;tariq?:string;surahNumber:number;startAyah:number;endAyah:number;juzNumber:number;difficultyRating:number;mutashabihatDensity?:'low'|'medium'|'high';tajweedComplexity?:'basic'|'intermediate'|'advanced';enabled?:boolean;
}
export interface RuntimeProvisionInput {
  organizationId:string;competitionId:string;sessionId:string;participantId:string;committeeId:string;requiredJudgeIds:string[];approvalMode:'all_assigned'|'minimum';minimumApprovals?:number;expiresAt:string;
  sourcePackageId:string;poolId:string;questionCount:number;maxJuz?:number;targetDifficulty?:number;difficultyTolerance?:number;qiraah:string;rawi:string;tariq?:string;
}
export type RuntimeReplacementState='NONE'|'AUTHORIZED'|'PENDING_PANEL_QUORUM'|'CONSUMED'|'EXPIRED'|'REVOKED';
export interface RuntimeRecord {
  version:2;organizationId:string;competitionId:string;sessionId:string;participantId:string;committeeId:string;createdAt:string;sourcePackageId:string;sourcePackageHash:string;poolId:string;
  qiraah:string;rawi:string;tariq?:string;algorithmVersion:'MIZAN-SERVER-FAIRDRAW-1';ruleVersion:'SERVER_POLICY_V1';seedCommitmentHash:string;seedSecret:string;poolSnapshotHash:string;constraintHash:string;
  selectedBlueprintIds:string[];retiredBlueprintIds:string[];
  emergencyReplacement:{state:RuntimeReplacementState;authorizationId?:string;authorizedAt?:string;authorizedBy?:string;reason?:string;expiresAt?:string;questionIndex?:number;judgeApprovals?:{judgeId:string;approvedAt:string}[];consumedAt?:string;replacementBlueprintId?:string};
}

const canonical=(v:unknown):string=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;const o=v as Record<string,unknown>;return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`};
const hash=(v:string|Buffer)=>crypto.createHash('sha256').update(v).digest('hex');
const safe=(v:string)=>v.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,128);
const same=(a?:string,b?:string)=>String(a||'').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,'')===String(b||'').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g,'');

export class ServerQuestionPoolRepository {
  constructor(private root:string){fs.mkdirSync(root,{recursive:true,mode:0o700})}
  private file(competitionId:string,poolId:string){return path.join(this.root,`${safe(competitionId)}--${safe(poolId)}.json`)}
  save(competitionId:string,poolId:string,items:ServerQuestionBlueprint[]){
    const normalized=items.map(x=>({...x,poolId}));if(!normalized.length)throw new Error('SERVER_QUESTION_POOL_EMPTY');
    const ids=new Set<string>();for(const x of normalized){if(ids.has(x.id))throw new Error('SERVER_QUESTION_POOL_DUPLICATE_ID');ids.add(x.id);if(!x.qiraah||!x.rawi||x.surahNumber<1||x.surahNumber>114||x.startAyah<1||x.endAyah<x.startAyah)throw new Error('SERVER_QUESTION_POOL_INVALID_ITEM')}
    fs.writeFileSync(this.file(competitionId,poolId),JSON.stringify(normalized,null,2),{encoding:'utf8',mode:0o600});return {count:normalized.length,poolHash:hash(canonical(normalized.map(({id,qiraah,rawi,tariq,surahNumber,startAyah,endAyah,juzNumber,difficultyRating})=>({id,qiraah,rawi,tariq,surahNumber,startAyah,endAyah,juzNumber,difficultyRating}))))};
  }
  load(competitionId:string,poolId:string){const f=this.file(competitionId,poolId);if(!fs.existsSync(f))throw new Error('SERVER_QUESTION_POOL_NOT_FOUND');const rows=JSON.parse(fs.readFileSync(f,'utf8')) as ServerQuestionBlueprint[];if(!Array.isArray(rows)||!rows.length)throw new Error('SERVER_QUESTION_POOL_EMPTY');return rows}
}

function eligiblePool(pool:ServerQuestionBlueprint[],input:Pick<RuntimeProvisionInput,'qiraah'|'rawi'|'tariq'|'maxJuz'|'targetDifficulty'|'difficultyTolerance'>,excluded:Set<string>){
  const first=pool.filter(x=>x.enabled!==false&&!excluded.has(x.id)&&same(x.qiraah,input.qiraah)&&same(x.rawi,input.rawi)&&(!input.tariq||same(x.tariq,input.tariq))&&(!input.maxJuz||x.juzNumber<=input.maxJuz));
  if(input.targetDifficulty===undefined)return first;
  const tol=input.difficultyTolerance??1;const strict=first.filter(x=>Math.abs(x.difficultyRating-input.targetDifficulty!)<=tol);return strict.length?strict:first;
}
function deterministicPick(pool:ServerQuestionBlueprint[],secret:string,count:number){
  return [...pool].map(x=>({x,rank:hash(`${secret}|${x.id}`)})).sort((a,b)=>a.rank.localeCompare(b.rank)||a.x.id.localeCompare(b.x.id)).slice(0,count).map(x=>x.x);
}

export class SecureQuestionRuntimeRepository {
  constructor(private root:string,private quran:ServerQuranSourceRepository,private pools:ServerQuestionPoolRepository,private escrow:QuestionEscrowRepository){fs.mkdirSync(root,{recursive:true,mode:0o700})}
  private file(sessionId:string){return path.join(this.root,`question-runtime-${safe(sessionId)}.json`)}
  private read(sessionId:string){const f=this.file(sessionId);if(!fs.existsSync(f))throw new Error('QUESTION_RUNTIME_NOT_FOUND');return JSON.parse(fs.readFileSync(f,'utf8')) as RuntimeRecord}
  private write(r:RuntimeRecord){const f=this.file(r.sessionId),tmp=`${f}.${process.pid}.${Date.now()}.tmp`;fs.writeFileSync(tmp,JSON.stringify(r,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,f)}
  private publicState(r:RuntimeRecord){
    const replacement={...r.emergencyReplacement,judgeApprovals:(r.emergencyReplacement.judgeApprovals||[]).length};
    return {version:r.version,sessionId:r.sessionId,competitionId:r.competitionId,participantId:r.participantId,committeeId:r.committeeId,sourcePackageId:r.sourcePackageId,sourcePackageHash:r.sourcePackageHash,qiraah:r.qiraah,rawi:r.rawi,tariq:r.tariq,algorithmVersion:r.algorithmVersion,seedCommitmentHash:r.seedCommitmentHash,poolSnapshotHash:r.poolSnapshotHash,constraintHash:r.constraintHash,questionCount:r.selectedBlueprintIds.length,emergencyReplacement:replacement,escrow:this.escrow.publicState(this.escrow.internalRecord(r.sessionId))};
  }
  provision(input:RuntimeProvisionInput){
    if(fs.existsSync(this.file(input.sessionId)))throw new Error('QUESTION_RUNTIME_SESSION_EXISTS');if(input.questionCount<1||input.questionCount>20)throw new Error('QUESTION_RUNTIME_INVALID_COUNT');
    const source=this.quran.manifest(input.sourcePackageId);if(source.scientificApproval.state!=='CERTIFIED')throw new Error('QUESTION_RUNTIME_SOURCE_NOT_CERTIFIED');if(!same(source.qiraah,input.qiraah)||!same(source.rawi,input.rawi)||!!input.tariq&&!same(source.tariq,input.tariq))throw new Error('QUESTION_RUNTIME_READING_SOURCE_MISMATCH');
    const pool=this.pools.load(input.competitionId,input.poolId),eligible=eligiblePool(pool,input,new Set());if(eligible.length<input.questionCount)throw new Error('QUESTION_RUNTIME_INSUFFICIENT_ELIGIBLE_POOL');
    const secret=crypto.randomBytes(32).toString('base64url'),selected=deterministicPick(eligible,secret,input.questionCount);
    const sourcePackageHash=source.packageHash,poolSnapshotHash=hash(canonical(eligible.map(x=>({id:x.id,qiraah:x.qiraah,rawi:x.rawi,tariq:x.tariq,surahNumber:x.surahNumber,startAyah:x.startAyah,endAyah:x.endAyah,juzNumber:x.juzNumber,difficultyRating:x.difficultyRating}))));
    const constraints={questionCount:input.questionCount,maxJuz:input.maxJuz,targetDifficulty:input.targetDifficulty,difficultyTolerance:input.difficultyTolerance,qiraah:input.qiraah,rawi:input.rawi,tariq:input.tariq,sourcePackageHash,poolSnapshotHash};const constraintHash=hash(canonical(constraints));const seedCommitmentHash=hash(`${secret}|${constraintHash}`);
    const questions=selected.map((b,index)=>{const passage=this.quran.resolvePassage({packageId:input.sourcePackageId,surah:b.surahNumber,startAyah:b.startAyah,endAyah:b.endAyah});return {index,questionId:b.id,payload:{version:'MIZAN-SERVER-QUESTION-1',questionId:b.id,surahNumber:b.surahNumber,surahNameArabic:passage.verses[0]?.sura_name_ar,surahNameEnglish:passage.verses[0]?.sura_name_en,startAyah:b.startAyah,endAyah:b.endAyah,juzNumber:b.juzNumber,difficultyRating:b.difficultyRating,mutashabihatDensity:b.mutashabihatDensity,tajweedComplexity:b.tajweedComplexity,qiraah:input.qiraah,rawi:input.rawi,tariq:input.tariq,quranSourcePackageId:input.sourcePackageId,quranSourcePackageHash:sourcePackageHash,pageNumber:Number(passage.verses[0]?.page||0)||undefined,lineStart:passage.verses[0]?.line_start,lineEnd:passage.verses[passage.verses.length-1]?.line_end||passage.verses[0]?.line_end,officialSurfaceAuthority:'King Fahd Glorious Quran Printing Complex',officialSurfaceMode:'UTHMANIC_TEXT_WITH_PAGE_ANCHOR',expectedTextArabic:passage.text,openingAyahArabic:passage.verses[0]?.aya_text}}});
    this.escrow.create({organizationId:input.organizationId,competitionId:input.competitionId,sessionId:input.sessionId,participantId:input.participantId,committeeId:input.committeeId,requiredJudgeIds:input.requiredJudgeIds,approvalMode:input.approvalMode,minimumApprovals:input.minimumApprovals,expiresAt:input.expiresAt,questions});
    const r:RuntimeRecord={version:2,organizationId:input.organizationId,competitionId:input.competitionId,sessionId:input.sessionId,participantId:input.participantId,committeeId:input.committeeId,createdAt:new Date().toISOString(),sourcePackageId:input.sourcePackageId,sourcePackageHash,poolId:input.poolId,qiraah:input.qiraah,rawi:input.rawi,tariq:input.tariq,algorithmVersion:'MIZAN-SERVER-FAIRDRAW-1',ruleVersion:'SERVER_POLICY_V1',seedCommitmentHash,seedSecret:secret,poolSnapshotHash,constraintHash,selectedBlueprintIds:selected.map(x=>x.id),retiredBlueprintIds:[],emergencyReplacement:{state:'NONE'}};this.write(r);return this.publicState(r)
  }
  private verifyScopedActor(r:RuntimeRecord,actor:EscrowActor,allowGovernance=false){
    if(actor.organizationId!==r.organizationId)throw new Error('QUESTION_RUNTIME_ORGANIZATION_MISMATCH');
    if(actor.competitionId&&actor.competitionId!==r.competitionId)throw new Error('QUESTION_RUNTIME_COMPETITION_MISMATCH');
    if(actor.role==='judge'){
      const esc=this.escrow.internalRecord(r.sessionId);if(!esc.requiredJudgeIds.includes(actor.uid))throw new Error('QUESTION_RUNTIME_ASSIGNED_JUDGE_REQUIRED');return;
    }
    if(allowGovernance&&['head_judge','comp_admin','org_admin','auditor'].includes(actor.role))return;
    throw new Error('QUESTION_RUNTIME_ROLE_NOT_ALLOWED');
  }
  status(sessionId:string,actor:EscrowActor){const r=this.read(sessionId);this.verifyScopedActor(r,actor,true);if(r.emergencyReplacement.state==='AUTHORIZED'&&r.emergencyReplacement.expiresAt&&Date.parse(r.emergencyReplacement.expiresAt)<=Date.now()){r.emergencyReplacement.state='EXPIRED';this.write(r)}return this.publicState(r)}
  findActiveForParticipant(competitionId:string,participantId:string,actor:EscrowActor){
    const files=fs.readdirSync(this.root).filter(name=>name.startsWith('question-runtime-')&&name.endsWith('.json'));
    const candidates=files.flatMap(name=>{try{const r=JSON.parse(fs.readFileSync(path.join(this.root,name),'utf8')) as RuntimeRecord;return r.competitionId===competitionId&&r.participantId===participantId?[r]:[]}catch{return []}}).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
    for(const r of candidates){try{this.verifyScopedActor(r,actor,true);const esc=this.escrow.internalRecord(r.sessionId);if(esc.state==='ACTIVE'&&Date.parse(esc.expiresAt)>Date.now())return this.publicState(r)}catch{}}
    throw new Error('QUESTION_RUNTIME_ACTIVE_SESSION_NOT_FOUND');
  }
  confirmPresence(sessionId:string,actor:EscrowActor,method='manual_visual_confirmation'){const r=this.read(sessionId);this.verifyScopedActor(r,actor);if(!['manual_visual_confirmation','participant_pass','gate_handoff'].includes(method))throw new Error('QUESTION_RUNTIME_PRESENCE_METHOD_INVALID');const escrow=this.escrow.confirmPresence(sessionId,actor,r.participantId,method);return {...this.publicState(r),escrow};}
  approveQuestion(sessionId:string,questionIndex:number,actor:EscrowActor){const r=this.read(sessionId);this.verifyScopedActor(r,actor);const result=this.escrow.approve(sessionId,questionIndex,actor);return {...this.publicState(r),escrow:result};}
  revealQuestion(sessionId:string,questionIndex:number,actor:EscrowActor){const r=this.read(sessionId);this.verifyScopedActor(r,actor);return this.escrow.reveal(sessionId,questionIndex,actor);}
  authorizeEmergencyReplacement(input:{sessionId:string;actor:EscrowActor;reason:string;expiresAt:string}){
    const r=this.read(input.sessionId);this.verifyScopedActor(r,input.actor,true);if(!['comp_admin','org_admin','head_judge'].includes(input.actor.role))throw new Error('QUESTION_REPLACEMENT_ADMIN_REQUIRED');if(r.emergencyReplacement.state==='CONSUMED')throw new Error('QUESTION_REPLACEMENT_ALREADY_USED');if(!input.reason.trim())throw new Error('QUESTION_REPLACEMENT_REASON_REQUIRED');if(Date.parse(input.expiresAt)<=Date.now())throw new Error('QUESTION_REPLACEMENT_EXPIRY_REQUIRED');
    const esc=this.escrow.internalRecord(r.sessionId);if(!esc.questions.some(q=>!!q.releasedAt))throw new Error('QUESTION_REPLACEMENT_SESSION_NOT_STARTED');
    r.emergencyReplacement={state:'AUTHORIZED',authorizationId:crypto.randomUUID(),authorizedAt:new Date().toISOString(),authorizedBy:input.actor.uid,reason:input.reason.trim(),expiresAt:input.expiresAt,judgeApprovals:[]};this.write(r);return this.publicState(r)
  }
  revokeEmergencyReplacement(sessionId:string,actor:EscrowActor){const r=this.read(sessionId);this.verifyScopedActor(r,actor,true);if(!['comp_admin','org_admin','head_judge'].includes(actor.role))throw new Error('QUESTION_REPLACEMENT_ADMIN_REQUIRED');if(r.emergencyReplacement.state==='CONSUMED')throw new Error('QUESTION_REPLACEMENT_ALREADY_USED');r.emergencyReplacement={...r.emergencyReplacement,state:'REVOKED',reason:`${r.emergencyReplacement.reason||''} | revoked by ${actor.uid}`.trim()};this.write(r);return this.publicState(r)}
  approveEmergencyReplacement(input:{sessionId:string;questionIndex:number;actor:EscrowActor}){
    const r=this.read(input.sessionId);this.escrow.status(input.sessionId,input.actor);const a=r.emergencyReplacement;if(!['AUTHORIZED','PENDING_PANEL_QUORUM'].includes(a.state))throw new Error(`QUESTION_REPLACEMENT_NOT_AUTHORIZED:${a.state}`);if(a.expiresAt&&Date.parse(a.expiresAt)<=Date.now()){a.state='EXPIRED';this.write(r);throw new Error('QUESTION_REPLACEMENT_AUTHORIZATION_EXPIRED')}
    const esc=this.escrow.internalRecord(input.sessionId),q=esc.questions.find(x=>x.index===input.questionIndex);if(!q?.releasedAt)throw new Error('QUESTION_REPLACEMENT_REQUIRES_STARTED_QUESTION');if(a.questionIndex!==undefined&&a.questionIndex!==input.questionIndex)throw new Error('QUESTION_REPLACEMENT_INDEX_LOCKED');
    a.questionIndex=input.questionIndex;a.state='PENDING_PANEL_QUORUM';a.judgeApprovals=a.judgeApprovals||[];if(!a.judgeApprovals.some(x=>x.judgeId===input.actor.uid))a.judgeApprovals.push({judgeId:input.actor.uid,approvedAt:new Date().toISOString()});
    const required=esc.approvalMode==='all_assigned'?esc.requiredJudgeIds.length:Math.min(esc.requiredJudgeIds.length,Math.max(1,esc.minimumApprovals||1));const count=esc.requiredJudgeIds.filter(id=>a.judgeApprovals!.some(x=>x.judgeId===id)).length;
    if(count<required){this.write(r);return {...this.publicState(r),replacementReady:false,approved:count,required}}
    const pool=this.pools.load(r.competitionId,r.poolId),excluded=new Set([...r.selectedBlueprintIds,...r.retiredBlueprintIds]);const eligible=eligiblePool(pool,{qiraah:r.qiraah,rawi:r.rawi,tariq:r.tariq},excluded);if(!eligible.length)throw new Error('QUESTION_REPLACEMENT_NO_ELIGIBLE_QUESTION');const replacement=deterministicPick(eligible,crypto.randomBytes(32).toString('base64url'),1)[0];const passage=this.quran.resolvePassage({packageId:r.sourcePackageId,surah:replacement.surahNumber,startAyah:replacement.startAyah,endAyah:replacement.endAyah});const oldId=r.selectedBlueprintIds[input.questionIndex];
    this.escrow.replaceQuestion(r.sessionId,{questionIndex:input.questionIndex,questionId:replacement.id,reason:a.reason||'Emergency replacement',authorizedBy:a.authorizedBy||'unknown',payload:{version:'MIZAN-SERVER-QUESTION-1',questionId:replacement.id,surahNumber:replacement.surahNumber,surahNameArabic:passage.verses[0]?.sura_name_ar,surahNameEnglish:passage.verses[0]?.sura_name_en,startAyah:replacement.startAyah,endAyah:replacement.endAyah,juzNumber:replacement.juzNumber,difficultyRating:replacement.difficultyRating,mutashabihatDensity:replacement.mutashabihatDensity,tajweedComplexity:replacement.tajweedComplexity,qiraah:r.qiraah,rawi:r.rawi,tariq:r.tariq,quranSourcePackageId:r.sourcePackageId,quranSourcePackageHash:r.sourcePackageHash,pageNumber:Number(passage.verses[0]?.page||0)||undefined,lineStart:passage.verses[0]?.line_start,lineEnd:passage.verses[passage.verses.length-1]?.line_end||passage.verses[0]?.line_end,officialSurfaceAuthority:'King Fahd Glorious Quran Printing Complex',officialSurfaceMode:'UTHMANIC_TEXT_WITH_PAGE_ANCHOR',expectedTextArabic:passage.text,openingAyahArabic:passage.verses[0]?.aya_text}});
    if(oldId)r.retiredBlueprintIds.push(oldId);r.selectedBlueprintIds[input.questionIndex]=replacement.id;a.state='CONSUMED';a.consumedAt=new Date().toISOString();a.replacementBlueprintId=replacement.id;this.write(r);return {...this.publicState(r),replacementReady:true,approved:count,required}
  }
  publicProof(sessionId:string){const r=this.read(sessionId);return {algorithmVersion:r.algorithmVersion,ruleVersion:r.ruleVersion,seedCommitmentHash:r.seedCommitmentHash,poolSnapshotHash:r.poolSnapshotHash,constraintHash:r.constraintHash,sourcePackageHash:r.sourcePackageHash,selectionCount:r.selectedBlueprintIds.length,replacementUsed:r.emergencyReplacement.state==='CONSUMED'}}
  revealFairDrawSeed(sessionId:string){const r=this.read(sessionId);return {secretSeed:r.seedSecret,selectionIds:[...r.selectedBlueprintIds],seedCommitmentHash:r.seedCommitmentHash,constraintHash:r.constraintHash,poolSnapshotHash:r.poolSnapshotHash,sourcePackageHash:r.sourcePackageHash,algorithmVersion:r.algorithmVersion}}
}
