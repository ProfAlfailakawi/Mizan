/*
 * من أيّ كلمةٍ وقعت اللمسة؟ — تحديد الكلمة بدقّةٍ لا بتخمين.
 *
 * المحكّم الذي يضغط مطوّلًا على كلمةٍ في نصّ المصحف يريد أن يُسجَّل الخطأ **عليها**، لا على
 * الآية ولا على الصفحة. وملفّات تخطيط الصفحة المفتوحة لا تحمل إحداثيات كلماتٍ (رقم السطر
 * وحده)، فالنقر على صورةٍ يعني تخمينَ الكلمة؛ وتخمينٌ يُنسب إلى متسابقٍ في اعتراضٍ لاحق ليس
 * دليلًا. أمّا النصّ فكلُّ حرفٍ فيه عقدةٌ في الصفحة، فيُسأل المتصفّح: أيّ حرفٍ تحت الإصبع؟
 * ثم يُحسب موضعُ ذلك الحرف من نصّ الآية، ومنه رقمُ الكلمة بالتقسيم نفسه الذي يعتمده
 * تظليلُ القارئ وتوقيتُ الصوت (`splitAyahWords`) — فلا رقمان لكلمةٍ واحدة.
 *
 * ما يمكن اختباره بلا متصفّح (الحساب) وحدةٌ نقيّة هنا؛ وما يحتاج DOM (سؤال المتصفّح عن
 * الحرف) معزولٌ في دالّتين صغيرتين.
 */

import { splitAyahWords, type WordSpan } from './word-timing';

export interface WordHit {
  /** رقم الكلمة من 1 داخل الآية، بتقسيم `splitAyahWords`. */
  word: number;
  /** نصّ الكلمة كما عُرضت، ليكون السجلّ مقروءًا بذاته. */
  text: string;
  start: number;
  end: number;
}

/**
 * الكلمة التي يقع عندها الموضع `offset` من نصّ الآية.
 *
 * موضعٌ على فراغٍ بين كلمتين يُنسب إلى أقربهما إن كان على بعد حرفٍ واحدٍ منها (إصبعٌ
 * يقع على الفاصل لا يضيع)، وما بعد ذلك ليس لمسةً على كلمة — فيُعاد `null`: لا تخمين.
 */
export function wordAtOffset(text: string, offset: number, slack = 1): WordHit | null {
  if (!Number.isFinite(offset) || offset < 0) return null;
  const words: WordSpan[] = splitAyahWords(text);
  let best: { w: WordSpan; gap: number } | null = null;
  for (const w of words) {
    const gap = offset < w.start ? w.start - offset : offset >= w.end ? offset - w.end + 1 : 0;
    if (gap === 0) return { word: w.index + 1, text: text.slice(w.start, w.end), start: w.start, end: w.end };
    if (gap <= slack && (!best || gap < best.gap)) best = { w, gap };
  }
  return best ? { word: best.w.index + 1, text: text.slice(best.w.start, best.w.end), start: best.w.start, end: best.w.end } : null;
}

/** موضع عقدةٍ نصّيةٍ داخل نصّ العنصر الجذر كلِّه، بترتيب القراءة. */
export function offsetWithin(root: Node, node: Node, nodeOffset: number): number | null {
  if (!root.contains(node)) return null;
  let total = 0;
  const walker = (root.ownerDocument || document).createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let cur = walker.nextNode(); cur; cur = walker.nextNode()) {
    if (cur === node) return total + nodeOffset;
    total += (cur.textContent || '').length;
  }
  return null;
}

/** أيّ حرفٍ تحت النقطة؟ يدعم واجهتَي المتصفّحات (Chrome/Safari وFirefox). */
export function caretAtPoint(doc: Document, x: number, y: number): { node: Node; offset: number } | null {
  const d = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  if (typeof d.caretPositionFromPoint === 'function') {
    const p = d.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  if (typeof d.caretRangeFromPoint === 'function') {
    const r = d.caretRangeFromPoint(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }
  return null;
}

/**
 * الكلمة تحت النقطة داخل عنصر آيةٍ نصُّه `ayahText`.
 *
 * يُقبل الجواب فقط إذا وقع الحرفُ **داخل** عنصر الآية؛ لمسةٌ على هامشٍ أو على علامة الآية
 * (الرقم) خارج نصّها لا تُنسب إلى كلمة.
 */
export function wordAtPoint(ayahEl: Element, ayahText: string, x: number, y: number): WordHit | null {
  const caret = caretAtPoint(ayahEl.ownerDocument, x, y);
  if (!caret || caret.node.nodeType !== Node.TEXT_NODE) return null;
  const at = offsetWithin(ayahEl, caret.node, caret.offset);
  if (at === null || at > ayahText.length) return null;
  return wordAtOffset(ayahText, at);
}

/**
 * مجال DOM يغطّي كلمةً من آية: من إزاحة `start` إلى `end` داخل نصّ عنصر الآية.
 * يُستعمل لتلوين الكلمة بلا تغيير بنية الصفحة (فلا ينكسر سطرٌ ولا يزول تشكيل).
 */
export function rangeForOffsets(root: Node, start: number, end: number): Range | null {
  if (!(end > start) || start < 0) return null;
  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let pos = 0;
  let started = false;
  for (let cur = walker.nextNode(); cur; cur = walker.nextNode()) {
    const len = (cur.textContent || '').length;
    if (!started && start < pos + len) { range.setStart(cur, start - pos); started = true; }
    if (started && end <= pos + len) { range.setEnd(cur, end - pos); return range; }
    pos += len;
  }
  return null;
}
