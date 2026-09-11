import React from 'react';

/*
 * المقياس: رقمٌ واسمه.
 *
 * كان مكتوبًا ستّ مرّات في ستّة ملفّات بأربعين استعمالًا، وبينها فروقٌ لا يقصدها أحد ويراها
 * الجميع: أيقونةٌ في حُلّة على اليسار هنا وأيقونةٌ عارية فوق الرقم هناك، ورقمٌ ‎text-2xl‎ في
 * لوحةٍ و‎text-3xl‎ في أختها، وتباعد حروفٍ ‎.12em‎ مقابل ‎.14em‎، ورماديّ ‎#646965‎ مقابل
 * ‎#656a66‎ — نسختان تفترقان في محرفين اثنين لا غير.
 *
 * ثلاث هيئات تكفي المنصّة كلها: بطاقةٌ بأيقونتها، ولوحةٌ هادئة بلا أيقونة، ورقمٌ مُصطفٌّ في
 * ترويسة. وما عدا ذلك اتّفاقٌ واحد.
 */
export interface MetricProps {
  value: React.ReactNode;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** card: بطاقة على سطح · soft: لوحة هادئة · inline: رقم في ترويسة · caption: اسمٌ فوق نصّ يُقتَطع */
  variant?: 'card' | 'soft' | 'inline' | 'caption';
  tone?: 'green' | 'amber';
  className?: string;
}

export const Metric: React.FC<MetricProps> = ({ value, label, icon: Icon, variant = 'card', tone = 'green', className = '' }) => {
  if (variant === 'inline') {
    return (
      <div className={`text-end ${className}`}>
        <div className="text-3xl font-black tabular-nums">{value}</div>
        <div className="text-[9px] font-black tracking-[.13em] text-[#646965]">{label}</div>
      </div>
    );
  }
  /* قيمةٌ نصّية طويلة لا رقم: الاسم فوقها، وهي تُقتَطع ولا تكسر الشبكة. */
  if (variant === 'caption') {
    return (
      <div className={`mizan-surface-soft p-3 min-w-0 ${className}`}>
        <div className="text-[9px] text-[#666b67]">{label}</div>
        <div className="text-[10px] font-black mt-1 truncate">{value}</div>
      </div>
    );
  }
  if (variant === 'soft') {
    return (
      <div className={`mizan-surface-soft p-3 ${className}`}>
        <div className="text-2xl font-black tabular-nums">{value}</div>
        <div className="text-[10px] text-[#646965] mt-1">{label}</div>
      </div>
    );
  }
  return (
    <div className={`mizan-surface p-4 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xl font-black tabular-nums">{value}</div>
          <div className="mt-1 text-[11px] text-[#666c68]">{label}</div>
        </div>
        {Icon && (
          <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone === 'amber' ? 'bg-[#f4ecdf] text-[#8b6837]' : 'bg-[#e8f0eb] text-[#28594a]'}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
};
