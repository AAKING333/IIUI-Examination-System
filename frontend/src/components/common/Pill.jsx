import React from 'react';

/**
 * Standardized Pill / Tag Component
 * Categories: batch, section, regular, back, status (free, assigned, locked)
 */
export default function Pill({
  label,
  children,
  variant = 'default',
  size = 'sm',
  icon: Icon,
  dot = false,
  className = '',
  title,
}) {
  const content = label || children;

  const stylesByVariant = {
    default: {
      background: 'var(--itms-surface-muted, #f8faf9)',
      color: 'var(--itms-text-secondary, #334155)',
      border: '1px solid var(--itms-border-strong, #cbd5d1)',
    },
    primary: {
      background: 'var(--iiui-green-50, #eff6f1)',
      color: 'var(--iiui-green-700, #154b22)',
      border: '1px solid var(--iiui-green-200, #b7d8c1)',
    },
    navy: {
      background: 'var(--iiui-navy-50, #eef1f8)',
      color: 'var(--iiui-navy, #192f59)',
      border: '1px solid var(--iiui-navy-200, #c3cee5)',
    },
    regular: {
      background: 'var(--iiui-green-50, #eff6f1)',
      color: 'var(--iiui-green-700, #154b22)',
      border: '1px solid var(--iiui-green-200, #b7d8c1)',
    },
    back: {
      background: '#fff7ed',
      color: '#c2410c',
      border: '1px solid #fdba74',
    },
    warning: {
      background: 'var(--itms-warn-bg, #fffbeb)',
      color: 'var(--itms-warn, #b45309)',
      border: '1px solid var(--itms-warn-border, #fef3c7)',
    },
    danger: {
      background: 'var(--itms-danger-bg, #fef2f2)',
      color: 'var(--itms-danger, #b91c1c)',
      border: '1px solid var(--itms-danger-border, #fecaca)',
    },
    success: {
      background: 'var(--itms-success-bg, #f0fdf4)',
      color: 'var(--itms-success, #15803d)',
      border: '1px solid var(--itms-success-border, #bbf7d0)',
    },
    free: {
      background: '#f0fdf4',
      color: '#166534',
      border: '1px solid #bbf7d0',
    },
    assigned: {
      background: '#eff6ff',
      color: '#1e40af',
      border: '1px solid #bfdbfe',
    },
    locked: {
      background: '#f8fafc',
      color: '#475569',
      border: '1px solid #cbd5e1',
    },
  };

  const style = stylesByVariant[variant] || stylesByVariant.default;
  const isSm = size === 'sm';

  return (
    <span
      className={`pill ${className}`.trim()}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        padding: isSm ? '0.15rem 0.5rem' : '0.25rem 0.75rem',
        borderRadius: 'var(--itms-radius-pill, 9999px)',
        fontSize: isSm ? '0.74rem' : '0.8rem',
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {dot && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'currentColor',
          }}
        />
      )}
      {Icon && <Icon size={isSm ? 12 : 14} />}
      <span>{content}</span>
    </span>
  );
}

