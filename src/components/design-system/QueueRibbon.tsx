import React from 'react';

/*
 * شريط الطابور.
 *
 * «أمامك ٣» رقمٌ يُقرأ ثم يُترجم. والشريط يجعله يُرى: نقطةٌ لكل منتظر، ونقطتك أكبر
 * وذهبية، والمسافة بصرية لا حسابية — فيفهم الواقف موقعه في لحظة.
 *
 * وطابورٌ طويل لا يُرسم كلّه: خمسٌ وعشرون نقطة سقفٌ يبقى مقروءًا على شاشةٍ وعلى هاتف،
 * وما زاد يُقال عددًا. شريطٌ من مئة نقطة لا يُقرأ ولا يُعدّ — يقول «كثير» وحدها، وهي
 * أقلّ صدقًا من الرقم الذي أراد أن يحلّ محلّه.
 */

const MAX_DOTS = 25;

export const QueueRibbon: React.FC<{
  /** طول الطابور كاملًا. */
  total: number;
  /** موضع صاحب الشاشة داخله، من واحد. صفرٌ أو غيابٌ يعني شريطًا بلا «أنت». */
  youAt?: number;
  ar?: boolean;
  className?: string;
}> = ({ total, youAt = 0, ar = true, className = '' }) => {
  const count = Math.max(0, Math.floor(total));
  if (!count) return null;

  const shown = Math.min(count, MAX_DOTS);
  const hidden = count - shown;
  /* «أنت» خارج المرسوم ⇒ تُثبَّت على آخر نقطة مرسومة فلا تختفي إشارتُك من الشريط. */
  const youIndex = youAt > 0 ? Math.min(youAt, shown) : 0;

  const label = ar
    ? (youAt > 0 ? `أنت رقم ${youAt} من ${count} في الانتظار` : `${count} في الانتظار`)
    : (youAt > 0 ? `You are number ${youAt} of ${count} waiting` : `${count} waiting`);

  return (
    <div className={`mizan-queue-ribbon ${className}`} role="img" aria-label={label}>
      {Array.from({ length: shown }, (_, i) => {
        const position = i + 1;
        const you = position === youIndex;
        return <span key={position} aria-hidden className={`mizan-queue-dot ${you ? 'is-you' : position === 1 && !youIndex ? 'is-next' : ''}`} />;
      })}
      {hidden > 0 && <span aria-hidden className="text-[10px] font-black opacity-60 ms-1 tabular-nums">+{hidden}</span>}
    </div>
  );
};
