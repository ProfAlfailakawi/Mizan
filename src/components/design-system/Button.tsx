import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'gold';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: React.ReactNode;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ children, variant='primary', size='md', icon, loading=false, className='', disabled, ...props }) => {
  const base = 'inline-flex items-center justify-center rounded-xl font-semibold transition duration-150 select-none disabled:opacity-45 disabled:cursor-not-allowed active:translate-y-px';
  const variants = {
    primary: 'bg-[#214C40] text-white hover:bg-[#193d34] shadow-[0_1px_0_rgba(0,0,0,.08)]',
    secondary: 'bg-[#E7EEE9] text-[#214C40] hover:bg-[#dce7e1]',
    outline: 'bg-[#FFFEFB] text-[#303733] border border-[#DFDED7] hover:bg-[#F7F5EF]',
    danger: 'bg-[#A34D43] text-white hover:bg-[#8d4038]',
    ghost: 'bg-transparent text-[#5c645f] hover:bg-[#efede7]',
    gold: 'bg-[#9B7542] text-white hover:bg-[#846237]'
  };
  const sizes = { sm:'text-xs px-3 py-2 gap-1.5', md:'text-sm px-4 py-2.5 gap-2', lg:'text-sm px-5 py-3 gap-2.5', xl:'text-base px-6 py-3.5 gap-3' };
  return <button disabled={disabled || loading} className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
    {loading ? <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> : icon ? <span className="shrink-0">{icon}</span> : null}
    {children ? <span>{children}</span> : null}
  </button>;
};
