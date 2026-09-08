import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
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

/**
 * Global overlays must live outside transformed/backdrop-filtered layout ancestors.
 * Header is sticky and backdrop-blurred; a fixed dialog rendered under it can therefore
 * be clipped to the header's containing block. Portalling to document.body restores a
 * true viewport overlay for Emergency, confirmations and every shared MIZAN modal.
 */
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, subtitle, children, maxWidth = 'lg' }) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = React.useId();
  useDialogBehavior(isOpen, onClose, dialogRef);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="mizan-overlay" style={{zIndex:240}}>
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
          <div className="min-w-0">
            <h3 id={titleId} className="mizan-dialog-title">{title}</h3>
            {subtitle && <p className="mizan-dialog-sub">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="mizan-dialog-close" aria-label="إغلاق">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="mizan-dialog-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
};
