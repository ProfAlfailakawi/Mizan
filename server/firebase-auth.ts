import crypto from 'crypto';

export interface FirebaseVerifiedIdentity { uid:string; email?:string; role:string; organizationId:string; competitionId?:string; raw:Record<string,unknown>; }
type JwtHeader={alg?:string;kid?:string;typ?:string};
type JwtPayload=Record<string,unknown>&{aud?:string;iss?:string;sub?:string;exp?:number;iat?:number;email?:string;role?:string;org_id?:string;competition_id?:string};

const decodeJson=<T>(part:string):T=>JSON.parse(Buffer.from(part,'base64url').toString('utf8')) as T;
export function validateFirebaseClaims(payload:JwtPayload,projectId:string,nowSeconds=Math.floor(Date.now()/1000)):FirebaseVerifiedIdentity{
  if(!projectId)throw new Error('FIREBASE_PROJECT_ID_REQUIRED');
  if(payload.aud!==projectId)throw new Error('FIREBASE_AUDIENCE_MISMATCH');
  if(payload.iss!==`https://securetoken.google.com/${projectId}`)throw new Error('FIREBASE_ISSUER_MISMATCH');
  if(!payload.sub||typeof payload.sub!=='string'||payload.sub.length>128)throw new Error('FIREBASE_SUBJECT_INVALID');
  if(!payload.exp||payload.exp<=nowSeconds)throw new Error('FIREBASE_TOKEN_EXPIRED');
  if(!payload.iat||payload.iat>nowSeconds+60)throw new Error('FIREBASE_TOKEN_IAT_INVALID');
  const role=String(payload.role||''),organizationId=String(payload.org_id||'');
  if(!role||!organizationId)throw new Error('FIREBASE_MIZAN_CLAIMS_REQUIRED');
  return {uid:payload.sub,email:typeof payload.email==='string'?payload.email:undefined,role,organizationId,competitionId:payload.competition_id?String(payload.competition_id):undefined,raw:payload};
}

let certCache:{expiresAt:number;certs:Record<string,string>}|null=null;
async function googleCerts(){
  if(certCache&&certCache.expiresAt>Date.now()+30_000)return certCache.certs;
  const response=await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',{headers:{accept:'application/json'}});
  if(!response.ok)throw new Error('FIREBASE_CERTS_UNAVAILABLE');
  const certs=await response.json() as Record<string,string>;const cacheControl=response.headers.get('cache-control')||'';const m=cacheControl.match(/max-age=(\d+)/i);const ttl=Math.max(60,Number(m?.[1]||300))*1000;certCache={certs,expiresAt:Date.now()+ttl};return certs;
}

export async function verifyFirebaseIdToken(token:string,projectId:string){
  const [head,body,sig,...rest]=String(token||'').split('.');if(!head||!body||!sig||rest.length)throw new Error('FIREBASE_TOKEN_MALFORMED');
  const header=decodeJson<JwtHeader>(head);if(header.alg!=='RS256'||!header.kid)throw new Error('FIREBASE_TOKEN_ALGORITHM_INVALID');
  const payload=decodeJson<JwtPayload>(body);const identity=validateFirebaseClaims(payload,projectId);
  const certs=await googleCerts();const cert=certs[header.kid];if(!cert)throw new Error('FIREBASE_SIGNING_KEY_UNKNOWN');
  const valid=crypto.verify('RSA-SHA256',Buffer.from(`${head}.${body}`),cert,Buffer.from(sig,'base64url'));if(!valid)throw new Error('FIREBASE_SIGNATURE_INVALID');return identity;
}
