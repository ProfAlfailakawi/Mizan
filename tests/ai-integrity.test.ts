import test from 'node:test';
import assert from 'node:assert/strict';
import { canAIChangeScore, reconcileProviderSignals } from '../src/lib/ai-integrity-engine';

test('AI integrity can never change a score',()=>assert.equal(canAIChangeScore(),false));
test('dual independent listening raises review priority without averaging model confidence',()=>{
 const r=reconcileProviderSignals('s1',[
  {timestampSeconds:10,type:'omission',confidence:.9,confidenceBand:'medium',expectedLocation:'2:10',hypothesis:'omission',provider:'A',modelVersion:'1'},
  {timestampSeconds:11,type:'omission',confidence:.86,confidenceBand:'low',expectedLocation:'2:10',hypothesis:'omission',provider:'B',modelVersion:'2'}
 ]);
 assert.equal(r.length,2);assert.equal(r[0].confidence,'medium');assert.equal(r[1].confidence,'low');assert.equal(r[0].flaggedForReview,true);assert.equal(r[1].flaggedForReview,true);
});
