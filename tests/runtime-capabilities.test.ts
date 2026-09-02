import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRuntimeHealth,questionEscrowAssuranceFromHealth} from '../src/lib/runtime-capabilities';

test('runtime health only promotes question escrow when server explicitly reports configured',()=>{
 const yes=normalizeRuntimeHealth({status:'ok',questionEscrowConfigured:true,passSigningConfigured:true});
 const no=normalizeRuntimeHealth({status:'ok',questionEscrowConfigured:false});
 assert.equal(questionEscrowAssuranceFromHealth(yes),'production_server_escrow');
 assert.equal(questionEscrowAssuranceFromHealth(no),'operational_panel_gate');
 assert.equal(questionEscrowAssuranceFromHealth(undefined),'operational_panel_gate');
});
