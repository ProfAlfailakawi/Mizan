/*
 * خطوةٌ تستدعي أداةً من `devDependencies` في مهمّةٍ لا تُثبّت شيئًا تسقط بـ**127**.
 *
 * وقع هذا في `deploy-cloud-run.yml`: أضفتُ خطوةَ تحقّقٍ من الوثيقتين تُشغَّل بـ`tsx`،
 * ومهمّةُ النشر لا تُثبّت اعتماديات أصلًا — هي تُصادق ثم تستدعي `gcloud builds submit`،
 * والبناءُ يقع في Cloud Build. فقالت `sh: 1: tsx: not found`.
 *
 * **وهو أسوأُ من فشلٍ عاديّ.** النشرُ كان قد تمّ ونُقل الإنتاج فعلًا، ثم سقطت الخطوةُ
 * التي تحكم عليه — فلا قياسَ وقع، والحمرةُ لا تقول شيئًا عن العنوانين. وخطوةٌ تسقط قبل
 * أن تقيس كخطوةٍ تخضرّ بلا قياس: كلتاهما علامةٌ بلا مضمون.
 *
 * فيُقاس الشرطُ بنيويًّا: كلُّ مهمّةٍ تستدعي `npm run` أو `npx` أو `tsx` لا بدّ أن
 * تُثبّت قبلها في **المهمّة نفسِها**.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WORKFLOWS = path.join(process.cwd(), '.github', 'workflows');

interface Job { name: string; lines: {text: string; number: number}[] }

/** تقسيمٌ بالمسافات البادئة — تكفي لبنية هذه الملفّات، وتفشل ظاهرًا لو تغيّرت. */
function jobsOf(source: string): Job[] {
  const lines = source.split('\n');
  const at = lines.findIndex(line => /^jobs:\s*$/.test(line));
  if (at < 0) return [];
  const jobs: Job[] = [];
  let current: Job | null = null;
  for (let i = at + 1; i < lines.length; i += 1) {
    const text = lines[i];
    if (/^\S/.test(text) && text.trim()) break;          // خرجنا من كتلة jobs
    const header = /^ {2}([A-Za-z][\w-]*):\s*$/.exec(text);
    if (header) { current = {name: header[1], lines: []}; jobs.push(current); continue; }
    if (current) current.lines.push({text, number: i + 1});
  }
  return jobs;
}

const NEEDS_NODE_MODULES = /(^|[\s|&;(])(npm run |npx |tsx )/;
const INSTALLS = /(^|[\s|&;(])npm (ci|install)\b/;

test('every workflow job that runs a local tool installs it first', () => {
  const files = fs.readdirSync(WORKFLOWS).filter(name => name.endsWith('.yml'));
  assert.ok(files.length >= 5, `expected the workflow set, found ${files.length}`);

  const offenders: string[] = [];
  let jobsChecked = 0;

  for (const file of files) {
    const source = fs.readFileSync(path.join(WORKFLOWS, file), 'utf8');
    for (const job of jobsOf(source)) {
      jobsChecked += 1;
      // التعليقاتُ ليست تنفيذًا — وهذا الملفُّ نفسُه يذكر `npm ci` في تعليقٍ يشرح السبب.
      const executable = job.lines.filter(({text}) => !/^\s*#/.test(text));
      const installAt = executable.findIndex(({text}) => INSTALLS.test(text));
      const usesAt = executable.findIndex(({text}) => NEEDS_NODE_MODULES.test(text));
      if (usesAt < 0) continue;
      if (installAt < 0) {
        offenders.push(`${file} · ${job.name} · line ${executable[usesAt].number}: runs a local tool, never installs`);
      } else if (installAt > usesAt) {
        offenders.push(`${file} · ${job.name} · line ${executable[usesAt].number}: runs a local tool before installing`);
      }
    }
  }

  assert.ok(jobsChecked >= 8, `the parser must actually see jobs, it saw ${jobsChecked}`);
  assert.deepEqual(offenders, [],
    'these steps would fail with exit 127 in CI — and a step that dies before measuring is as empty as one that passes without measuring');
});
