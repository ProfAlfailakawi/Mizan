import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchMushafLayout, findLayoutWord, type MushafPageLayout } from '../../lib/kfgqpc-library';
import { bandsFromInkProfile, inkProfileFromImage } from '../../lib/mushaf-line-bands';
import {
  groupTokensByLine, measureLineBoxes, pageLineSlots, readPagePixels, wordBoxesFromLines,
  type FaceTokenWord, type WordBox,
} from '../../lib/mushaf-word-boxes';
import { FACE_MISTAKE_STYLE, primaryMistake } from './FaceMistakes';
import { FACE_MARK_STYLE, markTint, marksByWord, primaryMark } from './FaceMarks';
import type { FaceMark } from '../../lib/face-reading';
import type { Mistake } from '../../lib/recitation-diff';

/*
 * «المصحفُ الحيّ»: صفحةُ المجمع المطبوعة كما هي، والتلاوةُ تُرسم على كلماتها.
 *
 * الصورةُ لا تُمسّ. فوقها طبقةٌ شفّافة تعرف مواضعَ الكلمات من حبر الصفحة نفسها
 * (`mushaf-word-boxes`)، فيرى الطالبُ:
 *
 *  ـ القلمَ: وهجًا ذهبيًّا على الكلمة التي بلغها الآن، ينتقل معه كلمةً كلمة.
 *  ـ الأثرَ: ما تلاه يبقى بمسحةٍ خضراءَ خفيفة، فيعرف بنظرةٍ كم قطع من الوجه.
 *  ـ موضعَ المراجعة: خطًّا تحت الكلمة التي سُمع فيها غيرُها — ينبض مرّةً حين يقع.
 *  ـ الحجابَ: في «اختبر حفظك» تُغطّى الكلماتُ بظلالها — يرى الطالبُ شكلَ السطر وعددَ
 *    كلماته ولا يرى الحروف — وتنكشف كلُّ كلمةٍ حين يتلوها.
 *
 * ومتى لم يُطمأنّ إلى موضع كلمةٍ (سطرٌ لم تتميّز فيه فواصلُه) نزلت الطبقةُ إلى السطر
 * كلِّه: لا تُعلَّم كلمةٌ ليست هي.
 */

export interface LiveWord extends FaceTokenWord { text: string }

export interface LiveState {
  /** الكلمةُ التي بلغها القارئ الآن — أو `null` قبل أن يبدأ. */
  cursor: number | null;
  /** عددُ الكلمات المتلوّة من أوّل الوجه (ما دونه أثر). */
  reached: number;
  /** «اختبر حفظك»: الكلماتُ محجوبةٌ حتى تُتلى. */
  veiled: boolean;
  /** كلمةٌ كُشفت تلميحًا مؤقّتًا. */
  hint: number | null;
}

interface Geometry {
  boxes: Map<number, WordBox>;
  lineOf: Map<number, number>;
  slots: { top: number; height: number }[];
}

const geometryCache = new Map<string, Geometry | null>();

/** يقيس هندسةَ الصفحة مرّةً لكلّ صورة، ولا يعيدها حتى تتغيّر. */
export type OverlayState = 'pending' | 'ready' | 'none';

export function usePageGeometry(url: string, page: number, words: readonly LiveWord[], enabled: boolean, image: HTMLImageElement | null): { geometry: Geometry | null; state: OverlayState } {
  /* `undefined`: لم يصل بعد؛ `null`: وصل ولا تخطيطَ لهذه الصفحة. */
  const [layout, setLayout] = useState<MushafPageLayout | null | undefined>(undefined);
  const [geometry, setGeometry] = useState<Geometry | null | undefined>(undefined);
  useEffect(() => {
    let live = true; setLayout(undefined);
    if (!enabled) return;
    void fetchMushafLayout(page).then(l => { if (live) setLayout(l); });
    return () => { live = false; };
  }, [page, enabled]);

  const key = `${url}|${page}|${words.length}`;
  useEffect(() => {
    if (!enabled || layout === null) { setGeometry(null); return; }
    if (!layout || !image || !image.naturalWidth) { setGeometry(undefined); return; }
    if (geometryCache.has(key)) { setGeometry(geometryCache.get(key) ?? null); return; }
    const lineOf = new Map<number, number>();
    const grouped = groupTokensByLine(words, w => {
      /* موضعُ الكلمة في الوجه يُعدّ من واحد، وفي ملفّ التخطيط من صفر (`server/mushaf-layout`). */
      const hit = w.ayahWordIndex ? findLayoutWord(layout, w.surah, w.ayah, w.ayahWordIndex - 1) : null;
      if (hit?.line) lineOf.set(w.index, hit.line);
      return hit?.line;
    });
    const ink = inkProfileFromImage(image, image.naturalWidth, image.naturalHeight);
    const pixels = readPagePixels(image, image.naturalWidth, image.naturalHeight);
    if (!grouped || !ink || !pixels) { geometryCache.set(key, null); setGeometry(null); return; }
    const lineCount = layout.lineCount || 15;
    const slots = pageLineSlots(ink, lineCount, bandsFromInkProfile(ink, { expectedLines: lineCount }));
    const measured = measureLineBoxes(pixels.pixels, pixels.width, pixels.height, slots, grouped.lines);
    const boxes = wordBoxesFromLines(measured, grouped.order);
    const out: Geometry = { boxes, lineOf, slots };
    geometryCache.set(key, out);
    setGeometry(out);
  }, [key, enabled, layout, image]);
  const state: OverlayState = !enabled || geometry === null ? 'none' : geometry ? 'ready' : 'pending';
  return { geometry: geometry ?? null, state };
}

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;
const boxStyle = (b: { x: number; y: number; width: number; height: number }, pad = 0.004): React.CSSProperties => ({
  left: pct(b.x - pad), top: pct(b.y), width: pct(b.width + pad * 2), height: pct(b.height),
});

