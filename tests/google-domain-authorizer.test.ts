import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {GoogleDomainAuthorizer,googleDomainAuthorizerFromEnv,isPlausibleHost,matchesReferrer,normalizeHost,referrerPattern} from '../server/google-domain-authorizer';

const KEY_RESOURCE='projects/p/locations/global/keys/k1';
const config={clientEmail:'sa@p.iam.gserviceaccount.com',privateKey:'',projectId:'p',apiKeyResource:KEY_RESOURCE};

/* حساب خدمة حقيقي مكلف في الاختبار: يُستبدل توقيعه بمنح رمز جاهز عبر fetch مزيّف. */
const stub=(handlers:{referrers?:string[];authDomains?:string[];fail?:string})=>{
 const calls:{url:string;method:string;body:any}[]=[];
 let referrers=handlers.referrers??[],authDomains=handlers.authDomains??[];
 const fetchImpl=(async(url:string,init:any={})=>{
  const method=init.method||'GET';
  calls.push({url:String(url),method,body:init.body?JSON.parse(String(init.body)):undefined});
  if(String(url).includes('oauth2'))return new Response(JSON.stringify({access_token:'t',expires_in:3600}),{status:200});
  if(handlers.fail&&String(url).includes(handlers.fail))return new Response('denied',{status:403});
  if(String(url).includes('apikeys')){
   if(method==='GET')return new Response(JSON.stringify({restrictions:{browserKeyRestrictions:{allowedReferrers:referrers}}}),{status:200});
   referrers=JSON.parse(String(init.body)).restrictions.browserKeyRestrictions.allowedReferrers;return new Response('{}',{status:200});
  }
  if(method==='GET')return new Response(JSON.stringify({authorizedDomains:authDomains}),{status:200});
  authDomains=JSON.parse(String(init.body)).authorizedDomains;return new Response('{}',{status:200});
 }) as any;
 return {fetchImpl,calls,state:()=>({referrers,authDomains})};
};
// التوقيع يحتاج مفتاحًا حقيقيًا، فيُتخطّى بحقن رمز جاهز.
const authorizer=(s:ReturnType<typeof stub>)=>{const a=new GoogleDomainAuthorizer(config,s.fetchImpl);(a as any).token={value:'t',expiresAt:Date.now()+3_600_000};return a};

test('a new tenant domain is appended, and the domains already there are never lost',async()=>{
 const s=stub({referrers:['https://dr-alfailakawi.com/*','https://*.dr-alfailakawi.com/*'],authDomains:['dr-alfailakawi.com']});
 const out=await authorizer(s).authorize('quran.jamiat-a.org');
 assert.equal(out.state,'AUTHORIZED');
 assert.deepEqual(s.state().referrers,['https://dr-alfailakawi.com/*','https://*.dr-alfailakawi.com/*','https://quran.jamiat-a.org/*'],
  'writing the list must extend it — replacing it would silently cut off every other organization');
 assert.deepEqual(s.state().authDomains,['dr-alfailakawi.com','quran.jamiat-a.org']);
});

test('several domains in one save all survive: one read, one write',async()=>{
 const s=stub({referrers:['https://base.example/*'],authDomains:['base.example']});
 const out=await authorizer(s).authorize(['a.example.org','b.example.org','c.example.org']);
 assert.equal(out.state,'AUTHORIZED');
 // القراءة والكتابة مرة واحدة: نطاق يقرأ ثم يكتب نسخته كان يمحو ما أضافه أخوه ويُبلَّغ بالنجاح.
 assert.deepEqual(s.state().referrers,['https://base.example/*','https://a.example.org/*','https://b.example.org/*','https://c.example.org/*'],
  'no host may be dropped by a sibling in the same save');
 assert.deepEqual(s.state().authDomains,['base.example','a.example.org','b.example.org','c.example.org']);
 assert.equal(s.calls.filter(c=>c.method==='PATCH').length,2,'one write per Google list, not one per host');
 assert.equal(s.calls.filter(c=>c.method==='GET').length,2,'and one read per list');
});

