/*
 * التلاوةُ المرجعيّة للقياس — صوتٌ معروفٌ توقيتُ كلِّ كلمةٍ فيه.
 *
 * يُبنى من ملفّات الآيات في EveryAyah (قارئٌ واحد، آيةٌ بآية) ملفُّ wav واحد يقرؤه كروم
 * ميكروفونًا وهميًّا، ويُلحق به صمتٌ حتى يلحق الطابورُ فيُقاس ما يصل متأخّرًا.
 *
 * وتوقيتُ الكلمات من مقاطع Quran.com للتلاوة نفسها: ملفّاتُ «مشاري العفاسي» عندهم هي ملفّاتُ
 * EveryAyah بعينها (البصمة md5 متطابقة — `verifySameAudio` يتحقّق من ذلك ولا يُفترض). فتُجمع
 * بداياتُ الآيات من مدد الملفّات، ويُضاف إليها توقيتُ الكلمة داخل آيتها.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface TimedWord {
  surah: number;
  ayah: number;
  /** موضعُ الكلمة في آيتها، من واحد. */
  pos: number;
  text: string;
  startMs: number;
  endMs: number;
}

export interface Recitation {
  /** «55:19-41»، أو قطعٌ متتالية «54:50-55,55:1-18» لوجهٍ يعبر سورتين. */
  range: string;
  surah: number;
  fromAyah: number;
  toAyah: number;
  reciter: string;
  /** المسارُ المطلق لملفّ wav — كروم لا يقرأ مسارًا نسبيًّا (يسمع صمتًا). */
  wav: string;
  speechMs: number;
  totalMs: number;
  words: TimedWord[];
  ayahs: { surah: number; ayah: number; startMs: number; durMs: number }[];
}

export interface RecitationSpec {
  /** قطعُ التلاوة بترتيبها — وأكثرُ من قطعةٍ لوجهٍ يعبر سورتين. */
  segments: { surah: number; fromAyah: number; toAyah: number }[];
  /** مجلّد القارئ في EveryAyah. */
  everyAyahFolder?: string;
  /** رقمُ التلاوة نفسها في Quran.com (العفاسي: 7). */
  quranComRecitation?: number;
  /** صمتٌ بعد التلاوة، بالثواني. */
  padSeconds?: number;
  cacheDir: string;
}

const pad3 = (n: number) => String(n).padStart(3, '0');

async function download(url: string, file: string): Promise<void> {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DOWNLOAD_FAILED ${res.status} ${url}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const md5 = (file: string) => createHash('md5').update(fs.readFileSync(file)).digest('hex');

function durationMs(file: string): number {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Math.round(Number(out.trim()) * 1000);
}

interface QuranComVerse {
  verse_number: number;
  audio?: { url: string; segments: number[][] };
  words: { char_type_name: string; text_uthmani: string }[];
}

async function quranComVerses(surah: number, recitation: number): Promise<QuranComVerse[]> {
  const url = `https://api.quran.com/api/v4/verses/by_chapter/${surah}?audio=${recitation}&per_page=300&words=true&word_fields=text_uthmani`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`QURAN_COM_FAILED ${res.status}`);
  return ((await res.json()) as { verses: QuranComVerse[] }).verses;
}

/**
 * أهي ملفّاتُ Quran.com هي ملفّاتُ EveryAyah نفسها؟ فإن لم تكن، فتوقيتُ الكلمات لا ينطبق
 * على الصوت المسموع، والقياسُ كلُّه باطل — فيُرفض ولا يُكمَل.
 */
async function verifySameAudio(verse: QuranComVerse, everyAyahFile: string, cacheDir: string): Promise<void> {
  if (!verse.audio?.url) throw new Error('QURAN_COM_NO_AUDIO');
  const theirs = path.join(cacheDir, `qc-${path.basename(verse.audio.url)}`);
  await download(`https://verses.quran.com/${verse.audio.url}`, theirs);
  if (md5(theirs) !== md5(everyAyahFile)) {
    throw new Error(`TIMINGS_FOR_ANOTHER_RECORDING: ${verse.audio.url} is not the EveryAyah file — word timings would not apply`);
  }
}

