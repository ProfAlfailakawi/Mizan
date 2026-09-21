import crypto from 'crypto';
import { CONSENT_BACKED_DOCUMENTS, consentVersionOf, isResolved, legalConfigFromEnv, resolveLegalDocument, type LegalChainLink, type LegalDocumentKind } from '../src/lib/legal-documents';
import type {Competition,EligibilityCondition,Participant,RegistrationFieldDefinition} from '../src/types';
import {getCompetitionPolicy} from '../src/lib/competition-config';
import {categoryDistribution,categoryScopeOf,resolveQuestionCount} from '../src/lib/scope-engine';
import {describeScope} from '../src/lib/quran-scope';

export type PublicRegistrationInput={fullNameArabic:string;fullName:string;email:string;phone:string;country:string;nationality:string;nationalIdOrPassport:string;dateOfBirth:string;gender:'male'|'female';categoryId:string;riwaya:string;guardianName?:string;consents?:{terms?:boolean;privacy?:boolean;guardian?:boolean;audioRecording?:boolean;aiProcessing?:boolean};website?:string};
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
  /*
   * `legalChainFor` يجلب سلسلةَ الناشرين لهذه الجهة: وثائقُها، فوثائقُ مشغّلها، فوثائقُ
   * المنصّة. وغيابُه يعني المنصّةَ وحدها — وهو الحال قبل بيع النظام لمشغّلين.
   */
  constructor(
    private readonly store:PublicRegistrationStore,
    private readonly now=()=>new Date(),
    private readonly legalEnvironment:Record<string,string|undefined>=process.env as Record<string,string|undefined>,
    private readonly legalChainFor?:(organizationId:string)=>Promise<LegalChainLink[]>|LegalChainLink[],
  ){}
  async register(competitionId:string,raw:PublicRegistrationInput,origin:string){
    if(clean(raw.website,10))throw new Error('REGISTRATION_REJECTED');
    const competition=await this.store.getCompetition(clean(competitionId,120));if(!competition)throw new Error('COMPETITION_NOT_FOUND');
    const policy=getCompetitionPolicy(competition),now=this.now();
    /*
     * الموافقة لا تكون ذات معنى إن لم توجد الوثيقة التي وافق عليها الشخص. وكان هذا الشرط
     * محصورًا في preflight؛ أي إن نشرًا سيئ التهيئة يستطيع مع ذلك قبول POST مباشر وكتابة
     * سجل «وافق» على شروط/خصوصية غير منشورتين. التسجيل العام نفسه الآن يفشل مغلقًا.
     */
    const platform:LegalChainLink={level:'platform',config:legalConfigFromEnv(this.legalEnvironment)};
    const chain=this.legalChainFor?await this.legalChainFor(competition.organizationId):[platform];
    const consentDocuments=new Map<LegalDocumentKind,ReturnType<typeof resolveLegalDocument>>();
    for(const kind of CONSENT_BACKED_DOCUMENTS){
      const resolved=resolveLegalDocument(chain,kind);
      if(!isResolved(resolved))throw new Error(`LEGAL_DOCUMENT_NOT_PUBLISHED:${kind}`);
      consentDocuments.set(kind,resolved);
    }
    const ends=Date.parse(competition.registrationEndDate);
    if(competition.status!=='registration_open'&&competition.status!=='live')throw new Error('COMPETITION_REGISTRATION_CLOSED');
    if(!['public','hybrid'].includes(policy.registration.mode))throw new Error('COMPETITION_REGISTRATION_CLOSED');
    if(Number.isFinite(ends)&&now.getTime()>ends)throw new Error('COMPETITION_REGISTRATION_CLOSED');
    const input:PublicRegistrationInput={fullNameArabic:clean(raw.fullNameArabic,120),fullName:clean(raw.fullName,120),email:clean(raw.email,254).toLowerCase(),phone:clean(raw.phone,32),country:clean(raw.country,100),nationality:clean(raw.nationality,100),nationalIdOrPassport:clean(raw.nationalIdOrPassport,80),dateOfBirth:clean(raw.dateOfBirth,10),gender:raw.gender==='female'?'female':'male',categoryId:clean(raw.categoryId,120),riwaya:clean(raw.riwaya,120),guardianName:clean(raw.guardianName,120),consents:raw.consents||{}};
    for(const field of policy.registration.fields.filter(x=>x.visible&&x.required))if(!String(fieldValue(field,input)).trim())throw new Error(`REGISTRATION_FIELD_REQUIRED:${field.id}`);
    if(policy.registration.requireIdentityVerification&&!input.nationalIdOrPassport)throw new Error('REGISTRATION_IDENTITY_REQUIRED');
    if(input.email&&!emailOk(input.email))throw new Error('REGISTRATION_EMAIL_INVALID');
    if(input.phone&&!/^\+?[0-9٠-٩۰-۹ -]{7,24}$/.test(input.phone))throw new Error('REGISTRATION_PHONE_INVALID');
    const age=ageOn(input.dateOfBirth,now);if(!Number.isInteger(age)||age<3||age>100)throw new Error('REGISTRATION_DATE_OF_BIRTH_INVALID');
    const category=competition.categories.find(x=>x.id===input.categoryId);if(!category)throw new Error('REGISTRATION_CATEGORY_INVALID');
    const defaultReading=clean(category.riwaya,120);
    const allowedReadings=[defaultReading,...(category.allowedRiwayat||[]).map(x=>clean(x,120))].filter(Boolean);
    const categoryReading=allowedReadings.find(x=>x===input.riwaya);
    if(!categoryReading)throw new Error('REGISTRATION_READING_INVALID');
    if((category.minAge!==undefined&&age<category.minAge)||(category.maxAge!==undefined&&age>category.maxAge))throw new Error('REGISTRATION_AGE_NOT_ELIGIBLE');
    if(category.genderConstraint&&category.genderConstraint!=='all'&&category.genderConstraint!==input.gender)throw new Error('REGISTRATION_GENDER_NOT_ELIGIBLE');
    const minor=age<18,guardianRequired=minor&&policy.registration.requireGuardianForMinors;
    if(!input.consents?.terms||!input.consents?.privacy)throw new Error('REGISTRATION_CONSENT_REQUIRED');
    if(policy.judging.requireAudioRecording&&!input.consents.audioRecording)throw new Error('REGISTRATION_AUDIO_CONSENT_REQUIRED');
    if(guardianRequired&&(!input.consents.guardian||!input.guardianName))throw new Error('REGISTRATION_GUARDIAN_REQUIRED');
    let needsReview=policy.registration.requireIdentityVerification;
    for(const condition of policy.registration.eligibility){if(['previousWinner','document','custom'].includes(condition.field))throw new Error('REGISTRATION_POLICY_REQUIRES_REVIEW');const actual=condition.field==='age'?age:input[condition.field as 'country'|'nationality'|'gender'];if(compare(actual,condition)){if(condition.action==='reject')throw new Error('REGISTRATION_NOT_ELIGIBLE');needsReview=true}}
    const status:Participant['status']=policy.registration.autoApproveEligible&&!needsReview?'approved':'under_review';
    const journeyToken=token('journey'),guardianToken=token('guardian');
    const journeyAccessTokenHash=publicTokenHash(journeyToken),guardianAccessTokenHash=publicTokenHash(guardianToken);
    const participantId=`part-${crypto.randomUUID()}`,code=`A-${crypto.randomBytes(4).readUInt32BE(0).toString().slice(0,7).padStart(7,'0')}`,createdAt=now.toISOString();
    const participant:Participant={id:participantId,code,competitionId:competition.id,organizationId:competition.organizationId,fullName:input.fullName,fullNameArabic:input.fullNameArabic,email:input.email,phone:input.phone,country:input.country,nationality:input.nationality,nationalIdOrPassport:input.nationalIdOrPassport,dateOfBirth:input.dateOfBirth,gender:input.gender,categoryId:category.id,riwaya:categoryReading,institution:'',specialNeeds:false,documents:[],status,statusHistory:[{status:'submitted',timestamp:createdAt,actor:'Public registration API'},{status,timestamp:createdAt,actor:'Eligibility Engine',reason:status==='approved'?'Objective eligibility rules passed':'Policy requires human review'}],journeyAccessTokenHash,guardianAccessTokenHash,journeyTokenCustody:'holder_only',createdAt};
    const questionCount=resolveQuestionCount(category,policy),distribution=categoryDistribution(category,questionCount),scope=categoryScopeOf(category);
    const journeyBase={organizationId:competition.organizationId,competitionId:competition.id,participantId,competitionName:competition.name,competitionNameArabic:competition.nameArabic,participantCode:code,participantName:participant.fullName,participantNameArabic:participant.fullNameArabic,status,arrivalSlot:null,queueNumber:null,venueName:competition.venueName||null,committee:null,result:null,certificate:null,preparation:{scopeTextArabic:describeScope(scope,true),scopeTextEnglish:describeScope(scope,false),spreadAcrossZones:distribution.mode!=='free'&&distribution.zones.length>1,questionCount,minutesPerQuestion:Math.max(1,Math.round((category.targetDurationMinutes||questionCount*5)/Math.max(1,questionCount)))},revoked:false,updatedAt:createdAt};
    const documents=[{path:`organizations/${competition.organizationId}/competitions/${competition.id}/participants/${participantId}`,data:participant as unknown as Record<string,unknown>},{path:`public_journeys/${journeyAccessTokenHash}`,data:{...journeyBase,audience:'participant',tokenHashVersion:'sha256-v1'}},{path:`public_journeys/${guardianAccessTokenHash}`,data:{...journeyBase,audience:'guardian',tokenHashVersion:'sha256-v1'}}];
    /*
     * الموافقةُ على وثيقةٍ تُكتب بناشرها لا برقمها وحده. وما ليس وثيقةً منشورة —
     * كالتسجيل الصوتي وموافقة وليّ الأمر — يبقى منسوبًا إلى لائحة المسابقة صراحةً.
     */
    const consentProvenance=(kind:string)=>{
      const resolved=consentDocuments.get(kind as LegalDocumentKind);
      if(!resolved||!isResolved(resolved))return {version:`policy:${policy.version}`};
      return {
        version:consentVersionOf(kind as LegalDocumentKind,resolved.version),
        publisher:resolved.publisher,
        publisherLevel:resolved.level,
        documentUrl:resolved.url,
        documentEffectiveDate:resolved.effectiveDate,
      };
    };
    const consentKinds=['terms','privacy',...(policy.judging.requireAudioRecording&&input.consents.audioRecording?['audio_recording']:[]),...(policy.privacy.allowAiProcessing&&input.consents.aiProcessing?['ai_processing']:[]),...(guardianRequired?['guardian']:[])];
    for(const kind of consentKinds){const id=`consent-${crypto.randomUUID()}`;documents.push({path:`organizations/${competition.organizationId}/competitions/${competition.id}/consents/${id}`,data:{id,participantId,competitionId:competition.id,kind,...consentProvenance(kind),accepted:true,acceptedAt:createdAt,...(kind==='guardian'?{guardianName:input.guardianName}: {})}})}
    await this.store.create(documents);
    const base=origin.replace(/\/$/,'');return {participant:{id:participant.id,code:participant.code,status:participant.status,competitionId:participant.competitionId,fullName:participant.fullName,fullNameArabic:participant.fullNameArabic},journeyUrl:`${base}/#journey?comp=${encodeURIComponent(competition.id)}&key=${encodeURIComponent(journeyToken)}`,guardianUrl:`${base}/#guardian?comp=${encodeURIComponent(competition.id)}&key=${encodeURIComponent(guardianToken)}`,journeyAccessToken:journeyToken,guardianAccessToken:guardianToken};
  }
  async resolve(competitionId:string,audience:'participant'|'guardian',rawToken:string){
    const value=clean(rawToken,120);if(!validPublicJourneyToken(value))throw new Error('JOURNEY_TOKEN_INVALID');
    const journey=await this.store.getJourney(publicTokenHash(value));if(!journey)throw new Error('JOURNEY_NOT_FOUND');
    if(journey.competitionId!==competitionId||journey.audience!==audience)throw new Error('JOURNEY_TOKEN_INVALID');
    if(journey.revoked)throw new Error('JOURNEY_REVOKED');
    const competition=await this.store.getCompetition(competitionId);if(!competition)throw new Error('COMPETITION_NOT_FOUND');
    return journey;
  }
}
