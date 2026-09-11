import crypto from 'crypto';
import type {Competition,EligibilityCondition,Participant,RegistrationFieldDefinition} from '../src/types';
import {getCompetitionPolicy} from '../src/lib/competition-config';
import {normalizeScope,scopeAyahCount,scopeSignature,validateScope,type QuranScope} from '../src/lib/quran-scope';
import {buildParticipantScopeRecord,selectionIsValid,validateParticipantSelection} from '../src/lib/participant-scope';
import {categorySelectionRule} from '../src/lib/scope-engine';

export type PublicRegistrationInput={fullNameArabic:string;fullName:string;email:string;phone:string;country:string;nationality:string;nationalIdOrPassport:string;dateOfBirth:string;gender:'male'|'female';categoryId:string;riwaya:string;guardianName?:string;consents?:{terms?:boolean;privacy?:boolean;guardian?:boolean;audioRecording?:boolean;aiProcessing?:boolean};website?:string;
/* نطاق الحفظ الذي اختاره المتسابق حين تسمح الفئة بذلك. يُتحقَّق منه على الخادم لا في المتصفح. */
memorizationScope?:QuranScope};
export interface PublicRegistrationStore{getCompetition(id:string):Promise<Competition|null>;create(documents:{path:string;data:Record<string,unknown>}[]):Promise<void>;getJourney(tokenHash:string):Promise<Record<string,unknown>|null>}

const clean=(value:unknown,max=160)=>String(value??'').trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max);
const emailOk=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=254;
const ageOn=(dob:string,now:Date)=>{const birth=new Date(`${dob}T00:00:00Z`);if(!Number.isFinite(birth.getTime())||birth>now)return NaN;let age=now.getUTCFullYear()-birth.getUTCFullYear();const before=now.getUTCMonth()<birth.getUTCMonth()||(now.getUTCMonth()===birth.getUTCMonth()&&now.getUTCDate()<birth.getUTCDate());if(before)age--;return age};
const compare=(actual:unknown,condition:EligibilityCondition)=>{const expected=condition.value;switch(condition.operator){case'eq':return String(actual)===String(expected);case'neq':return String(actual)!==String(expected);case'lte':return Number(actual)<=Number(expected);case'gte':return Number(actual)>=Number(expected);case'in':return Array.isArray(expected)&&expected.map(String).includes(String(actual));case'not_in':return Array.isArray(expected)&&!expected.map(String).includes(String(actual));case'exists':return condition.value?actual!==undefined&&actual!==null&&actual!=='':actual===undefined||actual===null||actual==='';default:return false}};
const fieldValue=(field:RegistrationFieldDefinition,input:PublicRegistrationInput)=>({fullNameArabic:input.fullNameArabic,fullName:input.fullName,email:input.email,phone:input.phone,country:input.country,nationality:input.nationality,dateOfBirth:input.dateOfBirth,gender:input.gender,identity:input.nationalIdOrPassport}[field.id]??'');
const token=(audience:'journey'|'guardian')=>`mz_${audience}_${crypto.randomBytes(32).toString('base64url')}`;
export const publicTokenHash=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');
export const validPublicJourneyToken=(value:string)=>/^mz_(journey|guardian)_[A-Za-z0-9_-]{43}$/.test(value);

