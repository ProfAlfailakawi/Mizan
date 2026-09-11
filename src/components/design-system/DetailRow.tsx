import React from 'react';
import { Pictogram } from './Pictogram';

/*
 * سطرُ تفصيلٍ وترويسةُ لوحة — نسختان لكلٍّ منهما في المنصّة، تفترقان في محرفين.
 *
 *   سطر التفصيل:  «title/value» بلونٍ ‎#636864‎ هنا، و«label/value» بلون ‎#646965‎ هناك.
 *   ترويسة اللوحة: عنوانٌ ‎font-black‎ و«subtitle» هنا، وعنوانٌ ‎text-lg font-black‎ و«sub» هناك.
 *
 * سبعة عشر سطرًا وخمس عشرة ترويسة تتبع الآن اتّفاقًا واحدًا. والأرقام مصطفّة (tabular-nums)
 * في كل سطر، فعمودُ القيم يستقيم بدل أن يتمايل.
 */

/** سطرٌ في قائمة تفاصيل: اسمٌ على يمينه وقيمةٌ على يساره، بينهما خطّ القائمة. */
export const DetailRow: React.FC<{ label: string; value: React.ReactNode; className?: string }> = ({ label, value, className = '' }) => (
  <div className={`py-3 flex items-center justify-between gap-4 ${className}`}>
    <span className="text-xs text-[#646965]">{label}</span>
    <span className="text-xs font-bold text-[#303733] text-end tabular-nums">{value}</span>
  </div>
);

/** ترويسة لوحة: رمزٌ ثم عنوانٌ وسطرٌ يشرحه. */
export const PanelHeading: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  className?: string;
}> = ({ icon, title, subtitle, className = '' }) => (
  <div className={`flex items-start gap-3 ${className}`}>
    <Pictogram icon={icon} size="md" />
    <div className="min-w-0">
      <h2 className="text-lg font-black">{title}</h2>
      {subtitle && <p className="text-xs text-[#646965] mt-1 max-w-2xl leading-6">{subtitle}</p>}
    </div>
  </div>
);

/** لا شيء هنا بعد — سطرٌ هادئ داخل بطاقة، لا شاشةُ حالةٍ فارغة كاملة. */
export const InlineEmpty: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`py-8 text-center text-xs text-[#686e69] ${className}`}>{children}</div>
);
