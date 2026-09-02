import React from 'react';

interface StatProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  trend?: {
    positive?: boolean;
    text: string;
  };
  className?: string;
}

export const Stat: React.FC<StatProps> = ({
  label,
  value,
  subtext,
  icon,
  trend,
  className = ''
}) => {
  return (
    <div className={`bg-white rounded-2xl border border-[#EAE4DC] p-5 shadow-xs ${className}`}>
      <div className="flex items-center justify-between gap-3 text-[#7D7569] mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#7D7569]">{label}</span>
        {icon && <span className="text-[#6B705C] p-2 bg-[#FAF8F5] border border-[#EAE4DC] rounded-xl">{icon}</span>}
      </div>
      <div className="text-2xl sm:text-3xl font-bold tracking-tight text-[#4A4238]">
        {value}
      </div>
      {(subtext || trend) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-[#7D7569]">
          {trend && (
            <span
              className={`font-semibold ${
                trend.positive ? 'text-[#6B705C]' : 'text-[#CB997E]'
              }`}
            >
              {trend.text}
            </span>
          )}
          {subtext && <span>{subtext}</span>}
        </div>
      )}
    </div>
  );
};
