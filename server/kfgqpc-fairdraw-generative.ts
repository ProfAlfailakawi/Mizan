import crypto from 'node:crypto';
import type { KfgqpcDeliveryRepository, KfgqpcDeliveryPassage } from './kfgqpc-delivery';

/**
 * MIZAN — FairDraw توليدي (بلا بنك أسئلة)
 *
 * يولّد مقطع الاختبار مباشرةً من نص المصحف المهيكل للرواية المطلوبة، بدل قائمة أسئلة ثابتة.
 *
 * مبدآن يحكمان التصميم:
 *
 * 1) **بداية بنيوية صحيحة، بلا اجتهاد شرعي.** المرساة تُشتق حصريًا من حقول المصدر الرسمي
 *    (سورة/جزء/صفحة/رقم آية)، فالبداية دائمًا عند حدّ آية حقيقي — ولا تبدأ وسط آية أبدًا.
 *    MIZAN لا يدّعي حكم ابتداء تفسيريًا؛ الأنواع هنا وصف بنيوي فقط:
 *      SURAH_START (بداية سورة) · JUZ_START (بداية جزء) · PAGE_START (بداية صفحة) · AYAH_START (بداية آية)
 *    ولا يوجد RUB'/HIZB لأن حزمة المجمع المستخدمة لا تحمل هذه الحقول — ولا نخترعها.
 *
 * 2) **عدالة قابلة للتحقق، لا عشوائية عمياء.** لا نستخدم Math.random. الاختيار دالة حتمية
 *    من بذرة معلنة: HMAC-SHA256(seed) → مؤشر ضمن المرشحين المؤهلين. أي مدقّق يعيد الحساب
 *    بنفس البذرة فيحصل على نفس المقطع (إثبات السحب مرفق). هذا يجعل السحب عادلًا ومُراجَعًا
 *    بدل أن يكون مجهول المصدر.
 *
 * السحب لا يمس الدرجة ولا يستبدل رواية برواية: كل شيء يُقرأ من حزمة الرواية المطلوبة وحدها.
 */

export type FairDrawAnchor = 'SURAH_START' | 'JUZ_START' | 'PAGE_START' | 'AYAH_START';

export interface FairDrawRequest {
  reading: string;
  seed?: string;
  anchor?: FairDrawAnchor | 'ANY';
  ayahCount?: number;      // عدد الآيات المطلوب (يُقصّ عند نهاية السورة)
  juz?: number;            // تقييد اختياري بجزء
  surah?: number;          // تقييد اختياري بسورة
  minAyahCount?: number;
  maxAyahCount?: number;
}

export interface FairDrawResult {
  passage: KfgqpcDeliveryPassage;
  draw: {
    protocol: 'MIZAN-FAIRDRAW-GENERATIVE-1';
    reading: string;
    anchorType: FairDrawAnchor;
    anchorNote: string;
    seed: string;
    algorithm: 'HMAC-SHA256(seed, domain) → uniform index over eligible anchors';
    candidateCount: number;
    selectedIndex: number;
    ayahCount: number;
    reproducible: true;
    verifyHint: string;
  };
}

const ANCHOR_NOTE: Record<FairDrawAnchor, string> = {
  SURAH_START: 'بداية سورة — مرساة بنيوية من المصدر الرسمي',
  JUZ_START: 'بداية جزء — مرساة بنيوية من المصدر الرسمي',
  PAGE_START: 'بداية صفحة مصحف — مرساة بنيوية من المصدر الرسمي',
  AYAH_START: 'بداية آية — حدّ آية حقيقي، بلا ابتداء وسط الآية',
};

/** عدد صحيح موحّد التوزيع في [0, max) مشتق حتميًا من البذرة (رفض المعامل المنحاز). */
function seededIndex(seed: string, domain: string, max: number): number {
  if (max <= 0) return 0;
  let counter = 0;
  const limit = Math.floor(0xffffffff / max) * max; // حدّ إزالة انحياز المعامل
  for (;;) {
    const h = crypto.createHmac('sha256', seed).update(`${domain}:${counter}`).digest();
    const v = ((h[0] << 24) >>> 0) + (h[1] << 16) + (h[2] << 8) + h[3];
    if (v < limit) return v % max;
    counter++;
    if (counter > 10000) return v % max; // حارس نظري
  }
}

interface Row { sora: number; aya_no: number; page: number; jozz: number }

