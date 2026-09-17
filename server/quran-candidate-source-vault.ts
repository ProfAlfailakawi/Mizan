import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  candidateSourceForRawi,
  type QuranCandidateReviewState,
  type QuranCandidateSource,
} from '../src/lib/quran-candidate-sources';

export interface CandidateQuranVerse {
  sura_no: number;
  aya_no: number;
  aya_text: string;
}

export interface CandidateReviewEvent {
  state: QuranCandidateReviewState;
  reviewerId: string;
  reviewedAt: string;
  packageHash: string;
  note?: string;
}

export interface CandidateQuranManifest {
  version: 1;
  protocol: 'MIZAN-QURAN-CANDIDATE-SOURCE-1';
  packageId: string;
  rawiId: string;
  deliveryKey: string;
  authority: 'ISLAMWEB_DERIVED';
  role: 'FULL_TEXT_CANDIDATE';
  upstreamRepository: string;
  upstreamCommit: string;
  upstreamPath: string;
  upstreamUrl: string;
  extractionRecordUrl: string;
  permissionState: 'OWNER_REPORTED_PERMISSION';
  expectedSurahCount: number;
  expectedVerseCount: number;
  nativeCountFamily: string;
  actualSurahCount: number;
  actualVerseCount: number;
  compressedSha256: string;
  inflatedSha256: string;
  normalizedSha256: string;
  packageHash: string;
  sourceFile: string;
  dataFile: string;
  reviewPacketFile: string;
  ingestedAt: string;
  ingestedBy: string;
  machineChecks: {
    rawDeflateDecoded: true;
    utf8JsonParsed: true;
    exactly114Surahs: true;
    exactNativeVerseCount: true;
    contiguousNativeAyahIds: true;
    duplicateAyahIds: 0;
    emptyAyahTexts: 0;
    boundaryWhitespaceTexts: 0;
  };
  review: {
    state: QuranCandidateReviewState;
    history: CandidateReviewEvent[];
  };
  caveat?: string;
}

export interface CandidateReviewPacket {
  protocol: 'MIZAN-QURAN-SCHOLAR-REVIEW-PACKET-1';
  generatedAt: string;
  package: CandidateQuranManifest;
  committeeDecisionRequired: true;
  automaticApproval: false;
  references: {
    upstreamFile: string;
    extractionRecord: string;
    nquran: 'https://nquran.com/';
    multiQiraatFacsimiles: 'https://multiqiraat.github.io/mushaf-qiraats/';
  };
  checklist: string[];
}

const MAX_COMPRESSED_BYTES = 8 * 1024 * 1024;
const MAX_INFLATED_BYTES = 64 * 1024 * 1024;
const digest = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex').toLowerCase();
const safe = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
};

function upstreamUrl(source: QuranCandidateSource) {
  return `https://github.com/${source.upstreamRepository}/blob/${source.upstreamCommit}/${source.upstreamPath}`;
}
function extractionRecordUrl(source: QuranCandidateSource) {
  return `https://github.com/${source.upstreamRepository}/blob/${source.upstreamCommit}/Resources/JSONs-Deprecated/Qiraat/_staging-riwayat/README.md`;
}

/**
 * Decode exactly the payload format documented by Al-Islam-iOS BetaQiraatStore:
 * raw-deflate JSON shaped as {"1":[{"id":1,"text":"..."}], ...}.
 * No Quran text is invented, normalized, merged, or renumbered here.
 */
