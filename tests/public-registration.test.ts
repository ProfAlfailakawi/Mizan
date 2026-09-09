import test from 'node:test';
import assert from 'node:assert/strict';
import {SEED_COMPETITION} from '../src/lib/seed-data';
import {PublicRegistrationService,publicTokenHash,type PublicRegistrationInput,type PublicRegistrationStore} from '../server/public-registration';
import type {Competition} from '../src/types';

const openCompetition=():Competition=>({...structuredClone(SEED_COMPETITION),status:'registration_open',registrationStartDate:'2026-01-01',registrationEndDate:'2027-12-31'});
const input:PublicRegistrationInput={fullNameArabic:'أحمد محمد',fullName:'Ahmad Mohammed',email:'ahmad@example.com',phone:'+96555555555',country:'Kuwait (الكويت)',nationality:'كويتي',nationalIdOrPassport:'P123456',dateOfBirth:'2010-01-01',gender:'male',categoryId:SEED_COMPETITION.categories[0].id,riwaya:SEED_COMPETITION.categories[0].riwaya,guardianName:'محمد أحمد',consents:{terms:true,privacy:true,guardian:true,audioRecording:true,aiProcessing:true}};

class MemoryStore implements PublicRegistrationStore{
  documents=new Map<string,Record<string,unknown>>();constructor(public competition:Competition|null=openCompetition()){}
  async getCompetition(id:string){return this.competition?.id===id?this.competition:null}
  async create(documents:{path:string;data:Record<string,unknown>}[]){for(const d of documents)if(this.documents.has(d.path))throw new Error('FIRESTORE_CONFLICT');for(const d of documents)this.documents.set(d.path,structuredClone(d.data))}
  async getJourney(hash:string){return this.documents.get(`public_journeys/${hash}`)||null}
}

test('public registration atomically creates participant and independent cross-device journey capabilities without storing raw tokens',async()=>{
  const store=new MemoryStore(),service=new PublicRegistrationService(store,()=>new Date('2026-09-09T08:00:00Z'));
  const result=await service.register(SEED_COMPETITION.id,input,'https://mizan.example');
  assert.match(result.journeyUrl,/#journey\?comp=/);assert.match(result.guardianUrl,/#guardian\?comp=/);assert.notEqual(result.journeyAccessToken,result.guardianAccessToken);
  assert.ok(store.documents.has(`public_journeys/${publicTokenHash(result.journeyAccessToken)}`));assert.ok(store.documents.has(`public_journeys/${publicTokenHash(result.guardianAccessToken)}`));
  const persisted=JSON.stringify([...store.documents.values()]);assert.equal(persisted.includes(result.journeyAccessToken),false);assert.equal(persisted.includes(result.guardianAccessToken),false);
  const student=await service.resolve(SEED_COMPETITION.id,'participant',result.journeyAccessToken);const guardian=await service.resolve(SEED_COMPETITION.id,'guardian',result.guardianAccessToken);
  assert.equal(student.participantId,result.participant.id);assert.equal(guardian.participantId,result.participant.id);assert.equal(student.audience,'participant');assert.equal(guardian.audience,'guardian');
  assert.equal(result.participant.status,'under_review');
});

test('public registration fails closed for closed competitions, invalid categories and missing guardian consent',async()=>{
  const closed=new MemoryStore({...openCompetition(),status:'registration_closed'}),closedService=new PublicRegistrationService(closed,()=>new Date('2026-09-09T08:00:00Z'));
  await assert.rejects(()=>closedService.register(SEED_COMPETITION.id,input,'https://mizan.example'),/COMPETITION_REGISTRATION_CLOSED/);
  const service=new PublicRegistrationService(new MemoryStore(),()=>new Date('2026-09-09T08:00:00Z'));
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,{...input,categoryId:'missing'},'https://mizan.example'),/REGISTRATION_CATEGORY_INVALID/);
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,{...input,consents:{...input.consents,audioRecording:false}},'https://mizan.example'),/REGISTRATION_AUDIO_CONSENT_REQUIRED/);
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,{...input,consents:{terms:true,privacy:true,audioRecording:true}},'https://mizan.example'),/REGISTRATION_GUARDIAN_REQUIRED/);
  await assert.rejects(()=>service.resolve(SEED_COMPETITION.id,'participant','not-a-token'),/JOURNEY_TOKEN_INVALID/);
});

test('identity policy is enforced by the server even when a client omits the field',async()=>{
  const service=new PublicRegistrationService(new MemoryStore(),()=>new Date('2026-09-09T08:00:00Z'));
  await assert.rejects(()=>service.register(SEED_COMPETITION.id,{...input,nationalIdOrPassport:''},'https://mizan.example'),/REGISTRATION_(FIELD_REQUIRED:identity|IDENTITY_REQUIRED)/);
});
