// PCM handling & framing (§13, §16).
//
// The engine accepts 16 kHz mono 16-bit little-endian PCM. This module decodes raw PCM bytes to
// float samples, offers a conservative linear resampler (for edge clients that emit 48 kHz), and a
// streaming framer that buffers samples across chunks and yields fixed analysis frames — with
// bounded memory (only a tail of unconsumed samples is retained).

export function decodePcmS16LE(bytes: Uint8Array): Float32Array {
  // Two bytes per sample, little-endian signed → [-1, 1).
  const n = bytes.length >> 1;
  const out = new Float32Array(n);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

/** Conservative linear resampler. Only used when the source rate ≠ 16 kHz (edge clients). */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = toRate / fromRate;
  const outLen = Math.floor(input.length * ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const frac = srcPos - i0;
    const a = input[i0] ?? 0;
    const b = input[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * Streaming framer. Push float samples as they arrive; pull complete frames. Retains only the
 * unconsumed tail, so memory is bounded regardless of session length.
 */
export class StreamingFramer {
  private tail: Float32Array = new Float32Array(0);
  private producedSamples = 0; // total samples ever consumed into frames (for audio clock)

  constructor(private frameLen: number, private hopLen: number) {}

  push(samples: Float32Array): Float32Array[] {
    const buf = new Float32Array(this.tail.length + samples.length);
    buf.set(this.tail, 0);
    buf.set(samples, this.tail.length);

    const frames: Float32Array[] = [];
    let offset = 0;
    while (offset + this.frameLen <= buf.length) {
      frames.push(buf.subarray(offset, offset + this.frameLen).slice());
      offset += this.hopLen;
      this.producedSamples += this.hopLen;
    }
    this.tail = buf.subarray(offset).slice();
    return frames;
  }

  /** Audio time (ms) of the START of the next frame to be produced, at a given sample rate. */
  frameStartMs(frameIndex: number, sampleRate: number): number {
    return (frameIndex * this.hopLen / sampleRate) * 1000;
  }
}