export function parseCandidateRawDeflate(bytes: Buffer, source: QuranCandidateSource): CandidateQuranVerse[] {
  if (!bytes.length || bytes.length > MAX_COMPRESSED_BYTES) throw new Error('QURAN_CANDIDATE_COMPRESSED_SIZE_INVALID');
  let inflated: Buffer;
  try {
    inflated = zlib.inflateRawSync(bytes, { maxOutputLength: MAX_INFLATED_BYTES });
  } catch {
    throw new Error('QURAN_CANDIDATE_RAW_DEFLATE_INVALID');
  }
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(inflated);
  } catch {
    throw new Error('QURAN_CANDIDATE_UTF8_INVALID');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(decoded);
  } catch {
    throw new Error('QURAN_CANDIDATE_JSON_INVALID');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('QURAN_CANDIDATE_JSON_SHAPE_INVALID');

  const table = raw as Record<string, unknown>;
  const keys = Object.keys(table);
  if (keys.length !== source.expectedSurahCount) throw new Error(`QURAN_CANDIDATE_SURAH_COUNT:${keys.length}:${source.expectedSurahCount}`);

  const rows: CandidateQuranVerse[] = [];
  for (let surah = 1; surah <= source.expectedSurahCount; surah++) {
    const entries = table[String(surah)];
    if (!Array.isArray(entries)) throw new Error(`QURAN_CANDIDATE_SURAH_MISSING:${surah}`);
    const seen = new Set<number>();
    const parsed = entries.map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`QURAN_CANDIDATE_AYAH_SHAPE:${surah}:${index + 1}`);
      const object = entry as Record<string, unknown>;
      const aya = Number(object.id);
      const text = object.text;
      if (!Number.isInteger(aya) || aya < 1) throw new Error(`QURAN_CANDIDATE_AYAH_ID_INVALID:${surah}:${String(object.id)}`);
      if (seen.has(aya)) throw new Error(`QURAN_CANDIDATE_DUPLICATE_AYAH:${surah}:${aya}`);
      seen.add(aya);
      if (typeof text !== 'string' || !text.length) throw new Error(`QURAN_CANDIDATE_EMPTY_TEXT:${surah}:${aya}`);
      if (text !== text.trim()) throw new Error(`QURAN_CANDIDATE_TEXT_BOUNDARY_WHITESPACE:${surah}:${aya}`);
      return { sura_no: surah, aya_no: aya, aya_text: text } satisfies CandidateQuranVerse;
    }).sort((a, b) => a.aya_no - b.aya_no);
    for (let i = 0; i < parsed.length; i++) {
      if (parsed[i].aya_no !== i + 1) throw new Error(`QURAN_CANDIDATE_NATIVE_AYAH_GAP:${surah}:${i + 1}:${parsed[i].aya_no}`);
    }
    rows.push(...parsed);
  }
  if (rows.length !== source.expectedVerseCount) throw new Error(`QURAN_CANDIDATE_VERSE_COUNT:${rows.length}:${source.expectedVerseCount}`);
  return rows;
}

function manifestHash(input: Omit<CandidateQuranManifest, 'packageHash' | 'review' | 'reviewPacketFile'>) {
  return digest(canonical({
    rawiId: input.rawiId,
    deliveryKey: input.deliveryKey,
    authority: input.authority,
    upstreamRepository: input.upstreamRepository,
    upstreamCommit: input.upstreamCommit,
    upstreamPath: input.upstreamPath,
    permissionState: input.permissionState,
    expectedSurahCount: input.expectedSurahCount,
    expectedVerseCount: input.expectedVerseCount,
    nativeCountFamily: input.nativeCountFamily,
    actualSurahCount: input.actualSurahCount,
    actualVerseCount: input.actualVerseCount,
    compressedSha256: input.compressedSha256,
    inflatedSha256: input.inflatedSha256,
    normalizedSha256: input.normalizedSha256,
  }));
}

