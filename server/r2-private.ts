import crypto from 'node:crypto';

export interface R2PrivateConfig {
  endpoint:string;
  bucket:string;
  accessKeyId:string;
  secretAccessKey:string;
  region?:string;
}

export interface R2ObjectInfo { key:string; size:number; etag?:string; lastModified?:string }
export interface R2ListResult { objects:R2ObjectInfo[]; nextContinuationToken?:string }

const EMPTY_SHA256='e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const enc=(v:string)=>encodeURIComponent(v).replace(/[!'()*]/g,c=>`%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const sha256=(value:string|Uint8Array)=>crypto.createHash('sha256').update(value).digest('hex');
const hmac=(key:crypto.BinaryLike,value:string)=>crypto.createHmac('sha256',key).update(value).digest();
const xmlDecode=(v:string)=>v.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');

export function sanitizeR2Config(input:Partial<R2PrivateConfig>){
  return {
    configured:!!(input.endpoint&&input.bucket&&input.accessKeyId&&input.secretAccessKey),
    bucketConfigured:!!input.bucket,
    endpointConfigured:!!input.endpoint,
    credentialsConfigured:!!(input.accessKeyId&&input.secretAccessKey),
    region:input.region||'auto'
  };
}

export function r2ConfigFromEnv(env:NodeJS.ProcessEnv=process.env):R2PrivateConfig|null{
  const endpoint=String(env.R2_ENDPOINT||'').trim();
  const bucket=String(env.R2_BUCKET||'').trim();
  const accessKeyId=String(env.R2_ACCESS_KEY_ID||'').trim();
  const secretAccessKey=String(env.R2_SECRET_ACCESS_KEY||'').trim();
  if(!endpoint||!bucket||!accessKeyId||!secretAccessKey)return null;
  return {endpoint,bucket,accessKeyId,secretAccessKey,region:String(env.R2_REGION||'auto').trim()||'auto'};
}

export class R2RequestError extends Error {
  readonly status:number;readonly operation:string;
  constructor(status:number,operation:string){super(`R2_${operation}_FAILED:${status}`);this.name='R2RequestError';this.status=status;this.operation=operation}
}

export class R2PrivateClient {
  readonly endpoint:URL;
  readonly bucket:string;
  readonly region:string;
  private readonly accessKeyId:string;
  private readonly secretAccessKey:string;

  constructor(config:R2PrivateConfig){
    const endpoint=new URL(config.endpoint);
    if(endpoint.protocol!=='https:')throw new Error('R2_ENDPOINT_HTTPS_REQUIRED');
    if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new Error('R2_ENDPOINT_INVALID');
    if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,126}[a-zA-Z0-9]$/.test(config.bucket))throw new Error('R2_BUCKET_INVALID');
    if(!config.accessKeyId||!config.secretAccessKey)throw new Error('R2_CREDENTIALS_REQUIRED');
    endpoint.pathname=endpoint.pathname.replace(/\/+$/,'');
    this.endpoint=endpoint;this.bucket=config.bucket;this.region=config.region||'auto';this.accessKeyId=config.accessKeyId;this.secretAccessKey=config.secretAccessKey;
  }

  private canonicalPath(key=''){
    const base=this.endpoint.pathname.replace(/\/+$/,'');
    const suffix=[this.bucket,...key.split('/').filter(Boolean)].map(enc).join('/');
    return `${base}/${suffix}`.replace(/\/+/g,'/');
  }

  private canonicalQuery(query:Record<string,string|number|undefined>={}){
    return Object.entries(query).filter(([,v])=>v!==undefined).map(([k,v])=>[enc(k),enc(String(v))] as const).sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1])).map(([k,v])=>`${k}=${v}`).join('&');
  }

  private async request(method:string,key='',options:{query?:Record<string,string|number|undefined>;body?:string|Uint8Array;headers?:Record<string,string>}={}){
    const now=new Date();
    const amzDate=now.toISOString().replace(/[:-]|\.\d{3}/g,'');
    const dateStamp=amzDate.slice(0,8);
    const body=options.body===undefined?undefined:typeof options.body==='string'?Buffer.from(options.body):Buffer.from(options.body);
    const payloadHash=body?sha256(body):EMPTY_SHA256;
    const canonicalUri=this.canonicalPath(key);
    const canonicalQuery=this.canonicalQuery(options.query);
    const host=this.endpoint.host;
    const requestHeaders:Record<string,string>={...options.headers,'x-amz-date':amzDate,'x-amz-content-sha256':payloadHash};
    const signingHeaders:Record<string,string>={...requestHeaders,host};
    const signable=Object.entries(signingHeaders).filter(([name])=>name==='host'||name.toLowerCase().startsWith('x-amz-')).map(([name,value])=>[name.toLowerCase(),String(value).trim().replace(/\s+/g,' ')] as const).sort((a,b)=>a[0].localeCompare(b[0]));
    const canonicalHeaders=signable.map(([name,value])=>`${name}:${value}\n`).join('');
    const signedHeaders=signable.map(([name])=>name).join(';');
    const canonicalRequest=[method.toUpperCase(),canonicalUri,canonicalQuery,canonicalHeaders,signedHeaders,payloadHash].join('\n');
    const scope=`${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign=['AWS4-HMAC-SHA256',amzDate,scope,sha256(canonicalRequest)].join('\n');
    const kDate=hmac(Buffer.from(`AWS4${this.secretAccessKey}`,'utf8'),dateStamp);
    const kRegion=hmac(kDate,this.region);const kService=hmac(kRegion,'s3');const kSigning=hmac(kService,'aws4_request');
    const signature=crypto.createHmac('sha256',kSigning).update(stringToSign).digest('hex');
    const authorization=`AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    const url=new URL(this.endpoint.toString());url.pathname=canonicalUri;url.search=canonicalQuery;
    const headers:Record<string,string>={...requestHeaders,Authorization:authorization};
    return fetch(url,{method,headers,body,redirect:'error'});
  }

  async getObject(key:string,options:{range?:string}={}){
    const r=await this.request('GET',key,{headers:options.range?{Range:options.range}:{}});
    if(r.status===404)return null;
    if(!r.ok)throw new R2RequestError(r.status,'GET');
    return r;
  }

  async headObject(key:string){
    const r=await this.request('HEAD',key);
    if(r.status===404)return null;
    if(!r.ok)throw new R2RequestError(r.status,'HEAD');
    return {size:Number(r.headers.get('content-length')||0),etag:r.headers.get('etag')||undefined,contentType:r.headers.get('content-type')||undefined,sha256:r.headers.get('x-amz-meta-sha256')||undefined};
  }

  async putObject(key:string,body:string|Uint8Array,contentType='application/octet-stream',metadata:{sha256?:string}={}){
    const headers:Record<string,string>={'content-type':contentType};if(metadata.sha256)headers['x-amz-meta-sha256']=metadata.sha256;
    const r=await this.request('PUT',key,{body,headers});
    if(!r.ok)throw new R2RequestError(r.status,'PUT');
    return {etag:r.headers.get('etag')||undefined};
  }

  async listObjects(prefix='',continuationToken?:string,maxKeys=1000):Promise<R2ListResult>{
    const r=await this.request('GET','',{query:{'list-type':'2',prefix,'max-keys':Math.max(1,Math.min(1000,maxKeys)),'continuation-token':continuationToken}});
    if(!r.ok)throw new R2RequestError(r.status,'LIST');
    const text=await r.text();const objects:R2ObjectInfo[]=[];
    for(const m of text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){
      const block=m[1];const key=block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1];if(!key)continue;
      const size=Number(block.match(/<Size>(\d+)<\/Size>/)?.[1]||0);
      const etag=block.match(/<ETag>"?([^<"]+)"?<\/ETag>/)?.[1];
      const lastModified=block.match(/<LastModified>([^<]+)<\/LastModified>/)?.[1];
      objects.push({key:xmlDecode(key),size,etag,lastModified});
    }
    const next=/<IsTruncated>true<\/IsTruncated>/.test(text)?text.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1]:undefined;
    return {objects,nextContinuationToken:next?xmlDecode(next):undefined};
  }

  async listAllObjects(prefix=''){
    const out:R2ObjectInfo[]=[];let token:string|undefined;
    do{const page=await this.listObjects(prefix,token);out.push(...page.objects);token=page.nextContinuationToken}while(token);
    return out;
  }

  async health(){
    const key='delivery/_mizan/catalog.json';
    try{
      await this.listObjects('delivery/',undefined,1);
      const r=await this.getObject(key);if(!r)return {state:'UNAVAILABLE' as const,reason:'DELIVERY_CATALOG_MISSING'};
      const body=await r.json() as {schemaVersion?:string;state?:string};
      return body?.schemaVersion==='MIZAN-R2-CATALOG-1'&&body?.state==='READY'
        ?{state:'READY' as const}
        :{state:'UNAVAILABLE' as const,reason:'DELIVERY_CATALOG_NOT_READY'};
    }catch{return {state:'UNAVAILABLE' as const,reason:'R2_READ_FAILED'}}
  }
}
