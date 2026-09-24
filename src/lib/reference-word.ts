/*
 * «القارئ» — الكلمةُ التي عليها ملاحظةٌ بصوت قارئ المرجع (حفص، المعيقلي): يسمع الطالبُ
 * «تلاوتك» ثم «القارئ» في الموضع نفسه، فيقارن بأذنه.
 *
 * التسجيلُ ملفُّ الآية الرسميّ، وموضعُ الكلمة من توقيتها المقيس إن وُجد وإلا فمن التقدير
 * النطقيّ — ويُوسَّع الهامشُ حين يكون تقديرًا، فتُسمع الكلمةُ في سياقها ولا تُبتر.
 */
import { fetchDeliveryPassage } from './kfgqpc-library';
import { REFERENCE_AUDIO_ID, REFERENCE_AUDIO_READING } from './reference-audio-policy';
import { createSnippetPlayer, type SnippetPlayer } from './recitation-snippet';
import { measuredWordTimings, type MeasuredSegment } from './word-timing';

const ARABIC_LETTER = /[ء-يٱ-ۓۺ-ۼ]/;

/** موضعُ الكلمة بين كلمات آيتها المتلوّة (يُتخطّى «۞» ورقمُ الآية). */
export function spokenPosition(ayahWords: readonly string[], position: number): number {
  if (!ARABIC_LETTER.test(ayahWords[position] ?? '')) return -1;
  return ayahWords.slice(0, position).filter(w => ARABIC_LETTER.test(w)).length;
}

interface Loaded { player: SnippetPlayer; text: string; segments?: MeasuredSegment[] }
const cache = new Map<string, Promise<Loaded | null>>();

async function load(surah: number, ayah: number): Promise<Loaded | null> {
  const [audio, passage, timings] = await Promise.all([
    fetch(`/api/public/kfgqpc/audio/${REFERENCE_AUDIO_ID}/${surah}/${ayah}`).then(r => (r.ok ? r.blob() : null)).catch(() => null),
    fetchDeliveryPassage(REFERENCE_AUDIO_READING, surah, ayah, ayah).catch(() => null),
    fetch(`/api/public/kfgqpc/word-timings/${REFERENCE_AUDIO_ID}/${surah}/${ayah}`, { cache: 'force-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  const text = passage?.ayat.find(a => a.surah === surah && a.ayah === ayah)?.text;
  if (!audio || !text) return null;
  return { player: createSnippetPlayer([audio]), text, segments: Array.isArray(timings?.segments) ? timings.segments : undefined };
}

/** يُشغّل الكلمةَ رقم `spoken` (بين المتلوّات) من آية المرجع. */
export async function playReferenceWord(surah: number, ayah: number, spoken: number): Promise<boolean> {
  const key = `${surah}:${ayah}`;
  if (!cache.has(key)) cache.set(key, load(surah, ayah));
  const loaded = await cache.get(key)!;
  if (!loaded || spoken < 0) return false;
  const duration = await loaded.player.duration();
  const { model } = measuredWordTimings(loaded.text, duration, loaded.segments);
  const w = model.words[spoken];
  if (!w) return false;
  const pad = model.assurance === 'MEASURED_ALIGNED' ? 0 : 300;
  return loaded.player.play(Math.max(0, w.startMs - pad), w.endMs + pad);
}
