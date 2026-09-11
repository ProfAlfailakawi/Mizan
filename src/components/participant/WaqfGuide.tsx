import React, { useMemo } from 'react';
import { distinctWaqfSymbols } from '../../../shared/kfgqpc-waqf-symbols';

/*
 * دليل الوقف في الآية الجارية — للمتسابق أثناء تدرّبه.
 *
 * هذه هي الميزة الوحيدة في شاشة البثّ التي كانت تستحقّ بيتًا ولم يكن لها: شرحُ علامة
 * الوقف بلغة مفهومة في اللحظة التي يبلغها القارئ. كانت تُعرض على الجمهور — وهو أقلّ
 * الناس حاجةً إليها — ولا تصل المتسابق الذي يتعلّم.
 *
 * ومن أين تأتي: العلامات تُقرأ من نصّ الآية المعتمد نفسه (حزمة تسليم مجمع الملك فهد
 * التي يعرضها الاستوديو أصلًا)، والمعاني من جدول العلامات المعتمد المشترك مع الخادم.
 * لا جدول ثانٍ، ولا معنى مُستنبَط، ولا علامة تُفترض في آية لم تَرِد فيها.
 *
 * ولا يظهر شيء ما لم تكن في الآية علامة فعلًا: أكثر الآيات بلا علامة، فصمته هو حاله
 * الغالب — سطرٌ واحد هادئ حين يكون هناك ما يُقال.
 */

/* اللازم أوّلًا ثم ما يُرجّح الوقف: ترتيب القراءة يتبع ما يغيّر المعنى لا ترتيب الحروف. */
const ORDER: Record<string, number> = { WAQF_LAZIM: 0, NO_STOP: 1, MUANAQAH: 2, WAQF_PREFERRED: 3, WASL_PREFERRED: 4, WAQF_JAIZ: 5, SAKTAH: 6 };
/* اللازم و«لا وقف» يغيّران المعنى إن خولفا، فيُميَّزان لونًا؛ وبقيّة العلامات إرشاد. */
const STRICT = new Set(['WAQF_LAZIM', 'NO_STOP']);

/*
 * لماذا يقبل المقطع كلَّه لا الآية الجارية وحدها: كان معلّقًا على الآية الجارية، والآية
 * الجارية لا تُضبط إلا حين يشتغل الصوت. فمن فتح المقطع وقرأه بعينه — وهو أكثر ما يقع —
 * لم يكن يرى شرح الوقف إطلاقًا. الآن يعرض علامات المقطع المعروض، ويضيق إلى الآية وحدها
 * حين تكون هناك آية متتبَّعة فعلًا.
 */
export const WaqfGuide: React.FC<{ text?: string; ayah?: number | null; ar: boolean }> = ({ text, ayah, ar }) => {
  const marks = useMemo(() => {
    const found = distinctWaqfSymbols(text || '');
    return [...found].sort((a, b) => (ORDER[a.category] ?? 9) - (ORDER[b.category] ?? 9));
  }, [text]);

  if (!marks.length) return null;

  return (
    <div className="border-t border-[#e5e1d7] px-4 sm:px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[9px] font-black text-[#59615c]">
          {ayah ? (ar ? `الوقف في الآية ${ayah}` : `Waqf in ayah ${ayah}`) : (ar ? 'الوقف في هذا المقطع' : 'Waqf in this passage')}
        </span>
        {marks.map(m => {
          const strict = STRICT.has(m.category);
          return (
            <span
              key={m.codePoint}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 ${strict ? 'border-[#e2c9a8] bg-[#fbf6ec]' : 'border-[#e3e1da] bg-[#f8f6ef]'}`}
            >
              <b className={`font-quran text-[13px] leading-none ${strict ? 'text-[#7a5a2f]' : 'text-[#214C40]'}`}>{m.labelArabic}</b>
              <span className="text-[9px] font-bold text-[#59615c]">{m.officialMeaning}</span>
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-[9px] leading-4 text-[#656b66]">
        {ar
          ? 'العلامات من نصّ المصحف المعتمد نفسه، ومعانيها من جدول علامات مجمع الملك فهد. للتعلّم فقط: لا يُقيَّم وقفك هنا.'
          : 'Marks come from the certified Muṣḥaf text itself, meanings from the KFGQPC symbol registry. For learning only: your stops are not assessed here.'}
      </p>
    </div>
  );
};

export default WaqfGuide;
