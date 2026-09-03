import test from 'node:test';
import assert from 'node:assert/strict';
import { MfccExtractor, fft } from '../server/alignment/audio/features';
import { Vad } from '../server/alignment/audio/vad';
import { decodePcmS16LE } from '../server/alignment/audio/pcm';

// These tests prove the DSP front-end is REAL (not a stub): the FFT resolves a known tone, MFCC is
// deterministic and sensitive to frequency, and VAD separates a tone from silence.

function tone(freqHz: number, ms: number, sr = 16000, amp = 0.6): Float32Array {
  const n = Math.round((ms / 1000) * sr);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / sr);
  return out;
}

test('FFT resolves a pure tone at the correct bin', () => {
  const N = 1024, sr = 16000, freq = 1000;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < N; i++) re[i] = Math.sin((2 * Math.PI * freq * i) / sr);
  fft(re, im);
  let peakBin = 0, peak = -1;
  for (let k = 1; k < N / 2; k++) { const mag = re[k] * re[k] + im[k] * im[k]; if (mag > peak) { peak = mag; peakBin = k; } }
  const peakHz = (peakBin * sr) / N;
  assert.ok(Math.abs(peakHz - freq) < (sr / N) * 1.5, `peak ${peakHz}Hz should be near ${freq}Hz`);
});

test('MFCC is deterministic and discriminates frequencies', () => {
  const ex = new MfccExtractor(16000, 400, 26, 13);
  const a1 = ex.extract(tone(500, 25));
  const a2 = ex.extract(tone(500, 25));
  const b = ex.extract(tone(2500, 25));
  // Determinism.
  for (let i = 0; i < a1.length; i++) assert.equal(a1[i], a2[i]);
  // Different tones ⇒ different cepstra.
  let diff = 0; for (let i = 0; i < a1.length; i++) diff += Math.abs(a1[i] - b[i]);
  assert.ok(diff > 1e-3, 'MFCC of 500Hz and 2500Hz tones must differ');
});

test('VAD separates tone from silence', () => {
  const vad = new Vad(-55, 30, 10);
  const speech = vad.process(tone(800, 25, 16000, 0.6));
  const silence = new Vad(-55, 30, 10).process(new Float32Array(400)); // zeros
  assert.equal(speech.label, 'speech');
  assert.equal(silence.label, 'silence');
});

test('PCM s16le round-trips through decode', () => {
  const buf = Buffer.alloc(4);
  buf.writeInt16LE(16384, 0); buf.writeInt16LE(-16384, 2);
  const f = decodePcmS16LE(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  assert.ok(Math.abs(f[0] - 0.5) < 1e-3);
  assert.ok(Math.abs(f[1] + 0.5) < 1e-3);
});
