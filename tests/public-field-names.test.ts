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
