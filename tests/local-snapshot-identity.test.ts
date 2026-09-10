import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import {journeyTokenWithheldLocally,participantMatchesIdentityQuery,redactParticipantForLocalSnapshot,redactStateForLocalSnapshot} from '../src/lib/local-snapshot-privacy';

const participant=(over:Record<string,unknown>={})=>({
 id:'p1',code:'A-104',competitionId:'c',organizationId:'o',fullName:'Ahmad',fullNameArabic:'أحمد',
 email:'a@example.com',phone:'+96599',country:'KW',nationality:'KW',nationalIdOrPassport:'298110401234',
 dateOfBirth:'2010-01-01',gender:'male',categoryId:'cat',riwaya:'حفص',status:'registered',statusHistory:[],
 documents:[{type:'passport',url:'https://files.example/p.pdf',verified:true}],createdAt:'2026-01-01T00:00:00.000Z',
 ...over}) as any;

test('the local snapshot keeps no identity number and no identity documents',()=>{
 const red=redactParticipantForLocalSnapshot(participant());
 assert.equal((red as any).nationalIdOrPassport,undefined,'the full number must not survive on the device');
 assert.equal((red as any).documents,undefined,'identity documents are never needed locally');
 const serialised=JSON.stringify(red);
 assert.ok(!serialised.includes('298110401234'),'the number must not survive anywhere in the snapshot');
 assert.ok(!serialised.includes('files.example'),'document links must not survive either');

 // Everything the competition actually runs on is untouched.
 assert.equal(red.code,'A-104');
 assert.equal(red.fullNameArabic,'أحمد');
 assert.equal(red.categoryId,'cat');
 assert.equal(red.riwaya,'حفص');
});

test('the field is deleted, never masked, so a later sync cannot overwrite the real number',()=>{
 const red=redactParticipantForLocalSnapshot(participant()) as unknown as Record<string,unknown>;
 // Firestore writes use merge:true — an absent key preserves the server value, a masked one destroys it.
 assert.equal('nationalIdOrPassport' in red,false,'the key must be absent, not present-and-undefined');
 assert.equal('documents' in red,false);
});

test('the last four characters remain so the exception desk can still match offline',()=>{
 assert.equal(redactParticipantForLocalSnapshot(participant()).identityLast4,'1234');
 // Format-agnostic: the program is not for one country, so no per-country rule is applied.
 assert.equal(redactParticipantForLocalSnapshot(participant({nationalIdOrPassport:'MAR-C492019'})).identityLast4,'2019');
 assert.equal(redactParticipantForLocalSnapshot(participant({nationalIdOrPassport:'MYS-8802194'})).identityLast4,'2194');
 // A short or absent number degrades quietly rather than throwing.
 assert.equal(redactParticipantForLocalSnapshot(participant({nationalIdOrPassport:'99'})).identityLast4,'99');
 assert.equal(redactParticipantForLocalSnapshot(participant({nationalIdOrPassport:''})).identityLast4,undefined);
});

test('the participant inside the live session is redacted too, not just the array',()=>{
 const full=participant();
 const state=redactStateForLocalSnapshot({participants:[full],activeSession:{participant:full,sessionId:'s1'}} as any) as any;
 // A judging session holds its own full copy, and it is written on every update — the worst moment to leak.
 assert.equal(state.activeSession.participant.nationalIdOrPassport,undefined);
 assert.equal(state.activeSession.participant.documents,undefined);
 assert.equal(state.activeSession.participant.identityLast4,'1234');
 assert.equal(state.activeSession.sessionId,'s1','the rest of the session is untouched');
 assert.ok(!JSON.stringify(state).includes('298110401234'),'the number must not survive anywhere in the state');

 // No active participant is not an error.
 const idle=redactStateForLocalSnapshot({participants:[full],activeSession:{participant:null}} as any) as any;
 assert.equal(idle.activeSession.participant,null);
});

test('a snapshot written before this release is cleaned when it is read, not when it is next written',()=>{
 const src=fs.readFileSync(path.join(process.cwd(),'src/lib/store.ts'),'utf8');
 // An idle device may never write again; cleaning on read is what actually reaches it.
 assert.match(src,/const sanitized=redactStateForLocalSnapshot\(parsed\)/);
 assert.match(src,/localStorage\.setItem\(STORAGE_KEY,JSON\.stringify\(sanitized\)\)/);
 assert.match(src,/return hydrateSavedState\(sanitized\)/);
});

