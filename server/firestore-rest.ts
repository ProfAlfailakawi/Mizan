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

export class FirestoreRestRepository{
  private readonly root:string;
  constructor(private readonly projectId:string,private readonly databaseId=process.env.FIRESTORE_DATABASE_ID||'(default)',private readonly tokenProvider=googleAccessToken){
    if(!projectId)throw new Error('FIRESTORE_NOT_CONFIGURED');
    this.root=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;
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
}

export const firestoreRestCodec={encodeFields,decodeFields};
