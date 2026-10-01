import React from 'react';
import { BookOpen } from 'lucide-react';
import { IS_DEMO_SESSION } from '../../lib/store';

/*
 * موضعُ النصّ القرآني أو صفحة المصحف أو الصوت في البيئة التجريبية.
 *
 * النصّ والصفحات والتلاوة تأتي من حزم المجمع الرسمية عبر الخادم/R2، ولا يُصنَّع نصٌّ قرآني
 * في العرض. فبدل مساحةٍ بيضاء تبدو عطبًا، يُقال صراحةً ما الذي سيظهر هنا ومن أين.
 * لا يُرسم خارج البيئة التجريبية.
 */
export const DemoQuranNotice: React.FC<{ ar?: boolean; what?: 'text' | 'page' | 'audio'; className?: string }> = ({ ar = true, what = 'text', className = '' }) => {
  if (!IS_DEMO_SESSION) return null;
  const label = {
    text: ar ? 'النص القرآني' : 'The Quran text',
    page: ar ? 'صفحة المصحف' : 'The mushaf page',
    audio: ar ? 'التلاوة المرجعية' : 'The reference recitation',
  }[what];
  return (
    <div role="note" data-demo-quran-notice className={`mx-auto my-4 max-w-md rounded-2xl border border-dashed border-[#d8b86a] bg-[#faf3e2] px-4 py-5 text-center ${className}`}>
      <BookOpen className="mx-auto h-6 w-6 text-[#8a6a1c]" aria-hidden="true" />
      <div className="mt-2 text-sm font-black text-[#6f532d]">{ar ? `${label} يظهر في النسخة الكاملة` : `${label} appears in the full version`}</div>
      <p className="mt-1 text-[11px] font-bold leading-6 text-[#7a6a46]">
        {ar
          ? 'يأتي من الحزم الرسمية لمجمع الملك فهد لطباعة المصحف الشريف، ولا يُصنَّع في البيئة التجريبية. ما تراه حولَه من درجات وأخطاء وجلسات حقيقيٌّ في سلوكه، اصطناعيٌّ في بياناته.'
          : 'It is delivered from the official King Fahd Complex packages and is never synthesised in the demo. Everything around it (scores, faults, sessions) behaves for real on synthetic data.'}
      </p>
    </div>
  );
};