export interface LiveMushafPageProps {
  ar: boolean;
  page: number;
  url: string;
  words: readonly LiveWord[];
  live?: LiveState;
  mistakes?: readonly Mistake[];
  /** علاماتُ الوصف بعد التلاوة (لبثٌ، رجوعٌ…) — تُصبغ على كلماتها. */
  marks?: readonly FaceMark[];
  /** هل تُرسم الطبقة؟ (التخطيطُ متاحٌ لمصحف المدينة وحده.) */
  overlay: boolean;
  /** يُخبر الأبَ بحال الطبقة — فإن تعذّرت عرض النصَّ الحيّ بدل صورةٍ صامتة. */
  onReady?: (state: OverlayState) => void;
}

export const LiveMushafPage: React.FC<LiveMushafPageProps> = ({ ar, page, url, words, live, mistakes, marks, overlay, onReady }) => {
  const markIndex = useMemo(() => marksByWord(marks ?? []), [marks]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const { geometry, state } = usePageGeometry(url, page, words, overlay, image);
  useEffect(() => { onReady?.(state); }, [state, onReady]);

  const faults = useMemo(() => {
    const m = new Map<number, Mistake[]>();
    for (const x of mistakes ?? []) if (x.wordIndex !== null) m.set(x.wordIndex, [...(m.get(x.wordIndex) ?? []), x]);
    return m;
  }, [mistakes]);

  /* السطرُ كلُّه حين لا صندوقَ للكلمة. */
  const lineBox = (index: number): WordBox | null => {
    const line = geometry?.lineOf.get(index);
    const slot = line ? geometry?.slots[line - 1] : null;
    return slot ? { x: 0.035, y: slot.top, width: 0.93, height: slot.height } : null;
  };
  const place = (index: number) => geometry?.boxes.get(index) ?? null;

  const cursor = live?.cursor ?? null;
  const reached = live?.reached ?? 0;
  const cursorBox = cursor !== null ? (place(cursor) ?? lineBox(cursor)) : null;

  /*
   * الحجاب: رقُّ ورقٍ يغطّي كلَّ سطرٍ فيه ما لم يُتلَ، وتُفتح فيه نافذةٌ لما تُلي.
   *
   * لا يُغطّى كلُّ لفظٍ ببلاطته — فأذيالُ الحروف ونقطُها تفيض عن صندوقها وتتسرّب بين
   * البلاطات فتفضح الكلمة. بل يُغطّى السطرُ كلُّه، ويُقصّ منه ما تُلي من يمينه حتى منتصف
   * الفرجة بين آخر كلمةٍ تُليت وأوّل كلمةٍ لم تُتلَ. وعلى الرقّ ظلالُ الكلمات الباقية: يرى
   * الطالبُ كم كلمةً بقيت وأين، ولا يرى حرفًا.
   */
  const veil = useMemo(() => {
    if (!live?.veiled || !geometry) return null;
    const byLine = new Map<number, LiveWord[]>();
    for (const w of words) {
      const line = geometry.lineOf.get(w.index);
      if (line) byLine.set(line, [...(byLine.get(line) ?? []), w]);
    }
    const covers: { slot: { top: number; height: number }; from: number }[] = [];
    const ghosts: WordBox[] = [];
    const windows: WordBox[] = [];
    for (const [line, list] of byLine) {
      const slot = geometry.slots[line - 1];
      if (!slot) continue;
      const hidden = list.filter(w => w.index >= reached);
      if (!hidden.length) continue;
      const shown = list.filter(w => w.index < reached);
      /* حدُّ النافذة: منتصفُ الفرجة بين آخر ما تُلي وأوّل ما لم يُتلَ — إن عُرف الصندوقان. */
      let from = 1;
      if (shown.length) {
        const last = geometry.boxes.get(shown[shown.length - 1].index);
        const next = geometry.boxes.get(hidden[0].index);
        from = last && next ? (last.x + next.x + next.width) / 2 : 1;
      }
      covers.push({ slot, from });
      for (const w of hidden) {
        const b = geometry.boxes.get(w.index);
        if (!b) continue;
        if (w.index === live.hint) windows.push({ x: b.x - 0.008, y: slot.top, width: b.width + 0.016, height: slot.height });
        else ghosts.push(b);
      }
    }
    return { covers, ghosts, windows };
  }, [live?.veiled, live?.hint, geometry, words, reached]);

  return (
    <div className="mizan-live-page relative inline-block max-w-full" data-live-page={page} data-live-overlay={geometry ? 'word' : 'none'}>
      <img
        ref={imgRef}
        src={url}
        onLoad={e => setImage(e.currentTarget)}
        alt={ar ? `صفحة المصحف ${page}` : `Mushaf page ${page}`}
        className="mizan-mushaf-page block w-auto h-auto max-h-[68vh] max-w-full object-contain rounded-[2px] shadow-[0_10px_24px_rgba(0,0,0,.07)]"
      />
      {geometry && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {/* الأثر: ما تُلي يبقى بمسحةٍ خفيفة. */}
          {!live?.veiled && words.map(w => {
            if (w.index >= reached || w.index === cursor || faults.has(w.index)) return null;
            const b = place(w.index);
            return b ? <span key={`t${w.index}`} className="mizan-live-trail" style={boxStyle(b)} /> : null;
          })}
          {/* علاماتُ الوصف: صبغٌ خفيفٌ على الكلمة نفسها، ولونُه من دليلها. */}
          {words.map(w => {
            const top = primaryMark(markIndex.get(w.index) ?? []);
            const b = top ? place(w.index) : null;
            return top && b ? <span key={`k${w.index}`} className="mizan-live-mark" data-live-mark={top.kind}
              style={{ ...boxStyle(b), background: markTint(top), boxShadow: `inset 0 -1.5px 0 ${FACE_MARK_STYLE[top.kind].tint}66` }} /> : null;
          })}
          {/* موضعُ المراجعة: خطٌّ تحت الكلمة، ينبض مرّةً حين يقع. */}
          {words.map(w => {
            const fault = primaryMistake(faults.get(w.index) ?? []);
            if (!fault) return null;
            const b = place(w.index) ?? lineBox(w.index);
            if (!b) return null;
            const tint = FACE_MISTAKE_STYLE[fault.kind].tint;
            return <span key={`m${w.index}`} className="mizan-live-fault" data-live-fault={fault.kind}
              style={{ ...boxStyle(b), ['--fault' as string]: tint }} />;
          })}
          {/* الحجاب: رقٌّ على الأسطر، ونوافذُ لما تُلي وللتلميح، وظلالٌ لما بقي. */}
          {veil && (
            <svg className="mizan-live-veil" viewBox="0 0 1000 1000" preserveAspectRatio="none" data-live-veil={veil.ghosts.length}>
              <defs>
                <linearGradient id={`vellum-${page}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#f6f1e4" /><stop offset="1" stopColor="#eee6d3" />
                </linearGradient>
                <mask id={`veil-${page}`} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="1000">
                  <rect x="0" y="0" width="1000" height="1000" fill="white" />
                  {veil.windows.map((b, i) => <rect key={i} x={b.x * 1000} y={b.y * 1000} width={b.width * 1000} height={b.height * 1000} fill="black" />)}
                </mask>
              </defs>
              <g mask={`url(#veil-${page})`}>
                {veil.covers.map((c, i) => (
                  <rect key={i} x={15} y={(c.slot.top - c.slot.height * 0.06) * 1000} width={Math.max(0, c.from * 1000 - 15)} height={c.slot.height * 1.12 * 1000}
                    fill={`url(#vellum-${page})`} rx={6} ry={4} />
                ))}
                {veil.ghosts.map((b, i) => (
                  <rect key={`g${i}`} className="mizan-live-ghost" x={b.x * 1000} y={(b.y + b.height * 0.22) * 1000}
                    width={b.width * 1000} height={b.height * 0.56 * 1000} rx={7} ry={5} />
                ))}
              </g>
            </svg>
          )}
          {/* القلم: وهجٌ ينتقل مع القارئ. */}
          {cursorBox && <span className="mizan-live-pen" data-live-pen={cursor ?? undefined} style={boxStyle(cursorBox, 0.006)} />}
        </div>
      )}
    </div>
  );
};
