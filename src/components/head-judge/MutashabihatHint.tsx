import React, { useMemo } from 'react';
import { Radar } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { buildMutashabihatRadar, type RadarLocus } from '../../lib/mutashabihat-radar';
import { surahNameArabic, surahNumberFromName } from '../judge/OfficialMushafSurface';

/*
 * رادار المتشابهات — إشارة لرئيس التحكيم داخل حالة المراجعة.
 *
 * لماذا هنا تحديدًا: التردّد وحده لا يقول للمراجع شيئًا. هذا يضيف إليه سؤالًا واحدًا —
 * هل عند هذا الموضع نظيرٌ متشابه يجذب الذاكرة؟ — فيُفرَّق «نسي» عن «انتقل إلى موضع
 * متشابه»، وهما خطآن مختلفان في الخصم.
 *
 * ولماذا لرئيس التحكيم لا للمحكّم: إخبار من يضع الدرجة بأن الآية «فخّ» يوجّه حكمه قبل أن
 * يسمع. رئيس التحكيم يراجع ولا يرصد، فالإشارة عنده استدلال لا إيحاء.
 *
 * لا يُعرض إلا ما هو APPROVED من خريطة اللجنة العلمية، ولا يظهر أي شيء حين لا يوجد نظير:
 * الصمت هو الحالة الطبيعية، فلا يضيف هذا سطرًا واحدًا إلى شاشةٍ هادئة بلا سبب.
 */

/** المواضع التي يستحق ظهورُ نظيرٍ لها الذكر: تردّد أو اضطراب في استرجاع الموضع. */
const MEMORY_EVENTS = new Set(['hesitation_pause', 'omission', 'substitution', 'repetition']);

/**
 * موضع الملاحظة يأتي من مزوّد خارجي كنصّ حرّ («2:58» أو «Al-Baqarah:58» أو «البقرة:58»).
 * يُقرأ بتسامح، وما لا يُفهم يُترك ولا يُخمَّن — رادارٌ على موضع مظنون أسوأ من لا رادار.
 */
export function parseLocus(raw?: string): RadarLocus | null {
  if (!raw) return null;
  const text = String(raw).trim();
  const parts = text.split(':');
  if (parts.length < 2) return null;
  const ayah = Number(parts[parts.length - 1].trim());
  if (!Number.isInteger(ayah) || ayah < 1) return null;
  const head = parts.slice(0, -1).join(':').trim();
  const numeric = Number(head);
  const surah = Number.isInteger(numeric) && numeric >= 1 && numeric <= 114
    ? numeric
    : surahNumberFromName(head, head);
  return surah ? { surah, ayah } : null;
}

const locusLabel = (l: RadarLocus, ar: boolean) => ar ? `${surahNameArabic(l.surah) || l.surah} ${l.ayah}` : `${l.surah}:${l.ayah}`;

export const MutashabihatHint: React.FC<{ sessionId: string; ar: boolean }> = ({ sessionId, ar }) => {
  const { aiObservations, mutashabihatTrapMaps } = useAppStore();

  const hits = useMemo(() => {
    const loci = new Map<string, RadarLocus>();
    for (const o of aiObservations) {
      if (o.sessionId !== sessionId || !MEMORY_EVENTS.has(o.type)) continue;
      const locus = parseLocus(o.expectedQuranPosition || o.expectedLocation);
      if (locus) loci.set(`${locus.surah}:${locus.ayah}`, locus);
    }
    return [...loci.values()]
      .map(locus => buildMutashabihatRadar(locus, mutashabihatTrapMaps))
      .filter(r => r.competitorCount > 0);
  }, [aiObservations, mutashabihatTrapMaps, sessionId]);

  // الصمت هو الحالة الطبيعية: بلا نظير معتمد لا يُرسم شيء.
  if (!hits.length) return null;
  const total = hits.reduce((s, r) => s + r.competitorCount, 0);

  return (
    <details className="mizan-collapse mt-4 rounded-2xl border border-[#e5e3dc] bg-[#fbfaf6]">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 px-4 py-3 text-[11px] font-black text-[#59615c]">
        <span className="flex items-center gap-2"><Radar className="h-3.5 w-3.5 text-[#2F6555]"/>{ar ? 'عند هذا الموضع نظير متشابه معتمد' : 'An approved twin locus sits here'}</span>
        <span className="rounded-full bg-[#efede7] px-1.5 py-0.5 text-[10px] font-bold text-[#59615c]">{total}</span>
      </summary>
      <div className="px-4 pb-4">
        <p className="text-[10px] leading-5 text-[#656b66]">
          {ar
            ? 'من خريطة المتشابهات المعتمدة من اللجنة العلمية. استدلال للمراجعة فقط: لا يُغيّر درجة ولا يُعرض للمحكّم أثناء التلاوة.'
            : 'From the scientific committee’s approved similarity map. Review context only: it changes no score and is never shown to the scoring judge.'}
        </p>
        <div className="mt-3 space-y-2">
          {hits.map(radar => (
            <div key={`${radar.at.surah}:${radar.at.ayah}`} className="rounded-xl border border-[#e3e1da] bg-white/70 p-3">
              <div className="text-[10px] font-black text-[#3a423d]">{ar ? 'موضع التردّد' : 'Hesitation locus'} · {locusLabel(radar.at, ar)}</div>
              <div className="mt-2 space-y-1.5">
                {radar.competitors.map(c => (
                  <div key={`${c.locus.surah}:${c.locus.ayah}`} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-[11px] font-bold text-[#29342f]">
                      {locusLabel(c.locus, ar)}
                      {c.reference && <span className="font-quran ms-2 text-[12px] text-[#5f6661]">{c.reference}</span>}
                    </span>
                    <span className="shrink-0 text-[9px] font-black text-[#656b66]">{Math.round(c.score * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
};

export default MutashabihatHint;
