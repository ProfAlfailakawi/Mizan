import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { micUnavailableNote } from '../src/lib/micUnavailableNote';

test('in the iOS app the mic note points to Settings and never mentions Safari/Chrome/browser', () => {
  const t = micUnavailableNote(true, true);
  assert.match(t, /الإعدادات ‹ ميزان ‹ الميكروفون/);
  assert.doesNotMatch(t, /Safari|Chrome|المتصفّح|HTTPS/);
  assert.doesNotMatch(micUnavailableNote(false, true), /Safari|Chrome|browser/i);
});

test('in the browser the mic note is unchanged', () => {
  assert.match(micUnavailableNote(true, false), /افتح البطاقة عبر HTTPS في Safari أو Chrome/);
  assert.match(micUnavailableNote(false, false), /Safari or Chrome/);
});

test('MushafListens uses the helper (default arg = isAppleNativeShell)', () => {
  const src = fs.readFileSync('src/components/participant/MushafListens.tsx', 'utf8');
  assert.match(src, /setNote\(micUnavailableNote\(ar\)\)/);
  assert.doesNotMatch(src, /Safari أو Chrome/);
});
