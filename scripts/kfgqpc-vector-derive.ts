import fs from 'node:fs';
import path from 'node:path';
import {generatedArtifactDigest,officialKfgqpcUrl,quranReadingDefinition,sha256} from '../server/quran-intelligence-policy';
import {validateVectorArtifact} from '../server/quran-vector-repository';
import type {QuranDatasetStatus,QuranVectorArtifact,QuranVectorLayer} from '../server/quran-intelligence-types';

const args=process.argv.slice(2);
const arg=(name:string)=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined};
const all=(name:string)=>args.flatMap((v,i)=>v===name&&args[i+1]?[args[i+1]]:[]);
const required=(name:string)=>{const v=arg(name);if(!v)throw new Error(`MISSING_ARGUMENT:${name}`);return v};
const master=path.resolve(required('--master'));
const layersPath=path.resolve(required('--layers'));
const output=path.resolve(required('--output'));
const sourceUrl=required('--source-url');
const sourceVersion=required('--source-version');
const sourceAssetId=required('--source-asset-id');
const readingValue=required('--reading');
const parserVersion=arg('--parser-version')||'mizan-vector-derive/1';
const reviewedBy=all('--reviewer').filter(Boolean);
const reviewedAt=arg('--reviewed-at');
const officialSha256=arg('--official-sha256')?.toLowerCase();

if(!officialKfgqpcUrl(sourceUrl))throw new Error('VECTOR_SOURCE_MUST_BE_KFGQPC');
const reading=quranReadingDefinition(readingValue);if(!reading)throw new Error('QURAN_READING_UNSUPPORTED');
if(!fs.existsSync(master)||!fs.statSync(master).isFile())throw new Error('VECTOR_MASTER_NOT_FOUND');
if(!fs.existsSync(layersPath)||!fs.statSync(layersPath).isFile())throw new Error('VECTOR_LAYER_EXPORT_NOT_FOUND');
if(master.startsWith(path.resolve('.')+path.sep))throw new Error('VECTOR_MASTER_MUST_REMAIN_OUTSIDE_PROJECT_WORKTREE');
const masterBytes=fs.readFileSync(master),localSha256=sha256(masterBytes);
let status:QuranDatasetStatus='UNVERIFIED';
if(officialSha256)status=officialSha256===localSha256?'VERIFIED':'QUARANTINED';
else if(reviewedAt&&reviewedBy.length>=2)status='VERIFIED';
const raw=JSON.parse(fs.readFileSync(layersPath,'utf8')) as unknown;
const rows=Array.isArray(raw)?raw:Array.isArray((raw as any)?.layers)?(raw as any).layers:[];
if(!rows.length)throw new Error('VECTOR_LAYERS_EMPTY');
const layers:QuranVectorLayer[]=rows.map((x:any,index)=>{
  const binding=x.semanticBinding;
  if(binding&&(!binding.evidenceId||!['OFFICIAL_SOURCE_MAPPING','HUMAN_VERIFIED_WITH_EVIDENCE'].includes(binding.method)))throw new Error(`VECTOR_LAYER_SEMANTIC_EVIDENCE_REQUIRED:${index}`);
  const bbox=x.normalizedBBox;
  if(bbox){for(const k of ['x','y','width','height'] as const){if(!Number.isFinite(Number(bbox[k]))||Number(bbox[k])<0||Number(bbox[k])>1)throw new Error(`VECTOR_BBOX_INVALID:${index}:${k}`)}if(Number(bbox.x)+Number(bbox.width)>1.000001||Number(bbox.y)+Number(bbox.height)>1.000001)throw new Error(`VECTOR_BBOX_OUTSIDE_PAGE:${index}`)}
  return {page:Number(x.page),sourceLayerId:String(x.sourceLayerId??x.id??index+1),layerName:x.layerName?String(x.layerName):undefined,line:x.line===undefined?undefined:Number(x.line),normalizedBBox:bbox?{x:Number(bbox.x),y:Number(bbox.y),width:Number(bbox.width),height:Number(bbox.height)}:undefined,semanticBinding:binding?{surah:Number(binding.surah),ayah:Number(binding.ayah),wordIndex:Number(binding.wordIndex),evidenceId:String(binding.evidenceId),method:binding.method}:undefined,resolution:binding?'VERIFIED_WORD_MAPPING':(x.resolution==='NON_WORD_VECTOR_LAYER'?'NON_WORD_VECTOR_LAYER':'UNRESOLVED_VECTOR_LAYER')};
});
const artifact:QuranVectorArtifact={version:'MIZAN-KFGQPC-VECTOR-METADATA-1',reading:reading.id,sourceAssetId,sourceVersion,provenance:{authority:'KFGQPC',sourceUrl,retrievedAt:new Date(fs.statSync(master).mtimeMs).toISOString(),sourceVersion,officialChecksum:officialSha256,officialChecksumVerified:officialSha256?officialSha256===localSha256:undefined,localSha256,parserVersion,generatedArtifactSha256:'0'.repeat(64),status,reviewedBy:reviewedBy.length?reviewedBy:undefined,reviewedAt,note:'Derived metadata only. Master Adobe/vector original remains outside Git; unresolved layers are never promoted by inference.'},layers};
artifact.provenance.generatedArtifactSha256=generatedArtifactDigest(artifact);
if(status==='QUARANTINED'){
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(artifact,null,2),{mode:0o600});
  throw new Error('VECTOR_MASTER_CHECKSUM_MISMATCH_QUARANTINED');
}
validateVectorArtifact(artifact);
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(artifact,null,2),{mode:0o600});
console.log(JSON.stringify({ok:true,reading:reading.id,status,layerCount:layers.length,verifiedWordMappings:layers.filter(x=>x.resolution==='VERIFIED_WORD_MAPPING').length,unresolvedLayers:layers.filter(x=>x.resolution==='UNRESOLVED_VECTOR_LAYER').length,masterSha256:localSha256,artifactSha256:artifact.provenance.generatedArtifactSha256,output},null,2));