export class CandidateQuranSourceVault {
  constructor(private root: string) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  }

  private dir(rawiId: string) { return path.join(this.root, safe(rawiId)); }
  private manifestPath(rawiId: string) { return path.join(this.dir(rawiId), 'manifest.json'); }
  private packetPath(rawiId: string) { return path.join(this.dir(rawiId), 'scholar-review-packet.json'); }

  manifest(rawiId: string): CandidateQuranManifest {
    const file = this.manifestPath(rawiId);
    if (!fs.existsSync(file)) throw new Error('QURAN_CANDIDATE_NOT_INGESTED');
    return JSON.parse(fs.readFileSync(file, 'utf8')) as CandidateQuranManifest;
  }

  status() {
    return Object.values(requireCandidateRegistry()).map(source => {
      if (!fs.existsSync(this.manifestPath(source.rawiId))) return { rawiId: source.rawiId, state: 'NOT_INGESTED' as const };
      const manifest = this.manifest(source.rawiId);
      return { rawiId: source.rawiId, state: manifest.review.state, packageHash: manifest.packageHash, normalizedSha256: manifest.normalizedSha256 };
    });
  }

  ingest(input: { rawiId: string; sourcePath: string; ingestedBy: string }): CandidateQuranManifest {
    const source = candidateSourceForRawi(input.rawiId);
    if (!source) throw new Error('QURAN_CANDIDATE_RAWI_UNSUPPORTED');
    const sourceBytes = fs.readFileSync(input.sourcePath);
    const rows = parseCandidateRawDeflate(sourceBytes, source);
    const inflated = zlib.inflateRawSync(sourceBytes, { maxOutputLength: MAX_INFLATED_BYTES });
    const normalizedBytes = Buffer.from(JSON.stringify(rows), 'utf8');
    const compressedSha256 = digest(sourceBytes);
    const inflatedSha256 = digest(inflated);
    const normalizedSha256 = digest(normalizedBytes);
    const now = new Date().toISOString();
    const dir = this.dir(source.rawiId);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

    if (fs.existsSync(this.manifestPath(source.rawiId))) {
      const previous = this.manifest(source.rawiId);
      if (previous.compressedSha256 === compressedSha256 && previous.upstreamCommit === source.upstreamCommit) return previous;
      throw new Error('QURAN_CANDIDATE_SOURCE_BYTES_CHANGED_REQUIRES_NEW_PIN');
    }

    const packageId = `islamweb-derived-${source.deliveryKey}-${source.upstreamCommit.slice(0, 12)}`;
    const sourceFile = path.basename(source.upstreamPath);
    const dataFile = 'verses.json';
    const seed: Omit<CandidateQuranManifest, 'packageHash' | 'review' | 'reviewPacketFile'> = {
      version: 1,
      protocol: 'MIZAN-QURAN-CANDIDATE-SOURCE-1',
      packageId,
      rawiId: source.rawiId,
      deliveryKey: source.deliveryKey,
      authority: source.authority,
      role: source.role,
      upstreamRepository: source.upstreamRepository,
      upstreamCommit: source.upstreamCommit,
      upstreamPath: source.upstreamPath,
      upstreamUrl: upstreamUrl(source),
      extractionRecordUrl: extractionRecordUrl(source),
      permissionState: source.permissionState,
      expectedSurahCount: source.expectedSurahCount,
      expectedVerseCount: source.expectedVerseCount,
      nativeCountFamily: source.nativeCountFamily,
      actualSurahCount: new Set(rows.map(row => row.sura_no)).size,
      actualVerseCount: rows.length,
      compressedSha256,
      inflatedSha256,
      normalizedSha256,
      sourceFile,
      dataFile,
      ingestedAt: now,
      ingestedBy: input.ingestedBy || 'candidate-import',
      machineChecks: {
        rawDeflateDecoded: true,
        utf8JsonParsed: true,
        exactly114Surahs: true,
        exactNativeVerseCount: true,
        contiguousNativeAyahIds: true,
        duplicateAyahIds: 0,
        emptyAyahTexts: 0,
        boundaryWhitespaceTexts: 0,
      },
      ...(source.caveat ? { caveat: source.caveat } : {}),
    };
    const packageHash = manifestHash(seed);
    const manifest: CandidateQuranManifest = {
      ...seed,
      packageHash,
      reviewPacketFile: 'scholar-review-packet.json',
      review: { state: 'PENDING_SCHOLAR_REVIEW', history: [] },
    };

    fs.writeFileSync(path.join(dir, sourceFile), sourceBytes, { mode: 0o600 });
    fs.writeFileSync(path.join(dir, dataFile), normalizedBytes, { mode: 0o600 });
    fs.writeFileSync(this.manifestPath(source.rawiId), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    this.writeReviewPacket(manifest);
    return manifest;
  }

  review(input: { rawiId: string; state: Exclude<QuranCandidateReviewState, 'PENDING_SCHOLAR_REVIEW'> | 'PENDING_SCHOLAR_REVIEW'; reviewerId: string; note?: string; expectedPackageHash?: string }) {
    if (!input.reviewerId.trim()) throw new Error('QURAN_CANDIDATE_REVIEWER_REQUIRED');
    const manifest = this.manifest(input.rawiId);
    if (input.expectedPackageHash && input.expectedPackageHash !== manifest.packageHash) throw new Error('QURAN_CANDIDATE_REVIEW_PACKAGE_HASH_MISMATCH');
    const allowed: QuranCandidateReviewState[] = ['PENDING_SCHOLAR_REVIEW', 'APPROVED', 'NEEDS_FIX', 'REJECTED'];
    if (!allowed.includes(input.state)) throw new Error('QURAN_CANDIDATE_REVIEW_STATE_INVALID');
    const event: CandidateReviewEvent = {
      state: input.state,
      reviewerId: input.reviewerId.trim(),
      reviewedAt: new Date().toISOString(),
      packageHash: manifest.packageHash,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    };
    manifest.review = { state: input.state, history: [...manifest.review.history, event] };
    fs.writeFileSync(this.manifestPath(input.rawiId), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    this.writeReviewPacket(manifest);
    return manifest;
  }

  verses(rawiId: string, requireApproved = true): CandidateQuranVerse[] {
    const manifest = this.manifest(rawiId);
    if (requireApproved && manifest.review.state !== 'APPROVED') throw new Error('QURAN_CANDIDATE_NOT_APPROVED');
    const file = path.join(this.dir(rawiId), manifest.dataFile);
    const bytes = fs.readFileSync(file);
    if (digest(bytes) !== manifest.normalizedSha256) throw new Error('QURAN_CANDIDATE_NORMALIZED_HASH_MISMATCH');
    const rows = JSON.parse(bytes.toString('utf8')) as CandidateQuranVerse[];
    if (rows.length !== manifest.actualVerseCount) throw new Error('QURAN_CANDIDATE_NORMALIZED_COUNT_MISMATCH');
    return rows;
  }

  reviewPacket(rawiId: string): CandidateReviewPacket {
    const file = this.packetPath(rawiId);
    if (!fs.existsSync(file)) throw new Error('QURAN_CANDIDATE_REVIEW_PACKET_NOT_FOUND');
    return JSON.parse(fs.readFileSync(file, 'utf8')) as CandidateReviewPacket;
  }

  private writeReviewPacket(manifest: CandidateQuranManifest) {
    const packet: CandidateReviewPacket = {
      protocol: 'MIZAN-QURAN-SCHOLAR-REVIEW-PACKET-1',
      generatedAt: new Date().toISOString(),
      package: manifest,
      committeeDecisionRequired: true,
      automaticApproval: false,
      references: {
        upstreamFile: manifest.upstreamUrl,
        extractionRecord: manifest.extractionRecordUrl,
        nquran: 'https://nquran.com/',
        multiQiraatFacsimiles: 'https://multiqiraat.github.io/mushaf-qiraats/',
      },
      checklist: [
        'طابق النص مع المصحف المصور للرواية آيةً وكلمةً قبل الاعتماد.',
        'راجع مواضع الفرش والأصول والضبط وعلامات الوقف التي تختلف عن مصادر رقمية أخرى.',
        'تحقق من الترقيم الأصلي للرواية ومن أي دمج/فصل للآيات قبل بناء crosswalk إلى Mizan canonical locus.',
        'لا تُعامل اختلاف المصدر المرجعي الخارجي على أنه خطأ تلقائيًا؛ سجّل حكم اللجنة مع الدليل.',
        ...(manifest.rawiId === 'ishaq' || manifest.rawiId === 'idris'
          ? ['افحص صراحةً قضية تطابق متن إسحاق وإدريس في مصدر Islamweb قبل الاعتماد.']
          : []),
      ],
    };
    fs.writeFileSync(this.packetPath(manifest.rawiId), `${JSON.stringify(packet, null, 2)}\n`, { mode: 0o600 });
  }
}

function requireCandidateRegistry() {
  const entries = new Map<string, QuranCandidateSource>();
  // Avoid exporting mutable state while preserving a single source of truth.
  for (const rawiId of ['hisham','ibn-dhakwan','khalaf-hamzah','khallad','abu-al-harith','al-duri-kisai','ibn-wardan','ibn-jammaz','ruways','rawh','ishaq','idris']) {
    const source = candidateSourceForRawi(rawiId);
    if (!source) throw new Error(`QURAN_CANDIDATE_REGISTRY_INCOMPLETE:${rawiId}`);
    entries.set(rawiId, source);
  }
  return Object.fromEntries(entries);
}
