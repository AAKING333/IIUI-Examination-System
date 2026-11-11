import React from 'react';

/**
 * Standardized StatCard Component
 * Consistent number color (navy), alignment, shadow, and mandatory unit display.
 */
export default function StatCard({
  label,
  value,
  unit = '',
  icon: Icon,
  subtext,
  variant = 'default',
  className = '',
}) {
  return (
    <div className={`stat-card ${variant !== 'default' ? `stat-card--${variant}` : ''} ${className}`.trim()} style={{
      background: 'var(--itms-surface, #ffffff)',
      border: '1px solid var(--itms-border, #e3e8e6)',
      borderRadius: 'var(--itms-radius-md, 10px)',
      padding: '1rem 1.25rem',
      boxShadow: 'var(--itms-shadow-sm, 0 1px 3px rgba(16, 31, 61, 0.08))',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      position: 'relative',
      minWidth: '180px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{
          fontSize: '0.78rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--itms-text-muted, #64748b)'
        }}>
          {label}
        </span>
        {Icon && (
          <div style={{
            color: 'var(--iiui-green, #1a5f2a)',
            background: 'var(--iiui-green-50, #eff6f1)',
            padding: '0.35rem',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Icon size={16} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginTop: 'auto' }}>
        <span style={{
          fontSize: '1.75rem',
          fontWeight: 700,
          color: 'var(--iiui-navy, #192f59)',
          lineHeight: 1.1,
          fontFeatureSettings: '"tnum"'
        }}>
          {value !== undefined && value !== null ? value : '—'}
        </span>
        {unit && (
          <span style={{
            fontSize: '0.85rem',
            fontWeight: 500,
            color: 'var(--itms-text-muted, #64748b)'
          }}>
            {unit}
          </span>
        )}
      </div>

      {subtext && (
        <div style={{
          marginTop: '0.4rem',
          fontSize: '0.76rem',
          color: 'var(--itms-text-secondary, #334155)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem'
        }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

