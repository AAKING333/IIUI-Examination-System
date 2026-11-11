import React from 'react';

/**
 * Shared Button Component
 * Standardizes button hierarchy:
 * - primary: filled green (var(--iiui-green))
 * - secondary: outlined navy or neutral
 * - danger: soft red bg / red text or border
 * - ghost: transparent
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  children,
  onClick,
  className = '',
  type = 'button',
  ariaLabel,
  title,
  ...props
}) {
  const variantClass = {
    primary: 'btn--primary',
    secondary: 'btn--secondary',
    outline: 'btn--outline',
    danger: 'btn--danger',
    ghost: 'btn--ghost',
  }[variant] || 'btn--primary';

  const sizeClass = size === 'sm' ? 'btn--sm' : size === 'lg' ? 'btn--lg' : '';

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${className}`.trim()}
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={ariaLabel || title}
      title={title || ariaLabel}
      {...props}
    >
      {loading ? (
        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" style={{
          width: '0.85rem',
          height: '0.85rem',
          border: '2px solid currentColor',
          borderRightColor: 'transparent',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spin 0.75s linear infinite'
        }} />
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon size={size === 'sm' ? 14 : 16} />}
          {children && <span>{children}</span>}
          {Icon && iconPosition === 'right' && <Icon size={size === 'sm' ? 14 : 16} />}
        </>
      )}
    </button>
  );
}

