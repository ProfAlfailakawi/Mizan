import test from 'node:test';
import assert from 'node:assert/strict';
import { SEED_COMPETITION } from '../src/lib/seed-data';
import { getCompetitionPolicy } from '../src/lib/competition-config';
import { applyApprovedCompilation, compilePolicyText, detectContradictions, policyCompilerSummary } from '../src/lib/policy-compiler';

test('Policy Compiler remains DRAFT until human approval and evidence links survive extraction',async()=>{
 const rec=await compilePolicyText({competitionId:SEED_COMPETITION.id,sourceFileName:'rules.txt',sourceType:'text',text:'Required judges: 5\nAppeal within 12 hours\nBlind judging required',createdBy:'admin',currentPolicy:getCompetitionPolicy(SEED_COMPETITION)});
 assert.equal(rec.state,'DRAFT');assert.ok(rec.rules.length>=2);assert.ok(rec.rules.every(r=>r.evidenceIds.length>0));assert.ok(rec.evidence.every(e=>e.lineStart));
 assert.throws(()=>applyApprovedCompilation(rec,SEED_COMPETITION),/POLICY_HUMAN_APPROVAL_REQUIRED/);
 const reviewed={...rec,state:'REVIEWED' as const,humanApprovedBy:'human-admin'};const compiled=applyApprovedCompilation(reviewed,SEED_COMPETITION);assert.equal(compiled.ruleSet.judgesCountPerPanel,5);
});

test('Policy Compiler reports contradictory extracted values concisely',async()=>{
 const rec=await compilePolicyText({competitionId:'c',sourceFileName:'rules.txt',sourceType:'text',text:'Required judges: 5\nRequired judges: 3',createdBy:'a',currentPolicy:getCompetitionPolicy(SEED_COMPETITION)});const summary=policyCompilerSummary(rec);assert.equal(summary.conflicts,2);
});

test('Contradiction Radar blocks blind-judging leaks, resource shortage and missing exact Quran source while AI mismatch is review-only',()=>{
 const competition=structuredClone(SEED_COMPETITION);competition.policy=getCompetitionPolicy(competition);competition.policy.judging.identityVisibility='code_only';competition.policy.judging.silentAiGuardian=true;competition.ruleSet.judgesCountPerPanel=5;
 const issues=detectContradictions({competition,quranSources:[],aiValidations:[],availableQualifiedJudges:3,committeeSeesDelegation:true,certificateProofRequired:true});
 assert.ok(issues.some(i=>i.severity==='BLOCKER'&&i.kind==='blind_judging'));
 assert.ok(issues.some(i=>i.severity==='BLOCKER'&&i.kind==='resource'));
 assert.ok(issues.some(i=>i.severity==='BLOCKER'&&i.kind==='scientific'));
 assert.ok(issues.some(i=>i.severity==='REVIEW'&&i.kind==='qiraah_ai'));
});


test('Policy Compiler surfaces ambiguous and unmapped policy lines instead of silently dropping them',async()=>{
 const current=getCompetitionPolicy(SEED_COMPETITION);
 const rec=await compilePolicyText({competitionId:'c',sourceFileName:'policy.txt',sourceType:'text',createdBy:'admin',currentPolicy:current,text:'The committee may use 5 judges where possible.\nWarsh categories must follow the approved Quran scope.\nNotifications and ceremony retention follow organization policy.'});
 assert.ok(rec.rules.some(r=>r.state==='NEEDS_REVIEW'));
 assert.ok(rec.rules.some(r=>r.genomePath==='UNMAPPED_REQUIRES_HUMAN_MAPPING'));
 assert.ok(rec.rules.every(r=>r.evidenceIds.length>0));
});

test('Contradiction Radar detects privacy and ceremony publication conflicts',()=>{
 const competition=structuredClone(SEED_COMPETITION);const policy=getCompetitionPolicy(competition);policy.judging.silentAiGuardian=true;policy.aiPolicy.mode='AI_CERTIFIED_CAPABILITIES_ONLY';policy.privacy.allowAiProcessing=false;policy.results.visibility='ceremony_only';policy.results.publicLeaderboard='top_only';competition.policy=policy;
 const issues=detectContradictions({competition,quranSources:[],aiValidations:[],availableQualifiedJudges:99,committeeCount:1});
 assert.ok(issues.some(i=>i.kind==='privacy'&&i.severity==='BLOCKER'));
 assert.ok(issues.some(i=>i.kind==='publication'&&i.severity==='BLOCKER'));
});
