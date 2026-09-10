import test from 'node:test';
import assert from 'node:assert/strict';
import {GoogleDomainAuthorizer,googleDomainAuthorizerFromEnv,matchesReferrer,normalizeHost,referrerPattern} from '../server/google-domain-authorizer';

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

test('a domain already covered is not added twice',async()=>{
 // مطابقة حرفية
 const exact=stub({referrers:['https://quran.jamiat-a.org/*'],authDomains:['quran.jamiat-a.org']});
 const a=await authorizer(exact).authorize('quran.jamiat-a.org');
 assert.deepEqual(a,{state:'AUTHORIZED',referrerAdded:false,authDomainAdded:false,host:'quran.jamiat-a.org'});
 assert.equal(exact.calls.filter(c=>c.method==='PATCH').length,0,'nothing to change means nothing is written');

 // نمط عام يغطّي النطاق الفرعي أصلًا
 const wild=stub({referrers:['https://*.dr-alfailakawi.com/*'],authDomains:[]});
 const b=await authorizer(wild).authorize('mizan.dr-alfailakawi.com');
 assert.equal((b as any).referrerAdded,false,'a wildcard already covering the host must not grow the list');
 assert.equal((b as any).authDomainAdded,true,'but the auth domain list has no wildcard, so it still needs the host');
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
