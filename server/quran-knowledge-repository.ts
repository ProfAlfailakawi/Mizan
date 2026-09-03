import fs from 'fs';
import path from 'path';
import {generatedArtifactDigest,officialKfgqpcUrl,quranReadingDefinition,validateDatasetProvenance} from './quran-intelligence-policy';
import type {QuranReadingId,TajweedDataset,TajweedOccurrence,TajweedRule,WaqfDataset,WaqfOccurrence} from './quran-intelligence-types';

const safe=(v:string)=>v.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
const pos=(v:unknown)=>Number.isInteger(Number(v))&&Number(v)>0;
function assertReading(v:string){const r=quranReadingDefinition(v);if(!r||r.id!==v)throw new Error('QURAN_KNOWLEDGE_READING_INVALID');return r}
function assertOfficialSource(v:string){if(!officialKfgqpcUrl(v))throw new Error('QURAN_KNOWLEDGE_SOURCE_NOT_KFGQPC')}
const assurances=new Set(['KFGQPC_OFFICIAL_METADATA','KFGQPC_OFFICIAL_DERIVED_METADATA','HUMAN_VERIFIED_WITH_EVIDENCE']);
function assertAssurance(v:string){if(!assurances.has(v))throw new Error('QURAN_KNOWLEDGE_ASSURANCE_INVALID')}

export function validateWaqfDataset(input:WaqfDataset):WaqfDataset{
  if(input.version!=='MIZAN-KFGQPC-WAQF-1'&&input.version!=='MIZAN-KFGQPC-WAQF-2')throw new Error('WAQF_DATASET_VERSION_INVALID');assertReading(input.reading);validateDatasetProvenance(input.provenance);
  if(input.version==='MIZAN-KFGQPC-WAQF-2'){
    if(!input.sourcePackageId?.trim()||!input.sourceDataSha256?.match(/^[a-f0-9]{64}$/i)||!input.symbolRegistryVersion?.trim()||!input.symbolDefinitions?.length||!input.coverage)throw new Error('WAQF_V2_SOURCE_METADATA_INCOMPLETE');
    if(input.coverage.occurrenceCount!==input.occurrences.length||input.coverage.verseCountScanned<1||input.coverage.versesWithWaqf<0||input.coverage.versesWithWaqf>input.coverage.verseCountScanned)throw new Error('WAQF_V2_COVERAGE_INVALID');
    const defs=new Set<string>();for(const d of input.symbolDefinitions){if(!d.symbol||!d.codePoint||!d.labelArabic||!d.officialMeaning||!d.category)throw new Error('WAQF_SYMBOL_DEFINITION_INVALID');if(defs.has(d.codePoint))throw new Error('WAQF_SYMBOL_DEFINITION_DUPLICATE');defs.add(d.codePoint);if(d.source)assertOfficialSource(d.source);if(d.assurance)assertAssurance(d.assurance)}
  }
  const seen=new Set<string>();
  for(const x of input.occurrences){
    if(x.reading!==input.reading||!pos(x.surah)||x.surah>114||!pos(x.ayah))throw new Error('WAQF_OCCURRENCE_LOCUS_INVALID');
    if(x.wordIndex!==undefined&&!pos(x.wordIndex))throw new Error('WAQF_WORD_INDEX_INVALID');
    if(!x.symbol.trim()||!x.officialMeaning.trim()||!x.category.trim()||!x.evidenceId.trim())throw new Error('WAQF_OCCURRENCE_METADATA_INCOMPLETE');
    assertOfficialSource(x.source);assertAssurance(x.assurance);
    if(input.version==='MIZAN-KFGQPC-WAQF-2'){
      if(x.wordIndex!==undefined)throw new Error('WAQF_DERIVED_WORD_INDEX_FORBIDDEN');
      if(!x.sourceSymbol||!x.symbolCodePoint||!x.sourceTextSha256?.match(/^[a-f0-9]{64}$/i)||!Number.isInteger(x.sourceUtf16Offset)||Number(x.sourceUtf16Offset)<0||!Number.isInteger(x.sourceCodePointOffset)||Number(x.sourceCodePointOffset)<0||x.derivation!=='OFFICIAL_QURAN_TEXT_CODEPOINT')throw new Error('WAQF_V2_OCCURRENCE_EVIDENCE_INCOMPLETE');
    }
    const key=[x.surah,x.ayah,x.wordIndex||'',x.afterToken||'',x.symbol,x.evidenceId].join(':');if(seen.has(key))throw new Error('WAQF_OCCURRENCE_DUPLICATE');seen.add(key);
  }
  if(input.provenance.status==='VERIFIED'&&generatedArtifactDigest(input)!==input.provenance.generatedArtifactSha256)throw new Error('WAQF_GENERATED_HASH_MISMATCH');
  return input;
}