export async function buildRecitation(spec: RecitationSpec): Promise<Recitation> {
  const folder = spec.everyAyahFolder ?? 'Alafasy_128kbps';
  const recitation = spec.quranComRecitation ?? 7;
  const padSeconds = spec.padSeconds ?? 120;
  const dir = path.resolve(spec.cacheDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  if (!spec.segments.length) throw new Error('RANGE_EMPTY');

  const files: { surah: number; ayah: number; file: string; durMs: number }[] = [];
  for (const seg of spec.segments) {
    for (let ayah = seg.fromAyah; ayah <= seg.toAyah; ayah += 1) {
      const name = `${pad3(seg.surah)}${pad3(ayah)}.mp3`;
      const file = path.join(dir, name);
      await download(`https://everyayah.com/data/${folder}/${name}`, file);
      files.push({ surah: seg.surah, ayah, file, durMs: durationMs(file) });
    }
  }

  const bySurah = new Map<number, Map<number, QuranComVerse>>();
  for (const surah of new Set(spec.segments.map(s => s.surah))) {
    bySurah.set(surah, new Map((await quranComVerses(surah, recitation)).map(v => [v.verse_number, v])));
  }
  await verifySameAudio(bySurah.get(files[0].surah)!.get(files[0].ayah)!, files[0].file, dir);

  const words: TimedWord[] = [];
  const ayahs: Recitation['ayahs'] = [];
  let at = 0;
  for (const { surah, ayah, durMs } of files) {
    ayahs.push({ surah, ayah, startMs: at, durMs });
    const verse = bySurah.get(surah)?.get(ayah);
    if (!verse?.audio) throw new Error(`QURAN_COM_NO_SEGMENTS ${surah}:${ayah}`);
    const texts = verse.words.filter(w => w.char_type_name === 'word').map(w => w.text_uthmani);
    /* المقطع: [فهرسٌ من صفر، موضعٌ من واحد، بدايةٌ، نهايةٌ] بالملّي ثانية داخل الآية. */
    for (const seg of verse.audio.segments) {
      const pos = seg[1];
      if (!pos || !texts[pos - 1]) continue;
      words.push({ surah, ayah, pos, text: texts[pos - 1], startMs: at + seg[2], endMs: at + seg[3] });
    }
    at += durMs;
  }

  const range = formatRange(spec.segments);
  const key = range.replace(/[^0-9]+/g, '-');
  const list = path.join(dir, `list-${key}.txt`);
  fs.writeFileSync(list, files.map(f => `file '${f.file}'`).join('\n'));
  const wav = path.join(dir, `recitation-${key}-pad${padSeconds}.wav`);
  if (!fs.existsSync(wav)) {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-af', `apad=pad_dur=${padSeconds}`, '-ac', '1', '-ar', '48000', wav]);
  }
  const first = spec.segments[0], last = spec.segments[spec.segments.length - 1];
  return {
    range, surah: first.surah, fromAyah: first.fromAyah, toAyah: last.toAyah, reciter: folder,
    wav: path.resolve(wav), speechMs: at, totalMs: durationMs(wav), words, ayahs,
  };
}

export const formatRange = (segments: RecitationSpec['segments']) => segments.map(s => `${s.surah}:${s.fromAyah}-${s.toAyah}`).join(',');

/** «55:19-41» أو «54:50-55,55:1-18» → قطعُ التلاوة بترتيبها. */
export function parseRange(range: string): RecitationSpec['segments'] {
  return range.split(',').map(part => {
    const m = /^(\d+):(\d+)-(\d+)$/.exec(part.trim());
    if (!m) throw new Error(`RANGE_INVALID ${range} (expected surah:from-to[,surah:from-to], e.g. 55:19-41 or 54:50-55,55:1-18)`);
    return { surah: Number(m[1]), fromAyah: Number(m[2]), toAyah: Number(m[3]) };
  });
}
