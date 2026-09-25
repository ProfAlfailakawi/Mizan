/*
 * مسجِّلُ الصفحة — يُحقن قبل أن تُحمَّل، ويكتب في `window.__liveListen`:
 *
 * ـ `trans`: كلَّ تغيّرٍ في حال كلّ كلمةٍ على الوجه كلَّ ٥٠ ملّي ثانية —
 *   `[زمن، فهرس، "live|veiled|mistake"]` من سمات `data-live` و`data-veiled` و`data-mistake`.
 *   (السجلُّ الكامل لا «أوّلُ ظهور»: نصُّ الكلمة يتغيّر حين تُعلَّم، فمن حفظ «أوّلَ ظهورٍ»
 *   مقرونًا بالنصّ أضاع أوقاتًا — قِيس ذلك وصُحّح.)
 * ـ `gum` و`onset`: لحظةُ فتح الميكروفون، وأوّلُ لحظةٍ جاء فيها صوت. والملفُّ يبدأ من أوّله حين
 *   يُفتح الجهاز، فالبدايةُ مرساةُ الزمن كلِّه (أوّلُ كلمةٍ في الملفّ عند ٣٠ ملّي ثانية).
 *
 * ـ `recorders`: لكلّ `MediaRecorder` لحظةُ بدئه، ولكلّ مقطعٍ منه لحظةُ وصوله و`timecode` المتصفّح وحجمُه.
 *   فالصفحةُ تحسب زمنَ الكلمة على أنّ المقطعَ ١٥٠٠ ملّي ثانيةٍ بالضبط؛ وهذا يقيس ما هو حقًّا.
 *
 * الأزمنةُ كلُّها `performance.now()` الصفحة.
 */
export const RECORDER = String.raw`(() => {
  if (window.__liveListen) return;
  const R = window.__liveListen = { gum: null, onset: null, trans: [], last: {} };
  const orig = navigator.mediaDevices && navigator.mediaDevices.getUserMedia && navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  if (orig) navigator.mediaDevices.getUserMedia = async (c) => {
    const s = await orig(c); R.gum = performance.now();
    try {
      const ac = new AudioContext(); const an = ac.createAnalyser(); an.fftSize = 1024;
      ac.createMediaStreamSource(s.clone()).connect(an); if (ac.state !== 'running') ac.resume().catch(() => {});
      const buf = new Float32Array(an.fftSize);
      const tick = () => { if (R.onset !== null) return; an.getFloatTimeDomainData(buf); let e = 0; for (const v of buf) e += v * v; if (Math.sqrt(e / buf.length) > 0.02) R.onset = performance.now(); };
      const id = setInterval(() => { tick(); if (R.onset !== null) clearInterval(id); }, 10);
    } catch (e) { R.err = String(e); }
    return s;
  };
  if (window.MediaRecorder) {
    const start = MediaRecorder.prototype.start;
    MediaRecorder.prototype.start = function (slice) {
      const log = { startedAt: performance.now(), slice: slice === undefined ? null : slice, mime: this.mimeType || null, chunks: [] };
      (R.recorders = R.recorders || []).push(log);
      this.addEventListener('dataavailable', (e) => log.chunks.push([Math.round(performance.now() * 10) / 10, typeof e.timecode === 'number' ? Math.round(e.timecode * 10) / 10 : null, e.data ? e.data.size : 0]));
      return start.call(this, slice);
    };
  }
  setInterval(() => {
    const t = Math.round(performance.now());
    for (const el of document.querySelectorAll('[data-word]')) {
      const i = el.dataset.word;
      const st = (el.dataset.live || '-') + '|' + (el.dataset.veiled === 'true' ? 'V' : '-') + '|' + (el.dataset.mistake || '-');
      if (R.last[i] !== st) { R.trans.push([t, +i, st]); R.last[i] = st; }
    }
  }, 50);
})();`;
