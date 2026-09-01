import React from 'react';
interface CardProps { children: React.ReactNode; className?: string; hoverable?: boolean; padded?: boolean; onClick?: () => void; }
export const Card: React.FC<CardProps> = ({ children, className='', hoverable=false, padded=true, onClick }) => (
  <div onClick={onClick} className={`mizan-surface ${hoverable ? 'hover:border-[#c9c8c0] hover:-translate-y-px transition' : ''} ${padded ? 'p-5 sm:p-6' : ''} ${className}`}>{children}</div>
);
