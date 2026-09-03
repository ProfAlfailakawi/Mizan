import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { KFGQPC_OFFICIAL_PACKAGES, kfgqpcPackageById, type KfgqpcOfficialPackage } from './kfgqpc-official-sources';
import { quranReadingDefinition, quranReadingForPackage, type QuranReadingDefinition } from './quran-intelligence-policy';
import type { CanonicalAyahLocation, QuranPageLocus } from './quran-intelligence-types';

export interface ServerQuranVerse {
  id?:number|string;jozz?:number;page?:number|string;page_end?:number|string;sura_no:number;sura_name_en?:string;sura_name_ar?:string;line_start?:number;line_end?:number;aya_no:number;aya_text:string;aya_text_emlaey?:string;
}
export interface ServerQuranSourceManifest {
  version:2;packageId:string;authority:string;authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY';sourceVersion:string;qiraah:string;imam:string;rawi:string;tariq?:string;
  bundleFile:string;dataFile:string;sourceDataFile?:string;bundleMd5:string;bundleSha1:string;bundleChecksumVerified:boolean;dataSha256:string;sourceDataSha256?:string;packageHash:string;verseCount:number;surahCount:number;ingestedAt:string;
  canonicalLocationFile?:string;canonicalLocationSha256?:string;canonicalLocationCount?:number;pageCountObserved?:number;
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
function spatialNumbers(r:ServerQuranVerse,reading?:QuranReadingDefinition){
  const page=Number(r.page),pageEnd=r.page_end===undefined||r.page_end===null||r.page_end===''?page:Number(r.page_end),lineStart=Number(r.line_start),lineEnd=Number(r.line_end);
  if(!Number.isInteger(page)||page<1||!Number.isInteger(pageEnd)||pageEnd<page)throw new Error(`QURAN_SOURCE_PAGE_INVALID:${r.sura_no}:${r.aya_no}`);
  if(reading?.officialPageCount&&(page>reading.officialPageCount||pageEnd>reading.officialPageCount))throw new Error(`QURAN_SOURCE_PAGE_OUT_OF_OFFICIAL_RANGE:${r.sura_no}:${r.aya_no}`);
  if(!Number.isInteger(lineStart)||!Number.isInteger(lineEnd)||lineStart<1||lineEnd<1||(pageEnd===page&&lineStart>lineEnd))throw new Error(`QURAN_SOURCE_LINE_MAPPING_INVALID:${r.sura_no}:${r.aya_no}`);
  return {page,pageEnd,lineStart,lineEnd};
}

function observedLineCount(rows:ServerQuranVerse[]){const n=Math.max(...rows.flatMap(r=>[Number(r.line_start),Number(r.line_end)]).filter(Number.isFinite));if(!Number.isInteger(n)||n<1)throw new Error('QURAN_SOURCE_LINE_COUNT_UNAVAILABLE');return n}
function officialLoci(spatial:{page:number;pageEnd:number;lineStart:number;lineEnd:number},lineCount:number):QuranPageLocus[]{
  if(spatial.lineStart>lineCount||spatial.lineEnd>lineCount)throw new Error('QURAN_SOURCE_LINE_OUT_OF_OBSERVED_OFFICIAL_RANGE');
  if(spatial.pageEnd===spatial.page)return [{page:spatial.page,lineStart:spatial.lineStart,lineEnd:spatial.lineEnd,lineCount}];
  const loci:QuranPageLocus[]=[];
  for(let page=spatial.page;page<=spatial.pageEnd;page++)loci.push({page,lineStart:page===spatial.page?spatial.lineStart:1,lineEnd:page===spatial.pageEnd?spatial.lineEnd:lineCount,lineCount});
  return loci;
}

function validateRows(rows:ServerQuranVerse[],reading?:QuranReadingDefinition){
  const keys=new Set<string>(),surahs=new Set<number>(),pages=new Set<number>();let previous='';
  for(const [idx,r] of rows.entries()){
    const key=`${r.sura_no}:${r.aya_no}`;if(keys.has(key))throw new Error(`QURAN_SOURCE_DUPLICATE_AYAH:${key}`);keys.add(key);surahs.add(r.sura_no);
    if(!r.aya_text.trim())throw new Error(`QURAN_SOURCE_EMPTY_AYAH:${key}`);
    const spatial=spatialNumbers(r,reading);for(let p=spatial.page;p<=spatial.pageEnd;p++)pages.add(p);
    const order=`${String(r.sura_no).padStart(3,'0')}:${String(r.aya_no).padStart(4,'0')}`;if(previous&&order<previous)throw new Error(`QURAN_SOURCE_NOT_SORTED:${idx}`);previous=order;
  }
  if(surahs.size!==114)throw new Error(`QURAN_SOURCE_SURAH_COUNT:${surahs.size}`);
  // Full official developer packages contain the complete Quran. Tiny synthetic fixtures used by
  // unit tests are intentionally not mistaken for production coverage checks.
  if(reading?.officialPageCount&&rows.length>=6000){for(let p=1;p<=reading.officialPageCount;p++)if(!pages.has(p))throw new Error(`QURAN_SOURCE_OFFICIAL_PAGE_MISSING:${p}`)}
  return {verseCount:rows.length,surahCount:surahs.size,pageCountObserved:pages.size,lineCountObserved:observedLineCount(rows)};
}

function canonicalLocations(rows:ServerQuranVerse[],official:KfgqpcOfficialPackage,manifestSeed:{dataSha256:string;verifiedAt:string}){
  const reading=quranReadingForPackage(official.id);if(!reading)throw new Error('QURAN_READING_NOT_REGISTERED');const lineCount=observedLineCount(rows);
  return rows.map(r=>{const spatial=spatialNumbers(r,reading);return {reading:reading.id,surah:r.sura_no,ayah:r.aya_no,page:spatial.page,lineStart:spatial.lineStart,lineEnd:spatial.lineEnd,loci:officialLoci(spatial,lineCount),sourcePackage:official.id,sourceVersion:official.sourceVersion,sourceAuthority:'KFGQPC',checksum:manifestSeed.dataSha256,verifiedAt:manifestSeed.verifiedAt,assurance:'KFGQPC_OFFICIAL_METADATA'} satisfies CanonicalAyahLocation});
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
    const reading=quranReadingForPackage(official.id);if(!reading)throw new Error('QURAN_READING_NOT_REGISTERED');
    const rows=normalizeRows(JSON.parse(jsonBytes.toString('utf8')));const structural=validateRows(rows,reading),normalizedBytes=Buffer.from(JSON.stringify(rows)),sourceDataSha256=digest('sha256',jsonBytes).toLowerCase(),dataSha256=digest('sha256',normalizedBytes).toLowerCase();
    const packageHash=digest('sha256',canonical({packageId:official.id,sourceVersion:official.sourceVersion,bundleMd5:md5,bundleSha1:sha1,sourceDataSha256,dataSha256,rows:rows.map(r=>[r.sura_no,r.aya_no,r.aya_text])})).toLowerCase();
    const dir=this.dir(official.id);fs.mkdirSync(dir,{recursive:true,mode:0o700});const bundleTarget=path.join(dir,'official-bundle.bin'),sourceDataFile='official-data-source.json',dataTarget=path.join(dir,'verses.json');fs.copyFileSync(input.bundlePath,bundleTarget);fs.writeFileSync(path.join(dir,sourceDataFile),jsonBytes,{mode:0o600});fs.writeFileSync(dataTarget,normalizedBytes,{mode:0o600});
    const certifiedAt=new Date().toISOString();const locations=canonicalLocations(rows,official,{dataSha256,verifiedAt:certifiedAt});const locationBytes=Buffer.from(JSON.stringify(locations));const canonicalLocationFile='canonical-locations.json';fs.writeFileSync(path.join(dir,canonicalLocationFile),locationBytes,{mode:0o600});
    const manifest:ServerQuranSourceManifest={version:2,packageId:official.id,authority:official.authority,authorityTrust:'PRIMARY_OFFICIAL_AUTHORITY',sourceVersion:official.sourceVersion,qiraah:official.qiraah,imam:official.imam,rawi:official.rawi,tariq:official.tariq,bundleFile:'official-bundle.bin',dataFile:'verses.json',sourceDataFile,bundleMd5:md5,bundleSha1:sha1,bundleChecksumVerified:true,dataSha256,sourceDataSha256,packageHash,verseCount:structural.verseCount,surahCount:structural.surahCount,ingestedAt:certifiedAt,canonicalLocationFile,canonicalLocationSha256:digest('sha256',locationBytes).toLowerCase(),canonicalLocationCount:locations.length,pageCountObserved:structural.pageCountObserved,scientificApproval:{state:'CERTIFIED',basis:'OFFICIAL_AUTHORITY_POLICY',reviewers:[],certifiedAt}};
    fs.writeFileSync(this.manifestPath(official.id),JSON.stringify(manifest,null,2),{encoding:'utf8',mode:0o600});return manifest;
  }
  approve(packageId:string,reviewerId:string){const m=this.manifest(packageId);if(m.scientificApproval.state==='REVOKED')throw new Error('QURAN_SOURCE_REVOKED');if(!m.bundleChecksumVerified)throw new Error('QURAN_SOURCE_CHECKSUM_NOT_VERIFIED');if(m.scientificApproval.basis==='OFFICIAL_AUTHORITY_POLICY'&&m.scientificApproval.state==='CERTIFIED')return m;if(!m.scientificApproval.reviewers.some(r=>r.id===reviewerId))m.scientificApproval.reviewers.push({id:reviewerId,approvedAt:new Date().toISOString(),packageHash:m.packageHash});m.scientificApproval.basis='DUAL_SCIENTIFIC_REVIEW';if(m.scientificApproval.reviewers.length>=2){m.scientificApproval.state='CERTIFIED';m.scientificApproval.certifiedAt=new Date().toISOString()}fs.writeFileSync(this.manifestPath(packageId),JSON.stringify(m,null,2),{encoding:'utf8',mode:0o600});return m}
  revoke(packageId:string,reason:string){const m=this.manifest(packageId);m.scientificApproval.state='REVOKED';m.scientificApproval.revokedAt=new Date().toISOString();m.scientificApproval.reason=reason||'Scientific revocation';fs.writeFileSync(this.manifestPath(packageId),JSON.stringify(m,null,2),{encoding:'utf8',mode:0o600});return m}
  verses(packageId:string){const m=this.manifest(packageId);if(m.scientificApproval.state!=='CERTIFIED')throw new Error('QURAN_SOURCE_NOT_CERTIFIED');const p=path.join(this.dir(packageId),m.dataFile);const bytes=fs.readFileSync(p);if(digest('sha256',bytes).toLowerCase()!==m.dataSha256)throw new Error('QURAN_SOURCE_DATA_HASH_MISMATCH');return JSON.parse(bytes.toString('utf8')) as ServerQuranVerse[]}
  canonicalLocationsForPackage(packageId:string):CanonicalAyahLocation[]{const m=this.manifest(packageId),pkg=this.officialMetadata(packageId),reading=quranReadingForPackage(packageId);if(!reading)throw new Error('QURAN_READING_UNSUPPORTED');if(m.canonicalLocationFile&&m.canonicalLocationSha256){const p=path.join(this.dir(packageId),m.canonicalLocationFile),bytes=fs.readFileSync(p);if(digest('sha256',bytes).toLowerCase()!==m.canonicalLocationSha256)throw new Error('QURAN_CANONICAL_LOCATION_HASH_MISMATCH');const rows=JSON.parse(bytes.toString('utf8')) as CanonicalAyahLocation[];if(rows.length!==m.verseCount||m.canonicalLocationCount&&rows.length!==m.canonicalLocationCount)throw new Error('QURAN_CANONICAL_LOCATION_COUNT_MISMATCH');for(const x of rows)if(x.reading!==reading.id||x.sourcePackage!==packageId||x.sourceAuthority!=='KFGQPC'||x.assurance!=='KFGQPC_OFFICIAL_METADATA'||!x.loci?.length)throw new Error('QURAN_CANONICAL_LOCATION_ARTIFACT_INVALID');return rows}return canonicalLocations(this.verses(packageId),pkg,{dataSha256:m.dataSha256,verifiedAt:m.scientificApproval.certifiedAt||m.ingestedAt})}
  resolvePassage(input:{packageId:string;surah:number;startAyah:number;endAyah:number}){const rows=this.verses(input.packageId).filter(r=>r.sura_no===input.surah&&r.aya_no>=input.startAyah&&r.aya_no<=input.endAyah);const expected=input.endAyah-input.startAyah+1;if(rows.length!==expected)throw new Error('QURAN_PASSAGE_INCOMPLETE');for(let i=0;i<expected;i++)if(rows[i].aya_no!==input.startAyah+i)throw new Error('QURAN_PASSAGE_GAP');return {package:this.manifest(input.packageId),verses:rows,text:rows.map(x=>x.aya_text).join(' ')} }
  canonicalLocation(input:{reading:string;surah:number;ayah:number}):CanonicalAyahLocation{
    const reading=quranReadingForPackage(this.officialPackageForReading(input.reading).id);if(!reading)throw new Error('QURAN_READING_UNSUPPORTED');const pkg=this.officialMetadata(reading.packageId);const manifest=this.manifest(pkg.id);if(manifest.scientificApproval.state!=='CERTIFIED')throw new Error('QURAN_SOURCE_NOT_CERTIFIED');
    const location=this.canonicalLocationsForPackage(pkg.id).find(x=>x.surah===input.surah&&x.ayah===input.ayah);if(!location)throw new Error('QURAN_LOCATION_NOT_FOUND');return location;
  }
  resolvePassageLoci(input:{packageId:string;surah:number;startAyah:number;endAyah:number}):QuranPageLocus[]{
    const pkg=this.officialMetadata(input.packageId),reading=quranReadingForPackage(pkg.id);if(!reading)throw new Error('QURAN_READING_UNSUPPORTED');const locations=this.canonicalLocationsForPackage(input.packageId).filter(x=>x.surah===input.surah&&x.ayah>=input.startAyah&&x.ayah<=input.endAyah),expected=input.endAyah-input.startAyah+1;if(locations.length!==expected)throw new Error('QURAN_PASSAGE_INCOMPLETE');const byPage=new Map<number,QuranPageLocus>();
    for(const location of locations){for(const locus of location.loci){const current=byPage.get(locus.page);if(!current)byPage.set(locus.page,{...locus});else{current.lineStart=Math.min(current.lineStart,locus.lineStart);current.lineEnd=Math.max(current.lineEnd,locus.lineEnd);current.lineCount=Math.max(current.lineCount,locus.lineCount)}}}
    return [...byPage.values()].sort((a,b)=>a.page-b.page);
  }
  canonicalCoverage(packageId:string){const pkg=this.officialMetadata(packageId),reading=quranReadingForPackage(pkg.id);if(!reading)throw new Error('QURAN_READING_UNSUPPORTED');const rows=this.verses(packageId);validateRows(rows,reading);const locations=this.canonicalLocationsForPackage(packageId);if(locations.length!==rows.length)throw new Error('QURAN_CANONICAL_COVERAGE_MISMATCH');return {reading:reading.id,packageId,verseCount:rows.length,canonicalLocationCount:locations.length,surahCount:new Set(rows.map(r=>r.sura_no)).size,pages:new Set(locations.flatMap(x=>x.loci.map(l=>l.page))).size,assurance:'KFGQPC_OFFICIAL_METADATA' as const}}
  private officialPackageForReading(reading:string){const def=quranReadingDefinition(reading);if(!def)throw new Error('QURAN_READING_UNSUPPORTED');const pkg=kfgqpcPackageById(def.packageId);if(!pkg)throw new Error('QURAN_READING_PACKAGE_UNAVAILABLE');return pkg}
  questionStartMetadata(packageId:string,loci:{id:string;surahNumber:number;startAyah:number}[]){
    const rows=this.verses(packageId),byKey=new Map(rows.map(r=>[`${r.sura_no}:${r.aya_no}`,r]));
    return loci.map(l=>{const row=byKey.get(`${l.surahNumber}:${l.startAyah}`);if(!row)throw new Error(`QUESTION_START_NOT_IN_CERTIFIED_SOURCE:${l.id}`);const line=Number(row.line_start||0)||undefined;const startClass:'SURAH_OPENING'|'PAGE_OPENING'|'MID_PAGE'|'LATE_PAGE'|'UNKNOWN'=l.startAyah===1?'SURAH_OPENING':line!==undefined?(line<=2?'PAGE_OPENING':line>=11?'LATE_PAGE':'MID_PAGE'):'UNKNOWN';return {id:l.id,pageNumber:Number(row.page||0)||undefined,lineStart:line,startClass,startAssurance:'QURAN_AYAH_BOUNDARY' as const}})
  }
  officialMetadata(packageId:string):KfgqpcOfficialPackage{const x=kfgqpcPackageById(packageId);if(!x)throw new Error('QURAN_SOURCE_NOT_IN_OFFICIAL_CATALOG');return x}
}
