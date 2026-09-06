import test from 'node:test';
import assert from 'node:assert/strict';
import { generativeFairDraw } from '../server/kfgqpc-fairdraw-generative';

/**
 * A draw must be two things at once: unpredictable to the people it judges, and reproducible to
 * the people who audit it. These tests pin both, plus the rule that matters most in the hall — a
 * passage always begins where a reciter can actually begin.
 */

// حزمة مصغّرة: سورتان، إحداهما قصيرة لاختبار القصّ عند نهاية السورة.
const ROWS = [
  ...Array.from({ length: 20 }, (_, i) => ({ sora: 1, sora_name_ar: 'الأولى', sora_name_en: 'First', aya_no: i + 1, page: 1 + Math.floor(i / 8), line_start: 1, line_end: 2, jozz: 1, aya_text: `آية رقم ${i + 1} من السورة الأولى ${i + 1}` })),
  ...Array.from({ length: 5 }, (_, i) => ({ sora: 2, sora_name_ar: 'الثانية', sora_name_en: 'Second', aya_no: i + 1, page: 4, line_start: 1, line_end: 2, jozz: 2, aya_text: `آية رقم ${i + 1} من السورة الثانية ${i + 1}` })),
];

/** مستودع تسليم مصغّر يكفي لعقد generativeFairDraw. */
const delivery: any = {
  async quranData() { return ROWS; },
  async passage(reading: string, surah: number, startAyah: number, endAyah: number) {
    const sel = ROWS.filter((r) => r.sora === surah && r.aya_no >= startAyah && r.aya_no <= endAyah).sort((a, b) => a.aya_no - b.aya_no);
    if (!sel.length) return null;
    return {
      reading, surah, startAyah: sel[0].aya_no, endAyah: sel[sel.length - 1].aya_no,
      ayat: sel.map((r) => ({ surah: r.sora, ayah: r.aya_no, text: r.aya_text, page: r.page, lineStart: r.line_start, lineEnd: r.line_end, juz: r.jozz, surahNameArabic: r.sora_name_ar })),
      text: sel.map((r) => r.aya_text).join(' '),
      loci: [...new Set(sel.map((r) => r.page))].map((page) => ({ page, lineStart: 1, lineEnd: 2 })),
      surahNameArabic: sel[0].sora_name_ar, juz: sel[0].jozz,
      provenance: { mode: 'DELIVERY_OPEN_MIRROR', authority: 'KFGQPC', note: '' },
    };
  },
};

test('the same seed always reproduces the same passage, so a draw can be audited', async () => {
  const a = await generativeFairDraw(delivery, { reading: 'hafs', seed: 'audit-seed-2026' });
  const b = await generativeFairDraw(delivery, { reading: 'hafs', seed: 'audit-seed-2026' });
  assert.ok(a && b);
  assert.equal(a!.passage.surah, b!.passage.surah);
  assert.equal(a!.passage.startAyah, b!.passage.startAyah);
  assert.equal(a!.passage.endAyah, b!.passage.endAyah);
  assert.equal(a!.draw.anchorType, b!.draw.anchorType);
  assert.equal(a!.draw.reproducible, true);
});

test('different seeds spread across the corpus rather than settling on one passage', async () => {
  const seen = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const r = await generativeFairDraw(delivery, { reading: 'hafs', seed: `spread-${i}` });
    if (r) seen.add(`${r.passage.surah}:${r.passage.startAyah}`);
  }
  assert.ok(seen.size >= 8, `expected a spread of starting points, saw ${seen.size}`);
});

test('a passage always begins on a real ayah, never mid-ayah', async () => {
  for (let i = 0; i < 20; i++) {
    const r = await generativeFairDraw(delivery, { reading: 'hafs', seed: `boundary-${i}` });
    assert.ok(r);
    const first = r!.passage.ayat[0];
    assert.equal(first.ayah, r!.passage.startAyah, 'the passage must start at the first ayah it contains');
    assert.ok(Number.isInteger(first.ayah) && first.ayah >= 1);
  }
});

test('a passage never crosses into another surah', async () => {
  for (let i = 0; i < 20; i++) {
    const r = await generativeFairDraw(delivery, { reading: 'hafs', seed: `surah-${i}` });
    assert.ok(r);
    for (const a of r!.passage.ayat) assert.equal(a.surah, r!.passage.surah);
  }
});

test('an anchor near the end of a surah still yields a full-length passage', async () => {
  // السورة الثانية خمس آيات فقط: المرساة عند آخرها يجب أن تُزاح للخلف لا أن تُنتج آية واحدة.
  const r = await generativeFairDraw(delivery, { reading: 'hafs', surah: 2, seed: 'tail', minAyahCount: 4, maxAyahCount: 4 });
  assert.ok(r);
  const count = r!.passage.endAyah - r!.passage.startAyah + 1;
  assert.equal(count, 4, 'clipping must not leave a one-ayah passage');
  assert.ok(r!.passage.endAyah <= 5, 'and must not run past the end of the surah');
});

test('a surah shorter than the requested length is taken whole rather than padded', async () => {
  const r = await generativeFairDraw(delivery, { reading: 'hafs', surah: 2, seed: 'short', minAyahCount: 9, maxAyahCount: 9 });
  assert.ok(r);
  assert.equal(r!.passage.startAyah, 1);
  assert.equal(r!.passage.endAyah, 5);
});

test('anchor constraints are honoured: a surah-start draw begins at ayah one', async () => {
  for (let i = 0; i < 6; i++) {
    const r = await generativeFairDraw(delivery, { reading: 'hafs', anchor: 'SURAH_START', seed: `anchor-${i}` });
    assert.ok(r);
    assert.equal(r!.passage.startAyah, 1);
    assert.equal(r!.draw.anchorType, 'SURAH_START');
  }
});

test('a juz constraint keeps the draw inside that juz', async () => {
  for (let i = 0; i < 6; i++) {
    const r = await generativeFairDraw(delivery, { reading: 'hafs', juz: 2, seed: `juz-${i}` });
    assert.ok(r);
    for (const a of r!.passage.ayat) assert.equal(a.juz, 2);
  }
});

test('the draw reports what it actually did, so the proof is checkable', async () => {
  const r = await generativeFairDraw(delivery, { reading: 'hafs', seed: 'proof-seed' });
  assert.ok(r);
  const d = r!.draw;
  assert.equal(d.seed, 'proof-seed', 'the seed must be disclosed for replay');
  assert.ok(d.candidateCount > 0);
  assert.ok(d.selectedIndex >= 0 && d.selectedIndex < d.candidateCount, 'the index must fall inside the candidate set');
  assert.equal(d.ayahCount, r!.passage.ayat.length, 'the reported length must match the passage');
  assert.match(d.algorithm, /HMAC-SHA256/);
});

test('an unknown reading yields nothing rather than a substituted narration', async () => {
  const empty: any = { async quranData() { return null; }, async passage() { return null; } };
  assert.equal(await generativeFairDraw(empty, { reading: 'unknown-riwayah' }), null);
});
