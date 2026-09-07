import test from 'node:test';
import assert from 'node:assert/strict';
import { canPromoteQuranSource } from '../src/lib/scientific-core';

/* مصدر مكتمل الفحوص البنيوية، يتغيّر فيه عدد المراجعين وحده. */
const source = (reviewerIds: string[]): any => ({
  id: 'src-1',
  packageHash: 'HASH-1',
  contentHash: 'CONTENT-1',
  sourceAuthority: 'مجمع الملك فهد لطباعة المصحف الشريف',
  version: '1.0',
  checksumSha256: 'a'.repeat(64),
  qiraah: 'Asim al-Kufi',
  rawi: 'Hafs',
  structuralValidation: { surahCountValid: true, ayahCountValid: true, errors: [] },
  scientificReviews: reviewerIds.map(id => ({ reviewerId: id, decision: 'approve', packageHash: 'HASH-1' })),
  surahCount: 114,
});

test('two independent reviewers certify under the default policy', () => {
  assert.equal(canPromoteQuranSource(source(['a', 'b']), true).allowed, true);
});

test('a single reviewer cannot certify while two are required', () => {
  const gate = canPromoteQuranSource(source(['a']), true);
  assert.equal(gate.allowed, false);
  assert.equal(gate.reviewers, 1);
});

test('the same reviewer twice is still one reviewer', () => {
  assert.equal(canPromoteQuranSource(source(['a', 'a']), true).allowed, false);
});

test('a declared sole authority certifies with one reviewer', () => {
  assert.equal(canPromoteQuranSource(source(['a']), false).allowed, true);
});

test('structural failures still block certification whatever the reviewer policy', () => {
  const broken = { ...source(['a', 'b']), contentHash: undefined };
  const gate = canPromoteQuranSource(broken as any, false);
  assert.equal(gate.allowed, false);
  assert.ok(gate.errors.includes('SOURCE_CONTENT_HASH_REQUIRED'));
});
