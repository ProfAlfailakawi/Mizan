import crypto from 'crypto';
import fs from 'fs';

type ServiceAccount={client_email:string;private_key:string;token_uri?:string;project_id?:string};
type CachedToken={value:string;expiresAt:number};
let cached:CachedToken|null=null;

const b64=(value:Buffer|string)=>Buffer.from(value).toString('base64url');
const serviceAccountFromEnvironment=():ServiceAccount|null=>{
  const inline=process.env.GOOGLE_SERVICE_ACCOUNT_JSON||process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(inline){try{const parsed=JSON.parse(inline) as ServiceAccount;if(parsed.client_email&&parsed.private_key)return parsed;}catch{/* fall through */}}
  const file=process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if(file&&fs.existsSync(file)){try{const parsed=JSON.parse(fs.readFileSync(file,'utf8')) as ServiceAccount;if(parsed.client_email&&parsed.private_key)return parsed;}catch{/* fall through */}}
  return null;
};

async function tokenFromServiceAccount(sa:ServiceAccount){
  const now=Math.floor(Date.now()/1000);const tokenUri=sa.token_uri||'https://oauth2.googleapis.com/token';
  const header=b64(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload=b64(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/cloud-platform',aud:tokenUri,iat:now,exp:now+3600}));
  const unsigned=`${header}.${payload}`;const signature=crypto.sign('RSA-SHA256',Buffer.from(unsigned),sa.private_key).toString('base64url');
  const r=await fetch(tokenUri,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${signature}`})});
  const body=await r.json().catch(()=>({})) as {access_token?:string;expires_in?:number};if(!r.ok||!body.access_token)throw new Error('GOOGLE_OAUTH_TOKEN_FAILED');
  cached={value:body.access_token,expiresAt:Date.now()+Math.max(60,Number(body.expires_in||3600)-120)*1000};return cached.value;
}

async function tokenFromMetadata(){
  const r=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(1800)});
  const body=await r.json().catch(()=>({})) as {access_token?:string;expires_in?:number};if(!r.ok||!body.access_token)throw new Error('GOOGLE_METADATA_TOKEN_FAILED');
  cached={value:body.access_token,expiresAt:Date.now()+Math.max(60,Number(body.expires_in||3600)-120)*1000};return cached.value;
}

export async function googleAccessToken(){
  const explicit=process.env.GOOGLE_OAUTH_ACCESS_TOKEN;if(explicit)return explicit;
  if(cached&&cached.expiresAt>Date.now())return cached.value;
  const sa=serviceAccountFromEnvironment();if(sa)return tokenFromServiceAccount(sa);
  try{return await tokenFromMetadata()}catch{throw new Error('GOOGLE_OAUTH_CREDENTIALS_UNAVAILABLE')}
}

/**
 * Generates, but does not send, a Firebase / Identity Platform password-reset action code.
 * The privileged OAuth form with returnOobLink=true is intentional: MIZAN hands the link
 * to the responsible administrator instead of emailing the user from Firebase.
 */
export async function generateIdentityPlatformPasswordReset(projectId:string,email:string,userIp?:string){
  if(!projectId||!email)throw new Error('PASSWORD_RESET_LINK_UNAVAILABLE');
  const accessToken=await googleAccessToken();
  const payload:Record<string,unknown>={requestType:'PASSWORD_RESET',email,returnOobLink:true,targetProjectId:projectId};
  if(userIp)payload.userIp=userIp;
  const r=await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:sendOobCode`,{method:'POST',headers:{authorization:`Bearer ${accessToken}`,'content-type':'application/json'},body:JSON.stringify(payload)});
  const body=await r.json().catch(()=>({})) as {oobCode?:string;oobLink?:string;error?:{message?:string}};
  if(!r.ok)throw new Error('PASSWORD_RESET_LINK_UNAVAILABLE');
  let oobCode=String(body.oobCode||'');
  if(!oobCode&&body.oobLink){try{oobCode=new URL(body.oobLink).searchParams.get('oobCode')||''}catch{/* invalid upstream link */}}
  if(!oobCode)throw new Error('PASSWORD_RESET_LINK_UNAVAILABLE');
  return {oobCode,upstreamOobLink:body.oobLink||''};
}
