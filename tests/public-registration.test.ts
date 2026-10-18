import test from 'node:test';
import assert from 'node:assert/strict';
import {SEED_COMPETITION} from '../src/data/seed-data';
import {PublicRegistrationService,publicTokenHash,type PublicRegistrationInput,type PublicRegistrationStore} from '../server/public-registration';
import type {Competition} from '../src/types';

const openCompetition=():Competition=>({...structuredClone(SEED_COMPETITION),status:'registration_open',registrationStartDate:'2026-01-01',registrationEndDate:'2027-12-31'});
const input:PublicRegistrationInput={fullNameArabic:'أحمد محمد',fullName:'Ahmad Mohammed',email:'ahmad@example.com',phone:'+96555555555',country:'Kuwait (الكويت)',nationality:'كويتي',nationalIdOrPassport:'P123456',dateOfBirth:'2010-01-01',gender:'male',categoryId:SEED_COMPETITION.categories[0].id,riwaya:SEED_COMPETITION.categories[0].riwaya,guardianName:'محمد أحمد',consents:{terms:true,privacy:true,guardian:true,audioRecording:true,aiProcessing:true}};
const LEGAL_ENV:Record<string,string>={
  MIZAN_LEGAL_ENTITY_NAME:'Mizan Test Entity',
  MIZAN_LEGAL_TERMS_URL:'https://example.invalid/terms',
  MIZAN_LEGAL_TERMS_VERSION:'1.0',
  MIZAN_LEGAL_TERMS_EFFECTIVE:'2026-09-01',
  MIZAN_LEGAL_PRIVACY_URL:'https://example.invalid/privacy',
  MIZAN_LEGAL_PRIVACY_VERSION:'1.0',
  MIZAN_LEGAL_PRIVACY_EFFECTIVE:'2026-09-01',
};
const fixedNow=()=>new Date('2026-09-09T08:00:00Z');

class MemoryStore implements PublicRegistrationStore{
  documents=new Map<string,Record<string,unknown>>();constructor(public competition:Competition|null=openCompetition()){}
  async getCompetition(id:string){return this.competition?.id===id?this.competition:null}
  async create(documents:{path:string;data:Record<string,unknown>}[]){for(const d of documents)if(this.documents.has(d.path))throw new Error('FIRESTORE_CONFLICT');for(const d of documents)this.documents.set(d.path,structuredClone(d.data))}
  async getJourney(hash:string){return this.documents.get(`public_journeys/${hash}`)||null}
}
const serviceFor=(store:MemoryStore,now=fixedNow,legal:Record<string,string|undefined>=LEGAL_ENV)=>new PublicRegistrationService(store,now,legal);

test('public registration atomically creates participant and independent cross-device journey capabilities without storing raw tokens',async()=>{
  const store=new MemoryStore(),service=serviceFor(store);
  const result=await service.register(SEED_COMPETITION.id,input,'https://mizan.example');
  assert.match(result.journeyUrl,/#journey\?comp=/);assert.match(result.guardianUrl,/#guardian\?comp=/);assert.notEqual(result.journeyAccessToken,result.guardianAccessToken);
  assert.ok(store.documents.has(`public_journeys/${publicTokenHash(result.journeyAccessToken)}`));assert.ok(store.documents.has(`public_journeys/${publicTokenHash(result.guardianAccessToken)}`));
  const persisted=JSON.stringify([...store.documents.values()]);assert.equal(persisted.includes(result.journeyAccessToken),false);assert.equal(persisted.includes(result.guardianAccessToken),false);
  const student=await service.resolve(SEED_COMPETITION.id,'participant',result.journeyAccessToken);const guardian=await service.resolve(SEED_COMPETITION.id,'guardian',result.guardianAccessToken);
  assert.equal(student.participantId,result.participant.id);assert.equal(guardian.participantId,result.participant.id);assert.equal(student.audience,'participant');assert.equal(guardian.audience,'guardian');
  assert.equal(result.participant.status,'under_review');
  const consentRows=[...store.documents.entries()].filter(([p])=>p.includes('/consents/')).map(([,d])=>d);
  assert.ok(consentRows.some(d=>d.kind==='terms'&&d.version==='terms:1.0'));
  assert.ok(consentRows.some(d=>d.kind==='privacy'&&d.version==='privacy:1.0'));
});

test('public registration fails closed when consent-backed legal documents are not published',async()=>{
  const service=serviceFor(new MemoryStore(),fixedNow,{});
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,input,'https://mizan.example'),/LEGAL_DOCUMENT_NOT_PUBLISHED:terms/);
  const partial={...LEGAL_ENV,MIZAN_LEGAL_PRIVACY_URL:''};
  const partialService=serviceFor(new MemoryStore(),fixedNow,partial);
  await assert.rejects(()=>partialService.register(SEED_COMPETITION.id,input,'https://mizan.example'),/LEGAL_DOCUMENT_NOT_PUBLISHED:privacy/);
});

test('public registration fails closed for closed competitions, invalid categories and missing guardian consent',async()=>{
  const closed=new MemoryStore({...openCompetition(),status:'registration_closed'}),closedService=serviceFor(closed);
  await assert.rejects(()=>closedService.register(SEED_COMPETITION.id,input,'https://mizan.example'),/COMPETITION_REGISTRATION_CLOSED/);
  const service=serviceFor(new MemoryStore());
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,{...input,categoryId:'missing'},'https://mizan.example'),/REGISTRATION_CATEGORY_INVALID/);
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,{...input,consents:{...input.consents,audioRecording:false}},'https://mizan.example'),/REGISTRATION_AUDIO_CONSENT_REQUIRED/);
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,{...input,consents:{terms:true,privacy:true,audioRecording:true}},'https://mizan.example'),/REGISTRATION_GUARDIAN_REQUIRED/);
  await assert.rejects(()=>service.resolve(SEED_COMPETITION.id,'participant','not-a-token'),/JOURNEY_TOKEN_INVALID/);
});

