import assert from 'node:assert/strict';
import test from 'node:test';
import { groupTokensByLine, measureLineBoxes, segmentLine, wordBoxesFromLines } from '../src/lib/mushaf-word-boxes';

/* سطرٌ مصنوع: كتلٌ حبرية بعروضٍ معلومة، وفجواتٌ داخل الكلمة أضيقُ من فجوات الكلمات. */
function line(blocks: { ink: number; gap: number }[]): number[] {
  const cols: number[] = [0, 0, 0];
  for (const b of blocks) { for (let i = 0; i < b.ink; i += 1) cols.push(5); for (let i = 0; i < b.gap; i += 1) cols.push(0); }
  return cols;
}

test('word gaps are chosen over letter gaps, and segments come back right-to-left', () => {
  // ثلاث كلمات؛ الثانية فيها فجوة حرفٍ ضيّقة (2) بين جزأيها، وفجوات الكلمات 8.
  const cols = line([{ ink: 20, gap: 8 }, { ink: 10, gap: 2 }, { ink: 10, gap: 8 }, { ink: 15, gap: 3 }]);
  const cut = segmentLine(cols, 3)!;
  assert.ok(cut.confident);
  assert.equal(cut.segments.length, 3);
  // أوّلُ كتلةٍ في القراءة هي أقصى اليمين.
  assert.ok(cut.segments[0].start > cut.segments[1].start && cut.segments[1].start > cut.segments[2].start);
  // الكلمةُ الوسطى تضمّ جزأيها معًا (10 + 2 + 10).
  assert.equal(cut.segments[1].end - cut.segments[1].start + 1, 22);
});

test('it says it is not confident when word gaps look like letter gaps', () => {
  const cols = line([{ ink: 10, gap: 5 }, { ink: 10, gap: 5 }, { ink: 10, gap: 5 }, { ink: 10, gap: 1 }]);
  const cut = segmentLine(cols, 2)!;
  assert.equal(cut.confident, false);
});

test('it refuses to invent boundaries the line does not have', () => {
  assert.equal(segmentLine(line([{ ink: 30, gap: 0 }]), 3), null);
  assert.equal(segmentLine([0, 0, 0, 0, 0, 0], 2), null);
});

test('ayah markers count as printed blocks, and a word without a line drops the whole face', () => {
  const words = [
    { index: 0, surah: 1, ayah: 1, endsAyah: false },
    { index: 1, surah: 1, ayah: 1, endsAyah: true },
    { index: 2, surah: 1, ayah: 2, endsAyah: false },
  ];
  const grouped = groupTokensByLine(words, w => (w.index < 2 ? 3 : 4))!;
  assert.deepEqual(grouped.lines.map(l => [l.line, l.tokens]), [[3, 3], [4, 1]]);
  assert.deepEqual(grouped.order.get(3), [0, 1, null]);
  assert.equal(groupTokensByLine(words, w => (w.index === 2 ? null : 1)), null);
});

test('measured boxes are bound to word indices only on confident lines', () => {
  // صفحة 40×10: سطرٌ واحد في الصفوف 2..7، فيه كتلتان (يمين: 25..34، يسار: 5..14).
  const width = 40, height = 10;
  const px = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 2; y <= 7; y += 1) for (const [a, b] of [[5, 14], [25, 34]]) for (let x = a; x <= b; x += 1) {
    const i = (y * width + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0;
  }
  const measured = measureLineBoxes(px, width, height, [{ top: 0.2, height: 0.6 }], [{ line: 1, tokens: 2 }]);
  assert.equal(measured.length, 1);
  const boxes = wordBoxesFromLines(measured, new Map([[1, [7, null]]]));
  // الكلمة 7 هي الأولى قراءةً = الكتلة اليمنى.
  assert.equal(boxes.get(7)!.x, 25 / 40);
  assert.equal(boxes.size, 1);
});
