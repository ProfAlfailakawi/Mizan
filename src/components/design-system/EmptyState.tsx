import React from 'react';

/*
 * الحالة الفارغة.
 *
 * كانت شاشات كاملة تُختصر في جملة واحدة وسط بطاقة عملاقة — «لا توجد جلسات دعم» — فيدخل
 * الموظّف ولا يعرف: هل تعطّل النظام؟ هل ينتظر؟ هل هناك ما يفعله؟ ويبقى تحتها ستّمئة بكسل فراغًا.
 *
 * الحالة الفارغة الجيدة تقول ثلاثة أشياء: **ما الذي لا يوجد**، و**لماذا هذا طبيعي**، و**ما الذي
 * يبدأ به العمل**. وبلا إجراء متاح تُقال الخطوة التالية نصًّا بدل أن يُترك السطح صامتًا.
 */
export const EmptyState: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  /** لماذا الفراغ طبيعي، أو ما الذي يملأه. */
  hint?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon: Icon, title, hint, action, className = '' }) => (
  <div className={`px-6 py-12 text-center ${className}`}>
    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#eef1ec] text-[#4b5a53]">
      <Icon className="h-5 w-5" />
    </span>
    <p className="mt-4 text-sm font-black text-[#2c3330]">{title}</p>
    {hint && <p className="mx-auto mt-2 max-w-sm text-[11px] leading-5 text-[#636864]">{hint}</p>}
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>
);
