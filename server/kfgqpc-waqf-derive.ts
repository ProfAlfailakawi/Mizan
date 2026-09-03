import {quranReadingDefinition,sha256,generatedArtifactDigest} from './quran-intelligence-policy';
import type {ServerQuranSourceRepository,ServerQuranVerse} from './quran-source-repository';
import type {QuranReadingId,WaqfDataset,WaqfOccurrence,WaqfSymbolDefinition} from './quran-intelligence-types';

export const KFGQPC_WAQF_PARSER_VERSION='MIZAN-KFGQPC-WAQF-DERIVER-2.0.0';
export const KFGQPC_WAQF_REGISTRY_VERSION='KFGQPC-MADINAH-WAQF-SYMBOLS-1';

/**
 * Unicode stop/sign characters used by the official KFGQPC Uthmanic developer text.
 * The Arabic labels mirror the visible Mushaf marks; meanings are stored as controlled
 * semantics, not as quotations. The source remains the KFGQPC Mushaf/developer package.
 */
export const KFGQPC_WAQF_SYMBOLS:readonly WaqfSymbolDefinition[]=[
  {symbol:'ۘ',codePoint:'U+06D8',labelArabic:'م',officialMeaning:'وقف لازم',category:'WAQF_LAZIM'},
  {symbol:'ۙ',codePoint:'U+06D9',labelArabic:'لا',officialMeaning:'لا وقف',category:'NO_STOP'},
  {symbol:'ۚ',codePoint:'U+06DA',labelArabic:'ج',officialMeaning:'وقف جائز',category:'WAQF_JAIZ'},
  {symbol:'ۖ',codePoint:'U+06D6',labelArabic:'صلى',officialMeaning:'الوصل أولى',category:'WASL_PREFERRED'},
  {symbol:'ۗ',codePoint:'U+06D7',labelArabic:'قلى',officialMeaning:'الوقف أولى',category:'WAQF_PREFERRED'},
  {symbol:'ۛ',codePoint:'U+06DB',labelArabic:'∴',officialMeaning:'وقف التعانق',category:'MUANAQAH'},
  {symbol:'ۜ',codePoint:'U+06DC',labelArabic:'س',officialMeaning:'سكتة',category:'SAKTAH'}
] as const;

const symbolByChar=new Map(KFGQPC_WAQF_SYMBOLS.map(x=>[x.symbol,x]));
const occurrenceKey=(x:Pick<WaqfOccurrence,'surah'|'ayah'|'symbol'|'sourceCodePointOffset'>)=>`${x.surah}:${x.ayah}:${x.sourceCodePointOffset}:${x.symbol}`;

function scanVerse(reading:QuranReadingId,verse:ServerQuranVerse,sourceUrl:string,sourceVersion:string):WaqfOccurrence[]{
  const text=verse.aya_text;const sourceTextSha256=sha256(text);const out:WaqfOccurrence[]=[];
  let utf16Offset=0,codePointOffset=0;
  for(const ch of text){
    const definition=symbolByChar.get(ch);
    if(definition){
      const evidenceId=`kfgqpc-waqf:${reading}:${verse.sura_no}:${verse.aya_no}:${codePointOffset}:${definition.codePoint}`;
      out.push({reading,surah:verse.sura_no,ayah:verse.aya_no,symbol:ch,displayLabel:definition.labelArabic,sourceSymbol:ch,symbolCodePoint:definition.codePoint,officialMeaning:definition.officialMeaning,category:definition.category,source:sourceUrl,version:sourceVersion,assurance:'KFGQPC_OFFICIAL_DERIVED_METADATA',evidenceId,sourceTextSha256,sourceUtf16Offset:utf16Offset,sourceCodePointOffset:codePointOffset,derivation:'OFFICIAL_QURAN_TEXT_CODEPOINT'});
    }
    utf16Offset+=ch.length;codePointOffset++;
  }
  return out;
}

function coverage(verses:ServerQuranVerse[],occurrences:WaqfOccurrence[]){
  const bySymbol:Record<string,number>={};for(const x of occurrences)bySymbol[x.symbol]=(bySymbol[x.symbol]||0)+1;
  return {verseCountScanned:verses.length,versesWithWaqf:new Set(occurrences.map(x=>`${x.surah}:${x.ayah}`)).size,occurrenceCount:occurrences.length,bySymbol};
}

