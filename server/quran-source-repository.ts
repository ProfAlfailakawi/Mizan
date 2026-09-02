import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { KFGQPC_OFFICIAL_PACKAGES, kfgqpcPackageById, type KfgqpcOfficialPackage } from './kfgqpc-official-sources';

export interface ServerQuranVerse {
  id?:number|string;jozz?:number;page?:number|string;sura_no:number;sura_name_en?:string;sura_name_ar?:string;line_start?:number;line_end?:number;aya_no:number;aya_text:string;aya_text_emlaey?:string;
}
export interface ServerQuranSourceManifest {
  version:2;packageId:string;authority:string;authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY';sourceVersion:string;qiraah:string;imam:string;rawi:string;tariq?:string;
  bundleFile:string;dataFile:string;bundleMd5:string;bundleSha1:string;bundleChecksumVerified:boolean;dataSha256:string;packageHash:string;verseCount:number;surahCount:number;ingestedAt:string;
  scientificApproval:{state:'PENDING_REVIEW'|'CERTIFIED'|'REVOKED';basis:'OFFICIAL_AUTHORITY_POLICY'|'DUAL_SCIENTIFIC_REVIEW';reviewers:{id:string;approvedAt:string;packageHash:string}[];certifiedAt?:string;revokedAt?:string;reason?:string};
}
const canonical=(v:unknown):string=>{if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;const o=v as Record<string,unknown>;return `{${Object.keys(o).sort().map(k=>`${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`};
const digest=(algorithm:string,b:Buffer|string)=>crypto.createHash(algorithm).update(b).digest('hex').toUpperCase();
const safe=(v:string)=>v.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,128);

function normalizeRows(raw:unknown):ServerQuranVerse[]{
  const rows=Array.isArray(raw)?raw:Array.isArray((raw as any)?.data)?(raw as any).data:Array.isArray((raw as any)?.verses)?(raw as any).verses:[];
  if(!rows.length)throw new Error('QURAN_SOURCE_ROWS_NOT_FOUND');
  return rows.map((r:any,idx:number)=>{
    const sura=Number(r.sura_no??r.sura??r.surah??r.surahNumber),ayah=Number(r.aya_no??r.aya??r.ayah??r.ayahNumber),text=String(r.aya_text??r.text??'');
    if(!Number.isInteger(sura)||sura<1||sura>114||!Number.isInteger(ayah)||ayah<1||!text)throw new Error(`QURAN_SOURCE_ROW_INVALID:${idx}`);
    return {...r,sura_no:sura,aya_no:ayah,aya_text:text} as ServerQuranVerse;
  });
}
function validateRows(rows:ServerQuranVerse[]){
  const keys=new Set<string>(),surahs=new Set<number>();let previous='';
  for(const [idx,r] of rows.entries()){
    const key=`${r.sura_no}:${r.aya_no}`;if(keys.has(key))throw new Error(`QURAN_SOURCE_DUPLICATE_AYAH:${key}`);keys.add(key);surahs.add(r.sura_no);
    if(!r.aya_text.trim())throw new Error(`QURAN_SOURCE_EMPTY_AYAH:${key}`);
    const order=`${String(r.sura_no).padStart(3,'0')}:${String(r.aya_no).padStart(4,'0')}`;if(previous&&order<previous)throw new Error(`QURAN_SOURCE_NOT_SORTED:${idx}`);previous=order;
  }
  if(surahs.size!==114)throw new Error(`QURAN_SOURCE_SURAH_COUNT:${surahs.size}`);
  return {verseCount:rows.length,surahCount:surahs.size};
}

export class ServerQuranSourceRepository {
  constructor(private root:string){fs.mkdirSync(root,{recursive:true,mode:0o700})}
  catalog(){return KFGQPC_OFFICIAL_PACKAGES.map(x=>({...x,localState:this.localState(x.id)}))}
  private dir(id:string){return path.join(this.root,safe(id))}
  private manifestPath(id:string){return path.join(this.dir(id),'manifest.json')}
  localState(id:string){if(!fs.existsSync(this.manifestPath(id)))return 'NOT_INGESTED' as const;try{return (JSON.parse(fs.readFileSync(this.manifestPath(id),'utf8')) as ServerQuranSourceManifest).scientificApproval.state}catch{return 'INVALID_LOCAL_MANIFEST' as const}}
  manifest(id:string){const p=this.manifestPath(id);if(!fs.existsSync(p))throw new Error('QURAN_SOURCE_NOT_INGESTED');return JSON.parse(fs.readFileSync(p,'utf8')) as ServerQuranSourceManifest}
  ingestOfficial(input:{packageId:string;bundlePath:string;dataPath:string;ingestedBy:string}){
    const official=kfgqpcPackageById(input.packageId);if(!official)throw new Error('QURAN_SOURCE_NOT_IN_OFFICIAL_CATALOG');
    const bundle=fs.readFileSync(input.bundlePath),jsonBytes=fs.readFileSync(input.dataPath);const md5=digest('md5',bundle),sha1=digest('sha1',bundle);
    if(md5!==official.md5.toUpperCase()||sha1!==official.sha1.toUpperCase())throw new Error('QURAN_SOURCE_OFFICIAL_CHECKSUM_MISMATCH');
    const rows=normalizeRows(JSON.parse(jsonBytes.toString('utf8')));const structural=validateRows(rows);const dataSha256=digest('sha256',jsonBytes).toLowerCase();
    const packageHash=digest('sha256',canonical({packageId:official.id,sourceVersion:official.sourceVersion,bundleMd5:md5,bundleSha1:sha1,dataSha256,rows:rows.map(r=>[r.sura_no,r.aya_no,r.aya_text])})).toLowerCase();
    const dir=this.dir(official.id);fs.mkdirSync(dir,{recursive:true,mode:0o700});const bundleTarget=path.join(dir,'official-bundle.bin'),dataTarget=path.join(dir,'verses.json');fs.copyFileSync(input.bundlePath,bundleTarget);fs.writeFileSync(dataTarget,JSON.stringify(rows),{encoding:'utf8',mode:0o600});
    const certifiedAt=new Date().toISOString();const manifest:ServerQuranSourceManifest={version:2,packageId:official.id,authority:official.authority,authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',sourceVersion:official.sourceVersion,qiraah:official.qiraah,imam:official.imam,rawi:official.rawi,tariq:official.tariq,bundleFile:'official-bundle.bin',dataFile:'verses.json',bundleMd5:md5,bundleSha1:sha1,bundleChecksumVerified:true,dataSha256,packageHash,verseCount:structural.verseCount,surahCount:structural.surahCount,ingestedAt:certifiedAt,scientificApproval:{state:'CERTIFIED',basis:'OFFICIAL_AUTHORITY_POLICY',reviewers:[],certifiedAt}};
    fs.writeFileSync(this.manifestPath(official.id),JSON.stringify(manifest,null,2),{encoding:'utf8',mode:0o600});return manifest;
  }
  approve(packageId:string,reviewerId:string){const m=this.manifest(packageId);if(m.scientificApproval.state==='REVOKED')throw new Error('QURAN_SOURCE_REVOKED');if(!m.bundleChecksumVerified)throw new Error('QURAN_SOURCE_CHECKSUM_NOT_VERIFIED');if(m.scientificApproval.basis==='OFFICIAL_AUTHORITY_POLICY'&&m.scientificApproval.state==='CERTIFIED')return m;if(!m.scientificApproval.reviewers.some(r=>r.id===reviewerId))m.scientificApproval.reviewers.push({id:reviewerId,approvedAt:new Date().toISOString(),packageHash:m.packageHash});m.scientificApproval.basis='DUAL_SCIENTIFIC_REVIEW';if(m.scientificApproval.reviewers.length>=2){m.scientificApproval.state='CERTIFIED';m.scientificApproval.certifiedAt=new Date().toISOString()}fs.writeFileSync(this.manifestPath(packageId),JSON.stringify(m,null,2),{encoding:'utf8',mode:0o600});return m}
  revoke(packageId:string,reason:string){const m=this.manifest(packageId);m.scientificApproval.state='REVOKED';m.scientificApproval.revokedAt=new Date().toISOString();m.scientificApproval.reason=reason||'Scientific revocation';fs.writeFileSync(this.manifestPath(packageId),JSON.stringify(m,null,2),{encoding:'utf8',mode:0o600});return m}
  verses(packageId:string){const m=this.manifest(packageId);if(m.scientificApproval.state!=='CERTIFIED')throw new Error('QURAN_SOURCE_NOT_CERTIFIED');const p=path.join(this.dir(packageId),m.dataFile);const bytes=fs.readFileSync(p);if(digest('sha256',bytes).toLowerCase()!==m.dataSha256)throw new Error('QURAN_SOURCE_DATA_HASH_MISMATCH');return JSON.parse(bytes.toString('utf8')) as ServerQuranVerse[]}
  resolvePassage(input:{packageId:string;surah:number;startAyah:number;endAyah:number}){const rows=this.verses(input.packageId).filter(r=>r.sura_no===input.surah&&r.aya_no>=input.startAyah&&r.aya_no<=input.endAyah);const expected=input.endAyah-input.startAyah+1;if(rows.length!==expected)throw new Error('QURAN_PASSAGE_INCOMPLETE');for(let i=0;i<expected;i++)if(rows[i].aya_no!==input.startAyah+i)throw new Error('QURAN_PASSAGE_GAP');return {package:this.manifest(input.packageId),verses:rows,text:rows.map(x=>x.aya_text).join(' ')} }
  questionStartMetadata(packageId:string,loci:{id:string;surahNumber:number;startAyah:number}[]){
    const rows=this.verses(packageId),byKey=new Map(rows.map(r=>[`${r.sura_no}:${r.aya_no}`,r]));
    return loci.map(l=>{const row=byKey.get(`${l.surahNumber}:${l.startAyah}`);if(!row)throw new Error(`QUESTION_START_NOT_IN_CERTIFIED_SOURCE:${l.id}`);const line=Number(row.line_start||0)||undefined;const startClass:'SURAH_OPENING'|'PAGE_OPENING'|'MID_PAGE'|'LATE_PAGE'|'UNKNOWN'=l.startAyah===1?'SURAH_OPENING':line!==undefined?(line<=2?'PAGE_OPENING':line>=11?'LATE_PAGE':'MID_PAGE'):'UNKNOWN';return {id:l.id,pageNumber:Number(row.page||0)||undefined,lineStart:line,startClass,startAssurance:'QURAN_AYAH_BOUNDARY' as const}})
  }
  officialMetadata(packageId:string):KfgqpcOfficialPackage{const x=kfgqpcPackageById(packageId);if(!x)throw new Error('QURAN_SOURCE_NOT_IN_OFFICIAL_CATALOG');return x}
}