test('identity policy is enforced by the server even when a client omits the field',async()=>{
  const service=serviceFor(new MemoryStore());
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,{...input,nationalIdOrPassport:''},'https://mizan.example'),/REGISTRATION_(FIELD_REQUIRED:identity|IDENTITY_REQUIRED)/);
});

test('public registration permits registration while competition is live',async()=>{
  const liveStore=new MemoryStore({...openCompetition(),status:'live'}),liveService=serviceFor(liveStore);
  const res=await liveService.register(SEED_COMPETITION.id,input,'https://mizan.example');
  assert.equal(res.participant.status,'under_review');
});

test('the same person cannot register twice in one competition (double submit, retry after a lost reply, second tab)',async()=>{
  const store=new MemoryStore(),service=serviceFor(store);
  await service.register(SEED_COMPETITION.id,input,'https://mizan.example');
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,input,'https://mizan.example'),/REGISTRATION_ALREADY_REGISTERED/);
  /* الأرقام العربية والمسافات والشرطات والحالة لا تُنتج هويةً جديدة. */
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,{...input,nationalIdOrPassport:'p-123 456',email:'other@example.com'},'https://mizan.example'),/REGISTRATION_ALREADY_REGISTERED/);
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,{...input,nationalIdOrPassport:'٢٩٩٠١٤٥٢٠٣',email:'a@example.com'},'https://mizan.example').then(()=>service.register(SEED_COMPETITION.id,{...input,nationalIdOrPassport:'2990145203',email:'b@example.com'},'https://mizan.example')),/REGISTRATION_ALREADY_REGISTERED/);
  const participants=[...store.documents.keys()].filter(p=>/\/participants\//.test(p));
  assert.equal(participants.length,2,'only the first attempt of each identity created a participant');
});

test('a different person (own ID) and a sibling with a distinct ID register normally; the index stores no personal data',async()=>{
  const store=new MemoryStore(),service=serviceFor(store);
  await service.register(SEED_COMPETITION.id,input,'https://mizan.example');
  await service.register(SEED_COMPETITION.id,{...input,nationalIdOrPassport:'P777888',fullNameArabic:'يوسف محمد',fullName:'Yusuf Mohammed'},'https://mizan.example');
  const index=[...store.documents.entries()].filter(([p])=>/\/registration_index\//.test(p));
  assert.equal(index.length,2);
  const serialized=JSON.stringify(index.map(([,d])=>d));
  assert.doesNotMatch(serialized,/P123456|ahmad@example\.com|أحمد/);
});

test('with an ID too short to identify anyone, the duplicate key falls back to e-mail + date of birth + name',async()=>{
  const store=new MemoryStore(),service=serviceFor(store);
  const noId={...input,nationalIdOrPassport:'A1'};
  await service.register(SEED_COMPETITION.id,noId,'https://mizan.example');
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,noId,'https://mizan.example'),/REGISTRATION_ALREADY_REGISTERED/);
  await service.register(SEED_COMPETITION.id,{...noId,fullNameArabic:'أخوه الصغير',dateOfBirth:'2012-05-05'},'https://mizan.example');
});

class CollidingStore extends MemoryStore{
  attempts=0;constructor(private collisions:number,competition?:Competition|null){super(competition)}
  async create(documents:{path:string;data:Record<string,unknown>}[]){if(this.attempts++<this.collisions)throw new Error('FIRESTORE_CONFLICT');return super.create(documents)}
  async getDocument(path:string){return this.documents.get(path)||null}
}

test('a participant-code collision draws a new code instead of failing or sharing a code',async()=>{
  const store=new CollidingStore(3),service=serviceFor(store);
  const result=await service.register(SEED_COMPETITION.id,input,'https://mizan.example');
  assert.equal(store.attempts,4,'three collisions, then success');
  const stored=[...store.documents.entries()];
  const participant=stored.find(([p])=>/\/participants\//.test(p))![1] as {code:string};
  assert.equal(participant.code,result.participant.code);
  const journeys=stored.filter(([p])=>p.startsWith('public_journeys/')).map(([,d])=>(d as {participantCode:string}).participantCode);
  assert.deepEqual(journeys,[participant.code,participant.code],'the public journey cards carry the final code, not a discarded one');
  assert.ok(stored.some(([p])=>p.endsWith(`/participant_codes/${participant.code}`)),'the code is reserved by an index document');
});

test('a registration that can never obtain a free code fails with a clear code, not a hang',async()=>{
  const store=new CollidingStore(1000),service=serviceFor(store);
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,input,'https://mizan.example'),/REGISTRATION_CODE_UNAVAILABLE/);
  assert.ok(store.attempts<=8);
});

test('hidden bidi-override and zero-width characters are stripped from submitted names, ZWNJ is kept',async()=>{
  const store=new MemoryStore(),service=serviceFor(store);
  const dirty='‮يوسف​ محمد⁦﻿';
  await service.register(SEED_COMPETITION.id,{...input,fullNameArabic:dirty,fullName:'Yu‮suf​ M'},'https://mizan.example');
  const participant=[...store.documents.entries()].find(([p])=>/\/participants\//.test(p))![1] as {fullNameArabic:string;fullName:string};
  assert.equal(participant.fullNameArabic,'يوسف محمد');
  assert.equal(participant.fullName,'Yusuf M');
  const persian=await serviceFor(new MemoryStore()).register(SEED_COMPETITION.id,{...input,fullNameArabic:'می‌خواهم'},'https://mizan.example');
  assert.ok(persian.participant.fullNameArabic.includes('‌'),'the Persian half-space survives');
});
