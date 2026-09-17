#!/usr/bin/env node
import 'dotenv/config';
import path from 'node:path';
import { CandidateQuranSourceVault } from '../server/quran-candidate-source-vault';
import type { QuranCandidateReviewState } from '../src/lib/quran-candidate-sources';

const args = process.argv.slice(2);
const value = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const has = (name: string) => args.includes(name);

const root = path.resolve(value('--root') || process.env.MIZAN_QURAN_CANDIDATE_VAULT_DIR || '.mizan-data/quran-candidates');
const vault = new CandidateQuranSourceVault(root);
const rawiId = value('--rawi') || '';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (has('--status')) {
  console.log(JSON.stringify({ protocol: 'MIZAN-QURAN-CANDIDATE-STATUS-1', root, readings: vault.status() }, null, 2));
  process.exit(0);
}

if (!rawiId) fail('QURAN_CANDIDATE_RAWI_REQUIRED: pass --rawi <canonical-rawi-id>');

if (has('--packet')) {
  console.log(JSON.stringify(vault.reviewPacket(rawiId), null, 2));
  process.exit(0);
}

const sourcePath = value('--source');
if (sourcePath) {
  const manifest = vault.ingest({
    rawiId,
    sourcePath: path.resolve(sourcePath),
    ingestedBy: value('--by') || process.env.USER || 'candidate-import',
  });
  console.log(JSON.stringify({ ingested: true, manifest }, null, 2));
  process.exit(0);
}

const action = value('--review');
if (action) {
  const mapping: Record<string, QuranCandidateReviewState> = {
    approve: 'APPROVED',
    approved: 'APPROVED',
    'needs-fix': 'NEEDS_FIX',
    needs_fix: 'NEEDS_FIX',
    reject: 'REJECTED',
    rejected: 'REJECTED',
    pending: 'PENDING_SCHOLAR_REVIEW',
  };
  const state = mapping[action.toLowerCase()];
  if (!state) fail('QURAN_CANDIDATE_REVIEW_ACTION_INVALID: approve | needs-fix | reject | pending');
  const reviewerId = value('--reviewer') || '';
  if (!reviewerId) fail('QURAN_CANDIDATE_REVIEWER_REQUIRED: pass --reviewer <committee-member-id>');
  const manifest = vault.review({
    rawiId,
    state,
    reviewerId,
    note: value('--note'),
    expectedPackageHash: value('--package-hash'),
  });
  console.log(JSON.stringify({ reviewed: true, rawiId, state: manifest.review.state, packageHash: manifest.packageHash }, null, 2));
  process.exit(0);
}

fail('QURAN_CANDIDATE_ACTION_REQUIRED: use --source, --review, --packet, or --status');
