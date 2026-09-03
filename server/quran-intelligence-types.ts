export type QuranReadingId='hafs'|'warsh'|'shubah'|'qaloun'|'douri-abu-amr'|'sousi-abu-amr';
export type QuranDatasetStatus='VERIFIED'|'QUARANTINED'|'UNVERIFIED'|'OFFICIAL_DATA_UNAVAILABLE';
export type QuranAssurance='KFGQPC_OFFICIAL_METADATA'|'KFGQPC_OFFICIAL_DERIVED_METADATA'|'HUMAN_VERIFIED_WITH_EVIDENCE';

export interface QuranDatasetProvenance{
  authority:'KFGQPC';
  sourceUrl:string;
  retrievedAt:string;
  sourceVersion:string;
  officialChecksum?:string;
  officialChecksumVerified?:boolean;
  localSha256:string;
  parserVersion:string;
  generatedArtifactSha256:string;
  status:QuranDatasetStatus;
  reviewedBy?:string[];
  reviewedAt?:string;
  note?:string;
}

export interface QuranPageLocus{
  page:number;
  lineStart:number;
  lineEnd:number;
  lineCount:number;
}

export interface CanonicalAyahLocation{
  reading:QuranReadingId;
  surah:number;
  ayah:number;
  page:number;
  lineStart:number;
  lineEnd:number;
  loci:QuranPageLocus[];
  sourcePackage:string;
  sourceVersion:string;
  sourceAuthority:'KFGQPC';
  checksum:string;
  verifiedAt:string;
  assurance:'KFGQPC_OFFICIAL_METADATA';
}

export type VectorLayerResolution='VERIFIED_WORD_MAPPING'|'UNRESOLVED_VECTOR_LAYER'|'NON_WORD_VECTOR_LAYER';
export interface NormalizedBBox{x:number;y:number;width:number;height:number}
export interface QuranVectorLayer{
  page:number;
  sourceLayerId:string;
  layerName?:string;
  line?:number;
  normalizedBBox?:NormalizedBBox;
  semanticBinding?:{surah:number;ayah:number;wordIndex:number;evidenceId:string;method:'OFFICIAL_SOURCE_MAPPING'|'HUMAN_VERIFIED_WITH_EVIDENCE'};
  resolution:VectorLayerResolution;
}
export interface QuranVectorArtifact{
  version:'MIZAN-KFGQPC-VECTOR-METADATA-1';
  reading:QuranReadingId;
  sourceAssetId:string;
  sourceVersion:string;
  provenance:QuranDatasetProvenance;
  layers:QuranVectorLayer[];
}

export interface WaqfOccurrence{
  reading:QuranReadingId;
  surah:number;
  ayah:number;
  wordIndex?:number;
  afterToken?:string;
  symbol:string;
  officialMeaning:string;
  category:string;
  source:string;
  version:string;
  assurance:QuranAssurance;
  evidenceId:string;
}
export interface WaqfDataset{
  version:'MIZAN-KFGQPC-WAQF-1';
  reading:QuranReadingId;
  provenance:QuranDatasetProvenance;
  occurrences:WaqfOccurrence[];
}

export interface TajweedEvidence{
  id:string;
  source:string;
  sourceVersion:string;
  locator:string;
  assurance:QuranAssurance;
}
export interface TajweedRule{
  id:string;
  version:string;
  nameArabic:string;
  nameEnglish?:string;
  category:string;
  summaryArabic:string;
  evidenceIds:string[];
}
export interface TajweedOccurrence{
  id:string;
  reading:QuranReadingId;
  surah:number;
  ayah:number;
  wordIndex?:number;
  graphemeStart?:number;
  graphemeEnd?:number;
  ruleId:string;
  evidenceIds:string[];
  assurance:QuranAssurance;
  humanReviewed:boolean;
}
export interface TajweedDataset{
  version:'MIZAN-KFGQPC-TAJWEED-1';
  reading:QuranReadingId;
  provenance:QuranDatasetProvenance;
  taxonomyVersion:string;
  rules:TajweedRule[];
  evidence:TajweedEvidence[];
  occurrences:TajweedOccurrence[];
}

export type AlignmentState='LOCKED'|'PROBABLE'|'UNCERTAIN'|'LOST'|'REACQUIRING'|'REACQUIRED';
export type AlignmentRecoveryState='NONE'|'REPEAT'|'BACKTRACK'|'SKIP'|'SILENCE'|'RESTART'|'MID_PASSAGE_START';
export interface AlignmentPosition{surah:number;ayah:number;wordIndex:number;phonemeIndex?:number}
export interface AlignmentAlternative extends AlignmentPosition{confidence:number}
export interface QuranAcousticObservation{
  timestamp:string;
  reading:QuranReadingId;
  candidate?:AlignmentPosition;
  confidence:number;
  alternatives?:AlignmentAlternative[];
  silenceMs?:number;
  acousticQuality?:number;
}
export interface QuranAlignmentOutput{
  timestamp:string;
  reading:QuranReadingId;
  surah?:number;
  ayah?:number;
  wordIndex?:number;
  phonemeIndex?:number;
  confidence:number;
  smoothedConfidence:number;
  alignmentState:AlignmentState;
  alternatives:AlignmentAlternative[];
  recoveryState:AlignmentRecoveryState;
  pointerMoved:boolean;
  scoreAuthority:'HUMAN_ONLY';
  scoreDelta:0;
  shadowMode:true;
}

export interface QuranAlignmentBenchmarkSlice{
  name:'child'|'adult'|'noise'|'female'|'male'|'fast'|'slow'|'non_arabic_native'|string;
  sampleCount:number;
  ayahLocalizationAccuracy:number;
  wordAlignmentAccuracy:number;
  reacquisitionAccuracy:number;
  p95LatencyMs:number;
}
export interface QuranAlignmentBenchmarkReport{
  version:'MIZAN-QURAN-ALIGNMENT-BENCHMARK-1';
  reading:QuranReadingId;
  datasetId:string;
  modelVersion:string;
  measuredAt:string;
  metrics:{
    falseAcceptRate:number;
    falseRejectRate:number;
    ayahLocalizationAccuracy:number;
    wordAlignmentAccuracy:number;
    reacquisitionAccuracy:number;
    p95LatencyMs:number;
  };
  approvedThresholds:{
    maxFalseAcceptRate:number;
    maxFalseRejectRate:number;
    minAyahLocalizationAccuracy:number;
    minWordAlignmentAccuracy:number;
    minReacquisitionAccuracy:number;
    maxP95LatencyMs:number;
  };
  slices:QuranAlignmentBenchmarkSlice[];
  approvedBy:string[];
}
