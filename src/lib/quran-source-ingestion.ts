import type { QuranSourceManifestRecord } from '../types';
import { sourceFileHash } from './scientific-core';

export interface QuranVerseRecord {surah:number;ayah:number;text:string}
export interface QuranSourceCandidateFile {name:string;format:string;bytes:Uint8Array;expectedSha256?:string}
export interface QuranDifference {surah:number;ayah:number;level:'TEXT'|'CHARACTER'|'DIACRITIC'|'WAQF_MARKER'|'UNVERIFIED';left:string;right:string;offset?:number}

/** Transport-only normalization: BOM and line ending normalization. Scientific code points are preserved. */
export function normalizeTransportEncoding(text:string){return text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n')}

export async function inspectCandidateFile(file:QuranSourceCandidateFile){
 const sha256=await sourceFileHash(file.bytes);return {name:file.name,format:file.format,sha256,sizeBytes:file.bytes.byteLength,checksumMatch:file.expectedSha256?sha256.toLowerCase()===file.expectedSha256.toLowerCase():undefined};
}

export function validateVerseStructure(rows:QuranVerseRecord[],expected?:{surahCount?:number;ayahCountBySurah?:Record<number,number>}){
 const errors:string[]=[];const seen=new Set<string>();
 for(const row of rows){if(!Number.isInteger(row.surah)||row.surah<1)errors.push(`INVALID_SURAH:${row.surah}`);if(!Number.isInteger(row.ayah)||row.ayah<1)errors.push(`INVALID_AYAH:${row.surah}:${row.ayah}`);const key=`${row.surah}:${row.ayah}`;if(seen.has(key))errors.push(`DUPLICATE_AYAH:${key}`);seen.add(key);if(!row.text)errors.push(`EMPTY_TEXT:${key}`)}
 const surahs=new Set(rows.map(r=>r.surah));if(expected?.surahCount!==undefined&&surahs.size!==expected.surahCount)errors.push(`SURAH_COUNT_MISMATCH:${surahs.size}:${expected.surahCount}`);
 if(expected?.ayahCountBySurah)for(const [surah,count] of Object.entries(expected.ayahCountBySurah)){const actual=rows.filter(r=>r.surah===Number(surah)).length;if(actual!==count)errors.push(`AYAH_COUNT_MISMATCH:${surah}:${actual}:${count}`)}
 return {valid:errors.length===0,errors,surahCount:surahs.size,ayahCount:rows.length};
}

const combining=/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/u;
const waqf=/[\u06D6-\u06ED\u06DD]/u;
export function compareQuranRows(primary:QuranVerseRecord[],crossCheck:QuranVerseRecord[]){
 const right=new Map(crossCheck.map(r=>[`${r.surah}:${r.ayah}`,r]));const differences:QuranDifference[]=[];
 for(const left of primary){const other=right.get(`${left.surah}:${left.ayah}`);if(!other){differences.push({surah:left.surah,ayah:left.ayah,level:'UNVERIFIED',left:left.text,right:''});continue}if(left.text===other.text)continue;
  const max=Math.max(left.text.length,other.text.length);let offset=0;while(offset<max&&left.text[offset]===other.text[offset])offset++;
  const l=left.text[offset]||'',r=other.text[offset]||'';const level=waqf.test(l)||waqf.test(r)?'WAQF_MARKER':combining.test(l)||combining.test(r)?'DIACRITIC':'CHARACTER';differences.push({surah:left.surah,ayah:left.ayah,level,left:left.text,right:other.text,offset});
 }
 const leftKeys=new Set(primary.map(r=>`${r.surah}:${r.ayah}`));for(const extra of crossCheck){if(!leftKeys.has(`${extra.surah}:${extra.ayah}`))differences.push({surah:extra.surah,ayah:extra.ayah,level:'UNVERIFIED',left:'',right:extra.text})}
 return {state:differences.length?'DIFFERENCE' as const:'MATCH' as const,differences};
}

export function invalidateApprovalsOnPackageChange(previous:QuranSourceManifestRecord,nextPackageHash:string){
 if(previous.packageHash===nextPackageHash)return previous.scientificReviews||[];return [];
}

export function freezeCertifiedSource(record:QuranSourceManifestRecord){
 if(record.certificationState!=='CERTIFIED')throw new Error('SOURCE_NOT_CERTIFIED');return Object.freeze({...record,immutable:true,scientificReviews:Object.freeze([...(record.scientificReviews||[])])}) as Readonly<QuranSourceManifestRecord>;
}

function numberField(value:unknown){const n=Number(value);return Number.isInteger(n)&&n>0?n:undefined}
function textField(value:unknown){return typeof value==='string'?value:undefined}
function rowFromObject(obj:Record<string,unknown>):QuranVerseRecord|null{
 const surah=numberField(obj.surah??obj.sura??obj.surah_number??obj.chapter??obj.chapter_number);
 const ayah=numberField(obj.ayah??obj.aya??obj.verse??obj.ayah_number??obj.verse_number);
 const text=textField(obj.text??obj.uthmani??obj.text_uthmani??obj.verse_text??obj.content);
 return surah&&ayah&&text!==undefined?{surah,ayah,text}:null;
}
function parseJsonRows(text:string){const parsed=JSON.parse(text) as unknown;const arrays:Array<unknown>=Array.isArray(parsed)?parsed:parsed&&typeof parsed==='object'?((parsed as Record<string,unknown>).verses as Array<unknown>)||((parsed as Record<string,unknown>).ayahs as Array<unknown>)||((parsed as Record<string,unknown>).data as Array<unknown>)||[]:[];return arrays.map(x=>x&&typeof x==='object'?rowFromObject(x as Record<string,unknown>):null).filter((x):x is QuranVerseRecord=>!!x)}
function csvCells(line:string){const out:string[]=[];let current='';let quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(quoted&&line[i+1]==='"'){current+='"';i++}else quoted=!quoted}else if(ch===','&&!quoted){out.push(current);current=''}else current+=ch}out.push(current);return out}
function parseCsvRows(text:string){const lines=text.split('\n').filter(Boolean);if(lines.length<2)return [];const header=csvCells(lines[0]).map(x=>x.trim().toLowerCase());return lines.slice(1).map(line=>{const values=csvCells(line);const obj:Record<string,unknown>={};header.forEach((h,i)=>obj[h]=values[i]);return rowFromObject(obj)}).filter((x):x is QuranVerseRecord=>!!x)}
function parseDelimitedRows(text:string){const rows:QuranVerseRecord[]=[];for(const line of text.split('\n')){if(!line.trim())continue;const parts=line.includes('\t')?line.split('\t'):line.split('|');if(parts.length<3)continue;const surah=numberField(parts[0]),ayah=numberField(parts[1]);if(surah&&ayah)rows.push({surah,ayah,text:parts.slice(2).join(line.includes('\t')?'\t':'|')})}return rows}
function decodeXmlEntities(s:string){return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&')}
function parseXmlRows(text:string){const rows:QuranVerseRecord[]=[];const tag=/<(?:ayah|aya|verse)\b([^>]*)>([\s\S]*?)<\/(?:ayah|aya|verse)>/gi;let m:RegExpExecArray|null;while((m=tag.exec(text))){const attrs=m[1];const attr=(name:string)=>new RegExp(`${name}=["']([^"']+)["']`,'i').exec(attrs)?.[1];const surah=numberField(attr('surah')||attr('sura')||attr('chapter')),ayah=numberField(attr('ayah')||attr('aya')||attr('verse'));const inner=m[2].replace(/<[^>]+>/g,'');if(surah&&ayah)rows.push({surah,ayah,text:decodeXmlEntities(inner)})}return rows}
function parseSqlRows(text:string){const rows:QuranVerseRecord[]=[];const tuple=/\(\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:''|[^'])*)'\s*\)/g;let m:RegExpExecArray|null;while((m=tuple.exec(text)))rows.push({surah:Number(m[1]),ayah:Number(m[2]),text:m[3].replace(/''/g,"'")});return rows}

/**
 * Parses only explicit, inspectable source layouts. It never guesses missing Quran text.
 * XLS/XLSX must be converted through a reviewed import adapter because browser ZIP/XML spreadsheet
 * parsing is intentionally not treated as scientific validation by this lightweight client.
 */
export function parseQuranVerseFile(file:QuranSourceCandidateFile){
 const format=file.format.toLowerCase().replace(/^\./,'');
 if(['xlsx','xls'].includes(format))throw new Error('SPREADSHEET_REQUIRES_REVIEWED_IMPORT_ADAPTER');
 let decoded:string;try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(file.bytes)}catch{throw new Error('INVALID_UTF8_SOURCE_ENCODING')}
 const text=normalizeTransportEncoding(decoded);
 let rows:QuranVerseRecord[]=[];
 if(format==='json')rows=parseJsonRows(text);
 else if(format==='csv')rows=parseCsvRows(text);
 else if(format==='xml')rows=parseXmlRows(text);
 else if(format==='sql')rows=parseSqlRows(text);
 else if(['txt','tsv'].includes(format))rows=parseDelimitedRows(text);
 else throw new Error('UNSUPPORTED_QURAN_SOURCE_FORMAT');
 if(!rows.length)throw new Error('NO_VERSE_ROWS_PARSED');
 return rows;
}
