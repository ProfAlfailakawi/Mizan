import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { framedChunk, microphoneErrorNote, microphoneFailureKind } from '../src/lib/microphone-capture';

test('every chunk after the first carries the recording header and declares its size', async () => {
  const head = new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2])], { type: 'audio/webm;codecs=opus' });
  const later = new Blob([new Uint8Array([9, 9, 9])], { type: 'audio/webm;codecs=opus' });

  const first = framedChunk(head, head);
  assert.equal(first.blob, head);
  assert.equal(first.headBytes, 0);

  const framed = framedChunk(head, later);
  assert.equal(framed.headBytes, head.size);
  assert.equal(framed.blob.size, head.size + later.size);
  assert.equal(framed.blob.type, 'audio/webm;codecs=opus');
  const bytes = new Uint8Array(await framed.blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], 'the decodable header leads the upload');
  assert.deepEqual([...bytes.slice(head.size)], [9, 9, 9]);
});

test('microphone failures are told apart: permission, missing device, busy device', () => {
  const err = (name: string) => Object.assign(new Error(name), { name });
  assert.equal(microphoneFailureKind(err('NotAllowedError')), 'denied');
  assert.equal(microphoneFailureKind(err('NotFoundError')), 'missing');
  assert.equal(microphoneFailureKind(err('NotReadableError')), 'busy');
  assert.equal(microphoneFailureKind(new Error('boom')), 'other');
  assert.equal(microphoneFailureKind(undefined), 'other');
  assert.match(microphoneErrorNote(err('NotFoundError'), true), /لم يجد الجهاز ميكروفونًا/);
  assert.doesNotMatch(microphoneErrorNote(err('NotReadableError'), true), /لم يُسمح/);
});

test('the practice surfaces frame their chunks and name the real microphone failure', () => {
  for (const file of ['src/components/participant/TrialRun.tsx', 'src/components/participant/WarmupSanctuary.tsx']) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, /framedChunk\(/, `${file}: chunks are framed with the recording header`);
    assert.match(source, /headBytes/, `${file}: the header size is declared to the listener`);
    assert.match(source, /microphoneErrorNote\(/, `${file}: the microphone failure is named`);
  }
  assert.match(fs.readFileSync('src/components/participant/PracticeStudio.tsx', 'utf8'), /microphoneErrorNote\(/);
});

test('a microphone failure is announced, not only painted', () => {
  assert.match(fs.readFileSync('src/components/participant/PracticeStudio.tsx', 'utf8'), /micError&&<p role="alert"/);
  assert.match(fs.readFileSync('src/components/participant/TrialRun.tsx', 'utf8'), /\{error && <p role="alert"/);
});

test('the judge shadow listener receives framed chunks and the server forwards the header size', () => {
  const judge = fs.readFileSync('src/components/judge/JudgeOS.tsx', 'utf8');
  const send = judge.slice(judge.indexOf('const sendAlignmentChunk='), judge.indexOf('const sendAlignmentChunk=') + 600);
  assert.match(send, /framedChunk\(head,blob\)/);
  assert.match(send, /headBytes:framed\.headBytes/);
  assert.match(fs.readFileSync('src/lib/quran-intelligence.ts', 'utf8'), /submitQuranAlignmentChunk[\s\S]{0,700}x-mizan-head-bytes/);
  const server = fs.readFileSync('server.ts', 'utf8');
  const route = server.slice(server.indexOf("app.post('/api/quran/alignment/shadow/audio'"));
  assert.match(route.slice(0, route.indexOf('\n')), /headBytes:Number\(soleParam\(req\.headers\['x-mizan-head-bytes'\]/);
});

test('a late reply for an older chunk never overwrites the newer position', () => {
  for (const file of ['src/components/participant/TrialRun.tsx', 'src/components/participant/WarmupSanctuary.tsx']) {
    const source = fs.readFileSync(file, 'utf8');
    const at = source.indexOf('const order = ++sent;');
    assert.ok(at > 0, `${file}: each upload takes its order before it is sent`);
    const after = source.slice(at);
    const guard = after.indexOf('if (order < applied) return;');
    assert.ok(guard > 0 && guard < after.indexOf('setLast(out)'), `${file}: the stale reply is dropped before the position is written`);
  }
});

test('the judge microphone gate names the actual failure', () => {
  const judge = fs.readFileSync('src/components/judge/JudgeOS.tsx', 'utf8');
  assert.match(judge, /catch\(err\)\{setShadowMicActive\(false\);setMicFailure\(err\);setAudioState\('failed'\)\}/);
  assert.match(judge, /audioState==='failed'&&micFailure!==null&&<p role="alert"[^>]*>\{microphoneErrorNote\(micFailure,ar\)\}/);
});
