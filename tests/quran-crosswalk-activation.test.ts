/*
 * P4 — canonical ↔ native crosswalk activation.
 *
 * These tests are the gate itself, not a description of it: the pin, the frozen bytes, the schema
 * parser, the 114-surah count identity per rawi, and the fail-closed rule are all proved here from
 * the real in-repo artifact — never from a fixture standing in for it.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { ayahCountOf } from '../src/lib/quran-canon';
import { CANONICAL_RAWI_IDS } from '../src/lib/canonical-readings';
import {
  NATIVE_SURAH_AYAH_COUNTS,
  nativeAyahCountOf,
} from '../src/lib/quran-native-count-systems';
import { QURAN_WS_BOUNDARY_SOURCE } from '../src/lib/quran-count-boundary-source';
import {
  CROSSWALK_CANDIDATE_SYSTEMS,
  loadFrozenBoundaryBytes,
  parseBoundaryDocument,
  runCrosswalkActivation,
  verifyFrozenBytes,
} from '../scripts/quran-crosswalk-activate';
import {
  BOUNDARY_EVIDENCE_BUILD,
  GENERATED_BOUNDARY_SYSTEMS,
} from '../src/lib/quran-crosswalk-boundary-evidence.generated';
import {
  COMMITTEE_CROSSWALK_ROWS,
  COMMITTEE_CROSSWALK_VERSION,
  CROSSWALK_ACTIVATED_RAWIS,
} from '../src/lib/quran-crosswalk-evidence';
import {
  MIZAN_IDENTITY_CROSSWALK,
  crosswalkCoverage,
  validateCrosswalkRow,
  CrosswalkError,
  type QuranLocusCrosswalk,
} from '../src/lib/quran-locus-crosswalk';

const ACTIVATION = runCrosswalkActivation();

// ── pin & integrity ──────────────────────────────────────────────────────────────────────────

test('upstream commit is pinned, never a moving ref', () => {
  assert.match(QURAN_WS_BOUNDARY_SOURCE.commit, /^[0-9a-f]{40}$/);
  assert.equal(QURAN_WS_BOUNDARY_SOURCE.commit, 'a9b4d345f3e1d0e9282711c5e09f24119b17e4e1');
  for (const moving of ['main', 'master', 'latest', 'HEAD']) {
    assert.notEqual(QURAN_WS_BOUNDARY_SOURCE.commit, moving);
  }
});

test('pinned upstream bytes are frozen inside the repository', () => {
  const file = path.resolve(QURAN_WS_BOUNDARY_SOURCE.localPath);
  assert.ok(fs.existsSync(file), 'frozen copy must exist so competition runtime never needs github.com');
  const manifest = JSON.parse(fs.readFileSync(path.resolve(QURAN_WS_BOUNDARY_SOURCE.localManifestPath), 'utf8'));
  assert.equal(manifest.upstreamCommit, QURAN_WS_BOUNDARY_SOURCE.commit);
  const entry = manifest.files.find((f: { localPath: string }) => f.localPath === QURAN_WS_BOUNDARY_SOURCE.localPath);
  assert.ok(entry, 'manifest must describe the frozen file');
  assert.equal(entry.sha256, QURAN_WS_BOUNDARY_SOURCE.sha256);
  assert.equal(entry.gitBlobSha1, QURAN_WS_BOUNDARY_SOURCE.gitBlobSha1);
});

test('upstream artifact checksum is pinned and matches the frozen bytes', () => {
  const bytes = loadFrozenBoundaryBytes();
  const digest = createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest, QURAN_WS_BOUNDARY_SOURCE.sha256);
  assert.equal(bytes.length, QURAN_WS_BOUNDARY_SOURCE.byteLength);
  assert.deepEqual(verifyFrozenBytes(bytes), {
    sha256: QURAN_WS_BOUNDARY_SOURCE.sha256,
    gitBlobSha1: QURAN_WS_BOUNDARY_SOURCE.gitBlobSha1,
  });
});

test('tampered bytes fail closed before any mapping is generated', () => {
  const bytes = loadFrozenBoundaryBytes();
  const tampered = Buffer.from(bytes);
  tampered[tampered.length - 2] ^= 0x01;
  assert.throws(() => verifyFrozenBytes(tampered), /QURAN_WS_BOUNDARY_(GIT_BLOB|SHA256)_MISMATCH/);
  assert.throws(() => verifyFrozenBytes(bytes.subarray(0, 100)), /QURAN_WS_BOUNDARY_SIZE_MISMATCH/);
});

// ── schema parser ────────────────────────────────────────────────────────────────────────────

test('schema parser accepts the pinned document', () => {
  const document = parseBoundaryDocument(loadFrozenBoundaryBytes());
  assert.equal(document._reference_system, 'kufi');
  assert.equal(document._version, QURAN_WS_BOUNDARY_SOURCE.datasetVersion);
});

test('schema parser rejects malformed data', () => {
  const cases: Array<[string, unknown, RegExp]> = [
    ['not json', undefined, /QURAN_WS_BOUNDARY_JSON_INVALID/],
    ['wrong version', { _version: '9.9.9', _reference_system: 'kufi', _counting_system_order: ['kufi'], surahs: {} }, /VERSION_MISMATCH/],
    ['wrong reference system', { _version: '0.1.0', _reference_system: 'basri', _counting_system_order: ['kufi'], surahs: {} }, /REFERENCE_MISMATCH/],
    ['no system order', { _version: '0.1.0', _reference_system: 'kufi', _counting_system_order: [], surahs: {} }, /SYSTEM_ORDER_INVALID/],
    ['surahs not an object', { _version: '0.1.0', _reference_system: 'kufi', _counting_system_order: ['kufi'], surahs: [] }, /SURAHS_INVALID/],
    ['surah key out of range', { _version: '0.1.0', _reference_system: 'kufi', _counting_system_order: ['kufi'], surahs: { '115': {} } }, /SURAH_KEY_INVALID/],
    ['ayah key out of range', { _version: '0.1.0', _reference_system: 'kufi', _counting_system_order: ['kufi'], surahs: { '1': { '99': {} } } }, /AYAH_KEY_INVALID/],
    ['point without counted_by', { _version: '0.1.0', _reference_system: 'kufi', _counting_system_order: ['kufi'], surahs: { '1': { '1': { end: { word: 'x' } } } } }, /POINT_INVALID/],
    ['point naming an unknown system', { _version: '0.1.0', _reference_system: 'kufi', _counting_system_order: ['kufi'], surahs: { '1': { '1': { end: { word: 'x', counted_by: ['martian'] } } } } }, /POINT_SYSTEM_UNKNOWN/],
  ];
  for (const [label, value, pattern] of cases) {
    const bytes = value === undefined ? Buffer.from('{ not json', 'utf8') : Buffer.from(JSON.stringify(value), 'utf8');
    assert.throws(() => parseBoundaryDocument(bytes), pattern, label);
  }
});

// ── 114-surah count identity, per counting system and per rawi ────────────────────────────────

test('every candidate system generates exactly 114 target-surah counts', () => {
  for (const { mapping } of ACTIVATION.activated) {
    assert.equal(mapping.surahs.length, 114);
    assert.deepEqual(mapping.surahs.map(s => s.surah), Array.from({ length: 114 }, (_, i) => i + 1));
  }
  assert.equal(ACTIVATION.validations.length, CROSSWALK_CANDIDATE_SYSTEMS.length);
});

const expectExact = (nativeSystem: string) => {
  const validation = ACTIVATION.validations.find(v => v.nativeSystem === nativeSystem);
  assert.ok(validation, `${nativeSystem} must be validated`);
  assert.equal(validation!.mismatches.length, 0, `${nativeSystem} mismatches: ${JSON.stringify(validation!.mismatches)}`);
  assert.equal(validation!.exact114, true);
};

test('dimashqi target counts match the pinned Hisham package', () => expectExact('DIMASHQI'));
test('dimashqi target counts match the pinned Ibn Dhakwan package', () => {
  expectExact('DIMASHQI');
  const validation = ACTIVATION.validations.find(v => v.nativeSystem === 'DIMASHQI')!;
  assert.deepEqual([...validation.rawis].sort(), ['hisham', 'ibn-dhakwan']);
});
test('madani-first target counts match the pinned Ibn Wardan package', () => expectExact('MADANI_AWWAL'));
test('madani-first target counts match the pinned Ibn Jammaz package', () => {
  expectExact('MADANI_AWWAL');
  const validation = ACTIVATION.validations.find(v => v.nativeSystem === 'MADANI_AWWAL')!;
  assert.deepEqual([...validation.rawis].sort(), ['ibn-jammaz', 'ibn-wardan']);
});

test('generic basri is validated independently against Ruways and against Rawh', () => {
  const ruways = ACTIVATION.validations.find(v => v.nativeSystem === 'BASRI_YAQUB_RUWAYS');
  const rawh = ACTIVATION.validations.find(v => v.nativeSystem === 'BASRI_YAQUB_RAWH');
  assert.ok(ruways && rawh, 'each Yaqub rawi must be proved on its own, never by sharing a generic system');
  assert.equal(ruways!.sourceSystem, 'basri');
  assert.equal(rawh!.sourceSystem, 'basri');
  // The two claims are genuinely independent: they reach opposite verdicts on the same source.
  assert.notEqual(ruways!.exact114, rawh!.exact114);
});

test('basri validation activates Ruways on an exact 114/114 match', () => expectExact('BASRI_YAQUB_RUWAYS'));

test('a single mismatched surah fails closed and activates nothing for that rawi', () => {
  const rawh = ACTIVATION.validations.find(v => v.nativeSystem === 'BASRI_YAQUB_RAWH')!;
  assert.equal(rawh.exact114, false);
  assert.equal(rawh.mismatches.length, 1, 'the block is one surah wide — and one is enough');
  assert.deepEqual(rawh.mismatches[0], { surah: 84, generated: 23, expected: 25 });
  assert.equal(ACTIVATION.activated.some(a => a.config.nativeSystem === 'BASRI_YAQUB_RAWH'), false);
  assert.equal(GENERATED_BOUNDARY_SYSTEMS.some(s => s.nativeSystem === 'BASRI_YAQUB_RAWH'), false);
  assert.equal(CROSSWALK_ACTIVATED_RAWIS.includes('rawh'), false);
  assert.equal(COMMITTEE_CROSSWALK_ROWS.some(row => row.rawiId === 'rawh'), false);
});

test('no automatic activation on a partial match', () => {
  for (const validation of ACTIVATION.validations) {
    const present = GENERATED_BOUNDARY_SYSTEMS.some(s => s.nativeSystem === validation.nativeSystem);
    assert.equal(present, validation.exact114, `${validation.nativeSystem} may only be generated on a full match`);
  }
});

// ── generated module fidelity ────────────────────────────────────────────────────────────────

test('the checked-in generated module matches a fresh regeneration', () => {
  const regenerated = new Set(ACTIVATION.activated.map(a => a.config.nativeSystem));
  assert.deepEqual(new Set(GENERATED_BOUNDARY_SYSTEMS.map(s => s.nativeSystem)), regenerated);
  for (const { config, mapping } of ACTIVATION.activated) {
    const generated = GENERATED_BOUNDARY_SYSTEMS.find(s => s.nativeSystem === config.nativeSystem)!;
    assert.deepEqual([...generated.targetCounts], mapping.surahs.map(s => s.targetAyahCount));
    assert.deepEqual([...generated.targetCounts], [...NATIVE_SURAH_AYAH_COUNTS[config.nativeSystem]]);
  }
  assert.equal(BOUNDARY_EVIDENCE_BUILD.sourceSha256, QURAN_WS_BOUNDARY_SOURCE.sha256);
  assert.match(BOUNDARY_EVIDENCE_BUILD.generatedArtifactSha256, /^[0-9a-f]{64}$/);
  assert.ok(COMMITTEE_CROSSWALK_VERSION.includes(QURAN_WS_BOUNDARY_SOURCE.commit.slice(0, 12)));
});

// ── row-level guarantees ─────────────────────────────────────────────────────────────────────

test('every activated row carries a specific artifact reference, not a bare approval claim', () => {
  assert.ok(COMMITTEE_CROSSWALK_ROWS.length > 0);
  for (const row of COMMITTEE_CROSSWALK_ROWS) {
    const joined = row.evidence.join('\n');
    assert.ok(joined.includes(QURAN_WS_BOUNDARY_SOURCE.commit), 'row must name the pinned commit');
    assert.ok(joined.includes(QURAN_WS_BOUNDARY_SOURCE.path), 'row must name the source path');
    assert.ok(joined.includes(`sha256:${QURAN_WS_BOUNDARY_SOURCE.sha256}`), 'row must name the source digest');
    assert.ok(joined.includes(BOUNDARY_EVIDENCE_BUILD.generatedArtifactSha256), 'row must name the generated artifact digest');
    assert.ok(/system:[a-z-]+->[A-Z_]+/.test(joined), 'row must name the counting system it came from');
    assert.equal(joined.toLowerCase().includes('committee approved'), false, 'approval is not mapping evidence');
  }
});

test('no duplicate canonical locus per rawi', () => {
  const seen = new Set<string>();
  for (const row of COMMITTEE_CROSSWALK_ROWS) {
    const key = `${row.rawiId}#${row.canonical.surah}:${row.canonical.ayah}`;
    assert.equal(seen.has(key), false, `duplicate crosswalk row ${key}`);
    seen.add(key);
  }
});

test('every native target falls inside the native surah bounds', () => {
  const systemOf = new Map<string, string>();
  for (const system of GENERATED_BOUNDARY_SYSTEMS) for (const rawi of system.rawis) systemOf.set(rawi, system.nativeSystem);
  for (const row of COMMITTEE_CROSSWALK_ROWS) {
    const nativeSystem = systemOf.get(row.rawiId)!;
    const bound = nativeAyahCountOf(nativeSystem as never, row.native.surah)!;
    assert.equal(row.native.surah, row.canonical.surah, 'no crosswalk row crosses a surah boundary');
    const highest = row.native.ayahEnd ?? row.native.ayah!;
    const lowest = row.native.ayahStart ?? row.native.ayah!;
    assert.ok(lowest >= 1 && highest <= bound, `${row.rawiId} ${row.canonical.surah}:${row.canonical.ayah} -> ${highest} exceeds ${bound}`);
    assert.ok(row.canonical.ayah >= 1 && row.canonical.ayah <= ayahCountOf(row.canonical.surah));
  }
});

test('rawi identity is never deduplicated away by a shared counting system', () => {
  for (const system of GENERATED_BOUNDARY_SYSTEMS) {
    assert.ok(system.rawis.length >= 1);
    const counts = system.rawis.map(rawi => COMMITTEE_CROSSWALK_ROWS.filter(r => r.rawiId === rawi).length);
    assert.ok(counts.every(c => c > 0), `${system.nativeSystem} must emit rows for every rawi it serves`);
    assert.equal(new Set(counts).size, 1, 'rawis sharing a source map still each carry a full row set');
  }
  // The two Dimashqi rawis must remain separately addressable at runtime.
  assert.notEqual(
    MIZAN_IDENTITY_CROSSWALK.rowsFor('hisham').length,
    0,
  );
  assert.notEqual(MIZAN_IDENTITY_CROSSWALK.rowsFor('ibn-dhakwan').length, 0);
});

test('the composite split+merge case survives the row model without loss', () => {
  const composite = COMMITTEE_CROSSWALK_ROWS.filter(row => row.relation === 'SPLIT_AND_MERGE');
  assert.ok(composite.length > 0, 'the pinned source really does contain split+merge loci');
  for (const row of composite) {
    assert.equal(row.mergesWithNext, true);
    assert.ok(row.native.ayahStart !== undefined && row.native.ayahEnd! > row.native.ayahStart!);
    const resolved = MIZAN_IDENTITY_CROSSWALK.toNative(row.rawiId, row.canonical);
    assert.equal(resolved.relation, 'SPLIT_AND_MERGE');
    assert.equal(resolved.mergesWithNext, true, 'the merge fact must not be lost on the way out');
  }
});

test('a row whose merge flag contradicts its relation is rejected', () => {
  const base: QuranLocusCrosswalk = {
    rawiId: 'hisham',
    canonical: { surah: 2, ayah: 1 },
    native: { surah: 2, ayah: 1 },
    relation: 'MERGED',
    mergesWithNext: false,
    evidence: ['x'],
  };
  assert.throws(() => validateCrosswalkRow(base), (e: CrosswalkError) => e.code === 'CROSSWALK_MERGE_FLAG_CONTRADICTS_RELATION');
  assert.throws(
    () => validateCrosswalkRow({ ...base, relation: 'MERGED', mergesWithNext: true, native: { surah: 2, ayahStart: 1, ayahEnd: 2 } }),
    (e: CrosswalkError) => e.code === 'CROSSWALK_MERGED_REQUIRES_SINGLE_AYAH',
  );
  assert.throws(
    () => validateCrosswalkRow({ ...base, relation: 'SPLIT_AND_MERGE', mergesWithNext: true }),
    (e: CrosswalkError) => e.code === 'CROSSWALK_SPLIT_REQUIRES_RANGE',
  );
  assert.throws(
    () => validateCrosswalkRow({ ...base, relation: 'SPLIT', mergesWithNext: false, evidence: [] }),
    (e: CrosswalkError) => e.code === 'CROSSWALK_EVIDENCE_REQUIRED',
  );
});

// ── atomic readiness ─────────────────────────────────────────────────────────────────────────

test('no UNRESOLVED locus remains for any reading marked question-ready', () => {
  for (const rawiId of CANONICAL_RAWI_IDS) {
    const coverage = crosswalkCoverage(rawiId);
    if (!coverage.questionSafe) continue;
    assert.equal(coverage.unresolvedLoci, 0, `${rawiId} is question-safe with unresolved loci`);
    assert.deepEqual(coverage.surahsRequiringEvidence, [], `${rawiId} still needs evidence`);
  }
});

test('activation moved exactly the proved readings to question-ready', () => {
  for (const rawiId of ['hisham', 'ibn-dhakwan', 'ibn-wardan', 'ibn-jammaz', 'ruways']) {
    const coverage = crosswalkCoverage(rawiId);
    assert.equal(coverage.questionSafe, true, `${rawiId} must be question-safe on proved evidence`);
    assert.equal(coverage.unresolvedLoci, 0);
    assert.equal(coverage.mappingComplete, true, `${rawiId} mapping must be complete, not merely unblocked`);
  }
  // Rawh stays blocked. Readiness logic was not relaxed to reach a round number.
  const rawh = crosswalkCoverage('rawh');
  assert.equal(rawh.questionSafe, false);
  assert.ok(rawh.unresolvedLoci > 0);
});
