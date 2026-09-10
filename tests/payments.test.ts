import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { paymentGatewayFromEnv, renderTemplate } from '../server/payments';

/* ملف إعداد بوابة افتراضية: يثبت أن أي بوابة تُضاف بالإعداد وحده، بلا كود خاص بها. */
const profile={
  name:'demo-gateway',
  checkout:{url:'https://pay.example.test/create',headers:{authorization:'Bearer ${apiKey}'},body:{amount:'${amountMajor}',currency:'${currency}',ref:'${invoiceId}',redirect:'${callbackUrl}'},paymentUrlPath:'data.url',referencePath:'data.id'},
  webhook:{signatureHeader:'x-demo-signature',encoding:'base64' as const,referencePath:'payment.id',statusPath:'payment.state',amountPath:'payment.total',currencyPath:'payment.currency',paidValues:['settled']},
};
const env=(over:Record<string,string>={})=>({MIZAN_PAYMENT_CONFIG:JSON.stringify(profile),MIZAN_PAYMENT_API_KEY:'key-123',MIZAN_PAYMENT_WEBHOOK_SECRET:'whsec',...over}) as NodeJS.ProcessEnv;

test('templates substitute only known variables and keep the rest intact',()=>{
  const out=renderTemplate({a:'${currency}',b:'x-${invoiceId}-y',c:'${unknown}',d:5},{currency:'KWD',invoiceId:'INV-1'});
  assert.deepEqual(out,{a:'KWD',b:'x-INV-1-y',c:'',d:5});
});

test('a gateway is built from configuration alone, and absent configuration means manual collection',()=>{
  assert.equal(paymentGatewayFromEnv(env())?.name,'demo-gateway');
  assert.equal(paymentGatewayFromEnv({} as NodeJS.ProcessEnv),null,'no config must fall back to manual, not throw');
  assert.equal(paymentGatewayFromEnv(env({MIZAN_PAYMENT_API_KEY:''})),null,'a missing key must not half-enable the gateway');
  assert.equal(paymentGatewayFromEnv(env({MIZAN_PAYMENT_CONFIG:'{not json'})),null);
});

test('checkout posts the configured shape and reads the response by configured paths',async()=>{
  const gateway=paymentGatewayFromEnv(env())!;
  const calls:{url:string;init:any}[]=[];
  const original=globalThis.fetch;
  globalThis.fetch=(async(url:any,init:any)=>{calls.push({url:String(url),init});return {ok:true,status:200,text:async()=>JSON.stringify({data:{url:'https://pay.example.test/go/9',id:'ref-9'}})}}) as any;
  try{
    const out=await gateway.createCheckout({invoiceId:'INV-1',invoiceNumber:'INV-000001',amountMinor:5000,currency:'KWD',description:'d',callbackUrl:'https://app/ok',errorUrl:'https://app/fail'});
    assert.deepEqual(out,{paymentUrl:'https://pay.example.test/go/9',externalRef:'ref-9'});
    assert.equal(calls[0].url,'https://pay.example.test/create');
    assert.equal(calls[0].init.headers.authorization,'Bearer key-123');
    assert.deepEqual(JSON.parse(calls[0].init.body),{amount:'50.00',currency:'KWD',ref:'INV-1',redirect:'https://app/ok'});
  } finally { globalThis.fetch=original }
});

test('a webhook is trusted only when its signature over the raw body matches',()=>{
  const gateway=paymentGatewayFromEnv(env())!;
  const raw=Buffer.from(JSON.stringify({payment:{id:'ref-9',state:'settled',total:50,currency:'KWD'}}),'utf8');
  const good=crypto.createHmac('sha256','whsec').update(raw.toString('utf8'),'utf8').digest('base64');

  assert.equal(gateway.verifyWebhook({'x-demo-signature':'forged'},raw),null,'a forged signature must be rejected');
  assert.equal(gateway.verifyWebhook({},raw),null,'a missing signature must be rejected');
  const settlement=gateway.verifyWebhook({'x-demo-signature':good},raw);
  assert.equal(settlement?.status,'paid');
  assert.equal(settlement?.externalRef,'ref-9');
  assert.equal(settlement?.amountMinor,5000,'a major-unit amount is converted to minor units');

  // An unlisted status is never treated as paid.
  const pendingRaw=Buffer.from(JSON.stringify({payment:{id:'ref-9',state:'authorized',total:50}}),'utf8');
  const pendingSig=crypto.createHmac('sha256','whsec').update(pendingRaw.toString('utf8'),'utf8').digest('base64');
  assert.equal(gateway.verifyWebhook({'x-demo-signature':pendingSig},pendingRaw)?.status,'pending');
});
