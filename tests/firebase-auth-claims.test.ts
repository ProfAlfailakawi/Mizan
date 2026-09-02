import test from 'node:test';
import assert from 'node:assert/strict';
import { firebaseSecondFactorPresent, validateFirebaseClaims } from '../server/firebase-auth';

const now=1_800_000_000;
const base={aud:'mizan-prod',iss:'https://securetoken.google.com/mizan-prod',sub:'judge-1',exp:now+3600,iat:now-30,role:'judge',org_id:'org-1',competition_id:'comp-1'};

test('firebase MIZAN claims require correct tenant audience issuer and role scope',()=>{const id=validateFirebaseClaims(base,'mizan-prod',now);assert.equal(id.uid,'judge-1');assert.equal(id.role,'judge');assert.equal(id.organizationId,'org-1');assert.equal(id.competitionId,'comp-1');});
test('expired or wrong-tenant Firebase claims are rejected',()=>{assert.throws(()=>validateFirebaseClaims({...base,exp:now-1},'mizan-prod',now),/EXPIRED/);assert.throws(()=>validateFirebaseClaims({...base,aud:'other'},'mizan-prod',now),/AUDIENCE/);assert.throws(()=>validateFirebaseClaims({...base,org_id:''},'mizan-prod',now),/CLAIMS_REQUIRED/);});

test('server-side MFA evidence is read from the verified Firebase token, not from client UI state',()=>{
 assert.equal(firebaseSecondFactorPresent({...base,firebase:{sign_in_second_factor:'totp'}}),true);
 assert.equal(firebaseSecondFactorPresent({...base,firebase:{}}),false);
 assert.equal(firebaseSecondFactorPresent(base),false);
});