/** ترشيح المراسي المؤهّلة: كل مرساة هي (سورة، آية) تصلح بداية بنيوية. */
function eligibleAnchors(rows: any[], anchor: FairDrawAnchor, filter: { juz?: number; surah?: number }): Row[] {
  const norm: Row[] = rows.map((r) => ({ sora: Number(r.sora), aya_no: Number(r.aya_no), page: Number(r.page), jozz: Number(r.jozz) }));
  const scoped = norm.filter((r) => (filter.juz ? r.jozz === filter.juz : true) && (filter.surah ? r.sora === filter.surah : true));
  if (anchor === 'AYAH_START') return scoped;
  if (anchor === 'SURAH_START') return scoped.filter((r) => r.aya_no === 1);
  const seen = new Set<number>();
  const out: Row[] = [];
  // أول آية في كل جزء / كل صفحة حسب ترتيب المصحف
  const ordered = [...scoped].sort((a, b) => a.page - b.page || a.sora - b.sora || a.aya_no - b.aya_no);
  for (const r of ordered) {
    const k = anchor === 'JUZ_START' ? r.jozz : r.page;
    if (seen.has(k)) continue;
    seen.add(k); out.push(r);
  }
  return out;
}

export async function generativeFairDraw(delivery: KfgqpcDeliveryRepository, req: FairDrawRequest): Promise<FairDrawResult | null> {
  const reading = String(req.reading || 'hafs');
  const rows = await delivery.quranData(reading);
  if (!rows) return null;

  const seed = req.seed && String(req.seed).length >= 8 ? String(req.seed) : crypto.randomUUID();

  // نوع المرساة: إمّا محدّد، أو يُسحب هو نفسه حتميًا من البذرة.
  // الترجيح مقصود: الشرط التشغيلي هو «بداية موضع صحيح» أي حدّ آية حقيقي — وليس بالضرورة رأس
  // صفحة أو جزء. لذلك AYAH_START هو الغالب (تنوّع أوسع وأقرب لواقع الاختبار)، وتبقى بدايات
  // السورة/الجزء/الصفحة حاضرة لإثراء التنويع لا لتقييده.
  const wheel: FairDrawAnchor[] = ['AYAH_START', 'AYAH_START', 'AYAH_START', 'AYAH_START', 'AYAH_START', 'AYAH_START', 'PAGE_START', 'JUZ_START', 'SURAH_START'];
  const anchorType: FairDrawAnchor = req.anchor && req.anchor !== 'ANY' ? req.anchor : wheel[seededIndex(seed, 'anchor', wheel.length)];

  const candidates = eligibleAnchors(rows, anchorType, { juz: req.juz, surah: req.surah });
  if (!candidates.length) return null;

  const selectedIndex = seededIndex(seed, `anchor:${anchorType}`, candidates.length);
  const start = candidates[selectedIndex];

  const min = Math.max(1, req.minAyahCount ?? 4);
  const max = Math.max(min, req.maxAyahCount ?? 8);
  const ayahCount = req.ayahCount && req.ayahCount > 0 ? req.ayahCount : min + seededIndex(seed, 'length', max - min + 1);

  /*
   * حدود السورة: لا يعبر المقطع الواحد إلى سورة أخرى.
   *
   * إن وقعت المرساة قرب آخر السورة، فالقصّ وحده ينتج مقطعًا قصيرًا جدًا (وقد آية واحدة)، وهو غير
   * صالح للاختبار. لذلك نزيح البداية إلى الخلف بالقدر اللازم لاستيفاء الطول — والإزاحة تبقى عند
   * حدّ آية حقيقي، فالبداية تظل موضعًا صحيحًا. أما السورة الأقصر من الطول المطلوب فتُؤخذ كاملة.
   */
  const lastAyahInSurah = rows.reduce((m: number, r: any) => (Number(r.sora) === start.sora ? Math.max(m, Number(r.aya_no)) : m), 0);
  const span = Math.min(ayahCount, lastAyahInSurah);
  const startAyah = Math.max(1, Math.min(start.aya_no, lastAyahInSurah - span + 1));
  const endAyah = Math.min(startAyah + span - 1, lastAyahInSurah);

  const passage = await delivery.passage(reading, start.sora, startAyah, endAyah);
  if (!passage) return null;

  return {
    passage,
    draw: {
      protocol: 'MIZAN-FAIRDRAW-GENERATIVE-1',
      reading,
      anchorType,
      anchorNote: ANCHOR_NOTE[anchorType],
      seed,
      algorithm: 'HMAC-SHA256(seed, domain) → uniform index over eligible anchors',
      candidateCount: candidates.length,
      selectedIndex,
      ayahCount: passage.ayat.length,
      reproducible: true,
      verifyHint: 'أعد السحب بنفس البذرة والرواية والقيود للحصول على المقطع نفسه.',
    },
  };
}
