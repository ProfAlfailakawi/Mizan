import React from 'react';

/*
 * الميزان المصغّر — مؤشر الانتظار الموحّد في ميزان.
 * العارضة تتأرجح قليلًا ثم تستقر بينما تصل نقطتا تقييم إلى الكفّتين؛ بعدها خمول
 * هادئ (ميلان طفيف) دون إعادة تبعثر. CSS خالص: transform/opacity فقط، ويستمد
 * لونه من currentColor فيصلح داخل الأزرار وعلى الأسطح الفاتحة والداكنة.
 *
 * delayed (افتراضيًا) يؤخر الظهور ~250ms حتى لا يومض المؤشر في العمليات القصيرة —
 * تأخير CSS لا مؤقّت، فلا حالة تُنظّف عند الفكّ.
 */
export const ScaleLoader: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  delayed?: boolean;
  className?: string;
}> = ({ size = 'md', label, delayed = true, className = '' }) => {
  // 2em عرضًا: sm=16px (أزرار)، md=28px (بطاقات)، lg=44px (لوحات).
  const px = { sm: 8, md: 14, lg: 22 }[size];
  return (
    <span
      role="status"
      className={`mizan-scale-loader ${delayed ? 'is-delayed' : ''} ${className}`}
      style={{ fontSize: px }}
    >
      <i aria-hidden className="mizan-scale-stem" />
      <i aria-hidden className="mizan-scale-base" />
      <i aria-hidden className="mizan-scale-beam" />
      <i aria-hidden className="mizan-scale-dot is-start" />
      <i aria-hidden className="mizan-scale-dot is-end" />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
};
