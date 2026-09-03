import fs from 'fs';
import path from 'path';
import {generatedArtifactDigest,quranReadingDefinition,validateDatasetProvenance} from './quran-intelligence-policy';
import type {NormalizedBBox,QuranReadingId,QuranVectorArtifact,QuranVectorLayer} from './quran-intelligence-types';

function safe(v:string){return v.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100)}
function int(v:unknown,min=1){const n=Number(v);return Number.isInteger(n)&&n>=min?n:undefined}
function validBBox(b:NormalizedBBox|undefined){return !!b&&[b.x,b.y,b.width,b.height].every(Number.isFinite)&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=1.000001&&b.y+b.height<=1.000001}

export function validateVectorLayer(input:QuranVectorLayer):QuranVectorLayer{
  if(!int(input.page))throw new Error('QURAN_VECTOR_PAGE_INVALID');
  if(!String(input.sourceLayerId||'').trim())throw new Error('QURAN_VECTOR_LAYER_ID_REQUIRED');
  if(input.normalizedBBox&&!validBBox(input.normalizedBBox))throw new Error('QURAN_VECTOR_BBOX_INVALID');
  if(input.line!==undefined&&!int(input.line))throw new Error('QURAN_VECTOR_LINE_INVALID');
  const binding=input.semanticBinding;
  if(binding){
    if(!int(binding.surah)||binding.surah>114||!int(binding.ayah)||!int(binding.wordIndex))throw new Error('QURAN_VECTOR_SEMANTIC_BINDING_INVALID');
    if(!binding.evidenceId.trim())throw new Error('QURAN_VECTOR_BINDING_EVIDENCE_REQUIRED');
    if(!['OFFICIAL_SOURCE_MAPPING','HUMAN_VERIFIED_WITH_EVIDENCE'].includes(binding.method))throw new Error('QURAN_VECTOR_BINDING_METHOD_INVALID');
    if(input.resolution!=='VERIFIED_WORD_MAPPING')throw new Error('QURAN_VECTOR_VERIFIED_BINDING_RESOLUTION_REQUIRED');
  }else if(input.resolution==='VERIFIED_WORD_MAPPING')throw new Error('QURAN_VECTOR_UNMAPPED_LAYER_CANNOT_BE_VERIFIED');
  return input;
}

export function validateVectorArtifact(input:QuranVectorArtifact):QuranVectorArtifact{
  if(input.version!=='MIZAN-KFGQPC-VECTOR-METADATA-1')throw new Error('QURAN_VECTOR_VERSION_INVALID');
  const reading=quranReadingDefinition(input.reading);if(!reading||reading.id!==input.reading)throw new Error('QURAN_VECTOR_READING_INVALID');
  if(!input.sourceAssetId.trim()||!input.sourceVersion.trim())throw new Error('QURAN_VECTOR_SOURCE_REQUIRED');
  validateDatasetProvenance(input.provenance);
  if(input.provenance.status==='QUARANTINED')throw new Error('QURAN_VECTOR_ARTIFACT_QUARANTINED');
  const ids=new Set<string>();for(const layer of input.layers){validateVectorLayer(layer);if(ids.has(layer.sourceLayerId))throw new Error('QURAN_VECTOR_LAYER_DUPLICATE');ids.add(layer.sourceLayerId)}
  const hash=generatedArtifactDigest(input);
  // We do not silently rewrite provenance. A mismatch is a hard quarantine condition.
  if(input.provenance.generatedArtifactSha256!==hash&&input.provenance.status==='VERIFIED')throw new Error('QURAN_VECTOR_GENERATED_HASH_MISMATCH');
  return input;
}

export class QuranVectorRepository{
  constructor(private root:string){fs.mkdirSync(root,{recursive:true,mode:0o700})}
  private file(reading:QuranReadingId){return path.join(this.root,`vector-${safe(reading)}.json`)}
  register(input:QuranVectorArtifact){const artifact=validateVectorArtifact(input);fs.writeFileSync(this.file(artifact.reading),JSON.stringify(artifact,null,2),{encoding:'utf8',mode:0o600});return this.summary(artifact)}
  load(reading:QuranReadingId){const f=this.file(reading);if(!fs.existsSync(f))return null;return validateVectorArtifact(JSON.parse(fs.readFileSync(f,'utf8')) as QuranVectorArtifact)}
  summary(artifact:QuranVectorArtifact|null){if(!artifact)return {status:'OFFICIAL_DATA_UNAVAILABLE' as const,layerCount:0,verifiedWordMappings:0,unresolvedWordLayers:0};return {status:artifact.provenance.status,layerCount:artifact.layers.length,verifiedWordMappings:artifact.layers.filter(x=>x.resolution==='VERIFIED_WORD_MAPPING').length,unresolvedWordLayers:artifact.layers.filter(x=>x.resolution==='UNRESOLVED_VECTOR_LAYER').length,sourceVersion:artifact.sourceVersion}}
  status(reading:QuranReadingId){return this.summary(this.load(reading))}
  resolveWord(input:{reading:QuranReadingId;surah:number;ayah:number;wordIndex:number}){
    const artifact=this.load(input.reading);if(!artifact||artifact.provenance.status!=='VERIFIED')return null;
    return artifact.layers.find(x=>x.resolution==='VERIFIED_WORD_MAPPING'&&x.semanticBinding?.surah===input.surah&&x.semanticBinding.ayah===input.ayah&&x.semanticBinding.wordIndex===input.wordIndex)||null;
  }
}
