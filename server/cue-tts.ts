/*
 * توليد صوت "عبارة إنهاء الموضع" فقط — وهي عبارة غير قرآنية يقولها المحكم للمتسابق
 * (مثل: «حسبك، جزاك الله خيرًا»). لا يمر النص القرآني من هنا بحال:
 *   - القرآن يُشغَّل حصرًا من تلاوة مرجعية معتمدة عبر /api/public/kfgqpc/audio.
 *   - وهذا المسار يرفض أي نص لا يطابق شكل عبارة الإيقاف القصيرة (فحص `cueTextAllowed`).
 *
 * التوليد عبر Gemini TTS، والناتج PCM خام يُغلَّف بترويسة WAV ويُخزَّن على القرص
 * بمفتاح مشتق من (النص + الصوت + النموذج) حتى لا نكرر النداء لكل جلسة.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/** تشكيلة عبارات الإيقاف المعتمدة — تُستعمل بالتناوب حتى لا تتكرر عبارة واحدة طوال اليوم. */
export const CUE_PHRASES_AR = [
  'حسبك، جزاك الله خيرًا',
  'بارك الله فيك، قف هنا',
  'أحسنت، نكتفي بهذا الموضع',
  'جزاك الله خيرًا، توقّف هنا',
  'أحسنت، بارك الله فيك',
  'كفى، وفقك الله',
  'شكرًا لك، نتوقف هنا',
  'أحسنت القراءة، جزاك الله خيرًا',
];

const QURAN_MARKERS = /[۝﴾﴿ٰ۠-ۭ]|﴿|﴾|۝/;

/**
 * حارس شكل العبارة: قصيرة، بلا علامات مصحفية، وبلا أرقام آيات.
 * الغرض منع تمرير نص قرآني إلى محرك تحويل النص إلى كلام — لا تجميل الإدخال.
 */
export function cueTextAllowed(text: string): boolean {
  const t = (text || '').trim();
  if (!t || t.length > 100) return false;
  if (QURAN_MARKERS.test(t)) return false;
  if (t.split(/\s+/).length > 12) return false;
  // حروف عربية وعلامات ترقيم بسيطة فقط
  if (!/^[\u0621-\u064A\u064B-\u0652\u0640\s،.!؟-]+$/.test(t)) return false;
  return true;
}

const CACHE_DIR = process.env.MIZAN_CUE_AUDIO_DIR || path.join(process.cwd(), '.mizan-cue-audio');
const MODEL = process.env.MIZAN_CUE_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const VOICE = process.env.MIZAN_CUE_TTS_VOICE || 'Kore';
const API_KEY = process.env.MIZAN_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

export const cueTtsConfigured = () => !!API_KEY;

/** PCM 16-bit LE أحادي إلى ملف WAV كامل الترويسة. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);            // حجم كتلة fmt
  header.writeUInt16LE(1, 20);             // PCM
  header.writeUInt16LE(1, 22);             // قناة واحدة
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // بايت/ثانية
  header.writeUInt16LE(2, 32);             // محاذاة الكتلة
  header.writeUInt16LE(16, 34);            // بت لكل عينة
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const rateFromMime = (mime: string) => {
  const m = /rate=(\d+)/.exec(mime || '');
  return m ? Number(m[1]) : 24000;
};

/**
 * يعيد ملف WAV للعبارة، من الذاكرة المخزّنة إن وُجد، وإلا يولّده عبر Gemini.
 * يعيد null عند غياب المفتاح أو فشل المزوّد — والمُتصل يتراجع إلى صوت الجهاز.
 */
export async function synthesizeCue(text: string): Promise<Buffer | null> {
  if (!cueTextAllowed(text) || !API_KEY) return null;
  const key = crypto.createHash('sha256').update(`${MODEL}|${VOICE}|${text}`).digest('hex').slice(0, 32);
  const file = path.join(CACHE_DIR, `${key}.wav`);
  try { if (fs.existsSync(file)) return await fs.promises.readFile(file); } catch { /* تجاهل ذاكرة معطوبة */ }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
  const body = {
    contents: [{ parts: [{ text: `قل هذه العبارة بنبرة هادئة محترمة وواضحة: ${text}` }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
  };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    const json: any = await r.json();
    const part = json?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData?.data);
    const data = part?.inlineData?.data;
    if (!data) return null;
    const wav = pcmToWav(Buffer.from(data, 'base64'), rateFromMime(part.inlineData.mimeType || ''));
    try { await fs.promises.mkdir(CACHE_DIR, { recursive: true }); await fs.promises.writeFile(file, wav); } catch { /* الذاكرة اختيارية */ }
    return wav;
  } catch {
    return null;
  }
}