export function deriveWaqfDatasetFromOfficialSource(quran:ServerQuranSourceRepository,readingInput:string):WaqfDataset{
  const reading=quranReadingDefinition(readingInput);if(!reading)throw new Error('WAQF_READING_UNSUPPORTED');
  const official=quran.officialMetadata(reading.packageId),manifest=quran.manifest(reading.packageId);
  if(manifest.scientificApproval.state!=='CERTIFIED')throw new Error('WAQF_SOURCE_NOT_CERTIFIED');
  if(!manifest.bundleChecksumVerified)throw new Error('WAQF_SOURCE_CHECKSUM_NOT_VERIFIED');
  if(manifest.sourceVersion!==official.sourceVersion||manifest.bundleMd5.toUpperCase()!==official.md5.toUpperCase()||manifest.bundleSha1.toUpperCase()!==official.sha1.toUpperCase())throw new Error('WAQF_SOURCE_CATALOG_MISMATCH');
  const verses=quran.verses(reading.packageId);const occurrences=verses.flatMap(v=>scanVerse(reading.id,v,official.landingPage,official.sourceVersion));
  const dataset:WaqfDataset={version:'MIZAN-KFGQPC-WAQF-2',reading:reading.id,sourcePackageId:reading.packageId,sourceDataSha256:manifest.dataSha256,symbolRegistryVersion:KFGQPC_WAQF_REGISTRY_VERSION,symbolDefinitions:KFGQPC_WAQF_SYMBOLS.map(x=>({...x,source:official.landingPage,sourceVersion:official.sourceVersion,assurance:'KFGQPC_OFFICIAL_METADATA' as const,evidenceId:`kfgqpc-waqf-definition:${x.codePoint}`})),coverage:coverage(verses,occurrences),provenance:{authority:'KFGQPC',sourceUrl:official.landingPage,retrievedAt:manifest.ingestedAt,sourceVersion:official.sourceVersion,officialChecksum:`SHA1:${official.sha1}`,officialChecksumVerified:true,localSha256:manifest.dataSha256,parserVersion:KFGQPC_WAQF_PARSER_VERSION,generatedArtifactSha256:'0'.repeat(64),status:'VERIFIED',note:`Derived deterministically from certified ${reading.packageId} aya_text; no OCR and no cross-riwayah fallback.`},occurrences};
  dataset.provenance.generatedArtifactSha256=generatedArtifactDigest(dataset);return verifyWaqfDatasetAgainstOfficialSource(dataset,quran);
}

