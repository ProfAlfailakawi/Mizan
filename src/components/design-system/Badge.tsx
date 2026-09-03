import React from 'react';
import { uiToken } from '../../lib/ui-language';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'emerald' | 'amber' | 'blue' | 'rose' | 'neutral';
  size?: 'sm' | 'md';
  className?: string;
  dot?: boolean;
}

const localizedBadgeChild = (child: React.ReactNode) => {
  if (typeof child !== 'string') return child;
  const ar = typeof document !== 'undefined' && (document.documentElement.lang || '').toLowerCase().startsWith('ar');
  return uiToken(child, ar);
};

/* Tones live in index.css (.bd-*) so a palette change reaches every badge at once,
   rather than being re-declared as hex literals here. */
export const Badge: React.FC<BadgeProps> = ({ children, variant = 'emerald', size = 'sm', className = '', dot = true }) => (
  <span className={`mizan-badge mizan-badge-${size} bd-${variant} ${className}`}>
    {dot && <span className="mizan-badge-dot" aria-hidden="true" />}
    <span>{localizedBadgeChild(children)}</span>
  </span>
);
