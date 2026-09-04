import React from 'react';
interface CardProps { children: React.ReactNode; className?: string; hoverable?: boolean; padded?: boolean; onClick?: () => void; }
/* A card with onClick was a plain <div>: no keyboard focus, no Enter/Space, and nothing
   announcing it as actionable. When it is clickable it is a button; when it is not, it
   stays a passive container. */
export const Card: React.FC<CardProps> = ({ children, className='', hoverable=false, padded=true, onClick }) => {
  const cls = `mizan-surface ${hoverable ? 'mizan-surface-hover' : ''} ${padded ? 'p-5 sm:p-6' : ''} ${className}`;
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} w-full text-start`}>{children}</button>;
  return <div className={cls}>{children}</div>;
};
