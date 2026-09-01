import test from 'node:test';
import assert from 'node:assert/strict';
import { canAIChangeScore, reconcileProviderSignals } from '../src/lib/ai-integrity-engine';

test('AI integrity can never change a score',()=>assert.equal(canAIChangeScore(),false));
test('dual independent listening raises a matching signal to reviewable confidence',()=>{
 const r=reconcileProviderSignals('s1',[
  {timestampSeconds:10,type:'omission',confidence:.9,expectedLocation:'2:10',hypothesis:'omission',provider:'A',modelVersion:'1'},
  {timestampSeconds:11,type:'omission',confidence:.86,expectedLocation:'2:10',hypothesis:'omission',provider:'B',modelVersion:'2'}
 ]);
 assert.equal(r.length,1);assert.equal(r[0].confidence,'high');assert.equal(r[0].flaggedForReview,true);
});
