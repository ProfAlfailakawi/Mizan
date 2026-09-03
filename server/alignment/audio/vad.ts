// Voice Activity Detection (§15).
//
// Distinguishes recitation from silence / breathing / room noise using frame energy (dBFS) with a
// zero-crossing sanity check and a hangover so brief dips inside speech are not chopped into pauses.
// Silence must NEVER be interpreted as progression — the engine consults this before advancing.

export type VadLabel = 'speech' | 'silence';

export interface VadFrameResult {
  label: VadLabel;
  energyDb: number;
  zcr: number;
  silenceRunMs: number; // how long the current silence run has lasted (0 while speaking)
}

export class Vad {
  private silenceFrames = 0;
  private speechFrames = 0;

  constructor(
    private readonly energyDbFloor: number,
    private readonly hangoverFrames: number,
    private readonly hopMs: number,
  ) {}

  process(frame: Float32Array): VadFrameResult {
    let sumSq = 0, crossings = 0;
    for (let i = 0; i < frame.length; i++) {
      sumSq += frame[i] * frame[i];
      if (i > 0 && ((frame[i] >= 0) !== (frame[i - 1] >= 0))) crossings++;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, frame.length));
    const energyDb = 20 * Math.log10(rms + 1e-10);
    const zcr = crossings / Math.max(1, frame.length);

    // Speech: above the energy floor. Very high ZCR at low energy is noise/fricative artifact.
    const looksSpeech = energyDb > this.energyDbFloor && !(energyDb < this.energyDbFloor + 6 && zcr > 0.45);

    let label: VadLabel;
    if (looksSpeech) {
      this.speechFrames++;
      this.silenceFrames = 0;
      label = 'speech';
    } else {
      this.silenceFrames++;
      // Hangover: stay 'speech' briefly after energy dips, to bridge natural intra-word gaps.
      label = this.silenceFrames <= this.hangoverFrames && this.speechFrames > 0 ? 'speech' : 'silence';
      if (label === 'silence') this.speechFrames = 0;
    }

    return {
      label,
      energyDb,
      zcr,
      silenceRunMs: label === 'silence' ? this.silenceFrames * this.hopMs : 0,
    };
  }
}
