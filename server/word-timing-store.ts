import fs from 'fs';
import path from 'path';

/*
 * مخزن توقيتات الكلمة المقيسة.
 *
 * القاعدة الحاكمة سطر واحد: **التوقيت يخصّ تسجيلًا بعينه، لا قارئًا**. مقاطعُ قُيست على تسجيل
 * ثم رُكّبت على تسجيل آخر — ولو لنفس القارئ، ولو لنفس الرواية — تُنتج تظليلًا واثقًا يمشي في
 * غير موضعه. وهذا أسوأ من التقدير الموسوم، لأن التقدير يقول عن نفسه إنه تقدير.
 *
 * ولذلك يُفهرَس المخزن بمعرّف **التسجيل** كما تخدمه الخدمة (`hafs-muaiqly` مثلًا)، لا باسم
 * القارئ. ومعرّفٌ لا تُسجَّل له توقيتات لا يحصل على شيء، فتبقى الواجهة على التقدير — وهو الحال
 * الافتراضي، لا استثناءً يُخفى.
 *
 * البنية على القرص:
 *   <dir>/manifest.json     { "hafs-muaiqly": "Husary_64kbps.json", ... }
 *   <dir>/<file>.json       مخرجات scripts/word-timing-acquire.mjs
 *
 * والبيان (manifest) يُكتب بيد المشغّل عمدًا: ربط تسجيل بمجموعة توقيتات قرارٌ يحتاج من يعرف أن
 * الملفين لنفس التسجيل فعلًا، ولا يصحّ أن يُخمّنه البرنامج من تشابه الأسماء.
 */

export type TimingSegment = [number, number, number, number];

export interface TimingSetMeta {
  reciter: string;
  assurance: string;
  attribution?: Record<string, unknown>;
  coverage?: Record<string, number>;
  sourceSha1?: string;
  sourceRepaired?: boolean;
}

interface TimingSet extends TimingSetMeta { ayat: Record<string, TimingSegment[]> }

export class WordTimingStore {
  private manifest: Record<string, string> = {};
  private cache = new Map<string, TimingSet | null>();

  constructor(private dir: string) {
    if (!dir) throw new Error('WORD_TIMINGS_DIR_REQUIRED');
    const file = path.join(dir, 'manifest.json');
    // لا بيان ⇒ لا توقيتات. المخزن يبقى قائمًا وفارغًا بدل أن يفشل التشغيل.
    if (!fs.existsSync(file)) return;
    try { this.manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string> }
    catch { throw new Error('WORD_TIMINGS_MANIFEST_CORRUPT') }
  }

  /** التسجيلات التي لها توقيتات مقيسة، لتعلنها `/api/capabilities` بصدق. */
  recordings(): string[] { return Object.keys(this.manifest) }

  private load(recordingId: string): TimingSet | null {
    if (this.cache.has(recordingId)) return this.cache.get(recordingId) || null;
    const name = this.manifest[recordingId];
    let set: TimingSet | null = null;
    if (name) {
      // اسم الملف يأتي من بيان يكتبه المشغّل؛ يُقصر على اسم بلا مسار فلا يخرج عن المجلد.
      const safe = path.basename(String(name));
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(this.dir, safe), 'utf8')) as TimingSet;
        if (parsed && typeof parsed === 'object' && parsed.ayat) set = parsed;
      } catch { set = null }
    }
    this.cache.set(recordingId, set);
    return set;
  }

  /** مقاطع آية بعينها في تسجيل بعينه، أو null — والـnull يعني «عد إلى التقدير»، لا خطأ. */
  segments(recordingId: string, surah: number, ayah: number): { segments: TimingSegment[]; meta: TimingSetMeta } | null {
    const set = this.load(recordingId);
    if (!set) return null;
    const segments = set.ayat[`${surah}:${ayah}`];
    if (!Array.isArray(segments) || !segments.length) return null;
    const { ayat: _ayat, ...meta } = set;
    return { segments, meta };
  }
}