export function verifyWaqfDatasetAgainstOfficialSource(dataset:WaqfDataset,quran:ServerQuranSourceRepository):WaqfDataset{
  if(dataset.version!=='MIZAN-KFGQPC-WAQF-2')throw new Error('WAQF_OFFICIAL_VERIFY_REQUIRES_V2');
  const reading=quranReadingDefinition(dataset.reading);if(!reading||reading.packageId!==dataset.sourcePackageId)throw new Error('WAQF_SOURCE_READING_MISMATCH');
  const official=quran.officialMetadata(reading.packageId),manifest=quran.manifest(reading.packageId);if(manifest.scientificApproval.state!=='CERTIFIED')throw new Error('WAQF_SOURCE_NOT_CERTIFIED');if(!manifest.bundleChecksumVerified)throw new Error('WAQF_SOURCE_CHECKSUM_NOT_VERIFIED');
  if(manifest.sourceVersion!==official.sourceVersion||manifest.bundleMd5.toUpperCase()!==official.md5.toUpperCase()||manifest.bundleSha1.toUpperCase()!==official.sha1.toUpperCase())throw new Error('WAQF_SOURCE_CATALOG_MISMATCH');
  if(dataset.sourceDataSha256!==manifest.dataSha256||dataset.provenance.localSha256!==manifest.dataSha256)throw new Error('WAQF_SOURCE_DATA_HASH_MISMATCH');
  if(dataset.provenance.sourceUrl!==official.landingPage||dataset.provenance.sourceVersion!==official.sourceVersion||dataset.provenance.parserVersion!==KFGQPC_WAQF_PARSER_VERSION||dataset.provenance.officialChecksum!==`SHA1:${official.sha1}`||dataset.provenance.officialChecksumVerified!==true||dataset.provenance.status!=='VERIFIED')throw new Error('WAQF_PROVENANCE_MISMATCH');
  if(dataset.symbolRegistryVersion!==KFGQPC_WAQF_REGISTRY_VERSION||dataset.symbolDefinitions?.length!==KFGQPC_WAQF_SYMBOLS.length)throw new Error('WAQF_SYMBOL_REGISTRY_MISMATCH');
  for(const d of KFGQPC_WAQF_SYMBOLS){const actual=dataset.symbolDefinitions?.find(x=>x.codePoint===d.codePoint);if(!actual||actual.symbol!==d.symbol||actual.labelArabic!==d.labelArabic||actual.officialMeaning!==d.officialMeaning||actual.category!==d.category||actual.source!==official.landingPage||actual.sourceVersion!==official.sourceVersion||actual.assurance!=='KFGQPC_OFFICIAL_METADATA')throw new Error(`WAQF_SYMBOL_REGISTRY_ENTRY_MISMATCH:${d.codePoint}`)}
  const verses=quran.verses(reading.packageId),byVerse=new Map(verses.map(v=>[`${v.sura_no}:${v.aya_no}`,v]));
  const expected=verses.flatMap(v=>scanVerse(reading.id,v,official.landingPage,official.sourceVersion));const expectedKeys=new Set(expected.map(occurrenceKey)),actualKeys=new Set<string>();
  for(const x of dataset.occurrences){
    const verse=byVerse.get(`${x.surah}:${x.ayah}`);if(!verse)throw new Error('WAQF_OCCURRENCE_VERSE_MISSING');if(x.derivation!=='OFFICIAL_QURAN_TEXT_CODEPOINT'||x.assurance!=='KFGQPC_OFFICIAL_DERIVED_METADATA'||x.source!==official.landingPage||x.version!==official.sourceVersion)throw new Error('WAQF_DERIVATION_INVALID');
    if(sha256(verse.aya_text)!==x.sourceTextSha256)throw new Error('WAQF_OCCURRENCE_TEXT_HASH_MISMATCH');const chars=Array.from(verse.aya_text),cp=Number(x.sourceCodePointOffset),u16=Number(x.sourceUtf16Offset);if(chars[cp]!==x.sourceSymbol||Array.from(verse.aya_text.slice(0,u16)).length!==cp||verse.aya_text.slice(u16,u16+String(x.sourceSymbol||'').length)!==x.sourceSymbol)throw new Error('WAQF_OCCURRENCE_OFFSET_MISMATCH');
    const def=symbolByChar.get(x.sourceSymbol);if(!def||def.codePoint!==x.symbolCodePoint||x.symbol!==x.sourceSymbol||def.labelArabic!==x.displayLabel||def.category!==x.category||def.officialMeaning!==x.officialMeaning)throw new Error('WAQF_OCCURRENCE_SYMBOL_DEFINITION_MISMATCH');
    const expectedEvidence=`kfgqpc-waqf:${reading.id}:${x.surah}:${x.ayah}:${cp}:${def.codePoint}`;if(x.evidenceId!==expectedEvidence)throw new Error('WAQF_OCCURRENCE_EVIDENCE_ID_MISMATCH');
    const key=occurrenceKey(x);if(actualKeys.has(key))throw new Error('WAQF_OCCURRENCE_DUPLICATE');actualKeys.add(key);
  }
  if(actualKeys.size!==expectedKeys.size)throw new Error('WAQF_COVERAGE_COUNT_MISMATCH');for(const key of expectedKeys)if(!actualKeys.has(key))throw new Error(`WAQF_COVERAGE_MISSING:${key}`);for(const key of actualKeys)if(!expectedKeys.has(key))throw new Error(`WAQF_COVERAGE_EXTRANEOUS:${key}`);
  const computed=coverage(verses,dataset.occurrences),actualCoverage=dataset.coverage;if(!actualCoverage||actualCoverage.verseCountScanned!==computed.verseCountScanned||actualCoverage.versesWithWaqf!==computed.versesWithWaqf||actualCoverage.occurrenceCount!==computed.occurrenceCount)throw new Error('WAQF_COVERAGE_SUMMARY_MISMATCH');for(const [symbol,count] of Object.entries(computed.bySymbol))if(actualCoverage.bySymbol[symbol]!==count)throw new Error('WAQF_COVERAGE_SYMBOL_COUNT_MISMATCH');for(const symbol of Object.keys(actualCoverage.bySymbol))if(computed.bySymbol[symbol]===undefined)throw new Error('WAQF_COVERAGE_EXTRANEOUS_SYMBOL');
  if(generatedArtifactDigest(dataset)!==dataset.provenance.generatedArtifactSha256)throw new Error('WAQF_GENERATED_HASH_MISMATCH');return dataset;
}
