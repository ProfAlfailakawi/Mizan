import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreflight } from '../src/lib/readiness';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import { SEED_COMPETITION } from '../src/lib/seed-data';

const input=(status:'draft'|'live',assurance:'operational_panel_gate'|'production_server_escrow')=>{
 const competition=structuredClone(SEED_COMPETITION);
 competition.status=status;
 const policy=getCompetitionPolicy(competition);
 policy.questions.secureReveal={requireParticipantPresence:true,judgeApprovalMode:'all_assigned'};
 return buildPreflight({competition,policy,integrations:[],devices:[],judges:[],committees:[],quranSources:[],aiValidations:[],backups:[],isOffline:false,questionEscrowAssurance:assurance});
};

test('operational panel gate is visible as a warning before live competition',()=>{
 const check=input('draft','operational_panel_gate').checks.find(x=>x.id==='question_escrow');
 assert.equal(check?.status,'warning');
});

test('live strict reveal is blocked until question plaintext is server-held',()=>{
 const check=input('live','operational_panel_gate').checks.find(x=>x.id==='question_escrow');
 assert.equal(check?.status,'blocker');
});

test('server-held escrow satisfies the anti-leak readiness gate',()=>{
 const check=input('live','production_server_escrow').checks.find(x=>x.id==='question_escrow');
 assert.equal(check?.status,'ready');
});
