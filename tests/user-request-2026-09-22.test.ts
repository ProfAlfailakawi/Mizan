import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file: string) => fs.readFileSync(file, 'utf8');

test('judge Mushaf keeps optional aids collapsed so the full face owns the cockpit', () => {
  const surface = read('src/components/judge/OfficialMushafSurface.tsx');
  const css = read('src/index.css');

  assert.match(surface, /const \[audioOpen,setAudioOpen\]=useState\(false\)/);
  assert.match(surface, /const \[divergenceOpen,setDivergenceOpen\]=useState\(false\)/);
  assert.match(surface, /delivery&&audioOpen&&<div className="mizan-mushaf-drawer">/);
  assert.match(surface, /delivery&&divergenceOpen&&<div className="mizan-mushaf-drawer">/);
  assert.match(surface, /<MushafToolButton pressed=\{divergenceOpen\}/);
  assert.match(surface, /<MushafToolButton pressed=\{textView\}/);

  assert.match(css, /\.mizan-judge-os \.mizan-official-page,[\s\S]*?max-height:100%;[\s\S]*?height:100%;/);
  assert.match(css, /\.mizan-judge-os \.mizan-official-page \.mizan-mushaf-page\{[\s\S]*?height:100%;[\s\S]*?width:auto;/);
  assert.match(css, /\.mizan-judge-os \.mizan-mushaf-drawer\{[\s\S]*?position:absolute;[\s\S]*?bottom:calc\(48px \+ env\(safe-area-inset-bottom\)\)/);
});

test('public registration simplifies consents into 2-3 clean items without issuer/document subtitle', () => {
  const flow = read('src/components/public/RegistrationFlow.tsx');

  // Unified terms and privacy text
  assert.match(flow, /أوافق على شروط المشاركة وعلى سياسة الخصوصية/);
  // Checked state toggles both termsAccepted and privacyAccepted
  assert.match(flow, /checked=\{termsAccepted&&privacyAccepted\}/);
  assert.match(flow, /setTermsAccepted\(v\);setPrivacyAccepted\(v\);/);
  // Audio consent is clean and concise
  assert.match(flow, /أوافق على تسجيل تلاوتي صوتيًا/);
  // No document metadata is passed to the review consents
  assert.doesNotMatch(flow, /document=\{legalDocuments\?\.terms\}/);
  assert.doesNotMatch(flow, /document=\{legalDocuments\?\.privacy\}/);
});
