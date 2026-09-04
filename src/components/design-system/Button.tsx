import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'gold';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ children, variant='primary', size='md', icon, loading=false, className='', disabled, ...props }) => {
  // Radius, elevation and easing come from the token ramp in index.css rather than
  // per-variant literals, so the whole system moves together.
  // whitespace-nowrap keeps an Arabic label a single word on the button instead of letting a
  // squeezed flex parent break it letter-by-letter into a one-character column; the icon stays
  // shrink-0 and the label may truncate rather than be crushed.
  const base = 'mizan-btn inline-flex items-center justify-center font-semibold select-none whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed active:translate-y-px';
  const variants = {
    primary: 'mizan-btn-primary',
    secondary: 'mizan-btn-secondary',
    outline: 'mizan-btn-outline',
    danger: 'mizan-btn-danger',
    ghost: 'mizan-btn-ghost',
    gold: 'mizan-btn-gold'
  };
  const sizes = { sm:'text-xs px-3 py-2 gap-1.5', md:'text-sm px-4 py-2.5 gap-2', lg:'text-sm px-5 py-3 gap-2.5', xl:'text-base px-6 py-3.5 gap-3' };
  return <button disabled={disabled || loading} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
    {loading ? <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : icon ? <span className="shrink-0">{icon}</span> : null}
    {children ? <span className="min-w-0 truncate">{children}</span> : null}
  </button>;
};
