import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/*
 * أخطر ملفات المستودع كانت الوحيدة غير المفحوصة: نطاق التدقيق كان شجرة المصدر وحدها،
 * وملفات النشر — حيث تُكتب مفاتيح الخدمة ورموز الوصول فعلًا — خارجه تمامًا. هذه الاختبارات
 * تُثبت أن الفحص يمسّها الآن، وأنه يمسك حقًّا لا يمرّ.
 */

const repo = process.cwd();
const runAudit = () => {
  try { execFileSync('node', ['scripts/source-audit.mjs'], { cwd: repo, stdio: 'pipe' }); return 'PASSED' }
  catch { return 'FAILED' }
};

/** يزرع سطرًا في ملف حقيقي، يشغّل التدقيق، ثم يعيد الملف كما كان مهما وقع. */
const withPlantedLine = (file: string, line: string) => {
  const full = path.join(repo, file);
  const original = fs.readFileSync(full, 'utf8');
  try { fs.writeFileSync(full, `${original}\n${line}\n`); return runAudit() }
  finally { fs.writeFileSync(full, original) }
};

test('the audit passes on the repository as it stands', () => {
  assert.equal(runAudit(), 'PASSED');
});

test('an audit that inspects nothing fails instead of approving', () => {
  /*
   * أسوأ حالات الحارس: يمرّ أخضر وهو لم يفتح ملفًا واحدًا. وقعت فعلًا عند تشغيله من مجلد
   * غير الجذر — فالمسارات نسبية، فلا يجد شيئًا، فيُعلن النجاح. العدد الصفري عطلٌ لا نتيجة.
   */
  let outcome: string;
  try { execFileSync('node', ['source-audit.mjs'], { cwd: path.join(repo, 'scripts'), stdio: 'pipe' }); outcome = 'PASSED' }
  catch { outcome = 'FAILED' }
  assert.equal(outcome, 'FAILED', 'a gate that scanned zero files must never report success');
});

/*
 * كل طُعم يُركَّب من شظايا ولا يُكتب حرفيًا. السبب أن هذا الملف نفسه داخل نطاق الفحص —
 * وهذا صحيح، فملفُ اختبارٍ يحمل سلسلة تشبه المفتاح لا يفترق عن ملفٍ سرَّبه. إعفاء الملف
 * كان سيفتح الثغرة التي جاء يسدّها.
 */
const bait = {
  google: `AIza${'Sy'}PLANTEDPLANTEDPLANTEDPLANTED00`,
  github: `gh${'p'}_${'0'.repeat(36)}`,
  aws: `AK${'IA'}IOSFODNN7EXAMPLE`,
  slack: `xo${'xb'}-0000000000-abcdefghij`,
  privateKey: `-----${'BEGIN'} PRIVATE KEY-----`,
  serviceAccount: `"private${'_key_id'}": "x"`,
};

test('a secret planted in a deployment manifest stops the build', () => {
  // كل واحد من هذه كان يمرّ بلا اعتراض قبل توسيع النطاق.
  const planted: [string, string][] = [
    ['cloudbuild.yaml', `  _LEAK: '${bait.google}'`],
    ['cloudbuild.yaml', `  _LEAK: '${bait.github}'`],
    ['cloudbuild.yaml', `  _LEAK: '${bait.aws}'`],
    ['cloudbuild.yaml', `  _LEAK: '${bait.slack}'`],
    ['Dockerfile', `# ${bait.privateKey}`],
    ['Dockerfile', `# ${bait.serviceAccount}`],
  ];
  for (const [file, line] of planted) {
    assert.equal(withPlantedLine(file, line), 'FAILED', `${file} must reject: ${line.trim().slice(0, 40)}`);
  }
});

test('the intentional public Firebase key is allowed by value, not by shape', () => {
  const audit = fs.readFileSync(path.join(repo, 'scripts/source-audit.mjs'), 'utf8');
  const allowed = /const PUBLIC_FIREBASE_WEB_KEY='([^']+)'/.exec(audit)?.[1];
  assert.ok(allowed, 'the allowance must name one exact key');
  // القيمة المسموحة هي التي في ملفات البناء فعلًا، لا قيمة منسوخة عفا عليها الزمن.
  assert.ok(fs.readFileSync(path.join(repo, 'Dockerfile'), 'utf8').includes(allowed),
    'the pinned key must be the one the image is actually built with');
  // ولا يُسمح لغيرها: مفتاح Google ثانٍ يوقف الفحص ولو كان في الملف نفسه.
  assert.equal(withPlantedLine('Dockerfile', `ARG OTHER_KEY="${allowed.slice(0, -4)}ZZZZ"`), 'FAILED');
});

test('deployment manifests are named in the audit, not implied', () => {
  const audit = fs.readFileSync(path.join(repo, 'scripts/source-audit.mjs'), 'utf8');
  assert.match(audit, /const deploymentRoots=\[[^\]]*'Dockerfile'/, 'the container recipe must be in scope');
  assert.match(audit, /cloudbuild.*\\\.ya\?ml/, 'every Cloud Build manifest must be in scope, not just the main one');
  const manifests = fs.readdirSync(repo).filter(f => /^cloudbuild.*\.ya?ml$/.test(f));
  assert.ok(manifests.length > 1, 'this repository has several build manifests; all of them carry the same risk');
});

test('unfinished markers stay a source-tree rule', () => {
  /* علامة عمل ناقص في شجرة المصدر تعني ميزةً نصف مكتملة يراها مستخدم؛ وفي ملف نشر تعني
     ملاحظة بناء لا يراها أحد. توسيع النطاق لا يعني توحيد القواعد. */
  const audit = fs.readFileSync(path.join(repo, 'scripts/source-audit.mjs'), 'utf8');
  assert.match(audit, /\{name:'unfinished marker'[^}]*scope:'source'\}/);
  /* العلامة تُركَّب ولا تُكتب حرفيًا: هذا الملف نفسه داخل نطاق الفحص، فكتابتها هنا تُسقطه. */
  const marker = ['TO', 'DO'].join('');
  assert.equal(withPlantedLine('Dockerfile', `# ${marker}: revisit the base image tag`), 'PASSED');
  assert.equal(withPlantedLine('server.ts', `// ${marker}: revisit`), 'FAILED');
});
