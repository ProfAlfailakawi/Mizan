/*
 * مدّة ملف MP3، بلا اعتماد على أداة خارجية.
 *
 * الحاجة إليها واحدة ومحدّدة: **هل هذا التسجيل هو التسجيل الذي قيست عليه المقاطع؟** ومقارنة
 * نهاية آخر مقطع بمدّة الملف الفعلية هي الفحص الوحيد الذي يكشف نسخة أخرى لنفس القارئ — حيث
 * تبدو الفهارس سليمة تمامًا والتظليل ينزاح بصمت.
 *
 * تُقرأ المدّة من ترويسة Xing/VBRI حين توجد (وهي الأدقّ لأنها تحمل عدد الإطارات صراحةً)، وإلا
 * تُحسب من معدّل البتّ الثابت وحجم البيانات. وحين لا يُتيقّن من الشكل تُعاد null — ولا تُخمَّن
 * مدّة، لأن مدّةً مخمَّنة تُفسد الفحص الذي وُجدت من أجله.
 */

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** طول ترويسة ID3v2 إن وُجدت: حجمها مشفّر بسبع بتّات لكل بايت. */
function id3Size(buf) {
  if (buf.length < 10 || buf.toString('latin1', 0, 3) !== 'ID3') return 0;
  const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
  return 10 + size;
}

function parseFrameHeader(buf, offset) {
  if (offset + 4 > buf.length) return null;
  const h = (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
  if (((h >>> 21) & 0x7ff) !== 0x7ff) return null;            // مزامنة الإطار
  const versionBits = (h >>> 19) & 3;
  if (versionBits === 1) return null;                          // إصدار محجوز
  const layerBits = (h >>> 17) & 3;
  if (layerBits !== 1) return null;                            // Layer III وحدها
  const bitrateIndex = (h >>> 12) & 0xf;
  const rateIndex = (h >>> 10) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;

  const mpeg1 = versionBits === 3;
  const bitrate = (mpeg1 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[mpeg1 ? 3 : versionBits === 2 ? 2 : 0][rateIndex];
  if (!bitrate || !sampleRate) return null;

  const padding = (h >>> 9) & 1;
  const samplesPerFrame = mpeg1 ? 1152 : 576;
  const frameLength = Math.floor((samplesPerFrame / 8) * bitrate / sampleRate) + padding;
  const channelMode = (h >>> 6) & 3;
  return { bitrate, sampleRate, samplesPerFrame, frameLength, mpeg1, mono: channelMode === 3 };
}

/** ترويسة Xing/Info تحمل عدد الإطارات، وهي المصدر الصحيح للمدّة في الملفات متغيّرة المعدّل. */
function xingFrameCount(buf, frameOffset, frame) {
  const sideInfo = frame.mpeg1 ? (frame.mono ? 17 : 32) : (frame.mono ? 9 : 17);
  const at = frameOffset + 4 + sideInfo;
  if (at + 12 > buf.length) return null;
  const tag = buf.toString('latin1', at, at + 4);
  if (tag !== 'Xing' && tag !== 'Info') return null;
  const flags = buf.readUInt32BE(at + 4);
  if (!(flags & 1)) return null;                               // لا يحمل عدد الإطارات
  return buf.readUInt32BE(at + 8);
}

/**
 * مدّة الملف بالمللي ثانية، أو null إذا لم يُتيقّن من الشكل.
 * @param {Buffer} buf محتوى الملف كاملًا
 */
export function mp3DurationMs(buf) {
  if (!buf || buf.length < 32) return null;
  const start = id3Size(buf);

  // أول إطار صالح: يُبحث عنه ضمن مدى محدود فلا نجوب ملفًا ليس MP3 أصلًا.
  let offset = -1, frame = null;
  for (let i = start; i < Math.min(buf.length - 4, start + 65536); i++) {
    const candidate = parseFrameHeader(buf, i);
    if (!candidate) continue;
    // إطار تالٍ صالح يؤكّد أننا لسنا على تطابق عابر داخل بيانات وصفية.
    if (parseFrameHeader(buf, i + candidate.frameLength)) { offset = i; frame = candidate; break }
  }
  if (offset < 0 || !frame) return null;

  const frames = xingFrameCount(buf, offset, frame);
  if (frames) return Math.round((frames * frame.samplesPerFrame * 1000) / frame.sampleRate);

  // معدّل ثابت: المدّة من حجم بيانات الصوت. تقريبٌ دقيق بما يكفي لفحص تطابق التسجيل.
  const audioBytes = buf.length - offset;
  return Math.round((audioBytes * 8 * 1000) / frame.bitrate);
}

/** ترويسة إطار MP3 مُركّبة للاختبار — تُبنى بالبتّات لا تُنسخ من ملف. */
export function buildFrameHeader({ bitrateIndex, rateIndex = 0, mpeg1 = true, padding = 0, mono = true }) {
  let h = 0xfff00000;                                          // مزامنة
  h |= (mpeg1 ? 3 : 2) << 19;                                  // الإصدار
  h |= 1 << 17;                                                // Layer III
  h |= 1 << 16;                                                // بلا حماية CRC
  h |= bitrateIndex << 12;
  h |= rateIndex << 10;
  h |= padding << 9;
  h |= (mono ? 3 : 0) << 6;
  const b = Buffer.alloc(4);
  b.writeUInt32BE(h >>> 0, 0);
  return b;
}