export class PublicRegistrationService{
  constructor(private readonly store:PublicRegistrationStore,private readonly now=()=>new Date()){}
  async register(competitionId:string,raw:PublicRegistrationInput,origin:string){
    if(clean(raw.website,10))throw new Error('REGISTRATION_REJECTED');
    const competition=await this.store.getCompetition(clean(competitionId,120));if(!competition)throw new Error('COMPETITION_NOT_FOUND');
    const policy=getCompetitionPolicy(competition),now=this.now();
    const starts=Date.parse(competition.registrationStartDate),ends=Date.parse(competition.registrationEndDate);
    if(competition.status!=='registration_open'||!['public','hybrid'].includes(policy.registration.mode)||(Number.isFinite(starts)&&now.getTime()<starts)||(Number.isFinite(ends)&&now.getTime()>ends))throw new Error('COMPETITION_REGISTRATION_CLOSED');
    const input:PublicRegistrationInput={fullNameArabic:clean(raw.fullNameArabic,120),fullName:clean(raw.fullName,120),email:clean(raw.email,254).toLowerCase(),phone:clean(raw.phone,32),country:clean(raw.country,100),nationality:clean(raw.nationality,100),nationalIdOrPassport:clean(raw.nationalIdOrPassport,80),dateOfBirth:clean(raw.dateOfBirth,10),gender:raw.gender==='female'?'female':'male',categoryId:clean(raw.categoryId,120),riwaya:clean(raw.riwaya,120),guardianName:clean(raw.guardianName,120),consents:raw.consents||{}};
    for(const field of policy.registration.fields.filter(x=>x.visible&&x.required))if(!String(fieldValue(field,input)).trim())throw new Error(`REGISTRATION_FIELD_REQUIRED:${field.id}`);
    // A competition may accidentally hide the identity field while keeping identity
    // verification enabled. The server policy remains authoritative and fails closed.
    if(policy.registration.requireIdentityVerification&&!input.nationalIdOrPassport)throw new Error('REGISTRATION_IDENTITY_REQUIRED');
    if(input.email&&!emailOk(input.email))throw new Error('REGISTRATION_EMAIL_INVALID');
    if(input.phone&&!/^\+?[0-9٠-٩۰-۹ -]{7,24}$/.test(input.phone))throw new Error('REGISTRATION_PHONE_INVALID');
    const age=ageOn(input.dateOfBirth,now);if(!Number.isInteger(age)||age<3||age>100)throw new Error('REGISTRATION_DATE_OF_BIRTH_INVALID');
    const category=competition.categories.find(x=>x.id===input.categoryId);if(!category)throw new Error('REGISTRATION_CATEGORY_INVALID');
    if(input.riwaya!==category.riwaya)throw new Error('REGISTRATION_READING_INVALID');
    if((category.minAge!==undefined&&age<category.minAge)||(category.maxAge!==undefined&&age>category.maxAge))throw new Error('REGISTRATION_AGE_NOT_ELIGIBLE');
    if(category.genderConstraint&&category.genderConstraint!=='all'&&category.genderConstraint!==input.gender)throw new Error('REGISTRATION_GENDER_NOT_ELIGIBLE');
    /*
     * نطاق الحفظ: يُتحقَّق منه على الخادم بقواعد الفئة نفسها.
     *
     * الواجهة تتحقق لتحسين التجربة، والخادم يتحقق لأن التسجيل مفتوح للعموم. واختيارٌ خارج
     * حدود الفئة يُرفض هنا، فلا يدخل النظام نطاقٌ لا تسمح به اللائحة.
     */
    const selectionRule=categorySelectionRule(category);
    let scopeRecordData:Record<string,unknown>|null=null;
    if(selectionRule.enabled&&category.scopeMode==='participant_selected'){
      const chosen=raw.memorizationScope;
      if(!chosen||!Array.isArray(chosen.segments)||!chosen.segments.length)throw new Error('REGISTRATION_SCOPE_REQUIRED');
      /*
       * يُتحقَّق من **الخام** قبل التطبيع، لا بعده.
       *
       * التطبيع يُصلح ما يمكن إصلاحه: يقلب المعكوس، ويدمج المتداخل، ويقصر ما تجاوز الحدّ.
       * فسورةٌ رقمها ٩٩٩ تصير «الناس» — وهذا إصلاحٌ لخطأٍ في الكتابة، لكنه **اختراعُ نطاق**
       * حين يأتي من طلبٍ عامّ: يخرج المتسابق بنطاقٍ لم يختره قط. فالخام يُفحص أولًا، ثم
       * يُطبَّع ما صحّ منه.
       */
      if(validateScope(chosen).length)throw new Error('REGISTRATION_SCOPE_INVALID');
      const normalized=normalizeScope(chosen);
      if(validateScope(normalized).length||scopeAyahCount(normalized)===0)throw new Error('REGISTRATION_SCOPE_INVALID');
      const issues=validateParticipantSelection(selectionRule,normalized);
      if(!selectionIsValid(issues))throw new Error(`REGISTRATION_SCOPE_RULE_VIOLATION:${issues.find(x=>x.severity==='error')?.code||'UNKNOWN'}`);
      scopeRecordData={selection:normalized,rule:selectionRule};
    }
    const minor=age<18,guardianRequired=minor&&policy.registration.requireGuardianForMinors;
    if(!input.consents?.terms||!input.consents?.privacy)throw new Error('REGISTRATION_CONSENT_REQUIRED');
    if(policy.judging.requireAudioRecording&&!input.consents.audioRecording)throw new Error('REGISTRATION_AUDIO_CONSENT_REQUIRED');
    if(guardianRequired&&(!input.consents.guardian||!input.guardianName))throw new Error('REGISTRATION_GUARDIAN_REQUIRED');
    // Until a certified identity provider is connected, collecting an identity number
    // is not equivalent to verifying it. Keep the application usable, but require a
    // human review instead of silently auto-approving it.
    let needsReview=policy.registration.requireIdentityVerification;
    for(const condition of policy.registration.eligibility){if(['previousWinner','document','custom'].includes(condition.field))throw new Error('REGISTRATION_POLICY_REQUIRES_REVIEW');const actual=condition.field==='age'?age:input[condition.field as 'country'|'nationality'|'gender'];if(compare(actual,condition)){if(condition.action==='reject')throw new Error('REGISTRATION_NOT_ELIGIBLE');needsReview=true}}
    const status:Participant['status']=policy.registration.autoApproveEligible&&!needsReview?'approved':'under_review';
    const journeyToken=token('journey'),guardianToken=token('guardian');
    const journeyAccessTokenHash=publicTokenHash(journeyToken),guardianAccessTokenHash=publicTokenHash(guardianToken);
    const participantId=`part-${crypto.randomUUID()}`,code=`A-${crypto.randomBytes(4).readUInt32BE(0).toString().slice(0,7).padStart(7,'0')}`,createdAt=now.toISOString();
    const participant:Participant={id:participantId,code,competitionId:competition.id,organizationId:competition.organizationId,fullName:input.fullName,fullNameArabic:input.fullNameArabic,email:input.email,phone:input.phone,country:input.country,nationality:input.nationality,nationalIdOrPassport:input.nationalIdOrPassport,dateOfBirth:input.dateOfBirth,gender:input.gender,categoryId:category.id,riwaya:category.riwaya,institution:'',specialNeeds:false,documents:[],status,statusHistory:[{status:'submitted',timestamp:createdAt,actor:'Public registration API'},{status,timestamp:createdAt,actor:'Eligibility Engine',reason:status==='approved'?'Objective eligibility rules passed':'Policy requires human review'}],journeyAccessTokenHash,guardianAccessTokenHash,createdAt};
    const journeyBase={organizationId:competition.organizationId,competitionId:competition.id,participantId,competitionName:competition.name,competitionNameArabic:competition.nameArabic,participantCode:code,participantName:participant.fullName,participantNameArabic:participant.fullNameArabic,status,arrivalSlot:null,queueNumber:null,venueName:competition.venueName||null,committee:null,result:null,certificate:null,revoked:false,updatedAt:createdAt};
    const documents=[{path:`organizations/${competition.organizationId}/competitions/${competition.id}/participants/${participantId}`,data:participant as unknown as Record<string,unknown>},{path:`public_journeys/${journeyAccessTokenHash}`,data:{...journeyBase,audience:'participant',tokenHashVersion:'sha256-v1'}},{path:`public_journeys/${guardianAccessTokenHash}`,data:{...journeyBase,audience:'guardian',tokenHashVersion:'sha256-v1'}}];
    if(scopeRecordData){
      const scopeId=`pscope-${crypto.randomUUID()}`;
      const record=buildParticipantScopeRecord({
        id:scopeId,organizationId:competition.organizationId,competitionId:competition.id,categoryId:category.id,participantId,
        rule:scopeRecordData.rule as ReturnType<typeof categorySelectionRule>,selection:scopeRecordData.selection as QuranScope,version:1,
        status:selectionRule.approval==='auto'?'approved':'submitted',now:createdAt,
      });
      const approved=selectionRule.approval==='auto';
      documents.push({path:`organizations/${competition.organizationId}/competitions/${competition.id}/participant_scopes/${scopeId}`,data:{
        ...record,submittedAt:createdAt,...(approved?{approvedAt:createdAt,approvedBy:'auto_policy'}:{}),
        scopeSignature:scopeSignature(record.scope),uploaderUid:participantId,updatedAt:createdAt,
      } as unknown as Record<string,unknown>});
    }
    const consentKinds=['terms','privacy',...(policy.judging.requireAudioRecording&&input.consents.audioRecording?['audio_recording']:[]),...(policy.privacy.allowAiProcessing&&input.consents.aiProcessing?['ai_processing']:[]),...(guardianRequired?['guardian']:[])];
    for(const kind of consentKinds){const id=`consent-${crypto.randomUUID()}`;documents.push({path:`organizations/${competition.organizationId}/competitions/${competition.id}/consents/${id}`,data:{id,participantId,competitionId:competition.id,kind,version:policy.version,accepted:true,acceptedAt:createdAt,...(kind==='guardian'?{guardianName:input.guardianName}: {})}})}
    await this.store.create(documents);
    const base=origin.replace(/\/$/,'');return {participant:{id:participant.id,code:participant.code,status:participant.status,competitionId:participant.competitionId,fullName:participant.fullName,fullNameArabic:participant.fullNameArabic},journeyUrl:`${base}/#journey?comp=${encodeURIComponent(competition.id)}&key=${encodeURIComponent(journeyToken)}`,guardianUrl:`${base}/#guardian?comp=${encodeURIComponent(competition.id)}&key=${encodeURIComponent(guardianToken)}`,journeyAccessToken:journeyToken,guardianAccessToken:guardianToken};
  }
  async resolve(competitionId:string,audience:'participant'|'guardian',rawToken:string){
    const value=clean(rawToken,120);if(!validPublicJourneyToken(value))throw new Error('JOURNEY_TOKEN_INVALID');
    const journey=await this.store.getJourney(publicTokenHash(value));if(!journey)throw new Error('JOURNEY_NOT_FOUND');
    if(journey.competitionId!==competitionId||journey.audience!==audience)throw new Error('JOURNEY_TOKEN_INVALID');
    if(journey.revoked)throw new Error('JOURNEY_REVOKED');
    const competition=await this.store.getCompetition(competitionId);if(!competition)throw new Error('COMPETITION_NOT_FOUND');
    if(['completed','archived'].includes(competition.status))throw new Error('COMPETITION_ACCESS_CLOSED');
    return journey;
  }
}