test('the derived field is stripped before any write to the server',()=>{
 const src=fs.readFileSync(path.join(process.cwd(),'src/lib/store.ts'),'utf8');
 assert.match(src,/LOCAL_ONLY_PARTICIPANT_FIELDS/);
 assert.match(src,/for\(const key of LOCAL_ONLY_PARTICIPANT_FIELDS\)delete payload\[key\]/);
 // The snapshot writer must go through the redactor, not write globalState directly.
 assert.match(src,/localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(redactStateForLocalSnapshot\(globalState\)\)\)/);
});

test('the exception desk still finds a participant by the last four characters',()=>{
 const redacted=redactParticipantForLocalSnapshot(participant());
 // What the clerk reads off the document in hand still matches after the number is gone.
 assert.equal(participantMatchesIdentityQuery(redacted,'1234'),true);
 assert.equal(participantMatchesIdentityQuery(redacted,'298110401234'),true,'typing the full number must still match');
 assert.equal(participantMatchesIdentityQuery(redacted,'A-104'),true);
 assert.equal(participantMatchesIdentityQuery(redacted,'أحمد'),true);
 assert.equal(participantMatchesIdentityQuery(redacted,'9999'),false);
 assert.equal(participantMatchesIdentityQuery(redacted,''),false);
 // Before redaction, nothing about the existing search changes.
 assert.equal(participantMatchesIdentityQuery(participant(),'298110401234'),true);

 // The tail is a fallback for a missing number, never an addition to a present one: otherwise a
 // wrong number ending in the same four characters would surface the wrong person for reissue.
 const both=participant({identityLast4:'1234'});
 assert.equal(participantMatchesIdentityQuery(both,'298110401234'),true);
 assert.equal(participantMatchesIdentityQuery(both,'999999991234'),false,'a wrong full number must never match on its tail');
 const tailOnly=participant({identityLast4:'9999'});
 assert.equal(participantMatchesIdentityQuery(tailOnly,'9999'),false,'the tail must not match while the full number is known and differs');

 const src=fs.readFileSync(path.join(process.cwd(),'src/components/admin/RolePortals.tsx'),'utf8');
 assert.match(src,/participantMatchesIdentityQuery/,'the desk must use the shared matcher, not its own copy');
});

test('journey capability tokens are withheld, and a withheld one is never mistaken for a missing one',()=>{
 const withTokens=participant({journeyAccessToken:'journey-abc',guardianAccessToken:'guardian-xyz',journeyAccessTokenHash:'h1',guardianAccessTokenHash:'h2'});
 const red=redactParticipantForLocalSnapshot(withTokens);

 // Whoever holds the token opens the participant's portal, so it must not sit on the device.
 assert.equal((red as any).journeyAccessToken,undefined);
 assert.equal((red as any).guardianAccessToken,undefined);
 assert.ok(!JSON.stringify(red).includes('journey-abc'));
 assert.ok(!JSON.stringify(red).includes('guardian-xyz'));

 // The hashes stay: they prove the token exists without revealing it.
 assert.equal(red.journeyAccessTokenHash,'h1');
 assert.equal(red.guardianAccessTokenHash,'h2');

 // Absent-on-this-device must never be read as never-issued: minting a replacement would
 // silently invalidate a card already printed and handed to the participant.
 assert.equal(journeyTokenWithheldLocally(red),true);
 assert.equal(journeyTokenWithheldLocally(withTokens),false,'a token present locally is not withheld');
 assert.equal(journeyTokenWithheldLocally(participant()),false,'a participant who never had one may still be issued one');
});

test('issuing refuses rather than replacing a token that exists but is withheld locally',()=>{
 const src=fs.readFileSync(path.join(process.cwd(),'src/lib/store.ts'),'utf8');
 assert.match(src,/if\(journeyTokenWithheldLocally\(current\)\)return null;/);
 // The guard must come before any replacement token is minted.
 const guard=src.indexOf('journeyTokenWithheldLocally(current)');
 const mint=src.indexOf("current.journeyAccessToken||newId('journey')");
 assert.ok(guard>=0&&mint>=0&&guard<mint,'the refusal must precede the mint');
});
