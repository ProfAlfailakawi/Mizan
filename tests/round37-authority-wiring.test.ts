import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
 * العيب الذي استدعى هذه الجولة لم يكن في منطق خاطئ، بل في **سلك مقطوع**: بُنيت نقطة الختم
 * الخادمية وشهادتها، ولم يستدعِهما أحد. فبقي التطبيق يختم في المتصفح شهورًا وهو يبدو مؤمَّنًا.
 *
 * لا يمسك مثلَ هذا اختبارُ وحدة، لأن كل وحدة على حدة سليمة. فهذه الاختبارات تفحص الوصل نفسه:
 * أن ما بُني على الخادم له مستدعٍ في الواجهة، وأن الطريق القديم لم يبقَ مفتوحًا بجانبه.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const clientSources = () => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(path.join(process.cwd(), 'src'));
  return out.map((f) => ({file: f, text: fs.readFileSync(f, 'utf8')}));
};

/** كل نقطة نزاهة خادمية ومَن يجب أن يستدعيها من جهة العميل. */
const WIRED_ENDPOINTS = [
  '/api/results/seal',
  '/api/integrity/quorum/request',
  '/api/integrity/fairdraw/commit',
];

test('every server integrity endpoint that exists is actually called from the client', () => {
  const server = read('server.ts');
  const client = clientSources().map((s) => s.text).join('\n');
  for (const endpoint of WIRED_ENDPOINTS) {
    assert.ok(server.includes(endpoint), `${endpoint} must exist on the server`);
    assert.ok(client.includes(endpoint), `${endpoint} exists but nothing in src/ calls it — a built-but-unwired path is how the browser kept sealing`);
  }
});

/*
 * وجودُ المسار في ملف العميل لا يكفي: العيب الأصلي كان أن الملف موجود ولا يستدعيه أحد. فيُفحص
 * أن لكل دالة من دوال السلطة **مستدعيًا خارج ملفها**.
 */
test('each authority client function has a caller outside its own module', () => {
  const sources = clientSources().filter((s) => !s.file.endsWith('integrity-authority-client.ts'));
  const joined = sources.map((s) => s.text).join('\n');
  for (const fn of ['sealResultOnServer', 'requestQuorum', 'approveQuorum', 'executeQuorum', 'commitFairDraw', 'revealFairDraw', 'listQuorum']) {
    assert.ok(joined.includes(fn), `${fn} is defined but never called from a screen or the store`);
  }
});

test('the seal quorum gate is enforced by the server, not by browser state', () => {
  const store = read('src/lib/store.ts');
  const sealBody = store.slice(store.indexOf('const sealResults'), store.indexOf('const publishResults'));
  assert.ok(sealBody.includes('requestQuorum(') && sealBody.includes('approveQuorum('), 'the gate must go through the server');
  // الدوال المحلية كانت هي البوابة؛ بقاؤها داخل الختم يعني بابين، وأضعفهما هو الفعلي.
  assert.ok(!sealBody.includes('ensureQuorumAction('), 'the browser-side quorum must no longer gate sealing');
  assert.ok(!sealBody.includes('approveQuorumAction('), 'the browser-side approval must no longer gate sealing');
});

test('sealing goes through the server client, and no longer writes a browser-computed digest', () => {
  const store = read('src/lib/store.ts');
  assert.ok(store.includes('sealResultOnServer'), 'the store must seal through the server');
  const sealBody = store.slice(store.indexOf('const sealResults'), store.indexOf('const publishResults'));
  assert.ok(sealBody.includes('sealResultOnServer'), 'sealResults itself must call the server, not some neighbouring function');
  // البصمة المحلّية كانت تُكتب مباشرةً في `cryptographicChecksum`؛ صار المكتوب ما أعاده الخادم.
  assert.ok(sealBody.includes('serverSealSha256: seal.sealSha256'), 'the recorded seal must be the server-issued digest');
  assert.ok(/cryptographicChecksum:\s*`SHA256:\$\{seal\.sealSha256\}`/.test(sealBody), 'the published checksum must come from the server seal');
});

test('an unavailable authority refuses the seal instead of falling back to a local one', () => {
  const store = read('src/lib/store.ts');
  const sealBody = store.slice(store.indexOf('const sealResults'), store.indexOf('const publishResults'));
  assert.ok(sealBody.includes("reason:'server_authority_required'"), 'the refusal must be explicit');
  const refusalAt = sealBody.indexOf("server_authority_required");
  const writeAt = sealBody.indexOf('serverSealSha256: seal.sealSha256');
  assert.ok(refusalAt >= 0 && writeAt > refusalAt, 'the refusal must return before anything is marked sealed');
});

test('the refusal reaches a person, not only a return value', () => {
  // زرٌّ يُضغط فلا يقع شيء ولا يُشرح سببه يُقرأ عطلًا، فيُعاد الضغط ويُشكّ في النظام.
  for (const file of ['src/components/head-judge/HeadJudgeInbox.tsx', 'src/components/admin/CompetitionOverview.tsx']) {
    const text = read(file);
    assert.ok(text.includes('sealNote'), `${file} must surface why a seal was refused`);
    assert.ok(!/onClick=\{\(\)=>store\.sealResults\(\)\}/.test(text), `${file} must not fire and forget the seal`);
  }
});

test('the seal client never invents a digest of its own', () => {
  const client = read('src/lib/integrity-authority-client.ts');
  // أسماء الحقول تذكر sha256 بطبيعتها؛ المرفوض هو **استدعاء** تجزئة، لا ذكرها.
  assert.ok(!/createHash|crypto\.subtle|\bdigest\s*\(|from '\.\/crypto'/.test(client),
    'a client that can hash is a client that can forge a seal offline');
});

test('no client source computes a fair-draw seed the server is meant to hold', () => {
  // البذرة تُولَّد عند الخادم وتبقى عنده؛ مولّد ثانٍ في المتصفح يُفرغ الالتزام من معناه.
  const client = read('src/lib/integrity-authority-client.ts');
  assert.ok(!client.includes('getRandomValues'), 'the commitment client must not be able to produce its own seed');
});
