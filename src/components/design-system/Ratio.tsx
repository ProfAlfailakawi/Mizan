import React from 'react';

/*
 * نسبة «مُنجَز من مطلوب».
 *
 * كتابة {a}/{b} مباشرةً داخل نص عربي تتركها لخوارزمية الاتجاه ثنائية الاتجاه، فتظهر «0 / 1»
 * مقلوبةً «1 / 0» — والقارئ يرى موافقةً واحدة حيث لا موافقة. الرقم هنا لا يحتمل التأويل، فيُعزل
 * اتجاهه صراحةً ويبقى ترتيبه كما كُتب مهما كان اتجاه الفقرة حوله.
 */
export const Ratio: React.FC<{ value: number | string; of: number | string; className?: string; label?: string }> = ({ value, of, className = '', label }) => (
  <span dir="ltr" className={`inline-block tabular-nums ${className}`} aria-label={label}>
    {value}/{of}
  </span>
);