test('a duplicate host in the same save is written once',async()=>{
 const s=stub({referrers:[],authDomains:[]});
 await authorizer(s).authorize(['a.example.org','A.Example.org','https://a.example.org/path']);
 assert.deepEqual(s.state().referrers,['https://a.example.org/*']);
 assert.deepEqual(s.state().authDomains,['a.example.org']);
});

test('a domain already covered is not added twice',async()=>{
 // مطابقة حرفية
 const exact=stub({referrers:['https://quran.jamiat-a.org/*'],authDomains:['quran.jamiat-a.org']});
 const a=await authorizer(exact).authorize('quran.jamiat-a.org');
 assert.deepEqual(a,{state:'AUTHORIZED',hosts:['quran.jamiat-a.org'],referrersAdded:[],authDomainsAdded:[]});
 assert.equal(exact.calls.filter(c=>c.method==='PATCH').length,0,'nothing to change means nothing is written');

 // نمط عام يغطّي النطاق الفرعي أصلًا
 const wild=stub({referrers:['https://*.dr-alfailakawi.com/*'],authDomains:[]});
 const b=await authorizer(wild).authorize('mizan.dr-alfailakawi.com');
 assert.deepEqual((b as any).referrersAdded,[],'a wildcard already covering the host must not grow the list');
 assert.deepEqual((b as any).authDomainsAdded,['mizan.dr-alfailakawi.com'],'but the auth domain list has no wildcard, so it still needs the host');
});

test('the host is normalised before comparison so no duplicate slips in',()=>{
 assert.equal(normalizeHost(' HTTPS://Quran.Jamiat-A.org/path '),'quran.jamiat-a.org');
 assert.equal(normalizeHost('example.com.'),'example.com');
 assert.equal(referrerPattern('a.example.com'),'https://a.example.com/*');
});

test('a wildcard covers subdomains but never the bare domain',()=>{
 assert.equal(matchesReferrer('https://*.example.com/*','a.example.com'),true);
 assert.equal(matchesReferrer('https://*.example.com/*','deep.a.example.com'),true);
 assert.equal(matchesReferrer('https://*.example.com/*','example.com'),false,'Google does not treat the bare domain as covered');
 assert.equal(matchesReferrer('https://*.example.com/*','notexample.com'),false);
 assert.equal(matchesReferrer('https://example.com/*','example.com'),true);
 assert.equal(matchesReferrer('','example.com'),false);
});

test('a rejected host never reaches Google, and a Google failure is reported as failure',async()=>{
 const s=stub({});
 for(const bad of ['','not a host','javascript:alert(1)','localhost'])
   assert.equal((await authorizer(s).authorize(bad)).state,'FAILED',`${bad} must be refused`);
 assert.equal(s.calls.length,0,'a malformed host must not be sent at all');

 // فشل القائمة الثانية بعد نجاح الأولى فشلٌ يُبلَّغ: النظام يعمل والدخول المنبثق لا.
 const half=stub({referrers:[],authDomains:[],fail:'identitytoolkit'});
 const out=await authorizer(half).authorize('quran.jamiat-a.org');
 assert.equal(out.state,'FAILED');
 assert.match((out as any).reason,/GOOGLE_HTTP_403/);
});

test('without configuration nothing is built, so linking stays manual instead of breaking',()=>{
 assert.equal(googleDomainAuthorizerFromEnv({} as any),null);
 assert.equal(googleDomainAuthorizerFromEnv({MIZAN_FIREBASE_API_KEY_RESOURCE:KEY_RESOURCE} as any),null);
 assert.equal(googleDomainAuthorizerFromEnv({MIZAN_GOOGLE_SERVICE_ACCOUNT_JSON:'not json',MIZAN_FIREBASE_API_KEY_RESOURCE:KEY_RESOURCE} as any),null);
 assert.equal(googleDomainAuthorizerFromEnv({MIZAN_GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'a@b.c'}),MIZAN_FIREBASE_API_KEY_RESOURCE:KEY_RESOURCE} as any),null,'a key without a private key is not usable');
 assert.ok(googleDomainAuthorizerFromEnv({MIZAN_GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'a@b.c',private_key:'k',project_id:'p'}),MIZAN_FIREBASE_API_KEY_RESOURCE:KEY_RESOURCE} as any));
});

