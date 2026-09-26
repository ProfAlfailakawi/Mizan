import React from 'react';
import { Award, Clock } from 'lucide-react';

/*
 * «انتهى اختبارك» — لحظةٌ لا تحتمل الالتباس.
 *
 * المتسابق الكبير في السن كان يخرج من اللجنة فيجد الشاشة نفسها: طابورٌ وتقديرُ انتظار،
 * فلا يدري أانتهى أم لا يزال عليه دور. فصار انتهاء التلاوة حالةً مستقلّة واضحة: ختمٌ
 * أخضر بنجمةٍ ثمانية (شكل ربع الحزب في المصحف) وعلامةٌ تُرسم بهدوء، ثم جملةٌ واحدة
 * كبيرة، ثم ما سيحدث بعدها، ثم زرٌّ واحد حين تصدر النتيجة.
 */

const STYLE = `
@keyframes mizan-seal-in{0%{transform:scale(.6);opacity:0}60%{transform:scale(1.05);opacity:1}100%{transform:scale(1)}}
@keyframes mizan-seal-check{from{stroke-dashoffset:60}to{stroke-dashoffset:0}}
@keyframes mizan-seal-halo{0%,100%{transform:scale(1);opacity:.35}50%{transform:scale(1.12);opacity:.1}}
@keyframes mizan-seal-turn{from{transform:rotate(0)}to{transform:rotate(45deg)}}
.mizan-seal{animation:mizan-seal-in .7s cubic-bezier(.2,.8,.2,1) both}
.mizan-seal-halo{animation:mizan-seal-halo 3.2s ease-in-out infinite;transform-origin:center}
.mizan-seal-star{animation:mizan-seal-turn 1.4s cubic-bezier(.2,.8,.2,1) both;transform-origin:50% 50%}
.mizan-seal-check{stroke-dasharray:60;animation:mizan-seal-check .6s .45s ease-out both}
@media (prefers-reduced-motion:reduce){.mizan-seal,.mizan-seal-halo,.mizan-seal-star,.mizan-seal-check{animation:none}}
@media print{.mizan-no-print{display:none!important}}
`;

export const CompletionSeal: React.FC<{ size?: 'md' | 'lg' }> = ({ size = 'lg' }) => {
  const px = size === 'lg' ? 148 : 104;
  return <span className="mizan-seal relative mx-auto grid place-items-center" style={{ width: px, height: px }} aria-hidden="true">
    <style>{STYLE}</style>
    <span className="mizan-seal-halo absolute inset-0 rounded-full bg-[#2F6555]" />
    <svg viewBox="0 0 100 100" width={px} height={px} className="relative">
      <g className="mizan-seal-star">
        <rect x="18" y="18" width="64" height="64" rx="6" fill="#214C40" />
        <rect x="18" y="18" width="64" height="64" rx="6" fill="#214C40" transform="rotate(45 50 50)" />
      </g>
      <circle cx="50" cy="50" r="27" fill="none" stroke="#E8CB93" strokeWidth="1.6" />
      <circle cx="50" cy="50" r="23" fill="#2F6555" />
      <path className="mizan-seal-check" d="M38 51 L46 59 L63 41" fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>;
};

export const TestCompletePanel: React.FC<{
  ar: boolean;
  /** النتيجة معلنةٌ ويمكن عرضها الآن. */
  resultReady: boolean;
  onShowResult?: () => void;
  /** عند وجود شهادة: زرٌّ ثانٍ. */
  onShowCertificate?: () => void;
  name?: string;
}> = ({ ar, resultReady, onShowResult, onShowCertificate, name }) => (
  <section className="mizan-surface relative overflow-hidden px-6 py-9 sm:px-10 sm:py-12 text-center" data-test-complete role="status" aria-live="polite"
    style={{ background: 'radial-gradient(120% 80% at 50% 0%, #EEF5F0 0%, #FFFEFB 60%)' }}>
    <CompletionSeal />
    <h2 className="mt-6 text-3xl sm:text-4xl font-black leading-tight text-[#17352D]">{ar ? 'انتهى اختبارك' : 'Your test is finished'}</h2>
    <p className="mt-2 text-2xl sm:text-3xl font-black text-[#89673a]" style={{ fontFamily: 'inherit' }}>{ar ? 'بارك الله فيك' : 'May Allah bless you'}{name ? (ar ? ` يا ${name}` : `, ${name}`) : ''}</p>
    <p className="mt-4 text-lg leading-8 text-[#3f4642]">{ar ? 'لا يلزمك أي شيء آخر اليوم.' : 'Nothing else is needed from you today.'}</p>
    {resultReady
      ? <div className="mt-7 flex flex-col items-center gap-3">
          {onShowResult && <button type="button" onClick={onShowResult} className="mizan-no-print inline-flex min-h-16 min-w-64 items-center justify-center gap-3 rounded-2xl bg-[#214C40] px-8 text-xl font-black text-white shadow-lg shadow-[#214C40]/20 hover:bg-[#1a3d33] focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#E8CB93]"><Award className="h-7 w-7" />{ar ? 'عرض النتيجة' : 'Show result'}</button>}
          {onShowCertificate && <button type="button" onClick={onShowCertificate} className="mizan-no-print inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border-2 border-[#cddbd3] bg-white px-6 text-lg font-black text-[#214C40]">{ar ? 'عرض الشهادة' : 'Show certificate'}</button>}
        </div>
      : <div className="mx-auto mt-7 flex max-w-md items-center gap-4 rounded-2xl border border-[#e3dcc8] bg-[#FBF6EA] p-5 text-start">
          <Clock className="h-9 w-9 shrink-0 text-[#89673a]" aria-hidden="true" />
          <div><div className="text-lg font-black text-[#4c3b1f]">{ar ? 'ماذا بعد؟' : 'What happens next?'}</div>
            <p className="mt-1 text-base leading-7 text-[#5b4d35]">{ar ? 'النتيجة تُعلن بعد اعتماد اللجنة، وستظهر هنا تلقائيًا.' : 'The result is announced after the committee approves it, and it will appear here automatically.'}</p></div>
        </div>}
  </section>
);
