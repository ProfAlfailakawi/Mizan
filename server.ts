import express, { type RequestHandler } from 'express';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

const b64=(x:string|Uint8Array)=>Buffer.from(x).toString('base64url');
const fromB64=(x:string)=>Buffer.from(x,'base64url').toString('utf8');
const safeEqual=(a:string,b:string)=>{const x=Buffer.from(a);const y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const signToken=(payload:Record<string,unknown>,secret:string)=>{const body=b64(JSON.stringify(payload));const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');return `${body}.${sig}`};
const verifyToken=(token:string,secret:string)=>{const [body,sig]=token.split('.');if(!body||!sig)return null;const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');if(!safeEqual(sig,expected))return null;try{return JSON.parse(fromB64(body)) as Record<string,unknown>}catch{return null}};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';
  app.disable('x-powered-by'); app.set('trust proxy', 1);
  app.use((req,res,next)=>{
    const requestId=String(req.headers['x-request-id']||crypto.randomUUID()); res.setHeader('x-request-id',requestId);
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy','camera=(self), geolocation=(), microphone=(self)'); res.setHeader('Cross-Origin-Opener-Policy','same-origin');
    if(isProd) res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
    if(isProd) res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  app.use(express.json({ limit: '1mb' }));

  const buckets=new Map<string,{count:number;resetAt:number}>();
  app.use('/api',(req,res,next)=>{const key=String(req.ip||'unknown');const now=Date.now();const current=buckets.get(key);if(!current||current.resetAt<now){buckets.set(key,{count:1,resetAt:now+60_000});return next()}current.count++;if(current.count>180)return res.status(429).json({code:'RATE_LIMITED'});next()});

  const requireEnterpriseKey:RequestHandler=(req,res,next)=>{const configured=process.env.MIZAN_ENTERPRISE_API_KEY;if(!configured)return res.status(503).json({code:'ENTERPRISE_API_NOT_CONFIGURED'});const supplied=String(req.headers['x-mizan-api-key']||'');if(!safeEqual(supplied,configured))return res.status(401).json({code:'UNAUTHORIZED'});next()};

  app.get('/api/health',(_req,res)=>res.json({status:'ok',system:'MIZAN',version:'5.0.0',aiCriticalPath:false,quranSourcePolicy:'approved-vault-only',enterpriseApiConfigured:!!process.env.MIZAN_ENTERPRISE_API_KEY,passSigningConfigured:!!process.env.MIZAN_PASS_SIGNING_SECRET,certificateSigningConfigured:!!process.env.MIZAN_CERT_SIGNING_SECRET,time:new Date().toISOString()}));
  app.get('/api/capabilities',(_req,res)=>res.json({judging:{humanAuthority:true,aiCanAffectScore:false},quran:{sourceOfTruth:'approved-vault-only'},deployment:['cloud','private-cloud','sovereign-on-premise'],externalDependencies:{identity:!!process.env.FIREBASE_PROJECT_ID,enterpriseApi:!!process.env.MIZAN_ENTERPRISE_API_KEY,copilot:!!process.env.MIZAN_COPILOT_URL,integrityAI:!!process.env.MIZAN_AI_INTEGRITY_URL}}));

  // Opaque signed participant passes. Issue is server-to-server; verification can be public/minimal.
  app.post('/api/enterprise/passes/issue',requireEnterpriseKey,(req,res)=>{const secret=process.env.MIZAN_PASS_SIGNING_SECRET;if(!secret)return res.status(503).json({code:'PASS_SIGNING_NOT_CONFIGURED'});const {participantId,competitionId,organizationId,expiresAt}=req.body||{};if(!participantId||!competitionId||!organizationId)return res.status(400).json({code:'INVALID_PASS_REQUEST'});const exp=expiresAt?new Date(expiresAt).getTime():Date.now()+7*24*3600_000;const token=signToken({v:1,typ:'participant_pass',participantId,competitionId,organizationId,exp,nonce:crypto.randomUUID()},secret);res.json({token,expiresAt:new Date(exp).toISOString()})});
  app.get('/api/passes/verify/:token',(req,res)=>{const secret=process.env.MIZAN_PASS_SIGNING_SECRET;if(!secret)return res.status(503).json({code:'PASS_SIGNING_NOT_CONFIGURED'});const data=verifyToken(req.params.token,secret);if(!data||data.typ!=='participant_pass'||Number(data.exp||0)<Date.now())return res.status(404).json({valid:false});res.json({valid:true,competitionId:data.competitionId,organizationId:data.organizationId,participantId:data.participantId})});

  // Certificate signing/verification exposes only the fields intentionally signed by the issuer.
  app.post('/api/enterprise/certificates/sign',requireEnterpriseKey,(req,res)=>{const secret=process.env.MIZAN_CERT_SIGNING_SECRET;if(!secret)return res.status(503).json({code:'CERT_SIGNING_NOT_CONFIGURED'});const {certificateNumber,participantDisplayName,competitionDisplayName,issuedAt,status='valid'}=req.body||{};if(!certificateNumber||!participantDisplayName||!competitionDisplayName)return res.status(400).json({code:'INVALID_CERTIFICATE'});const token=signToken({v:1,typ:'certificate',certificateNumber,participantDisplayName,competitionDisplayName,issuedAt:issuedAt||new Date().toISOString(),status},secret);res.json({token})});
  app.get('/api/certificates/verify/:token',(req,res)=>{const secret=process.env.MIZAN_CERT_SIGNING_SECRET;if(!secret)return res.status(503).json({code:'CERTIFICATE_REPOSITORY_NOT_CONNECTED'});const data=verifyToken(req.params.token,secret);if(!data||data.typ!=='certificate')return res.status(404).json({valid:false});res.json({valid:data.status==='valid',certificateNumber:data.certificateNumber,participantDisplayName:data.participantDisplayName,competitionDisplayName:data.competitionDisplayName,issuedAt:data.issuedAt,status:data.status})});

  // Server-side AI adapters. They never receive authorization to mutate results.
  app.post('/api/copilot/query',async(req,res)=>{const endpoint=process.env.MIZAN_COPILOT_URL;const token=process.env.MIZAN_COPILOT_TOKEN;if(!endpoint)return res.status(503).json({code:'COPILOT_PROVIDER_NOT_CONNECTED'});try{const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({question:String(req.body?.question||'').slice(0,1000),context:req.body?.context||{}})});const body=await r.text();res.status(r.status).type(r.headers.get('content-type')||'application/json').send(body)}catch{return res.status(502).json({code:'COPILOT_UPSTREAM_UNAVAILABLE'})}});
  app.post('/api/ai/integrity/analyze',async(req,res)=>{const endpoint=process.env.MIZAN_AI_INTEGRITY_URL;const token=process.env.MIZAN_AI_INTEGRITY_TOKEN;if(!endpoint)return res.status(503).json({code:'AI_INTEGRITY_PROVIDER_NOT_CONNECTED'});try{const payload={sessionId:String(req.body?.sessionId||''),audioRef:String(req.body?.audioRef||''),expectedQuestionIds:Array.isArray(req.body?.expectedQuestionIds)?req.body.expectedQuestionIds.slice(0,20):[],riwaya:String(req.body?.riwaya||'')};const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(payload)});const body=await r.text();res.status(r.status).type(r.headers.get('content-type')||'application/json').send(body)}catch{return res.status(502).json({code:'AI_INTEGRITY_UPSTREAM_UNAVAILABLE'})}});

  const providerUrl=(channel:string)=>process.env[`MIZAN_${channel.toUpperCase()}_PROVIDER_URL`];
  const providerToken=(channel:string)=>process.env[`MIZAN_${channel.toUpperCase()}_PROVIDER_TOKEN`];
  app.post('/api/enterprise/notifications/dispatch',requireEnterpriseKey,async(req,res)=>{const channel=String(req.body?.channel||'');if(!['email','sms','whatsapp','push'].includes(channel))return res.status(400).json({code:'UNSUPPORTED_CHANNEL'});const endpoint=providerUrl(channel);if(!endpoint)return res.status(503).json({code:'PROVIDER_NOT_CONNECTED',channel});try{const token=providerToken(channel);const upstream=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({recipient:req.body?.recipient,templateKey:req.body?.templateKey,locale:req.body?.locale,payload:req.body?.payload||{},idempotencyKey:req.body?.idempotencyKey})});if(!upstream.ok)return res.status(502).json({code:'PROVIDER_REJECTED',channel,status:upstream.status});res.status(202).json({accepted:true,channel})}catch{return res.status(502).json({code:'PROVIDER_UNAVAILABLE',channel})}});

  app.post('/api/enterprise/webhooks/test',requireEnterpriseKey,async(req,res)=>{const endpoint=String(req.body?.endpoint||'');if(!/^https:\/\//i.test(endpoint))return res.status(400).json({code:'HTTPS_ENDPOINT_REQUIRED'});const allow=(process.env.MIZAN_WEBHOOK_ALLOW_HOSTS||'').split(',').map(x=>x.trim()).filter(Boolean);let url:URL;try{url=new URL(endpoint)}catch{return res.status(400).json({code:'INVALID_ENDPOINT'})}if(!allow.includes(url.hostname))return res.status(403).json({code:'WEBHOOK_HOST_NOT_ALLOWLISTED'});const secret=process.env.MIZAN_WEBHOOK_SIGNING_SECRET;if(!secret)return res.status(503).json({code:'WEBHOOK_SIGNING_NOT_CONFIGURED'});const event={id:crypto.randomUUID(),type:'mizan.test',createdAt:new Date().toISOString()};const raw=JSON.stringify(event);const signature=crypto.createHmac('sha256',secret).update(raw).digest('hex');try{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-mizan-signature':signature},body:raw});res.status(r.ok?202:502).json({accepted:r.ok,status:r.status})}catch{return res.status(502).json({code:'WEBHOOK_UNAVAILABLE'})}});

  if(!isProd){const vite=await createViteServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares)}else{const distPath=path.join(process.cwd(),'dist');app.use(express.static(distPath,{maxAge:'1h',etag:true,immutable:false}));app.get('*',(_req,res)=>res.sendFile(path.join(distPath,'index.html')))}
  app.listen(PORT,'0.0.0.0',()=>console.log(`MIZAN running on :${PORT}`));
}
startServer().catch(err=>{console.error(err);process.exit(1)});