test('a hostile host cannot make normalisation crawl',()=>{
 /* المدخل يصل من جسم الطلب قبل أي تحقق. نمطٌ غير مثبَّت البداية يجرّب كل موضع، فنصٌّ من
    مئات الآلاف من الشرطات كان يجعل الكلفة تربيعية ويعلّق الخادم. */
 for(const hostile of ['/'.repeat(200_000),'https://'+'/'.repeat(200_000),'a'.repeat(500_000),'.'.repeat(200_000)]){
  const started=Date.now();
  const out=normalizeHost(hostile);
  const elapsed=Date.now()-started;
  assert.ok(elapsed<250,`normalisation took ${elapsed}ms — it must stay linear`);
  assert.ok(out.length<=253,'anything longer than a DNS name is not a host');
  assert.equal(isPlausibleHost(out),false,'and none of these is a usable host');
 }
 const started=Date.now();
 matchesReferrer('https://'+'/'.repeat(200_000),'example.com');
 assert.ok(Date.now()-started<250,'matching a hostile pattern must stay linear too');
});

test('host validation accepts real domains and refuses what is not one',()=>{
 for(const good of ['example.com','quran.jamiat-a.org','a.b.c.example.co','mizan.dr-alfailakawi.com'])
   assert.equal(isPlausibleHost(good),true,`${good} is a real host`);
 for(const bad of ['','localhost','example','.example.com','example..com','-example.com','example-.com','example.c','example.c0m','exa mple.com','example.com:8080','a'.repeat(254)])
   assert.equal(isPlausibleHost(bad),false,`${bad} must be refused`);
 // مقطع أطول من ٦٣ محرفًا مرفوض ولو كان النطاق كله ضمن الحد.
 assert.equal(isPlausibleHost(`${'a'.repeat(64)}.com`),false);
 assert.equal(isPlausibleHost(`${'a'.repeat(63)}.com`),true);
});

test('the authorization status is actually returned to the caller, not dropped',()=>{
 const src=fs.readFileSync(path.join(process.cwd(),'server.ts'),'utf8');
 /* tenantResult كان يُسلسل {tenant} وحده، فحالة الإبلاغ تُرمى بصمت ويرى المالك نجاحًا
    بينما النطاق غير مُبلَّغ ونظام الجهة معطّل — أي أن الميزة كلها كانت بلا أثر. */
 assert.match(src,/return res\.json\(\{tenant:outcome\.tenant,\.\.\.\(extra\|\|\{\}\)\}\)/,
  'the extra payload must be serialized with the tenant');
 assert.match(src,/tenantResult\(res,outcome,\{domainAuthorization\}\)/,
  'the domain authorization status must be handed to tenantResult');
 // ولا يُنادى المُبلِّغ لكل نطاق على حدة: نداء واحد بكل النطاقات.
 assert.match(src,/googleDomainAuthorizer\.authorize\(hosts\)/);
 assert.doesNotMatch(src,/Promise\.all\(hosts\.map/,'per-host concurrency is what let one host erase another');
});

test('the preflight reads the tenant file shape the store actually writes',()=>{
 const store=fs.readFileSync(path.join(process.cwd(),'server/tenant-store.ts'),'utf8');
 assert.match(store,/JSON\.stringify\(\{ tenants: rows \}/,'the store writes a wrapper, not a bare array');
 const preflight=fs.readFileSync(path.join(process.cwd(),'scripts/go-live-preflight.mjs'),'utf8');
 assert.match(preflight,/Array\.isArray\(parsed\?\.tenants\)/,'so the preflight must unwrap it or its warning never fires');
});
