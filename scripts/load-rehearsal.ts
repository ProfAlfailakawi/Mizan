#!/usr/bin/env node
import { runLoadRehearsal } from '../server/load-rehearsal';

/*
 * بروفة حِمل ليوم مسابقة كامل. الافتراضي هو الحجم الذي لم يُختبر قط: 200 متسابق على 8 لجان.
 *   npx tsx scripts/load-rehearsal.ts --participants 200 --committees 8 --judges 3
 * يخرج بحالة غير صفرية عند أي فشل، فيصلح بوّابةً قبل يوم المسابقة.
 */

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined };
const num = (k: string, d: number) => { const v = Number(val(k)); return Number.isFinite(v) && v > 0 ? Math.floor(v) : d };

const report = runLoadRehearsal({
  participants: num('--participants', 200),
  committees: num('--committees', 8),
  judgesPerCommittee: num('--judges', 3),
  mode: val('--mode') || 'all_judges_all_criteria',
  dropExtremes: args.includes('--drop-extremes'),
  seed: val('--seed'),
});

const pad = (s: string, n: number) => s.padEnd(n);
process.stdout.write(`\nMIZAN load rehearsal — ${report.request.participants} participants · ${report.request.committees} committees · ${report.request.judgesPerCommittee} judges/committee\n`);
process.stdout.write(`mode=${report.request.mode} dropExtremes=${report.request.dropExtremes} seed=${report.request.seed}\n\n`);
process.stdout.write(`${pad('stage', 22)}${pad('total', 12)}${pad('p50', 10)}${pad('p95', 10)}${pad('max', 10)}\n`);
for (const t of report.timings) process.stdout.write(`${pad(t.stage, 22)}${pad(`${t.totalMs}ms`, 12)}${pad(`${t.p50Ms}ms`, 10)}${pad(`${t.p95Ms}ms`, 10)}${pad(`${t.maxMs}ms`, 10)}\n`);
process.stdout.write(`\nattested: ${report.attestationsAgreed} agreed · ${report.attestationsDisagreed} disagreed · ${report.attestationsInsufficient} insufficient\n`);
process.stdout.write(`ranking deterministic: ${report.rankingStable ? 'yes' : 'NO'}\n`);
process.stdout.write(`wall clock: ${report.wallClockMs}ms\n`);
if (report.firstDisagreement) process.stdout.write(`first disagreement: ${report.firstDisagreement.participantId} ${JSON.stringify(report.firstDisagreement.discrepancies)}\n`);
process.stdout.write(`\nverdict: ${report.verdict}\n`);
for (const f of report.failures) process.stdout.write(`  - ${f}\n`);
process.exit(report.verdict === 'PASS' ? 0 : 1);
