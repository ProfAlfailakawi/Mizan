import {googleAccessToken} from './google-oauth';

type FirestoreValue={nullValue?:null;booleanValue?:boolean;integerValue?:string;doubleValue?:number;stringValue?:string;arrayValue?:{values?:FirestoreValue[]};mapValue?:{fields?:Record<string,FirestoreValue>}};
type FirestoreDocument={name:string;fields?:Record<string,FirestoreValue>};

const encodeValue=(value:unknown):FirestoreValue=>{
  if(value===null||value===undefined)return {nullValue:null};
  if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(typeof value==='string')return {stringValue:value};
  if(Array.isArray(value))return {arrayValue:{values:value.map(encodeValue)}};
  if(typeof value==='object')return {mapValue:{fields:encodeFields(value as Record<string,unknown>)}};
  return {stringValue:String(value)};
};
const encodeFields=(value:Record<string,unknown>)=>Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encodeValue(v)]));
const decodeValue=(value:FirestoreValue):unknown=>{
  if('nullValue' in value)return null;
  if('booleanValue' in value)return value.booleanValue;
  if('integerValue' in value)return Number(value.integerValue);
  if('doubleValue' in value)return value.doubleValue;
  if('stringValue' in value)return value.stringValue;
  if('arrayValue' in value)return (value.arrayValue?.values||[]).map(decodeValue);
  if('mapValue' in value)return decodeFields(value.mapValue?.fields||{});
  return null;
};
const decodeFields=(fields:Record<string,FirestoreValue>)=>Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,decodeValue(v)]));

/*
 * قاعدة العنوان: السحابة، أو المحاكي حين يُعلَن.
 *
 * `FIRESTORE_EMULATOR_HOST` اصطلاحٌ تتبعه حزم Google الرسمية كلها. واتّباعه هنا يفتح بابين:
 * أن يعمل المطوّر بلا اعتماد سحابي، وأن يُختبر هذا المُهايئ نفسه — ترميزُ الحقول، وذرّيةُ
 * الكتابة، وترجمةُ رموز الخطأ — على خادمٍ حقيقي بدل أن يبقى الجزء الوحيد الذي لا يمسّه فحص.
 *
 * ولا يُفتح الباب إلا بإعلان صريح: غياب المتغيّر يعني السحابة، فلا يُهبَط إلى محاكٍ صدفةً.
 */
export function firestoreRestRoot(projectId:string,databaseId:string,emulatorHost=process.env.FIRESTORE_EMULATOR_HOST){
  const base=emulatorHost?`http://${emulatorHost}/v1`:'https://firestore.googleapis.com/v1';
  return `${base}/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
}

export class FirestoreRestRepository{
  private readonly root:string;
  constructor(private readonly projectId:string,private readonly databaseId=process.env.FIRESTORE_DATABASE_ID||'(default)',private readonly tokenProvider=googleAccessToken){
    if(!projectId)throw new Error('FIRESTORE_NOT_CONFIGURED');
    this.root=firestoreRestRoot(projectId,databaseId);
  }
  private name(path:string){const clean=path.split('/').filter(Boolean).map(encodeURIComponent).join('/');return `projects/${this.projectId}/databases/${this.databaseId}/documents/${clean}`}
  private url(path:string){return `${this.root}/${path.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`}
  async get(path:string):Promise<Record<string,unknown>|null>{
    const token=await this.tokenProvider();const response=await fetch(this.url(path),{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
    if(response.status===404)return null;
    if(!response.ok)throw new Error(response.status===401||response.status===403?'FIRESTORE_PERMISSION_DENIED':'FIRESTORE_UNAVAILABLE');
    const document=await response.json() as FirestoreDocument;return decodeFields(document.fields||{});
  }
  async createAtomically(documents:{path:string;data:Record<string,unknown>}[]){
    const token=await this.tokenProvider();const writes=documents.map(document=>({update:{name:this.name(document.path),fields:encodeFields(document.data)},currentDocument:{exists:false}}));
    const response=await fetch(`${this.root}:commit`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({writes}),signal:AbortSignal.timeout(12000)});
    if(!response.ok){const code=response.status===409?'FIRESTORE_CONFLICT':response.status===401||response.status===403?'FIRESTORE_PERMISSION_DENIED':'FIRESTORE_UNAVAILABLE';throw new Error(code)}
  }

  /*
   * Server-authoritative cleanup helpers.
   *
   * Competition deletion cannot be a browser-only delete: Firestore rules intentionally do not
   * let an organization administrator erase an arbitrary competition tree, and a root document
   * deletion does not recursively remove subcollections. These helpers are therefore used only by
   * the authenticated server route that first proves the competition has no participants.
   */
  async listDocumentPaths(collectionPath:string,limit?:number):Promise<string[]>{
    const token=await this.tokenProvider();const out:string[]=[];let pageToken='';
    do{
      const remaining=limit===undefined?1000:Math.max(1,Math.min(1000,limit-out.length));
      const url=new URL(this.url(collectionPath));url.searchParams.set('pageSize',String(remaining));if(pageToken)url.searchParams.set('pageToken',pageToken);
      const response=await fetch(url,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw new Error(response.status===401||response.status===403?'FIRESTORE_PERMISSION_DENIED':'FIRESTORE_UNAVAILABLE');
      const body=await response.json() as {documents?:FirestoreDocument[];nextPageToken?:string};
      for(const document of body.documents||[]){
        const marker='/documents/';const at=document.name.indexOf(marker);if(at<0)continue;
        out.push(document.name.slice(at+marker.length).split('/').map(decodeURIComponent).join('/'));
        if(limit!==undefined&&out.length>=limit)return out;
      }
      pageToken=String(body.nextPageToken||'');
    }while(pageToken);
    return out;
  }
  async listCollectionIds(documentPath:string):Promise<string[]>{
    const token=await this.tokenProvider();const out:string[]=[];let pageToken='';
    do{
      const response=await fetch(`${this.url(documentPath)}:listCollectionIds`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({pageSize:1000,...(pageToken?{pageToken}: {})}),signal:AbortSignal.timeout(12000)});
      if(!response.ok){if(response.status===404)return out;throw new Error(response.status===401||response.status===403?'FIRESTORE_PERMISSION_DENIED':'FIRESTORE_UNAVAILABLE')}
      const body=await response.json() as {collectionIds?:string[];nextPageToken?:string};out.push(...(body.collectionIds||[]));pageToken=String(body.nextPageToken||'');
    }while(pageToken);
    return [...new Set(out)];
  }
  async delete(path:string):Promise<void>{
    const token=await this.tokenProvider();const response=await fetch(this.url(path),{method:'DELETE',headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(12000)});
    if(response.status===404)return;
    if(!response.ok)throw new Error(response.status===401||response.status===403?'FIRESTORE_PERMISSION_DENIED':'FIRESTORE_UNAVAILABLE');
  }
}

export const firestoreRestCodec={encodeFields,decodeFields};
