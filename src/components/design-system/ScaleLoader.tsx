import React from 'react';
import { MizanMark } from './MizanLogo';

/*
 * محمّل ميزان الدقيق — العلامة المعتمدة نفسها تتجمّع مصغّرة.
 *
 * لا كفّتي ميزان عدليّ هنا: هوية ميزان (منصّة مسابقات القرآن) هي قوس المحراب
 * والمصحف المفتوح والقلم الذهبي، والقراءة المزدوجة قائمة في العلامة ذاتها —
 * القلم عارضةُ ميزانٍ والصفحتان كفّتاه. أثناء الانتظار تتجمّع العلامة بترتيب
 * قراءتها (قوس، صفحتان، قلم، نور) عبر حركة `mizan-mark.is-animated` الموجودة
 * أصلًا، ثم تدخل خمولًا هادئًا (نبض شفافية) دون إعادة تفكيك.
 *
 * sm (16px) يستخدم النغمة الأحادية currentColor فيتلوّن بلون نص الزر؛
 * md/lg يعرضان ألوان العلامة الكاملة.
 * delayed (افتراضيًا) يؤخّر الظهور ~250ms حتى لا يومض في العمليات الخاطفة —
 * تأخير CSS لا مؤقّت، فلا حالة تُنظّف عند الفكّ.
 */
export const ScaleLoader: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  delayed?: boolean;
  className?: string;
}> = ({ size = 'md', label, delayed = true, className = '' }) => {
  const px = { sm: 16, md: 28, lg: 44 }[size];
  return (
    <span
      role="status"
      className={`mizan-mark-loader ${delayed ? 'is-delayed' : ''} ${className}`}
      style={{ width: px, height: px }}
    >
      <MizanMark className="is-animated" tone={size === 'sm' ? 'mono' : 'brand'} decorative />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
};
