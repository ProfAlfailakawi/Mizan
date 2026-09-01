import test from 'node:test';
import assert from 'node:assert/strict';
import { composeVenue } from '../src/lib/deployment-planner';
import { SEED_COMPETITION } from '../src/lib/seed-data';

test('venue composer reuses owned devices before requiring new hardware',()=>{
 const result=composeVenue(SEED_COMPETITION,{laptops:12,desktops:1,tablets:2,tvs:3,printers:1,usbScanners:0,edgeMiniPcs:1,wifi:true,participantByod:true});
 assert.equal(result.missingRequired,0);
 assert.ok(result.assignments.some(x=>x.role==='Gate'));
 assert.ok(result.assignments.some(x=>x.role==='JudgeOS'));
});

test('venue composer exposes a real gap instead of inventing availability',()=>{
 const result=composeVenue(SEED_COMPETITION,{laptops:0,desktops:0,tablets:0,tvs:0,printers:0,usbScanners:0,edgeMiniPcs:0,wifi:false,participantByod:true});
 assert.ok(result.missingRequired>0);
 assert.match(result.summaryEn,/required/i);
});
