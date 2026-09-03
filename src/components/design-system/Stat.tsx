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

/*
 * Stat was still painted in the pre-redesign palette (#4A4238 / #EAE4DC / #FAF8F5),
 * which the rest of the app had left behind. Two things came with that:
 *
 *  - the negative-trend colour was #CB997E, 2.50:1 on white — the single indicator
 *    that says something is going wrong was the least readable mark on the card;
 *  - numbers were not tabular, so a column of figures did not align.
 *
 * Both are fixed by binding to the token ramp.
 */
export const Stat: React.FC<StatProps> = ({ label, value, subtext, icon, trend, className = '' }) => (
  <div className={`mizan-stat ${className}`}>
    <div className="flex items-center justify-between gap-3 mb-2">
      <span className="mizan-stat-label">{label}</span>
      {icon && <span className="mizan-stat-icon">{icon}</span>}
    </div>
    <div className="mizan-stat-value">{value}</div>
    {(subtext || trend) && (
      <div className="mizan-stat-foot">
        {trend && <span className={trend.positive ? 'mizan-stat-up' : 'mizan-stat-down'}>{trend.text}</span>}
        {subtext && <span>{subtext}</span>}
      </div>
    )}
  </div>
);
