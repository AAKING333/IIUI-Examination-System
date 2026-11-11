import React from 'react';
import Modal from '../Modal.jsx';
import Button from './Button.jsx';
import { AlertTriangle, AlertCircle } from 'lucide-react';

/**
 * Standardized Confirmation Dialog
 * Clearly states the consequences of destructive actions.
 */
export default function ConfirmDialog({
  isOpen,
  title = 'Confirm Action',
  message,
  consequence,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
  isSubmitting = false,
}) {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.25rem 0' }}>
        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
          <div style={{
            color: confirmVariant === 'danger' ? 'var(--itms-danger, #b91c1c)' : 'var(--iiui-green, #1a5f2a)',
            background: confirmVariant === 'danger' ? 'var(--itms-danger-bg, #fef2f2)' : 'var(--iiui-green-50, #eff6f1)',
            padding: '0.6rem',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {confirmVariant === 'danger' ? <AlertTriangle size={22} /> : <AlertCircle size={22} />}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--itms-text, #0f172a)', fontWeight: 500, lineHeight: 1.45 }}>
              {message}
            </p>
            {consequence && (
              <div style={{
                marginTop: '0.6rem',
                padding: '0.6rem 0.75rem',
                background: '#fff1f2',
                borderLeft: '3px solid var(--itms-danger, #b91c1c)',
                borderRadius: '4px',
                fontSize: '0.8rem',
                color: '#9f1239',
                fontWeight: 500,
              }}>
                <strong>Consequence:</strong> {consequence}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '0.75rem' }}>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {cancelText}
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            loading={isSubmitting}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

