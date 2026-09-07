/*
 * توليد مقاطع «عبارة إنهاء الموضع» مرة واحدة، وحفظها ملفات ثابتة في public/audio/cues.
 * تُشغَّل يدويًا عند الحاجة فقط:   MIZAN_GEMINI_API_KEY=... node scripts/generate-cue-audio.mjs
 *
 * العبارات غير قرآنية. النص القرآني لا يُولَّد صوتيًا بحال — تلاوته من المصدر المعتمد وحده.
 */
import fs from 'fs';
import path from 'path';

const PHRASES = [
  'حسبك، جزاك الله خيرًا',
  'بارك الله فيك، قف هنا',
  'أحسنت، نكتفي بهذا الموضع',
  'جزاك الله خيرًا، توقّف هنا',
  'أحسنت، بارك الله فيك',
  'كفى، وفقك الله',
  'شكرًا لك، نتوقف هنا',
  'أحسنت القراءة، جزاك الله خيرًا',
];

const KEY = process.env.MIZAN_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const MODEL = process.env.MIZAN_CUE_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const VOICE = process.env.MIZAN_CUE_TTS_VOICE || 'Kore';
const OUT = path.join(process.cwd(), 'public', 'audio', 'cues');

if (!KEY) {
  console.error('MIZAN_GEMINI_API_KEY غير مضبوط. مثال:\n  MIZAN_GEMINI_API_KEY=xxx node scripts/generate-cue-audio.mjs');
  process.exit(1);
}

const pcmToWav = (pcm, rate) => {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
};

fs.mkdirSync(OUT, { recursive: true });
let made = 0;
for (let i = 0; i < PHRASES.length; i++) {
  const text = PHRASES[i];
  const file = path.join(OUT, `cue-${i}.wav`);
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `قل هذه العبارة بنبرة هادئة محترمة وواضحة: ${text}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
      },
    }),
  });
  if (!r.ok) { console.error(`فشل توليد «${text}» — ${r.status} ${await r.text().catch(() => '')}`); continue; }
  const json = await r.json();
  const part = json?.candidates?.[0]?.content?.parts?.find(p => p?.inlineData?.data);
  if (!part) { console.error(`لا صوت في الرد للعبارة «${text}»`); continue; }
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || '')?.[1] || 24000);
  fs.writeFileSync(file, pcmToWav(Buffer.from(part.inlineData.data, 'base64'), rate));
  console.log(`✓ cue-${i}.wav — ${text}`);
  made++;
}
console.log(`\nتم توليد ${made}/${PHRASES.length} مقطعًا في public/audio/cues`);