export function validateTajweedDataset(input:TajweedDataset):TajweedDataset{
  if(input.version!=='MIZAN-KFGQPC-TAJWEED-1')throw new Error('TAJWEED_DATASET_VERSION_INVALID');assertReading(input.reading);validateDatasetProvenance(input.provenance);if(!input.taxonomyVersion.trim())throw new Error('TAJWEED_TAXONOMY_VERSION_REQUIRED');
  const evidence=new Map(input.evidence.map(e=>[e.id,e]));if(evidence.size!==input.evidence.length)throw new Error('TAJWEED_EVIDENCE_DUPLICATE');for(const e of input.evidence){if(!e.id.trim()||!e.locator.trim()||!e.sourceVersion.trim())throw new Error('TAJWEED_EVIDENCE_INVALID');assertOfficialSource(e.source);assertAssurance(e.assurance)}
  const rules=new Map<string,TajweedRule>();for(const r of input.rules){if(rules.has(r.id))throw new Error('TAJWEED_RULE_DUPLICATE');if(!r.id.trim()||!r.version.trim()||!r.nameArabic.trim()||!r.category.trim()||!r.summaryArabic.trim()||!r.evidenceIds.length)throw new Error('TAJWEED_RULE_INVALID');for(const id of r.evidenceIds)if(!evidence.has(id))throw new Error(`TAJWEED_RULE_EVIDENCE_MISSING:${id}`);rules.set(r.id,r)}
  const occSeen=new Set<string>();for(const o of input.occurrences){validateTajweedOccurrence(o,input.reading,rules,evidence);if(occSeen.has(o.id))throw new Error('TAJWEED_OCCURRENCE_DUPLICATE');occSeen.add(o.id)}
  if(input.provenance.status==='VERIFIED'&&generatedArtifactDigest(input)!==input.provenance.generatedArtifactSha256)throw new Error('TAJWEED_GENERATED_HASH_MISMATCH');
  return input;
}

function validateTajweedOccurrence(o:TajweedOccurrence,reading:QuranReadingId,rules:Map<string,TajweedRule>,evidence:Map<string,unknown>){
  if(!o.id.trim()||o.reading!==reading||!pos(o.surah)||o.surah>114||!pos(o.ayah)||!rules.has(o.ruleId)||!o.evidenceIds.length)throw new Error('TAJWEED_OCCURRENCE_INVALID');assertAssurance(o.assurance);
  if(o.wordIndex!==undefined&&!pos(o.wordIndex))throw new Error('TAJWEED_WORD_INDEX_INVALID');
  if((o.graphemeStart!==undefined||o.graphemeEnd!==undefined)&&(!Number.isInteger(o.graphemeStart)||!Number.isInteger(o.graphemeEnd)||Number(o.graphemeStart)<0||Number(o.graphemeEnd)<Number(o.graphemeStart)))throw new Error('TAJWEED_GRAPHEME_RANGE_INVALID');
  for(const id of o.evidenceIds)if(!evidence.has(id))throw new Error(`TAJWEED_OCCURRENCE_EVIDENCE_MISSING:${id}`);
  const fineGrained=o.wordIndex!==undefined||o.graphemeStart!==undefined||o.graphemeEnd!==undefined;if(fineGrained&&o.assurance==='HUMAN_VERIFIED_WITH_EVIDENCE'&&!o.humanReviewed)throw new Error('TAJWEED_FINE_GRAINED_REQUIRES_HUMAN_REVIEW');
}

export class QuranKnowledgeRepository{
  constructor(private root:string){fs.mkdirSync(root,{recursive:true,mode:0o700})}
  private waqfFile(reading:QuranReadingId){return path.join(this.root,`waqf-${safe(reading)}.json`)}
  private tajweedFile(reading:QuranReadingId){return path.join(this.root,`tajweed-${safe(reading)}.json`)}
  registerWaqf(input:WaqfDataset){const data=validateWaqfDataset(input);fs.writeFileSync(this.waqfFile(data.reading),JSON.stringify(data,null,2),{encoding:'utf8',mode:0o600});return this.waqfStatus(data.reading)}
  registerTajweed(input:TajweedDataset){const data=validateTajweedDataset(input);fs.writeFileSync(this.tajweedFile(data.reading),JSON.stringify(data,null,2),{encoding:'utf8',mode:0o600});return this.tajweedStatus(data.reading)}
  loadWaqf(reading:QuranReadingId){const f=this.waqfFile(reading);if(!fs.existsSync(f))return null;return validateWaqfDataset(JSON.parse(fs.readFileSync(f,'utf8')) as WaqfDataset)}
  loadTajweed(reading:QuranReadingId){const f=this.tajweedFile(reading);if(!fs.existsSync(f))return null;return validateTajweedDataset(JSON.parse(fs.readFileSync(f,'utf8')) as TajweedDataset)}
  waqfStatus(reading:QuranReadingId){const x=this.loadWaqf(reading);return x?{status:x.provenance.status,schemaVersion:x.version,occurrences:x.occurrences.length,sourceVersion:x.provenance.sourceVersion,sourcePackageId:x.sourcePackageId,symbolRegistryVersion:x.symbolRegistryVersion,coverage:x.coverage}:{status:'OFFICIAL_DATA_UNAVAILABLE' as const,occurrences:0}}
  tajweedStatus(reading:QuranReadingId){const x=this.loadTajweed(reading);return x?{status:x.provenance.status,rules:x.rules.length,occurrences:x.occurrences.length,taxonomyVersion:x.taxonomyVersion,sourceVersion:x.provenance.sourceVersion}:{status:'OFFICIAL_DATA_UNAVAILABLE' as const,rules:0,occurrences:0}}
  waqfForAyah(reading:QuranReadingId,surah:number,ayah:number):WaqfOccurrence[]{const x=this.loadWaqf(reading);if(!x||x.provenance.status!=='VERIFIED')return [];return x.occurrences.filter(o=>o.surah===surah&&o.ayah===ayah)}
  tajweedForAyah(reading:QuranReadingId,surah:number,ayah:number){const x=this.loadTajweed(reading);if(!x||x.provenance.status!=='VERIFIED')return {rules:[] as TajweedRule[],occurrences:[] as TajweedOccurrence[]};const occurrences=x.occurrences.filter(o=>o.surah===surah&&o.ayah===ayah),ids=new Set(occurrences.map(o=>o.ruleId));return {occurrences,rules:x.rules.filter(r=>ids.has(r.id))}}
}
