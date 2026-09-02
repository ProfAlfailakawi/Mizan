import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMerkleTree, canonicalStringify, merkleProofForIndex, quorumSatisfied, verifyMerkleProof } from '../src/lib/trust-protocol';

test('canonical trust payloads are deterministic',()=>{
  assert.equal(canonicalStringify({z:2,a:{y:2,x:1}}),'{"a":{"x":1,"y":2},"z":2}');
});

test('Merkle selective disclosure verifies and rejects tampering',async()=>{
  const materials=['result-a','result-b','result-c'];
  const tree=await buildMerkleTree(materials);
  const proof=merkleProofForIndex(tree.levels,1);
  assert.equal(await verifyMerkleProof('result-b',proof,tree.root),true);
  assert.equal(await verifyMerkleProof('changed',proof,tree.root),false);
});

test('quorum requires both role groups and distinct actors',()=>{
  const requiredRoleGroups=[['head_judge' as const],['comp_admin' as const,'org_admin' as const]];
  assert.equal(quorumSatisfied({requiredRoleGroups,distinctActorsRequired:true,approvals:[
    {actorId:'a',actorName:'A',actorRole:'head_judge',approvedAt:'2026-01-01T00:00:00Z'},
    {actorId:'b',actorName:'B',actorRole:'comp_admin',approvedAt:'2026-01-01T00:01:00Z'}
  ]}),true);
  assert.equal(quorumSatisfied({requiredRoleGroups,distinctActorsRequired:true,approvals:[
    {actorId:'a',actorName:'A',actorRole:'head_judge',approvedAt:'2026-01-01T00:00:00Z'},
    {actorId:'a',actorName:'A',actorRole:'comp_admin',approvedAt:'2026-01-01T00:01:00Z'}
  ]}),false);
});

test('ceremony-style M-of-N quorum rejects single authority and ignores unauthorized super admin',()=>{
 const base={requiredRoleGroups:[['scientific_admin' as const,'comp_admin' as const,'org_admin' as const]],distinctActorsRequired:true,minimumApprovals:2,authorizedRoles:['scientific_admin' as const,'comp_admin' as const,'org_admin' as const]};
 assert.equal(quorumSatisfied({...base,approvals:[{actorId:'s1',actorName:'S',actorRole:'scientific_admin' as const,approvedAt:'2026-01-01'}]}),false);
 assert.equal(quorumSatisfied({...base,approvals:[{actorId:'s1',actorName:'S',actorRole:'scientific_admin' as const,approvedAt:'2026-01-01'},{actorId:'root',actorName:'Root',actorRole:'super_admin' as const,approvedAt:'2026-01-01'}]}),false);
 assert.equal(quorumSatisfied({...base,approvals:[{actorId:'s1',actorName:'S',actorRole:'scientific_admin' as const,approvedAt:'2026-01-01'},{actorId:'c1',actorName:'C',actorRole:'comp_admin' as const,approvedAt:'2026-01-01'}]}),true);
});
