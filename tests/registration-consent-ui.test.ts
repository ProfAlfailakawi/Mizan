import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = fs.readFileSync(path.join(process.cwd(), 'src/components/public/RegistrationFlow.tsx'), 'utf8');
const codeOnly = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('public registration records terms, privacy, audio and AI as independent decisions', () => {
  assert.doesNotMatch(codeOnly, /consentAccepted/, 'a single consent bit must never stand for four different decisions');
  for (const state of ['termsAccepted', 'privacyAccepted', 'audioAccepted', 'aiProcessingAccepted']) {
    assert.match(codeOnly, new RegExp(`\\[${state},set[A-Za-z]+\\]=useState\\(false\\)`), `${state} must have its own UI state`);
  }
  assert.match(codeOnly, /terms:termsAccepted,privacy:privacyAccepted/);
  assert.match(codeOnly, /audioRecording:policy\.judging\.requireAudioRecording\?audioAccepted:false/);
  assert.match(codeOnly, /aiProcessing:policy\.privacy\.allowAiProcessing\?aiProcessingAccepted:false/);
});

test('optional AI consent does not block submission while required audio consent does', () => {
  const required = codeOnly.match(/const requiredConsentsAccepted=([^;]+);/)?.[1] || '';
  assert.match(required, /termsAccepted/);
  assert.match(required, /privacyAccepted/);
  assert.match(required, /requireAudioRecording\|\|audioAccepted/);
  assert.doesNotMatch(required, /aiProcessingAccepted/, 'AI processing must remain optional when merely enabled');
  assert.match(codeOnly, /رفضها لا يمنع إرسال الطلب/);
});
