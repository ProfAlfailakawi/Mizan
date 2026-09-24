/*
 * خطُّ المصحف يظهر من أوّل لحظة — لا يُرسم الوجهُ بخطٍّ ثمّ يتبدّل إلى غيره.
 *
 * «أميري قرآن» يُحمَّل من الموقع بـ`font-display: swap`، وجزؤه العربيُّ لا يُطلب إلا حين يُرسم
 * أوّلُ حرفٍ عربيّ. فكان الطالبُ يفتح «يسمعك» فيرى الآياتِ بخطٍّ احتياطيّ لحظةً ثمّ تتبدّل —
 * والتبدّلُ عند أوّل نظرةٍ إلى الوجه أسوأُ ما يكون. فيُطلب الخطُّ عند فتح الشاشة، ولا تُكشف
 * الكلماتُ حتى يجهز، ولا يُنتظر أكثرَ من `QURAN_FONT_TIMEOUT_MS`: فالخطُّ الاحتياطيّ أهونُ من
 * وجهٍ فارغ.
 */
import { useEffect, useState } from 'react';

export const QURAN_FONT_FAMILY = 'Amiri Quran';
export const QURAN_FONT_TIMEOUT_MS = 2500;
/* عيّنةٌ عربيّةٌ بتشكيلها — فيُطلب الجزءُ الذي يرسم الآيات لا الجزءُ اللاتينيّ. */
const SAMPLE = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ';
const SPEC = `1em "${QURAN_FONT_FAMILY}"`;

/** أجاهزٌ الخطُّ الآن؟ وخارج المتصفّح (التصييرُ على الخادم والاختبار) لا انتظار. */
export function quranFontReady(): boolean {
  if (typeof document === 'undefined' || !document.fonts) return true;
  try { return document.fonts.check(SPEC, SAMPLE); } catch { return true; }
}

/** يبدأ تحميلَ الخطّ — يُنادى عند فتح الشاشة، قبل أن يُسحب وجه. */
export function warmQuranFont(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  try { return document.fonts.load(SPEC, SAMPLE).then(() => undefined, () => undefined); } catch { return Promise.resolve(); }
}

/** يصير `true` حين يجهز الخطّ، أو حين تنقضي المهلة. */
export function useQuranFontReady(): boolean {
  const [ready, setReady] = useState(quranFontReady);
  useEffect(() => {
    if (ready) return;
    let live = true;
    const done = () => { if (live) setReady(true); };
    const timer = window.setTimeout(done, QURAN_FONT_TIMEOUT_MS);
    void warmQuranFont().then(done);
    return () => { live = false; window.clearTimeout(timer); };
  }, [ready]);
  return ready;
}
