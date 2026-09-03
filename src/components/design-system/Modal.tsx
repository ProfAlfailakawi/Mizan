import React, { useRef } from 'react';
import { useDialogBehavior } from '../../lib/useDialogBehavior';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

const widthClasses = {
  sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg',
  xl: 'max-w-xl', '2xl': 'max-w-2xl', '3xl': 'max-w-3xl',
};

/*
 * Modal was a plain <div> stack: no dialog role, no aria-modal, no label tying the
 * heading to the dialog, and nothing stopping Tab from walking out of it into the page
 * behind. It also still used the pre-redesign palette. Focus handling now comes from the
 * shared hook so every overlay in MIZAN behaves the same way.
 */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children, maxWidth = 'lg' }) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();
  useDialogBehavior(isOpen, onClose, dialogRef);

  if (!isOpen) return null;

  return (
    <div className="mizan-overlay">
      <div className="mizan-overlay-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`mizan-dialog ${widthClasses[maxWidth]}`}
      >
        <div className="mizan-dialog-head">
          <div>
            <h3 id={titleId} className="mizan-dialog-title">{title}</h3>
            {subtitle && <p className="mizan-dialog-sub">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="mizan-dialog-close" aria-label="إغلاق">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mizan-dialog-body">{children}</div>
      </div>
    </div>
  );
};
