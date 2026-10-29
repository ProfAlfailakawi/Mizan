/*
 * حقولٌ يكتب فيها الزائرُ رمزًا أو سببًا، بلا اسمٍ منطوق إلا نصَّ الإرشاد (placeholder)،
 * وهو يختفي عند الكتابة ولا يُعتمد اسمًا. وزرُّ إغلاقٍ أيقونةٌ بلا اسم.
 *
 * ورمزُ الرحلة `mz_journey_…` حسّاسٌ لحالة الأحرف (base64url): لوحةُ مفاتيح الهاتف تكبّر
 * أوّلَ حرفٍ فيصير `Mz_journey_…` فلا يُعرف رمزًا. فيُطفأ التكبيرُ والتصحيحُ في حقله.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (f: string) => fs.readFileSync(f, 'utf8');
const tagOf = (source: string, start: string) => {
  const i = source.indexOf(start);
  assert.ok(i >= 0, `${start} exists`);
  return source.slice(i, source.indexOf('/>', i));
};

test('code and appeal fields carry a spoken name, not only a placeholder', () => {
  assert.match(tagOf(read('src/components/public/JourneyAccess.tsx'), '<input value={input}'), /aria-label=/);
  assert.match(tagOf(read('src/components/public/CertificateVerification.tsx'), '<input value={searchCode}'), /aria-label=/);
  assert.match(tagOf(read('src/components/gate/KioskMode.tsx'), '<input value={code}'), /aria-label=/);
  assert.match(tagOf(read('src/components/participant/ParticipantDashboard.tsx'), '<textarea value={appealText}'), /aria-label=/);
});

test('the case-sensitive journey code is not capitalised or corrected by a phone keyboard', () => {
  const tag = tagOf(read('src/components/public/JourneyAccess.tsx'), '<input value={input}');
  assert.match(tag, /autoCapitalize="none"/);
  assert.match(tag, /autoCorrect="off"/);
  assert.match(tag, /spellCheck=\{false\}/);
});

test('the hall map close button has a name', () => {
  const s = read('src/components/public/HallRecitationMap.tsx');
  const at = s.indexOf('onClick={onClose}');
  assert.match(s.slice(at - 40, at + 200), /aria-label=/);
});

test('a pasted journey link (or message line) yields the code inside it', async () => {
  const { journeyCodeFromInput } = await import('../src/lib/journey-code');
  const looksLikeJourneyToken = (v: string) => /^mz_(journey|guardian)_[A-Za-z0-9_-]+$/.test(v.trim());
  assert.match(read('src/components/public/JourneyAccess.tsx'), /const clean = journeyCodeFromInput\(input\);/, 'manual entry goes through the extractor');
  const code = 'mz_journey_AbC-12_xyZ';
  assert.equal(journeyCodeFromInput(`  ${code} `), code);
  assert.equal(journeyCodeFromInput(`https://mizan.example/#journey?comp=c1&key=${code}`), code);
  assert.equal(journeyCodeFromInput(`رمز رحلتك: ${code}\nلا تشاركه`), code);
  assert.equal(journeyCodeFromInput('mz_guardian_Q9'), 'mz_guardian_Q9');
  assert.equal(journeyCodeFromInput(' A-104 '), 'A-104', 'anything else is passed through, trimmed');
  assert.ok(looksLikeJourneyToken(journeyCodeFromInput(`https://x/#j?key=${code}`)));
});

test('the appeal dialog behaves like every other dialog: focus in, Escape out, a real close target', () => {
  const s = read('src/components/participant/ParticipantDashboard.tsx');
  assert.match(s, /useDialogBehavior\(showAppeal,\(\)=>setShowAppeal\(false\),appealRef\)/);
  const dialog = s.slice(s.indexOf('{showAppeal&&<div role="dialog"'));
  assert.match(dialog.slice(0, 400), /<div ref=\{appealRef\}/);
  assert.match(dialog.slice(0, 900), /<button type="button" onClick=\{\(\)=>setShowAppeal\(false\)\} className="min-h-11/);
});
