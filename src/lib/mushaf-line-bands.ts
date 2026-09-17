/*
 * نطاقات الأسطر على صفحة المصحف — تُقاس من الصفحة، لا تُخمَّن عنها.
 *
 * كانت العدسة توضع بحسابٍ ثابت: «النص يبدأ عند ٨٫٥٪ من أعلى الصفحة ويشغل ٨٣٪ منها،
 * والأسطر متساوية». وهذا يصحّ في صفحةٍ ويخطئ في أختها: صفحةٌ فيها عنوان سورة تُزيح
 * أسطرها، والصفحات الأولى أقلّ أسطرًا من غيرها، والهوامش تختلف. فالتظليل يقع قريبًا من
 * السطر لا عليه — وقريبٌ من السطر في المصحف ليس صوابًا.
 *
 * والمصادر المفتوحة للتخطيط تحمل رقم السطر ولا تحمل إحداثيات، فلا هندسة تُقرأ من بيانات.
 * لكنّ الصفحة المطبوعة تحمل هندستها في حبرها: كل سطرٍ شريطٌ داكن يفصله عن أخيه بياض.
 * فيُحسب مقدار الحبر في كل صفٍّ من البكسل، وتُستخرج الأشرطة، فيكون السطر حيث هو فعلًا.
 *
 * وهذا لا يمسّ المرجع العلمي بشيء: إثراءٌ بصري لموضع العدسة وحده. ومتى لم يتيقّن —
 * عدد الأشرطة لا يطابق عدد الأسطر المُعلن — رجع فارغًا ولم يخمّن، فتبقى العدسة على
 * الحساب التقريبي ويُقال للمحكّم إنه تقريبي.
 */

export interface LineBand {
  /** أعلى الشريط كنسبة من ارتفاع الصفحة (0..1). */
  top: number;
  /** ارتفاع الشريط كنسبة من ارتفاع الصفحة (0..1). */
  height: number;
}

export interface BandOptions {
  /** عدد الأسطر المتوقَّع على الصفحة. المطابقة شرط القبول. */
  expectedLines?: number;
  /** أقلّ ارتفاع يُقبل شريطًا، كنسبة من الصفحة — يستبعد نقاط الحبر والحواشي. */
  minBandRatio?: number;
  /** فجوة بيضاء أدقّ من هذه تُدمج: التشكيل يقطع السطر ولا يفصله. */
  mergeGapRatio?: number;
}

const DEFAULTS = { minBandRatio: 0.012, mergeGapRatio: 0.006 };

/**
 * يستخرج أشرطة الأسطر من مقدار الحبر في كل صفّ بكسل.
 *
 * `ink[i]` مقدار السواد في الصفّ رقم i (أي مقياس موجب متسق). لا يُفترض شكلٌ للصفحة ولا
 * لعدد أسطرها؛ العتبة نسبيّة من أعلى قيمة في الصفحة نفسها، فتصحّ مع المسح الفاتح والداكن.
 */
export function bandsFromInkProfile(ink: number[], options: BandOptions = {}): LineBand[] {
  const height = ink.length;
  if (height < 8) return [];
  const minBand = Math.max(1, Math.round((options.minBandRatio ?? DEFAULTS.minBandRatio) * height));
  const mergeGap = Math.max(1, Math.round((options.mergeGapRatio ?? DEFAULTS.mergeGapRatio) * height));

  const peak = ink.reduce((m, v) => (v > m ? v : m), 0);
  if (peak <= 0) return [];
  /* عتبة نسبيّة: ما دون ١٢٪ من أكثف صفٍّ في الصفحة بياضٌ بين سطرين، لا سطر. */
  const threshold = peak * 0.12;

  const raw: { start: number; end: number }[] = [];
  let start = -1;
  for (let y = 0; y < height; y += 1) {
    const on = ink[y] > threshold;
    if (on && start < 0) start = y;
    if (!on && start >= 0) { raw.push({ start, end: y - 1 }); start = -1 }
  }
  if (start >= 0) raw.push({ start, end: height - 1 });
  if (!raw.length) return [];

  /* التشكيل والمدّ يقطعان الصفّ فتظهر فجوة رفيعة داخل السطر الواحد: تُدمج. */
  const merged: { start: number; end: number }[] = [raw[0]];
  for (let i = 1; i < raw.length; i += 1) {
    const prev = merged[merged.length - 1];
    if (raw[i].start - prev.end - 1 <= mergeGap) prev.end = raw[i].end;
    else merged.push(raw[i]);
  }

  const kept = merged.filter(b => b.end - b.start + 1 >= minBand);
  if (!kept.length) return [];

  if (options.expectedLines !== undefined && kept.length !== options.expectedLines) return [];

  return kept.map(b => ({ top: b.start / height, height: (b.end - b.start + 1) / height }));
}

/**
 * يجمع أشرطة الأسطر من `lineStart` إلى `lineEnd` في نطاقٍ واحد متصل.
 *
 * الأسطر تُرقَّم من واحد كما تُقرأ. ويُعاد `null` متى خرج الطلب عن الصفحة، فلا يُظلَّل
 * سطرٌ ليس هو المقصود.
 */
export function bandSpan(bands: LineBand[], lineStart: number, lineEnd: number): LineBand | null {
  if (!bands.length) return null;
  const first = Math.min(lineStart, lineEnd), last = Math.max(lineStart, lineEnd);
  if (!Number.isInteger(first) || !Number.isInteger(last)) return null;
  if (first < 1 || last > bands.length) return null;
  const a = bands[first - 1], b = bands[last - 1];
  return { top: a.top, height: b.top + b.height - a.top };
}

/**
 * يقيس مقدار الحبر في كل صفّ من صورة الصفحة.
 *
 * يُرسم على لوحةٍ مصغَّرة العرض: موضع السطر رأسيٌّ، فعرضٌ صغير يكفي ويُرخِص الحساب.
 * والصورة تأتي من blob على الأصل نفسه، فاللوحة غير ملوَّثة وقراءتها مسموحة.
 */
export function inkProfileFromImage(image: CanvasImageSource, width: number, height: number, sampleWidth = 96): number[] | null {
  if (!width || !height) return null;
  try {
    const canvas = document.createElement('canvas');
    const rows = Math.min(height, 1400);
    canvas.width = sampleWidth; canvas.height = rows;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, sampleWidth, rows);
    const { data } = ctx.getImageData(0, 0, sampleWidth, rows);
    const ink: number[] = new Array(rows).fill(0);
    for (let y = 0; y < rows; y += 1) {
      let sum = 0;
      for (let x = 0; x < sampleWidth; x += 1) {
        const i = (y * sampleWidth + x) * 4;
        const alpha = data[i + 3] / 255;
        /* السواد على البياض: كلّما قلّ اللمعان زاد الحبر. الشفافية تُحسب بياضًا. */
        const luma = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
        sum += alpha * (1 - luma);
      }
      ink[y] = sum;
    }
    return ink;
  } catch { return null }
}
