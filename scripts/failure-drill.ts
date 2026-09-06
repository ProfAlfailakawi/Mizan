#!/usr/bin/env node
import { runFailureDrill, type DrillSubmission, type FailureEvent } from '../server/failure-drill';

/*
 * «اسحب القابس» — يوم اصطناعي تُقطع فيه الشبكة ويُفقد جهاز ويُعاد تشغيل متصفّح.
 *   npx tsx scripts/failure-drill.ts --participants 60 --judges 3 --devices 4
 * يخرج بحالة غير صفرية عند أي فقد أو احتساب مزدوج، فيصلح بوّابةً قبل يوم المسابقة.
 */
const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined };
const num = (k: string, d: number) => { const v = Number(val(k)); return Number.isFinite(v) && v > 0 ? Math.floor(v) : d };

const participants = num('--participants', 60), judges = num('--judges', 3), devices = num('--devices', 4);
const CRITERIA = [{ id: 'memorization', maxScore: 60 }, { id: 'tajweed', maxScore: 30 }, { id: 'voice', maxScore: 10 }];

const submissions: DrillSubmission[] = [];
for (let p = 0; p < participants; p++)
  for (let j = 0; j < judges; j++) {
    const score = 78 + ((p * 7 + j * 3) % 20);
    submissions.push({ sessionId: `s${p}`, judgeId: `j${j}`, deviceId: `d${j % devices}`, synced: true,
      totalScore: score, criterionScores: { memorization: score - 38, tajweed: 28, voice: 10 } });
  }

/*
 * أعطال موزّعة على اليوم كما تقع فعلًا: تنقطع الشبكة، ثم تعود، ثم يُعاد تشغيل متصفّح، ثم يُفقد
 * جهاز **مستعمَل** — وفقدُ جهازٍ لم يكتب عليه أحد بروفةٌ لا تختبر شيئًا.
 */
const n = submissions.length;
const usedDevice = `d${(judges - 1) % devices}`;
const events: FailureEvent[] = [
  { at: Math.floor(n / 3), kind: 'NETWORK_LOSS' },
  { at: Math.floor(n / 2), kind: 'NETWORK_RESTORED' },
  { at: Math.floor(n / 2) + 1, kind: 'BROWSER_RESTART' },
  { at: Math.floor((n * 3) / 4), kind: 'DEVICE_LOSS', deviceId: usedDevice },
];

const r = runFailureDrill({ submissions, events, criteria: CRITERIA, mode: 'all_judges_all_criteria' });
process.stdout.write(`\nMIZAN failure drill — ${participants} participants · ${judges} judges · ${devices} devices\n\n`);
for (const e of r.events) process.stdout.write(`  broke: ${e.kind}${e.deviceId ? ` (${e.deviceId})` : ''}\n`);
process.stdout.write(`\n  authored          ${r.submissionsAuthored}\n`);
process.stdout.write(`  recovered         ${r.submissionsRecovered}\n`);
process.stdout.write(`  lost              ${r.submissionsLost}\n`);
process.stdout.write(`  duplicates absorbed ${r.duplicatesAbsorbed}\n`);
process.stdout.write(`  double counted    ${r.doubleCounted}\n`);
process.stdout.write(`  ranking preserved ${r.rankingPreserved ? 'yes' : 'NO'}\n`);
process.stdout.write(`\nverdict: ${r.verdict}\n`);
for (const f of r.failures) process.stdout.write(`  - ${f}\n`);
process.stdout.write(`${r.note}\n`);
process.exit(r.verdict === 'PASS' ? 0 : 1);
