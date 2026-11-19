import React, { useEffect } from 'react';

export default function Modal({
  isOpen,
  title,
  onClose,
  children,
  footer,
  size = 'default',
  busy = false,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !busy) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, busy]);

  if (!isOpen) return null;

  const requestClose = () => {
    if (!busy) onClose();
  };

  return (
    <div
      className={`modal-overlay${busy ? ' modal-overlay--busy' : ''}`}
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-busy={busy}
    >
      <div
        className={`modal-card ${size === 'lg' ? 'modal-card--lg' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button
            type="button"
            className="modal-close"
            onClick={requestClose}
            disabled={busy}
            aria-label={busy ? 'Please wait — operation in progress' : 'Close dialog'}
            title={busy ? 'Please wait — operation in progress' : 'Close dialog'}
          >
            &times;
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
